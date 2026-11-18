import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestEstimate } from '../public/calculator-request.js';

const body = { principal: '25000', annualInterestRate: '7.5', termMonths: 60, currencyScale: 2 };
const quick = { retryDelayMs: 1, totalTimeoutMs: 1000, attemptTimeoutMs: 500 };

test('HTML cold-start errors recover using the same anonymous estimate, without parsing error pages', async () => {
  const statuses = [502, 503, 504, 200], retries = [], requests = [];
  const outcome = await requestEstimate(body, { ...quick, onRetry: n => retries.push(n), fetchImpl: async (url, options) => {
    requests.push({ url, ...options });
    const status = statuses.shift();
    return status === 200 ? Response.json({ ready: true }) : new Response('<html>Private startup error</html>', { status });
  } });
  assert.deepEqual(outcome.data, { ready: true });
  assert.deepEqual(retries, [1, 2, 3]);
  assert.equal(requests.length, 4);
  for (const request of requests) {
    assert.equal(request.url, '/api/v1/simulations/repayment');
    assert.equal(request.method, 'POST'); assert.equal(request.credentials, 'omit');
    assert.deepEqual(JSON.parse(request.body), body);
  }
});

for (const status of [200, 400, 401, 403, 422, 429, 500]) {
  test(`status ${status} is not retried`, async () => {
    let calls = 0;
    const outcome = await requestEstimate(body, { ...quick, fetchImpl: async () => { calls++; return Response.json({}, { status }); } });
    assert.equal(calls, 1); assert.equal(outcome.response.status, status);
  });
}

test('persistent startup failures stop at the attempt limit', async () => {
  let calls = 0;
  const outcome = await requestEstimate(body, { ...quick, maxAttempts: 3,
    fetchImpl: async () => { calls++; return new Response('unavailable', { status: 502 }); } });
  assert.equal(calls, 3); assert.equal(outcome.response.status, 502); assert.equal(outcome.data, null);
});

test('cancelling a scheduled retry stops all later requests', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(requestEstimate(body, { ...quick, signal: controller.signal,
    onRetry: () => controller.abort(), fetchImpl: async () => { calls++; return new Response('', { status: 503 }); } }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('the total deadline also bounds waiting between attempts', async () => {
  let calls = 0;
  await assert.rejects(requestEstimate(body, { ...quick, totalTimeoutMs: 10, retryDelayMs: 50,
    fetchImpl: async () => { calls++; return new Response('', { status: 504 }); } }), { name: 'TimeoutError' });
  assert.equal(calls, 1);
});

for (const phase of ['request', 'body']) {
  test(`cancellation during ${phase} stops the estimate`, async () => {
    const controller = new AbortController();
    const interrupted = signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      controller.abort();
    });
    await assert.rejects(requestEstimate(body, { ...quick, signal: controller.signal,
      fetchImpl: async (_url, options) => phase === 'request' ? interrupted(options.signal)
        : { status: 200, json: () => interrupted(options.signal) } }), { name: 'AbortError' });
  });
}

test('network failures are not retried and preserve the original error', async () => {
  let calls = 0;
  await assert.rejects(requestEstimate(body, { ...quick,
    fetchImpl: async () => { calls++; throw new TypeError('offline'); } }), /offline/);
  assert.equal(calls, 1);
});
