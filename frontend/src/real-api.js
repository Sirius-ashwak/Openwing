// ── real-api.js ───────────────────────────────────────────────────────────
// Implementation of the API contract using fetch() to talk to the FastAPI backend.
// Replaces mock-api.js.
// ──────────────────────────────────────────────────────────────────────────

const API = {};

let cache = {};

// We cache the fetched data globally for the synchronous UI, fetching initially.
// For a true React app we'd use React Query or useEffect, but this keeps the
// transition simple since the React components expect synchronous returns.

async function prefetchAll() {
  const [repo, filetree, sweep, findings, history, system, trace] = await Promise.all([
    fetch('/api/repo').then(r => r.json()),
    fetch('/api/filetree').then(r => r.json()),
    fetch('/api/sweep').then(r => r.json()),
    fetch('/api/findings').then(r => r.json()),
    fetch('/api/history').then(r => r.json()),
    fetch('/api/system').then(r => r.json()),
    fetch('/api/trace').then(r => r.json())
  ]);

  cache = { repo, filetree, sweep, findings, history, system, trace };
  // Trigger a re-render by dispatching an event if needed, but for now we'll 
  // assume it loads fast enough or we render after prefetch.
}

API.getRepo = () => cache.repo || {};
API.getFileTree = () => cache.filetree || [];
API.getSweepFiles = () => cache.sweep || [];
API.getFindings = () => cache.findings || [];
API.getTrace = () => cache.trace || [];
API.getHistory = () => cache.history || [];
API.getSystemStatus = () => cache.system || { gpu: {}, endpoint: {}, budget: { spent: 0, total: 0 } };

// ── SARIF export ───────────────────────────────────────────────────────

API.buildSARIF = (findings, repo) => {
  const results = findings.filter((f) => f.triage !== 'false-positive').map((f) => ({
    ruleId: f.cwe,
    level: f.severity === 'critical' ? 'error' : f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warning' : 'note',
    message: { text: f.title },
    locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }],
    properties: { cvss: f.cvss, vector: f.vector, openwingId: f.id },
  }));
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'Openwing Janus', version: '0.4.1-rc',
          informationUri: 'https://github.com/openwing-labs/janus',
          rules: findings.map((f) => ({
            id: f.cwe, name: f.title,
            shortDescription: { text: f.title },
            fullDescription: { text: f.description },
            defaultConfiguration: { level: f.severity === 'critical' ? 'error' : 'warning' },
          })),
        },
      },
      results,
      properties: { repository: `${repo.owner}/${repo.name}`, commit: repo.commit, scannedAt: new Date().toISOString() },
    }],
  };
};

API.downloadJSON = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
};

// ── Expose globally (Babel-in-browser, no module bundler) ──────────────
Object.assign(window, { API });

// Kick off prefetch and wait before rendering the React app
window.API_LOADED = prefetchAll();
