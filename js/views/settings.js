import { exportData, importData, clearData, getAttempts, getCookie, setCookie } from '../lib/storage.js';
import { icon, icons } from './ui.js';

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

export async function render(root) {
  const theme = ['light', 'dark'].includes(getCookie('theme')) ? getCookie('theme') : 'system';
  const count = getAttempts().length;

  root.innerHTML = `
    <section class="page-head"><h1>Settings</h1></section>

    <section class="card">
      <h2>${icon('palette')} Theme</h2>
      <div class="segmented" role="radiogroup" aria-label="Theme">
        ${[['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']].map(([v, ic, label]) => `
          <label class="seg"><input type="radio" name="theme" value="${v}" ${v === theme ? 'checked' : ''}>
            <span>${icon(ic)} ${label}</span></label>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>${icon('database')} Your data</h2>
      <p class="muted" id="data-count">${count} attempt${count === 1 ? '' : 's'} stored in this browser.</p>
      <div class="btn-row">
        <button type="button" class="btn" id="export">${icon('download')} Export JSON</button>
      </div>

      <h3>Import</h3>
      <p class="muted">Merge keeps your current history and adds new attempts. Replace overwrites everything.</p>
      <input type="file" id="import-file" accept="application/json,.json">
      <div class="btn-row">
        <button type="button" class="btn" id="import-merge" disabled>${icon('git-merge')} Merge</button>
        <button type="button" class="btn btn-danger" id="import-replace" disabled>${icon('replace')} Replace</button>
      </div>
      <p id="import-msg" class="msg" role="status" aria-live="polite"></p>

      <h3>Danger zone</h3>
      <button type="button" class="btn btn-danger" id="clear">${icon('trash-2')} Clear all data</button>
      <p id="clear-msg" class="msg" role="status" aria-live="polite"></p>
    </section>`;

  root.querySelectorAll('input[name="theme"]').forEach(r => r.addEventListener('change', () => {
    setCookie('theme', r.value);
    applyTheme(r.value);
  }));

  root.querySelector('#export').addEventListener('click', () => exportData());

  const file = root.querySelector('#import-file');
  const merge = root.querySelector('#import-merge');
  const replace = root.querySelector('#import-replace');
  const msg = root.querySelector('#import-msg');
  file.addEventListener('change', () => {
    const has = file.files && file.files.length > 0;
    merge.disabled = replace.disabled = !has;
    msg.textContent = '';
    msg.className = 'msg';
  });

  async function doImport(mode) {
    const f = file.files?.[0];
    if (!f) return;
    if (mode === 'replace' && !confirm('Replace ALL existing history with the contents of this file? This cannot be undone.')) return;
    try {
      const { added, total, presetsAdded } = await importData(f, mode);
      msg.className = 'msg good';
      const presetNote = presetsAdded ? ` ${presetsAdded} mix preset(s) imported.` : '';
      msg.textContent = (mode === 'merge'
        ? `Merged: ${added} new attempt(s) added, ${total} total.`
        : `Replaced: ${total} attempt(s) now stored.`) + presetNote;
      root.querySelector('#data-count').textContent = `${total} attempt${total === 1 ? '' : 's'} stored in this browser.`;
    } catch (e) {
      msg.className = 'msg bad';
      msg.textContent = `Import failed: ${e.message || e}`;
    }
  }
  merge.addEventListener('click', () => doImport('merge'));
  replace.addEventListener('click', () => doImport('replace'));

  root.querySelector('#clear').addEventListener('click', () => {
    if (!confirm('Delete all quiz history stored in this browser? This cannot be undone. Consider exporting first.')) return;
    clearData();
    const m = root.querySelector('#clear-msg');
    m.className = 'msg good';
    m.textContent = 'All data cleared.';
    root.querySelector('#data-count').textContent = '0 attempts stored in this browser.';
  });
  icons();
}
