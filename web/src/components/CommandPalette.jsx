// PRD §25 Global Search + §40 keyboard-driven command palette (⌘K).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Icon } from './ui';

const GROUP_LABEL = {
  projects: 'Projects', files: 'Files', folders: 'Folders', tasks: 'Tasks',
  notes: 'Notes', documentation: 'Documentation', images: 'Images', videos: 'Videos',
  secrets: 'Secrets (names only)', apis: 'API Requests', databases: 'Databases',
};

const COMMANDS = [
  { id: 'cmd-dashboard', title: 'Go to Dashboard', icon: 'layout-dashboard', link: '/' },
  { id: 'cmd-projects', title: 'Go to Projects', icon: 'folder', link: '/projects' },
  { id: 'cmd-new', title: 'Create new project', icon: 'plus', link: '/projects?new=1' },
  { id: 'cmd-templates', title: 'Browse Templates', icon: 'package', link: '/templates' },
  { id: 'cmd-files', title: 'Recent Files', icon: 'file', link: '/files' },
  { id: 'cmd-tasks', title: 'Task board', icon: 'check-square', link: '/tasks' },
  { id: 'cmd-calendar', title: 'Calendar', icon: 'calendar', link: '/calendar' },
  { id: 'cmd-vault', title: 'Open Vault', icon: 'lock', link: '/vault' },
  { id: 'cmd-ai', title: 'AI Assistant', icon: 'sparkles', link: '/assistant' },
  { id: 'cmd-storage', title: 'Storage analytics', icon: 'hard-drive', link: '/storage' },
  { id: 'cmd-activity', title: 'Activity feed', icon: 'activity', link: '/activity' },
  { id: 'cmd-settings', title: 'Settings', icon: 'settings', link: '/settings' },
];

export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [tookMs, setTookMs] = useState(null);
  const nav = useNavigate();
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (open) { setQ(''); setResults(null); setCursor(0); setTookMs(null); setTimeout(() => inputRef.current?.focus(), 40); }
  }, [open]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults(null); setBusy(false); return undefined; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/search?q=${encodeURIComponent(q.trim())}`);
        setResults(r.groups);
        setTookMs(r.tookMs);
      } catch { setResults({}); }
      setBusy(false);
      setCursor(0);
    }, 140);
    return () => clearTimeout(timer.current);
  }, [q]);

  const flat = useMemo(() => {
    if (!q.trim()) return COMMANDS.map((c) => ({ ...c, group: 'Jump to' }));
    if (!results) return [];
    const rows = [];
    const cmdMatches = COMMANDS.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
    cmdMatches.forEach((c) => rows.push({ ...c, group: 'Commands' }));
    Object.entries(results).forEach(([key, items]) => {
      items.forEach((it) => rows.push({
        id: `${key}-${it.id}`, title: it.title, sub: it.subtitle, meta: it.meta,
        icon: it.icon, color: it.color, link: it.link, group: GROUP_LABEL[key] || key,
      }));
    });
    return rows;
  }, [q, results]);

  const go = (item) => { onClose(); if (item?.link) nav(item.link); };

  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); go(flat[cursor]); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, flat, cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  let lastGroup = null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" style={{ paddingTop: '11vh' }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div className="palette glass"
                      initial={{ opacity: 0, y: -14, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.99 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}>
            <div className="row" style={{ padding: '0 18px', borderBottom: 'none' }}>
              <Icon name="search" size={17} style={{ color: 'var(--text-3)' }} />
              <input ref={inputRef} className="palette-input" value={q}
                     onChange={(e) => setQ(e.target.value)}
                     placeholder="Search projects, files, tasks, notes, secrets…" />
              {busy && <span className="spinner" />}
              <span className="kbd">ESC</span>
            </div>

            <div className="palette-results">
              {flat.length === 0 && q.trim() && !busy && (
                <div style={{ padding: 26, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  No results for “{q}”
                </div>
              )}
              {flat.map((item, idx) => {
                const showGroup = item.group !== lastGroup;
                lastGroup = item.group;
                return (
                  <React.Fragment key={item.id}>
                    {showGroup && <div className="palette-group">{item.group}</div>}
                    <div className={`palette-item ${idx === cursor ? 'active' : ''}`}
                         onMouseEnter={() => setCursor(idx)} onClick={() => go(item)}>
                      <Icon name={item.icon || 'circle'} size={15}
                            style={{ color: item.color || 'var(--text-3)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="truncate">{item.title}</div>
                        {item.sub && <div className="sub truncate">{item.sub}</div>}
                      </div>
                      {item.meta && <span className="badge">{item.meta}</span>}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="row" style={{
              padding: '8px 14px', borderTop: '1px solid var(--line)',
              fontSize: 11, color: 'var(--text-3)', gap: 13,
            }}>
              <span><span className="kbd">↑↓</span> navigate</span>
              <span><span className="kbd">↵</span> open</span>
              <div className="spacer" />
              {tookMs !== null && <span>{flat.length} results in {tookMs} ms</span>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
