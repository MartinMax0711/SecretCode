// 耀耀控制台的「我的」页：他需要用的功能都在这
import { CONFIG } from '../config.js';
import { esc, floatAt, toast } from '../ui.js';
import { load, save } from '../store.js';
import { sfx } from '../sound.js';
import { TOPICS, fetchSince, post, setHisPassword } from '../roles.js';
import { getTasks, newTask, publishTasks, syncTasks } from '../tasks-core.js';
import { isLocked, openFocusPicker } from '../focus.js';
import { openStorage } from '../storage-lock.js';
import { relativeTime } from '../dates.js';

const MISS_PRESETS = ['我好想你', '上课的时候在想你', '看到好吃的想你了', '想抱抱你', '今天也最爱你'];

let root;
let alive = false;
let tasks = [];

export function render(container) {
  root = container;
  alive = true;
  tasks = getTasks().items;
  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  syncTasks().then((t) => {
    if (!alive) return;
    tasks = t.items;
    repaintTasks();
  });
  loadHerStatus();
}

export function destroy() {
  alive = false;
  root?.removeEventListener('click', onClick);
  root?.removeEventListener('submit', onSubmit);
}

function draw() {
  const her = esc(CONFIG.herName);
  root.innerHTML = `
    <h1 class="page-title">🎛️ 我的控制台</h1>

    <section class="card me-block">
      <div class="card-head"><h2>💗 想她</h2></div>
      <p class="hint">点一下，${her}打开小窝首页最上面就会看到你什么时候想她。</p>
      <div class="miss-quick">
        ${MISS_PRESETS.map((t) => `<button class="chip chip-pick" data-miss="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <form id="miss-form">
        <input class="input" id="miss-text" placeholder="或者自己写一句…" maxlength="80" autocomplete="off">
        <button class="btn btn-primary btn-block" type="submit">💗 发给${her}</button>
      </form>
    </section>

    <section class="card me-block">
      <div class="card-head"><h2>📝 我的报备任务</h2><span class="hint" id="task-count">${tasks.length} 项</span></div>
      <p class="hint">填好点最下面的同步，${her}在小窝首页就能看到你今天要干嘛。</p>
      <div class="task-list" id="task-list">${taskItems()}</div>
      <form id="task-form">
        <input class="input" id="task-text" placeholder="加一项，比如：写物理作业" maxlength="60" autocomplete="off">
        <button class="btn btn-ghost btn-block" type="submit">＋ 添加</button>
      </form>
      <button class="btn btn-primary btn-block" data-act="publish">📤 保存并同步给${her}</button>
    </section>

    <section class="card me-block">
      <div class="card-head"><h2>🔕 专注锁</h2>${isLocked() ? '<span class="chat-warn">正锁着</span>' : ''}</div>
      <p class="hint">开启后你们双方都进入专注模式，只看得到你在上什么课。提前解锁要对方同意。</p>
      <button class="btn btn-primary btn-block" data-act="focus">⏱ 选时长并开始</button>
    </section>

    <section class="card me-block" id="her-status">
      <div class="card-head"><h2>👀 ${her}怎么样</h2></div>
      <p class="empty">看看去…</p>
    </section>

    <section class="card me-block">
      <div class="card-head"><h2>🔒 储物间</h2></div>
      <p class="hint">超过 3 小时的聊天收在这里，要你和${her}的密码一起才打开。</p>
      <div class="btn-row">
        <button class="btn btn-ghost" data-act="storage">打开储物间</button>
        <button class="btn btn-ghost" data-act="change-pw">🔑 改我的密码</button>
      </div>
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
  const c = root.querySelector('#task-count');
  if (c) c.textContent = `${tasks.length} 项`;
}

// 晗晗最近的动静：按了几次铃、打了耀耀几下、发了什么
async function loadHerStatus() {
  const box = root?.querySelector('#her-status');
  if (!box) return;
  let lines = [];
  try {
    const msgs = await fetchSince(TOPICS.main, '24h');
    lines = msgs.slice(-6).reverse().map((m) => ({
      title: m.title || '',
      text: m.message || '',
      time: (m.time || 0) * 1000,
    }));
  } catch { /* 网络不好 */ }
  if (!alive || !box) return;
  const her = esc(CONFIG.herName);
  box.innerHTML = `
    <div class="card-head"><h2>👀 ${her}怎么样</h2><span class="hint">最近 24 小时</span></div>
    ${lines.length
      ? lines.map((l) => `
        <div class="her-item">
          <span class="her-title">${esc(l.title.replace(/^[^ ]* /, ''))}</span>
          <span class="her-text">${esc(l.text)}</span>
          <span class="her-time">${relativeTime(l.time)}</span>
        </div>`).join('')
      : `<p class="empty">${her}这 24 小时很安静</p>`}`;
}

function onSubmit(e) {
  e.preventDefault();
  if (e.target.id === 'miss-form') {
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
    for (let i = 0; i < 8; i++) {
      setTimeout(() => floatAt(innerWidth / 2 + (Math.random() - 0.5) * 160, innerHeight * 0.4, '💗', 'float-heart'), i * 70);
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
  if (act === 'publish') {
    publishTasks(tasks)
      .then(() => toast(`同步给${CONFIG.herName}了`, { icon: '✅' }))
      .catch(() => toast('同步失败，检查网络', { icon: '⚠️' }));
  } else if (act === 'focus') {
    openFocusPicker();
  } else if (act === 'storage') {
    openStorage();
  } else if (act === 'change-pw') {
    const v = prompt('设一个新密码（至少 4 位，只存这台设备）');
    if (v && v.trim().length >= 4) {
      setHisPassword(v.trim());
      toast('密码改好了', { icon: '🔑' });
    }
  }
}
