// 课表数据：加载、按天分组、判断耀耀现在在干嘛
import { CONFIG } from './config.js';
import { parseICS, zonedParts } from './ics.js';

let cache = null;

export function loadSchedule() {
  cache ??= fetch(CONFIG.scheduleFile, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.text() : null))
    .then((text) => {
      if (!text || !text.includes('BEGIN:VCALENDAR')) return { timeZone: CONFIG.schoolTimeZone, events: [], missing: true };
      const parsed = parseICS(text, CONFIG.schoolTimeZone);
      const schedule = { ...parsed, ...classify(parsed.events) };
      buildColors(schedule);
      return schedule;
    })
    .catch(() => ({ timeZone: CONFIG.schoolTimeZone, events: [], missing: true }));
  return cache;
}

// 课表里混了三种东西：上课、Canvas 上的作业（全天）、学校活动/放假（全天）
function classify(events) {
  const classes = [];
  const assignments = [];
  const notes = [];
  for (const e of events) {
    if (!e.allDay) {
      classes.push(e);
      continue;
    }
    const m = /^(.+?)\s*-\s*\d+\s*[:：]\s*(.+)$/.exec(e.title);
    if (m) assignments.push({ ...e, course: m[1].trim(), task: m[2].trim() });
    else notes.push({ ...e, title: e.title.replace(/\s*\((Prep|Upper School|US)\)\s*$/i, '').trim() });
  }
  return { classes, assignments, notes };
}

export function viewerTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
}

export function sameZone(tz) {
  const viewer = viewerTimeZone();
  if (!viewer || !tz) return true;
  const now = new Date();
  const a = zonedParts(now, viewer);
  const b = zonedParts(now, tz);
  return a.hour === b.hour && a.minute === b.minute && a.day === b.day;
}

export function fmtTime(date, timeZone) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export function dayKeyIn(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// 课名里 myschoolapp 常带的班号，比如 "AP Chemistry - 2 (B)"，展示时去掉
export function cleanTitle(title) {
  return title.replace(/\s*-\s*\d+\s*(\([^)]*\))?\s*$/, '').trim() || title;
}

const PALETTE = ['pink', 'sky', 'lilac', 'mint', 'peach', 'lemon', 'coral', 'rose'];
const colorMap = new Map();

// 按课程第一次出现的顺序分配颜色，保证相邻的课不会撞色
export function buildColors(schedule) {
  colorMap.clear();
  const seen = [];
  for (const e of schedule.classes || []) {
    const t = cleanTitle(e.title);
    if (!seen.includes(t)) seen.push(t);
  }
  seen.forEach((t, i) => colorMap.set(t, PALETTE[i % PALETTE.length]));
}

export function colorFor(title) {
  const t = cleanTitle(title);
  if (colorMap.has(t)) return colorMap.get(t);
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function eventsOnDay(schedule, dayKey) {
  return (schedule.classes || []).filter((e) => dayKeyIn(e.start, schedule.timeZone) === dayKey);
}

function coversDay(e, dayKey) {
  const start = localKey(e.start);
  const end = e.end ? localKey(e.end) : start;
  return dayKey >= start && (dayKey < end || dayKey === start);
}

export function assignmentsOnDay(schedule, dayKey) {
  return (schedule.assignments || []).filter((e) => coversDay(e, dayKey));
}

export function notesOnDay(schedule, dayKey) {
  return (schedule.notes || []).filter((e) => coversDay(e, dayKey));
}

function localKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function minutesBetween(a, b) {
  return Math.round((b - a) / 60000);
}

export function fmtDuration(min) {
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

// 耀耀此刻的状态
export function nowStatus(schedule, now = new Date()) {
  const tz = schedule.timeZone;
  const p = zonedParts(now, tz);
  const todayKey = dayKeyIn(now, tz);
  const classes = (schedule.classes || []).filter((e) => dayKeyIn(e.start, tz) === todayKey);
  const current = classes.find((e) => e.start <= now && e.end > now);
  const next = classes.find((e) => e.start > now);
  const lastEvent = schedule.classes?.[schedule.classes.length - 1];

  const base = { hour: p.hour, minute: p.minute, weekday: p.weekday, tz, todayClasses: classes };
  if (current) return { ...base, kind: 'class', current, next, left: minutesBetween(now, current.end) };
  if (p.hour >= 23 || p.hour < 7) return { ...base, kind: 'sleep', next };
  if (next) return { ...base, kind: 'break', next, until: minutesBetween(now, next.start) };
  if (classes.length) return { ...base, kind: 'done' };
  if (schedule.missing) return { ...base, kind: 'unknown' };
  if (lastEvent && lastEvent.end < now) return { ...base, kind: 'outdated' };
  return { ...base, kind: p.weekday === 0 || p.weekday === 6 ? 'weekend' : 'free' };
}
