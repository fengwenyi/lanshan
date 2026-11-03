import type { TabState } from './store';

export const WORKSPACE_KEY = 'lanshan.workspace.v1';
export interface Favorite { name: string; path: string }
interface SavedPane { history: string[]; cursor: number; view: 'list' | 'grid' }
interface SavedTab { panes: SavedPane[]; activePane: number }
export interface SavedWorkspace { version: 1; tabs: SavedTab[]; activeTab: number; inspector: boolean; favorites: Favorite[] }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const validPath = (value: unknown): value is string => typeof value === 'string' && value.length <= 4096 && /^(?:[a-z]:[\\/]|\\\\)/i.test(value) && !/\p{Cc}/u.test(value);
export const favoriteKey = (path: string): string => path.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase();
export function parseWorkspace(value: unknown): SavedWorkspace | null {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.tabs) || value.tabs.length < 1 || value.tabs.length > 12 || typeof value.activeTab !== 'number' || !Number.isInteger(value.activeTab) || value.activeTab < 0 || value.activeTab >= value.tabs.length || typeof value.inspector !== 'boolean' || !Array.isArray(value.favorites) || value.favorites.length > 40) return null;
  const tabs: SavedTab[] = [];
  const rawTabs: unknown[] = value.tabs;
  for (const raw of rawTabs) {
    if (!object(raw) || !Array.isArray(raw.panes) || raw.panes.length < 1 || raw.panes.length > 2 || typeof raw.activePane !== 'number' || !Number.isInteger(raw.activePane) || raw.activePane < 0 || raw.activePane >= raw.panes.length) return null;
    const panes: SavedPane[] = [];
    const rawPanes: unknown[] = raw.panes;
    for (const item of rawPanes) {
      if (!object(item) || !Array.isArray(item.history) || item.history.length > 30 || typeof item.cursor !== 'number' || !Number.isInteger(item.cursor) || item.cursor < -1 || item.cursor >= item.history.length || (item.history.length > 0 && item.cursor < 0) || (item.view !== 'list' && item.view !== 'grid')) return null;
      const history: unknown[] = item.history;
      if (!history.every(validPath)) return null;
      panes.push({ history, cursor: item.cursor, view: item.view });
    }
    tabs.push({ panes, activePane: raw.activePane });
  }
  const favorites: Favorite[] = [];
  const rawFavorites: unknown[] = value.favorites;
  const paths = new Set<string>();
  for (const item of rawFavorites) {
    if (!object(item) || !validPath(item.path) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 255 || /\p{Cc}/u.test(item.name)) return null;
    const key = favoriteKey(item.path);
    if (!paths.has(key)) { favorites.push({ name: item.name, path: item.path }); paths.add(key); }
  }
  return { version: 1, tabs, activeTab: value.activeTab, inspector: value.inspector, favorites };
}
export function workspaceSnapshot(state: { tabs: TabState[]; activeTabId: string; inspector: boolean; favorites: Favorite[] }): SavedWorkspace {
  return { version: 1, tabs: state.tabs.map((tab) => ({ activePane: Math.max(0, tab.panes.findIndex((pane) => pane.id === tab.activePaneId)), panes: tab.panes.map((pane) => ({ history: pane.history, cursor: pane.cursor, view: pane.view })) })), activeTab: Math.max(0, state.tabs.findIndex((tab) => tab.id === state.activeTabId)), inspector: state.inspector, favorites: state.favorites };
}
export function readWorkspace(storage: Pick<Storage, 'getItem'>): { value: SavedWorkspace | null; error: string } {
  try {
    const raw = storage.getItem(WORKSPACE_KEY);
    if (!raw) return { value: null, error: '' };
    const value = raw.length <= 512000 ? parseWorkspace(JSON.parse(raw)) : null;
    return { value, error: value ? '' : '保存的工作区格式无效或版本不兼容，已使用默认布局。' };
  } catch { return { value: null, error: '无法读取本地工作区，已使用默认布局。' }; }
}
