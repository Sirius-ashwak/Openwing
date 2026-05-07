// Findings/vulnerability report — multi-finding

function FindingCard({ f, active, onClick, runState }) {
  const ready = runState.t > f.discoveredAt;
  const patched = f.patchedAt && runState.t > f.patchedAt;
  const verified = f.verifiedAt && runState.t > f.verifiedAt;
  if (!ready) return null;
  const sev = f.severity;
  const color = sev === 'critical' ? 'var(--red)' : sev === 'info' ? 'var(--fg-dim)' : 'var(--warn)';
  const bg = sev === 'critical' ? 'var(--red-bg)' : 'var(--bg-2)';
  const border = sev === 'critical' ? 'var(--red-line)' : 'var(--line)';

  return (
    <div onClick={onClick} style={{
      background: active ? bg : 'var(--bg-2)',
      border: `1px solid ${active ? border : 'var(--line)'}`,
      borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
      transition: 'background .12s, border-color .12s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 11, color: color, letterSpacing: '.06em', fontWeight: 600 }}>{f.id}</div>
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4, lineHeight: 1.35 }}>{f.title}</div>
        </div>
        <SeverityPill level={sev} value={f.cvss > 0 ? f.cvss : null} />
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 8 }}>{f.file}:{f.line}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <span className="pill">{f.cwe}</span>
        {f.triage === 'false-positive' && <span className="pill">FALSE POSITIVE</span>}
        {patched && !verified && <span className="pill blue">PATCHED</span>}
        {verified && <span className="pill ok">RESOLVED</span>}
      </div>
    </div>
  );
}

function ScreenReport({ runState, onExportSARIF }) {
  const FINDINGS = API.getFindings();
  const ready = runState.t > 5950;
  const visibleFindings = FINDINGS.filter((f) => runState.t > f.discoveredAt);
  const [activeId, setActiveId] = React.useState('JNS-001');
  const f = FINDINGS.find((x) => x.id === activeId) || FINDINGS[0];

  if (!ready) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <span style={{ color: 'var(--fg-faint)', fontSize: 48 }}>⚔</span>
        <div className="mono" style={{ color: 'var(--fg-dim)', fontSize: 13 }}>Red Team scanning …</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot red" />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>findings will appear here once confirmed</span>
        </div>
      </div>
    );
  }

  const patched = f.patchedAt && runState.t > f.patchedAt;
  const verified = f.verifiedAt && runState.t > f.verifiedAt;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%', overflow: 'hidden' }}>
      <div style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.08em', color: 'var(--fg-faint)', textTransform: 'uppercase' }}>
            Findings · {visibleFindings.length}
          </div>
          <button className="btn sm" onClick={onExportSARIF}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v9m0 0L4 7m4 4 4-4M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>SARIF</span>
          </button>
        </div>
        <div style={{ padding: 10, overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleFindings.map((finding) => (
            <FindingCard key={finding.id} f={finding} active={finding.id === activeId}
              onClick={() => setActiveId(finding.id)} runState={runState} />
          ))}
        </div>
      </div>

      <div style={{ overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <SeverityPill level={f.severity} value={f.cvss > 0 ? f.cvss : null} />
            <span className="pill">{f.cwe}</span>
            <span className="pill">{f.file}:{f.line}</span>
            {patched && !verified && <span className="pill blue">PATCHED</span>}
            {verified && <span className="pill ok">VERIFIED RESOLVED</span>}
            {f.triage === 'false-positive' && <span className="pill">TRIAGED · FALSE POSITIVE</span>}
          </div>
          <h2 style={{ margin: '10px 0 6px', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>{f.title}</h2>
          <p style={{ margin: 0, color: 'var(--fg-mid)', lineHeight: 1.65, maxWidth: 720 }}>{f.description}</p>
        </div>

        <Section label="Impact">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {f.impact.map((imp, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: f.severity === 'critical' ? 'var(--red)' : 'var(--fg-dim)', marginTop: 2, fontWeight: 700 }}>–</span>
                <span style={{ fontSize: 13, color: 'var(--fg-mid)', lineHeight: 1.5 }}>{imp}</span>
              </div>
            ))}
          </div>
        </Section>

        {f.cvss > 0 && (
          <Section label="CVSS vector" right={
            <span className="mono" style={{ fontSize: 13, color: f.severity === 'critical' ? 'var(--red)' : 'var(--warn)', fontWeight: 600 }}>{f.cvss}</span>
          }>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[
                ['Attack Vector', 'Network'], ['Attack Complexity', 'Low'], ['Priv Required', 'None'],
                ['User Interaction', 'None'], ['Confidentiality', 'High'], ['Integrity', f.id === 'JNS-002' ? 'Low' : 'High'],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginBottom: 3 }}>{k}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--fg)' }}>{v}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section label="Vulnerable code" right={
          <span className="mono" style={{ fontSize: 11, color: f.severity === 'critical' ? 'var(--red)' : 'var(--fg-dim)' }}>{f.file}:{f.line}</span>
        }>
          <CodeBlock src={f.vulnCode} language="python" highlightLines={f.id === 'JNS-001' ? [14] : f.id === 'JNS-002' ? [11, 12, 13] : [1]} />
        </Section>

        {f.poc && (
          <Section label="Proof of concept exploit" right={<span className="pill red">generated by Janus_Red</span>}>
            <CodeBlock src={f.poc} language="python" />
          </Section>
        )}

        {f.triage === 'false-positive' && (
          <Section label="Triage decision">
            <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6, fontSize: 13, color: 'var(--fg-mid)', lineHeight: 1.6 }}>
              Janus_Red inspected the deploy pipeline and confirmed the production Dockerfile sets <span className="mono" style={{ color: 'var(--accent)' }}>DEBUG=False</span> explicitly. The default-true fallback is unreachable in production. Marked as <strong>false-positive</strong> · no patch required.
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ScreenReport, FindingCard });
