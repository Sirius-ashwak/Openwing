import { Section } from '../components/atoms';
import { useSweepFiles } from '../store';
import type { RunState } from '../types';

interface Props {
  runState: RunState;
}

export function ScreenSweep({ runState }: Props) {
  const sweepFiles = useSweepFiles();
  const t = runState.t;

  return (
    <div
      style={{
        overflow: 'auto',
        padding: 16,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.08em',
            color: 'var(--fg-faint)',
            textTransform: 'uppercase',
          }}
        >
          Multi-file sweep · concurrency 8×
        </div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>
          Janus_Red — parallel triage
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {(
          [
            ['Files queued', sweepFiles.length],
            ['Files done', sweepFiles.filter((f) => t > f.time).length],
            ['Findings', sweepFiles.filter((f) => t > f.time).reduce((a, f) => a + f.findings, 0)],
            ['Throughput', `${(sweepFiles.reduce((a, f) => a + f.loc, 0) / 1000).toFixed(1)}k LOC/s`],
          ] as const
        ).map(([k, v]) => (
          <div
            key={k}
            style={{
              padding: '12px 14px',
              background: 'var(--bg-2)',
              border: '1px solid var(--line)',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 3 }}>{k}</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>
              {v}
            </div>
          </div>
        ))}
      </div>

      <Section label="Worker pool · 8 lanes">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sweepFiles.map((f, i) => {
            const progress = Math.min(1, t / f.time);
            const done = t > f.time;
            const stateColor = !done
              ? 'var(--accent)'
              : f.state === 'critical'
              ? 'var(--red)'
              : f.state === 'fp'
              ? 'var(--fg-dim)'
              : 'var(--ok)';
            const label = !done
              ? 'scanning'
              : f.state === 'critical'
              ? `${f.findings} CRITICAL`
              : f.state === 'fp'
              ? 'FALSE POSITIVE'
              : 'CLEAN';
            return (
              <div
                key={f.path}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr 80px 100px 60px',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 10px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                }}
              >
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>
                  w{(i % 8) + 1}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--fg-mid)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.path}
                </span>
                <div
                  style={{
                    position: 'relative',
                    height: 4,
                    background: 'var(--bg-3)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${progress * 100}%`,
                      background: stateColor,
                      transition: 'width .12s linear',
                    }}
                  />
                </div>
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    color: stateColor,
                    fontWeight: 600,
                    letterSpacing: '.06em',
                    textAlign: 'right',
                  }}
                >
                  {label}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--fg-faint)', textAlign: 'right' }}
                >
                  {f.loc} loc
                </span>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
