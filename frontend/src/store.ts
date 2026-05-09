import { useSyncExternalStore } from 'react';
import type {
  Finding,
  FileTreeEntry,
  HistoryEntry,
  RepoInfo,
  RunPhase,
  RunRecord,
  RunState,
  StartScanArgs,
  SweepFile,
  SystemStatus,
  TraceEntry,
} from './types';

const EMPTY_REPO: RepoInfo = {
  url: '',
  name: '',
  owner: '',
  branch: '',
  commit: '',
  language: '',
  files: 0,
  loc: 0,
  size: '',
};

const EMPTY_SYSTEM: SystemStatus = {
  gpu: {},
  endpoint: {},
  budget: { spent: 0, total: 100 },
};

interface Snapshot {
  repo: RepoInfo;
  filetree: FileTreeEntry[];
  sweep: SweepFile[];
  findings: Finding[];
  history: HistoryEntry[];
  system: SystemStatus;
  trace: TraceEntry[];
  activeRunId: string | null;
  runStatus: RunRecord['status'] | 'idle';
  runStartedAtMs: number | null;
  latestEventT: number;
  runError: string | null;
  loaded: boolean;
}

const initialSnapshot: Snapshot = {
  repo: EMPTY_REPO,
  filetree: [],
  sweep: [],
  findings: [],
  history: [],
  system: EMPTY_SYSTEM,
  trace: [],
  activeRunId: null,
  runStatus: 'idle',
  runStartedAtMs: null,
  latestEventT: 0,
  runError: null,
  loaded: false,
};

let snap: Snapshot = initialSnapshot;
const listeners = new Set<() => void>();

function commit(next: Partial<Snapshot>): void {
  snap = { ...snap, ...next };
  for (const fn of listeners) fn();
}

function getSnapshot(): Snapshot {
  return snap;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function safeJson<T>(p: Promise<Response>): Promise<T | null> {
  try {
    const r = await p;
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function prefetchAll(): Promise<void> {
  const [repo, filetree, sweep, findings, history, system, trace] = await Promise.all([
    safeJson<RepoInfo>(fetch('/api/repo')),
    safeJson<FileTreeEntry[]>(fetch('/api/filetree')),
    safeJson<SweepFile[]>(fetch('/api/sweep')),
    safeJson<Finding[]>(fetch('/api/findings')),
    safeJson<HistoryEntry[]>(fetch('/api/history')),
    safeJson<SystemStatus>(fetch('/api/system')),
    safeJson<TraceEntry[]>(fetch('/api/trace')),
  ]);
  const traceArr = trace ?? [];
  const lastT = traceArr.length ? Math.max(...traceArr.map((e) => e.t || 0)) : 0;
  commit({
    repo: repo ?? snap.repo,
    filetree: filetree ?? [],
    sweep: sweep ?? [],
    findings: findings ?? [],
    history: history ?? [],
    system: system ?? snap.system,
    trace: traceArr,
    latestEventT: lastT,
    loaded: true,
  });
}

export const STORE_LOADED: Promise<void> = prefetchAll();

let activeSse: EventSource | null = null;

function closeSse(): void {
  if (activeSse) {
    activeSse.close();
    activeSse = null;
  }
}

async function refreshAfterRun(runId: string): Promise<void> {
  try {
    const [findings, history, sweep, repo, filetree] = await Promise.all([
      fetch(`/api/runs/${runId}/findings`).then((r) => r.json() as Promise<Finding[]>).catch(() => null),
      fetch('/api/history').then((r) => r.json() as Promise<HistoryEntry[]>).catch(() => null),
      fetch('/api/sweep').then((r) => r.json() as Promise<SweepFile[]>).catch(() => null),
      fetch('/api/repo').then((r) => r.json() as Promise<RepoInfo>).catch(() => null),
      fetch('/api/filetree').then((r) => r.json() as Promise<FileTreeEntry[]>).catch(() => null),
    ]);
    commit({
      findings: findings ?? snap.findings,
      history: history ?? snap.history,
      sweep: sweep ?? snap.sweep,
      repo: repo ?? snap.repo,
      filetree: filetree ?? snap.filetree,
      runStatus: 'done',
    });
  } catch (err) {
    console.warn('Failed to refresh after run:', err);
  }
}

function openSse(runId: string): void {
  closeSse();
  const src = new EventSource(`/api/runs/${runId}/events`);
  activeSse = src;

  src.onmessage = (e) => {
    try {
      const event: TraceEntry = JSON.parse(e.data);
      if (event.kind === 'eof') {
        closeSse();
        void refreshAfterRun(runId);
        return;
      }
      const t = event.t || 0;
      commit({
        trace: [...snap.trace, event],
        latestEventT: Math.max(snap.latestEventT, t),
      });
    } catch {
      // skip malformed event
    }
  };

  src.onerror = () => {
    closeSse();
  };
}

export async function startScan(args: StartScanArgs): Promise<void> {
  const target = args.target?.trim();
  if (!target) throw new Error('target is required');

  // Reset run state for a fresh scan
  commit({
    trace: [],
    findings: [],
    sweep: [],
    filetree: [],
    activeRunId: null,
    runStatus: 'queued',
    runStartedAtMs: Date.now(),
    latestEventT: 0,
    runError: null,
  });

  let resp: Response;
  try {
    resp = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target,
        max_cycles: args.maxCycles ?? 3,
        dry_run: args.dryRun ?? false,
        backup: args.backup ?? false,
        concurrency: args.concurrency ?? 3,
        max_files: args.maxFiles ?? 100,
        enable_semgrep: args.enableSemgrep ?? false,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    commit({ runStatus: 'error', runError: msg });
    throw err;
  }

  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({ detail: resp.statusText }))) as { detail?: string };
    const msg = err.detail || `Server error ${resp.status}`;
    commit({ runStatus: 'error', runError: msg });
    throw new Error(msg);
  }

  const run = (await resp.json()) as RunRecord;
  commit({ activeRunId: run.run_id, runStatus: 'running' });
  openSse(run.run_id);
}

