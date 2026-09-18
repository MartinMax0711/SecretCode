// 储物间：超过 3 小时的聊天记录收在这里，要晗晗和耀耀两个人的密码一起才打开
import { esc, openSheet, toast } from './ui.js';
import { load, save } from './store.js';
import { CONFIG } from './config.js';
import { HIS_PASSWORD } from './roles.js';
import { archivedMessages } from './chat-core.js';
import { fmtMonthDay } from './dates.js';
import { sfx } from './sound.js';

// 晗晗的密码：默认就是进小窝的开启密码，她可以自己改
export function herPassword() {
  return load('herPassword', '') || load('secret', '') || 'hanhan';
}

export function setHerPassword(v) {
  save('herPassword', String(v).trim());
}

export function openStorage(onClose) {
  const { el, close } = openSheet(`
    <div class="storage-lock">
      <div class="lock-emoji">🔒</div>
      <h3 class="sheet-title">储物间</h3>
      <p class="hint">这里是你们超过 3 小时的悄悄话。要<b>两个人的密码一起</b>才能打开 —— 一个人是打不开的。</p>
      <label class="field"><span>${esc(CONFIG.herName)}的密码</span><input type="password" class="input" id="pw-her" autocomplete="off"></label>
      <label class="field"><span>${esc(CONFIG.hisName)}的密码</span><input type="password" class="input" id="pw-him" autocomplete="off"></label>
      <button class="btn btn-primary btn-block" id="pw-go">一起打开 💗</button>
      <p class="hint" id="pw-err"></p>
    </div>`, { onClose });

  const tryOpen = () => {
    const a = el.querySelector('#pw-her').value.trim();
    const b = el.querySelector('#pw-him').value.trim();
    const okHer = a === herPassword();
    const okHim = b === HIS_PASSWORD;
    if (okHer && okHim) {
      sfx.tada();
      close();
      showArchive();
      return;
    }
    const err = el.querySelector('#pw-err');
    err.textContent = !a || !b ? '两个密码都要填哦，少一个打不开'
      : !okHer && !okHim ? '两个密码都不对'
      : !okHer ? `${CONFIG.herName}的密码不对` : `${CONFIG.hisName}的密码不对`;
    sfx.slap();
  };

  el.querySelector('#pw-go').addEventListener('click', tryOpen);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryOpen(); });
}

function showArchive() {
  const msgs = archivedMessages();
  const byDay = new Map();
  for (const m of msgs) {
    const d = new Date(m.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(m);
  }

  const body = byDay.size
    ? [...byDay.entries()].map(([day, list]) => `
        <div class="arch-day">
          <div class="arch-date">${fmtMonthDay(day)}</div>
          ${list.sort((a, b) => a.ts - b.ts).map((m) => {
            const d = new Date(m.ts);
            const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const who = m.from === 'him' ? CONFIG.hisName : CONFIG.herName;
            return `<div class="arch-msg ${m.from}">
              <span class="arch-who">${esc(who)}</span>
              <span class="arch-text">${esc(m.text)}</span>
              <span class="arch-time">${hh}</span>
            </div>`;
          }).join('')}
        </div>`).join('')
    : '<p class="empty">储物间还是空的～</p>';

  openSheet(`
    <h3 class="sheet-title">🗝️ 储物间打开了</h3>
    <p class="hint">一共 ${msgs.length} 条悄悄话</p>
    <div class="archive">${body}</div>`, { className: 'sheet-archive' });
}
