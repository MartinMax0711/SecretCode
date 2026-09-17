import { CONFIG } from '../config.js';
import { esc, toast } from '../ui.js';
import { relativeTime } from '../dates.js';
import { askSecret, getSecret } from '../secret.js';

const base = CONFIG.ntfyServer.replace(/\/$/, '');
const T_ASK = `${CONFIG.ntfyTopic}-ask`;
const T_SCREEN = `${CONFIG.ntfyTopic}-screen`;
const T_WHERE = `${CONFIG.ntfyTopic}-where`;

let root;
let alive = false;
let timer = null;
let living = false;
let lastScreen = null;
let lastWhere = null;
let waiting = false;

export function render(container) {
  root = container;
  alive = true;
  draw();
  root.addEventListener('click', onClick);
  refresh();
}

export function destroy() {
  alive = false;
  living = false;
  clearInterval(timer);
  root?.removeEventListener('click', onClick);
}

function draw() {
  const name = esc(CONFIG.hisName);
  root.innerHTML = `
    <h1 class="page-title">📍 陪着你</h1>
    <section class="card live-card">
      <div class="card-head">
        <h2>${name}的屏幕</h2>
        <label class="live-toggle"><input type="checkbox" id="live-on" ${living ? 'checked' : ''}><span>实时看</span></label>
      </div>
      <div class="screen-frame" id="screen-frame">${screenHtml()}</div>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="ask">🔄 看一眼现在</button>
        <button class="btn btn-ghost" data-act="secret">🔐 暗号</button>
      </div>
      <p class="hint">要${name}的电脑开着、并且装好了小窝助手才看得到哦。</p>
    </section>

    <section class="card" id="where-card">${whereHtml()}</section>`;
}

function screenHtml() {
  if (!lastScreen) {
    return `<div class="screen-empty">${waiting ? '<span class="spinner"></span>正在叫醒他的电脑…' : '还没有画面～ 点下面看一眼'}</div>`;
  }
  return `
    <img class="screen-img" src="${esc(lastScreen.url)}" alt="${esc(CONFIG.hisName)}的屏幕">
    <div class="screen-meta">${waiting ? '<span class="spinner"></span>' : ''}更新于 ${relativeTime(lastScreen.time)}</div>`;
}

function whereHtml() {
  const name = esc(CONFIG.hisName);
  if (!lastWhere) {
    return `<div class="card-head"><h2>${name}在哪里</h2></div><p class="empty">还不知道～ 点上面「看一眼现在」</p>`;
  }
  const w = lastWhere.data;
  const place = [w.city, w.region, w.country].filter(Boolean).join('，');
  const map = w.lat && w.lon
    ? `<iframe class="map" loading="lazy" referrerpolicy="no-referrer" title="地图"
        src="https://www.openstreetmap.org/export/embed.html?bbox=${w.lon - 0.08}%2C${w.lat - 0.05}%2C${w.lon + 0.08}%2C${w.lat + 0.05}&layer=mapnik&marker=${w.lat}%2C${w.lon}"></iframe>`
    : '';
  return `
    <div class="card-head"><h2>${name}在哪里</h2><span class="hint">${relativeTime(lastWhere.time)}</span></div>
    <div class="where-main">${esc(place || '不知道哪儿')}</div>
    ${w.time ? `<div class="where-sub">${name}那边现在 ${esc(w.time)}${w.battery ? ` · 电量 ${esc(w.battery)}` : ''}</div>` : ''}
    ${map}
    <p class="hint">位置是根据网络定位的，大概到城市这一级。</p>`;
}

function paint() {
  const frame = root.querySelector('#screen-frame');
  if (frame) frame.innerHTML = screenHtml();
  const where = root.querySelector('#where-card');
  if (where) where.innerHTML = whereHtml();
}

async function latest(topic, since = '15m') {
  const res = await fetch(`${base}/${topic}/json?poll=1&since=${since}`);
  if (!res.ok) return null;
  const lines = (await res.text()).split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const m = JSON.parse(lines[i]);
      if (m.event === 'message') return m;
    } catch { /* 跳过 */ }
  }
  return null;
}

async function refresh() {
  try {
    const [screen, where] = await Promise.all([latest(T_SCREEN), latest(T_WHERE, '30m')]);
    if (!alive) return;
    if (screen?.attachment?.url && screen.id !== lastScreen?.id) {
      lastScreen = { id: screen.id, url: screen.attachment.url, time: (screen.time || 0) * 1000 };
      waiting = false;
    }
    if (where) {
      try {
        lastWhere = { time: (where.time || 0) * 1000, data: JSON.parse(where.message) };
      } catch { /* 格式不对就忽略 */ }
    }
    paint();
  } catch { /* 网络不好 */ }
}

async function ask() {
  let secret = getSecret();
  if (!secret) {
    secret = await askSecret();
    if (!secret) return;
  }
  waiting = true;
  paint();
  try {
    const res = await fetch(base + '/', {
      method: 'POST',
      body: JSON.stringify({ topic: T_ASK, message: secret, title: 'peek', priority: 3 }),
    });
    if (!res.ok) throw new Error('请求失败');
  } catch {
    waiting = false;
    paint();
    toast('叫不动他的电脑…检查一下网络', { icon: '⚠️' });
    return;
  }
  // 电脑那边截图、上传要一会儿
  for (const delay of [1200, 1500, 2000, 3000, 4000]) {
    await new Promise((r) => setTimeout(r, delay));
    if (!alive) return;
    const before = lastScreen?.id;
    await refresh();
    if (lastScreen?.id !== before) break;
  }
  if (alive && waiting) {
    waiting = false;
    paint();
    toast('电脑没有回应，可能关机了或者助手没开', { icon: '💤' });
  }
}

function onClick(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'ask') ask();
  else if (act === 'secret') askSecret();
  if (e.target.id === 'live-on') {
    living = e.target.checked;
    clearInterval(timer);
    if (living) {
      ask();
      timer = setInterval(() => { if (!document.hidden) ask(); }, 8000);
    }
  }
}
