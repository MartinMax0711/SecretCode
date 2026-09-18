// 耀耀的专属控制台：用他自己设的密码进来，所有「需要他操作」的功能都在这
import { CONFIG } from '../config.js';
import { esc, toast, floatAt } from '../ui.js';
import { load, save } from '../store.js';
import { sfx } from '../sound.js';
import { TOPICS, getRole, hasHisPassword, hisPassword, post, setHisPassword, setRole } from '../roles.js';
import { getTasks, newTask, publishTasks, syncTasks } from '../tasks-core.js';
import { isLocked, openFocusPicker, startFocus } from '../focus.js';
import { openStorage } from '../storage-lock.js';
import { unansweredFromOther, syncRecent } from '../chat-core.js';
import { relativeTime } from '../dates.js';

let root;
let alive = false;
let tasks = [];

export function render(container) {
  root = container;
  alive = true;
  if (!load('portalOpen', false)) {
    drawLock();
  } else {
    setRole('him');
    drawPortal();
  }
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
}

export function destroy() {
  alive = false;
  root?.removeEventListener('click', onClick);
  root?.removeEventListener('submit', onSubmit);
}

function drawLock() {
  const first = !hasHisPassword();
  root.innerHTML = `
    <div class="portal-lock">
      <div class="lock-emoji">🔐</div>
      <h1 class="portal-title">${esc(CONFIG.hisName)}的控制台</h1>
      <p class="hint">${first
        ? '这台设备第一次进来，设一个只有你知道的密码（只存在这台设备上，不会进仓库）'
        : `这里是只有${esc(CONFIG.hisName)}能进的地方`}</p>
      <form id="portal-form">
        <input type="password" class="input" id="portal-pw" placeholder="${first ? '设置密码' : '输入密码'}" autocomplete="off">
        <button class="btn btn-primary btn-block" type="submit">${first ? '设好了，进去' : '进去'}</button>
      </form>
      <p class="hint" id="portal-err"></p>
    </div>`;
}

