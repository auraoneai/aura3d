// Locomotion metrics for the Aura FC athlete rigs: how fast the planted foot travels backwards (model units/s)
// in each cycle clip. Playing a cycle at rate = groundSpeed / (stanceSpeed * modelScale) keeps planted feet still.
import { readGlb, localPose, forward, clipDuration } from "./glb.mjs";

const HZ = 240;

export function stanceSamples(glb, clipName) {
  const anim = glb.json.animations.find((a) => a.name === clipName);
  if (!anim) throw new Error(`no clip ${clipName}`);
  const dur = clipDuration(glb, anim);
  const n = Math.round(dur * HZ);
  const samples = [];
  for (let k = 0; k <= n; k++) {
    const f = forward(glb, localPose(glb, anim, (dur * k) / n));
    const id = f.id.bind(f);
    const hz = f.pos[id("Hips")];
    const rel = (name) => { const p = f.pos[id(name)]; return [p[0] - hz[0], p[1], p[2] - hz[2]]; };
    samples.push({ t: (dur * k) / n, L: rel("LeftFoot"), R: rel("RightFoot") });
  }
  const dt = dur / n;
  const stance = [];
  for (const side of ["L", "R"]) {
    const ys = samples.map((s) => s[side][1]);
    const floor = Math.min(...ys);
    for (let k = 1; k < samples.length; k++) {
      const planted = samples[k][side][1] < floor + 0.03 && samples[k - 1][side][1] < floor + 0.03;
      const v = -(samples[k][side][2] - samples[k - 1][side][2]) / dt;
      if (planted && v > 0.2) stance.push({ side, v, y: samples[k][side][1] });
    }
  }
  return { dur, n, stance };
}

export function cycleMetrics(glb, clipName) {
  const { dur, n, stance } = stanceSamples(glb, clipName);
  const mean = stance.reduce((s, x) => s + x.v, 0) / Math.max(1, stance.length);
  const sd = Math.sqrt(stance.reduce((s, x) => s + (x.v - mean) ** 2, 0) / Math.max(1, stance.length));
  return { clip: clipName, duration: dur, plantedFraction: stance.length / (2 * n), stanceSpeed: mean, stanceSpeedSd: sd };
}

export function locomotionTable(glbPath, clips = ["Walk_Loop", "Run", "Sprint_Loop"]) {
  const glb = readGlb(glbPath);
  return clips.map((c) => cycleMetrics(glb, c));
}

if (process.argv[1] && process.argv[1].endsWith("clip-metrics.mjs") && process.argv[2]) {
  console.log(JSON.stringify(locomotionTable(process.argv[2]), null, 2));
}
