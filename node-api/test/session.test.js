import { describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ LOAN_SERVICE_URL: 'http://127.0.0.1:8080' });
const origin = req => req.set('Origin', config.publicOrigin).set('X-Portal-Request', '1');
const fixture = () => ({ token: 'secret-session-token', expiresAt: '2099-01-01T00:00:00Z', user: { id: 'user', name: 'Customer', roles: ['CUSTOMER'] } });

describe('portal sessions', () => {
  test('serves the interface and static assets', async () => {
    const app = createApp(config);
    expect((await request(app).get('/')).text).toContain('ONLINE APPLICATION CENTRE');
    expect((await request(app).get('/assets/app.js')).status).toBe(200);
    expect((await request(app).get('/assets/styles.css')).status).toBe(200);
    expect((await request(app).get('/')).headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(() => loadConfig({ LOAN_SERVICE_URL: 'http://host', PUBLIC_ORIGIN: 'http://host/path' })).toThrow('PUBLIC_ORIGIN');
  });
  test('keeps tokens out of the response and sets an HttpOnly session cookie', async () => {
    const upstream = jest.fn(async () => Response.json(fixture()));
    const response = await origin(request(createApp(config, upstream)).post('/auth/login')).send({ email: 'user@example.test', password: 'private-password' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(fixture().user);
    expect(response.body.token).toBeUndefined();
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect(upstream.mock.calls[0][0].pathname).toBe('/api/v1/auth/login');
    expect(JSON.parse(upstream.mock.calls[0][1].body).email).toBe('user@example.test');
  });
  test('registration uses the same secure session flow', async () => {
    const https = loadConfig({ LOAN_SERVICE_URL: 'https://backend.test', PUBLIC_ORIGIN: 'https://portal.test' });
    const response = await request(createApp(https, async () => Response.json(fixture(), { status: 201 })))
      .post('/auth/register').set('Origin', https.publicOrigin).set('X-Portal-Request', '1').send({ name: 'Customer' });
    expect(response.status).toBe(201);
    expect(response.headers['set-cookie'][0]).toContain('Secure');
    expect(response.body.token).toBeUndefined();
  });
  test('rejects login and registration CSRF before contacting the backend', async () => {
    const upstream = jest.fn();
    const app = createApp(config, upstream);
    expect((await request(app).post('/auth/login').send({})).status).toBe(403);
    expect((await request(app).post('/auth/register').set('Origin', 'https://evil.test').set('X-Portal-Request', '1').send({})).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  test('loads the session profile and forwards cookies only as bearer tokens', async () => {
    const upstream = jest.fn(async () => Response.json(fixture().user));
    const app = createApp(config, upstream);
    expect((await request(app).get('/auth/me')).status).toBe(401);
    expect((await request(app).get('/auth/me').set('Cookie', 'other=value; nyt_session=token')).status).toBe(200);
    expect(upstream.mock.calls[0][1].headers.authorization).toBe('Bearer token');
    expect((await request(app).get('/api/v1/products').set('Cookie', 'nyt_session=token')).status).toBe(200);
    expect(upstream.mock.calls[1][1].headers.authorization).toBe('Bearer token');
    expect(upstream.mock.calls[1][1].headers.cookie).toBeUndefined();
  });
  test('protects cookie-authenticated mutations but supports bearer clients', async () => {
    const upstream = jest.fn(async () => Response.json({ id: 'created' }, { status: 201 }));
    const app = createApp(config, upstream);
    expect((await request(app).post('/api/v1/products').set('Cookie', 'nyt_session=token').send({})).status).toBe(403);
    expect((await origin(request(app).post('/api/v1/products').set('Cookie', 'nyt_session=token')).send({})).status).toBe(201);
    expect((await request(app).post('/api/v1/products').auth('explicit', { type: 'bearer' }).set('Cookie', 'nyt_session=ignored').send({})).status).toBe(201);
    expect(upstream.mock.calls[1][1].headers.authorization).toBe('Bearer explicit');
  });
  test('revokes the backend session and clears the browser cookie', async () => {
    const upstream = jest.fn(async () => new Response(null, { status: 204 }));
    const app = createApp(config, upstream);
    const response = await origin(request(app).post('/auth/logout').set('Cookie', 'nyt_session=token'));
    expect(response.status).toBe(204);
    expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    expect(upstream.mock.calls[0][0].pathname).toBe('/api/v1/auth/logout');
    expect((await origin(request(app).post('/auth/logout'))).status).toBe(204);
  });
  test('handles expired sessions and reports backend failures', async () => {
    const unauthorized = createApp(config, async () => new Response(null, { status: 401 }));
    expect((await request(unauthorized).get('/auth/me').set('Cookie', 'nyt_session=expired')).body.detail).toContain('expired');
    expect((await origin(request(unauthorized).post('/auth/logout').set('Cookie', 'nyt_session=expired'))).status).toBe(204);
    const failure = createApp(config, async () => Response.json({ detail: 'Unavailable' }, { status: 503 }));
    expect((await origin(request(failure).post('/auth/logout').set('Cookie', 'nyt_session=token'))).status).toBe(503);
    expect((await origin(request(failure).post('/auth/login')).send({})).body.detail).toBe('Unavailable');
  });
});
