import { useEffect, useRef, useState } from 'react';
import type { ScreenId } from './components/Chrome';

interface PaletteItem {
  id: ScreenId;
  label: string;
  kbd: string;
}

const ITEMS: PaletteItem[] = [
  { id: 'scan', label: 'Go to Scan setup', kbd: '1' },
  { id: 'sweep', label: 'Go to Multi-file sweep', kbd: '2' },
  { id: 'duel', label: 'Go to Live agent feed', kbd: '3' },
  { id: 'report', label: 'Go to Findings', kbd: '4' },
  { id: 'patch', label: 'Go to Patches', kbd: '5' },
  { id: 'verify', label: 'Go to Verification', kbd: '6' },
  { id: 'history', label: 'Go to Run history', kbd: '7' },
  { id: 'settings', label: 'Go to Settings', kbd: '8' },
];

export function CommandPalette({
  open,
  onClose,
  onGo,
}: {
  open: boolean;
  onClose: () => void;
  onGo: (id: ScreenId) => void;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const items = ITEMS.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        backdropFilter: 'blur(2px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{ borderBottom: '1px solid var(--line)', padding: '0 14px' }}>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search…"
            style={{
              width: '100%',
              height: 44,
              background: 'transparent',
              border: 0,
              outline: 0,
              color: 'var(--fg)',
              fontSize: 13,
            }}
          />
        </div>
        <div style={{ padding: 6, maxHeight: 320, overflow: 'auto' }}>
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => {
                onGo(it.id);
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                border: 0,
                borderRadius: 6,
                color: 'var(--fg)',
                fontSize: 12.5,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-3)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
            >
              <span style={{ flex: 1 }}>{it.label}</span>
              <span className="kbd">{it.kbd}</span>
            </button>
          ))}
          {!items.length && (
            <div style={{ padding: 14, color: 'var(--fg-dim)', fontSize: 12 }}>No matches</div>
          )}
        </div>
      </div>
    </div>
  );
}
