import { useState } from 'react';
import { useHistory } from '../store';
import type { HistoryEntry } from '../types';

const STATUS_META: Record<HistoryEntry['status'], { color: string; bg: string; border: string; label: string }> = {
  resolved: { color: 'var(--ok)', bg: 'var(--ok-bg)', border: 'rgba(126,231,135,.25)', label: 'RESOLVED' },
  partial: { color: 'var(--warn)', bg: 'rgba(241,196,83,.08)', border: 'rgba(241,196,83,.25)', label: 'PARTIAL' },
  clean: { color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-line)', label: 'CLEAN' },
  failed: { color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-line)', label: 'FAILED' },
};

type FilterValue = HistoryEntry['status'] | 'all';

const FILTERS: FilterValue[] = ['all', 'resolved', 'partial', 'clean', 'failed'];

function HistoryRow({ run, active }: { run: HistoryEntry; active: boolean }) {
  const m = STATUS_META[run.status] ?? STATUS_META.clean;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 100px 80px 60px 60px 80px 80px',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: active ? 'var(--bg-3)' : 'transparent',
        borderBottom: '1px solid var(--line-soft)',
        transition: 'background .12s',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-2)';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          className={`dot ${run.status === 'resolved' || run.status === 'clean' ? 'ok' : ''}`}
          style={{ background: m.color, flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {run.repo}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 1 }}>
            {run.id}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-dim)', textAlign: 'right' }}>{run.when}</div>
      <div>
        <span
          className="mono"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '.06em',
            background: m.bg,
            border: `1px solid ${m.border}`,
            color: m.color,
          }}
        >
          {m.label}
        </span>
      </div>
      <div
        className="mono"
        style={{
          fontSize: 12,
          textAlign: 'right',
          color: run.findings > 0 ? 'var(--red-soft)' : 'var(--fg-dim)',
        }}
      >
        {run.findings > 0 ? run.findings : '—'}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 12,
          textAlign: 'right',
          color: run.fixed > 0 ? 'var(--ok)' : 'var(--fg-dim)',
        }}
      >
        {run.fixed > 0 ? run.fixed : '—'}
      </div>
      <div className="mono" style={{ fontSize: 12, textAlign: 'right', color: 'var(--fg-dim)' }}>
        {run.dur}
      </div>
      <div className="mono" style={{ fontSize: 12, textAlign: 'right', color: 'var(--fg-dim)' }}>
        {run.cost}
      </div>
    </div>
  );
}

export function ScreenHistory() {
  const history = useHistory();
  const [filter, setFilter] = useState<FilterValue>('all');

  const filtered = history.filter((r) => filter === 'all' || r.status === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg-1)',
          flexShrink: 0,
        }}
      >
        {FILTERS.map((f) => {
          const m = f === 'all' ? null : STATUS_META[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                height: 26,
                padding: '0 12px',
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 500,
                background: filter === f ? (m ? m.bg : 'var(--bg-3)') : 'transparent',
                border: `1px solid ${filter === f ? (m ? m.border : 'var(--line)') : 'transparent'}`,
                color: filter === f ? (m ? m.color : 'var(--fg)') : 'var(--fg-dim)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                fontFamily: 'var(--mono)',
              }}
            >
              {f}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          {filtered.length} runs
        </span>
        <button className="btn sm">New audit</button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 80px 60px 60px 80px 80px',
          gap: 12,
          padding: '6px 16px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        {(['Repository', 'When', 'Status', 'Found', 'Fixed', 'Duration', 'Cost'] as const).map((h) => (
          <div
            key={h}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '.08em',
              color: 'var(--fg-faint)',
              textTransform: 'uppercase',
              textAlign: h !== 'Repository' ? 'right' : 'left',
            }}
          >
            {h}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.map((run, i) => (
          <HistoryRow key={run.id} run={run} active={i === 0} />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 0,
          borderTop: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        {(
          [
            ['Total runs', history.length],
            ['Resolved', history.filter((r) => r.status === 'resolved').length],
            ['Findings', history.reduce((a, r) => a + r.findings, 0)],
            ['Patches', history.reduce((a, r) => a + r.fixed, 0)],
            [
              'Spent',
              `$${history
                .reduce((a, r) => a + parseFloat(r.cost.replace('$', '') || '0'), 0)
                .toFixed(2)}`,
            ],
          ] as ReadonlyArray<readonly [string, string | number]>
        ).map(([k, v], i) => (
          <div
            key={k}
            style={{
              padding: '10px 16px',
              borderRight: i < 4 ? '1px solid var(--line)' : 0,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--fg-dim)',
                marginBottom: 3,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
              }}
            >
              {k}
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
