export class RequestError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const outgoing = { 'X-Portal-Request': '1', ...headers };
  if (body !== undefined && !(body instanceof FormData)) outgoing['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', headers: outgoing,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000) });
  } catch { throw new RequestError('We couldn’t reach the service. Please try again.', 0); }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw new RequestError(data?.detail ?? (response.status === 429 ? 'Too many requests. Please wait a moment.' : 'This request could not be completed.'), response.status);
  }
  return data;
}
export const api = (path, options) => request('/api/v1' + path, options);

