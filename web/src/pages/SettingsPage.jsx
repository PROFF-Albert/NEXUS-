// PRD §30 Settings, §32 Security, §33 Backup System.
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, dateTimeStr, timeAgo } from '../lib/api';
import { useApp } from '../lib/store';
import {
  Badge, Confirm, CopyButton, Field, Icon, Modal, Page, Segmented, Switch, Tabs,
} from '../components/ui';

function Row({ label, hint, children }) {
  return (
    <div className="row" style={{ gap: 16, padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.2, fontWeight: 500 }}>{label}</div>
        {hint && <div className="dim" style={{ fontSize: 11.8, marginTop: 2, lineHeight: 1.55 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { settings, saveSetting, user, toast, meta, logout } = useApp();
  const [tab, setTab] = useState(params.get('tab') || 'appearance');
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [confirmImport, setConfirmImport] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { const n = new URLSearchParams(params); n.set('tab', tab); setParams(n, { replace: true }); }, [tab]); // eslint-disable-line

  const { data: shortcuts } = useQuery({ queryKey: ['shortcuts'], queryFn: () => api.get('/settings/shortcuts') });
  const { data: sessions } = useQuery({ queryKey: ['sessions'], queryFn: () => api.get('/auth/sessions') });

  const a = settings.appearance || {};
  const ed = settings.editor || {};
  const bk = settings.backup || {};
  const nt = settings.notifications || {};
  const sc = settings.security || {};
  const gn = settings.general || {};

  const changePassword = useMutation({
    mutationFn: () => api.post('/auth/password', {
      current_password: pwForm.current_password, new_password: pwForm.new_password,
    }),
    onSuccess: () => { setPwForm({ current_password: '', new_password: '', confirm: '' }); toast('Password changed', '', 'success'); },
    onError: (e) => toast('Could not change password', String(e.detail || e.message), 'error'),
  });

  const enable2fa = useMutation({
    mutationFn: () => api.post('/auth/2fa/enable', { code: totpCode }),
    onSuccess: () => { setTotpSetup(null); setTotpCode(''); qc.invalidateQueries(); toast('2FA enabled', 'Your account is protected', 'success'); },
    onError: () => toast('Invalid code', 'Check your authenticator app', 'error'),
  });

  const disable2fa = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { code: totpCode }),
    onSuccess: () => { setTotpCode(''); qc.invalidateQueries(); toast('2FA disabled'); },
    onError: () => toast('Invalid code', '', 'error'),
  });

  const revokeSession = useMutation({
    mutationFn: (id) => api.del(`/auth/sessions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); toast('Session revoked'); },
  });

  const runBackup = async () => {
    setBusy('backup');
    try {
      const res = await api.post('/settings/auto-backup/run', {});
      toast('Backup successful', `${res.snapshots.length} project(s) snapshotted`, 'success');
      qc.invalidateQueries();
    } catch (e) { toast('Backup failed', String(e.detail || e.message), 'error'); }
    setBusy('');
  };

  const doImport = async (file) => {
    setBusy('import');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.upload('/settings/import', form);
      setImportResult(res);
      qc.invalidateQueries();
      toast('Workspace imported', `${res.projects} projects · ${res.files} files`, 'success');
    } catch (e) { toast('Import failed', String(e.detail || e.message), 'error'); }
    setBusy('');
    setConfirmImport(null);
  };

  const TABS = [
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
    { id: 'editor', label: 'Editor', icon: 'code' },
    { id: 'backup', label: 'Backup', icon: 'shield-check' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'security', label: 'Security', icon: 'lock' },
    { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
    { id: 'account', label: 'Account', icon: 'user' },
  ];

  return (
    <Page title="Settings" icon="settings" narrow subtitle="Configure your workspace">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'appearance' && (
        <div className="card">
          <Row label="Theme" hint="NEXUS is dark-first, but light is fully supported">
            <Segmented value={a.theme} onChange={(v) => saveSetting('appearance', { theme: v })}
                       options={[{ value: 'dark', label: 'Dark', icon: 'moon' },
                                 { value: 'light', label: 'Light', icon: 'sun' }]} />
          </Row>
          <Row label="Accent colour" hint="Used for highlights, focus rings and the active nav item">
            <div className="row" style={{ gap: 6 }}>
              {(meta?.colors || []).slice(0, 8).map((c) => (
                <button key={c} onClick={() => saveSetting('appearance', { accent: c })}
                        style={{
                          width: 24, height: 24, borderRadius: 7, background: c,
                          border: a.accent === c ? '2px solid var(--text)' : '2px solid transparent',
                        }} />
              ))}
            </div>
          </Row>
          <Row label="Base font size" hint={`${a.fontSize || 14}px`}>
            <input type="range" min="12" max="17" value={a.fontSize || 14}
                   onChange={(e) => saveSetting('appearance', { fontSize: Number(e.target.value) })}
                   style={{ width: 132, accentColor: 'var(--accent)' }} />
          </Row>
          <Row label="Density">
            <Segmented value={a.density} onChange={(v) => saveSetting('appearance', { density: v })}
                       options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
          </Row>
          <Row label="Frosted glass effects" hint="Used sparingly on overlays and the command palette">
            <Switch checked={a.glass !== false} onChange={(v) => saveSetting('appearance', { glass: v })} />
          </Row>
          <Row label="Animations" hint="Turn off for maximum responsiveness on low-power machines">
            <Switch checked={a.animations !== false} onChange={(v) => saveSetting('appearance', { animations: v })} />
          </Row>
          <Row label="Language">
            <select className="select" style={{ width: 148 }} value={gn.language || 'en'}
                    onChange={(e) => saveSetting('general', { language: e.target.value })}>
              <option value="en">English</option><option value="fr">Français</option>
              <option value="es">Español</option><option value="pt">Português</option>
            </select>
          </Row>
          <Row label="Start page">
            <select className="select" style={{ width: 148 }} value={gn.startPage || 'dashboard'}
                    onChange={(e) => saveSetting('general', { startPage: e.target.value })}>
              <option value="dashboard">Dashboard</option><option value="projects">Projects</option>
              <option value="tasks">Tasks</option>
            </select>
          </Row>
        </div>
      )}

      {tab === 'editor' && (
        <div className="card">
          <Row label="Autosave" hint="Saves a new revision automatically while you type">
            <Switch checked={ed.autosave !== false} onChange={(v) => saveSetting('editor', { autosave: v })} />
          </Row>
          <Row label="Autosave delay" hint={`${ed.autosaveDelayMs || 1200} ms after you stop typing`}>
            <input type="range" min="400" max="4000" step="200" value={ed.autosaveDelayMs || 1200}
                   onChange={(e) => saveSetting('editor', { autosaveDelayMs: Number(e.target.value) })}
                   style={{ width: 132, accentColor: 'var(--accent)' }} />
          </Row>
          <Row label="Line numbers"><Switch checked={ed.lineNumbers !== false} onChange={(v) => saveSetting('editor', { lineNumbers: v })} /></Row>
          <Row label="Mini map" hint="Document overview on the right edge of the read-only viewer">
            <Switch checked={ed.minimap !== false} onChange={(v) => saveSetting('editor', { minimap: v })} />
          </Row>
          <Row label="Word wrap"><Switch checked={!!ed.wordWrap} onChange={(v) => saveSetting('editor', { wordWrap: v })} /></Row>
          <Row label="Tab size">
            <select className="select" style={{ width: 92 }} value={ed.tabSize || 2}
                    onChange={(e) => saveSetting('editor', { tabSize: Number(e.target.value) })}>
              <option value={2}>2</option><option value={4}>4</option><option value={8}>8</option>
            </select>
          </Row>
        </div>
      )}

      {tab === 'backup' && (
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <Row label="Automatic backups" hint="Snapshot every active project on a schedule">
              <Switch checked={bk.auto !== false} onChange={(v) => saveSetting('backup', { auto: v })} />
            </Row>
            <Row label="Frequency">
              <select className="select" style={{ width: 138 }} value={bk.frequency || 'daily'}
                      onChange={(e) => saveSetting('backup', { frequency: e.target.value })}>
                <option value="hourly">Hourly</option><option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </Row>
            <Row label="Keep last N snapshots" hint="Older automatic snapshots are pruned">
              <input className="input" type="number" style={{ width: 92 }} value={bk.keepLast || 10}
                     onChange={(e) => saveSetting('backup', { keepLast: Number(e.target.value) })} />
            </Row>
            <Row label="Storage location" hint="Where blobs and snapshot archives are written">
              <select className="select" style={{ width: 138 }} value={bk.storageLocation || 'local'}
                      onChange={(e) => saveSetting('backup', { storageLocation: e.target.value })}>
                <option value="local">Local disk</option><option value="nas">NAS</option>
                <option value="cloud">Cloud (S3/MinIO)</option><option value="hybrid">Hybrid</option>
              </select>
            </Row>
            <Row label="Run backup now" hint="Snapshots every non-archived project immediately">
              <button className="btn btn-primary" onClick={runBackup} disabled={busy === 'backup'}>
                {busy === 'backup' ? <span className="spinner" /> : <Icon name="play" size={13} />} Run now
              </button>
            </Row>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="package" size={14} /> Workspace export & import</span>
            </div>
            <p className="muted" style={{ fontSize: 12.8, lineHeight: 1.7, marginBottom: 15 }}>
              Export produces a single portable archive containing every project, file, note,
              task, API collection, database config and <em>encrypted</em> secret. Your master
              password is never included — secrets only decrypt on a workspace with the same vault salt.
            </p>
            <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
              <button className="btn btn-primary"
                      onClick={() => api.download('/settings/export', 'nexus-workspace.zip')}>
                <Icon name="download" size={14} /> Export entire workspace
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy === 'import'}>
                {busy === 'import' ? <span className="spinner" /> : <Icon name="upload" size={14} />} Import workspace
              </button>
              <input ref={fileRef} type="file" accept=".zip" hidden
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) setConfirmImport(f); e.target.value = ''; }} />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 13, fontSize: 11.8, color: 'var(--text-3)' }}>
              <Icon name="info" size={13} /> Import merges into your workspace — nothing is overwritten or deleted.
            </div>
          </div>

          <div className="card" style={{ borderStyle: 'dashed' }}>
            <div className="row" style={{ gap: 10, color: 'var(--text-3)', fontSize: 12.5 }}>
              <Icon name="cloud" size={15} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>Cloud sync</div>
                <div>Planned for a future release. Today NEXUS keeps everything on hardware you control.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="card">
          {[['snapshot', 'Snapshot complete', 'Notify when a snapshot finishes'],
            ['storage', 'Storage almost full', 'Warn when disk usage passes 85%'],
            ['tasks', 'Task due', 'Remind about approaching deadlines'],
            ['deployments', 'Deployment status', 'Notify on deployment success or failure'],
            ['sound', 'Sound', 'Play a subtle chime with notifications']].map(([k, label, hint]) => (
            <Row key={k} label={label} hint={hint}>
              <Switch checked={nt[k] !== false && nt[k] !== undefined ? nt[k] : k !== 'sound'}
                      onChange={(v) => saveSetting('notifications', { [k]: v })} />
            </Row>
          ))}
        </div>
      )}

      {tab === 'security' && (
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="key" size={14} /> Password</span></div>
            <div className="col" style={{ gap: 12, maxWidth: 400 }}>
              <Field label="Current password">
                <input className="input" type="password" value={pwForm.current_password}
                       onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))} />
              </Field>
              <Field label="New password">
                <input className="input" type="password" value={pwForm.new_password}
                       onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))} />
              </Field>
              <Field label="Confirm new password">
                <input className="input" type="password" value={pwForm.confirm}
                       onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} />
              </Field>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
                      disabled={!pwForm.current_password || !pwForm.new_password || pwForm.new_password !== pwForm.confirm}
                      onClick={() => changePassword.mutate()}>Change password</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="shield" size={14} /> Two-factor authentication</span>
              <div className="spacer" />
              <Badge color={user?.totpEnabled ? 'var(--green)' : undefined}>
                {user?.totpEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {user?.totpEnabled ? (
              <div className="col" style={{ gap: 12, maxWidth: 400 }}>
                <p className="muted" style={{ fontSize: 12.8 }}>
                  Your account requires a 6-digit code at sign-in. Enter a current code to turn it off.
                </p>
                <div className="row" style={{ gap: 9 }}>
                  <input className="input mono" style={{ maxWidth: 132, letterSpacing: '0.3em', textAlign: 'center' }}
                         maxLength={6} value={totpCode} placeholder="000000"
                         onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))} />
                  <button className="btn btn-danger" disabled={totpCode.length !== 6} onClick={() => disable2fa.mutate()}>
                    Disable 2FA
                  </button>
                </div>
              </div>
            ) : (
              <div className="col" style={{ gap: 12 }}>
                <p className="muted" style={{ fontSize: 12.8, lineHeight: 1.65 }}>
                  Add a time-based one-time password (TOTP) from Google Authenticator, 1Password,
                  Authy or any RFC-6238 compatible app.
                </p>
                <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
                        onClick={async () => setTotpSetup(await api.post('/auth/2fa/setup', {}))}>
                  <Icon name="shield-plus" size={14} /> Set up 2FA
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <Row label="Auto logout" hint="Session lifetime before you must sign in again">
              <select className="select" style={{ width: 148 }} value={sc.autoLogoutMinutes || 720}
                      onChange={(e) => saveSetting('security', { autoLogoutMinutes: Number(e.target.value) })}>
                <option value={30}>30 minutes</option><option value={120}>2 hours</option>
                <option value={720}>12 hours</option><option value={10080}>1 week</option>
              </select>
            </Row>
            <Row label="Vault auto-lock" hint="Idle minutes before the vault re-locks itself">
              <select className="select" style={{ width: 148 }} value={sc.vaultLockMinutes || 15}
                      onChange={(e) => saveSetting('security', { vaultLockMinutes: Number(e.target.value) })}>
                <option value={5}>5 minutes</option><option value={15}>15 minutes</option>
                <option value={60}>1 hour</option>
              </select>
            </Row>
            <Row label="Hide revealed secrets after" hint="Revealed values are re-masked automatically">
              <select className="select" style={{ width: 148 }} value={sc.clipboardClearSeconds || 30}
                      onChange={(e) => saveSetting('security', { clipboardClearSeconds: Number(e.target.value) })}>
                <option value={10}>10 seconds</option><option value={30}>30 seconds</option>
                <option value={120}>2 minutes</option>
              </select>
            </Row>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="monitor" size={14} /> Active sessions</span></div>
            <table className="tbl">
              <thead><tr><th>Device</th><th>IP</th><th>Last seen</th><th /></tr></thead>
              <tbody>
                {(sessions || []).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <Icon name="monitor" size={13} style={{ color: 'var(--text-3)' }} />
                        <span className="truncate" style={{ maxWidth: 300, fontSize: 12.5 }}>
                          {s.userAgent || 'Unknown device'}
                        </span>
                        {s.current && <Badge color="var(--green)">this device</Badge>}
                      </div>
                    </td>
                    <td className="mono dim" style={{ fontSize: 11.5 }}>{s.ip || 'local'}</td>
                    <td className="dim" style={{ fontSize: 12 }}>{timeAgo(s.lastSeen)}</td>
                    <td style={{ width: 90 }}>
                      {!s.current && (
                        <button className="btn btn-sm btn-ghost" onClick={() => revokeSession.mutate(s.id)}>Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ borderStyle: 'dashed' }}>
            <div className="row" style={{ gap: 10, color: 'var(--text-3)', fontSize: 12.5 }}>
              <Icon name="fingerprint" size={15} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>Biometric login & role system</div>
                <div>Both are on the roadmap. NEXUS is single-user and private-first today.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'shortcuts' && (
        <div className="card">
          <p className="muted" style={{ fontSize: 12.8, marginBottom: 15 }}>
            NEXUS is keyboard-driven. On Windows and Linux, use <span className="kbd">Ctrl</span> in
            place of <span className="kbd">⌘</span>.
          </p>
          <table className="tbl">
            <tbody>
              {(shortcuts || []).map((s) => (
                <tr key={s.keys}>
                  <td style={{ width: 130 }}>
                    <span className="kbd" style={{ fontSize: 12 }}>{s.keys}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'account' && (
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="row" style={{ gap: 14, marginBottom: 16 }}>
              <div className="avatar" style={{ width: 52, height: 52, fontSize: 19, background: user?.avatarColor }}>
                {(user?.name || 'D').charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 650 }}>{user?.name}</div>
                <div className="dim" style={{ fontSize: 12.5 }}>{user?.email}</div>
              </div>
            </div>
            <Row label="Member since">{dateTimeStr(user?.createdAt)}</Row>
            <Row label="Last sign-in">{dateTimeStr(user?.lastLogin)}</Row>
            <Row label="Two-factor">{user?.totpEnabled ? 'Enabled' : 'Disabled'}</Row>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="info" size={14} /> About</span></div>
            <div className="col" style={{ gap: 7, fontSize: 12.8 }}>
              <div className="row"><span className="muted">Application</span><div className="spacer" /><span>NEXUS 1.0.0</span></div>
              <div className="row"><span className="muted">Motto</span><div className="spacer" /><span>One Workspace. Every Project. Zero Chaos.</span></div>
              <div className="row"><span className="muted">Encryption</span><div className="spacer" /><span>AES-256-GCM · PBKDF2-SHA256</span></div>
              <div className="row"><span className="muted">Storage</span><div className="spacer" /><span>Content-addressed (SHA-256)</span></div>
            </div>
          </div>
          <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={logout}>
            <Icon name="log-out" size={14} /> Sign out
          </button>
        </div>
      )}

      <Modal open={!!totpSetup} onClose={() => setTotpSetup(null)} title="Set up two-factor authentication" icon="shield"
             footer={(
               <>
                 <button className="btn" onClick={() => setTotpSetup(null)}>Cancel</button>
                 <button className="btn btn-primary" disabled={totpCode.length !== 6} onClick={() => enable2fa.mutate()}>
                   Verify & enable
                 </button>
               </>
             )}>
        <div className="col" style={{ gap: 15 }}>
          <p className="muted" style={{ fontSize: 12.8, lineHeight: 1.65 }}>
            Add this secret to your authenticator app, then enter the 6-digit code it shows.
          </p>
          <Field label="Secret key">
            <div className="row" style={{ gap: 8 }}>
              <code className="mono" style={{
                flex: 1, background: 'var(--bg-3)', padding: '9px 11px',
                borderRadius: 'var(--radius-sm)', fontSize: 12.5, wordBreak: 'break-all',
              }}>{totpSetup?.secret}</code>
              <CopyButton text={totpSetup?.secret || ''} label="" small />
            </div>
          </Field>
          <Field label="otpauth URI" hint="Paste into apps that accept a URI instead of a QR code">
            <div className="row" style={{ gap: 8 }}>
              <input className="input mono" readOnly value={totpSetup?.uri || ''} style={{ fontSize: 11 }} />
              <CopyButton text={totpSetup?.uri || ''} label="" small />
            </div>
          </Field>
          <Field label="Verification code">
            <input className="input mono" maxLength={6} autoFocus value={totpCode}
                   onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                   placeholder="000000" style={{ letterSpacing: '0.35em', textAlign: 'center', fontSize: 17 }} />
          </Field>
        </div>
      </Modal>

      <Confirm open={!!confirmImport} onClose={() => setConfirmImport(null)}
               title="Import workspace archive?" danger={false} confirmLabel="Import"
               message={`“${confirmImport?.name}” will be merged into your workspace. Existing projects are never overwritten or deleted — imported projects are added alongside them.`}
               onConfirm={() => doImport(confirmImport)} />

      <Modal open={!!importResult} onClose={() => setImportResult(null)} title="Import complete" icon="check-circle">
        <div className="col" style={{ gap: 9, fontSize: 13 }}>
          <div className="row"><span className="muted">Projects</span><div className="spacer" /><strong>{importResult?.projects}</strong></div>
          <div className="row"><span className="muted">Files</span><div className="spacer" /><strong>{importResult?.files}</strong></div>
          <div className="row"><span className="muted">Secrets restored</span><div className="spacer" /><strong>{importResult?.secrets}</strong></div>
          {importResult?.secretsSkipped > 0 && (
            <div className="row" style={{ gap: 8, marginTop: 6, fontSize: 12, color: 'var(--amber)' }}>
              <Icon name="alert-triangle" size={13} />
              {importResult.secretsSkipped} secret(s) skipped — they were encrypted with a different vault key.
            </div>
          )}
        </div>
      </Modal>
    </Page>
  );
}
