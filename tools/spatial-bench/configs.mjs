// E6-01 matrix. Shared by the Node driver (run.mjs) and the browser harness (src/common/harness.ts).
// One config = one page load = one measurement. Every config is run for both viewers (aura, three).
//
// Fields
//   points     number of points streamed (float32 xyz + packed RGBA8); 0 = none
//   instances  number of boxes re-posed each sensor tick; 0 = none
//   segments   line segments (trajectories) re-posed each sensor tick; 0 = none
//   rateHz     sensor tick rate; 0 = static control (data uploaded once, never again)
//   fps        render target cadence (rAF cadence is 60 Hz; 30 renders every second rAF)
//   labels     DOM labels projected per frame
//   orbit      scripted camera orbit (deterministic per rendered frame index)
//   probe      { kind: "points" | "instances", n } picking probe after the measure window
//   variant    "loop" = three.js setMatrixAt loop instead of a direct array copy (three only)
//   shot       keep a screenshot of the last frame (rep 1 only)

export const WARMUP_MS = 3000;
export const MEASURE_MS = 20000;
export const SEED = 20261106;
export const TICK_RING = 4; // distinct pre-generated sensor frames, replayed cyclically

const base = { points: 0, instances: 0, segments: 0, rateHz: 0, fps: 60, labels: 0, orbit: true, probe: null, variant: null, shot: false };
const k = (n) => (n >= 1000000 ? `${n / 1000000}M` : `${n / 1000}K`);

export function buildConfigs() {
  const out = [];
  const add = (id, over) => out.push({ ...base, ...over, id });

  // Controls: harness overhead and static draw cost (0 Hz).
  add("ctl-empty", {});
  for (const n of [100000, 250000, 1000000]) add(`ctl-static-pts-${k(n)}`, { points: n, rateHz: 0, probe: n === 250000 ? { kind: "points", n: 10 } : null });
  add("ctl-static-inst-5K", { instances: 5000 });

  // Points streams: sizes x sensor rate x display target.
  for (const n of [100000, 250000, 1000000]) for (const hz of [10, 20]) for (const fps of [30, 60]) {
    add(`pts-${k(n)}-${hz}hz-${fps}fps`, { points: n, rateHz: hz, fps, probe: hz === 20 && fps === 60 ? { kind: "points", n: 10 } : null, shot: hz === 20 && fps === 60 });
  }
  // Typed mutable-buffer path (lane 515): `points.stream` + `handle.write` with packed u8 colors. Aura3D only.
  for (const n of [100000, 250000, 1000000]) for (const hz of [10, 20]) for (const fps of [30, 60]) {
    add(`pts-${k(n)}-${hz}hz-${fps}fps-typed`, { points: n, rateHz: hz, fps, variant: "typed", viewers: ["aura"], probe: hz === 20 && fps === 60 ? { kind: "points", n: 10 } : null, shot: hz === 20 && fps === 60 });
  }
  for (const n of [100000, 250000, 1000000]) add(`ctl-static-pts-${k(n)}-typed`, { points: n, rateHz: 0, variant: "typed", viewers: ["aura"] });
  // Instanced boxes re-posed every tick.
  for (const n of [1000, 5000, 10000]) for (const hz of [10, 20]) for (const fps of [30, 60]) {
    add(`inst-${k(n)}-${hz}hz-${fps}fps`, { instances: n, rateHz: hz, fps, probe: hz === 20 && fps === 60 ? { kind: "instances", n: 50 } : null, shot: hz === 20 && fps === 60 });
  }
  // three.js only: setMatrixAt loop instead of direct array copy (E6-00 section 5.3 asks for both).
  for (const n of [1000, 5000, 10000]) add(`inst-${k(n)}-20hz-60fps-loop`, { instances: n, rateHz: 20, fps: 60, variant: "loop", viewers: ["three"] });
  // Trajectories as lines (200 trails x 100 segments = 20K segments).
  for (const hz of [10, 20]) for (const fps of [60]) add(`trails-20K-${hz}hz-${fps}fps`, { segments: 20000, rateHz: hz, fps, shot: hz === 20 && fps === 60 });
  // Label overlay.
  add("labels-50-empty", { labels: 50, shot: true });
  add("labels-50-pts-100K-10hz", { labels: 50, points: 100000, rateHz: 10 });
  // Mixed scene: all three streams + labels, like a perception viewer.
  for (const hz of [10, 20]) for (const fps of [30, 60]) {
    add(`mixed-${hz}hz-${fps}fps`, { points: 250000, instances: 1000, segments: 20000, labels: 50, rateHz: hz, fps, shot: hz === 20 && fps === 60 });
  }
  for (const hz of [10, 20]) for (const fps of [30, 60]) {
    add(`mixed-${hz}hz-${fps}fps-typed`, { points: 250000, instances: 1000, segments: 20000, labels: 50, rateHz: hz, fps, variant: "typed", viewers: ["aura"], shot: hz === 20 && fps === 60 });
  }
  return out;
}

export function configFor(id) {
  return buildConfigs().find((c) => c.id === id);
}
