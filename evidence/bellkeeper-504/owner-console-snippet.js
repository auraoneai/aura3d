// Paste in DevTools console on https://aura3d.auraone.ai/apps/the-bellkeepers-walk/?start=1 (or after pressing Begin),
// then hold ArrowRight for ~5 s, release, and run: copy(JSON.stringify(window.__bk.summary()))  and paste it back.
(() => {
  const log = [], q = window.__AURA_WIND__;
  let on = true;
  const tick = (t) => { if (!on) return; const r = q.heroRig(), s = q.state(); log.push([+t.toFixed(2), r && r.animation && r.animation.clip, r && +r.animation.captureTime.toFixed(4), r && r.animation.crossFade, +s.pos.x.toFixed(3), +s.pos.z.toFixed(3), s.step]); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__bk = { stop() { on = false; }, log, summary() { on = false; const dts = log.slice(1).map((r, i) => r[0] - log[i][0]).sort((a, b) => a - b); let flips = 0; for (let i = 1; i < log.length; i++) if (log[i][1] !== log[i - 1][1]) flips++; return { frames: log.length, medianDtMs: dts[dts.length >> 1], p95DtMs: dts[Math.floor(dts.length * 0.95)], maxDtMs: dts.at(-1), clipFlips: flips, dpr: devicePixelRatio, ua: navigator.userAgent, sample: log.slice(Math.floor(log.length / 2), Math.floor(log.length / 2) + 30) }; } };
  console.log("recording: hold ArrowRight 5 s, release, then copy(JSON.stringify(window.__bk.summary()))");
})();
