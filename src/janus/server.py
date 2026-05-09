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

# CWE → frontend display metadata. Drives severity, CVSS heuristic, title, impact.
_CWE_META: dict[str, dict[str, Any]] = {
    "sql_injection": {
        "severity": "critical",
        "cvss": 9.1,
        "title": "SQL Injection",
        "cwe": "CWE-89",
        "impact": [
            "Attacker can read or modify any row in the database via crafted input.",
            "Authentication can be bypassed by injecting OR clauses.",
            "Confidentiality and integrity of all stored data are at risk.",
        ],
    },
    "command_injection": {
        "severity": "critical",
        "cvss": 9.8,
        "title": "OS Command Injection",
        "cwe": "CWE-78",
        "impact": ["Arbitrary OS command execution under the server process identity."],
    },
    "ssrf": {
        "severity": "critical",
        "cvss": 9.0,
        "title": "Server-Side Request Forgery",
        "cwe": "CWE-918",
        "impact": [
            "Server can be coerced into requesting internal endpoints (cloud metadata, RFC1918).",
            "Credentials in IMDS are exfiltrable on most cloud providers.",
        ],
    },
    "rce": {
        "severity": "critical",
        "cvss": 9.8,
        "title": "Remote Code Execution",
        "cwe": "CWE-94",
        "impact": ["Attacker-controlled code runs in the application process."],
    },
    "deserialization": {
        "severity": "critical",
        "cvss": 9.0,
        "title": "Insecure Deserialization",
        "cwe": "CWE-502",
        "impact": ["Untrusted input deserialized — gadget chains can lead to RCE."],
    },
    "xss": {
        "severity": "high",
        "cvss": 7.4,
        "title": "Cross-Site Scripting",
        "cwe": "CWE-79",
        "impact": ["Session hijack, credential theft, persistent UI takeover."],
    },
    "path_traversal": {
        "severity": "high",
        "cvss": 7.5,
        "title": "Path Traversal",
        "cwe": "CWE-22",
        "impact": ["Read arbitrary files outside the intended directory."],
    },
    "auth_bypass": {
        "severity": "high",
        "cvss": 8.1,
        "title": "Authentication Bypass",
        "cwe": "CWE-287",
        "impact": ["Privileged routes accessible without valid credentials."],
    },
    "idor": {
        "severity": "high",
        "cvss": 7.7,
        "title": "Insecure Direct Object Reference",
        "cwe": "CWE-639",
        "impact": ["One user can access another's records by changing an identifier."],
    },
}

_DEFAULT_META: dict[str, Any] = {
    "severity": "medium",
    "cvss": 5.5,
    "title": "Vulnerability detected",
    "cwe": "CWE-Other",
    "impact": ["Manual review recommended."],
}


def _normalize_cwe(raw: str) -> str:
    return (raw or "").strip().lower().replace("-", "_").replace(" ", "_")


def _meta_for(raw_cwe: str) -> dict[str, Any]:
    key = _normalize_cwe(raw_cwe)
    if key in _CWE_META:
        return _CWE_META[key]
    if "sqli" in key or "sql" in key and "inject" in key:
        return _CWE_META["sql_injection"]
    if "ssrf" in key:
        return _CWE_META["ssrf"]
    if "xss" in key or "cross_site" in key:
        return _CWE_META["xss"]
    if "path" in key or "lfi" in key or "traversal" in key:
        return _CWE_META["path_traversal"]
    if "rce" in key or "code_exec" in key:
        return _CWE_META["rce"]
    if "deserial" in key:
        return _CWE_META["deserialization"]
    if "command" in key and "inject" in key:
        return _CWE_META["command_injection"]
    if "auth" in key and "bypass" in key:
        return _CWE_META["auth_bypass"]
    if "idor" in key:
        return _CWE_META["idor"]
    return _DEFAULT_META


def _find_snippet_line(snippet: str, source: str) -> int:
    """Best-effort: find the 1-indexed line of `snippet` inside `source`."""
    if not snippet or not source:
        return 1
    needle = snippet.strip().splitlines()[0].strip()
    if not needle:
        return 1
    for idx, line in enumerate(source.splitlines(), start=1):
        if needle in line:
            return idx
    return 1


