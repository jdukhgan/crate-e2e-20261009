// Theme: explicit choice is saved; otherwise the OS preference applies.
// The inline boot snippet in <head> (see docs/design.md) applies the theme
// before first paint; this module owns the toggle and later changes.
import { h, icon } from './components.js';

const KEY = 'crate-theme';
const mq = window.matchMedia('(prefers-color-scheme: dark)');

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function themeToggle() {
  const btn = h('button', { type: 'button', class: 'btn btn-ghost btn-icon theme-toggle' });
  const sync = () => {
    const dark = currentTheme() === 'dark';
    btn.setAttribute('aria-label', 'Dark theme');
    btn.setAttribute('aria-pressed', String(dark));
    btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
    btn.replaceChildren(icon(dark ? 'moon' : 'sun'));
  };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode: session only */ }
    sync();
  });
  mq.addEventListener('change', () => {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (!saved) { applyTheme(mq.matches ? 'dark' : 'light'); sync(); }
  });
  sync();
  return btn;
}
