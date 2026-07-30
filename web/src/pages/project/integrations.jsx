// PRD §21 Secrets (project scope), §22 Database Manager, §23 API Manager, §24 Deployments.
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, bytes, dateTimeStr, timeAgo } from '../../lib/api';
import { useApp } from '../../lib/store';
import {
  Badge, Confirm, CopyButton, Empty, Field, Icon, Loading, Modal, Segmented,
} from '../../components/ui';
import { CodeBlock } from '../../components/CodeViewer';

/* ════════════════════════ SECRETS (§21) ════════════════════════ */
export function SecretsTab({ project }) {
  const qc = useQueryClient();
  const { toast, vaultUnlocked, unlockVault, lockVault, settings } = useApp();
  const [master, setMaster] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', value: '', kind: 'API Key', environment: 'development', note: '' });
  const [revealed, setRevealed] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);
  const [envOut, setEnvOut] = useState(null);

  const { data: kinds } = useQuery({ queryKey: ['secret-kinds'], queryFn: () => api.get('/vault/kinds') });
  const { data: secrets, isLoading } = useQuery({
    queryKey: ['secrets', project.id],
    queryFn: () => api.get(`/vault/secrets?project_id=${project.id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['secrets', project.id] });
    qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
    qc.invalidateQueries({ queryKey: ['vault-secrets'] });
  };

  const create = useMutation({
    mutationFn: () => api.post('/vault/secrets', { ...form, project_id: project.id }, { vault: true }),
    onSuccess: () => {
      invalidate(); setAdding(false);
      setForm({ name: '', value: '', kind: 'API Key', environment: 'development', note: '' });
      toast('Secret encrypted', 'Stored with AES-256-GCM', 'success');
    },
    onError: (e) => toast('Could not save secret', String(e.detail || e.message), 'error'),
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
      const secs = settings.security?.clipboardClearSeconds || 30;
      setTimeout(() => setRevealed((r) => ({ ...r, [s.id]: null })), secs * 1000);
    } catch (e) {
      toast('Vault locked', 'Unlock the vault to reveal secrets', 'warning');
    }
  };

  if (!vaultUnlocked) {
    return (
      <div className="card center" style={{ minHeight: 320, padding: 40 }}>
        <div className="col" style={{ gap: 15, maxWidth: 348, width: '100%', alignItems: 'center' }}>
          <div className="empty-icon" style={{ width: 54, height: 54 }}><Icon name="lock" size={23} /></div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 650 }}>Vault is locked</h3>
            <p className="dim" style={{ fontSize: 12.8, marginTop: 5, lineHeight: 1.65 }}>
              Secrets are encrypted with AES-256-GCM. The key is derived from your master password
              and never leaves the server.
            </p>
          </div>
          <input className="input" type="password" placeholder="Master password" value={master}
                 autoFocus onChange={(e) => setMaster(e.target.value)}
                 onKeyDown={async (e) => {
                   if (e.key !== 'Enter') return;
                   try { await unlockVault(master); setMaster(''); setError(''); }
                   catch (err) { setError(String(err.detail || err.message)); }
                 }} />
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
          <button className="btn btn-primary" style={{ width: '100%' }}
                  onClick={async () => {
                    try { await unlockVault(master); setMaster(''); setError(''); }
                    catch (err) { setError(String(err.detail || err.message)); }
                  }}>
            <Icon name="unlock" size={14} /> Unlock vault
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 15 }}>
      <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
        <Badge color="var(--green)" icon="shield-check">Vault unlocked · AES-256-GCM</Badge>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={async () => {
          try {
            const res = await api.get(`/vault/env-export/${project.id}`, { vault: true });
            setEnvOut(res.content);
          } catch { toast('Vault locked', '', 'warning'); }
        }}>
          <Icon name="file-code" size={13} /> Export .env
        </button>
        <button className="btn btn-sm" onClick={lockVault}><Icon name="lock" size={13} /> Lock</button>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add secret
        </button>
      </div>

      {isLoading ? <Loading rows={3} /> : !secrets?.length ? (
        <Empty icon="key" title="No secrets for this project"
               action={<button className="btn btn-primary" onClick={() => setAdding(true)}>
                 <Icon name="plus" size={14} /> Store your first secret</button>}>
          Firebase configs, API keys, JWT secrets, OAuth credentials, SSH keys — encrypted at rest
          and never exposed to the frontend until you explicitly reveal them.
        </Empty>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Type</th><th>Environment</th><th>Value</th><th>Accessed</th><th /></tr></thead>
            <tbody>
              {secrets.map((s) => (
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
                  <td className="muted" style={{ fontSize: 12.5 }}>{s.environment}</td>
                  <td style={{ minWidth: 220 }}>
                    <div className="row" style={{ gap: 7 }}>
                      <code className="mono truncate" style={{
                        maxWidth: 240, background: 'var(--bg-3)', padding: '2px 7px',
                        borderRadius: 5, fontSize: 11.5,
                        color: revealed[s.id] ? 'var(--green)' : 'var(--text-3)',
                      }}>
                        {revealed[s.id] || s.hint}
                      </code>
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => reveal(s)}
                              title={revealed[s.id] ? 'Hide' : 'Reveal'}>
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
                 <button className="btn btn-primary" disabled={!form.name || !form.value || create.isPending}
                         onClick={() => create.mutate()}>
                   <Icon name="lock" size={13} /> Encrypt & store
                 </button>
               </>
             )}>
        <Field label="Name"><input className="input" autoFocus value={form.name}
                                   onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                   placeholder="PAYSTACK_SECRET_KEY" /></Field>
        <Field label="Value" hint="Encrypted immediately — never stored in plaintext">
          <textarea className="textarea mono" style={{ minHeight: 76 }} value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                    placeholder="sk_live_…" />
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
        <Field label="Note"><input className="input" value={form.note}
                                   onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                                   placeholder="Rotate before launch" /></Field>
      </Modal>

      <Modal open={!!envOut} onClose={() => setEnvOut(null)} title=".env export" icon="file-code" size="modal-lg"
             footer={<><CopyButton text={envOut || ''} label="Copy .env" />
               <button className="btn" onClick={() => setEnvOut(null)}>Close</button></>}>
        <div className="row" style={{ gap: 8, fontSize: 12.3, color: 'var(--amber)' }}>
          <Icon name="alert-triangle" size={14} /> Decrypted values — never commit this file.
        </div>
        <div className="code-wrap"><CodeBlock content={envOut || ''} language="bash" maxHeight={340} /></div>
      </Modal>

      <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)}
               title={`Delete ${confirmDel?.name}?`}
               message="The encrypted secret will be permanently removed. This cannot be undone."
               onConfirm={() => remove.mutate(confirmDel.id)} />
    </div>
  );
}

/* ════════════════════════ DATABASE (§22) ════════════════════════ */
export function DatabaseTab({ project }) {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', provider: 'PostgreSQL', host: 'localhost', port: '', username: '', database: '' });
  const [testing, setTesting] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: () => api.get('/providers') });
  const { data: dbs, isLoading } = useQuery({
    queryKey: ['databases', project.id],
    queryFn: () => api.get(`/projects/${project.id}/databases`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['databases', project.id] });
    qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
  };

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/databases`, {
      ...form, port: form.port ? Number(form.port) : null,
    }),
    onSuccess: () => { invalidate(); setAdding(false); toast('Connection saved'); },
  });
  const remove = useMutation({
    mutationFn: (id) => api.del(`/databases/${id}`),
    onSuccess: () => { invalidate(); toast('Connection removed'); },
  });

  const test = async (d) => {
    setTesting(d.id);
    try {
      const res = await api.post(`/databases/${d.id}/test`, {});
      toast(res.ok ? 'Connection reachable' : 'Connection failed', `${res.message} (${res.latencyMs} ms)`,
            res.ok ? 'success' : 'error');
      invalidate();
    } finally { setTesting(null); }
  };

  if (isLoading) return <Loading rows={3} />;

  return (
    <div className="col" style={{ gap: 15 }}>
      <div className="row">
        <span className="dim" style={{ fontSize: 12.5 }}>{dbs?.length || 0} connection(s)</span>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add connection
        </button>
      </div>

      {!dbs?.length ? (
        <Empty icon="database" title="No database connections"
               action={<button className="btn btn-primary" onClick={() => setAdding(true)}>
                 <Icon name="plus" size={14} /> Add connection</button>}>
          Keep host, port, credentials reference, schema and backups for every database this
          project touches. Passwords belong in the Vault.
        </Empty>
      ) : (
        <div className="grid g2">
          {dbs.map((d) => (
            <div key={d.id} className="card hoverable">
              <div className="row" style={{ marginBottom: 12, gap: 10 }}>
                <div className="list-icon" style={{ color: 'var(--accent)' }}><Icon name="database" size={15} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}</div>
                  <div className="dim" style={{ fontSize: 11.5 }}>{d.provider}</div>
                </div>
                {d.lastTest?.at && (
                  <Badge color={d.lastTest.ok ? 'var(--green)' : 'var(--red)'}>
                    {d.lastTest.ok ? 'reachable' : 'unreachable'}
                  </Badge>
                )}
              </div>
              <div className="col" style={{ gap: 5, fontSize: 12.3 }}>
                {[['Host', `${d.host}:${d.port}`], ['Database', d.database || '—'], ['User', d.username || '—']].map(([k, v]) => (
                  <div className="row" key={k}>
                    <span className="dim" style={{ minWidth: 74 }}>{k}</span>
                    <span className="mono truncate">{v}</span>
                  </div>
                ))}
              </div>
              {d.schema?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="dim" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Schema
                  </div>
                  <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                    {d.schema.map((t) => (
                      <span key={t.table} className="tag">{t.table} <span className="dim">({t.columns})</span></span>
                    ))}
                  </div>
                </div>
              )}
              {d.lastTest?.at && (
                <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>
                  Last test: {d.lastTest.message} · {d.lastTest.latencyMs} ms · {timeAgo(d.lastTest.at)}
                </div>
              )}
              <div className="row" style={{ gap: 7, marginTop: 13 }}>
                <button className="btn btn-sm" onClick={() => test(d)} disabled={testing === d.id}>
                  {testing === d.id ? <span className="spinner" /> : <Icon name="plug" size={13} />} Test connection
                </button>
                <div className="spacer" />
                <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setConfirmDel(d)}>
                  <Icon name="trash-2" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add database connection" icon="database"
             footer={(
               <>
                 <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
                 <button className="btn btn-primary" disabled={!form.name} onClick={() => create.mutate()}>Save connection</button>
               </>
             )}>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Name"><input className="input" autoFocus value={form.name}
                                     onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                     placeholder="Production DB" /></Field>
          <Field label="Provider">
            <select className="select" value={form.provider}
                    onChange={(e) => setForm((f) => ({
                      ...f, provider: e.target.value,
                      port: providers?.defaultPorts?.[e.target.value] || '',
                    }))}>
              {(providers?.databases || []).map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Host"><input className="input" value={form.host}
                                     onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} /></Field>
          <Field label="Port"><input className="input" type="number" value={form.port}
                                     placeholder={String(providers?.defaultPorts?.[form.provider] ?? '')}
                                     onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} /></Field>
        </div>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Username"><input className="input" value={form.username}
                                         onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></Field>
          <Field label="Database"><input className="input" value={form.database}
                                         onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))} /></Field>
        </div>
        <div className="row" style={{ gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
          <Icon name="shield" size={13} /> Store the password as a secret in the Vault, not here.
        </div>
      </Modal>

      <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)}
               title={`Remove ${confirmDel?.name}?`}
               message="The connection record will be deleted. Your actual database is untouched."
               onConfirm={() => remove.mutate(confirmDel.id)} />
    </div>
  );
}

