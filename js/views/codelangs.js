// Code languages picker (ticket 027): toggle chips over the one shared preference, the
// sb_codeLangs cookie (getCodeLangs/setCodeLangs in storage.js). Shown in Settings, on the module
// page of a language-aware module and on role/subrole pages whose subjects show code. Each page
// re-reads the preference when it renders, so a change in one place shows everywhere.
// At least one language stays on: the last one on (among the chips shown) can't be turned off.
// Role pages: non-industry languages (GDScript) that are on show greyed with "not used in role
// runs", but are never turned off for the user; those that are off aren't shown there.
// A role may accept extra non-industry languages (`roleLangs`, passed as `extra`): those show normal.

import { getCodeLangs, setCodeLangs } from '../lib/storage.js';
import { runLangs } from '../lib/engine.js';
import { LANG_IDS, isLang, isIndustryLang, langTitle } from '../lib/languages.js';
import { esc, icon } from './ui.js';

const CONTEXTS = ['settings', 'module', 'role'];
const list = ids => ids.map(langTitle).join(', ');

// The ids a picker shows, in LANG_IDS order (role pages drop non-industry languages that are off).
function shownIds(ids, ctx, chosen, extra = []) {
  const set = new Set(ids.filter(isLang));
  return LANG_IDS.filter(l => set.has(l) && (ctx !== 'role' || isIndustryLang(l) || extra.includes(l) || chosen.includes(l)));
}

// The plain-text line under the chips: which languages questions will use here.
function summary(ctx, ids, chosen, extra = []) {
  if (ctx === 'settings') return `On: ${list(chosen)}.`;
  const role = ctx === 'role';
  const want = ids.filter(l => chosen.includes(l) && (!role || isIndustryLang(l) || extra.includes(l)));
  const use = runLangs({ languages: ids }, { role, chosen, extra });
  if (!want.length) {
    return role
      ? `No industry-standard language is on, so role runs use ${list(use)}.`
      : `None of your languages are offered here, so questions use ${list(use)}.`;
  }
  return use.length === 1
    ? `${role ? 'Role runs use' : 'Questions use'} ${list(use)}.`
    : `${role ? 'Role runs use' : 'Questions use'} ${list(use)}, one per question.`;
}

/*
 * Markup for one picker. `ids` = the languages to offer (Settings: all; module page: the module's
 * `languages`; role page: every language its code subjects list). `id` prefixes element ids.
 */
export function codeLangsHtml({ ids = LANG_IDS, extra = [], ctx = 'settings', id = 'code-langs', label = 'Code languages', hint = '', labelIcon = true } = {}) {
  const c = CONTEXTS.includes(ctx) ? ctx : 'settings';
  const chosen = getCodeLangs();
  const ex = c === 'role' ? extra.filter(isLang) : [];
  const show = shownIds(ids, c, chosen, ex);
  const offered = LANG_IDS.filter(l => ids.includes(l));
  const sid = esc(id);
  const chip = l => {
    const unused = c === 'role' && !isIndustryLang(l) && !ex.includes(l);
    return `<button type="button" class="lang-chip${unused ? ' is-unused' : ''}" data-lang="${esc(l)}" aria-pressed="${chosen.includes(l)}">
        <span class="lang-chip-mark is-on">${icon('check')}</span><span class="lang-chip-mark is-off">${icon('plus')}</span>
        <span class="lang-chip-name">${esc(langTitle(l))}</span>${unused ? '<span class="lang-chip-note">not used in role runs</span>' : ''}
      </button>`;
  };
  return `<div class="codelangs" data-codelangs data-ctx="${c}" data-ids="${esc(offered.join(','))}" data-extra="${esc(ex.join(','))}">
    <p class="field-label" id="${sid}-label">${labelIcon ? `${icon('code')} ` : ''}${esc(label)}</p>
    ${hint ? `<p class="muted small codelangs-hint" id="${sid}-hint">${esc(hint)}</p>` : ''}
    <div class="lang-chips" role="group" aria-labelledby="${sid}-label" aria-describedby="${hint ? `${sid}-hint ` : ''}${sid}-status">
      ${show.map(chip).join('')}
    </div>
    <p class="muted small codelangs-status" id="${sid}-status">${esc(summary(c, offered, chosen, ex))}</p>
    <p class="codelangs-msg small" role="status" aria-live="polite"></p>
  </div>`;
}

// Wires every picker inside `scope`. `onChange(chosen)` runs after a change is saved.
export function bindCodeLangs(scope, onChange) {
  scope?.querySelectorAll('[data-codelangs]').forEach(box => {
    const ctx = box.dataset.ctx;
    const ids = (box.dataset.ids || '').split(',').filter(isLang);
    const extra = (box.dataset.extra || '').split(',').filter(isLang);
    const status = box.querySelector('.codelangs-status');
    const msg = box.querySelector('.codelangs-msg');
    box.querySelectorAll('.lang-chip[data-lang]').forEach(btn => btn.addEventListener('click', () => {
      const l = btn.dataset.lang;
      const chosen = getCodeLangs(); // re-read: another tab or page may have changed it
      const on = chosen.includes(l);
      if (on) {
        const visibleOn = [...box.querySelectorAll('.lang-chip[aria-pressed="true"]')].map(b => b.dataset.lang).filter(x => chosen.includes(x));
        if (chosen.length <= 1 || (visibleOn.length <= 1 && visibleOn.includes(l))) {
          msg.classList.add('is-warn');
          msg.textContent = `At least one language stays on, so ${langTitle(l)} can't be turned off. Turn another one on first.`;
          return;
        }
      }
      const next = on ? chosen.filter(x => x !== l) : [...chosen, l];
      if (!setCodeLangs(next)) return;
      const saved = getCodeLangs();
      box.querySelectorAll('.lang-chip[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(saved.includes(b.dataset.lang))));
      msg.classList.remove('is-warn');
      msg.textContent = `${langTitle(l)} ${on ? 'off' : 'on'}.`;
      if (status) status.textContent = summary(ctx, ids, saved, extra);
      onChange?.(saved);
    }));
  });
}
