import { ApiError } from '../models/api-error.js';

const COOKIE = 'nyt_session';
export function sessionToken(req) {
  const entry = (req.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='));
  return entry?.slice(COOKIE.length + 1) ?? null;
}
export function requireSameOrigin(config) {
  return (req, _res, next) => {
    if (req.headers.origin !== config.publicOrigin || req.headers['x-portal-request'] !== '1') {
      return next(new ApiError(403, 'Refresh the page and try again'));
    }
    next();
  };
}
export function cookieAuthentication(config) {
  return (req, res, next) => {
    if (req.headers.authorization) return next();
    const token = sessionToken(req);
    if (!token) return next();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return requireSameOrigin(config)(req, res, error => {
        if (error) return next(error);
        req.headers.authorization = 'Bearer ' + token;
        next();
      });
    }
    req.headers.authorization = 'Bearer ' + token;
    next();
  };
}
export function createSessionController(config, service) {
  const cookieOptions = { httpOnly: true, secure: config.publicOrigin.startsWith('https:'), sameSite: 'strict', path: '/' };
  async function call(req, path, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await service.forward({
      path: '/api/v1/auth/' + path, method: path === 'me' ? 'GET' : 'POST', headers,
      body: body ? JSON.stringify(body) : undefined, signal: new AbortController().signal,
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      throw new ApiError(response.status, problem?.detail ?? 'Your session has expired. Please sign in again.');
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    async login(req, res) {
      const result = await call(req, 'login', req.body);
      res.cookie(COOKIE, result.token, { ...cookieOptions, expires: new Date(result.expiresAt) });
      res.json(result.user);
    },
    async register(req, res) {
      const result = await call(req, 'register', req.body);
      res.cookie(COOKIE, result.token, { ...cookieOptions, expires: new Date(result.expiresAt) });
      res.status(201).json(result.user);
    },
    async me(req, res) {
      const token = sessionToken(req);
      if (!token) throw new ApiError(401, 'Please sign in');
      res.json(await call(req, 'me', null, token));
    },
    async logout(req, res) {
      const token = sessionToken(req);
      if (token) {
        try { await call(req, 'logout', null, token); }
        catch (error) { if (error.status !== 401) throw error; }
      }
      res.clearCookie(COOKIE, cookieOptions);
      res.status(204).end();
    },
  };
}
