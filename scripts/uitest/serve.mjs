// Liten statisk server for dist/, startet INNE i testprosessen.
//
// vite preview og vite dev ble drept sammen med skallet som startet dem,
// også med nohup og setsid — og da feilet testen med
// ERR_CONNECTION_REFUSED i stedet for å teste noe. Serveren hører til
// testen, så den lever like lenge som den.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function serveDist(rootDir, port = 4180) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      // Én-sides-app: alt uten filendelse går til app/index.html
      if (!extname(path)) path = '/app/index.html';
      const file = join(rootDir, normalize(path).replace(/^(\.\.[/\\])+/, ''));
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('finnes ikke');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({
      base: `http://127.0.0.1:${port}`,
      close: () => new Promise((r) => server.close(r)),
    }));
  });
}
