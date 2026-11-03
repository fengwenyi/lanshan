import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { desktop, files } from './api';
import type { FileEntry } from './types';

export function hasApplicationIcon(entry: FileEntry): boolean { return !entry.isDirectory && !entry.isSymlink && ['exe', 'com', 'msi', 'msp', 'lnk'].includes(entry.extension.toLowerCase()); }
export function ApplicationIcon({ entry, large, fallback }: { entry: FileEntry; large: boolean; fallback: ReactNode }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!desktop || !element.current) return;
    const observer = new IntersectionObserver(([value]) => { if (value.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '80px' });
    observer.observe(element.current); return () => observer.disconnect();
  }, []);
  const icon = useQuery({ queryKey: ['application-icon-hires-v2', entry.path, entry.size, entry.modified], queryFn: () => files.applicationIcon(entry.path), enabled: desktop && visible, staleTime: 300000, gcTime: 60000, retry: false });
  return <span ref={element} className={`application-icon-slot ${large ? 'large' : ''}`} aria-hidden="true" title={icon.isError ? '应用图标读取失败，显示通用图标' : entry.name}>{icon.data && !failed ? <img src={icon.data.src} style={{ width: Math.min(large ? 64 : 22, icon.data.pixels / Math.max(1, window.devicePixelRatio)), height: Math.min(large ? 64 : 22, icon.data.pixels / Math.max(1, window.devicePixelRatio)) }} alt="" draggable={false} onError={() => setFailed(true)} /> : fallback}</span>;
}
