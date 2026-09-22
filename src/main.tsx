import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

const rootEl = document.getElementById('root')!;

// The CSP's frame-ancestors directive is silently ignored when delivered via
// a <meta> tag (GitHub Pages serves no custom headers) — this is the
// documented fallback (§10.1).
if (window.self !== window.top) {
  rootEl.textContent = 'This app cannot be displayed inside a frame.';
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
