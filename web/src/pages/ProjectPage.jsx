// PRD §10 — Project Page with all sixteen sections.
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, bytes, dateStr } from '../lib/api';
import { useApp } from '../lib/store';
import {
  Confirm, Dropdown, Field, Icon, Loading, MenuItem, Modal, Page, StatusBadge, Tabs,
} from '../components/ui';
import FilesTab from './project/FilesTab';
import {
  AnalyticsTab, LogsTab, MediaTab, NotesTab, OverviewTab, TasksTab, TimelineTab, VersionsTab,
} from './project/tabs';
import { ApiTab, DatabaseTab, DeploymentsTab, SecretsTab } from './project/integrations';

export default function ProjectPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast, meta } = useApp();
  const [tab, setTab] = useState(params.get('tab') || 'overview');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({});

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`),
  });

  useEffect(() => {
    if (project) document.title = `${project.name} — NEXUS`;
    return () => { document.title = 'NEXUS'; };
  }, [project]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project', id] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const update = useMutation({
    mutationFn: (body) => api.patch(`/projects/${id}`, body),
    onSuccess: () => { invalidate(); setEditing(false); toast('Project updated'); },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast('Project deleted');
      nav('/projects');
    },
  });

  const snapshot = useMutation({
    mutationFn: () => api.post(`/projects/${id}/snapshots`, { name: '', description: 'Quick snapshot' }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['snapshots', Number(id)] });
      invalidate();
      toast('Snapshot complete', `${s.name} · ${bytes(s.size)}`, 'success');
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: (name) => api.post('/templates/from-project', { project_id: Number(id), name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); toast('Saved as template'); },
  });

  // ⌘⇧S — snapshot current project
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        snapshot.mutate();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [snapshot]);

  if (isLoading) return <Page title="Loading…"><Loading rows={5} /></Page>;
  if (error) {
    return (
      <Page title="Project not found" subtitle="It may have been deleted."
            actions={<button className="btn" onClick={() => nav('/projects')}>Back to projects</button>} />
    );
  }

  const c = project.counts || {};
  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'files', label: 'Files', icon: 'folder', count: project.fileCount },
    { id: 'versions', label: 'Versions', icon: 'camera', count: c.snapshots },
    { id: 'timeline', label: 'Timeline', icon: 'git-commit' },
    { id: 'notes', label: 'Notes', icon: 'sticky-note', count: c.notes },
    { id: 'tasks', label: 'Tasks', icon: 'check-square', count: project.taskTotal },
    { id: 'images', label: 'Images', icon: 'image', count: c.images },
    { id: 'videos', label: 'Videos', icon: 'video', count: c.videos },
    { id: 'docs', label: 'Documentation', icon: 'book', count: c.docs },
    { id: 'secrets', label: 'Secrets', icon: 'key', count: c.secrets },
    { id: 'database', label: 'Database', icon: 'database', count: c.databases },
    { id: 'api', label: 'API', icon: 'git-branch', count: c.apis },
    { id: 'deployments', label: 'Deployments', icon: 'cloud', count: c.deployments },
    { id: 'logs', label: 'Logs', icon: 'terminal' },
    { id: 'analytics', label: 'Analytics', icon: 'bar-chart-3' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const openEdit = () => {
    setForm({
      name: project.name, description: project.description, category: project.category,
      framework: project.framework, language: project.language, status: project.status,
      color: project.color, icon: project.icon, tags: project.tags || [],
      collection: project.collection,
    });
    setEditing(true);
  };

  return (
    <Page
      title={(
        <span className="row" style={{ gap: 11, display: 'inline-flex' }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10, background: project.color,
            display: 'grid', placeItems: 'center', color: '#fff',
          }}>
            <Icon name={project.icon} size={16} />
          </span>
          {project.name}
        </span>
      )}
      subtitle={(
        <span className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
          <StatusBadge status={project.status} />
          <span>{[project.language, project.framework].filter(Boolean).join(' · ') || project.category}</span>
          <span>·</span>
          <span>{bytes(project.storageUsed)}</span>
          <span>·</span>
          <span>created {dateStr(project.createdAt)}</span>
        </span>
      )}
      actions={(
        <>
          <button className="btn btn-sm" onClick={() => nav(`/assistant?project=${project.id}`)}>
            <Icon name="sparkles" size={13} /> AI
          </button>
          <button className="btn btn-sm" onClick={() => snapshot.mutate()} disabled={snapshot.isPending}
                  title="Take snapshot (⌘⇧S)">
            {snapshot.isPending ? <span className="spinner" /> : <Icon name="camera" size={13} />} Snapshot
          </button>
          <Dropdown trigger={<button className="btn btn-sm btn-icon"><Icon name="more-horizontal" size={15} /></button>}>
            <MenuItem icon="pencil" onClick={openEdit}>Edit project</MenuItem>
            <MenuItem icon={project.favorite ? 'star-off' : 'star'}
                      onClick={() => update.mutate({ favorite: !project.favorite })}>
              {project.favorite ? 'Remove favorite' : 'Add to favorites'}
            </MenuItem>
            <MenuItem icon="pin" onClick={() => update.mutate({ pinned: !project.pinned })}>
              {project.pinned ? 'Unpin' : 'Pin to workspace'}
            </MenuItem>
            <MenuItem icon="download"
                      onClick={() => api.download(`/projects/${project.id}/export`, `${project.name}.zip`)}>
              Export as ZIP
            </MenuItem>
            <MenuItem icon="package" onClick={() => {
              const name = window.prompt('Template name', `${project.name} template`);
              if (name) saveAsTemplate.mutate(name);
            }}>Save as template</MenuItem>
            <MenuItem icon="archive" onClick={() => update.mutate({ archived: !project.archived })}>
              {project.archived ? 'Unarchive' : 'Archive project'}
            </MenuItem>
            <MenuItem icon="trash-2" danger onClick={() => setConfirmDelete(true)}>Delete project</MenuItem>
          </Dropdown>
        </>
      )}
    >
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab project={project} onTab={setTab} />}
      {tab === 'files' && <FilesTab project={project} initialFileId={params.get('file')} />}
      {tab === 'versions' && <VersionsTab project={project} />}
      {tab === 'timeline' && <TimelineTab project={project} />}
      {tab === 'notes' && <NotesTab project={project} docType="note" />}
      {tab === 'tasks' && <TasksTab project={project} />}
      {tab === 'images' && <MediaTab project={project} kind="image" />}
      {tab === 'videos' && <MediaTab project={project} kind="video" />}
      {tab === 'docs' && <NotesTab project={project} docType="doc" />}
      {tab === 'secrets' && <SecretsTab project={project} />}
      {tab === 'database' && <DatabaseTab project={project} />}
      {tab === 'api' && <ApiTab project={project} />}
      {tab === 'deployments' && <DeploymentsTab project={project} />}
      {tab === 'logs' && <LogsTab project={project} />}
      {tab === 'analytics' && <AnalyticsTab project={project} />}
      {tab === 'settings' && (
        <div className="col" style={{ gap: 16, maxWidth: 720 }}>
          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="settings" size={14} /> Project settings</span></div>
            <div className="col" style={{ gap: 13 }}>
              <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={openEdit}>
                <Icon name="pencil" size={14} /> Edit name, description, stack and appearance
              </button>
              <button className="btn" style={{ justifyContent: 'flex-start' }}
                      onClick={() => api.download(`/projects/${project.id}/export`, `${project.name}.zip`)}>
                <Icon name="download" size={14} /> Export all files as ZIP
              </button>
              <button className="btn" style={{ justifyContent: 'flex-start' }}
                      onClick={() => {
                        const name = window.prompt('Template name', `${project.name} template`);
                        if (name) saveAsTemplate.mutate(name);
                      }}>
                <Icon name="package" size={14} /> Save this project as a reusable template
              </button>
              <button className="btn" style={{ justifyContent: 'flex-start' }}
                      onClick={() => update.mutate({ archived: !project.archived })}>
                <Icon name="archive" size={14} /> {project.archived ? 'Unarchive project' : 'Archive project'}
              </button>
            </div>
          </div>
          <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--red) 24%, var(--line))' }}>
            <div className="card-head">
              <span className="card-title" style={{ color: 'var(--red)' }}>
                <Icon name="alert-triangle" size={14} /> Danger zone
              </span>
            </div>
            <p className="muted" style={{ fontSize: 12.8, marginBottom: 13 }}>
              Deleting removes every file, note, task, snapshot, secret and deployment record
              belonging to this project. Export a ZIP or take a snapshot first.
            </p>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash-2" size={14} /> Delete this project
            </button>
          </div>
        </div>
      )}

      {/* edit modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit project" icon="pencil" size="modal-lg"
             footer={(
               <>
                 <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                 <button className="btn btn-primary" onClick={() => update.mutate(form)}>Save changes</button>
               </>
             )}>
        <div className="grid g2" style={{ gap: 13 }}>
          <Field label="Name">
            <input className="input" value={form.name || ''}
                   onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Collection">
            <input className="input" value={form.collection || ''}
                   onChange={(e) => setForm((f) => ({ ...f, collection: e.target.value }))} />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="textarea" value={form.description || ''}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="grid g3" style={{ gap: 13 }}>
          <Field label="Status">
            <select className="select" value={form.status || ''}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {(meta?.projectStatuses || []).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Language">
            <select className="select" value={form.language || ''}
                    onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
              <option value="">—</option>
              {(meta?.languages || []).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Framework">
            <select className="select" value={form.framework || ''}
                    onChange={(e) => setForm((f) => ({ ...f, framework: e.target.value }))}>
              <option value="">—</option>
              {(meta?.frameworks || []).filter(Boolean).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Icon & colour">
          <div className="col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(meta?.icons || []).map((ic) => (
                <button key={ic} type="button" className="btn btn-icon"
                        style={form.icon === ic ? { borderColor: form.color, color: form.color } : undefined}
                        onClick={() => setForm((f) => ({ ...f, icon: ic }))}>
                  <Icon name={ic} size={15} />
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(meta?.colors || []).map((col) => (
                <button key={col} type="button" onClick={() => setForm((f) => ({ ...f, color: col }))}
                        style={{
                          width: 26, height: 26, borderRadius: 8, background: col,
                          border: form.color === col ? '2px solid var(--text)' : '2px solid transparent',
                        }} />
              ))}
            </div>
          </div>
        </Field>
      </Modal>

      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)}
               title={`Delete ${project.name}?`} confirmLabel="Delete permanently"
               message="Every file, note, task, snapshot, secret and deployment for this project will be permanently removed. This cannot be undone."
               onConfirm={() => remove.mutate()} />
    </Page>
  );
}
