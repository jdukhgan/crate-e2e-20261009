// Crate library screen: cover wall + detail pane, editor, delete confirmation,
// search/filter, announcements and focus rules. Data access is injected as a
// `store` with this async interface (Builder supplies the fetch-backed one):
//
//   list({ q })            -> Album[]            (all statuses matching q)
//   create(input)          -> Album
//   update(id, patch)      -> Album              (patch may be { status } only)
//   remove(id)             -> void
//
// Failures reject with an Error carrying { status, code, fields? } mirroring
// the API error body; status 404 means the record is gone.
import { STATUSES, STATUS_LABELS, validateAlbumInput } from './contract.js';
import {
  h, icon, button, setPending, isPending, albumTile, skeletonTiles, sleeve, playSleeve,
  statusSwitch, inlineAlert, emptyState, createToaster, createAnnouncer, albumEditor,
} from './components.js';
import { themeToggle } from './theme.js';

const OVERLAY_QUERY = '(max-width: 959px)';

export function mountLibrary(root, { store }) {
  const state = {
    albums: [],
    q: '',
    status: 'all',
    selectedId: null,
    savedSelection: null,
    mode: 'view', // view | edit | create | confirm-delete
    loading: true,
    loadError: null,
    opener: null, // element that opened the pane/editor, for focus return
    paneOpen: false, // overlay layouts only
    listToken: 0,
    mutationPending: false,
  };
  const overlayMq = window.matchMedia(OVERLAY_QUERY);
  const isOverlay = () => overlayMq.matches;

  // ------------------------------------------------------------ shell
  const searchInput = h('input', {
    id: 'search', class: 'search-input', type: 'search', placeholder: 'Search title or artist',
    autocomplete: 'off', spellcheck: 'false', 'aria-controls': 'wall',
  });
  const clearSearch = button({ label: 'Clear search', iconName: 'close', iconOnly: true, variant: 'ghost', class: 'btn btn-ghost btn-icon search-clear', hidden: true });
  const addBtn = button({ label: 'Add album', variant: 'primary', iconName: 'plus', class: 'btn btn-primary add-btn' });
  const heading = h('h1', { class: 'collection-title', id: 'collection-heading', tabindex: '-1' }, 'Collection');
  const total = h('span', { class: 'collection-total' });
  const filters = h('fieldset', { class: 'filters' }, h('legend', { class: 'sr-only', text: 'Filter by status' }));
  const resultLine = h('p', { class: 'result-line', id: 'result-line' });
  const wall = h('ul', { class: 'wall', id: 'wall', role: 'list', 'aria-labelledby': 'collection-heading', 'aria-describedby': 'result-line' });
  const wallSlot = h('div', { class: 'wall-slot' }, wall);
  const pane = h('aside', { class: 'pane', id: 'pane', 'aria-label': 'Album details' });
  const scrim = h('div', { class: 'scrim', hidden: true });
  const toastRegion = h('div', { class: 'toast-region' });
  const liveRegion = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const toast = createToaster(toastRegion);
  const announce = createAnnouncer(liveRegion);

  const shell = h('div', { class: 'app' },
    h('a', { class: 'skip-link', href: '#wall' }, 'Skip to collection'),
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('crate', { size: 22 })), h('span', { class: 'wordmark', text: 'Crate' })),
      h('form', { class: 'search', role: 'search', onsubmit: (e) => e.preventDefault() },
        h('label', { class: 'sr-only', for: 'search', text: 'Search albums by title or artist' }),
        icon('search'), searchInput, clearSearch),
      h('div', { class: 'topbar-actions' }, themeToggle(), addBtn)),
    h('main', { class: 'workspace' },
      h('section', { class: 'collection', 'aria-labelledby': 'collection-heading' },
        h('div', { class: 'collection-head' }, h('div', { class: 'collection-heading-row' }, heading, total), filters),
        resultLine,
        wallSlot),
      pane),
    scrim, toastRegion, liveRegion);
  root.replaceChildren(shell);

  const pendingNotice = h('p', { class: 'toast', id: 'mutation-pending', role: 'status', text: 'Saving your change… Collection navigation is available when it finishes.' });
  function setMutationPending(pending, message = 'Saving your change…') {
    state.mutationPending = pending;
    searchInput.readOnly = pending;
    if (pending) {
      clearTimeout(searchTimer);
      pendingNotice.textContent = `${message} Collection navigation is available when it finishes.`;
      toastRegion.replaceChildren(pendingNotice);
      for (const el of shell.querySelectorAll('button, input[type="radio"]')) {
        if (!el.hasAttribute('data-pending')) {
          el.dataset.pendingNavigation = el.getAttribute('aria-disabled') ?? '';
          el.setAttribute('aria-disabled', 'true');
          el.setAttribute('aria-describedby', 'mutation-pending');
        }
      }
    } else {
      pendingNotice.remove();
      for (const el of shell.querySelectorAll('[data-pending-navigation]')) {
        const previous = el.dataset.pendingNavigation;
        if (previous) el.setAttribute('aria-disabled', previous); else el.removeAttribute('aria-disabled');
        el.removeAttribute('aria-describedby');
        delete el.dataset.pendingNavigation;
      }
    }
  }
  shell.addEventListener('click', event => {
    if (state.mutationPending) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  shell.addEventListener('keydown', event => {
    if (state.mutationPending && ['Enter', ' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);

  // ------------------------------------------------------------ derived
  const matchesStatus = (a) => state.status === 'all' || a.status === state.status;
  const visible = () => state.albums.filter(matchesStatus);
  const selected = () => state.albums.find((a) => a.id === state.selectedId) ?? (state.savedSelection?.id === state.selectedId ? state.savedSelection : null);
  function retainSavedAlbum(saved) {
    // A committed write is authoritative even if the following list fails.
    // Keep the query result and its counts consistent, retaining hidden details.
    const q = state.q.trim().toLocaleLowerCase();
    const matchesQuery = !q || saved.title.toLocaleLowerCase().includes(q) || saved.artist.toLocaleLowerCase().includes(q);
    const index = state.albums.findIndex(a => a.id === saved.id);
    if (!matchesQuery) state.albums = state.albums.filter(a => a.id !== saved.id);
    else if (index >= 0) state.albums[index] = saved;
    else state.albums.push(saved);
    state.savedSelection = saved;
  }
  const counts = () => {
    const c = { all: state.albums.length };
    for (const s of STATUSES) c[s] = state.albums.filter((a) => a.status === s).length;
    return c;
  };

  function summary() {
    const n = visible().length;
    const noun = n === 1 ? 'album' : 'albums';
    const parts = [];
    if (state.status !== 'all') parts.push(`in ${STATUS_LABELS[state.status]}`);
    if (state.q.trim()) parts.push(`matching “${state.q.trim()}”`);
    return `${n === 0 ? 'No' : n} ${noun}${parts.length ? ' ' + parts.join(' ') : ''}`;
  }

  // ------------------------------------------------------------ render: filters + wall
  function renderFilters() {
    const c = counts();
    const legend = filters.querySelector('legend');
    const track = h('div', { class: 'filter-track' });
    for (const key of ['all', ...STATUSES]) {
      const id = `filter-${key}`;
      const input = h('input', { type: 'radio', name: 'status-filter', id, value: key, class: 'sr-only-input', checked: state.status === key });
      if (state.mutationPending) {
        input.dataset.pendingNavigation = '';
        input.setAttribute('aria-disabled', 'true');
        input.setAttribute('aria-describedby', 'mutation-pending');
      }
      input.addEventListener('change', () => { state.status = key; renderWall(); announce(summary()); });
      track.append(h('label', { class: 'filter', for: id, dataset: { status: key } },
        input,
        key === 'all' ? null : h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'filter-label', text: key === 'all' ? 'All' : STATUS_LABELS[key] }),
        h('span', { class: 'filter-count', text: String(c[key]) })));
    }
    filters.replaceChildren(legend, track);
    total.textContent = state.q.trim() ? '' : String(c.all);
  }

  function renderWall() {
    wallSlot.setAttribute('aria-busy', state.loading ? 'true' : 'false');
    renderFilters();
    if (state.loading && !state.albums.length) {
      resultLine.textContent = 'Loading your collection…';
      wall.replaceChildren(...skeletonTiles(8));
      wallSlot.replaceChildren(wall);
      return;
    }
    if (state.loadError) {
      resultLine.textContent = '';
      const error = h('div', { class: 'wall-error' }, inlineAlert({ message: state.loadError, retryLabel: 'Reload collection', onretry: () => load() }));
      if (state.albums.length) {
        wall.replaceChildren(...visible().map(album => albumTile(album, { selected: album.id === state.selectedId, onselect: (a, btn) => select(a.id, btn) })));
        wallSlot.replaceChildren(error, wall);
      } else wallSlot.replaceChildren(error);
      return;
    }
    const items = visible();
    // Visible only when narrowed; stays in the accessible description either way.
    resultLine.replaceChildren(h('span', { text: summary() }));
    resultLine.classList.toggle('is-quiet', state.status === 'all' && !state.q.trim());
    if (!items.length) {
      wallSlot.replaceChildren(emptyFor());
      return;
    }
    wall.replaceChildren(...items.map((album) => albumTile(album, {
      selected: album.id === state.selectedId,
      onselect: (a, btn) => select(a.id, btn),
    })));
    wallSlot.replaceChildren(wall);
  }

  function emptyFor() {
    if (!state.albums.length && !state.q.trim()) {
      return emptyState({
        title: 'Your crate is empty',
        body: 'Add the first record you own or want to hear. Title and artist are all it needs.',
        action: button({ label: 'Add album', variant: 'primary', iconName: 'plus', onclick: (e) => openCreate(e.currentTarget) }),
      });
    }
    const clear = button({ label: 'Clear search and filter', variant: 'secondary', onclick: () => {
      state.q = ''; searchInput.value = ''; clearSearch.hidden = true; state.status = 'all';
      load({ announceResult: true }).then(() => searchInput.focus());
    } });
    const where = state.status !== 'all' ? ` in ${STATUS_LABELS[state.status]}` : '';
    return emptyState({
      title: state.q.trim() ? `Nothing matches “${state.q.trim()}”${where}` : `Nothing${where} yet`,
      body: state.q.trim() ? 'Check the spelling, or search by artist instead of title.' : 'Change an album’s status from its detail panel and it will appear here.',
      action: clear,
    });
  }

  // ------------------------------------------------------------ render: pane
  function renderPane({ focus } = {}) {
    const album = selected();
    const overlay = isOverlay();
    const open = overlay ? state.paneOpen : true;
    shell.classList.toggle('pane-open', overlay && open);
    scrim.hidden = !(overlay && open);
    if (overlay) {
      pane.setAttribute('role', 'dialog');
      pane.setAttribute('aria-modal', 'true');
      pane.hidden = !open;
    } else {
      pane.removeAttribute('role');
      pane.removeAttribute('aria-modal');
      pane.hidden = false;
    }
    for (const el of [shell.querySelector('.topbar'), shell.querySelector('.collection')]) el.inert = overlay && open;

    const back = overlay ? h('div', { class: 'pane-bar' },
      button({ label: 'Back to collection', variant: 'ghost', iconName: 'back', onclick: () => closePane() })) : null;

    if (state.mode === 'create' || (state.mode === 'edit' && album)) {
      const editor = albumEditor({
        album: state.mode === 'edit' ? album : null,
        mode: state.mode,
        onsubmit: (draft, ed) => submitEditor(draft, ed),
        oncancel: () => cancelEditor(),
      });
      pane.replaceChildren(h('div', { class: 'pane-inner is-editor' }, back, editor.form));
      pane.setAttribute('aria-label', state.mode === 'create' ? 'Add an album' : `Edit ${album.title}`);
      editorApi = editor;
      if (focus !== false) editor.form.querySelector('#field-title').focus();
      return;
    }
    editorApi = null;

    if (!album) {
      pane.setAttribute('aria-label', 'Album details');
      pane.replaceChildren(h('div', { class: 'pane-inner pane-placeholder' },
        h('div', { class: 'sleeve is-placeholder', 'aria-hidden': 'true' }, h('div', { class: 'sleeve-cover' })),
        h('p', { class: 'pane-hint', text: state.albums.length ? 'Choose a record to see its notes and change its status.' : 'Albums you add appear here.' })));
      return;
    }

    pane.setAttribute('aria-label', `${album.title} by ${album.artist}`);
    const sleeveEl = sleeve(album);
    const statusError = h('div', { class: 'status-error' });
    const switcher = statusSwitch({
      name: 'detail-status', value: album.status,
      onchange: (status, input) => changeStatus(album, status, input, switcher, statusError),
    });
    const notes = album.notes
      ? h('p', { class: 'notes-body', text: album.notes })
      : h('p', { class: 'notes-empty' }, 'No notes yet. ',
          h('button', { type: 'button', class: 'link-btn', onclick: (e) => openEdit(e.currentTarget, 'notes') }, 'Write one'));
    const editBtn = button({ label: 'Edit', variant: 'secondary', iconName: 'edit', dataset: { focusKey: 'edit' }, onclick: (e) => openEdit(e.currentTarget) });
    const delBtn = button({ label: 'Delete', variant: 'danger-ghost', iconName: 'trash', dataset: { focusKey: 'delete' }, onclick: (e) => askDelete(e.currentTarget) });

    let actions;
    if (state.mode === 'confirm-delete') {
      const confirmBtn = button({ label: 'Delete album', variant: 'danger', dataset: { focusKey: 'confirm-delete' } });
      const keepBtn = button({ label: 'Keep it', variant: 'ghost', onclick: () => { state.mode = 'view'; renderPane({ focus: 'delete' }); } });
      confirmBtn.addEventListener('click', () => confirmDelete(album, confirmBtn, keepBtn, actions));
      actions = h('div', { class: 'confirm', role: 'group', 'aria-labelledby': 'confirm-text' },
        h('p', { class: 'confirm-text', id: 'confirm-text' }, 'Remove ', h('strong', { text: album.title }), ' from your crate? This can’t be undone.'),
        h('div', { class: 'confirm-actions' }, confirmBtn, keepBtn));
    } else {
      actions = h('div', { class: 'detail-actions' }, editBtn, delBtn);
    }

    const title = h('h2', { class: 'detail-title', id: 'detail-title', tabindex: '-1', text: album.title });
    pane.replaceChildren(h('div', { class: 'pane-inner' },
      back,
      sleeveEl,
      h('div', { class: 'detail-head' }, title, h('p', { class: 'detail-artist', text: album.artist })),
      h('div', { class: 'detail-status' }, switcher, statusError),
      actions,
      h('section', { class: 'notes', 'aria-labelledby': 'notes-heading' },
        h('h3', { class: 'notes-heading', id: 'notes-heading', text: 'Notes' }), notes)));

    if (focus === 'title') title.focus();
    else if (focus === 'confirm') actions.querySelector('[data-focus-key="confirm-delete"]').focus();
    else if (typeof focus === 'string') pane.querySelector(`[data-focus-key="${focus}"]`)?.focus();
    return sleeveEl;
  }
  let editorApi = null;
  let shownId = null;

  // ------------------------------------------------------------ actions
  async function load({ announceResult = false, keepSelection = true, afterMutation = false } = {}) {
    if (state.mutationPending && !afterMutation) return;
    const token = ++state.listToken;
    state.loading = true;
    renderWall();
    try {
      const albums = await store.list({ q: state.q.trim() });
      if (token !== state.listToken) return; // a newer query won
      state.albums = albums;
      const refreshedSelection = albums.find(a => a.id === state.savedSelection?.id);
      if (refreshedSelection) state.savedSelection = refreshedSelection;
      else if (!state.q.trim()) state.savedSelection = null;
      state.loadError = null;
    } catch (err) {
      if (token !== state.listToken) return;
      state.loadError = friendly(err, 'Your collection couldn’t be loaded.');
    } finally {
      if (token === state.listToken) state.loading = false;
    }
    if (!keepSelection || (state.selectedId && !selected())) {
      if (state.mode === 'view' || state.mode === 'confirm-delete') state.selectedId = null;
    }
    if (!state.selectedId && !isOverlay() && visible().length) state.selectedId = visible()[0].id;
    renderWall();
    if (state.mode === 'view' && !pane.contains(document.activeElement)) {
      const s = renderPane({ focus: false });
      if (s && shownId !== state.selectedId) playSleeve(s);
    }
    shownId = state.selectedId;
    if (announceResult) announce(state.loadError ?? summary());
  }

  function select(id, btn) {
    const changed = state.selectedId !== id;
    state.selectedId = id;
    state.mode = 'view';
    state.opener = btn;
    for (const t of wall.querySelectorAll('.tile')) {
      if (t.dataset.albumId === id) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    }
    if (isOverlay()) state.paneOpen = true;
    const s = renderPane({ focus: isOverlay() ? 'title' : false });
    if (s && (changed || isOverlay())) playSleeve(s);
    shownId = id;
  }

  function closePane() {
    state.paneOpen = false;
    state.mode = 'view';
    renderPane({ focus: false });
    focusAfterClose();
  }

  function focusAfterClose() {
    const tile = state.selectedId && wall.querySelector(`.tile[data-album-id="${CSS.escape(state.selectedId)}"]`);
    if (state.opener?.isConnected) state.opener.focus();
    else if (tile) tile.focus();
    else heading.focus();
  }

  function openCreate(opener) {
    state.opener = opener;
    state.mode = 'create';
    if (isOverlay()) state.paneOpen = true;
    renderPane();
  }

  function openEdit(opener, field) {
    state.mode = 'edit';
    if (isOverlay()) state.paneOpen = true;
    renderPane({ focus: field ? false : undefined });
    if (field) pane.querySelector(`#field-${field}`)?.focus();
  }

  function cancelEditor() {
    const wasCreate = state.mode === 'create';
    state.mode = 'view';
    if (wasCreate) {
      if (isOverlay()) { state.paneOpen = false; renderPane({ focus: false }); }
      else renderPane({ focus: false });
      focusAfterClose();
    } else {
      renderPane({ focus: 'edit' });
    }
  }

  async function submitEditor(draft, ed) {
    const { value, errors } = validateAlbumInput(draft);
    if (Object.keys(errors).length) { ed.showFieldErrors(errors); return; }
    if (state.mutationPending) return;
    ed.setPending(true);
    setMutationPending(true, state.mode === 'create' ? 'Adding your album…' : 'Saving your changes…');
    ed.clearError();
    const creating = state.mode === 'create';
    const editingId = state.selectedId;
    try {
      const saved = creating ? await store.create(value) : await store.update(editingId, value);
      retainSavedAlbum(saved);
      state.mode = 'view';
      state.selectedId = saved.id;
      await load({ keepSelection: true, afterMutation: true });
      setMutationPending(false);
      ed.setPending(false);
      state.selectedId = saved.id;
      toast(creating ? `Added “${saved.title}”` : 'Changes saved', 'success');
      announce(creating ? `Added ${saved.title}.` : `Saved ${saved.title}.`);
      if (creating) {
        // New record: focus its tile when visible, else its detail title.
        const tile = wall.querySelector(`.tile[data-album-id="${CSS.escape(saved.id)}"]`);
        state.opener = tile ?? addBtn;
        if (isOverlay()) { state.paneOpen = true; renderPane({ focus: 'title' }); }
        else { const s = renderPane({ focus: false }); if (s) playSleeve(s); (tile ?? pane.querySelector('#detail-title')).focus(); }
      } else {
        renderPane({ focus: 'edit' });
      }
    } catch (err) {
      setMutationPending(false);
      ed.setPending(false);
      if (err.status === 404) return handleGone();
      if (err.status === 400 && err.fields) { ed.showFieldErrors(err.fields); return; }
      ed.showError(friendly(err, creating ? 'The album couldn’t be added.' : 'Your changes couldn’t be saved.') + ' Your draft is still here.', () => ed.form.requestSubmit());
    }
  }

  async function changeStatus(album, status, input, switcher, errorSlot) {
    if (switcher.hasAttribute('data-pending')) return;
    if (state.mutationPending) return;
    const previous = album.status;
    let failureAlert;
    setMutationPending(true, 'Saving listening status…');
    switcher.setAttribute('data-pending', '');
    switcher.setAttribute('aria-busy', 'true');
    input.closest('.status-option').classList.add('is-pending');
    errorSlot.replaceChildren();
    for (const r of switcher.querySelectorAll('input')) r.setAttribute('aria-disabled', 'true');
    try {
      const saved = await store.update(album.id, { status });
      Object.assign(album, saved);
      renderWall();
      pane.querySelector('.sleeve')?.setAttribute('data-status', saved.status);
      announce(`${saved.title} marked ${STATUS_LABELS[saved.status]}.`);
    } catch (err) {
      if (err.status === 404) { setMutationPending(false); return handleGone(); }
      const back = switcher.querySelector(`input[value="${previous}"]`);
      back.checked = true;
      failureAlert = inlineAlert({
        message: friendly(err, `Couldn’t change the status to ${STATUS_LABELS[status]}.`),
        onretry: () => { const target = switcher.querySelector(`input[value="${status}"]`); target.checked = true; changeStatus(album, status, target, switcher, errorSlot); },
      });
      errorSlot.replaceChildren(failureAlert);
    } finally {
      setMutationPending(false);
      switcher.removeAttribute('data-pending');
      switcher.setAttribute('aria-busy', 'false');
      switcher.querySelector('.is-pending')?.classList.remove('is-pending');
      for (const r of switcher.querySelectorAll('input')) r.removeAttribute('aria-disabled');
      if (failureAlert) failureAlert.focus();
      // Keep focus on the group so keyboard users stay in place.
      if (pane.contains(document.activeElement) === false && switcher.isConnected) switcher.querySelector('input:checked')?.focus();
    }
  }

  function askDelete() {
    state.mode = 'confirm-delete';
    renderPane({ focus: 'confirm' });
  }

  async function confirmDelete(album, confirmBtn, keepBtn, group) {
    if (isPending(confirmBtn)) return;
    if (state.mutationPending) return;
    setPending(confirmBtn, true, 'Deleting…');
    setMutationPending(true, 'Deleting your album…');
    keepBtn.setAttribute('aria-disabled', 'true');
    group.querySelector('.inline-alert')?.remove();
    const order = visible().map((a) => a.id);
    const index = order.indexOf(album.id);
    try {
      await store.remove(album.id);
    } catch (err) {
      setMutationPending(false);
      setPending(confirmBtn, false);
      keepBtn.setAttribute('aria-disabled', 'false');
      if (err.status === 404) return handleGone();
      const alertEl = inlineAlert({ message: friendly(err, 'The album couldn’t be deleted.'), onretry: () => confirmDelete(album, confirmBtn, keepBtn, group) });
      group.append(alertEl);
      alertEl.focus();
      return;
    }
    state.albums = state.albums.filter(a => a.id !== album.id);
    if (state.savedSelection?.id === album.id) state.savedSelection = null;
    state.mode = 'view';
    const neighbour = order[index + 1] ?? order[index - 1] ?? null;
    state.selectedId = isOverlay() ? null : neighbour;
    state.paneOpen = false;
    await load({ afterMutation: true });
    setMutationPending(false);
    renderPane({ focus: false });
    shownId = state.selectedId;
    toast(`Deleted “${album.title}”`, 'neutral');
    announce(`Deleted ${album.title}. ${summary()}.`);
    focusNearest(neighbour);
  }

  function focusNearest(id) {
    const tile = id && wall.querySelector(`.tile[data-album-id="${CSS.escape(id)}"]`);
    if (tile) tile.focus();
    else if (state.albums.length === 0) addBtn.focus();
    else heading.focus();
  }

  async function handleGone() {
    const goneId = state.selectedId;
    const order = visible().map((a) => a.id);
    const index = order.indexOf(goneId);
    state.mode = 'view';
    state.selectedId = null;
    state.paneOpen = false;
    await load();
    renderPane({ focus: false });
    shownId = state.selectedId;
    const message = 'That album no longer exists — it may have been deleted in another window. The collection has been refreshed.';
    toast('That album no longer exists', 'danger');
    announce(message);
    const survivors = visible().map((a) => a.id);
    focusNearest(order.slice(index + 1).find((id) => survivors.includes(id)) ?? order.slice(0, Math.max(index, 0)).reverse().find((id) => survivors.includes(id)));
  }

  function friendly(err, fallback) {
    if (err?.status >= 500 || !err?.status) return `${fallback} Check your connection and try again.`;
    return err.message || fallback;
  }

  // ------------------------------------------------------------ wiring
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearSearch.hidden = !searchInput.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = searchInput.value; load({ announceResult: true }); }, 180);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchInput.value) { e.preventDefault(); clearSearch.click(); }
  });
  clearSearch.addEventListener('click', () => {
    searchInput.value = ''; clearSearch.hidden = true; state.q = '';
    searchInput.focus();
    load({ announceResult: true });
  });
  addBtn.addEventListener('click', () => openCreate(addBtn));
  scrim.addEventListener('click', () => { if (state.mode === 'view') closePane(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOverlay() && state.paneOpen && state.mode === 'view') closePane();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || !isOverlay() || !state.paneOpen) return;
    const controls = [...pane.querySelectorAll('button, input, textarea, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
  });
  overlayMq.addEventListener('change', () => {
    if (state.mutationPending || state.mode === 'create' || state.mode === 'edit') {
      state.paneOpen = isOverlay();
      shell.classList.toggle('pane-open', isOverlay());
      scrim.hidden = !isOverlay();
      pane.hidden = false;
      if (isOverlay()) { pane.setAttribute('role', 'dialog'); pane.setAttribute('aria-modal', 'true'); }
      else { pane.removeAttribute('role'); pane.removeAttribute('aria-modal'); }
      for (const el of [shell.querySelector('.topbar'), shell.querySelector('.collection')]) el.inert = isOverlay();
      return;
    }
    state.paneOpen = isOverlay() && state.mode !== 'view';
    if (!isOverlay() && !state.selectedId && visible().length) state.selectedId = visible()[0].id;
    renderWall();
    renderPane({ focus: false });
  });

  renderWall();
  renderPane({ focus: false });
  load();

  return { reload: () => load(), state };
}
