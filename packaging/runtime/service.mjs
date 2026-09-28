// Container binding only: the governed contract/runtime remain application-owned.
import { createApp } from '../../server/dist/server/http.js';
import { Runtime } from '../../server/dist/server/runtime.js';
import { rehearsalOnly, port, shutdown } from './config.mjs';
rehearsalOnly();
const server = createApp(new Runtime({ source: 'REHEARSAL' }));
server.listen(port(process.env, 8787), '0.0.0.0', () => console.log('development / REHEARSAL service; live_qualified=false'));
shutdown(server);
