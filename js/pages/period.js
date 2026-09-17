import { CONFIG } from '../config.js';
import { addDays, diffDays, fmtFull, fmtMonthDay, fmtWeekday, fromKey, toKey, todayKey } from '../dates.js';
import { confirmSheet, esc, openSheet, toast } from '../ui.js';
import { notifyQuietly } from '../notify.js';
import {
  computeStats, currentStatus, dayInfo, isOpen, loadPeriodData, newId, periodEnd, savePeriodData,
} from '../period-core.js';

const FLOW = ['少', '中', '多'];
const PAIN = ['不痛', '有点痛', '很痛', '痛死了'];

let root;
let data;
let month; // 当前显示的月份第一天 key

export function render(container) {
  root = container;
  data = loadPeriodData();
  const t = fromKey(todayKey());
  month = toKey(new Date(t.getFullYear(), t.getMonth(), 1));
  root.addEventListener('click', onClick);
  draw();
}

export function destroy() {
  root?.removeEventListener('click', onClick);
}

function persist() {
  savePeriodData(data);
  draw();
}

function draw() {
  const stats = computeStats(data);
  root.innerHTML = `
    <h1 class="page-title">🌸 经期小本本</h1>
    ${statusCard(stats)}
    ${calendar(stats)}
    ${statsCard(stats)}
    ${history(stats)}
    <p class="disclaimer">预测是根据以往记录算的，仅供参考，不能当作避孕的依据哦。</p>`;
}

function statusCard(stats) {
  const s = currentStatus(data, stats);
  const today = todayKey();
  let big;
  let sub;
  let actions;
  if (s.kind === 'empty') {
    big = '还没有记录';
    sub = '来月经的那天点一下「来了」，或者在下面补记以前的日期';
    actions = `<button class="btn btn-primary" data-act="start" data-date="${today}">🩸 今天来了</button>
      <button class="btn btn-ghost" data-act="add">✍️ 补记以前的</button>`;
  } else if (s.kind === 'period') {
    big = `经期第 <b>${s.day}</b> 天`;
    sub = s.open ? '多喝热水，注意保暖，别吃冰的 🧣' : '这次经期已经记录完成';
    actions = s.open
      ? `<button class="btn btn-primary" data-act="end" data-date="${today}">✅ 今天结束了</button>
         <button class="btn btn-ghost" data-act="day" data-date="${today}">📝 记一下今天</button>`
      : `<button class="btn btn-ghost" data-act="day" data-date="${today}">📝 记一下今天</button>`;
  } else if (s.kind === 'late') {
    big = `推迟了 <b>${s.lateDays}</b> 天`;
    sub = `原本预计 ${fmtMonthDay(s.expected)} 来，推迟几天也很常见，别太担心`;
    actions = `<button class="btn btn-primary" data-act="start" data-date="${today}">🩸 今天来了</button>`;
  } else {
    big = s.daysLeft === 0 ? '预计<b>今天</b>来' : s.daysLeft === 1 ? '预计<b>明天</b>来' : `距离下次还有 <b>${s.daysLeft}</b> 天`;
    sub = `预计 ${fmtMonthDay(s.nextStart)} ${fmtWeekday(s.nextStart)} · 周期第 ${s.cycleDay} 天 · ${s.phase}`;
    if (s.phase === '经前期') sub += `<br>经前容易烦躁，${esc(CONFIG.hisName)}要特别乖 🐶`;
    actions = `<button class="btn btn-primary" data-act="start" data-date="${today}">🩸 今天来了</button>
      <button class="btn btn-ghost" data-act="day" data-date="${today}">📝 记一下今天</button>`;
  }
  return `
    <section class="card status-card period-status ${s.kind}">
      <div class="status-big">${big}</div>
      <div class="status-sub">${sub}</div>
      <div class="btn-row">${actions}</div>
    </section>`;
}

