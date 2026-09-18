// 专注锁：任一方开启后，双方都进入全屏专注模式，只看得到耀耀在上什么课
// 状态通过 ntfy 的 -focus 频道同步，本地也存一份，关掉网页再打开依然锁着
import { CONFIG } from './config.js';
import { load, save } from './store.js';
import { esc, toast } from './ui.js';
import { getRole, post, fetchSince, subscribe, TOPICS } from './roles.js';
import { notifyHim } from './notify.js';
import { loadSchedule, nowStatus, cleanTitle, fmtDuration, fmtTime, eventsOnDay, dayKeyIn } from './schedule-core.js';
import { sfx } from './sound.js';

export const MIN_MINUTES = 30;

let overlay = null;
let timer = null;
let unsub = null;
let schedule = null;
let started = false;

function state() {
  return load('focus', null) || { until: 0, by: null, startedAt: 0, request: null };
}

function setState(s) {
  save('focus', s);
}

export function isLocked() {
  return state().until > Date.now();
}

// 开启专注锁
export async function startFocus(minutes = MIN_MINUTES) {
  const by = getRole();
  const until = Date.now() + minutes * 60000;
  setState({ until, by, startedAt: Date.now(), request: null });
  try {
    await post(TOPICS.focus, JSON.stringify({ type: 'start', by, until, minutes }));
  } catch { /* 对方可能收不到，本地照样锁 */ }
  show();
}

// 申请提前解锁
export async function requestUnlock() {
  const by = getRole();
  const s = state();
  s.request = { by, at: Date.now() };
  setState(s);
  try {
    if (by === 'her') {
      // 晗晗申请 → 响耀耀电脑的铃，他同意才解锁
      await notifyHim({
        title: `🔔 ${CONFIG.herName}按了老公铃！`,
        message: `${CONFIG.herName}想提前解开专注锁，去小窝点「同意」吧`,
        kind: 'bell',
        priority: 5,
      });
      await post(TOPICS.focus, JSON.stringify({ type: 'request', by }));
      toast(`已经告诉${CONFIG.hisName}啦，等他同意 🥺`, { icon: '🔔' });
    } else {
      // 耀耀申请 → 通知晗晗一声，不用她审批
      await post(TOPICS.focus, JSON.stringify({ type: 'request', by }));
      toast(`已经告诉${CONFIG.herName}了`, { icon: '💬' });
    }
  } catch {
    toast('网络不好，没通知到对方', { icon: '⚠️' });
  }
  paint();
}

// 同意对方的解锁申请
export async function approveUnlock() {
  const s = state();
  s.until = 0;
  s.request = null;
  setState(s);
  try { await post(TOPICS.focus, JSON.stringify({ type: 'unlock', by: getRole() })); } catch { /* ignore */ }
  hide();
  sfx.tada();
  toast('专注锁解开啦 💗', { icon: '🔓' });
}

// 处理远端来的专注消息
function handle(msg) {
  let d;
  try { d = JSON.parse(msg.message); } catch { return; }
  const me = getRole();
  if (d.type === 'start') {
    setState({ until: d.until, by: d.by, startedAt: Date.now(), request: null });
    if (d.by !== me) toast(`${d.by === 'him' ? CONFIG.hisName : CONFIG.herName}开启了专注锁`, { icon: '🔕' });
    show();
  } else if (d.type === 'unlock') {
    const s = state();
    s.until = 0;
    s.request = null;
    setState(s);
    hide();
    toast('专注锁解开了', { icon: '🔓' });
  } else if (d.type === 'request') {
    const s = state();
    s.request = { by: d.by, at: Date.now() };
    setState(s);
    if (d.by !== me) sfx.ding();
    paint();
  }
}

// 进入网页时检查是否还锁着
export async function initFocus() {
  if (started) return;
  started = true;
  loadSchedule().then((s) => { schedule = s; paint(); });
  unsub = subscribe(TOPICS.focus, handle);
  try {
    const recent = await fetchSince(TOPICS.focus, '3h');
    for (const m of recent) handle(m);
  } catch { /* ignore */ }
  if (isLocked()) show();
}

