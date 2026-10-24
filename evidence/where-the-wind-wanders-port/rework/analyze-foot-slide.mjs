const file = process.argv[3];
import fs from "node:fs";
const b = fs.readFileSync(file); const jl = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jl).toString()); const bin = b.slice(20 + jl + 8);
const cnt = { SCALAR: 1, VEC3: 3, VEC4: 4 };
function acc(i) { const a = j.accessors[i], bv = j.bufferViews[a.bufferView]; const n = cnt[a.type]; const off = (bv.byteOffset || 0) + (a.byteOffset || 0); const o = new Float64Array(a.count * n); for (let k = 0; k < o.length; k++) o[k] = bin.readFloatLE(off + k * 4); return { o, n, count: a.count }; }
const parent = new Array(j.nodes.length).fill(-1); j.nodes.forEach((n, i) => (n.children || []).forEach(c => (parent[c] = i)));
const mul = (a, b) => { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k]; return r; };
const compose = (t, q, s) => { const [x, y, z, w] = q; const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z; return [(1 - 2 * (yy + zz)) * s[0], (2 * (xy + wz)) * s[0], (2 * (xz - wy)) * s[0], 0, (2 * (xy - wz)) * s[1], (1 - 2 * (xx + zz)) * s[1], (2 * (yz + wx)) * s[1], 0, (2 * (xz + wy)) * s[2], (2 * (yz - wx)) * s[2], (1 - 2 * (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; };
function slerp(a, b, t) { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; let bb = b; if (d < 0) { d = -d; bb = b.map(v => -v); } if (d > 0.9995) { const r = a.map((v, i) => v + (bb[i] - v) * t); const l = Math.hypot(...r); return r.map(v => v / l); } const th = Math.acos(d), s = Math.sin(th); const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s; return a.map((v, i) => v * wa + bb[i] * wb); }
function sample(an, time) {
  const tr = j.nodes.map(n => ({ t: n.translation || [0, 0, 0], q: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] }));
  for (const c of an.channels) { const s = an.samplers[c.sampler]; const inp = acc(s.input).o; const out = acc(s.output); const T = inp[inp.length - 1]; const tt = time % T; let i = 0; while (i < inp.length - 2 && inp[i + 1] <= tt) i++; const f = (tt - inp[i]) / Math.max(1e-9, inp[i + 1] - inp[i]); const n = out.n; const A = Array.from(out.o.slice(i * n, i * n + n)), B = Array.from(out.o.slice((i + 1) * n, (i + 1) * n + n)); const p = c.target.path; if (p === "rotation") tr[c.target.node].q = slerp(A, B, f); else tr[c.target.node][p === "translation" ? "t" : "s"] = A.map((v, k) => v + (B[k] - v) * f); }
  const g = new Array(j.nodes.length); const get = i => g[i] ?? (g[i] = parent[i] < 0 ? compose(tr[i].t, tr[i].q, tr[i].s) : mul(get(parent[i]), compose(tr[i].t, tr[i].q, tr[i].s))); j.nodes.forEach((_, i) => get(i)); return g;
}
const log = process.argv[2]; const DT = 0.0167; const SCALE = 2.9 / 1.75;
const clipByName = Object.fromEntries(j.animations.map((a) => [a.name, a]));
const durOf = (a) => Math.max(...a.samplers.map((s) => acc(s.input).o.slice(-1)[0]));
const footIdx = ["LeftFoot", "RightFoot"].map((nm) => j.nodes.findIndex((n) => n.name === nm));
const footZ = (clip, t) => { const g = sample(clipByName[clip], ((t % durOf(clipByName[clip])) + durOf(clipByName[clip])) % durOf(clipByName[clip])); return footIdx.map((f) => ({ z: g[f][14] * SCALE, y: g[f][13] * SCALE })); };
const rows = { idle: [], walk: [] };
for (const line of fs.readFileSync(log, "utf8").split("\n")) { const m = line.match(/RWWND_ROW (idle|walk) (\{.*\})/); if (m) rows[m[1]].push(JSON.parse(m[2])); }
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
function effective(rig, durClip) {
  const a = rig?.animation; if (!a) return null;
  const startTime = a.startTime ?? 0; const raw = Math.max(0, rig.renderTime - startTime);
  if (a.captureTime !== undefined) { const ph = Math.max(0, a.captureTime); return a.loop !== false ? ((ph + raw) % durClip) : ph % durClip; }
  return raw % durClip;
}
function analyse(name, rs) {
  const out = { name, frames: rs.length, clips: {}, haveAnim: 0 }; const per = [];
  for (let i = 1; i < rs.length; i++) {
    const r = rs[i], p = rs[i - 1]; const a = r.rig?.animation; if (!a) continue; out.haveAnim++;
    out.clips[a.clip] = (out.clips[a.clip] ?? 0) + 1;
    const clip = clipByName[a.clip]; if (!clip) continue; const dur = durOf(clip);
    const t1 = effective(r.rig, dur), t0 = effective(p.rig, dur); if (t1 == null || t0 == null) continue;
    let dt = t1 - t0; if (dt < -dur / 2) dt += dur; if (dt > dur / 2) dt -= dur; // clip phase advance per sim step
    const speed = Math.hypot(r.x - p.x, r.z - p.z) / DT;
    const f1 = footZ(a.clip, t1), f0 = footZ(a.clip, t0);
    per.push({ speed, phaseRate: dt / DT, clip: a.clip, f: f1.map((f, k) => ({ y: f.y, v: Math.abs(f.z - f0[k].z) / DT })), t1 });
  }
  out.groundSpeedMedian = +med(per.map((q) => q.speed)).toFixed(3);
  out.phaseRateMedian = +med(per.map((q) => q.phaseRate)).toFixed(3);
  const sl = []; const swing = [];
  for (let k = 0; k < 2; k++) {
    const ys = per.map((q) => q.f[k].y), lo = Math.min(...ys), hi = Math.max(...ys), thr = lo + 0.25 * (hi - lo);
    per.forEach((q) => { if (q.f[k].y <= thr && hi - lo > 0.02 && q.speed > 1) sl.push(Math.abs(q.speed - q.f[k].v)); });
  }
  out.plantedFootSlideMedian = sl.length ? +med(sl).toFixed(3) : null; out.stanceSamples = sl.length;
  out.plantedFootSlideRatio = sl.length && out.groundSpeedMedian > 0 ? +(med(sl) / out.groundSpeedMedian).toFixed(3) : null;
  return out;
}
console.log(JSON.stringify({ idle: analyse("idle", rows.idle), walk: analyse("walk", rows.walk) }, null, 1));
