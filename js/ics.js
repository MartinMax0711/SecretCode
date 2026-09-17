// 简单的 iCalendar (.ics) 解析器，够解析 myschoolapp 导出的课表
// 返回 { timeZone, events: [{ uid, title, location, description, start: Date, end: Date, allDay }] }

export function parseICS(text, fallbackTz) {
  const lines = unfold(text);
  const events = [];
  let calTz = null;
  let cur = null;

  for (const line of lines) {
    const { name, params, value } = parseLine(line);
    if (!name) continue;
    if (name === 'X-WR-TIMEZONE' && !cur) calTz = value;
    if (name === 'BEGIN' && value === 'VEVENT') { cur = { props: {} }; continue; }
    if (name === 'END' && value === 'VEVENT') {
      if (cur) events.push(...toEvents(cur.props, calTz || fallbackTz));
      cur = null;
      continue;
    }
    if (name === 'BEGIN' && value === 'VTIMEZONE') continue;
    if (name === 'TZID' && !cur && !calTz) calTz = value;
    if (cur) {
      (cur.props[name] ||= []).push({ params, value });
    }
  }

  events.sort((a, b) => a.start - b.start);
  return { timeZone: calTz || fallbackTz, events };
}

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line) {
  const idx = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (idx < 0) return {};
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...rawParams] = head.split(';');
  const params = {};
  for (const p of rawParams) {
    const [k, v = ''] = p.split('=');
    params[k.toUpperCase()] = v.replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(s) {
  return decodeEntities((s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')).trim();
}

// 课表里混着 &#160; &amp; 这种 HTML 实体
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function first(props, key) {
  return props[key]?.[0];
}

function toEvents(props, calTz) {
  const dtstart = first(props, 'DTSTART');
  if (!dtstart) return [];
  const start = parseDate(dtstart, calTz);
  let end;
  const dtend = first(props, 'DTEND');
  if (dtend) end = parseDate(dtend, calTz);
  else {
    const dur = first(props, 'DURATION');
    end = { date: new Date(start.date.getTime() + parseDuration(dur?.value)), allDay: start.allDay };
  }

  const base = {
    uid: first(props, 'UID')?.value || '',
    title: unescapeText(first(props, 'SUMMARY')?.value) || '（没有名字）',
    location: unescapeText(first(props, 'LOCATION')?.value),
    description: unescapeText(first(props, 'DESCRIPTION')?.value),
    allDay: start.allDay,
  };
  const length = end.date - start.date;

  const rrule = first(props, 'RRULE');
  if (!rrule) return [{ ...base, start: start.date, end: end.date }];

  const exdates = new Set(
    (props.EXDATE || []).flatMap((ex) => ex.value.split(',').map((v) => parseDate({ params: ex.params, value: v }, calTz).date.getTime())),
  );
  return expandRRule(rrule.value, start.date, calTz, start.allDay)
    .filter((d) => !exdates.has(d.getTime()))
    .map((d) => ({ ...base, start: d, end: new Date(d.getTime() + length) }));
}

function parseDuration(v) {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
  if (!m) return 0;
  const [, w = 0, d = 0, h = 0, mi = 0, s = 0] = m.map((x) => Number(x || 0));
  return ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
}

function parseDate({ params, value }, calTz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return { date: new Date(value), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h || params.VALUE === 'DATE') {
    return { date: new Date(Number(y), Number(mo) - 1, Number(d)), allDay: true };
  }
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0)];
  if (z) return { date: new Date(Date.UTC(...parts)), allDay: false };
  const tz = params.TZID || calTz;
  return { date: tz ? zonedToUtc(parts, tz) : new Date(...parts), allDay: false };
}

// 把某个时区的“墙上时间”换成真正的时间点
export function zonedToUtc([y, mo, d, h, mi, s], timeZone) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let ts = guess;
  for (let i = 0; i < 3; i++) {
    const offset = tzOffset(new Date(ts), timeZone);
    const next = guess - offset;
    if (next === ts) break;
    ts = next;
  }
  return new Date(ts);
}

const dtfCache = new Map();
function tzOffset(date, timeZone) {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    try {
      dtf = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch {
      return -date.getTimezoneOffset() * 60000;
    }
    dtfCache.set(timeZone, dtf);
  }
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// 某个时间点在指定时区的年月日时分和星期
export function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), weekday: wd };
}

const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// 只处理课表里常见的 DAILY / WEEKLY 规则
function expandRRule(rule, start, tz, allDay) {
  const r = Object.fromEntries(rule.split(';').map((kv) => kv.split('=')));
  const interval = Number(r.INTERVAL || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? parseDate({ params: {}, value: r.UNTIL }, tz).date : null;
  const hardEnd = new Date(start.getTime() + 400 * 86400000);
  const limit = until && until < hardEnd ? until : hardEnd;
  if (!['DAILY', 'WEEKLY'].includes(r.FREQ)) return [start];

  const zone = allDay ? null : tz;
  const sp = zone ? zonedParts(start, zone) : { year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate(), hour: start.getHours(), minute: start.getMinutes(), weekday: start.getDay() };
  const sec = start.getSeconds();
  const byDay = r.BYDAY ? r.BYDAY.split(',').map((d) => WD[d.slice(-2)]) : [sp.weekday];

  const out = [];
  for (let i = 0; out.length < count && i < 800; i++) {
    const dayDate = new Date(Date.UTC(sp.year, sp.month - 1, sp.day + i));
    const wd = dayDate.getUTCDay();
    if (r.FREQ === 'DAILY') {
      if (i % interval !== 0) continue;
    } else {
      const weekIdx = Math.floor((i + ((sp.weekday + 6) % 7)) / 7);
      if (weekIdx % interval !== 0 || !byDay.includes(wd)) continue;
    }
    const parts = [dayDate.getUTCFullYear(), dayDate.getUTCMonth(), dayDate.getUTCDate(), sp.hour, sp.minute, sec];
    const occ = zone ? zonedToUtc(parts, zone) : new Date(...parts);
    if (occ < start) continue;
    if (occ > limit) break;
    out.push(occ);
  }
  return out;
}
