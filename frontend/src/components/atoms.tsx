import type { CSSProperties, ReactNode } from 'react';
import type { Severity } from '../types';

export function Logo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2 L12 22" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 7 C5 4 2 9 2 12 C2 15 5 14 12 12" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M12 7 C19 4 22 9 22 12 C22 15 19 14 12 12" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M12 12 C7 14 5 17 5 19 C5 21 7 21 12 18" stroke="currentColor" strokeWidth="1.2" opacity=".6" fill="none" />
      <path d="M12 12 C17 14 19 17 19 19 C19 21 17 21 12 18" stroke="currentColor" strokeWidth="1.2" opacity=".6" fill="none" />
      <circle cx="12" cy="4" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function Pill({
  children,
  kind = '',
  icon = false,
}: {
  children: ReactNode;
  kind?: string;
  icon?: boolean;
}) {
  return (
    <span className={`pill ${kind}`}>
      {icon && <span className="dot" style={{ background: 'currentColor' }} />}
      {children}
    </span>
  );
}

export function Section({
  label,
  right,
  children,
  padded = true,
  style,
}: {
  label: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className="panel" style={style}>
      <div className="panel-hd">
        <h3>{label}</h3>
        {right}
      </div>
      <div className={padded ? 'panel-bd' : ''}>{children}</div>
    </div>
  );
}

export function KV({ k, v, mono = false }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '6px 0',
        borderBottom: '1px solid var(--line-soft)',
      }}
    >
      <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>{k}</span>
      <span className={mono ? 'mono' : ''} style={{ fontSize: 12, color: 'var(--fg)', textAlign: 'right' }}>
        {v}
      </span>
    </div>
  );
}

export function Spark({
  data,
  color = 'var(--accent)',
  w = 80,
  h = 18,
}: {
  data: number[];
  color?: string;
  w?: number;
  h?: number;
}) {
  if (!data || !data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        points={pts}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SEV_PILL: Record<Severity, { kind: string; txt: string }> = {
  critical: { kind: 'red', txt: 'CRITICAL' },
  high: { kind: 'red', txt: 'HIGH' },
  medium: { kind: 'warn', txt: 'MEDIUM' },
  low: { kind: '', txt: 'LOW' },
  info: { kind: '', txt: 'INFO' },
};

export function SeverityPill({ level, value }: { level: Severity; value?: number | null }) {
  const m = SEV_PILL[level] ?? SEV_PILL.low;
  return (
    <span className={`pill ${m.kind}`}>
      {m.txt}
      {value != null ? ` · ${value}` : ''}
    </span>
  );
}

export function highlightPy(src: string): string {
  const KW =
    /\b(def|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|import|from|as|class|with|try|except|finally|raise|lambda|yield|pass|break|continue|global|nonlocal)\b/g;
  let s = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/("""[\s\S]*?"""|"[^"\n]*"|'[^'\n]*')/g, '<span class="tk-str">$1</span>');
  s = s.replace(/(#[^\n]*)/g, '<span class="tk-com">$1</span>');
  s = s.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="tk-num">$1</span>');
  s = s.replace(KW, '<span class="tk-kw">$1</span>');
  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(\()/g, '<span class="tk-fn">$1</span>$2');
  return s;
}

export function CodeBlock({
  src,
  language = 'python',
  highlightLines = [],
  style,
}: {
  src: string;
  language?: 'python' | 'plain';
  highlightLines?: number[];
  style?: CSSProperties;
}) {
  const lines = src.split('\n');
  return (
    <pre className="code" style={style}>
      {lines.map((ln, i) => {
        const num = i + 1;
        const flagged = highlightLines.includes(num);
        const html =
          language === 'python'
            ? highlightPy(ln)
            : ln.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return (
          <div
            key={i}
            style={{
              background: flagged ? 'rgba(255,91,91,.07)' : 'transparent',
              borderLeft: flagged ? '2px solid var(--red)' : '2px solid transparent',
              paddingLeft: 6,
              marginLeft: -8,
            }}
          >
            <span className="ln">{num}</span>
            <span dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
          </div>
        );
      })}
    </pre>
  );
}

export function DiffBlock({
  before,
  after,
  style,
}: {
  before: string;
  after: string;
  style?: CSSProperties;
}) {
  const a = before.split('\n');
  const b = after.split('\n');
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  type DiffLine = { k: 'ctx' | 'add' | 'rem'; t: string };
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ k: 'ctx', t: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ k: 'rem', t: a[i] });
      i++;
    } else {
      out.push({ k: 'add', t: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ k: 'rem', t: a[i++] });
  while (j < n) out.push({ k: 'add', t: b[j++] });

  return (
    <pre className="code" style={{ paddingLeft: 0, paddingRight: 0, ...style }}>
      {out.map((l, idx) => {
        const html = highlightPy(l.t || ' ');
        return (
          <span key={idx} className={`diff-line diff-${l.k}`}>
            <span dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
          </span>
        );
      })}
    </pre>
  );
}
