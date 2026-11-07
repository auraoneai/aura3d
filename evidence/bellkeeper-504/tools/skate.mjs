import fs from "node:fs";
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const F = d.frames; const W = 2.315, CL = 1.0667;
// sim ground speed from sim steps; phase speed from captureTime advance in Walk
let rows = [];
for (let i = 1; i < F.length; i++) {
  const a = F[i - 1], b = F[i];
  if (a.rig.animation.clip !== "Walk" || b.rig.animation.clip !== "Walk") continue;
  let dc = b.rig.animation.captureTime - a.rig.animation.captureTime; if (dc < -0.5) dc += CL;
  rows.push({ t: b.t, dt: (b.t - a.t) / 1000, dc, dx: b.sim.pos.x - a.sim.pos.x, dz: b.sim.pos.z - a.sim.pos.z, step: b.sim.step });
}
// window over 0.5 s
const win = 0.5; const out = [];
for (let s = 0; s + win <= rows.length * rows[0].dt; s += win) {
  const w = rows.filter((r) => r.t >= rows[0].t + s * 1000 && r.t < rows[0].t + (s + win) * 1000);
  const T = w.reduce((x, r) => x + r.dt, 0), dist = w.reduce((x, r) => x + Math.hypot(r.dx, r.dz), 0), ph = w.reduce((x, r) => x + r.dc, 0);
  out.push({ ground: +(dist / T).toFixed(3), foot: +(ph / T * W).toFixed(3), ratio: +((ph / T * W) / (dist / T)).toFixed(3) });
}
console.log(d.hz, JSON.stringify(out));
