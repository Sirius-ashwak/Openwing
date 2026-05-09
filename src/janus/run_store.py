"""In-memory run lifecycle store.

Each scan initiated via the API creates a RunRecord. The store keeps the last
MAX_RUNS records (LRU eviction). All state is lost on server restart — acceptable
for the hackathon; swap for Redis/SQLite for persistence.
"""
from __future__ import annotations

import asyncio
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

MAX_RUNS = 200


@dataclass
class RunRecord:
    run_id: str
    target: str
    status: str = "queued"          # queued | running | done | error | cancelled
    mode: str = "auto"              # file | dir | repo
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None

    # Live event stream — populated while running, kept for replay
    events: list[dict[str, Any]] = field(default_factory=list)

    # Structured findings extracted after the run
    findings: list[dict[str, Any]] = field(default_factory=list)

    # Final serializable result
    result: dict[str, Any] | None = None
    error: str | None = None

    # Per-run stats
    files_scanned: int = 0
    files_patched: int = 0
    patch_cycles_total: int = 0

    # Per-file sweep lanes (built after scan completes)
    sweep_files: list[dict[str, Any]] = field(default_factory=list)

    # Repo metadata (populated for github URL targets)
    repo_meta: dict[str, Any] = field(default_factory=dict)

    # Temp directory for cloned repos (cleaned up after run)
    tmp_dir: Path | None = None

    # Async queue for live SSE streaming; consumers drain this while run is active
    queue: asyncio.Queue | None = None

    def to_dict(self) -> dict[str, Any]:
        dur = None
        if self.started_at and self.finished_at:
            dur = round(self.finished_at - self.started_at, 2)
        elif self.started_at:
            dur = round(time.time() - self.started_at, 2)
        return {
            "run_id": self.run_id,
            "target": self.target,
            "status": self.status,
            "mode": self.mode,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_s": dur,
            "files_scanned": self.files_scanned,
            "files_patched": self.files_patched,
            "patch_cycles_total": self.patch_cycles_total,
            "error": self.error,
        }


class RunStore:
    """Thread-safe in-memory run registry."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._runs: dict[str, RunRecord] = {}
        self._order: list[str] = []  # insertion order for LRU eviction

    def create(self, target: str, mode: str = "auto") -> RunRecord:
        run_id = uuid.uuid4().hex[:16]
        rec = RunRecord(run_id=run_id, target=target, mode=mode)
        with self._lock:
            self._runs[run_id] = rec
            self._order.append(run_id)
            self._evict()
        return rec

    def get(self, run_id: str) -> RunRecord | None:
        with self._lock:
            return self._runs.get(run_id)

    def list_recent(self, limit: int = 50) -> list[RunRecord]:
        with self._lock:
            ids = self._order[-limit:]
        recs = []
        for rid in reversed(ids):
            r = self._runs.get(rid)
            if r:
                recs.append(r)
        return recs

    def update(self, run_id: str, **kwargs: Any) -> None:
        with self._lock:
            rec = self._runs.get(run_id)
            if rec:
                for k, v in kwargs.items():
                    setattr(rec, k, v)

    def _evict(self) -> None:
        while len(self._order) > MAX_RUNS:
            oldest = self._order.pop(0)
            self._runs.pop(oldest, None)


# Module-level singleton shared by server.py and background tasks
store = RunStore()
