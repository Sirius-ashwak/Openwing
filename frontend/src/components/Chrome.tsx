import type { CSSProperties, ReactNode } from 'react';
import { useFindings, useRepo, useSystem } from '../store';
import type { RunState } from '../types';
import { Logo } from './atoms';

type ScreenId = 'scan' | 'sweep' | 'duel' | 'report' | 'patch' | 'verify' | 'history' | 'settings';

interface NavBadge {
  text: string;
  color?: string;
  bg?: string;
  border?: string;
}

interface NavItemProps {
  id: ScreenId;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: (id: ScreenId) => void;
  badge?: NavBadge | null;
  disabled?: boolean;
}

export const Icons = {
  scan: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5 L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  duel: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 4 L8 10 L14 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M2 12 L8 6 L14 12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".4"
      />
    </svg>
  ),
  bug: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="6" width="8" height="7" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6 4 L5 2 M10 4 L11 2 M2 8 H4 M12 8 H14 M2 11 H4 M12 11 H14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  patch: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 8 L6 8 M10 8 L14 8 M8 2 L8 6 M8 10 L8 14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 8 L7 12 L13 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  hist: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5 V8 L10.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  cog: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5 V3.5 M8 12.5 V14.5 M1.5 8 H3.5 M12.5 8 H14.5 M3.3 3.3 L4.7 4.7 M11.3 11.3 L12.7 12.7 M3.3 12.7 L4.7 11.3 M11.3 4.7 L12.7 3.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  gpu: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="5" y="6.5" width="3" height="3" fill="currentColor" />
      <path d="M11 6.5 H12 M11 8.5 H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
};

export function NavItem({ id, label, icon, active, onClick, badge, disabled }: NavItemProps) {
  return (
    <button
      onClick={() => !disabled && onClick(id)}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        height: 30,
        padding: '0 12px',
        background: active ? 'var(--bg-3)' : 'transparent',
        border: 0,
        borderRadius: 6,
        color: active ? 'var(--fg)' : 'var(--fg-mid)',
        fontSize: 12.5,
        fontWeight: active ? 500 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        textAlign: 'left',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {active && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 6,
            bottom: 6,
            width: 2,
            background: 'var(--accent)',
            borderRadius: 2,
          }}
        />
      )}
      <span style={{ width: 14, color: active ? 'var(--accent)' : 'var(--fg-dim)' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: badge.color ?? 'var(--fg-dim)',
            background: badge.bg ?? 'transparent',
            padding: '1px 6px',
            borderRadius: 999,
            border: `1px solid ${badge.border ?? 'var(--line)'}`,
          }}
        >
          {badge.text}
        </span>
      )}
    </button>
  );
}

interface TopBarProps {
  run: RunState;
  screen: ScreenId;
  setScreen: (s: ScreenId) => void;
  runState: RunState;
  onPause: () => void;
  onRestart: () => void;
  onCmdK?: () => void;
}

export function TopBar({ run, runState, onPause, onRestart, onCmdK }: TopBarProps) {
  const phaseLabel: Record<RunState['phase'], string> = {
    idle: 'IDLE',
    scanning: 'SCANNING',
    redteam: 'RED TEAM ACTIVE',
    handoff: 'HANDOFF',
    blueteam: 'BLUE TEAM ACTIVE',
    verifying: 'VERIFYING',
    done: 'COMPLETE',
  };

  const repo = useRepo();

  return (
    <div
      className="topbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 44,
        borderBottom: '1px solid var(--line)',
        background: 'var(--bg-1)',
        padding: '0 12px 0 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--accent)' }}>
          <Logo size={16} />
        </span>
        <span style={{ fontWeight: 600, letterSpacing: '.02em' }}>Openwing</span>
        <span className="mono" style={{ color: 'var(--fg-faint)', fontSize: 11 }}>
          v0.5.0
        </span>
      </div>

      <div className="vdiv" style={{ marginLeft: 16 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 4 }}>
        <span className="mono" style={{ color: 'var(--fg-dim)', fontSize: 12 }}>
          {run.id}
        </span>
        <span style={{ color: 'var(--fg-faint)' }}>›</span>
        <span className="mono" style={{ fontSize: 12 }}>
          {repo.owner}/{repo.name}
        </span>
        <span className="mono" style={{ color: 'var(--fg-faint)', fontSize: 11 }}>
          @{repo.commit}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          border: '1px solid var(--line)',
          borderRadius: 999,
          background: 'var(--bg-2)',
        }}
      >
        <span
          className={`dot ${
            runState.phase === 'redteam'
              ? 'red'
              : runState.phase === 'blueteam'
              ? 'blue'
              : runState.phase === 'verifying'
              ? 'red'
              : runState.phase === 'done'
              ? 'ok'
              : 'acc'
          }`}
        />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.08em' }}>
          {phaseLabel[runState.phase]}
        </span>
        <span className="mono" style={{ color: 'var(--fg-dim)', fontSize: 10.5 }}>
          ·
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)', minWidth: 38 }}>
          {(runState.t / 1000).toFixed(1)}s
        </span>
      </div>

      <div className="vdiv" />

      {onCmdK && (
        <button className="btn ghost sm" onClick={onCmdK} title="Command palette" style={{ gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5 L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Search</span>
          <span className="kbd" style={{ marginLeft: 4 }}>
            ⌘K
          </span>
        </button>
      )}

      <div className="vdiv" />

      <button className="btn ghost sm" onClick={onPause} title="Pause/resume">
        {runState.playing ? '⏸' : '▶'}
        <span style={{ fontSize: 11 }}>{runState.playing ? 'Pause' : 'Play'}</span>
      </button>
      <button className="btn ghost sm" onClick={onRestart} title="Restart run">
        ↻<span style={{ fontSize: 11 }}>Restart</span>
      </button>

      <div className="vdiv" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            background: 'linear-gradient(135deg, #3b3f47, #1c1f23)',
            border: '1px solid var(--line)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          JK
        </div>
      </div>
    </div>
  );
}

