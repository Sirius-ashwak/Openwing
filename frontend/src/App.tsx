import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSARIF, downloadJSON } from './api';
import { CommandPalette } from './CommandPalette';
import { Sidebar, TopBar } from './components/Chrome';
import type { ScreenId } from './components/Chrome';
import {
  TweakButton,
  TweakRadio,
  TweakSection,
  TweakSlider,
  TweaksPanel,
  useTweaks,
} from './components/Tweaks';
import { ScreenDuel } from './screens/ScreenDuel';
import { ScreenHistory } from './screens/ScreenHistory';
import { ScreenPatch } from './screens/ScreenPatch';
import { ScreenReport } from './screens/ScreenReport';
import { ScreenScan } from './screens/ScreenScan';
import { ScreenSettings } from './screens/ScreenSettings';
import { ScreenSweep } from './screens/ScreenSweep';
import { ScreenVerify } from './screens/ScreenVerify';
import { useFindings, useRepo, useRunState } from './store';
import type { AccentIntensity, Density, Scenario, Tweaks } from './types';

const TWEAK_DEFAULTS: Tweaks = {
  speed: 1.5,
  density: 'regular',
  scenario: 'happy',
  accentIntensity: 'medium',
  showCmdPalette: false,
};

const SCREEN_ORDER: ScreenId[] = [
  'scan',
  'sweep',
  'duel',
  'report',
  'patch',
  'verify',
  'history',
  'settings',
];

function makeRunId(): string {
  return 'run_' + Math.random().toString(36).slice(2, 6);
}

export function App() {
  const [tweaks, setTweak] = useTweaks<Tweaks>(TWEAK_DEFAULTS);
  const [screen, setScreen] = useState<ScreenId>('scan');
  const [runId] = useState(() => makeRunId());
  const [paletteOpen, setPaletteOpen] = useState(false);

  const runState = useRunState(runId);
  const findings = useFindings();
  const repo = useRepo();

  const handleExportSARIF = useCallback(() => {
    const sarif = buildSARIF(findings, repo);
    downloadJSON(`openwing-${runState.id}.sarif.json`, sarif);
  }, [findings, repo, runState.id]);

  const prevPhaseRef = useRef(runState.phase);
  useEffect(() => {
    if (prevPhaseRef.current === 'idle' && runState.phase !== 'idle' && runState.phase !== 'done') {
      setScreen('duel');
    }
    if (prevPhaseRef.current !== 'done' && runState.phase === 'done') {
      setTimeout(() => setScreen('verify'), 600);
    }
    prevPhaseRef.current = runState.phase;
  }, [runState.phase]);

  useEffect(() => {
    const d = tweaks.density;
    document.documentElement.style.setProperty(
      '--row-h',
      d === 'compact' ? '22px' : d === 'comfy' ? '34px' : '28px',
    );
    document.documentElement.style.setProperty(
      '--pad',
      d === 'compact' ? '8px' : d === 'comfy' ? '16px' : '12px',
    );
  }, [tweaks.density]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key !== 'Escape') return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        return;
      }
      if (paletteOpen) return;
      if (e.key === 'r' && (e.metaKey || e.ctrlKey)) return;
      if (e.key === 'e') {
        handleExportSARIF();
        return;
      }
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
      if (!Number.isNaN(num) && num >= 1 && num <= 8) {
        setScreen(SCREEN_ORDER[num - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen, paletteOpen, handleExportSARIF]);

  return (
    <>
      <div className="app">
        <TopBar
          run={runState}
          screen={screen}
          setScreen={setScreen}
          runState={runState}
          onPause={() => {}}
          onRestart={() => window.location.reload()}
          onCmdK={() => setPaletteOpen(true)}
        />
        <Sidebar screen={screen} setScreen={setScreen} runState={runState} />
        <main className="main" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {screen === 'scan' && (
            <ScreenScan
              runState={runState}
              scenario={tweaks.scenario}
              setScenario={(s: Scenario) => setTweak('scenario', s)}
            />
          )}
          {screen === 'sweep' && <ScreenSweep runState={runState} />}
          {screen === 'duel' && <ScreenDuel runState={runState} scenario={tweaks.scenario} />}
          {screen === 'report' && <ScreenReport runState={runState} onExportSARIF={handleExportSARIF} />}
          {screen === 'patch' && <ScreenPatch runState={runState} scenario={tweaks.scenario} />}
          {screen === 'verify' && (
            <ScreenVerify
              runState={runState}
              scenario={tweaks.scenario}
              onExportSARIF={handleExportSARIF}
            />
          )}
          {screen === 'history' && <ScreenHistory />}
          {screen === 'settings' && <ScreenSettings />}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onGo={setScreen} />

      <div
        style={{
          position: 'fixed',
          bottom: 8,
          left: 252,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          fontSize: 10.5,
          color: 'var(--fg-faint)',
          fontFamily: 'var(--mono)',
          background: 'rgba(12,13,15,.7)',
          padding: '4px 10px',
          borderRadius: 999,
          border: '1px solid var(--line)',
          backdropFilter: 'blur(6px)',
          pointerEvents: 'none',
        }}
      >
        <span className="kbd" style={{ pointerEvents: 'auto' }}>
          ⌘K
        </span>
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
        <TweakSlider
          label="Playback speed"
          value={tweaks.speed}
          min={0.2}
          max={4}
          step={0.1}
          unit="×"
          onChange={(v) => setTweak('speed', v)}
        />
        <TweakRadio<Density>
          label="Density"
          value={tweaks.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)}
        />

        <TweakSection label="Scenario" />
        <TweakRadio<Scenario>
          label="Run scenario"
          value={tweaks.scenario}
          options={[
            { value: 'happy', label: 'Happy path' },
            { value: 'limit', label: 'Max loops' },
            { value: 'crash', label: 'Agent crash' },
          ]}
          onChange={(v) => {
            setTweak('scenario', v);
          }}
        />

        <TweakSection label="Theme" />
        <TweakRadio<AccentIntensity>
          label="Accent intensity"
          value={tweaks.accentIntensity}
          options={['low', 'medium', 'high']}
          onChange={(v) => {
            setTweak('accentIntensity', v);
            const opacity = v === 'low' ? '.05' : v === 'medium' ? '.08' : '.14';
            document.documentElement.style.setProperty('--red-bg', `rgba(255,91,91,${opacity})`);
            document.documentElement.style.setProperty('--blue-bg', `rgba(102,212,255,${opacity})`);
            document.documentElement.style.setProperty('--accent-bg', `rgba(197,255,74,${opacity})`);
          }}
        />

        <TweakSection label="Actions" />
        <TweakButton label="Reload page" onClick={() => window.location.reload()} secondary />
        <TweakButton label="Export SARIF report" onClick={handleExportSARIF} secondary />
      </TweaksPanel>
    </>
  );
}