def _extract_findings(
    events: list[dict],
    results: list[JanusResult],
    run_id: str,
) -> list[dict]:
    """Build findings keyed off red 'finding' events, enriched with patch + verify
    timestamps and the before/after source captured by graph.py.
    """
    by_file: dict[str, JanusResult] = {}
    for r in results:
        if r.target:
            by_file[r.target] = r

    # Index trace events by file for patch/verify lookup
    patch_events: dict[str, dict] = {}   # file → most recent patch event
    verify_events: dict[str, dict] = {}  # file → most recent verify event
    for ev in events:
        f = ev.get("file") or ""
        if not f:
            continue
        if ev.get("kind") == "patch":
            patch_events[f] = ev
        elif ev.get("kind") == "verify":
            verify_events[f] = ev

    findings: list[dict] = []
    seen_files: set[str] = set()

    for ev in events:
        if ev.get("kind") != "finding" or ev.get("agent") != "red":
            continue
        fpath = ev.get("file", "")
        if not fpath or fpath in seen_files:
            continue
        seen_files.add(fpath)

        result = by_file.get(fpath)
        meta = _meta_for(ev.get("cwe", ""))
        snippet = ev.get("snippet", "")
        payload = ev.get("payload", "")

        patch_ev = patch_events.get(fpath)
        verify_ev = verify_events.get(fpath)
        original_source = (patch_ev or {}).get("original_source") or snippet
        patched_source = (patch_ev or {}).get("patched_source") or ""

        line_no = _find_snippet_line(snippet, original_source)
        file_basename = Path(fpath).name

        finding = {
            "id": f"JNS-{len(findings) + 1:03d}",
            "run_id": run_id,
            "file": fpath,
            "line": line_no,
            "title": f"{meta['title']} in {file_basename}",
            "vulnerability_type": ev.get("cwe", "unknown"),
            "cwe": meta["cwe"],
            "severity": meta["severity"],
            "cvss": meta["cvss"],
            "description": (
                f"{meta['title']} confirmed by Janus_Red. "
                f"Trigger snippet: {snippet[:120]}…"
                if len(snippet) > 120
                else f"{meta['title']} confirmed by Janus_Red. Trigger snippet: {snippet}"
            ),
            "impact": meta["impact"],
            "vulnCode": original_source,
            "patchedCode": patched_source,
            "snippet": snippet,
            "payload": payload,
            "poc": payload if payload else None,
            "triage": "true-positive",
            "patched": bool(patch_ev) or bool(result and result.ok and result.patch_cycles > 0),
            "patch_cycles": result.patch_cycles if result else 0,
            "static_warnings": result.static_warnings if result else [],
            "dry_run": result.dry_run if result else False,
            "discoveredAt": int(ev.get("t", 0)),
            "patchedAt": int(patch_ev["t"]) if patch_ev else None,
            "verifiedAt": int(verify_ev["t"]) if verify_ev else None,
        }
        findings.append(finding)

    return findings


# ── Per-file sweep lane builder ───────────────────────────────────────────

def _build_sweep_lanes(
    py_files: list[Path],
    events: list[dict],
    results: list[JanusResult],
) -> list[dict]:
    """Build per-file sweep lane data for /api/sweep — one row per file."""
    by_file: dict[str, JanusResult] = {r.target: r for r in results if r.target}

    # Find first finding-event timestamp per file
    finding_t: dict[str, int] = {}
    for ev in events:
        if ev.get("kind") != "finding":
            continue
        f = ev.get("file") or ""
        if f and f not in finding_t:
            finding_t[f] = int(ev.get("t", 0))

    # Find scan-complete timestamp per file (last "Scanning" → next system event)
    last_t = max((int(ev.get("t", 0)) for ev in events), default=0)

    lanes: list[dict] = []
    for fpath in py_files:
        path_str = str(fpath)
        result = by_file.get(path_str)
        loc = 0
        try:
            loc = sum(1 for _ in fpath.read_text(encoding="utf-8", errors="ignore").splitlines())
        except OSError:
            loc = 0

        if path_str in finding_t:
            state = "critical"
            findings_count = 1
            t_ms = finding_t[path_str]
        elif result and result.ok:
            state = "clean"
            findings_count = 0
            t_ms = last_t
        else:
            state = "clean"
            findings_count = 0
            t_ms = last_t

        lanes.append({
            "path": fpath.name,
            "loc": loc,
            "time": t_ms,
            "state": state,
            "findings": findings_count,
        })
    return lanes


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
                from janus.github_fetcher import parse_github_url
                owner, repo_name = parse_github_url(target)
                repo_meta = {
                    "url": f"github.com/{owner}/{repo_name}",
                    "name": repo_name,
                    "owner": owner,
                    "branch": "main",
                    "commit": "HEAD",
                    "language": "Python",
                }
                store.update(rec.run_id, tmp_dir=tmp_dir, repo_meta=repo_meta)
                emit({"agent": "system", "line": f"Clone complete → {tmp_dir}"})
            except (GitHubURLError, TimeoutError, RuntimeError) as exc:
                raise RuntimeError(f"Repository clone failed: {exc}") from exc

        else:
            p = Path(target).expanduser().resolve()
            if not p.exists():
                raise FileNotFoundError(f"Path not found: {target!r}")
            scan_root = p
            store.update(rec.run_id, repo_meta={
                "url": str(p),
                "name": p.name,
                "owner": "local",
                "branch": "—",
                "commit": "—",
                "language": "Python",
            })

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
        sweep_lanes = _build_sweep_lanes(py_files, rec.events, results)

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
            sweep_files=sweep_lanes,
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


