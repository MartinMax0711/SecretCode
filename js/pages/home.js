import { CONFIG } from '../config.js';
import { LETTERS } from '../../data/letters.js';
import { esc, floatAt, toast, vibrate } from '../ui.js';
import { load, save } from '../store.js';
import { sfx } from '../sound.js';
import { fetchRecentReplies, notifyHim, subscribeReplies } from '../notify.js';
import { loadSchedule, nowStatus, cleanTitle, fmtDuration } from '../schedule-core.js';
import { nowCardHtml } from './schedule.js';
import { computeStats, currentStatus, loadPeriodData } from '../period-core.js';
import { fmtMonthDay, relativeTime, todayKey, fromKey, toKey } from '../dates.js';
import { loadAllPhotos } from './gallery.js';
import { sleepSummary } from './sleep.js';
import { syncTasks } from '../tasks-core.js';
import { MIN_MINUTES, startFocus } from '../focus.js';

const base = CONFIG.ntfyServer.replace(/\/$/, '');
const T_MISS = `${CONFIG.ntfyTopic}-miss`;

const PRESETS = [
  { text: '想你了 🥺', priority: 4 },
  { text: '快回我消息！😤', priority: 5 },
  { text: '陪我聊天 💬', priority: 4 },
  { text: '我饿了 🍰', priority: 4 },
  { text: '我不开心 😢', priority: 5 },
  { text: '没事，就想按一下 🔔', priority: 3 },
];

let root;
let unsubscribe = null;
let alive = false;
let cooling = false;
let schedule = null;
let nowTimer = null;

export function render(container) {
  root = container;
  alive = true;
  draw();
  root.addEventListener('click', onClick);

  loadSchedule().then((s) => {
    if (!alive) return;
    schedule = s;
    paintNow();
    nowTimer = setInterval(paintNow, 30000);
  });

  loadReplies();
  unsubscribe = subscribeReplies((msg) => {
    if (!alive) return;
    pushReply(msg);
    sfx.ding();
    toast(`${CONFIG.hisName}回复：${msg.message}`, { icon: '💌', duration: 4000 });
  });

  loadMiss();
  loadTasks();

  loadAllPhotos().then((photos) => {
    if (!alive || !photos.length) return;
    const p = photos[Math.floor(Math.random() * photos.length)];
    const slot = root.querySelector('#memory-slot');
    if (slot) {
      slot.innerHTML = `
        <a class="card memory-card" href="#gallery">
          <img src="${esc(p.src)}" alt="回忆" loading="lazy">
          <div class="memory-text"><span>今天的回忆</span><b>${esc(p.caption || (p.date ? fmtMonthDay(p.date) : '我们'))}</b></div>
        </a>`;
    }
  });
}

export function destroy() {
  alive = false;
  clearInterval(nowTimer);
  unsubscribe?.();
  unsubscribe = null;
  root?.removeEventListener('click', onClick);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '还没睡呀，早点休息';
  if (h < 11) return '早安';
  if (h < 14) return '午安';
  if (h < 18) return '下午好';
  if (h < 23) return '晚上好';
  return '晚安';
}

