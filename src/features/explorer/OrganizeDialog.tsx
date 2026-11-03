import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { FolderInput, LoaderCircle } from 'lucide-react';
import { errorMessage, files, normalizedPath } from './api';
import { getFileType } from './fileTypes';
import { useQueue } from './queue';
import type { FileEntry, FileRequest } from './types';

const folders: Record<string, string> = { word: '文档', sheet: '表格', slides: '演示文稿', pdf: 'PDF', markdown: '文档', text: '文档', image: '图片', design: '设计', video: '视频', audio: '音频', archive: '压缩包', code: '代码', data: '数据', config: '配置', database: '数据库', font: '字体', application: '安装包', system: '系统组件', script: '脚本', disk: '磁盘映像', ebook: '电子书', certificate: '证书', shortcut: '快捷方式' };
const join = (path: string, name: string) => `${path.replace(/[\\/]+$/, '')}\\${name}`;
export function OrganizeDialog({ path, entries, close, returnFocus }: { path: string; entries: FileEntry[]; close: () => void; returnFocus: () => void }) {
  const [mode, setMode] = useState('type');
  const enqueue = useQueue((state) => state.enqueue);
  const candidates = entries.filter((entry) => !entry.isDirectory && !entry.isSymlink && !entry.name.startsWith('.') && normalizedPath(entry.path.replace(/[\\/][^\\/]+$/, '')) === normalizedPath(path));
  const plan = useQuery({ queryKey: ['organize-plan', path, mode, candidates.map((entry) => entry.path)], retry: false, queryFn: async () => {
    if (candidates.length > 500) throw new Error('每次最多整理 500 个文件，请先筛选或选择一部分文件。');
    const current = await files.list(path);
    const groups = new Map<string, FileEntry[]>();
    for (const entry of candidates) {
      const d = new Date(entry.modified * 1000);
      const folder = mode === 'type' ? folders[getFileType(entry).tone] ?? '其他文件' : entry.modified && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : '日期未知';
      groups.set(folder, [...(groups.get(folder) ?? []), entry]);
    }
    return Promise.all([...groups].map(async ([folder, items]) => {
      const existing = current.entries.find((entry) => entry.name.toLocaleLowerCase() === folder.toLocaleLowerCase());
      if (existing && (!existing.isDirectory || existing.isSymlink)) return { folder, destination: join(path, folder), create: false, rows: items.map((entry) => ({ entry, conflict: '分类名称被文件或链接占用' })) };
      const destination = existing?.path ?? join(path, folder);
      const children = existing ? await files.list(destination) : null;
      return { folder, destination, create: !existing, rows: items.map((entry) => ({ entry, conflict: children?.entries.some((child) => child.name.toLocaleLowerCase() === entry.name.toLocaleLowerCase()) ? '目标已有同名项目' : '' })) };
    }));
  } });
  const groups = plan.data ?? [];
  const ready = groups.reduce((total, group) => total + group.rows.filter((row) => !row.conflict).length, 0);
  const blocked = candidates.length - ready;
  const submit = () => {
    const requests: FileRequest[] = [];
    for (const group of groups) {
      const rows = group.rows.filter((row) => !row.conflict);
      if (!rows.length) continue;
      if (group.create) requests.push({ action: 'createFolder', source: path, name: group.folder });
      requests.push(...rows.map(({ entry }): FileRequest => ({ action: 'move', source: entry.path, destination: group.destination })));
    }
    enqueue(requests); close();
  };
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content organize-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}><div className="dialog-icon"><FolderInput size={26} /></div><Dialog.Title>整理文件</Dialog.Title><Dialog.Description>预览后将文件移动到当前目录的分类文件夹。只处理本层普通文件，跳过文件夹、链接和点号文件；冲突项目保留原位。</Dialog.Description><label className="organize-mode">整理方式<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="type">按文件类型</option><option value="month">按修改月份</option></select></label>
    {plan.isPending ? <p role="status"><LoaderCircle className="spin" size={16} /> 正在检查目标文件夹…</p> : plan.isError ? <div className="error-banner" role="alert">{errorMessage(plan.error)}<button onClick={() => void plan.refetch()}>重试</button></div> : <><div className="organize-summary" role="status">{ready} 个文件待移动 · {groups.length} 个分类 · {blocked} 个冲突 · {entries.length - candidates.length} 个不参与整理</div><div className="organize-preview">{groups.length ? groups.map((group) => <section key={group.folder}><h3>{group.folder}<small>{group.create ? '新建文件夹' : '已有文件夹'}</small></h3>{group.rows.map(({ entry, conflict }) => <div key={entry.path} className={conflict ? 'organize-conflict' : ''}><span title={entry.path}>{entry.name}</span><span>{conflict || `→ ${group.folder}`}</span></div>)}</section>) : <p>没有可整理的文件。请选择本层文件后重试。</p>}</div><p className="organize-note">执行后请在操作队列查看结果。新建分类失败或被取消时，依赖它的移动将跳过；整理可部分成功，暂不支持一键撤销。</p></>}
    <div className="dialog-buttons"><Dialog.Close asChild><button className="secondary-button">取消</button></Dialog.Close><button className="primary-button" disabled={!ready || plan.isFetching || plan.isError} onClick={submit}>移动 {ready} 个文件</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
