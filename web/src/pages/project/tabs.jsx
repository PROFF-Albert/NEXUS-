// PRD §11 Overview, §14 Snapshots, §15 Timeline, §17 Tasks, §16/§18 Notes & Docs,
// §19 Images, §20 Videos, §10 Logs/Analytics.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api, bytes, dateStr, dateTimeStr, timeAgo, PRIORITY_COLOR, STATUS_COLOR } from '../../lib/api';
import { useApp } from '../../lib/store';
import {
  Badge, Confirm, Empty, Field, Icon, Loading, Modal, PriorityBadge, Progress,
  Segmented, StatusBadge, Stat,
} from '../../components/ui';
import Markdown from '../../components/Markdown';

/* ════════════════════════ OVERVIEW (§11) ════════════════════════ */
export function OverviewTab({ project, onTab }) {
  const nav = useNavigate();
  const { data: timeline } = useQuery({
    queryKey: ['timeline', project.id],
    queryFn: () => api.get(`/projects/${project.id}/timeline?limit=10`),
  });
  const c = project.counts || {};

  const quick = [
    { icon: 'upload', label: 'Upload files', go: () => onTab('files') },
    { icon: 'camera', label: 'Take snapshot', go: () => onTab('versions') },
    { icon: 'check-square', label: 'Add task', go: () => onTab('tasks') },
    { icon: 'file-text', label: 'Write note', go: () => onTab('notes') },
    { icon: 'key', label: 'Store secret', go: () => onTab('secrets') },
    { icon: 'sparkles', label: 'Ask AI', go: () => nav(`/assistant?project=${project.id}`) },
  ];

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* banner */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          height: 104, position: 'relative',
          background: `linear-gradient(135deg, ${project.color}, color-mix(in srgb, ${project.color} 26%, #0b0b12))`,
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(120% 130% at 14% 0%, rgba(255,255,255,0.22), transparent 60%)',
          }} />
        </div>
        <div style={{ padding: '0 22px 20px', position: 'relative' }}>
          <div style={{
            width: 62, height: 62, borderRadius: 17, background: project.color,
            display: 'grid', placeItems: 'center', color: '#fff',
            border: '3px solid var(--bg-1)', flexShrink: 0, marginTop: -31,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <Icon name={project.icon} size={27} />
          </div>

          <div style={{ marginTop: 13 }}>
            <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em' }}>{project.name}</h2>
              <StatusBadge status={project.status} />
              {project.favorite && <Badge color="var(--amber)" icon="star">Favorite</Badge>}
              {project.archived && <Badge icon="archive">Archived</Badge>}
            </div>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 6, maxWidth: 760, lineHeight: 1.6 }}>
              {project.description || 'No description yet.'}
            </p>
          </div>

          <div className="row" style={{ gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
            {project.language && <Badge icon="code">{project.language}</Badge>}
            {project.framework && <Badge icon="layers">{project.framework}</Badge>}
            <Badge icon="tag">{project.category}</Badge>
            {project.collection && <Badge icon="folder">{project.collection}</Badge>}
            {(project.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>
      </div>

      <div className="grid g4">
        <Stat label="Storage used" value={bytes(project.storageUsed)} icon="hard-drive"
              foot={`${project.fileCount} files`} />
        <Stat label="Task progress" value={`${project.taskProgress}%`} icon="check-square"
              color={project.taskProgress === 100 ? 'var(--green)' : undefined}
              foot={`${project.taskDone} of ${project.taskTotal} done`} />
        <Stat label="Latest snapshot" value={project.latestSnapshot?.name || '—'} icon="camera"
              color="var(--green)"
              foot={project.latestSnapshot ? timeAgo(project.latestSnapshot.createdAt) : 'none yet'} />
        <Stat label="Created" value={dateStr(project.createdAt, { day: 'numeric', month: 'short' })}
              icon="calendar" foot={`opened ${timeAgo(project.lastOpened)}`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="zap" size={14} /> Quick actions</span></div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(142px, 1fr))', gap: 9 }}>
              {quick.map((a) => (
                <button key={a.label} className="btn" style={{ justifyContent: 'flex-start' }} onClick={a.go}>
                  <Icon name={a.icon} size={14} /> {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="git-commit" size={14} /> Recent activity</span>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => onTab('timeline')}>Full timeline</button>
            </div>
            {timeline?.length ? (
              <div className="timeline">
                {timeline.slice(0, 8).map((t) => (
                  <div className="tl-item" key={t.id} style={{ paddingBottom: 14 }}>
                    <div className="tl-dot"><i /></div>
                    <div className="row" style={{ gap: 8 }}>
                      <Icon name={t.icon} size={13} style={{ color: 'var(--text-3)' }} />
                      <span style={{ fontSize: 13 }}>
                        <strong style={{ fontWeight: 550 }}>{t.action.replace(/[._]/g, ' ')}</strong>
                        {t.target && <span className="muted"> · {t.target}</span>}
                      </span>
                      <div className="spacer" />
                      <span className="dim" style={{ fontSize: 11 }}>{timeAgo(t.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="dim" style={{ fontSize: 13, padding: 10 }}>No activity recorded yet.</div>}
          </div>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="box" size={14} /> Contents</span></div>
            <div className="col" style={{ gap: 2 }}>
              {[
                ['files', 'file', 'Files', project.fileCount],
                ['images', 'image', 'Images', c.images],
                ['videos', 'video', 'Videos', c.videos],
                ['notes', 'sticky-note', 'Notes', c.notes],
                ['docs', 'book', 'Documentation', c.docs],
                ['versions', 'camera', 'Snapshots', c.snapshots],
                ['secrets', 'key', 'Secrets', c.secrets],
                ['database', 'database', 'Databases', c.databases],
                ['api', 'git-branch', 'API requests', c.apis],
                ['deployments', 'cloud', 'Deployments', c.deployments],
              ].map(([tab, icon, label, n]) => (
                <div className="list-item" key={tab} onClick={() => onTab(tab)}>
                  <div className="list-icon"><Icon name={icon} size={13} /></div>
                  <span style={{ fontSize: 13, flex: 1 }}>{label}</span>
                  <span className="badge tnum">{n || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {project.liveUrl && (
            <div className="card">
              <div className="card-head"><span className="card-title"><Icon name="globe" size={14} /> Live</span></div>
              <a className="btn" href={project.liveUrl} target="_blank" rel="noreferrer" style={{ width: '100%' }}>
                <Icon name="external-link" size={13} /> {project.liveUrl.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}

          <div className="card" style={{ borderStyle: 'dashed' }}>
            <div className="row" style={{ gap: 9, color: 'var(--text-3)', fontSize: 12.5 }}>
              <Icon name="users" size={14} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>Team</div>
                <div>Collaboration arrives in a future release — NEXUS is private-first.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ SNAPSHOTS (§14) ════════════════════════ */
export function VersionsTab({ project }) {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: snaps, isLoading } = useQuery({
    queryKey: ['snapshots', project.id],
    queryFn: () => api.get(`/projects/${project.id}/snapshots`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['snapshots', project.id] });
    qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
    qc.invalidateQueries({ queryKey: ['tree', project.id] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/snapshots`, form),
    onSuccess: (s) => {
      invalidate(); setCreating(false); setForm({ name: '', description: '' });
      toast('Snapshot complete', `${s.name} · ${bytes(s.size)} in ${s.elapsedMs} ms`, 'success');
    },
    onError: (e) => toast('Snapshot failed', String(e.detail || e.message), 'error'),
  });

  const restore = useMutation({
    mutationFn: (id) => api.post(`/projects/${project.id}/snapshots/${id}/restore`, {}),
    onSuccess: (r) => {
      invalidate();
      toast('Version restored',
            `${r.restored.files} files · ${r.restored.notes} notes · ${r.restored.tasks} tasks`, 'success');
    },
  });

  const remove = useMutation({
    mutationFn: (id) => api.del(`/projects/${project.id}/snapshots/${id}`),
    onSuccess: () => { invalidate(); toast('Snapshot deleted'); },
  });

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card" style={{ background: 'var(--bg-2)' }}>
        <div className="row" style={{ gap: 13, flexWrap: 'wrap' }}>
          <Icon name="camera" size={19} style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>One-click backups</div>
            <div className="dim" style={{ fontSize: 12.3, marginTop: 2 }}>
              A snapshot captures every file, note, task, doc, API collection and database
              config into one restorable archive.
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="camera" size={14} /> Take snapshot
          </button>
        </div>
      </div>

      {isLoading ? <Loading rows={3} /> : !snaps?.length ? (
        <Empty icon="camera" title="No snapshots yet"
               action={<button className="btn btn-primary" onClick={() => setCreating(true)}>
                 <Icon name="camera" size={14} /> Take your first snapshot</button>}>
          Snapshots are your undo button for the entire project. Take one before every risky change.
        </Empty>
      ) : (
        <div className="col" style={{ gap: 11 }}>
          {snaps.map((s, i) => (
            <motion.div key={s.id} className="card hoverable"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}>
              <div className="row" style={{ gap: 13, flexWrap: 'wrap' }}>
                <div className="list-icon" style={{
                  width: 38, height: 38, color: i === 0 ? 'var(--green)' : 'var(--text-3)',
                  background: i === 0 ? 'color-mix(in srgb, var(--green) 12%, transparent)' : undefined,
                }}>
                  <Icon name="camera" size={16} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{s.name}</strong>
                    {i === 0 && <Badge color="var(--green)">latest</Badge>}
                    <Badge>{s.kind}</Badge>
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>
                    {s.description || 'No description'}
                  </div>
                  <div className="row" style={{ gap: 13, marginTop: 7, fontSize: 11.5, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                    <span><Icon name="user" size={11} style={{ verticalAlign: -1 }} /> {s.author}</span>
                    <span><Icon name="file" size={11} style={{ verticalAlign: -1 }} /> {s.fileCount} files</span>
                    <span><Icon name="hard-drive" size={11} style={{ verticalAlign: -1 }} /> {bytes(s.size)}</span>
                    <span><Icon name="clock" size={11} style={{ verticalAlign: -1 }} /> {dateTimeStr(s.createdAt)}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 7 }}>
                  <button className="btn btn-sm" onClick={() => setConfirmRestore(s)}>
                    <Icon name="rotate-ccw" size={13} /> Restore
                  </button>
                  <button className="btn btn-sm btn-icon" title="Download archive"
                          onClick={() => api.download(`/projects/${project.id}/snapshots/${s.id}/download`, `${s.name}.nexus.zip`)}>
                    <Icon name="download" size={13} />
                  </button>
                  <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirmDelete(s)}>
                    <Icon name="trash-2" size={13} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Take snapshot" icon="camera"
             footer={(
               <>
                 <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
                 <button className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
                   {create.isPending ? <span className="spinner" /> : <Icon name="camera" size={14} />} Create snapshot
                 </button>
               </>
             )}>
        <Field label="Version name" hint={`Leave blank for v${(snaps?.length || 0) + 1}.0`}>
          <input className="input" placeholder={`v${(snaps?.length || 0) + 1}.0`} value={form.name}
                 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </Field>
        <Field label="Description">
          <textarea className="textarea" placeholder="What changed in this version?"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="card" style={{ background: 'var(--bg-2)', padding: 13 }}>
          <div className="dim" style={{ fontSize: 12, lineHeight: 1.75 }}>
            <strong style={{ color: 'var(--text-2)' }}>Included:</strong> all project files ·
            folder structure · notes · documentation · tasks · database configs · API collections ·
            deployment records · project settings
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirmRestore} onClose={() => setConfirmRestore(null)}
               title={`Restore ${confirmRestore?.name}?`} danger={false} confirmLabel="Restore version"
               message="The project will be rebuilt exactly as captured in this snapshot. A safety snapshot of the current state is taken automatically first, so this is always reversible."
               onConfirm={() => restore.mutate(confirmRestore.id)} />

      <Confirm open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
               title={`Delete ${confirmDelete?.name}?`}
               message="The snapshot archive will be permanently removed. Project files are not affected."
               onConfirm={() => remove.mutate(confirmDelete.id)} />
    </div>
  );
}

/* ════════════════════════ TIMELINE (§15) ════════════════════════ */
export function TimelineTab({ project }) {
  const { data, isLoading } = useQuery({
    queryKey: ['timeline-full', project.id],
    queryFn: () => api.get(`/projects/${project.id}/timeline?limit=200`),
  });
  if (isLoading) return <Loading rows={5} />;
  if (!data?.length) return <Empty icon="git-commit" title="No history yet">Actions you take are recorded here automatically.</Empty>;

  const groups = data.reduce((acc, e) => {
    const day = new Date(e.createdAt).toDateString();
    (acc[day] = acc[day] || []).push(e);
    return acc;
  }, {});

  return (
    <div className="card">
      {Object.entries(groups).map(([day, events]) => (
        <div key={day} style={{ marginBottom: 22 }}>
          <div className="row" style={{ gap: 9, marginBottom: 13 }}>
            <span className="badge">{day === new Date().toDateString() ? 'Today' : day}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span className="dim" style={{ fontSize: 11 }}>{events.length} events</span>
          </div>
          <div className="timeline">
            {events.map((e) => (
              <div className="tl-item" key={e.id}>
                <div className="tl-dot"><i /></div>
                <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
                  <Icon name={e.icon} size={14} style={{ color: 'var(--accent)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.3, fontWeight: 550 }}>
                      {e.action.replace(/[._]/g, ' ').replace(/^\w/, (m) => m.toUpperCase())}
                    </div>
                    <div className="muted" style={{ fontSize: 12.3 }}>
                      {e.target}{e.detail && ` — ${e.detail}`}
                    </div>
                  </div>
                  <div className="spacer" />
                  <span className="dim" style={{ fontSize: 11 }}>
                    {new Date(e.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════ TASKS (§17) ════════════════════════ */
const TASK_STATUSES = ['Todo', 'In Progress', 'Blocked', 'Testing', 'Done'];

export function TasksTab({ project }) {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [view, setView] = useState('board');
  const [editing, setEditing] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', project.id],
    queryFn: () => api.get(`/projects/${project.id}/tasks`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tasks', project.id] });
    qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
    qc.invalidateQueries({ queryKey: ['nav-counts'] });
  };

  const save = useMutation({
    mutationFn: (t) => (t.id ? api.patch(`/tasks/${t.id}`, t) : api.post(`/projects/${project.id}/tasks`, t)),
    onSuccess: () => { invalidate(); setEditing(null); },
  });
  const move = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/tasks/${id}`, { status }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id) => api.del(`/tasks/${id}`),
    onSuccess: () => { invalidate(); setEditing(null); toast('Task deleted'); },
  });

  const roots = (tasks || []).filter((t) => !t.parentId);
  const subs = (id) => (tasks || []).filter((t) => t.parentId === id);

  const TaskCard = ({ t }) => (
    <div className="task-card" draggable
         onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
         onClick={() => setEditing(t)}>
      <div className="row" style={{ gap: 7, marginBottom: 6, alignItems: 'flex-start' }}>
        <span style={{ flex: 1, fontSize: 12.8, lineHeight: 1.45 }}>{t.name}</span>
        <i className="dot" style={{ background: PRIORITY_COLOR[t.priority], marginTop: 5 }} title={t.priority} />
      </div>
      {t.progress > 0 && t.status !== 'Done' && (
        <div style={{ marginBottom: 7 }}><Progress value={t.progress} /></div>
      )}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {(t.labels || []).map((l) => <span key={l} className="tag" style={{ fontSize: 10 }}>{l}</span>)}
        {t.deadline && (
          <span className="tag" style={{
            fontSize: 10,
            color: new Date(t.deadline) < new Date() && t.status !== 'Done' ? 'var(--red)' : undefined,
          }}>
            <Icon name="calendar" size={9} style={{ verticalAlign: -1 }} /> {dateStr(t.deadline, { day: 'numeric', month: 'short' })}
          </span>
        )}
        {subs(t.id).length > 0 && (
          <span className="tag" style={{ fontSize: 10 }}>
            <Icon name="list-tree" size={9} style={{ verticalAlign: -1 }} />{' '}
            {subs(t.id).filter((s) => s.status === 'Done').length}/{subs(t.id).length}
          </span>
        )}
        {(t.dependsOn || []).length > 0 && (
          <span className="tag" style={{ fontSize: 10, color: 'var(--amber)' }}>
            <Icon name="link" size={9} style={{ verticalAlign: -1 }} /> {t.dependsOn.length}
          </span>
        )}
      </div>
    </div>
  );

  if (isLoading) return <Loading rows={4} />;

  return (
    <div className="col" style={{ gap: 15 }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 9 }}>
        <Segmented value={view} onChange={setView}
                   options={[{ value: 'board', label: 'Board', icon: 'columns' },
                             { value: 'list', label: 'List', icon: 'list' }]} />
        <div className="spacer" />
        <span className="dim" style={{ fontSize: 12.5 }}>
          {(tasks || []).filter((t) => t.status === 'Done').length} of {tasks?.length || 0} complete
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ name: '', status: 'Todo', priority: 'Medium', labels: [] })}>
          <Icon name="plus" size={13} /> Add task
        </button>
      </div>

      {view === 'board' ? (
        <div className="kanban">
          {TASK_STATUSES.map((st) => {
            const items = roots.filter((t) => t.status === st);
            return (
              <div key={st} className={`kanban-col ${dragOver === st ? 'drag-over' : ''}`}
                   onDragOver={(e) => { e.preventDefault(); setDragOver(st); }}
                   onDragLeave={() => setDragOver(null)}
                   onDrop={(e) => {
                     e.preventDefault(); setDragOver(null);
                     const id = Number(e.dataTransfer.getData('text/plain'));
                     if (id) move.mutate({ id, status: st });
                   }}>
                <div className="kanban-head">
                  <i className="dot" style={{ background: STATUS_COLOR[st] }} />
                  {st}
                  <span className="badge">{items.length}</span>
                  <div className="spacer" />
                  <button className="btn btn-sm btn-ghost btn-icon"
                          onClick={() => setEditing({ name: '', status: st, priority: 'Medium', labels: [] })}>
                    <Icon name="plus" size={12} />
                  </button>
                </div>
                {items.map((t) => <TaskCard key={t.id} t={t} />)}
                {items.length === 0 && (
                  <div className="dim" style={{ fontSize: 11.5, textAlign: 'center', padding: 16 }}>Drop tasks here</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th style={{ width: 34 }} /><th>Task</th><th>Status</th><th>Priority</th><th>Deadline</th><th>Progress</th></tr></thead>
            <tbody>
              {(tasks || []).map((t) => (
                <tr key={t.id} onClick={() => setEditing(t)} style={{ cursor: 'pointer' }}>
                  <td onClick={(e) => { e.stopPropagation(); move.mutate({ id: t.id, status: t.status === 'Done' ? 'Todo' : 'Done' }); }}>
                    <Icon name={t.status === 'Done' ? 'check-circle' : 'circle'} size={16}
                          style={{ color: t.status === 'Done' ? 'var(--green)' : 'var(--text-3)' }} />
                  </td>
                  <td>
                    <div style={{ textDecoration: t.status === 'Done' ? 'line-through' : 'none', opacity: t.status === 'Done' ? 0.6 : 1 }}>
                      {t.parentId && <span className="dim">↳ </span>}{t.name}
                    </div>
                    {(t.labels || []).length > 0 && (
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        {t.labels.map((l) => <span key={l} className="tag" style={{ fontSize: 10 }}>{l}</span>)}
                      </div>
                    )}
                  </td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td className="dim" style={{ fontSize: 12.5 }}>{t.deadline ? dateStr(t.deadline) : '—'}</td>
                  <td style={{ width: 110 }}><Progress value={t.progress} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tasks?.length && <Empty icon="check-square" title="No tasks yet">Break the work down into trackable steps.</Empty>}
        </div>
      )}

      <TaskModal task={editing} tasks={tasks || []} onClose={() => setEditing(null)}
                 onSave={(t) => save.mutate(t)} onDelete={(id) => remove.mutate(id)} />
    </div>
  );
}

function TaskModal({ task, tasks, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(task || {});
  const [labelInput, setLabelInput] = useState('');
  React.useEffect(() => { setForm(task || {}); }, [task]);
  if (!task) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open={!!task} onClose={onClose} title={task.id ? 'Edit task' : 'New task'} icon="check-square" size="modal-lg"
           footer={(
             <>
               {task.id && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => onDelete(task.id)}>
                 <Icon name="trash-2" size={13} /> Delete</button>}
               <button className="btn" onClick={onClose}>Cancel</button>
               <button className="btn btn-primary" disabled={!form.name?.trim()}
                       onClick={() => onSave({
                         ...form,
                         deadline: form.deadline || null,
                         reminder: form.reminder || null,
                         progress: Number(form.progress || 0),
                       })}>Save task</button>
             </>
           )}>
      <Field label="Task name">
        <input className="input" autoFocus value={form.name || ''} onChange={set('name')} placeholder="Implement booking calendar" />
      </Field>
      <Field label="Details">
        <textarea className="textarea" value={form.detail || ''} onChange={set('detail')} placeholder="Acceptance criteria, links, notes…" />
      </Field>
      <div className="grid g3" style={{ gap: 13 }}>
        <Field label="Status">
          <select className="select" value={form.status || 'Todo'} onChange={set('status')}>
            {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="select" value={form.priority || 'Medium'} onChange={set('priority')}>
            {['Critical', 'High', 'Medium', 'Low'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label={`Progress — ${form.progress || 0}%`}>
          <input type="range" min="0" max="100" step="5" value={form.progress || 0}
                 onChange={set('progress')} style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </Field>
      </div>
      <div className="grid g2" style={{ gap: 13 }}>
        <Field label="Deadline">
          <input className="input" type="datetime-local"
                 value={form.deadline ? String(form.deadline).slice(0, 16) : ''} onChange={set('deadline')} />
        </Field>
        <Field label="Reminder">
          <input className="input" type="datetime-local"
                 value={form.reminder ? String(form.reminder).slice(0, 16) : ''} onChange={set('reminder')} />
        </Field>
      </div>
      <Field label="Labels" hint="Press Enter to add">
        <input className="input" value={labelInput} onChange={(e) => setLabelInput(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === 'Enter' && labelInput.trim()) {
                   e.preventDefault();
                   setForm((f) => ({ ...f, labels: [...new Set([...(f.labels || []), labelInput.trim()])] }));
                   setLabelInput('');
                 }
               }} placeholder="frontend, urgent" />
      </Field>
      {(form.labels || []).length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: -6 }}>
          {form.labels.map((l) => (
            <span key={l} className="tag" style={{ cursor: 'pointer' }}
                  onClick={() => setForm((f) => ({ ...f, labels: f.labels.filter((x) => x !== l) }))}>
              {l} <Icon name="x" size={9} style={{ verticalAlign: -1 }} />
            </span>
          ))}
        </div>
      )}
      <div className="grid g2" style={{ gap: 13 }}>
        <Field label="Parent task" hint="Makes this a subtask">
          <select className="select" value={form.parentId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value ? Number(e.target.value) : null, parentId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— none —</option>
            {tasks.filter((t) => t.id !== task.id && !t.parentId).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Depends on" hint="Blocked until these finish">
          <select className="select" multiple size={3} value={(form.dependsOn || []).map(String)}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    depends_on: Array.from(e.target.selectedOptions).map((o) => Number(o.value)),
                    dependsOn: Array.from(e.target.selectedOptions).map((o) => Number(o.value)),
                  }))}
                  style={{ height: 'auto', padding: 6 }}>
            {tasks.filter((t) => t.id !== task.id).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

/* ════════════════════════ NOTES & DOCS (§16 / §18) ════════════════════════ */
export function NotesTab({ project, docType = 'note' }) {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '', category: 'General' });
  const [q, setQ] = useState('');

  const { data: sections } = useQuery({ queryKey: ['doc-sections'], queryFn: () => api.get('/doc-sections') });
  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', project.id, docType],
    queryFn: () => api.get(`/notes?project_id=${project.id}&doc_type=${docType}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notes', project.id, docType] });
    qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
  };

  const save = useMutation({
    mutationFn: (n) => (n.id ? api.patch(`/notes/${n.id}`, n)
      : api.post('/notes', { ...n, project_id: project.id, doc_type: docType })),
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

  const filtered = (notes || []).filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase()));
  const startNew = () => {
    setDraft({ title: '', body: '', category: docType === 'doc' ? 'README' : 'General' });
    setSelected(null);
    setEditing(true);
  };

  return (
    <div className="split" style={{ alignItems: 'stretch' }}>
      <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '74vh' }}>
        <div style={{ padding: 11, borderBottom: '1px solid var(--line)' }}>
          <button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 9 }} onClick={startNew}>
            <Icon name="plus" size={13} /> New {docType === 'doc' ? 'document' : 'note'}
          </button>
          <input className="input" style={{ fontSize: 12.5, padding: '6px 9px' }} placeholder="Search…"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 7 }}>
          {isLoading ? <Loading rows={3} /> : filtered.length === 0 ? (
            <div className="dim" style={{ fontSize: 12.5, padding: 16, textAlign: 'center' }}>
              No {docType === 'doc' ? 'documents' : 'notes'} yet
            </div>
          ) : filtered.map((n) => (
            <div key={n.id} className={`tree-row ${selected?.id === n.id ? 'selected' : ''}`}
                 style={{ padding: '8px 10px', alignItems: 'flex-start' }}
                 onClick={() => { setSelected(n); setEditing(false); }}>
              <Icon name={n.pinned ? 'pin' : docType === 'doc' ? 'book' : 'file-text'} size={13}
                    style={{ marginTop: 2, color: n.pinned ? 'var(--amber)' : undefined, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="truncate" style={{ fontSize: 12.8 }}>{n.title}</div>
                <div className="dim truncate" style={{ fontSize: 11 }}>{n.category} · {timeAgo(n.updatedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        {editing ? (
          <div className="card">
            <div className="col" style={{ gap: 13 }}>
              <div className="row" style={{ gap: 9 }}>
                <input className="input" placeholder="Title" style={{ flex: 1, fontSize: 15, fontWeight: 600 }}
                       value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} autoFocus />
                {docType === 'doc' ? (
                  <select className="select" style={{ width: 168 }} value={draft.category}
                          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>
                    {(sections || []).map((s) => <option key={s}>{s}</option>)}
                  </select>
                ) : (
                  <input className="input" style={{ width: 148 }} placeholder="Category" value={draft.category}
                         onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
                )}
              </div>
              <textarea className="textarea mono" style={{ minHeight: 380, lineHeight: 1.68 }}
                        placeholder={'# Heading\n\n- [ ] checklist item\n\n```js\nconst x = 1;\n```\n\n| col | col |\n|---|---|'}
                        value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
              <div className="row">
                <span className="dim" style={{ fontSize: 11.5 }}>
                  Markdown supported — headings, lists, checklists, tables, code blocks
                </span>
                <div className="spacer" />
                <button className="btn" onClick={() => { setEditing(false); if (!draft.id) setSelected(null); }}>Cancel</button>
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
                <h2 style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em' }}>{selected.title}</h2>
                <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
                  {selected.category} · updated {timeAgo(selected.updatedAt)}
                </div>
              </div>
              <button className="btn btn-sm btn-icon" title={selected.pinned ? 'Unpin' : 'Pin'}
                      onClick={() => pin.mutate({ id: selected.id, pinned: !selected.pinned })}
                      style={selected.pinned ? { color: 'var(--amber)' } : undefined}>
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
            <Empty icon={docType === 'doc' ? 'book' : 'sticky-note'}
                   title={docType === 'doc' ? 'Project documentation' : 'Project notes'}
                   action={<button className="btn btn-primary" onClick={startNew}>
                     <Icon name="plus" size={14} /> New {docType === 'doc' ? 'document' : 'note'}</button>}>
              {docType === 'doc'
                ? 'README, Installation, Architecture, Deployment Guide, API Docs, Changelog, Roadmap and Meeting Notes — all versioned with your snapshots.'
                : 'Rich markdown notes with checklists, tables, code blocks and images. Pin the important ones to your dashboard.'}
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════ MEDIA (§19 / §20) ════════════════════════ */
export function MediaTab({ project, kind }) {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [preview, setPreview] = useState(null);
  const [compare, setCompare] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = React.useRef(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['media', project.id, kind],
    queryFn: () => api.get(`/projects/${project.id}/media?kind=${kind}`),
  });

  const upload = async (files) => {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('files', f));
    await api.upload(`/projects/${project.id}/files/upload`, form);
    qc.invalidateQueries({ queryKey: ['media', project.id, kind] });
    qc.invalidateQueries({ queryKey: ['tree', project.id] });
    toast('Upload complete', `${files.length} ${kind}(s) added`, 'success');
  };

  const remove = useMutation({
    mutationFn: (id) => api.del(`/projects/${project.id}/files/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media', project.id, kind] });
      setPreview(null);
      toast('Moved to recycle bin');
    },
  });

  if (isLoading) return <Loading rows={3} />;

  return (
    <div className="col" style={{ gap: 15 }}>
      <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
        <span className="dim" style={{ fontSize: 12.5 }}>
          {items?.length || 0} {kind}{items?.length === 1 ? '' : 's'} ·{' '}
          {bytes((items || []).reduce((a, f) => a + f.size, 0))}
        </span>
        <div className="spacer" />
        {kind === 'image' && compare.length === 2 && (
          <button className="btn btn-sm" onClick={() => setPreview({ compare: true })}>
            <Icon name="columns" size={13} /> Compare selected
          </button>
        )}
        {compare.length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => setCompare([])}>Clear ({compare.length})</button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={13} /> Upload {kind}s
        </button>
      </div>

      <div className={`${!items?.length ? `dropzone ${dragOver ? 'over' : ''}` : ''}`}
           onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
           onDragLeave={() => setDragOver(false)}
           onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
           style={!items?.length ? { padding: 44 } : undefined}>
        {!items?.length ? (
          <>
            <Icon name={kind === 'image' ? 'image' : 'video'} size={26} style={{ marginBottom: 10, opacity: 0.55 }} />
            <div style={{ fontSize: 13.5, marginBottom: 5 }}>Drop {kind}s here or click upload</div>
            <div style={{ fontSize: 12 }}>
              {kind === 'image' ? 'Screenshots, mockups, diagrams — with fullscreen preview and compare'
                : 'Demo videos, screen recordings and tutorials — streamed straight from your workspace'}
            </div>
          </>
        ) : (
          <div className="gallery">
            {items.map((f) => (
              <motion.div key={f.id} className="gallery-item" layout
                          style={compare.includes(f.id) ? { borderColor: 'var(--accent)', borderWidth: 2 } : undefined}
                          onClick={(e) => {
                            if (e.shiftKey && kind === 'image') {
                              setCompare((c) => (c.includes(f.id) ? c.filter((x) => x !== f.id) : [...c, f.id].slice(-2)));
                            } else setPreview(f);
                          }}>
                {kind === 'image' ? (
                  <img src={api.url(`/projects/${project.id}/files/${f.id}/raw`)} alt={f.name} loading="lazy" />
                ) : (
                  <video src={api.url(`/projects/${project.id}/files/${f.id}/raw`)} preload="metadata" muted />
                )}
                <div className="gallery-cap">{f.name}</div>
                {kind === 'video' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.55)',
                      display: 'grid', placeItems: 'center', color: '#fff',
                    }}><Icon name="play" size={15} /></div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
      {kind === 'image' && items?.length > 1 && (
        <div className="dim" style={{ fontSize: 11.5 }}>
          Tip: shift-click two images to compare them side by side.
        </div>
      )}

      <input ref={inputRef} type="file" multiple hidden
             accept={kind === 'image' ? 'image/*' : 'video/*'}
             onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />

      <Modal open={!!preview} onClose={() => setPreview(null)} size="modal-xl"
             title={preview?.compare ? 'Compare images' : preview?.name}
             icon={kind === 'image' ? 'image' : 'video'}
             footer={!preview?.compare && preview && (
               <>
                 <span className="dim" style={{ marginRight: 'auto', fontSize: 12 }}>
                   {bytes(preview.size)} · {preview.mime} · added {timeAgo(preview.createdAt)}
                 </span>
                 <button className="btn btn-danger" onClick={() => remove.mutate(preview.id)}>
                   <Icon name="trash-2" size={13} /> Delete
                 </button>
                 <button className="btn" onClick={() => api.download(`/projects/${project.id}/files/${preview.id}/raw?download=true`, preview.name)}>
                   <Icon name="download" size={13} /> Download
                 </button>
               </>
             )}>
        {preview?.compare ? (
          <div className="grid g2" style={{ gap: 13 }}>
            {compare.map((id) => {
              const f = items.find((x) => x.id === id);
              return (
                <div key={id} className="col" style={{ gap: 7 }}>
                  <img src={api.url(`/projects/${project.id}/files/${id}/raw`)} alt={f?.name}
                       style={{ width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }} />
                  <span className="dim truncate" style={{ fontSize: 11.5 }}>{f?.name} · {bytes(f?.size || 0)}</span>
                </div>
              );
            })}
          </div>
        ) : preview && kind === 'image' ? (
          <img src={api.url(`/projects/${project.id}/files/${preview.id}/raw`)} alt={preview.name}
               style={{ width: '100%', borderRadius: 'var(--radius-sm)' }} />
        ) : preview ? (
          <video controls autoPlay style={{ width: '100%', borderRadius: 'var(--radius-sm)' }}
                 src={api.url(`/projects/${project.id}/files/${preview.id}/raw`)} />
        ) : null}
      </Modal>
    </div>
  );
}

/* ════════════════════════ LOGS (§10) ════════════════════════ */
export function LogsTab({ project }) {
  const { data, isLoading } = useQuery({
    queryKey: ['logs', project.id],
    queryFn: () => api.get(`/projects/${project.id}/logs`),
  });
  const [filter, setFilter] = useState('');
  if (isLoading) return <Loading rows={4} />;
  const rows = (data || []).filter((r) => !filter || `${r.source} ${r.body}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="col" style={{ gap: 13 }}>
      <input className="input" style={{ maxWidth: 320 }} placeholder="Filter logs…"
             value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="code-wrap">
        <div className="code-bar">
          <Icon name="terminal" size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600 }}>Project logs</span>
          <span className="badge">{rows.length} entries</span>
        </div>
        <div className="code-scroll" style={{ maxHeight: 560, padding: 12 }}>
          {rows.length === 0 ? (
            <div className="dim" style={{ fontSize: 12.5, padding: 12 }}>No log entries.</div>
          ) : rows.map((r, i) => (
            <div key={i} className="mono" style={{ fontSize: 12, lineHeight: 1.65, display: 'flex', gap: 11, padding: '3px 0' }}>
              <span style={{ color: 'var(--text-3)', flexShrink: 0, minWidth: 122 }}>
                {dateTimeStr(r.createdAt)}
              </span>
              <span style={{
                flexShrink: 0, minWidth: 148,
                color: r.status === 'failed' ? 'var(--red)' : r.status === 'success' ? 'var(--green)' : 'var(--accent)',
              }}>{r.source}</span>
              <span style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{r.body}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ ANALYTICS (§10) ════════════════════════ */
export function AnalyticsTab({ project }) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', project.id],
    queryFn: () => api.get(`/projects/${project.id}/analytics`),
  });
  if (isLoading) return <Loading rows={4} />;
  const d = data || {};
  const kinds = Object.entries(d.storageByKind || {});
  const totalKind = kinds.reduce((a, [, v]) => a + v, 0) || 1;
  const KIND_COLOR = { text: '#3b82f6', image: '#a855f7', video: '#f59e0b', doc: '#22c55e', archive: '#f43f5e', binary: '#64748b' };
  const maxDay = Math.max(1, ...(d.activityByDay || []).map((x) => x.count));

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g4">
        <Stat label="Files" value={project.fileCount} icon="file" />
        <Stat label="Folders" value={d.folderCount || 0} icon="folder" />
        <Stat label="Storage" value={bytes(project.storageUsed)} icon="hard-drive" />
        <Stat label="Snapshots" value={d.snapshotTrend?.length || 0} icon="camera" color="var(--green)" />
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head"><span className="card-title"><Icon name="pie-chart" size={14} /> Storage by type</span></div>
          {kinds.length === 0 ? <div className="dim" style={{ fontSize: 12.5 }}>No files yet.</div> : (
            <>
              <div style={{ display: 'flex', height: 9, borderRadius: 6, overflow: 'hidden', marginBottom: 15 }}>
                {kinds.map(([k, v]) => (
                  <div key={k} style={{ width: `${(v / totalKind) * 100}%`, background: KIND_COLOR[k] || 'var(--text-3)' }} />
                ))}
              </div>
              <div className="col" style={{ gap: 8 }}>
                {kinds.map(([k, v]) => (
                  <div className="row" key={k} style={{ fontSize: 12.5 }}>
                    <i className="dot" style={{ background: KIND_COLOR[k] || 'var(--text-3)' }} />
                    <span style={{ textTransform: 'capitalize' }}>{k}</span>
                    <div className="spacer" />
                    <span className="muted tnum">{bytes(v)}</span>
                    <span className="dim tnum" style={{ minWidth: 42, textAlign: 'right' }}>
                      {Math.round((v / totalKind) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title"><Icon name="file-code" size={14} /> Top file types</span></div>
          {!d.topExtensions?.length ? <div className="dim" style={{ fontSize: 12.5 }}>No files yet.</div> : (
            <div className="col" style={{ gap: 9 }}>
              {d.topExtensions.map((e) => (
                <div key={e.ext} className="row" style={{ fontSize: 12.5, gap: 10 }}>
                  <span className="mono" style={{ minWidth: 52 }}>.{e.ext}</span>
                  <div className="progress" style={{ flex: 1 }}>
                    <i style={{ width: `${(e.size / (d.topExtensions[0].size || 1)) * 100}%` }} />
                  </div>
                  <span className="dim tnum" style={{ minWidth: 26, textAlign: 'right' }}>{e.count}</span>
                  <span className="muted tnum" style={{ minWidth: 60, textAlign: 'right' }}>{bytes(e.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title"><Icon name="check-square" size={14} /> Tasks</span></div>
          <div className="col" style={{ gap: 13 }}>
            <div>
              <div className="dim" style={{ fontSize: 11, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>By status</div>
              <div className="col" style={{ gap: 6 }}>
                {Object.entries(d.tasksByStatus || {}).map(([k, v]) => (
                  <div className="row" key={k} style={{ fontSize: 12.5 }}>
                    <i className="dot" style={{ background: STATUS_COLOR[k] }} />
                    <span>{k}</span><div className="spacer" /><span className="tnum">{v}</span>
                  </div>
                ))}
                {!Object.keys(d.tasksByStatus || {}).length && <span className="dim" style={{ fontSize: 12.5 }}>No tasks yet.</span>}
              </div>
            </div>
            <div>
              <div className="dim" style={{ fontSize: 11, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>By priority</div>
              <div className="col" style={{ gap: 6 }}>
                {Object.entries(d.tasksByPriority || {}).map(([k, v]) => (
                  <div className="row" key={k} style={{ fontSize: 12.5 }}>
                    <i className="dot" style={{ background: PRIORITY_COLOR[k] }} />
                    <span>{k}</span><div className="spacer" /><span className="tnum">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title"><Icon name="bar-chart-3" size={14} /> Activity by day</span></div>
          {!d.activityByDay?.length ? <div className="dim" style={{ fontSize: 12.5 }}>No activity recorded.</div> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 128 }}>
              {d.activityByDay.slice(-30).map((x) => (
                <div key={x.day} title={`${x.day}: ${x.count}`}
                     style={{
                       flex: 1, minWidth: 5, height: `${(x.count / maxDay) * 100}%`,
                       background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 0.82,
                     }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {d.snapshotTrend?.length > 0 && (
        <div className="card">
          <div className="card-head"><span className="card-title"><Icon name="trending-up" size={14} /> Snapshot size over time</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 108 }}>
            {d.snapshotTrend.map((s) => {
              const max = Math.max(...d.snapshotTrend.map((x) => x.size)) || 1;
              return (
                <div key={s.at} className="col" style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: '100%', maxWidth: 42, height: `${(s.size / max) * 82}px`,
                    background: 'var(--green)', borderRadius: '4px 4px 0 0', opacity: 0.8,
                  }} title={bytes(s.size)} />
                  <span className="dim truncate" style={{ fontSize: 10, maxWidth: 62 }}>{s.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
