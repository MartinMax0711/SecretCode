import { CONFIG } from '../config.js';
import { puppySvg } from '../puppy.js';
import { sfx } from '../sound.js';
import { load, save } from '../store.js';
import { todayKey } from '../dates.js';
import { esc, openSheet, toast, vibrate } from '../ui.js';
import { notifyQuietly } from '../notify.js';

const WEAPONS = [
  { id: 'fist', name: '小拳拳', icon: '👊', power: 3, sound: 'punch', words: ['嘭！', '咚！', 'POW!', '砰！'] },
  { id: 'slipper', name: '拖鞋', icon: '🩴', power: 5, sound: 'slap', words: ['啪！', '啪叽！', 'SLAP!'] },
  { id: 'hammer', name: '叽叽锤', icon: '🔨', power: 5, sound: 'squeak', words: ['叽！', 'PIKO!', '啵！'] },
  { id: 'pan', name: '平底锅', icon: '🍳', power: 10, sound: 'clang', words: ['哐！', 'DUANG!', '铛——'], heavy: true },
  { id: 'kiss', name: '亲一口', icon: '💋', power: 6, sound: 'kiss', words: ['啾～', 'mua!', '♡'], kiss: true },
];

const LINES = {
  fist: ['嗷！', '呜呜呜', `${CONFIG.herName}轻点～`, '我错了我错了！', '小拳拳好有力气…', '再也不敢了 T_T', '汪呜…'],
  slipper: ['拖鞋！是拖鞋！', '啪叽…脸好烫', '拖鞋攻击好痛！', '我错了别拍了呜呜'],
  hammer: ['叽！', '头上长包包了…', 'piko piko～', '锤得好有节奏…'],
  pan: ['眼冒金星…', '锅！是锅！', '看到星星了✨', 'Duang～我是谁我在哪'],
  kiss: ['嘿嘿嘿～', `${CONFIG.herName}亲我了！！`, '不生气了嘛？', '汪汪！好开心！', '再亲一下嘛'],
  idle: [`${CONFIG.herName}还生气吗…`, '要不…再打两下？', '我给你揉揉手吧', '打是亲骂是爱对不对', '我真的知道错了', '呜…手疼不疼呀'],
  miss: ['嘿嘿没打到～', '略略略', '躲！'],
};

const MILESTONES = {
  10: '已经十下了…',
  52: '52下…是「我爱」的意思吗',
  100: '一百下了！气消了一点点吗',
  200: '两百下…我还撑得住！',
  520: `520！我爱你${CONFIG.herName}！`,
  1314: '1314，一生一世都给你打',
};

const DAMAGE_LEVELS = [20, 40, 70, 110, 200];

let root;
let stage;
let puppy;
let bubble;
let cursorEl;
let weapon = WEAPONS[0];
let data;
let session;
let faceTimer;
let idleTimer;
let lastBubbleAt = 0;
let hoverCapable = false;

function loadData() {
  const d = load('punch', {});
  return { total: d.total || 0, damage: d.damage || 0, days: d.days || {}, byWeapon: d.byWeapon || {} };
}

export function render(container) {
  root = container;
  data = loadData();
  session = { hits: 0, combo: 0, lastHit: 0, anger: 0, byWeapon: {}, asked: false };
  hoverCapable = matchMedia('(hover: hover) and (pointer: fine)').matches;

  root.innerHTML = `
    <h1 class="page-title">🐶 解气模式</h1>
    <section class="card punch-card">
      <div class="punch-top">
        <div class="meter" title="解气值">
          <span class="meter-label">解气值</span>
          <div class="meter-bar"><span id="meter-fill"></span></div>
        </div>
        <div class="combo" id="combo"></div>
      </div>
      <div class="stage ${hoverCapable ? 'has-cursor' : ''}" id="stage">
        <div class="bubble" id="bubble">${esc(CONFIG.herName)}，我知道错了…要打就打吧 🥺</div>
        <div class="puppy-wrap face-plead" id="puppy">${puppySvg(CONFIG.hisName)}</div>
        <div class="puppy-name">${esc(CONFIG.hisName)}</div>
        <div class="weapon-cursor" id="weapon-cursor">${weapon.icon}</div>
      </div>
      <div class="weapons" role="radiogroup" aria-label="选武器">
        ${WEAPONS.map((w) => `
          <button class="weapon ${w === weapon ? 'on' : ''}" data-weapon="${w.id}" role="radio" aria-checked="${w === weapon}">
            <span class="weapon-icon">${w.icon}</span><span>${w.name}</span>
          </button>`).join('')}
      </div>
      <div class="punch-stats">
        <div><b id="st-session">0</b><span>这次</span></div>
        <div><b id="st-today">0</b><span>今天</span></div>
        <div><b id="st-total">0</b><span>总共</span></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" id="heal-btn">🩹 给${esc(CONFIG.hisName)}呼呼</button>
        <button class="btn btn-primary" id="done-btn">💗 气消了</button>
      </div>
    </section>`;

  stage = root.querySelector('#stage');
  puppy = root.querySelector('#puppy');
  bubble = root.querySelector('#bubble');
  cursorEl = root.querySelector('#weapon-cursor');

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerleave', () => cursorEl.classList.remove('visible'));
  root.querySelector('.weapons').addEventListener('click', onWeapon);
  root.querySelector('#heal-btn').addEventListener('click', heal);
  root.querySelector('#done-btn').addEventListener('click', () => askDone(true));

  updateDamage();
  updateStats();
  scheduleIdle();
}

