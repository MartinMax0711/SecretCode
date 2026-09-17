export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');
}

export function toast(message, { icon = '💗', duration = 2600 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${esc(message)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// 底部弹出面板。content 是 HTML 字符串；返回 { el, close }
export function openSheet(content, { onClose, className = '' } = {}) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet ${className}" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      <button class="sheet-close" aria-label="关闭">×</button>
      <div class="sheet-body">${content}</div>
    </div>`;
  root.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('show'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      wrap.remove();
      if (!root.children.length) document.body.classList.remove('no-scroll');
    }, 280);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.querySelector('.sheet-backdrop').addEventListener('click', close);
  wrap.querySelector('.sheet-close').addEventListener('click', close);
  return { el: wrap.querySelector('.sheet-body'), close };
}

export function confirmSheet(message, { ok = '确定', cancel = '算了', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const { el, close } = openSheet(`
      <p class="confirm-text">${esc(message)}</p>
      <div class="btn-row">
        <button class="btn btn-ghost" data-act="no">${esc(cancel)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes">${esc(ok)}</button>
      </div>`, { onClose: () => resolve(result) });
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      result = act === 'yes';
      close();
    });
  });
}

// 在点的位置飘一个小东西（爱心、文字等）
export function floatAt(x, y, content, className = 'float-pop') {
  const el = document.createElement('div');
  el.className = className;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.innerHTML = content;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 2000);
  return el;
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}
