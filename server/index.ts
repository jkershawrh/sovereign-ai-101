import { createApp } from './http.js';
import { Runtime } from './runtime.js';
import type { Source } from '../contracts/governed-inference.js';

const mode = process.env.SOVEREIGN_SOURCE ?? 'REHEARSAL';
if (!['REHEARSAL', 'LIVE', 'OFFLINE'].includes(mode)) throw new Error('Invalid SOVEREIGN_SOURCE');
const port = Number(process.env.PORT ?? '8787');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const app = createApp(new Runtime({ source: mode as Source }));
app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Sovereign AI 101 boundary on http://127.0.0.1:${port}; ${mode === 'LIVE' ? 'OFFLINE (live dependencies unimplemented)' : mode}\n`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  app.close(); app.closeAllConnections();
});
