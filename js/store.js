// 本地存储（数据只存在晗晗自己的浏览器里）
const PREFIX = 'hh.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function exportAll() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(PREFIX)) data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
    }
  } catch { /* ignore */ }
  return { app: 'hanhan-nest', version: 1, exportedAt: new Date().toISOString(), data };
}

export function importAll(backup) {
  if (!backup || backup.app !== 'hanhan-nest' || typeof backup.data !== 'object') {
    throw new Error('不是小窝的备份文件');
  }
  for (const [k, v] of Object.entries(backup.data)) save(k, v);
}

// 请求浏览器尽量不要清理本地数据
export function requestPersist() {
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}