function calendar(stats) {
  const first = fromKey(month);
  const today = todayKey();
  const offset = (first.getDay() + 6) % 7; // 周一开头
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const key = addDays(month, i - offset);
    const inMonth = i >= offset && i < offset + daysInMonth;
    if (!inMonth && i >= 35 && i - offset >= daysInMonth) break;
    const info = dayInfo(key, data, stats);
    const cls = ['cal-day'];
    if (!inMonth) cls.push('other');
    if (key === today) cls.push('today');
    if (info.period) cls.push('period');
    if (info.predicted) cls.push('predicted');
    if (info.fertile) cls.push('fertile');
    if (info.ovulation) cls.push('ovulation');
    if (key > today) cls.push('future');
    const n = fromKey(key).getDate();
    cells.push(`<button class="${cls.join(' ')}" data-act="day" data-date="${key}">
      <span class="num">${n}</span>${info.log ? '<span class="dot"></span>' : ''}</button>`);
  }
  return `
    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-act="prev" aria-label="上个月">‹</button>
        <div class="cal-title">${first.getFullYear()}年${first.getMonth() + 1}月</div>
        <button class="icon-btn" data-act="next" aria-label="下个月">›</button>
      </div>
      <div class="cal-grid cal-week">${['一', '二', '三', '四', '五', '六', '日'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
      <div class="legend">
        <span><i class="lg period"></i>经期</span>
        <span><i class="lg predicted"></i>预测经期</span>
        <span><i class="lg fertile"></i>易孕期</span>
        <span><i class="lg ovulation"></i>排卵日</span>
      </div>
    </section>`;
}

function statsCard(stats) {
  return `
    <section class="card stats-row">
      <div class="stat"><div class="stat-num">${stats.avgCycle}<small>天</small></div><div class="stat-label">平均周期${stats.hasCycleData ? '' : '（默认）'}</div></div>
      <div class="stat"><div class="stat-num">${stats.avgLen}<small>天</small></div><div class="stat-label">平均经期</div></div>
      <div class="stat"><div class="stat-num">${data.periods.length}<small>次</small></div><div class="stat-label">已记录</div></div>
      <button class="icon-btn stat-gear" data-act="settings" aria-label="经期设置">⚙️</button>
    </section>`;
}

function history(stats) {
  const list = [...stats.sorted].reverse();
  const items = list.map((p) => {
    const idx = stats.sorted.indexOf(p);
    const prev = stats.sorted[idx - 1];
    const end = periodEnd(p, stats.avgLen);
    const len = diffDays(p.start, end) + 1;
    const gap = prev ? `距上次 ${diffDays(prev.start, p.start)} 天` : '第一次记录';
    return `
      <button class="history-item" data-act="edit" data-id="${p.id}">
        <span class="history-dates">${fmtFull(p.start)} – ${p.end ? fmtMonthDay(p.end) : (isOpen(p) ? '进行中' : fmtMonthDay(end) + '?')}</span>
        <span class="history-meta">${len} 天 · ${gap}</span>
      </button>`;
  }).join('');
  return `
    <section class="card">
      <div class="card-head">
        <h2>历史记录</h2>
        <button class="btn btn-small btn-ghost" data-act="add">+ 补记</button>
      </div>
      ${items || '<p class="empty">还没有记录～</p>'}
    </section>`;
}

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || !root.contains(btn)) return;
  const { act, date, id } = btn.dataset;
  if (act === 'prev' || act === 'next') {
    const d = fromKey(month);
    d.setMonth(d.getMonth() + (act === 'prev' ? -1 : 1));
    month = toKey(d);
    draw();
  } else if (act === 'start') startPeriod(date);
  else if (act === 'end') endPeriod(date);
  else if (act === 'day') openDay(date);
  else if (act === 'add') openEditor(null);
  else if (act === 'edit') openEditor(data.periods.find((p) => p.id === id));
  else if (act === 'settings') openSettings();
}

