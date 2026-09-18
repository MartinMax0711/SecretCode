// 耀耀的独立控制台。进了这个页面，身份永远是「耀耀」，
// 所以聊天里他发的消息一定显示在右边、标成他自己。
import { setRole } from './roles.js';

setRole('him'); // 必须在其它模块读身份之前执行

const [
  { hasHisPassword, hisPassword, setHisPassword },
  { esc, openSheet, toast },
  { load, save },
  { sfx },
  chat,
  mine,
  { initFocus },
] = await Promise.all([
  import('./roles.js'),
  import('./ui.js'),
  import('./store.js'),
  import('./sound.js'),
  import('./pages/chat.js'),
  import('./pages/mine.js'),
  import('./focus.js'),
]);

const ROUTES = [
  { id: 'chat', label: '聊天', icon: '💬', page: chat },
  { id: 'mine', label: '我的', icon: '🎛️', page: mine },
];

const view = document.getElementById('view');
let current = null;

function buildNav() {
  const items = ROUTES.map((r) => `
    <a href="#${r.id}" data-route="${r.id}" class="nav-item">
      <span class="nav-icon">${r.icon}</span><span class="nav-label">${r.label}</span>
    </a>`).join('');
  document.querySelector('.tabbar').innerHTML = items;
  document.querySelector('.topnav').innerHTML = items;
}

function route() {
  const id = location.hash.slice(1) || 'chat';
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  current?.page.destroy?.();
  current = r;
  document.getElementById('sheet-root').innerHTML = '';
  document.body.classList.remove('no-scroll');
  view.innerHTML = '';
  view.className = `page page-${r.id}`;
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === r.id));
  r.page.render(view);
  window.scrollTo(0, 0);
}

// 密码门：第一次进来自己设，只存在这台设备
function lockScreen() {
  const first = !hasHisPassword();
  view.className = 'page page-lock';
  view.innerHTML = `
    <div class="portal-lock">
      <div class="lock-emoji">🔐</div>
      <h1 class="portal-title">耀耀的控制台</h1>
      <p class="hint">${first
        ? '这台设备第一次进来，设一个只有你知道的密码。它只存在这台设备上，不会进仓库。'
        : '输入你的密码'}</p>
      <form id="lock-form">
        <input type="password" class="input" id="lock-pw" placeholder="${first ? '设置密码（至少 4 位）' : '密码'}" autocomplete="current-password">
        <button class="btn btn-primary btn-block" type="submit">${first ? '设好了，进去' : '进去'}</button>
      </form>
      <p class="hint" id="lock-err"></p>`;

  document.getElementById('lock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pw = document.getElementById('lock-pw').value.trim();
    if (!hasHisPassword()) {
      if (pw.length < 4) {
        document.getElementById('lock-err').textContent = '密码至少 4 位';
        return;
      }
      setHisPassword(pw);
    }
    if (pw === hisPassword()) {
      save('meOpen', true);
      sfx.tada();
      start();
    } else {
      document.getElementById('lock-err').textContent = '密码不对';
      sfx.slap();
    }
  });
}

function start() {
  document.querySelector('.tabbar').style.display = '';
  buildNav();
  window.addEventListener('hashchange', route);
  route();
  initFocus();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
}

if (load('meOpen', false)) {
  start();
} else {
  document.querySelector('.tabbar').style.display = 'none';
  lockScreen();
}
