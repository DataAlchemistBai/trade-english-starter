import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const base = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PORT must be 0–65535');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.md':'text/plain; charset=utf-8' };
const withinRoot = filename => { const relative = path.relative(root, filename); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };

const server = http.createServer(async (request, response) => {
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405, {Allow:'GET, HEAD'}); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  if(base!=='/'){
    if(pathname===base.slice(0,-1)){response.writeHead(301,{Location:base});response.end();return;}
    if(!pathname.startsWith(base)){response.writeHead(404);response.end();return;}
    pathname=pathname.slice(base.length-1);
  }
  if (pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) { response.writeHead(403); response.end('Forbidden'); return; }
  const requested = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  try {
    if (!withinRoot(requested)) { response.writeHead(403); response.end(); return; }
    const filename = await realpath(requested);
    if (!withinRoot(filename)) { response.writeHead(403); response.end(); return; }
    const info = await stat(filename);
    if (!info.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    const headers = {'Content-Type':types[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'};
    let start = 0, end = info.size - 1, status = 200;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!match || (!match[1] && !match[2])) { response.writeHead(416, {'Content-Range':`bytes */${info.size}`}); response.end(); return; }
      if (!match[1]) { start = Math.max(0, info.size - Number(match[2])); }
      else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= info.size) { response.writeHead(416, {'Content-Range':`bytes */${info.size}`}); response.end(); return; }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = info.size ? end - start + 1 : 0;
    response.writeHead(status, headers);
    if (request.method === 'HEAD' || !info.size) { response.end(); return; }
    const stream = createReadStream(filename, {start, end});
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch { if (!response.headersSent) { response.writeHead(404); response.end('Not found'); } else response.destroy(); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Trade English Starter: http://127.0.0.1:${server.address().port}${base}\nLocal development only. Press Ctrl+C to stop.`));
