// PRD §8 — Dashboard.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api, bytes, dateStr, timeAgo } from '../lib/api';
import { useApp } from '../lib/store';
import { Icon, Loading, Page, Progress, Stat, StatusBadge } from '../components/ui';
import ProjectCard from '../components/ProjectCard';

function Heatmap({ data }) {
  const byDay = Object.fromEntries((data || []).map((d) => [d.day, d.count]));
  const days = [];
  const today = new Date();
  for (let i = 90; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, count: byDay[key] || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="heat">
      {days.map((d) => {
        const level = d.count === 0 ? 0 : Math.ceil((d.count / max) * 4);
        return (
          <i key={d.key}
             title={`${d.key} · ${d.count} action${d.count === 1 ? '' : 's'}`}
             style={{
               background: level === 0 ? 'var(--surface)'
                 : `color-mix(in srgb, var(--accent) ${level * 24}%, var(--surface))`,
             }} />
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { user } = useApp();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard') });

  if (isLoading) {
    return <Page title="Dashboard"><Loading rows={5} /></Page>;
  }

  const d = data || {};
  const s = d.stats || {};
  const st = d.storage || {};
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const cont = d.continueWorking;

  return (
    <Page
      title={`${greeting}, ${(user?.name || '').split(' ')[0]}`}
      subtitle={`${s.activeProjects || 0} active projects · ${s.openTasks || 0} open tasks · dashboard rendered in ${d.generatedInMs} ms`}
      actions={(
        <>
          <button className="btn" onClick={() => nav('/templates')}>
            <Icon name="package" size={14} /> Templates
          </button>
          <button className="btn btn-primary" onClick={() => nav('/projects?new=1')}>
            <Icon name="plus" size={14} /> New project
          </button>
        </>
      )}
    >
      {/* Developer stats */}
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <Stat label="Projects" value={s.projects || 0} icon="folder"
              foot={`${s.activeProjects || 0} active`} />
        <Stat label="Files stored" value={s.files || 0} icon="file"
              foot={bytes(st.logical || 0)} />
        <Stat label="Snapshots" value={s.snapshots || 0} icon="camera" color="var(--green)"
              foot={`${bytes(st.snapshots || 0)} archived`} />
        <Stat label="Open tasks" value={s.openTasks || 0} icon="check-square"
              color={s.openTasks > 10 ? 'var(--amber)' : undefined}
              foot={`${s.tasksDoneWeek || 0} done this week`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2.1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          {/* Continue working */}
          {cont && (
            <motion.div className="card hoverable" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
                        whileHover={{ y: -2 }} onClick={() => nav(`/projects/${cont.id}`)}>
              <div style={{ display: 'flex', gap: 0 }}>
                <div style={{
                  width: 7, flexShrink: 0,
                  background: `linear-gradient(180deg, ${cont.color}, color-mix(in srgb, ${cont.color} 30%, transparent))`,
                }} />
                <div style={{ padding: 18, flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <span className="badge" style={{ color: 'var(--accent)' }}>
                      <Icon name="play" size={10} /> Continue working
                    </span>
                    <div className="spacer" />
                    <span className="dim" style={{ fontSize: 11.5 }}>opened {timeAgo(cont.lastOpened)}</span>
                  </div>
                  <div className="row" style={{ gap: 13, alignItems: 'flex-start' }}>
                    <div className="project-icon" style={{ background: cont.color, borderColor: 'transparent' }}>
                      <Icon name={cont.icon} size={19} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row" style={{ gap: 9 }}>
                        <h3 style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-0.02em' }}>{cont.name}</h3>
                        <StatusBadge status={cont.status} />
                      </div>
                      <p className="muted truncate" style={{ fontSize: 13, marginTop: 4 }}>{cont.description}</p>
                      <div className="row" style={{ gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                        <span className="dim" style={{ fontSize: 11.5 }}>
                          <Icon name="file" size={11} style={{ verticalAlign: -1 }} /> {cont.fileCount} files
                        </span>
                        <span className="dim" style={{ fontSize: 11.5 }}>
                          <Icon name="hard-drive" size={11} style={{ verticalAlign: -1 }} /> {bytes(cont.storageUsed)}
                        </span>
                        {cont.latestSnapshot && (
                          <span className="dim" style={{ fontSize: 11.5 }}>
                            <Icon name="camera" size={11} style={{ verticalAlign: -1 }} /> {cont.latestSnapshot.name}
                          </span>
                        )}
                        {cont.liveUrl && (
                          <span style={{ fontSize: 11.5, color: 'var(--green)' }}>
                            <Icon name="globe" size={11} style={{ verticalAlign: -1 }} /> live
                          </span>
                        )}
                      </div>
                      {cont.taskTotal > 0 && (
                        <div className="row" style={{ gap: 10, marginTop: 12 }}>
                          <Progress value={cont.taskProgress} color={cont.color} />
                          <span className="dim tnum" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                            {cont.taskDone}/{cont.taskTotal}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Recent projects */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="clock" size={14} /> Recent projects</span>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => nav('/projects')}>
                View all <Icon name="arrow-right" size={12} />
              </button>
            </div>
            {d.recentProjects?.length ? (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 13 }}>
                {d.recentProjects.slice(0, 6).map((p) => <ProjectCard key={p.id} project={p} compact />)}
              </div>
            ) : (
              <div className="dim" style={{ fontSize: 13, padding: 16, textAlign: 'center' }}>
                No projects yet — create your first one.
              </div>
            )}
          </div>

          {/* Activity + heatmap */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="activity" size={14} /> Activity timeline</span>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => nav('/activity')}>All activity</button>
            </div>
            <div style={{ overflowX: 'auto', paddingBottom: 12, marginBottom: 6 }}>
              <Heatmap data={d.heatmap} />
            </div>
            <div className="timeline" style={{ marginTop: 14 }}>
              {(d.activity || []).slice(0, 7).map((a) => (
                <div className="tl-item" key={a.id} style={{ paddingBottom: 14 }}>
                  <div className="tl-dot"><i /></div>
                  <div className="row" style={{ gap: 8 }}>
                    <Icon name={a.icon} size={13} style={{ color: 'var(--text-3)' }} />
                    <span style={{ fontSize: 13 }}>
                      <strong style={{ fontWeight: 550 }}>{a.action.replace(/[._]/g, ' ')}</strong>
                      <span className="muted"> · {a.target}</span>
                    </span>
                    <div className="spacer" />
                    <span className="dim" style={{ fontSize: 11 }}>{timeAgo(a.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div className="col" style={{ gap: 16 }}>
          {/* storage */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="hard-drive" size={14} /> Storage</span>
              <div className="spacer" />
              <span className="dim tnum" style={{ fontSize: 11.5 }}>{st.percent}%</span>
            </div>
            <Progress value={st.percent || 0}
                      color={st.percent > 85 ? 'var(--red)' : st.percent > 65 ? 'var(--amber)' : 'var(--green)'} />
            <div className="row" style={{ marginTop: 11, fontSize: 12 }}>
              <span className="muted">{bytes(st.physical || 0)} used</span>
              <div className="spacer" />
              <span className="dim">of {bytes(st.quota || 0)}</span>
            </div>
            {st.saved > 0 && (
              <div className="row" style={{ marginTop: 9, gap: 6, fontSize: 11.5, color: 'var(--green)' }}>
                <Icon name="zap" size={12} /> {bytes(st.saved)} saved by deduplication
              </div>
            )}
            <button className="btn btn-sm" style={{ width: '100%', marginTop: 12 }} onClick={() => nav('/storage')}>
              Storage analytics
            </button>
          </div>

          {/* tasks due */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="alarm-clock" size={14} /> Tasks due</span>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => nav('/tasks')}>Board</button>
            </div>
            {d.tasksDue?.length ? (
              <div className="col" style={{ gap: 3 }}>
                {d.tasksDue.slice(0, 6).map((t) => {
                  const overdue = new Date(t.deadline) < new Date();
                  return (
                    <div className="list-item" key={t.id} onClick={() => nav(`/projects/${t.projectId}?tab=tasks`)}>
                      <div className="list-icon" style={{ color: overdue ? 'var(--red)' : 'var(--text-3)' }}>
                        <Icon name={overdue ? 'alert-triangle' : 'circle'} size={13} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="truncate" style={{ fontSize: 12.8 }}>{t.name}</div>
                        <div className="dim truncate" style={{ fontSize: 11 }}>{t.projectName}</div>
                      </div>
                      <span className="badge" style={overdue ? { color: 'var(--red)' } : undefined}>
                        {dateStr(t.deadline, { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : <div className="dim" style={{ fontSize: 12.5, padding: 10 }}>Nothing due this week 🎉</div>}
          </div>

          {/* latest snapshots */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="camera" size={14} /> Latest snapshots</span>
            </div>
            {d.latestSnapshots?.length ? (
              <div className="col" style={{ gap: 3 }}>
                {d.latestSnapshots.map((sn) => (
                  <div className="list-item" key={sn.id} onClick={() => nav(`/projects/${sn.projectId}?tab=versions`)}>
                    <div className="list-icon" style={{ color: 'var(--green)' }}><Icon name="camera" size={13} /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 12.8 }}>{sn.name}</div>
                      <div className="dim truncate" style={{ fontSize: 11 }}>{sn.projectName}</div>
                    </div>
                    <span className="dim" style={{ fontSize: 11 }}>{bytes(sn.size)}</span>
                  </div>
                ))}
              </div>
            ) : <div className="dim" style={{ fontSize: 12.5, padding: 10 }}>No snapshots yet</div>}
          </div>

          {/* pinned */}
          {d.pinnedProjects?.length > 0 && (
            <div className="card">
              <div className="card-head"><span className="card-title"><Icon name="pin" size={14} /> Pinned</span></div>
              <div className="col" style={{ gap: 3 }}>
                {d.pinnedProjects.map((p) => (
                  <div className="list-item" key={p.id} onClick={() => nav(`/projects/${p.id}`)}>
                    <div className="list-icon" style={{ background: p.color, color: '#fff', borderColor: 'transparent' }}>
                      <Icon name={p.icon} size={13} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 12.8 }}>{p.name}</div>
                      <div className="dim" style={{ fontSize: 11 }}>{p.status}</div>
                    </div>
                    <Icon name="chevron-right" size={13} style={{ color: 'var(--text-3)' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* quick notes */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="sticky-note" size={14} /> Quick notes</span>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => nav('/notes')}>Open</button>
            </div>
            {d.quickNotes?.length ? (
              <div className="col" style={{ gap: 9 }}>
                {d.quickNotes.map((n) => (
                  <div key={n.id} style={{
                    padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line)', cursor: 'pointer',
                  }} onClick={() => nav('/notes')}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>{n.title}</div>
                    <div className="dim" style={{
                      fontSize: 11.5, lineHeight: 1.5, display: '-webkit-box',
                      WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{n.body}</div>
                  </div>
                ))}
              </div>
            ) : <div className="dim" style={{ fontSize: 12.5, padding: 10 }}>Pin a note to see it here</div>}
          </div>

          {/* recent files */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><Icon name="file" size={14} /> Recent files</span>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => nav('/files')}>All</button>
            </div>
            <div className="col" style={{ gap: 3 }}>
              {(d.recentFiles || []).slice(0, 6).map((f) => (
                <div className="list-item" key={f.id}
                     onClick={() => nav(`/projects/${f.projectId}?tab=files&file=${f.id}`)}>
                  <div className="list-icon"><Icon name="file-code" size={13} /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="truncate" style={{ fontSize: 12.8 }}>{f.name}</div>
                    <div className="dim truncate" style={{ fontSize: 11 }}>{f.projectName}</div>
                  </div>
                  <span className="dim" style={{ fontSize: 11 }}>{bytes(f.size)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
