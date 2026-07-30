// PRD §7 — Calendar: deadlines, reminders and snapshot history.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, dateStr, PRIORITY_COLOR } from '../lib/api';
import { Badge, Empty, Icon, Loading, Page } from '../components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const nav = useNavigate();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDay, setSelectedDay] = useState(null);

  const { data: events, isLoading } = useQuery({ queryKey: ['calendar'], queryFn: () => api.get('/calendar') });

  const byDay = useMemo(() => {
    const map = {};
    (events || []).forEach((e) => {
      const key = new Date(e.date).toDateString();
      (map[key] = map[key] || []).push(e);
    });
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;         // Monday-first
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const list = [];
    for (let i = 0; i < startOffset; i += 1) list.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) list.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [cursor]);

  const shift = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const today = new Date().toDateString();
  const selectedEvents = selectedDay ? (byDay[selectedDay] || []) : [];

  if (isLoading) return <Page title="Calendar"><Loading rows={4} /></Page>;

  const upcoming = (events || [])
    .filter((e) => e.type === 'task' && new Date(e.date) >= new Date() && e.status !== 'Done')
    .sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 8);

  return (
    <Page title="Calendar" icon="calendar"
          subtitle="Task deadlines and snapshot history across your workspace"
          actions={(
            <div className="row" style={{ gap: 7 }}>
              <button className="btn btn-sm btn-icon" onClick={() => shift(-1)}><Icon name="chevron-left" size={15} /></button>
              <span style={{ minWidth: 150, textAlign: 'center', fontWeight: 600, fontSize: 13.5 }}>
                {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </span>
              <button className="btn btn-sm btn-icon" onClick={() => shift(1)}><Icon name="chevron-right" size={15} /></button>
              <button className="btn btn-sm" onClick={() => setCursor(() => { const d = new Date(); d.setDate(1); return d; })}>
                Today
              </button>
            </div>
          )}>
      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px', alignItems: 'start' }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 9 }}>
            {DAYS.map((d) => (
              <div key={d} className="dim" style={{
                fontSize: 10.5, textAlign: 'center', textTransform: 'uppercase',
                letterSpacing: '0.08em', fontWeight: 650,
              }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const key = d.toDateString();
              const evts = byDay[key] || [];
              const isToday = key === today;
              const isSelected = key === selectedDay;
              return (
                <button key={i} onClick={() => setSelectedDay(isSelected ? null : key)}
                        style={{
                          minHeight: 84, padding: 7, borderRadius: 'var(--radius-sm)', textAlign: 'left',
                          background: isSelected ? 'var(--accent-soft)' : evts.length ? 'var(--surface)' : 'transparent',
                          border: `1px solid ${isToday ? 'var(--accent)' : isSelected ? 'var(--accent-line)' : 'var(--line)'}`,
                          display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden',
                        }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--accent)' : 'var(--text-2)',
                  }}>{d.getDate()}</span>
                  {evts.slice(0, 3).map((e, j) => (
                    <span key={j} className="truncate" style={{
                      fontSize: 9.5, padding: '1px 4px', borderRadius: 4, width: '100%',
                      background: e.type === 'snapshot' ? 'color-mix(in srgb, var(--green) 18%, transparent)'
                        : `color-mix(in srgb, ${PRIORITY_COLOR[e.priority] || 'var(--accent)'} 18%, transparent)`,
                      color: e.type === 'snapshot' ? 'var(--green)' : PRIORITY_COLOR[e.priority] || 'var(--accent)',
                    }}>{e.title}</span>
                  ))}
                  {evts.length > 3 && <span className="dim" style={{ fontSize: 9.5 }}>+{evts.length - 3} more</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="col" style={{ gap: 14 }}>
          {selectedDay && (
            <div className="card">
              <div className="card-head">
                <span className="card-title"><Icon name="calendar-days" size={14} /> {dateStr(selectedDay)}</span>
                <div className="spacer" />
                <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setSelectedDay(null)}>
                  <Icon name="x" size={13} />
                </button>
              </div>
              {selectedEvents.length === 0 ? (
                <div className="dim" style={{ fontSize: 12.5 }}>Nothing scheduled.</div>
              ) : (
                <div className="col" style={{ gap: 3 }}>
                  {selectedEvents.map((e, i) => (
                    <div key={i} className="list-item"
                         onClick={() => nav(`/projects/${e.projectId}?tab=${e.type === 'snapshot' ? 'versions' : 'tasks'}`)}>
                      <div className="list-icon" style={{ color: e.type === 'snapshot' ? 'var(--green)' : PRIORITY_COLOR[e.priority] }}>
                        <Icon name={e.type === 'snapshot' ? 'camera' : 'check-square'} size={13} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="truncate" style={{ fontSize: 12.8 }}>{e.title}</div>
                        <div className="dim truncate" style={{ fontSize: 11 }}>{e.projectName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="alarm-clock" size={14} /> Upcoming deadlines</span></div>
            {upcoming.length === 0 ? (
              <div className="dim" style={{ fontSize: 12.5 }}>No upcoming deadlines.</div>
            ) : (
              <div className="col" style={{ gap: 3 }}>
                {upcoming.map((e) => (
                  <div key={e.id} className="list-item" onClick={() => nav(`/projects/${e.projectId}?tab=tasks`)}>
                    <i className="dot" style={{ background: PRIORITY_COLOR[e.priority] }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 12.8 }}>{e.title}</div>
                      <div className="dim truncate" style={{ fontSize: 11 }}>{e.projectName}</div>
                    </div>
                    <span className="badge">{dateStr(e.date, { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="info" size={14} /> Legend</span></div>
            <div className="col" style={{ gap: 8, fontSize: 12.3 }}>
              <div className="row"><i className="dot" style={{ background: 'var(--green)' }} /> Snapshot taken</div>
              {Object.entries(PRIORITY_COLOR).map(([k, v]) => (
                <div className="row" key={k}><i className="dot" style={{ background: v }} /> {k} priority task</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
