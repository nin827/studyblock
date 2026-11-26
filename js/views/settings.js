import { exportData, importData, clearData, getAttempts, getCookie, setCookie, getCodeLang } from '../lib/storage.js';
import { LANG_IDS } from '../lib/languages.js';
import { codeLangPickerHtml, bindCodeLangPicker } from './module.js';
import { loadModule } from '../lib/source.js';
import * as folder from '../lib/folder.js';
import * as pwa from '../lib/pwa.js';
import { soundOn, setSoundOn } from './playbtn.js';
import { gameOn, setGameOn } from '../lib/gamify.js';
import { canPlay, stopPlayback } from '../lib/audio.js';
import { icon, icons, esc, fmtDate } from './ui.js';

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

// theme.js (accent colours) is loaded through source.js and guarded, so Settings still
// renders if it is missing or fails to load.
async function loadTheme() {
  try {
    const t = await loadModule('js/lib/theme.js');
    return Array.isArray(t.ACCENT_HUES) && typeof t.getAccent === 'function' && typeof t.setAccent === 'function' ? t : null;
  } catch (e) {
    console.warn('StudyBlock: accent colours unavailable', e);
    return null;
  }
}

function accentHtml(theme) {
  if (!theme) return '<p class="muted">Accent colours are not available right now.</p>';
  const current = theme.getAccent();
  const hues = theme.ACCENT_HUES.filter(h => Number.isInteger(h) && h >= 0 && h <= 345);
  const swatch = (value, bg, label) => {
    const on = value === current;
    return `<button type="button" class="accent-swatch" data-accent="${esc(String(value))}" aria-pressed="${on}"
      aria-label="${esc(label)}" title="${esc(label)}" style="background:${bg}"></button>`;
  };
  return `<div class="accent-grid" role="group" aria-label="Accent colour">
    ${hues.map(h => swatch(h, `oklch(0.50 0.16 ${h})`, `Hue ${h} degrees`)).join('')}
    ${swatch('grey', 'oklch(0.50 0 0)', 'Grey')}
  </div>`;
}

function folderHtml(f) {
  if (f.status === 'unsupported') {
    return `<p class="muted">This browser can't connect a data folder (only Chromium browsers such as Chrome and Edge can).
      Use <strong>Export JSON</strong> below regularly, and <strong>Import</strong> to restore.</p>`;
  }
  const name = f.name ? `<strong>${esc(f.name)}</strong>` : 'the folder';
  let line;
  let buttons;
  const connectOther = `<button type="button" class="btn" id="folder-connect" data-folder-skip>${icon('folder-open')} Choose another folder</button>`;
  const disconnect = `<button type="button" class="btn btn-danger" id="folder-disconnect" data-folder-skip>${icon('unlink')} Disconnect</button>`;
  if (f.status === 'connected') {
    line = `${icon('folder-check')} Connected to ${name}.`;
    buttons = connectOther + disconnect;
  } else if (f.status === 'needs-permission') {
    line = f.denied
      ? `${icon('folder-lock')} Access to ${name} was not granted this session.`
      : `${icon('folder-lock')} Click anywhere to resume syncing to ${name}.`;
    buttons = `<button type="button" class="btn btn-primary" id="folder-reconnect" data-folder-skip>${icon('refresh-cw')} Reconnect data folder</button>`
      + connectOther + disconnect;
  } else {
    line = `${icon('folder')} No data folder connected.`;
    buttons = `<button type="button" class="btn btn-primary" id="folder-connect" data-folder-skip>${icon('folder-plus')} Connect data folder</button>`;
  }
  const synced = f.lastSync && f.status !== 'none' ? `<p class="muted small">Last synced ${esc(fmtDate(f.lastSync))}.</p>` : '';
  const kind = f.messageKind === 'bad' ? 'bad' : f.messageKind === 'good' ? 'good' : '';
  const msg = f.message ? `<p class="msg ${kind}">${esc(f.message)}</p>` : '';
  return `<p>${line}</p>${synced}
    <div class="btn-row">${buttons}</div>${msg}`;
}

