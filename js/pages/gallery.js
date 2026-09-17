import { CONFIG } from '../config.js';
import { PHOTOS } from '../../data/photos.js';
import { diffDays, fmtFull, toKey, todayKey } from '../dates.js';
import { confirmSheet, esc, toast } from '../ui.js';
import { compressImage, deleteLocalPhoto, listLocalPhotos, putLocalPhoto } from '../photo-db.js';

let root;
let photos = [];
let urls = [];
let alive = false;
let lightbox = null;

export async function loadAllPhotos() {
  const local = await listLocalPhotos();
  const localItems = local.map((p) => {
    const url = URL.createObjectURL(p.blob);
    urls.push(url);
    return { id: p.id, src: url, date: p.date, caption: p.caption || '', local: true, record: p };
  });
  const repoItems = PHOTOS.map((p, i) => ({ id: `repo-${i}`, src: p.src, date: p.date || '', caption: p.caption || '', local: false }));
  return [...repoItems, ...localItems].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function render(container) {
  root = container;
  alive = true;
  root.innerHTML = `<h1 class="page-title">📷 我们的相册</h1><section class="card"><p class="empty">翻相册中…</p></section>`;
  root.addEventListener('click', onClick);
  root.addEventListener('change', onFiles);
  refresh();
}

export function destroy() {
  alive = false;
  closeLightbox();
  root?.removeEventListener('click', onClick);
  root?.removeEventListener('change', onFiles);
  revoke();
}

function revoke() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
}

async function refresh() {
  revoke();
  const list = await loadAllPhotos();
  if (!alive) return;
  photos = list;
  draw();
}

function draw() {
  const dated = photos.filter((p) => p.date);
  const first = dated.length ? dated[dated.length - 1].date : null;

  const groups = new Map();
  for (const p of photos) {
    const label = p.date ? `${p.date.slice(0, 4)}年${Number(p.date.slice(5, 7))}月` : '不知道哪天';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(p);
  }

  const sections = [...groups.entries()].map(([label, items]) => `
    <div class="photo-group">
      <h2 class="group-title">${label}<small>${items.length} 张</small></h2>
      <div class="masonry">
        ${items.map((p) => `
          <button class="photo-tile" data-photo="${esc(p.id)}">
            <img src="${esc(p.src)}" alt="${esc(p.caption || '照片')}" loading="lazy">
            ${p.caption ? `<span class="photo-cap">${esc(p.caption)}</span>` : ''}
            ${p.local ? '<span class="photo-local" title="只存在这台设备上">📱</span>' : ''}
          </button>`).join('')}
      </div>
    </div>`).join('');

  root.innerHTML = `
    <h1 class="page-title">📷 我们的相册</h1>
    <section class="card gallery-head">
      <div class="stats-row inline">
        <div class="stat"><div class="stat-num">${photos.length}<small>张</small></div><div class="stat-label">合照</div></div>
        ${first ? `<div class="stat"><div class="stat-num">${diffDays(first, todayKey())}<small>天</small></div><div class="stat-label">第一张到现在</div></div>` : ''}
      </div>
      <label class="btn btn-primary file-btn">＋ 添加照片<input type="file" accept="image/*" multiple hidden id="photo-input"></label>
      <p class="hint">在这里添加的照片只存在这台设备上（带 📱 标记）。想让照片一直都在、换手机也在，就发给${esc(CONFIG.hisName)}放进网站里。</p>
    </section>
    ${photos.length ? sections : `
      <section class="card empty-card">
        <div class="empty-emoji">🖼️💕</div>
        <p>相册还是空的～</p>
        <p class="hint">点上面「添加照片」放第一张合照吧</p>
      </section>`}`;
}

