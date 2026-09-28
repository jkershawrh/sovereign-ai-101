// Optional presentation-only development launcher. Start the existing rehearsal
// service separately. This does not alter vite.config.ts or server implementation.
import { createServer } from 'vite'
const target = 'http://127.0.0.1:8787'
const proxy = {
  target,
  changeOrigin: true,
  configure(instance) {
    instance.on('proxyReq', (outgoing, incoming) => {
      // Translate only this UI's same-origin requests. A foreign Origin is kept
      // intact so the rehearsal issuer can reject it; never erase Origin blindly.
      if (incoming.headers.origin === `http://${incoming.headers.host}`) outgoing.setHeader('origin', target)
    })
  },
}
const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true,
  proxy: { '/api': proxy, '/healthz': proxy, '/readyz': proxy } } })
await server.listen()
server.printUrls()
