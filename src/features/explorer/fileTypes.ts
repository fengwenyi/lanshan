import { AppWindow, BookOpen, Database, Disc3, File, FileArchive, FileCode2, FileCog, FileImage, FileKey2, FileMusic, FileSpreadsheet, FileText, FileType2, Film, Folder, Link, Palette, Presentation, Settings2, Terminal, type LucideIcon } from 'lucide-react';
import type { FileEntry } from './types';

interface FileType { icon: LucideIcon; label: string; tone: string; badge: string }
interface FileTypeGroup extends Omit<FileType, 'badge'> { extensions: readonly string[]; badge?: string }
const groups: readonly FileTypeGroup[] = [
  { extensions: ['doc', 'docx', 'docm', 'dot', 'dotx', 'odt', 'rtf', 'wps'], icon: FileText, label: 'Word 文档', tone: 'word' },
  { extensions: ['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'csv', 'tsv', 'et'], icon: FileSpreadsheet, label: '电子表格', tone: 'sheet' },
  { extensions: ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'potx', 'odp', 'dps', 'key'], icon: Presentation, label: '演示文稿', tone: 'slides' },
  { extensions: ['pdf'], icon: FileText, label: 'PDF 文档', tone: 'pdf' },
  { extensions: ['md', 'mdx', 'markdown', 'rst'], icon: FileText, label: 'Markdown 文档', tone: 'markdown' },
  { extensions: ['txt', 'text', 'log'], icon: FileText, label: '文本文档', tone: 'text' },
  { extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'heic', 'heif', 'tif', 'tiff', 'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng'], icon: FileImage, label: '图片', tone: 'image' },
  { extensions: ['psd', 'psb', 'ai', 'eps', 'sketch', 'fig', 'xd', 'afdesign', 'afphoto'], icon: Palette, label: '设计文件', tone: 'design' },
  { extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'ogv', 'wmv', 'flv', 'mpeg', 'mpg', 'ts', 'm2ts'], icon: Film, label: '视频', tone: 'video' },
  { extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'mid', 'midi'], icon: FileMusic, label: '音频', tone: 'audio' },
  { extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'tgz', 'cab', 'lz', 'lzma'], icon: FileArchive, label: '压缩文件', tone: 'archive' },
  { extensions: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'pyw', 'rs', 'go', 'java', 'class', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'rb', 'php', 'swift', 'kt', 'kts', 'dart', 'lua', 'r', 'vue', 'svelte', 'html', 'htm', 'css', 'scss', 'sass', 'less'], icon: FileCode2, label: '源代码', tone: 'code' },
  { extensions: ['json', 'jsonl', 'xml', 'ndjson', 'graphql', 'proto'], icon: FileCode2, label: '数据文件', tone: 'data' },
  { extensions: ['ini', 'cfg', 'conf', 'config', 'yaml', 'yml', 'toml', 'properties', 'env', 'lock'], icon: Settings2, label: '配置文件', tone: 'config' },
  { extensions: ['db', 'sqlite', 'sqlite3', 'db3', 'sql', 'mdb', 'accdb'], icon: Database, label: '数据库文件', tone: 'database' },
  { extensions: ['ttf', 'otf', 'woff', 'woff2', 'eot', 'ttc'], icon: FileType2, label: '字体文件', tone: 'font' },
  { extensions: ['exe', 'msi', 'msix', 'appx', 'appxbundle', 'msixbundle', 'com', 'scr', 'apk', 'deb', 'rpm'], icon: AppWindow, label: '应用程序 / 安装包', tone: 'application' },
  { extensions: ['dll', 'sys', 'so', 'dylib', 'ocx'], icon: FileCog, label: '系统组件', tone: 'system' },
  { extensions: ['ps1', 'bat', 'cmd', 'sh', 'bash', 'zsh', 'vbs'], icon: Terminal, label: '脚本文件', tone: 'script' },
  { extensions: ['iso', 'img', 'dmg', 'vhd', 'vhdx', 'vmdk'], icon: Disc3, label: '磁盘映像', tone: 'disk' },
  { extensions: ['lnk', 'url', 'desktop'], icon: Link, label: '快捷方式', tone: 'shortcut' },
  { extensions: ['epub', 'mobi', 'azw', 'azw3', 'fb2'], icon: BookOpen, label: '电子书', tone: 'ebook' },
  { extensions: ['pem', 'crt', 'cer', 'pfx', 'p12', 'pub', 'key'], icon: FileKey2, label: '证书 / 密钥', tone: 'certificate' },
];
// Resolve ambiguous extensions consistently: .ts is TypeScript, .key is a certificate.
const overrides = new Map<string, FileType>([
  ['ts', { icon: FileCode2, label: 'TypeScript 源代码', tone: 'code', badge: 'TS' }],
  ['tsx', { icon: FileCode2, label: 'TypeScript 源代码', tone: 'code', badge: 'TSX' }],
  ['key', { icon: FileKey2, label: '密钥文件', tone: 'certificate', badge: 'KEY' }],
]);
const extensionTypes = new Map<string, FileType>();
for (const group of groups) {
  for (const extension of group.extensions) {
    extensionTypes.set(extension, { icon: group.icon, label: group.label, tone: group.tone, badge: group.badge ?? extension.toUpperCase() });
  }
}
for (const [extension, value] of overrides) extensionTypes.set(extension, value);
export function getFileType(entry: FileEntry): FileType {
  if (entry.isDirectory) return { icon: Folder, label: entry.isSymlink ? '文件夹链接' : '文件夹', tone: 'folder', badge: '' };
  const extension = entry.extension.toLowerCase();
  const name = entry.name.toLowerCase();
  if (entry.isSymlink) return { icon: Link, label: '符号链接', tone: 'shortcut', badge: extension.toUpperCase().slice(0, 6) || 'LINK' };
  if (['.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.prettierrc', '.eslintrc'].includes(name) || name === '.env' || name.startsWith('.env.')) return { icon: Settings2, label: '配置文件', tone: 'config', badge: 'CONFIG' };
  if (['dockerfile', 'makefile', 'justfile'].includes(name)) return { icon: Terminal, label: '构建脚本', tone: 'script', badge: 'BUILD' };
  if (['readme', 'license', 'licence', 'changelog', 'notice'].includes(name)) return { icon: FileText, label: '文本文档', tone: 'text', badge: 'TXT' };
  return extensionTypes.get(extension) ?? { icon: File, label: extension ? `${extension.toUpperCase()} 文件` : '文件', tone: 'generic', badge: extension.slice(0, 6).toUpperCase() || 'FILE' };
}
