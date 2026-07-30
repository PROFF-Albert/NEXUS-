// PRD §17 — global task board across all projects.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, dateStr, PRIORITY_COLOR, STATUS_COLOR } from '../lib/api';
import {
  Empty, Icon, Loading, Page, PriorityBadge, Progress, Segmented, Stat, StatusBadge,
} from '../components/ui';

const STATUSES = ['Todo', 'In Progress', 'Blocked', 'Testing', 'Done'];

export default function TasksPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState('board');
  const [filter, setFilter] = useState('all');
  const [dragOver, setDragOver] = useState(null);

  const { data: tasks, isLoading } = useQuery({ queryKey: ['all-tasks'], queryFn: () => api.get('/tasks') });

  const move = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] });
      qc.invalidateQueries({ queryKey: ['nav-counts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const rows = useMemo(() => {
    let list = tasks || [];
    const now = new Date();
    if (filter === 'overdue') list = list.filter((t) => t.status !== 'Done' && t.deadline && new Date(t.deadline) < now);
    if (filter === 'week') {
      const wk = new Date(now.getTime() + 7 * 864e5);
      list = list.filter((t) => t.status !== 'Done' && t.deadline && new Date(t.deadline) <= wk);
    }
    if (filter === 'critical') list = list.filter((t) => t.priority === 'Critical' && t.status !== 'Done');
    return list;
  }, [tasks, filter]);

  const stats = useMemo(() => {
    const t = tasks || [];
    const now = new Date();
    return {
      open: t.filter((x) => x.status !== 'Done').length,
      overdue: t.filter((x) => x.status !== 'Done' && x.deadline && new Date(x.deadline) < now).length,
      critical: t.filter((x) => x.priority === 'Critical' && x.status !== 'Done').length,
      done: t.filter((x) => x.status === 'Done').length,
    };
  }, [tasks]);

  if (isLoading) return <Page title="Tasks"><Loading rows={4} /></Page>;

  return (
    <Page title="Tasks" icon="check-square"
          subtitle={`${stats.open} open across every project`}
          actions={(
            <>
              <Segmented value={filter} onChange={setFilter}
                         options={[{ value: 'all', label: 'All' }, { value: 'week', label: 'This week' },
                                   { value: 'overdue', label: 'Overdue' }, { value: 'critical', label: 'Critical' }]} />
              <Segmented value={view} onChange={setView}
                         options={[{ value: 'board', label: '', icon: 'columns' },
                                   { value: 'list', label: '', icon: 'list' }]} />
            </>
          )}>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <Stat label="Open" value={stats.open} icon="circle" />
        <Stat label="Overdue" value={stats.overdue} icon="alert-triangle"
              color={stats.overdue ? 'var(--red)' : undefined} />
        <Stat label="Critical" value={stats.critical} icon="flame"
              color={stats.critical ? 'var(--amber)' : undefined} />
        <Stat label="Completed" value={stats.done} icon="check-circle" color="var(--green)" />
      </div>

      {rows.length === 0 ? (
        <Empty icon="check-circle" title="Nothing here">
          {filter === 'all' ? 'Create tasks inside a project to track your work.' : 'No tasks match this filter.'}
        </Empty>
      ) : view === 'board' ? (
        <div className="kanban">
          {STATUSES.map((st) => {
            const items = rows.filter((t) => t.status === st);
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
                  {st}<span className="badge">{items.length}</span>
                </div>
                {items.map((t) => (
                  <div key={t.id} className="task-card" draggable
                       onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                       onClick={() => nav(`/projects/${t.projectId}?tab=tasks`)}>
                    <div className="row" style={{ gap: 7, marginBottom: 6, alignItems: 'flex-start' }}>
                      <span style={{ flex: 1, fontSize: 12.8, lineHeight: 1.45 }}>{t.name}</span>
                      <i className="dot" style={{ background: PRIORITY_COLOR[t.priority], marginTop: 5 }} />
                    </div>
                    <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                      <span className="tag" style={{ fontSize: 10 }}>{t.projectName}</span>
                      {t.deadline && (
                        <span className="tag" style={{
                          fontSize: 10,
                          color: new Date(t.deadline) < new Date() && t.status !== 'Done' ? 'var(--red)' : undefined,
                        }}>{dateStr(t.deadline, { day: 'numeric', month: 'short' })}</span>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="dim" style={{ fontSize: 11.5, textAlign: 'center', padding: 16 }}>—</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th style={{ width: 34 }} /><th>Task</th><th>Project</th><th>Status</th><th>Priority</th><th>Deadline</th><th>Progress</th></tr></thead>
            <tbody>
              {rows.map((t) => {
                const overdue = t.status !== 'Done' && t.deadline && new Date(t.deadline) < new Date();
                return (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/projects/${t.projectId}?tab=tasks`)}>
                    <td onClick={(e) => { e.stopPropagation(); move.mutate({ id: t.id, status: t.status === 'Done' ? 'Todo' : 'Done' }); }}>
                      <Icon name={t.status === 'Done' ? 'check-circle' : 'circle'} size={16}
                            style={{ color: t.status === 'Done' ? 'var(--green)' : 'var(--text-3)' }} />
                    </td>
                    <td style={{ textDecoration: t.status === 'Done' ? 'line-through' : 'none', opacity: t.status === 'Done' ? 0.6 : 1 }}>
                      {t.name}
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{t.projectName}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td style={{ fontSize: 12.5, color: overdue ? 'var(--red)' : 'var(--text-3)' }}>
                      {t.deadline ? dateStr(t.deadline) : '—'}
                    </td>
                    <td style={{ width: 110 }}><Progress value={t.progress} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
