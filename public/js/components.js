// Crate UI primitives. Each builder returns a DOM node; user content is only
// ever assigned through textContent/attributes, never parsed as HTML.
import { LIMITS, STATUSES, STATUS_LABELS, countChars } from './contract.js';

// ---------------------------------------------------------------- helpers

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'class') el.className = val;
    else if (key === 'text') el.textContent = val;
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2), val);
    else if (val === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(val));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Authored icon set: 20px grid, 1.75 stroke, round caps. Static markup only.
const ICONS = {
  search: '<circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  close: '<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>',
  back: '<path d="M12 4.5 6.5 10l5.5 5.5"/>',
  edit: '<path d="M4 16h3.2L15.6 7.6a1.9 1.9 0 0 0-2.7-2.7L4.5 13.3 4 16Z"/><path d="m11.8 6 2.7 2.7"/>',
  trash: '<path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"/>',
  sun: '<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3"/>',
  moon: '<path d="M15.8 12.3A6.3 6.3 0 0 1 7.7 4.2 6.3 6.3 0 1 0 15.8 12.3Z"/>',
  alert: '<circle cx="10" cy="10" r="7"/><path d="M10 6.3v4.4M10 13.6v.1"/>',
  check: '<path d="m4.8 10.4 3.4 3.3 7-7.4"/>',
  retry: '<path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9"/><path d="M15.5 3.8v3.1h-3.1"/>',
  crate: '<path d="M3 7.5h14v8.5H3z"/><path d="M3 11.5h14"/><path d="M6 7.5 7.5 3.5M10 7.5V3.5M14 7.5l-1.5-4"/>',
};

export function icon(name, { size = 20, label } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.innerHTML = `<svg viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"'}>${ICONS[name]}</svg>`;
  return wrap.firstElementChild;
}

// ---------------------------------------------------------------- buttons

// variant: primary | secondary | ghost | danger | danger-ghost
export function button({ label, variant = 'secondary', iconName, iconOnly = false, type = 'button', onclick, ...rest } = {}) {
  const btn = h('button', {
    type,
    class: `btn btn-${variant}${iconOnly ? ' btn-icon' : ''}`,
    'aria-label': iconOnly ? label : undefined,
    onclick,
    ...rest,
  });
  if (iconName) btn.append(icon(iconName));
  if (!iconOnly) btn.append(h('span', { class: 'btn-label', text: label }));
  btn.dataset.label = label;
  return btn;
}

// Pending: stays focusable (no `disabled`, which would drop focus), announces
// busy, swaps its label and ignores activation until released.
export function setPending(btn, pending, pendingLabel = 'Saving…') {
  btn.toggleAttribute('data-pending', pending);
  btn.setAttribute('aria-disabled', pending ? 'true' : 'false');
  const labelEl = btn.querySelector('.btn-label');
  if (labelEl) labelEl.textContent = pending ? pendingLabel : btn.dataset.label;
  if (pending && !btn.querySelector('.spinner')) btn.prepend(h('span', { class: 'spinner', 'aria-hidden': 'true' }));
  if (!pending) btn.querySelector('.spinner')?.remove();
}

export function isPending(el) {
  return el?.hasAttribute('data-pending') || el?.getAttribute('aria-disabled') === 'true';
}

// ---------------------------------------------------------------- covers

// Albums without artwork get a typographic sleeve derived from their id, so a
// new record still looks like it belongs in the crate.
const FALLBACK_HUES = [36, 145, 250, 300, 85, 200, 15, 330];
function hashHue(seed) {
  let n = 0;
  for (const ch of seed ?? '') n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return FALLBACK_HUES[n % FALLBACK_HUES.length];
}

export function cover(album, { className = '', decorative = true } = {}) {
  if (album.cover) {
    return h('img', {
      class: `cover ${className}`,
      src: album.cover,
      alt: decorative ? '' : `Cover of ${album.title}`,
      loading: 'lazy',
      decoding: 'async',
      width: 600,
      height: 600,
    });
  }
  const initials = Array.from(album.title.replace(/^(the|a|an)\s+/i, '').trim())[0] ?? '?';
  const el = h('div', {
    class: `cover cover-fallback ${className}`,
    role: decorative ? undefined : 'img',
    'aria-label': decorative ? undefined : `Placeholder cover for ${album.title}`,
    'aria-hidden': decorative ? 'true' : undefined,
  }, h('span', { class: 'cover-fallback-mark', text: initials.toUpperCase() }),
     h('span', { class: 'cover-fallback-artist', text: album.artist }));
  el.style.setProperty('--fallback-hue', hashHue(album.id ?? album.title));
  return el;
}