function startPeriod(date) {
  const stats = computeStats(data);
  const covering = stats.sorted.find((p) => date >= p.start && date <= periodEnd(p, stats.avgLen));
  if (covering) {
    toast('这天已经在经期里啦', { icon: '🌸' });
    return;
  }
  data.periods.push({ id: newId(), start: date, end: null });
  persist();
  toast('记下来啦，这几天要好好照顾自己', { icon: '🩸' });
  if (data.settings.notifyHim && date === todayKey()) {
    notifyQuietly({
      title: `🩸 ${CONFIG.herName}的经期来了`,
      message: `${CONFIG.herName}今天来月经了，这几天要多关心、多哄哄，不许惹${CONFIG.herName}生气！`,
      priority: 4,
    });
  }
}

function endPeriod(date) {
  const stats = computeStats(data);
  const p = [...stats.sorted].reverse().find((x) => x.start <= date);
  if (!p) return;
  if (diffDays(p.start, date) >= 14) {
    toast('离上次开始太久了，是不是忘记记「来了」？', { icon: '🤔' });
    return;
  }
  p.end = date;
  persist();
  toast(`这次一共 ${diffDays(p.start, date) + 1} 天，辛苦啦`, { icon: '✅' });
}

function openDay(date) {
  const stats = computeStats(data);
  const info = dayInfo(date, data, stats);
  const log = data.days[date] || {};
  const today = todayKey();
  const future = date > today;

  let tag = '';
  if (info.period) tag = `<span class="chip chip-rose">经期第 ${diffDays(info.periodRef.start, date) + 1} 天</span>`;
  else if (info.predicted) tag = '<span class="chip chip-rose-light">预测经期</span>';
  if (info.ovulation) tag += '<span class="chip chip-lilac">排卵日（预测）</span>';
  else if (info.fertile) tag += '<span class="chip chip-lilac-light">易孕期（预测）</span>';

  let actions = '';
  if (!future) {
    if (info.period) {
      const p = info.periodRef;
      actions = `
        ${date !== p.end ? `<button class="btn btn-primary" data-sheet="end">✅ 这天结束了</button>` : ''}
        <button class="btn btn-ghost" data-sheet="edit">✏️ 修改这次</button>`;
    } else {
      const prev = [...stats.sorted].reverse().find((p) => p.start < date);
      const canExtend = prev && diffDays(prev.start, date) < 14;
      actions = `
        <button class="btn btn-primary" data-sheet="start">🩸 这天来了</button>
        ${canExtend ? `<button class="btn btn-ghost" data-sheet="end">➡️ 经期持续到这天</button>` : ''}`;
    }
  }

  const chipGroup = (name, labels, value) => labels.map((l, i) =>
    `<button class="pick ${value === i ? 'on' : ''}" data-pick="${name}" data-val="${i}">${l}</button>`).join('');

  const { el, close } = openSheet(`
    <h3 class="sheet-title">${fmtMonthDay(date)} ${fmtWeekday(date)}</h3>
    <div class="chips">${tag}</div>
    ${actions ? `<div class="btn-row">${actions}</div>` : '<p class="hint">未来的日子还不能记录哦</p>'}
    ${future ? '' : `
      <div class="setting-block">
        <div class="setting-label">流量</div>
        <div class="picks">${chipGroup('flow', FLOW, log.flow)}</div>
        <div class="setting-label">痛不痛</div>
        <div class="picks">${chipGroup('pain', PAIN, log.pain)}</div>
        <div class="setting-label">小备注</div>
        <textarea class="input" id="day-note" rows="2" placeholder="比如：肚子有点胀、想吃甜的">${esc(log.note || '')}</textarea>
        <button class="btn btn-primary btn-block" data-sheet="save">保存</button>
      </div>`}`);

  const draft = { ...log };
  el.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const name = pick.dataset.pick;
      const val = Number(pick.dataset.val);
      draft[name] = draft[name] === val ? undefined : val;
      el.querySelectorAll(`[data-pick="${name}"]`).forEach((b) => b.classList.toggle('on', Number(b.dataset.val) === draft[name]));
      return;
    }
    const act = e.target.closest('[data-sheet]')?.dataset.sheet;
    if (!act) return;
    if (act === 'start') { close(); startPeriod(date); }
    else if (act === 'end') { close(); endPeriod(date); }
    else if (act === 'edit') { close(); openEditor(info.periodRef); }
    else if (act === 'save') {
      draft.note = el.querySelector('#day-note').value.trim();
      const hadPain = log.pain;
      const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined && v !== ''));
      if (Object.keys(clean).length) data.days[date] = clean;
      else delete data.days[date];
      close();
      persist();
      toast('记好啦', { icon: '📝' });
      if (data.settings.notifyHim && date === today && clean.pain >= 2 && hadPain !== clean.pain) {
        notifyQuietly({
          title: `🥺 ${CONFIG.herName}肚子${PAIN[clean.pain]}`,
          message: `${CONFIG.herName}今天肚子${PAIN[clean.pain]}，快去问问要不要喝热水、要不要抱抱！`,
          priority: 4,
        });
      }
    }
  });
}

