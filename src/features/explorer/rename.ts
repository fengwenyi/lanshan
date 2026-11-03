import type { FileEntry } from './types';

export interface RenameRule {
  mode: 'decorate' | 'replace' | 'sequence';
  prefix: string;
  suffix: string;
  find: string;
  replacement: string;
  base: string;
  start: number;
  digits: number;
  preserveExtension: boolean;
}
export const defaultRenameRule: RenameRule = { mode: 'decorate', prefix: '', suffix: '', find: '', replacement: '', base: '文件', start: 1, digits: 3, preserveExtension: true };
export interface RenameRow { entry: FileEntry; name: string; error: string; unchanged: boolean }
export function invalidName(name: string): boolean {
  const stem = name.split('.')[0].toUpperCase();
  return !name.trim() || name.length > 255 || /[ .]$/.test(name) || /[\\/:*?"<>|\p{Cc}]/u.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem);
}
export function renamePlan(entries: FileEntry[], existing: FileEntry[], rule: RenameRule): RenameRow[] {
  const occupied = new Map(existing.map((entry) => [entry.name.toLocaleLowerCase(), entry]));
  const ruleError = rule.mode === 'replace' && !rule.find ? '请填写要查找的文字' : rule.mode === 'sequence' && (!rule.base.trim() || !Number.isInteger(rule.start) || rule.start < 0 || rule.start > 1e9 || !Number.isInteger(rule.digits) || rule.digits < 1 || rule.digits > 9) ? '请填写名称；起始序号为 0–10亿，位数为 1–9' : '';
  const rows = entries.map((entry, index): RenameRow => {
    const dot = rule.preserveExtension ? entry.name.lastIndexOf('.') : -1;
    const extension = dot > 0 ? entry.name.slice(dot) : '';
    const stem = extension ? entry.name.slice(0, dot) : entry.name;
    const body = rule.mode === 'sequence' ? `${rule.base}${String(rule.start + index).padStart(Math.min(9, Math.max(1, rule.digits || 1)), '0')}` : rule.mode === 'replace' ? rule.find ? stem.split(rule.find).join(rule.replacement) : stem : stem;
    const name = `${rule.prefix}${body}${rule.suffix}${extension}`;
    const unchanged = name === entry.name;
    const source = occupied.get(entry.name.toLocaleLowerCase());
    const conflict = occupied.has(name.toLocaleLowerCase());
    const error = ruleError || (entry.isDirectory || entry.isSymlink ? '仅支持普通文件' : !source || source.isSymlink || source.isDirectory ? '源文件已不存在或类型改变' : invalidName(name) ? '名称无效或超过 255 个 UTF-16 字符' : !unchanged && conflict ? '目标名称已占用（不支持名称交换或仅改大小写）' : '');
    return { entry, name, unchanged, error };
  });
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name.toLocaleLowerCase(), (counts.get(row.name.toLocaleLowerCase()) ?? 0) + 1);
  return rows.map((row) => ({ ...row, error: row.error || ((counts.get(row.name.toLocaleLowerCase()) ?? 0) > 1 ? '批次内存在重复目标名称' : '') }));
}
