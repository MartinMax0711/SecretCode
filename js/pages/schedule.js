import { CONFIG } from '../config.js';
import { addDays, fmtMonthDay, fromKey } from '../dates.js';
import { esc } from '../ui.js';
import { zonedParts } from '../ics.js';
import {
  assignmentsOnDay, cleanTitle, colorFor, dayKeyIn, eventsOnDay, fmtDuration, fmtTime, loadSchedule,
  notesOnDay, nowStatus, sameZone, viewerTimeZone,
} from '../schedule-core.js';

let root;
let schedule;
let timer;
let weekStart; // 周一的 key（学校时区）
let selected;  // 选中的日子
let alive = false;

export function render(container) {
  root = container;
  alive = true;
  root.innerHTML = `<h1 class="page-title">📚 ${esc(CONFIG.hisName)}的课表</h1><section class="card"><p class="empty">加载中…</p></section>`;
  root.addEventListener('click', onClick);
  loadSchedule().then((s) => {
    if (!alive) return;
    schedule = s;
    selected = dayKeyIn(new Date(), s.timeZone);
    weekStart = mondayOf(selected);
    draw();
    timer = setInterval(drawNow, 30000);
  });
}

export function destroy() {
  alive = false;
  clearInterval(timer);
  root?.removeEventListener('click', onClick);
}

function mondayOf(key) {
  const wd = fromKey(key).getDay();
  return addDays(key, -((wd + 6) % 7));
}

function draw() {
  root.innerHTML = `
    <h1 class="page-title">📚 ${esc(CONFIG.hisName)}的课表</h1>
    <div id="now-slot">${nowCard()}</div>
    ${schedule.missing ? emptyCard() : `${dayCard()}${weekCard()}${coursesCard()}`}`;
}

function drawNow() {
  const slot = root.querySelector('#now-slot');
  if (slot) slot.innerHTML = nowCard();
}

function emptyCard() {
  return `<section class="card empty-card">
    <div class="empty-emoji">📭</div>
    <p>课表还没导入～</p>
    <p class="hint">把 myschoolapp 导出的日历放到 <code>${esc(CONFIG.scheduleFile)}</code> 就好啦</p>
  </section>`;
}

function dualTime(date) {
  const his = fmtTime(date, schedule.timeZone);
  if (sameZone(schedule.timeZone)) return his;
  return `${fmtTime(date, viewerTimeZone())}<small class="his-time">（${esc(CONFIG.hisName)}那边 ${his}）</small>`;
}

export function nowCardHtml(s, sched) {
  const name = esc(CONFIG.hisName);
  const clock = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  const where = sameZone(sched.timeZone) ? '' : `<div class="now-clock">${name}那边现在 周${'日一二三四五六'[s.weekday]} ${clock}</div>`;
  let icon = '🐶';
  let main;
  let sub = '';
  let progress = '';
  if (s.kind === 'class') {
    icon = '📖';
    main = `正在上 <b>${esc(cleanTitle(s.current.title))}</b>`;
    sub = `${s.current.location ? esc(s.current.location) + ' · ' : ''}还有 ${fmtDuration(s.left)}下课`;
    const total = s.current.end - s.current.start;
    const pct = Math.min(100, Math.max(0, ((Date.now() - s.current.start) / total) * 100));
    progress = `<div class="progress"><span style="width:${pct.toFixed(1)}%"></span></div>`;
    if (s.next) sub += `<br>下一节：${esc(cleanTitle(s.next.title))} ${fmtTime(s.next.start, sched.timeZone)}`;
  } else if (s.kind === 'break') {
    icon = '🎈';
    main = `现在<b>课间 / 没课</b>，可以找${name}`;
    sub = `${fmtDuration(s.until)}后上 ${esc(cleanTitle(s.next.title))}`;
  } else if (s.kind === 'sleep') {
    icon = '💤';
    main = `${name}那边是睡觉时间`;
    sub = s.next ? `今天第一节 ${esc(cleanTitle(s.next.title))} ${fmtTime(s.next.start, sched.timeZone)}` : '可能在睡觉，也可能在偷偷想你';
  } else if (s.kind === 'done') {
    icon = '🎉';
    main = '今天的课<b>上完啦</b>';
    sub = `快去找${name}玩`;
  } else if (s.kind === 'weekend') {
    icon = '🌈';
    main = '周末<b>没有课</b>';
  } else if (s.kind === 'free') {
    icon = '🌷';
    main = '今天<b>没有课</b>';
  } else if (s.kind === 'outdated') {
    icon = '🗓️';
    main = '课表数据过期啦';
    sub = `记得让${name}更新一下课表`;
  } else {
    icon = '❔';
    main = `还不知道${name}在干嘛`;
    sub = '课表导入之后这里会显示';
  }
  return `
    <section class="card now-card now-${s.kind}">
      <div class="now-icon">${icon}</div>
      <div class="now-text">
        <div class="now-label">${name}现在</div>
        <div class="now-main">${main}</div>
        ${sub ? `<div class="now-sub">${sub}</div>` : ''}
        ${progress}
        ${where}
      </div>
    </section>`;
}

function nowCard() {
  return nowCardHtml(nowStatus(schedule), schedule);
}

