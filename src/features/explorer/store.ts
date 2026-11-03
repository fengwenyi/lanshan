import { create } from 'zustand';
import { usePreferences } from './preferences';
import type { FileEntry } from './types';
import { favoriteKey, readWorkspace, validPath, workspaceSnapshot, WORKSPACE_KEY, type Favorite } from './workspaceStorage';

export interface PaneState {
  id: string;
  history: string[];
  cursor: number;
  view: 'grid' | 'list' | 'gallery';
}
export interface TabState { id: string; panes: PaneState[]; activePaneId: string }
const id = () => crypto.randomUUID();
const pane = (path = ''): PaneState => ({ id: id(), history: path ? [path] : [], cursor: path ? 0 : -1, view: usePreferences.getState().defaultView });
const tab = (path = ''): TabState => { const first = pane(path); return { id: id(), panes: [first], activePaneId: first.id }; };
export const panePath = (value: PaneState): string => value.history[value.cursor] ?? '';
interface ExplorerState {
  tabs: TabState[];
  activeTabId: string;
  inspector: boolean;
  favorites: Favorite[];
  storageError: string;
  addFavorite: (path: string, name: string) => void;
  removeFavorite: (path: string) => void;
  dismissStorageError: () => void;
  activateTab: (tabId: string) => void;
  addTab: (path?: string) => void;
  closeTab: (tabId: string) => void;
  duplicateTab: (tabId: string) => void;
  closeTabs: (tabId: string, scope: 'others' | 'right' | 'all') => void;
  focusPane: (paneId: string) => void;
  navigate: (paneId: string, path: string) => void;
  step: (paneId: string, offset: number) => void;
  setView: (paneId: string, view: PaneState['view']) => void;
  toggleSplit: () => void;
  toggleInspector: () => void;
}
const first = tab();
const restored = (() => { try { return readWorkspace(window.localStorage); } catch { return { value: null, error: '本地存储不可用，工作区仅在本次会话保留。' }; } })();
const restoredTabs = restored.value?.tabs.map((saved): TabState => {
  const panes = saved.panes.map((item): PaneState => ({ ...item, id: id() }));
  return { id: id(), panes, activePaneId: panes[saved.activePane].id };
}) ?? [first];
function updatePane(tabs: TabState[], paneId: string, change: (value: PaneState) => PaneState): TabState[] {
  return tabs.map((value) => ({ ...value, panes: value.panes.map((item) => item.id === paneId ? change(item) : item) }));
}
export const useExplorer = create<ExplorerState>((set) => ({
  tabs: restoredTabs, activeTabId: restoredTabs[restored.value?.activeTab ?? 0].id, inspector: restored.value?.inspector ?? true,
  favorites: restored.value?.favorites ?? [], storageError: restored.error,
  addFavorite: (path, name) => set((s) => {
    if (!validPath(path) || !name.trim() || name.length > 255 || /\p{Cc}/u.test(name) || s.favorites.some((item) => favoriteKey(item.path) === favoriteKey(path))) return s;
    if (s.favorites.length >= 40) return { storageError: '最多保存 40 个收藏，请先移除不再使用的收藏。' };
    return { favorites: [...s.favorites, { path, name }] };
  }),
  removeFavorite: (path) => set((s) => ({ favorites: s.favorites.filter((item) => favoriteKey(item.path) !== favoriteKey(path)) })),
  dismissStorageError: () => set({ storageError: '' }),
  activateTab: (activeTabId) => set({ activeTabId }),
  addTab: (path = '') => set((s) => { if (path && !validPath(path)) return { storageError: '请输入完整的 Windows 文件夹路径。' }; if (s.tabs.length >= 12) return { storageError: '最多打开 12 个标签，请先关闭部分标签。' }; const next = tab(path); return { tabs: [...s.tabs, next], activeTabId: next.id }; }),
  closeTab: (tabId) => set((s) => {
    const index = s.tabs.findIndex((value) => value.id === tabId);
    if (index < 0) return s;
    const remaining = s.tabs.filter((value) => value.id !== tabId);
    if (!remaining.length) { const next = tab(); return { tabs: [next], activeTabId: next.id }; }
    return { tabs: remaining, activeTabId: s.activeTabId === tabId ? remaining[Math.min(index, remaining.length - 1)].id : s.activeTabId };
  }),
  duplicateTab: (tabId) => set((s) => {
    const index = s.tabs.findIndex((value) => value.id === tabId);
    if (index < 0) return s;
    if (s.tabs.length >= 12) return { storageError: '最多打开 12 个标签，请先关闭部分标签。' };
    const source = s.tabs[index];
    const panes = source.panes.map((value) => ({ ...value, id: id(), history: [...value.history] }));
    const next = { id: id(), panes, activePaneId: panes[Math.max(0, source.panes.findIndex((value) => value.id === source.activePaneId))].id };
    return { tabs: [...s.tabs.slice(0, index + 1), next, ...s.tabs.slice(index + 1)], activeTabId: next.id };
  }),
  closeTabs: (tabId, scope) => set((s) => {
    const index = s.tabs.findIndex((value) => value.id === tabId);
    if (index < 0) return s;
    const remaining = scope === 'others' ? [s.tabs[index]] : scope === 'right' ? s.tabs.slice(0, index + 1) : [];
    if (!remaining.length) { const next = tab(); return { tabs: [next], activeTabId: next.id }; }
    return { tabs: remaining, activeTabId: remaining.some((value) => value.id === s.activeTabId) ? s.activeTabId : tabId };
  }),
  focusPane: (paneId) => set((s) => ({ tabs: s.tabs.map((value) => value.panes.some((item) => item.id === paneId) ? { ...value, activePaneId: paneId } : value) })),
  navigate: (paneId, path) => set((s) => !validPath(path) ? { storageError: '请输入完整的 Windows 文件夹路径。' } : ({ tabs: updatePane(s.tabs, paneId, (value) => {
    if (panePath(value) === path) return value;
    const history = [...value.history.slice(0, value.cursor + 1), path].slice(-30);
    return { ...value, history, cursor: history.length - 1 };
  }) })),
  step: (paneId, offset) => set((s) => ({ tabs: updatePane(s.tabs, paneId, (value) => ({ ...value, cursor: Math.max(-1, Math.min(value.history.length - 1, Math.max(0, value.cursor + offset))) })) })),
  setView: (paneId, view) => set((s) => ({ tabs: updatePane(s.tabs, paneId, (value) => ({ ...value, view })) })),
  toggleSplit: () => set((s) => ({ tabs: s.tabs.map((value) => {
    if (value.id !== s.activeTabId) return value;
    const active = value.panes.find((item) => item.id === value.activePaneId) ?? value.panes[0];
    if (value.panes.length === 2) return { ...value, panes: [active] };
    return { ...value, panes: [...value.panes, pane(panePath(active))] };
  }) })),
  toggleInspector: () => set((s) => ({ inspector: !s.inspector })),
}));
let lastSnapshot = JSON.stringify(workspaceSnapshot(useExplorer.getState()));
useExplorer.subscribe((state) => {
  const serialized = JSON.stringify(workspaceSnapshot(state));
  if (serialized === lastSnapshot) return;
  lastSnapshot = serialized;
  try {
    if (serialized.length > 512000) throw new Error('Workspace size limit');
    window.localStorage.setItem(WORKSPACE_KEY, serialized);
  }
  catch { useExplorer.setState({ storageError: '保存工作区失败。空间不足或本地存储不可用；浏览仍可继续，本次更改可能无法恢复。' }); }
});
interface TransferState {
  clipboard: { entries: FileEntry[]; mode: 'copy' | 'move' } | null;
  drag: { token: string; entries: FileEntry[]; paneId?: string } | null;
  remember: (entries: FileEntry[], mode: 'copy' | 'move') => void;
  beginDrag: (entries: FileEntry[], paneId?: string) => string;
  endDrag: () => void;
  clearClipboard: () => void;
}
export const useTransfer = create<TransferState>((set) => ({
  clipboard: null, drag: null,
  remember: (entries, mode) => set({ clipboard: { entries, mode } }),
  beginDrag: (entries, paneId) => { const token = id(); set({ drag: { token, entries, paneId } }); return token; },
  endDrag: () => set({ drag: null }),
  clearClipboard: () => set({ clipboard: null }),
}));
