// Global app state: session, settings, toasts, command palette.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, auth } from './api';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const DEFAULT_SETTINGS = {
  appearance: { theme: 'dark', accent: '#6366f1', fontSize: 14, density: 'comfortable', glass: true, animations: true },
  editor: { autosave: true, autosaveDelayMs: 1200, minimap: true, lineNumbers: true, wordWrap: false, tabSize: 2 },
  backup: { auto: true, frequency: 'daily', keepLast: 10, storageLocation: 'local' },
  notifications: { snapshot: true, storage: true, tasks: true, deployments: true, sound: false },
  security: { autoLogoutMinutes: 720, vaultLockMinutes: 15, clipboardClearSeconds: 30 },
  general: { language: 'en', startPage: 'dashboard', confirmDeletes: true },
};

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [meta, setMeta] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const toast = useCallback((title, body = '', level = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, title, body, level }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.get('/settings');
      setSettings((prev) => ({ ...prev, ...s }));
    } catch { /* keep defaults */ }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try { setNotifCount((await api.get('/notifications?unread_only=true')).unread || 0); }
    catch { /* ignore */ }
  }, []);

  const boot = useCallback(async () => {
    if (!auth.token) { setBooting(false); return; }
    try {
      const me = await api.get('/auth/me');
      setUser(me);
      await Promise.all([loadSettings(), refreshNotifications()]);
      try { setVaultUnlocked((await api.get('/vault/status')).unlocked); } catch { /* noop */ }
    } catch { auth.token = ''; }
    setBooting(false);
  }, [loadSettings, refreshNotifications]);

  useEffect(() => { boot(); }, [boot]);
  useEffect(() => { api.get('/meta').then(setMeta).catch(() => {}); }, []);

  // apply theme + accent + density
  useEffect(() => {
    const a = settings.appearance || {};
    const root = document.documentElement;
    root.dataset.theme = a.theme === 'light' ? 'light' : 'dark';
    root.dataset.density = a.density || 'comfortable';
    root.dataset.animations = a.animations === false ? 'off' : 'on';
    root.style.setProperty('--accent', a.accent || '#6366f1');
    document.body.style.fontSize = `${a.fontSize || 14}px`;
  }, [settings.appearance]);

  const login = useCallback(async (email, password, totp) => {
    const res = await api.post('/auth/login', { email, password, totp: totp || null });
    auth.token = res.token;
    setUser(res.user);
    await Promise.all([loadSettings(), refreshNotifications()]);
    return res.user;
  }, [loadSettings, refreshNotifications]);

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload);
    auth.token = res.token;
    setUser(res.user);
    await loadSettings();
    return res.user;
  }, [loadSettings]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', {}); } catch { /* offline ok */ }
    auth.token = '';
    auth.vaultToken = '';
    setUser(null);
    setVaultUnlocked(false);
    location.href = '/login';
  }, []);

  const saveSetting = useCallback(async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }));
    try { await api.put('/settings', { key, value }); } catch { toast('Could not save setting', '', 'error'); }
  }, [toast]);

  const unlockVault = useCallback(async (masterPassword) => {
    const res = await api.post('/vault/unlock', { master_password: masterPassword });
    auth.vaultToken = res.vaultToken;
    setVaultUnlocked(true);
    return res;
  }, []);

  const lockVault = useCallback(async () => {
    try { await api.post('/vault/lock', {}, { vault: true }); } catch { /* noop */ }
    auth.vaultToken = '';
    setVaultUnlocked(false);
  }, []);

  const value = useMemo(() => ({
    user, booting, settings, meta, toasts, toast, paletteOpen, setPaletteOpen,
    sidebarOpen, setSidebarOpen, login, register, logout, saveSetting,
    vaultUnlocked, unlockVault, lockVault, setVaultUnlocked,
    notifCount, refreshNotifications,
  }), [user, booting, settings, meta, toasts, toast, paletteOpen, sidebarOpen, login,
       register, logout, saveSetting, vaultUnlocked, unlockVault, lockVault,
       notifCount, refreshNotifications]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
