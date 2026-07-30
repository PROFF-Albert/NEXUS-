// PRD §9/§40 — large project cards with banner, icon, tags and progress.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api, bytes, timeAgo } from '../lib/api';
import { Icon, Progress, StatusBadge } from './ui';

export default function ProjectCard({ project: p, compact }) {
  const nav = useNavigate();
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: (body) => api.patch(`/projects/${p.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });

  return (
    <motion.article className="project-card" onClick={() => nav(`/projects/${p.id}`)}
                    layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
      <div className="project-banner"
           style={{
             background: `linear-gradient(135deg, ${p.color}, color-mix(in srgb, ${p.color} 32%, #0b0b12))`,
             height: compact ? 62 : 82,
           }}>
        <div className="project-icon" style={{ width: compact ? 34 : 40, height: compact ? 34 : 40 }}>
          <Icon name={p.icon} size={compact ? 16 : 19} />
        </div>
        <button className={`pin-btn ${p.pinned ? 'on' : ''}`}
                title={p.pinned ? 'Unpin' : 'Pin to workspace'}
                onClick={(e) => { e.stopPropagation(); toggle.mutate({ pinned: !p.pinned }); }}>
          <Icon name="pin" size={13} />
        </button>
        {p.favorite && (
          <span style={{
            position: 'absolute', top: 10, left: 10, zIndex: 2, color: 'var(--amber)',
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
          }}>
            <Icon name="star" size={13} fill="currentColor" />
          </span>
        )}
      </div>

      <div className="project-body" style={compact ? { padding: '11px 13px 13px', gap: 7 } : undefined}>
        <div className="row" style={{ gap: 8 }}>
          <span className="project-name truncate" style={compact ? { fontSize: 13.5 } : undefined}>{p.name}</span>
          <div className="spacer" />
          <StatusBadge status={p.status} />
        </div>

        {!compact && <p className="project-desc">{p.description || 'No description yet.'}</p>}

        {!compact && p.tags?.length > 0 && (
          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
            {p.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
            {p.tags.length > 3 && <span className="tag">+{p.tags.length - 3}</span>}
          </div>
        )}

        {p.taskTotal > 0 && (
          <div className="row" style={{ gap: 9 }}>
            <Progress value={p.taskProgress} color={p.color} />
            <span className="dim tnum" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              {p.taskDone}/{p.taskTotal}
            </span>
          </div>
        )}

        <div className="project-meta">
          {p.language && <span>{p.language}</span>}
          {p.language && <span>·</span>}
          <span>{p.fileCount} files</span>
          <span>·</span>
          <span>{bytes(p.storageUsed)}</span>
          <div className="spacer" />
          <span>{timeAgo(p.lastOpened || p.updatedAt)}</span>
        </div>
      </div>
    </motion.article>
  );
}
