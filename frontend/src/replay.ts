import type {
  Finding,
  FileTreeEntry,
  RepoInfo,
  SweepFile,
  SystemStatus,
  TraceEntry,
} from './types';

export interface ReplayPayload {
  repo: RepoInfo;
  filetree: FileTreeEntry[];
  sweep: SweepFile[];
  findings: Finding[];
  trace: TraceEntry[];
  system: SystemStatus;
}

const REPLAY_SYSTEM: SystemStatus = {
  gpu: {
    name: 'AMD Instinct MI300X',
    count: 1,
    vram_gb: 192,
    util: 78,
    mem: '142.3 / 192 GB',
    temp: 64,
    vcpu: 20,
    ram_gb: 240,
  },
  endpoint: {
    url: 'http://amd-vllm.internal:5000/v1',
    model: 'Qwen/Qwen2.5-72B-Instruct',
    provider: 'amd-vllm',
    tok_s: 312,
    ctx: '32k',
  },
  budget: { spent: 1.24, total: 100 },
};

const VULN_USERS_BEFORE = `@app.route('/api/users/<int:user_id>')
def get_user(user_id):
    user_id = request.args.get('id', user_id)
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE id=" + str(user_id))
    return jsonify(cursor.fetchone())`;

const VULN_USERS_AFTER = `@app.route('/api/users/<int:user_id>')
def get_user(user_id):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE id=%s", (user_id,))
    return jsonify(cursor.fetchone())`;

const VULN_FETCHER_BEFORE = `@app.route('/fetch', methods=['POST'])
def fetch_url():
    url = request.json.get('url')
    resp = requests.get(url, timeout=10)
    return resp.text`;

const VULN_FETCHER_AFTER = `from urllib.parse import urlparse
import ipaddress

ALLOWED_SCHEMES = ('http', 'https')

@app.route('/fetch', methods=['POST'])
def fetch_url():
    url = request.json.get('url') or ''
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        abort(400, 'scheme not allowed')
    try:
        ip = ipaddress.ip_address(parsed.hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            abort(400, 'host not allowed')
    except ValueError:
        pass
    resp = requests.get(url, timeout=10, allow_redirects=False)
    return resp.text`;

