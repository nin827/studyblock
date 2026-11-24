// #/mix builder (draft + user/official presets) and #/mix/play mixed quiz.

import {
  loadDomains, loadModulesOf, normalizeMixConfig, mixShares, sanitizeWeight, sanitizeCount,
  buildMixQuiz, loadOfficialPresets, DIFFICULTY_ORDER, MIX_MAX_COUNT, isValidId, OFFICIAL_PREFIX,
} from '../lib/engine.js';
import {
  loadMixDraft, saveMixDraft, getPresets, createPreset, updatePreset, renamePreset, deletePreset,
  PRESET_NAME_MAX, MIX_MODULE,
} from '../lib/storage.js';
import { esc, icon, icons, cap, errorBox, domClass, domVars, domStyle } from './ui.js';
import { runQuiz, storedQuestion, crumbsHtml } from './quiz.js';

// Domains with only their loadable modules: [{ ...domain, modules: [ids], loaded: [module objects] }].
async function loadAvailable() {
  const domains = await loadDomains();
  return Promise.all(domains.map(async d => {
    const loaded = (await loadModulesOf(d)).filter(m => m.subtopics.length);
    return { ...d, modules: loaded.map(m => m.id), loaded };
  }));
}

async function officialSafe() {
  try { return await loadOfficialPresets(); } catch (e) { console.warn(e); return []; }
}

const fmtShare = s => {
  const p = s * 100;
  if (p === 0) return '0%';
  if (p < 1) return '<1%';
  return `${Math.round(p)}%`;
};

// normalizeMixConfig iterates `available` in order, so equal configs stringify identically.
const sameConfig = (a, b, available) =>
  JSON.stringify(normalizeMixConfig(a, available)) === JSON.stringify(normalizeMixConfig(b, available));

// ---- builder ----

export async function render(root, params, ctx) {
  let available, official;
  try {
    [available, official] = await Promise.all([loadAvailable(), officialSafe()]);
  } catch (e) {
    console.error(e);
    if (ctx.alive()) root.innerHTML = errorBox('Could not load modules', 'modules/index.json is missing or invalid. Make sure the app is served over HTTP.');
    return;
  }
  if (!ctx.alive()) return;
  draw(root, available, official, params.only, '');
}

