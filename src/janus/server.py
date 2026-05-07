"""Openwing Janus FastAPI server.

Real endpoints:
  POST   /api/runs                  — create and start a scan
  GET    /api/runs                  — list recent runs
  GET    /api/runs/{id}             — single run status + result
  GET    /api/runs/{id}/events      — SSE live trace stream
  GET    /api/runs/{id}/findings    — structured findings for a run
  DELETE /api/runs/{id}             — cancel / discard a run
  GET    /api/health                — provider health check
  GET    /api/system                — GPU / endpoint / budget status (env-driven)

The frontend is served from ./frontend via StaticFiles mount.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from janus.discovery import iter_python_files
from janus.github_fetcher import GitHubURLError, cleanup_clone, clone_repo, is_github_url
from janus.graph import JanusResult, run_janus_on_file
from janus.llm import check_provider_health, load_llm_config
from janus.run_store import RunRecord, store

logger = logging.getLogger(__name__)

# ── App setup ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Openwing Janus API",
    version="0.5.0",
    description="Red/Blue adversarial security pipeline",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],            # tighten for production
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ── Simple rate limiter (token bucket per IP) ─────────────────────────────

_rate: dict[str, tuple[float, int]] = {}  # ip → (window_start, count)
_RATE_WINDOW = 60.0
_RATE_LIMIT = int(os.environ.get("JANUS_RATE_LIMIT", "20"))


def _check_rate(ip: str) -> None:
    now = time.time()
    start, count = _rate.get(ip, (now, 0))
    if now - start > _RATE_WINDOW:
        _rate[ip] = (now, 1)
        return
    if count >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded — wait 60 s")
    _rate[ip] = (start, count + 1)


# ── Request / response schemas ─────────────────────────────────────────────

class CreateRunRequest(BaseModel):
    target: str = Field(
        description="GitHub URL (github.com/owner/repo), local file path, or local directory path"
    )
    max_cycles: int = Field(default=3, ge=1, le=10)
    dry_run: bool = Field(default=False)
    backup: bool = Field(default=False)
    concurrency: int = Field(default=3, ge=1, le=16)
    max_files: int = Field(default=100, ge=1, le=500)
    enable_semgrep: bool = Field(default=False)

    @field_validator("target")
    @classmethod
    def target_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("target must not be empty")
        return v


# ── Emit helper shared by background task ────────────────────────────────

def _make_emit(rec: RunRecord, loop: asyncio.AbstractEventLoop):
    t0 = time.time()

    def emit(event: dict[str, Any]) -> None:
        event = {
            "t": round((time.time() - t0) * 1000),  # ms since run start
            **event,
        }
        rec.events.append(event)
        if rec.queue is not None:
            loop.call_soon_threadsafe(rec.queue.put_nowait, event)

    return emit


def _close_sse(rec: RunRecord, loop: asyncio.AbstractEventLoop) -> None:
    if rec.queue is not None:
        loop.call_soon_threadsafe(rec.queue.put_nowait, None)  # sentinel


# ── Result → finding extractor ────────────────────────────────────────────

def _extract_findings(
    events: list[dict],
    results: list[JanusResult],
    run_id: str,
) -> list[dict]:
    """Build finding records from trace events (which capture every Red verdict).

    Reading from result.last_report would miss findings that were detected and
    then patched — since the final scan is clean, last_report.is_secure_report()
    returns True and the original vuln is invisible. The trace stream preserves
    the FIRST detection per file, which is what we want.
    """
    # Map file path → final per-file result (for patched/cycles status)
    by_file: dict[str, JanusResult] = {}
    for r in results:
        if r.target:
            by_file[r.target] = r

    findings: list[dict] = []
    seen_files: set[str] = set()  # only emit the first detection per file

    for ev in events:
        if ev.get("kind") != "finding" or ev.get("agent") != "red":
            continue
        fpath = ev.get("file", "")
        if fpath in seen_files:
            continue
        seen_files.add(fpath)

        result = by_file.get(fpath)
        findings.append({
            "id": f"{run_id[:8]}-{len(findings):03d}",
            "run_id": run_id,
            "file": fpath,
            "vulnerability_type": ev.get("cwe", "unknown"),
            "snippet": ev.get("snippet", ""),
            "payload": ev.get("payload", ""),
            "patched": bool(result and result.ok and result.patch_cycles > 0),
            "patch_cycles": result.patch_cycles if result else 0,
            "static_warnings": result.static_warnings if result else [],
            "dry_run": result.dry_run if result else False,
        })

    return findings


# ── Background scan task ──────────────────────────────────────────────────

async def _execute_run(rec: RunRecord, body: CreateRunRequest) -> None:
    loop = asyncio.get_running_loop()
    emit = _make_emit(rec, loop)
    store.update(rec.run_id, status="running", started_at=time.time(), queue=rec.queue)

    tmp_dir: Path | None = None
    scan_root: Path | None = None
    results: list[JanusResult] = []

    try:
        target = body.target

        # ── Resolve target ────────────────────────────────────────────────
        if is_github_url(target):
            emit({"agent": "system", "line": f"Cloning repository: {target}"})
            try:
                tmp_dir = await clone_repo(target, timeout_s=120)
                scan_root = tmp_dir
                store.update(rec.run_id, tmp_dir=tmp_dir)
                emit({"agent": "system", "line": f"Clone complete → {tmp_dir}"})
            except (GitHubURLError, TimeoutError, RuntimeError) as exc:
                raise RuntimeError(f"Repository clone failed: {exc}") from exc

        else:
            p = Path(target).expanduser().resolve()
            if not p.exists():
                raise FileNotFoundError(f"Path not found: {target!r}")
            scan_root = p

        # ── Discover files ────────────────────────────────────────────────
        if scan_root.is_file():
            py_files = [scan_root] if scan_root.suffix == ".py" else []
        else:
            emit({"agent": "system", "line": f"Discovering Python files in {scan_root.name}…"})
            py_files = iter_python_files(scan_root, max_files=body.max_files)

        if not py_files:
            raise ValueError("No Python (.py) files found in the target.")

        emit({"agent": "system", "line": f"Found {len(py_files)} Python file(s) to scan."})
        store.update(rec.run_id, files_scanned=len(py_files))

        # ── Scan each file ────────────────────────────────────────────────
        sem = asyncio.Semaphore(body.concurrency)
        scan_tasks = []
        for fpath in py_files:
            scan_tasks.append(_scan_one(rec, fpath, body, emit, loop, sem))

        file_results = await asyncio.gather(*scan_tasks, return_exceptions=True)

        for fr in file_results:
            if isinstance(fr, Exception):
                emit({"agent": "system", "line": f"File scan error: {fr}", "kind": "error"})
            else:
                results.append(fr)

        # ── Finalize ──────────────────────────────────────────────────────
        patched_count = sum(1 for r in results if r.ok and r.patch_cycles > 0)
        total_cycles = sum(r.patch_cycles for r in results)
        findings = _extract_findings(rec.events, results, rec.run_id)

        summary = {
            "files_scanned": len(results),
            "files_patched": patched_count,
            "findings_count": len(findings),
            "patch_cycles_total": total_cycles,
        }

        emit({
            "agent": "system",
            "line": (
                f"✓ Scan complete — {len(findings)} finding(s), "
                f"{patched_count}/{len(results)} files patched."
            ),
            "kind": "ok",
            "summary": summary,
        })

        store.update(
            rec.run_id,
            status="done",
            finished_at=time.time(),
            findings=findings,
            files_patched=patched_count,
            patch_cycles_total=total_cycles,
            result=summary,
        )

    except Exception as exc:
        logger.exception("Run %s failed", rec.run_id)
        err_msg = str(exc)
        emit({"agent": "system", "line": f"Run failed: {err_msg}", "kind": "error"})
        store.update(
            rec.run_id,
            status="error",
            finished_at=time.time(),
            error=err_msg,
        )
    finally:
        _close_sse(rec, loop)
        if tmp_dir is not None:
            cleanup_clone(tmp_dir)


async def _scan_one(
    rec: RunRecord,
    fpath: Path,
    body: CreateRunRequest,
    emit,
    loop: asyncio.AbstractEventLoop,
    sem: asyncio.Semaphore,
) -> JanusResult:
    async with sem:
        rel = fpath.name
        emit({"agent": "system", "line": f"→ Scanning {rel}"})

        def per_file_trace(event: dict) -> None:
            event["file"] = str(fpath)
            emit(event)

        result = await loop.run_in_executor(
            None,
            lambda: run_janus_on_file(
                fpath,
                max_patch_cycles=body.max_cycles,
                dry_run=body.dry_run,
                backup_before_write=body.backup,
                enable_semgrep=body.enable_semgrep,
                trace_fn=per_file_trace,
            ),
        )

        status = "patched" if (result.ok and result.patch_cycles > 0) else "clean" if result.ok else "failed"
        emit({"agent": "system", "line": f"  {rel}: {status} (cycles={result.patch_cycles})"})
        return result


# ── API endpoints ─────────────────────────────────────────────────────────

@app.post("/api/runs", status_code=202)
async def create_run(
    body: CreateRunRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict:
    _check_rate(request.client.host if request.client else "unknown")

    rec = store.create(
        target=body.target,
        mode="repo" if is_github_url(body.target) else "dir",
    )
    rec.queue = asyncio.Queue()

    background_tasks.add_task(_execute_run, rec, body)

    return {
        "run_id": rec.run_id,
        "status": rec.status,
        "target": rec.target,
    }


@app.get("/api/runs")
async def list_runs(limit: int = 50) -> list[dict]:
    return [r.to_dict() for r in store.list_recent(min(limit, 200))]


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str) -> dict:
    rec = store.get(run_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    d = rec.to_dict()
    d["result"] = rec.result
    d["error"] = rec.error
    return d


@app.get("/api/runs/{run_id}/findings")
async def get_findings(run_id: str) -> list[dict]:
    rec = store.get(run_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return rec.findings


@app.delete("/api/runs/{run_id}", status_code=204)
async def delete_run(run_id: str) -> None:
    rec = store.get(run_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    store.update(run_id, status="cancelled")
    if rec.tmp_dir:
        cleanup_clone(rec.tmp_dir)


@app.get("/api/runs/{run_id}/events")
async def stream_events(run_id: str, request: Request) -> StreamingResponse:
    rec = store.get(run_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

    async def generator():
        # Replay history so late-connecting clients see full trace
        for event in list(rec.events):
            yield f"data: {json.dumps(event)}\n\n"

        # Stream live events if run is still active
        if rec.status in ("queued", "running") and rec.queue is not None:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(rec.queue.get(), timeout=25.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if event is None:  # sentinel: run finished
                    break
                yield f"data: {json.dumps(event)}\n\n"

        yield "data: {\"agent\":\"system\",\"line\":\"stream closed\",\"kind\":\"eof\"}\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/health")
async def health() -> dict:
    providers = check_provider_health()
    any_ok = any(p["ok"] for p in providers)
    return {
        "status": "ok" if any_ok else "degraded",
        "providers": providers,
        "active_runs": sum(1 for r in store.list_recent(200) if r.status == "running"),
    }


@app.get("/api/system")
async def system_status() -> dict:
    cfg = load_llm_config()
    return {
        "gpu": {
            "name": os.environ.get("JANUS_GPU_NAME", "AMD Instinct MI300X"),
            "count": int(os.environ.get("JANUS_GPU_COUNT", "1")),
            "vram_gb": int(os.environ.get("JANUS_GPU_VRAM_GB", "192")),
            "util": None,
            "mem": os.environ.get("JANUS_GPU_MEM", "N/A"),
            "temp": None,
            "vcpu": int(os.environ.get("JANUS_VCPU", "20")),
            "ram_gb": int(os.environ.get("JANUS_RAM_GB", "240")),
        },
        "endpoint": {
            "url": cfg.base_url,
            "model": cfg.model,
            "provider": cfg.provider_name,
        },
        "budget": {
            "spent": float(os.environ.get("JANUS_BUDGET_SPENT", "0")),
            "total": float(os.environ.get("JANUS_BUDGET_TOTAL", "100")),
        },
    }


# ── Legacy GET endpoints (kept for frontend compatibility) ────────────────

@app.get("/api/repo")
async def get_repo() -> dict:
    runs = store.list_recent(1)
    if runs and runs[0].target:
        return {
            "url": runs[0].target.replace("https://", "").replace("http://", ""),
            "name": Path(runs[0].target).name,
            "owner": "",
            "branch": "main",
            "commit": "–",
            "language": "Python",
            "files": runs[0].files_scanned,
            "loc": 0,
            "size": "–",
        }
    return {
        "url": "github.com/openwing-labs/vuln-flask-app",
        "name": "vuln-flask-app",
        "owner": "openwing-labs",
        "branch": "main",
        "commit": "–",
        "language": "Python",
        "files": 0,
        "loc": 0,
        "size": "–",
    }


@app.get("/api/filetree")
async def get_filetree() -> list:
    runs = store.list_recent(1)
    if not runs:
        return []
    rec = runs[0]
    return [
        {
            "path": f["file"],
            "loc": 0,
            "status": "critical" if not f["patched"] else "clean",
            "vulnerability_type": f["vulnerability_type"],
        }
        for f in rec.findings
    ]


@app.get("/api/sweep")
async def get_sweep() -> list:
    runs = store.list_recent(1)
    if not runs:
        return []
    return [r.to_dict() for r in store.list_recent(20)]


@app.get("/api/history")
async def get_history() -> list:
    return [r.to_dict() for r in store.list_recent(50)]


@app.get("/api/trace")
async def get_trace(run_id: str | None = None) -> list:
    if run_id:
        rec = store.get(run_id)
        return rec.events if rec else []
    runs = store.list_recent(1)
    return runs[0].events if runs else []


# ── Static frontend ───────────────────────────────────────────────────────

_frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
if _frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")
