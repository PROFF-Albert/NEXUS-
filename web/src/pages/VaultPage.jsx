// PRD §21 — global Secrets Vault with audit log.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, timeAgo, dateTimeStr } from '../lib/api';
import { useApp } from '../lib/store';
import {
  Badge, Confirm, CopyButton, Empty, Field, Icon, Loading, Modal, Page, Stat,
} from '../components/ui';

export default function VaultPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { toast, vaultUnlocked, unlockVault, lockVault, settings } = useApp();
  const [master, setMaster] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', value: '', kind: 'API Key', environment: 'development', note: '', project_id: '' });
  const [revealed, setRevealed] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);
  const [q, setQ] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  const { data: status } = useQuery({ queryKey: ['vault-status'], queryFn: () => api.get('/vault/status') });
  const { data: kinds } = useQuery({ queryKey: ['secret-kinds'], queryFn: () => api.get('/vault/kinds') });
  const { data: projects } = useQuery({ queryKey: ['projects', false, '', 'recent'], queryFn: () => api.get('/projects') });
  const { data: secrets, isLoading } = useQuery({
    queryKey: ['vault-secrets'], queryFn: () => api.get('/vault/secrets'), enabled: vaultUnlocked,
  });
  const { data: audit } = useQuery({
    queryKey: ['vault-audit'], queryFn: () => api.get('/vault/audit'), enabled: showAudit,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['vault-secrets'] });
    qc.invalidateQueries({ queryKey: ['vault-status'] });
    qc.invalidateQueries({ queryKey: ['vault-audit'] });
  };

  const create = useMutation({
    mutationFn: () => api.post('/vault/secrets', {
      ...form, project_id: form.project_id ? Number(form.project_id) : null,
    }, { vault: true }),
    onSuccess: () => {
      invalidate(); setAdding(false);
      setForm({ name: '', value: '', kind: 'API Key', environment: 'development', note: '', project_id: '' });
      toast('Secret encrypted', 'AES-256-GCM · stored at rest', 'success');
    },
    onError: (e) => toast('Could not save', String(e.detail || e.message), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.del(`/vault/secrets/${id}`),
    onSuccess: () => { invalidate(); toast('Secret deleted'); },
  });

  const reveal = async (s) => {
    if (revealed[s.id]) { setRevealed((r) => ({ ...r, [s.id]: null })); return; }
    try {
      const res = await api.post(`/vault/secrets/${s.id}/reveal`, {}, { vault: true });
      setRevealed((r) => ({ ...r, [s.id]: res.value }));
      invalidate();
      const secs = settings.security?.clipboardClearSeconds || 30;
      setTimeout(() => setRevealed((r) => ({ ...r, [s.id]: null })), secs * 1000);
    } catch { toast('Vault locked', 'Unlock to reveal', 'warning'); }
  };

  const doUnlock = async () => {
    try { await unlockVault(master); setMaster(''); setError(''); invalidate(); }
    catch (e) { setError(String(e.detail || e.message)); }
  };

  if (!vaultUnlocked) {
    return (
      <Page title="Vault" icon="lock" subtitle="Encrypted secrets storage — AES-256-GCM">
        <div className="center" style={{ minHeight: '52vh' }}>
          <div className="card" style={{ maxWidth: 392, width: '100%', padding: 30 }}>
            <div className="col" style={{ gap: 16, alignItems: 'center' }}>
              <div className="empty-icon" style={{ width: 58, height: 58, margin: 0 }}>
                <Icon name="lock" size={25} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: 16.5, fontWeight: 650 }}>Vault is locked</h3>
                <p className="dim" style={{ fontSize: 12.8, marginTop: 6, lineHeight: 1.7 }}>
                  {status?.secretCount || 0} secret(s) encrypted with {status?.algorithm || 'AES-256-GCM'}.
                  The decryption key is derived from your master password using {status?.kdf || 'PBKDF2'} and
                  is held in server memory only.
                </p>
              </div>
              <input className="input" type="password" placeholder="Master password" autoFocus
                     value={master} onChange={(e) => setMaster(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && doUnlock()} />
              {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={doUnlock}>
                <Icon name="unlock" size={14} /> Unlock vault
              </button>
              <div className="dim" style={{ fontSize: 11, textAlign: 'center' }}>
                Auto-locks after {settings.security?.vaultLockMinutes || 15} minutes of inactivity
              </div>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  const filtered = (secrets || []).filter((s) => !q || `${s.name} ${s.kind} ${s.projectName}`.toLowerCase().includes(q.toLowerCase()));
  const byKind = filtered.reduce((acc, s) => { acc[s.kind] = (acc[s.kind] || 0) + 1; return acc; }, {});

  return (
    <Page title="Vault" icon="lock"
          subtitle={`${secrets?.length || 0} secrets · AES-256-GCM · every access is audited`}
          actions={(
            <>
              <button className="btn btn-sm" onClick={() => setShowAudit(true)}>
                <Icon name="scroll-text" size={13} /> Audit log
              </button>
              <button className="btn btn-sm" onClick={lockVault}><Icon name="lock" size={13} /> Lock vault</button>
              <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                <Icon name="plus" size={13} /> Add secret
              </button>
            </>
          )}>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <Stat label="Total secrets" value={secrets?.length || 0} icon="key" color="var(--amber)" />
        <Stat label="Encryption" value="AES-256" icon="shield-check" color="var(--green)" foot="GCM authenticated" />
        <Stat label="Key derivation" value="PBKDF2" icon="lock" foot="200 000 rounds · SHA-256" />
        <Stat label="Projects covered" value={new Set((secrets || []).map((s) => s.projectId).filter(Boolean)).size}
              icon="folder" />
      </div>

      <div className="row" style={{ gap: 9, marginBottom: 15, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Filter secrets…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        {Object.entries(byKind).map(([k, n]) => <Badge key={k}>{k} · {n}</Badge>)}
      </div>

      {isLoading ? <Loading rows={4} /> : !filtered.length ? (
        <Empty icon="key" title={q ? 'No matching secrets' : 'Vault is empty'}
               action={<button className="btn btn-primary" onClick={() => setAdding(true)}>
                 <Icon name="plus" size={14} /> Add your first secret</button>}>
          Firebase configs · API keys · JWT secrets · Cloudinary keys · Paystack keys ·
          OAuth secrets · SSH keys · environment variables — all encrypted at rest, never
          exposed to the frontend until you explicitly reveal them.
        </Empty>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Project</th><th>Env</th><th>Value</th><th>Accessed</th><th /></tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <Icon name="key" size={13} style={{ color: 'var(--amber)' }} />
                      <div>
                        <div style={{ fontWeight: 550 }}>{s.name}</div>
                        {s.note && <div className="dim" style={{ fontSize: 11 }}>{s.note}</div>}
                      </div>
                    </div>
                  </td>
                  <td><Badge>{s.kind}</Badge></td>
                  <td>
                    {s.projectName ? (
                      <button className="btn btn-sm btn-ghost" onClick={() => nav(`/projects/${s.projectId}?tab=secrets`)}>
                        {s.projectName}
                      </button>
                    ) : <span className="dim">global</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 12.3 }}>{s.environment}</td>
                  <td style={{ minWidth: 216 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <code className="mono truncate" style={{
                        maxWidth: 210, background: 'var(--bg-3)', padding: '2px 7px', borderRadius: 5,
                        fontSize: 11.5, color: revealed[s.id] ? 'var(--green)' : 'var(--text-3)',
                      }}>{revealed[s.id] || s.hint}</code>
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => reveal(s)}>
                        <Icon name={revealed[s.id] ? 'eye-off' : 'eye'} size={13} />
                      </button>
                      {revealed[s.id] && <CopyButton small text={revealed[s.id]} label="" />}
                    </div>
                  </td>
                  <td className="dim" style={{ fontSize: 12 }}>
                    {s.accessCount > 0 ? `${s.accessCount}× · ${timeAgo(s.lastAccessed)}` : 'never'}
                  </td>
                  <td style={{ width: 40 }}>
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setConfirmDel(s)}>
                      <Icon name="trash-2" size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add secret" icon="key"
             footer={(
               <>
                 <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
                 <button className="btn btn-primary" disabled={!form.name || !form.value} onClick={() => create.mutate()}>
                   <Icon name="lock" size={13} /> Encrypt & store
                 </button>
               </>
             )}>
        <Field label="Name">
          <input className="input" autoFocus value={form.name}
                 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="FIREBASE_API_KEY" />
        </Field>
        <Field label="Value" hint="Encrypted with AES-256-GCM before it touches disk">
          <textarea className="textarea mono" style={{ minHeight: 82 }} value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
        </Field>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Type">
            <select className="select" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
              {(kinds || []).map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Environment">
            <select className="select" value={form.environment}
                    onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}>
              {['development', 'staging', 'production'].map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Project">
            <select className="select" value={form.project_id}
                    onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}>
              <option value="">— global —</option>
              {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Note">
            <input className="input" value={form.note}
                   onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <Modal open={showAudit} onClose={() => setShowAudit(false)} title="Vault audit log" icon="scroll-text" size="modal-lg">
        {!audit?.length ? <Empty icon="scroll-text" title="No audit entries" /> : (
          <table className="tbl">
            <thead><tr><th>Action</th><th>Secret</th><th>IP</th><th>When</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Badge color={a.action.includes('failed') ? 'var(--red)'
                      : a.action.includes('reveal') ? 'var(--amber)' : undefined}>{a.action}</Badge>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{a.secretName || '—'}</td>
                  <td className="dim mono" style={{ fontSize: 11.5 }}>{a.ip || 'local'}</td>
                  <td className="dim" style={{ fontSize: 12 }}>{dateTimeStr(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)}
               title={`Delete ${confirmDel?.name}?`}
               message="The encrypted secret is permanently removed. This cannot be undone."
               onConfirm={() => remove.mutate(confirmDel.id)} />
    </Page>
  );
}
