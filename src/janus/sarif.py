"""SARIF 2.1.0 export for Janus scan results."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from janus.graph import JanusResult
from janus.schemas import RedTeamReport


_SARIF_SCHEMA = "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json"
_SARIF_VERSION = "2.1.0"

# Rule definitions for known vulnerability types
_RULE_MAP: dict[str, dict[str, str]] = {
    "sql_injection": {
        "id": "janus/sql-injection",
        "name": "SQLInjection",
        "shortDescription": "SQL injection via dynamic query construction",
        "helpUri": "https://cwe.mitre.org/data/definitions/89.html",
    },
    "sql_injection_heuristic_escalation": {
        "id": "janus/sql-injection-heuristic",
        "name": "SQLInjectionHeuristic",
        "shortDescription": "SQL injection detected by heuristic escalation (LLM missed it)",
        "helpUri": "https://cwe.mitre.org/data/definitions/89.html",
    },
    "ssrf": {
        "id": "janus/ssrf",
        "name": "SSRF",
        "shortDescription": "Server-Side Request Forgery",
        "helpUri": "https://cwe.mitre.org/data/definitions/918.html",
    },
    "command_injection": {
        "id": "janus/command-injection",
        "name": "CommandInjection",
        "shortDescription": "OS command injection via shell execution",
        "helpUri": "https://cwe.mitre.org/data/definitions/78.html",
    },
}


def _fingerprint(file_path: str, vuln_type: str, snippet: str) -> str:
    """Stable partial fingerprint from content hash."""
    raw = f"{file_path}|{vuln_type}|{snippet}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _rule_for_type(vuln_type: str) -> dict[str, Any]:
    """Look up or synthesize a SARIF rule descriptor."""
    normalized = vuln_type.strip().lower().replace(" ", "_").replace("-", "_")
    if normalized in _RULE_MAP:
        spec = _RULE_MAP[normalized]
        return {
            "id": spec["id"],
            "name": spec["name"],
            "shortDescription": {"text": spec["shortDescription"]},
            "helpUri": spec.get("helpUri", ""),
        }
    return {
        "id": f"janus/{normalized}",
        "name": normalized,
        "shortDescription": {"text": f"Vulnerability: {vuln_type}"},
    }


def _result_from_report(report: RedTeamReport) -> dict[str, Any]:
    """Convert a RedTeamReport to a SARIF result object."""
    rule = _rule_for_type(report.vulnerability_type)
    fp = _fingerprint(
        report.file_path, report.vulnerability_type, report.vulnerable_code_snippet
    )

    result: dict[str, Any] = {
        "ruleId": rule["id"],
        "level": "error",
        "message": {
            "text": (
                f"Vulnerability: {report.vulnerability_type}. "
                f"Exploit payload: {report.exploit_payload}"
            )
        },
        "locations": [
            {
                "physicalLocation": {
                    "artifactLocation": {"uri": report.file_path},
                    "region": {"startLine": 1},
                }
            }
        ],
        "partialFingerprints": {"primaryContentHash": fp},
    }
    return result


def _result_from_warning(warning: str, file_path: str) -> dict[str, Any]:
    """Convert a static heuristic warning to a SARIF informational result."""
    fp = _fingerprint(file_path, "heuristic", warning)
    return {
        "ruleId": "janus/heuristic-warning",
        "level": "note",
        "kind": "informational",
        "message": {"text": warning},
        "locations": [
            {
                "physicalLocation": {
                    "artifactLocation": {"uri": file_path},
                }
            }
        ],
        "partialFingerprints": {"primaryContentHash": fp},
    }


def to_sarif(
    results: list[JanusResult],
    *,
    tool_version: str = "0.1.0",
) -> dict[str, Any]:
    """Build a SARIF 2.1.0 document from Janus scan results."""

    sarif_results: list[dict[str, Any]] = []
    rules_seen: dict[str, dict[str, Any]] = {}

    for row in results:
        # Main vulnerability result
        if row.last_report and not row.last_report.is_secure_report():
            report = row.last_report
            rule = _rule_for_type(report.vulnerability_type)
            rules_seen[rule["id"]] = rule
            sarif_results.append(_result_from_report(report))

        # Heuristic warnings as informational notes
        for warn in row.static_warnings:
            target = row.target or "unknown"
            sarif_results.append(_result_from_warning(warn, target))
            rules_seen["janus/heuristic-warning"] = {
                "id": "janus/heuristic-warning",
                "name": "HeuristicWarning",
                "shortDescription": {
                    "text": "Static heuristic pattern match (may be false positive)"
                },
            }

    return {
        "$schema": _SARIF_SCHEMA,
        "version": _SARIF_VERSION,
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "Openwing Janus",
                        "version": tool_version,
                        "informationUri": "https://github.com/openwing/janus",
                        "rules": list(rules_seen.values()),
                    }
                },
                "results": sarif_results,
            }
        ],
    }
