// Tiny markdown -> HTML. Escapes HTML first, then formats.

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// href arrives already HTML-escaped. Allow only http(s) and relative URLs.
function safeHref(href) {
  const raw = href
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&').trim();
  const compact = raw.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/);
  if (scheme && scheme[1] !== 'http' && scheme[1] !== 'https') return null;
  if (raw.startsWith('//')) return null; // protocol-relative: treat as external, disallow
  return escapeHtml(raw);
}

// Inline formatting on an already-escaped string.
function formatInline(escaped) {
  const codes = [];
  let s = escaped.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
    const h = safeHref(href);
    if (!h) return text;
    const ext = /^https?:/i.test(h) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${h}"${ext}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w_])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
  return s;
}

export function renderInline(src) {
  return formatInline(escapeHtml(src));
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map(c => c.trim());
}

const isTableSep = l => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');

// GitHub-style alerts: "> [!WARNING] optional title". Icon + label always, never colour alone.
const CALLOUTS = {
  note: { icon: 'info', label: 'Note' },
  tip: { icon: 'lightbulb', label: 'Tip' },
  important: { icon: 'circle-alert', label: 'Important' },
  warning: { icon: 'triangle-alert', label: 'Warning' },
  caution: { icon: 'octagon-alert', label: 'Caution' },
};

export function renderMarkdown(src) {
  return renderLines(escapeHtml(String(src ?? '').replace(/\r\n?/g, '\n')).split('\n'));
}

// `lines` are already HTML-escaped.
function renderLines(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const cls = fence[1] ? ` class="lang-${fence[1]}"` : '';
      out.push(`<pre><code${cls}>${buf.join('\n')}</code></pre>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { out.push(`<h${h[1].length}>${formatInline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // blockquote (">" is escaped to &gt;)
    if (/^\s*&gt;/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*&gt;/.test(lines[i])) buf.push(lines[i++].replace(/^\s*&gt;\s?/, ''));
      const co = buf[0].match(/^\s*\[!(note|tip|important|warning|caution)\][ \t]*(.*)$/i);
      if (co) {
        const kind = co[1].toLowerCase();
        const def = CALLOUTS[kind];
        const title = co[2].trim() ? formatInline(co[2].trim()) : def.label;
        out.push(`<aside class="callout callout-${kind}" role="note"><p class="callout-head"><i data-lucide="${def.icon}" class="icon" aria-hidden="true"></i><span class="callout-title">${title}</span></p>` +
          `<div class="callout-body">${renderLines(buf.slice(1))}</div></aside>`);
        continue;
      }
      out.push(`<blockquote>${buf.join(' ').trim() ? `<p>${formatInline(buf.join(' '))}</p>` : ''}</blockquote>`);
      continue;
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) body.push(splitRow(lines[i++]));
      out.push('<div class="table-wrap"><table><thead><tr>' +
        head.map(c => `<th>${formatInline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.map(r => '<tr>' + head.map((_, k) => `<td>${formatInline(r[k] ?? '')}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }

    // lists
    const ul = /^\s*[-*+]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i++].replace(re, '');
        // continuation lines (indented, not a new item)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !ul.test(lines[i]) && !ol.test(lines[i])) {
          item += ' ' + lines[i++].trim();
        }
        items.push(`<li>${formatInline(item)}</li>`);
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    // paragraph
    const buf = [];
    while (i < lines.length && lines[i].trim() &&
      !/^\s*```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\s*&gt;/.test(lines[i]) &&
      !ul.test(lines[i]) && !ol.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i++].trim());
    }
    if (!buf.length) { buf.push(lines[i++].trim()); }
    out.push(`<p>${formatInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}
