// 经期记录的数据与预测逻辑（不含界面）
import { load, save } from './store.js';
import { addDays, diffDays, todayKey } from './dates.js';

const MAX_OPEN_DAYS = 14; // 没记结束日期时，最多认为持续这么多天

export function loadPeriodData() {
  const data = load('period', null) || {};
  return {
    periods: Array.isArray(data.periods) ? data.periods : [],
    days: data.days && typeof data.days === 'object' ? data.days : {},
    settings: { cycleLength: 28, periodLength: 5, notifyHim: true, ...(data.settings || {}) },
  };
}

export function savePeriodData(data) {
  data.periods.sort((a, b) => a.start.localeCompare(b.start));
  save('period', data);
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// 某次经期实际（或估计）的最后一天
export function periodEnd(p, avgLen) {
  if (p.end) return p.end;
  const today = todayKey();
  const estimated = addDays(p.start, avgLen - 1);
  if (diffDays(p.start, today) < MAX_OPEN_DAYS) return today > estimated ? today : estimated;
  return estimated;
}

export function isOpen(p) {
  return !p.end && diffDays(p.start, todayKey()) < MAX_OPEN_DAYS;
}

export function computeStats(data) {
  const { periods, settings } = data;
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));

  const cycles = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = diffDays(sorted[i - 1].start, sorted[i].start);
    if (d >= 18 && d <= 60) cycles.push(d);
  }
  const recentCycles = cycles.slice(-6);
  const avgCycle = recentCycles.length
    ? Math.round(recentCycles.reduce((s, x) => s + x, 0) / recentCycles.length)
    : settings.cycleLength;

  const lengths = sorted
    .filter((p) => p.end)
    .map((p) => diffDays(p.start, p.end) + 1)
    .filter((l) => l >= 1 && l <= MAX_OPEN_DAYS)
    .slice(-6);
  const avgLen = lengths.length
    ? Math.round(lengths.reduce((s, x) => s + x, 0) / lengths.length)
    : settings.periodLength;

  const last = sorted[sorted.length - 1] || null;
  const today = todayKey();

  let nextStart = null;
  let lateDays = 0;
  if (last) {
    nextStart = addDays(last.start, avgCycle);
    const overdue = diffDays(nextStart, today);
    if (overdue > 0 && overdue <= MAX_OPEN_DAYS) {
      lateDays = overdue;
    } else {
      while (diffDays(nextStart, today) > MAX_OPEN_DAYS) nextStart = addDays(nextStart, avgCycle);
    }
  }

  // 未来几个周期的预测
  const predictions = [];
  if (nextStart) {
    let s = lateDays > 0 ? today : nextStart;
    for (let i = 0; i < 4; i++) {
      const ovulation = addDays(s, -14);
      predictions.push({
        start: s,
        end: addDays(s, avgLen - 1),
        ovulation,
        fertileStart: addDays(ovulation, -5),
        fertileEnd: addDays(ovulation, 1),
      });
      s = addDays(s, avgCycle);
    }
  }

  return { sorted, cycles, avgCycle, avgLen, last, nextStart, lateDays, predictions, hasCycleData: recentCycles.length > 0 };
}

// 今天的状态
export function currentStatus(data, stats) {
  const today = todayKey();
  const { last, avgLen, nextStart, lateDays, avgCycle } = stats;
  if (!last) return { kind: 'empty' };

  const end = periodEnd(last, avgLen);
  if (today >= last.start && today <= end) {
    return { kind: 'period', day: diffDays(last.start, today) + 1, open: isOpen(last), period: last };
  }
  if (lateDays > 0) return { kind: 'late', lateDays, expected: nextStart };

  const daysLeft = diffDays(today, nextStart);
  const ovulation = addDays(nextStart, -14);
  const toOvulation = diffDays(today, ovulation);
  let phase = '卵泡期';
  if (daysLeft <= 5) phase = '经前期';
  else if (toOvulation >= -1 && toOvulation <= 5) phase = '排卵期';
  else if (toOvulation < -1) phase = '黄体期';
  const cycleDay = diffDays(last.start, today) % avgCycle + 1;
  return { kind: 'waiting', daysLeft, nextStart, phase, cycleDay };
}

// 给日历用：某天是什么
export function dayInfo(key, data, stats) {
  const info = { period: false, predicted: false, fertile: false, ovulation: false, periodRef: null, log: data.days[key] || null };
  const today = todayKey();
  for (const p of stats.sorted) {
    if (key >= p.start && key <= periodEnd(p, stats.avgLen)) {
      // 还没记结束日期时，今天之后的只算「预计还会持续」
      if (key > today && !p.end) info.predicted = true;
      else info.period = true;
      info.periodRef = p;
      break;
    }
  }
  if (!info.period && !info.predicted) {
    for (const pr of stats.predictions) {
      if (key >= pr.start && key <= pr.end && key >= today) info.predicted = true;
      if (key === pr.ovulation) info.ovulation = true;
      else if (key >= pr.fertileStart && key <= pr.fertileEnd) info.fertile = true;
    }
  }
  return info;
}