function dayCard() {
  const today = dayKeyIn(new Date(), schedule.timeZone);
  const strip = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(weekStart, i);
    const count = eventsOnDay(schedule, key).length;
    return `<button class="day-pill ${key === selected ? 'on' : ''} ${key === today ? 'today' : ''}" data-act="pick" data-date="${key}">
      <span>周${'一二三四五六日'[i]}</span><b>${fromKey(key).getDate()}</b><i>${count ? '•'.repeat(Math.min(count, 4)) : ''}</i>
    </button>`;
  }).join('');

  const events = eventsOnDay(schedule, selected);
  const banners = notesOnDay(schedule, selected).map((e) => `<span class="chip chip-lilac-light">${esc(e.title)}</span>`).join('');
  const homework = assignmentsOnDay(schedule, selected);
  const now = new Date();
  const list = events.map((e) => `
    <div class="class-item c-${colorFor(e.title)} ${e.start <= now && e.end > now ? 'live' : ''} ${e.end <= now ? 'past' : ''}">
      <div class="class-time">${dualTime(e.start)}<span> – ${fmtTime(e.end, sameZone(schedule.timeZone) ? schedule.timeZone : viewerTimeZone())}</span></div>
      <div class="class-name">${esc(cleanTitle(e.title))}</div>
      ${e.location ? `<div class="class-loc">📍 ${esc(e.location)}</div>` : ''}
    </div>`).join('');

  return `
    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-act="prev" aria-label="上一周">‹</button>
        <div class="cal-title">${fmtMonthDay(weekStart)} – ${fmtMonthDay(addDays(weekStart, 6))}</div>
        <button class="icon-btn" data-act="next" aria-label="下一周">›</button>
      </div>
      <div class="day-strip">${strip}</div>
      ${banners ? `<div class="chips">${banners}</div>` : ''}
      <div class="class-list">${list || '<p class="empty">这天没有课 🌷</p>'}</div>
      ${homework.length ? `
        <div class="homework">
          <div class="setting-label">📝 这天要交的作业（${homework.length}）</div>
          ${homework.map((h) => `
            <div class="hw c-${colorFor(h.course)}">
              <b>${esc(h.task)}</b><span>${esc(cleanTitle(h.course))}</span>
            </div>`).join('')}
        </div>` : ''}
    </section>`;
}

function weekCard() {
  const tz = schedule.timeZone;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perDay = days.map((k) => eventsOnDay(schedule, k));
  const shown = days.map((k, i) => ({ k, i, events: perDay[i] })).filter((d) => d.i < 5 || d.events.length);
  const all = perDay.flat();
  if (!all.length) return '';

  const mins = (d) => { const p = zonedParts(d, tz); return p.hour * 60 + p.minute; };
  const startMin = Math.floor(Math.min(...all.map((e) => mins(e.start))) / 60) * 60;
  const endMin = Math.ceil(Math.max(...all.map((e) => mins(e.end) || 1440)) / 60) * 60;
  const span = Math.max(60, endMin - startMin);
  const pxPerMin = 1.1;

  const hours = [];
  for (let m = startMin; m <= endMin; m += 60) {
    hours.push(`<div class="wk-hour" style="top:${(m - startMin) * pxPerMin}px">${String(m / 60).padStart(2, '0')}:00</div>`);
  }
  const cols = shown.map(({ k, i, events }) => `
    <div class="wk-col">
      <div class="wk-head">周${'一二三四五六日'[i]}</div>
      <div class="wk-body" style="height:${span * pxPerMin}px">
        ${events.map((e) => {
          const top = (mins(e.start) - startMin) * pxPerMin;
          const h = Math.max(18, ((e.end - e.start) / 60000) * pxPerMin);
          return `<div class="wk-event c-${colorFor(e.title)}" style="top:${top}px;height:${h}px" title="${esc(e.title)}">
            <b>${esc(cleanTitle(e.title))}</b><span>${fmtTime(e.start, tz)}</span></div>`;
        }).join('')}
      </div>
    </div>`).join('');

  return `
    <section class="card">
      <div class="card-head"><h2>这周总览</h2><span class="hint">${sameZone(tz) ? '' : `${esc(CONFIG.hisName)}那边的时间`}</span></div>
      <div class="week-grid">
        <div class="wk-hours" style="height:${span * pxPerMin}px">${hours.join('')}</div>
        ${cols}
      </div>
    </section>`;
}

function coursesCard() {
  const map = new Map();
  for (const e of schedule.classes || []) {
    const t = cleanTitle(e.title);
    const item = map.get(t) || { title: t, raw: e.title, locations: new Set(), count: 0 };
    item.count++;
    if (e.location) item.locations.add(e.location);
    map.set(t, item);
  }
  if (!map.size) return '';
  const items = [...map.values()].sort((a, b) => b.count - a.count).map((c) => `
    <div class="course c-${colorFor(c.raw)}">
      <b>${esc(c.title)}</b>
      <span>${[...c.locations].slice(0, 2).map(esc).join(' / ') || '&nbsp;'}</span>
    </div>`).join('');
  return `
    <section class="card">
      <div class="card-head"><h2>${esc(CONFIG.hisName)}的课程</h2><span class="hint">${map.size} 门</span></div>
      <div class="courses">${items}</div>
    </section>`;
}

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || !schedule) return;
  const { act, date } = btn.dataset;
  if (act === 'pick') selected = date;
  else if (act === 'prev' || act === 'next') {
    weekStart = addDays(weekStart, act === 'prev' ? -7 : 7);
    selected = weekStart;
  } else return;
  draw();
}
