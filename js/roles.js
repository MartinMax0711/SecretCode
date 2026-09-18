// 谁在看这个网页：默认是晗晗（her）；耀耀用 520520 进入 portal 后，这台设备变成 him
import { load, save } from './store.js';
import { CONFIG } from './config.js';

export const HIS_PASSWORD = '520520'; // 耀耀的密码（你自己的设备用，写在这里没关系）

export function getRole() {
  return load('role', 'her') === 'him' ? 'him' : 'her';
}

export function setRole(r) {
  save('role', r === 'him' ? 'him' : 'her');
}

export function isHim() {
  return getRole() === 'him';
}

// 当前这台设备的人叫什么
export function myName() {
  return isHim() ? CONFIG.hisName : CONFIG.herName;
}

export function otherName() {
  return isHim() ? CONFIG.herName : CONFIG.hisName;
}

// ntfy 频道名统一在这里拼
const t = CONFIG.ntfyTopic;
export const TOPICS = {
  main: t,
  reply: `${t}-reply`,
  ask: `${t}-ask`,
  screen: `${t}-screen`,
  cam: `${t}-cam`,
  where: `${t}-where`,
  phone: `${t}-phone`,
  miss: `${t}-miss`,
  chat: `${t}-chat`,
  focus: `${t}-focus`,
  tasks: `${t}-tasks`,
};

export const NTFY = CONFIG.ntfyServer.replace(/\/$/, '');

// 往某个频道发一条
export async function post(topic, message, headers = {}) {
  const res = await fetch(`${NTFY}/${topic}`, { method: 'POST', body: message, headers });
  if (!res.ok) throw new Error(`发送失败 ${res.status}`);
  return res;
}

// 拉某个频道最近的消息（since 只能用 s/m/h，不能用 d）
export async function fetchSince(topic, since = '3h') {
  const res = await fetch(`${NTFY}/${topic}/json?poll=1&since=${since}`);
  if (!res.ok) return [];
  return (await res.text()).split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((m) => m && m.event === 'message');
}

// 实时订阅一个频道，返回取消函数
export function subscribe(topic, onMessage) {
  if (!('EventSource' in window)) return () => {};
  const es = new EventSource(`${NTFY}/${topic}/sse`);
  es.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.event === 'message') onMessage(m);
    } catch { /* ignore */ }
  };
  return () => es.close();
}
