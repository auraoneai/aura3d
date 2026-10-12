/*
 * Analysis for gameplay-probe.mjs: turns per-phase state samples into drift / response / sinking /
 * NaN / fps findings. Pure functions over JSON, unit-testable without a browser.
 */

// Leaves that change every frame regardless of gameplay (clocks, counters, perf telemetry).
const NOISE = /(time|frame|fps|tick|clock|now|elapsed|seconds|\bms\b|Ms$|budget|draw|gpu|heap|timing|perf|latency|age|seed|hash|count$|uptime|samples|audio|beat|pulse|flicker|shimmer|ambient|idle|sway|bob|wobble|breath|crowd|spark|particle|emitter|cloud|wind|wave\d|water|loop)/i;
const PLAYERISH = /(player|car|ship|craft|hero|lander|pod|ball|cue|mech|fighter|runner|sub\b|submarine|plane|jet|wing|thief|avatar|vehicle|kart|turret|cannon|paddle|piece|active|self|p1)/i;
const KINEMATIC = /(^|\.)(x|y|z|0|1|2|pos\w*|position\w*|speed|velocity\w*|vx|vy|vz|heading|yaw|angle|steer\w*|lane|state|phase|mode)$/i;

const num = (v) => (typeof v === "number" ? v : null);

/** range (max-min) of a numeric leaf across samples, or 1 when a string leaf changed. */
function leafRange(samples, key) {
  let min = Infinity; let max = -Infinity; let first; let changed = false;
  for (const s of samples) {
    const v = s.leaves[key];
    if (v === undefined) continue;
    if (first === undefined) first = v; else if (v !== first) changed = true;
    const x = num(v);
    if (x !== null) { if (x < min) min = x; if (x > max) max = x; }
  }
  if (min !== Infinity) return { range: max - min, first, last: samples.at(-1)?.leaves[key], changed };
  return { range: changed ? 1 : 0, first, last: samples.at(-1)?.leaves[key], changed };
}

function nodeDisp(samples, id) {
  const a = samples.find((s) => s.nodes[id])?.nodes[id];
  if (!a) return { disp: 0 };
  let max = 0; let last = a; let minY = a[1];
  for (const s of samples) {
    const p = s.nodes[id];
    if (!p) continue;
    const d = Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
    if (Number.isFinite(d) && d > max) max = d;
    if (p[1] < minY) minY = p[1];
    last = p;
  }
  return { disp: max, from: a, to: last, minY };
}

const r = (x) => (typeof x === "number" ? +x.toFixed(3) : x);

function phaseStats(phase, idle) {
  const s = phase.samples;
  const first = s[0]; const last = s.at(-1);
  const seconds = Math.max(0.001, (last.t - first.t) / 1000);
  const fps = +((last.raf - first.raf) / seconds).toFixed(1);
  const keys = new Set(s.flatMap((x) => Object.keys(x.leaves)));
  const changed = [];
  for (const key of keys) {
    const lr = leafRange(s, key);
    if (!(lr.range > 1e-4) && !lr.changed) continue;
    changed.push({ key, ...lr });
  }
  const idleBy = new Map((idle?.changed ?? []).map((c) => [c.key, c]));
  // Response = differs from the no-input trend: a leaf idle never touched, or one whose net change
  // departs from the idle slope (x phase seconds) by more than idle's oscillation (range - |net|).
  const netOf = (c) => (typeof c.first === "number" && typeof c.last === "number" ? c.last - c.first : null);
  const response = changed.filter((c) => {
    if (NOISE.test(c.key)) return false;
    const ic = idleBy.get(c.key);
    if (!ic) return true;
    const net = netOf(c); const inet = netOf(ic);
    if (net === null || inet === null) return false;
    const expected = (inet / idle.seconds) * seconds;
    const wobble = Math.max(0, ic.range - Math.abs(inet));
    return Math.abs(net - expected) > 2 * wobble + 0.05 * Math.abs(expected) + 1e-3;
  });
  const nodeIds = new Set(s.flatMap((x) => Object.keys(x.nodes)));
  const moved = [];
  for (const id of nodeIds) {
    const d = nodeDisp(s, id);
    if (d.disp > 0.02) moved.push({ id, ...d });
  }
  const idleMovedBy = new Map((idle?.moved ?? []).map((m) => [m.id, m]));
  const movedResponse = moved.filter((m) => {
    const im = idleMovedBy.get(m.id);
    if (!im) return true;
    const k = seconds / idle.seconds;
    const net = m.to.map((v, i) => v - m.from[i]); const inet = im.to.map((v, i) => (v - im.from[i]) * k);
    const resid = Math.hypot(net[0] - inet[0], net[1] - inet[1], net[2] - inet[2]);
    const wobble = Math.max(0, im.disp - Math.hypot(...im.to.map((v, i) => v - im.from[i])));
    return resid > 2 * wobble + 0.05 * Math.hypot(...inet) + 0.05;
  });
  const nan = [...keys].filter((k) => /^(NaN|Infinity|-Infinity)$/.test(String(last.leaves[k])));
  for (const id of nodeIds) if (last.nodes[id] && last.nodes[id].some((v) => !Number.isFinite(v))) nan.push(`node:${id}`);
  const k0 = first.keys; const k1 = last.keys;
  return {
    name: phase.name, input: phase.input ?? null, seconds: +seconds.toFixed(2), fps, samples: s.length,
    frameAdvance: first.frame !== null && last.frame !== null ? last.frame - first.frame : null,
    keyEvents: { capture: k1.capture - k0.capture, bubble: k1.bubble - k0.bubble, untrusted: k1.untrusted - k0.untrusted, prevented: k1.prevented - k0.prevented },
    changed, moved, response, movedResponse, nan
  };
}

