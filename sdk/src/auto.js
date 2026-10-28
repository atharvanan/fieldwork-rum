import { init } from './rum.js';

// Usage: <script defer src="https://your-fieldwork-host/rum.min.js" data-key="rum_..."></script>
const script = document.currentScript || document.querySelector('script[data-key][src*="rum"]');
let api;
if (script && script.dataset.key) {
  const origin = new URL(script.src, location.href).origin;
  api = init({
    key: script.dataset.key,
    endpoint: script.dataset.endpoint || `${origin}/api/ingest`,
    release: script.dataset.release,
    sampleRate: script.dataset.sample ? Number(script.dataset.sample) : 1,
  });
}
window.RUM = { init, captureError: (err) => api && api.captureError(err) };
