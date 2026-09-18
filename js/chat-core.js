// 聊天的数据层：消息只在聊天框里留 3 小时，过期的自动搬进「储物间」
import { load, save } from './store.js';
import { CONFIG } from './config.js';
import { TOPICS, fetchSince, getRole, post } from './roles.js';

export const LIVE_MS = 3 * 60 * 60 * 1000;   // 聊天框里保留 3 小时
export const RING_AFTER = 5;                  // 对方连续这么多条没回，就响铃

// 本地缓存的消息（含已归档的）
function loadAll() {
  const d = load('chat', null) || {};
  return {
    msgs: Array.isArray(d.msgs) ? d.msgs : [],       // 全部消息（含旧的）
    seenAt: d.seenAt || 0,                            // 我上次看聊天的时间
    lastRingAt: d.lastRingAt || 0,
  };
}

function saveAll(d) {
  // 只留最近 30 天，别把 localStorage 撑爆
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  d.msgs = d.msgs.filter((m) => m.ts >= cutoff).slice(-800);
  save('chat', d);
}

export function getState() {
  return loadAll();
}

export function markSeen() {
  const d = loadAll();
  d.seenAt = Date.now();
  saveAll(d);
}

// 聊天框里显示的（3 小时内）
export function liveMessages() {
  const cutoff = Date.now() - LIVE_MS;
  return loadAll().msgs.filter((m) => m.ts >= cutoff).sort((a, b) => a.ts - b.ts);
}

// 储物间里的（超过 3 小时的）
export function archivedMessages() {
  const cutoff = Date.now() - LIVE_MS;
  return loadAll().msgs.filter((m) => m.ts < cutoff).sort((a, b) => b.ts - a.ts);
}

export function archivedCount() {
  return archivedMessages().length;
}

// 把一条远端消息并进本地（去重）
export function ingest(raw) {
  const d = loadAll();
  const id = raw.id;
  if (d.msgs.some((m) => m.id === id)) return false;
  let from = 'her';
  let text = (raw.message || '').trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.from && typeof parsed.text === 'string') {
      from = parsed.from === 'him' ? 'him' : 'her';
      text = parsed.text;
    }
  } catch { /* 不是 JSON 就当普通文本 */ }
  if (!text) return false;
  d.msgs.push({ id, from, text, ts: (raw.time || Date.now() / 1000) * 1000 });
  saveAll(d);
  return true;
}

// 拉最近 3 小时的消息（打开页面时补齐）
export async function syncRecent() {
  const list = await fetchSince(TOPICS.chat, '3h');
  let added = 0;
  for (const m of list) if (ingest(m)) added++;
  return added;
}

export async function sendMessage(text) {
  const clean = text.trim();
  if (!clean) return;
  const from = getRole();
  await post(TOPICS.chat, JSON.stringify({ from, text: clean }));
}

// 对方连着发了几条我还没回
export function unansweredFromOther() {
  const me = getRole();
  const msgs = loadAll().msgs.sort((a, b) => a.ts - b.ts);
  let n = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].from === me) break;
    n++;
  }
  return n;
}

// 注意：「晗晗连发 5 条就响耀耀的电脑」是由 Mac 上的小窝助手自己数、自己响的，
// 不依赖网页开着，所以这里不做响铃。

export const NAMES = { her: CONFIG.herName, him: CONFIG.hisName };