// Renders the whole builder from the stored draft. Called again after preset actions.
function draw(root, available, official, only, flash) {
  const defaults = normalizeMixConfig(null, available);
  const stored = loadMixDraft();
  const presets = getPresets();
  const allPresets = [...official, ...presets];
  const draft = {
    config: normalizeMixConfig(stored?.config ?? null, available),
    presetId: stored?.presetId && allPresets.some(p => p.id === stored.presetId) ? stored.presetId : null,
  };
  const cfg = draft.config;

  // UI state keeps a remembered weight separately from the ticked state; the stored config
  // (CLAUDE.md shape) has no "enabled" flag, so an unticked item is saved as weight 0.
  const state = {};
  for (const d of available) {
    const dc = cfg.domains[d.id];
    const modules = {};
    for (const mid of d.modules) {
      const w = dc.modules[mid];
      modules[mid] = { on: w > 0, weight: w > 0 ? w : 1 };
    }
    state[d.id] = { on: d.modules.length > 0 && dc.weight > 0, weight: dc.weight > 0 ? dc.weight : 1, modules };
  }
  const preselect = only && isValidId(only) && state[only] && available.find(d => d.id === only)?.modules.length;
  if (preselect) {
    for (const id in state) state[id].on = id === only;
  }

  // A real number input (fractional weights still typeable) between −/+ buttons.
  const weightInput = (name, value, title, disabled) =>
    `<span class="stepper" role="group" aria-label="${esc(`${title} weight`)}">
      <button type="button" class="step" data-step="-1" aria-label="${esc(`Decrease ${title} weight`)}" ${disabled ? 'disabled' : ''}>−</button>
      <input type="number" class="weight-input" name="${name}" min="0" step="any" inputmode="decimal" enterkeyhint="next"
        value="${esc(String(value))}" aria-label="${esc(`Weight for ${title}`)}" ${disabled ? 'disabled' : ''}>
      <button type="button" class="step" data-step="1" aria-label="${esc(`Increase ${title} weight`)}" ${disabled ? 'disabled' : ''}>+</button>
    </span>`;

  const domainBlocks = available.map(d => {
    const s = state[d.id];
    const dc = domClass(d.id);
    if (!d.modules.length) {
      return `<li class="mix-domain is-empty is-off ${dc}"${domStyle(d)}>
        <div class="mix-row mix-domain-head">
          <label class="mix-check"><input type="checkbox" disabled><span class="swatch"></span>
            <span class="mix-name">${esc(d.title)}</span></label>
          <span class="soon">Coming soon</span>
        </div>
      </li>`;
    }
    const n = d.modules.length;
    const mods = d.loaded.map(m => {
      const ms = s.modules[m.id];
      const title = String(m.title ?? m.id);
      return `<li class="mix-row mix-module" data-domain="${esc(d.id)}" data-module="${esc(m.id)}">
        <label class="mix-check"><input type="checkbox" data-role="module" ${ms.on ? 'checked' : ''}>
          <span class="mix-name">${esc(title)}</span></label>
        <span class="mix-share" data-share>–</span>
        ${weightInput('mw', ms.weight, title, !ms.on)}
      </li>`;
    }).join('');
    return `<li class="mix-domain ${dc}"${domStyle(d)} data-domain="${esc(d.id)}">
      <div class="mix-row mix-domain-head">
        <label class="mix-check"><input type="checkbox" data-role="domain" ${s.on ? 'checked' : ''}>
          <span class="swatch"></span><span class="mix-name">${esc(d.title)}</span>
          <span class="mix-count">${n} subdomain${n === 1 ? '' : 's'}</span></label>
        <span class="mix-share mix-share-domain" data-dshare>–</span>
        ${weightInput('dw', s.weight, d.title, !s.on)}
      </div>
      <ul class="mix-modules" ${s.on ? '' : 'hidden'}>${mods}</ul>
    </li>`;
  }).join('');

  const chip = p => `<span class="chip ${p.official ? 'is-official' : ''} ${p.id === draft.presetId ? 'is-linked' : ''}" data-id="${esc(p.id)}" role="listitem">
      <button type="button" class="chip-main" data-act="load" title="${esc(p.description || `Load ${p.name}`)}">
        ${p.official ? `${icon('badge-check')}<span class="sr-only">Official preset: </span>` : ''}<span>${esc(p.name)}</span></button>
      ${p.official ? '' : `<button type="button" class="chip-icon" data-act="rename" aria-label="Rename ${esc(p.name)}">${icon('pencil')}</button>
      <button type="button" class="chip-icon chip-danger" data-act="delete" aria-label="Delete ${esc(p.name)}">${icon('trash-2')}</button>`}
    </span>`;

  root.innerHTML = `
    ${crumbsHtml([{ href: '#/', label: 'Home' }, { label: 'Mixed quiz' }])}
    <section class="page-head">
      <p class="eyebrow">Mixed quiz</p>
      <h1>Build your mix</h1>
      <p>Tick what to include and set how often each appears. A weight of 2 shows up twice as often as a weight of 1.</p>
    </section>
    <section class="card presets-bar" aria-label="Presets">
      <div class="presets-top">
        <div class="presets-chips">
          <span class="presets-label" aria-hidden="true">Presets</span>
          <div class="chip-scroll">
            ${official.length ? `<div class="chip-group" role="list" aria-label="Official presets">${official.map(chip).join('')}</div>
              <span class="chip-divider" aria-hidden="true"></span>` : ''}
            ${presets.length
              ? `<div class="chip-group" role="list" aria-label="Your presets">${presets.map(chip).join('')}</div>`
              : '<span class="chip-empty">None saved yet</span>'}
          </div>
        </div>
        <span class="status-pill" id="draft-status" role="status" aria-live="polite"></span>
      </div>
      <div class="presets-actions">
        <button type="button" class="btn btn-soft" id="preset-new">${icon('save')} Save as new</button>
        <button type="button" class="btn" id="preset-update" hidden>${icon('refresh-cw')} Update preset</button>
        <button type="button" class="btn btn-ghost" id="draft-clear">Clear draft</button>
      </div>
      <p class="presets-note">Your current mix is kept in this browser until you save it as a preset or clear it.</p>
      <p id="preset-msg" class="msg" role="status" aria-live="polite"></p>
    </section>
    <form class="mix-layout" id="mix-form" novalidate>
      <div class="mix-main">
        <h2 class="sr-only">Domains</h2>
        <ul class="mix-list">${domainBlocks}</ul>
      </div>
      <aside class="mix-summary" id="mix-summary" aria-label="Mix summary">
        <h2 class="mix-summary-title">Your mix</h2>
        <button type="button" class="mix-summary-toggle" id="mix-summary-toggle" aria-expanded="false" aria-controls="mix-sheet">
          <span class="sheet-handle" aria-hidden="true"></span>
          <span class="share-bar" id="share-bar" role="img" aria-label="Share of questions per subdomain"></span>
          <span class="mix-summary-line">
            <span class="mix-summary-text" id="mix-summary-text"></span>
            <span class="mix-summary-hint"><span id="mix-sheet-hint">Details</span>${icon('chevron-up', 'chev')}</span>
          </span>
        </button>
        <div class="mix-sheet" id="mix-sheet" hidden>
          <ul class="mix-sheet-list" id="mix-sheet-list"></ul>
          <div class="mix-options">
            <label class="field-row"><span class="field-label">Difficulty</span>
              <select id="mix-diff">${['any', ...DIFFICULTY_ORDER].map(d =>
                `<option value="${d}" ${d === cfg.difficulty ? 'selected' : ''}>${esc(cap(d))}</option>`).join('')}</select>
            </label>
            <div class="field-row">
              <label class="field-label" for="mix-count">Questions</label>
              <span class="stepper count-stepper" role="group" aria-label="Question count">
                <button type="button" class="step" data-count-step="-1" aria-label="Fewer questions">−</button>
                <input type="number" id="mix-count" class="count-input" min="1" max="${MIX_MAX_COUNT}" step="1"
                  inputmode="numeric" enterkeyhint="go" value="${cfg.count}">
                <button type="button" class="step" data-count-step="1" aria-label="More questions">+</button>
              </span>
            </div>
          </div>
        </div>
        <p id="mix-msg" class="msg bad" role="status" aria-live="polite"></p>
        <button type="submit" class="btn btn-primary mix-start" id="mix-start">${icon('play')} <span id="mix-start-label">Start</span></button>
      </aside>
    </form>`;

  const form = root.querySelector('#mix-form');
  const startBtn = root.querySelector('#mix-start');
  const startLabel = root.querySelector('#mix-start-label');
  const msg = root.querySelector('#mix-msg');
  const countInput = root.querySelector('#mix-count');
  const diffSelect = root.querySelector('#mix-diff');
  const statusEl = root.querySelector('#draft-status');
  const updateBtn = root.querySelector('#preset-update');
  const presetMsg = root.querySelector('#preset-msg');
  const toggle = root.querySelector('#mix-summary-toggle');
  const sheet = root.querySelector('#mix-sheet');
  const sheetList = root.querySelector('#mix-sheet-list');
  const shareBar = root.querySelector('#share-bar');
  const summaryText = root.querySelector('#mix-summary-text');

  const say = (text, good) => {
    presetMsg.textContent = text;
    presetMsg.className = `msg ${good ? 'good' : 'bad'}`;
  };
  if (flash) say(flash, true);

  const sheetHint = root.querySelector('#mix-sheet-hint');
  toggle.addEventListener('click', () => {
    const open = sheet.hidden;
    sheet.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    sheetHint.textContent = open ? 'Hide details' : 'Details';
  });

  // −/+ steppers edit the number input, then fire the same input event typing would.
  const bump = (input, delta, min, max) => {
    if (!input || input.disabled) return;
    const cur = parseFloat(input.value);
    const next = Math.min(max, Math.max(min, Math.round(((Number.isFinite(cur) ? cur : 0) + delta) * 1000) / 1000));
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  root.querySelectorAll('.step[data-step]').forEach(b => b.addEventListener('click', () =>
    bump(b.parentElement.querySelector('.weight-input'), +b.dataset.step, 0, Infinity)));
  root.querySelectorAll('.step[data-count-step]').forEach(b => b.addEventListener('click', () =>
    bump(countInput, +b.dataset.countStep, 1, MIX_MAX_COUNT)));

  // Read inputs into `state`; returns the config in CLAUDE.md shape.
  function readForm() {
    for (const li of root.querySelectorAll('.mix-domain[data-domain]')) {
      const s = state[li.dataset.domain];
      const box = li.querySelector('input[data-role="domain"]');
      const w = li.querySelector('input[name="dw"]');
      s.on = box.checked;
      const parsed = sanitizeWeight(w.value, NaN);
      w.setAttribute('aria-invalid', String(Number.isNaN(parsed)));
      s.weight = Number.isNaN(parsed) ? 0 : parsed;
      w.disabled = !s.on;
      w.parentElement.querySelectorAll('.step').forEach(b => { b.disabled = !s.on; });
      li.querySelector('.mix-modules').hidden = !s.on;
    }
    for (const li of root.querySelectorAll('.mix-module')) {
      const ms = state[li.dataset.domain].modules[li.dataset.module];
      const box = li.querySelector('input[data-role="module"]');
      const w = li.querySelector('input[name="mw"]');
      ms.on = box.checked;
      const parsed = sanitizeWeight(w.value, NaN);
      w.setAttribute('aria-invalid', String(Number.isNaN(parsed)));
      ms.weight = Number.isNaN(parsed) ? 0 : parsed;
      w.disabled = !ms.on;
      w.parentElement.querySelectorAll('.step').forEach(b => { b.disabled = !ms.on; });
    }
    const domains = {};
    for (const d of available) {
      const s = state[d.id];
      const modules = {};
      for (const mid of d.modules) modules[mid] = s.modules[mid].on ? s.modules[mid].weight : 0;
      domains[d.id] = { weight: s.on ? s.weight : 0, modules };
    }
    const count = sanitizeCount(countInput.value, 10);
    const difficulty = ['any', ...DIFFICULTY_ORDER].includes(diffSelect.value) ? diffSelect.value : 'any';
    return { domains, difficulty, count };
  }

  const linked = () => allPresets.find(p => p.id === draft.presetId) || null;
  // True when leaving the current draft would lose something not stored in a preset.
  const hasUnsavedWork = () => {
    const l = linked();
    return l ? !sameConfig(draft.config, l.config, available) : !sameConfig(draft.config, defaults, available);
  };

  function refreshStatus() {
    const l = linked();
    if (l) {
      const dirty = !sameConfig(draft.config, l.config, available);
      statusEl.className = `status-pill ${dirty ? 'is-unsaved' : 'is-saved'}`;
      statusEl.innerHTML = `<span>${dirty ? 'Unsaved changes to' : 'Saved ·'} ${esc(l.name)}</span>`;
      // Official presets are read-only: no Update.
      updateBtn.hidden = !!l.official;
      updateBtn.disabled = !dirty;
      updateBtn.innerHTML = `${icon('refresh-cw')} Update “${esc(l.name)}”`;
    } else {
      statusEl.className = 'status-pill is-draft';
      statusEl.innerHTML = '<span>Draft · kept on this device</span>';
      updateBtn.hidden = true;
    }
    icons();
  }

  const titleOfDomain = new Map(available.map(d => [d.id, d.title]));
  const domById = new Map(available.map(d => [d.id, d]));
  const titleOfModule = new Map(available.flatMap(d => d.loaded.map(m => [m.id, String(m.title ?? m.id)])));

  function update(persist) {
    const config = readForm();
    draft.config = config;
    const shares = mixShares(config, available);
    const byModule = new Map(shares.map(r => [r.module, r.share]));
    const byDomain = new Map();
    for (const r of shares) byDomain.set(r.domain, (byDomain.get(r.domain) || 0) + r.share);
    root.querySelectorAll('.mix-module').forEach(li => {
      const share = byModule.get(li.dataset.module) || 0;
      li.querySelector('[data-share]').textContent = fmtShare(share);
      li.classList.toggle('is-off', share === 0);
    });
    root.querySelectorAll('.mix-domain[data-domain]').forEach(li => {
      const share = byDomain.get(li.dataset.domain) || 0;
      li.querySelector('[data-dshare]').textContent = fmtShare(share);
      li.classList.toggle('is-off', share === 0);
    });

    // Summary: share bar (per domain), text, and the expandable sheet.
    const domainShares = [...byDomain.entries()];
    shareBar.innerHTML = shares.map(r =>
      `<span class="share-seg ${domClass(r.domain)}" style="${domVars(domById.get(r.domain))}flex-grow:${r.share.toFixed(4)}"></span>`).join('');
    shareBar.setAttribute('aria-label', shares.length
      ? `Share of questions: ${shares.map(r => `${titleOfModule.get(r.module) ?? r.module} ${fmtShare(r.share)}`).join(', ')}`
      : 'Nothing selected');
    summaryText.textContent = shares.length
      ? `${domainShares.length} domain${domainShares.length === 1 ? '' : 's'} · ${shares.length} subdomain${shares.length === 1 ? '' : 's'} · ${cap(config.difficulty)}`
      : 'Nothing selected';
    sheetList.innerHTML = domainShares.map(([id, s]) => `<li class="${domClass(id)}"${domStyle(domById.get(id))}>
        <div class="sheet-row"><span class="swatch"></span><strong>${esc(titleOfDomain.get(id) ?? id)}</strong><span>${esc(fmtShare(s))}</span></div>
        <ul>${shares.filter(r => r.domain === id).map(r =>
          `<li class="sheet-row"><span></span><span>${esc(titleOfModule.get(r.module) ?? r.module)}</span><span>${esc(fmtShare(r.share))}</span></li>`).join('')}</ul>
      </li>`).join('') || '<li class="muted">No subdomains selected.</li>';
    startLabel.textContent = `Start · ${config.count} question${config.count === 1 ? '' : 's'}`;

    const ok = shares.length > 0;
    startBtn.disabled = !ok;
    msg.textContent = ok ? '' : 'Nothing selected — tick at least one subdomain with a weight above 0.';
    if (persist) saveMixDraft(draft); // draft is auto-saved on every change
    refreshStatus();
    return { config, ok };
  }

  // Enter / "Next" in a weight field moves to the next field instead of submitting the form.
  const weightFields = () => [...root.querySelectorAll('.weight-input:not(:disabled), #mix-count')];
  root.querySelectorAll('.weight-input').forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const list = weightFields();
    const next = list[list.indexOf(inp) + 1];
    if (next) next.focus();
  }));
  form.addEventListener('input', () => update(true));
  form.addEventListener('change', () => update(true));
  countInput.addEventListener('blur', () => { countInput.value = String(sanitizeCount(countInput.value, 10)); update(true); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    countInput.value = String(sanitizeCount(countInput.value, 10));
    const { ok } = update(true);
    if (ok) location.hash = '#/mix/play';
  });

  const askName = (title, current) => window.prompt(`${title} (1–${PRESET_NAME_MAX} characters)`, current ?? '');
  const redraw = text => draw(root, available, official, null, text);

  root.querySelector('#preset-new').addEventListener('click', () => {
    const name = askName('Name for this preset');
    if (name === null) return;
    try {
      const p = createPreset(name, update(false).config);
      draft.presetId = p.id;
      saveMixDraft(draft);
      redraw(`Saved preset “${p.name}”.`);
    } catch (e) { say(e.message || String(e)); }
  });
  updateBtn.addEventListener('click', () => {
    const l = linked();
    if (!l || l.official) return;
    try {
      updatePreset(l.id, update(false).config);
      saveMixDraft(draft);
      redraw(`Updated preset “${l.name}”.`);
    } catch (e) { say(e.message || String(e)); }
  });
  root.querySelector('#draft-clear').addEventListener('click', () => {
    if (hasUnsavedWork() && !confirm('Reset the mix to the defaults? Unsaved changes will be lost.')) return;
    saveMixDraft({ config: defaults, presetId: null });
    redraw('Mix reset to defaults.');
  });
  root.querySelectorAll('.chip[data-id]').forEach(el => {
    const p = allPresets.find(x => x.id === el.dataset.id);
    if (!p) return;
    el.querySelector('[data-act="load"]').addEventListener('click', () => {
      if (hasUnsavedWork() && !confirm(`Load “${p.name}”? Unsaved changes to the current mix will be lost.`)) return;
      // normalizeMixConfig drops vanished domains/modules and adds new ones ticked with weight 1.
      saveMixDraft({ config: normalizeMixConfig(p.config, available), presetId: p.id });
      redraw(`Loaded preset “${p.name}”.`);
    });
    if (p.official) return; // read-only
    el.querySelector('[data-act="rename"]').addEventListener('click', () => {
      const name = askName('New name', p.name);
      if (name === null) return;
      try {
        const r = renamePreset(p.id, name);
        redraw(`Renamed to “${r.name}”.`);
      } catch (e) { say(e.message || String(e)); }
    });
    el.querySelector('[data-act="delete"]').addEventListener('click', () => {
      if (!confirm(`Delete preset “${p.name}”? This cannot be undone.`)) return;
      try {
        deletePreset(p.id);
        if (draft.presetId === p.id) { draft.presetId = null; saveMixDraft(draft); }
        redraw(`Deleted preset “${p.name}”.`);
      } catch (e) { say(e.message || String(e)); }
    });
  });

  // Persist a preselection (from "Mix this domain") immediately so play uses it.
  update(Boolean(preselect));
  if (only) {
    // Drop the one-shot "?only=" so a reload keeps the user's later edits.
    try { history.replaceState(null, '', '#/mix'); } catch { /* ignore */ }
  }
  icons();
}

