// App shell: sidebar (§7 Main Navigation), top bar, notifications, palette.
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { api, timeAgo } from '../lib/api';
import { useApp } from '../lib/store';
import { Dropdown, Icon, MenuItem, Toasts } from './ui';
import CommandPalette from './CommandPalette';

const NAV_MAIN = [
  { to: '/', icon: 'layout-dashboard', label: 'Dashboard', end: true },
  { to: '/projects', icon: 'folder', label: 'Projects' },
  { to: '/templates', icon: 'package', label: 'Templates' },
  { to: '/files', icon: 'file', label: 'Recent Files' },
  { to: '/tasks', icon: 'check-square', label: 'Tasks' },
  { to: '/calendar', icon: 'calendar', label: 'Calendar' },
  { to: '/vault', icon: 'lock', label: 'Vault' },
];
const NAV_MORE = [
  { to: '/assistant', icon: 'sparkles', label: 'AI Assistant' },
  { to: '/notes', icon: 'sticky-note', label: 'Notes' },
  { to: '/activity', icon: 'activity', label: 'Activity' },
  { to: '/storage', icon: 'hard-drive', label: 'Storage' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
];

function NotificationBell() {
  const { notifCount, refreshNotifications, toast } = useApp();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const { data, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 45000,
  });

  useEffect(() => { if (open) refetch(); }, [open, refetch]);

  const items = data?.items || [];
  const unread = data?.unread ?? notifCount;
  const colors = { success: 'var(--green)', error: 'var(--red)', warning: 'var(--amber)', info: 'var(--accent)' };

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-icon" onClick={() => setOpen((o) => !o)} title="Notifications">
        <Icon name="bell" size={16} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 3, right: 3, minWidth: 15, height: 15, padding: '0 3px',
            borderRadius: 9, background: 'var(--red)', color: '#fff', fontSize: 9.5,
            fontWeight: 700, display: 'grid', placeItems: 'center', lineHeight: 1,
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
            <motion.div className="card glass"
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.13 }}
                        style={{
                          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 344,
                          zIndex: 70, padding: 0, maxHeight: 440, overflow: 'hidden',
                          display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)',
                        }}>
              <div className="row" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
                <strong style={{ fontSize: 13 }}>Notifications</strong>
                <div className="spacer" />
                <button className="btn btn-sm btn-ghost" onClick={async () => {
                  await api.post('/notifications/read', {});
                  refetch(); refreshNotifications();
                }}>Mark all read</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {items.length === 0 && (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
                    You're all caught up
                  </div>
                )}
                {items.map((n) => (
                  <div key={n.id} className="list-item" style={{ borderRadius: 0, opacity: n.read ? 0.58 : 1 }}
                       onClick={() => { setOpen(false); if (n.link) nav(n.link); }}>
                    <div className="list-icon" style={{ color: colors[n.level] }}>
                      <Icon name={n.icon || 'bell'} size={14} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.8, fontWeight: 550 }} className="truncate">{n.title}</div>
                      <div className="dim truncate" style={{ fontSize: 11.5 }}>{n.body}</div>
                    </div>
                    <span className="dim" style={{ fontSize: 10.5, flexShrink: 0 }}>{timeAgo(n.createdAt)}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: 8, borderTop: '1px solid var(--line)' }}>
                <button className="btn btn-sm btn-ghost" style={{ width: '100%' }}
                        onClick={async () => { await api.del('/notifications'); refetch(); refreshNotifications(); toast('Notifications cleared'); }}>
                  Clear all
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Shell() {
  const { user, logout, sidebarOpen, setSidebarOpen, paletteOpen, setPaletteOpen, toasts,
          settings, saveSetting, vaultUnlocked } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [gPressed, setGPressed] = useState(false);

  const { data: counts } = useQuery({
    queryKey: ['nav-counts'],
    queryFn: async () => {
      const [projects, tasks] = await Promise.all([
        api.get('/projects?archived=false'),
        api.get('/tasks'),
      ]);
      return {
        projects: projects.length,
        tasks: tasks.filter((t) => t.status !== 'Done').length,
        overdue: tasks.filter((t) => t.status !== 'Done' && t.deadline && new Date(t.deadline) < new Date()).length,
      };
    },
    staleTime: 20000,
  });

  // ⌘K / ⌘N / ⌘B / ⌘/ and g-then-key navigation (§40)
  useEffect(() => {
    const h = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); setSidebarOpen((s) => !s); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) { e.preventDefault(); nav('/projects?new=1'); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); nav('/assistant'); return; }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); nav('/vault'); return; }
      if (typing) return;
      if (e.key.toLowerCase() === 'g') { setGPressed(true); setTimeout(() => setGPressed(false), 900); return; }
      if (gPressed) {
        const map = { d: '/', p: '/projects', t: '/tasks', v: '/vault', s: '/settings', a: '/assistant', f: '/files' };
        if (map[e.key.toLowerCase()]) { e.preventDefault(); nav(map[e.key.toLowerCase()]); setGPressed(false); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [gPressed, nav, setPaletteOpen, setSidebarOpen]);

  const theme = settings.appearance?.theme || 'dark';
  const initials = (user?.name || 'D').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  const item = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end}
             className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <Icon name={n.icon} size={16} />
      {n.label}
      {n.label === 'Projects' && counts?.projects > 0 && <span className="count">{counts.projects}</span>}
      {n.label === 'Tasks' && counts?.tasks > 0 && (
        <span className={`count ${counts.overdue ? 'hot' : ''}`}>{counts.tasks}</span>
      )}
      {n.label === 'Vault' && (
        <span className="count" style={vaultUnlocked ? { color: 'var(--green)' } : undefined}>
          <Icon name={vaultUnlocked ? 'unlock' : 'lock'} size={10} />
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="brand">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
              <path d="M9 23V9l14 14V9" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">NEXUS</div>
            <div className="brand-sub">Developer OS</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">Workspace</div>
          {NAV_MAIN.map(item)}
          <div className="nav-label">Tools</div>
          {NAV_MORE.map(item)}
        </nav>

        <div className="sidebar-foot">
          <Dropdown align="left" trigger={(
            <button className="user-chip">
              <div className="avatar" style={{ background: user?.avatarColor || 'var(--accent)' }}>{initials}</div>
              <div style={{ minWidth: 0, textAlign: 'left', flex: 1 }}>
                <div className="truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.name}</div>
                <div className="truncate dim" style={{ fontSize: 10.5 }}>{user?.email}</div>
              </div>
              <Icon name="chevrons-up-down" size={13} style={{ color: 'var(--text-3)' }} />
            </button>
          )}>
            <MenuItem icon="settings" onClick={() => nav('/settings')}>Settings</MenuItem>
            <MenuItem icon={theme === 'dark' ? 'sun' : 'moon'}
                      onClick={() => saveSetting('appearance', { theme: theme === 'dark' ? 'light' : 'dark' })}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </MenuItem>
            <MenuItem icon="shield" onClick={() => nav('/settings?tab=security')}>Security & 2FA</MenuItem>
            <MenuItem icon="log-out" danger onClick={logout}>Sign out</MenuItem>
          </Dropdown>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon" onClick={() => setSidebarOpen((s) => !s)} title="Toggle sidebar (⌘B)">
            <Icon name="panel-left" size={16} />
          </button>
          <button className="searchbox" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={14} />
            <span style={{ flex: 1, textAlign: 'left' }}>Search everything…</span>
            <span className="kbd">⌘K</span>
          </button>
          <div className="spacer" />
          <button className="btn btn-ghost btn-icon" title="Toggle theme"
                  onClick={() => saveSetting('appearance', { theme: theme === 'dark' ? 'light' : 'dark' })}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          <NotificationBell />
          <button className="btn btn-primary btn-sm" onClick={() => nav('/projects?new=1')} title="New project (⌘N)">
            <Icon name="plus" size={14} /> New
          </button>
        </header>

        <main className="content" key={loc.pathname}>
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toasts items={toasts} />
    </div>
  );
}
