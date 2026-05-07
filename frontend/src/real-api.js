// ── real-api.js ───────────────────────────────────────────────────────────
// API layer — talks to the Janus FastAPI backend.
// Sync getters are backed by a prefetched cache (for React components).
// Async methods (startScan, cancelRun, getRun) return Promises.
// ──────────────────────────────────────────────────────────────────────────

const _apiState = {
  cache: {
    repo: {},
    filetree: [],
    sweep: [],
    findings: [],
    history: [],
    system: { gpu: {}, endpoint: {}, budget: { spent: 0, total: 100 } },
    trace: [],
  },
  activeRunId: null,
  sseSource: null,
  traceListeners: [],
  runListeners: [],
};

async function _prefetchAll() {
  const safe = (p) => p.catch(() => null);
  const [repo, filetree, sweep, findings, history, system, trace] = await Promise.all([
    safe(fetch('/api/repo').then(r => r.json())),
    safe(fetch('/api/filetree').then(r => r.json())),
    safe(fetch('/api/sweep').then(r => r.json())),
    safe(fetch('/api/findings').then(r => r.json())),
    safe(fetch('/api/history').then(r => r.json())),
    safe(fetch('/api/system').then(r => r.json())),
    safe(fetch('/api/trace').then(r => r.json())),
  ]);
  const c = _apiState.cache;
  if (repo)     c.repo     = repo;
  if (filetree) c.filetree = filetree;
  if (sweep)    c.sweep    = sweep;
  if (findings) c.findings = findings;
  if (history)  c.history  = history;
  if (system)   c.system   = system;
  if (trace)    c.trace    = trace;
}

function _openSSE(runId) {
  if (_apiState.sseSource) {
    _apiState.sseSource.close();
    _apiState.sseSource = null;
  }

  const src = new EventSource(`/api/runs/${runId}/events`);
  _apiState.sseSource = src;

  src.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      if (event.kind === 'eof') {
        src.close();
        _apiState.sseSource = null;
        _refreshRunData(runId);
        return;
      }
      _apiState.cache.trace.push(event);
      _apiState.traceListeners.forEach(fn => { try { fn(event); } catch (_) {} });
    } catch (_) {}
  };

  src.onerror = () => {
    src.close();
    _apiState.sseSource = null;
  };
}

async function _refreshRunData(runId) {
  try {
    const [run, findings, history] = await Promise.all([
      fetch(`/api/runs/${runId}`).then(r => r.json()),
      fetch(`/api/runs/${runId}/findings`).then(r => r.json()),
      fetch('/api/history').then(r => r.json()),
    ]);
    _apiState.cache.findings = findings;
    _apiState.cache.history  = history;
    _apiState.runListeners.forEach(fn => { try { fn(run); } catch (_) {} });
  } catch (e) {
    console.warn('Failed to refresh run data:', e);
  }
}

const API = {
  // ── Sync cache getters ───────────────────────────────────────────────
  getRepo:         () => _apiState.cache.repo || {},
  getFileTree:     () => _apiState.cache.filetree || [],
  getSweepFiles:   () => _apiState.cache.sweep || [],
  getFindings:     () => _apiState.cache.findings || [],
  getTrace:        () => _apiState.cache.trace || [],
  getHistory:      () => _apiState.cache.history || [],
  getSystemStatus: () => _apiState.cache.system || { gpu: {}, endpoint: {}, budget: { spent: 0, total: 100 } },
  getActiveRunId:  () => _apiState.activeRunId,

  // ── Start a scan ──────────────────────────────────────────────────────
  async startScan({ target, maxCycles = 3, dryRun = false, backup = false,
                    concurrency = 3, maxFiles = 100, enableSemgrep = false }) {
    if (!target || !target.trim()) throw new Error('target is required');

    const resp = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target:         target.trim(),
        max_cycles:     maxCycles,
        dry_run:        dryRun,
        backup,
        concurrency,
        max_files:      maxFiles,
        enable_semgrep: enableSemgrep,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || `Server error ${resp.status}`);
    }

    const run = await resp.json();
    _apiState.activeRunId  = run.run_id;
    _apiState.cache.trace  = [];
    _openSSE(run.run_id);
    return run;
  },

  // ── Cancel a run ─────────────────────────────────────────────────────
  async cancelRun(runId) {
    if (_apiState.sseSource) { _apiState.sseSource.close(); _apiState.sseSource = null; }
    await fetch(`/api/runs/${runId}`, { method: 'DELETE' }).catch(() => {});
  },

  // ── Fetch a single run record ─────────────────────────────────────────
  async getRun(runId) {
    const resp = await fetch(`/api/runs/${runId}`);
    if (!resp.ok) throw new Error(`Run ${runId} not found`);
    return resp.json();
  },

  // ── Subscribe to live events ──────────────────────────────────────────
  onTrace(fn) {
    _apiState.traceListeners.push(fn);
    return () => { _apiState.traceListeners = _apiState.traceListeners.filter(f => f !== fn); };
  },

  onRunComplete(fn) {
    _apiState.runListeners.push(fn);
    return () => { _apiState.runListeners = _apiState.runListeners.filter(f => f !== fn); };
  },

  // ── Health check ──────────────────────────────────────────────────────
  async getHealth() {
    return fetch('/api/health').then(r => r.json()).catch(() => ({ status: 'unknown', providers: [] }));
  },

  // ── SARIF export ──────────────────────────────────────────────────────
  buildSARIF(findings, repo) {
    const results = findings.filter(f => f.triage !== 'false-positive').map(f => ({
      ruleId:    f.vulnerability_type,
      level:     'error',
      message:   { text: f.vulnerability_type },
      locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: 1 } } }],
      properties: { openwingId: f.id },
    }));
    return {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [{
        tool: { driver: { name: 'Openwing Janus', version: '0.5.0' } },
        results,
        properties: { repository: repo.url || '', scannedAt: new Date().toISOString() },
      }],
    };
  },

  downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  },
};

Object.assign(window, { API });

// Prefetch static data before React renders — app.jsx awaits this
window.API_LOADED = _prefetchAll();
