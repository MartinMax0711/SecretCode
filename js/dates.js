// 以 'YYYY-MM-DD' 字符串表示日期，全部按本地日历日计算
const DAY = 86400000;

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return toKey(new Date());
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function diffDays(a, b) {
  // b - a，单位：天
  return Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / DAY);
}

function ymd(key) {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m - 1, d];
}

export function fmtMonthDay(key) {
  const d = fromKey(key);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtFull(key) {
  const d = fromKey(key);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtWeekday(key) {
  return '周' + WEEKDAYS[fromKey(key).getDay()];
}

export function relativeTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}
