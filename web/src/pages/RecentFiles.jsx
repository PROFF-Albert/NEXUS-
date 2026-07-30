// PRD §7 — Recent Files across every project.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, bytes, timeAgo } from '../lib/api';
import { Empty, Icon, Loading, Page, Segmented } from '../components/ui';

const KIND_ICON = { text: 'file-code', image: 'image', video: 'video', doc: 'file-text', archive: 'file-archive' };

export default function RecentFiles() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'], queryFn: () => api.get('/dashboard'),
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', false, '', 'recent'], queryFn: () => api.get('/projects'),
  });

  const { data: allFiles, isLoading: loadingAll } = useQuery({
    queryKey: ['all-recent-files', projects?.length],
    enabled: !!projects?.length,
    queryFn: async () => {
      const lists = await Promise.all(projects.map(async (p) => {
        const files = await api.get(`/projects/${p.id}/recent-files?limit=40`);
        return files.map((f) => ({ ...f, projectId: p.id, projectName: p.name, projectColor: p.color }));
      }));
      return lists.flat().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },
  });

  const rows = useMemo(() => {
    let list = allFiles || data?.recentFiles || [];
    if (kind !== 'all') list = list.filter((f) => f.kind === kind);
    if (q) list = list.filter((f) => `${f.name} ${f.projectName}`.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [allFiles, data, kind, q]);

  if (isLoading || loadingAll) return <Page title="Recent Files"><Loading rows={5} /></Page>;

  return (
    <Page title="Recent Files" icon="file"
          subtitle={`${rows.length} file${rows.length === 1 ? '' : 's'} across your workspace`}
          actions={(
            <Segmented value={kind} onChange={setKind}
                       options={[{ value: 'all', label: 'All' }, { value: 'text', label: 'Code' },
                                 { value: 'image', label: 'Images' }, { value: 'video', label: 'Videos' }]} />
          )}>
      <input className="input" style={{ maxWidth: 340, marginBottom: 16 }} placeholder="Filter files…"
             value={q} onChange={(e) => setQ(e.target.value)} />

      {rows.length === 0 ? (
        <Empty icon="file" title="No files yet">Upload files inside a project and they'll surface here.</Empty>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead><tr><th>File</th><th>Project</th><th>Path</th><th>Type</th><th>Size</th><th>Updated</th></tr></thead>
            <tbody>
              {rows.slice(0, 200).map((f) => (
                <tr key={`${f.projectId}-${f.id}`} style={{ cursor: 'pointer' }}
                    onClick={() => nav(`/projects/${f.projectId}?tab=files&file=${f.id}`)}>
                  <td>
                    <div className="row" style={{ gap: 9 }}>
                      <Icon name={KIND_ICON[f.kind] || 'file'} size={14} style={{ color: 'var(--text-3)' }} />
                      <span style={{ fontWeight: 500 }}>{f.name}</span>
                      {f.favorite && <Icon name="star" size={11} style={{ color: 'var(--amber)' }} />}
                    </div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 7 }}>
                      {f.projectColor && <i className="dot" style={{ background: f.projectColor }} />}
                      <span className="muted" style={{ fontSize: 12.5 }}>{f.projectName}</span>
                    </div>
                  </td>
                  <td className="mono dim" style={{ fontSize: 11.5 }}>{f.path || '/'}</td>
                  <td><span className="badge">{f.extension || f.kind}</span></td>
                  <td className="tnum muted" style={{ fontSize: 12.5 }}>{bytes(f.size)}</td>
                  <td className="dim" style={{ fontSize: 12 }}>{timeAgo(f.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
