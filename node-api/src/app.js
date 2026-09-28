import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from './models/api-error.js';
import { createLoanService } from './services/loan-service.js';
import { createLoanController } from './controllers/loan-controller.js';
import { loanRoutes } from './routes/loan-routes.js';
import { createSessionController, cookieAuthentication, requireSameOrigin } from './controllers/session-controller.js';
import { portalView, publicDirectory } from './controllers/view-controller.js';

export function createApp(config, fetchImpl = fetch) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    'upgrade-insecure-requests': config.publicOrigin.startsWith('https:') ? [] : null,
  } } }));
  app.use((_req, res, next) => {
    res.setHeader('x-request-id', randomUUID());
    res.setHeader('cache-control', 'no-store');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || config.origins.includes(origin));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    exposedHeaders: ['Location', 'X-Request-Id'],
    credentials: false,
  }));
  app.get('/health', (_req, res) => res.json({ status: 'UP' }));
  app.use('/assets', express.static(publicDirectory, { index: false, dotfiles: 'deny' }));
  app.get('/', portalView);
  const service = createLoanService(config, fetchImpl);
  const sessions = createSessionController(config, service);
  app.use('/auth', rateLimit({ windowMs: config.rateWindowMs, limit: Math.min(config.rateLimit, 20),
    standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/auth/me', sessions.me);
  app.post('/auth/login', requireSameOrigin(config), express.json({ limit: '8kb' }), sessions.login);
  app.post('/auth/register', requireSameOrigin(config), express.json({ limit: '8kb' }), sessions.register);
  app.post('/auth/logout', requireSameOrigin(config), sessions.logout);
  app.use('/api/v1', cookieAuthentication(config));
  app.use('/api/v1', rateLimit({
    windowMs: config.rateWindowMs, limit: config.rateLimit,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, 'Request limit exceeded')),
  }));
  app.use('/api/v1', (req, _res, next) => {
    if (!/^Bearer [^\s]+$/i.test(req.headers.authorization ?? '')) {
      return next(new ApiError(401, 'Bearer token required'));
    }
    next();
  });
  app.use('/api/v1', express.raw({ type: () => true, limit: config.maxRequestBytes, inflate: false }));
  app.use('/api/v1', loanRoutes(createLoanController(service)));
  app.use((_req, _res, next) => next(new ApiError(404, 'Route not found')));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof ApiError ? error.status : error.status === 413 ? 413 : error.status === 415 ? 415 : 500;
    const detail = error instanceof ApiError ? error.message
      : status === 413 ? 'Request body exceeds the configured limit'
      : status === 415 ? 'Compressed request bodies are not supported' : 'Internal server error';
    if (status === 401) res.setHeader('www-authenticate', 'Bearer');
    res.status(status).type('application/problem+json').json({
      type: 'about:blank', title: status >= 500 ? 'Service error' : 'Request rejected',
      status, detail, requestId: res.getHeader('x-request-id'),
    });
  });
  return app;
}
