import { create } from 'zustand';
import { defaultIconLayout, MAX_COORDINATE, type IconLayout, type Point } from './iconLayout';
import { favoriteKey, validPath } from './workspaceStorage';

const KEY = 'lanshan.icon-layouts.v1';
interface SavedLayout { path: string; layout: IconLayout }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseIconLayouts(value: unknown): SavedLayout[] | null {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.directories) || value.directories.length > 100) return null;
  const result: SavedLayout[] = [];
  const directories: unknown[] = value.directories;
  for (const item of directories) {
    if (!object(item) || !validPath(item.path) || !object(item.layout)) return null;
    const layout = item.layout;
    if ((layout.mode !== 'free' && layout.mode !== 'aligned') || typeof layout.guides !== 'boolean' || !object(layout.positions) || Object.keys(layout.positions).length > 2000) return null;
    const positions: Record<string, Point> = {};
    for (const [path, point] of Object.entries(layout.positions)) {
      if (!validPath(path) || !object(point) || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > MAX_COORDINATE || point.y > MAX_COORDINATE) return null;
      positions[path] = { x: point.x, y: point.y };
    }
    result.push({ path: item.path, layout: { mode: layout.mode, guides: layout.guides, positions } });
  }
  return result;
}
const loaded = (() => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { directories: [], error: '' };
    const directories = raw.length <= 1000000 ? parseIconLayouts(JSON.parse(raw)) : null;
    return { directories: directories ?? [], error: directories ? '' : '保存的图标布局无效，已使用自动排列。' };
  } catch { return { directories: [], error: '图标布局存储不可用，本次摆放可能无法保存。' }; }
})();
interface LayoutState { directories: SavedLayout[]; error: string; update: (path: string, patch: Partial<IconLayout>) => void; dismiss: () => void }
export const useIconLayouts = create<LayoutState>((set) => ({
  ...loaded,
  update: (path, patch) => set((state) => {
    if (!validPath(path)) return state;
    const key = favoriteKey(path);
    const existing = state.directories.find((item) => favoriteKey(item.path) === key);
    const layout = { ...(existing?.layout ?? defaultIconLayout), ...patch };
    const directories = [...state.directories.filter((item) => favoriteKey(item.path) !== key), { path, layout }].slice(-100);
    try {
      const serialized = JSON.stringify({ version: 1, directories });
      if (serialized.length > 1000000) throw new Error('Layout size limit');
      window.localStorage.setItem(KEY, serialized);
      return { directories, error: '' };
    } catch { return { directories, error: '保存图标位置失败，请检查本地存储空间；本次摆放仅在当前会话保留。' }; }
  }),
  dismiss: () => set({ error: '' }),
}));
