export interface Point { x: number; y: number }
export interface IconLayout { mode: 'aligned' | 'free'; guides: boolean; positions: Record<string, Point> }
export const defaultIconLayout: IconLayout = { mode: 'aligned', guides: false, positions: {} };
export const CELL_WIDTH = 128;
export const CELL_HEIGHT = 152;
export const TILE_WIDTH = 112;
export const TILE_HEIGHT = 136;
export const INSET = 16;
export const MAX_COORDINATE = 1000000;
export function canPlaceIcons(originPane: string | undefined, paneId: string, target: { path: string; isDirectory: boolean; isSymlink: boolean } | undefined, draggedPaths: string[]): boolean {
  return originPane === paneId && !(target?.isDirectory && !target.isSymlink && !draggedPaths.includes(target.path));
}
export function arrangeIcons(paths: string[], saved: Record<string, Point>, width: number): Record<string, Point> {
  const columns = Math.max(1, Math.floor((width - INSET * 2) / CELL_WIDTH));
  const occupied = new Set<string>();
  const positions: Record<string, Point> = {};
  for (const path of paths) {
    const point = saved[path];
    if (!point) continue;
    positions[path] = point;
    for (let x = Math.floor((point.x - INSET) / CELL_WIDTH); x <= Math.floor((point.x + TILE_WIDTH - INSET - 1) / CELL_WIDTH); x++) {
      for (let y = Math.floor((point.y - INSET) / CELL_HEIGHT); y <= Math.floor((point.y + TILE_HEIGHT - INSET - 1) / CELL_HEIGHT); y++) occupied.add(`${x},${y}`);
    }
  }
  let slot = 0;
  for (const path of paths) {
    if (positions[path]) continue;
    while (occupied.has(`${slot % columns},${Math.floor(slot / columns)}`)) slot++;
    positions[path] = { x: INSET + slot % columns * CELL_WIDTH, y: INSET + Math.floor(slot / columns) * CELL_HEIGHT };
    occupied.add(`${slot % columns},${Math.floor(slot / columns)}`);
    slot++;
  }
  return positions;
}
export function shiftIcons(positions: Record<string, Point>, selected: string[], dx: number, dy: number): Record<string, Point> {
  const points = selected.flatMap((path) => positions[path] ? [positions[path]] : []);
  if (!points.length) return positions;
  dx = Math.max(-Math.min(...points.map((point) => point.x)), Math.min(dx, MAX_COORDINATE - Math.max(...points.map((point) => point.x))));
  dy = Math.max(-Math.min(...points.map((point) => point.y)), Math.min(dy, MAX_COORDINATE - Math.max(...points.map((point) => point.y))));
  const next = { ...positions };
  for (const path of selected) if (positions[path]) next[path] = { x: Math.round(positions[path].x + dx), y: Math.round(positions[path].y + dy) };
  return next;
}
