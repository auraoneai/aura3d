/*
 * In-page instrumentation for the temporal-stability (flicker) probe.
 *
 * VIRTUAL_CLOCK_SCRIPT (init script, runs before any app code):
 *   - forces preserveDrawingBuffer on WebGL contexts so the canvas can be read back at any time;
 *   - wraps requestAnimationFrame / performance.now / Date.now. Until `__FLK__.enter()` everything is
 *     real-time. After it, rAF callbacks are queued and only run on `__FLK__.tick(dtMs)`, and the clocks
 *     advance by exactly dtMs per tick, so every run renders the same frame sequence at a true 60 Hz
 *     simulation step regardless of how slowly the GPU runner presents.
 */
export const VIRTUAL_CLOCK_SCRIPT = `(() => {
  if (window.__FLK__) return;
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  const realPerfNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const st = window.__FLK__ = { manual: false, t: 0, dateBase: 0, queue: new Map(), nextId: 1e7, ticks: 0, errors: [] };
  window.requestAnimationFrame = function (cb) {
    if (!st.manual) return realRaf(cb);
    const id = st.nextId++; st.queue.set(id, cb); return id;
  };
  window.cancelAnimationFrame = function (id) { if (!st.queue.delete(id)) realCancel(id); };
  performance.now = function () { return st.manual ? st.t : realPerfNow(); };
  Date.now = function () { return st.manual ? st.dateBase + st.t : realDateNow(); };
  // Jump 1 s ahead so no in-flight real rAF timestamp is later than the first virtual one.
  st.enter = () => { const now = realPerfNow(); st.dateBase = realDateNow() - now; st.t = now + 1000; st.manual = true; return st.t; };
  st.tick = (dt) => {
    st.t += dt; st.ticks++;
    const q = [...st.queue.values()]; st.queue.clear();
    for (const cb of q) { try { cb(st.t); } catch (e) { if (st.errors.length < 20) st.errors.push(String(e && e.stack || e).slice(0, 400)); } }
    return q.length;
  };
  st.pending = () => st.queue.size;
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (/^(webgl|webgl2|experimental-webgl)$/i.test(String(type))) attrs = { ...(attrs || {}), preserveDrawingBuffer: true };
    return origGetContext.call(this, type, attrs);
  };
})();`;

/**
 * Evaluated in page: advance one virtual frame, wait for the renderer to re-arm rAF (async frame mode
 * resolves in later tasks), then read the largest canvas and compute stats against the previous frame.
 * Returns per-frame numbers plus a 32x18 block-mean luma grid for localising flicker.
 */
export async function pageFrame({ dtMs, keepPng, grid }) {
  const st = window.__FLK__;
  const ran = st.tick(dtMs);
  const t0 = performance.now.call(performance); // virtual; use a real wait below
  const realWait = (ms) => new Promise((r) => setTimeout(r, ms));
  let waited = 0;
  // Wait until a callback is queued again (frame finished and re-armed) or 1.5 s real time passes.
  while (st.pending() === 0 && waited < 1500) { await realWait(5); waited += 5; }
  await realWait(0);
  const canvases = [...document.querySelectorAll("canvas")].filter((c) => c.width * c.height > 0)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const src = canvases[0];
  if (!src) return { ran, waited, error: "no canvas" };
  const w = src.width; const h = src.height;
  const work = window.__FLK_WORK__ ??= document.createElement("canvas");
  if (work.width !== w || work.height !== h) { work.width = w; work.height = h; window.__FLK_PREV__ = null; }
  const ctx = work.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const prev = window.__FLK_PREV__;
  const gx = grid[0]; const gy = grid[1];
  const cells = new Float64Array(gx * gy); const counts = new Uint32Array(gx * gy);
  let sum = 0; let clipLuma = 0; let clipAny = 0; let dark = 0; let diff = 0; let bigDiff = 0;
  const n = w * h;
  for (let y = 0; y < h; y++) {
    const cy = Math.min(gy - 1, Math.floor((y * gy) / h)) * gx;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const R = data[i]; const G = data[i + 1]; const B = data[i + 2];
      const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      sum += l;
      if (l >= 250) clipLuma++;
      if (R >= 250 || G >= 250 || B >= 250) clipAny++;
      if (l < 8) dark++;
      const c = cy + Math.min(gx - 1, Math.floor((x * gx) / w));
      cells[c] += l; counts[c]++;
      if (prev) {
        const d = (Math.abs(R - prev[i]) + Math.abs(G - prev[i + 1]) + Math.abs(B - prev[i + 2])) / 3;
        diff += d; if (d >= 32) bigDiff++;
      }
    }
  }
  window.__FLK_PREV__ = data;
  const out = {
    ran, waited, w, h,
    luma: +(sum / n).toFixed(3),
    clip: +(clipLuma / n).toFixed(5),
    clipAny: +(clipAny / n).toFixed(5),
    dark: +(dark / n).toFixed(5),
    mad: prev ? +(diff / n).toFixed(4) : null,
    bigDiff: prev ? +(bigDiff / n).toFixed(5) : null,
    grid: Array.from(cells, (v, k) => +(v / Math.max(1, counts[k])).toFixed(1))
  };
  if (keepPng) out.png = work.toDataURL("image/png");
  void t0;
  return out;
}

/** Evaluated in page: numeric renderer/diagnostic fields worth tracking per frame (exposure, tiers...). */
export function pageDiag() {
  const out = {};
  try {
    const apps = globalThis.__AURA3D_LIVE_APPS__?.all?.() ?? [];
    const d = apps[0]?.diagnostics?.();
    if (!d) return null;
    const walk = (obj, prefix, depth) => {
      if (!obj || typeof obj !== "object" || depth > 3) return;
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "number" && /expos|adapt|lum|bloom|jitter|taa|tier|scale|quality|ev|history|cascade|governor|fps|drawCalls/i.test(key)) out[key] = +v.toFixed(5);
        else if ((typeof v === "string" || typeof v === "boolean") && /tier|quality|taa|aa|tonemap|expos|governor/i.test(key)) out[key] = v;
        else if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(out).length < 120) walk(v, key, depth + 1);
      }
    };
    walk(d, "", 0);
  } catch (e) { out.error = String(e).slice(0, 200); }
  return out;
}