// ---------------------------------------------------------------- status

export function statusMark(status) {
  return h('span', { class: 'status-mark', dataset: { status } },
    h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
    STATUS_LABELS[status] ?? status);
}

// Segmented radio group used both in detail (direct change) and editor.
export function statusSwitch({ name, value, legend = 'Listening status', onchange, compact = false }) {
  const fieldset = h('fieldset', { class: `status-switch${compact ? ' is-compact' : ''}` },
    h('legend', { class: 'field-label', text: legend }));
  const track = h('div', { class: 'status-track' });
  for (const status of STATUSES) {
    const id = `${name}-${status}`;
    const input = h('input', { type: 'radio', name, id, value: status, class: 'sr-only-input', checked: status === value });
    if (onchange) input.addEventListener('change', () => onchange(status, input));
    track.append(h('label', { class: 'status-option', for: id, dataset: { status } },
      input,
      h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'status-option-label', text: STATUS_LABELS[status] })));
  }
  fieldset.append(track);
  return fieldset;
}

// ---------------------------------------------------------------- album tile

export function albumTile(album, { selected = false, onselect } = {}) {
  const btn = h('button', {
    type: 'button',
    class: 'tile',
    'aria-current': selected ? 'true' : undefined,
    dataset: { albumId: album.id },
    onclick: () => onselect?.(album, btn),
  },
  h('span', { class: 'tile-art' }, cover(album)),
  h('span', { class: 'tile-text' },
    h('span', { class: 'tile-title', text: album.title }),
    h('span', { class: 'tile-artist', text: album.artist })),
  statusMark(album.status));
  return h('li', { class: 'wall-item' }, btn);
}

export function skeletonTiles(count = 8) {
  return Array.from({ length: count }, () => h('li', { class: 'wall-item', 'aria-hidden': 'true' },
    h('div', { class: 'tile tile-skeleton' },
      h('span', { class: 'tile-art skeleton' }),
      h('span', { class: 'skeleton skeleton-line' }),
      h('span', { class: 'skeleton skeleton-line is-short' }))));
}

// ---------------------------------------------------------------- sleeve (signature)

// The selected record slides out of its sleeve. Call `playSleeve(el)` after
// inserting to run the slide; reduced motion shows the resting position.
export function sleeve(album) {
  return h('figure', { class: 'sleeve is-out', dataset: { status: album.status } },
    h('div', { class: 'disc', 'aria-hidden': 'true' },
      h('div', { class: 'disc-label' }, cover(album))),
    h('div', { class: 'sleeve-cover' }, cover(album, { decorative: false })));
}

export function playSleeve(el) {
  el.classList.remove('is-out');
  void el.offsetWidth;
  requestAnimationFrame(() => el.classList.add('is-out'));
}

// ---------------------------------------------------------------- messages

export function inlineAlert({ message, retryLabel = 'Try again', onretry, tone = 'danger' }) {
  const box = h('div', { class: `inline-alert is-${tone}`, role: 'alert', tabindex: '-1' },
    icon('alert'),
    h('p', { class: 'inline-alert-text', text: message }));
  if (onretry) box.append(button({ label: retryLabel, variant: 'ghost', iconName: 'retry', onclick: onretry, class: 'btn btn-ghost btn-sm' }));
  return box;
}

export function emptyState({ title, body, action }) {
  return h('div', { class: 'empty-state' },
    h('div', { class: 'empty-crate', 'aria-hidden': 'true' },
      h('span'), h('span'), h('span')),
    h('h2', { class: 'empty-title', text: title }),
    body ? h('p', { class: 'empty-body', text: body }) : null,
    action ?? null);
}

// Visible, transient confirmation. Screen-reader text goes through the
// separate polite announcer so it is spoken once.
export function createToaster(region) {
  let timer;
  return function toast(message, tone = 'neutral') {
    clearTimeout(timer);
    region.replaceChildren(h('div', { class: `toast is-${tone}` },
      icon(tone === 'danger' ? 'alert' : 'check'), h('span', { text: message })));
    timer = setTimeout(() => region.replaceChildren(), 4000);
  };
}

export function createAnnouncer(region) {
  let timer;
  return function announce(message) {
    clearTimeout(timer);
    region.textContent = '';
    timer = setTimeout(() => { region.textContent = message; }, 60);
  };
}

// ---------------------------------------------------------------- form fields