# ── Legacy GET endpoints (frontend convenience views) ────────────────────

def _format_when(epoch: float | None) -> str:
    if epoch is None:
        return "—"
    delta = time.time() - epoch
    if delta < 60:
        return f"{int(delta)}s ago"
    if delta < 3600:
        return f"{int(delta // 60)}m ago"
    if delta < 86400:
        return f"{int(delta // 3600)}h ago"
    return f"{int(delta // 86400)}d ago"


def _history_status(rec: RunRecord) -> str:
    if rec.status == "error":
        return "failed"
    if rec.status == "cancelled":
        return "failed"
    if rec.status in ("queued", "running"):
        return "partial"
    if rec.files_patched > 0:
        return "resolved"
    if len(rec.findings) == 0:
        return "clean"
    return "partial"


@app.get("/api/repo")
async def get_repo() -> dict:
    runs = store.list_recent(1)
    rec = runs[0] if runs else None
    meta = (rec.repo_meta if rec else {}) or {}
    total_loc = sum(f.get("loc", 0) for f in (rec.sweep_files if rec else []))
    return {
        "url": meta.get("url", ""),
        "name": meta.get("name", ""),
        "owner": meta.get("owner", ""),
        "branch": meta.get("branch", "—"),
        "commit": meta.get("commit", "—"),
        "language": meta.get("language", "Python"),
        "files": rec.files_scanned if rec else 0,
        "loc": total_loc,
        "size": "—",
    }


@app.get("/api/filetree")
async def get_filetree() -> list:
    runs = store.list_recent(1)
    if not runs:
        return []
    rec = runs[0]
    flagged_files = {f["file"]: f for f in rec.findings}
    out: list[dict] = []
    for entry in rec.sweep_files:
        path = entry.get("path", "")
        is_flagged = any(path == Path(k).name for k in flagged_files)
        out.append({
            "path": path,
            "loc": entry.get("loc", 0),
            "status": "critical" if entry.get("state") == "critical" or is_flagged else "clean",
        })
    return out


@app.get("/api/sweep")
async def get_sweep() -> list:
    runs = store.list_recent(1)
    if not runs:
        return []
    return runs[0].sweep_files


@app.get("/api/history")
async def get_history() -> list:
    out: list[dict] = []
    for rec in store.list_recent(50):
        meta = rec.repo_meta or {}
        repo_label = meta.get("url") or rec.target or "—"
        if rec.started_at and rec.finished_at:
            dur_s = rec.finished_at - rec.started_at
            dur = f"{dur_s:.1f}s"
        else:
            dur = "—"
        out.append({
            "id": rec.run_id,
            "repo": repo_label,
            "when": _format_when(rec.started_at or rec.created_at),
            "status": _history_status(rec),
            "findings": len(rec.findings),
            "fixed": rec.files_patched,
            "dur": dur,
            "cost": "$0.00",  # cost tracking not implemented yet
        })
    return out


@app.get("/api/trace")
async def get_trace(run_id: str | None = None) -> list:
    if run_id:
        rec = store.get(run_id)
        return rec.events if rec else []
    runs = store.list_recent(1)
    return runs[0].events if runs else []


@app.get("/api/findings")
async def get_findings_default() -> list:
    """Convenience: latest run's findings (frontend prefetch)."""
    runs = store.list_recent(1)
    return runs[0].findings if runs else []


# ── Static frontend ───────────────────────────────────────────────────────
# Production: serve the Vite-built bundle from frontend/dist/.
# Development: run `npm run dev` in frontend/ — Vite proxies /api/* here.

_frontend_root = Path(__file__).resolve().parent.parent.parent / "frontend"
_frontend_dist = _frontend_root / "dist"

if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
else:
    logger.warning(
        "frontend/dist/ not found — run `npm install && npm run build` in frontend/, "
        "or use `npm run dev` for live reload (proxies /api to this server)."
    )
