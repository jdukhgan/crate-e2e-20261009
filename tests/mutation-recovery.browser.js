// Run in a browser on the application origin; exercises the actual view module.
// Injected store faults leave the retained preview database untouched.
export async function mutationRecovery() {
  const { mountLibrary } = await import('/js/library-view.js');
  const results = [];
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const wait = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw Error('Timed out waiting for view');
  };
  for (const action of ['edit', 'create', 'delete', 'hidden-edit']) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    let records = [{ id: 'one', title: 'Old title', artist: 'Artist', notes: 'Old notes', status: 'want_to_hear', cover: null }];
    let failList = false;
    const store = {
      async list({ q }) {
        if (failList) throw Object.assign(Error('Injected refresh failure'), { status: 500 });
        return structuredClone(records.filter(a => !q || `${a.title} ${a.artist}`.toLowerCase().includes(q.toLowerCase())));
      },
      async update(id, patch) {
        const album = records.find(a => a.id === id);
        Object.assign(album, patch);
        failList = true;
        return structuredClone(album);
      },
      async create(input) {
        const album = { ...input, id: 'two', cover: null };
        records.push(album);
        failList = true;
        return structuredClone(album);
      },
      async remove(id) { records = records.filter(a => a.id !== id); failList = true; },
    };
    const view = mountLibrary(root, { store });
    await wait(() => !view.state.loading);
    const click = label => {
      const btn = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === label);
      check(btn, `Missing button: ${label}`);
      btn.click();
    };
    if (action === 'hidden-edit') {
      const search = root.querySelector('#search');
      search.value = 'Old'; search.dispatchEvent(new Event('input'));
      await wait(() => view.state.q === 'Old' && !view.state.loading);
    }
    if (action === 'delete') {
      click('Delete'); click('Delete album');
    } else {
      click(action === 'create' ? 'Add album' : 'Edit');
      root.querySelector('#field-title').value = 'Saved title';
      root.querySelector('#field-notes').value = 'Saved notes';
      root.querySelector('#field-artist').value = 'Artist';
      root.querySelector('input[name="editor-status"][value="heard"]').checked = true;
      root.querySelector('form.editor').requestSubmit();
    }
    await wait(() => !view.state.mutationPending && view.state.loadError);
    check(!root.querySelector('#search').readOnly, `${action}: navigation must unlock`);
    check(root.textContent.includes('Check your connection and try again.'), `${action}: retry explanation`);
    if (action === 'delete') {
      check(!root.querySelector('[data-album-id="one"]'), 'Committed deletion must remove retained tile');
      check(view.state.albums.length === 0, 'Committed deletion must update retained count');
      check(document.activeElement.textContent.trim() === 'Add album', 'Empty deletion focus returns to Add album');
    } else {
      check(root.querySelector('#detail-title').textContent === 'Saved title', `${action}: detail must show committed title`);
      check(root.querySelector('#filter-heard').closest('label').querySelector('.filter-count').textContent === String(action === 'hidden-edit' ? 0 : 1), `${action}: committed status count`);
      if (action !== 'create') check(document.activeElement.textContent.trim() === 'Edit', `${action}: focus returns after controls unlock`);
      click('Edit');
      check(root.querySelector('#field-title').value === 'Saved title', `${action}: reopened title must be committed`);
      check(root.querySelector('#field-notes').value === 'Saved notes', `${action}: reopened notes must be committed`);
      check(root.querySelector('input[name="editor-status"]:checked').value === 'heard', `${action}: reopened status must be committed`);
      root.querySelector('form.editor').requestSubmit();
      await wait(() => !view.state.mutationPending && view.state.mode === 'view');
      check(records.at(-1).title === 'Saved title' && records.at(-1).notes === 'Saved notes', `${action}: second save must not overwrite committed fields`);
    }
    failList = false;
    click('Reload collection');
    await wait(() => !view.state.loading && !view.state.loadError);
    if (action === 'hidden-edit') {
      check(!root.querySelector('[data-album-id="one"]'), 'Renamed album must leave search results');
      check(root.querySelector('#detail-title')?.textContent === 'Saved title', 'Hidden saved selection survives successful retry');
      click('Edit');
      check(root.querySelector('#field-notes').value === 'Saved notes', 'Hidden selection remains editable after retry');
    }
    results.push(`${action}: passed`);
  }
  return results;
}
