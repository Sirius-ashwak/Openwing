import { CTA, Hero, Loop, RedBlue, Stack } from './sections';
import './landing.css';

function Mark() {
  return (
    <svg className="ow-nav__mark" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1.4" />
      <rect x="6" y="6" width="8" height="8" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
    </svg>
  );
}

export function Landing() {
  return (
    <div className="ow">
      <header className="ow-nav">
        <a href="#" className="ow-nav__brand">
          <Mark />
          <span>Openwing</span>
          <span className="ow-nav__sub">/ Janus</span>
          <span className="ow-nav__chip">v0.5</span>
        </a>
        <nav className="ow-nav__links">
          <a href="https://github.com/openwing-labs/janus" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href="/app" className="ow-nav__cta">Dashboard</a>
        </nav>
      </header>

      <main className="ow-main">
        <Hero />
        <RedBlue />
        <Loop />
        <Stack />
        <CTA />
      </main>

      <footer className="ow-footer">
        <div>
          <div className="ow-footer__brand">Openwing / Janus</div>
          <div className="ow-footer__tagline">Adversarial security testing for Python codebases.</div>
        </div>
        <div className="ow-footer__right">
          <a href="https://github.com/openwing-labs/janus" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href="/app">Dashboard</a>
          <span className="ow-footer__meta">© 2026 · MIT</span>
        </div>
      </footer>
    </div>
  );
}