export async function cancelScan(): Promise<void> {
  const id = snap.activeRunId;
  closeSse();
  commit({ runStatus: 'cancelled' });
  if (id) {
    await fetch(`/api/runs/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

// ── React hooks ──────────────────────────────────────────────────────────
// Returning the whole snapshot keeps useSyncExternalStore's reference
// equality check happy — `snap` is a fresh object only when a commit happened.

const getSnap = (): Snapshot => snap;

export function useSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, getSnap);
}

export function useRepo(): RepoInfo {
  return useSnapshot().repo;
}
export function useFileTree(): FileTreeEntry[] {
  return useSnapshot().filetree;
}
export function useSweepFiles(): SweepFile[] {
  return useSnapshot().sweep;
}
export function useFindings(): Finding[] {
  return useSnapshot().findings;
}
export function useHistory(): HistoryEntry[] {
  return useSnapshot().history;
}
export function useSystem(): SystemStatus {
  return useSnapshot().system;
}
export function useTrace(): TraceEntry[] {
  return useSnapshot().trace;
}
export function useRunError(): string | null {
  return useSnapshot().runError;
}
export function useRunStatus(): Snapshot['runStatus'] {
  return useSnapshot().runStatus;
}

function derivePhase(s: Snapshot): RunPhase {
  if (s.runStatus === 'done' || s.runStatus === 'error') return 'done';
  if (s.runStatus === 'idle' || s.runStatus === 'queued') {
    return s.trace.length > 0 ? 'scanning' : 'idle';
  }
  const last = s.trace[s.trace.length - 1];
  if (!last) return 'scanning';
  if (last.agent === 'red') {
    return last.kind === 'verify' ? 'verifying' : 'redteam';
  }
  if (last.agent === 'blue') return 'blueteam';
  return 'scanning';
}

export function useRunState(fallbackRunId: string): RunState {
  const s = useSnapshot();
  return useMemoizedRunState(s, fallbackRunId);
}

// Tiny stable-identity memo so callers don't get a fresh RunState every render
let _lastRunStateInputs: { snap: Snapshot | null; fallback: string | null } = {
  snap: null,
  fallback: null,
};
let _lastRunStateOutput: RunState | null = null;

function useMemoizedRunState(s: Snapshot, fallbackRunId: string): RunState {
  if (
    _lastRunStateOutput &&
    _lastRunStateInputs.snap === s &&
    _lastRunStateInputs.fallback === fallbackRunId
  ) {
    return _lastRunStateOutput;
  }
  const out: RunState = {
    t: s.latestEventT,
    phase: derivePhase(s),
    playing: s.runStatus === 'running',
    id: s.activeRunId ?? fallbackRunId,
  };
  _lastRunStateInputs = { snap: s, fallback: fallbackRunId };
  _lastRunStateOutput = out;
  return out;
}
