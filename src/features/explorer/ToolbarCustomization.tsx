import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { create } from 'zustand';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';

export const toolbarItems = [
  ['sidebar', '左侧边栏'], ['back', '后退'], ['forward', '前进'], ['up', '上一级'], ['name', '文件名'],
  ['address', '地址栏'], ['tab', '新建标签'], ['split', '双栏浏览'], ['queue', '文件操作'],
  ['inspector', '详情面板'], ['search', '搜索'], ['views', '视图模式'], ['edit', '编辑'], ['view', '显示'], ['help', '帮助'],
] as const;
const defaults = toolbarItems.map(([id]) => id as string);
const storageKey = 'lanshan.toolbar.v1';
function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    const order = Array.isArray(saved.order) ? [...new Set<string>(saved.order.filter((id: unknown) => typeof id === 'string' && defaults.includes(id)))] : [];
    return { order: [...order, ...defaults.filter(id => !order.includes(id))], hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((id: unknown) => typeof id === 'string' && defaults.includes(id)) as string[] : [] };
  } catch { return { order: defaults, hidden: [] as string[] }; }
}
export const useToolbar = create<ReturnType<typeof read> & { error: string; save: (order: string[], hidden: string[]) => void }>((set) => ({
  ...read(), error: '', save: (order, hidden) => {
    let error = '';
    try { localStorage.setItem(storageKey, JSON.stringify({ order, hidden })); } catch { error = '工具栏设置保存失败，本次会话仍然生效。'; }
    set({ order, hidden, error });
  },
}));
export function ToolbarItem({ id, children }: { id: string; children: ReactNode }) {
  const { order, hidden } = useToolbar();
  return hidden.includes(id) ? null : <div className={`toolbar-item toolbar-item-${id}`} style={{ order: order.indexOf(id) }}>{children}</div>;
}
export function ToolbarCustomization({ open, close }: { open: boolean; close: () => void }) {
  const { order, hidden, save, error } = useToolbar();
  const [dragged, setDragged] = useState<string | null>(null);
  const move = (id: string, target: string) => {
    if (id === target) return;
    const next = order.filter(item => item !== id);
    next.splice(order.indexOf(target), 0, id);
    save(next, hidden);
  };
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) close(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content toolbar-customization">
    <header className="toolbar-customization-header"><Dialog.Title>自定义工具栏</Dialog.Title><Dialog.Close asChild><button className="icon-button" aria-label="关闭自定义工具栏"><X size={18} /></button></Dialog.Close></header><Dialog.Description className="toolbar-customization-description">勾选显示或隐藏，拖动手柄调整顺序。更改立即生效。</Dialog.Description>
    <div className="toolbar-customization-actions"><button onClick={() => save(order, [])}>全部显示</button><button onClick={() => save(order, [...defaults])}>全部隐藏</button><button onClick={() => save([...defaults], [])}>恢复默认</button></div>
    {error && <p role="alert">{error}</p>}
    <ul className="toolbar-customization-list">{order.map((id, index) => <li key={id} className={dragged === id ? 'is-dragging' : undefined} onDragOver={event => { if (dragged) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (dragged) move(dragged, id); setDragged(null); }}>
      <span draggable onDragStart={event => { event.stopPropagation(); setDragged(id); event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragged(null)} className="toolbar-drag-handle" title="拖动排序"><GripVertical size={16} /></span>
      <label><input type="checkbox" checked={!hidden.includes(id)} onChange={() => save(order, hidden.includes(id) ? hidden.filter(item => item !== id) : [...hidden, id])} />{toolbarItems.find(item => item[0] === id)?.[1]}</label>
      <button aria-label={`上移${toolbarItems.find(item => item[0] === id)?.[1]}`} disabled={index === 0} onClick={() => move(id, order[index - 1])}><ArrowUp size={14} /></button><button aria-label={`下移${toolbarItems.find(item => item[0] === id)?.[1]}`} disabled={index === order.length - 1} onClick={() => move(id, order[index + 1])}><ArrowDown size={14} /></button>
    </li>)}</ul><div className="dialog-buttons"><Dialog.Close asChild><button className="primary-button">完成</button></Dialog.Close></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
