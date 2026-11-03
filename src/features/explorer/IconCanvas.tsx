import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { FileEntry } from './types';
import { useTransfer } from './store';
import { arrangeIcons, canPlaceIcons, shiftIcons, INSET, TILE_HEIGHT, TILE_WIDTH, type IconLayout, type Point } from './iconLayout';

interface LayoutDrag { start: Point; positions: Record<string, Point>; paths: string[] }
export function IconCanvas({ paneId, entries, allEntries, layout, selected, renderEntry, save, dropTarget, clearDropTarget }: { paneId: string; entries: FileEntry[]; allEntries: FileEntry[]; layout: IconLayout; selected: string[]; renderEntry: (entry: FileEntry) => ReactNode; save: (positions: Record<string, Point>) => void; dropTarget: string | null; clearDropTarget: () => void }) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<LayoutDrag | null>(null);
  const [width, setWidth] = useState(640);
  const free = layout.mode === 'free';
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.parentElement?.clientWidth ?? 640));
    observer.observe(element.parentElement ?? element);
    setWidth(element.parentElement?.clientWidth ?? 640);
    return () => observer.disconnect();
  }, []);
  const positions = free ? arrangeIcons(allEntries.map((entry) => entry.path), layout.positions, width) : {};
  const points = entries.flatMap((entry) => positions[entry.path] ? [positions[entry.path]] : []);
  const height = Math.max(200, ...points.map((point) => point.y + TILE_HEIGHT + INSET));
  const contentWidth = Math.max(width, ...points.map((point) => point.x + TILE_WIDTH + INSET));
  const canPlace = (event: DragEvent) => {
    const session = useTransfer.getState().drag;
    if (!free || !drag.current || !session) return false;
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-file-path]') : null;
    return canPlaceIcons(session.paneId, paneId, entries.find((entry) => entry.path === button?.dataset.filePath), drag.current.paths);
  };
  return <div ref={canvas} className={`file-grid ${free ? 'free-icon-canvas' : 'aligned-icon-canvas'} ${layout.guides ? 'icon-guides' : ''}`} style={free ? { height, minWidth: contentWidth } : undefined} aria-label={free ? '自由摆放文件图标' : '对齐网格的文件图标'}
    onDragStartCapture={(event) => {
      if (!free || !(event.target instanceof Element)) return;
      const path = event.target.closest<HTMLElement>('[data-file-path]')?.dataset.filePath;
      const rect = canvas.current?.getBoundingClientRect();
      if (!path || !rect) return;
      drag.current = { start: { x: event.clientX - rect.left, y: event.clientY - rect.top }, positions, paths: selected.includes(path) ? selected.filter((item) => !!positions[item]) : [path] };
    }}
    onDragEndCapture={() => { drag.current = null; }}
    onDragOverCapture={(event) => {
      if (!canPlace(event)) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
      if (dropTarget) clearDropTarget();
      const scroll = canvas.current?.parentElement;
      if (scroll) {
        const rect = scroll.getBoundingClientRect();
        scroll.scrollBy({ left: event.clientX > rect.right - 30 ? 14 : event.clientX < rect.left + 30 ? -14 : 0, top: event.clientY > rect.bottom - 30 ? 14 : event.clientY < rect.top + 30 ? -14 : 0 });
      }
    }}
    onDropCapture={(event) => {
      if (!canPlace(event)) return;
      event.preventDefault(); event.stopPropagation();
      const current = drag.current;
      const rect = canvas.current?.getBoundingClientRect();
      const session = useTransfer.getState().drag;
      if (current && rect && session && event.dataTransfer.getData('application/x-lanshan-selection') === session.token) save(shiftIcons(current.positions, current.paths, event.clientX - rect.left - current.start.x, event.clientY - rect.top - current.start.y));
      drag.current = null; useTransfer.getState().endDrag();
    }}
    onKeyDownCapture={(event) => {
      if (!free || !event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !(event.target instanceof Element) || !event.target.closest('[data-file-path]')) return;
      event.preventDefault(); event.stopPropagation();
      const focused = event.target.closest<HTMLElement>('[data-file-path]')?.dataset.filePath;
      const paths = focused && selected.includes(focused) ? selected : focused ? [focused] : [];
      const step = event.shiftKey ? 50 : 10;
      save(shiftIcons(positions, paths, event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0, event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0));
      const element = event.target.closest<HTMLElement>('[data-file-path]');
      window.requestAnimationFrame(() => element?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }}>
    {entries.map((entry) => <div key={entry.path} className={`${free ? 'free-icon-position' : ''} ${dropTarget === entry.path ? 'drop-folder' : ''}`} style={free ? { left: positions[entry.path]?.x ?? INSET, top: positions[entry.path]?.y ?? INSET } : undefined}>{renderEntry(entry)}</div>)}
  </div>;
}
