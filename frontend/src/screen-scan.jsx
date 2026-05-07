// Scan setup screen — repo input + file tree preview + sweep mode

function ScreenScan({ runState, onStart, scenario, setScenario }) {
  const REPO = API.getRepo();
  const FILE_TREE = API.getFileTree();
  const SYSTEM_STATUS = API.getSystemStatus();
  const [url, setUrl] = React.useState(`https://${REPO.url}`);
  const [scope, setScope] = React.useState(['SQLi', 'SSRF', 'XSS', 'RCE', 'Path traversal']);
  const [model, setModel] = React.useState('Qwen3.5-9B');
  const [maxLoops, setMaxLoops] = React.useState(3);
  const [mode, setMode] = React.useState('repo'); // repo | dir | file
  const [concurrency, setConcurrency] = React.useState(8);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, padding: 16, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--fg-faint)', textTransform: 'uppercase', marginBottom: 4 }}>New audit · step 01</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Set the target.</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--fg-mid)', maxWidth: 560, fontSize: 13.5 }}>
            Point Openwing at any GitHub repository, local directory, or single file. The Red Team agent traces user input through the codebase and tries to break it; the Blue Team agent patches what it finds, then hands back for re-verification.
          </p>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'repo', label: 'GitHub repo', sub: 'remote · clone first' },
            { id: 'dir',  label: 'Directory',   sub: 'local · parallel scan' },
            { id: 'file', label: 'Single file', sub: 'fast triage' },
          ].map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              flex: 1, padding: '10px 14px', textAlign: 'left',
              background: mode === m.id ? 'var(--bg-3)' : 'var(--bg-1)',
              border: `1px solid ${mode === m.id ? 'var(--accent-line)' : 'var(--line)'}`,
              borderRadius: 8, cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, border: `2px solid ${mode === m.id ? 'var(--accent)' : 'var(--fg-faint)'}`, background: mode === m.id ? 'radial-gradient(circle, var(--accent) 30%, transparent 35%)' : 'transparent' }} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{m.label}</span>
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginTop: 4 }}>{m.sub}</div>
            </button>
          ))}
        </div>

        <Section label={mode === 'repo' ? 'Repository' : mode === 'dir' ? 'Local directory' : 'File path'}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              height: 38, padding: '0 12px',
              background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6 }}>
              <span style={{ color: 'var(--fg-dim)' }}>
                {mode === 'repo' ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5C4.4 1.5 1.5 4.4 1.5 8c0 2.9 1.85 5.35 4.4 6.2.32.06.45-.14.45-.31v-1.1c-1.8.4-2.18-.86-2.18-.86-.3-.74-.72-.94-.72-.94-.6-.4.04-.4.04-.4.65.05 1 .67 1 .67.58 1 1.52.7 1.9.54.06-.42.23-.7.41-.86-1.43-.16-2.94-.72-2.94-3.18 0-.7.25-1.28.66-1.73-.07-.16-.29-.81.06-1.7 0 0 .54-.17 1.78.66.5-.14 1.05-.21 1.6-.21.54 0 1.1.07 1.6.21 1.22-.83 1.76-.66 1.76-.66.36.89.13 1.54.07 1.7.4.45.66 1.03.66 1.73 0 2.47-1.5 3.02-2.94 3.18.23.2.44.6.44 1.2v1.78c0 .17.12.38.45.31C12.65 13.34 14.5 10.9 14.5 8c0-3.6-2.9-6.5-6.5-6.5z" fill="currentColor"/></svg>
                ) : <span style={{ fontSize: 13 }}>📁</span>}
              </span>
              <input
                value={url} onChange={(e) => setUrl(e.target.value)}
                className="mono" style={{
                  flex: 1, background: 'transparent', border: 0, outline: 0,
                  color: 'var(--fg)', fontSize: 13,
                }}
              />
              <span className="pill ok" style={{ height: 18 }}>RESOLVED</span>
            </div>
            <button className="btn primary" onClick={onStart} disabled={runState.t > 0 && runState.t < 15500}>
              <span>Start audit</span>
              <span className="kbd" style={{ background: 'rgba(0,0,0,.15)', borderColor: 'rgba(0,0,0,.2)', color: '#0a0a0a', borderBottomWidth: 1 }}>↵</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
            {[
              ['language', REPO.language],
              ['files', REPO.files],
              ['LOC', REPO.loc.toLocaleString()],
              ['size', REPO.size],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</div>
                <div className="mono" style={{ fontSize: 16, color: 'var(--fg)', marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Scope" right={<span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{scope.length} of 8 enabled</span>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['SQLi', 'SSRF', 'XSS', 'RCE', 'Path traversal', 'Auth bypass', 'IDOR', 'Deserialization'].map((s) => {
              const on = scope.includes(s);
              return (
                <button key={s}
                  onClick={() => setScope(on ? scope.filter((x) => x !== s) : [...scope, s])}
                  className="mono"
                  style={{
                    height: 26, padding: '0 10px', borderRadius: 999,
                    background: on ? 'var(--accent-bg)' : 'transparent',
                    border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line)'}`,
                    color: on ? 'var(--accent)' : 'var(--fg-dim)',
                    fontSize: 11, letterSpacing: '.04em', cursor: 'pointer',
                  }}>
                  {on ? '✓ ' : '+ '}{s}
                </button>
              );
            })}
          </div>
        </Section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Section label="Model">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['Qwen3.5-9B', 'Qwen2.5-32B', 'Llama-3.1-8B'].map((m) => (
                <label key={m} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                  background: model === m ? 'var(--bg-3)' : 'var(--bg-2)',
                  border: `1px solid ${model === m ? 'var(--accent-line)' : 'var(--line)'}`,
                  borderRadius: 6, cursor: 'pointer',
                }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: 999,
                    border: `2px solid ${model === m ? 'var(--accent)' : 'var(--fg-faint)'}`,
                    background: model === m ? 'radial-gradient(circle, var(--accent) 30%, transparent 35%)' : 'transparent',
                  }} />
                  <span className="mono" style={{ fontSize: 12, flex: 1 }}>{m}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>
                    {m === 'Qwen3.5-9B' ? '256k ctx' : '128k ctx'}
                  </span>
                  <input type="radio" checked={model === m} onChange={() => setModel(m)} style={{ display: 'none' }} />
                </label>
              ))}
            </div>
          </Section>

          <Section label="Loop & runtime policy">
            <KV k="Max attack/defend cycles" v={
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {[1, 2, 3, 5, 10].map((n) => (
                  <button key={n} onClick={() => setMaxLoops(n)} className="mono" style={{
                    width: 26, height: 22, borderRadius: 4, fontSize: 11,
                    background: n === maxLoops ? 'var(--accent-bg)' : 'transparent',
                    border: `1px solid ${n === maxLoops ? 'var(--accent-line)' : 'var(--line)'}`,
                    color: n === maxLoops ? 'var(--accent)' : 'var(--fg-mid)', cursor: 'pointer',
                  }}>{n}</button>
                ))}
              </span>
            } />
            <KV k="Concurrency" v={
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {[1, 4, 8, 16].map((n) => (
                  <button key={n} onClick={() => setConcurrency(n)} className="mono" style={{
                    width: 30, height: 22, borderRadius: 4, fontSize: 11,
                    background: n === concurrency ? 'var(--accent-bg)' : 'transparent',
                    border: `1px solid ${n === concurrency ? 'var(--accent-line)' : 'var(--line)'}`,
                    color: n === concurrency ? 'var(--accent)' : 'var(--fg-mid)', cursor: 'pointer',
                  }}>{n}×</button>
                ))}
              </span>
            } />
            <KV k="Sandbox runtime" v={<span className="mono" style={{ fontSize: 11 }}>Docker · python:3.11-slim</span>} />
            <KV k="Network egress" v={<span className="pill warn" style={{ height: 18 }}>SANDBOXED</span>} />
            <KV k="Auto-create PR" v={<span className="pill" style={{ height: 18 }}>OFF</span>} />
          </Section>
        </div>

        <Section label="Demo scenario" right={
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>switch this to preview different agent paths</span>
        }>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { id: 'happy', label: 'Happy path', sub: '2 findings, both patched, verified.', dot: 'var(--ok)' },
              { id: 'limit', label: 'Max loops hit', sub: 'Patch fails twice, hits cycle limit.', dot: 'var(--warn)' },
              { id: 'crash', label: 'Agent crash', sub: 'Red Team returns malformed JSON.', dot: 'var(--red)' },
            ].map((s) => (
              <button key={s.id} onClick={() => setScenario(s.id)} style={{
                padding: 12, textAlign: 'left',
                background: scenario === s.id ? 'var(--bg-3)' : 'var(--bg-2)',
                border: `1px solid ${scenario === s.id ? 'var(--accent-line)' : 'var(--line)'}`,
                borderRadius: 6, cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot }} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', marginTop: 6, lineHeight: 1.4 }}>{s.sub}</div>
              </button>
            ))}
          </div>
        </Section>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Section label="Repository tree" padded={false} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflow: 'auto', padding: '6px 0', flex: 1 }}>
            {FILE_TREE.map((f) => {
              const status = f.status;
              const dot = status === 'critical' ? 'var(--red)' : status === 'flagged' ? 'var(--warn)' : 'var(--fg-faint)';
              return (
                <div key={f.path} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 14px', fontFamily: 'var(--mono)', fontSize: 12,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: dot, flexShrink: 0 }} />
                  <span style={{ color: status === 'critical' ? 'var(--red-soft)' : status === 'flagged' ? 'var(--warn)' : 'var(--fg-mid)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
                  <span style={{ color: 'var(--fg-faint)', fontSize: 11 }}>{f.loc} loc</span>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '8px 14px', display: 'flex', gap: 14, fontFamily: 'var(--mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--fg-dim)' }}><span style={{ color: 'var(--red)' }}>●</span> 2 critical</span>
            <span style={{ color: 'var(--fg-dim)' }}><span style={{ color: 'var(--warn)' }}>●</span> 2 flagged</span>
            <span style={{ color: 'var(--fg-dim)' }}>· clean: 7</span>
          </div>
        </Section>

        <Section label="Cluster">
          <KV k="Provider" v={<span className="mono" style={{ fontSize: 11 }}>AMD Developer Cloud</span>} />
          <KV k="Instance" v={<span className="mono" style={{ fontSize: 11 }}>1× MI300X · 192 GB VRAM · 20 vCPU · 240 GB RAM</span>} />
          <KV k="Storage" v={<span className="mono" style={{ fontSize: 11 }}>720 GB boot · 5 TB scratch NVMe</span>} />
          <KV k="Runtime" v={<span className="mono" style={{ fontSize: 11 }}>ROCm 6.2 · vLLM 0.6.3</span>} />
          <KV k="Endpoint" v={<span className="mono" style={{ fontSize: 11, color: 'var(--ok)' }}>● online</span>} />
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'var(--fg-dim)' }}>Hackathon credit</span>
              <span className="mono" style={{ color: 'var(--fg-mid)' }}>${SYSTEM_STATUS.budget.spent.toFixed(2)} / ${SYSTEM_STATUS.budget.total.toFixed(0)}</span>
            </div>
            <UtilBar value={(SYSTEM_STATUS.budget.spent / SYSTEM_STATUS.budget.total) * 100} />
          </div>
        </Section>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenScan });
