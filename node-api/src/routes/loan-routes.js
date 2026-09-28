import { Router } from 'express';

export function loanRoutes(controller) {
  const router = Router();
  router.get('/capabilities', controller);
  router.route('/products').get(controller).post(controller);
  router.route('/admin/users').get(controller).post(controller);
  router.route('/products/:id').get(controller).delete(controller);
  router.route('/applications').get(controller).post(controller);
  router.get('/applications/:id', controller);
  router.get('/applications/:id/events', controller);
  router.post('/applications/:id/submit', controller);
  router.post('/applications/:id/withdraw', controller);
  router.route('/applications/:id/documents').get(controller).post(controller);
  router.delete('/applications/:id/documents/:documentId', controller);
  router.get('/applications/:id/documents/:documentId/content', controller);
  router.post('/applications/:id/documents/:documentId/verification', controller);
  router.get('/reviews', controller);
  router.post('/reviews/:id/start', controller);
  router.post('/reviews/:id/decision', controller);
  return router;
}
