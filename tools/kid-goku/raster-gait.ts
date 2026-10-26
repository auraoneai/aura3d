// Offline silhouette filmstrip of the hero's planted gait (no GPU, no browser): skins examples/kid-goku-beyond-the-clouds-port/assets/meshy/hero.glb
// with the run clip plus the gait overlay from gait.ts and writes a side-view strip across one stride.
// usage: node_modules/.bin/tsx tools/kid-goku/raster-gait.ts <speed m/s> <out.png> [frames=8] [px=360]
import { writeFileSync } from "node:fs";
import { readGlb, localPose, clipDuration } from "../aura-fc/glb.mjs";
import { png, rasterise } from "../aura-fc/raster.mjs";
import { advanceGaitPhase, CLIP_TOUCHDOWN_LEFT, gaitWeight, plantedGaitPose } from "../../examples/kid-goku-beyond-the-clouds-port/gait";

const [speedArg, out, framesArg, pxArg] = process.argv.slice(2);
const speed = Number(speedArg), frames = Number(framesArg ?? 8), px = Number(pxArg ?? 360);
const glb = readGlb("examples/kid-goku-beyond-the-clouds-port/assets/meshy/hero.glb");
const run = glb.json.animations.find((a: { name: string }) => a.name === "run");
const dur = clipDuration(glb, run);
const names: string[] = glb.json.nodes.map((n: { name: string }) => n.name);
const cycle = 2 / Math.max(2.8, Math.min(4.6, 2.8 + 0.085 * speed));
const strips: { img: Buffer; W: number; H: number }[] = [];
for (let k = 0; k < frames; k++) {
  const phase = k / frames;
  const trs = localPose(glb, run, ((phase + CLIP_TOUCHDOWN_LEFT) % 1) * dur) as { t: number[]; r: number[] }[];
  const pose = plantedGaitPose(speed, phase, gaitWeight(speed) > 0 ? 1 : 0);
  if (pose) for (const [name, tr] of Object.entries(pose.bones)) {
    const i = names.indexOf(name);
    if (tr.position) trs[i]!.t = [tr.position.x, tr.position.y, tr.position.z];
    trs[i]!.r = [tr.rotation.x, tr.rotation.y, tr.rotation.z, tr.rotation.w];
  }
  strips.push(rasterise(glb, "run", 0, "side", px, { pose: trs, unit: 0.01 * (1.5 / 1.2), raw: true }) as { img: Buffer; W: number; H: number });
}
void advanceGaitPhase; void cycle;
const W = px * frames, H = px;
const img = Buffer.alloc(W * H * 3);
strips.forEach((s, k) => { for (let y = 0; y < H; y++) s.img.copy(img, (y * W + k * px) * 3, y * px * 3, (y + 1) * px * 3); });
writeFileSync(out!, png(W, H, img));
console.log(`wrote ${out} (${frames} frames at ${speed} m/s)`);
