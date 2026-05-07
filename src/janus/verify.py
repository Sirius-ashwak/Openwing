from __future__ import annotations

import re


def heuristic_sqli_patterns(source: str) -> list[str]:
    """Lightweight heuristic for obvious dynamic SQL concatenation (MVP hybrid gate).

    Matches common anti-patterns; false positives possible. Intended as a secondary
    signal alongside the LLM verdict.
    """
    findings: list[str] = []

    # f-string interpolation inside cursor.execute(...)
    patterns = [
        (
            r"execute\s*\(\s*f[\"']",
            "f-string passed to execute() likely interpolates SQL",
        ),
        (
            r'execute\s*\(\s*[\'"`][^"\']*[\'"`]\s*\+',
            "String concatenation to build SQL argument",
        ),
        (
            r"execute\s*\(\s*[\"'].*?%s.*?[\"']\s*%",
            "Old-style %-formatting concatenation toward execute() argument",
        ),
        (
            r"\+\s*(?:request\.(?:args|form|json))",
            "User input appended via '+' near request data",
        ),
        (
            r"['\"][^'\"]*['\"]\s*\+\s*\w+\s*\+\s*['\"]",
            "SQL string built by concatenating literals with variables",
        ),
        (
            r"\bcursor\.execute\s*\(\s*[A-Za-z_]\w*\s*\)",
            "Cursor execute() invoked with dynamically built holder variable",
        ),
        (
            r"\bexecute\s*\(\s*[A-Za-z_]\w*\s*\)",
            "execute() invoked with dynamically built holder variable",
        ),
        (
            r"requests\.(?:get|post|put|delete|patch)\s*\(\s*request\.(?:args|form|json)",
            "Outbound HTTP library call seeded directly from Flask request data (SSRF/primitive)",
        ),
        (
            r"aiohttp\.ClientSession\(\)\.[^(]*\([^)]*(?:request\.(args|form|json))",
            "Potential async SSRF bridging request data into aiohttp invocation",
        ),
        (
            r"subprocess\.\w+\([^)]*shell\s*=\s*True",
            "subprocess call with shell=True (command injection amplification)",
        ),
    ]

    for rx, explanation in patterns:
        if re.search(rx, source, flags=re.MULTILINE | re.DOTALL):
            findings.append(explanation)

    return findings


def hybrid_clean(
    llm_clean: bool,
    source: str,
    *,
    external_hints: list[str] | None = None,
) -> tuple[bool, list[str]]:
    """Combine ML verdict + deterministic heuristics + optional external findings.

    Conservative rule-set:
      * LLM declares dirty ⇒ remain dirty regardless of heuristic noise.
      * LLM declares clean but heuristics fire ⇒ escalate to dirty.
      * LLM declares clean but external hints fire ⇒ escalate to dirty.
      * Else clean.
    """

    hints = heuristic_sqli_patterns(source)
    all_hints = hints + (external_hints or [])

    if not llm_clean:
        return False, all_hints

    if all_hints:
        return False, all_hints

    return True, []
