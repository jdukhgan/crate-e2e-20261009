import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'crate-test-'));
  let app, base;
  async function start() {
    app = createApp({ dataDir: dir });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
    return async (path = '/api/albums', method = 'GET', body) => {
      const response = await fetch(base + path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    };
  }
  async function stop() { await new Promise(resolve => app.server.close(resolve)); app.close(); }
  t.after(async () => { await stop(); await rm(dir, { recursive: true }); });
  return { dir, get base() { return base; }, request: await start(), restart: async () => { await stop(); return start(); } };
}

test('CRUD, literal notes, direct status and combined search/filter persist after restart', async t => {
  const env = await setup(t); let request = env.request;
  assert.equal((await request()).body.length, 8);
  const added = await request('/api/albums', 'POST', { title: '  Unique 🌕  ', artist: 'Écho Artist', notes: '  <script>alert(1)</script>\n literal  ' });
  assert.equal(added.status, 201); assert.equal(added.body.title, 'Unique 🌕'); assert.equal(added.body.cover, null);
  const id = added.body.id;
  assert.equal((await request(`/api/albums/${id}`)).body.notes, '  <script>alert(1)</script>\n literal  ');
  assert.equal((await request(`/api/albums/${id}`, 'PATCH', { status: 'heard' })).body.status, 'heard');
  assert.equal((await request('/api/albums?q=éCHO&status=heard')).body.length, 1);
  assert.equal((await request('/api/albums?q=unique&status=listening')).body.length, 0);
  assert.equal((await request('/api/albums?q=%25')).body.length, 0);
  request = await env.restart();
  assert.equal((await request(`/api/albums/${id}`)).body.status, 'heard');
  assert.equal((await request(`/api/albums/${id}`, 'DELETE')).status, 204);
  assert.equal((await request(`/api/albums/${id}`, 'PATCH', { status: 'heard' })).status, 404);
  assert.equal((await request(`/api/albums/${id}`, 'DELETE')).status, 404);
});

test('seed marker survives deliberately emptying and restarting', async t => {
  const env = await setup(t);
  for (const album of (await env.request()).body) assert.equal((await env.request(`/api/albums/${album.id}`, 'DELETE')).status, 204);
  const request = await env.restart();
  assert.deepEqual((await request()).body, []);
});

test('Unicode boundaries, required fields, malformed inputs and IDs fail safely', async t => {
  const { request } = await setup(t);
  const input = { title: '🌕'.repeat(160), artist: 'é'.repeat(120), notes: '🌕'.repeat(4000) };
  assert.equal((await request('/api/albums', 'POST', input)).status, 201);
  for (const [field, value] of [['title', input.title + 'x'], ['artist', input.artist + 'x'], ['notes', input.notes + 'x'], ['title', '   '], ['artist', 4], ['status', 'unknown']]) {
    const result = await request('/api/albums', 'POST', { ...input, [field]: value });
    assert.equal(result.status, 400); assert.ok(result.body.error.fields[field]);
  }
  for (const body of [null, [], {}, { title: 't', artist: 'a', cover: '/bad' }]) assert.equal((await request('/api/albums', 'POST', body)).status, 400);
  assert.equal((await request('/api/albums/bad%20id')).status, 400);
  assert.equal((await request('/api/albums/not-present')).status, 404);
  assert.equal((await request('/api/albums?status=bogus')).status, 400);
});


test('database write failures return safe retryable errors without mutating records', async t => {
  const { request, dir } = await setup(t);
  const before = (await request()).body;
  const db = new DatabaseSync(join(dir, 'crate.sqlite'));
  for (const action of ['INSERT', 'UPDATE', 'DELETE']) db.exec(`CREATE TRIGGER fail_${action} BEFORE ${action} ON albums BEGIN SELECT RAISE(ABORT, 'private database detail'); END`);
  for (const [path, method, input] of [['/api/albums', 'POST', { title: 'Failed', artist: 'Test' }], [`/api/albums/${before[0].id}`, 'PATCH', { status: 'listening' }], [`/api/albums/${before[0].id}`, 'DELETE']]) {
    const result = await request(path, method, input);
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: { code: 'server_error', message: 'Something went wrong. Try again.' } });
  }
  assert.deepEqual((await request()).body, before);
  for (const action of ['INSERT', 'UPDATE', 'DELETE']) db.exec(`DROP TRIGGER fail_${action}`);
  db.close();
  assert.equal((await request('/api/albums', 'POST', { title: 'Retry', artist: 'Test' })).status, 201);
});


test('HTTP rejects malformed/oversized requests, cross-origin writes and private paths', async t => {
  const env = await setup(t);
  const send = (body, headers = {}) => fetch(env.base + '/api/albums', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  assert.equal((await send('{bad')).status, 400);
  assert.equal((await send('{}', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await send('x'.repeat(65537))).status, 413);
  assert.equal((await send(JSON.stringify({ title: 't', artist: 'a' }), { origin: 'https://other.invalid' })).status, 403);
  for (const path of ['/design/reference.html', '/%2e%2e%2fPRODUCT.md', '/.git/config', '/api/unknown']) assert.equal((await fetch(env.base + path)).status, 404);
  const index = await fetch(env.base + '/');
  assert.equal(index.status, 200); assert.match(await index.text(), /createApiStore/);
  const health = await fetch(env.base + '/health');
  assert.deepEqual(await health.json(), { status: 'ok' });
});
