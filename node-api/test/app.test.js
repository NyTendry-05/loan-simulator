import { describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLoanService } from '../src/services/loan-service.js';

const config = (extra = {}) => loadConfig({ LOAN_SERVICE_URL: 'http://loan.internal:8080', ...extra });

describe('configuration', () => {
  test('requires an upstream and validates origins and numeric limits', () => {
    expect(() => loadConfig({})).toThrow('LOAN_SERVICE_URL');
    for (const value of ['file:///private', 'http://user:password@host', 'http://host/path', 'http://host/?a=1', 'http://host/#fragment']) {
      expect(() => config({ LOAN_SERVICE_URL: value })).toThrow();
    }
    expect(() => config({ PORT: '0' })).toThrow('PORT');
    expect(() => config({ PORT: '65536' })).toThrow('PORT');
    expect(() => config({ RATE_LIMIT: 'NaN' })).toThrow('RATE_LIMIT');
    expect(() => config({ CORS_ORIGINS: '*' })).toThrow();
    expect(() => config({ CORS_ORIGINS: 'https://ui.test/path' })).toThrow();
    expect(config({ PORT: '4000', CORS_ORIGINS: 'https://ui.test, https://admin.test' }).origins)
      .toEqual(['https://ui.test', 'https://admin.test']);
  });
});

describe('API gateway', () => {
  test('health is public; all business routes need a bearer token', async () => {
    const upstream = jest.fn();
    const app = createApp(config(), upstream);
    expect((await request(app).get('/health')).body).toEqual({ status: 'UP' });
    const missing = await request(app).get('/api/v1/applications');
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer');
    expect(missing.body.requestId).toBeTruthy();
    expect((await request(app).get('/not-an-api')).status).toBe(404);
    expect((await request(app).get('/api/v1/internal').auth('token', { type: 'bearer' })).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  test('forwards exact payload and only allowed headers; preserves problem details', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ status: 422, detail: 'Missing documents' }), {
      status: 422, headers: { 'content-type': 'application/problem+json', 'set-cookie': 'secret=x' },
    }));
    const response = await request(createApp(config(), fetchImpl)).post('/api/v1/applications')
      .auth('signed-token', { type: 'bearer' }).set('Idempotency-Key', 'request-key')
      .set('Cookie', 'secret=y').set('X-User-Role', 'ADMIN').send({ amount: 100 });
    expect(response.status).toBe(422);
    expect(response.body.detail).toBe('Missing documents');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.href).toBe('http://loan.internal:8080/api/v1/applications');
    expect(options.headers.authorization).toBe('Bearer signed-token');
    expect(options.headers['idempotency-key']).toBe('request-key');
    expect(options.headers.cookie).toBeUndefined();
    expect(options.headers['x-user-role']).toBeUndefined();
    expect(JSON.parse(options.body.toString())).toEqual({ amount: 100 });
  });

  test('streams downloads and passes creation locations and empty responses', async () => {
    const binary = Buffer.from([0, 255, 128, 12]);
    const fetchImpl = jest.fn(async () => new Response(binary, {
      headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="proof.bin"' },
    }));
    const app = createApp(config(), fetchImpl);
    const result = await request(app).get('/api/v1/applications/id/documents/doc/content').auth('signed-token', { type: 'bearer' });
    expect(result.body).toEqual(binary);
    expect(result.headers['content-disposition']).toContain('attachment');
    expect(fetchImpl.mock.calls[0][1].body).toBeUndefined();
    fetchImpl.mockImplementationOnce(async () => new Response(null, { status: 201, headers: { location: '/api/v1/products/id' } }));
    const created = await request(app).post('/api/v1/products').auth('signed-token', { type: 'bearer' }).send({});
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe('/api/v1/products/id');
    fetchImpl.mockImplementationOnce(async () => new Response(null, { status: 204 }));
    expect((await request(app).delete('/api/v1/products/id').auth('signed-token', { type: 'bearer' })).status).toBe(204);
  });

  test('preserves multipart bytes and query parameters', async () => {
    const fetchImpl = jest.fn(async () => Response.json({ id: 'document' }, { status: 201 }));
    const app = createApp(config(), fetchImpl);
    const result = await request(app).post('/api/v1/applications/id/documents?type=IDENTITY')
      .auth('signed-token', { type: 'bearer' }).attach('file', Buffer.from('%PDF-proof'), 'proof.pdf');
    expect(result.status).toBe(201);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.search).toBe('?type=IDENTITY');
    expect(options.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(options.body.toString()).toContain('%PDF-proof');
  });

  test('rejects oversized and compressed requests before forwarding', async () => {
    const fetchImpl = jest.fn();
    const app = createApp(config({ MAX_REQUEST_BYTES: '10' }), fetchImpl);
    expect((await request(app).post('/api/v1/applications').auth('token', { type: 'bearer' }).send({ long: 'payload' })).status).toBe(413);
    expect((await request(app).post('/api/v1/applications').auth('token', { type: 'bearer' })
      .set('Content-Encoding', 'gzip').send('anything')).status).toBe(415);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('limits requests and permits only configured CORS origins', async () => {
    const app = createApp(config({ RATE_LIMIT: '1', CORS_ORIGINS: 'https://ui.test' }), async () => Response.json({}));
    expect((await request(app).get('/api/v1/products').auth('token', { type: 'bearer' })).status).toBe(200);
    expect((await request(app).get('/api/v1/products').auth('token', { type: 'bearer' })).status).toBe(429);
    const preflight = await request(app).options('/api/v1/applications').set('Origin', 'https://ui.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBe('https://ui.test');
    expect((await request(app).get('/health').set('Origin', 'https://evil.test')).headers['access-control-allow-origin']).toBeUndefined();
  });

  test('maps upstream failures without exposing internals or following redirects', async () => {
    const unavailable = createApp(config(), async () => { throw new Error('secret connection info'); });
    const response = await request(unavailable).get('/api/v1/products').auth('token', { type: 'bearer' });
    expect(response.status).toBe(502);
    expect(response.text).not.toContain('secret');
    const redirect = createApp(config(), async () => new Response('redirect', { status: 302, headers: { location: 'https://evil.test' } }));
    expect((await request(redirect).get('/api/v1/products').auth('token', { type: 'bearer' })).status).toBe(502);
    const timed = createApp(config({ UPSTREAM_TIMEOUT_MS: '10' }), async (_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
    expect((await request(timed).get('/api/v1/products').auth('token', { type: 'bearer' })).status).toBe(504);
  });

  test('covers all explicit workflow routes', async () => {
    const app = createApp(config(), async () => Response.json({ ok: true }));
    const routes = [
      ['get', '/products'], ['get', '/applications'], ['get', '/applications/id'], ['get', '/applications/id/events'],
      ['post', '/applications/id/submit'], ['post', '/applications/id/withdraw'], ['get', '/applications/id/documents'],
      ['delete', '/applications/id/documents/doc'], ['post', '/applications/id/documents/doc/verification'],
      ['get', '/reviews'], ['post', '/reviews/id/start'], ['post', '/reviews/id/decision'],
    ];
    for (const [method, path] of routes) expect((await request(app)[method]('/api/v1' + path).auth('token', { type: 'bearer' })).status).toBe(200);
  });

  test('service rejects URLs outside its configured origin or API prefix', async () => {
    const service = createLoanService(config(), jest.fn());
    for (const path of ['//evil.test/api/v1/products', '/admin']) {
      await expect(service.forward({ path, signal: new AbortController().signal })).rejects.toMatchObject({ status: 400 });
    }
  });
});

