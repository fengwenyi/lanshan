import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import type { Directory, SearchResult, FileRequest, Location, OperationProgress, FilePreviewData, PreviewKind } from './types';
export const desktop = isTauri();
export const files = {
  locations: () => invoke<Location[]>('locations'),
  selectLocation: (id: string) => invoke<string>('select_location', { id }),
  chooseFolder: () => invoke<string | null>('choose_folder'),
  list: (path: string) => invoke<Directory>('list_directory', { path }),
  applicationIcon: async (path: string): Promise<{ src: string; pixels: number }> => {
    const data = await invoke<{ width: number; height: number; rgba: number[] }>('application_icon', { path });
    if (!Number.isInteger(data.width) || data.width < 1 || data.width > 256 || data.height !== data.width || data.rgba.length !== data.width * data.height * 4) throw new Error('应用图标数据无效。');
    const canvas = document.createElement('canvas');
    canvas.width = data.width; canvas.height = data.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法显示应用图标。');
    context.putImageData(new ImageData(Uint8ClampedArray.from(data.rgba), data.width, data.height), 0, 0);
    return { src: canvas.toDataURL('image/png'), pixels: data.width };
  },
  search: (path: string, query: string, showHidden: boolean) => invoke<SearchResult>('search_files', { request: { path, query, showHidden } }),
  preview: async (path: string): Promise<FilePreviewData> => {
    const raw = await invoke<{ kind: PreviewKind; path: string | null; bytes: number[] | null; size: number; truncated: boolean }>('preview_file', { path });
    let text: string | null = null;
    let encoding: string | null = null;
    if (raw.bytes !== null) {
      const bytes = Uint8Array.from(raw.bytes);
      const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
      try { text = new TextDecoder(bom, { fatal: true }).decode(bytes, { stream: raw.truncated }); encoding = bom.toUpperCase(); }
      catch {
        try { text = new TextDecoder('gb18030', { fatal: true }).decode(bytes, { stream: raw.truncated }); encoding = 'GB18030'; }
        catch { throw new Error('该文本编码暂不支持，请使用默认应用打开。'); }
      }
      if (text.includes('\0')) throw new Error('文件包含二进制内容，无法作为文本预览。');
    }
    return { kind: raw.kind, path: raw.path, text, encoding, size: raw.size, truncated: raw.truncated };
  },
  openExternal: (url: string) => invoke<void>('open_preview_link', { url }),
  open: (path: string) => invoke<void>('open_file', { path }),
  run: (request: FileRequest, jobId: string, onProgress: (event: OperationProgress) => void) => {
    const progress = new Channel<OperationProgress>();
    progress.onmessage = onProgress;
    return invoke<void>('run_operation', { request, jobId, progress });
  },
  cancel: (jobId: string) => invoke<void>('cancel_operation', { jobId }),
};
export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return '操作未完成，请重试。';
}

export function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
}
export const displayPath = (path: string): string => {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  return path.startsWith('\\\\?\\') ? path.slice(4) : path;
};
export const pathLabel = (path: string): string => displayPath(path).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path || '新标签';
export const normalizedPath = (path: string): string => displayPath(path).replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase();
