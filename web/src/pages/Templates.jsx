// PRD §26 — Templates.
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Confirm, Empty, Field, Icon, Loading, Modal, Page } from '../components/ui';
import { NewProjectModal } from './Projects';

export default function Templates() {
  const qc = useQueryClient();
  const { toast } = useApp();
  const [useTemplate, setUseTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ project_id: '', name: '', description: '', include_files: true, include_tasks: true, include_docs: true });

  const { data: templates, isLoading } = useQuery({ queryKey: ['templates'], queryFn: () => api.get('/templates') });
  const { data: projects } = useQuery({ queryKey: ['projects', false, '', 'recent'], queryFn: () => api.get('/projects') });

  const create = useMutation({
    mutationFn: () => api.post('/templates/from-project', { ...form, project_id: Number(form.project_id) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      setSaving(false);
      toast('Template saved', 'Reuse it whenever you start something similar', 'success');
    },
  });

  const remove = useMutation({
    mutationFn: (id) => api.del(`/templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); toast('Template deleted'); },
  });

  const builtin = (templates || []).filter((t) => t.builtin);
  const mine = (templates || []).filter((t) => !t.builtin);

  const Card = ({ t }) => (
    <motion.div className="card hoverable" layout style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => setUseTemplate(t.id)}>
      <div className="row" style={{ gap: 11, marginBottom: 11 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, background: `color-mix(in srgb, ${t.color} 18%, transparent)`,
          border: `1px solid color-mix(in srgb, ${t.color} 32%, transparent)`,
          display: 'grid', placeItems: 'center', color: t.color, flexShrink: 0,
        }}>
          <Icon name={t.icon} size={17} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: 13.8 }}>{t.name}</div>
          <div className="dim" style={{ fontSize: 11.5 }}>
            {[t.language, t.framework].filter(Boolean).join(' · ') || t.category}
          </div>
        </div>
        {!t.builtin && (
          <button className="btn btn-sm btn-ghost btn-icon"
                  onClick={(e) => { e.stopPropagation(); setConfirmDel(t); }}>
            <Icon name="trash-2" size={13} />
          </button>
        )}
      </div>
      <p className="muted" style={{
        fontSize: 12.5, lineHeight: 1.55, flex: 1,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{t.description}</p>
      <div className="row" style={{ gap: 5, marginTop: 12, flexWrap: 'wrap' }}>
        {t.contents.files > 0 && <span className="tag">{t.contents.files} files</span>}
        {t.contents.folders > 0 && <span className="tag">{t.contents.folders} folders</span>}
        {t.contents.tasks > 0 && <span className="tag">{t.contents.tasks} tasks</span>}
        {t.contents.docs > 0 && <span className="tag">{t.contents.docs} docs</span>}
        <div className="spacer" />
        {t.uses > 0 && <span className="dim" style={{ fontSize: 11 }}>used {t.uses}×</span>}
      </div>
    </motion.div>
  );

  return (
    <Page title="Templates" icon="package"
          subtitle="Reusable project scaffolds — folders, starter files, tasks and documentation"
          actions={(
            <button className="btn btn-primary" onClick={() => setSaving(true)}>
              <Icon name="plus" size={14} /> Save project as template
            </button>
          )}>
      {isLoading ? <Loading rows={3} /> : (
        <div className="col" style={{ gap: 24 }}>
          {mine.length > 0 && (
            <div>
              <div className="row" style={{ gap: 9, marginBottom: 13 }}>
                <h2 style={{ fontSize: 14.5, fontWeight: 650 }}>Your templates</h2>
                <Badge>{mine.length}</Badge>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 14 }}>
                {mine.map((t) => <Card key={t.id} t={t} />)}
              </div>
            </div>
          )}
          <div>
            <div className="row" style={{ gap: 9, marginBottom: 13 }}>
              <h2 style={{ fontSize: 14.5, fontWeight: 650 }}>Built-in templates</h2>
              <Badge>{builtin.length}</Badge>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 14 }}>
              {builtin.map((t) => <Card key={t.id} t={t} />)}
            </div>
          </div>
        </div>
      )}

      <Modal open={saving} onClose={() => setSaving(false)} title="Save project as template" icon="package"
             footer={(
               <>
                 <button className="btn" onClick={() => setSaving(false)}>Cancel</button>
                 <button className="btn btn-primary" disabled={!form.project_id || !form.name}
                         onClick={() => create.mutate()}>Save template</button>
               </>
             )}>
        <Field label="Source project">
          <select className="select" value={form.project_id}
                  onChange={(e) => {
                    const p = (projects || []).find((x) => String(x.id) === e.target.value);
                    setForm((f) => ({ ...f, project_id: e.target.value, name: f.name || (p ? `${p.name} template` : '') }));
                  }}>
            <option value="">— choose —</option>
            {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Template name">
          <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Description">
          <textarea className="textarea" style={{ minHeight: 62 }} value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field label="Include">
          <div className="col" style={{ gap: 8 }}>
            {[['include_files', 'Files & folder structure (text files up to 256 KB)'],
              ['include_tasks', 'Tasks (reset to Todo)'],
              ['include_docs', 'Documentation']].map(([k, label]) => (
              <label key={k} className="row" style={{ gap: 9, fontSize: 12.8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form[k]} style={{ accentColor: 'var(--accent)' }}
                       onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
        </Field>
      </Modal>

      <NewProjectModal open={!!useTemplate} onClose={() => setUseTemplate(null)} defaultTemplate={useTemplate} />

      <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)}
               title={`Delete ${confirmDel?.name}?`}
               message="Projects already created from this template are unaffected."
               onConfirm={() => remove.mutate(confirmDel.id)} />
    </Page>
  );
}
