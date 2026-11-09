import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { desktop, errorMessage } from './api';

type Status = { supported: boolean; enabled: boolean; partial: boolean; canRestore: boolean };

export function DefaultManagerSetting() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const refresh = async () => {
    setBusy(true); setError('');
    try { setStatus(await invoke<Status>('default_manager_status')); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (desktop) void refresh(); }, []);
  const change = async (enabled: boolean) => {
    setBusy(true); setError(''); setMessage('');
    try {
      setStatus(await invoke<Status>('set_default_manager', { enabled }));
      setMessage(enabled ? '已设置，之后打开文件夹将使用览山。' : '已恢复接管前的默认打开方式。');
    } catch (e) { setError(errorMessage(e)); await refresh(); setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <section className="default-manager-setting" aria-labelledby="default-manager-title" aria-busy={busy}>
    <strong id="default-manager-title">默认文件管理器</strong>
    <p>将普通文件夹和磁盘的默认打开方式设为览山，仅对当前 Windows 用户生效。系统特殊位置、Win+E 和应用内的文件选择窗口仍由系统处理。</p>
    <p role="status">{!desktop ? '请在 Windows 桌面版中设置。' : busy ? '正在处理…' : !status ? '尚未读取状态' : !status.supported ? '当前系统暂不支持' : status.enabled ? '当前：览山' : status.partial ? '当前：部分接管，可重新设置或恢复' : '当前：未设为览山'}{message && ` · ${message}`}</p>
    <div className="default-manager-actions">
      <button type="button" className="secondary-button" disabled={busy || !status?.supported || status.enabled} onClick={() => void change(true)}>设为默认文件管理器</button>
      <button type="button" className="secondary-button" disabled={busy || !status?.canRestore} onClick={() => void change(false)}>恢复原来的打开方式</button>
      {desktop && <button type="button" className="secondary-button" disabled={busy} onClick={() => void refresh()}>刷新状态</button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
