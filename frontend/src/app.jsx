// Main app — run engine, nav, Tweaks, keyboard shortcuts

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "speed": 1.5,
  "density": "regular",
  "scenario": "happy",
  "accentIntensity": "medium",
  "showCmdPalette": false
}/*EDITMODE-END*/;

const TOTAL_MS = 16000;

function useRunEngine(speed) {
  const [t, setT]           = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const rafRef              = React.useRef(null);
  const lastRef             = React.useRef(null);
  const tRef                = React.useRef(0);

  const phase = React.useMemo(() => {
    if (t === 0)             return 'idle';
    if (t < 1100)            return 'scanning';
    if (t < 8100)            return 'redteam';
    if (t < 8400)            return 'handoff';
    if (t < 12700)           return 'blueteam';
    if (t < 15500)           return 'verifying';
    return 'done';
  }, [t]);

  const tick = React.useCallback((now) => {
    if (!lastRef.current) lastRef.current = now;
    const dt = (now - lastRef.current) * speed;
    lastRef.current = now;
    tRef.current = Math.min(tRef.current + dt, TOTAL_MS);
    setT(Math.floor(tRef.current));
    if (tRef.current < TOTAL_MS) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setPlaying(false);
    }
  }, [speed]);

  React.useEffect(() => {
    if (playing) {
      lastRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, tick]);

  const start    = React.useCallback(() => { tRef.current = 0; setT(0); setPlaying(true); }, []);
  const restart  = React.useCallback(() => { tRef.current = 0; setT(0); lastRef.current = null; setPlaying(true); }, []);
  const togglePlay = React.useCallback(() => setPlaying((p) => !p), []);
  const seek     = React.useCallback((newT) => {
    tRef.current = Math.max(0, Math.min(TOTAL_MS, newT));
    setT(Math.floor(tRef.current));
  }, []);

  return { t, phase, playing, setPlaying, start, restart, togglePlay, seek };
}

function makeRunId() { return 'run_' + Math.random().toString(36).slice(2, 6); }

const SCREEN_ORDER = ['scan', 'sweep', 'duel', 'report', 'patch', 'verify', 'history', 'settings'];

