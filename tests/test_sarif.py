"""SARIF 2.1.0 export tests."""

from __future__ import annotations

from janus.sarif import to_sarif, _fingerprint
from janus.graph import JanusResult
from janus.schemas import RedTeamReport


def _make_vuln_result() -> JanusResult:
    """A result with a SQL injection finding."""
    report = RedTeamReport(
        file_path="app.py",
        vulnerability_type="sql_injection",
        vulnerable_code_snippet="cursor.execute(query)",
        exploit_payload="admin' OR '1'='1 --",
    )
    return JanusResult(
        ok=False,
        message="Found SQLi",
        patch_cycles=1,
        last_report=report,
        static_warnings=["f-string passed to execute() likely interpolates SQL"],
        target="app.py",
    )


def _make_clean_result() -> JanusResult:
    """A result with no findings."""
    return JanusResult(
        ok=True,
        message="Clean",
        patch_cycles=0,
        last_report=None,
        static_warnings=[],
        target="safe.py",
    )


def test_sarif_schema_structure() -> None:
    """Output conforms to SARIF 2.1.0 schema structure."""
    results = [_make_vuln_result()]
    sarif = to_sarif(results, tool_version="0.1.0")

    assert sarif["$schema"].endswith("sarif-schema-2.1.0.json")
    assert sarif["version"] == "2.1.0"
    assert len(sarif["runs"]) == 1

    run = sarif["runs"][0]
    assert run["tool"]["driver"]["name"] == "Openwing Janus"
    assert run["tool"]["driver"]["version"] == "0.1.0"
    assert len(run["tool"]["driver"]["rules"]) > 0
    assert len(run["results"]) > 0


def test_sarif_has_vulnerability_result() -> None:
    """Vulnerability findings appear as error-level results."""
    results = [_make_vuln_result()]
    sarif = to_sarif(results)
    run_results = sarif["runs"][0]["results"]

    vuln_results = [r for r in run_results if r["level"] == "error"]
    assert len(vuln_results) == 1
    assert vuln_results[0]["ruleId"] == "janus/sql-injection"
    assert "partialFingerprints" in vuln_results[0]


def test_sarif_has_heuristic_warnings() -> None:
    """Static heuristic warnings appear as informational notes."""
    results = [_make_vuln_result()]
    sarif = to_sarif(results)
    run_results = sarif["runs"][0]["results"]

    notes = [r for r in run_results if r.get("level") == "note"]
    assert len(notes) == 1
    assert notes[0]["ruleId"] == "janus/heuristic-warning"


def test_fingerprint_stability() -> None:
    """Same input always produces same fingerprint hash."""
    fp1 = _fingerprint("app.py", "sql_injection", "bad code")
    fp2 = _fingerprint("app.py", "sql_injection", "bad code")
    fp3 = _fingerprint("app.py", "sql_injection", "different code")

    assert fp1 == fp2
    assert fp1 != fp3


def test_sarif_clean_result_no_errors() -> None:
    """Clean results produce no error-level SARIF results."""
    results = [_make_clean_result()]
    sarif = to_sarif(results)
    run_results = sarif["runs"][0]["results"]

    error_results = [r for r in run_results if r["level"] == "error"]
    assert len(error_results) == 0


def test_sarif_multiple_results() -> None:
    """Multiple JanusResults merge into a single SARIF run."""
    results = [_make_vuln_result(), _make_clean_result()]
    sarif = to_sarif(results)

    assert len(sarif["runs"]) == 1
    run_results = sarif["runs"][0]["results"]
    assert len(run_results) >= 1
