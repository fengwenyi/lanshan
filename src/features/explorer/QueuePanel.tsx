import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ListChecks, LoaderCircle, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useQueue } from './queue';
import { size } from './components';
import { displayPath, errorMessage, files } from './api';
import type { LockProcess, OperationJob } from './types';
const labels = { waiting: '等待中', running: '执行中', done: '已完成', failed: '失败', cancelled: '已取消', skipped: '已跳过' };
const actions = { createFolder: '新建', rename: '更名', copy: '复制', move: '移动', trash: '回收站' };
export function QueuePanel() {
  const queue = useQueue();
  const [renaming, setRenaming] = useState<OperationJob | null>(null);
  const [force, setForce] = useState<OperationJob | null>(null);
  const [processes, setProcesses] = useState<LockProcess[]>([]);
  const [checking, setChecking] = useState(false);
  const [lockError, setLockError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  async function inspect(job: OperationJob) {
    setForce(job); setProcesses([]); setLockError(''); setAcknowledged(false); setChecking(true);
    try { setProcesses(await files.inspectLocks(job.request.source)); }
    catch (error) { setLockError(errorMessage(error)); }
    finally { setChecking(false); }
  }
  const [name, setName] = useState('');
  const active = queue.jobs.filter((job) => job.status === 'waiting' || job.status === 'running').length;
  if (!queue.open) return null;
  return <section className="queue-panel" aria-label="文件操作队列"><header><strong><ListChecks size={17} />文件操作 <span>{active ? `${active} 项待完成` : `${queue.jobs.length} 项记录`}</span></strong><div><button title={queue.paused ? '继续等待中的任务' : '暂停后续任务'} aria-label={queue.paused ? '继续队列' : '暂停后续任务'} onClick={queue.togglePause}>{queue.paused ? <Play size={16} /> : <Pause size={16} />}</button><button aria-label="收起操作队列" onClick={queue.toggle}><X size={17} /></button></div></header>
    {queue.paused && <p className="queue-note">队列已暂停，正在执行的任务会继续。可取消正在复制的项目。</p>}
    <div className="queue-jobs">{queue.jobs.length === 0 && <p className="queue-note">复制、移动等操作将在这里依次执行。</p>}{queue.jobs.map((job) => {
      const ratio = job.progress.totalBytes ? Math.min(100, Math.round(job.progress.bytes / job.progress.totalBytes * 100)) : 0;
      const copying = job.status === 'running' && job.request.action === 'copy';
      return <article key={job.id} className={`queue-job job-${job.status}`}><div className="job-title"><span>{job.status === 'running' ? <LoaderCircle size={15} className="spin" /> : job.status === 'done' ? <Check size={15} /> : <span className="job-dot" />}<strong title={job.request.source}>{job.label}</strong></span><span>{actions[job.request.action]} · {job.cancelRequested ? '正在取消' : labels[job.status]}</span></div>
        {job.request.destination && <p className="job-destination" title={job.request.destination}>到 {displayPath(job.request.destination)}</p>}
        {copying && <><progress aria-label={`${job.label} 复制进度`} {...(job.progress.phase === 'copying' ? { value: ratio, max: 100 } : {})} /><p className="job-progress" role="status">{job.progress.phase === 'scanning' ? '正在计算文件大小…' : `${size(job.progress.bytes)} / ${size(job.progress.totalBytes)} · ${ratio}%`}</p></>}
        {job.error && <p className="job-error">{job.error}</p>}
        <div className="job-actions">{job.status === 'waiting' && <><button onClick={() => queue.skip(job.id)}>跳过</button><button onClick={() => queue.cancel(job.id)}>取消</button></>}{copying && <button disabled={job.cancelRequested} onClick={() => queue.cancel(job.id)}>取消复制</button>}{job.status === 'running' && !copying && <span>此步骤不可中途取消</span>}{job.status === 'failed' && <><button onClick={() => queue.retry(job.id)}><RotateCcw size={12} />重试</button>{job.request.action === 'trash' && <button onClick={() => void inspect(job)}>强制删除…</button>}{['copy', 'move', 'rename', 'createFolder'].includes(job.request.action) && <button onClick={() => { setRenaming(job); setName(job.request.name ?? job.label); }}>改名重试</button>}<button onClick={() => queue.skip(job.id)}>跳过</button></>}</div>
      </article>;
    })}</div><footer><span aria-live="polite">失败任务保留，后续任务继续执行</span><button onClick={queue.clearFinished}>清除已结束</button></footer>
    <Dialog.Root open={force !== null} onOpenChange={(open) => { if (!open && !checking) setForce(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>强制删除：关闭占用程序</Dialog.Title><Dialog.Description>将强制结束下列程序，再尝试把项目移入回收站。程序的所有窗口都会关闭，未保存的内容可能丢失，正在进行的任务可能中断。请先保存工作。程序不会自动重新打开。</Dialog.Description><p className="force-target">{force && displayPath(force.request.source)}</p>{checking ? <p role="status">正在检查占用程序…</p> : lockError ? <p role="alert" className="job-error">{lockError}</p> : processes.length ? <><ul className="trash-preview">{processes.map((process) => <li key={process.pid}>{process.name || '未知程序'}（PID {process.pid}）</li>)}</ul><label className="force-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />我已保存工作，理解强制结束可能造成数据丢失</label></> : <p role="status">未发现可关闭的占用程序。可能涉及权限、文件夹句柄或其他限制，请手动处理后重试。</p>}<div className="dialog-buttons"><Dialog.Close asChild><button type="button" className="secondary-button" disabled={checking}>取消</button></Dialog.Close><button type="button" className="danger-button" disabled={checking || !!lockError || !processes.length || !acknowledged || queue.jobs.find((job) => job.id === force?.id)?.status !== 'failed'} onClick={() => { if (force) { queue.retry(force.id, undefined, processes); setForce(null); } }}>强制结束并移入回收站</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={renaming !== null} onOpenChange={(open) => { if (!open) setRenaming(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>使用新名称重试</Dialog.Title><Dialog.Description>原有同名项目和部分副本会保留。这里只修改这条任务的目标名称。</Dialog.Description><form onSubmit={(event) => { event.preventDefault(); if (renaming && name.trim()) { queue.retry(renaming.id, name); setRenaming(null); } }}><label className="name-field">目标名称<input autoFocus value={name} maxLength={240} onChange={(event) => setName(event.target.value)} /></label><div className="dialog-buttons"><Dialog.Close asChild><button type="button" className="secondary-button">取消</button></Dialog.Close><button type="submit" className="primary-button" disabled={!name.trim()}>重试</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