async function onFiles(e) {
  if (e.target.id !== 'photo-input') return;
  const files = [...e.target.files];
  if (!files.length) return;
  toast(`正在放进相册（${files.length} 张）…`, { icon: '📷' });
  let ok = 0;
  for (const file of files) {
    try {
      const { blob, width, height } = await compressImage(file);
      const date = toKey(new Date(file.lastModified || Date.now()));
      await putLocalPhoto({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, blob, width, height, date, caption: '', addedAt: Date.now() });
      ok++;
    } catch {
      /* 跳过打不开的图片 */
    }
  }
  if (ok < files.length) toast(`有 ${files.length - ok} 张没放进去（格式不支持）`, { icon: '⚠️' });
  else toast(`放好啦，一共 ${ok} 张`, { icon: '💗' });
  if (alive) refresh();
}

function onClick(e) {
  const tile = e.target.closest('[data-photo]');
  if (!tile) return;
  const idx = photos.findIndex((p) => p.id === tile.dataset.photo);
  if (idx >= 0) openLightbox(idx);
}

function openLightbox(index) {
  closeLightbox();
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `
    <button class="lb-close" aria-label="关闭">×</button>
    <button class="lb-nav lb-prev" aria-label="上一张">‹</button>
    <button class="lb-nav lb-next" aria-label="下一张">›</button>
    <figure class="lb-figure"><img alt=""><figcaption></figcaption></figure>`;
  document.body.appendChild(el);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => el.classList.add('show'));

  let i = index;
  const show = () => {
    const p = photos[i];
    el.querySelector('img').src = p.src;
    el.querySelector('img').alt = p.caption || '照片';
    el.querySelector('figcaption').innerHTML = `
      ${p.local ? `<input class="lb-caption" value="${esc(p.caption)}" placeholder="写一句话…" maxlength="60">` : (p.caption ? `<div class="lb-text">${esc(p.caption)}</div>` : '')}
      <div class="lb-meta">
        ${p.local ? `<input type="date" class="lb-date" value="${esc(p.date)}" max="${todayKey()}">` : `<span>${p.date ? fmtFull(p.date) : ''}</span>`}
        <span>${i + 1} / ${photos.length}</span>
        ${p.local ? '<button class="lb-delete">删除</button>' : ''}
      </div>`;
  };
  const go = (d) => { i = (i + d + photos.length) % photos.length; show(); };

  el.addEventListener('click', async (ev) => {
    if (ev.target === el || ev.target.closest('.lb-close')) closeLightbox();
    else if (ev.target.closest('.lb-prev')) go(-1);
    else if (ev.target.closest('.lb-next')) go(1);
    else if (ev.target.closest('.lb-delete')) {
      if (await confirmSheet('确定要删掉这张照片吗？', { ok: '删除', danger: true })) {
        await deleteLocalPhoto(photos[i].id);
        closeLightbox();
        refresh();
      }
    }
  });
  el.addEventListener('change', async (ev) => {
    const p = photos[i];
    if (!p.local) return;
    if (ev.target.classList.contains('lb-caption')) p.record.caption = ev.target.value.trim();
    else if (ev.target.classList.contains('lb-date') && ev.target.value) p.record.date = ev.target.value;
    else return;
    await putLocalPhoto(p.record);
    p.caption = p.record.caption || '';
    p.date = p.record.date;
    lightbox.dirty = true;
  });

  let startX = null;
  el.addEventListener('touchstart', (ev) => { startX = ev.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (ev) => {
    if (startX == null) return;
    const dx = ev.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    startX = null;
  });
  const onKey = (ev) => {
    if (ev.target.tagName === 'INPUT') return;
    if (ev.key === 'Escape') closeLightbox();
    if (ev.key === 'ArrowLeft') go(-1);
    if (ev.key === 'ArrowRight') go(1);
  };
  document.addEventListener('keydown', onKey);

  lightbox = { el, onKey, dirty: false };
  show();
}

function closeLightbox() {
  if (!lightbox) return;
  const { el, onKey, dirty } = lightbox;
  lightbox = null;
  document.removeEventListener('keydown', onKey);
  el.classList.remove('show');
  document.body.classList.remove('no-scroll');
  setTimeout(() => el.remove(), 250);
  if (dirty && alive) draw();
}
