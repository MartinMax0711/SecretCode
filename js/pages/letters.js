import { CONFIG } from '../config.js';
import { LETTERS } from '../../data/letters.js';
import { fmtFull } from '../dates.js';
import { esc, openSheet, toast, floatAt } from '../ui.js';
import { load, save } from '../store.js';
import { notifyQuietly } from '../notify.js';
import { sfx } from '../sound.js';

let root;

const VERDICT = {
  forgive: { label: '已原谅', stamp: '原谅', icon: '💗' },
  angry: { label: '还没原谅', stamp: '哼！', icon: '😤' },
};

function states() {
  return load('letters', {});
}

function sortedLetters() {
  return [...LETTERS].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function render(container) {
  root = container;
  root.addEventListener('click', onClick);
  draw();
}

export function destroy() {
  root?.removeEventListener('click', onClick);
}

function draw() {
  const st = states();
  const letters = sortedLetters();
  const forgiven = letters.filter((l) => st[l.id]?.verdict === 'forgive').length;
  const unread = letters.filter((l) => !st[l.id]?.read).length;

  const cards = letters.map((l, i) => {
    const s = st[l.id] || {};
    const v = VERDICT[s.verdict];
    return `
      <button class="envelope-card ${s.read ? 'read' : 'unread'}" data-id="${esc(l.id)}" style="--tilt:${(i % 3 - 1) * 0.8}deg">
        <span class="env-flap"></span>
        <span class="env-seal">${s.read ? '💗' : '💌'}</span>
        <span class="env-body">
          <span class="env-no">第 ${letters.length - i} 封</span>
          <span class="env-title">${esc(l.title || '道歉信')}</span>
          <span class="env-date">${l.date ? fmtFull(l.date) : ''}</span>
        </span>
        ${!s.read ? '<span class="badge-new">新</span>' : ''}
        ${v ? `<span class="stamp stamp-${s.verdict}">${v.stamp}</span>` : ''}
      </button>`;
  }).join('');

  root.innerHTML = `
    <h1 class="page-title">💌 ${esc(CONFIG.hisName)}的道歉信</h1>
    <section class="card stats-row">
      <div class="stat"><div class="stat-num">${letters.length}<small>封</small></div><div class="stat-label">一共写了</div></div>
      <div class="stat"><div class="stat-num">${forgiven}<small>封</small></div><div class="stat-label">已原谅</div></div>
      <div class="stat"><div class="stat-num">${unread}<small>封</small></div><div class="stat-label">还没拆</div></div>
    </section>
    ${letters.length
      ? `<div class="envelopes">${cards}</div>`
      : `<section class="card empty-card">
          <div class="empty-emoji">🐶✨</div>
          <p>${esc(CONFIG.hisName)}最近很乖，还没有道歉信～</p>
          <p class="hint">（要是${esc(CONFIG.hisName)}惹你生气了，这里很快就会多一封）</p>
        </section>`}`;
}

function onClick(e) {
  const card = e.target.closest('.envelope-card');
  if (!card) return;
  const letter = LETTERS.find((l) => l.id === card.dataset.id);
  if (letter) openLetter(letter);
}

function update(id, patch) {
  const st = states();
  st[id] = { ...(st[id] || {}), ...patch };
  save('letters', st);
  return st[id];
}

function openLetter(letter) {
  let s = states()[letter.id] || {};
  if (!s.read) {
    s = update(letter.id, { read: Date.now() });
    sfx.pop();
    notifyQuietly({
      title: `💌 ${CONFIG.herName}拆开了你的道歉信`,
      message: `《${letter.title || '道歉信'}》已读`,
      tags: ['letter'],
    });
  }

  const paragraphs = String(letter.content || '')
    .split(/\n/)
    .map((line) => `<p>${esc(line) || '&nbsp;'}</p>`)
    .join('');

  const { el, close } = openSheet(`
    <div class="letter-open">
      <article class="letter-paper">
        <h2 class="letter-title">${esc(letter.title || '道歉信')}</h2>
        <div class="letter-content">${paragraphs}</div>
        <div class="letter-sign">—— ${esc(CONFIG.hisName)}<br><small>${letter.date ? fmtFull(letter.date) : ''}</small></div>
        <div class="letter-stamp-slot">${s.verdict ? `<span class="stamp big stamp-${s.verdict}">${VERDICT[s.verdict].stamp}</span>` : ''}</div>
      </article>
      <div class="verdict">
        <div class="setting-label">给${esc(CONFIG.hisName)}的判决 ${s.verdict ? `<small>（现在：${VERDICT[s.verdict].label}${VERDICT[s.verdict].icon}）</small>` : ''}</div>
        <textarea class="input" id="letter-reply" rows="2" placeholder="想对${esc(CONFIG.hisName)}说的话（可以不写）">${esc(s.reply || '')}</textarea>
        <div class="btn-row">
          <button class="btn btn-ghost" data-verdict="angry">😤 还不原谅</button>
          <button class="btn btn-primary" data-verdict="forgive">💗 原谅你了</button>
        </div>
      </div>
    </div>`, { className: 'sheet-letter', onClose: draw });

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-verdict]');
    if (!btn) return;
    const verdict = btn.dataset.verdict;
    const reply = el.querySelector('#letter-reply').value.trim();
    update(letter.id, { verdict, reply, decidedAt: Date.now() });

    const slot = el.querySelector('.letter-stamp-slot');
    slot.innerHTML = `<span class="stamp big stamp-${verdict} stamp-in">${VERDICT[verdict].stamp}</span>`;
    const rect = btn.getBoundingClientRect();
    if (verdict === 'forgive') {
      sfx.tada();
      for (let i = 0; i < 10; i++) {
        setTimeout(() => floatAt(rect.left + rect.width / 2 + (Math.random() - 0.5) * 120, rect.top, '💗', 'float-heart'), i * 60);
      }
    } else {
      sfx.slap();
    }

    notifyQuietly({
      title: verdict === 'forgive' ? `💗 ${CONFIG.herName}原谅你了！` : `😤 ${CONFIG.herName}还没原谅你`,
      message: `《${letter.title || '道歉信'}》${reply ? `\n${CONFIG.herName}说：${reply}` : ''}`,
      priority: 4,
      tags: ['letter'],
    });
    toast(verdict === 'forgive' ? `已经告诉${CONFIG.hisName}啦` : `哼，让${CONFIG.hisName}继续反省`, { icon: VERDICT[verdict].icon });
    setTimeout(close, 1400);
  });
}
