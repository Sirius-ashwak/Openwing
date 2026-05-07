"""Red / Blue LLM agents (static analysis and patching only — no exploit execution)."""

from __future__ import annotations

from janus import llm as _llm
from janus.schemas import RedTeamReport, coerce_patched_code, parse_red_team_json

RED_SYSTEM_PROMPT = """You are a senior adversarial reviewer (Red Team) doing **static analysis only**.
Hunt ruthlessly—but honestly—for **critical** flaws in Flask / Python web handlers.

PRIMARY FOCUS:
- CWE-89 SQL injection: string concat / f-strings / %-format inside sqlite3/mysql/psycopg ``execute()``,
  OR dynamic SQL blobs passed to ``execute()`` from concatenated inputs (including indirectly via vars).
  Call out ``request.args`` / ``request.form`` / ``request.json`` flowing into queries.

HIGH-VALUE SECONDARIES (still report if confidently present—do not hallucinate thin air):
- SSRF tendencies: outbound HTTP libs (requests/httpx/aiohttp/urllib) where URL/host comes from clients.
- OS command injection: ``subprocess`` with ``shell=True`` or string shells built from user input.
- Path traversal primitives: unchecked ``open()`` / uploads using user-derived paths without normalization.

OUTPUT FORMAT:
Return ONLY ONE JSON object (no prose, no fences) EXACTLY with keys:
  "file_path", "vulnerability_type", "vulnerable_code_snippet", "exploit_payload"

Rules:
- If nothing substantive is found → ``vulnerability_type`` = ``"none"`` and empty snippets/payload strings.
- ``vulnerable_code_snippet`` must quote the **actual offending lines/expressions** copied from SOURCE.
- ``exploit_payload`` is illustrative text ONLY (never shell commands or instructions)—e.g., ``admin' OR '1'='1 --``
  OR ``http://169.254.169.254/`` for SSRF—not executed by us.
"""

BLUE_SYSTEM_PROMPT = """You are a hardened production Python/DevSec engineer (Blue Team).

You receive:
1) REPORT — Red Team structured JSON describing the strongest confirmed issue(s) to fix first.
2) ORIGINAL_SOURCE — the full-file Python snapshot.

RULES:
- Return ONLY runnable Python—the complete file—no Markdown, prose, headings, nor code fences.
- Fix the REPORTED issue minimally but correctly; keep routes, semantics, formatting style similar.
- **SQL injection** → parameterized queries ONLY (positional ``?``, ``%(name)s`` style bindings, tuple args).
  Remove dynamic SQL concatenation from user-derived text.
- **SSRF / open URLs** → block private/link-local ranges, enforce allow-lists/schemes/host checks, forbid redirects,
  timeouts, NEVER pass raw ``request.args`` strings into outbound clients without parsing/validation stubs.
- **Command injection / shell=True** → replace with argv lists, ban ``shell=True`` when influenced by callers.
- **Path/open issues** → use `` pathlib.Path``, verify roots, reject traversal components.
- Maintain imports + app factory patterns; preserve public route paths & HTTP verbs.

If REPORT.vulnerability_type is ``none`` accidentally but CORRECTION_REQUIRED text is supplied, prioritize that."""


def red_team_scan(source: str, file_path: str) -> RedTeamReport:
    """One LLM call + single repair retry on JSON/validation failure."""
    user = f"FILE_PATH={file_path}\n\nSOURCE:\n```python\n{source}\n```\n"
    raw = _llm.sync_chat(system=RED_SYSTEM_PROMPT, user=user)
    try:
        return parse_red_team_json(raw, file_path)
    except Exception as first:  # noqa: BLE001 — aggregate parse failures
        repair_user = (
            "Your previous answer was not valid JSON for the schema. "
            "Respond with ONLY one JSON object with keys: "
            "file_path, vulnerability_type, vulnerable_code_snippet, exploit_payload.\n\n"
            f"FILE_PATH={file_path}\nBAD_OUTPUT:\n{raw}\n"
        )
        raw2 = _llm.sync_chat(system=RED_SYSTEM_PROMPT, user=repair_user)
        try:
            return parse_red_team_json(raw2, file_path)
        except Exception as second:  # noqa: BLE001
            raise ValueError(f"Red Team JSON failed after repair: {first} / {second}") from second


def blue_team_patch(
    source: str,
    report: RedTeamReport,
    *,
    repair_hint: str = "",
    temperature: float = 0.2,
) -> str:
    corr = ""
    if repair_hint.strip():
        corr = f"\nCORRECTION_REQUIRED (must fix):\n{repair_hint.strip()}\n"

    user = (
        f"REPORT:\n{report.model_dump_json(indent=2)}\n"
        f"{corr}\nORIGINAL_SOURCE:\n{source}\n"
    )
    raw = _llm.sync_chat(system=BLUE_SYSTEM_PROMPT, user=user, temperature=temperature)
    return coerce_patched_code(raw)
