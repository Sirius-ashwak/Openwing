// Verification loop timeline — multi-finding + failure-aware

function ScreenVerify({ runState, scenario, onExportSARIF }) {
  const t = runState.t;
  const isCrash = scenario === 'crash';
  const isLimit = scenario === 'limit';
  const isHappy = scenario === 'happy';

  const phases = [
    {
      key: 'red1', label: 'Attack — Turn 1', agent: 'red',
      color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-line)', icon: '⚔',
      time: '0 – 7.7s',
      status: isCrash && t > 5500 ? 'failed' : t > 7900 ? 'done' : t > 1100 ? 'running' : 'waiting',
      result: isCrash && t > 5500 ? 'FAILED: malformed JSON · scheduler retrying' :
              t > 7900 ? 'CONFIRMED: 2 critical (JNS-001, JNS-002) + 1 false-positive (JNS-003)' : null,
      detail: [
        'Ingested 47 files · 2,814 LOC · 11.4s wall',
        'Traced request.args → SQL string in users.py:14',
        'Traced request.args → requests.get() in proxy.py:11',
        'Reviewed config.py default-true → false-positive',
      ],
    },
    {
      key: 'blue1', label: 'Patch — Turn 1', agent: 'blue',
      color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-line)', icon: '🛡',
      time: '8.4 – 12.6s',
      status: isCrash ? 'waiting' : t > 12550 ? 'done' : t > 8400 ? 'running' : 'waiting',
      result: isCrash ? null : t > 12550 ? 'PATCHED: 2 patches applied · 14 tests pass' : null,
      detail: [
        'JNS-001 → parameterized query + length guard',
        'JNS-002 → scheme allow-list + IP block + no redirects',
        'Ran tests/test_users.py · 8 passed',
        'Ran tests/test_proxy.py · 6 passed',
      ],
    },
    {
      key: 'red2', label: 'Verify — Turn 2', agent: 'red',
      color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-line)', icon: '⚔',
      time: '12.8 – 15.5s',
      status: isCrash || isLimit ? 'waiting' : t > 15200 ? 'done' : t > 13000 ? 'running' : 'waiting',
      result: isLimit ? null : t > 15200 ? 'RESOLVED: both patches hold · 4 bypass attempts blocked' : null,
      detail: [
        'Re-ran SQLi PoC → 0 rows extracted',
        'LIKE-encoded bypass → 0 rows',
        'Re-ran SSRF PoC → HTTP 400',
        'DNS-rebinding bypass → HTTP 400',
      ],
    },
    isLimit && {
      key: 'blue2', label: 'Patch — Turn 2 · retry', agent: 'blue',
      color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-line)', icon: '🛡',
      time: '12.8 – ?',
      status: t > 13000 ? 'running' : 'waiting',
      result: null,
      detail: [
        'Bypass observed in last verify step',
        'Tightening parameter handling …',
        'Will retry up to 3 cycles total',
      ],
    },
  ].filter(Boolean);

  const done = isHappy && t > 15500;
  const failed = isCrash && t > 5500;

  return (
    <div style={{ overflow: 'auto', padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {done && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
          background: 'var(--ok-bg)', border: '1px solid rgba(126,231,135,.25)', borderRadius: 8,
        }}>
          <span style={{ fontSize: 28 }}>✓</span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ok)', fontSize: 15 }}>Audit complete — all critical findings resolved</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 3 }}>
              2 critical · 1 info (FP) · 2 patches · 1 verify loop · 15.5s · $0.0214
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onExportSARIF} style={{ borderColor: 'rgba(126,231,135,.3)', color: 'var(--ok)' }}>
            <span>Export SARIF</span>
          </button>
        </div>
      )}

      {failed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
          background: 'var(--red-bg)', border: '1px solid var(--red-line)', borderRadius: 8,
        }}>
          <span style={{ fontSize: 24, color: 'var(--red)' }}>⚠</span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 15 }}>Run failed — Janus_Red emitted invalid JSON</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 3 }}>
              Scheduler will retry with structured-output mode. Retry budget 0 / 3.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn">Retry now</button>
        </div>
      )}

      {isLimit && t > 13000 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
          background: 'rgba(241,196,83,.08)', border: '1px solid rgba(241,196,83,.25)', borderRadius: 8,
        }}>
          <span style={{ fontSize: 24, color: 'var(--warn)' }}>↻</span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--warn)', fontSize: 15 }}>Patch bounced — entering cycle 2 of 3</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 3 }}>
              JNS-001 patch allowed a payload-encoded LIKE wildcard bypass. Janus_Blue retrying with stricter handling.
            </div>
          </div>
        </div>
      )}

      <Section label="Verification loop" right={
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          {phases.filter((p) => p.status === 'done').length} / {phases.length} turns complete
        </span>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {phases.map((phase, idx) => (
            <div key={phase.key}>
              {idx > 0 && (
                <div style={{
                  width: 2, height: 20, marginLeft: 20,
                  background: phases[idx - 1].status === 'done' ? 'var(--line)' : 'var(--line-soft)',
                }} />
              )}
              <div style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                padding: '14px', borderRadius: 8,
                background: phase.status === 'running' ? phase.bg : phase.status === 'failed' ? 'var(--red-bg)' : 'var(--bg-2)',
                border: `1px solid ${phase.status === 'running' ? phase.border : phase.status === 'failed' ? 'var(--red-line)' : 'var(--line)'}`,
                opacity: phase.status === 'waiting' ? .45 : 1,
                transition: 'all .4s',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                  background: phase.status !== 'waiting' ? phase.bg : 'var(--bg-3)',
                  border: `1px solid ${phase.status !== 'waiting' ? phase.border : 'var(--line)'}`,
                  display: 'grid', placeItems: 'center', fontSize: 18, position: 'relative',
                }}>
                  {phase.status === 'done' ? <span style={{ color: phase.color }}>✓</span>
                    : phase.status === 'failed' ? <span style={{ color: 'var(--red)' }}>⚠</span>
                    : phase.status === 'running' ? <><span>{phase.icon}</span><span className={`dot ${phase.agent}`} style={{ position: 'absolute', top: -3, right: -3 }} /></>
                    : <span style={{ opacity: .4 }}>{phase.icon}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: phase.status !== 'waiting' ? 'var(--fg)' : 'var(--fg-dim)' }}>{phase.label}</span>
                    <span className={`pill ${phase.agent === 'red' ? 'red' : 'blue'}`} style={{ height: 18 }}>
                      {phase.agent === 'red' ? 'Janus_Red' : 'Janus_Blue'}
                    </span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{phase.time}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8 }}>
                    {phase.detail.map((d, i) => (
                      <div key={i} className="mono" style={{
                        fontSize: 11.5, color: 'var(--fg-dim)',
                        opacity: phase.status === 'done' ? 1 : phase.status === 'running' && i === 0 ? 1 : .4,
                      }}>
                        {phase.status === 'done' ? '✓' : phase.status === 'failed' ? '✗' : '·'} {d}
                      </div>
                    ))}
                  </div>
                  {phase.result && (
                    <div style={{
                      marginTop: 10, padding: '6px 10px', borderRadius: 5,
                      background: phase.status === 'failed' ? 'var(--red-bg)' :
                        (phase.agent === 'red' && phase.key === 'red2' ? 'var(--ok-bg)' : phase.bg),
                      border: `1px solid ${phase.status === 'failed' ? 'var(--red-line)' :
                        (phase.agent === 'red' && phase.key === 'red2' ? 'rgba(126,231,135,.25)' : phase.border)}`,
                    }}>
                      <span className="mono" style={{
                        fontSize: 11.5,
                        color: phase.status === 'failed' ? 'var(--red)' :
                          (phase.agent === 'red' && phase.key === 'red2' ? 'var(--ok)' : phase.color),
                      }}>{phase.result}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {done && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[['Duration', '15.5s'], ['Findings', '2 crit · 1 info'], ['Patches', '2 / 2 ✓'], ['Cost', '$0.0214']].map(([k, v]) => (
            <div key={k} style={{ padding: '12px 14px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 3 }}>{k}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ScreenVerify });