function draw() {
  const bells = load('bells', { count: 0, day: todayKey(), replies: [] });
  const todayBells = bells.day === todayKey() ? bells.count : 0;

  const pd = loadPeriodData();
  const pstats = computeStats(pd);
  const ps = currentStatus(pd, pstats);
  const periodText = ps.kind === 'empty' ? '还没记录'
    : ps.kind === 'period' ? `经期第 ${ps.day} 天`
    : ps.kind === 'late' ? `推迟 ${ps.lateDays} 天`
    : ps.daysLeft === 0 ? '预计今天来' : `还有 ${ps.daysLeft} 天`;

  const st = load('letters', {});
  const unread = LETTERS.filter((l) => !st[l.id]?.read).length;
  const sleep = sleepSummary();
  const punch = load('punch', {});
  const punchToday = (punch.days || {})[todayKey()] || 0;

  root.innerHTML = `
    <section class="hero">
      <div class="hero-greet">${greeting()}，${esc(CONFIG.herName)}宝宝 🎀</div>
      <div class="hero-sub">这里是只属于你的小窝</div>
    </section>

    <div id="miss-slot"></div>

    <div id="tasks-slot"></div>

    <div id="now-slot"><section class="card now-card"><div class="now-icon">🐶</div><div class="now-text"><div class="now-label">${esc(CONFIG.hisName)}现在</div><div class="now-main">看看去…</div></div></section></div>

    <section class="card bell-card">
      <button class="bell-btn" id="bell-btn" aria-label="按老公铃">
        <svg viewBox="0 0 120 120" class="bell-svg">
          <g class="bell-body">
            <path class="bell-metal" d="M60 18 C82 18 92 38 92 60 C92 76 96 82 102 88 L18 88 C24 82 28 76 28 60 C28 38 38 18 60 18 Z"/>
            <rect class="bell-metal" x="52" y="8" width="16" height="12" rx="6"/>
            <path class="bell-shine" d="M44 34 C48 26 54 24 58 24 C50 30 46 40 46 56 C46 68 44 76 40 82 C40 70 40 46 44 34 Z"/>
          </g>
          <circle class="bell-clapper" cx="60" cy="96" r="9"/>
          <g class="bell-waves">
            <path d="M12 46 q-8 14 0 28" /><path d="M2 38 q-10 22 0 44" />
            <path d="M108 46 q8 14 0 28" /><path d="M118 38 q10 22 0 44" />
          </g>
        </svg>
        <span class="bell-label">老公铃</span>
      </button>
      <p class="bell-hint" id="bell-hint">按一下，${esc(CONFIG.hisName)}的电脑就会响 🔔</p>
      <div class="chips presets">
        ${PRESETS.map((p, i) => `<button class="chip chip-pick ${i === 0 ? 'on' : ''}" data-preset="${i}">${esc(p.text)}</button>`).join('')}
      </div>
      <div class="bell-custom">
        <input class="input" id="bell-text" maxlength="80" placeholder="或者自己打一句话…">
      </div>
      <div class="bell-foot">今天按了 <b>${todayBells}</b> 次</div>
    </section>

    <section class="card reply-card" id="reply-card">
      <div class="card-head"><h2>${esc(CONFIG.hisName)}的回复</h2></div>
      <div class="replies" id="replies"><p class="empty">还没有回复～</p></div>
    </section>

    <div id="memory-slot"></div>

    <div class="quick-grid">
      <a class="quick q-pink" href="#period"><span class="q-icon">🌸</span><b>经期</b><span>${esc(periodText)}</span></a>
      <a class="quick q-rose" href="#letters"><span class="q-icon">💌</span><b>道歉信</b><span>${LETTERS.length} 封${unread ? ` · ${unread} 封没拆` : ''}</span></a>
      <a class="quick q-lilac" href="#sleep"><span class="q-icon">😴</span><b>睡眠</b><span>${esc(sleep.text)}</span></a>
      <a class="quick q-sky" href="#gallery"><span class="q-icon">📷</span><b>相册</b><span>我们的合照</span></a>
      <a class="quick q-mint" href="#punch"><span class="q-icon">🐶</span><b>解气</b><span>今天打了 ${punchToday} 下</span></a>
      <a class="quick q-lilac" href="#live"><span class="q-icon">📍</span><b>陪着你</b><span>看看${esc(CONFIG.hisName)}在干嘛</span></a>
      <a class="quick q-peach" href="#schedule"><span class="q-icon">📚</span><b>课表</b><span>什么时候有空</span></a>
      <button class="quick q-lilac" data-act="focus"><span class="q-icon">🔕</span><b>专注锁</b><span>一起专注 ${MIN_MINUTES} 分钟</span></button>
    </div>`;

  renderReplies();
}

// 耀耀报备的任务列表
async function loadTasks() {
  const slot = root?.querySelector('#tasks-slot');
  if (!slot) return;
  const { items, updatedAt } = await syncTasks();
  if (!alive || !slot || !items.length) return;
  const doneCount = items.filter((t) => t.done).length;
  slot.innerHTML = `
    <section class="card tasks-card">
      <div class="card-head">
        <h2>📝 ${esc(CONFIG.hisName)}今天要做的事</h2>
        <span class="hint">${doneCount}/${items.length}${updatedAt ? ` · ${relativeTime(updatedAt)}` : ''}</span>
      </div>
      ${items.map((t) => `
        <div class="task-item ${t.done ? 'done' : ''}">
          <span class="task-check">${t.done ? '✅' : '⬜️'}</span>
          <span class="task-text">${esc(t.text)}</span>
        </div>`).join('')}
    </section>`;
}

// 老公（耀耀）主动发的「我想你」时间线
async function loadMiss() {
  const slot = root?.querySelector('#miss-slot');
  if (!slot) return;
  let msgs = [];
  try {
    const res = await fetch(`${base}/${T_MISS}/json?poll=1&since=168h`);
    if (res.ok) {
      msgs = (await res.text()).split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((m) => m && m.event === 'message')
        .map((m) => ({ time: (m.time || 0) * 1000, text: (m.message || '').trim() }))
        .sort((a, b) => b.time - a.time);
    }
  } catch { /* 网络不好就不显示 */ }
  if (!alive) return;

  if (!msgs.length) {
    slot.innerHTML = '';
    return;
  }

  const today = todayKey();
  const todayCount = msgs.filter((m) => toKey(new Date(m.time)) === today).length;
  const newest = msgs[0];
  const isNew = Date.now() - newest.time < 6 * 60 * 60 * 1000; // 6 小时内算「刚刚」

  const items = msgs.slice(0, 6).map((m, i) => {
    const d = new Date(m.time);
    const dayLabel = toKey(d) === today ? '今天'
      : toKey(d) === toKey(new Date(Date.now() - 86400000)) ? '昨天'
      : fmtMonthDay(toKey(d));
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `<div class="miss-item ${i === 0 && isNew ? 'fresh' : ''}">
      <span class="miss-time">${dayLabel} ${hh}:${mm}</span>
      <span class="miss-text">${esc(m.text || '我好想你')}</span>
    </div>`;
  }).join('');

  slot.innerHTML = `
    <section class="card miss-card ${isNew ? 'glow' : ''}">
      <div class="miss-head">
        <span class="miss-heart">💗</span>
        <div>
          <div class="miss-title">${esc(CONFIG.hisName)}想你了</div>
          <div class="miss-sub">${todayCount > 0 ? `今天已经想你 <b>${todayCount}</b> 次` : `最近想你 ${msgs.length} 次`}</div>
        </div>
      </div>
      <div class="miss-list">${items}</div>
    </section>`;
}

