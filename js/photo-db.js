// 在网页上直接添加的照片，压缩后存在这台设备的 IndexedDB 里
const DB_NAME = 'hanhan-nest';
const STORE = 'photos';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export async function listLocalPhotos() {
  try {
    return (await tx('readonly', (s) => s.getAll())) || [];
  } catch {
    return [];
  }
}

export function putLocalPhoto(photo) {
  return tx('readwrite', (s) => s.put(photo));
}

export function deleteLocalPhoto(id) {
  return tx('readwrite', (s) => s.delete(id));
}

// 缩到最长边 1800px 的 JPEG，省空间
export async function compressImage(file, maxSide = 1800, quality = 0.85) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const source = bitmap || (await loadImg(file));
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  bitmap?.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return { blob, width: canvas.width, height: canvas.height };
}

function loadImg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('这张图片打不开'));
    img.src = URL.createObjectURL(file);
  });
}
