// PRD §16 — global notes (workspace-level + project notes).
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, timeAgo } from '../lib/api';
import { useApp } from '../lib/store';
import { Empty, Field, Icon, Loading, Page } from '../components/ui';
import Markdown from '../components/Markdown';

export default function NotesPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { toast } = useApp();
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '', category: 'General' });
  const [q, setQ] = useState('');

  const { data: notes, isLoading } = useQuery({
    queryKey: ['all-notes'], queryFn: () => api.get('/notes?doc_type=note'),
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', false, '', 'recent'], queryFn: () => api.get('/projects'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['all-notes'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: (n) => (n.id ? api.patch(`/notes/${n.id}`, n) : api.post('/notes', { ...n, doc_type: 'note' })),
    onSuccess: (n) => { invalidate(); setSelected(n); setEditing(false); toast('Saved'); },
  });
  const remove = useMutation({
    mutationFn: (id) => api.del(`/notes/${id}`),
    onSuccess: () => { invalidate(); setSelected(null); toast('Deleted'); },
  });
  const pin = useMutation({
    mutationFn: ({ id, pinned }) => api.patch(`/notes/${id}`, { pinned }),
    onSuccess: invalidate,
  });

  const projectName = (id) => (projects || []).find((p) => p.id === id)?.name;
  const filtered = (notes || []).filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase()));

  const startNew = () => { setDraft({ title: '', body: '', category: 'General', project_id: null }); setSelected(null); setEditing(true); };

  return (
    <Page title="Notes" icon="sticky-note"
          subtitle={`${notes?.length || 0} note${notes?.length === 1 ? '' : 's'} · markdown with checklists, tables and code blocks`}
          actions={<button className="btn btn-primary" onClick={startNew}><Icon name="plus" size={14} /> New note</button>}>
      <div className="split" style={{ alignItems: 'stretch' }}>
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '74vh' }}>
          <div style={{ padding: 11, borderBottom: '1px solid var(--line)' }}>
            <input className="input" style={{ fontSize: 12.5, padding: '6px 9px' }} placeholder="Search notes…"
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 7 }}>
            {isLoading ? <Loading rows={3} /> : filtered.length === 0 ? (
              <div className="dim" style={{ fontSize: 12.5, padding: 16, textAlign: 'center' }}>No notes</div>
            ) : filtered.map((n) => (
              <div key={n.id} className={`tree-row ${selected?.id === n.id ? 'selected' : ''}`}
                   style={{ padding: '8px 10px', alignItems: 'flex-start' }}
                   onClick={() => { setSelected(n); setEditing(false); }}>
                <Icon name={n.pinned ? 'pin' : 'file-text'} size={13}
                      style={{ marginTop: 2, color: n.pinned ? 'var(--amber)' : undefined, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="truncate" style={{ fontSize: 12.8 }}>{n.title}</div>
                  <div className="dim truncate" style={{ fontSize: 11 }}>
                    {n.projectId ? projectName(n.projectId) : n.category} · {timeAgo(n.updatedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {editing ? (
            <div className="card">
              <div className="col" style={{ gap: 13 }}>
                <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
                  <input className="input" placeholder="Title" style={{ flex: 1, minWidth: 180, fontSize: 15, fontWeight: 600 }}
                         value={draft.title} autoFocus
                         onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
                  <input className="input" style={{ width: 132 }} placeholder="Category" value={draft.category}
                         onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
                  <select className="select" style={{ width: 168 }} value={draft.project_id || ''}
                          onChange={(e) => setDraft((d) => ({ ...d, project_id: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">— workspace note —</option>
                    {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <textarea className="textarea mono" style={{ minHeight: 400, lineHeight: 1.68 }}
                          placeholder={'# Heading\n\n- [ ] todo item\n\n```js\nconst x = 1;\n```'}
                          value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
                <div className="row">
                  <span className="dim" style={{ fontSize: 11.5 }}>Markdown · headings, lists, checklists, tables, code</span>
                  <div className="spacer" />
                  <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={!draft.title.trim()} onClick={() => save.mutate(draft)}>
                    <Icon name="save" size={13} /> Save
                  </button>
                </div>
              </div>
            </div>
          ) : selected ? (
            <div className="card">
              <div className="row" style={{ marginBottom: 15, gap: 9, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 650 }}>{selected.title}</h2>
                  <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
                    {selected.category} · updated {timeAgo(selected.updatedAt)}
                    {selected.projectId && (
                      <> · <button className="btn btn-sm btn-ghost" style={{ padding: '0 4px', fontSize: 11.5 }}
                                   onClick={() => nav(`/projects/${selected.projectId}?tab=notes`)}>
                        {projectName(selected.projectId)}
                      </button></>
                    )}
                  </div>
                </div>
                <button className="btn btn-sm btn-icon" style={selected.pinned ? { color: 'var(--amber)' } : undefined}
                        onClick={() => pin.mutate({ id: selected.id, pinned: !selected.pinned })}>
                  <Icon name="pin" size={13} />
                </button>
                <button className="btn btn-sm" onClick={() => { setDraft(selected); setEditing(true); }}>
                  <Icon name="pencil" size={13} /> Edit
                </button>
                <button className="btn btn-sm btn-danger btn-icon" onClick={() => remove.mutate(selected.id)}>
                  <Icon name="trash-2" size={13} />
                </button>
              </div>
              <Markdown>{selected.body}</Markdown>
            </div>
          ) : (
            <div className="card" style={{ minHeight: 340 }}>
              <Empty icon="sticky-note" title="Your notes"
                     action={<button className="btn btn-primary" onClick={startNew}>
                       <Icon name="plus" size={14} /> New note</button>}>
                Scratchpads, decisions, meeting notes. Attach a note to a project or keep it
                workspace-wide. Pinned notes appear on your dashboard.
              </Empty>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
