import { CONFIG } from '../config.js';
import { esc, toast } from '../ui.js';
import { relativeTime } from '../dates.js';
import { askSecret, getSecret } from '../secret.js';

const base = CONFIG.ntfyServer.replace(/\/$/, '');
const T_ASK = `${CONFIG.ntfyTopic}-ask`;
const T_SCREEN = `${CONFIG.ntfyTopic}-screen`;
const T_WHERE = `${CONFIG.ntfyTopic}-where`;
const T_CAM = `${CONFIG.ntfyTopic}-cam`;
const T_PHONE = `${CONFIG.ntfyTopic}-phone`;

// iPhone 打开 App 多久内算「在玩手机」
const PHONE_ACTIVE_MS = 12 * 60 * 1000;

let root;
let alive = false;
let timer = null;
let phoneTimer = null;
let living = false;
let lastScreen = null;
let lastCam = null;
let lastWhere = null;
let lastPhone = null;
let waiting = false;

export function render(container) {
  root = container;
  alive = true;
  draw();
  root.addEventListener('click', onClick);
  refresh();
  refreshPhone();
  // iPhone 状态每 30 秒刷新一次，页面开着的时候实时更新
  phoneTimer = setInterval(() => { if (!document.hidden) refreshPhone(); }, 30000);
}

export function destroy() {
  alive = false;
  living = false;
  clearInterval(timer);
  clearInterval(phoneTimer);
  root?.removeEventListener('click', onClick);
}

function draw() {
  const name = esc(CONFIG.hisName);
  root.innerHTML = `
    <h1 class="page-title">📍 陪着你</h1>
    <section class="card phone-card" id="phone-card">${phoneHtml()}</section>
    <section class="card live-card">
      <div class="card-head">
        <h2>${name}的屏幕</h2>
        <label class="live-toggle"><input type="checkbox" id="live-on" ${living ? 'checked' : ''}><span>实时看</span></label>
      </div>
      <div class="screen-frame" id="screen-frame">${screenHtml()}</div>
      <div class="cam-frame" id="cam-frame">${camHtml()}</div>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="ask">🔄 看一眼现在</button>
        <button class="btn btn-ghost" data-act="secret">🔐 暗号</button>
      </div>
      <p class="hint">要${name}的电脑开着、并且装好了小窝助手才看得到哦。点一下会同时拿到屏幕、样子和位置。</p>
    </section>

    <section class="card" id="where-card">${whereHtml()}</section>`;
}

function screenHtml() {
  if (!lastScreen) {
    return `<div class="screen-empty">${waiting ? `<span class="spinner"></span>正在叫醒${esc(CONFIG.hisName)}的电脑…` : '还没有画面～ 点下面看一眼'}</div>`;
  }
  return `
    <img class="screen-img" src="${esc(lastScreen.url)}" alt="${esc(CONFIG.hisName)}的屏幕">
    <div class="screen-meta">${waiting ? '<span class="spinner"></span>' : '🖥️ 屏幕 · '}更新于 ${relativeTime(lastScreen.time)}</div>`;
}

function phoneHtml() {
  const name = esc(CONFIG.hisName);
  if (!lastPhone) {
    return `
      <div class="phone-row">
        <span class="phone-emoji">📱</span>
        <div>
          <div class="phone-main">还不知道${name}手机的状态</div>
          <div class="phone-sub">让${name}设好快捷指令就能看到啦</div>
        </div>
      </div>`;
  }
  const active = Date.now() - lastPhone.time < PHONE_ACTIVE_MS;
  const appTxt = lastPhone.text && lastPhone.text !== '在玩手机' ? `（${esc(lastPhone.text)}）` : '';
  return `
    <div class="phone-row ${active ? 'on' : 'idle'}">
      <span class="phone-emoji">${active ? '📱' : '🌙'}</span>
      <div>
        <div class="phone-main">${active ? `${name}正在玩手机${appTxt}` : `${name}的手机应该放下了`}</div>
        <div class="phone-sub">${active ? '刚刚还在用' : `上次用是 ${relativeTime(lastPhone.time)}${appTxt}`}</div>
      </div>
      <span class="phone-dot ${active ? 'live' : ''}"></span>
    </div>`;
}

function camHtml() {
  if (!lastCam) {
    return `<div class="cam-empty">${waiting ? '<span class="spinner"></span>正在拍…' : `📷 还没拍到${esc(CONFIG.hisName)}`}</div>`;
  }
  return `
    <img class="cam-img" src="${esc(lastCam.url)}" alt="${esc(CONFIG.hisName)}现在的样子">
    <div class="screen-meta">📷 ${esc(CONFIG.hisName)}本人 · ${relativeTime(lastCam.time)}</div>`;
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
  const cam = root.querySelector('#cam-frame');
  if (cam) cam.innerHTML = camHtml();
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
    const [screen, cam, where] = await Promise.all([latest(T_SCREEN), latest(T_CAM), latest(T_WHERE, '30m')]);
    if (!alive) return;
    if (screen?.attachment?.url && screen.id !== lastScreen?.id) {
      lastScreen = { id: screen.id, url: screen.attachment.url, time: (screen.time || 0) * 1000 };
      waiting = false;
    }
    if (cam?.attachment?.url && cam.id !== lastCam?.id) {
      lastCam = { id: cam.id, url: cam.attachment.url, time: (cam.time || 0) * 1000 };
    }
    if (where) {
      try {
        lastWhere = { time: (where.time || 0) * 1000, data: JSON.parse(where.message) };
      } catch { /* 格式不对就忽略 */ }
    }
    paint();
  } catch { /* 网络不好 */ }
}

async function refreshPhone() {
  try {
    const m = await latest(T_PHONE, '6h');
    if (!alive) return;
    if (m) lastPhone = { time: (m.time || 0) * 1000, text: (m.message || '').trim() };
    const card = root.querySelector('#phone-card');
    if (card) card.innerHTML = phoneHtml();
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
  // 电脑那边截图、拍照、上传要一会儿（摄像头要预热，稍慢）
  const beforeScreen = lastScreen?.id;
  const beforeCam = lastCam?.id;
  let gotScreen = false;
  for (const delay of [1200, 1500, 2000, 2500, 3000, 4000]) {
    await new Promise((r) => setTimeout(r, delay));
    if (!alive) return;
    await refresh();
    if (lastScreen?.id !== beforeScreen) gotScreen = true;
    // 屏幕和摄像头都到齐了就停
    if (gotScreen && lastCam?.id !== beforeCam) break;
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
