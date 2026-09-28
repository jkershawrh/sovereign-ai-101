const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? '8080'}/readyz`, { signal: AbortSignal.timeout(3000) });
const body = await response.json();
if (!response.ok || body.ready !== true || body.source !== 'REHEARSAL' || body.live_qualified !== false) process.exit(1);