export async function render(root, params = {}, ctx = {}) {
  const theme = ['light', 'dark'].includes(getCookie('theme')) ? getCookie('theme') : 'system';
  const count = getAttempts().length;
  const themeMod = await loadTheme();
  if (typeof ctx.alive === 'function' && !ctx.alive()) return;

  root.innerHTML = `
    <section class="page-head"><h1>Settings</h1></section>

    <section class="card">
      <h2>${icon('palette')} Theme</h2>
      <div class="segmented" role="radiogroup" aria-label="Theme">
        ${[['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']].map(([v, ic, label]) => `
          <label class="seg"><input type="radio" name="theme" value="${v}" ${v === theme ? 'checked' : ''}>
            <span>${icon(ic)} ${label}</span></label>`).join('')}
      </div>
      <h3>Accent colour</h3>
      <div id="accent-picker">${accentHtml(themeMod)}</div>
    </section>

    <section class="card">
      <h2>${icon('code')} Code language</h2>
      ${codeLangPickerHtml(LANG_IDS, getCodeLang(), {
        id: 'settings-code-lang', label: 'Show code in', labelIcon: false,
        hint: 'Applies to Code Writing and Code Reviewing. You can also change it on those subject pages.',
      })}
    </section>

    <section class="card" id="sound-card"${canPlay() ? '' : ' hidden'}>
      <h2>${icon('volume-2')} Sound</h2>
      <label class="check-row"><input type="checkbox" id="sound-toggle" ${soundOn() ? 'checked' : ''}>
        <span>Play button on music questions</span></label>
      <p class="muted">After you check an answer, Music Theory questions show a Play button that sounds the note, interval, chord or scale.
        Sounds are made in your browser, so they work offline. Turn this off to hide the buttons.</p>
    </section>

    <section class="card" id="game-settings">
      <h2>${icon('trophy')} Game elements</h2>
      <label class="check-row"><input type="checkbox" role="switch" id="game-toggle" aria-describedby="game-help" ${gameOn() ? 'checked' : ''}>
        <span>Show XP, levels, streaks and badges</span></label>
      <p class="muted" id="game-help">XP, levels, streaks and badges. Worked out from your history, so hiding them loses nothing.</p>
    </section>

    <section class="card" id="install-card" hidden></section>

    <section class="card">
      <h2>${icon('folder-sync')} Data folder</h2>
      <p class="muted">Keep a copy of your progress in a folder you choose, for example one that is backed up or synced.
        StudyBlock reads and writes only <code>studyblock-data.json</code> there, after every change.
        Your progress also stays in this browser.</p>
      <div id="folder-status" role="status" aria-live="polite">${folderHtml(folder.info())}</div>
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

  bindCodeLangPicker(root);

  root.querySelector('#sound-toggle')?.addEventListener('change', (e) => {
    setSoundOn(e.target.checked);
    if (!e.target.checked) stopPlayback();
  });

  root.querySelector('#game-toggle')?.addEventListener('change', (e) => setGameOn(e.target.checked));

  const updateCount = () => {
    const n = getAttempts().length;
    const dc = root.querySelector('#data-count');
    if (dc) dc.textContent = `${n} attempt${n === 1 ? '' : 's'} stored in this browser.`;
  };

  const picker = root.querySelector('#accent-picker');
  picker.addEventListener('click', e => {
    const b = e.target.closest('[data-accent]');
    if (!b || !themeMod) return;
    const raw = b.dataset.accent;
    const value = raw === 'grey' ? 'grey' : Number(raw);
    if (value !== 'grey' && !themeMod.ACCENT_HUES.includes(value)) return;
    try { themeMod.setAccent(value); } catch (err) { console.error(err); }
    picker.innerHTML = accentHtml(themeMod);
    picker.querySelector(`[data-accent="${value}"]`)?.focus();
  });

  // Install app card: hidden when installed or when there's nothing to offer.
  const installCard = root.querySelector('#install-card');
  const drawInstall = () => {
    if (pwa.isInstalled()) {
      installCard.hidden = true;
      installCard.innerHTML = '';
    } else if (pwa.canInstall()) {
      installCard.innerHTML = `<h2>${icon('download')} Install app</h2>
        <p class="muted">Install StudyBlock to open it from your home screen or app list, in its own window, even offline.</p>
        <div class="btn-row"><button type="button" class="btn btn-primary" id="install-btn">${icon('monitor-down')} Install StudyBlock</button></div>`;
      installCard.hidden = false;
    } else if (pwa.showIOSHint()) {
      installCard.innerHTML = `<h2>${icon('download')} Install app</h2>
        <p>Tap ${icon('share')} <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>`;
      installCard.hidden = false;
    } else {
      installCard.hidden = true;
      installCard.innerHTML = '';
    }
    icons();
  };
  installCard.addEventListener('click', async e => {
    if (!e.target.closest('#install-btn')) return;
    await pwa.promptInstall();
    drawInstall();
  });
  const offInstall = pwa.onInstallChange(drawInstall);
  if (typeof ctx.onCleanup === 'function') ctx.onCleanup(offInstall);
  drawInstall();

  const folderBox = root.querySelector('#folder-status');
  const unsubscribe = folder.subscribe(f => {
    folderBox.innerHTML = folderHtml(f);
    icons();
    if (f.merged) updateCount();
  });
  if (typeof ctx.onCleanup === 'function') ctx.onCleanup(unsubscribe);
  folderBox.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'folder-connect') await folder.connect();
    else if (b.id === 'folder-reconnect') await folder.reconnect();
    else if (b.id === 'folder-disconnect') {
      if (!confirm('Disconnect the data folder? Nothing in the folder is deleted; StudyBlock just stops writing to it.')) return;
      await folder.disconnect();
    }
    updateCount();
  });

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
    const linked = folder.status() === 'connected' ? ' The connected data folder file will be updated to match.' : '';
    if (!confirm(`Delete all quiz history stored in this browser? This cannot be undone. Consider exporting first.${linked}`)) return;
    clearData();
    const m = root.querySelector('#clear-msg');
    m.className = 'msg good';
    m.textContent = 'All data cleared.';
    root.querySelector('#data-count').textContent = '0 attempts stored in this browser.';
  });
  icons();
}
