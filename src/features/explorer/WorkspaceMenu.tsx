import { ToolbarItem } from './ToolbarCustomization';
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronRight, Info, Mountain, Settings, X } from 'lucide-react';
import { usePreferences } from './preferences';
import { panePath, useExplorer } from './store';
import { defaultIconLayout } from './iconLayout';
import { useIconLayouts } from './iconLayoutStore';
import { favoriteKey } from './workspaceStorage';
import { version } from '../../../package.json';

export function WorkspaceMenu() {
  const preferences = usePreferences();
  const explorer = useExplorer();
  const [menu, setMenu] = useState<'edit' | 'view' | 'help' | null>(null);
  const layouts = useIconLayouts();
  const tab = explorer.tabs.find((item) => item.id === explorer.activeTabId) ?? explorer.tabs[0];
  const pane = tab.panes.find((item) => item.id === tab.activePaneId) ?? tab.panes[0];
  const path = panePath(pane);
  const layout = layouts.directories.find((item) => favoriteKey(item.path) === favoriteKey(path))?.layout ?? defaultIconLayout;
  const showTabs = explorer.tabs.length > 1 || preferences.tabBar === 'show';
  const [arrangementOpen, setArrangementOpen] = useState(false);
  const [dialog, setDialog] = useState<'settings' | 'about' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    setArrangementOpen(false);
    if (!menu) return;
    root.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setMenu(null); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menu]);
  const open = (kind: 'settings' | 'about') => { setMenu(null); setDialog(kind); };
  return <div className="workspace-menu" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }} onKeyDown={(event) => {
    if (event.key === 'Escape' && menu) { event.preventDefault(); setMenu(null); trigger.current?.focus(); }
    if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const container = (event.target as HTMLElement).closest('[role="menu"]') ?? root.current;
      const items = Array.from(container?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []).filter((item) => item.closest('[role="menu"]') === container);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    {(['edit', 'view', 'help'] as const).map((kind) => {
      const title = kind === 'edit' ? '编辑' : kind === 'view' ? '显示' : '帮助';
      const choose = (action: () => void) => { action(); setMenu(null); trigger.current?.focus(); };
      const option = (label: string, checked: boolean, action: () => void, disabled = false, radio = false) => <button key={label} role={radio ? 'menuitemradio' : 'menuitemcheckbox'} aria-checked={checked} disabled={disabled} onClick={() => choose(action)}><Check size={15} aria-hidden="true" style={{ visibility: checked ? 'visible' : 'hidden' }} />{label}</button>;
      return <ToolbarItem id={kind} key={kind}><div className="app-menu"><button className="app-menu-trigger" aria-haspopup="menu" aria-expanded={menu === kind} aria-controls={`app-menu-${kind}`} onClick={(event) => { trigger.current = event.currentTarget; setMenu(menu === kind ? null : kind); }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); trigger.current = event.currentTarget; setMenu(kind); } }}>{title}</button>{menu === kind && <div className="app-menu-popup" role="menu" id={`app-menu-${kind}`} aria-label={title}>
        {kind === 'view' ? <>
          {option(`${preferences.showAddressBar ? '隐藏' : '显示'}地址栏`, preferences.showAddressBar, () => preferences.change({ showAddressBar: !preferences.showAddressBar }))}
          {option(`${preferences.showPathBar ? '隐藏' : '显示'}路径栏`, preferences.showPathBar, () => preferences.change({ showPathBar: !preferences.showPathBar }))}
          {option(`${showTabs ? '隐藏' : '显示'}标签栏`, showTabs, () => preferences.change({ tabBar: showTabs ? 'hide' : 'show' }), explorer.tabs.length > 1)}
          {option(`${preferences.sidebar ? '隐藏' : '显示'}边栏`, preferences.sidebar, () => preferences.change({ sidebar: !preferences.sidebar }))}
          {option('显示隐藏文件', preferences.showHidden, () => preferences.change({ showHidden: !preferences.showHidden }))}
          <div role="separator" className="app-menu-separator" />
          <div role="group" aria-label="视图">
            {option('为图标', pane.view === 'grid', () => explorer.setView(pane.id, 'grid'), false, true)}
            {option('为列表', pane.view === 'list', () => explorer.setView(pane.id, 'list'), false, true)}
            {option('为画廊', pane.view === 'gallery', () => explorer.setView(pane.id, 'gallery'), false, true)}
          </div>
          {option('为分栏', tab.panes.length === 2, explorer.toggleSplit)}
          <div role="separator" className="app-menu-separator" />
          {option(`${layout.guides ? '隐藏' : '显示'}参考线`, layout.guides, () => { layouts.update(path, { guides: !layout.guides }); explorer.setView(pane.id, 'grid'); }, !path)}
          <div className="app-menu-submenu"><button role="menuitem" aria-haspopup="menu" aria-expanded={arrangementOpen} aria-controls="arrangement-menu" disabled={!path} onClick={() => setArrangementOpen(!arrangementOpen)} onKeyDown={(event) => { if (event.key === 'ArrowRight') { event.preventDefault(); setArrangementOpen(true); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('#arrangement-menu button')?.focus()); } }}>排列方式<ChevronRight size={14} aria-hidden="true" /></button>
            {arrangementOpen && <div className="app-menu-popup" id="arrangement-menu" role="menu" aria-label="排列方式" onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setArrangementOpen(false); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(':scope > button')?.focus(); } }}>
              {option('对齐网格', layout.mode === 'aligned', () => { layouts.update(path, { mode: 'aligned' }); explorer.setView(pane.id, 'grid'); }, false, true)}
              {option('自由摆放', layout.mode === 'free', () => { layouts.update(path, { mode: 'free' }); explorer.setView(pane.id, 'grid'); }, false, true)}
            </div>}
          </div>
        </> : <button role="menuitem" onClick={() => open(kind === 'edit' ? 'settings' : 'about')}>{kind === 'edit' ? <Settings size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}{kind === 'edit' ? '设置…' : '关于览山'}</button>}
      </div>}</div></ToolbarItem>;
    })}
    <Dialog.Root open={dialog !== null} onOpenChange={(value) => { if (!value) setDialog(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content preferences-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
      <Dialog.Close className="preferences-close" aria-label="关闭"><X size={18} /></Dialog.Close>
      <div className="dialog-icon">{dialog === 'settings' ? <Settings size={25} /> : <Mountain size={29} />}</div>
      <Dialog.Title>{dialog === 'settings' ? '设置' : '关于览山'}</Dialog.Title>
      <Dialog.Description>{dialog === 'settings' ? '调整浏览习惯，更改立即生效并自动保存。' : '让文件井然有序，让浏览从容自如。'}</Dialog.Description>
      {dialog === 'settings' ? <div className="preference-fields">
        <label><span>显示左侧边栏<small>快速访问收藏与磁盘位置</small></span><input type="checkbox" checked={preferences.sidebar} onChange={(e) => preferences.change({ sidebar: e.target.checked })} /></label>
        <label><span>显示路径栏<small>在文件区域底部显示文件夹层级，点击可跳转</small></span><input type="checkbox" checked={preferences.showPathBar} onChange={(e) => preferences.change({ showPathBar: e.target.checked })} /></label>
        <label><span>显示点开头的隐藏文件<small>应用于所有窗格及文件搜索</small></span><input type="checkbox" checked={preferences.showHidden} onChange={(e) => preferences.change({ showHidden: e.target.checked })} /></label>
        <label><span>显示详情面板<small>在浏览时查看所选文件信息</small></span><input type="checkbox" checked={explorer.inspector} onChange={explorer.toggleInspector} /></label>
        <label><span>默认视图<small>应用于新标签和新窗格</small></span><select value={preferences.defaultView} onChange={(e) => preferences.change({ defaultView: e.target.value === 'grid' ? 'grid' : 'list' })}><option value="list">列表</option><option value="grid">图标</option></select></label>
        <label><span>紧凑列表<small>缩小行间距，显示更多文件</small></span><input type="checkbox" checked={preferences.compact} onChange={(e) => preferences.change({ compact: e.target.checked })} /></label>
        {preferences.error && <p role="alert">{preferences.error}</p>}
        <div className="dialog-buttons"><button className="secondary-button" onClick={() => { preferences.reset(); if (!explorer.inspector) explorer.toggleInspector(); }}>恢复默认</button><Dialog.Close className="primary-button">完成</Dialog.Close></div>
      </div> : <><div className="about-details"><strong>览山 LANSHAN</strong><span>版本 {version}</span><p>桌面文件管理工具，支持多标签、双栏浏览、文件预览和批量整理。</p><span>开源许可 · MIT</span></div><div className="dialog-buttons"><Dialog.Close className="primary-button">关闭</Dialog.Close></div></>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