// ---- play ----

// params.preset: optional preset id (home quick-start chips; "official:<id>" for repo presets);
// otherwise the current draft. Quick-starting a preset does not touch the draft.
export async function renderPlay(root, params, ctx) {
  let config = loadMixDraft()?.config ?? null;
  let label = 'Mixed quiz';
  if (params.preset) {
    const pool = params.preset.startsWith(OFFICIAL_PREFIX) ? await officialSafe() : getPresets();
    if (!ctx.alive()) return;
    const p = pool.find(x => x.id === params.preset);
    if (!p) {
      root.innerHTML = errorBox('Preset not found', 'That mix preset no longer exists.');
      return;
    }
    config = p.config;
    label = p.name;
  }
  const difficulty = ['any', ...DIFFICULTY_ORDER].includes(config?.difficulty) ? config.difficulty : 'any';
  const crumbs = crumbsHtml([{ href: '#/', label: 'Home' }, { href: '#/mix', label: 'Mixed quiz' }, { label: params.preset ? label : 'Play' }]);

  await runQuiz(root, ctx, {
    build: () => buildMixQuiz(config), // fresh seed each time (Retry = same config, new quiz)
    title: `${esc(label)} · ${esc(difficulty === 'any' ? 'Any difficulty' : cap(difficulty))}`,
    crumbs,
    backHref: '#/mix',
    backLabel: 'Edit mix',
    backIcon: 'sliders-horizontal',
    showTags: true,
    buildError: e => `${crumbs}<div class="card error-box">${icon('triangle-alert')}<div><h2>Could not build mixed quiz</h2>
      <p>${esc(e.message || String(e))}</p>
      <p><a class="btn" href="#/mix">${icon('sliders-horizontal')} Edit mix</a></p></div></div>`,
    toAttempt: results => ({
      module: MIX_MODULE, subtopic: MIX_MODULE, difficulty,
      questions: results.map(r => storedQuestion(r, true)),
    }),
  });
}
