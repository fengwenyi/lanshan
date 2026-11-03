import { ToolbarItem, ToolbarCustomization } from './ToolbarCustomization';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Columns2, FolderOpen, HardDrive, ListChecks, Minus, Mountain, PanelLeft, TextCursorInput, Plus, Square, Copy, Star, X } from 'lucide-react';
import { desktop, errorMessage, files, normalizedPath, pathLabel } from './api';
import { panePath, useExplorer } from './store';
import { favoriteKey } from './workspaceStorage';
import { locationIcon, IconButton } from './components';
import { FilePane } from './FilePane';
import { QueuePanel } from './QueuePanel';
import { useQueue } from './queue';
import { usePreferences } from './preferences';
import { WorkspaceMenu } from './WorkspaceMenu';
import { ContextMenu, type MenuItem } from './ContextMenu';

export function Explorer() {
  const state = useExplorer();
  const preferences = usePreferences();
  const client = useQueryClient();
  const queueOpen = useQueue((value) => value.open);
  const toggleQueue = useQueue((value) => value.toggle);
  const pending = useQueue((value) => value.jobs.filter((job) => job.status === 'running' || job.status === 'waiting').length);
  const [error, setError] = useState('');
  const [navigationTools, setNavigationTools] = useState<HTMLDivElement | null>(null);
  const [paneTools, setPaneTools] = useState<HTMLDivElement | null>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [toolbarMenu, setToolbarMenu] = useState<{ x: number; y: number } | null>(null);
  const [customizingToolbar, setCustomizingToolbar] = useState(false);
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const current = getCurrentWindow();
    const sync = () => { void current.isMaximized().then((value) => { if (!disposed) setMaximized(value); }).catch((e: unknown) => { if (!disposed) setError(errorMessage(e)); }); };
    sync();
    void current.onResized(sync).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch((e: unknown) => { if (!disposed) setError(errorMessage(e)); });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  const tablist = useRef<HTMLDivElement>(null);
  const tab = state.tabs.find((value) => value.id === state.activeTabId) ?? state.tabs[0];
  const focused = tab.panes.find((value) => value.id === tab.activePaneId) ?? tab.panes[0];
  const path = panePath(focused);
  const showTabs = state.tabs.length > 1 || preferences.tabBar === 'show';
  const locations = useQuery({ queryKey: ['locations'], queryFn: files.locations, enabled: desktop });
  const navigation = useMutation({ mutationFn: async ({ id, paneId }: { id: string | null; paneId: string }) => {
    const next = id === null ? await files.chooseFolder() : await files.selectLocation(id);
    return { next, paneId };
  }, onSuccess: ({ next, paneId }) => { if (next) { state.navigate(paneId, next); void client.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'directory' && typeof query.queryKey[1] === 'string' && normalizedPath(query.queryKey[1]) === normalizedPath(next) }); setError(''); } }, onError: (e) => setError(errorMessage(e)) });
  useEffect(() => {
    const settled = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== 'object' || !('source' in detail) || typeof detail.source !== 'string'
        || !('action' in detail) || typeof detail.action !== 'string'
        || !['createFolder', 'rename', 'copy', 'move', 'trash'].includes(detail.action)) return;
      const request = { source: detail.source, action: detail.action,
        destination: 'destination' in detail && typeof detail.destination === 'string' ? detail.destination : undefined };
      const parent = (value: string) => normalizedPath(value).replace(/\/[^/]*$/, '');
      const affected = new Set([
        request.action === 'createFolder' ? normalizedPath(request.source) : parent(request.source),
        request.destination ? normalizedPath(request.destination) : '',
      ]);
      void client.invalidateQueries({ predicate: (query) => {
        if (query.queryKey[0] !== 'directory' || typeof query.queryKey[1] !== 'string') return false;
        const data: unknown = query.state.data;
        const cachedPath = data && typeof data === 'object' && 'path' in data && typeof data.path === 'string' ? data.path : query.queryKey[1];
        return affected.has(normalizedPath(cachedPath)) || affected.has(normalizedPath(query.queryKey[1]));
      } });
    };
    window.addEventListener('lanshan:operation-settled', settled);
    return () => window.removeEventListener('lanshan:operation-settled', settled);
  }, [client]);
  useEffect(() => {
    const keyboard = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || document.querySelector('[data-state="open"][role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === 't') { event.preventDefault(); state.addTab(); }
      else if (key === 'w') { event.preventDefault(); state.closeTab(tab.id); }
      else if (event.key === 'Tab') {
        event.preventDefault();
        const index = state.tabs.findIndex((value) => value.id === tab.id);
        state.activateTab(state.tabs[(index + (event.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length].id);
      }
      else if (event.shiftKey && key === 'd') { event.preventDefault(); state.toggleSplit(); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  });
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      const current = useQueue.getState();
      if (current.jobs.some((job) => job.status === 'waiting' || job.status === 'running')) {
        event.preventDefault();
        setError('仍有文件任务未结束，请先完成或取消任务，再关闭窗口。');
        if (!current.open) current.toggle();
      }
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch((e: unknown) => setError(errorMessage(e)));
    return () => { disposed = true; unlisten?.(); };
  }, []);
  const tabKey = (event: KeyboardEvent, index: number) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      setTabMenu({ id: state.tabs[index].id, x: bounds.left, y: bounds.bottom });
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? state.tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + state.tabs.length) % state.tabs.length;
    state.activateTab(state.tabs[next].id);
    tablist.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const windowAction = (action: 'close' | 'minimize' | 'toggleMaximize') => {
    if (!desktop) return;
    if (action === 'close' && pending > 0) {
      setError('仍有文件任务未结束，请先完成或取消任务，再关闭窗口。');
      if (!queueOpen) toggleQueue();
      return;
    }
    void getCurrentWindow()[action]().catch((e: unknown) => setError(errorMessage(e)));
  };
  const choose = (id: string | null) => navigation.mutate({ id, paneId: focused.id });
  const menuTab = state.tabs.find((value) => value.id === tabMenu?.id);
  const menuPath = menuTab ? panePath(menuTab.panes.find((value) => value.id === menuTab.activePaneId) ?? menuTab.panes[0]) : '';
  const tabItems: MenuItem[] = menuTab ? [
    { label: '新建标签', disabled: state.tabs.length >= 12, action: () => state.addTab() },
    { label: '复制标签', disabled: state.tabs.length >= 12, action: () => state.duplicateTab(menuTab.id) },
    { label: '复制文件夹路径', disabled: !menuPath, action: () => { void navigator.clipboard.writeText(menuPath).catch(() => setError('复制路径失败，请检查剪贴板访问权限。')); } },
    { label: '关闭标签', action: () => state.closeTab(menuTab.id) },
    { label: '关闭其他标签', disabled: state.tabs.length < 2, action: () => state.closeTabs(menuTab.id, 'others') },
    { label: '关闭右侧标签', disabled: state.tabs[state.tabs.length - 1].id === menuTab.id, action: () => state.closeTabs(menuTab.id, 'right') },
    { label: '关闭全部标签', action: () => state.closeTabs(menuTab.id, 'all') },
  ] : [];
  return <div className={`explorer advanced-explorer ${preferences.sidebar ? '' : 'sidebar-hidden'} ${preferences.compact ? 'compact-list' : ''}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'none'; }} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) setError('当前支持览山内部拖放。要整理外部文件，请先打开它所在的文件夹。'); }}>
    <aside id="workspace-sidebar" className="sidebar" hidden={!preferences.sidebar}><div className="brand" data-tauri-drag-region><Mountain size={31} strokeWidth={1.45} aria-hidden="true" /><div><strong>览山</strong><span>LANSHAN</span></div></div>
      <nav aria-label="文件位置"><p className="sidebar-label">个人收藏</p>{locations.isLoading && <p className="sidebar-hint">正在读取位置…</p>}{locations.isError && <button className="nav-item" onClick={() => void locations.refetch()}>位置读取失败，重试</button>}{(locations.data ?? []).filter((item) => item.kind !== 'drive').map((item) => {
        const Icon = locationIcon(item);
        return <button key={item.id} aria-label={item.name} title={`在当前窗格打开${item.name}`} className={`nav-item ${normalizedPath(path) === normalizedPath(item.path) ? 'selected' : ''}`} disabled={navigation.isPending} onClick={() => choose(item.id)}><Icon size={18} aria-hidden="true" /><span>{item.name}</span></button>;
      })}<p className="sidebar-label locations-label">我的收藏</p><button className="nav-item favorite-add" disabled={!desktop || !path} onClick={() => { const exists = state.favorites.some((item) => favoriteKey(item.path) === favoriteKey(path)); if (exists) state.removeFavorite(path); else state.addFavorite(path, pathLabel(path)); }} title={state.favorites.some((item) => favoriteKey(item.path) === favoriteKey(path)) ? '取消收藏当前文件夹' : '收藏当前文件夹'} aria-label={state.favorites.some((item) => favoriteKey(item.path) === favoriteKey(path)) ? '取消收藏当前文件夹' : '收藏当前文件夹'}><Star size={17} /><span>{state.favorites.some((item) => favoriteKey(item.path) === favoriteKey(path)) ? '取消当前收藏' : '收藏当前文件夹'}</span></button>{state.favorites.map((item) => <div className="favorite-row" key={item.path}><button className={`nav-item ${favoriteKey(path) === favoriteKey(item.path) ? 'selected' : ''}`} title={item.path} aria-label={`打开收藏：${item.name}`} disabled={!desktop} onClick={() => state.navigate(focused.id, item.path)}><FolderOpen size={17} /><span>{item.name}</span></button><button className="favorite-remove" title={`移除收藏 ${item.name}`} aria-label={`移除收藏 ${item.name}`} onClick={() => state.removeFavorite(item.path)}><X size={12} /></button></div>)}{!desktop && <p className="sidebar-hint">常用目录将在桌面应用中显示。</p>}<p className="sidebar-label locations-label">位置 <HardDrive size={12} aria-hidden="true" /></p>{(locations.data ?? []).filter((item) => item.kind === 'drive').map((item) => <button key={item.id} aria-label={item.name} title={item.name} className={`nav-item ${normalizedPath(path) === normalizedPath(item.path) ? 'selected' : ''}`} disabled={navigation.isPending} onClick={() => choose(item.id)}><HardDrive size={18} aria-hidden="true" /><span>{item.name}</span></button>)}<button className="nav-item" aria-label="打开文件夹" title="在当前窗格打开文件夹" disabled={!desktop || navigation.isPending} onClick={() => choose(null)}><FolderOpen size={18} aria-hidden="true" /><span>打开文件夹…</span></button></nav>
    </aside>
    <div className="workspace"><div className="workspace-bar" data-tauri-drag-region onContextMenu={(event) => { event.preventDefault(); setToolbarMenu({ x: event.clientX, y: event.clientY }); }}><ToolbarItem id="sidebar"><button className="icon-button" aria-label={preferences.sidebar ? '隐藏左侧边栏' : '显示左侧边栏'} title={preferences.sidebar ? '隐藏左侧边栏' : '显示左侧边栏'} aria-pressed={preferences.sidebar} aria-controls="workspace-sidebar" onClick={() => preferences.change({ sidebar: !preferences.sidebar })}><PanelLeft size={18} aria-hidden="true" /></button></ToolbarItem><div className="workspace-navigation" ref={setNavigationTools} /><div className="workspace-toolbar-actions"><ToolbarItem id="address"><IconButton icon={TextCursorInput} label={preferences.showAddressBar ? '隐藏地址栏' : '显示地址栏'} active={preferences.showAddressBar} onClick={() => preferences.change({ showAddressBar: !preferences.showAddressBar })} /></ToolbarItem><ToolbarItem id="tab"><IconButton icon={Plus} label="新建标签 (Ctrl+T)" disabled={state.tabs.length >= 12} onClick={() => state.addTab()} /></ToolbarItem><ToolbarItem id="split"><IconButton icon={Columns2} label="双栏浏览 (Ctrl+Shift+D)" active={tab.panes.length === 2} onClick={state.toggleSplit} /></ToolbarItem><ToolbarItem id="queue"><button className={`queue-toggle ${queueOpen ? 'active' : ''}`} onClick={toggleQueue} aria-expanded={queueOpen}><ListChecks size={17} />文件操作{pending > 0 && <span>{pending}</span>}</button></ToolbarItem></div><div className="workspace-pane-tools" ref={setPaneTools} /><WorkspaceMenu /><div className="window-controls" role="group" aria-label="窗口控制"><button type="button" aria-label="最小化窗口" title="最小化" disabled={!desktop} onClick={() => windowAction('minimize')}><Minus size={14} aria-hidden="true" /></button><button type="button" aria-label={maximized ? '还原窗口' : '最大化窗口'} title={maximized ? '还原' : '最大化'} disabled={!desktop} onClick={() => windowAction('toggleMaximize')}>{maximized ? <Copy size={12} aria-hidden="true" /> : <Square size={12} aria-hidden="true" />}</button><button type="button" className="window-close" aria-label="关闭窗口" title="关闭" disabled={!desktop} onClick={() => windowAction('close')}><X size={16} aria-hidden="true" /></button></div></div>
      {showTabs && <div ref={tablist} className="tab-strip" role="tablist" aria-label="文件夹标签">{state.tabs.map((value, index) => <div key={value.id} className={`tab ${value.id === tab.id ? 'active' : ''}`} onContextMenu={(event) => { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>('[role=tab]')?.focus(); setTabMenu({ id: value.id, x: event.clientX, y: event.clientY }); }}><button type="button" role="tab" id={`tab-${value.id}`} aria-controls={`panel-${value.id}`} aria-selected={value.id === tab.id} tabIndex={value.id === tab.id ? 0 : -1} title={panePath(value.panes.find((item) => item.id === value.activePaneId) ?? value.panes[0]) || '新标签'} onClick={() => state.activateTab(value.id)} onKeyDown={(event) => tabKey(event, index)} onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); state.closeTab(value.id); } }}><FolderOpen size={14} /><span>{pathLabel(panePath(value.panes.find((item) => item.id === value.activePaneId) ?? value.panes[0]))}</span>{value.panes.length === 2 && <Columns2 size={12} />}</button><button className="close-tab" aria-label={`关闭标签 ${index + 1}`} onClick={() => state.closeTab(value.id)}><X size={12} /></button></div>)}<IconButton icon={Plus} label="新建标签 (Ctrl+T)" disabled={state.tabs.length >= 12} onClick={() => state.addTab()} /></div>}
      {state.storageError && <div className="error-banner global-error" role="alert"><span>{state.storageError}</span><button aria-label="关闭存储提示" onClick={state.dismissStorageError}><X size={15} /></button></div>}
      {error && <div className="error-banner global-error" role="alert"><span>{error}</span><button aria-label="关闭提示" onClick={() => setError('')}><X size={15} /></button></div>}
      {state.tabs.map((value) => <div key={value.id} id={`panel-${value.id}`} role="tabpanel" aria-labelledby={showTabs ? `tab-${value.id}` : undefined} aria-label={!showTabs ? pathLabel(panePath(value.panes.find((item) => item.id === value.activePaneId) ?? value.panes[0])) || '文件浏览' : undefined} hidden={value.id !== tab.id} className={`pane-deck ${value.panes.length === 2 ? 'split-deck' : ''}`}>{value.panes.map((pane, index) => <FilePane key={pane.id} toolsTarget={paneTools} navigationTarget={navigationTools} pane={pane} active={value.id === tab.id && pane.id === value.activePaneId} visible={value.id === tab.id} split={value.panes.length === 2} otherPath={value.panes.length === 2 ? panePath(value.panes[1 - index]) : undefined} />)}</div>)}
    </div><QueuePanel />
    <ToolbarCustomization open={customizingToolbar} close={() => setCustomizingToolbar(false)} />
    {toolbarMenu && <ContextMenu label="工具栏操作" x={toolbarMenu.x} y={toolbarMenu.y} close={() => setToolbarMenu(null)} items={[{ label: '自定义工具栏…', action: () => setCustomizingToolbar(true) }]} />}
    {tabMenu && menuTab && <ContextMenu label="标签操作" x={tabMenu.x} y={tabMenu.y} items={tabItems} close={() => setTabMenu(null)} />}
  </div>;
}
