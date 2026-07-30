// PRD §12 File Manager + §13 Code Viewer.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, bytes, dateTimeStr, timeAgo } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Confirm, Dropdown, Empty, Field, Icon, Loading, MenuItem, Modal } from '../../components/ui';
import CodeViewer, { CodeBlock, DiffView } from '../../components/CodeViewer';

const ICON_BY_EXT = {
  js: 'file-code', jsx: 'file-code', ts: 'file-code', tsx: 'file-code', py: 'file-code',
  json: 'braces', yaml: 'braces', yml: 'braces', md: 'file-text', txt: 'file-text',
  html: 'code', css: 'palette', scss: 'palette', png: 'image', jpg: 'image', jpeg: 'image',
  gif: 'image', svg: 'image', webp: 'image', mp4: 'video', webm: 'video', mov: 'video',
  pdf: 'file-text', zip: 'file-archive', sql: 'database', env: 'key', sh: 'terminal',
};

function fileIcon(f) {
  if (f.kind === 'image') return 'image';
  if (f.kind === 'video') return 'video';
  return ICON_BY_EXT[f.extension] || 'file';
}

function TreeNode({ node, depth, selected, onSelect, onContext, expanded, toggle }) {
  const isFolder = node.type === 'folder';
  const open = expanded.has(node.key);
  return (
    <>
      <div className={`tree-row ${selected === node.key ? 'selected' : ''}`}
           style={{ paddingLeft: 8 + depth * 13 }}
           onClick={() => (isFolder ? toggle(node.key) : onSelect(node))}>
        {isFolder ? (
          <>
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
            <Icon name={open ? 'folder-open' : 'folder'} size={14}
                  style={{ color: node.data.color || 'var(--text-3)', flexShrink: 0 }} />
          </>
        ) : (
          <>
            <span style={{ width: 12, flexShrink: 0 }} />
            <Icon name={fileIcon(node.data)} size={14} style={{ flexShrink: 0, opacity: 0.85 }} />
          </>
        )}
        <span className="name">{node.name}</span>
        {!isFolder && node.data.favorite && <Icon name="star" size={10} style={{ color: 'var(--amber)' }} />}
        <div className="actions">
          <button className="btn btn-sm btn-ghost btn-icon"
                  onClick={(e) => { e.stopPropagation(); onContext(node, e); }}>
            <Icon name="more-horizontal" size={13} />
          </button>
        </div>
      </div>
      {isFolder && open && node.children.map((c) => (
        <TreeNode key={c.key} node={c} depth={depth + 1} selected={selected}
                  onSelect={onSelect} onContext={onContext} expanded={expanded} toggle={toggle} />
      ))}
    </>
  );
}

