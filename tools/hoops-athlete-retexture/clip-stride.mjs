#!/usr/bin/env node
// Measures the ground speed a locomotion clip travels at playback rate 1: planted-foot horizontal speed (relative to the
// root) during stance, by forward kinematics over the clip's keyframes. Usage: node clip-stride.mjs <athlete.glb> [clip...]
import { NodeIO } from "@gltf-transform/core";

const [, , file, ...wanted] = process.argv;
const io = new NodeIO();
const doc = await io.read(file);
const root = doc.getRoot();
const clips = root.listAnimations().filter((a) => wanted.length === 0 || wanted.includes(a.getName()));
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) { const o = a.map((v, i) => v + (bb[i] - v) * t); const l = Math.hypot(...o); return o.map((v) => v / l); }
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
};
function sample(ch, t) {
  const sampler = ch.getSampler();
  const times = sampler.getInput().getArray();
  const vals = sampler.getOutput();
  const n = times.length;
  const size = vals.getElementSize();
  const tt = Math.min(Math.max(t, times[0]), times[n - 1]);
  let i = 0;
  while (i < n - 2 && times[i + 1] < tt) i += 1;
  const a = vals.getElement(i, []), b = vals.getElement(Math.min(i + 1, n - 1), []);
  const u = times[i + 1] === times[i] ? 0 : (tt - times[i]) / (times[Math.min(i + 1, n - 1)] - times[i]);
  if (ch.getTargetPath() === "rotation" && size === 4) return slerp(a, b, u);
  return a.map((v, k) => v + (b[k] - v) * u);
}
const feet = root.listNodes().filter((n) => /^(Left|Right)Foot$/.test(n.getName()));
const skinRoot = root.listNodes().find((n) => n.getName() === "Root") ?? root.listNodes()[0];
for (const clip of clips) {
  const chans = clip.listChannels();
  let dur = 0;
  for (const c of chans) { const t = c.getSampler().getInput().getArray(); dur = Math.max(dur, t[t.length - 1]); }
  const steps = Math.max(24, Math.round(dur * 60));
  const track = { LeftFoot: [], RightFoot: [] };
  for (let s = 0; s <= steps; s += 1) {
    const t = (s / steps) * dur;
    for (const c of chans) {
      const node = c.getTargetNode();
      const v = sample(c, t);
      if (c.getTargetPath() === "translation") node.setTranslation(v);
      else if (c.getTargetPath() === "rotation") node.setRotation(v);
      else if (c.getTargetPath() === "scale") node.setScale(v);
    }
    const rootT = skinRoot.getWorldTranslation([]);
    for (const f of feet) track[f.getName()].push({ t, p: f.getWorldTranslation([]), r: rootT });
  }
  const out = {};
  for (const [name, pts] of Object.entries(track)) {
    const ymin = Math.min(...pts.map((q) => q.p[1]));
    const speeds = [];
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1], b = pts[i];
      if (a.p[1] - ymin > 0.06 || b.p[1] - ymin > 0.06) continue;
      const dx = (b.p[0] - b.r[0]) - (a.p[0] - a.r[0]), dz = (b.p[2] - b.r[2]) - (a.p[2] - a.r[2]);
      speeds.push(Math.hypot(dx, dz) / (b.t - a.t));
    }
    speeds.sort((x, y) => x - y);
    out[name] = { plantedSamples: speeds.length, medianSpeed: +(speeds[speeds.length >> 1] ?? 0).toFixed(3), lift: +(Math.max(...pts.map((q) => q.p[1])) - ymin).toFixed(3) };
  }
  console.log(JSON.stringify({ clip: clip.getName(), duration: +dur.toFixed(3), ...out }));
}
