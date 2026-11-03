import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
export interface MenuItem { label: string; disabled?: boolean; action: () => void; danger?: boolean }
export function ContextMenu({ x, y, items, close }: { x: number; y: number; items: MenuItem[]; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
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
  }, [x, y, close]);
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close(); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  };
  return <div ref={ref} role="menu" aria-label="文件操作" className="context-menu" style={{ left: x, top: y }} onKeyDown={key} onContextMenu={(event) => event.preventDefault()}>{items.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} className={item.danger ? 'danger-item' : ''} onClick={() => { close(); item.action(); }}>{item.label}</button>)}</div>;
}
