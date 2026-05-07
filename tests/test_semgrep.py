"""Semgrep adapter tests (subprocess mocked — no real Semgrep needed)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from janus.semgrep import run_semgrep, semgrep_to_hints, SemgrepFinding


SAMPLE_SEMGREP_OUTPUT = {
    "results": [
        {
            "check_id": "python.lang.security.audit.dangerous-system-call",
            "path": "app.py",
            "start": {"line": 15, "col": 1},
            "end": {"line": 15, "col": 40},
            "extra": {
                "severity": "WARNING",
                "message": "Detected use of a dangerous system call.",
            },
        },
        {
            "check_id": "python.flask.security.injection.sql-injection",
            "path": "app.py",
            "start": {"line": 42, "col": 5},
            "end": {"line": 42, "col": 50},
            "extra": {
                "severity": "ERROR",
                "message": "Possible SQL injection via string concatenation.",
            },
        },
    ],
    "errors": [],
}


def test_run_semgrep_parses_json(tmp_path: Path) -> None:
    """Canned Semgrep JSON is parsed into SemgrepFinding objects."""
    mock_proc = MagicMock()
    mock_proc.returncode = 1  # findings present
    mock_proc.stdout = json.dumps(SAMPLE_SEMGREP_OUTPUT)
    mock_proc.stderr = ""

    with patch("subprocess.run", return_value=mock_proc):
        findings = run_semgrep(tmp_path / "app.py")

    assert len(findings) == 2
    assert findings[0].rule_id == "python.lang.security.audit.dangerous-system-call"
    assert findings[0].line == 15
    assert findings[1].severity == "ERROR"
    assert findings[1].message == "Possible SQL injection via string concatenation."


def test_run_semgrep_not_installed(tmp_path: Path) -> None:
    """FileNotFoundError (semgrep not installed) returns empty list gracefully."""
    with patch("subprocess.run", side_effect=FileNotFoundError("semgrep not found")):
        findings = run_semgrep(tmp_path / "app.py")

    assert findings == []


def test_run_semgrep_timeout(tmp_path: Path) -> None:
    """Semgrep timeout returns empty list."""
    import subprocess

    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="semgrep", timeout=120)):
        findings = run_semgrep(tmp_path / "app.py")

    assert findings == []


def test_run_semgrep_bad_exit_code(tmp_path: Path) -> None:
    """Non-standard exit code returns empty list."""
    mock_proc = MagicMock()
    mock_proc.returncode = 2
    mock_proc.stdout = ""
    mock_proc.stderr = "fatal error"

    with patch("subprocess.run", return_value=mock_proc):
        findings = run_semgrep(tmp_path / "app.py")

    assert findings == []


def test_semgrep_to_hints() -> None:
    """Findings translate to hint strings for hybrid_clean."""
    findings = [
        SemgrepFinding(
            rule_id="python.flask.security.injection.sql-injection",
            file="app.py",
            line=42,
            severity="ERROR",
            message="Possible SQL injection",
        ),
    ]

    hints = semgrep_to_hints(findings)
    assert len(hints) == 1
    assert "semgrep:" in hints[0]
    assert "sql-injection" in hints[0]
    assert "line 42" in hints[0]


def test_semgrep_escalation_in_hybrid_clean() -> None:
    """Semgrep findings force escalation when LLM falsely reports clean."""
    from janus.verify import hybrid_clean

    clean_source = "x = 1\n"  # no regex heuristic matches
    external = ["[semgrep:sqli] SQL injection detected (line 10, ERROR)"]

    is_clean, hints = hybrid_clean(True, clean_source, external_hints=external)
    assert not is_clean
    assert any("semgrep" in h for h in hints)
