// 所有音效都是现场合成的，不需要音频文件
import { load, save } from './store.js';

let ctx = null;
let noiseBuffer = null;

export function isMuted() {
  return load('muted', false);
}

export function setMuted(m) {
  save('muted', m);
}

function audio() {
  if (isMuted()) return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(ac) {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

function env(ac, t, peak, attack, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(ac.destination);
  return g;
}

function tone(ac, { type = 'sine', from, to = from, t = ac.currentTime, dur = 0.2, peak = 0.3, attack = 0.005 }) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  o.connect(env(ac, t, peak, attack, dur));
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function burst(ac, { t = ac.currentTime, dur = 0.08, peak = 0.4, filter = 'lowpass', freq = 1200, q = 0.8 }) {
  const n = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  n.connect(f);
  f.connect(env(ac, t, peak, 0.002, dur));
  n.start(t, Math.random() * 0.5);
  n.stop(t + dur + 0.05);
}

export const sfx = {
  punch() {
    const ac = audio(); if (!ac) return;
    tone(ac, { from: 180, to: 55, dur: 0.16, peak: 0.6 });
    burst(ac, { dur: 0.06, peak: 0.35, freq: 900 });
  },
  slap() {
    const ac = audio(); if (!ac) return;
    burst(ac, { dur: 0.09, peak: 0.6, filter: 'highpass', freq: 1400 });
    tone(ac, { from: 140, to: 70, dur: 0.07, peak: 0.25 });
  },
  squeak() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    tone(ac, { type: 'triangle', from: 950, to: 1500, t, dur: 0.07, peak: 0.25 });
    tone(ac, { type: 'triangle', from: 1500, to: 900, t: t + 0.07, dur: 0.1, peak: 0.25 });
    burst(ac, { dur: 0.04, peak: 0.2, freq: 600 });
  },
  clang() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    burst(ac, { t, dur: 0.05, peak: 0.4, filter: 'bandpass', freq: 3000 });
    [420, 1093, 1780, 2640, 3510].forEach((f, i) => tone(ac, { from: f, to: f * 0.98, t, dur: 0.9 - i * 0.12, peak: 0.16 / (i * 0.6 + 1) }));
    tone(ac, { from: 110, to: 50, t, dur: 0.2, peak: 0.5 });
  },
  kiss() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    burst(ac, { t, dur: 0.05, peak: 0.25, filter: 'bandpass', freq: 2500, q: 2 });
    tone(ac, { from: 500, to: 1300, t: t + 0.03, dur: 0.12, peak: 0.25 });
  },
  whimper() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(560, t + 0.5);
    lfo.frequency.value = 9;
    lfoGain.gain.value = 30;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    o.connect(env(ac, t, 0.12, 0.05, 0.5));
    o.start(t); lfo.start(t);
    o.stop(t + 0.6); lfo.stop(t + 0.6);
  },
  whoosh() {
    const ac = audio(); if (!ac) return;
    burst(ac, { dur: 0.18, peak: 0.12, filter: 'bandpass', freq: 800, q: 0.6 });
  },
  ding() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    [1318.5, 2637, 3951].forEach((f, i) => tone(ac, { from: f, t, dur: 1.2 - i * 0.3, peak: 0.22 / (i + 1) }));
    [1568, 3136].forEach((f, i) => tone(ac, { from: f, t: t + 0.18, dur: 1.1 - i * 0.3, peak: 0.18 / (i + 1) }));
  },
  pop() {
    const ac = audio(); if (!ac) return;
    tone(ac, { from: 600, to: 1100, dur: 0.08, peak: 0.18 });
  },
  tada() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, { type: 'triangle', from: f, t: t + i * 0.09, dur: 0.35, peak: 0.18 }));
  },
};
