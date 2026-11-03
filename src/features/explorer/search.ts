import { getFileType } from './fileTypes';
import type { FileEntry } from './types';

export interface SearchFilters { kind: string; extension: string; size: string; modified: string }
export const emptyFilters: SearchFilters = { kind: '', extension: '', size: '', modified: '' };
export function matchesSearch(entry: FileEntry, query: string, filters: SearchFilters, now = Date.now()): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.every((word) => entry.name.toLocaleLowerCase().includes(word))) return false;
  if (filters.kind === 'folder' ? !entry.isDirectory : filters.kind === 'file' ? entry.isDirectory : filters.kind && getFileType(entry).tone !== filters.kind) return false;
  const extensions = filters.extension.toLocaleLowerCase().split(/[,，\s]+/).map((value) => value.replace(/^\./, '')).filter(Boolean);
  if (extensions.length && (entry.isDirectory || !extensions.includes(entry.extension.toLocaleLowerCase()))) return false;
  if (filters.size && (entry.isDirectory || (filters.size === 'large' ? entry.size < 100 * 1024 ** 2 : entry.size > 1024 ** 2))) return false;
  if (filters.modified && (!entry.modified || entry.modified * 1000 < now - Number(filters.modified) * 86400000)) return false;
  return true;
}
