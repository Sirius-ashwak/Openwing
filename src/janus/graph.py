"""LangGraph loop: scan → (secure → done | patch → write → re-scan), max patch cycles."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import shutil
from pathlib import Path
from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from janus.agents import blue_team_patch, red_team_scan
from janus.schemas import RedTeamReport
from janus.syntax import compile_check
from janus.verify import heuristic_sqli_patterns, hybrid_clean


def _carry(state: JanusGraphState) -> dict[str, Any]:
    return dict(state)


class JanusGraphState(TypedDict, total=False):
    file_path: str
    source: str
    patch_cycle: int
    max_patch_cycles: int
    effective_secure: bool
    report: dict[str, Any] | None
    error: str | None
    terminal: Literal["success", "limit", "error"] | None
    message: str
    static_warnings: list[str]
    dry_run: bool
    backup_before_write: bool
    backup_written: str | None
    enable_semgrep: bool

    # Retry budget reserved for tighter Blue loops (currently fixed at compile-time constant).
    max_syntax_attempts_per_patch: int


SYNTAX_BLUE_ATTEMPTS = 4


@dataclass
class JanusResult:
    ok: bool
    message: str
    patch_cycles: int
    last_report: RedTeamReport | None
    static_warnings: list[str]
    target: str = ""
    dry_run: bool = False
    backup_path: str | None = None


def _red_node(state: JanusGraphState) -> dict[str, Any]:
    base = _carry(state)
    path = base["file_path"]
    try:
        report = red_team_scan(base["source"], path)
    except Exception as exc:  # noqa: BLE001
        return {
            **base,
            "error": str(exc),
            "terminal": "error",
            "message": f"Red scan failed: {exc}",
        }

    # Collect external hints (Semgrep if enabled)
    external_hints: list[str] = []
    if base.get("enable_semgrep"):
        try:
            from janus.semgrep import run_semgrep, semgrep_to_hints
            findings = run_semgrep(Path(path))
            external_hints = semgrep_to_hints(findings)
        except Exception:  # noqa: BLE001
            pass  # Semgrep is best-effort

    merged_secure, heuristic_hints = hybrid_clean(
        report.is_secure_report(), base["source"], external_hints=external_hints
    )
    if not merged_secure and report.is_secure_report():
        report = RedTeamReport(
            file_path=path,
            vulnerability_type="sql_injection_heuristic_escalation",
            vulnerable_code_snippet=base["source"][:400],
            exploit_payload=r"admin' OR '1'='1 --",
        )

    prior_warnings = list(base.get("static_warnings") or [])
    merged_warnings = sorted(set(prior_warnings) | set(heuristic_hints) | set(external_hints))

    return {
        **base,
        "report": report.model_dump(),
        "error": None,
        "effective_secure": merged_secure,
        "static_warnings": merged_warnings,
    }


def _route_after_red(state: JanusGraphState) -> str:
    if state.get("terminal") == "error":
        return "err"
    if bool(state.get("effective_secure")):
        return "verify"
    if state["patch_cycle"] >= state["max_patch_cycles"]:
        return "limit"
    return "blue"


def _verify_node(state: JanusGraphState) -> dict[str, Any]:
    """Success path after Red + hybrid agree the file is clean."""
    base = _carry(state)
    hints = heuristic_sqli_patterns(base["source"])
    msg = (
        "No vulnerability reported — LLM + heuristic gate agree."
        + (" (dry-run: disk unchanged)." if base.get("dry_run") else "")
    )
    if hints:
        msg += (
            "\nNote: static heuristics still match some patterns — review if unsure:\n • "
            + "\n • ".join(hints)
        )
    accumulated = sorted(set(base.get("static_warnings") or []) | set(hints))

    return {
        **base,
        "terminal": "success",
        "message": msg,
        "static_warnings": accumulated,
    }


def _limit_node(state: JanusGraphState) -> dict[str, Any]:
    base = _carry(state)
    return {
        **base,
        "terminal": "limit",
        "message": (
            f"Reached max patch cycles ({base['max_patch_cycles']}) — "
            "still not reporting clean. Stopping."
        ),
    }


def _blue_node(state: JanusGraphState) -> dict[str, Any]:
    base = _carry(state)
    report = RedTeamReport.model_validate(base["report"])
    attempts_budget = int(base.get("max_syntax_attempts_per_patch") or SYNTAX_BLUE_ATTEMPTS)

    repair_hint = ""

    patched = ""
    for attempt in range(attempts_budget):
        try:
            temp = blue_team_patch(
                base["source"],
                report,
                repair_hint=repair_hint,
                temperature=min(0.45, 0.15 + 0.1 * attempt),
            )
            compile_check(temp, filename_hint=str(base["file_path"]) + "<janus-remedy>")
            patched = temp
            break
        except SyntaxError as exc:
            repair_hint = f"Prior patch was invalid Python SyntaxError at line {exc.lineno}: {exc.msg}; rewrite entire file cleanly."
            if attempt == attempts_budget - 1:
                return {
                    **base,
                    "terminal": "error",
                    "message": repair_hint,
                    "error": str(exc),
                }
        except Exception as exc:  # noqa: BLE001
            return {
                **base,
                "error": str(exc),
                "terminal": "error",
                "message": f"Blue patch failed: {exc}",
            }

    if not patched:
        return {
            **base,
            "terminal": "error",
            "message": "Blue produced empty output.",
            "error": "blue_empty_patch",
        }

    return {**base, "source": patched, "error": None, "terminal": None}


def _route_after_blue(state: JanusGraphState) -> str:
    if state.get("terminal") == "error":
        return "err"
    return "write"


def _write_node(state: JanusGraphState) -> dict[str, Any]:
    base = _carry(state)

    dst = Path(base["file_path"])
    if base.get("backup_before_write") and dst.exists():
        try:
            stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S")
            backup = dst.with_name(f"{dst.name}.{stamp}.janus.bak")
            shutil.copy2(dst, backup)
            base["backup_written"] = str(backup)
        except OSError:
            base["backup_written"] = ""

    if not base.get("dry_run"):
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(base["source"], encoding="utf-8")

    return {
        **base,
        "patch_cycle": int(base.get("patch_cycle", 0)) + 1,
    }


def _error_node(state: JanusGraphState) -> dict[str, Any]:
    return _carry(state)


def build_janus_graph():
    # TypedDict state schema so LangGraph merges partial updates (dict alone breaks channels).
    g = StateGraph(JanusGraphState)
    g.add_node("red", _red_node)
    g.add_node("verify", _verify_node)
    g.add_node("blue", _blue_node)
    g.add_node("write", _write_node)
    g.add_node("limit", _limit_node)
    g.add_node("err", _error_node)

    g.add_edge(START, "red")
    g.add_conditional_edges(
        "red",
        _route_after_red,
        {"verify": "verify", "blue": "blue", "limit": "limit", "err": "err"},
    )
    g.add_edge("verify", END)
    g.add_conditional_edges(
        "blue",
        _route_after_blue,
        {"write": "write", "err": "err"},
    )
    g.add_edge("write", "red")
    g.add_edge("limit", END)
    g.add_edge("err", END)
    return g.compile()


def _finalize(state: JanusGraphState) -> JanusResult:
    term = state.get("terminal")
    raw_rep = state.get("report")
    last = RedTeamReport.model_validate(raw_rep) if raw_rep else None
    warns = list(state.get("static_warnings") or [])
    cycles = int(state.get("patch_cycle", 0))
    tgt = str(state.get("file_path", ""))

    bk = state.get("backup_written")
    if bk in ("", None):
        bk = None

    common = dict(
        patch_cycles=cycles,
        last_report=last,
        static_warnings=warns,
        target=tgt,
        dry_run=bool(state.get("dry_run", False)),
        backup_path=bk,
    )

    if term == "success":
        return JanusResult(ok=True, message=state.get("message", "Done."), **common)
    if term == "limit":
        body = state.get("message") or "Limit."
        return JanusResult(ok=False, message=body, **common)
    msg = state.get("message") or state.get("error") or "Error."
    return JanusResult(ok=False, message=str(msg), **common)


def run_janus_on_file(
    file_path: str | Path,
    *,
    max_patch_cycles: int = 3,
    dry_run: bool = False,
    backup_before_write: bool = False,
    max_syntax_attempts_per_patch: int = SYNTAX_BLUE_ATTEMPTS,
    enable_semgrep: bool = False,
) -> JanusResult:
    path = Path(file_path).resolve()
    source = path.read_text(encoding="utf-8")
    init: JanusGraphState = {
        "file_path": str(path),
        "source": source,
        "patch_cycle": 0,
        "max_patch_cycles": max_patch_cycles,
        "static_warnings": [],
        "dry_run": dry_run,
        "backup_before_write": backup_before_write,
        "backup_written": None,
        "max_syntax_attempts_per_patch": max(1, int(max_syntax_attempts_per_patch)),
        "enable_semgrep": enable_semgrep,
    }
    graph = build_janus_graph()
    final = graph.invoke(init)
    return _finalize(final)
