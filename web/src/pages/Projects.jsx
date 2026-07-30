// PRD §9 Projects + §27 Workspace views.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, bytes, timeAgo } from '../lib/api';
import { useApp } from '../lib/store';
import { Empty, Field, Icon, Loading, Modal, Page, Segmented, StatusBadge } from '../components/ui';
import ProjectCard from '../components/ProjectCard';

export function NewProjectModal({ open, onClose, defaultTemplate }) {
  const { meta, toast } = useApp();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: '', description: '', category: 'Application', framework: '', language: '',
    status: 'Planning', color: '#6366f1', icon: 'rocket', tags: [], collection: '',
    template_id: null,
  });
  const [tagInput, setTagInput] = useState('');
  const [elapsed, setElapsed] = useState(null);

  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: () => api.get('/templates') });

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, name: '', description: '', tags: [], template_id: defaultTemplate ?? null }));
      setElapsed(null);
    }
  }, [open, defaultTemplate]);

  useEffect(() => {
    if (!form.template_id || !templates) return;
    const t = templates.find((x) => x.id === form.template_id);
    if (t) setForm((f) => ({ ...f, language: t.language || f.language, framework: t.framework || f.framework,
                             category: t.category || f.category, icon: t.icon, color: t.color }));
  }, [form.template_id, templates]);

  const create = useMutation({
    mutationFn: async (payload) => {
      const t0 = performance.now();
      const res = await api.post('/projects', payload);
      setElapsed(Math.round(performance.now() - t0));
      return res;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['nav-counts'] });
      toast('Project created', `${p.name} is ready`, 'success');
      onClose();
      nav(`/projects/${p.id}`);
    },
    onError: (e) => toast('Could not create project', String(e.detail || e.message), 'error'),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={onClose} title="Create project" icon="folder-plus" size="modal-lg"
           footer={(
             <>
               {elapsed !== null && <span className="dim" style={{ fontSize: 11.5, marginRight: 'auto' }}>created in {elapsed} ms</span>}
               <button className="btn" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending}
                       onClick={() => create.mutate({ ...form, name: form.name.trim() })}>
                 {create.isPending ? <span className="spinner" /> : <Icon name="plus" size={14} />} Create project
               </button>
             </>
           )}>
      <div className="grid g2" style={{ gap: 14 }}>
        <Field label="Project name">
          <input className="input" autoFocus value={form.name} onChange={set('name')}
                 placeholder="Iron Republic"
                 onKeyDown={(e) => e.key === 'Enter' && form.name.trim() && create.mutate({ ...form, name: form.name.trim() })} />
        </Field>
        <Field label="Collection" hint="Group related projects in your workspace">
          <input className="input" value={form.collection} onChange={set('collection')} placeholder="Client Work" />
        </Field>
      </div>

      <Field label="Description">
        <textarea className="textarea" style={{ minHeight: 62 }} value={form.description}
                  onChange={set('description')} placeholder="What are you building?" />
      </Field>

      <div className="grid g3" style={{ gap: 14 }}>
        <Field label="Category">
          <select className="select" value={form.category} onChange={set('category')}>
            {(meta?.categories || []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Language">
          <select className="select" value={form.language} onChange={set('language')}>
            <option value="">—</option>
            {(meta?.languages || []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Framework">
          <select className="select" value={form.framework} onChange={set('framework')}>
            <option value="">—</option>
            {(meta?.frameworks || []).filter(Boolean).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid g2" style={{ gap: 14 }}>
        <Field label="Status">
          <select className="select" value={form.status} onChange={set('status')}>
            {(meta?.projectStatuses || []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Tags" hint="Press Enter to add">
          <input className="input" value={tagInput}
                 onChange={(e) => setTagInput(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && tagInput.trim()) {
                     e.preventDefault();
                     setForm((f) => ({ ...f, tags: [...new Set([...f.tags, tagInput.trim()])] }));
                     setTagInput('');
                   }
                 }}
                 placeholder="payments, mobile-first" />
        </Field>
      </div>
      {form.tags.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: -6 }}>
          {form.tags.map((t) => (
            <span key={t} className="tag" style={{ cursor: 'pointer' }}
                  onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}>
              {t} <Icon name="x" size={10} style={{ verticalAlign: -1 }} />
            </span>
          ))}
        </div>
      )}

      <Field label="Icon & colour">
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {(meta?.icons || []).map((ic) => (
              <button key={ic} className="btn btn-icon"
                      style={form.icon === ic ? { borderColor: form.color, color: form.color, background: `color-mix(in srgb, ${form.color} 14%, transparent)` } : undefined}
                      onClick={() => setForm((f) => ({ ...f, icon: ic }))} type="button">
                <Icon name={ic} size={15} />
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {(meta?.colors || []).map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                      style={{
                        width: 26, height: 26, borderRadius: 8, background: c,
                        border: form.color === c ? '2px solid var(--text)' : '2px solid transparent',
                      }} />
            ))}
          </div>
        </div>
      </Field>

      <Field label="Start from a template" hint="Scaffolds folders, starter files, tasks and docs">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 9 }}>
          <button type="button" className="card hoverable"
                  style={{ padding: 11, textAlign: 'left', borderColor: !form.template_id ? 'var(--accent)' : undefined }}
                  onClick={() => setForm((f) => ({ ...f, template_id: null }))}>
            <div className="row" style={{ gap: 8 }}>
              <Icon name="file-plus" size={15} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Blank</span>
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Empty project</div>
          </button>
          {(templates || []).map((t) => (
            <button key={t.id} type="button" className="card hoverable"
                    style={{ padding: 11, textAlign: 'left', borderColor: form.template_id === t.id ? t.color : undefined }}
                    onClick={() => setForm((f) => ({ ...f, template_id: t.id }))}>
              <div className="row" style={{ gap: 8 }}>
                <Icon name={t.icon} size={15} style={{ color: t.color }} />
                <span className="truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>{t.name}</span>
              </div>
              <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
                {t.contents.files} files · {t.contents.tasks} tasks
              </div>
            </button>
          ))}
        </div>
      </Field>
    </Modal>
  );
}

