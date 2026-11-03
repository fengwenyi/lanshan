import { Children, isValidElement, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { convertFileSrc } from '@tauri-apps/api/core';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, ImageOff, LoaderCircle, X } from 'lucide-react';
import { desktop, displayPath, errorMessage, files } from './api';
import { size } from './components';
import type { FileEntry, FilePreviewData } from './types';

function plainText(children: ReactNode): string {
  return Children.toArray(children).map((child) => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : '').join('');
}
function headingAnchor(children: ReactNode): string {
  return plainText(children).trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-');
}
function Heading({ level: Tag, children }: { level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; children?: ReactNode }) {
  const id = useId();
  return <Tag id={`markdown-${id}`} data-markdown-anchor={headingAnchor(children)} tabIndex={-1}>{children}</Tag>;
}
function CodeBlock({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const code = Children.toArray(children).find((child) => isValidElement(child));
  const language = isValidElement<{ className?: string }>(code) ? code.props.className?.replace(/^language-/, '') : undefined;
  return <div className="markdown-code-block"><div className="markdown-code-toolbar"><span>{language || '代码'}</span><button type="button" onClick={() => {
    if (!navigator.clipboard?.writeText) { setState('error'); return; }
    void navigator.clipboard.writeText(plainText(children)).then(() => setState('copied')).catch(() => setState('error'));
  }}>{state === 'copied' ? <Check size={12} /> : <Copy size={12} />}{state === 'copied' ? '已复制' : state === 'error' ? '复制失败，重试' : '复制'}</button></div><pre>{children}</pre></div>;
}
function localPath(baseFile: string, source: string): string | null {
  try {
    const value = decodeURIComponent(source.split(/[?#]/, 1)[0]);
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(value) || value.includes('\0')) return null;
    const base = displayPath(baseFile);
    const separator = base.includes('\\') ? '\\' : '/';
    const index = Math.max(base.lastIndexOf('\\'), base.lastIndexOf('/'));
    if (index < 0) return null;
    return `${base.slice(0, index)}${separator}${value.replace(/[\\/]/g, separator)}`;
  } catch { return null; }
}
function MarkdownImage({ baseFile, source, alt }: { baseFile: string; source: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const path = localPath(baseFile, source);
  const supported = path !== null && /\.(?:png|jpe?g|gif|webp|bmp|ico|svg|avif)$/i.test(path);
  const preview = useQuery({ queryKey: ['markdown-image', path], enabled: desktop && supported,
    queryFn: async () => {
      if (!path) throw new Error('图片位置无效。');
      const data = await files.preview(path);
      if (data.kind !== 'image' || !data.path) throw new Error('此文件不支持图片预览。');
      return data;
    }, staleTime: 15000, gcTime: 60000 });
  if (!supported || preview.isError || failed) return <span className="markdown-image-fallback" role="img" aria-label={alt || '无法显示图片'}><ImageOff size={16} />{alt || '图片'}<small>{!path ? '外部或绝对路径图片未加载' : preview.isError ? errorMessage(preview.error) : '无法显示此图片'}</small></span>;
  if (preview.isPending || !preview.data.path) return <span className="markdown-image-fallback" role="status"><LoaderCircle size={15} className="spin" />正在读取图片…</span>;
  return <img className="markdown-image" loading="lazy" src={`${convertFileSrc(preview.data.path)}?size=${preview.data.size}`} alt={alt} onError={() => setFailed(true)} />;
}
export function MarkdownPreview({ entry, data, expanded }: { entry: FileEntry; data: FilePreviewData; expanded: boolean }) {
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered');
  const [wrap, setWrap] = useState(false);
  const [notice, setNotice] = useState('');
  const article = useRef<HTMLElement>(null);
  const id = useId();
  const components = useMemo<Components>(() => ({
    h1: ({ children }) => <Heading level="h1">{children}</Heading>,
    h2: ({ children }) => <Heading level="h2">{children}</Heading>,
    h3: ({ children }) => <Heading level="h3">{children}</Heading>,
    h4: ({ children }) => <Heading level="h4">{children}</Heading>,
    h5: ({ children }) => <Heading level="h5">{children}</Heading>,
    h6: ({ children }) => <Heading level="h6">{children}</Heading>,
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>,
    img: ({ src, alt }) => <MarkdownImage baseFile={entry.path} source={typeof src === 'string' ? src : ''} alt={alt ?? ''} />,
    a: ({ href, children, title }) => <a href={href || undefined} title={title} onClick={(event) => {
      event.preventDefault(); event.stopPropagation(); setNotice('');
      if (!href) { setNotice('该链接格式不受支持。'); return; }
      if (href.startsWith('#')) {
        let anchor: string;
        try { anchor = decodeURIComponent(href.slice(1)); } catch { setNotice('标题链接格式无效。'); return; }
        const heading = Array.from(article.current?.querySelectorAll<HTMLElement>('[data-markdown-anchor],[id]') ?? []).find((node) => node.dataset.markdownAnchor === anchor || node.id === anchor);
        if (heading) { heading.scrollIntoView({ block: 'start' }); heading.focus({ preventScroll: true }); }
        else setNotice('当前预览中未找到这个标题。');
      } else if (/^https?:\/\//i.test(href)) {
        void files.openExternal(href).catch((error: unknown) => setNotice(errorMessage(error)));
      } else {
        const path = localPath(entry.path, href);
        if (!path) { setNotice('该链接格式不受支持。'); return; }
        void files.open(path).catch((error: unknown) => setNotice(errorMessage(error)));
      }
    }}>{children}</a>,
  }), [entry.path]);
  return <div data-preview-content className={`file-preview text-document markdown-document ${expanded ? 'expanded-document' : ''}`}>
    <div className="text-preview-tools markdown-preview-tools"><div role="tablist" aria-label="Markdown 预览模式">{(['rendered', 'source'] as const).map((value) => <button type="button" key={value} role="tab" id={`${id}-${value}`} aria-selected={mode === value} aria-controls={`${id}-${value}-panel`} tabIndex={mode === value ? 0 : -1} onClick={() => setMode(value)} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === 'Home' ? 'rendered' : event.key === 'End' ? 'source' : mode === 'rendered' ? 'source' : 'rendered';
      setMode(next);
      const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[next === 'rendered' ? 0 : 1]?.focus();
    }}>{value === 'rendered' ? '效果' : '原文'}</button>)}</div>{mode === 'source' ? <label><input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />自动换行</label> : <span className="markdown-encoding">{data.encoding} · {size(data.size)}</span>}</div>
    {data.truncated && <p className="preview-limit">大文件仅预览前 256 KB，末尾排版可能不完整</p>}
    {notice && <div className="markdown-notice" role="status"><span>{notice}</span><button type="button" aria-label="关闭提示" onClick={() => setNotice('')}><X size={12} /></button></div>}
    <div role="tabpanel" id={`${id}-rendered-panel`} aria-labelledby={`${id}-rendered`} hidden={mode !== 'rendered'} className="markdown-panel"><article ref={article} tabIndex={0} className="markdown-body" aria-label={`${entry.name} 排版效果`}>{data.text ? <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>{data.text}</Markdown> : <p className="markdown-empty">这是一个空文件</p>}</article></div>
    <div role="tabpanel" id={`${id}-source-panel`} aria-labelledby={`${id}-source`} hidden={mode !== 'source'} className="markdown-panel"><pre tabIndex={0} className={wrap ? 'wrap-text' : ''} aria-label={`${entry.name} Markdown 原文`}>{data.text || '这是一个空文件'}</pre></div>
  </div>;
}
