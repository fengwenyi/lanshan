import { ToolbarItem } from './ToolbarCustomization';
import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, Copy, FolderOpen, FolderPlus, HardDrive, Info, LayoutGrid, List, LoaderCircle, Mountain, PanelRight, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { desktop, displayPath, errorMessage, files, normalizedPath, pathLabel } from './api';
import { panePath, useExplorer, useTransfer, type PaneState } from './store';
import { useQueue } from './queue';
import { size, date, fileKind, Glyph, IconButton, Empty } from './components';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { FilePreview, EntryThumbnail } from './FilePreview';
import { QuickLook } from './QuickLook';
import type { FileEntry, FileRequest } from './types';
import { emptyFilters, matchesSearch } from './search';
import { OrganizeDialog } from './OrganizeDialog';
import { BatchRenameDialog } from './BatchRenameDialog';
import { IconCanvas } from './IconCanvas';
import { defaultIconLayout } from './iconLayout';
import { useIconLayouts } from './iconLayoutStore';
import { favoriteKey } from './workspaceStorage';
import { usePreferences } from './preferences';

type Modal = { kind: 'create' } | { kind: 'rename'; entry: FileEntry } | { kind: 'trash'; entries: FileEntry[] } | null;
interface MenuState { x: number; y: number; entry: FileEntry | null }
const DRAG_TYPE = 'application/x-lanshan-selection';
export function FilePane({ pane, active, visible, split, otherPath, toolsTarget, navigationTarget }: { navigationTarget: HTMLDivElement | null; toolsTarget: HTMLDivElement | null; pane: PaneState; active: boolean; visible: boolean; split: boolean; otherPath?: string }) {
  const state = useExplorer();
  const transfer = useTransfer();
  const enqueue = useQueue((s) => s.enqueue);
  const path = panePath(pane);
  const iconLayouts = useIconLayouts();
  const iconLayout = iconLayouts.directories.find((item) => favoriteKey(item.path) === favoriteKey(path))?.layout ?? defaultIconLayout;
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const [pathInput, setPathInput] = useState(displayPath(path));
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { if (active && searchOpen) searchRef.current?.focus(); }, [active, searchOpen]);
  const [filters, setFilters] = useState(emptyFilters);
  const [searchScope, setSearchScope] = useState<'tree' | 'computer'>('tree');
  const [submitted, setSubmitted] = useState<{ path: string; query: string; showHidden: boolean; scope: 'tree' | 'computer' } | null>(null);
  const recursive = !!search.trim() || submitted !== null;
  const [renaming, setRenaming] = useState<FileEntry[] | null>(null);
  const [organizing, setOrganizing] = useState<FileEntry[] | null>(null);
  const revision = useQueue((value) => value.revision);
  const showAddressBar = usePreferences((s) => s.showAddressBar);
  const showPathBar = usePreferences((s) => s.showPathBar);
  const showHidden = usePreferences((s) => s.showHidden);
  const [sort, setSort] = useState('name');
  const [descending, setDescending] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [titleMenu, setTitleMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { setTitleMenu(null); }, [path, active]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const directory = useQuery({ queryKey: ['directory', path], queryFn: () => files.list(path), enabled: desktop && !!path && visible });
  const searchReady = recursive && submitted?.path === path && submitted.query === search.trim() && submitted.showHidden === showHidden && submitted.scope === searchScope;
  const recursiveSearch = useQuery({ queryKey: ['file-search', submitted, revision], queryFn: () => files.search(path, submitted?.query ?? '', showHidden, searchScope), enabled: desktop && visible && !!path && searchReady, retry: false });
  const sourceEntries = recursive ? searchReady ? recursiveSearch.data?.entries ?? [] : [] : directory.data?.entries ?? [];
  const navigate = (next: string) => { state.navigate(pane.id, next); setError(''); setMenu(null); };
  const picking = useMutation({ mutationFn: files.chooseFolder, onSuccess: (next) => { if (next) { navigate(next); if (normalizedPath(next) === normalizedPath(path)) void directory.refetch(); } }, onError: (e) => setError(errorMessage(e)) });
  const opening = useMutation({ mutationFn: files.open, onError: (e) => setError(errorMessage(e)) });
  const selectingTarget = useMutation({ mutationFn: async ({ entries, mode }: { entries: FileEntry[]; mode: 'copy' | 'move' }) => {
    const destination = await files.chooseFolder();
    if (destination) enqueue(entries.map((entry) => ({ action: mode, source: entry.path, destination })));
  }, onError: (e) => setError(errorMessage(e)) });
  const busy = picking.isPending || opening.isPending || selectingTarget.isPending;
  const compareEntries = (a: FileEntry, b: FileEntry) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    const delta = sort === 'size' ? a.size - b.size : sort === 'modified' ? a.modified - b.modified : a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
    return descending ? -delta : delta;
  };
  const entries = sourceEntries.filter((entry) => (showHidden || !entry.name.startsWith('.')) && matchesSearch(entry, search, filters)).sort(compareEntries);
  const freeAllowed = !recursive && (directory.data?.entries.length ?? 0) <= 2000;
  const effectiveLayout = freeAllowed ? iconLayout : { ...iconLayout, mode: 'aligned' as const };
  const filtering = recursive || !!search.trim() || Object.values(filters).some(Boolean);
  const chosen = entries.filter((entry) => selected.includes(entry.path));
  const current = chosen.length === 1 ? chosen[0] : undefined;
  const editable = chosen.length > 0 && chosen.every((entry) => !entry.isSymlink) && !busy;
  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => { if (!active) { setMenu(null); setDropTarget(null); setPreviewPath(null); } }, [active]);
  useEffect(() => { if (!transfer.drag) setDropTarget(null); }, [transfer.drag]);
  const focusPane = () => { if (!active) state.focusPane(pane.id); };
  const select = (entry: FileEntry, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    focusPane();
    if (event.shiftKey && anchor.current) {
      const start = entries.findIndex((value) => value.path === anchor.current);
      const end = entries.findIndex((value) => value.path === entry.path);
      const range = start < 0 ? [entry.path] : entries.slice(Math.min(start, end), Math.max(start, end) + 1).map((value) => value.path);
      setSelected((previous) => event.ctrlKey || event.metaKey ? [...new Set([...previous, ...range])] : range);
    } else {
      setSelected((previous) => event.ctrlKey || event.metaKey ? previous.includes(entry.path) ? previous.filter((value) => value !== entry.path) : [...previous, entry.path] : [entry.path]);
      anchor.current = entry.path;
    }
  };
  const openEntry = (entry: FileEntry) => {
    if (entry.isSymlink) { setError('暂不支持打开链接，请直接选择实际文件夹或文件。'); return; }
    if (entry.isDirectory) navigate(entry.path); else opening.mutate(entry.path);
  };
  const showModal = (value: Exclude<Modal, null>) => { setError(''); setName(value.kind === 'rename' ? value.entry.name : '未命名文件夹'); setModal(value); };
  const remember = (items: FileEntry[], mode: 'copy' | 'move') => {
    if (!items.length || items.some((entry) => entry.isSymlink)) return;
    transfer.remember(items, mode);
    setNotice(`已${mode === 'copy' ? '复制' : '剪切'} ${items.length} 个项目，在目标目录粘贴。`);
  };
  const paste = (destination = path) => {
    const clipboard = useTransfer.getState().clipboard;
    if (!clipboard || !destination) return;
    enqueue(clipboard.entries.map((entry) => ({ action: clipboard.mode, source: entry.path, destination })));
    // Consume cut intent once; failed queue items can be retried individually.
    if (clipboard.mode === 'move') transfer.clearClipboard();
  };
  const toOther = (mode: 'copy' | 'move') => { if (otherPath && editable) enqueue(chosen.map((entry) => ({ action: mode, source: entry.path, destination: otherPath }))); };
  useEffect(() => { setPathInput(displayPath(path)); setSelected([]); setSearch(''); setSubmitted(null); setFilters(emptyFilters); setOrganizing(null); setRenaming(null); setPreviewPath(null); anchor.current = null; }, [path]);
  useEffect(() => { setSelected([]); anchor.current = null; }, [search, showHidden, filters, recursive, submitted]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 5000); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!active) return;
    const handle = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (modal || menu || busy || document.querySelector('[data-state="open"][role="dialog"]') || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.target instanceof HTMLElement && event.target.closest('[data-preview-content],[contenteditable="true"],audio,video')) return;
      const key = event.key.toLowerCase();
      if (pane.view === 'gallery' && entries.length > 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && (event.target === document.body || (event.target instanceof HTMLElement && paneRef.current?.contains(event.target)))) {
        event.preventDefault();
        const index = current ? entries.findIndex((entry) => entry.path === current.path) : 0;
        const next = entries[Math.max(0, Math.min(entries.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))];
        setSelected([next.path]);
        anchor.current = next.path;
        const buttons = paneRef.current?.querySelectorAll<HTMLButtonElement>('.gallery-item');
        const button = Array.from(buttons ?? []).find((item) => item.dataset.filePath === next.path);
        button?.focus({ preventScroll: true });
        button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      if (event.code === 'Space' && event.target instanceof HTMLElement && event.target.closest('button:not([data-file-path]),audio,video,a,[role="slider"],[contenteditable="true"],[data-preview-content]')) return;
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !event.repeat && current && !current.isSymlink) { event.preventDefault(); setPreviewPath(current.path); }
      else if ((event.ctrlKey || event.metaKey) && key === 'a') { event.preventDefault(); setSelected(entries.map((entry) => entry.path)); }
      else if ((event.ctrlKey || event.metaKey) && key === 'f') { event.preventDefault(); setSearchOpen(true); searchRef.current?.focus(); }
      else if ((event.ctrlKey || event.metaKey) && key === 'c' && editable) { event.preventDefault(); remember(chosen, 'copy'); }
      else if ((event.ctrlKey || event.metaKey) && key === 'x' && editable) { event.preventDefault(); remember(chosen, 'move'); }
      else if ((event.ctrlKey || event.metaKey) && key === 'v') { event.preventDefault(); paste(); }
      else if (event.key === 'F2' && current && editable) { event.preventDefault(); showModal({ kind: 'rename', entry: current }); }
      else if (event.key === 'Delete' && editable) { event.preventDefault(); showModal({ kind: 'trash', entries: chosen }); }
      else if (event.key === 'Escape') setSelected([]);
      else if (event.altKey && event.key === 'ArrowUp' && directory.data?.parent) { event.preventDefault(); navigate(directory.data.parent); }
      else if (event.altKey && event.key === 'ArrowLeft' && pane.cursor > 0) { event.preventDefault(); state.step(pane.id, -1); }
      else if (event.altKey && event.key === 'ArrowRight' && pane.cursor < pane.history.length - 1) { event.preventDefault(); state.step(pane.id, 1); }
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  });
  const context = (event: MouseEvent, entry: FileEntry | null) => {
    event.preventDefault(); event.stopPropagation(); focusPane();
    if (entry && !selected.includes(entry.path)) setSelected([entry.path]);
    if (!entry) setSelected([]);
    setMenu({ x: event.clientX, y: event.clientY, entry });
  };
  const entryKey = (event: KeyboardEvent<HTMLButtonElement>, entry: FileEntry) => {
    if (event.key === 'Enter' && !busy) { event.preventDefault(); openEntry(entry); }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault(); if (!selected.includes(entry.path)) setSelected([entry.path]);
      const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.left + 20, y: rect.bottom, entry });
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = entries.findIndex((value) => value.path === entry.path);
      const next = entries[Math.max(0, Math.min(entries.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        select(next, event);
        const buttons = paneRef.current?.querySelectorAll<HTMLButtonElement>('[data-file-path]');
        Array.from(buttons ?? []).find((button) => button.dataset.filePath === next.path)?.focus();
      }
    }
  };
  const startDrag = (event: DragEvent, entry: FileEntry) => {
    const items = selected.includes(entry.path) ? chosen : [entry];
    if (items.some((value) => value.isSymlink)) { event.preventDefault(); return; }
    if (!selected.includes(entry.path)) setSelected([entry.path]);
    const token = transfer.beginDrag(items, pane.id);
    event.dataTransfer.setData(DRAG_TYPE, token); event.dataTransfer.effectAllowed = 'copyMove';
  };
  const dragOver = (event: DragEvent, destination: string) => {
    if (!destination || !event.dataTransfer.types.includes(DRAG_TYPE) || !useTransfer.getState().drag) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = event.shiftKey ? 'move' : 'copy'; setDropTarget(destination);
  };
  const drop = (event: DragEvent, destination: string) => {
    event.preventDefault(); event.stopPropagation(); focusPane(); setDropTarget(null);
    const drag = useTransfer.getState().drag;
    if (!drag || event.dataTransfer.getData(DRAG_TYPE) !== drag.token || !destination) return;
    const dest = normalizedPath(destination);
    if (drag.entries.some((entry) => dest === normalizedPath(entry.path) || (entry.isDirectory && dest.startsWith(`${normalizedPath(entry.path)}/`)))) { setError('不能拖放到项目自身或它的子文件夹中。'); transfer.endDrag(); return; }
    enqueue(drag.entries.map((entry) => ({ action: event.shiftKey ? 'move' : 'copy', source: entry.path, destination })));
    transfer.endDrag();
  };
  const menuItems = (): MenuItem[] => {
    const items = menu?.entry ? chosen.some((entry) => entry.path === menu.entry?.path) ? chosen : [menu.entry] : [];
    const one = items.length === 1 ? items[0] : undefined;
    const valid = items.length > 0 && items.every((entry) => !entry.isSymlink);
    return [
      ...(one ? [{ label: one.isDirectory ? '打开文件夹' : '打开', disabled: !valid, action: () => openEntry(one) }, ...(one.isDirectory ? [{ label: '在新标签中打开', disabled: !valid, action: () => state.addTab(one.path) }] : [])] : []),
      ...(one ? [{ label: '快速预览（空格）', disabled: !valid, action: () => setPreviewPath(one.path) }] : []),
      ...(one && recursive ? [{ label: '打开所在文件夹', action: () => navigate(one.path.replace(/[\\/][^\\/]+$/, '\\')) }] : []),
      { label: '复制', disabled: !valid, action: () => remember(items, 'copy') },
      { label: '剪切', disabled: !valid, action: () => remember(items, 'move') },
      { label: '粘贴到此处', disabled: !transfer.clipboard || !path, action: () => paste(one?.isDirectory && !one.isSymlink ? one.path : path) },
      { label: '复制到…', disabled: !valid, action: () => selectingTarget.mutate({ entries: items, mode: 'copy' }) },
      { label: '移动到…', disabled: !valid, action: () => selectingTarget.mutate({ entries: items, mode: 'move' }) },
      { label: '整理和排序', children: [
        { label: '分类整理…', disabled: !directory.data || recursive || busy || !entries.length, action: () => setOrganizing(items.length ? items : chosen.length ? chosen : entries) },
        { label: `${sort === 'name' ? '✓ ' : ''}按名称排序`, action: () => setSort('name') },
        { label: `${sort === 'modified' ? '✓ ' : ''}按修改日期排序`, action: () => setSort('modified') },
        { label: `${sort === 'size' ? '✓ ' : ''}按大小排序`, action: () => setSort('size') },
        { label: `${!descending ? '✓ ' : ''}升序`, action: () => setDescending(false) },
        { label: `${descending ? '✓ ' : ''}降序`, action: () => setDescending(true) },
      ] },
      { label: '批量更名…', disabled: busy || recursive || items.length < 2 || items.length > 500 || !valid || items.some((entry) => entry.isDirectory), action: () => setRenaming(items) },
      ...(one ? [{ label: '重命名', disabled: !valid, action: () => showModal({ kind: 'rename', entry: one }) }] : []),
      { label: '移入回收站', disabled: !valid, danger: true, action: () => showModal({ kind: 'trash', entries: items }) },
      { label: '新建文件夹', disabled: !directory.data, action: () => showModal({ kind: 'create' }) },
      { label: '全选', disabled: !entries.length, action: () => setSelected(entries.map((entry) => entry.path)) },
      { label: '刷新', disabled: !path, action: () => { void directory.refetch(); } },
    ];
  };
  const fileButton = (entry: FileEntry, grid: boolean) => <button className={grid ? `grid-item ${selected.includes(entry.path) ? 'selected' : ''}` : 'file-name'} data-file-path={entry.path} aria-pressed={selected.includes(entry.path)} draggable={!entry.isSymlink} onDragStart={(event) => { event.stopPropagation(); startDrag(event, entry); }} onDragEnd={() => { transfer.endDrag(); setDropTarget(null); }} onDragOver={(event) => { if (entry.isDirectory && !entry.isSymlink) dragOver(event, entry.path); }} onDrop={(event) => { if (entry.isDirectory && !entry.isSymlink) drop(event, entry.path); }} onClick={(event) => { event.stopPropagation(); select(entry, event); }} onDoubleClick={(event) => { event.stopPropagation(); if (!busy) openEntry(entry); }} onKeyDown={(event) => entryKey(event, entry)} onContextMenu={(event) => context(event, entry)}>{grid ? <EntryThumbnail key={`${entry.path}:${entry.modified}:${entry.size}`} entry={entry} /> : <Glyph entry={entry} />}<span className={grid ? 'grid-name' : ''}>{entry.name}{recursive && <small className="result-path" title={displayPath(entry.path)}>{displayPath(entry.path)}</small>}</span>{selected.includes(entry.path) && <Check size={12} className="selection-check" aria-hidden="true" />}{grid && <span className="grid-meta">{entry.isDirectory ? '文件夹' : size(entry.size)}</span>}</button>;
  const submit = () => {
    if (!modal) return;
    const requests: FileRequest[] = modal.kind === 'create' ? [{ action: 'createFolder', source: path, name }] : modal.kind === 'rename' ? [{ action: 'rename', source: modal.entry.path, name }] : modal.entries.map((entry) => ({ action: 'trash', source: entry.path }));
    enqueue(requests); setModal(null); setError(''); setSelected([]);
  };
  const returnToFiles = () => {
    const pane = paneRef.current;
    (pane?.querySelector<HTMLButtonElement>('[data-file-path][aria-pressed="true"]') ?? pane?.querySelector<HTMLButtonElement>('[data-file-path]') ?? pane)?.focus();
  };
  return <section tabIndex={-1} ref={paneRef} className={`browser-pane ${active ? 'pane-active' : ''} ${split ? 'compact-pane' : ''}`} aria-label={split ? `文件窗格：${pathLabel(path)}` : '文件浏览'} onPointerDownCapture={focusPane} onFocusCapture={focusPane}>
    {active && navigationTarget && createPortal(<><ToolbarItem id="back"><IconButton icon={ArrowLeft} label="后退 (Alt+←)" disabled={pane.cursor <= 0} onClick={() => state.step(pane.id, -1)} /></ToolbarItem><ToolbarItem id="forward"><IconButton icon={ArrowRight} label="前进 (Alt+→)" disabled={pane.cursor >= pane.history.length - 1} onClick={() => state.step(pane.id, 1)} /></ToolbarItem><ToolbarItem id="up"><IconButton icon={ArrowUp} label="上一级 (Alt+↑)" disabled={!directory.data?.parent} onClick={() => { if (directory.data?.parent) navigate(directory.data.parent); }} /></ToolbarItem><ToolbarItem id="name"><button type="button" className="workspace-directory-name" title={path || '选择一个文件夹'} disabled={!path} aria-haspopup="menu" aria-expanded={!!titleMenu} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); setTitleMenu({ x: event.clientX, y: event.clientY, path }); }} onKeyDown={(event) => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setTitleMenu({ x: bounds.left, y: bounds.bottom, path }); } }}>{pathLabel(path) || '览山'}</button></ToolbarItem></>, navigationTarget)}
    {active && titleMenu && <ContextMenu label="文件名操作" x={titleMenu.x} y={titleMenu.y} close={() => setTitleMenu(null)} items={[
      { label: '复制文件名', action: () => { void navigator.clipboard.writeText(pathLabel(titleMenu.path)).then(() => setNotice('已复制文件名')).catch(() => setError('复制文件名失败，请检查剪贴板访问权限。')); } },
      { label: '复制文件路径', action: () => { void navigator.clipboard.writeText(displayPath(titleMenu.path)).then(() => setNotice('已复制文件路径')).catch(() => setError('复制文件路径失败，请检查剪贴板访问权限。')); } },
    ]} />}
    {active && toolsTarget && createPortal(<><ToolbarItem id="inspector"><IconButton icon={PanelRight} label="显示或隐藏详情" active={state.inspector} onClick={state.toggleInspector} /></ToolbarItem><ToolbarItem id="search"><div className="menu-search"><button type="button" data-search-toggle className={`icon-button ${searchOpen || search ? 'active' : ''}`} aria-label="搜索文件 (Ctrl+F)" title="搜索文件 (Ctrl+F)" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Search size={18} aria-hidden="true" /></button>{searchOpen && <div className="menu-search-popover"><label className="search-box"><Search size={15} aria-hidden="true" /><input ref={searchRef} aria-label="搜索文件名称，多词以空格分隔" placeholder="搜索名称，空格组合关键词" value={search} maxLength={256} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setSearchOpen(false); event.stopPropagation(); toolsTarget?.querySelector<HTMLButtonElement>('[data-search-toggle]')?.focus(); } if (event.key === 'Enter') { if (searchReady) void recursiveSearch.refetch(); else setSubmitted({ path, query: search.trim(), showHidden, scope: searchScope }); } }} disabled={!path} />{search && <button aria-label="清除搜索" onClick={() => { setSearch(''); setSubmitted(null); }}><X size={13} /></button>}</label></div>}</div></ToolbarItem><ToolbarItem id="views"><div className="segmented" role="group" aria-label="视图模式"><IconButton icon={List} label="列表视图" active={pane.view === 'list'} onClick={() => state.setView(pane.id, 'list')} /><IconButton icon={LayoutGrid} label="图标视图" active={pane.view === 'grid'} onClick={() => state.setView(pane.id, 'grid')} /></div></ToolbarItem></>, toolsTarget)}
    {showAddressBar && <div className="address-row"><form className="address-form" onSubmit={(event) => { event.preventDefault(); if (pathInput.trim()) navigate(pathInput.trim()); }}><HardDrive size={14} aria-hidden="true" /><input aria-label="完整文件夹路径，按 Enter 跳转" value={pathInput} onChange={(event) => setPathInput(event.target.value)} placeholder="选择文件夹或输入已授权路径" disabled={!desktop} /><button type="submit" aria-label="跳转到路径" disabled={!desktop || !pathInput.trim()}><ChevronRight size={15} /></button></form><IconButton icon={RefreshCw} label="刷新目录" disabled={!path || directory.isFetching} onClick={() => void directory.refetch()} /></div>}
    {(searchOpen || filtering) && <div className="search-filters" aria-label="搜索与筛选"><label>范围<select value={searchScope} onChange={(event) => { setSearchScope(event.target.value as 'tree' | 'computer'); setSubmitted(null); }}><option value="tree">当前目录及子目录</option><option value="computer">整个电脑（所有磁盘）</option></select></label><label>种类<select value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value })}><option value="">全部种类</option><option value="folder">文件夹</option><option value="file">文件</option><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option><option value="pdf">PDF</option><option value="word">Word</option><option value="sheet">表格</option><option value="archive">压缩包</option><option value="code">代码</option><option value="markdown">Markdown</option></select></label><label>扩展名<input aria-label="扩展名，逗号分隔" placeholder="如 pdf, docx" value={filters.extension} onChange={(event) => setFilters({ ...filters, extension: event.target.value })} /></label><label>大小<select value={filters.size} onChange={(event) => setFilters({ ...filters, size: event.target.value })}><option value="">不限大小</option><option value="large">≥ 100 MiB</option><option value="small">≤ 1 MiB</option></select></label><label>修改时间<select value={filters.modified} onChange={(event) => setFilters({ ...filters, modified: event.target.value })}><option value="">不限时间</option><option value="1">最近 24 小时</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></label><button className="search-submit" disabled={!path || recursiveSearch.isFetching} onClick={() => { if (searchReady) void recursiveSearch.refetch(); else setSubmitted({ path, query: search.trim(), showHidden, scope: searchScope }); }}>{recursiveSearch.isFetching ? '检索中…' : '搜索'}</button><button className="text-button" onClick={() => { setFilters(emptyFilters); setSearch(''); setSubmitted(null); setSearchScope('tree'); }}>重置</button></div>}
    <div className="content-layout"><main className={`file-pane ${dropTarget === path ? 'drop-active' : ''}`} aria-label="文件区域" onDragOver={(event) => dragOver(event, path)} onDrop={(event) => drop(event, path)} onDragLeave={(event) => { if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return; setDropTarget(null); }}>
      {split && <div className="cross-pane-actions"><button disabled={!editable || !otherPath} onClick={() => toOther('copy')}>复制到另一栏</button><button disabled={!editable || !otherPath} onClick={() => toOther('move')}>移动到另一栏</button><span>拖放复制 · Shift 拖放移动</span></div>}
      {recursive && <div className="search-feedback" role="status">{!searchReady ? '输入名称或设置筛选后，按 Enter 或点击“搜索”。' : recursiveSearch.isFetching ? (searchScope === 'computer' ? '正在检索所有磁盘…' : '正在检索当前目录及其子目录…') : recursiveSearch.isError ? <span role="alert">{errorMessage(recursiveSearch.error)} <button onClick={() => void recursiveSearch.refetch()}>重试</button></span> : recursiveSearch.data ? `已扫描 ${recursiveSearch.data.scanned} 项 · ${entries.length} 项匹配 · ${recursiveSearch.data.skipped} 项不可读或链接已跳过${recursiveSearch.data.limited ? ' · 结果不完整，已达到扫描、时间或深度上限，请缩小范围' : ''}。类型、大小和日期筛选应用于已返回结果。` : ''}</div>}
      {error && <div className="error-banner" role="alert"><Info size={16} /><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误提示"><X size={15} /></button></div>}
      {iconLayouts.error && <div className="error-banner" role="alert"><span>{iconLayouts.error}</span><button aria-label="关闭图标布局提示" onClick={iconLayouts.dismiss}><X size={15} /></button></div>}
      {notice && <div className="pane-notice" role="status">{notice}</div>}
      <div className="files-scroll" aria-busy={directory.isFetching || (recursive && recursiveSearch.isFetching)} tabIndex={0} onContextMenu={(event) => context(event, null)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.left + 20, y: rect.top + 20, entry: null }); } }}>
      {!path ? <Empty icon={Mountain} title={desktop ? '从一个文件夹，开始览山' : '你好，欢迎来到览山'}><p>{desktop ? '选择侧栏位置，或打开一个文件夹。' : '请通过 Tauri 桌面应用浏览与整理 Windows 文件。'}</p><button className="primary-button" disabled={!desktop || busy} onClick={() => picking.mutate()}><FolderOpen size={16} />打开文件夹</button></Empty>
      : directory.isPending ? <div className="loading-state" role="status"><LoaderCircle className="spin" size={26} /><p>正在读取文件夹…</p></div>
      : directory.isError ? <Empty icon={Info} title="无法打开这个文件夹"><p>{errorMessage(directory.error)}</p><button className="primary-button" onClick={() => void directory.refetch()}>重新读取</button><button className="text-button" disabled={picking.isPending} onClick={() => picking.mutate()}>重新选择文件夹授权…</button></Empty>
      : recursive && (!searchReady || recursiveSearch.isPending || recursiveSearch.isError) ? <Empty icon={Search} title={recursiveSearch.isFetching ? '正在搜索…' : recursiveSearch.isError ? '搜索未完成' : '搜索'}><p>按名称搜索，不读取文件内容。当前目录最多扫描 30,000 项、约 3 秒；整个电脑每个磁盘使用相同额度。每个磁盘最多返回 2,000 项，达到上限时会提示结果不完整。</p></Empty>
      : entries.length === 0 ? <Empty icon={filtering ? Search : FolderOpen} title={filtering ? '没有找到匹配的项目' : '这里还没有文件'}><p>{filtering ? '试试其他关键词，或重置筛选条件。' : '新建文件夹、粘贴文件，或从另一栏拖入。'}</p>{filtering && <button className="text-button" onClick={() => { setSearch(''); setFilters(emptyFilters); setSubmitted(null); setSearchScope('tree'); }}>重置搜索与筛选</button>}</Empty>
      : pane.view === 'gallery' ? <div className="gallery-view"><div className="gallery-preview" data-preview-content>{(() => { const entry = current ?? entries[0]; return <><FilePreview key={`${entry.path}:${entry.modified}:${entry.size}`} entry={entry} expanded /><button className="text-button" disabled={entry.isSymlink || busy} onClick={() => openEntry(entry)}>{entry.name}</button></>; })()}</div><div className="gallery-strip" role="group" aria-label="画廊文件">{entries.map((entry) => <button key={entry.path} className={`gallery-item ${(current ?? entries[0]).path === entry.path ? 'selected' : ''}`} data-file-path={entry.path} onKeyDown={(event) => entryKey(event, entry)} aria-pressed={(current ?? entries[0]).path === entry.path} title={entry.name} onClick={(event) => select(entry, event)} onDoubleClick={() => !busy && openEntry(entry)} onContextMenu={(event) => context(event, entry)}><EntryThumbnail entry={entry} /><span>{entry.name}</span></button>)}</div></div>
      : pane.view === 'list' ? <div className="file-list" role="grid" aria-label="文件列表" aria-multiselectable="true"><div className="list-header" role="row"><span role="columnheader">名称</span><span role="columnheader">修改日期</span><span role="columnheader">大小</span><span role="columnheader">种类</span></div>{entries.map((entry) => <div key={entry.path} role="row" className={`file-row ${selected.includes(entry.path) ? 'selected' : ''} ${dropTarget === entry.path ? 'drop-folder' : ''}`} aria-selected={selected.includes(entry.path)} onClick={(event) => select(entry, event)} onDoubleClick={() => !busy && openEntry(entry)} draggable={!entry.isSymlink} onDragStart={(event) => startDrag(event, entry)} onDragEnd={() => { transfer.endDrag(); setDropTarget(null); }} onDragOver={(event) => { if (entry.isDirectory && !entry.isSymlink) dragOver(event, entry.path); }} onDrop={(event) => { if (entry.isDirectory && !entry.isSymlink) drop(event, entry.path); }} onContextMenu={(event) => context(event, entry)}><div role="gridcell">{fileButton(entry, false)}</div><span role="gridcell" className="metadata">{date(entry.modified)}</span><span role="gridcell" className="metadata">{entry.isDirectory ? '—' : size(entry.size)}</span><span role="gridcell" className="metadata">{fileKind(entry)}</span></div>)}</div>
      : <IconCanvas key={path} paneId={pane.id} entries={entries} allEntries={recursive ? entries : [...(directory.data?.entries ?? entries)].sort(compareEntries)} layout={effectiveLayout} selected={selected} renderEntry={(entry) => fileButton(entry, true)} save={(positions) => iconLayouts.update(path, { positions })} dropTarget={dropTarget} clearDropTarget={() => setDropTarget(null)} />}
      </div><footer className="status-bar">{showPathBar && directory.data && <nav className="breadcrumbs" aria-label="文件夹层级">{directory.data.ancestors.map((crumb, index) => <span key={crumb.path}>{index > 0 && <ChevronRight size={12} aria-hidden="true" />}<button title={crumb.path} aria-current={index === (directory.data?.ancestors.length ?? 0) - 1 ? 'location' : undefined} onClick={() => navigate(crumb.path)}>{crumb.name}</button></span>)}</nav>}{directory.data && (chosen.length > 0 || directory.data.skipped > 0) && <span className="selection-status">{[chosen.length ? `已选 ${chosen.length} 项` : '', directory.data.skipped ? `${directory.data.skipped} 项无法读取` : ''].filter(Boolean).join(' · ')}</span>}<div className="selection-actions">{chosen.length > 0 && <button onClick={() => setSelected([])}>清除</button>}</div></footer>
    </main>
    {state.inspector && active && <aside className="inspector" aria-label="文件详情"><div className="inspector-heading">{chosen.length > 1 ? `${chosen.length} 个项目` : '文件详情'}<IconButton icon={X} label="关闭详情" onClick={state.toggleInspector} /></div>{current ? <>{previewPath ? <div className="preview"><Glyph entry={current} large /></div> : <FilePreview key={`${current.path}:${current.modified}:${current.size}`} entry={current} />}<button className="inspector-preview-button" disabled={current.isSymlink} onClick={() => setPreviewPath(current.path)}>快速预览 <kbd>空格</kbd></button><div className="inspector-name"><h2>{current.name}</h2><span>{fileKind(current)}</span></div><div className="detail-section"><h3>信息</h3><dl><div><dt>种类</dt><dd>{fileKind(current)}</dd></div><div><dt>大小</dt><dd>{current.isDirectory ? '—' : size(current.size)}</dd></div><div><dt>修改时间</dt><dd>{date(current.modified)}</dd></div><div className="path-detail"><dt>位置</dt><dd>{displayPath(current.path)}</dd></div></dl></div><button className="open-button" disabled={busy || current.isSymlink} onClick={() => openEntry(current)}><FolderOpen size={16} />{current.isDirectory ? '打开文件夹' : '使用默认应用打开'}</button></> : chosen.length > 1 ? <div className="multi-summary"><Copy size={38} /><h2>已选择 {chosen.length} 个项目</h2><p>{chosen.filter((entry) => entry.isDirectory).length} 个文件夹 · {chosen.filter((entry) => !entry.isDirectory).length} 个文件</p><p>文件合计 {size(chosen.filter((entry) => !entry.isDirectory).reduce((total, entry) => total + entry.size, 0))}</p><small>不包含文件夹内容大小</small></div> : <div className="inspector-empty"><Mountain size={48} strokeWidth={1} /><h3>一览，便有章法</h3><p>Ctrl 点击多选<br />Shift 点击连续选择<br />右键查看更多操作</p></div>}</aside>}
    </div>
    {previewPath && <QuickLook key={previewPath} path={previewPath} entries={entries.filter((entry) => !entry.isSymlink)} select={(entry) => setSelected([entry.path])} close={() => setPreviewPath(null)} returnFocus={() => {
      const selectedPath = paneRef.current?.querySelector<HTMLButtonElement>('[data-file-path][aria-pressed="true"]');
      (selectedPath ?? paneRef.current)?.focus();
    }} />}
    {renaming && <BatchRenameDialog path={path} entries={renaming} close={() => setRenaming(null)} returnFocus={returnToFiles} />}
    {organizing && <OrganizeDialog path={path} entries={organizing} close={() => setOrganizing(null)} returnFocus={returnToFiles} />}
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems()} close={closeMenu} />}
    <Dialog.Root open={modal !== null} onOpenChange={(open) => { if (!open) setModal(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content" onCloseAutoFocus={(event) => { event.preventDefault(); paneRef.current?.focus(); }}><div className="dialog-icon">{modal?.kind === 'trash' ? <Trash2 size={27} /> : <FolderPlus size={27} />}</div><Dialog.Title>{modal?.kind === 'trash' ? `将 ${modal.entries.length} 个项目移入回收站？` : modal?.kind === 'rename' ? '重命名' : '新建文件夹'}</Dialog.Title><Dialog.Description>{modal?.kind === 'trash' ? '所选项目将加入操作队列。Windows 可能再次要求确认；若提示永久删除，请取消。' : '操作加入队列依次执行；同名项目不会被覆盖，可在队列中改名重试。'}</Dialog.Description>{modal?.kind === 'trash' && <ul className="trash-preview">{modal.entries.slice(0, 6).map((entry) => <li key={entry.path}>{entry.name}</li>)}{modal.entries.length > 6 && <li>以及其他 {modal.entries.length - 6} 个项目</li>}</ul>}<form onSubmit={(event) => { event.preventDefault(); submit(); }}>{modal?.kind !== 'trash' && <label className="name-field">名称<input autoFocus value={name} maxLength={240} onFocus={(event) => event.target.select()} onChange={(event) => setName(event.target.value)} /></label>}<div className="dialog-buttons"><Dialog.Close asChild><button type="button" className="secondary-button">取消</button></Dialog.Close><button type="submit" className={modal?.kind === 'trash' ? 'danger-button' : 'primary-button'} disabled={modal?.kind !== 'trash' && !name.trim()}>{modal?.kind === 'trash' ? '加入回收站队列' : '确认'}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}

