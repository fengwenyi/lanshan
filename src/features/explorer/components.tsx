import type { ReactNode } from 'react';
import { ArrowUpRight, Download, FileImage, FileMusic, Film, HardDrive, Home, type LucideIcon } from 'lucide-react';
import type { FileEntry, Location } from './types';
import { getFileType } from './fileTypes';
import { FolderArtwork } from './FolderArtwork';
import { ApplicationIcon, hasApplicationIcon } from './ApplicationIcon';
export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** index).toFixed(index === 1 ? 0 : 1)} ${['B', 'KB', 'MB', 'GB', 'TB'][index]}`;
}
export function date(seconds: number): string { return seconds ? new Date(seconds * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未知'; }
export function fileKind(entry: FileEntry): string { return getFileType(entry).label; }
export function Glyph({ entry, large = false }: { entry: FileEntry; large?: boolean }) {
  const type = getFileType(entry);
  const Icon = type.icon;
  const glyph = <span className={`file-glyph glyph-tone-${type.tone} ${entry.isDirectory ? 'folder-glyph' : 'document-glyph'} ${large ? 'large' : ''}`} title={type.label} aria-hidden="true">{entry.isDirectory ? <FolderArtwork /> : <Icon strokeWidth={large ? 1.5 : 1.65} />}{large && !entry.isDirectory && <span className="glyph-badge">{type.badge}</span>}{entry.isSymlink && <span className="glyph-link-mark"><ArrowUpRight /></span>}</span>;
  return hasApplicationIcon(entry) ? <ApplicationIcon key={`${entry.path}:${entry.modified}:${entry.size}`} entry={entry} large={large} fallback={glyph} /> : glyph;
}
export function IconButton({ icon: Icon, label, onClick, disabled, active }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={active === undefined ? undefined : active}><Icon size={18} aria-hidden="true" /></button>;
}
export function locationIcon(item: Location): LucideIcon | typeof FolderArtwork { return item.kind === 'drive' ? HardDrive : item.id === 'home' ? Home : item.id === 'downloads' ? Download : item.id === 'pictures' ? FileImage : item.id === 'music' ? FileMusic : item.id === 'videos' ? Film : FolderArtwork; }
export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={40} strokeWidth={1.2} aria-hidden="true" /></span><h2>{title}</h2><div>{children}</div></div>;
}
