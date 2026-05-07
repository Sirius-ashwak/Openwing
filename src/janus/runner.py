"""Higher-level orchestration (batch scans, serialization helpers)."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path
from typing import Any

from janus.discovery import iter_python_files
from janus.graph import JanusResult, run_janus_on_file


def janus_result_to_jsonable(row: JanusResult) -> dict[str, Any]:
    """Serialize a dataclass snapshot for piping into CI or downstream tooling."""

    return {
        "ok": row.ok,
        "message": row.message,
        "patch_cycles": row.patch_cycles,
        "last_report": row.last_report.model_dump() if row.last_report else None,
        "static_warnings": row.static_warnings,
        "target": row.target or None,
        "dry_run": row.dry_run,
        "backup_path": row.backup_path,
    }


def dumps_results(rows: list[JanusResult], *, pretty: bool = False) -> str:
    """JSON array encode for aggregated sweeps."""

    payload = [janus_result_to_jsonable(entry) for entry in rows]
    indent = 2 if pretty else None

    return json.dumps(payload, ensure_ascii=False, indent=indent)


async def _run_one(
    semaphore: asyncio.Semaphore,
    target: Path,
    *,
    max_patch_cycles: int,
    dry_run: bool,
    backup_before_write: bool,
    syntax_attempt_budget: int,
    progress_path: Path | None,
) -> JanusResult:
    """Run Janus on a single file, guarded by semaphore."""

    async with semaphore:
        # run_janus_on_file is sync (LangGraph invoke is sync); offload to thread
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_janus_on_file(
                target,
                max_patch_cycles=max_patch_cycles,
                dry_run=dry_run,
                backup_before_write=backup_before_write,
                max_syntax_attempts_per_patch=syntax_attempt_budget,
            ),
        )

    # Crash-safe JSONL progress: append one line per completed target
    if progress_path is not None:
        try:
            line = json.dumps(janus_result_to_jsonable(result), ensure_ascii=False)
            with open(progress_path, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError:
            pass  # best-effort; don't fail the scan over I/O

    return result


async def async_sweep_python_tree(
    root: str | Path,
    *,
    max_files: int = 250,
    max_patch_cycles: int = 3,
    dry_run: bool = False,
    backup_before_write: bool = False,
    syntax_attempt_budget: int = 4,
    concurrency: int = 3,
    progress_dir: str | Path | None = None,
) -> list[JanusResult]:
    """Execute Janus concurrently across discovered *.py surfaces."""

    resolved = Path(root).expanduser().resolve()
    hits = iter_python_files(resolved, max_files=max_files)

    if not hits:
        return []

    semaphore = asyncio.Semaphore(concurrency)

    # Set up JSONL progress file
    progress_path: Path | None = None
    if progress_dir is not None:
        pdir = Path(progress_dir)
        pdir.mkdir(parents=True, exist_ok=True)
        run_id = uuid.uuid4().hex[:12]
        progress_path = pdir / f"janus-{run_id}.partial.jsonl"

    tasks = [
        _run_one(
            semaphore,
            target,
            max_patch_cycles=max_patch_cycles,
            dry_run=dry_run,
            backup_before_write=backup_before_write,
            syntax_attempt_budget=syntax_attempt_budget,
            progress_path=progress_path,
        )
        for target in hits
    ]

    return list(await asyncio.gather(*tasks))


def sweep_python_tree(
    root: str | Path,
    *,
    max_files: int = 250,
    max_patch_cycles: int = 3,
    dry_run: bool = False,
    backup_before_write: bool = False,
    syntax_attempt_budget: int = 4,
    concurrency: int = 1,
    progress_dir: str | Path | None = None,
) -> list[JanusResult]:
    """Execute Janus across discovered *.py surfaces.

    When concurrency > 1, uses async sweep with semaphore-based rate limiting.
    When concurrency == 1, falls back to simple sequential execution.
    """

    if concurrency <= 1:
        # Fast path: avoid asyncio overhead for serial execution
        resolved = Path(root).expanduser().resolve()
        hits = iter_python_files(resolved, max_files=max_files)
        return [
            run_janus_on_file(
                target,
                max_patch_cycles=max_patch_cycles,
                dry_run=dry_run,
                backup_before_write=backup_before_write,
                max_syntax_attempts_per_patch=syntax_attempt_budget,
            )
            for target in hits
        ]

    return asyncio.run(
        async_sweep_python_tree(
            root,
            max_files=max_files,
            max_patch_cycles=max_patch_cycles,
            dry_run=dry_run,
            backup_before_write=backup_before_write,
            syntax_attempt_budget=syntax_attempt_budget,
            concurrency=concurrency,
            progress_dir=progress_dir,
        )
    )
