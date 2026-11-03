import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
export interface MenuItem { label: string; disabled?: boolean; action?: () => void; children?: MenuItem[]; danger?: boolean }
export function ContextMenu({ x, y, items, close, label = '文件操作' }: { x: number; y: number; items: MenuItem[]; close: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<MenuItem | null>(null);
  const visibleItems: MenuItem[] = submenu ? [{ label: '返回', action: () => setSubmenu(null) }, ...(submenu.children ?? [])] : items;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const previous = document.activeElement;
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - element.offsetHeight - 8))}px`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !element.contains(event.target)) close(); };
    const reposition = () => close();
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', reposition); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [x, y, close, submenu]);
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (event.key === 'Escape' || event.key === 'ArrowLeft' && submenu) { event.preventDefault(); if (submenu) setSubmenu(null); else close(); }
    else if (event.key === 'Tab') { event.preventDefault(); close(); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  };
  return <div ref={ref} role="menu" aria-label={submenu?.label ?? label} className="context-menu" style={{ left: x, top: y }} onKeyDown={key} onContextMenu={(event) => event.preventDefault()}>{visibleItems.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} className={item.danger ? 'danger-item' : ''} aria-haspopup={item.children ? 'menu' : undefined} onClick={() => { if (item.children) setSubmenu(item); else if (submenu && item.label === '返回') setSubmenu(null); else { close(); item.action?.(); } }}>{item.label}{item.children ? ' ›' : ''}</button>)}</div>;
}
