// PRD §34 — Storage analytics, compression and duplicate detection.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, bytes } from '../lib/api';
import { Icon, Loading, Page, Progress, Stat } from '../components/ui';

const KIND_COLOR = {
  text: '#3b82f6', image: '#a855f7', video: '#f59e0b',
  doc: '#22c55e', archive: '#f43f5e', binary: '#64748b',
};

export default function StoragePage() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['storage'], queryFn: () => api.get('/storage') });

  if (isLoading) return <Page title="Storage"><Loading rows={4} /></Page>;
  const d = data || {};
  const kinds = Object.entries(d.byKind || {});
  const totalKind = kinds.reduce((a, [, v]) => a + v, 0) || 1;
  const maxProject = Math.max(1, ...(d.byProject || []).map((p) => p.size));
  const ratio = d.logical ? ((d.saved / d.logical) * 100).toFixed(1) : 0;

  return (
    <Page title="Storage" icon="hard-drive"
          subtitle="Content-addressed storage with automatic deduplication">
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <Stat label="On disk" value={bytes(d.physical || 0)} icon="hard-drive"
              foot={`${d.percent}% of ${bytes(d.quota || 0)}`} />
        <Stat label="Logical size" value={bytes(d.logical || 0)} icon="layers"
              foot="sum of all file sizes" />
        <Stat label="Saved by dedup" value={bytes(d.saved || 0)} icon="zap" color="var(--green)"
              foot={`${ratio}% reduction`} />
        <Stat label="Snapshots" value={bytes(d.snapshots || 0)} icon="camera"
              foot="restore archives" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <span className="card-title"><Icon name="gauge" size={14} /> Quota</span>
          <div className="spacer" />
          <span className="dim tnum" style={{ fontSize: 12 }}>
            {bytes(d.physical || 0)} / {bytes(d.quota || 0)}
          </span>
        </div>
        <Progress value={d.percent || 0}
                  color={d.percent > 85 ? 'var(--red)' : d.percent > 65 ? 'var(--amber)' : 'var(--green)'} />
        {d.percent > 85 && (
          <div className="row" style={{ gap: 8, marginTop: 11, fontSize: 12.3, color: 'var(--red)' }}>
            <Icon name="alert-triangle" size={14} /> Storage almost full — empty recycle bins or prune old snapshots.
          </div>
        )}
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head"><span className="card-title"><Icon name="folder" size={14} /> By project</span></div>
          {!d.byProject?.length ? <div className="dim" style={{ fontSize: 12.5 }}>No files stored yet.</div> : (
            <div className="col" style={{ gap: 11 }}>
              {d.byProject.map((p) => (
                <div key={p.name} className="col" style={{ gap: 5, cursor: 'pointer' }}>
                  <div className="row" style={{ fontSize: 12.5 }}>
                    <i className="dot" style={{ background: p.color }} />
                    <span className="truncate" style={{ flex: 1 }}>{p.name}</span>
                    <span className="dim tnum">{p.files} files</span>
                    <span className="muted tnum" style={{ minWidth: 66, textAlign: 'right' }}>{bytes(p.size)}</span>
                  </div>
                  <div className="progress"><i style={{ width: `${(p.size / maxProject) * 100}%`, background: p.color }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title"><Icon name="pie-chart" size={14} /> By file type</span></div>
          {kinds.length === 0 ? <div className="dim" style={{ fontSize: 12.5 }}>No files stored yet.</div> : (
            <>
              <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 15 }}>
                {kinds.map(([k, v]) => (
                  <div key={k} style={{ width: `${(v / totalKind) * 100}%`, background: KIND_COLOR[k] || 'var(--text-3)' }}
                       title={`${k}: ${bytes(v)}`} />
                ))}
              </div>
              <div className="col" style={{ gap: 9 }}>
                {kinds.sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div className="row" key={k} style={{ fontSize: 12.5 }}>
                    <i className="dot" style={{ background: KIND_COLOR[k] || 'var(--text-3)' }} />
                    <span style={{ textTransform: 'capitalize', flex: 1 }}>{k}</span>
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
          <div className="card-head"><span className="card-title"><Icon name="copy" size={14} /> Deduplication</span></div>
          <div className="col" style={{ gap: 13 }}>
            <p className="muted" style={{ fontSize: 12.8, lineHeight: 1.65 }}>
              Every file is stored under the SHA-256 hash of its contents. Identical files —
              across folders or even across projects — occupy disk space exactly once.
            </p>
            <div className="grid g2" style={{ gap: 11 }}>
              <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)' }}>
                <div className="dim" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Duplicate groups
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{d.duplicateGroups || 0}</div>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)' }}>
                <div className="dim" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Space reclaimed
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: 'var(--green)' }}>
                  {bytes(d.saved || 0)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title"><Icon name="trash-2" size={14} /> Reclaimable</span></div>
          <div className="col" style={{ gap: 11 }}>
            <div className="row" style={{ fontSize: 12.8 }}>
              <span>Recycle bins</span>
              <div className="spacer" />
              <span className="muted tnum">{bytes(d.recycleBin || 0)}</span>
            </div>
            <div className="row" style={{ fontSize: 12.8 }}>
              <span>Snapshot archives</span>
              <div className="spacer" />
              <span className="muted tnum">{bytes(d.snapshots || 0)}</span>
            </div>
            <p className="dim" style={{ fontSize: 11.8, lineHeight: 1.6 }}>
              Empty a project's recycle bin from Files → 🗑, or delete old snapshots from the
              Versions tab. Snapshot archives are compressed with DEFLATE.
            </p>
            <button className="btn" onClick={() => nav('/projects')} style={{ justifyContent: 'flex-start' }}>
              <Icon name="folder" size={14} /> Go to projects
            </button>
          </div>
        </div>
      </div>
    </Page>
  );
}
