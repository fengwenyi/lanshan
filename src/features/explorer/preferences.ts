import { create } from 'zustand';

const defaults = { sidebar: true, tabBar: 'auto' as 'auto' | 'show' | 'hide', showPathBar: true, showAddressBar: true, showHidden: false, defaultView: 'list' as 'list' | 'grid', compact: false };
type Preferences = typeof defaults;
const key = 'lanshan.preferences.v1';
function read(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}');
    return { tabBar: value.tabBar === 'show' || value.tabBar === 'hide' ? value.tabBar : 'auto', showPathBar: value.showPathBar !== false, showAddressBar: value.showAddressBar !== false, sidebar: typeof value.sidebar === 'boolean' ? value.sidebar : true, showHidden: value.showHidden === true, defaultView: value.defaultView === 'grid' ? 'grid' : 'list', compact: value.compact === true };
  } catch { return { ...defaults }; }
}
export const usePreferences = create<Preferences & { error: string; change: (patch: Partial<Preferences>) => void; reset: () => void }>((set) => {
  const save = (value: Preferences) => {
    let error = '';
    try { localStorage.setItem(key, JSON.stringify({ sidebar: value.sidebar, tabBar: value.tabBar, showPathBar: value.showPathBar, showAddressBar: value.showAddressBar, showHidden: value.showHidden, defaultView: value.defaultView, compact: value.compact })); } catch { error = '偏好保存失败，更改仅在本次会话生效。'; }
    set({ ...value, error });
  };
  return { ...read(), error: '', change: (patch) => save({ ...usePreferences.getState(), ...patch }), reset: () => save({ ...defaults }) };
});
