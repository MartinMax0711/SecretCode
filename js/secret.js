// 「陪着你」用的暗号：只存在这台设备上，不写进仓库，别人拿不到
import { load, save } from './store.js';
import { openSheet } from './ui.js';
import { CONFIG } from './config.js';

export function getSecret() {
  return load('secret', '') || '';
}

export function setSecret(v) {
  save('secret', v.trim());
}

export function askSecret() {
  return new Promise((resolve) => {
    let done = false;
    const { el, close } = openSheet(`
      <h3 class="sheet-title">🔐 输入我们的暗号</h3>
      <p class="hint">要看${CONFIG.hisName}的屏幕和位置，需要暗号（问${CONFIG.hisName}要）。只要输一次，以后就记住啦。</p>
      <input class="input" id="sec-input" type="text" autocomplete="off" placeholder="暗号" value="${getSecret()}">
      <button class="btn btn-primary btn-block" id="sec-save">好了</button>`, {
      onClose: () => { if (!done) resolve(getSecret()); },
    });
    el.querySelector('#sec-save').addEventListener('click', () => {
      const v = el.querySelector('#sec-input').value.trim();
      if (!v) return;
      setSecret(v);
      done = true;
      close();
      resolve(v);
    });
  });
}