// Recorded events from a Flask vuln-app scan. Timestamps in ms; the runner
// pumps them through the same throttle the live SSE path uses.
const RECORDED_TRACE: TraceEntry[] = [
  { t: 0, agent: 'system', kind: 'log', line: 'Cloning repository: github.com/openwing-labs/vuln-flask-app' },
  { t: 600, agent: 'system', kind: 'log', line: 'Clone complete → /tmp/janus_demo_a3f1' },
  { t: 900, agent: 'system', kind: 'log', line: 'Discovering Python files in vuln-flask-app/…' },
  { t: 1200, agent: 'system', kind: 'log', line: 'Found 5 Python file(s) to scan.' },
  { t: 1500, agent: 'system', kind: 'log', line: '→ Scanning users.py', file: 'users.py' },
  { t: 1800, agent: 'red', kind: 'thought', line: 'Walking request handlers · users.py · 142 lines', file: 'users.py' },
  { t: 2200, agent: 'red', kind: 'code', line: "user_id = request.args.get('id', user_id)", file: 'users.py' },
  { t: 2500, agent: 'red', kind: 'code', line: "cursor.execute(\"SELECT * FROM users WHERE id=\" + str(user_id))", file: 'users.py' },
  {
    t: 2900,
    agent: 'red',
    kind: 'finding',
    file: 'users.py',
    cwe: 'sql_injection',
    snippet: 'cursor.execute("SELECT * FROM users WHERE id=" + str(user_id))',
    payload: "1 OR 1=1 --",
    line: "vuln: CWE-89 SQL injection · severity CRITICAL",
  },
  { t: 3200, agent: 'system', kind: 'log', line: '→ Scanning auth.py', file: 'auth.py' },
  { t: 3500, agent: 'red', kind: 'thought', line: 'auth.py · 88 lines · 4 routes', file: 'auth.py' },
  { t: 3900, agent: 'red', kind: 'code', line: 'token comparison uses == (no constant-time)', file: 'auth.py' },
  { t: 4200, agent: 'system', kind: 'log', line: '  auth.py: clean (cycles=0)', file: 'auth.py' },
  { t: 4500, agent: 'system', kind: 'log', line: '→ Scanning fetcher.py', file: 'fetcher.py' },
  { t: 4800, agent: 'red', kind: 'thought', line: 'fetcher.py · 67 lines', file: 'fetcher.py' },
  { t: 5100, agent: 'red', kind: 'code', line: "url = request.json.get('url'); requests.get(url)", file: 'fetcher.py' },
  {
    t: 5500,
    agent: 'red',
    kind: 'finding',
    file: 'fetcher.py',
    cwe: 'ssrf',
    snippet: "resp = requests.get(url, timeout=10)",
    payload: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    line: 'vuln: CWE-918 SSRF · severity CRITICAL',
  },
  { t: 5900, agent: 'blue', kind: 'thought', line: 'Reading context · users.py · generating patch', file: 'users.py' },
  {
    t: 6500,
    agent: 'blue',
    kind: 'patch',
    file: 'users.py',
    original_source: VULN_USERS_BEFORE,
    patched_source: VULN_USERS_AFTER,
    line: 'parameterized query · removed string concat',
  },
  { t: 6900, agent: 'system', kind: 'log', line: 'compile_check users.py · pass · written to disk', file: 'users.py' },
  { t: 7300, agent: 'blue', kind: 'thought', line: 'Reading context · fetcher.py · generating patch', file: 'fetcher.py' },
  {
    t: 8000,
    agent: 'blue',
    kind: 'patch',
    file: 'fetcher.py',
    original_source: VULN_FETCHER_BEFORE,
    patched_source: VULN_FETCHER_AFTER,
    line: 'scheme allow-list + private-IP block',
  },
  { t: 8400, agent: 'system', kind: 'log', line: 'compile_check fetcher.py · pass · written to disk', file: 'fetcher.py' },
  { t: 8800, agent: 'red', kind: 'verify', file: 'users.py', line: 're-running janus_red on patched users.py · no exploits found' },
  { t: 9200, agent: 'red', kind: 'verify', file: 'fetcher.py', line: 're-running janus_red on patched fetcher.py · no exploits found' },
  { t: 9500, agent: 'system', kind: 'log', line: '  users.py: patched (cycles=1)', file: 'users.py' },
  { t: 9700, agent: 'system', kind: 'log', line: '  fetcher.py: patched (cycles=1)', file: 'fetcher.py' },
  { t: 9900, agent: 'system', kind: 'log', line: '→ Scanning utils.py', file: 'utils.py' },
  { t: 10100, agent: 'system', kind: 'log', line: '  utils.py: clean (cycles=0)', file: 'utils.py' },
  { t: 10300, agent: 'system', kind: 'log', line: '→ Scanning app.py', file: 'app.py' },
  { t: 10500, agent: 'system', kind: 'log', line: '  app.py: clean (cycles=0)', file: 'app.py' },
  {
    t: 10800,
    agent: 'system',
    kind: 'ok',
    line: '✓ Scan complete — 2 finding(s), 2/5 files patched.',
    summary: { files_scanned: 5, files_patched: 2, findings_count: 2, patch_cycles_total: 2 },
  },
];

const RECORDED_FILETREE: FileTreeEntry[] = [
  { path: 'app.py', loc: 54, status: 'clean' },
  { path: 'auth.py', loc: 88, status: 'clean' },
  { path: 'fetcher.py', loc: 67, status: 'critical', vulnerability_type: 'ssrf' },
  { path: 'users.py', loc: 142, status: 'critical', vulnerability_type: 'sql_injection' },
  { path: 'utils.py', loc: 36, status: 'clean' },
];

