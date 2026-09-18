// 耀耀的报备任务列表：他在 portal 里填，晗晗在小窝里看
import { load, save } from './store.js';
import { TOPICS, fetchSince, post } from './roles.js';

function local() {
  const d = load('tasks', null) || {};
  return { items: Array.isArray(d.items) ? d.items : [], updatedAt: d.updatedAt || 0 };
}

export function getTasks() {
  return local();
}

// 耀耀改完任务后广播出去
export async function publishTasks(items) {
  const payload = { items, updatedAt: Date.now() };
  save('tasks', payload);
  await post(TOPICS.tasks, JSON.stringify(payload));
  return payload;
}

// 晗晗那边拉最新的任务列表
export async function syncTasks() {
  try {
    const list = await fetchSince(TOPICS.tasks, '168h');
    const newest = list[list.length - 1];
    if (!newest) return local();
    const parsed = JSON.parse(newest.message);
    if (Array.isArray(parsed.items)) {
      const payload = { items: parsed.items, updatedAt: (newest.time || 0) * 1000 };
      save('tasks', payload);
      return payload;
    }
  } catch { /* 拿不到就用本地的 */ }
  return local();
}

export function newTask(text) {
  return { id: Math.random().toString(36).slice(2, 9), text: text.trim(), done: false };
}
