/**
 * NEXUS desktop shell (PRD §36 — Electron).
 *
 *   cd desktop && npm install && npm start
 *
 * Boots the FastAPI backend as a child process, then opens a frameless-ish
 * window pointed at it. Everything stays on the user's machine.
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.NEXUS_PORT || 8765;
const URL = `http://127.0.0.1:${PORT}`;

let backend = null;
let win = null;

function startBackend() {
  const python = process.env.NEXUS_PYTHON || 'python3';
  backend = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: path.join(ROOT, 'backend'),
    env: {
      ...process.env,
      NEXUS_DATA_DIR: path.join(app.getPath('userData'), 'data'),
      NEXUS_FRONTEND_DIR: path.join(ROOT, 'frontend'),
    },
    stdio: 'inherit',
  });
  backend.on('error', (err) => {
    dialog.showErrorBox('NEXUS backend failed to start',
      `${err.message}\n\nMake sure Python 3.11+ and the requirements are installed:\n  pip install -r backend/requirements.txt`);
  });
}

function waitForBackend(attempt = 0) {
  return new Promise((resolve, reject) => {
    const probe = () => {
      http.get(`${URL}/api/health`, (res) => (res.statusCode === 200 ? resolve() : retry()))
        .on('error', retry);
    };
    const retry = () => {
      if (attempt++ > 90) return reject(new Error('Backend did not become ready'));
      setTimeout(probe, 350);
    };
    probe();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#08080c',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  win.loadURL(URL);
  win.once('ready-to-show', () => win.show());

  // external links open in the real browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(URL)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

const template = [
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
  {
    label: 'File',
    submenu: [
      { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => win?.webContents.executeJavaScript("location.href='/projects?new=1'") },
      { label: 'Search', accelerator: 'CmdOrCtrl+K', click: () => win?.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'k', modifiers: ['cmd'] }) },
      { type: 'separator' },
      { role: process.platform === 'darwin' ? 'close' : 'quit' },
    ],
  },
  { role: 'editMenu' },
  {
    label: 'View',
    submenu: [
      { label: 'Dashboard', click: () => win?.loadURL(`${URL}/`) },
      { label: 'Projects', click: () => win?.loadURL(`${URL}/projects`) },
      { label: 'Vault', click: () => win?.loadURL(`${URL}/vault`) },
      { type: 'separator' },
      { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ],
  },
  { role: 'windowMenu' },
];

app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  startBackend();
  try {
    await waitForBackend();
  } catch (err) {
    dialog.showErrorBox('NEXUS could not start', err.message);
    app.quit();
    return;
  }
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('before-quit', () => backend?.kill());
