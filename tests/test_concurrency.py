"""Concurrency sweep tests with mocked LLM (no live inference)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from janus.runner import sweep_python_tree, async_sweep_python_tree


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "EMPTY")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://localhost:8000")


def _make_clean_mock(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """Install a mock that always reports clean. Returns a call counter."""
    counter: dict[str, int] = {"calls": 0}

    def fake_sync_chat(system: str, user: str, *, temperature: float = 0.2) -> str:
        counter["calls"] += 1
        return json.dumps({
            "file_path": "test.py",
            "vulnerability_type": "none",
            "vulnerable_code_snippet": "",
            "exploit_payload": "",
        })

    monkeypatch.setattr("janus.llm.sync_chat", fake_sync_chat)
    return counter


def test_serial_sweep_matches_concurrent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """N files under concurrency yields same outcomes as serial."""

    # Create 5 simple Python files
    for i in range(5):
        (tmp_path / f"mod_{i}.py").write_text(f"x_{i} = {i}\n", encoding="utf-8")

    _make_clean_mock(monkeypatch)

    serial_results = sweep_python_tree(tmp_path, concurrency=1, max_patch_cycles=1)
    _make_clean_mock(monkeypatch)  # reset counter
    concurrent_results = sweep_python_tree(tmp_path, concurrency=3, max_patch_cycles=1)

    assert len(serial_results) == len(concurrent_results) == 5
    for s, c in zip(serial_results, concurrent_results):
        assert s.ok == c.ok
        assert s.patch_cycles == c.patch_cycles


def test_concurrency_cap_respected(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Max concurrent invocations ≤ concurrency setting."""

    import threading

    for i in range(6):
        (tmp_path / f"mod_{i}.py").write_text(f"y_{i} = {i}\n", encoding="utf-8")

    peak_concurrent: dict[str, int] = {"current": 0, "max": 0}
    lock = threading.Lock()

    def tracking_chat(system: str, user: str, *, temperature: float = 0.2) -> str:
        with lock:
            peak_concurrent["current"] += 1
            peak_concurrent["max"] = max(peak_concurrent["max"], peak_concurrent["current"])

        import time
        time.sleep(0.05)  # simulate LLM latency

        with lock:
            peak_concurrent["current"] -= 1

        return json.dumps({
            "file_path": "test.py",
            "vulnerability_type": "none",
            "vulnerable_code_snippet": "",
            "exploit_payload": "",
        })

    monkeypatch.setattr("janus.llm.sync_chat", tracking_chat)

    concurrency_limit = 2
    results = sweep_python_tree(
        tmp_path, concurrency=concurrency_limit, max_patch_cycles=1
    )

    assert len(results) == 6
    assert all(r.ok for r in results)
    # Peak concurrent should not exceed our limit
    assert peak_concurrent["max"] <= concurrency_limit


def test_jsonl_progress_written(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """JSONL partial file is written per target."""
    import asyncio

    files_dir = tmp_path / "src"
    files_dir.mkdir()
    for i in range(3):
        (files_dir / f"f_{i}.py").write_text(f"z_{i} = {i}\n", encoding="utf-8")

    progress_dir = tmp_path / "progress"

    _make_clean_mock(monkeypatch)

    asyncio.run(
        async_sweep_python_tree(
            files_dir,
            concurrency=2,
            max_patch_cycles=1,
            progress_dir=progress_dir,
        )
    )

    # Find the JSONL file
    jsonl_files = list(progress_dir.glob("janus-*.partial.jsonl"))
    assert len(jsonl_files) == 1

    lines = jsonl_files[0].read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 3

    # Each line should be valid JSON
    for line in lines:
        data = json.loads(line)
        assert "ok" in data
        assert "target" in data
