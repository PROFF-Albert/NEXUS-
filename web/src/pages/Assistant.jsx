// PRD §31 — AI Assistant.
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Field, Icon, Modal, Page } from '../components/ui';
import Markdown from '../components/Markdown';

export default function Assistant() {
  const [params] = useSearchParams();
  const { toast, user } = useApp();
  const [projectId, setProjectId] = useState(params.get('project') || '');
  const [fileId, setFileId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [saving, setSaving] = useState(null);
  const endRef = useRef(null);

  const { data: caps } = useQuery({ queryKey: ['ai-caps'], queryFn: () => api.get('/ai/capabilities') });
  const { data: projects } = useQuery({ queryKey: ['projects', false, '', 'recent'], queryFn: () => api.get('/projects') });
  const { data: tree } = useQuery({
    queryKey: ['tree', Number(projectId)],
    queryFn: () => api.get(`/projects/${projectId}/tree`),
    enabled: !!projectId,
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const ask = useMutation({
    mutationFn: (payload) => api.post('/ai/ask', payload),
    onSuccess: (res, vars) => {
      setMessages((m) => [...m, { role: 'assistant', content: res.content, engine: res.engine, model: res.model }]);
    },
    onError: (e) => toast('AI request failed', String(e.detail || e.message), 'error'),
  });

  const run = (action, text) => {
    const userText = text || (action === 'chat' ? prompt : caps?.capabilities.find((c) => c.id === action)?.label);
    if (action === 'chat' && !prompt.trim()) return;
    setMessages((m) => [...m, { role: 'user', content: userText }]);
    setPrompt('');
    ask.mutate({
      action, prompt: action === 'chat' ? (text || prompt) : '',
      project_id: projectId ? Number(projectId) : null,
      file_id: fileId ? Number(fileId) : null,
      history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    });
  };

  const saveDoc = useMutation({
    mutationFn: ({ title, body }) => api.post('/ai/save-doc', {
      project_id: Number(projectId), title, body,
      category: title.toLowerCase().includes('readme') ? 'README' : 'Architecture',
    }),
    onSuccess: () => { setSaving(null); toast('Saved to documentation', '', 'success'); },
  });

  const textFiles = (tree?.files || []).filter((f) => f.kind === 'text');
  const engine = caps?.engine || 'local';

  return (
    <Page title="AI Assistant" icon="sparkles"
          subtitle={engine === 'openai'
            ? `Connected to ${caps?.model} · grounded in your project data`
            : 'Local analysis engine · set OPENAI_API_KEY for full generative answers'}
          actions={(
            <>
              <Badge color={engine === 'openai' ? 'var(--green)' : 'var(--amber)'}
                     icon={engine === 'openai' ? 'zap' : 'cpu'}>
                {engine === 'openai' ? 'OpenAI' : 'Local mode'}
              </Badge>
              {messages.length > 0 && (
                <button className="btn btn-sm" onClick={() => setMessages([])}>
                  <Icon name="eraser" size={13} /> Clear
                </button>
              )}
            </>
          )}>
      <div className="split split-wide" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 14 }}>
          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="target" size={14} /> Context</span></div>
            <div className="col" style={{ gap: 11 }}>
              <Field label="Project" hint="The assistant reads real files, tasks and settings">
                <select className="select" value={projectId} onChange={(e) => { setProjectId(e.target.value); setFileId(''); }}>
                  <option value="">— no project —</option>
                  {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              {projectId && (
                <Field label="Focus file (optional)">
                  <select className="select" value={fileId} onChange={(e) => setFileId(e.target.value)}>
                    <option value="">— whole project —</option>
                    {textFiles.map((f) => <option key={f.id} value={f.id}>{f.path}{f.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title"><Icon name="wand-2" size={14} /> Capabilities</span></div>
            <div className="col" style={{ gap: 3 }}>
              {(caps?.capabilities || []).map((c) => (
                <button key={c.id} className="nav-item" style={{ fontSize: 12.8 }}
                        disabled={ask.isPending}
                        onClick={() => (c.action ? run(c.id) : setPrompt(c.prompt))}>
                  <Icon name={c.icon} size={14} />
                  {c.label}
                  {c.action && <Icon name="play" size={10} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '68vh' }}>
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {messages.length === 0 ? (
              <div className="center" style={{ height: '100%', minHeight: 340 }}>
                <div style={{ textAlign: 'center', maxWidth: 470 }}>
                  <div className="empty-icon" style={{ width: 52, height: 52, margin: '0 auto 15px' }}>
                    <Icon name="sparkles" size={22} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 650, marginBottom: 7 }}>Ask anything about your work</h3>
                  <p className="dim" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
                    Pick a project on the left and the assistant grounds every answer in your real
                    files, tasks, secrets and deployments — generate a README, review architecture,
                    scan for leaked credentials or debug an error.
                  </p>
                  <div className="row" style={{ gap: 7, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {['review_project', 'generate_readme', 'security_review', 'summarize'].map((id) => {
                      const c = caps?.capabilities.find((x) => x.id === id);
                      return c ? (
                        <button key={id} className="btn btn-sm" disabled={!projectId || ask.isPending}
                                onClick={() => run(id)}>
                          <Icon name={c.icon} size={13} /> {c.label}
                        </button>
                      ) : null;
                    })}
                  </div>
                  {!projectId && <div className="dim" style={{ fontSize: 11.5, marginTop: 13 }}>Select a project to enable project actions</div>}
                </div>
              </div>
            ) : (
              <div>
                {messages.map((m, i) => (
                  <motion.div key={i} className="chat-msg"
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.18 }}>
                    <div className="chat-avatar" style={{
                      background: m.role === 'user' ? (user?.avatarColor || 'var(--accent)') : 'var(--surface)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--line)',
                      color: m.role === 'user' ? '#fff' : 'var(--accent)',
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {m.role === 'user'
                        ? (user?.name || 'U').charAt(0).toUpperCase()
                        : <Icon name="sparkles" size={13} />}
                    </div>
                    <div className="chat-body">
                      <div className="row" style={{ gap: 8, marginBottom: 5 }}>
                        <strong style={{ fontSize: 12.5 }}>{m.role === 'user' ? 'You' : 'NEXUS AI'}</strong>
                        {m.engine && <span className="badge" style={{ fontSize: 10 }}>{m.model}</span>}
                        {m.role === 'assistant' && projectId && (
                          <>
                            <div className="spacer" />
                            <button className="btn btn-sm btn-ghost"
                                    onClick={() => setSaving({ title: 'AI generated document', body: m.content })}>
                              <Icon name="book-plus" size={12} /> Save to docs
                            </button>
                          </>
                        )}
                      </div>
                      {m.role === 'user'
                        ? <div style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{m.content}</div>
                        : <Markdown>{m.content}</Markdown>}
                    </div>
                  </motion.div>
                ))}
                {ask.isPending && (
                  <div className="chat-msg">
                    <div className="chat-avatar" style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--accent)' }}>
                      <Icon name="sparkles" size={13} />
                    </div>
                    <div className="row" style={{ gap: 9, color: 'var(--text-3)', fontSize: 13 }}>
                      <span className="spinner" /> Thinking…
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 13, marginTop: 13 }}>
            <div className="row" style={{ gap: 9, alignItems: 'flex-end' }}>
              <textarea className="textarea" style={{ minHeight: 58, maxHeight: 180 }}
                        placeholder="Ask about your code, generate an API, design a schema, explain an error…"
                        value={prompt} onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run('chat'); }
                        }} />
              <button className="btn btn-primary" style={{ height: 38 }} disabled={!prompt.trim() || ask.isPending}
                      onClick={() => run('chat')}>
                <Icon name="send" size={14} /> Send
              </button>
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 7 }}>
              <span className="kbd">⌘↵</span> to send · context: {projectId
                ? (projects || []).find((p) => String(p.id) === String(projectId))?.name
                : 'none'}
            </div>
          </div>
        </div>
      </div>

      <Modal open={!!saving} onClose={() => setSaving(null)} title="Save to documentation" icon="book-plus"
             footer={(
               <>
                 <button className="btn" onClick={() => setSaving(null)}>Cancel</button>
                 <button className="btn btn-primary" onClick={() => saveDoc.mutate(saving)}>Save document</button>
               </>
             )}>
        <Field label="Document title">
          <input className="input" autoFocus value={saving?.title || ''}
                 onChange={(e) => setSaving((s) => ({ ...s, title: e.target.value }))} />
        </Field>
        <div className="dim" style={{ fontSize: 12 }}>
          Saved into this project's Documentation tab and included in future snapshots.
        </div>
      </Modal>
    </Page>
  );
}
