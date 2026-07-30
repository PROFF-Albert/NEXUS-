// PRD §32 — Password login + 2FA, plus first-run registration.
import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../lib/store';
import { Field, Icon } from '../components/ui';

export default function Login() {
  const { user, booting, login, register, toast } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('dev@nexus.local');
  const [password, setPassword] = useState('nexus');
  const [name, setName] = useState('');
  const [master, setMaster] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'NEXUS — Sign in'; }, []);

  if (!booting && user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(email, password, needsTotp ? totp : undefined);
      } else {
        await register({ email, name: name || 'Developer', password, master_password: master });
        toast('Workspace created', 'Your private developer OS is ready', 'success');
      }
      nav('/');
    } catch (err) {
      const msg = err.detail || err.message;
      if (String(msg).includes('2FA code required')) { setNeedsTotp(true); setError('Enter your 6-digit authenticator code'); }
      else setError(String(msg));
    }
    setBusy(false);
  };

  return (
    <div className="auth-shell">
      <div className="auth-glow" style={{ top: '-16%', left: '-8%' }} />
      <div className="auth-glow" style={{ bottom: '-22%', right: '-12%', background: 'radial-gradient(circle, color-mix(in srgb, #ec4899 12%, transparent), transparent 66%)' }} />

      <motion.div className="auth-card"
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
        <div className="col" style={{ alignItems: 'center', gap: 13, marginBottom: 28 }}>
          <div className="brand-mark" style={{ width: 48, height: 48, borderRadius: 14 }}>
            <svg width="25" height="25" viewBox="0 0 32 32" fill="none">
              <path d="M9 23V9l14 14V9" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '0.22em' }}>NEXUS</div>
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
              One Workspace. Every Project. Zero Chaos.
            </div>
          </div>
        </div>

        <form className="card" onSubmit={submit} style={{ padding: 22 }}>
          <div className="col" style={{ gap: 14 }}>
            <div className="seg" style={{ width: '100%' }}>
              <button type="button" className={mode === 'login' ? 'on' : ''} style={{ flex: 1 }}
                      onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
              <button type="button" className={mode === 'register' ? 'on' : ''} style={{ flex: 1 }}
                      onClick={() => { setMode('register'); setError(''); }}>Create workspace</button>
            </div>

            {mode === 'register' && (
              <Field label="Your name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                       placeholder="Ada Lovelace" />
              </Field>
            )}

            <Field label="Email">
              <input className="input" type="email" value={email} required
                     onChange={(e) => setEmail(e.target.value)} placeholder="you@local" />
            </Field>

            <Field label="Password">
              <input className="input" type="password" value={password} required
                     onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>

            {mode === 'register' && (
              <Field label="Vault master password"
                     hint="Separate from your login. Encrypts every secret with AES-256. It cannot be recovered.">
                <input className="input" type="password" value={master} required
                       onChange={(e) => setMaster(e.target.value)} placeholder="••••••••" />
              </Field>
            )}

            {needsTotp && (
              <Field label="Two-factor code">
                <input className="input mono" value={totp} maxLength={6} autoFocus
                       onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                       placeholder="000000" style={{ letterSpacing: '0.35em', textAlign: 'center' }} />
              </Field>
            )}

            {error && (
              <div className="row" style={{
                gap: 8, fontSize: 12.5, color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--red) 26%, transparent)',
                padding: '9px 11px', borderRadius: 'var(--radius-sm)',
              }}>
                <Icon name="alert-circle" size={14} /> {error}
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={busy} style={{ height: 38 }}>
              {busy ? <span className="spinner" /> : <Icon name={mode === 'login' ? 'log-in' : 'user-plus'} size={15} />}
              {mode === 'login' ? 'Sign in' : 'Create workspace'}
            </button>

            {mode === 'login' && (
              <div className="dim" style={{ fontSize: 11.5, textAlign: 'center', lineHeight: 1.7 }}>
                Demo account is pre-filled · vault master password&nbsp;
                <code style={{ fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>master-key</code>
              </div>
            )}
          </div>
        </form>

        <div className="row" style={{ justifyContent: 'center', gap: 16, marginTop: 20, fontSize: 11, color: 'var(--text-3)' }}>
          <span className="row" style={{ gap: 5 }}><Icon name="shield" size={12} /> Private-first</span>
          <span className="row" style={{ gap: 5 }}><Icon name="hard-drive" size={12} /> Self-hosted</span>
          <span className="row" style={{ gap: 5 }}><Icon name="lock" size={12} /> AES-256 vault</span>
        </div>
      </motion.div>
    </div>
  );
}
