// Minimal, dependency-free markdown renderer (§16 Notes, §18 Documentation).
import React, { useMemo } from 'react';

function esc(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

export function renderMarkdown(src = '') {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let listType = null;

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      closeList();
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre><code data-lang="${esc(lang)}">${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i += 1; continue; }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { closeList(); out.push('<hr/>'); i += 1; continue; }

    if (line.startsWith('>')) {
      closeList();
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    if (line.includes('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      closeList();
      const cells = (r) => r.split('|').map((c) => c.trim()).filter((c, idx, a) => !(idx === 0 && !c) && !(idx === a.length - 1 && !c));
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) { rows.push(cells(lines[i])); i += 1; }
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      if (listType !== 'ul') { closeList(); out.push('<ul style="list-style:none;margin-left:2px">'); listType = 'ul'; }
      out.push(`<li><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}/>${
        task[1].toLowerCase() === 'x' ? `<s>${inline(task[2])}</s>` : inline(task[2])}</li>`);
      i += 1; continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`); i += 1; continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`); i += 1; continue;
    }

    if (!line.trim()) { closeList(); i += 1; continue; }

    closeList();
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) {
      buf.push(lines[i]); i += 1;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  closeList();
  return out.join('\n');
}

export default function Markdown({ children, className = '' }) {
  const html = useMemo(() => renderMarkdown(children || ''), [children]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