export function UtilBar({ value }: { value: number }) {
  return (
    <div style={{ position: 'relative', height: 4, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--blue))',
        }}
      />
    </div>
  );
}

interface SidebarProps {
  screen: ScreenId;
  setScreen: (s: ScreenId) => void;
  runState: RunState;
}

export function Sidebar({ screen, setScreen, runState }: SidebarProps) {
  const t = runState.t;
  const findings = useFindings();
  const system = useSystem();
  const visibleFindings = findings.filter((f) => t > f.discoveredAt).length;
  const findingsBadge: NavBadge | null =
    visibleFindings > 0
      ? {
          text: String(visibleFindings),
          color: 'var(--red)',
          border: 'var(--red-line)',
          bg: 'var(--red-bg)',
        }
      : null;
  const patchedCount = findings.filter((f) => f.patchedAt && t > f.patchedAt).length;
  const patchBadge: NavBadge | null =
    patchedCount > 0
      ? {
          text: String(patchedCount),
          color: 'var(--blue)',
          border: 'var(--blue-line)',
          bg: 'var(--blue-bg)',
        }
      : null;
  const verifyBadge: NavBadge | null =
    t > 15200
      ? {
          text: 'PASS',
          color: 'var(--ok)',
          border: 'rgba(126,231,135,.25)',
          bg: 'var(--ok-bg)',
        }
      : null;
  const sweepBadge: NavBadge | null = t > 0 && t < 8500 ? { text: '●', color: 'var(--accent)' } : null;
  const duelBadge: NavBadge | null =
    runState.phase === 'redteam' || runState.phase === 'blueteam' || runState.phase === 'verifying'
      ? { text: '●', color: 'var(--accent)' }
      : null;

  const headerStyle: CSSProperties = {
    padding: '4px 12px 6px',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '.08em',
    color: 'var(--fg-faint)',
  };

  const utilValue = system.gpu.util ?? 0;
  const memLabel = system.gpu.mem ?? '—';
  const tokS = system.endpoint.tok_s ?? '—';
  const ctx = system.endpoint.ctx ?? '—';

  return (
    <aside
      className="sidebar"
      style={{
        borderRight: '1px solid var(--line)',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <div style={{ padding: '10px 8px 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={headerStyle}>CURRENT RUN</div>
        <NavItem id="scan" label="Scan setup" icon={Icons.scan} active={screen === 'scan'} onClick={setScreen} />
        <NavItem
          id="sweep"
          label="Multi-file sweep"
          icon={Icons.duel}
          active={screen === 'sweep'}
          onClick={setScreen}
          badge={sweepBadge}
        />
        <NavItem
          id="duel"
          label="Live agent feed"
          icon={Icons.duel}
          active={screen === 'duel'}
          onClick={setScreen}
          badge={duelBadge}
        />
        <NavItem
          id="report"
          label="Findings"
          icon={Icons.bug}
          active={screen === 'report'}
          onClick={setScreen}
          badge={findingsBadge}
        />
        <NavItem
          id="patch"
          label="Patches"
          icon={Icons.patch}
          active={screen === 'patch'}
          onClick={setScreen}
          badge={patchBadge}
        />
        <NavItem
          id="verify"
          label="Verification"
          icon={Icons.check}
          active={screen === 'verify'}
          onClick={setScreen}
          badge={verifyBadge}
        />
      </div>
      <div style={{ padding: '10px 8px 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={headerStyle}>WORKSPACE</div>
        <NavItem id="history" label="Run history" icon={Icons.hist} active={screen === 'history'} onClick={setScreen} />
        <NavItem
          id="settings"
          label="Settings"
          icon={Icons.cog}
          active={screen === 'settings'}
          onClick={setScreen}
        />
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: 12, borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ color: 'var(--fg-dim)' }}>{Icons.gpu}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-mid)' }}>
            MI300X
          </span>
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>
            {utilValue}%
          </span>
        </div>
        <UtilBar value={utilValue} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 10px',
            marginTop: 10,
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--fg-dim)',
          }}
        >
          <div>vram</div>
          <div style={{ textAlign: 'right', color: 'var(--fg-mid)' }}>{memLabel}</div>
          <div>tok/s</div>
          <div style={{ textAlign: 'right', color: 'var(--fg-mid)' }}>{tokS}</div>
          <div>ctx</div>
          <div style={{ textAlign: 'right', color: 'var(--fg-mid)' }}>{ctx}</div>
          <div>budget</div>
          <div style={{ textAlign: 'right', color: 'var(--fg-mid)' }}>
            ${system.budget.spent.toFixed(2)} / ${system.budget.total.toFixed(0)}
          </div>
        </div>
      </div>
    </aside>
  );
}

export type { ScreenId };
