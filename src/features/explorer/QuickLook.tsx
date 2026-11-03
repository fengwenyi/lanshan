import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, ExternalLink, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { FilePreview } from './FilePreview';
import { files, errorMessage } from './api';
import { date, fileKind, IconButton, size } from './components';
import type { FileEntry } from './types';

export function QuickLook({ entries, path, select, close, returnFocus }: {
  entries: FileEntry[]; path: string; select: (entry: FileEntry) => void; close: () => void; returnFocus: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focusedPath, setFocusedPath] = useState(path);
  const index = entries.findIndex((entry) => entry.path === focusedPath);
  const current = index >= 0 ? entries[index] : undefined;
  const opening = useMutation({ mutationFn: files.open });
  const step = (offset: number) => {
    const next = entries[index + offset];
    if (next) { setFocusedPath(next.path); opening.reset(); select(next); }
  };
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}><Dialog.Portal><Dialog.Overlay className="quicklook-overlay" /><Dialog.Content ref={ref} tabIndex={-1} className="quicklook-dialog" onOpenAutoFocus={(event) => { event.preventDefault(); ref.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }} onKeyDown={(event) => {
    const target = event.target;
    const interactive = target instanceof HTMLElement && target.closest('input,textarea,select,audio,video,[contenteditable="true"],[role="slider"]');
    if (interactive || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Space' && target instanceof HTMLElement && target.closest('button')) return;
    if (event.code === 'Space') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) close(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  }}><header className="quicklook-header"><div><Dialog.Title>{current?.name ?? '文件已不在当前列表中'}</Dialog.Title><Dialog.Description>{current ? `${fileKind(current)} · ${current.isDirectory ? '—' : size(current.size)} · ${date(current.modified)}` : '关闭预览后刷新文件夹。'}</Dialog.Description></div><div><IconButton icon={ArrowLeft} label="预览上一个文件" disabled={index <= 0} onClick={() => step(-1)} /><IconButton icon={ArrowRight} label="预览下一个文件" disabled={index < 0 || index >= entries.length - 1} onClick={() => step(1)} /><button className="quicklook-open" disabled={!current || current.isDirectory || current.isSymlink || opening.isPending} onClick={() => { if (current) opening.mutate(current.path); }}><ExternalLink size={14} />使用默认应用打开</button><Dialog.Close asChild><button className="icon-button" aria-label="关闭快速预览"><X size={19} /></button></Dialog.Close></div></header>
    {opening.isError && <div className="error-banner" role="alert">{errorMessage(opening.error)}</div>}
    <div className="quicklook-body">{current ? <FilePreview key={`${current.path}:${current.modified}:${current.size}`} entry={current} expanded /> : <div className="preview-message"><p>文件列表已发生变化</p></div>}</div>
    <footer className="quicklook-footer"><span>{index >= 0 ? `${index + 1} / ${entries.length}` : '—'}</span><span>← → 切换文件 · 空格 / Esc 关闭</span></footer>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
