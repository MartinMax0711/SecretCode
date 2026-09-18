import * as home from './pages/home.js';
import * as period from './pages/period.js';
import * as letters from './pages/letters.js';
import * as schedule from './pages/schedule.js';
import * as punch from './pages/punch.js';
import * as gallery from './pages/gallery.js';
import * as live from './pages/live.js';
import * as sleep from './pages/sleep.js';
import * as chat from './pages/chat.js';
import * as portal from './pages/portal.js';
import { initFocus } from './focus.js';
import { openSheet, toast } from './ui.js';
import { exportAll, importAll, requestPersist } from './store.js';
import { isMuted, setMuted } from './sound.js';

// tab: 是否出现在底部导航
const ROUTES = [
  { id: 'period', label: '经期', icon: '🌸', page: period, tab: true },
  { id: 'sleep', label: '睡眠', icon: '😴', page: sleep, tab: true },
  { id: 'home', label: '首页', icon: '🔔', page: home, tab: true, center: true },
  { id: 'chat', label: '聊天', icon: '💬', page: chat, tab: true },
  { id: 'punch', label: '解气', icon: '🐶', page: punch, tab: true },
  { id: 'letters', label: '道歉信', icon: '💌', page: letters },
  { id: 'schedule', label: '课表', icon: '📚', page: schedule },
  { id: 'gallery', label: '相册', icon: '📷', page: gallery },
  { id: 'live', label: '陪着你', icon: '📍', page: live },
  { id: 'portal', label: '控制台', icon: '🎛️', page: portal, hidden: true },
];

const view = document.getElementById('view');
let current = null;

function buildNav() {
  const tabs = ROUTES.filter((r) => r.tab).map((r) => `
    <a href="#${r.id}" data-route="${r.id}" class="nav-item${r.center ? ' nav-center' : ''}">
      <span class="nav-icon">${r.icon}</span><span class="nav-label">${r.label}</span>
    </a>`).join('');
  document.querySelector('.tabbar').innerHTML = tabs;
  document.querySelector('.topnav').innerHTML = ROUTES.filter((r) => !r.hidden).map((r) => `
    <a href="#${r.id}" data-route="${r.id}" class="nav-item">
      <span class="nav-icon">${r.icon}</span><span class="nav-label">${r.label}</span>
    </a>`).join('');
}

function route() {
  const id = location.hash.slice(1) || 'home';
  const r = ROUTES.find((x) => x.id === id) || ROUTES.find((x) => x.id === 'home');
  current?.page.destroy?.();
  current = r;
  // 换页面时把还开着的弹层收掉
  document.getElementById('sheet-root').innerHTML = '';
  document.body.classList.remove('no-scroll');
  view.innerHTML = '';
  view.className = `page page-${r.id}`;
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === r.id));
  r.page.render(view);
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function openSettings() {
  const { el } = openSheet(`
    <h3 class="sheet-title">⚙️ 小窝设置</h3>
    <label class="setting-row">
      <span>音效</span>
      <input type="checkbox" class="switch" id="set-sound" ${isMuted() ? '' : 'checked'}>
    </label>
    <div class="setting-block">
      <div class="setting-label">备份记录</div>
      <p class="hint">经期这些记录只存在这台设备的浏览器里。换手机或清理浏览器前，记得先备份一下～</p>
      <div class="btn-row">
        <button class="btn btn-ghost" id="set-export">📦 导出备份</button>
        <label class="btn btn-ghost file-btn">📥 导入备份<input type="file" accept="application/json,.json" id="set-import" hidden></label>
      </div>
    </div>
    <div class="setting-block">
      <div class="setting-label">放到主屏幕</div>
      <p class="hint">iPhone：Safari 底部「分享」→「添加到主屏幕」。这样打开更像 App，记录也不容易被浏览器清掉。</p>
    </div>`);

  el.querySelector('#set-sound').addEventListener('change', (e) => setMuted(!e.target.checked));
  el.querySelector('#set-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `晗晗的小窝备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  el.querySelector('#set-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importAll(JSON.parse(await file.text()));
      toast('导入成功啦', { icon: '✅' });
      route();
    } catch (err) {
      toast(err.message || '导入失败', { icon: '⚠️' });
    }
  });
}

buildNav();
document.getElementById('settings-btn').addEventListener('click', openSettings);
window.addEventListener('hashchange', route);
requestPersist();
route();
initFocus();
