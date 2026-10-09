import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateAlbumInput, isStatus } from '../public/js/contract.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
class HttpError extends Error {
  constructor(status, code, message, fields) { super(message); Object.assign(this, { status, code, fields }); }
}
const bad = (message, fields) => new HttpError(400, 'invalid_input', message, fields);
const missing = () => new HttpError(404, 'not_found', 'That album no longer exists. Refresh the collection.');

export function createApp({ dataDir }) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, 'crate.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('want_to_hear','listening','heard')),
      notes TEXT NOT NULL DEFAULT '', cover TEXT, position INTEGER NOT NULL
    );`);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare("SELECT value FROM metadata WHERE key='seeded'").get()) {
      const fixture = JSON.parse(readFileSync(join(root, 'fixtures/albums.json'), 'utf8')).albums;
      const insert = db.prepare('INSERT INTO albums VALUES (?, ?, ?, ?, ?, ?, ?)');
      fixture.forEach((a, i) => insert.run(a.id, a.title, a.artist, a.status, a.notes, a.cover, i));
      db.prepare("INSERT INTO metadata VALUES ('seeded', '1')").run();
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); db.close(); throw err; }

  const list = db.prepare('SELECT id,title,artist,status,notes,cover FROM albums ORDER BY position, id');
  const get = db.prepare('SELECT id,title,artist,status,notes,cover FROM albums WHERE id=?');
  function album(id) { const found = get.get(id); if (!found) throw missing(); return found; }
  async function body(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'unsupported_media_type', 'Send application/json.');
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) throw new HttpError(413, 'body_too_large', 'The request is too large.');
      chunks.push(chunk);
    }
    let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw bad('Send a valid JSON object.'); }
    if (!input || Array.isArray(input) || typeof input !== 'object') throw bad('Send an album object.');
    if (Object.keys(input).some(k => !['title', 'artist', 'notes', 'status'].includes(k))) throw bad('The request contains unsupported fields.');
    if (!Object.keys(input).length) throw bad('Provide album fields.');
    return input;
  }
  function json(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(value === undefined ? undefined : JSON.stringify(value));
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health' && req.method === 'GET') { db.prepare('SELECT 1').get(); return json(res, 200, { status: 'ok' }); }
      if (url.pathname === '/api/albums' || url.pathname.startsWith('/api/albums/')) {
        if (!['GET','HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) throw new HttpError(403, 'forbidden', 'Use the app to make changes.');
        const rawId = url.pathname.slice('/api/albums'.length);
        let id;
        if (rawId) {
          try { id = decodeURIComponent(rawId.slice(1)); } catch { throw bad('Invalid album ID.'); }
          if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw bad('Invalid album ID.');
        }
        if (req.method === 'GET') {
          if (id) return json(res, 200, album(id));
          const status = url.searchParams.get('status');
          if (status && !isStatus(status)) throw bad('Choose a valid status.');
          const q = (url.searchParams.get('q') ?? '').trim().toLocaleLowerCase();
          return json(res, 200, list.all().filter(a => (!status || a.status === status) && (!q || a.title.toLocaleLowerCase().includes(q) || a.artist.toLocaleLowerCase().includes(q))));
        }
        if (req.method === 'POST' && !id || req.method === 'PATCH' && id) {
          const partial = req.method === 'PATCH';
          if (partial) album(id);
          const { value, errors } = validateAlbumInput(await body(req), { partial });
          if (Object.keys(errors).length) throw bad('Check the highlighted fields.', errors);
          if (partial) {
            const keys = Object.keys(value);
            db.prepare(`UPDATE albums SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k => value[k]), id);
          } else {
            id = randomUUID();
            db.prepare('INSERT INTO albums VALUES (?, ?, ?, ?, ?, NULL, (SELECT COALESCE(MAX(position),-1)+1 FROM albums))').run(id, value.title, value.artist, value.status, value.notes);
          }
          return json(res, partial ? 200 : 201, album(id));
        }
        if (req.method === 'DELETE' && id) {
          const result = db.prepare('DELETE FROM albums WHERE id=?').run(id);
          if (!result.changes) throw missing();
          return json(res, 204);
        }
        throw new HttpError(405, 'method_not_allowed', 'This method is not available.');
      }
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'not_found', 'Endpoint not found.');
      if (!['GET','HEAD'].includes(req.method)) throw new HttpError(405, 'method_not_allowed', 'This method is not available.');
      let path; try { path = decodeURIComponent(url.pathname); } catch { throw bad('Invalid path.'); }
      const file = resolve(publicDir, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(publicDir + sep) || path.includes('\0') || path.startsWith('/design/')) throw new HttpError(404, 'not_found', 'Page not found.');
      let bytes; try { bytes = await readFile(file); } catch { throw new HttpError(404, 'not_found', 'Page not found.'); }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('Request failed:', err.code ?? err.name);
      if (!res.headersSent) json(res, status, { error: { code: status === 500 ? 'server_error' : err.code, message: status === 500 ? 'Something went wrong. Try again.' : err.message, ...(err.fields ? { fields: err.fields } : {}) } });
      else res.end();
    }
  });
  return { server, close: () => db.close() };
}
