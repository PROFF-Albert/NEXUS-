// PRD §13 — Code Viewer: highlighting, line numbers, search, find & replace,
// read-only mode, split view, mini map, compare versions.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui';

const KEYWORDS = /\b(abstract|as|async|await|break|case|catch|class|const|constructor|continue|def|default|del|delete|do|elif|else|enum|except|export|extends|False|finally|fn|for|from|func|function|global|if|impl|import|in|instanceof|interface|is|lambda|let|match|mod|mut|new|None|not|null|or|pass|private|protected|public|pub|raise|return|self|static|struct|super|switch|this|throw|True|try|type|typeof|use|var|void|while|with|yield|and|elseif|echo|foreach|endif|require|include|package|nil|end|then|begin|declare|namespace)\b/g;

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** Lightweight tokenizer — fast enough to run on every keystroke. */
function highlight(code, lang) {
  const out = [];
  const push = (cls, text) => out.push(cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text));

  if (lang === 'html' || lang === 'xml') {
    const re = /(<!--[\s\S]*?-->)|(<\/?[\w:-]+)|([\w:-]+)(?==)|("[^"]*"|'[^']*')|(\/?>)/g;
    let last = 0; let m;
    while ((m = re.exec(code))) {
      push(null, code.slice(last, m.index));
      if (m[1]) push('tok-com', m[1]);
      else if (m[2]) push('tok-tag', m[2]);
      else if (m[3]) push('tok-attr', m[3]);
      else if (m[4]) push('tok-str', m[4]);
      else if (m[5]) push('tok-tag', m[5]);
      last = m.index + m[0].length;
    }
    push(null, code.slice(last));
    return out.join('');
  }

  if (lang === 'css' || lang === 'scss') {
    const re = /(\/\*[\s\S]*?\*\/)|(--[\w-]+|[\w-]+(?=\s*:))|(#[0-9a-fA-F]{3,8}\b)|("[^"]*"|'[^']*')|(\.[\w-]+|#[\w-]+|@[\w-]+)/g;
    let last = 0; let m;
    while ((m = re.exec(code))) {
      push(null, code.slice(last, m.index));
      if (m[1]) push('tok-com', m[1]);
      else if (m[2]) push('tok-attr', m[2]);
      else if (m[3]) push('tok-num', m[3]);
      else if (m[4]) push('tok-str', m[4]);
      else if (m[5]) push('tok-key', m[5]);
      last = m.index + m[0].length;
    }
    push(null, code.slice(last));
    return out.join('');
  }

  if (lang === 'markdown') {
    return escapeHtml(code)
      .replace(/^(#{1,6} .*)$/gm, '<span class="tok-key">$1</span>')
      .replace(/(\*\*[^*]+\*\*)/g, '<span class="tok-attr">$1</span>')
      .replace(/(`[^`]+`)/g, '<span class="tok-str">$1</span>')
      .replace(/^(\s*[-*+] )/gm, '<span class="tok-punc">$1</span>');
  }

  // generic C-family / python / json
  const re = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?""")|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|([A-Za-z_$][\w$]*)(?=\s*\()/g;
  let last = 0; let m;
  while ((m = re.exec(code))) {
    const plain = code.slice(last, m.index);
    out.push(escapeHtml(plain).replace(KEYWORDS, '<span class="tok-key">$1</span>'));
    if (m[1]) push('tok-com', m[1]);
    else if (m[2]) push('tok-str', m[2]);
    else if (m[3]) push('tok-num', m[3]);
    else if (m[4]) push('tok-fn', m[4]);
    last = m.index + m[0].length;
  }
  out.push(escapeHtml(code.slice(last)).replace(KEYWORDS, '<span class="tok-key">$1</span>'));
  return out.join('');
}

export function CodeBlock({ content, language, highlightLines = [], showLineNumbers = true, minimap = false, maxHeight }) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const html = useMemo(() => highlight(content, language), [content, language]);
  const htmlLines = useMemo(() => {
    // re-split highlighted html by line while keeping spans balanced per line
    const parts = html.split('\n');
    return parts;
  }, [html]);

  return (
    <div className="code-scroll" style={maxHeight ? { maxHeight } : undefined}>
      <div className="code-body">
        {showLineNumbers && (
          <div className="gutter">
            {lines.map((_, i) => (
              <div key={i} className={highlightLines.includes(i + 1) ? 'hl' : ''}>{i + 1}</div>
            ))}
          </div>
        )}
        <div className="code-lines">
          {htmlLines.map((l, i) => (
            <div key={i} className={`line ${highlightLines.includes(i + 1) ? 'hl' : ''}`}
                 dangerouslySetInnerHTML={{ __html: l || '&nbsp;' }} />
          ))}
        </div>
        {minimap && (
          <div className="minimap" aria-hidden>
            {lines.slice(0, 400).map((l, i) => (
              <i key={i} style={{ width: `${Math.min(100, (l.trim().length / 60) * 100)}%` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CodeViewer({
  file, content, language, onSave, onClose, readOnly: initialReadOnly = false,
  settings = {}, versions = [], onCompare, busy,
}) {
  const [text, setText] = useState(content);
  const [readOnly, setReadOnly] = useState(initialReadOnly);
  const [split, setSplit] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [dirty, setDirty] = useState(false);
  const areaRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => { setText(content); setDirty(false); }, [content, file?.id]);

  const matches = useMemo(() => {
    if (!find) return 0;
    try { return (text.match(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length; }
    catch { return 0; }
  }, [find, text]);

  const matchLines = useMemo(() => {
    if (!find) return [];
    const needle = find.toLowerCase();
    return text.split('\n').reduce((acc, l, i) => {
      if (l.toLowerCase().includes(needle)) acc.push(i + 1);
      return acc;
    }, []);
  }, [find, text]);

  const doSave = async (value) => {
    await onSave?.(value ?? text);
    setDirty(false);
  };

  const onChange = (v) => {
    setText(v);
    setDirty(true);
    if (settings.autosave && !readOnly) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => doSave(v), settings.autosaveDelayMs || 1200);
    }
  };

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (!readOnly) doSave(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); setShowFind(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const applyReplace = (all) => {
    if (!find) return;
    const safe = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    onChange(all ? text.replace(new RegExp(safe, 'g'), replace) : text.replace(new RegExp(safe), replace));
  };

  const lineCount = text.split('\n').length;

  return (
    <div className="code-wrap" style={{ height: '100%', minHeight: 420 }}>
      <div className="code-bar">
        <Icon name="file-code" size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{file?.name}</span>
        <span className="badge">{language}</span>
        {dirty && <span className="badge" style={{ color: 'var(--amber)' }}>● unsaved</span>}
        {busy && <span className="spinner" />}
        <div className="spacer" />
        <button className="btn btn-sm btn-ghost" onClick={() => setShowFind((s) => !s)} title="Find & Replace (⌘F)">
          <Icon name="search" size={13} /> Find
        </button>
        <button className={`btn btn-sm ${split ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSplit((s) => !s)} title="Split view">
          <Icon name="columns" size={13} /> Split
        </button>
        <button className={`btn btn-sm ${readOnly ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setReadOnly((r) => !r)} title="Read-only mode">
          <Icon name={readOnly ? 'lock' : 'unlock'} size={13} /> {readOnly ? 'Read only' : 'Editing'}
        </button>
        {versions.length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={onCompare} title="Compare versions">
            <Icon name="git-compare" size={13} /> Compare
          </button>
        )}
        <button className="btn btn-sm btn-primary" onClick={() => doSave()} disabled={readOnly || !dirty}>
          <Icon name="save" size={13} /> Save
        </button>
        {onClose && (
          <button className="btn btn-sm btn-ghost btn-icon" onClick={onClose}><Icon name="x" size={14} /></button>
        )}
      </div>

      {showFind && (
        <div className="code-bar" style={{ background: 'var(--bg-2)' }}>
          <input className="input" style={{ maxWidth: 220, padding: '5px 9px', fontSize: 12.5 }}
                 placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
          <input className="input" style={{ maxWidth: 220, padding: '5px 9px', fontSize: 12.5 }}
                 placeholder="Replace with" value={replace} onChange={(e) => setReplace(e.target.value)} />
          <span className="dim" style={{ fontSize: 12 }}>{matches} match{matches === 1 ? '' : 'es'}</span>
          <button className="btn btn-sm" disabled={readOnly || !matches} onClick={() => applyReplace(false)}>Replace</button>
          <button className="btn btn-sm" disabled={readOnly || !matches} onClick={() => applyReplace(true)}>All</button>
          <div className="spacer" />
          <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setShowFind(false)}><Icon name="x" size={13} /></button>
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: split ? '1fr 1fr' : '1fr', minHeight: 0 }}>
        {readOnly ? (
          <CodeBlock content={text} language={language} highlightLines={matchLines}
                     showLineNumbers={settings.lineNumbers !== false}
                     minimap={settings.minimap !== false} />
        ) : (
          <div style={{ display: 'flex', overflow: 'auto', minHeight: 0 }}>
            {settings.lineNumbers !== false && (
              <div className="gutter" style={{ paddingTop: 12 }}>
                {Array.from({ length: lineCount }).map((_, i) => (
                  <div key={i} className={matchLines.includes(i + 1) ? 'hl' : ''}>{i + 1}</div>
                ))}
              </div>
            )}
            <textarea
              ref={areaRef}
              className="code-lines"
              value={text}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const el = e.target;
                  const pad = ' '.repeat(settings.tabSize || 2);
                  const val = `${text.slice(0, el.selectionStart)}${pad}${text.slice(el.selectionEnd)}`;
                  const pos = el.selectionStart + pad.length;
                  onChange(val);
                  requestAnimationFrame(() => el.setSelectionRange(pos, pos));
                }
              }}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', color: 'var(--text)', fontFamily: 'var(--mono)',
                fontSize: 12.5, lineHeight: 1.62, padding: '12px 18px 12px 14px',
                whiteSpace: settings.wordWrap ? 'pre-wrap' : 'pre', overflowX: 'auto', minHeight: 380,
              }}
            />
          </div>
        )}
        {split && (
          <div style={{ borderLeft: '1px solid var(--line)', overflow: 'hidden' }}>
            <CodeBlock content={text} language={language} highlightLines={matchLines}
                       showLineNumbers={settings.lineNumbers !== false} />
          </div>
        )}
      </div>

      <div className="code-bar" style={{ borderTop: '1px solid var(--line)', borderBottom: 'none', fontSize: 11.5, color: 'var(--text-3)' }}>
        <span>{lineCount} lines</span>
        <span>·</span>
        <span>{new Blob([text]).size} bytes</span>
        <span>·</span>
        <span>v{file?.version}</span>
        <div className="spacer" />
        <span>{settings.autosave && !readOnly ? 'Autosave on' : 'Manual save (⌘S)'}</span>
      </div>
    </div>
  );
}

export function DiffView({ diff }) {
  if (!diff) return null;
  return (
    <div className="code-wrap">
      <div className="code-bar">
        <Icon name="git-compare" size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600 }}>Comparing versions</span>
        <span className="badge" style={{ color: 'var(--green)' }}>+{diff.added}</span>
        <span className="badge" style={{ color: 'var(--red)' }}>−{diff.removed}</span>
      </div>
      <div className="code-scroll" style={{ maxHeight: 460, padding: '10px 0' }}>
        {diff.diff.length === 0 && (
          <div className="dim" style={{ padding: 16, fontSize: 13 }}>No differences — files are identical.</div>
        )}
        {diff.diff.map((line, i) => {
          const cls = line.startsWith('+') && !line.startsWith('+++') ? 'diff-add'
            : line.startsWith('-') && !line.startsWith('---') ? 'diff-del'
              : line.startsWith('@@') || line.startsWith('+++') || line.startsWith('---') ? 'diff-meta' : '';
          return <span key={i} className={`diff-line ${cls}`}>{line || ' '}</span>;
        })}
      </div>
    </div>
  );
}
