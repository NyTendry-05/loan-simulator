import { fileURLToPath } from 'node:url';
export const publicDirectory = fileURLToPath(new URL('../../public', import.meta.url));
export function portalView(_req, res) { res.sendFile(publicDirectory + '/index.html'); }

