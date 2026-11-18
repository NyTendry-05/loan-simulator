// Only the stateless public estimate is retried. Never use this for portal mutations.
const retryableStatuses = new Set([502, 503, 504]);
function wait(ms, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function requestEstimate(body, { signal, onRetry = () => {}, fetchImpl = fetch,
  retryDelayMs = 10000, totalTimeoutMs = 180000, attemptTimeoutMs = 20000, maxAttempts = 18 } = {}) {
  const deadline = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(totalTimeoutMs)]);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    deadline.throwIfAborted();
    const attemptSignal = AbortSignal.any([deadline, AbortSignal.timeout(attemptTimeoutMs)]);
    const response = await fetchImpl('/api/v1/simulations/repayment', {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body), signal: attemptSignal,
    });
    attemptSignal.throwIfAborted();
    if (retryableStatuses.has(response.status) && attempt < maxAttempts) {
      // Render can return HTML during startup. Do not parse or display upstream error pages.
      await response.body?.cancel();
      deadline.throwIfAborted();
      onRetry(attempt);
      await wait(retryDelayMs, deadline);
      continue;
    }
    const data = await response.json().catch(() => null);
    attemptSignal.throwIfAborted();
    return { response, data };
  }
}
