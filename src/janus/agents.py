"""Red / Blue LLM agents (static analysis and patching only — no exploit execution)."""
from __future__ import annotations

from janus import llm as _llm
from janus.schemas import RedTeamReport, coerce_patched_code, parse_red_team_json
from janus.vuln_kb import build_kb_section

_KB_SECTION = build_kb_section(max_priority=2)

RED_SYSTEM_PROMPT = f"""You are a senior adversarial reviewer (Red Team) doing **static analysis only**.
Hunt ruthlessly — but honestly — for **critical and high** security flaws in Python web handlers.

{_KB_SECTION}

OUTPUT FORMAT:
Return ONLY ONE JSON object (no prose, no markdown fences) EXACTLY with these keys:
  "file_path"               — path of the analyzed file
  "vulnerability_type"      — CWE id + short name, or "none" if nothing found
  "vulnerable_code_snippet" — the EXACT offending lines copied from SOURCE (empty if none)
  "exploit_payload"         — illustrative text payload ONLY (never shell commands); empty if none

Rules:
- If nothing substantive is found → vulnerability_type = "none", empty snippet and payload.
- Report the SINGLE highest-confidence, highest-severity finding.
- Do NOT hallucinate vulnerabilities that are not clearly present in the source.
- exploit_payload is for demonstration only; it is never executed.
"""

BLUE_SYSTEM_PROMPT = """You are a hardened production Python/DevSec engineer (Blue Team).

You receive:
  REPORT           — Red Team structured JSON describing the confirmed issue to fix.
  ORIGINAL_SOURCE  — the full-file Python source snapshot.

RULES:
- Return ONLY runnable Python — the complete file — no Markdown, prose, or code fences.
- Fix the REPORTED issue minimally but correctly; preserve routes, semantics, imports, style.

Remediation rules by vulnerability type:
  SQL injection       → parameterized queries ONLY (positional ? or %(name)s bindings).
                        Remove ALL dynamic SQL concatenation of user-derived text.
  SSRF                → validate scheme (http/https only), resolve hostname, block RFC1918/
                        loopback/link-local ranges, disable redirect-following, set timeout.
  Command injection   → replace shell=True + string concat with argv list form; never pass
                        user input through a shell.
  Path traversal      → use pathlib.Path, resolve() + verify the result starts with the
                        allowed root; reject any component containing '..'.
  XSS                 → use Jinja2 autoescaping; never use render_template_string with
                        user data; never wrap user strings in Markup().
  Deserialization     → replace pickle/marshal with JSON; use yaml.safe_load not yaml.load.
  Open redirect       → validate redirect target against an explicit allowlist of domains.
  File upload         → enforce extension whitelist, MIME check, size limit, secure_filename().

Maintain all public route paths, HTTP verbs, and Flask app factory patterns.
If REPORT.vulnerability_type is "none" but CORRECTION_REQUIRED text is supplied, apply that."""


def red_team_scan(source: str, file_path: str) -> RedTeamReport:
    """One LLM call + single repair retry on JSON/validation failure."""
    user = f"FILE_PATH={file_path}\n\nSOURCE:\n```python\n{source}\n```\n"
    raw = _llm.sync_chat(system=RED_SYSTEM_PROMPT, user=user)
    try:
        return parse_red_team_json(raw, file_path)
    except Exception as first:
        repair_user = (
            "Your previous answer was not valid JSON for the schema. "
            "Respond with ONLY one JSON object with keys: "
            "file_path, vulnerability_type, vulnerable_code_snippet, exploit_payload.\n\n"
            f"FILE_PATH={file_path}\nBAD_OUTPUT:\n{raw}\n"
        )
        raw2 = _llm.sync_chat(system=RED_SYSTEM_PROMPT, user=repair_user)
        try:
            return parse_red_team_json(raw2, file_path)
        except Exception as second:
            raise ValueError(
                f"Red Team JSON failed after repair: {first} / {second}"
            ) from second


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