function CommandPalette({ open, onClose, onGo }) {
  const [q, setQ] = React.useState('');
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    if (open) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);
  if (!open) return null;
  const items = [
    { id: 'scan', label: 'Go to Scan setup', kbd: '1' },
    { id: 'sweep', label: 'Go to Multi-file sweep', kbd: '2' },
    { id: 'duel', label: 'Go to Live agent feed', kbd: '3' },
    { id: 'report', label: 'Go to Findings', kbd: '4' },
    { id: 'patch', label: 'Go to Patches', kbd: '5' },
    { id: 'verify', label: 'Go to Verification', kbd: '6' },
    { id: 'history', label: 'Go to Run history', kbd: '7' },
    { id: 'settings', label: 'Go to Settings', kbd: '8' },
  ].filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 100,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10,
        boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden',
      }}>
        <div style={{ borderBottom: '1px solid var(--line)', padding: '0 14px' }}>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search…"
            style={{ width: '100%', height: 44, background: 'transparent', border: 0, outline: 0, color: 'var(--fg)', fontSize: 13 }} />
        </div>
        <div style={{ padding: 6, maxHeight: 320, overflow: 'auto' }}>
          {items.map((it) => (
            <button key={it.id} onClick={() => { onGo(it.id); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px',
                background: 'transparent', border: 0, borderRadius: 6, color: 'var(--fg)',
                fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <span style={{ flex: 1 }}>{it.label}</span>
              <span className="kbd">{it.kbd}</span>
            </button>
          ))}
          {!items.length && <div style={{ padding: 14, color: 'var(--fg-dim)', fontSize: 12 }}>No matches</div>}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('scan');
  const [runId]             = React.useState(() => makeRunId());
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const engine = useRunEngine(tweaks.speed);
  const runState = { t: engine.t, phase: engine.phase, playing: engine.playing, id: runId };

  const handleExportSARIF = React.useCallback(() => {
    const sarif = API.buildSARIF(API.getFindings(), API.getRepo());
    API.downloadJSON(`openwing-${runId}.sarif.json`, sarif);
  }, [runId]);

  // Auto-switch screens on phase changes
  const prevPhaseRef = React.useRef('idle');
  React.useEffect(() => {
    if (prevPhaseRef.current === 'idle' && engine.phase === 'scanning') setScreen('duel');
    if (prevPhaseRef.current === 'verifying' && engine.phase === 'done') {
      setTimeout(() => setScreen('verify'), 600);
    }
    prevPhaseRef.current = engine.phase;
  }, [engine.phase]);

  // Density CSS var
  React.useEffect(() => {
    const d = tweaks.density;
    document.documentElement.style.setProperty('--row-h', d === 'compact' ? '22px' : d === 'comfy' ? '34px' : '28px');
    document.documentElement.style.setProperty('--pad', d === 'compact' ? '8px' : d === 'comfy' ? '16px' : '12px');
  }, [tweaks.density]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handler = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (!(e.key === 'Escape')) return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); return; }
      if (e.key === 'Escape') { setPaletteOpen(false); return; }
      if (paletteOpen) return;
      if (e.key === ' ') { e.preventDefault(); engine.togglePlay(); return; }
      if (e.key === 'Enter' && screen === 'scan' && engine.phase === 'idle') { e.preventDefault(); engine.start(); return; }
      if (e.key === 'r' && (e.metaKey || e.ctrlKey)) return; // let browser reload
      if (e.key === 'r') { engine.restart(); return; }
      if (e.key === 'e') { handleExportSARIF(); return; }
      if (e.key === 'ArrowLeft') {
        const i = SCREEN_ORDER.indexOf(screen);
        if (i > 0) setScreen(SCREEN_ORDER[i - 1]);
        return;
      }
      if (e.key === 'ArrowRight') {
        const i = SCREEN_ORDER.indexOf(screen);
        if (i >= 0 && i < SCREEN_ORDER.length - 1) setScreen(SCREEN_ORDER[i + 1]);
        return;
      }
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 8) {
        setScreen(SCREEN_ORDER[num - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen, engine, paletteOpen, handleExportSARIF]);

  return (
    <>
      <div className="app">
        <TopBar
          run={runState} screen={screen} setScreen={setScreen} runState={runState}
          onPause={engine.togglePlay} onRestart={engine.restart}
          onCmdK={() => setPaletteOpen(true)}
        />
        <Sidebar screen={screen} setScreen={setScreen} runState={runState} />
        <main className="main" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {screen === 'scan'     && <ScreenScan     runState={runState} onStart={engine.start} scenario={tweaks.scenario} setScenario={(s) => setTweak('scenario', s)} />}
          {screen === 'sweep'    && <ScreenSweep    runState={runState} />}
          {screen === 'duel'     && <ScreenDuel     runState={runState} scenario={tweaks.scenario} />}
          {screen === 'report'   && <ScreenReport   runState={runState} onExportSARIF={handleExportSARIF} />}
          {screen === 'patch'    && <ScreenPatch    runState={runState} scenario={tweaks.scenario} />}
          {screen === 'verify'   && <ScreenVerify   runState={runState} scenario={tweaks.scenario} onExportSARIF={handleExportSARIF} />}
          {screen === 'history'  && <ScreenHistory  />}
          {screen === 'settings' && <ScreenSettings />}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onGo={setScreen} />

      {/* Hint footer */}
      <div style={{
        position: 'fixed', bottom: 8, left: 252, display: 'flex', gap: 6, alignItems: 'center',
        fontSize: 10.5, color: 'var(--fg-faint)', fontFamily: 'var(--mono)',
        background: 'rgba(12,13,15,.7)', padding: '4px 10px', borderRadius: 999,
        border: '1px solid var(--line)', backdropFilter: 'blur(6px)', pointerEvents: 'none',
      }}>
        <span className="kbd" style={{ pointerEvents: 'auto' }}>⌘K</span>
        <span>cmd</span>
        <span style={{ color: 'var(--fg-faint)' }}>·</span>
        <span className="kbd">←</span>
        <span className="kbd">→</span>
        <span>nav</span>
        <span style={{ color: 'var(--fg-faint)' }}>·</span>
        <span className="kbd">␣</span>
        <span>play</span>
        <span style={{ color: 'var(--fg-faint)' }}>·</span>
        <span className="kbd">E</span>
        <span>export</span>
      </div>

      <TweaksPanel title="Openwing Tweaks">
        <TweakSection label="Simulation" />
        <TweakSlider label="Playback speed" value={tweaks.speed} min={0.2} max={4} step={0.1} unit="×"
          onChange={(v) => setTweak('speed', v)} />
        <TweakRadio label="Density" value={tweaks.density} options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)} />

        <TweakSection label="Scenario" />
        <TweakRadio label="Run scenario" value={tweaks.scenario}
          options={[
            { value: 'happy', label: 'Happy path' },
            { value: 'limit', label: 'Max loops' },
            { value: 'crash', label: 'Agent crash' },
          ]}
          onChange={(v) => { setTweak('scenario', v); engine.restart(); }} />

        <TweakSection label="Theme" />
        <TweakRadio label="Accent intensity" value={tweaks.accentIntensity}
          options={['low', 'medium', 'high']}
          onChange={(v) => {
            setTweak('accentIntensity', v);
            const opacity = v === 'low' ? '.05' : v === 'medium' ? '.08' : '.14';
            document.documentElement.style.setProperty('--red-bg', `rgba(255,91,91,${opacity})`);
            document.documentElement.style.setProperty('--blue-bg', `rgba(102,212,255,${opacity})`);
            document.documentElement.style.setProperty('--accent-bg', `rgba(197,255,74,${opacity})`);
          }} />

        <TweakSection label="Actions" />
        <TweakButton label="Restart simulation" onClick={engine.restart} secondary />
        <TweakButton label="Export SARIF report" onClick={handleExportSARIF} secondary />
      </TweaksPanel>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
if (window.API_LOADED) {
  window.API_LOADED.then(() => root.render(<App />));
} else {
  root.render(<App />);
}
