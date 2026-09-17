import { CONFIG } from '../config.js';
import { addDays, diffDays, fmtMonthDay, fmtWeekday, toKey, todayKey } from '../dates.js';
import { confirmSheet, esc, openSheet, toast } from '../ui.js';
import { load, save } from '../store.js';
import { notifyQuietly } from '../notify.js';
import { sfx } from '../sound.js';

let root;
let data;

function loadSleep() {
  const d = load('sleep', {}) || {};
  return {
    nights: Array.isArray(d.nights) ? d.nights : [],
    settings: { notifyHim: true, target: 8, ...(d.settings || {}) },
  };
}

function persist() {
  data.nights.sort((a, b) => (a.bed || '').localeCompare(b.bed || ''));
  save('sleep', data);
  draw();
}

// 本地时间的 'YYYY-MM-DDTHH:mm'
function stamp(date = new Date()) {
  return `${toKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseStamp(s) {
  const [d, t] = s.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi);
}

// 这一觉算哪一天的：中午之前上床算前一天晚上
function nightKey(bed) {
  const d = parseStamp(bed);
  return d.getHours() < 12 ? addDays(toKey(d), -1) : toKey(d);
}

function hours(n) {
  if (!n.bed || !n.wake) return null;
  return (parseStamp(n.wake) - parseStamp(n.bed)) / 3600000;
}

function fmtHours(h) {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)} 小时 ${total % 60} 分`;
}

function timeOf(s) {
  return s ? s.slice(11) : '';
}

export function render(container) {
  root = container;
  data = loadSleep();
  root.addEventListener('click', onClick);
  draw();
}

export function destroy() {
  root?.removeEventListener('click', onClick);
}

function openNight() {
  return data.nights.find((n) => n.bed && !n.wake);
}

function draw() {
  const open = openNight();
  const done = data.nights.filter((n) => hours(n) != null);
  const recent = done.slice(-14);
  const avg = recent.length ? recent.reduce((s, n) => s + hours(n), 0) / recent.length : null;
  const avgBed = recent.length ? avgClock(recent.map((n) => parseStamp(n.bed))) : null;
  const avgWake = recent.length ? avgClock(recent.map((n) => parseStamp(n.wake))) : null;
  const last = done[done.length - 1];

  root.innerHTML = `
    <h1 class="page-title">😴 睡眠小本本</h1>
    <section class="card status-card sleep-status ${open ? 'sleeping' : ''}">
      ${open ? `
        <div class="status-big">已经睡了 <b>${fmtHours((Date.now() - parseStamp(open.bed)) / 3600000)}</b></div>
        <div class="status-sub">${timeOf(open.bed)} 上的床 · 睡个好觉 🌙</div>
        <div class="btn-row"><button class="btn btn-primary" data-act="wake">☀️ 我醒啦</button></div>`
      : `
        <div class="status-big">${last ? `昨晚睡了 <b>${fmtHours(hours(last))}</b>` : '还没有记录'}</div>
        <div class="status-sub">${last ? `${timeOf(last.bed)} – ${timeOf(last.wake)}${sleepComment(hours(last), last.bed)}` : '睡前点一下「我睡了」，醒了再点「我醒啦」'}</div>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="bed">🌙 我睡了</button>
          <button class="btn btn-ghost" data-act="add">✍️ 补记</button>
        </div>`}
    </section>

    <section class="card stats-row">
      <div class="stat"><div class="stat-num">${avg ? avg.toFixed(1) : '–'}<small>小时</small></div><div class="stat-label">平均睡眠</div></div>
      <div class="stat"><div class="stat-num">${avgBed || '–'}</div><div class="stat-label">平均入睡</div></div>
      <div class="stat"><div class="stat-num">${avgWake || '–'}</div><div class="stat-label">平均起床</div></div>
      <button class="icon-btn stat-gear" data-act="settings" aria-label="睡眠设置">⚙️</button>
    </section>

    ${chart(recent)}

    <section class="card">
      <div class="card-head"><h2>最近的觉</h2><button class="btn btn-small btn-ghost" data-act="add">+ 补记</button></div>
      ${[...done].reverse().slice(0, 20).map((n) => `
        <button class="history-item" data-act="edit" data-id="${n.id}">
          <span class="history-dates">${fmtMonthDay(nightKey(n.bed))} ${fmtWeekday(nightKey(n.bed))} 晚 · ${timeOf(n.bed)} – ${timeOf(n.wake)}</span>
          <span class="history-meta">${fmtHours(hours(n))}</span>
        </button>`).join('') || '<p class="empty">还没有记录～</p>'}
    </section>`;
}

