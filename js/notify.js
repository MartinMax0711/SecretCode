// 通过 ntfy.sh 给耀耀的电脑发提醒，并接收耀耀的回复
import { CONFIG } from './config.js';

const base = CONFIG.ntfyServer.replace(/\/$/, '');
const replyTopic = `${CONFIG.ntfyTopic}-reply`;

// kind: bell（老公铃，会弹窗）| info（普通通知）
export async function notifyHim({ title, message, kind = 'info', priority = 3, tags = [] }) {
  const res = await fetch(base + '/', {
    method: 'POST',
    body: JSON.stringify({
      topic: CONFIG.ntfyTopic,
      title,
      message,
      priority,
      tags: [kind, ...tags],
    }),
  });
  if (!res.ok) throw new Error(`发送失败 (${res.status})`);
  return res.json();
}

// 不关心结果的通知（道歉信已读、经期提醒之类）
export function notifyQuietly(payload) {
  notifyHim(payload).catch(() => {});
}

// 最近 12 小时耀耀的回复
export async function fetchRecentReplies() {
  const res = await fetch(`${base}/${replyTopic}/json?poll=1&since=12h`);
  if (!res.ok) return [];
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((m) => m && m.event === 'message');
}

// 实时监听回复；返回取消函数
export function subscribeReplies(onReply) {
  if (!('EventSource' in window)) return () => {};
  const es = new EventSource(`${base}/${replyTopic}/sse`);
  es.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.event === 'message') onReply(m);
    } catch { /* ignore */ }
  };
  return () => es.close();
}
