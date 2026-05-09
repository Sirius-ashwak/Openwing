export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Triage = 'true-positive' | 'false-positive' | 'unknown';
export type Agent = 'red' | 'blue' | 'system';
export type RunPhase = 'idle' | 'scanning' | 'redteam' | 'handoff' | 'blueteam' | 'verifying' | 'done';
export type Scenario = 'happy' | 'limit' | 'crash';
export type Density = 'compact' | 'regular' | 'comfy';
export type AccentIntensity = 'low' | 'medium' | 'high';

export interface RepoInfo {
  url: string;
  name: string;
  owner: string;
  branch: string;
  commit: string;
  language: string;
  files: number;
  loc: number;
  size: string;
}

export interface FileTreeEntry {
  path: string;
  loc: number;
  status: 'critical' | 'flagged' | 'clean';
  vulnerability_type?: string;
}

export interface SweepFile {
  path: string;
  loc: number;
  time: number;
  state: 'critical' | 'fp' | 'clean';
  findings: number;
}

export interface Finding {
  id: string;
  run_id?: string;
  title: string;
  file: string;
  line: number;
  cwe: string;
  cvss: number;
  severity: Severity;
  description: string;
  impact: string[];
  vulnCode: string;
  patchedCode: string;
  snippet?: string;
  payload?: string;
  poc?: string | null;
  triage?: Triage;
  vulnerability_type?: string;
  patched?: boolean;
  patch_cycles?: number;
  static_warnings?: string[];
  dry_run?: boolean;
  discoveredAt: number;
  patchedAt?: number | null;
  verifiedAt?: number | null;
}

export interface HistoryEntry {
  id: string;
  repo: string;
  when: string;
  status: 'resolved' | 'partial' | 'clean' | 'failed';
  findings: number;
  fixed: number;
  dur: string;
  cost: string;
}

export interface SystemStatus {
  gpu: {
    name?: string;
    count?: number;
    vram_gb?: number;
    util?: number;
    mem?: string;
    temp?: number;
    vcpu?: number;
    ram_gb?: number;
  };
  endpoint: {
    url?: string;
    model?: string;
    provider?: string;
    tok_s?: number;
    ctx?: string;
  };
  budget: {
    spent: number;
    total: number;
  };
}

export interface TraceEntry {
  t: number;
  agent: Agent;
  kind?:
    | 'code'
    | 'shell'
    | 'output'
    | 'thought'
    | 'finding'
    | 'patch'
    | 'verify'
    | 'eof'
    | 'error'
    | 'ok'
    | 'warn'
    | 'log';
  line?: string;
  file?: string;
  cwe?: string;
  snippet?: string;
  payload?: string;
  original_source?: string;
  patched_source?: string;
  summary?: unknown;
}

export interface RunSummary {
  files_scanned: number;
  files_patched: number;
  findings_count: number;
  patch_cycles_total: number;
}

export interface RunRecord {
  run_id: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  target: string;
  mode?: 'repo' | 'dir' | 'file';
  files_scanned?: number;
  files_patched?: number;
  patch_cycles_total?: number;
  result?: RunSummary;
  error?: string | null;
  started_at?: number;
  finished_at?: number;
}

export interface RunState {
  t: number;
  phase: RunPhase;
  playing: boolean;
  id: string;
}

export interface Tweaks {
  speed: number;
  density: Density;
  scenario: Scenario;
  accentIntensity: AccentIntensity;
  showCmdPalette: boolean;
}

export interface StartScanArgs {
  target: string;
  maxCycles?: number;
  dryRun?: boolean;
  backup?: boolean;
  concurrency?: number;
  maxFiles?: number;
  enableSemgrep?: boolean;
}
