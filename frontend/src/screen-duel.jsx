// Live agent duel feed — multi-finding streaming view

function TraceEntry({ entry, visible }) {
  if (!visible) return null;
  const isRed = entry.agent === 'red';
  const isBlue = entry.agent === 'blue';
  const isSys = entry.agent === 'system';
  const isCode = entry.kind === 'code';
  const isShell = entry.kind === 'shell';
  const isOutput = entry.kind === 'output';
  const isThought = entry.kind === 'thought';

  if (isSys) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: .6 }}>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>{entry.line}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );

  const agentColor = isRed ? 'var(--red)' : 'var(--blue)';
  const agentBg = isRed ? 'var(--red-bg)' : 'var(--blue-bg)';
  const agentBorder = isRed ? 'var(--red-line)' : 'var(--blue-line)';

  if (isCode || isShell) return (
    <div style={{ display: 'flex', gap: 10, padding: '3px 0', alignItems: 'flex-start' }}>
      <div style={{ width: 2, alignSelf: 'stretch', background: agentColor, borderRadius: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <pre className="mono" style={{
          margin: 0, fontSize: 11.5, lineHeight: 1.5, padding: '8px 12px',
          background: isShell ? 'var(--bg)' : agentBg,
          border: `1px solid ${isShell ? 'var(--line)' : agentBorder}`,
          borderRadius: 5, overflow: 'auto', whiteSpace: 'pre-wrap',
          color: isShell ? 'var(--accent)' : agentColor,
        }}>
          {isShell && <span style={{ color: 'var(--fg-dim)' }}>$ </span>}
          {entry.line}
        </pre>
      </div>
    </div>
  );

  if (isOutput) return (
    <div className="mono" style={{ fontSize: 11.5, padding: '2px 0 2px 12px', color: 'var(--fg-mid)', lineHeight: 1.5 }}>
      {entry.line}
    </div>
  );

  if (isThought) return (
    <div style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'flex-start' }}>
      <span style={{ color: agentColor, fontSize: 13, marginTop: 1 }}>💭</span>
      <span className="mono" style={{ fontSize: 11.5, color: agentColor, fontStyle: 'italic', lineHeight: 1.55 }}>
        {entry.line}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 10, padding: '2px 0', alignItems: 'flex-start' }}>
      <span className="mono" style={{ fontSize: 10.5, color: agentColor, marginTop: 1, flexShrink: 0 }}>
        {isRed ? '▸' : '◂'}
      </span>
      <span className="mono" style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--fg)', flex: 1 }}>
        {entry.line}
      </span>
    </div>
  );
}

function AgentPane({ agent, label, description, icon, color, bg, border, entries, visibleIdx, scrollRef, error }) {
  const lastIdx = entries.reduce((acc, e, i) => e.agent === agent && i <= visibleIdx ? i : acc, -1);
  const isCurrentlyActive = lastIdx === visibleIdx && !error;
  const myEntries = entries.map((e, i) => ({ ...e, _idx: i })).filter((e) => e.agent === agent);
  const isActive = entries.some((e, i) => i <= visibleIdx && e.agent === agent);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visibleIdx]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0,
      border: `1px solid ${error && agent === error.agent ? 'var(--red-line)' : (isCurrentlyActive ? border : 'var(--line)')}`,
      borderRadius: 8, overflow: 'hidden', transition: 'border-color .3s', background: 'var(--bg-1)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        background: isCurrentlyActive ? bg : 'var(--bg-2)',
        borderBottom: `1px solid ${isCurrentlyActive ? border : 'var(--line)'}`,
        transition: 'background .3s, border-color .3s',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: isCurrentlyActive ? bg : 'var(--bg-3)',
          border: `1px solid ${isCurrentlyActive ? border : 'var(--line)'}`,
          display: 'grid', placeItems: 'center', fontSize: 14,
        }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: isCurrentlyActive ? color : 'var(--fg-mid)' }}>{label}</div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginTop: 1 }}>{description}</div>
        </div>
        {isCurrentlyActive && <span className={`dot ${agent === 'red' ? 'red' : 'blue'}`} />}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {myEntries.map((e) => (
          <TraceEntry key={e._idx} entry={e} visible={e._idx <= visibleIdx} />
        ))}
        {error && agent === error.agent && (
          <div style={{
            marginTop: 10, padding: '10px 12px', borderRadius: 6,
            background: 'rgba(255,91,91,.1)', border: '1px solid var(--red-line)',
          }}>
            <div className="mono" style={{ color: 'var(--red)', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', marginBottom: 4 }}>⚠ {error.title}</div>
            <div className="mono" style={{ color: 'var(--fg-mid)', fontSize: 11.5, lineHeight: 1.55 }}>{error.detail}</div>
          </div>
        )}
        {isCurrentlyActive && <span className="caret" style={{ marginTop: 4 }} />}
        {!isActive && !error && (
          <div className="mono" style={{ color: 'var(--fg-faint)', fontSize: 11, padding: '8px 0' }}>— awaiting handoff —</div>
        )}
      </div>
    </div>
  );
}

