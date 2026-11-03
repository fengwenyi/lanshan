import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileQuestion, LoaderCircle, Minus, Plus, RefreshCw, Scan } from 'lucide-react';
import { desktop, errorMessage, files } from './api';
import { Glyph, IconButton, size } from './components';
import { MarkdownPreview } from './MarkdownPreview';
import type { FileEntry } from './types';

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);
function useFilePreview(entry: FileEntry, enabled = true) {
  return useQuery({ queryKey: ['preview', entry.path, entry.size, entry.modified], queryFn: () => files.preview(entry.path),
    enabled: desktop && enabled && !entry.isDirectory && !entry.isSymlink, staleTime: 15000, gcTime: 60000 });
}
export function EntryThumbnail({ entry }: { entry: FileEntry }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const image = imageExtensions.has(entry.extension) && !entry.isDirectory && !entry.isSymlink;
  useEffect(() => {
    if (!image || !ref.current) return;
    const observer = new IntersectionObserver(([value]) => { if (value.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '100px' });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [image]);
  const preview = useFilePreview(entry, image && visible);
  const src = preview.data?.path && preview.data.kind === 'image' ? `${convertFileSrc(preview.data.path)}?v=${entry.modified}-${preview.data.size}` : null;
  return <span ref={ref} className="entry-thumbnail">{src && !failed ? <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} /> : <Glyph entry={entry} large />}</span>;
}
export function FilePreview({ entry, expanded = false }: { entry: FileEntry; expanded?: boolean }) {
  const preview = useFilePreview(entry);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [wrap, setWrap] = useState(false);
  if (entry.isDirectory || entry.isSymlink) return <div className="file-preview preview-generic"><Glyph entry={entry} large /><p>{entry.isDirectory ? '文件夹' : '链接不提供内容预览'}</p></div>;
  if (preview.isPending) return <div className="file-preview preview-message" role="status"><LoaderCircle size={24} className="spin" /><p>正在读取预览…</p></div>;
  if (preview.isError || failed) return <div className="file-preview preview-message"><FileQuestion size={32} strokeWidth={1.3} /><p role="alert">{preview.isError ? errorMessage(preview.error) : '无法显示此文件，可能已损坏或格式暂不受支持。'}</p><button className="text-button" onClick={() => { setFailed(false); void preview.refetch(); }}><RefreshCw size={13} />重新读取</button></div>;
  const data = preview.data;
  const src = data.path ? `${convertFileSrc(data.path)}?v=${entry.modified}-${data.size}` : undefined;
  if (data.kind === 'unsupported') return <div className="file-preview preview-generic"><Glyph entry={entry} large /><h3>此格式暂不支持内容预览</h3><p>可通过“使用默认应用打开”查看。</p></div>;
  if (data.kind === 'text' && ['md', 'markdown'].includes(entry.extension.toLowerCase())) return <MarkdownPreview entry={entry} data={data} expanded={expanded} />;
  if (data.kind === 'text') return <div data-preview-content className={`file-preview text-document ${expanded ? 'expanded-document' : ''}`}><div className="text-preview-tools"><span>{data.encoding} · {size(data.size)}</span><label><input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />自动换行</label></div>{data.truncated && <p className="preview-limit">大文件仅显示前 256 KB 内容</p>}{data.text ? <pre tabIndex={0} className={wrap ? 'wrap-text' : ''} aria-label={`${entry.name} 文本内容`}>{data.text}</pre> : <div className="preview-message"><p>这是一个空文件</p></div>}</div>;
  if (data.kind === 'image') return <div className={`file-preview image-document ${expanded ? 'expanded-document' : ''}`}><div className={`image-preview-stage ${zoom > 0 ? 'zoomed-image' : ''}`}><img src={src} alt={entry.name} draggable={false} onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailed(true)} style={zoom > 0 && dimensions ? { width: dimensions.width * zoom / 100, height: dimensions.height * zoom / 100, maxWidth: 'none', maxHeight: 'none' } : undefined} /></div>{expanded && <div className="image-preview-tools"><span>{dimensions ? `${dimensions.width} × ${dimensions.height}` : '图片'}</span><div><IconButton icon={Scan} label="适应窗口" active={zoom === 0} onClick={() => setZoom(0)} /><IconButton icon={Minus} label="缩小图片" disabled={!dimensions || zoom === 25} onClick={() => setZoom((value) => Math.max(25, (value || 100) - 25))} /><button className="zoom-label" disabled={!dimensions} title="以原始尺寸显示" onClick={() => setZoom(100)}>{zoom ? `${zoom}%` : '适应'}</button><IconButton icon={Plus} label="放大图片" disabled={!dimensions || zoom === 300} onClick={() => setZoom((value) => Math.min(300, (value || 100) + 25))} /></div></div>}</div>;
  if (data.kind === 'pdf') return expanded ? <div className="file-preview pdf-document"><iframe src={src} title={`${entry.name} PDF 预览`} referrerPolicy="no-referrer" onError={() => setFailed(true)} /><p className="preview-limit">未显示内容时，可使用默认应用打开。</p></div> : <div className="file-preview preview-generic"><Glyph entry={entry} large /><p>PDF 文档 · 按空格展开预览</p></div>;
  if (data.kind === 'video') return <div className="file-preview media-document"><video controls playsInline preload="metadata" src={src} onError={() => setFailed(true)} aria-label={`${entry.name} 视频预览`} /><p className="preview-limit">播放取决于此设备支持的编码格式</p></div>;
  return <div className="file-preview media-document audio-document"><Glyph entry={entry} large /><audio controls preload="metadata" src={src} onError={() => setFailed(true)} aria-label={`${entry.name} 音频预览`} /></div>;
}