export function textField({ name, label, value = '', max, required = false, multiline = false, hint }) {
  const id = `field-${name}`;
  const control = h(multiline ? 'textarea' : 'input', {
    id,
    name,
    class: multiline ? 'input textarea' : 'input',
    type: multiline ? undefined : 'text',
    required,
    'aria-required': required ? 'true' : undefined,
    'aria-describedby': `${id}-meta`,
    autocomplete: 'off',
    spellcheck: multiline ? 'true' : 'false',
    rows: multiline ? 7 : undefined,
  });
  control.value = value;
  const counter = h('span', { class: 'field-counter', 'aria-hidden': 'true' });
  const error = h('span', { class: 'field-error', id: `${id}-error` });
  const srCount = h('span', { class: 'sr-only', id: `${id}-limit`, text: `Up to ${max} characters.` });
  const update = () => {
    const n = countChars(multiline ? control.value : control.value.trim());
    counter.textContent = `${n} / ${max}`;
    counter.classList.toggle('is-over', n > max);
    counter.classList.toggle('is-near', n <= max && n > max * 0.9);
  };
  control.addEventListener('input', update);
  update();
  return h('div', { class: 'field', dataset: { field: name } },
    h('div', { class: 'field-head' },
      h('label', { class: 'field-label', for: id }, label, required ? null : h('span', { class: 'field-optional', text: ' (optional)' })),
      counter),
    control,
    h('div', { class: 'field-meta', id: `${id}-meta` }, error, hint ? h('span', { class: 'field-hint', text: hint }) : null, srCount));
}

export function setFieldErrors(form, errors = {}) {
  let first = null;
  for (const field of form.querySelectorAll('.field')) {
    const name = field.dataset.field;
    const control = field.querySelector('input, textarea');
    const msg = errors[name];
    field.classList.toggle('has-error', Boolean(msg));
    field.querySelector('.field-error').textContent = msg ?? '';
    control.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !first) first = control;
  }
  return first;
}

// Album editor (create + edit). Returns { form, getDraft, setPending, showError, showFieldErrors }.
export function albumEditor({ album, mode = 'edit', onsubmit, oncancel }) {
  const heading = h('h2', { class: 'editor-title', id: 'editor-title', tabindex: '-1', text: mode === 'create' ? 'Add an album' : 'Edit album' });
  const alertSlot = h('div', { class: 'editor-alert' });
  const save = button({ label: mode === 'create' ? 'Add to crate' : 'Save changes', variant: 'primary', type: 'submit' });
  const cancel = button({ label: 'Cancel', variant: 'ghost', onclick: () => { if (!isPending(save)) oncancel?.(); } });
  const form = h('form', { class: 'editor', 'aria-labelledby': 'editor-title', novalidate: true },
    heading,
    alertSlot,
    textField({ name: 'title', label: 'Title', value: album?.title ?? '', max: LIMITS.title, required: true }),
    textField({ name: 'artist', label: 'Artist', value: album?.artist ?? '', max: LIMITS.artist, required: true }),
    statusSwitch({ name: `editor-status`, value: album?.status ?? 'want_to_hear', legend: 'Status', compact: true }),
    textField({ name: 'notes', label: 'Notes', value: album?.notes ?? '', max: LIMITS.notes, multiline: true, hint: 'Saved exactly as typed.' }),
    h('div', { class: 'editor-actions' }, save, cancel));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (isPending(save)) return;
    onsubmit?.(api.getDraft(), api);
  });
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !isPending(save)) { event.stopPropagation(); oncancel?.(); }
  });

  const api = {
    form,
    heading,
    getDraft() {
      const data = new FormData(form);
      return {
        title: data.get('title') ?? '',
        artist: data.get('artist') ?? '',
        status: data.get('editor-status') ?? 'want_to_hear',
        notes: data.get('notes') ?? '',
      };
    },
    setPending(pending) {
      setPending(save, pending, mode === 'create' ? 'Adding…' : 'Saving…');
      form.setAttribute('aria-busy', pending ? 'true' : 'false');
      cancel.setAttribute('aria-disabled', pending ? 'true' : 'false');
      for (const field of form.querySelectorAll('input[type="text"], textarea')) field.readOnly = pending;
    },
    // Called after controls unlock; moves focus to the alert so the reason is read.
    showError(message, onretry) {
      const alertEl = inlineAlert({ message, onretry });
      alertSlot.replaceChildren(alertEl);
      alertEl.focus();
    },
    clearError() { alertSlot.replaceChildren(); },
    showFieldErrors(errors) {
      alertSlot.replaceChildren();
      const first = setFieldErrors(form, errors);
      first?.focus();
      return first;
    },
  };
  return api;
}
