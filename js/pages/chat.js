import { CONFIG } from '../config.js';
import { esc, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { getRole, subscribe, TOPICS } from '../roles.js';
import {
  LIVE_MS, archivedCount, ingest, liveMessages, markSeen, sendMessage, syncRecent, unansweredFromOther,
} from '../chat-core.js';
import { openStorage } from '../storage-lock.js';

let root;
let alive = false;
let unsub = null;
let tick = null;

export function render(container) {
  root = container;
  alive = true;
  root.innerHTML = shell();
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);

  syncRecent().then(() => { if (alive) paint(); });
  paint();
  markSeen();

  unsub = subscribe(TOPICS.chat, (m) => {
    if (!alive) return;
    if (!ingest(m)) return;
    const me = getRole();
    let from = 'her';
    try { from = JSON.parse(m.message).from || 'her'; } catch { /* 文本消息 */ }
    if (from !== me) sfx.pop();
    paint();
    markSeen();
  });

  // 过了 3 小时的消息要自动从聊天框消失（搬进储物间）
  tick = setInterval(() => { if (alive) paint(); }, 60000);
}

export function destroy() {
  alive = false;
  unsub?.();
  clearInterval(tick);
  root?.removeEventListener('click', onClick);
  root?.removeEventListener('submit', onSubmit);
}

function shell() {
  const other = getRole() === 'him' ? CONFIG.herName : CONFIG.hisName;
  return `
    <h1 class="page-title">💬 和${esc(other)}聊天</h1>
    <section class="card chat-card">
      <div class="chat-note" id="chat-note"></div>
      <div class="chat-log" id="chat-log"></div>
      <form class="chat-form" id="chat-form">
        <input class="input" id="chat-input" placeholder="说点什么…" autocomplete="off" maxlength="300">
        <button class="btn btn-primary chat-send" type="submit">发送</button>
      </form>
    </section>
    <section class="card storage-entry">
      <div class="card-head"><h2>🔒 储物间</h2><span class="hint" id="storage-count"></span></div>
      <p class="hint">超过 3 小时的消息会自动收进储物间，要你们<b>两个人的密码一起</b>才能打开。</p>
      <button class="btn btn-ghost btn-block" data-act="storage">打开储物间</button>
    </section>`;
}

function paint() {
  const log = root.querySelector('#chat-log');
  const note = root.querySelector('#chat-note');
  const count = root.querySelector('#storage-count');
  if (!log) return;

  const me = getRole();
  const msgs = liveMessages();
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;

  log.innerHTML = msgs.length
    ? msgs.map((m, i) => {
        const mine = m.from === me;
        const who = m.from === 'him' ? CONFIG.hisName : CONFIG.herName;
        const d = new Date(m.ts);
        const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const left = Math.max(0, LIVE_MS - (Date.now() - m.ts));
        const mins = Math.round(left / 60000);
        // 同一个人连着发的，只在第一条上显示名字和头像
        const newSpeaker = i === 0 || msgs[i - 1].from !== m.from;
        return `<div class="bubble-row ${mine ? 'mine' : 'theirs'} ${newSpeaker ? 'first' : ''}">
          ${newSpeaker ? `<div class="chat-who">
            <img class="chat-avatar" src="${esc(m.from === 'him' ? CONFIG.avatarHim : CONFIG.avatarHer)}"
                 alt="${esc(who)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'chat-avatar fallback',textContent:'${m.from === 'him' ? '🐶' : '🎀'}'}))">
            ${esc(mine ? `${who}（我）` : who)}</div>` : ''}
          <div class="chat-bubble">${esc(m.text)}</div>
          <div class="chat-meta">${hh}${mins < 30 ? ` · ${mins} 分钟后进储物间` : ''}</div>
        </div>`;
      }).join('')
    : '<p class="empty">这里还没有消息～ 说句话吧</p>';

  // 自己刚发的、或本来就在底部，就滚到最新
  const last = msgs[msgs.length - 1];
  if (atBottom || (last && last.from === me)) log.scrollTop = log.scrollHeight;

  const n = unansweredFromOther();
  if (note) {
    note.innerHTML = n >= 5 && me === 'him'
      ? `<span class="chat-warn">⚠️ ${esc(CONFIG.herName)}连发了 ${n} 条，快回她！</span>`
      : '';
  }
  if (count) count.textContent = `${archivedCount()} 条`;
}

async function onSubmit(e) {
  e.preventDefault();
  const input = root.querySelector('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await sendMessage(text);
    sfx.pop();
  } catch {
    toast('没发出去，检查一下网络', { icon: '⚠️' });
    input.value = text;
  }
}

function onClick(e) {
  if (e.target.closest('[data-act="storage"]')) openStorage(() => paint());
}
