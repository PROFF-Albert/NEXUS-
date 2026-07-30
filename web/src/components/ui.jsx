// Shared UI primitives used across every NEXUS page.
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { STATUS_COLOR, PRIORITY_COLOR } from '../lib/api';

export function Icon({ name, size = 16, ...rest }) {
  const key = (name || 'circle')
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  const C = Icons[key] || Icons.Circle;
  return <C size={size} {...rest} />;
}

export function Spinner({ label }) {
  return (
    <div className="row" style={{ gap: 9, color: 'var(--text-3)', fontSize: 13 }}>
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Loading({ rows = 3 }) {
  return (
    <div className="col" style={{ gap: 11 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 64 }} />
      ))}
    </div>
  );
}

export function Empty({ icon = 'inbox', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={22} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Badge({ children, color, icon }) {
  return (
    <span className="badge" style={color ? {
      color, borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
    } : undefined}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || 'var(--text-3)';
  return (
    <span className="badge" style={{
      color: c, borderColor: `color-mix(in srgb, ${c} 34%, transparent)`,
      background: `color-mix(in srgb, ${c} 12%, transparent)`,
    }}>
      <i className="dot" style={{ background: c }} />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const c = PRIORITY_COLOR[priority] || 'var(--text-3)';
  return <Badge color={c}>{priority}</Badge>;
}

export function Progress({ value, color }) {
  return (
    <div className="progress">
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color || 'var(--accent)' }} />
    </div>
  );
}

export function Modal({ open, onClose, title, icon, children, footer, size = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.13 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            className={`modal ${size}`}
            initial={{ opacity: 0, y: -12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {title && (
              <div className="modal-head">
                {icon && <Icon name={icon} size={17} style={{ color: 'var(--accent)' }} />}
                <div className="modal-title">{title}</div>
                <div className="spacer" />
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
                  <Icon name="x" size={16} />
                </button>
              </div>
            )}
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Switch({ checked, onChange }) {
  return (
    <button className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange?.(!checked)}
            role="switch" aria-checked={checked} type="button" />
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''}
                onClick={() => onChange(o.value)} type="button">
          {o.icon && <Icon name={o.icon} size={12} style={{ marginRight: 5, verticalAlign: -2 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id}
                className={`tab ${active === t.id ? 'active' : ''}`}
                onClick={() => onChange(t.id)}>
          {t.icon && <Icon name={t.icon} size={14} />}
          {t.label}
          {t.count > 0 && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Confirm({ open, title, message, confirmLabel = 'Delete', danger = true, onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={title} icon="alert-triangle"
           footer={(
             <>
               <button className="btn" onClick={onClose}>Cancel</button>
               <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
                       onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
             </>
           )}>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65 }}>{message}</p>
    </Modal>
  );
}

export function Dropdown({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.12 }}
            className="card glass"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 90,
              minWidth: 194, padding: 5, boxShadow: 'var(--shadow)', borderRadius: 'var(--radius-sm)',
            }}
            onClick={() => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger }) {
  return (
    <button className="nav-item" onClick={onClick}
            style={danger ? { color: 'var(--red)' } : undefined}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export function Toasts({ items }) {
  const colors = { success: 'var(--green)', error: 'var(--red)', warning: 'var(--amber)', info: 'var(--accent)' };
  const icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };
  return (
    <div className="toasts">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div key={t.id} className="toast"
                      initial={{ opacity: 0, x: 40, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 40, scale: 0.96 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
            <Icon name={icons[t.level] || 'info'} size={16} style={{ color: colors[t.level], flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
              <div className="ttl">{t.title}</div>
              {t.body && <div className="bdy">{t.body}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Stat({ label, value, foot, icon, color }) {
  return (
    <div className="stat">
      <div className="row">
        <span className="stat-label">{label}</span>
        {icon && <Icon name={icon} size={14} style={{ marginLeft: 'auto', color: color || 'var(--text-3)' }} />}
      </div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

export function Page({ title, subtitle, actions, children, narrow, icon }) {
  return (
    <motion.div className={`page ${narrow ? 'page-narrow' : ''}`}
                initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
      {(title || actions) && (
        <div className="page-head">
          <div>
            <h1 className="page-title">
              {icon && <Icon name={icon} size={22} style={{ verticalAlign: -3, marginRight: 9, color: 'var(--accent)' }} />}
              {title}
            </h1>
            {subtitle && <div className="page-sub">{subtitle}</div>}
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </div>
      )}
      {children}
    </motion.div>
  );
}

export function CopyButton({ text, label = 'Copy', small }) {
  const [done, setDone] = useState(false);
  return (
    <button className={`btn ${small ? 'btn-sm' : ''}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                const ta = document.createElement('textarea');
                ta.value = text; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); ta.remove();
              }
              setDone(true);
              setTimeout(() => setDone(false), 1600);
            }}>
      <Icon name={done ? 'check' : 'copy'} size={13} />
      {done ? 'Copied' : label}
    </button>
  );
}