function ScreenDuel({ runState, scenario }) {
  const TRACE = API.getTrace();
  const visibleIdx = React.useMemo(() => {
    let idx = -1;
    TRACE.forEach((entry, i) => { if (entry.t <= runState.t) idx = i; });
    return idx;
  }, [runState.t, TRACE]);

  const redScrollRef = React.useRef(null);
  const blueScrollRef = React.useRef(null);
  const sysScrollRef = React.useRef(null);
  const sysEntries = TRACE.map((e, i) => ({ ...e, _idx: i })).filter((e) => e.agent === 'system');

  // Scenario-driven errors
  let error = null;
  if (scenario === 'crash' && runState.t > 5500) {
    error = { agent: 'red', title: 'JSONDecodeError · agent returned malformed payload', detail: 'Janus_Red emitted a non-JSON tail token after the exploit confirmation. Orchestrator caught the parser exception and aborted handoff. Retry budget: 0/3 used. The scheduler is about to retry with response_format={"type":"json_object"}.' };
  }
  if (scenario === 'limit' && runState.t > 12500) {
    error = { agent: 'blue', title: 'Patch failed verification · cycle 2/3', detail: 'Janus_Blue\'s patch for JNS-001 still allowed a payload-encoded LIKE wildcard bypass. Janus_Red verified the bypass and bounced the patch back. Continuing to cycle 3 — last attempt before timeout.' };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', flexShrink: 0,
      }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          Qwen3.5-9B · 256k ctx · ROCm vLLM · rocm0:8000
        </span>
        <span style={{ flex: 1 }} />
        {scenario !== 'happy' && (
          <span className={`pill ${scenario === 'crash' ? 'red' : 'warn'}`}>
            scenario · {scenario === 'crash' ? 'agent crash' : 'max loops'}
          </span>
        )}
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>t = {(runState.t / 1000).toFixed(2)}s</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
          {TRACE.filter((e, i) => i <= visibleIdx).length} / {TRACE.length} events
        </span>
      </div>

      <div ref={sysScrollRef} style={{
        padding: '6px 20px', borderBottom: '1px solid var(--line)', background: 'var(--bg)',
        maxHeight: 110, overflow: 'auto', flexShrink: 0,
      }}>
        {sysEntries.filter((e) => e._idx <= visibleIdx).map((e) => (
          <div key={e._idx} className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', lineHeight: 1.7 }}>
            <span style={{ color: 'var(--accent)' }}>sys › </span>{e.line}
          </div>
        ))}
      </div>

      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 12, padding: 12, minHeight: 0, overflow: 'hidden',
      }}>
        <AgentPane agent="red" label="Janus_Red" description="Penetration tester · offense"
          icon="⚔" color="var(--red)" bg="var(--red-bg)" border="var(--red-line)"
          entries={TRACE} visibleIdx={visibleIdx} scrollRef={redScrollRef} error={error} />
        <AgentPane agent="blue" label="Janus_Blue" description="Security engineer · defense"
          icon="🛡" color="var(--blue)" bg="var(--blue-bg)" border="var(--blue-line)"
          entries={TRACE} visibleIdx={visibleIdx} scrollRef={blueScrollRef} error={error} />
      </div>
    </div>
  );
}

Object.assign(window, { ScreenDuel });
