"""Semgrep subprocess adapter — optional static baseline for hybrid gate."""

from __future__ import annotations

import json
import logging
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SemgrepFinding:
    """Normalized Semgrep result."""

    rule_id: str
    file: str
    line: int
    severity: str
    message: str


def run_semgrep(
    path: Path,
    *,
    rules: str | None = None,
    timeout: int = 120,
) -> list[SemgrepFinding]:
    """Invoke Semgrep CLI and return parsed findings.

    Returns an empty list (with a log warning) if semgrep is not installed
    or produces an error. This keeps the integration best-effort.

    Args:
        path: File or directory to scan.
        rules: Semgrep ruleset — 'auto' or path to .semgrep.yml. Defaults to
               env JANUS_SEMGREP_RULES or 'auto'.
        timeout: Subprocess timeout in seconds.
    """
    rules = rules or os.environ.get("JANUS_SEMGREP_RULES", "auto")

    cmd = [
        "semgrep",
        "--json",
        "--quiet",
        "--config", rules,
        str(path),
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        logger.warning("Semgrep not found on PATH — skipping static baseline.")
        return []
    except subprocess.TimeoutExpired:
        logger.warning("Semgrep timed out after %ds — skipping.", timeout)
        return []
    except OSError as exc:
        logger.warning("Semgrep invocation failed: %s", exc)
        return []

    if proc.returncode not in (0, 1):
        # returncode 1 = findings present (not an error)
        logger.warning("Semgrep exited %d: %s", proc.returncode, proc.stderr[:500])
        return []

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        logger.warning("Semgrep output was not valid JSON.")
        return []

    findings: list[SemgrepFinding] = []
    for result in data.get("results", []):
        findings.append(
            SemgrepFinding(
                rule_id=result.get("check_id", "unknown"),
                file=result.get("path", ""),
                line=result.get("start", {}).get("line", 0),
                severity=result.get("extra", {}).get("severity", "WARNING"),
                message=result.get("extra", {}).get("message", ""),
            )
        )

    return findings


def semgrep_to_hints(findings: list[SemgrepFinding]) -> list[str]:
    """Translate Semgrep findings to the list[str] format hybrid_clean consumes."""
    return [
        f"[semgrep:{f.rule_id}] {f.message} (line {f.line}, {f.severity})"
        for f in findings
    ]
