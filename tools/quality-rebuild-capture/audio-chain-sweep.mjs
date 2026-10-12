#!/usr/bin/env node
// Sweep master-chain configurations on a real OfflineAudioContext (headless
// Chrome) and print, per config: transparency of a -12 dBFS 440 Hz sine
// (output RMS - expected RMS after the headroom gain), the sample peak under
// 32 summed 0 dBFS noise bursts, and the level change of a -30 dBFS sine
// (makeup gain lifting quiet material).
//   node tools/quality-rebuild-capture/audio-chain-sweep.mjs
const { chromium } = await import("@playwright/test");
const args = (process.env.QRC_GPU_ARGS || "--headless=new").split(/\s+/).filter(Boolean);
const browser = await chromium.launch({ args });
const page = await browser.newPage();
await page.goto("about:blank");
const configs = [
  { name: "main: glue-18/3 + lim-6/12, head 1.0", headroom: 1, glue: [-18, 6, 3], lim: [-6, 6, 12] },
  { name: "pr1309: glue-18/3 + lim-6/12, head 0.6", headroom: 0.6, glue: [-18, 6, 3], lim: [-6, 6, 12] },
  { name: "no glue, lim-6/12, head 0.6", headroom: 0.6, glue: null, lim: [-6, 6, 12] },
  { name: "no glue, lim-3/20 k2, head 0.6", headroom: 0.6, glue: null, lim: [-3, 2, 20] },
  { name: "no glue, lim-1/20 k0, head 0.6", headroom: 0.6, glue: null, lim: [-1, 0, 20] },
  { name: "glue-10/2 k6 + lim-1/20 k0, head 0.6", headroom: 0.6, glue: [-10, 6, 2], lim: [-1, 0, 20] },
  { name: "glue-12/2 k6 + lim-3/20 k2, head 0.6", headroom: 0.6, glue: [-12, 6, 2], lim: [-3, 2, 20] }
];
const out = await page.evaluate(async (configs) => {
  const SR = 48000;
  const curve = (() => {
    const size = 1024, knee = 0.5, peak = 0.966, t = Math.tanh((1 - knee) * 2);
    const c = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1)) * 2 - 1, ax = Math.abs(x);
      c[i] = ax <= knee ? x : Math.sign(x) * (knee + ((ax - knee) / (1 - knee)) * t * (peak - knee) / t);
    }
    return c;
  })();
  const chain = (ctx, cfg) => {
    const input = ctx.createGain();
    input.gain.value = cfg.headroom;
    let head = input;
    for (const p of [cfg.glue, cfg.lim]) {
      if (!p) continue;
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = p[0]; c.knee.value = p[1]; c.ratio.value = p[2];
      c.attack.value = p === cfg.lim ? 0.001 : 0.005; c.release.value = p === cfg.lim ? 0.1 : 0.25;
      head.connect(c); head = c;
    }
    const s = ctx.createWaveShaper(); s.curve = curve; head.connect(s); s.connect(ctx.destination);
    return input;
  };
  const sine = (ctx, db, sec = 1) => {
    const b = ctx.createBuffer(1, SR * sec, SR), d = b.getChannelData(0), a = Math.pow(10, db / 20);
    for (let i = 0; i < d.length; i++) d[i] = a * Math.sin((2 * Math.PI * 440 * i) / SR);
    return b;
  };
  const rmsDb = (d, from = SR / 2) => {
    let s = 0; for (let i = from; i < d.length; i++) s += d[i] * d[i];
    return 10 * Math.log10(s / (d.length - from));
  };
  const level = async (cfg, db) => {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const src = ctx.createBufferSource(); src.buffer = sine(ctx, db); src.connect(chain(ctx, cfg)); src.start();
    const o = await ctx.startRendering();
    return rmsDb(o.getChannelData(0)) - (db - 3.01 + 20 * Math.log10(cfg.headroom));
  };
  const res = [];
  for (const cfg of configs) {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const inp = chain(ctx, cfg);
    for (let i = 0; i < 32; i++) {
      const b = ctx.createBuffer(1, SR / 10, SR), d = b.getChannelData(0);
      for (let j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(inp); s.start();
    }
    const o = await ctx.startRendering();
    let pk = 0; for (const v of o.getChannelData(0)) pk = Math.max(pk, Math.abs(v));
    res.push({ name: cfg.name, dev12: +(await level(cfg, -12)).toFixed(2), dev30: +(await level(cfg, -30)).toFixed(2),
      dev6: +(await level(cfg, -6)).toFixed(2), burstPeakDb: +(20 * Math.log10(pk)).toFixed(2) });
  }
  return res;
}, configs);
for (const r of out) console.log(`${r.name.padEnd(42)} dev@-30 ${r.dev30} dB  dev@-12 ${r.dev12} dB  dev@-6 ${r.dev6} dB  32-burst peak ${r.burstPeakDb} dBFS`);
await browser.close();