const top = (list, n, by) => [...list].sort((a, b) => by(b) - by(a)).slice(0, n);
const leafBrief = (c) => `${c.key.replace(/^__AURA3D_GAME_EVIDENCE__\.[^.]+\./, "ev.")}: ${r(c.first)}→${r(c.last)} (Δ${r(c.range)})`;
const nodeBrief = (m) => `${m.id} ${r(m.disp)}m`;

/** Analyse one game run (phases: idle, [setup, idle-after-setup], controls...). */
export function analyseRun(phases) {
  const out = { phases: [] };
  const idle = phases.find((p) => p.name === "idle");
  const idleStats = idle ? phaseStats(idle, null) : null;
  let baseIdle = idleStats;
  for (const phase of phases) {
    if (!phase.samples?.length) continue;
    const isIdle = phase.name.startsWith("idle");
    const st = phase === idle ? idleStats : phaseStats(phase, isIdle ? null : baseIdle);
    if (phase.name === "idle-after-setup") baseIdle = st;
    out.phases.push(st);
  }
  // Drift: player-ish kinematic leaves / nodes moving with no input.
  out.drift = [];
  for (const st of out.phases.filter((p) => p.name.startsWith("idle"))) {
    const leaves = st.changed.filter((c) => !NOISE.test(c.key) && PLAYERISH.test(c.key) && KINEMATIC.test(c.key));
    out.drift.push({ phase: st.name, playerLeaves: top(leaves, 8, (c) => c.range).map(leafBrief), movingNodes: st.moved.length, topNodes: top(st.moved, 6, (m) => m.disp).map(nodeBrief) });
  }
  // Sinking: any node ending > 1m below where it started and below its own minimum-in-first-phase.
  const all = phases.flatMap((p) => p.samples ?? []);
  const ids = new Set(all.flatMap((s) => Object.keys(s.nodes)));
  out.sinking = [];
  for (const id of ids) {
    const d = nodeDisp(all, id);
    if (d.from && d.to && d.from[1] - d.to[1] > 1 && d.to[1] <= d.minY + 0.05) out.sinking.push(`${id} y ${r(d.from[1])}→${r(d.to[1])}`);
  }
  const yLeaves = new Set(all.flatMap((s) => Object.keys(s.leaves)).filter((k) => /(^|\.)(y|posY|height|altitude|1)$/i.test(k) && PLAYERISH.test(k) && !NOISE.test(k)));
  for (const key of yLeaves) {
    const lr = leafRange(all, key);
    if (typeof lr.first === "number" && typeof lr.last === "number" && lr.first - lr.last > 1) out.sinking.push(`${key} ${r(lr.first)}→${r(lr.last)}`);
  }
  out.sinking = out.sinking.slice(0, 12);
  out.nan = [...new Set(out.phases.flatMap((p) => p.nan))].slice(0, 12);
  out.controls = out.phases.filter((p) => !p.name.startsWith("idle") && p.name !== "setup").map((p) => ({
    name: p.name, input: p.input, keyEvents: p.keyEvents, fps: p.fps,
    responseLeaves: p.response.length, movedNodes: p.movedResponse.length,
    top: top(p.response, 6, (c) => (PLAYERISH.test(c.key) ? 1e6 : 0) + c.range).map(leafBrief),
    topNodes: top(p.movedResponse, 4, (m) => m.disp).map(nodeBrief)
  }));
  out.fpsIdle = idleStats?.fps ?? null;
  out.leafCount = all.at(-1)?.leafCount ?? 0;
  out.nodeCount = Object.keys(all.at(-1)?.nodes ?? {}).length;
  // Drop the bulky per-leaf lists; keep briefs.
  out.phases = out.phases.map(({ changed, moved, response, movedResponse, ...rest }) => ({
    ...rest, changedLeaves: changed.length, movedNodes: moved.length,
    changedTop: top(changed.filter((c) => !NOISE.test(c.key)), 40, (c) => (PLAYERISH.test(c.key) ? 1e6 : 0) + c.range).map(leafBrief),
    responseTop: top(response, 40, (c) => (PLAYERISH.test(c.key) ? 1e6 : 0) + c.range).map(leafBrief),
    movedTop: top(moved, 12, (m) => m.disp).map(nodeBrief),
    movedResponseTop: top(movedResponse, 12, (m) => m.disp).map(nodeBrief)
  }));
  return out;
}

/** One markdown row per game x variant. */
export function summaryRow(gameId, variant, run) {
  if (run.error) return `| ${gameId} | ${variant} | ERROR ${String(run.error).slice(0, 120).replace(/\|/g, "/")} | | | | |`;
  const a = run.analysis;
  const drift = a.drift.map((d) => `${d.phase}: nodes ${d.movingNodes}${d.playerLeaves.length ? `; ${d.playerLeaves.slice(0, 3).join("; ")}` : ""}`).join("<br>");
  const ctl = a.controls.map((c) => `${c.name}: ${c.responseLeaves}L/${c.movedNodes}N k${c.keyEvents.capture}/${c.keyEvents.bubble}${c.keyEvents.untrusted ? ` U${c.keyEvents.untrusted}` : ""}`).join("<br>");
  return `| ${gameId} | ${variant} | ${run.fpsClean ?? "?"} (${a.fpsIdle} sampled) | ${drift.replace(/\|/g, "/")} | ${ctl} | ${a.sinking.slice(0, 3).join("<br>") || "-"} | ${a.nan.slice(0, 3).join(", ") || "-"} |`;
}