/* ════════════════════════ API MANAGER (§23) ════════════════════════ */
const METHOD_COLOR = { GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', PATCH: '#a855f7', DELETE: '#f43f5e' };

export function ApiTab({ project }) {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [response, setResponse] = useState(null);
  const [sending, setSending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [pane, setPane] = useState('headers');

  const { data: apis, isLoading } = useQuery({
    queryKey: ['apis', project.id],
    queryFn: () => api.get(`/projects/${project.id}/apis`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['apis', project.id] });
    qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
  };

  const create = useMutation({
    mutationFn: (body) => api.post(`/projects/${project.id}/apis`, body),
    onSuccess: (a) => { invalidate(); setSelected(a); setCreating(false); },
  });
  const update = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/apis/${id}`, body),
    onSuccess: (a) => { invalidate(); setSelected(a); toast('Request saved'); },
  });
  const remove = useMutation({
    mutationFn: (id) => api.del(`/apis/${id}`),
    onSuccess: () => { invalidate(); setSelected(null); toast('Request deleted'); },
  });

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const res = await api.post(`/apis/${selected.id}/send`, {});
      setResponse(res);
      toast(res.status ? `HTTP ${res.status}` : 'Request failed',
            `${res.timeMs} ms · ${bytes(res.size)}`, res.status >= 200 && res.status < 300 ? 'success' : 'warning');
    } catch (e) { toast('Send failed', String(e.detail || e.message), 'error'); }
    setSending(false);
  };

  const collections = (apis || []).reduce((acc, a) => {
    (acc[a.collection] = acc[a.collection] || []).push(a);
    return acc;
  }, {});

  if (isLoading) return <Loading rows={3} />;

  return (
    <div className="split split-wide" style={{ alignItems: 'stretch' }}>
      <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '74vh' }}>
        <div style={{ padding: 11, borderBottom: '1px solid var(--line)' }} className="row">
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setCreating(true)}>
            <Icon name="plus" size={13} /> New request
          </button>
          <button className="btn btn-sm btn-icon" title="Import Postman collection" onClick={() => setImporting(true)}>
            <Icon name="download" size={13} />
          </button>
          <button className="btn btn-sm btn-icon" title="Export collection"
                  onClick={() => api.download(`/projects/${project.id}/apis/export`, `${project.name}-postman.json`)}>
            <Icon name="upload" size={13} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 7 }}>
          {Object.entries(collections).map(([name, items]) => (
            <div key={name} style={{ marginBottom: 9 }}>
              <div className="nav-label" style={{ padding: '6px 8px 4px' }}>{name}</div>
              {items.map((a) => (
                <div key={a.id} className={`tree-row ${selected?.id === a.id ? 'selected' : ''}`}
                     onClick={() => { setSelected(a); setResponse(a.lastResponse?.status ? a.lastResponse : null); }}>
                  <span className="mono" style={{
                    fontSize: 9.5, fontWeight: 700, minWidth: 40,
                    color: METHOD_COLOR[a.method] || 'var(--text-3)',
                  }}>{a.kind === 'GraphQL' ? 'GQL' : a.method}</span>
                  <span className="name">{a.name}</span>
                </div>
              ))}
            </div>
          ))}
          {!apis?.length && (
            <div className="dim" style={{ fontSize: 12.5, padding: 16, textAlign: 'center' }}>
              No requests yet
            </div>
          )}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        {!selected ? (
          <div className="card" style={{ minHeight: 340 }}>
            <Empty icon="git-branch" title="API collections"
                   action={<button className="btn btn-primary" onClick={() => setCreating(true)}>
                     <Icon name="plus" size={14} /> New request</button>}>
              Store REST and GraphQL requests with headers, bodies, auth and environment variables.
              Import your existing Postman collections, then send requests straight from NEXUS —
              server-side, so CORS never gets in the way.
            </Empty>
          </div>
        ) : (
          <div className="col" style={{ gap: 14 }}>
            <div className="card">
              <div className="row" style={{ gap: 9, marginBottom: 13, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: 1, minWidth: 160, fontWeight: 600 }}
                       value={selected.name}
                       onChange={(e) => setSelected((s) => ({ ...s, name: e.target.value }))} />
                <button className="btn btn-sm" onClick={() => update.mutate({ id: selected.id, body: selected })}>
                  <Icon name="save" size={13} /> Save
                </button>
                <button className="btn btn-sm btn-danger btn-icon" onClick={() => remove.mutate(selected.id)}>
                  <Icon name="trash-2" size={13} />
                </button>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <select className="select" style={{ width: 106 }} value={selected.method}
                        onChange={(e) => setSelected((s) => ({ ...s, method: e.target.value }))}>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => <option key={m}>{m}</option>)}
                </select>
                <input className="input mono" style={{ flex: 1, minWidth: 220, fontSize: 12.5 }}
                       value={selected.url} placeholder="https://api.example.com/v1/users"
                       onChange={(e) => setSelected((s) => ({ ...s, url: e.target.value }))} />
                <button className="btn btn-primary" onClick={send} disabled={sending}>
                  {sending ? <span className="spinner" /> : <Icon name="send" size={13} />} Send
                </button>
              </div>

              <div style={{ marginTop: 13 }}>
                <Segmented value={pane} onChange={setPane}
                           options={[{ value: 'headers', label: 'Headers' }, { value: 'body', label: 'Body' },
                                     { value: 'auth', label: 'Auth' }, { value: 'vars', label: 'Variables' }]} />
              </div>

              <div style={{ marginTop: 12 }}>
                {pane === 'headers' && (
                  <Field label="Headers (JSON)">
                    <textarea className="textarea mono" style={{ minHeight: 118, fontSize: 12 }}
                              value={JSON.stringify(selected.headers || {}, null, 2)}
                              onChange={(e) => {
                                try { setSelected((s) => ({ ...s, headers: JSON.parse(e.target.value) })); }
                                catch { /* keep typing */ }
                              }} />
                  </Field>
                )}
                {pane === 'body' && (
                  <Field label={selected.kind === 'GraphQL' ? 'GraphQL query' : 'Request body'}>
                    <textarea className="textarea mono" style={{ minHeight: 160, fontSize: 12 }}
                              value={selected.body || ''}
                              onChange={(e) => setSelected((s) => ({ ...s, body: e.target.value }))} />
                  </Field>
                )}
                {pane === 'auth' && (
                  <div className="col" style={{ gap: 12 }}>
                    <Field label="Type">
                      <select className="select" value={selected.auth?.type || 'none'}
                              onChange={(e) => setSelected((s) => ({ ...s, auth: { ...s.auth, type: e.target.value } }))}>
                        <option value="none">None</option>
                        <option value="bearer">Bearer token</option>
                        <option value="apikey">API key header</option>
                      </select>
                    </Field>
                    {selected.auth?.type === 'bearer' && (
                      <Field label="Token" hint="Supports {{variables}} — reference vault values by name">
                        <input className="input mono" value={selected.auth?.token || ''}
                               onChange={(e) => setSelected((s) => ({ ...s, auth: { ...s.auth, token: e.target.value } }))} />
                      </Field>
                    )}
                    {selected.auth?.type === 'apikey' && (
                      <div className="grid g2" style={{ gap: 12 }}>
                        <Field label="Header name">
                          <input className="input mono" value={selected.auth?.header || 'X-API-Key'}
                                 onChange={(e) => setSelected((s) => ({ ...s, auth: { ...s.auth, header: e.target.value } }))} />
                        </Field>
                        <Field label="Key">
                          <input className="input mono" value={selected.auth?.key || ''}
                                 onChange={(e) => setSelected((s) => ({ ...s, auth: { ...s.auth, key: e.target.value } }))} />
                        </Field>
                      </div>
                    )}
                  </div>
                )}
                {pane === 'vars' && (
                  <Field label="Environment variables (JSON)" hint="Use {{name}} inside URL, headers or body">
                    <textarea className="textarea mono" style={{ minHeight: 118, fontSize: 12 }}
                              value={JSON.stringify(selected.variables || {}, null, 2)}
                              onChange={(e) => {
                                try { setSelected((s) => ({ ...s, variables: JSON.parse(e.target.value) })); }
                                catch { /* keep typing */ }
                              }} />
                  </Field>
                )}
              </div>
            </div>

            {response && (
              <div className="card">
                <div className="card-head">
                  <span className="card-title"><Icon name="arrow-down-left" size={14} /> Response</span>
                  <Badge color={response.status >= 200 && response.status < 300 ? 'var(--green)'
                    : response.status >= 400 ? 'var(--red)' : 'var(--amber)'}>
                    {response.status || 'ERR'}
                  </Badge>
                  <Badge>{response.timeMs} ms</Badge>
                  <Badge>{bytes(response.size)}</Badge>
                  <div className="spacer" />
                  <CopyButton small text={response.body} label="Copy" />
                </div>
                <div className="code-wrap">
                  <CodeBlock content={(() => {
                    try { return JSON.stringify(JSON.parse(response.body), null, 2); }
                    catch { return response.body; }
                  })()} language="json" maxHeight={340} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New request" icon="git-branch"
             footer={(
               <>
                 <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
                 <button className="btn btn-primary" onClick={(e) => {
                   const wrap = e.target.closest('.modal');
                   const get = (n) => wrap.querySelector(`[name="${n}"]`).value;
                   create.mutate({ name: get('name') || 'Request', collection: get('collection') || 'Default',
                                   method: get('method'), url: get('url'), kind: get('kind') });
                 }}>Create</button>
               </>
             )}>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Name"><input className="input" name="name" autoFocus placeholder="List users" /></Field>
          <Field label="Collection"><input className="input" name="collection" placeholder="Default" /></Field>
        </div>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Kind">
            <select className="select" name="kind"><option>REST</option><option>GraphQL</option></select>
          </Field>
          <Field label="Method">
            <select className="select" name="method">
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="URL"><input className="input mono" name="url" placeholder="https://api.example.com/users" /></Field>
      </Modal>

      <Modal open={importing} onClose={() => setImporting(false)} title="Import Postman collection" icon="download"
             size="modal-lg"
             footer={(
               <>
                 <button className="btn" onClick={() => setImporting(false)}>Cancel</button>
                 <button className="btn btn-primary" onClick={async () => {
                   try {
                     const res = await api.post(`/projects/${project.id}/apis/import`, JSON.parse(importText));
                     invalidate(); setImporting(false); setImportText('');
                     toast('Collection imported', `${res.imported} requests from ${res.collection}`, 'success');
                   } catch (e) { toast('Import failed', 'Paste valid Postman v2.1 JSON', 'error'); }
                 }}>Import</button>
               </>
             )}>
        <Field label="Paste collection JSON" hint="Postman schema v2.1 · nested folders supported">
          <textarea className="textarea mono" style={{ minHeight: 240, fontSize: 12 }}
                    value={importText} onChange={(e) => setImportText(e.target.value)}
                    placeholder='{"info":{"name":"My API"},"item":[…]}' />
        </Field>
        <div className="row" style={{ gap: 8 }}>
          <input type="file" accept=".json" className="input" style={{ padding: 6 }}
                 onChange={async (e) => {
                   const f = e.target.files?.[0];
                   if (f) setImportText(await f.text());
                 }} />
        </div>
      </Modal>
    </div>
  );
}

/* ════════════════════════ DEPLOYMENTS (§24) ════════════════════════ */
export function DeploymentsTab({ project }) {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [logsOf, setLogsOf] = useState(null);

  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: () => api.get('/providers') });
  const { data: deps, isLoading } = useQuery({
    queryKey: ['deployments', project.id],
    queryFn: () => api.get(`/projects/${project.id}/deployments`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['deployments', project.id] });
    qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const create = useMutation({
    mutationFn: (body) => api.post(`/projects/${project.id}/deployments`, body),
    onSuccess: () => { invalidate(); setAdding(false); toast('Deployment recorded'); },
  });
  const rollback = useMutation({
    mutationFn: (id) => api.post(`/deployments/${id}/rollback`, {}),
    onSuccess: () => { invalidate(); toast('Rolled back', 'Previous deployment is active again', 'success'); },
  });
  const remove = useMutation({
    mutationFn: (id) => api.del(`/deployments/${id}`),
    onSuccess: () => { invalidate(); toast('Deployment deleted'); },
  });

  const active = (deps || []).filter((d) => d.active);
  if (isLoading) return <Loading rows={3} />;

  return (
    <div className="col" style={{ gap: 15 }}>
      {active.length > 0 && (
        <div className="grid g3">
          {active.map((d) => (
            <div key={d.id} className="card" style={{ borderColor: 'color-mix(in srgb, var(--green) 26%, var(--line))' }}>
              <div className="row" style={{ marginBottom: 9 }}>
                <Badge color={d.status === 'success' ? 'var(--green)' : 'var(--red)'} icon="cloud">
                  {d.environment}
                </Badge>
                <div className="spacer" />
                <span className="dim" style={{ fontSize: 11 }}>{d.provider}</span>
              </div>
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer" className="truncate"
                   style={{ fontSize: 12.8, color: 'var(--accent)', display: 'block' }}>
                  {d.url.replace(/^https?:\/\//, '')}
                </a>
              ) : <span className="dim" style={{ fontSize: 12.5 }}>no URL</span>}
              <div className="dim" style={{ fontSize: 11, marginTop: 7 }}>
                {d.commit && <span className="mono">{d.commit.slice(0, 7)} · </span>}
                {timeAgo(d.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <span className="dim" style={{ fontSize: 12.5 }}>{deps?.length || 0} deployment(s)</span>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Record deployment
        </button>
      </div>

      {!deps?.length ? (
        <Empty icon="cloud" title="No deployments yet"
               action={<button className="btn btn-primary" onClick={() => setAdding(true)}>
                 <Icon name="plus" size={14} /> Record deployment</button>}>
          Track production, staging and preview URLs across Netlify, Vercel, Railway, Render,
          Firebase, AWS, Azure and DigitalOcean — with full history and one-click rollback.
        </Empty>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Environment</th><th>Provider</th><th>URL</th><th>Commit</th><th>Status</th><th>When</th><th /></tr></thead>
            <tbody>
              {deps.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="row" style={{ gap: 7 }}>
                      {d.active && <i className="dot" style={{ background: 'var(--green)' }} title="active" />}
                      <span style={{ fontWeight: 550 }}>{d.environment}</span>
                    </div>
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{d.provider}</td>
                  <td style={{ maxWidth: 240 }}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="truncate"
                         style={{ color: 'var(--accent)', display: 'block', fontSize: 12.5 }}>
                        {d.url.replace(/^https?:\/\//, '')}
                      </a>
                    ) : <span className="dim">—</span>}
                  </td>
                  <td className="mono dim" style={{ fontSize: 11.5 }}>{d.commit ? d.commit.slice(0, 7) : '—'}</td>
                  <td>
                    <Badge color={d.status === 'success' ? 'var(--green)' : d.status === 'failed' ? 'var(--red)' : 'var(--amber)'}>
                      {d.status}
                    </Badge>
                  </td>
                  <td className="dim" style={{ fontSize: 12 }}>{timeAgo(d.createdAt)}</td>
                  <td style={{ width: 120 }}>
                    <div className="row" style={{ gap: 3, justifyContent: 'flex-end' }}>
                      {d.logs && (
                        <button className="btn btn-sm btn-ghost btn-icon" title="Logs" onClick={() => setLogsOf(d)}>
                          <Icon name="terminal" size={13} />
                        </button>
                      )}
                      {!d.active && (
                        <button className="btn btn-sm btn-ghost btn-icon" title="Rollback to this"
                                onClick={() => rollback.mutate(d.id)}>
                          <Icon name="rotate-ccw" size={13} />
                        </button>
                      )}
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => remove.mutate(d.id)}>
                        <Icon name="trash-2" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Record deployment" icon="cloud"
             footer={(
               <>
                 <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
                 <button className="btn btn-primary" onClick={(e) => {
                   const wrap = e.target.closest('.modal');
                   const get = (n) => wrap.querySelector(`[name="${n}"]`).value;
                   create.mutate({
                     environment: get('environment'), provider: get('provider'), url: get('url'),
                     commit: get('commit'), status: get('status'),
                     duration_s: Number(get('duration') || 0), logs: get('logs'),
                   });
                 }}>Save</button>
               </>
             )}>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Environment">
            <select className="select" name="environment">
              <option value="production">production</option>
              <option value="development">development</option>
              <option value="preview">preview</option>
              <option value="staging">staging</option>
            </select>
          </Field>
          <Field label="Provider">
            <select className="select" name="provider">
              {(providers?.hosting || []).map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <Field label="URL"><input className="input mono" name="url" placeholder="https://myapp.vercel.app" autoFocus /></Field>
        <div className="grid g3" style={{ gap: 13 }}>
          <Field label="Commit"><input className="input mono" name="commit" placeholder="a91f3c2" /></Field>
          <Field label="Status">
            <select className="select" name="status">
              <option>success</option><option>failed</option><option>building</option>
            </select>
          </Field>
          <Field label="Duration (s)"><input className="input" name="duration" type="number" placeholder="42" /></Field>
        </div>
        <Field label="Build logs">
          <textarea className="textarea mono" name="logs" style={{ minHeight: 90, fontSize: 12 }}
                    placeholder="✓ Build succeeded" />
        </Field>
      </Modal>

      <Modal open={!!logsOf} onClose={() => setLogsOf(null)} size="modal-lg" icon="terminal"
             title={`${logsOf?.provider} · ${logsOf?.environment} logs`}>
        <div className="code-wrap"><CodeBlock content={logsOf?.logs || ''} language="bash" maxHeight={380} /></div>
      </Modal>
    </div>
  );
}