function show() {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'focus-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', onOverlayClick);
  }
  document.body.classList.add('focus-on');
  clearInterval(timer);
  timer = setInterval(paint, 1000);
  paint();
}

function hide() {
  clearInterval(timer);
  timer = null;
  document.body.classList.remove('focus-on');
  overlay?.remove();
  overlay = null;
}

function onOverlayClick(e) {
  const act = e.target.closest('[data-focus]')?.dataset.focus;
  if (act === 'request') requestUnlock();
  else if (act === 'approve') approveUnlock();
  else if (act === 'deny') {
    const s = state();
    s.request = null;
    setState(s);
    post(TOPICS.focus, JSON.stringify({ type: 'deny', by: getRole() })).catch(() => {});
    toast('不同意，继续专注 😤', { icon: '🔒' });
    paint();
  }
}

function paint() {
  if (!overlay) return;
  const s = state();
  if (s.until <= Date.now()) { hide(); return; }

  const me = getRole();
  const leftMs = s.until - Date.now();
  const mm = String(Math.floor(leftMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((leftMs % 60000) / 1000)).padStart(2, '0');

  let classInfo = '<div class="focus-class-sub">课表还没加载…</div>';
  if (schedule) {
    const st = nowStatus(schedule);
    if (st.kind === 'class') {
      classInfo = `
        <div class="focus-class-name">${esc(cleanTitle(st.current.title))}</div>
        <div class="focus-class-sub">${st.current.location ? esc(st.current.location) + ' · ' : ''}还有 ${fmtDuration(st.left)}下课</div>`;
    } else if (st.kind === 'break' && st.next) {
      classInfo = `
        <div class="focus-class-name">课间</div>
        <div class="focus-class-sub">${fmtDuration(st.until)}后上 ${esc(cleanTitle(st.next.title))}</div>`;
    } else if (st.kind === 'done') {
      classInfo = '<div class="focus-class-name">今天的课上完了</div>';
    } else {
      classInfo = '<div class="focus-class-name">现在没有课</div>';
    }
  }

  // 今天剩下的课
  let rest = '';
  if (schedule) {
    const todayKey = dayKeyIn(new Date(), schedule.timeZone);
    const now = new Date();
    const list = eventsOnDay(schedule, todayKey).filter((e) => e.end > now).slice(0, 5);
    if (list.length) {
      rest = `<div class="focus-list">${list.map((e) => `
        <div class="focus-item">
          <span>${fmtTime(e.start, schedule.timeZone)}</span>
          <b>${esc(cleanTitle(e.title))}</b>
        </div>`).join('')}</div>`;
    }
  }

  // 解锁申请
  let action = '';
  if (s.request && s.request.by !== me) {
    const who = s.request.by === 'him' ? CONFIG.hisName : CONFIG.herName;
    action = `
      <div class="focus-request">
        <div>${esc(who)}想提前解锁，同意吗？</div>
        <div class="btn-row">
          <button class="btn btn-ghost" data-focus="deny">😤 不同意</button>
          <button class="btn btn-primary" data-focus="approve">💗 同意</button>
        </div>
      </div>`;
  } else if (s.request && s.request.by === me) {
    action = `<div class="focus-waiting">已经发出申请，等对方同意…</div>`;
  } else {
    action = `<button class="btn btn-ghost focus-btn" data-focus="request">想提前解锁（要对方同意）</button>`;
  }

  overlay.innerHTML = `
    <div class="focus-inner">
      <div class="focus-title">🔕 专注中</div>
      <div class="focus-timer">${mm}:${ss}</div>
      <div class="focus-by">${s.by === me ? '你' : (s.by === 'him' ? esc(CONFIG.hisName) : esc(CONFIG.herName))}开启的专注锁</div>
      <div class="focus-class">
        <div class="focus-class-label">${esc(CONFIG.hisName)}现在</div>
        ${classInfo}
      </div>
      ${rest}
      ${action}
    </div>`;
}
