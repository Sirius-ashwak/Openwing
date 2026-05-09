"""Typer CLI for Janus."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.theme import Theme

from janus.github_fetcher import (
    GitHubURLError,
    cleanup_clone,
    clone_repo,
    is_github_url,
)
from janus.graph import JanusResult, run_janus_on_file
from janus.runner import dumps_results, janus_result_to_jsonable, sweep_python_tree

custom = Theme({"info": "cyan", "ok": "green", "warn": "yellow", "bad": "red"})
console = Console(theme=custom)

app = typer.Typer(
    name="janus",
    help="Openwing Janus — adversarial Red/Blue hardening loops for Python services.",
    no_args_is_help=True,
)


def _render_human(result: JanusResult) -> None:
    if result.ok:
        console.print("[ok]PASS[/ok]")
    else:
        console.print("[bad]DONE WITH ISSUES[/bad]", style="bad")

    console.print(result.message)

    extras = Table.grid(padding=(0, 2))
    extras.add_column(justify="right", style="info")
    extras.add_column(style="white")
    extras.add_row("Patches applied", str(result.patch_cycles))
    extras.add_row("Target", result.target or "—")

    flags: list[str] = []
    if result.dry_run:
        flags.append("dry-run")
    if flags:
        extras.add_row("Mode", ",".join(flags))

    console.print(extras)

    if result.backup_path:
        console.print(f"[warn]Backup written:[/warn] {result.backup_path}")

    if result.last_report:
        console.print("[info]Last Red verdict snapshot:[/info]")
        console.print(json.dumps(result.last_report.model_dump(), indent=2, ensure_ascii=False))

    if result.static_warnings:
        console.print("[warn]Heuristic amplifiers (investigate manually if unsure):[/warn]")
        for line in result.static_warnings:
            console.print(f"  - {line}")


def _emit_sarif(results: list[JanusResult], output_path: str) -> None:
    """Write SARIF 2.1.0 output to file."""
    from janus.sarif import to_sarif
    from janus import __version__

    sarif_doc = to_sarif(results, tool_version=__version__)
    Path(output_path).write_text(
        json.dumps(sarif_doc, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    console.print(f"[ok]SARIF written to[/ok] {output_path}")


def _emit_sbom(files: list[Path], output_path: str) -> None:
    """Write SBOM manifest to file."""
    from janus.sbom import generate_manifest

    manifest = generate_manifest(files)
    Path(output_path).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    console.print(f"[ok]SBOM manifest written to[/ok] {output_path}")


@app.command("run")
def run_cmd(
    path: str = typer.Option(..., "--path", help="File or directory to analyze."),
    max_cycles: int = typer.Option(
        3,
        "--max-cycles",
        min=1,
        max=10,
        help="Maximum Blue remediation cycles.",
    ),
    dry_run: bool = typer.Option(False, "--dry-run", help="Simulate patching without touching disk."),
    backup: bool = typer.Option(
        False,
        "--backup/--no-backup",
        help="Copy the on-disk artifact to *.janus.bak before writing patches.",
    ),
    json_out: bool = typer.Option(
        False,
        "--json/--no-json",
        help="Emit machine-readable JSON instead of styled Rich output.",
    ),
    format_out: str = typer.Option(
        "human",
        "--format",
        help="Output format: human | json | sarif.",
    ),
    output: str = typer.Option(
        "janus-results.sarif",
        "--output",
        help="Output file path (used with --format sarif).",
    ),
    syntax_tries: int = typer.Option(
        4,
        "--syntax-tries",
        min=1,
        max=8,
        help="Blue compile-check retries before aborting.",
    ),
    max_files: int = typer.Option(
        250,
        "--max-files",
        min=1,
        max=2000,
        help="Safety cap when --path resolves to a directory.",
    ),
    concurrency: int = typer.Option(
        int(os.environ.get("JANUS_CONCURRENCY", "1")),
        "--concurrency",
        min=1,
        max=32,
        help="Number of parallel file scans (directory sweeps). Env: JANUS_CONCURRENCY.",
    ),
    semgrep: bool = typer.Option(
        False,
        "--semgrep/--no-semgrep",
        help="Run Semgrep static analysis alongside LLM scans.",
    ),
    semgrep_rules: str = typer.Option(
        "auto",
        "--semgrep-rules",
        help="Semgrep ruleset: 'auto' or path to .semgrep.yml.",
    ),
    sbom: str = typer.Option(
        "",
        "--sbom",
        help="Write SBOM manifest JSON to this path after sweep.",
    ),
    offline: bool = typer.Option(
        False,
        "--offline",
        help="Use canned LLM responses (no API keys needed). For CI testing.",
    ),
) -> None:
    """Run adversarial remediation on ONE file—or sweep every *.py beneath a folder."""

    # Resolve --json flag as alias for --format json
    if json_out:
        format_out = "json"

    # Wire offline mode
    if offline:
        _install_offline_mock()

    # Wire semgrep flag into environment for graph to pick up
    if semgrep:
        os.environ["JANUS_SEMGREP_ENABLED"] = "1"
        os.environ["JANUS_SEMGREP_RULES"] = semgrep_rules

    cloned_dir: Path | None = None

    if is_github_url(path):
        try:
            console.print(f"[info]Cloning[/info] {path}…")
            cloned_dir = asyncio.run(clone_repo(path, timeout_s=120))
            console.print(f"[ok]Clone complete →[/ok] {cloned_dir}")
            target = cloned_dir
        except GitHubURLError as exc:
            console.print(f"[bad]{exc}[/bad]", style="bad")
            raise typer.Exit(code=1)
        except (TimeoutError, RuntimeError) as exc:
            console.print(f"[bad]Clone failed:[/bad] {exc}", style="bad")
            raise typer.Exit(code=1)
    else:
        target = Path(path)
        if not target.exists():
            console.print(f"[bad]Missing path[/bad]: {target}", style="bad")
            raise typer.Exit(code=1)

    try:
        if target.is_file():
            if target.suffix != ".py":
                console.print("[bad]Individual targets must end with `.py`.[/bad]", style="bad")
                raise typer.Exit(code=1)

            bundle = Panel.fit(f"[info]Target file[/info] {target.resolve()}", style="info")
            console.print(bundle)

            result = run_janus_on_file(
                target.resolve(),
                max_patch_cycles=max_cycles,
                dry_run=dry_run,
                backup_before_write=backup,
                max_syntax_attempts_per_patch=syntax_tries,
                enable_semgrep=semgrep,
            )

            results = [result]

            if format_out == "sarif":
                _emit_sarif(results, output)
            elif format_out == "json":
                console.print(
                    json.dumps([janus_result_to_jsonable(result)], ensure_ascii=False, indent=2)
                )
            else:
                _render_human(result)

            if sbom:
                _emit_sbom([target.resolve()], sbom)

            raise typer.Exit(code=0 if result.ok else 2)

        if target.is_dir():
            rows = sweep_python_tree(
                target.resolve(),
                max_files=max_files,
                max_patch_cycles=max_cycles,
                dry_run=dry_run,
                backup_before_write=backup,
                syntax_attempt_budget=syntax_tries,
                concurrency=concurrency,
            )

            bundle = Panel.fit(
                f"[info]Directory sweep[/info] {target.resolve()} — capped at {max_files} modules"
                + (f" — concurrency {concurrency}" if concurrency > 1 else ""),
                style="info",
            )
            console.print(bundle)

            if not rows:
                console.print("[warn]No Python modules discovered beneath that path (after filters).[/warn]")
                if format_out == "json":
                    console.print("[]")
                raise typer.Exit(code=0)

            if format_out == "sarif":
                _emit_sarif(rows, output)
            elif format_out == "json":
                console.print(dumps_results(rows, pretty=True))
            else:
                table = Table(show_header=True, header_style="bold magenta")
                table.add_column("Target", overflow="ellipsis", max_width=60)
                table.add_column("Status", justify="center")
                table.add_column("Cycles", justify="right")
                table.add_column("Summary", overflow="ellipsis", max_width=45)

                for entry in rows:
                    table.add_row(
                        entry.target,
                        "PASS" if entry.ok else "FAIL",
                        str(entry.patch_cycles),
                        entry.message.splitlines()[0][:200],
                    )
                console.print(table)

                failures = sum(1 for row in rows if not row.ok)
                console.print(f"[info]Completed[/info] {len(rows)} surfaces — failures: {failures}")

            if sbom:
                from janus.discovery import iter_python_files
                scanned_files = iter_python_files(target.resolve(), max_files=max_files)
                _emit_sbom(scanned_files, sbom)

            raise typer.Exit(code=0 if all(row.ok for row in rows) else 3)

        console.print("[bad]Unsupported path type (expected file or directory).[/bad]")
        raise typer.Exit(code=1)
    finally:
        if cloned_dir is not None:
            cleanup_clone(cloned_dir)

@app.command("serve")
def serve_cmd(
    host: str = typer.Option("127.0.0.1", "--host", help="Host IP to bind to."),
    port: int = typer.Option(8000, "--port", help="Port to bind to."),
) -> None:
    """Start the Janus web dashboard server (FastAPI)."""
    import uvicorn
    console.print(f"[info]Starting Openwing Janus dashboard on http://{host}:{port}[/info]")
    uvicorn.run("janus.server:app", host=host, port=port, reload=True)


def _install_offline_mock() -> None:
    """Replace sync_chat with canned responses for CI/offline testing."""
    import janus.llm as _llm

    _call_count: dict[str, int] = {"n": 0}

    def _canned_chat(system: str, user: str, *, temperature: float = 0.2) -> str:
        _call_count["n"] += 1
        n = _call_count["n"]

        # Blue team call: contains REPORT and ORIGINAL_SOURCE
        if "REPORT:" in user and "ORIGINAL_SOURCE" in user:
            # Return a safe patched version — minimal valid Python
            return "# Patched by Janus offline mode\nimport sqlite3\nprint('secure')\n"

        # Red team call: first is dirty, subsequent are clean
        if n <= 1:
            import json as _json
            return _json.dumps({
                "file_path": "offline.py",
                "vulnerability_type": "sql_injection",
                "vulnerable_code_snippet": "execute(query)",
                "exploit_payload": "admin' OR '1'='1 --",
            })

        import json as _json
        return _json.dumps({
            "file_path": "offline.py",
            "vulnerability_type": "none",
            "vulnerable_code_snippet": "",
            "exploit_payload": "",
        })

    _llm.sync_chat = _canned_chat  # type: ignore[assignment]


def main() -> None:
    app()


if __name__ == "__main__":
    main()
