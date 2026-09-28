import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const RESPONSE_HEADERS = ['content-type', 'content-disposition', 'location', 'www-authenticate'];

export function createLoanController(service) {
  return async (req, res) => {
    const abort = new AbortController();
    const onClose = () => { if (!res.writableEnded) abort.abort(); };
    res.on('close', onClose);
    const headers = { 'x-request-id': res.getHeader('x-request-id') };
    for (const name of ['authorization', 'content-type', 'idempotency-key', 'accept']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    try {
      const response = await service.forward({
        path: req.originalUrl,
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) || !req.body?.length ? undefined : req.body,
        signal: abort.signal,
      });
      res.status(response.status);
      for (const name of RESPONSE_HEADERS) {
        const value = response.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (response.body) await pipeline(Readable.fromWeb(response.body), res);
      else res.end();
    } finally {
      res.off('close', onClose);
    }
  };
}

