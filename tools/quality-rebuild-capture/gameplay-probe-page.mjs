/*
 * In-page functions for gameplay-probe.mjs. Every export is passed to page.evaluate / addInitScript,
 * so each must be self-contained (no closures over module scope).
 */

/** Init script: key-event accounting + rAF counter, installed before any app script. */
export const PROBE_INIT_SCRIPT = `(() => {
  if (window.__GPK__) return;
  // C-24 evidence sections only collect for opted-in readers (packages/game/src/evidence/channel.ts).
  window.__AURA3D_EVIDENCE_OPT_IN__ = true;
  const k = window.__GPK__ = { capture: 0, bubble: 0, untrusted: 0, prevented: 0, raf: 0, synthetic: [] };
  const onCap = (e) => {
    k.capture++;
    if (!e.isTrusted) { k.untrusted++; if (k.synthetic.length < 20) k.synthetic.push(e.type + ":" + e.code); }
  };
  const onBub = (e) => { k.bubble++; if (e.defaultPrevented) k.prevented++; };
  window.addEventListener("keydown", onCap, true);
  window.addEventListener("keyup", onCap, true);
  window.addEventListener("keydown", onBub, false);
  window.addEventListener("keyup", onBub, false);
  const tick = () => { k.raf++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

/** Readiness: C-24 beacon `playing`, else any canvas with draw calls. */
export function probeReady() {
  let beacon = null;
  try { beacon = window.__AURA3D_GAME__?.state ?? null; } catch { /* ignore */ }
  let draws = 0;
  try {
    for (const app of globalThis.__AURA3D_LIVE_APPS__?.all?.() ?? []) {
      try { draws = Math.max(draws, Number(app.diagnostics()?.drawCalls ?? 0)); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return { beacon, draws, canvases: document.querySelectorAll("canvas").length };
}

/**
 * One state sample: flattened leaves of every evidence/proof/showcase global plus the C-24 beacon,
 * every runtime node position of every live app, rAF count and key-event counters.
 */
export function probeSample() {
  const MAX = 3000;
  const leaves = {};
  let n = 0;
  const seen = new WeakSet();
  const isDom = (v) => typeof Node !== "undefined" && v instanceof Node;
  const walk = (v, p, d) => {
    if (n >= MAX || v === null || v === undefined) return;
    const t = typeof v;
    if (t === "number") { leaves[p] = Number.isFinite(v) ? +v.toFixed(5) : String(v); n++; return; }
    if (t === "boolean") { leaves[p] = v ? 1 : 0; n++; return; }
    if (t === "string") { if (v.length <= 48) { leaves[p] = `s:${v}`; n++; } return; }
    if (t !== "object" || d > 6 || isDom(v)) return;
    if (ArrayBuffer.isView(v)) {
      if (v.length <= 16) for (let i = 0; i < v.length; i++) walk(v[i], `${p}.${i}`, d + 1);
      return;
    }
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      leaves[`${p}.length`] = v.length; n++;
      for (let i = 0; i < Math.min(v.length, 12); i++) walk(v[i], `${p}.${i}`, d + 1);
      return;
    }
    let keys;
    try { keys = Object.keys(v); } catch { return; }
    for (const key of keys.slice(0, 90)) {
      let child;
      try { child = v[key]; } catch { continue; }
      if (typeof child === "function") continue;
      walk(child, `${p}.${key}`, d + 1);
    }
  };
  const globals = Object.keys(window).filter((k) => /^__[A-Z0-9_]*(EVIDENCE|PROOF|SHOWCASE)[A-Z0-9_]*__$/.test(k) && !/SNAPSHOT/.test(k));
  for (const key of ["__AURA3D_GAME__", ...globals]) {
    let v;
    try { v = window[key]; } catch { continue; }
    if (v && typeof v === "object") walk(v, key, 0);
  }
  const nodes = {};
  let frame = null;
  let paused = null;
  try {
    for (const [ai, app] of (globalThis.__AURA3D_LIVE_APPS__?.all?.() ?? []).entries()) {
      try { frame = app.runtime?.frame ?? frame; paused = app.runtime?.paused ?? paused; } catch { /* ignore */ }
      let all = [];
      try { all = app.nodes?.all?.() ?? []; } catch { /* ignore */ }
      for (const h of all.slice(0, 600)) {
        try {
          const pos = h.position;
          if (pos && pos.length >= 3) nodes[`${ai}:${h.id}`] = [Number(pos[0]), Number(pos[1]), Number(pos[2])];
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  const k = window.__GPK__ ?? {};
  return {
    t: performance.now(), raf: k.raf ?? 0, frame, paused,
    keys: { capture: k.capture ?? 0, bubble: k.bubble ?? 0, untrusted: k.untrusted ?? 0, prevented: k.prevented ?? 0, synthetic: k.synthetic ?? [] },
    active: document.activeElement ? `${document.activeElement.tagName.toLowerCase()}${document.activeElement.id ? `#${document.activeElement.id}` : ""}` : null,
    leafCount: n, leaves, nodes
  };
}
