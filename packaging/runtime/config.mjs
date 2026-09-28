export function rehearsalOnly(env = process.env) {
  if ((env.SOVEREIGN_SOURCE ?? 'REHEARSAL') !== 'REHEARSAL' ||
      (env.DELIVERY_STATUS ?? 'development') !== 'development') {
    throw new Error('Packaging supports development / REHEARSAL only; live and certification labels are refused.');
  }
}
export function port(env = process.env, fallback = 8080) {
  const value = Number(env.PORT ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error('Invalid unprivileged PORT');
  return value;
}
export function upstream(value = process.env.SERVICE_URL ?? 'http://rehearsal:8787') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('SERVICE_URL must be an HTTP(S) origin without credentials');
  return url;
}
export function shutdown(server) {
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    server.close(); server.closeAllConnections();
  });
}
