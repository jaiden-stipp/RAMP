import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../protocol.js';
import { diagnosticsOf } from '../validation.js';
import { createBuilderService } from './service.js';

const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
const directory = dirname(fileURLToPath(import.meta.url));
const maximumBody = 1024 * 1024;

export function createBuilderServer(manifestPath, root = REPO_ROOT) {
  const service = createBuilderService(resolve(manifestPath), root);
  return createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const send = (status, body, type = 'application/json') => {
      response.writeHead(status, { 'Content-Type': `${type}${type.startsWith('text/') || type === 'application/json' ? '; charset=utf-8' : ''}` });
      response.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    const port = request.socket.localPort;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(request.headers.host)) return send(403, { error: 'Local host required' });
    try {
      if (request.method === 'GET') {
        if (request.url === '/api/catalog') return send(200, service.catalog());
        const asset = assets.get(request.url);
        if (!asset) return send(404, { error: 'Not found' });
        return send(200, readFileSync(join(directory, asset[0])), asset[1]);
      }
      if (request.method !== 'POST' || !['/api/validate', '/api/export'].includes(request.url)) return send(404, { error: 'Not found' });
      // Exact host and same-origin checks prevent other sites from using this local authoring server.
      if (request.headers.origin !== `http://${request.headers.host}` || request.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(403, { error: 'Same-origin JSON request required' });
      let size = 0; const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maximumBody) { send(413, { error: 'Configuration exceeds 1 MiB' }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return send(400, { error: 'Invalid JSON' }); }
      const result = service.validate(body?.manifest);
      if (request.url === '/api/validate' || !result.valid) return send(result.valid ? 200 : 422, result);
      response.setHeader('Content-Disposition', 'attachment; filename="ramp-configuration.zip"');
      return send(200, service.archive(body.manifest), 'application/zip');
    } catch (error) { return send(422, { valid: false, diagnostics: diagnosticsOf(error, 'ramp.json') }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let manifestPath = join(REPO_ROOT, 'examples', 'literature-review', 'ramp.json');
  let port = 4173;
  try {
    if (args[0] && !args[0].startsWith('--')) manifestPath = resolve(args.shift());
    if (args.length) {
      if (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1])) throw new Error('Usage: npm run builder -- [ramp.json] [--port 4173]');
      port = Number(args[1]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535');
    }
    const server = createBuilderServer(manifestPath);
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`RAMP builder: http://127.0.0.1:${port}\nOpened ${manifestPath}\nConfiguration authoring only. Press Ctrl+C to stop.`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
