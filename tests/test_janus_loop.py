"""Loop and schema tests with mocked LLM (no live inference)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from janus.schemas import RedTeamReport, parse_red_team_json
from janus.graph import run_janus_on_file


def test_parse_red_team_json_minimal():
    raw = json.dumps(
        {
            "file_path": "x.py",
            "vulnerability_type": "none",
            "vulnerable_code_snippet": "",
            "exploit_payload": "",
        }
    )
    r = parse_red_team_json(raw, "fallback.py")
    assert r.is_secure_report()


def test_red_team_schema_fields():
    r = RedTeamReport(
        file_path="a.py",
        vulnerability_type="sql_injection",
        vulnerable_code_snippet="bad",
        exploit_payload="' OR 1=1--",
    )
    assert not r.is_secure_report()
    d = r.model_dump()
    assert set(d.keys()) == {
        "file_path",
        "vulnerability_type",
        "vulnerable_code_snippet",
        "exploit_payload",
    }


def test_langgraph_loop_secure_first_call(monkeypatch, tmp_path: Path) -> None:
    """Single scan: model reports clean → success without patch."""

    def fake_sync_chat(*, system: str, user: str, temperature: float = 0.2) -> str:
        assert "SOURCE" in user
        return json.dumps(
            {
                "file_path": str(tmp_path / "t.py"),
                "vulnerability_type": "none",
                "vulnerable_code_snippet": "",
                "exploit_payload": "",
            }
        )

    monkeypatch.setattr("janus.llm.sync_chat", fake_sync_chat)
    p = tmp_path / "t.py"
    p.write_text("print('ok')\n", encoding="utf-8")

    res = run_janus_on_file(p, max_patch_cycles=3)
    assert res.ok
    assert res.patch_cycles == 0
    assert "vulnerabilit" in res.message.lower()


def test_langgraph_loop_patch_then_clean(monkeypatch, tmp_path: Path) -> None:
    calls: list[str] = []
    red_passes = {"count": 0}

    def fake_sync_chat(*, system: str, user: str, temperature: float = 0.2) -> str:
        calls.append(user[:80])
        # Red: first dirty, second clean. Blue: when REPORT in user, return patched code.
        if "REPORT:" in user and "ORIGINAL_SOURCE" in user:
            return "SAFE = True\n"
        red_passes["count"] += 1
        if red_passes["count"] >= 2:
            return json.dumps(
                {
                    "file_path": "t.py",
                    "vulnerability_type": "none",
                    "vulnerable_code_snippet": "",
                    "exploit_payload": "",
                }
            )
        return json.dumps(
            {
                "file_path": "t.py",
                "vulnerability_type": "sql_injection",
                "vulnerable_code_snippet": "bad line",
                "exploit_payload": "x",
            }
        )

    monkeypatch.setattr("janus.llm.sync_chat", fake_sync_chat)
    p = tmp_path / "t.py"
    p.write_text("BAD = True\n", encoding="utf-8")

    res = run_janus_on_file(p, max_patch_cycles=3)
    assert res.ok
    assert res.patch_cycles == 1
    assert p.read_text(encoding="utf-8").strip() == "SAFE = True"


def test_iteration_limit(monkeypatch, tmp_path: Path) -> None:
    """Always dirty Red → exhaust max cycles (mock Blue returns still-dirty-looking code is irrelevant; Red always dirty)."""

    def always_dirty(*, system: str, user: str, temperature: float = 0.2) -> str:
        if "REPORT:" in user and "ORIGINAL_SOURCE" in user:
            return "# patched but still flagged by red\n"
        return json.dumps(
            {
                "file_path": "t.py",
                "vulnerability_type": "sql_injection",
                "vulnerable_code_snippet": "x",
                "exploit_payload": "y",
            }
        )

    monkeypatch.setattr("janus.llm.sync_chat", always_dirty)
    p = tmp_path / "t.py"
    p.write_text("v=1\n", encoding="utf-8")

    res = run_janus_on_file(p, max_patch_cycles=3)
    assert not res.ok
    assert res.patch_cycles == 3
    assert "max patch cycles" in res.message.lower()
