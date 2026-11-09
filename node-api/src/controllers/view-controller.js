import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
export const publicDirectory = fileURLToPath(new URL('../../public', import.meta.url));
export function portalView(_req, res) { res.sendFile(publicDirectory + '/index.html'); }
export function simulatorView(config) {
  return async (_req, res) => {
    const html = await readFile(publicDirectory + '/simulator.html', 'utf8');
    // Only a boolean controls fixed template sections. No environment text enters HTML.
    res.type('html').send(config.publicDemoPortal ? html
      : html.replace(/<!-- DEMO_PORTAL_START -->[\s\S]*?<!-- DEMO_PORTAL_END -->/g, ''));
  };
}