function openEditor(period) {
  const isNew = !period;
  const today = todayKey();
  const { el, close } = openSheet(`
    <h3 class="sheet-title">${isNew ? '补记一次经期' : '修改这次经期'}</h3>
    <label class="field"><span>开始那天</span><input type="date" class="input" id="ed-start" max="${today}" value="${period?.start || ''}"></label>
    <label class="field"><span>结束那天 <small>（还没结束可以不填）</small></span><input type="date" class="input" id="ed-end" max="${today}" value="${period?.end || ''}"></label>
    <div class="btn-row">
      ${isNew ? '' : '<button class="btn btn-danger" data-ed="delete">删除</button>'}
      <button class="btn btn-primary" data-ed="save">保存</button>
    </div>`);

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-ed]')?.dataset.ed;
    if (act === 'delete') {
      close();
      if (await confirmSheet('确定删除这次记录吗？', { ok: '删除', danger: true })) {
        data.periods = data.periods.filter((p) => p.id !== period.id);
        persist();
      }
    } else if (act === 'save') {
      const start = el.querySelector('#ed-start').value;
      const end = el.querySelector('#ed-end').value || null;
      if (!start) return toast('要填开始日期哦', { icon: '⚠️' });
      if (end && end < start) return toast('结束不能比开始早', { icon: '⚠️' });
      if (end && diffDays(start, end) >= 14) return toast('经期超过两周了，检查一下日期？', { icon: '⚠️' });
      const clash = data.periods.find((p) => p !== period && Math.abs(diffDays(p.start, start)) < 10);
      if (clash) return toast(`和 ${fmtMonthDay(clash.start)} 那次离得太近了`, { icon: '⚠️' });
      if (isNew) data.periods.push({ id: newId(), start, end });
      else Object.assign(period, { start, end });
      close();
      persist();
      toast('保存好啦', { icon: '✅' });
    }
  });
}

function openSettings() {
  const s = data.settings;
  const { el, close } = openSheet(`
    <h3 class="sheet-title">经期设置</h3>
    <p class="hint">记录少于两次时，用下面的默认值来预测；记录多了会自动按实际情况算。</p>
    <label class="field"><span>默认周期（天）</span><input type="number" class="input" id="st-cycle" min="18" max="60" value="${s.cycleLength}"></label>
    <label class="field"><span>默认经期长度（天）</span><input type="number" class="input" id="st-len" min="2" max="10" value="${s.periodLength}"></label>
    <label class="setting-row"><span>来了 / 很痛的时候告诉${esc(CONFIG.hisName)}</span><input type="checkbox" class="switch" id="st-notify" ${s.notifyHim ? 'checked' : ''}></label>
    <button class="btn btn-primary btn-block" id="st-save">保存</button>`);
  el.querySelector('#st-save').addEventListener('click', () => {
    const cycle = Number(el.querySelector('#st-cycle').value);
    const len = Number(el.querySelector('#st-len').value);
    if (cycle >= 18 && cycle <= 60) s.cycleLength = cycle;
    if (len >= 2 && len <= 10) s.periodLength = len;
    s.notifyHim = el.querySelector('#st-notify').checked;
    close();
    persist();
  });
}