const RECORDED_SWEEP: SweepFile[] = [
  { path: 'users.py', loc: 142, time: 2900, state: 'critical', findings: 1 },
  { path: 'auth.py', loc: 88, time: 4200, state: 'clean', findings: 0 },
  { path: 'fetcher.py', loc: 67, time: 5500, state: 'critical', findings: 1 },
  { path: 'utils.py', loc: 36, time: 10100, state: 'clean', findings: 0 },
  { path: 'app.py', loc: 54, time: 10500, state: 'clean', findings: 0 },
];

function buildFindings(runId: string): Finding[] {
  return [
    {
      id: 'JNS-001',
      run_id: runId,
      file: 'users.py',
      line: 5,
      title: 'SQL Injection in users.py',
      vulnerability_type: 'sql_injection',
      cwe: 'CWE-89',
      severity: 'critical',
      cvss: 9.1,
      description:
        'SQL Injection confirmed by Janus_Red. Trigger snippet: cursor.execute("SELECT * FROM users WHERE id=" + str(user_id))',
      impact: [
        'Attacker can read or modify any row in the database via crafted input.',
        'Authentication can be bypassed by injecting OR clauses.',
        'Confidentiality and integrity of all stored data are at risk.',
      ],
      vulnCode: VULN_USERS_BEFORE,
      patchedCode: VULN_USERS_AFTER,
      snippet: 'cursor.execute("SELECT * FROM users WHERE id=" + str(user_id))',
      payload: "1 OR 1=1 --",
      poc: "1 OR 1=1 --",
      triage: 'true-positive',
      patched: true,
      patch_cycles: 1,
      static_warnings: [],
      dry_run: false,
      discoveredAt: 2900,
      patchedAt: 6500,
      verifiedAt: 8800,
    },
    {
      id: 'JNS-002',
      run_id: runId,
      file: 'fetcher.py',
      line: 4,
      title: 'Server-Side Request Forgery in fetcher.py',
      vulnerability_type: 'ssrf',
      cwe: 'CWE-918',
      severity: 'critical',
      cvss: 9.0,
      description:
        'Server-Side Request Forgery confirmed by Janus_Red. Trigger snippet: resp = requests.get(url, timeout=10)',
      impact: [
        'Server can be coerced into requesting internal endpoints (cloud metadata, RFC1918).',
        'Credentials in IMDS are exfiltrable on most cloud providers.',
      ],
      vulnCode: VULN_FETCHER_BEFORE,
      patchedCode: VULN_FETCHER_AFTER,
      snippet: 'resp = requests.get(url, timeout=10)',
      payload: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      poc: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      triage: 'true-positive',
      patched: true,
      patch_cycles: 1,
      static_warnings: [],
      dry_run: false,
      discoveredAt: 5500,
      patchedAt: 8000,
      verifiedAt: 9200,
    },
  ];
}

function deriveRepoFromTarget(target: string): RepoInfo {
  const stripped = target.replace(/^https?:\/\//, '').replace(/\.git$/, '');
  const parts = stripped.split('/').filter(Boolean);
  // github.com/owner/repo or owner/repo
  const ownerRepo = parts[0] === 'github.com' ? parts.slice(1, 3) : parts.slice(0, 2);
  const owner = ownerRepo[0] || 'openwing-labs';
  const name = ownerRepo[1] || 'vuln-flask-app';
  return {
    url: `github.com/${owner}/${name}`,
    name,
    owner,
    branch: 'main',
    commit: '7a3f1c9',
    language: 'Python',
    files: 5,
    loc: 387,
    size: '24 KB',
  };
}

export function buildReplayPayload(target: string, runId: string): ReplayPayload {
  return {
    repo: deriveRepoFromTarget(target),
    filetree: RECORDED_FILETREE,
    sweep: RECORDED_SWEEP,
    findings: buildFindings(runId),
    trace: RECORDED_TRACE,
    system: REPLAY_SYSTEM,
  };
}

export const RECORDED_DURATION_MS = RECORDED_TRACE[RECORDED_TRACE.length - 1].t;
