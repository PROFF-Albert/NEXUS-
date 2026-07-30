// PRD §28 — Activity Feed.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, dateTimeStr, timeAgo } from '../lib/api';
import { Badge, Empty, Icon, Loading, Page } from '../components/ui';

export default function ActivityPage() {
  const nav = useNavigate();
  const [filter, setFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['activity'], queryFn: () => api.get('/activity?limit=200') });

  const groups = useMemo(() => {
    const rows = (data || []).filter((a) => !filter || a.action.startsWith(filter));
    return rows.reduce((acc, e) => {
      const day = new Date(e.createdAt).toDateString();
      (acc[day] = acc[day] || []).push(e);
      return acc;
    }, {});
  }, [data, filter]);

  const kinds = useMemo(() => {
    const set = new Set((data || []).map((a) => a.action.split('.')[0]));
    return Array.from(set);
  }, [data]);

  if (isLoading) return <Page title="Activity"><Loading rows={5} /></Page>;

  return (
    <Page title="Activity" icon="activity"
          subtitle={`${data?.length || 0} recorded events across your workspace`}>
      <div className="row" style={{ gap: 7, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${!filter ? 'btn-primary' : ''}`} onClick={() => setFilter('')}>All</button>
        {kinds.map((k) => (
          <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : ''}`}
                  onClick={() => setFilter(filter === k ? '' : k)}>{k}</button>
        ))}
      </div>

      {Object.keys(groups).length === 0 ? (
        <Empty icon="activity" title="No activity yet">Everything you do in NEXUS is logged here.</Empty>
      ) : (
        <div className="card">
          {Object.entries(groups).map(([day, events]) => (
            <div key={day} style={{ marginBottom: 22 }}>
              <div className="row" style={{ gap: 9, marginBottom: 13 }}>
                <Badge>{day === new Date().toDateString() ? 'Today' : day}</Badge>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                <span className="dim" style={{ fontSize: 11 }}>{events.length}</span>
              </div>
              <div className="timeline">
                {events.map((e) => (
                  <div className="tl-item" key={e.id} style={{ paddingBottom: 15 }}>
                    <div className="tl-dot"><i /></div>
                    <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
                      <Icon name={e.icon} size={14} style={{ color: 'var(--accent)' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.3, fontWeight: 550 }}>
                          {e.action.replace(/[._]/g, ' ').replace(/^\w/, (m) => m.toUpperCase())}
                          {e.target && <span className="muted" style={{ fontWeight: 400 }}> — {e.target}</span>}
                        </div>
                        {(e.detail || e.projectName) && (
                          <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                            {e.projectName && (
                              <button className="btn btn-sm btn-ghost" style={{ padding: '0 4px', fontSize: 11.5 }}
                                      onClick={() => nav(`/projects/${e.projectId}`)}>{e.projectName}</button>
                            )}
                            {e.detail && ` ${e.detail}`}
                          </div>
                        )}
                      </div>
                      <div className="spacer" />
                      <span className="dim" style={{ fontSize: 11 }} title={dateTimeStr(e.createdAt)}>
                        {timeAgo(e.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