function drawPortal() {
  tasks = getTasks().items;
  const unread = unansweredFromOther();
  root.innerHTML = `
    <div class="portal-head">
      <h1 class="page-title">🎛️ ${esc(CONFIG.hisName)}的控制台</h1>
      <button class="btn btn-small btn-ghost" data-act="logout">退出</button>
    </div>

    <section class="card portal-block">
      <div class="card-head"><h2>💗 想她</h2></div>
      <p class="hint">点一下，${esc(CONFIG.herName)}打开小窝首页就会看到你什么时候想她。</p>
      <div class="miss-quick">
        ${['我好想你', '上课的时候在想你', '看到好吃的想你了', '想抱抱你'].map((t) =>
          `<button class="chip chip-pick" data-miss="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <form id="miss-form">
        <input class="input" id="miss-text" placeholder="或者自己写一句…" maxlength="80" autocomplete="off">
        <button class="btn btn-primary btn-block" type="submit">💗 发给${esc(CONFIG.herName)}</button>
      </form>
    </section>

    <section class="card portal-block">
      <div class="card-head"><h2>📝 我的报备任务</h2><span class="hint">${tasks.length} 项</span></div>
      <p class="hint">填在这里，${esc(CONFIG.herName)}在小窝里就能看到你今天要干嘛。</p>
      <div class="task-list" id="task-list">${taskItems()}</div>
      <form id="task-form">
        <input class="input" id="task-text" placeholder="加一项，比如：写物理作业" maxlength="60" autocomplete="off">
        <button class="btn btn-ghost btn-block" type="submit">＋ 添加</button>
      </form>
      <button class="btn btn-primary btn-block" data-act="publish-tasks">保存并同步给${esc(CONFIG.herName)}</button>
    </section>

    <section class="card portal-block">
      <div class="card-head"><h2>🔕 专注锁</h2></div>
      <p class="hint">开启后你们双方都会进入专注模式，只看得到你在上什么课。时长自己定。</p>
      ${isLocked() ? '<p class="hint"><b>现在正锁着</b></p>' : ''}
      <div class="btn-row">
        <button class="btn btn-ghost" data-act="focus" data-min="30">30 分钟</button>
        <button class="btn btn-ghost" data-act="focus" data-min="60">1 小时</button>
        <button class="btn btn-primary" data-act="focus-pick">⏱ 自己选时长</button>
      </div>
    </section>

    <section class="card portal-block">
      <div class="card-head"><h2>💬 聊天</h2>${unread >= 5 ? `<span class="chat-warn">${esc(CONFIG.herName)}连发了 ${unread} 条！</span>` : ''}</div>
      <div class="btn-row">
        <a class="btn btn-primary" href="#chat">去聊天${unread ? `（${unread}）` : ''}</a>
        <button class="btn btn-ghost" data-act="storage">🔒 储物间</button>
      </div>
    </section>

    <section class="card portal-block">
      <div class="card-head"><h2>🔑 我的密码</h2></div>
      <p class="hint">你的密码只存在这台设备上，没有进仓库。${esc(CONFIG.herName)}的密码是她进小窝的开启密码。</p>
      <button class="btn btn-ghost btn-block" data-act="change-pw">改密码</button>
    </section>`;
}

function taskItems() {
  if (!tasks.length) return '<p class="empty">还没有任务～</p>';
  return tasks.map((t) => `
    <div class="task-item ${t.done ? 'done' : ''}">
      <button class="task-check" data-toggle="${t.id}">${t.done ? '✅' : '⬜️'}</button>
      <span class="task-text">${esc(t.text)}</span>
      <button class="task-del" data-del="${t.id}">✕</button>
    </div>`).join('');
}

function repaintTasks() {
  const box = root.querySelector('#task-list');
  if (box) box.innerHTML = taskItems();
}

function onSubmit(e) {
  e.preventDefault();
  if (e.target.id === 'portal-form') {
    const pw = root.querySelector('#portal-pw').value.trim();
    if (!hasHisPassword()) {
      // 第一次：设定密码
      if (pw.length < 4) {
        root.querySelector('#portal-err').textContent = '密码至少 4 位';
        return;
      }
      setHisPassword(pw);
    }
    if (pw === hisPassword()) {
      save('portalOpen', true);
      setRole('him');
      sfx.tada();
      syncTasks().then(() => { if (alive) drawPortal(); });
      syncRecent();
      drawPortal();
    } else {
      root.querySelector('#portal-err').textContent = '密码不对';
      sfx.slap();
    }
  } else if (e.target.id === 'miss-form') {
    const input = root.querySelector('#miss-text');
    sendMiss(input.value.trim() || '我好想你');
    input.value = '';
  } else if (e.target.id === 'task-form') {
    const input = root.querySelector('#task-text');
    const text = input.value.trim();
    if (!text) return;
    tasks.push(newTask(text));
    input.value = '';
    repaintTasks();
  }
}

async function sendMiss(text) {
  try {
    await post(TOPICS.miss, text);
    sfx.ding();
    const r = root.getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      setTimeout(() => floatAt(r.width / 2 + (Math.random() - 0.5) * 160, 260, '💗', 'float-heart'), i * 70);
    }
    toast(`已经告诉${CONFIG.herName}啦 💗`, { icon: '💗' });
  } catch {
    toast('没发出去，检查网络', { icon: '⚠️' });
  }
}

function onClick(e) {
  const miss = e.target.closest('[data-miss]');
  if (miss) { sendMiss(miss.dataset.miss); return; }

  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const t = tasks.find((x) => x.id === toggle.dataset.toggle);
    if (t) { t.done = !t.done; repaintTasks(); }
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    tasks = tasks.filter((x) => x.id !== del.dataset.del);
    repaintTasks();
    return;
  }

  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'publish-tasks') {
    publishTasks(tasks)
      .then(() => toast(`同步给${CONFIG.herName}了`, { icon: '✅' }))
      .catch(() => toast('同步失败，检查网络', { icon: '⚠️' }));
  } else if (act === 'focus') {
    startFocus(Number(e.target.closest('[data-act]').dataset.min) || 30);
  } else if (act === 'focus-pick') {
    openFocusPicker();
  } else if (act === 'storage') {
    openStorage();
  } else if (act === 'change-pw') {
    const v = prompt('设一个新密码（至少 4 位，只存这台设备）');
    if (v && v.trim().length >= 4) {
      setHisPassword(v.trim());
      toast('密码改好了', { icon: '🔑' });
    }
  } else if (act === 'logout') {
    save('portalOpen', false);
    setRole('her');
    toast('退出控制台', { icon: '👋' });
    location.hash = '#home';
  }
}
