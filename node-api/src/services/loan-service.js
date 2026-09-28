import { ApiError } from '../models/api-error.js';

/** Relay only approved routes and headers. Spring validates every token and owns all business rules. */
export function createLoanService(config, fetchImpl = fetch) {
  return {
    async forward({ path, method, headers, body, signal }) {
      const url = new URL(path, config.upstream);
      if (url.origin !== config.upstream || !url.pathname.startsWith('/api/v1/')) {
        throw new ApiError(400, 'Invalid API path');
      }
      const timeout = AbortSignal.timeout(config.timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method, headers, body,
          signal: AbortSignal.any([signal, timeout]),
          redirect: 'manual',
        });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          throw new ApiError(502, 'Unexpected upstream redirect');
        }
        return response;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (timeout.aborted) throw new ApiError(504, 'Loan service timed out');
        throw new ApiError(502, 'Loan service unavailable');
      }
    },
  };
}