function paintNow() {
  if (!schedule) return;
  const slot = root.querySelector('#now-slot');
  if (!slot) return;
  const s = nowStatus(schedule);
  slot.innerHTML = `<a href="#schedule" class="now-link">${nowCardHtml(s, schedule)}</a>`;
  const hint = root.querySelector('#bell-hint');
  if (hint && s.kind === 'class') {
    hint.innerHTML = `${esc(CONFIG.hisName)}在上《${esc(cleanTitle(s.current.title))}》，还有 ${fmtDuration(s.left)}下课 —— 还是要按吗 😏`;
  } else if (hint && s.kind === 'sleep') {
    hint.innerHTML = `${esc(CONFIG.hisName)}那边是深夜了，按了会把${esc(CONFIG.hisName)}吵醒哦 💤`;
  }
}

async function loadReplies() {
  try {
    const msgs = await fetchRecentReplies();
    if (!alive || !msgs.length) return;
    const bells = load('bells', { count: 0, day: todayKey(), replies: [] });
    const known = new Set((bells.replies || []).map((r) => r.id));
    msgs.filter((m) => !known.has(m.id)).forEach((m) => pushReply(m, false));
    renderReplies();
  } catch { /* 网络不好就算了 */ }
}

function pushReply(msg, repaint = true) {
  const bells = load('bells', { count: 0, day: todayKey(), replies: [] });
  bells.replies = [{ id: msg.id, text: msg.message, time: (msg.time || Date.now() / 1000) * 1000 }, ...(bells.replies || [])]
    .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
    .slice(0, 12);
  save('bells', bells);
  if (repaint) renderReplies();
}

function renderReplies() {
  const box = root.querySelector('#replies');
  if (!box) return;
  const bells = load('bells', { replies: [] });
  const list = (bells.replies || []).sort((a, b) => b.time - a.time);
  box.innerHTML = list.length
    ? list.map((r) => `<div class="reply"><span class="reply-text">${esc(r.text)}</span><span class="reply-time">${relativeTime(r.time)}</span></div>`).join('')
    : `<p class="empty">还没有回复～ 按个铃试试</p>`;
}

function onClick(e) {
  const chip = e.target.closest('[data-preset]');
  if (chip) {
    root.querySelectorAll('[data-preset]').forEach((c) => c.classList.toggle('on', c === chip));
    root.querySelector('#bell-text').value = '';
    return;
  }
  if (e.target.closest('[data-act="focus"]')) { startFocus(MIN_MINUTES); return; }
  if (e.target.closest('#bell-btn')) ringBell();
}

async function ringBell() {
  if (cooling) {
    toast('等一下下再按嘛～', { icon: '⏳' });
    return;
  }
  const btn = root.querySelector('#bell-btn');
  const custom = root.querySelector('#bell-text').value.trim();
  const presetIdx = Number(root.querySelector('[data-preset].on')?.dataset.preset ?? 0);
  const preset = PRESETS[presetIdx];
  const message = custom || preset.text;
  const priority = custom ? 4 : preset.priority;

  cooling = true;
  setTimeout(() => { cooling = false; }, 2500);

  btn.classList.remove('ring');
  void btn.offsetWidth;
  btn.classList.add('ring');
  sfx.ding();
  vibrate([25, 60, 25]);
  const r = btn.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    setTimeout(() => floatAt(r.left + r.width / 2 + (Math.random() - 0.5) * 100, r.top + 20, '🔔', 'float-heart'), i * 80);
  }

  try {
    await notifyHim({
      title: `🔔 ${CONFIG.herName}按了老公铃！`,
      message,
      kind: 'bell',
      priority,
    });
    const bells = load('bells', { count: 0, day: todayKey(), replies: [] });
    if (bells.day !== todayKey()) { bells.day = todayKey(); bells.count = 0; }
    bells.count++;
    save('bells', bells);
    const foot = root.querySelector('.bell-foot');
    if (foot) foot.innerHTML = `今天按了 <b>${bells.count}</b> 次`;
    toast(`叮铃铃～ ${CONFIG.hisName}的电脑响啦`, { icon: '🔔' });
    root.querySelector('#bell-text').value = '';
  } catch {
    toast('没送出去…检查一下网络再按一次', { icon: '⚠️' });
  }
}