function avgClock(dates) {
  // 把时间点当成圆上的角度取平均，跨零点也不会算错
  let x = 0;
  let y = 0;
  for (const d of dates) {
    const a = ((d.getHours() * 60 + d.getMinutes()) / 1440) * Math.PI * 2;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  let a = Math.atan2(y / dates.length, x / dates.length);
  if (a < 0) a += Math.PI * 2;
  const mins = Math.round((a / (Math.PI * 2)) * 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function sleepComment(h, bed) {
  const bedHour = parseStamp(bed).getHours();
  if (h < 6) return ' · 睡太少啦，今天要补觉 🥱';
  if (bedHour >= 1 && bedHour < 5) return ' · 又熬夜了哦 😤';
  if (h >= 8) return ' · 睡得很饱，真棒 ✨';
  return '';
}

function chart(nights) {
  if (!nights.length) return '';
  const target = data.settings.target;
  const max = Math.max(10, ...nights.map((n) => hours(n)));
  // 少于目标的那几晚标成粉色，一眼看得出来
  const bars = nights.map((n) => {
    const h = hours(n);
    const pct = (h / max) * 100;
    const short = h < Math.min(6, target - 1);
    return `<div class="sleep-bar ${short ? 'short' : ''}" title="${fmtHours(h)}">
      <span class="sb-fill" style="height:${pct.toFixed(1)}%"><i>${h.toFixed(1)}</i></span>
      <span class="sb-label">${Number(nightKey(n.bed).slice(8))}</span>
    </div>`;
  }).join('');
  return `
    <section class="card">
      <div class="card-head"><h2>最近 ${nights.length} 晚</h2><span class="hint">目标 ${target} 小时</span></div>
      <div class="sleep-chart">
        ${bars}
      </div>
    </section>`;
}

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || !root.contains(btn)) return;
  const { act, id } = btn.dataset;
  if (act === 'bed') goToBed();
  else if (act === 'wake') wakeUp();
  else if (act === 'add') openEditor(null);
  else if (act === 'edit') openEditor(data.nights.find((n) => n.id === id));
  else if (act === 'settings') openSettings();
}

function goToBed() {
  const now = stamp();
  data.nights.push({ id: Math.random().toString(36).slice(2, 10), bed: now, wake: null });
  persist();
  sfx.pop();
  toast('晚安，睡个好觉 🌙', { icon: '💤' });
  if (data.settings.notifyHim) {
    notifyQuietly({
      title: `🌙 ${CONFIG.herName}睡觉了`,
      message: `${timeOf(now)} 上床睡觉了，快说晚安！`,
      tags: ['sleep'],
    });
  }
}

function wakeUp() {
  const n = openNight();
  if (!n) return;
  n.wake = stamp();
  const h = hours(n);
  if (h <= 0 || h > 20) {
    n.wake = null;
    toast('这个时间不太对，用「补记」改一下吧', { icon: '🤔' });
    return;
  }
  persist();
  sfx.tada();
  toast(`早安～ 这一觉睡了 ${fmtHours(h)}`, { icon: '☀️' });
  if (data.settings.notifyHim) {
    notifyQuietly({
      title: `☀️ ${CONFIG.herName}醒啦`,
      message: `睡了 ${fmtHours(h)}（${timeOf(n.bed)} – ${timeOf(n.wake)}），快去说早安！`,
      tags: ['sleep'],
    });
  }
}

function openEditor(night) {
  const isNew = !night;
  const defaultBed = `${addDays(todayKey(), -1)}T23:00`;
  const { el, close } = openSheet(`
    <h3 class="sheet-title">${isNew ? '补记一觉' : '改一下这一觉'}</h3>
    <label class="field"><span>什么时候睡的</span><input type="datetime-local" class="input" id="sl-bed" value="${night?.bed || defaultBed}"></label>
    <label class="field"><span>什么时候醒的</span><input type="datetime-local" class="input" id="sl-wake" value="${night?.wake || `${todayKey()}T07:30`}"></label>
    <div class="btn-row">
      ${isNew ? '' : '<button class="btn btn-danger" data-sl="delete">删除</button>'}
      <button class="btn btn-primary" data-sl="save">保存</button>
    </div>`);
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-sl]')?.dataset.sl;
    if (act === 'delete') {
      close();
      if (await confirmSheet('删掉这条睡眠记录？', { ok: '删除', danger: true })) {
        data.nights = data.nights.filter((n) => n.id !== night.id);
        persist();
      }
    } else if (act === 'save') {
      const bed = el.querySelector('#sl-bed').value.slice(0, 16);
      const wake = el.querySelector('#sl-wake').value.slice(0, 16);
      if (!bed || !wake) return toast('两个时间都要填哦', { icon: '⚠️' });
      const h = (parseStamp(wake) - parseStamp(bed)) / 3600000;
      if (h <= 0) return toast('起床时间要比睡觉时间晚', { icon: '⚠️' });
      if (h > 20) return toast('睡了超过 20 小时？检查一下日期', { icon: '⚠️' });
      if (isNew) data.nights.push({ id: Math.random().toString(36).slice(2, 10), bed, wake });
      else Object.assign(night, { bed, wake });
      close();
      persist();
      toast('记好啦', { icon: '✅' });
    }
  });
}

function openSettings() {
  const s = data.settings;
  const { el, close } = openSheet(`
    <h3 class="sheet-title">睡眠设置</h3>
    <label class="field"><span>每天想睡够几小时</span><input type="number" class="input" id="sl-target" min="4" max="12" step="0.5" value="${s.target}"></label>
    <label class="setting-row"><span>睡觉 / 起床时告诉${esc(CONFIG.hisName)}</span><input type="checkbox" class="switch" id="sl-notify" ${s.notifyHim ? 'checked' : ''}></label>
    <button class="btn btn-primary btn-block" id="sl-save">保存</button>`);
  el.querySelector('#sl-save').addEventListener('click', () => {
    const t = Number(el.querySelector('#sl-target').value);
    if (t >= 4 && t <= 12) s.target = t;
    s.notifyHim = el.querySelector('#sl-notify').checked;
    close();
    persist();
  });
}

// 首页用
export function sleepSummary() {
  const d = loadSleep();
  const open = d.nights.find((n) => n.bed && !n.wake);
  if (open) return { sleeping: true, text: `睡着呢 ${timeOf(open.bed)}–` };
  const done = d.nights.filter((n) => n.bed && n.wake);
  const last = done[done.length - 1];
  if (!last) return { sleeping: false, text: '还没记录' };
  const h = (parseStamp(last.wake) - parseStamp(last.bed)) / 3600000;
  const key = nightKey(last.bed);
  const ago = diffDays(key, todayKey());
  return { sleeping: false, text: `${ago <= 1 ? '昨晚' : fmtMonthDay(key)}睡了 ${h.toFixed(1)} 小时` };
}