export function destroy() {
  clearTimeout(faceTimer);
  clearTimeout(idleTimer);
}

function persist() {
  save('punch', data);
}

function onWeapon(e) {
  const btn = e.target.closest('[data-weapon]');
  if (!btn) return;
  weapon = WEAPONS.find((w) => w.id === btn.dataset.weapon);
  root.querySelectorAll('.weapon').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  });
  cursorEl.textContent = weapon.icon;
  sfx.pop();
  if (weapon.kiss) say('诶？要亲我吗 (*/ω＼*)', true);
  else if (weapon.heavy) say('平、平底锅？！不要啊！', true);
}

function onPointerMove(e) {
  if (!hoverCapable) return;
  const r = stage.getBoundingClientRect();
  cursorEl.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
  cursorEl.classList.add('visible');
}

function onPointerDown(e) {
  const r = stage.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  const hitPuppy = e.target.closest('.pp-all');

  swingWeapon(x, y);

  if (!hitPuppy) {
    sfx.whoosh();
    if (Math.random() < 0.35) say(pick(LINES.miss));
    return;
  }

  e.preventDefault();
  const now = performance.now();
  session.combo = now - session.lastHit < 650 ? session.combo + 1 : 1;
  session.lastHit = now;
  session.hits++;
  session.byWeapon[weapon.id] = (session.byWeapon[weapon.id] || 0) + 1;

  const today = todayKey();
  data.total++;
  data.days[today] = (data.days[today] || 0) + 1;
  data.byWeapon[weapon.id] = (data.byWeapon[weapon.id] || 0) + 1;
  if (!weapon.kiss) data.damage++;
  persist();

  sfx[weapon.sound]();
  vibrate(weapon.heavy ? 40 : 15);

  const fromLeft = x < r.width / 2;
  knock(fromLeft);
  burstWord(x, y);
  particles(x, y);

  if (weapon.kiss) setFace('love', 1100);
  else if (weapon.heavy || session.combo >= 15) setFace('dizzy', 1100);
  else setFace('hit', 420);

  if (weapon.heavy || session.combo % 10 === 0) {
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
  }

  if (MILESTONES[session.hits]) say(MILESTONES[session.hits], true);
  else if (now - lastBubbleAt > 900 && Math.random() < 0.45) say(pick(LINES[weapon.id]));

  session.anger = Math.min(100, session.anger + weapon.power);
  updateStats();
  updateDamage();
  scheduleIdle();

  if (session.anger >= 100 && !session.asked) {
    session.asked = true;
    setTimeout(() => askDone(false), 500);
  }
}

function swingWeapon(x, y) {
  let el = cursorEl;
  if (!hoverCapable) {
    el = document.createElement('div');
    el.className = 'weapon-tap';
    el.textContent = weapon.icon;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    stage.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    return;
  }
  el.classList.remove('swing');
  void el.offsetWidth;
  el.classList.add('swing');
}

function knock(fromLeft) {
  const all = puppy;
  all.classList.remove('knock-l', 'knock-r');
  void all.offsetWidth;
  all.classList.add(fromLeft ? 'knock-r' : 'knock-l');
}

