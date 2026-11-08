import { describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { formatMoney, paymentHeadline } from '../public/calculator-utils.js';

const config = (extra = {}) => loadConfig({ LOAN_SERVICE_URL: 'http://loan.internal:8080', ...extra });
const scenario = { principal: '25000', annualInterestRate: '7.5', termMonths: 60, currencyScale: 2 };
const endpoint = '/api/v1/simulations/repayment';

describe('public simulator gateway', () => {
  test('serves calculator and demo portal independently without an account', async () => {
    const upstream = jest.fn(); const app = createApp(config(), upstream);
    const home = await request(app).get('/');
    expect(home.status).toBe(200); expect(home.text).toContain('Simulation only.');
    expect(home.text).toContain('No account or personal details needed.');
    expect(home.text).toContain('href="/portal"');
    const portal = await request(app).get('/portal');
    expect(portal.status).toBe(200); expect(portal.text).toContain('Demonstration portal.');
    expect(portal.text).toContain('Do not enter real personal information');
    for (const asset of ['simulator.js', 'simulator.css', 'calculator-utils.js']) expect((await request(app).get('/assets/' + asset)).status).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
  });
  test('calculator-only mode omits portal links without changing authentication', async () => {
    const settings = config({ PUBLIC_DEMO_PORTAL: 'false' });
    const app = createApp(settings, jest.fn());
    const home = await request(app).get('/');
    expect(home.status).toBe(200); expect(home.text).not.toContain('href="/portal"');
    expect(home.text).not.toContain('portal-invitation'); expect(home.text).toContain('Simulation only.');
    expect((await request(app).get('/portal')).status).toBe(200);
    expect((await request(app).get('/api/v1/products')).status).toBe(401);
    expect(() => config({ PUBLIC_DEMO_PORTAL: 'yes' })).toThrow('PUBLIC_DEMO_PORTAL');
  });
  test('forwards public simulations without authorization, cookies, or identities', async () => {
    const result = { monthlyPayment: '500.95', estimateOnly: true };
    const upstream = jest.fn(async () => Response.json(result));
    const response = await request(createApp(config(), upstream)).post(endpoint).auth('private-token', { type: 'bearer' })
      .set('Cookie', 'nyt_session=private-cookie').set('Idempotency-Key', 'not-applicable').set('X-User-Role', 'ADMIN').send(scenario);
    expect(response.status).toBe(200); expect(response.body).toEqual(result);
    const [url, options] = upstream.mock.calls[0];
    expect(url.pathname).toBe(endpoint); expect(JSON.parse(options.body.toString())).toEqual(scenario);
    expect(options.headers.authorization).toBeUndefined(); expect(options.headers.cookie).toBeUndefined();
    expect(options.headers['idempotency-key']).toBeUndefined(); expect(options.headers['x-user-role']).toBeUndefined();
    expect((await request(createApp(config(), upstream)).get('/api/v1/products')).status).toBe(401);
  });
  test('bounds public payloads and content types before forwarding', async () => {
    const upstream = jest.fn(); const app = createApp(config(), upstream);
    expect((await request(app).post(endpoint).send('principal=25000')).status).toBe(415);
    expect((await request(app).post(endpoint).send({ principal: '1'.repeat(5000) })).status).toBe(413);
    expect((await request(app).post(endpoint).set('Content-Type', 'application/json').set('Content-Encoding', 'gzip').send('data')).status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });
  test('public rate limit produces JSON and does not exhaust session actions', async () => {
    const app = createApp(config({ RATE_LIMIT: '1' }), async () => Response.json({}));
    expect((await request(app).post(endpoint).send(scenario)).status).toBe(200);
    const limited = await request(app).post(endpoint).send(scenario);
    expect(limited.status).toBe(429); expect(limited.type).toBe('application/problem+json');
    expect((await request(app).get('/auth/me')).status).toBe(401);
  });
});

describe('exact financial display', () => {
  test('preserves cents above binary float safe integer precision', () => {
    expect(formatMoney('123456789012345.67', 'USD', 2)).toBe('$123,456,789,012,345.67');
    expect(formatMoney('25000', 'EUR', 2)).toBe('€25,000.00');
    expect(formatMoney('1200', 'JPY', 0)).toBe('¥1,200');
    expect(formatMoney('0.01', 'USD', 2)).toBe('$0.01');
    expect(() => formatMoney('1.111', 'USD', 2)).toThrow('precision');
    expect(() => formatMoney('NaN', 'USD', 2)).toThrow('decimal');
  });
});

test('single-payment headline uses the actual ledger instalment', () => {
  expect(paymentHeadline({ repaymentMonths: 1, monthlyPayment: '1.01', schedule: [{ payment: '1.00' }] }))
    .toEqual({ single: true, amount: '1.00' });
  expect(paymentHeadline({ repaymentMonths: 12, monthlyPayment: '106.62', schedule: [{ payment: '106.62' }] }))
    .toEqual({ single: false, amount: '106.62' });
});
