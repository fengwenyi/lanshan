import { create } from 'zustand';
import { errorCode, errorMessage, files, normalizedPath, pathLabel } from './api';
import type { FileRequest, OperationJob, OperationProgress } from './types';
interface QueueState {
  jobs: OperationJob[];
  open: boolean;
  paused: boolean;
  revision: number;
  enqueue: (requests: FileRequest[]) => void;
  cancel: (id: string) => void;
  skip: (id: string) => void;
  retry: (id: string, name?: string) => void;
  clearFinished: () => void;
  toggle: () => void;
  togglePause: () => void;
}
const initialProgress = (): OperationProgress => ({ phase: 'scanning', bytes: 0, totalBytes: 0 });
const patch = (id: string, change: Partial<OperationJob>) => useQueue.setState((s) => ({ jobs: s.jobs.map((job) => job.id === id ? { ...job, ...change } : job) }));
let pumping = false;
async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (!useQueue.getState().paused) {
      const job = useQueue.getState().jobs.find((value) => value.status === 'waiting');
      if (!job) break;
      if (job.dependencyId && useQueue.getState().jobs.find((value) => value.id === job.dependencyId)?.status !== 'done') {
        patch(job.id, { status: 'skipped', error: '分类文件夹未成功创建，已跳过移动。请核对目录后重新预览整理。' });
        continue;
      }
      patch(job.id, { status: 'running' });
      try {
        await files.run(job.request, job.id, (progress) => patch(job.id, { progress }));
        patch(job.id, { status: 'done', error: undefined, cancelRequested: false });
      } catch (error: unknown) {
        const code = errorCode(error);
        patch(job.id, { status: code === 'OPERATION_CANCELLED' ? 'cancelled' : 'failed', error: errorMessage(error), errorCode: code, cancelRequested: false });
      } finally {
        useQueue.setState((s) => ({ revision: s.revision + 1 }));
        window.dispatchEvent(new CustomEvent<FileRequest>('lanshan:operation-settled', { detail: job.request }));
      }
    }
  } finally { pumping = false; }
}
export const useQueue = create<QueueState>((set, get) => ({
  jobs: [], open: false, paused: false, revision: 0,
  enqueue: (requests) => {
    if (!requests.length) return;
    const folders = new Map<string, string>();
    const jobs: OperationJob[] = requests.map((request) => {
      const id = crypto.randomUUID();
      const dependencyId = request.destination ? folders.get(normalizedPath(request.destination)) : undefined;
      if (request.action === 'createFolder' && request.name) folders.set(normalizedPath(`${request.source}/${request.name}`), id);
      return { id, dependencyId, label: request.name ?? pathLabel(request.source), request, status: 'waiting', progress: initialProgress() };
    });
    set((s) => ({ jobs: [...s.jobs, ...jobs], open: true }));
    void pump();
  },
  cancel: (id) => {
    const job = get().jobs.find((value) => value.id === id);
    if (!job) return;
    if (job.status === 'waiting') { patch(id, { status: 'cancelled' }); return; }
    if (job.status === 'running' && job.request.action === 'copy') {
      patch(id, { cancelRequested: true });
      void files.cancel(id).catch((error: unknown) => patch(id, { cancelRequested: false, error: errorMessage(error) }));
    }
  },
  skip: (id) => { const job = get().jobs.find((value) => value.id === id); if (job && (job.status === 'waiting' || job.status === 'failed')) patch(id, { status: 'skipped' }); },
  retry: (id, name) => {
    const job = get().jobs.find((value) => value.id === id);
    if (!job || job.status !== 'failed') return;
    patch(id, { status: 'waiting', request: { ...job.request, ...(name ? { name } : {}) }, label: name || job.label, progress: initialProgress(), error: undefined, errorCode: undefined });
    void pump();
  },
  clearFinished: () => set((s) => ({ jobs: s.jobs.filter((job) => ['waiting', 'running', 'failed'].includes(job.status) || s.jobs.some((dependent) => dependent.dependencyId === job.id && ['waiting', 'running', 'failed'].includes(dependent.status))) })),
  toggle: () => set((s) => ({ open: !s.open })),
  togglePause: () => { set((s) => ({ paused: !s.paused })); if (!get().paused) void pump(); },
}));
