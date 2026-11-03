export interface Location { id: string; name: string; path: string; kind: 'home' | 'folder' | 'drive' }
export interface FileEntry { name: string; path: string; isDirectory: boolean; isSymlink: boolean; size: number; modified: number; extension: string }
export interface Directory { path: string; parent: string | null; entries: FileEntry[]; ancestors: { name: string; path: string }[]; skipped: number }
export interface SearchResult { entries: FileEntry[]; scanned: number; skipped: number; limited: boolean }
export type FileAction = 'createFolder' | 'rename' | 'copy' | 'move' | 'trash';
export interface FileRequest { action: FileAction; source: string; destination?: string; name?: string }

export interface OperationProgress { phase: 'scanning' | 'copying' | 'complete'; bytes: number; totalBytes: number }
export type JobStatus = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped';
export interface OperationJob {
  id: string;
  label: string;
  request: FileRequest;
  status: JobStatus;
  progress: OperationProgress;
  error?: string;
  errorCode?: string;
  cancelRequested?: boolean;
  dependencyId?: string;
}

export type PreviewKind = 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'unsupported';
export interface FilePreviewData { kind: PreviewKind; path: string | null; text: string | null; encoding: string | null; size: number; truncated: boolean }
