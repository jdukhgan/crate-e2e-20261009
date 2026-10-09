// Design-reference store: in-memory copy of fixtures/albums.json with the same
// async interface as the real store. URL toggles demonstrate states:
//   ?fail=list|save|status|delete   reject that call once with a 500
//   ?gone=1                         the next mutation answers 404 (stale record)
//   ?empty=1                        start with an empty collection
//   ?latency=ms                     simulated latency (default 350)
import { validateAlbumInput } from '../js/contract.js';

export async function createMockStore(params = new URLSearchParams(location.search)) {
  const fixture = await (await fetch('/fixtures/albums.json')).json();
  let albums = params.get('empty') ? [] : fixture.albums.map((a) => ({ ...a }));
  const latency = Number(params.get('latency') ?? 350);
  const failOnce = new Set((params.get('fail') ?? '').split(',').filter(Boolean));
  let gone = Boolean(params.get('gone'));
  const wait = () => new Promise((r) => setTimeout(r, latency));
  const fail = (kind) => {
    if (!failOnce.delete(kind)) return;
    throw Object.assign(new Error('Server error'), { status: 500, code: 'internal' });
  };
  const notFound = () => Object.assign(new Error('Album not found.'), { status: 404, code: 'not_found' });
  const checkGone = (id) => {
    if (gone) { gone = false; albums = albums.filter((a) => a.id !== id); throw notFound(); }
    if (!albums.some((a) => a.id === id)) throw notFound();
  };

  return {
    async list({ q = '' } = {}) {
      await wait(); fail('list');
      const needle = q.trim().toLocaleLowerCase();
      return albums.filter((a) => !needle || a.title.toLocaleLowerCase().includes(needle) || a.artist.toLocaleLowerCase().includes(needle)).map((a) => ({ ...a }));
    },
    async create(input) {
      await wait(); fail('save');
      const { value, errors } = validateAlbumInput(input);
      if (Object.keys(errors).length) throw Object.assign(new Error('Check the highlighted fields.'), { status: 400, code: 'invalid', fields: errors });
      const album = { id: `alb-${crypto.randomUUID().slice(0, 8)}`, cover: null, ...value };
      albums.unshift(album);
      return { ...album };
    },
    async update(id, patch) {
      await wait();
      fail(Object.keys(patch).length === 1 && 'status' in patch ? 'status' : 'save');
      checkGone(id);
      const { value, errors } = validateAlbumInput(patch, { partial: true });
      if (Object.keys(errors).length) throw Object.assign(new Error('Check the highlighted fields.'), { status: 400, code: 'invalid', fields: errors });
      const album = albums.find((a) => a.id === id);
      Object.assign(album, value);
      return { ...album };
    },
    async remove(id) {
      await wait(); fail('delete'); checkGone(id);
      albums = albums.filter((a) => a.id !== id);
    },
  };
}