function burstWord(x, y) {
  const el = document.createElement('div');
  el.className = `hit-word ${weapon.kiss ? 'kiss' : ''} ${weapon.heavy ? 'heavy' : ''}`;
  el.textContent = pick(weapon.words);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.setProperty('--rot', `${(Math.random() - 0.5) * 30}deg`);
  stage.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function particles(x, y) {
  const n = weapon.heavy ? 8 : 5;
  const glyphs = weapon.kiss ? ['💗', '💕', '♡'] : ['✦', '✧', '★', '💢'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    el.textContent = pick(glyphs);
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 60;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    el.style.setProperty('--dy', `${Math.sin(angle) * dist - 20}px`);
    stage.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
}

function setFace(face, duration) {
  // 换表情时保留身上的伤和挨打的动作
  const keep = [...puppy.classList].filter((c) => c.startsWith('dmg-on-') || c.startsWith('knock-'));
  puppy.className = ['puppy-wrap', `face-${face}`, ...keep].join(' ');
  clearTimeout(faceTimer);
  if (duration) {
    faceTimer = setTimeout(() => {
      puppy.classList.remove(`face-${face}`);
      puppy.classList.add(session.hits ? 'face-plead' : 'face-normal');
    }, duration);
  }
}

function say(text, force = false) {
  const now = performance.now();
  if (!force && now - lastBubbleAt < 700) return;
  lastBubbleAt = now;
  bubble.textContent = text;
  bubble.classList.remove('pop');
  void bubble.offsetWidth;
  bubble.classList.add('pop');
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (session.hits && !weapon.kiss) {
      say(pick(LINES.idle), true);
      sfx.whimper();
    }
  }, 3500);
}

function updateStats() {
  root.querySelector('#st-session').textContent = session.hits;
  root.querySelector('#st-today').textContent = data.days[todayKey()] || 0;
  root.querySelector('#st-total').textContent = data.total;
  root.querySelector('#meter-fill').style.width = session.anger + '%';
  const combo = root.querySelector('#combo');
  if (session.combo >= 3) {
    combo.textContent = `连击 ×${session.combo}`;
    combo.classList.remove('bump');
    void combo.offsetWidth;
    combo.classList.add('bump');
  } else {
    combo.textContent = '';
  }
}

function updateDamage() {
  DAMAGE_LEVELS.forEach((lvl, i) => puppy.classList.toggle(`dmg-on-${i + 1}`, data.damage >= lvl));
}

function heal() {
  if (!data.damage) {
    say('我没受伤呀，嘿嘿', true);
    return;
  }
  data.damage = 0;
  persist();
  updateDamage();
  setFace('happy', 1600);
  sfx.tada();
  say(`谢谢${CONFIG.herName}呼呼，一点都不疼了！`, true);
}

function summary() {
  return WEAPONS.filter((w) => session.byWeapon[w.id]).map((w) => `${w.name}×${session.byWeapon[w.id]}`).join('，');
}

function askDone(manual) {
  if (manual && !session.hits) {
    say('还没打呢就消气啦？好感动 🥹', true);
    return;
  }
  const { el, close } = openSheet(`
    <div class="done-sheet">
      <div class="done-emoji">🐶💦</div>
      <h3 class="sheet-title">气消了吗？</h3>
      <p class="hint">这次一共打了 ${esc(CONFIG.hisName)} <b>${session.hits}</b> 下${summary() ? `（${esc(summary())}）` : ''}</p>
      <div class="btn-row">
        <button class="btn btn-ghost" data-done="no">😤 还没！继续打</button>
        <button class="btn btn-primary" data-done="yes">💗 消气了</button>
      </div>
    </div>`);
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-done]')?.dataset.done;
    if (!act) return;
    close();
    if (act === 'no') {
      session.anger = 40;
      session.asked = false;
      updateStats();
      setFace('plead');
      say('呜…好的，你继续…', true);
      return;
    }
    setFace('happy');
    sfx.tada();
    say(`耶！${CONFIG.herName}不生气了！最喜欢${CONFIG.herName}了！`, true);
    notifyQuietly({
      title: `🐶 ${CONFIG.herName}打完你，气消了`,
      message: `刚刚在解气模式里打了你 ${session.hits} 下（${summary()}），现在气消了 💗`,
      priority: 3,
      tags: ['punch'],
    });
    toast(`已经告诉${CONFIG.hisName}：气消啦`, { icon: '💗' });
    session = { hits: 0, combo: 0, lastHit: 0, anger: 0, byWeapon: {}, asked: false };
    updateStats();
  });
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
