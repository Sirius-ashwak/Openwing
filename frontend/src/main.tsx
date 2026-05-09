import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';

const Landing = lazy(() => import('./landing/Landing').then((m) => ({ default: m.Landing })));
const App = lazy(() =>
  Promise.all([
    import('./App').then((m) => m.App),
    import('./store').then((m) => m.STORE_LOADED),
  ]).then(([AppComponent]) => ({ default: AppComponent })),
);

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');
const root = createRoot(container);

const isAppRoute = window.location.pathname.startsWith('/app');
const isHandlingScanTarget =
  isAppRoute && new URLSearchParams(window.location.search).has('target');

root.render(
  <StrictMode>
    <Suspense fallback={<div style={{ color: '#888', padding: 24 }}>Loading…</div>}>
      {isAppRoute || isHandlingScanTarget ? <App /> : <Landing />}
    </Suspense>
  </StrictMode>,
);
