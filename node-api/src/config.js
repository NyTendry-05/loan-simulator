function integer(value, fallback, name, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error(`Invalid ${name}`);
  return parsed;
}

export function loadConfig(env = process.env) {
  if (!env.LOAN_SERVICE_URL) throw new Error('LOAN_SERVICE_URL is required');
  const upstream = new URL(env.LOAN_SERVICE_URL);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password
      || upstream.pathname !== '/' || upstream.search || upstream.hash) {
    throw new Error('LOAN_SERVICE_URL must be an HTTP(S) origin without credentials');
  }
  const origins = (env.CORS_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const port = integer(env.PORT, 3000, 'PORT', 65535);
  const publicOrigin = env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:' + port;
  if (new URL(publicOrigin).origin !== publicOrigin || !/^https?:/.test(publicOrigin)) throw new Error('Invalid PUBLIC_ORIGIN');
  if (origins.some(value => new URL(value).origin !== value || !/^https?:/.test(value))) {
    throw new Error('CORS_ORIGINS must contain exact HTTP(S) origins');
  }
  return Object.freeze({
    upstream: upstream.origin,
    publicOrigin,
    host: env.HOST ?? '127.0.0.1',
    port,
    timeoutMs: integer(env.UPSTREAM_TIMEOUT_MS, 15000, 'UPSTREAM_TIMEOUT_MS'),
    maxRequestBytes: integer(env.MAX_REQUEST_BYTES, 6291456, 'MAX_REQUEST_BYTES'),
    rateWindowMs: integer(env.RATE_WINDOW_MS, 60000, 'RATE_WINDOW_MS'),
    rateLimit: integer(env.RATE_LIMIT, 120, 'RATE_LIMIT'),
    shutdownTimeoutMs: integer(env.SHUTDOWN_TIMEOUT_MS, 10000, 'SHUTDOWN_TIMEOUT_MS'),
    origins,
  });
}
