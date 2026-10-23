import { n as e, t } from "./fx-DtaHJ05i.js";
import { D as n, E as r, H as i, I as a, L as o, O as s, Pt as c, T as l, X as u, _t as d, a as f, b as p, c as m, ht as h, i as g, j as _, lt as v, n as ee, o as y, q as b, r as te, s as ne, st as x, t as S, ut as re, v as C, w, wt as ie, x as ae, yt as T } from "./world-BJq13QzJ.js";
import { c as oe, i as se, l as ce, n as le, o as ue, r as de, s as fe, t as pe, u as me } from "./sim-9N4wEPLA.js";
var he = (e2, t2 = -1, n2 = 1) => Math.max(t2, Math.min(n2, e2)), ge = (e2) => Math.abs(e2) < 0.16 ? 0 : Math.sign(e2) * (Math.min(1, Math.abs(e2)) - 0.16) / 0.84, _e = class {
  constructor() {
    this.contacts = /* @__PURE__ */ new Map(), this.grounded = true, this.nitroEdges = [], this.nitroHeld = false;
  }
  setGrounded(e2) {
    if (e2 === this.grounded) return false;
    this.grounded = e2;
    for (let t2 of this.contacts.values()) t2.baseY = t2.y, t2.zone !== `left` && (t2.baseX = t2.x, t2.airLift = !e2 && t2.lift, t2.lift = false);
    return true;
  }
  down(e2, t2, n2, r2, i2 = 26) {
    return this.contacts.has(e2) || [...this.contacts.values()].some((e3) => e3.zone === t2) ? false : (this.contacts.set(e2, { zone: t2, x: n2, y: r2, baseX: n2, baseY: r2, range: i2, lift: false, airLift: !this.grounded }), t2 === `nitro` && this.nitroEdges.push(true), true);
  }
  move(e2, t2, n2) {
    let r2 = this.contacts.get(e2);
    if (!r2) return false;
    if (r2.x = t2, r2.y = n2, r2.zone !== `left`) {
      let e3 = (n2 - r2.baseY) / r2.range;
      this.grounded ? r2.lift = e3 < -(r2.lift ? 0.35 : 0.55) : e3 < -0.55 ? r2.airLift = true : e3 > 0.55 && (r2.airLift = false);
    }
    return true;
  }
  up(e2) {
    let t2 = this.contacts.get(e2);
    return t2 ? (this.contacts.delete(e2), t2.zone === `nitro` && this.nitroEdges.push(false), true) : false;
  }
  cancel(e2) {
    let t2 = this.contacts.get(e2);
    return t2 ? (this.contacts.delete(e2), t2.zone === `nitro` && (this.nitroEdges.length = 0, this.nitroHeld = false), true) : false;
  }
  clear() {
    this.contacts.clear(), this.nitroEdges.length = 0, this.nitroHeld = false;
  }
  sample({ consume: e2 = true } = {}) {
    e2 && this.nitroEdges.length && (this.nitroHeld = this.nitroEdges.shift());
    let t2 = [...this.contacts.values()], n2 = t2.find((e3) => e3.zone === `left`), r2 = t2.find((e3) => e3.zone === `right`) || t2.find((e3) => e3.zone === `nitro`), i2 = (e3) => e3 ? ge((e3.x - e3.baseX) / e3.range) : 0, a2 = (e3) => e3 ? ge((e3.y - e3.baseY) / e3.range) : 0, o2 = i2(n2), s2 = a2(n2), c2 = i2(r2), l2 = this.grounded && s2 > 0.45;
    return { throttle: r2 && !l2 ? 1 : 0, brake: +!!l2, steer: this.grounded ? o2 : 0, thrust: !!r2 && !l2 && (this.grounded ? r2.lift : r2.airLift), spin: this.grounded ? 0 : o2, flip: this.grounded || !s2 ? 0 : -s2, roll: this.grounded ? 0 : c2, nitro: e2 ? this.nitroHeld : t2.some((e3) => e3.zone === `nitro`), left: !!n2, right: !!r2, lx: he(o2), ly: he(s2), rx: he(c2), ry: r2 ? he((r2.y - r2.baseY) / r2.range) : 0 };
  }
};
function ve(e2, { grounded: t2 = () => true, onStart: n2 = () => {
}, onLearned: r2 = () => {
} } = {}) {
  let i2 = new _e(), a2 = new AbortController(), o2 = a2.signal, s2 = e2.querySelector(`[data-thumb="left"]`), c2 = e2.querySelector(`[data-thumb="right"]`), l2 = e2.querySelector(`[data-thumb="nitro"]`), u2 = false, d2 = ``, f2 = false;
  function p2() {
    let t3 = i2.sample({ consume: false }), n3 = JSON.stringify([t3, i2.grounded]);
    if (n3 === d2) return;
    d2 = n3;
    for (let [e3, n4, r3, i3] of [[s2, t3.left, t3.lx, t3.ly], [c2, t3.right, t3.rx, t3.ry]]) e3.classList.toggle(`held`, n4), e3.setAttribute(`aria-pressed`, String(n4)), e3.style.setProperty(`--thumb-x`, `${r3 * 22}px`), e3.style.setProperty(`--thumb-y`, `${i3 * 22}px`);
    s2.classList.toggle(`braking`, !!t3.brake), c2.classList.toggle(`lifting`, t3.thrust), l2.classList.toggle(`held`, t3.nitro), l2.setAttribute(`aria-pressed`, String(t3.nitro));
    let a3 = !i2.grounded;
    s2.setAttribute(`aria-label`, a3 ? `Spin and flip. Drag horizontally to spin, vertically to flip.` : `Steer and brake. Drag sideways to steer, pull down to brake.`), c2.setAttribute(`aria-label`, a3 ? `Lift and roll. Hold to lift, drag sideways to roll, release to land.` : `Drive and lift. Hold to drive, push up to lift.`), e2.querySelector(`.thumb-feedback.left`).textContent = a3 ? `SPIN \xB7 FLIP` : t3.brake ? `BRAKE` : `STEER`, e2.querySelector(`.thumb-feedback.right`).textContent = t3.nitro ? `NITRO` : t3.thrust ? `LIFT` : a3 ? `COAST` : `DRIVE`, !u2 && t3.left && t3.right && (u2 = true, r2());
  }
  function m2() {
    i2.setGrounded(t2()) && p2();
  }
  for (let e3 of [s2, c2, l2]) {
    e3.addEventListener(`pointerdown`, (t3) => {
      if (t3.button !== 0 || f2) return;
      t3.preventDefault(), m2();
      let r3 = 26 * c2.getBoundingClientRect().width / 112;
      i2.down(t3.pointerId, e3.dataset.thumb, t3.clientX, t3.clientY, r3) && (e3.setPointerCapture(t3.pointerId), n2(), p2());
    }, { signal: o2 }), e3.addEventListener(`pointermove`, (e4) => {
      m2(), i2.move(e4.pointerId, e4.clientX, e4.clientY) && (e4.preventDefault(), p2());
    }, { signal: o2 }), e3.addEventListener(`pointerup`, (e4) => {
      i2.up(e4.pointerId) && p2();
    }, { signal: o2 });
    for (let t3 of [`pointercancel`, `lostpointercapture`]) e3.addEventListener(t3, (e4) => {
      i2.cancel(e4.pointerId) && p2();
    }, { signal: o2 });
  }
  for (let t3 of [`contextmenu`, `selectstart`, `dragstart`]) e2.addEventListener(t3, (e3) => e3.preventDefault(), { signal: o2 });
  return p2(), { sample() {
    return m2(), i2.sample();
  }, sync: m2, clear() {
    i2.clear(), p2();
  }, dispose() {
    i2.clear(), f2 = true, a2.abort();
  } };
}
var ye = class {
  constructor(e2 = true) {
    this.enabled = e2, this.ctx = null, this.beat = 0, this.note = 0, this.wasBoost = false, this.slow = 0;
  }
  start() {
    if (!this.ctx) {
      let e2 = window.AudioContext || window.webkitAudioContext;
      if (!e2) return;
      this.ctx = new e2();
      let t2 = this.ctx;
      this.master = t2.createGain(), this.master.gain.value = this.enabled ? 0.4 : 0, this.muffle = t2.createBiquadFilter(), this.muffle.type = `lowpass`, this.muffle.frequency.value = 18e3, this.muffle.Q.value = 0.6, this.master.connect(this.muffle).connect(t2.destination), this.engine = t2.createOscillator(), this.engine.type = `sine`, this.engineGain = t2.createGain(), this.engineGain.gain.value = 0;
      let n2 = t2.createBiquadFilter();
      n2.type = `lowpass`, n2.frequency.value = 1800, this.engine.connect(n2).connect(this.engineGain).connect(this.master), this.engine.start();
      let r2 = t2.createBuffer(1, t2.sampleRate * 2, t2.sampleRate), i2 = r2.getChannelData(0), a2 = 0;
      for (let e3 = 0; e3 < i2.length; e3++) a2 = (a2 + (Math.random() * 2 - 1) * 0.07) / 1.02, i2[e3] = a2 * 3;
      this.wind = t2.createBufferSource(), this.wind.buffer = r2, this.wind.loop = true, this.windGain = t2.createGain(), this.windGain.gain.value = 0;
      let o2 = t2.createBiquadFilter();
      o2.type = `highpass`, o2.frequency.value = 1200, this.wind.connect(o2).connect(this.windGain).connect(this.master), this.wind.start();
      let s2 = t2.createBuffer(1, t2.sampleRate * 2, t2.sampleRate), c2 = s2.getChannelData(0);
      for (let e3 = 0; e3 < c2.length; e3++) c2[e3] = Math.random() * 2 - 1;
      this.noiseBuffer = s2, this.gas = t2.createBufferSource(), this.gas.buffer = s2, this.gas.loop = true, this.gasBand = t2.createBiquadFilter(), this.gasBand.type = `bandpass`, this.gasBand.frequency.value = 2200, this.gasBand.Q.value = 0.55, this.gasGain = t2.createGain(), this.gasGain.gain.value = 0, this.gas.connect(this.gasBand).connect(this.gasGain).connect(this.master), this.gas.start(), this.fan = t2.createOscillator(), this.fan.type = `sine`, this.fan.frequency.value = 92, this.fanGain = t2.createGain(), this.fanGain.gain.value = 0, this.fan.connect(this.fanGain).connect(this.master), this.fan.start();
    }
    this.ctx.resume();
  }
  toggle(e2) {
    this.enabled = e2, this.ctx && this.master.gain.setTargetAtTime(e2 ? 0.4 : 0, this.ctx.currentTime, 0.1);
  }
  tone(e2, t2 = 0.15, n2 = 0.1, r2 = `sine`, i2 = 0) {
    if (!this.ctx || !this.enabled) return;
    let a2 = this.ctx, o2 = a2.currentTime + i2, s2 = a2.createOscillator(), c2 = a2.createGain();
    s2.type = r2, s2.frequency.setValueAtTime(e2, o2), c2.gain.setValueAtTime(0, o2), c2.gain.linearRampToValueAtTime(n2, o2 + 0.012), c2.gain.exponentialRampToValueAtTime(1e-3, o2 + t2), s2.connect(c2).connect(this.master), s2.start(o2), s2.stop(o2 + t2 + 0.02);
  }
  thump(e2, t2, n2 = 0.3, r2 = 0.2, i2 = 0) {
    if (!this.ctx || !this.enabled) return;
    let a2 = this.ctx, o2 = a2.currentTime + i2, s2 = a2.createOscillator(), c2 = a2.createGain();
    s2.type = `sine`, s2.frequency.setValueAtTime(e2, o2), s2.frequency.exponentialRampToValueAtTime(t2, o2 + n2 * 0.8), c2.gain.setValueAtTime(0, o2), c2.gain.linearRampToValueAtTime(r2, o2 + 6e-3), c2.gain.exponentialRampToValueAtTime(1e-3, o2 + n2), s2.connect(c2).connect(this.master), s2.start(o2), s2.stop(o2 + n2 + 0.02);
  }
  sweep(e2, t2, n2 = 0.4, r2 = 0.15, i2 = `bandpass`, a2 = 1.2, o2 = 0, s2 = 0.015) {
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    let c2 = this.ctx, l2 = c2.currentTime + o2, u2 = c2.createBufferSource(), d2 = c2.createBiquadFilter(), f2 = c2.createGain();
    u2.buffer = this.noiseBuffer, d2.type = i2, d2.Q.value = a2, d2.frequency.setValueAtTime(e2, l2), d2.frequency.exponentialRampToValueAtTime(t2, l2 + n2), f2.gain.setValueAtTime(0, l2), f2.gain.linearRampToValueAtTime(r2, l2 + s2), f2.gain.exponentialRampToValueAtTime(1e-3, l2 + n2), u2.connect(d2).connect(f2).connect(this.master), u2.start(l2, Math.random() * 1.5), u2.stop(l2 + n2 + 0.05);
  }
  cue(e2, t2 = 1) {
    e2 === `slow` && (this.thump(70, 32, 1.1, 0.22 * t2), this.sweep(3200, 260, 0.9, 0.11 * t2, `bandpass`, 0.9));
  }
  update(e2, t2, n2 = 0) {
    if (!this.ctx) return;
    let r2 = this.ctx.currentTime, i2 = t2.phase === `running`, a2 = 1 - n2 * 0.42;
    this.muffle.frequency.setTargetAtTime(18e3 * (650 / 18e3) ** n2, r2, 0.04), this.slow > 0.55 && n2 <= 0.55 && i2 && this.sweep(380, 2600, 0.42, 0.1, `bandpass`, 0.8, 0, 0.2), this.slow = n2, this.engine.frequency.setTargetAtTime((120 + t2.v * 8.5 + (t2.boosting ? 90 : 0)) * a2, r2, 0.08), this.engineGain.gain.setTargetAtTime(i2 ? 0.012 + t2.v * 25e-5 : 0, r2, 0.08), this.windGain.gain.setTargetAtTime(i2 ? t2.v * 85e-5 * (1 - n2 * 0.55) : 0, r2, 0.1), this.gasGain.gain.setTargetAtTime(i2 && t2.boosting ? 0.25 : 0, r2, t2.boosting ? 0.018 : 0.13), this.gasBand.frequency.setTargetAtTime((2100 + t2.v * 11) * a2, r2, 0.05), this.fan.frequency.setTargetAtTime((92 + t2.v * 0.9 + (t2.boosting ? 46 : 0)) * a2, r2, 0.18), this.fanGain.gain.setTargetAtTime(i2 ? t2.boosting ? 0.025 : 7e-3 : 0, r2, 0.12);
    let o2 = i2 && t2.boosting && !this.wasBoost;
    if (this.wasBoost = i2 && t2.boosting, o2 && (this.thump(110 * a2, 46, 0.32, 0.24), this.sweep(4200, 900, 0.3, 0.2, `bandpass`, 0.7, 0, 4e-3)), this.beat += e2, i2 && this.beat > 0.62) {
      this.beat = 0;
      let e3 = t2.levelIndex ? [110, 164.81, 220, 246.94, 329.63, 220, 164.81, 146.83] : [130.81, 196, 261.63, 293.66, 392, 293.66, 196, 164.81];
      this.tone(e3[this.note++ % e3.length] * a2, 0.65, 0.01, `sine`), this.note % 4 == 0 && this.tone(55 * a2, 0.1, 0.035, `sine`);
    }
    for (let e3 of t2.events) {
      if ((e3.type === `cell` || e3.type === `checkpoint`) && (this.tone(523, 0.18, 0.1), this.tone(784, 0.3, 0.08, `sine`, 0.09)), e3.type === `launch` && (this.sweep(520, 2900, 0.5, 0.16, `bandpass`, 0.9, 0, 0.06), this.thump(80, 40, 0.35, 0.18)), e3.type === `land`) {
        let t3 = e3.strength ?? 0.4;
        this.tone(e3.clean ? 180 : 70, 0.19, 0.12, `triangle`), this.thump(92, 30, 0.42, 0.22 + 0.2 * t3), this.sweep(1100, 180, 0.28, 0.12 + 0.18 * t3, `lowpass`, 0.7, 0, 4e-3);
      }
      if (e3.type === `landingFlare` && this.sweep(2600, 700, 0.32, 0.18, `bandpass`, 0.8, 0, 0.01), e3.type === `roll` && this.sweep(900, 2400, 0.35, 0.09, `bandpass`, 1.4, 0, 0.05), e3.type === `trick`) {
        let t3 = Math.min(e3.turns || 1, 4);
        e3.kind === `spin` ? (this.sweep(700, 2800, 0.3, 0.08, `bandpass`, 1.6, 0, 0.03), this.tone(587 * 1.122 ** (t3 - 1), 0.16, 0.05, `triangle`)) : (this.sweep(380, 1900, 0.38, 0.1, `bandpass`, 1.1, 0, 0.04), this.tone(440 * 1.122 ** (t3 - 1), 0.2, 0.055, `triangle`));
      }
      if (e3.type === `combo`) for (let t3 = 0; t3 < Math.min(4, e3.count + 1); t3++) this.tone([523, 659, 784, 1047][t3], 0.28, 0.06, `triangle`, t3 * 0.07);
      if (e3.type === `lineup`) {
        this.sweep(300, 2200, 0.5, e3.big ? 0.12 : 0.08, `bandpass`, 0.9, 0, 0.05);
        let t3 = Math.min(6, e3.count || 1);
        for (let e4 = 0; e4 < t3; e4++) this.tone(392 * 1.1225 ** (e4 * 2), 0.12, 0.045, `sine`, 0.04 + e4 * 0.05);
        this.tone(784, 0.45, 0.06, `triangle`, 0.06 + t3 * 0.05);
      }
      if (e3.type === `hop` && (this.sweep(1200, 3400, 0.24, 0.07, `bandpass`, 1.3, 0, 0.02), this.tone(880, 0.12, 0.045, `triangle`)), e3.type === `trailer` && (this.thump(150, 60, 0.3, 0.18), this.tone(233, 0.22, 0.05, `triangle`)), e3.type === `closePass` && this.sweep(2600, 500, 0.38, 0.08, `bandpass`, 1.2, 0, 0.02), e3.type === `nitro`) {
        let t3 = e3.level;
        this.sweep(260 * t3, 1800 + 900 * t3, 0.45 + 0.1 * t3, 0.08 + 0.04 * t3, `bandpass`, 0.9, 0, 0.03), t3 > 1 && this.tone([0, 0, 880, 1175][t3], 0.22, 0.05, `triangle`), t3 === 3 && this.thump(60, 26, 0.6, 0.3);
      }
      if (e3.type === `scrape` && this.sweep(4200, 1500, 0.35, 0.07, `bandpass`, 2.2, 0, 4e-3), e3.type === `overheat` && this.tone(120, 0.4, 0.09, `square`), (e3.type === `recover` || e3.type === `impact`) && (this.tone(55, 0.3, 0.1, `sawtooth`), this.thump(70, 28, 0.45, 0.24)), e3.type === `finish`) for (let e4 = 0; e4 < 5; e4++) this.tone([262, 330, 392, 523, 784][e4], 0.6, 0.1, `triangle`, e4 * 0.12);
    }
  }
}, E = (e2) => `${String(Math.floor(e2 / 60)).padStart(2, `0`)}:${(e2 % 60).toFixed(2).padStart(5, `0`)}`, D = (e2) => `<svg viewBox="0 0 24 24" aria-hidden="true">${e2}</svg>`, O = { pause: D(`<path d="M9 6v12M15 6v12"/>`), back: D(`<path d="M15 5l-7 7 7 7"/>`), chevron: D(`<path d="M9.5 6l6 6-6 6"/>`), leap: D(`<path d="M3 18h5M16 18h5M7 15c2-7 8-7 10 0"/><path d="M14 9l3 6 3-4"/>`), finish: D(`<path d="M6 21V4M6 4h12l-3 4 3 4H6"/>`), relay: D(`<path d="M5 20V6M19 20V6M5 6h14M5 11h14"/>`), lock: D(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`), map: D(`<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>`), sliders: D(`<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>`), car: D(`<path d="M3.5 16.5v-3l2.2-4.2c.4-.8 1.2-1.3 2.1-1.3h8.4c.9 0 1.7.5 2.1 1.3l2.2 4.2v3"/><path d="M2.5 16.5h19"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>`), speaker: D(`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`), mute: D(`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>`), play: D(`<path d="M8 5.5v13l11-6.5z"/>`), restart: D(`<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v4h4"/>`), toRelay: D(`<path d="M6 21V5M6 5h10l-2.5 3.5L16 12H6"/><path d="M20 19h-8M15 16l-3 3 3 3"/>`), exit: D(`<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>`), alert: D(`<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.2"/>`), trophy: D(`<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>`), go: D(`<path d="M5 12h13M13 6l6 6-6 6"/>`), nitro: D(`<path d="M13 3L6 13h5l-1 8 7-10h-5z"/>`), spinRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.9 10.6A8.5 3.6 0 1 1 9.1 10.6"/><path d="M8.4 8.9l2.8 1.6-2.4 2"/></svg>`, spinLeft: `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="matrix(-1 0 0 1 24 0)"><path d="M14.9 10.6A8.5 3.6 0 1 1 9.1 10.6"/><path d="M8.4 8.9l2.8 1.6-2.4 2"/></g></svg>`, flipFront: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5.9A5.2 8 0 1 1 9 5.9"/><path d="M7.4 4.7l3.7-.9-.8 3.7"/></svg>`, flipBack: `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="matrix(-1 0 0 1 24 0)"><path d="M15 5.9A5.2 8 0 1 1 9 5.9"/><path d="M7.4 4.7l3.7-.9-.8 3.7"/></g></svg>` }, be = [[`road`, `Road`], [`air`, `Air`], [`drift`, `Drift`], [`suction`, `Suction`], [`cooling`, `Cooling`]], xe = 24, Se = (e2) => (e2 / 1e3).toFixed(1), Ce = (e2) => {
  let t2 = String(e2 || ``).toLowerCase();
  return t2.charAt(0).toUpperCase() + t2.slice(1);
}, we = (e2) => e2 ? e2[0].toUpperCase() + e2.slice(1) : ``, Te = (e2) => Math.round(21 + e2 * 0.79), Ee = /HARD|IMPACT|MISS|BARRIER|VENT|RETURN|RECOVER|REQUIRED|OVERHEAT/, De = { sunbreak: `./assets/route-coast.jpg`, redline: `./assets/route-canyon.jpg`, halo: `./assets/route-halo.jpg` }, Oe = () => `<span class="batt"><i></i></span>`, ke = (e2) => e2.map((e3) => `<kbd${e3.length > 1 ? ` class="wide"` : ``}>${e3}</kbd>`).join(``), Ae = [[[`W`], `Drive`], [[`A`, `D`], `Steer`], [[`Shift`], `Nitro`], [[`Space`], `Lift`], [[`S`], `Brake \xB7 drift`]], je = [[[`A`, `D`], `Spin`], [[`W`, `S`], `Flip`], [[`Q`, `E`], `Roll`], [[`Space`], `Lift`]], Me = class {
  constructor(e2, t2, n2) {
    this.root = e2, this.actions = t2, this.career = n2, this.screen = `home`, this.selected = 0, this.focus = null, this.menuShift = 0, this.touch = false, this.refreshTouchMode(), this.tele = { run: null, pts: [], air: 0, maxH: 0, lastT: 0 }, this.root.addEventListener(`click`, (e3) => {
      let t3 = e3.target.closest(`[data-action]`);
      if (!(!t3 || t3.disabled)) {
        if (t3.dataset.action === `select-route`) {
          this.selected = +t3.dataset.value, this.set(`routes`);
          return;
        }
        t3.dataset.focus && (this.focus = t3.dataset.focus), this.actions(t3.dataset.action, t3.dataset.value);
      }
    }), addEventListener(`resize`, () => {
      this.measured = null, this.refreshTouchMode();
    }), matchMedia(`(any-pointer:coarse)`).addEventListener(`change`, () => this.refreshTouchMode());
  }
  refreshTouchMode() {
    let e2 = this.career.settings.controls;
    this.touch = e2 === `touch` || e2 !== `keys` && (matchMedia(`(any-pointer:coarse)`).matches || navigator.maxTouchPoints > 0 || innerWidth < 700 || innerWidth < 1e3 && innerHeight < 500), this.root.classList.toggle(`touch-mode`, this.touch);
  }
  hideTouchHelp() {
    this.root.querySelector(`.thumb-help`)?.remove();
  }
  viewOffset() {
    if (this.screen === `play` && this.touch && innerWidth < 700 && innerHeight < 600) return { x: 0, y: -Math.round(Math.min(54, innerHeight * 0.12)) };
    if (this.screen !== `home`) return { x: 0, y: 0 };
    if (!this.measured) {
      let e2 = this.root.querySelector(`.app-panel`)?.getBoundingClientRect(), t2 = innerWidth >= 900 || innerWidth >= 700 && innerHeight <= 520;
      this.measured = { app: e2 && t2 ? e2.width : 0, dock: e2?.height || 0 };
    }
    return this.measured.app ? { x: -Math.round(this.measured.app / 2), y: 0 } : { x: 0, y: -Math.round(this.measured.dock / 2) };
  }
  set(e2, t2) {
    this.root.classList.remove(`photo-mode`);
    let n2 = this.root.querySelector(`.display-settings`)?.open;
    this.screen = e2, this.refreshTouchMode(), this.measured = null, this.lastRelay = -1, this.lastCharge = -1, this.lastToast = ``, this.lastCount = ``, this.lastMeter = ``, this.lastHint = null, this.lastAlert = ``, this.navKey = ``, this.keysMode = null, this.lastMode = null, this.lastSeg = -1, this.lastDelta = ``, this.lastTemp = ``, t2 && (this.run = t2), e2 === `home` && (this.root.innerHTML = this.home()), e2 === `routes` && (this.root.innerHTML = this.routes()), e2 === `play` && this.play(t2), e2 === `pause` && (this.root.innerHTML = this.pause(t2)), e2 === `pause` && n2 && (this.root.querySelector(`.display-settings`).open = true), e2 === `results` && (this.root.innerHTML = this.results(t2)), e2 === `routes` && this.focus === `tuning` && this.root.querySelector(`#tuning`)?.scrollIntoView({ block: `start` }), this.focus = null;
  }
  home() {
    let e2 = this.career, t2 = C.reduce((e3, t3) => e3 + t3.length, 0), n2 = e2.resume, r2 = 100 + e2.upgrades.reservoir * 20, i2 = C.map((t3) => e2.results[t3.id] && `${t3.name} \xB7 ${we(e2.results[t3.id].medal)} \xB7 ${E(e2.results[t3.id].time)}`).filter(Boolean);
    return `<div class="app">
   <span class="wordmark">Roadster Hours</span>
   <section class="app-panel">
    <header class="app-head"><div><h1>Roadster</h1><p class="state"><i class="dot"></i>${n2 ? `Stopped at relay ${n2.checkpoint + 1} \xB7 ${C[n2.level].name}` : `Ready \xB7 Sunbreak Coast`}</p></div><div class="range">${Oe()}<b>${r2}%</b></div></header>
    <div class="quick">
     <button data-action="routes"><i>${O.map}</i><span>Routes</span></button>
     <button data-action="routes" data-focus="tuning"><i>${O.sliders}</i><span>Tuning</span></button>
     <a href="./model-review.html"><i>${O.car}</i><span>Studio</span></a>
     <button data-action="sound" aria-label="Sound ${e2.settings.sound ? `On` : `Off`}"><i>${e2.settings.sound ? O.speaker : O.mute}</i><span>Sound</span></button>
    </div>
    <div class="cta">${n2 ? `<button class="btn primary" data-action="resume">Continue from relay</button><button class="btn" data-action="start" data-value="0">Drive Sunbreak Coast</button>` : `<button class="btn primary" data-action="start" data-value="0">Drive Sunbreak Coast</button>`}</div>
    <nav class="rows">
     <button class="row" data-action="routes"><i>${O.map}</i><span><b>Routes &amp; tuning</b><small>${C.length} routes \xB7 ${Se(t2)} km of road and air</small></span>${O.chevron}</button>
     <button class="row" data-action="routes"><i>${O.trophy}</i><span><b>Records</b><small>${i2.length ? i2.join(`<br>`) : `No routes completed yet`}</small></span>${O.chevron}</button>
     <button class="row" data-action="routes" data-focus="tuning"><i>${O.sliders}</i><span><b>Upgrades</b><small>${e2.credits} credit${e2.credits === 1 ? `` : `s`} available</small></span>${O.chevron}</button>
     <a class="row" href="./model-review.html"><i>${O.car}</i><span><b>Vehicle studio</b><small>Rocket package \xB7 exterior</small></span>${O.chevron}</a>
    </nav>
    <p class="legal">An original game inspired by the 2026 Roadster reveal. Not affiliated with Tesla.</p>
   </section></div>`;
  }
  routes() {
    let e2 = this.career;
    this.selected > e2.unlocked && !C[this.selected].alwaysOpen && (this.selected = 0);
    let t2 = C[this.selected], n2 = (e3) => (e3.lineups || []).length, r2 = C.map((t3, r3) => {
      let i3 = e2.results[t3.id], a3 = r3 > e2.unlocked && !t3.alwaysOpen;
      return `<div class="rrow${r3 === this.selected ? ` selected` : ``}${a3 ? ` locked` : ``}">
    <button class="rrow-main" data-action="select-route" data-value="${r3}" aria-pressed="${r3 === this.selected}"><span class="idx">0${r3 + 1}</span><span><b>${t3.name}</b><small>${Se(t3.length)} km \xB7 ${t3.gates.length} relays \xB7 ${n2(t3) + ` jump lines`}</small><small class="rec">${i3 ? `<em class="medal-dot ${i3.medal}"></em>${we(i3.medal)} \xB7 ${E(i3.time)}` : a3 ? `${O.lock} Finish ${C[r3 - 1].name} to unlock` : `No time set`}</small></span></button>
    <button class="go" data-action="start" data-value="${r3}" aria-label="Drive this route" ${a3 ? `disabled` : ``}>${O.go}</button></div>`;
    }).join(``), i2 = le.map((t3) => {
      let n3 = e2.upgrades[t3.id], r3 = n3 === t3.max, i3 = t3.cost[n3];
      return `<div class="upgrade"><div><b>${t3.name}</b><small>${t3.desc}</small><span class="pips" aria-label="Level ${n3} of ${t3.max}">${Array.from({ length: t3.max }, (e3, t4) => `<i class="${t4 < n3 ? `on` : ``}"></i>`).join(``)}</span></div><button class="btn small" data-action="upgrade" data-value="${t3.id}" ${r3 || e2.credits < i3 ? `disabled` : ``}>${r3 ? `Maxed` : i3 + ` credits`}</button></div>`;
    }).join(``), a2 = [[Se(t2.length), `km`, `Length`], [t2.gates.length, ``, `Relays`], [t2.gaps.length, ``, `Leaps`], [n2(t2), ``, `Jump lines`], [E(t2.medal.gold).slice(0, 5), ``, `Gold`]];
    return `<div class="routes"><img class="routes-art" src="${De[t2.id] || De.sunbreak}" alt=""><div class="routes-shade"></div>
   <aside class="routes-list"><header><button class="icon-btn" data-action="home" aria-label="Back">${O.back}</button><span>Routes &amp; tuning</span></header>
    <div class="rrows">${r2}</div>
    <section class="tuning" id="tuning"><div class="sec-head"><b>Upgrades</b><span>${e2.credits} credit${e2.credits === 1 ? `` : `s`} available</span></div>${i2}<p class="fine">Earn credits from route clears, medals and data cells.</p></section>
   </aside>
   <section class="routes-hero"><p class="count">0${this.selected + 1} / 0${C.length}</p><h2>${t2.name}</h2><p class="sub">${t2.subtitle}</p>
    <dl>${a2.map(([e3, t3, n3]) => `<div><dt>${e3}${t3 ? `<small>${t3}</small>` : ``}</dt><dd>${n3}</dd></div>`).join(``)}</dl>
    <button class="btn primary" data-action="start" data-value="${this.selected}" aria-label="Drive this route">Drive</button></section>
  </div>`;
  }
  play(e2) {
    let t2 = this.career, n2 = e2.level;
    this.tele.run !== e2 && (this.tele = { run: e2, pts: [[e2.s, 0]], air: 0, maxH: 0, lastT: e2.time, maxS: e2.s, airs: 0, wasAir: false });
    let r2 = t2.results[n2.id]?.time;
    this.target = r2 ? Math.min(r2, n2.medal.gold) : n2.medal.gold, this.targetLabel = r2 && r2 < n2.medal.gold ? `Best` : `Gold`, this.root.innerHTML = `<div class="hud">
   <div class="scrim top"></div><div class="scrim bottom"></div>
   <div class="progress"><i id="progress-fill"></i><div id="gate-markers"></div></div>
   <div class="relay"><small>Relay</small><b id="relay-num">1</b><span>/${n2.gates.length}</span></div>
   <div class="where"><span id="route-name"></span><b id="act-name"></b></div>
   <div class="nav" id="nav-card"><span class="nav-glyph" id="nav-glyph">${O.relay}</span><b id="next-distance">0 m</b><span id="next-name"></span></div>
   <div class="clock"><b id="run-time">00:00.00</b><span class="delta" id="delta"></span></div>
   <button class="pause-btn" id="pause-button" aria-label="Pause game" data-action="pause">${O.pause}</button>
   <div class="alert" id="alert-box" role="status"><i>${O.alert}</i><span id="alert"></span></div>
   <div class="toast" id="toast-box"><span id="toast"></span><small id="toast-sub"></small></div>
   <div class="trick-meter" id="trick-meter" aria-hidden="true"></div>
   <div class="countdown" id="countdown"></div>
   <div class="speedo"><div class="gears" id="gears">${be.map(([e3, t3]) => `<span data-mode="${e3}"${e3 === `cooling` ? ` class="warn"` : ``}>${t3}</span>`).join(``)}</div><div class="speed"><b id="speed">0</b><small>km/h</small></div></div>
   <div class="boost"><div class="boost-head"><span id="boost-name">Nitro</span><b id="thrust-label">100%</b></div><div class="segs" id="segs">${`<i></i>`.repeat(xe)}</div><div class="boost-foot"><span class="score"><b id="score">0</b> pts <em id="combo">\xD71.0</em></span><span class="core">Core <b id="core-temp">21\xB0</b></span></div></div>
   <div class="assist"><div class="drive-hint" id="hint"></div><div class="keys" id="keys"></div></div>
   <div class="thumb-relays" id="thumb-relays" aria-label="Relay progress">${n2.gates.map(() => `<i></i>`).join(``)}</div>
   <div class="thumb-controls" aria-label="Touch driving controls">
    <button type="button" class="thumb-zone left" data-thumb="left" aria-pressed="false" aria-label="Steer and brake"><span class="thumb-surface"></span><span class="thumb-nub">${D(`<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>`)}</span><span class="thumb-travel">\u2304</span></button>
    <button type="button" class="thumb-zone right" data-thumb="right" aria-pressed="false" aria-label="Drive and lift"><span class="thumb-surface"></span><svg class="thumb-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="46"/><circle id="thumb-charge" cx="50" cy="50" r="46" pathLength="100"/></svg><span class="thumb-nub"><span class="thumb-drive">${D(`<path d="M8 12l4-4 4 4M12 8v10"/>`)}</span><span class="thumb-lift">${D(`<path d="M8 16v-5l4-7 4 7v5M8 12h8M10 19v2M14 19v2M5 16l3-3M19 16l-3-3"/>`)}</span></span><span class="thumb-travel">\u2303</span></button>
    <button type="button" class="thumb-nitro" data-thumb="nitro" aria-label="Nitro. Hold for drive, push up for lift. Double tap for shockwave." aria-pressed="false">${O.nitro}</button>
    <span class="thumb-feedback left"></span><span class="thumb-feedback right"></span>
   </div>
   ${t2.settings.touchHelpSeen ? `` : `<aside class="thumb-help" aria-label="Touch control guide"><div><b>Left thumb</b><span>Slide to steer<br>Pull down to brake</span></div><div><b>Right thumb</b><span>Hold to drive<br>Push up to lift</span></div><p>In the air: left spins &amp; flips \xB7 right lifts &amp; rolls</p><button type="button" data-action="dismiss-touch-help" aria-label="Dismiss touch control guide">\xD7</button></aside>`}
  </div>`, this.refs = {};
    for (let e3 of this.root.querySelectorAll(`[id]`)) this.refs[e3.id] = e3;
    this.refs[`gate-markers`].innerHTML = n2.gates.map((e3) => `<i style="left:${(e3.s / n2.length * 100).toFixed(2)}%"></i>`).join(``), this.refs[`route-name`].textContent = n2.name, this.gears = [...this.root.querySelectorAll(`#gears span`)], this.segs = [...this.root.querySelectorAll(`#segs i`)];
  }
  maneuver(e2) {
    let t2 = e2.level, n2 = t2.gates[e2.nextGate], r2 = n2?.s ?? t2.length, i2 = t2.gaps.find(([t3]) => t3 > e2.s - 4 && t3 < r2 && t3 - e2.s < 400), a2 = ae(t2, e2.s, 400);
    return e2.grounded && a2 && a2.kicker.s > e2.s - 2 && a2.kicker.s < r2 && (!i2 || a2.kicker.s < i2[0]) ? { kind: `leap`, name: `Jump line \xB7 ${a2.count} vehicles`, s: a2.kicker.s } : e2.grounded && i2 ? { kind: `leap`, name: `Leap \xB7 hold thrust`, s: i2[0] } : { kind: n2 ? `relay` : `finish`, name: n2 ? n2.name : `Finish`, s: r2 };
  }
  update(e2, t2 = {}) {
    if (this.screen !== `play` || !this.refs) return;
    let n2 = this.refs, r2 = this.root.firstElementChild, i2 = e2.phase === `running`, a2 = !e2.grounded;
    r2.classList.toggle(`boosting`, (e2.boosting || e2.nitro > 0) && i2), r2.classList.toggle(`slowmo`, (t2.slow || 0) > 0.25), r2.classList.toggle(`air`, a2), r2.classList.toggle(`nitro`, e2.nitro > 0 && i2), r2.classList.toggle(`perfect`, e2.nitro === 2), r2.classList.toggle(`shock`, e2.nitro === 3), r2.classList.toggle(`window`, !!e2.nitroWindow);
    let o2 = this.tele;
    if (o2.run === e2) {
      let t3 = e2.time - o2.lastT;
      t3 > 0 && t3 < 0.5 && a2 && (o2.air += t3), o2.lastT = e2.time, e2.s > o2.maxS + 4 && (o2.pts.push([e2.s, Math.max(0, e2.h)]), o2.maxS = e2.s), o2.maxH = Math.max(o2.maxH, e2.h), a2 && !o2.wasAir && o2.airs++, o2.wasAir = a2;
    }
    e2.act !== this.lastAct && (this.lastAct = e2.act, n2[`act-name`].textContent = Ce(e2.act)), n2[`relay-num`].textContent = Math.min(e2.nextGate + 1, e2.level.gates.length);
    let s2 = e2.overheated ? `cooling` : a2 ? `air` : Math.abs(e2.level.banks.find(([t3, n3]) => e2.s > t3 && e2.s < n3)?.[2] || 0) > 0.7 ? `suction` : e2.drifting ? `drift` : `road`;
    if (s2 !== this.lastMode) {
      this.lastMode = s2;
      for (let e3 of this.gears) e3.classList.toggle(`on`, e3.dataset.mode === s2);
    }
    n2.speed.textContent = Math.round(e2.v * 3.6), this.lastRelay !== e2.nextGate && (this.lastRelay = e2.nextGate, [...n2[`thumb-relays`].children].forEach((t3, n3) => {
      t3.className = n3 < e2.nextGate ? `done` : n3 === e2.nextGate ? `current` : ``;
    }), n2[`thumb-relays`].setAttribute(`aria-label`, `${e2.nextGate} of ${e2.level.gates.length} relays passed`));
    let c2 = p(e2.thrust / e2.capacity, 0, 1), u2 = Math.ceil(c2 * xe - 0.01), d2 = e2.overheated ? `locked` : c2 < 0.25 ? `low` : ``;
    (u2 !== this.lastSeg || d2 !== this.lastState) && (this.lastSeg = u2, this.lastState = d2, this.segs.forEach((e3, t3) => e3.classList.toggle(`on`, t3 < u2)), n2.segs.className = `segs ` + d2), n2[`thrust-label`].textContent = Math.ceil(c2 * 100) + `%`;
    let f2 = Math.round(c2 * 100);
    f2 !== this.lastCharge && (this.lastCharge = f2, n2[`thumb-charge`].style.strokeDashoffset = String(100 - f2));
    let m2 = Te(e2.heat) + `\xB0`;
    m2 !== this.lastTemp && (this.lastTemp = m2, n2[`core-temp`].textContent = m2), n2[`core-temp`].classList.toggle(`hot`, e2.overheated || e2.heat > 75), n2.score.textContent = Math.floor(e2.score).toLocaleString(), n2.combo.textContent = `\xD7` + e2.combo.toFixed(1), n2.combo.classList.toggle(`hot`, e2.combo > 1.4);
    let h2 = this.maneuver(e2), g2 = h2.kind + `|` + h2.name + `|` + this.touch;
    g2 !== this.navKey && (this.navKey = g2, n2[`nav-glyph`].innerHTML = h2.kind === `leap` ? O.leap : h2.kind === `finish` ? O.finish : O.relay, n2[`nav-card`].dataset.kind = h2.kind, n2[`next-name`].textContent = this.touch && h2.kind === `leap` ? h2.name.startsWith(`Jump line`) ? `Jump line` : `Leap` : h2.name);
    let _2 = Math.max(0, h2.s - e2.s);
    if (n2[`next-distance`].textContent = _2 >= 1e3 ? Se(_2) + ` km` : Math.round(_2 / 10) * 10 + ` m`, n2[`run-time`].textContent = E(e2.time), n2[`progress-fill`].style.transform = `scaleX(${p(e2.s / e2.level.length, 0, 1)})`, i2 && e2.time > 4 && e2.s > 60) {
      o2.startS ??= e2.s, o2.startT ??= e2.time;
      let t3 = (e2.s - o2.startS) / Math.max(1, e2.time - o2.startT), r3 = e2.time + Math.max(0, e2.level.length - e2.s) / Math.max(18, t3) - this.target, i3 = `${this.targetLabel} ${r3 < 0 ? `\u2212` : `+`}${Math.abs(r3).toFixed(1)}`;
      i3 !== this.lastDelta && (this.lastDelta = i3, n2.delta.textContent = i3, n2.delta.className = `delta ` + (r3 < 0 ? `ahead` : `behind`));
    }
    let v2 = e2.toastTime > 0 && e2.toast || ``, ee2 = v2 && Ee.test(v2);
    if (v2 !== this.lastToast) {
      this.lastToast = v2;
      let e3 = n2[`toast-box`];
      e3.className = `toast`, n2.toast.textContent = ee2 ? `` : v2, v2 && !ee2 && (e3.classList.add(/RELAY|ROUTE COMPLETE/.test(v2) ? `relay` : `reward`), e3.offsetWidth, e3.classList.add(`show`));
    }
    n2[`toast-sub`].textContent = v2 && !ee2 && e2.combo > 1.4 ? `\xD7` + e2.combo.toFixed(1) + ` chain` : ``;
    let y2 = e2.gateMiss ? `Relay missed \xB7 ` + (this.touch ? `pause to recover` : `press R to recover`) : e2.overheated ? `Core overheated \xB7 release thrust` : ee2 ? Ce(v2) : ``;
    y2 !== this.lastAlert && (this.lastAlert = y2, n2.alert.textContent = y2, n2[`alert-box`].classList.toggle(`show`, !!y2));
    let b2 = e2.phase === `countdown` ? e2.countdown > 0.6 ? String(Math.ceil(e2.countdown - 0.6)) : `Go` : ``;
    if (b2 !== this.lastCount) {
      this.lastCount = b2;
      let e3 = n2.countdown;
      e3.textContent = b2, e3.className = `countdown` + (b2 ? ` show` : ``) + (b2 === `Go` ? ` go` : ``), e3.offsetWidth;
    }
    let te2 = l(e2.level, e2.s), ne2 = e2.level.ramps.find(([t3, n3]) => e2.s > t3 - 80 && e2.s < n3 + 5), x2 = e2.level.gaps.find(([t3, n3]) => e2.s > t3 - 15 && e2.s < n3 + 25), S2 = ae(e2.level, e2.s, 90), re2 = S2 && e2.grounded && e2.s < S2.kicker.s + S2.kicker.len, C2 = e2.overheated || e2.gateMiss ? `` : e2.nitroWindow ? `Perfect nitro \xB7 tap Shift again` : x2 ? `Hold thrust to cross \xB7 release to land` : ne2 ? `Ramp ahead \xB7 Space to launch` : re2 ? `Jump line \xB7 Space on the ramp to clear it` : e2.thrust >= e2.capacity * 0.97 && e2.time > 6 && !e2.nitro && i2 ? `Nitro full \xB7 double-tap Shift for a shockwave` : e2.time < 12 || e2.s - te2.s < 130 ? te2.hint : ``;
    this.touch && (C2 = C2.replace(`W to accelerate \xB7 A / D to steer`, `Hold right to drive \xB7 slide left to steer`).replace(`Space to launch`, `Push right thumb up to launch`).replace(`Space on the ramp`, `Push right thumb up on the ramp`).replace(`SPACE`, `THRUST`).replace(`tap Shift again`, `tap Nitro again`).replace(`double-tap Shift`, `double-tap Nitro`)), C2 !== this.lastHint && (this.lastHint = C2, n2.hint.textContent = /[a-z]/.test(C2) ? C2 : Ce(C2), n2.hint.classList.toggle(`on`, !!C2));
    let w2 = this.touch ? `` : a2 && o2.airs <= 3 ? `air` : e2.time < 16 && !a2 ? `road` : ``;
    w2 !== this.keysMode && (this.keysMode = w2, n2.keys.innerHTML = w2 ? (w2 === `air` ? je : Ae).map(([e3, t3]) => `<span>${ke(e3)}<em>${t3}</em></span>`).join(``) : ``, n2.keys.classList.toggle(`on`, !!w2));
    let ie2 = (e3) => Math.round(Math.abs(e3) * 180 / Math.PI / 15) * 15, T2 = a2 && i2 ? [Math.abs(e2.spin) > 0.35 ? `<span>Spin <b>${ie2(e2.spin)}\xB0</b></span>` : ``, Math.abs(e2.flip) > 0.35 ? `<span>${e2.flip > 0 ? `Front` : `Back`} flip <b>${ie2(e2.flip)}\xB0</b></span>` : ``].join(``) : ``;
    T2 !== this.lastMeter && (this.lastMeter = T2, n2[`trick-meter`].innerHTML = T2, n2[`trick-meter`].classList.toggle(`on`, !!T2));
  }
  seg(e2, t2, n2, r2 = `Off`, i2 = `On`) {
    return `<button class="seg-row" data-action="${e2}"><span>${t2}</span><span class="seg" aria-hidden="true"><i data-l="${r2}"${n2 ? `` : ` class="on"`}></i><i data-l="${i2}"${n2 ? ` class="on"` : ``}></i></span> <b class="sr">${n2 ? i2 : r2}</b></button>`;
  }
  pause(e2) {
    let t2 = this.career;
    return `<div class="modal-layer"><section class="controls" aria-label="Paused">
   <aside class="ctl-side"><p class="kicker">Paused</p><h1>${e2.level.name}</h1><dl><div><dt>Time</dt><dd>${E(e2.time)}</dd></div><div><dt>Relay</dt><dd>${Math.min(e2.nextGate + 1, e2.level.gates.length)} of ${e2.level.gates.length}</dd></div><div><dt>Points</dt><dd>${Math.floor(e2.score).toLocaleString()}</dd></div></dl><button class="leave" data-action="home">${O.exit}<span>Save &amp; leave route</span></button></aside>
   <div class="ctl-main"><div class="tiles"><button class="tile primary" data-action="unpause">${O.play}<span>Back to driving</span></button><button class="tile" data-action="restart">${O.restart}<span>Restart route</span></button><button class="tile" data-action="recover">${O.toRelay}<span>Return to relay</span></button></div>
    <details class="display-settings"${this.touch ? `` : ` open`}><summary>Display &amp; driving</summary><div class="seg-rows">${this.seg(`quality`, `Detail`, t2.settings.quality === `high`, `Balanced`, `High`)}${this.seg(`sound`, `Sound`, t2.settings.sound)}${this.seg(`motion`, `Camera motion`, t2.settings.shake)}${this.seg(`slowmo`, `Slow motion`, t2.settings.slowmo)}<button class="seg-row" data-action="control-mode"><span>Controls</span><b>${t2.settings.controls === `touch` ? `Touch` : t2.settings.controls === `keys` ? `Keyboard` : `Auto`}</b></button></div></details><button class="link touch-help-link" data-action="touch-help">Show touch control guide</button></div>
  </section></div>`;
  }
  results(e2) {
    let t2 = e2.result, n2 = e2.levelIndex + 1 < C.length && (e2.levelIndex + 1 <= this.career.unlocked || C[e2.levelIndex + 1].alwaysOpen) ? C[e2.levelIndex + 1] : null, r2 = this.tele.run === e2 ? this.tele : { pts: [], air: 0, maxH: 0 }, i2 = [[`Points`, t2.score.toLocaleString()], [`Data cells`, `${t2.cells} of ${e2.level.cells.length}`], [`Clean landings`, t2.cleanLandings], [`Air rolls`, t2.airRolls], [`Spins`, t2.spins ?? 0], [`Flips`, t2.flips ?? 0], [`Max height`, Math.round(r2.maxH) + ` m`], [`Credits earned`, `+` + t2.credits]];
    return `<div class="modal-layer"><section class="trip-sheet">
   <header><div><p class="kicker">${e2.level.name} \xB7 Route complete</p><h1 class="time">${E(t2.time)}</h1></div><span class="medal-pill ${t2.medal}"><i></i>${we(t2.medal)}</span></header>
   <div class="profile"><div class="profile-head"><b>Flight profile</b><span>${r2.air.toFixed(1)} s in the air</span></div>${this.chart(e2, r2.pts)}</div>
   <dl class="trip-stats">${i2.map(([e3, t3]) => `<div><dt>${e3}</dt><dd>${t3}</dd></div>`).join(``)}</dl>
   <p class="fine">${t2.medal === `gold` ? `Gold. A clean line through the sky.` : `Gold: under ${E(e2.level.medal.gold)}, 2,600 points and 3 data cells.`}</p>
   <div class="row-actions">${n2 ? `<button class="btn primary" data-action="start" data-value="${e2.levelIndex + 1}">Drive ${n2.name}</button>` : `<button class="btn primary" data-action="routes">Routes &amp; tuning</button>`}<button class="btn" data-action="restart">Run it again</button></div>
   <button class="link" data-action="routes">Tune your Roadster</button></section></div>`;
  }
  chart(e2, t2) {
    let n2 = e2.level, r2 = { l: 8, r: 8, t: 12, b: 22 }, i2 = Math.max(10, ...t2.map((e3) => e3[1])) * 1.15, a2 = (e3) => r2.l + (640 - r2.l - r2.r) * e3 / n2.length, o2 = (e3) => 140 - r2.b - (140 - r2.t - r2.b) * e3 / i2, s2 = t2.map((e3, t3) => (t3 ? `L` : `M`) + a2(e3[0]).toFixed(1) + ` ` + o2(e3[1]).toFixed(1)).join(``), c2 = t2.length > 1 ? `${s2}L${a2(t2[t2.length - 1][0]).toFixed(1)} ${o2(0)}L${a2(t2[0][0]).toFixed(1)} ${o2(0)}Z` : ``, l2 = n2.gaps.map(([e3, t3]) => `<rect x="${a2(e3).toFixed(1)}" y="${r2.t}" width="${(a2(t3) - a2(e3)).toFixed(1)}" height="${140 - r2.t - r2.b}"/>`).join(``), u2 = n2.gates.map((e3) => `<circle cx="${a2(e3.s).toFixed(1)}" cy="${o2(0)}" r="3.5"/>`).join(``), d2 = [0, 0.25, 0.5, 0.75, 1].map((e3) => `<text x="${a2(n2.length * e3).toFixed(0)}" y="135" text-anchor="${e3 === 0 ? `start` : e3 === 1 ? `end` : `middle`}">${Se(n2.length * e3)} km</text>`).join(``);
    return `<svg class="chart" viewBox="0 0 640 140" preserveAspectRatio="none" role="img" aria-label="Height above the road along the route"><defs><linearGradient id="profile-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e31937" stop-opacity=".42"/><stop offset="1" stop-color="#e31937" stop-opacity="0"/></linearGradient></defs><g class="gaps">${l2}</g><line class="base" x1="${r2.l}" x2="${640 - r2.r}" y1="${o2(0)}" y2="${o2(0)}"/><path class="area" d="${c2}" fill="url(#profile-fill)"/><path class="line" d="${s2}"/><g class="relays">${u2}</g><g class="ticks">${d2}</g><text class="ymax" x="${r2.l}" y="${r2.t + 4}">${Math.round(i2 / 1.15)} m</text></svg>`;
  }
}, Ne = 1 / 120, Pe = { easeIn: 0.14, easeOut: 0.42 }, Fe = { gap: { duration: 1, floor: 0.3, rest: 2.5 }, roll: { duration: 0.8, floor: 0.32, rest: 1.25 }, landing: { duration: 0.8, floor: 0.36, rest: 2.5 }, pass: { duration: 0.62, floor: 0.45, rest: 2.5 }, lineup: { duration: 1.05, floor: 0.28, rest: 2.5 }, trick: { duration: 0.7, floor: 0.36, rest: 1.25 } }, Ie = (e2, t2, n2) => {
  let r2 = Math.max(0, Math.min(1, (n2 - e2) / (t2 - e2)));
  return r2 * r2 * (3 - 2 * r2);
}, Le = class {
  constructor() {
    this.reset();
  }
  reset() {
    this.wall = 0, this.start = -1e9, this.duration = 0, this.end = -1e9, this.floor = 1, this.reason = null, this.count = 0, this.scale = 1, this.depth = 0;
  }
  trigger(e2, t2 = true) {
    let n2 = Fe[e2];
    return !t2 || !n2 || this.wall - this.end < n2.rest ? false : (this.start = this.wall, this.duration = n2.duration, this.end = this.start + n2.duration, this.floor = n2.floor, this.reason = e2, this.count++, true);
  }
  cancel() {
    this.wall < this.end && (this.end = this.wall), this.start = -1e9, this.scale = 1, this.depth = 0;
  }
  get active() {
    return this.depth > 0;
  }
  update(e2) {
    this.wall += Math.max(0, e2);
    let t2 = this.wall - this.start;
    return t2 < 0 || t2 >= this.duration ? (this.depth = 0, this.scale = 1, 1) : (this.depth = Math.min(Ie(0, Pe.easeIn, t2), 1 - Ie(this.duration - Pe.easeOut, this.duration, t2)), this.scale = 1 - (1 - this.floor) * this.depth, this.scale);
  }
};
function Re(e2, t2, n2 = 1, r2 = Ne) {
  e2 += Math.max(0, t2) * Math.max(0, n2);
  let i2 = 0;
  for (; e2 >= r2; ) e2 -= r2, i2++;
  return { accumulator: e2, steps: i2 };
}
var k = { base: new T(), spin: new T(), flip: new T(), roll: new T(), e: new b() }, ze = { x: new c(1, 0, 0), y: new c(0, 1, 0), z: new c(0, 0, 1) }, Be = new c(0, 0.62, 0), Ve = new c(), He = new c(), Ue = (e2, t2, r2) => (n(e2, t2 + 0.5, r2)?.height ?? 0) - (n(e2, t2 - 0.5, r2)?.height ?? 0);
function We(e2, t2, n2, r2, { menu: i2 = false, moving: a2 = true } = {}) {
  let o2 = t2.s, c2 = s(t2.level, o2), l2 = S(w(t2.level, o2, t2.l, t2.h + 0.035));
  e2.position.copy(l2);
  let u2 = s(t2.level, o2 + 0.5).y - s(t2.level, o2 - 0.5).y, d2 = t2.grounded ? Ue(t2.level, o2, t2.l) : 0, f2 = t2.grounded ? Math.atan(u2 + d2) : Math.atan2(t2.vy, Math.max(15, t2.v)) * 0.6;
  t2.events?.some((e3) => e3.type === `recover`) && Object.assign(n2, { roll: 0, spin: 0, flip: 0 });
  for (let e3 of [`roll`, `spin`, `flip`]) n2[e3] = !t2.grounded && !i2 ? t2[e3] : x.damp(Math.atan2(Math.sin(n2[e3]), Math.cos(n2[e3])), 0, 14, r2);
  let m2 = t2.theta + (t2.slip || 0);
  k.e.set(f2, -c2.heading - m2, c2.bank + (t2.grounded ? m2 * -0.12 : m2 * -0.35), `YXZ`), k.base.setFromEuler(k.e), k.spin.setFromAxisAngle(ze.y, -n2.spin), k.flip.setFromAxisAngle(ze.x, -n2.flip), k.roll.setFromAxisAngle(ze.z, n2.roll), e2.rotation.order = `YXZ`, e2.quaternion.copy(k.base).multiply(k.spin).multiply(k.flip).multiply(k.roll), e2.position.add(Ve.copy(Be).applyQuaternion(k.base)).sub(He.copy(Be).applyQuaternion(e2.quaternion));
  let h2 = (t2.wheel || 0) * 0.32 * (1 - 0.6 * p(t2.v / 70, 0, 1)) - (t2.slip || 0) * 1.1;
  for (let n3 of e2.userData.wheels) a2 && (n3.rotation.x -= t2.v * r2 / Math.max(0.2, n3.position.y)), n3.name.includes(`front`) && (n3.rotation.y = -h2);
  for (let n3 of e2.userData.fans) n3.rotation.y += r2 * (t2.boosting ? 115 : 12);
  return e2.userData.wing && (e2.userData.wing.position.y = e2.userData.wing.userData.baseHeight + p(t2.v / 50, 0, 1) * 0.065), { p: l2, t: c2, slope: u2 };
}
function Ge(e2, { timeoutMs: t2 = 45e3, onProgress: n2 = () => {
}, onTimeout: r2 = () => {
} } = {}) {
  return new Promise((i2, a2) => {
    let o2 = true, s2, c2 = (e3, t3) => {
      o2 && (o2 = false, clearTimeout(s2), e3(t3));
    }, l2 = () => {
      clearTimeout(s2), s2 = setTimeout(() => {
        if (o2) {
          o2 = false, clearTimeout(s2);
          try {
            r2();
          } catch {
          }
          a2(Error(`Loading stalled. Please retry.`));
        }
      }, t2);
    }, u2 = (e3) => {
      o2 && (l2(), n2(e3));
    };
    l2(), Promise.resolve().then(() => e2(u2)).then((e3) => c2(i2, e3), (e3) => c2(a2, e3));
  });
}
var Ke = document.querySelector(`#world`), A;
try {
  A = fe(localStorage.getItem(pe));
} catch {
  A = fe(null);
}
if (ne) {
  let e2 = null;
  try {
    e2 = JSON.parse(localStorage.getItem(pe))?.settings?.quality;
  } catch {
  }
  e2 || (A.settings.quality = `balanced`);
}
var j = new _({ canvas: Ke, antialias: false, powerPreference: `high-performance` });
j.setPixelRatio(Math.min(devicePixelRatio, A.settings.quality === `high` ? 1.5 : 1)), j.shadowMap.enabled = true, j.shadowMap.type = 2, j.toneMapping = 4, j.toneMappingExposure = 0.93, j.outputColorSpace = ie;
var M = new h(61, innerWidth / innerHeight, 0.1, 7500), qe = new o(), N, P, F, I, L, R, z, B = `home`, Je = 0, Ye = 0, Xe = false, Ze = new c(), Qe = new c(), $e = [], et = 0, tt = 0, nt = false, V = new Le(), H = { trauma: 0, fovKick: 0, surge: 0, shakeTime: 0, lastBoost: false, flightSlowed: false }, U = new ye(A.settings.sound), W = /* @__PURE__ */ new Set(), rt = /* @__PURE__ */ new Set(), G = {}, it = /* @__PURE__ */ new Map(), at = null, ot = null, K = new Me(document.querySelector(`#ui`), gt, A);
function q() {
  try {
    localStorage.setItem(pe, JSON.stringify(A));
  } catch {
    nt = true;
  }
}
function st() {
  z && (A.resume = ce(z));
}
function J() {
  W.clear(), rt.clear(), it.clear(), at = null, ot?.clear();
  for (let e2 of Object.keys(G)) G[e2] = 0;
}
var Y = (e2) => W.has(e2) || rt.has(e2);
function ct() {
  if (window.skybreakDemo?.input) return window.skybreakDemo.input(z);
  let e2 = !z.grounded && z.phase === `running`, t2 = performance.now();
  e2 ? at ??= t2 : at = null;
  let n2 = (e3) => Y(e3) && (it.get(e3) ?? -1 / 0) >= at - 120, r2 = Y(`KeyD`) || Y(`ArrowRight`), i2 = Y(`KeyA`) || Y(`ArrowLeft`), a2 = Y(`KeyW`) || Y(`ArrowUp`), o2 = Y(`KeyS`) || Y(`ArrowDown`);
  Object.assign(G, ot?.sample() || {});
  let s2 = e2 && (n2(`KeyW`) || n2(`ArrowUp`)), c2 = e2 && (n2(`KeyS`) || n2(`ArrowDown`)), l2 = p(!!r2 - +!!i2 + G.steer, -1, 1), u2 = !e2 && (o2 || G.brake), d2 = u2 && Math.abs(l2) > 0.3 && z.v > 18;
  return { throttle: !u2 && (a2 && !s2 || G.throttle) ? 1 : 0, brake: u2 ? d2 ? 0.15 : 1 : 0, steer: e2 ? 0 : l2, thrust: Y(`Space`) || G.thrust, drift: d2, nitro: Y(`ShiftLeft`) || Y(`ShiftRight`) || G.nitro, roll: p(!!Y(`KeyE`) - +!!Y(`KeyQ`) + (G.roll || 0), -1, 1), spin: p((e2 ? !!r2 - +!!i2 : 0) + (G.spin || 0), -1, 1), flip: p(!!s2 - +!!c2 + (G.flip || 0), -1, 1), recover: Y(`KeyR`) };
}
function X() {
  j.setSize(innerWidth, innerHeight, false), M.aspect = innerWidth / innerHeight, M.updateProjectionMatrix(), R && (R.composer.setPixelRatio(j.getPixelRatio()), R.resize(innerWidth, innerHeight)), Z.dirty = true, Z.coverCheck = 0, Z.offX = NaN;
}
var Z = { dirty: true, still: 0, coverCheck: 0, covered: false, lastDraw: 0, pos: new c(), quat: new T(), fov: 0 };
function lt(e2) {
  for (let t2 = e2; t2 && t2 !== document.body; t2 = t2.parentElement) {
    let e3 = getComputedStyle(t2);
    if (+e3.opacity < 0.999 || e3.visibility !== `visible`) return false;
  }
  return true;
}
function ut() {
  let e2 = innerWidth, t2 = innerHeight;
  for (let [n2, r2] of [[0.5, 0.5], [0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96], [0.5, 0.1], [0.5, 0.9], [0.1, 0.5], [0.9, 0.5]]) {
    let i2 = false;
    for (let a2 of document.elementsFromPoint(n2 * e2, r2 * t2)) {
      if (a2 === Ke) break;
      let e3 = /^rgba?\(([^)]*)\)$/.exec(getComputedStyle(a2).backgroundColor);
      if (!e3) continue;
      let t3 = e3[1].split(/[,/\s]+/).filter(Boolean);
      if ((t3.length < 4 || parseFloat(t3[3]) >= 0.999) && lt(a2)) {
        i2 = true;
        break;
      }
    }
    if (!i2) return false;
  }
  return true;
}
function dt(e2) {
  if (Z.dirty) return Z.dirty = false, Z.still = 0, Z.lastDraw = e2, true;
  if (B === `pause`) {
    let e3 = M.position.distanceToSquared(Z.pos) > 1e-6 || M.quaternion.angleTo(Z.quat) > 2e-5 || Math.abs(M.fov - Z.fov) > 1e-4;
    return Z.pos.copy(M.position), Z.quat.copy(M.quaternion), Z.fov = M.fov, Z.still = e3 || N.grass?.pending ? 0 : Z.still + 1, Z.still < 3;
  }
  if (Z.still = 0, B === `play`) return true;
  if (e2 - Z.coverCheck > 0.25) {
    Z.coverCheck = e2;
    let t2 = Z.covered;
    if (Z.covered = ut(), t2 && !Z.covered) return Z.lastDraw = e2, true;
  }
  if (Z.covered) return false;
  if (B === `results`) {
    if (e2 - Z.lastDraw < 1 / 30 - 4e-3) return false;
    Z.lastDraw = e2;
  }
  return true;
}
function ft(n2, r2 = null) {
  if (n2 > A.unlocked && !C[n2].alwaysOpen) return;
  if (J(), Z.dirty = true, N && N.level === C[n2] && N.quality === A.settings.quality) {
    z = se(n2, A, r2), L.clear(), R.reset(), Xe = false, V.cancel(), Object.assign(H, { trauma: 0, fovKick: 0, surge: 0, lastBoost: false, flightSlowed: false }), X();
    return;
  }
  N && (R?.dispose(), N.dispose()), z = se(n2, A, r2), N = new ee(j, P, C[n2], A.settings.quality), F = te(P.vehicle), N.scene.add(F), N.lightCar(F);
  let i2 = document.createElement(`canvas`);
  i2.width = i2.height = 128;
  let o2 = i2.getContext(`2d`), s2 = o2.createRadialGradient(64, 64, 10, 64, 64, 64);
  s2.addColorStop(0, `rgba(0,10,12,.6)`), s2.addColorStop(0.55, `rgba(0,10,12,.32)`), s2.addColorStop(1, `rgba(0,10,12,0)`), o2.fillStyle = s2, o2.fillRect(0, 0, 128, 128), I = new u();
  let c2 = new v(new d(3.4, 6.4), new re({ map: new a(i2), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  c2.rotation.x = -Math.PI / 2, I.add(c2), N.scene.add(I), L = new t(N.scene, F, M, N), R = e(j, N.scene, M, A.settings.quality, C[n2].id), Xe = false, V.cancel(), Object.assign(H, { trauma: 0, fovKick: 0, surge: 0, lastBoost: false, flightSlowed: false }), X();
  let l2 = S(w(z.level, z.s, z.l, z.h));
  N.view.height = j.domElement.height, N.nature?.update(l2), N.town?.update(l2), N.prewarm(M);
}
var Q = false;
async function pt(e2, t2 = null) {
  let n2 = C[e2];
  if (!(!n2 || e2 > A.unlocked && !n2.alwaysOpen || Q)) {
    if (!P.loaded.has(n2.id)) {
      Q = true;
      let e3 = document.createElement(`div`);
      e3.id = `load`, e3.innerHTML = `<span>Roadster Hours</span><i></i><small>Loading ${n2.name}</small>`, document.body.append(e3);
      try {
        await g(P, n2.id);
      } catch (t3) {
        console.error(t3), e3.querySelector(`small`).textContent = `This route could not load. Check the connection and try again.`, e3.querySelector(`i`).style.display = `none`, setTimeout(() => e3.remove(), 2600), Q = false;
        return;
      }
      e3.classList.add(`done`), setTimeout(() => e3.remove(), 650), Q = false;
    }
    U.start(), Q = true;
    try {
      N?.compiling && await N.compiling, ft(e2, t2), B = `play`, K.set(`play`, z), _t(), Je = 0, st(), q();
    } finally {
      Q = false;
    }
  }
}
function mt() {
  B === `play` && (J(), z.beforePause = z.phase, z.phase = `paused`, B = `pause`, st(), q(), K.set(`pause`, z));
}
function ht() {
  J(), z.phase = z.beforePause === `countdown` ? `countdown` : `running`, B = `play`, K.set(`play`, z), _t();
}
function gt(e2, t2) {
  Z.dirty = true, e2 === `start` && pt(Number(t2)), e2 === `resume` && A.resume && pt(A.resume.level, A.resume), e2 === `pause` && mt(), e2 === `unpause` && ht(), e2 === `home` && (z && (B === `play` || B === `pause`) && st(), q(), J(), B = `home`, K.set(`home`, z)), e2 === `routes` && (B = `routes`, J(), K.set(`routes`, z)), e2 === `upgrade` && de(A, t2) && (q(), K.set(`routes`, z), U.tone(660, 0.2, 0.08)), e2 === `restart` && pt(z.levelIndex), e2 === `recover` && (oe(z), L.clear(), V.cancel(), ht()), e2 === `sound` && (J(), A.settings.sound = !A.settings.sound, U.start(), U.toggle(A.settings.sound), q(), K.set(B, z), B === `play` && _t()), e2 === `quality` && (A.settings.quality = A.settings.quality === `high` ? `balanced` : `high`, j.setPixelRatio(Math.min(devicePixelRatio, A.settings.quality === `high` ? 1.5 : 1)), N.sun.shadow.mapSize.setScalar(A.settings.quality === `high` ? 4096 : 2048), N.sun.shadow.map?.dispose(), N.sun.shadow.map = null, R.setQuality(A.settings.quality), X(), q(), K.set(`pause`, z)), e2 === `motion` && (A.settings.shake = !A.settings.shake, q(), K.set(`pause`, z)), e2 === `touch-help` && (A.settings.touchHelpSeen = false, q(), ht()), e2 === `dismiss-touch-help` && (A.settings.touchHelpSeen = true, q(), K.hideTouchHelp()), e2 === `control-mode` && (J(), A.settings.controls = A.settings.controls === `auto` ? `touch` : A.settings.controls === `touch` ? `keys` : `auto`, q(), K.set(`pause`, z)), e2 === `slowmo` && (A.settings.slowmo = !A.settings.slowmo, A.settings.slowmo || V.cancel(), q(), K.set(`pause`, z));
}
function _t() {
  ot?.dispose(), ot = ve(document.querySelector(`.thumb-controls`), { grounded: () => z.grounded, onStart: () => U.start(), onLearned: () => {
    A.settings.touchHelpSeen || (A.settings.touchHelpSeen = true, q(), K.hideTouchHelp());
  } });
}
window.addEventListener(`keydown`, (e2) => {
  if ([`Space`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`].includes(e2.code) && e2.preventDefault(), !e2.repeat) {
    if (e2.code === `KeyH` && B === `play`) {
      K.root.classList.toggle(`photo-mode`);
      return;
    }
    if (e2.code === `Escape` || e2.code === `KeyP`) {
      B === `play` ? mt() : B === `pause` && ht();
      return;
    }
    if (e2.code === `Enter` && B === `home`) {
      pt(0);
      return;
    }
    B === `play` && (W.add(e2.code), rt.add(e2.code), it.set(e2.code, performance.now()));
  }
}), window.addEventListener(`keyup`, (e2) => W.delete(e2.code)), window.addEventListener(`blur`, () => {
  J(), B === `play` && mt();
}), document.addEventListener(`visibilitychange`, () => {
  document.hidden && (J(), B === `play` && mt());
}), window.addEventListener(`resize`, X), window.addEventListener(`pagehide`, () => {
  z && B === `play` && st(), q();
});
var vt = { roll: 0, spin: 0, flip: 0 };
function yt(e2, t2) {
  let n2 = z.s, { p: i2, t: a2, slope: o2 } = We(F, z, vt, e2, { menu: t2, moving: B === `play` }), s2 = ue(z, z.s, z.l, z.h), l2 = s2?.height ?? 0, u2 = z.h - l2;
  I.position.copy(S(w(z.level, n2, z.l, l2 + 0.06))), I.rotation.set(Math.atan(o2 + (s2?.kicker ? Ue(z.level, n2, z.l) : 0)), -a2.heading, a2.bank, `YXZ`), I.visible = z.grounded || u2 < 12, I.children[0].material.opacity = z.grounded ? 1 : Math.max(0, 1 - u2 / 12) * 0.5;
  let d2 = new c(Math.sin(a2.heading), 0, -Math.cos(a2.heading)), f2 = i2.clone(), m2 = i2.clone(), h2 = new c(-Math.sin(a2.bank) * Math.cos(a2.heading), Math.cos(a2.bank), -Math.sin(a2.bank) * Math.sin(a2.heading)), g2 = t2 ? new c(0, 1, 0) : h2;
  if (t2) {
    let e3 = 0.7 + Math.sin(tt * 0.08) * 0.2;
    m2.add(new c(Math.cos(e3) * 9, 3.1, -Math.sin(e3) * 10)), f2.add(new c(0, 0.6, 0));
    let t3 = new c().crossVectors(f2.clone().sub(m2), new c(0, 1, 0)).normalize();
    f2.addScaledVector(t3, K.menuShift ?? -2.9), M.fov = 48;
  } else {
    let t3 = z.v / 74, n3 = p((1 - M.aspect) / 0.55, 0, 1), i3 = A.settings.shake, a3 = i3 ? H.slow : 0;
    m2.addScaledVector(d2, (-7.2 - t3 * 1.4 - (i3 ? H.surge : H.surge * 0.4) - a3 * 1.8) * (1 + n3 * 0.75)), m2.addScaledVector(h2, 1.95 + n3 * 2.6 + (z.grounded ? 0 : 0.45 + Math.min(0.8, z.h * 0.04)) + a3 * 0.9), m2.x += z.theta * 1.4, f2.addScaledVector(d2, 11 + t3 * 5), f2.addScaledVector(h2, 0.8), H.boost = x.damp(H.boost ?? 0, (z.boosting || z.nitro > 0) && z.phase === `running` ? 1 + [0, 0, 0.6, 1.4][z.nitro || 0] : 0, 6, e2);
    let o3 = 54 + r(0.3, 1, t3) * 12 + n3 * 5 + H.boost * 4 + (i3 ? H.fovKick : 0);
    M.fov = x.damp(M.fov, o3, o3 > M.fov ? 7 : 2.4, e2);
  }
  if (H.fovKick = x.damp(H.fovKick, 0, 3, e2), H.surge = x.damp(H.surge, 0, 2.2, e2), z.events.some((e3) => e3.type === `recover`) && (Xe = false), !Xe) M.position.copy(m2), Ze.copy(f2), M.up.copy(g2), Xe = true;
  else {
    let n3 = i2.clone().sub(Qe);
    M.position.add(n3), Ze.add(n3), M.position.lerp(m2, 1 - Math.exp(-e2 * (t2 ? 1.5 : 7))), Ze.lerp(f2, 1 - Math.exp(-e2 * 9)), M.up.lerp(g2, 1 - Math.exp(-e2 * 7)).normalize();
  }
  Qe.copy(i2), H.shakeTime += e2, H.trauma = Math.max(0, H.trauma - e2 * 1.3);
  let _2 = 0;
  if (A.settings.shake && B === `play`) {
    let t3 = (z.grounded ? p((z.v - 28) / 46, 0, 1) ** 2 * 0.05 : 0) + (H.boost || 0) * 0.035 + H.trauma * H.trauma * 0.62, n3 = H.shakeTime, r2 = Math.sin(n3 * 41.3) * 0.6 + Math.sin(n3 * 23.7 + 1.3) * 0.4, i3 = Math.sin(n3 * 37.1 + 0.7) * 0.6 + Math.sin(n3 * 19.3 + 2.1) * 0.4, a3 = new c().crossVectors(d2, h2).normalize();
    M.position.addScaledVector(a3, r2 * t3 * 0.5).addScaledVector(h2, i3 * t3 * 0.5), H.roll = x.damp(H.roll || 0, -z.theta * 0.16, 4, e2), _2 = H.roll + Math.sin(n3 * 29) * t3 * 0.035;
  }
  return M.lookAt(Ze), _2 && M.rotateZ(_2), M.updateProjectionMatrix(), i2;
}
function bt(e2) {
  if (z.phase !== `running`) return;
  let t2 = A.settings.slowmo;
  z.boosting && !H.lastBoost && (H.trauma += 0.2, H.fovKick = Math.max(H.fovKick, 4), H.surge = Math.max(H.surge, 1.2)), H.lastBoost = z.boosting;
  for (let n2 of e2) {
    if (n2.type === `launch` && n2.kicker) H.trauma += n2.big ? 0.3 : 0.18, H.fovKick = Math.max(H.fovKick, n2.big ? 6 : 3.5), H.surge = Math.max(H.surge, n2.big ? 1.4 : 0.8), H.flightSlowed = false, n2.big && z.v > 36 && V.trigger(`lineup`, t2) && (H.flightSlowed = true, U.cue(`slow`));
    else if (n2.type === `launch`) {
      let e3 = z.level.gaps.some(([e4]) => z.s > e4 - 36 && z.s < e4 + 6);
      H.trauma += e3 ? 0.32 : 0.16, H.fovKick = Math.max(H.fovKick, e3 ? 7 : 3.5), H.surge = Math.max(H.surge, e3 ? 1.6 : 0.7), H.flightSlowed = false, e3 && z.v > 36 && V.trigger(`gap`, t2) && (H.flightSlowed = true, U.cue(`slow`));
    }
    if (n2.type === `roll` && (H.trauma += 0.12, V.trigger(`roll`, t2) && (H.flightSlowed = true, U.cue(`slow`, 0.8))), n2.type === `land`) {
      let e3 = n2.strength ?? 0.3;
      H.trauma += 0.2 + 0.42 * e3, H.fovKick -= 3 * e3, n2.clean && e3 >= 0.66 && !H.flightSlowed && V.trigger(`landing`, t2) && U.cue(`slow`, 0.7), H.flightSlowed = false;
    }
    n2.type === `landingFlare` && (H.trauma += 0.18), n2.type === `checkpoint` && (H.trauma += 0.1, H.fovKick = Math.max(H.fovKick, 2)), n2.type === `impact` && (H.trauma += 0.55), n2.type === `recover` && (H.trauma += 0.45, V.cancel(), H.flightSlowed = false), n2.type === `closePass` && (H.trauma += 0.1, n2.clear < 1 && z.v > 44 && V.trigger(`pass`, t2) && U.cue(`slow`, 0.5)), n2.type === `trick` && (H.trauma += 0.1, H.fovKick = Math.max(H.fovKick, 2)), n2.type === `lineup` && (H.trauma += n2.big ? 0.2 : 0.12, H.fovKick = Math.max(H.fovKick, n2.big ? 4 : 2.5)), (n2.type === `hop` || n2.type === `combo` || n2.type === `trailer`) && (H.trauma += 0.14), n2.type === `nitro` && (H.trauma += [0, 0.12, 0.22, 0.4][n2.level], H.fovKick = Math.max(H.fovKick, [0, 3, 5, 8][n2.level]), H.surge = Math.max(H.surge, [0, 0.8, 1.2, 1.8][n2.level]), n2.level > 1 && U.cue(`slow`, 0.5)), n2.type === `scrape` && (H.trauma += 0.18);
  }
  z.grounded ? H.flipShown = false : !H.flipShown && Math.abs(z.flip) > 2.8 && (H.flipShown = true, V.trigger(`trick`, t2) && (H.flightSlowed = true, U.cue(`slow`, 0.6))), H.trauma = Math.min(1, H.trauma);
}
var $ = { pos: new c(), up: new c(), fov: 0, held: false };
function xt() {
  requestAnimationFrame(xt);
  let e2 = qe.getDelta(), t2 = Math.min(e2, 0.05);
  if (tt += t2, $e.push(e2), $e.length > 240 && $e.shift(), et++, !N) return;
  let n2 = B === `home` || B === `routes`, r2 = B === `play`, i2 = [], a2 = r2 ? V.update(t2) : B === `pause` ? V.scale : 1;
  if (r2) {
    let e3 = Re(Je, t2, a2);
    Je = e3.accumulator;
    for (let t3 = 0; t3 < e3.steps; t3++) me(z, ct(), Ne, A), W.delete(`KeyR`), rt.clear(), i2.push(...z.events);
    z.events = i2, bt(i2), z.phase !== `complete` && (z.saveDirty || tt - Ye > 5) && (st(), q(), z.saveDirty = false, Ye = tt), z.phase === `complete` && (q(), B = `results`, J(), K.set(`results`, z));
  }
  n2 && (z.events = [], z.v = 0, z.boosting = false);
  let o2 = B === `pause` ? 0 : t2 * a2, c2 = { slow: r2 || B === `pause` ? V.depth : 0, motion: A.settings.shake };
  $.held &&= (M.position.copy($.pos), M.up.copy($.up), M.fov = $.fov, false), H.slow = c2.slow;
  let l2 = yt(B === `pause` ? t2 : o2, n2);
  c2.cine = 0, r2 && window.skybreakDemo?.camera && ($.pos.copy(M.position), $.up.copy(M.up), $.fov = M.fov, c2.cine = window.skybreakDemo.camera(M, { run: z, car: F, p: l2, dt: o2, wall: t2, slow: c2.slow, at: (e3, t3, n3) => S(w(z.level, e3, t3, n3)), track: (e3) => s(z.level, e3) }) || 0, $.held = c2.cine > 0), N.view.height = j.domElement.height, N.view.fov = M.fov, N.update(o2, z, l2), L.update(o2, z, c2), R.update(o2, z, c2), U.update(o2, z, c2.slow), r2 && ot?.sync(), K.update(z, c2);
  let u2 = K.viewOffset();
  (u2.x !== Z.offX || u2.y !== Z.offY) && (Z.offX = u2.x, Z.offY = u2.y, u2.x || u2.y ? M.setViewOffset(innerWidth, innerHeight, -u2.x, -u2.y, innerWidth, innerHeight) : M.clearViewOffset(), Z.dirty = true), B !== Z.screen && (Z.screen = B, Z.dirty = true, Z.coverCheck = 0, Z.covered = false), dt(performance.now() / 1e3) && (j.info.autoReset = false, j.info.reset(), R.composer.render()), z.events = [];
}
Ke.addEventListener(`webglcontextlost`, (e2) => {
  if (e2.preventDefault(), document.querySelector(`#lost`)) return;
  let t2 = document.createElement(`div`);
  t2.id = `lost`, t2.innerHTML = `<b>The graphics reset on this device</b><small>${y ? `In-app browsers have little memory for 3D. Opening the link in Safari or Chrome works best.` : `This can happen when the device runs short of memory.`}</small><button class="btn primary" type="button">Reload</button>`, t2.querySelector(`button`).onclick = () => location.reload(), document.body.append(t2);
});
async function St() {
  try {
    let e2 = i, t2 = e2.onProgress, n2 = (e3) => {
      let t3 = document.querySelector(`#load-status`);
      t3 && (t3.textContent = e3);
    };
    try {
      P = await Ge(async (n3) => (await m(), e2.onProgress = (e3, r2, i2) => {
        n3(`Downloading assets \xB7 ${r2} / ${i2}`), t2?.(e3, r2, i2);
      }, f(n3)), { timeoutMs: ne ? 45e3 : 18e4, onProgress: n2, onTimeout: () => e2.abort() });
    } finally {
      e2.onProgress = t2;
    }
    n2(`Preparing graphics`), await new Promise((e3) => setTimeout(e3, 0)), ft(0), z.s = 100, K.set(`home`, z), X(), document.querySelector(`#load`).classList.add(`done`), setTimeout(() => document.querySelector(`#load`)?.remove(), 650), requestAnimationFrame(xt), window.skybreak = { viewInfo: () => ({ offset: K.viewOffset(), view: M.view && { ...M.view }, aspect: M.aspect, size: [innerWidth, innerHeight] }), snapshot: () => ({ screen: B, phase: z.phase, level: z.level.id, s: z.s, l: z.l, h: z.h, speed: z.v, vy: z.vy, thrust: z.thrust, heat: z.heat, grounded: z.grounded, nextGate: z.nextGate, checkpoint: z.checkpoint, time: z.time, score: z.score, cells: z.cells.size, crashes: z.crashes, roll: z.roll, cleanLandings: z.cleanLandings, airRolls: z.airRolls, drifting: z.drifting, boosting: z.boosting, spin: z.spin, flip: z.flip, rollRate: z.rollRate, spinRate: z.spinRate, flipRate: z.flipRate, airSpins: z.airSpins, airFlips: z.airFlips, combos: z.combos, lineupsCleared: z.lineupsCleared, vehiclesCleared: z.vehiclesCleared, overTops: z.overTops, trailerRides: z.trailerRides, nearMisses: z.nearMisses, traffic: z.traffic.map((e3) => ({ piece: e3.piece, s: e3.s, l: e3.l, halfLen: e3.halfLen, halfWid: e3.halfWid, hgt: e3.hgt, moving: e3.moving })), vehicles: N.obstacles?.count(), shortcuts: z.shortcuts, theta: z.theta, wallDistance: z.wallDistance, upgrades: { ...A.upgrades }, unlocked: A.unlocked, credits: A.credits, results: { ...A.results }, resume: A.resume, keys: [...W], touch: { ...G }, storageError: nt, renderer: { pixelRatio: j.getPixelRatio(), calls: j.info.render.calls, triangles: j.info.render.triangles, geometries: j.info.memory.geometries, textures: j.info.memory.textures }, frames: { count: et, meanMs: $e.reduce((e3, t3) => e3 + t3, 0) / Math.max(1, $e.length) * 1e3 }, slowmo: { enabled: A.settings.slowmo, scale: V.scale, depth: V.depth, count: V.count, reason: V.reason }, camera: { fov: M.fov, trauma: H.trauma }, post: { blur: R.state.blur, route: R.route }, propulsion: L.gas.snapshot(), nitro: z.nitro, wheel: z.wheel, slip: z.slip, assets: [`roadster-rocket.glb`, `world-kit.glb`] }), version: `2.3.1`, capture: { setPixelRatio(e3) {
      j.setPixelRatio(e3), X();
    }, get pixelRatio() {
      return j.getPixelRatio();
    } } };
  } catch (e2) {
    console.error(e2), document.querySelector(`#load-status`).textContent = /Phone assets|Loading stalled/.test(e2?.message || ``) ? e2.message : `The world could not load. Please retry.`, document.querySelector(`#load i`).style.display = `none`;
    let t2 = document.createElement(`button`);
    t2.type = `button`, t2.className = `btn primary`, t2.textContent = `Retry loading`, t2.onclick = () => location.reload(), document.querySelector(`#load`).append(t2);
  }
}
St();
