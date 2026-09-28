import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const server = createApp(config).listen(config.port, config.host, () => {
  console.info(`Loan API listening on ${config.host}:${config.port}`);
});
server.requestTimeout = config.timeoutMs;
server.headersTimeout = Math.min(config.timeoutMs, 60000);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => { server.closeAllConnections(); }, config.shutdownTimeoutMs);
    deadline.unref();
    server.close(error => {
      clearTimeout(deadline);
      process.exitCode = error ? 1 : 0;
    });
  });
}

