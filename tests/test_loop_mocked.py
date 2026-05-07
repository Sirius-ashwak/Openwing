from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import pytest

from janus.graph import run_janus_on_file


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "EMPTY")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://localhost:8000")


def _responses_for(file_path: Path) -> deque[str]:
    liar_clean = json.dumps(
        {
            "file_path": str(file_path),
            "vulnerability_type": "none",
            "vulnerable_code_snippet": "",
            "exploit_payload": "",
        }
    )

    patched_source = '''import sqlite3
from flask import Flask, request


app = Flask(__name__)


@app.post("/login")
def login():
    username = request.form["username"]

    conn = sqlite3.connect(":memory:")
    cur = conn.cursor()
    cur.execute("SELECT username,password FROM users WHERE username = ?", (username,))
    rows = cur.fetchall()
    conn.close()

    return {"authenticated": len(rows) == 1, "hits": rows}
'''

    final_clean = json.dumps(
        {
            "file_path": str(file_path),
            "vulnerability_type": "none",
            "vulnerable_code_snippet": "",
            "exploit_payload": "",
        }
    )

    return deque([liar_clean, patched_source, final_clean])


def test_hybrid_escalates_llm_miss(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    buggy = '''import sqlite3
from flask import Flask, request


app = Flask(__name__)


@app.post("/login")
def login():
    username = request.form["username"]

    conn = sqlite3.connect(":memory:")
    cur = conn.cursor()

    risky = '"' + username + '"'
    cur.execute(risky)
    conn.close()

    return {"ok": False}
'''

    sample = tmp_path / "broken.py"
    sample.write_text(buggy, encoding="utf-8")

    queue = _responses_for(sample)

    monkeypatch.setattr(
        "janus.llm.sync_chat",
        lambda *_args, **_kwargs: queue.popleft(),
    )

    result = run_janus_on_file(sample, max_patch_cycles=3)

    assert result.ok
    assert result.patch_cycles == 1
    rewritten = sample.read_text(encoding="utf-8")

    assert "?" in rewritten  # parameterized placeholder present