export default function FilesTab({ project, initialFileId }) {
  const qc = useQueryClient();
  const { toast, settings } = useApp();
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(new Set(['root']));
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [newFolder, setNewFolder] = useState(null);
  const [newFile, setNewFile] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [showBin, setShowBin] = useState(false);
  const [showDupes, setShowDupes] = useState(false);
  const [compare, setCompare] = useState(null);
  const [uploading, setUploading] = useState(0);
  const inputRef = useRef(null);
  const folderInputRef = useRef(null);

  const { data: tree, isLoading } = useQuery({
    queryKey: ['tree', project.id],
    queryFn: () => api.get(`/projects/${project.id}/tree`),
  });

  const { data: content, isFetching: loadingContent } = useQuery({
    queryKey: ['file-content', selected?.id],
    queryFn: () => api.get(`/projects/${project.id}/files/${selected.id}/content`),
    enabled: !!selected?.id,
  });

  const { data: revisions } = useQuery({
    queryKey: ['revisions', selected?.id],
    queryFn: () => api.get(`/projects/${project.id}/files/${selected.id}/revisions`),
    enabled: !!selected?.id,
  });

  const { data: bin } = useQuery({
    queryKey: ['bin', project.id],
    queryFn: () => api.get(`/projects/${project.id}/recycle-bin`),
    enabled: showBin,
  });

  const { data: dupes } = useQuery({
    queryKey: ['dupes', project.id],
    queryFn: () => api.get(`/projects/${project.id}/duplicates`),
    enabled: showDupes,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tree', project.id] });
    qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
    qc.invalidateQueries({ queryKey: ['bin', project.id] });
    qc.invalidateQueries({ queryKey: ['dupes', project.id] });
  };

  useEffect(() => {
    if (initialFileId && tree) {
      const f = tree.files.find((x) => x.id === Number(initialFileId));
      if (f) setSelected(f);
    }
  }, [initialFileId, tree]);

  // build hierarchy
  const nodes = useMemo(() => {
    if (!tree) return [];
    const needle = search.trim().toLowerCase();
    const byParent = new Map();
    tree.folders.forEach((f) => {
      const list = byParent.get(f.parentId || 'root') || [];
      list.push(f);
      byParent.set(f.parentId || 'root', list);
    });
    const filesByFolder = new Map();
    tree.files.forEach((f) => {
      if (needle && !f.name.toLowerCase().includes(needle)) return;
      const list = filesByFolder.get(f.folderId || 'root') || [];
      list.push(f);
      filesByFolder.set(f.folderId || 'root', list);
    });
    const build = (parentKey) => {
      const folders = (byParent.get(parentKey) || []).map((f) => ({
        key: `d${f.id}`, name: f.name, type: 'folder', data: f, children: build(f.id),
      }));
      const files = (filesByFolder.get(parentKey) || []).map((f) => ({
        key: `f${f.id}`, name: f.name, type: 'file', data: f, id: f.id, children: [],
      }));
      if (needle) {
        return [...folders.filter((f) => f.children.length > 0), ...files];
      }
      return [...folders, ...files];
    };
    return build('root');
  }, [tree, search]);

  useEffect(() => {
    if (search.trim() && tree) setExpanded(new Set(['root', ...tree.folders.map((f) => `d${f.id}`)]));
  }, [search, tree]);

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const doUpload = useCallback(async (files, relPaths, explicitFolderId = null) => {
    if (!files.length) return;
    setUploading(files.length);
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    if (relPaths?.length) form.append('paths', relPaths.join('|'));
    const folderId = explicitFolderId ?? selected?.folderId ?? (menu?.type === 'folder' ? menu.data.id : null);
    if (folderId) form.append('folder_id', String(folderId));
    try {
      const res = await api.upload(`/projects/${project.id}/files/upload`, form);
      toast('Upload complete',
            `${res.files.length} file(s)${res.deduplicated ? ` · ${res.deduplicated} deduplicated` : ''}`,
            'success');
      refresh();
    } catch (e) {
      toast('Upload failed', String(e.detail || e.message), 'error');
    }
    setUploading(0);
  }, [project.id, selected, menu]); // eslint-disable-line react-hooks/exhaustive-deps

  const readAllEntries = useCallback((reader) => new Promise((resolve) => {
    const entries = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      });
    };
    readBatch();
  }), []);

  const walkEntry = useCallback(async (entry, prefix, files, paths) => {
    if (entry.isFile) {
      await new Promise((resolve) => {
        entry.file((f) => {
          files.push(f);
          paths.push(`${prefix}${f.name}`);
          resolve();
        });
      });
      return;
    }

    if (entry.isDirectory) {
      const reader = entry.createReader();
      const children = await readAllEntries(reader);
      for (const child of children) {
        // Folder uploads can contain nested trees; recurse until every entry is captured.
        // eslint-disable-next-line no-await-in-loop
        await walkEntry(child, `${prefix}${entry.name}/`, files, paths);
      }
    }
  }, [readAllEntries]);

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const items = Array.from(e.dataTransfer.items || []);
    const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.some((en) => en?.isDirectory)) {
      const files = []; const paths = [];
      await Promise.all(entries.map((en) => walkEntry(en, '', files, paths)));
      await doUpload(files, paths, selected?.folderId ?? null);
    } else {
      await doUpload(Array.from(e.dataTransfer.files), undefined, selected?.folderId ?? null);
    }
  };

  const save = useMutation({
    mutationFn: (text) => api.put(`/projects/${project.id}/files/${selected.id}/content`, { content: text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['file-content', selected.id] });
      qc.invalidateQueries({ queryKey: ['revisions', selected.id] });
      refresh();
      toast('Saved', selected.name, 'success');
    },
  });

  const del = useMutation({
    mutationFn: ({ node, permanent }) => (node.type === 'folder'
      ? api.del(`/projects/${project.id}/folders/${node.data.id}`)
      : api.del(`/projects/${project.id}/files/${node.data.id}?permanent=${!!permanent}`)),
    onSuccess: (_r, v) => { refresh(); if (selected?.id === v.node.data.id) setSelected(null); toast('Moved to recycle bin'); },
  });

  const rename = useMutation({
    mutationFn: ({ node, name }) => (node.type === 'folder'
      ? api.patch(`/projects/${project.id}/folders/${node.data.id}`, { name })
      : api.patch(`/projects/${project.id}/files/${node.data.id}`, { name })),
    onSuccess: () => { refresh(); setRenaming(null); toast('Renamed'); },
  });

  const duplicate = useMutation({
    mutationFn: (id) => api.post(`/projects/${project.id}/files/${id}/duplicate`, {}),
    onSuccess: () => { refresh(); toast('Duplicated'); },
  });

  const favorite = useMutation({
    mutationFn: ({ id, value }) => api.patch(`/projects/${project.id}/files/${id}`, { favorite: value }),
    onSuccess: refresh,
  });

  const restore = useMutation({
    mutationFn: (id) => api.post(`/projects/${project.id}/files/${id}/restore`, {}),
    onSuccess: () => { refresh(); toast('File restored'); },
  });

  const createFolder = useMutation({
    mutationFn: (name) => api.post(`/projects/${project.id}/folders`, { name, parent_id: newFolder?.parentId ?? null }),
    onSuccess: () => { refresh(); setNewFolder(null); toast('Folder created'); },
  });

  const createFile = useMutation({
    mutationFn: ({ name, content: c }) => api.post(`/projects/${project.id}/files`,
      { name, content: c || '', folder_id: newFile?.folderId ?? null }),
    onSuccess: (f) => { refresh(); setNewFile(null); setSelected(f); toast('File created'); },
  });

  const restoreRevision = useMutation({
    mutationFn: (version) => api.post(`/projects/${project.id}/files/${selected.id}/restore/${version}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['file-content', selected.id] });
      qc.invalidateQueries({ queryKey: ['revisions', selected.id] });
      setCompare(null);
      toast('Version restored', `${selected.name} rolled back`, 'success');
    },
  });

  const loadDiff = async (version) => {
    const d = await api.get(`/projects/${project.id}/files/${selected.id}/diff?version=${version}`);
    setCompare({ version, diff: d });
  };

  const totalFiles = tree?.files.length || 0;
  const totalSize = (tree?.files || []).reduce((a, f) => a + f.size, 0);

  return (
    <div className="split split-wide" style={{ alignItems: 'stretch' }}>
      {/* ── tree pane ───────────────────────────────── */}
      <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '76vh' }}>
        <div style={{ padding: 11, borderBottom: '1px solid var(--line)' }}>
          <div className="row" style={{ gap: 5, marginBottom: 9 }}>
            <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => inputRef.current?.click()}>
              <Icon name="upload" size={13} /> Upload
            </button>
            <button className="btn btn-sm btn-icon" title="Upload folder" onClick={() => folderInputRef.current?.click()}>
              <Icon name="folder-up" size={13} />
            </button>
            <Dropdown trigger={<button className="btn btn-sm btn-icon"><Icon name="plus" size={13} /></button>}>
              <MenuItem icon="file-plus" onClick={() => setNewFile({ folderId: null })}>New file</MenuItem>
              <MenuItem icon="folder-plus" onClick={() => setNewFolder({ parentId: null })}>New folder</MenuItem>
            </Dropdown>
          </div>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={12}
                  style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input className="input" style={{ paddingLeft: 28, fontSize: 12.5, padding: '6px 9px 6px 28px' }}
                   placeholder="Search files…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 7 }}
             onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
             onDragLeave={() => setDragOver(false)}
             onDrop={onDrop}>
          {isLoading ? <Loading rows={4} /> : nodes.length === 0 ? (
            <div className={`dropzone ${dragOver ? 'over' : ''}`} style={{ margin: 8 }}>
              <Icon name="upload-cloud" size={22} style={{ marginBottom: 8, opacity: 0.6 }} />
              <div>Drop files or folders here</div>
            </div>
          ) : (
            <div className={dragOver ? 'dropzone over' : ''} style={dragOver ? { padding: 6 } : undefined}>
              {nodes.map((n) => (
                <TreeNode key={n.key} node={n} depth={0} selected={selected ? `f${selected.id}` : null}
                          onSelect={(node) => setSelected(node.data)}
                          onContext={(node) => setMenu(node)}
                          expanded={expanded} toggle={toggle} />
              ))}
            </div>
          )}
          {uploading > 0 && (
            <div className="row" style={{ padding: 10, gap: 8, fontSize: 12 }}>
              <span className="spinner" /> Uploading {uploading} file(s)…
            </div>
          )}
        </div>

        <div style={{ padding: '9px 11px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--text-3)' }}>
          <div className="row">
            <span>{totalFiles} files · {bytes(totalSize)}</span>
            <div className="spacer" />
            <button className="btn btn-sm btn-ghost btn-icon" title="Recycle bin" onClick={() => setShowBin(true)}>
              <Icon name="trash-2" size={13} />
            </button>
            <button className="btn btn-sm btn-ghost btn-icon" title="Duplicate detection" onClick={() => setShowDupes(true)}>
              <Icon name="copy" size={13} />
            </button>
            <button className="btn btn-sm btn-ghost btn-icon" title="Export project as ZIP"
                    onClick={() => api.download(`/projects/${project.id}/export`, `${project.name}.zip`)}>
              <Icon name="download" size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── viewer pane ───────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        {!selected ? (
          <div className="card" style={{ minHeight: 420 }}>
            <Empty icon="mouse-pointer-click" title="Select a file"
                   action={(
                     <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
                       <button className="btn" onClick={() => inputRef.current?.click()}>
                         <Icon name="upload" size={14} /> Upload files
                       </button>
                       <button className="btn" onClick={() => setNewFile({ folderId: null })}>
                         <Icon name="file-plus" size={14} /> New file
                       </button>
                     </div>
                   )}>
              Pick a file from the tree to view, edit and compare versions. Drag & drop whole
              folders onto the tree to bring an existing project in.
            </Empty>
          </div>
        ) : loadingContent && !content ? (
          <div className="card"><Loading rows={5} /></div>
        ) : content?.binary ? (
          <div className="card">
            <div className="row" style={{ marginBottom: 14 }}>
              <Icon name={fileIcon(selected)} size={16} style={{ color: 'var(--accent)' }} />
              <strong>{selected.name}</strong>
              <span className="badge">{bytes(selected.size)}</span>
              <div className="spacer" />
              <button className="btn btn-sm"
                      onClick={() => api.download(`/projects/${project.id}/files/${selected.id}/raw?download=true`, selected.name)}>
                <Icon name="download" size={13} /> Download
              </button>
            </div>
            {selected.kind === 'image' ? (
              <img src={api.url(`/projects/${project.id}/files/${selected.id}/raw`)} alt={selected.name}
                   style={{ maxWidth: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }} />
            ) : selected.kind === 'video' ? (
              <video controls src={api.url(`/projects/${project.id}/files/${selected.id}/raw`)}
                     style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }} />
            ) : selected.extension === 'pdf' ? (
              <iframe title={selected.name} src={api.url(`/projects/${project.id}/files/${selected.id}/raw`)}
                      style={{ width: '100%', height: 560, border: '1px solid var(--line)', borderRadius: 'var(--radius)' }} />
            ) : (
              <Empty icon="file" title="Preview not available">
                {selected.mime} · {bytes(selected.size)} — download it to open in a native app.
              </Empty>
            )}
          </div>
        ) : (
          <div className="col" style={{ gap: 14 }}>
            <CodeViewer
              file={selected}
              content={content?.content || ''}
              language={content?.language || 'text'}
              settings={settings.editor}
              versions={revisions || []}
              busy={save.isPending}
              onSave={(text) => save.mutateAsync(text)}
              onCompare={() => (revisions?.length > 1 ? loadDiff(revisions[1].version) : toast('Only one version exists so far'))}
              onClose={() => setSelected(null)}
            />

            {revisions?.length > 0 && (
              <div className="card">
                <div className="card-head">
                  <span className="card-title"><Icon name="history" size={14} /> Version history</span>
                  <div className="spacer" />
                  <span className="dim" style={{ fontSize: 11.5 }}>{revisions.length} revisions</span>
                </div>
                <div className="col" style={{ gap: 2 }}>
                  {revisions.map((r) => (
                    <div className="list-item" key={r.id}>
                      <div className="list-icon"><Icon name="git-commit" size={13} /></div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.8 }}>v{r.version} · {r.note}</div>
                        <div className="dim" style={{ fontSize: 11 }}>{dateTimeStr(r.createdAt)} · {bytes(r.size)}</div>
                      </div>
                      <button className="btn btn-sm btn-ghost" onClick={() => loadDiff(r.version)}>
                        <Icon name="git-compare" size={12} /> Diff
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => restoreRevision.mutate(r.version)}>
                        <Icon name="rotate-ccw" size={12} /> Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* hidden inputs */}
      <input ref={inputRef} type="file" multiple hidden
             onChange={(e) => { doUpload(Array.from(e.target.files), undefined, selected?.folderId ?? null); e.target.value = ''; }} />
      <input ref={folderInputRef} type="file" multiple hidden webkitdirectory="" directory=""
             onChange={(e) => {
               const files = Array.from(e.target.files);
               doUpload(files, files.map((f) => f.webkitRelativePath || f.name), selected?.folderId ?? null);
               e.target.value = '';
             }} />

      {/* context menu */}
      <Modal open={!!menu} onClose={() => setMenu(null)} title={menu?.name} icon={menu?.type === 'folder' ? 'folder' : 'file'}>
        <div className="col" style={{ gap: 2 }}>
          {menu?.type === 'file' && (
            <>
              <MenuItem icon="eye" onClick={() => { setSelected(menu.data); setMenu(null); }}>Open</MenuItem>
              <MenuItem icon="download" onClick={() => { api.download(`/projects/${project.id}/files/${menu.data.id}/raw?download=true`, menu.name); setMenu(null); }}>Download</MenuItem>
              <MenuItem icon="copy" onClick={() => { duplicate.mutate(menu.data.id); setMenu(null); }}>Duplicate</MenuItem>
              <MenuItem icon="star" onClick={() => { favorite.mutate({ id: menu.data.id, value: !menu.data.favorite }); setMenu(null); }}>
                {menu.data.favorite ? 'Remove from favorites' : 'Add to favorites'}
              </MenuItem>
            </>
          )}
          {menu?.type === 'folder' && (
            <>
              <MenuItem icon="file-plus" onClick={() => { setNewFile({ folderId: menu.data.id }); setMenu(null); }}>New file here</MenuItem>
              <MenuItem icon="folder-plus" onClick={() => { setNewFolder({ parentId: menu.data.id }); setMenu(null); }}>New subfolder</MenuItem>
              <MenuItem icon="download" onClick={() => { api.download(`/projects/${project.id}/export?folder_id=${menu.data.id}`, `${menu.name}.zip`); setMenu(null); }}>Export as ZIP</MenuItem>
            </>
          )}
          <MenuItem icon="pencil" onClick={() => { setRenaming({ node: menu, value: menu.name }); setMenu(null); }}>Rename</MenuItem>
          <MenuItem icon="trash-2" danger onClick={() => { setConfirm(menu); setMenu(null); }}>Delete</MenuItem>
        </div>
      </Modal>

      <Confirm open={!!confirm} onClose={() => setConfirm(null)}
               title={`Delete ${confirm?.name}?`}
               message={confirm?.type === 'folder'
                 ? 'The folder and everything inside it will be moved to the recycle bin.'
                 : 'This file will be moved to the recycle bin. You can restore it later.'}
               onConfirm={() => del.mutate({ node: confirm })} />

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename" icon="pencil"
             footer={(
               <>
                 <button className="btn" onClick={() => setRenaming(null)}>Cancel</button>
                 <button className="btn btn-primary" onClick={() => rename.mutate({ node: renaming.node, name: renaming.value })}>Rename</button>
               </>
             )}>
        <Field label="Name">
          <input className="input" autoFocus value={renaming?.value || ''}
                 onChange={(e) => setRenaming((r) => ({ ...r, value: e.target.value }))}
                 onKeyDown={(e) => e.key === 'Enter' && rename.mutate({ node: renaming.node, name: renaming.value })} />
        </Field>
      </Modal>

      <Modal open={!!newFolder} onClose={() => setNewFolder(null)} title="New folder" icon="folder-plus"
             footer={(
               <>
                 <button className="btn" onClick={() => setNewFolder(null)}>Cancel</button>
                 <button className="btn btn-primary" onClick={() => createFolder.mutate(newFolder.name || 'New Folder')}>Create</button>
               </>
             )}>
        <Field label="Folder name">
          <input className="input" autoFocus placeholder="src"
                 onChange={(e) => setNewFolder((f) => ({ ...f, name: e.target.value }))}
                 onKeyDown={(e) => e.key === 'Enter' && createFolder.mutate(e.target.value || 'New Folder')} />
        </Field>
      </Modal>

      <Modal open={!!newFile} onClose={() => setNewFile(null)} title="New file" icon="file-plus"
             footer={(
               <>
                 <button className="btn" onClick={() => setNewFile(null)}>Cancel</button>
                 <button className="btn btn-primary" disabled={!newFile?.name}
                         onClick={() => createFile.mutate({ name: newFile.name, content: newFile.content })}>Create</button>
               </>
             )}>
        <Field label="File name" hint="Extension drives syntax highlighting">
          <input className="input" autoFocus placeholder="index.ts"
                 onChange={(e) => setNewFile((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Initial content (optional)">
          <textarea className="textarea mono" placeholder="// start typing"
                    onChange={(e) => setNewFile((f) => ({ ...f, content: e.target.value }))} />
        </Field>
      </Modal>

      <Modal open={showBin} onClose={() => setShowBin(false)} title="Recycle bin" icon="trash-2" size="modal-lg"
             footer={(
               <>
                 <button className="btn btn-danger" disabled={!bin?.length}
                         onClick={async () => { await api.del(`/projects/${project.id}/recycle-bin`); refresh(); toast('Recycle bin emptied'); }}>
                   Empty bin
                 </button>
                 <button className="btn" onClick={() => setShowBin(false)}>Close</button>
               </>
             )}>
        {!bin?.length ? <Empty icon="trash-2" title="Recycle bin is empty">Deleted files land here first.</Empty> : (
          <div className="col" style={{ gap: 2 }}>
            {bin.map((f) => (
              <div className="list-item" key={f.id}>
                <div className="list-icon"><Icon name={fileIcon(f)} size={13} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="truncate" style={{ fontSize: 13 }}>{f.name}</div>
                  <div className="dim" style={{ fontSize: 11 }}>{f.path} · deleted {timeAgo(f.deletedAt)}</div>
                </div>
                <span className="dim" style={{ fontSize: 11.5 }}>{bytes(f.size)}</span>
                <button className="btn btn-sm" onClick={() => restore.mutate(f.id)}>
                  <Icon name="rotate-ccw" size={12} /> Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={showDupes} onClose={() => setShowDupes(false)} title="Duplicate detection" icon="copy" size="modal-lg">
        {!dupes?.length ? (
          <Empty icon="check-circle" title="No duplicates">
            Every file in this project has unique content. NEXUS stores files by content hash,
            so identical files never consume disk twice.
          </Empty>
        ) : (
          <div className="col" style={{ gap: 11 }}>
            <div className="row" style={{ gap: 8, fontSize: 12.5 }} >
              <Icon name="info" size={14} style={{ color: 'var(--accent)' }} />
              <span className="muted">
                {dupes.length} duplicate group(s) · {bytes(dupes.reduce((a, d) => a + d.wasted, 0))} would be wasted
                without content-addressed storage.
              </span>
            </div>
            {dupes.map((d) => (
              <div key={d.sha256} className="card" style={{ padding: 12, background: 'var(--bg-2)' }}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <span className="badge">{d.count} copies</span>
                  <span className="badge">{bytes(d.size)} each</span>
                  <div className="spacer" />
                  <span className="mono dim" style={{ fontSize: 10.5 }}>{d.sha256.slice(0, 16)}…</span>
                </div>
                {d.files.map((f) => (
                  <div key={f.id} className="row" style={{ fontSize: 12.5, padding: '3px 0' }}>
                    <Icon name="file" size={12} style={{ color: 'var(--text-3)' }} />
                    <span className="mono">{f.path}{f.name}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!compare} onClose={() => setCompare(null)} size="modal-xl"
             title={`Compare v${compare?.version} → v${selected?.version}`} icon="git-compare"
             footer={(
               <>
                 <button className="btn" onClick={() => setCompare(null)}>Close</button>
                 <button className="btn btn-primary" onClick={() => restoreRevision.mutate(compare.version)}>
                   <Icon name="rotate-ccw" size={13} /> Restore v{compare?.version}
                 </button>
               </>
             )}>
        <DiffView diff={compare?.diff} />
      </Modal>
    </div>
  );
}
