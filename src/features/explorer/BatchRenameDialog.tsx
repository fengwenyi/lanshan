import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { Pencil } from 'lucide-react';
import { errorMessage, files } from './api';
import { defaultRenameRule, renamePlan, type RenameRule } from './rename';
import { useQueue } from './queue';
import type { FileEntry } from './types';

export function BatchRenameDialog({ path, entries, close, returnFocus }: { path: string; entries: FileEntry[]; close: () => void; returnFocus: () => void }) {
  const [rule, setRule] = useState(defaultRenameRule);
  const revision = useQueue((state) => state.revision);
  const enqueue = useQueue((state) => state.enqueue);
  const directory = useQuery({ queryKey: ['rename-directory', path, revision], queryFn: () => files.list(path), retry: false });
  const rows = renamePlan(entries, directory.data?.entries ?? [], rule);
  const ready = rows.filter((row) => !row.error && !row.unchanged);
  const errors = rows.filter((row) => row.error).length;
  const change = (patch: Partial<RenameRule>) => setRule((value) => ({ ...value, ...patch }));
  const submit = () => { enqueue(ready.map((row) => ({ action: 'rename', source: row.entry.path, name: row.name }))); close(); };
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content organize-dialog rename-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}><div className="dialog-icon"><Pencil size={25} /></div><Dialog.Title>批量重命名</Dialog.Title><Dialog.Description>按当前列表顺序生成名称，预览后加入队列。冲突保留原文件；本次不支持交换名称、仅改大小写或一键撤销。</Dialog.Description>
    <div className="rename-fields"><label>命名方式<select value={rule.mode} onChange={(event) => { const mode = event.target.value; if (mode === 'decorate' || mode === 'replace' || mode === 'sequence') change({ mode }); }}><option value="decorate">添加前缀 / 后缀</option><option value="replace">查找并替换</option><option value="sequence">统一名称与序号</option></select></label>
    {rule.mode === 'replace' && <><label>查找文字<input value={rule.find} maxLength={255} onChange={(event) => change({ find: event.target.value })} /></label><label>替换为<input value={rule.replacement} maxLength={255} onChange={(event) => change({ replacement: event.target.value })} /></label><small>区分大小写，替换全部字面匹配，不使用正则表达式。</small></>}
    {rule.mode === 'sequence' && <><label>统一名称<input value={rule.base} maxLength={240} onChange={(event) => change({ base: event.target.value })} /></label><label>起始序号<input type="number" min={0} max={1e9} value={Number.isNaN(rule.start) ? '' : rule.start} onChange={(event) => change({ start: event.target.valueAsNumber })} /></label><label>序号位数<input type="number" min={1} max={9} value={Number.isNaN(rule.digits) ? '' : rule.digits} onChange={(event) => change({ digits: event.target.valueAsNumber })} /></label></>}
    <label>前缀<input value={rule.prefix} maxLength={255} onChange={(event) => change({ prefix: event.target.value })} /></label><label>后缀<input value={rule.suffix} maxLength={255} onChange={(event) => change({ suffix: event.target.value })} /></label><label className="rename-checkbox"><input type="checkbox" checked={rule.preserveExtension} onChange={(event) => change({ preserveExtension: event.target.checked })} />保留原扩展名</label></div>
    {directory.isPending ? <p role="status">正在检查当前目录…</p> : directory.isError ? <div className="error-banner" role="alert">{errorMessage(directory.error)}<button onClick={() => void directory.refetch()}>重试</button></div> : <><div className="organize-summary" role="status">{ready.length} 项待更名 · {errors} 项冲突或无效 · {rows.filter((row) => !row.error && row.unchanged).length} 项未改变</div><div className="rename-preview" role="table" aria-label="重命名预览"><div role="row" className="rename-preview-head"><span role="columnheader">原名称</span><span role="columnheader">新名称 / 状态</span></div>{rows.map((row) => <div role="row" key={row.entry.path} className={row.error ? 'rename-invalid' : ''}><span role="cell" title={row.entry.path}>{row.entry.name}</span><span role="cell">{row.name || '（空名称）'}<small>{row.error || (row.unchanged ? '保持原名' : '待更名')}</small></span></div>)}</div></>}
    <p className="organize-note">预览后文件可能被其他程序改变，执行时仍会校验并拒绝覆盖。批次可部分成功，失败项请在队列中核对。</p><div className="dialog-buttons"><Dialog.Close asChild><button className="secondary-button">取消</button></Dialog.Close><button className="primary-button" disabled={!ready.length || directory.isFetching || directory.isError || entries.length > 500} onClick={submit}>更名 {ready.length} 个文件</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