export default function Projects() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [view, setView] = useState(localStorage.getItem('nexus.projectView') || 'grid');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('recent');
  const [showArchived, setShowArchived] = useState(false);
  const { meta } = useApp();

  useEffect(() => { localStorage.setItem('nexus.projectView', view); }, [view]);
  useEffect(() => {
    if (params.get('new') === '1') { setShowNew(true); params.delete('new'); setParams(params, { replace: true }); }
  }, [params, setParams]);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', showArchived, status, sort],
    queryFn: () => api.get(`/projects?archived=${showArchived}&sort=${sort}${status ? `&status=${status}` : ''}`),
  });
  const { data: workspace } = useQuery({ queryKey: ['workspace'], queryFn: () => api.get('/workspace') });

  const filtered = useMemo(() => {
    if (!projects) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) => `${p.name} ${p.description} ${(p.tags || []).join(' ')}`.toLowerCase().includes(needle));
  }, [projects, q]);

  return (
    <Page
      title="Projects"
      subtitle={`${filtered.length} ${showArchived ? 'archived' : 'active'} project${filtered.length === 1 ? '' : 's'}`}
      actions={(
        <>
          <Segmented value={view} onChange={setView}
                     options={[{ value: 'grid', label: '', icon: 'layout-grid' },
                               { value: 'list', label: '', icon: 'list' }]} />
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={14} /> New project
          </button>
        </>
      )}
    >
      <div className="row" style={{ gap: 9, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 210, maxWidth: 340 }}>
          <Icon name="search" size={14}
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="input" style={{ paddingLeft: 32 }} value={q}
                 onChange={(e) => setQ(e.target.value)} placeholder="Filter projects…" />
        </div>
        <select className="select" style={{ width: 158 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {(meta?.projectStatuses || []).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Recently updated</option>
          <option value="opened">Recently opened</option>
          <option value="created">Newest first</option>
          <option value="name">Name A–Z</option>
        </select>
        <button className={`btn ${showArchived ? 'btn-primary' : ''}`} onClick={() => setShowArchived((a) => !a)}>
          <Icon name="archive" size={14} /> Archived
          {workspace?.archived?.length > 0 && <span className="badge">{workspace.archived.length}</span>}
        </button>
      </div>

      {/* Collections (§27) */}
      {!showArchived && workspace && Object.keys(workspace.collections || {}).length > 0 && !q && !status && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <span className="card-title"><Icon name="layers" size={14} /> Collections</span>
          </div>
          <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
            {Object.entries(workspace.collections).map(([name, items]) => (
              <button key={name} className="btn" onClick={() => setQ(name === q ? '' : '')}
                      title={items.map((i) => i.name).join(', ')}>
                <Icon name="folder" size={13} /> {name}
                <span className="badge">{items.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? <Loading rows={4} /> : filtered.length === 0 ? (
        <Empty icon="folder-plus"
               title={q ? 'No matching projects' : showArchived ? 'No archived projects' : 'No projects yet'}
               action={!q && !showArchived && (
                 <button className="btn btn-primary" onClick={() => setShowNew(true)}>
                   <Icon name="plus" size={14} /> Create your first project
                 </button>
               )}>
          {q ? `Nothing matches “${q}”.` : 'Everything about a project lives inside the project — files, notes, tasks, secrets, deployments.'}
        </Empty>
      ) : view === 'grid' ? (
        <div className="grid g-auto">
          {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th><th>Status</th><th>Stack</th><th>Files</th>
                <th>Size</th><th>Progress</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/projects/${p.id}`)}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <div className="list-icon" style={{ background: p.color, color: '#fff', borderColor: 'transparent', width: 27, height: 27 }}>
                        <Icon name={p.icon} size={13} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 550 }}>{p.name}</div>
                        <div className="dim truncate" style={{ fontSize: 11.5, maxWidth: 320 }}>{p.description}</div>
                      </div>
                      {p.pinned && <Icon name="pin" size={12} style={{ color: 'var(--amber)' }} />}
                    </div>
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{[p.language, p.framework].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="tnum">{p.fileCount}</td>
                  <td className="tnum muted">{bytes(p.storageUsed)}</td>
                  <td style={{ minWidth: 110 }}>
                    {p.taskTotal > 0 ? (
                      <div className="row" style={{ gap: 8 }}>
                        <div className="progress" style={{ width: 62 }}>
                          <i style={{ width: `${p.taskProgress}%`, background: p.color }} />
                        </div>
                        <span className="dim tnum" style={{ fontSize: 11 }}>{p.taskProgress}%</span>
                      </div>
                    ) : <span className="dim">—</span>}
                  </td>
                  <td className="dim" style={{ fontSize: 12 }}>{timeAgo(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} />
    </Page>
  );
}
