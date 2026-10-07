/**
 * C-22 `shake` (trauma) layer (PRD-08 §6.5): 6-DoF trauma noise — `trauma²`
 * amplitude, seeded Perlin per channel at `frequency` Hz, smoothstep(0,0.05)
 * terminal fade; translation scaled by min(1, subjectDistance/6) so rotation
 * dominates at range. Reduced motion: amplitude ×0.25, roll ×0.
 */
import type { AuraTraumaLayer } from "../../../contracts/camera.js";
import { createNoise1D } from "../../feel/Noise.js";
import { add, cross, DEG, normalize, rotateAxis, scale, smoothstep, sub } from "./shared.js";

/**
 * `shake` — 6-DoF trauma noise. `configure` accepts the base
 * `AuraTraumaLayer.configure` fields plus the CCR-08-3 additive fields
 * (maxYawDeg/maxPitchDeg/maxRollDeg/seed), shipped from this lane module.
 */
export function createTraumaLayer(): AuraTraumaLayer {
  let trauma = 0;
  let maxOffset = 0.05;
  let maxYawDeg = 1.5;
  let maxPitchDeg = 1.5;
  let maxRollDeg = 2.5;
  let frequency = 18;
  let decayPerSecond = 1.6;
  let noises = [
    createNoise1D(1001),
    createNoise1D(2002),
    createNoise1D(3003),
    createNoise1D(4004),
    createNoise1D(5005),
    createNoise1D(6006)
  ];
  let clock = 0;

  return {
    id: "trauma",
    add(amount) {
      trauma = Math.min(1, Math.max(0, trauma + amount));
    },
    configure(o: {
      maxAngleDeg?: number;
      maxOffset?: number;
      frequency?: number;
      decayPerSecond?: number;
      // CCR-08-3 additive fields (shipped from this lane module).
      maxYawDeg?: number;
      maxPitchDeg?: number;
      maxRollDeg?: number;
      seed?: number;
    }) {
      if (o.maxOffset !== undefined) maxOffset = o.maxOffset;
      if (o.maxAngleDeg !== undefined) {
        maxYawDeg = o.maxAngleDeg;
        maxPitchDeg = o.maxAngleDeg;
        maxRollDeg = o.maxAngleDeg;
      }
      if (o.maxYawDeg !== undefined) maxYawDeg = o.maxYawDeg;
      if (o.maxPitchDeg !== undefined) maxPitchDeg = o.maxPitchDeg;
      if (o.maxRollDeg !== undefined) maxRollDeg = o.maxRollDeg;
      if (o.frequency !== undefined) frequency = o.frequency;
      if (o.decayPerSecond !== undefined) decayPerSecond = o.decayPerSecond;
      if (o.seed !== undefined) {
        const s = o.seed;
        noises = [0, 1, 2, 3, 4, 5].map((i) => createNoise1D(s + i * 1009));
      }
    },
    apply(pose, ctx) {
      clock += ctx.dt;
      trauma = Math.max(0, trauma - decayPerSecond * ctx.dt);
      const band = smoothstep(0, 0.05, trauma);
      const motionScale = ctx.reducedMotion ? 0.25 : 1;
      const amp = trauma * trauma * band * motionScale;
      if (amp <= 0) return pose;

      const t = clock * frequency;
      const n = noises.map((noise, i) => noise(t + i * 17.13));
      const dir = sub(pose.target, pose.position);
      const dist = Math.hypot(dir[0], dir[1], dir[2]);
      const transScale = Math.min(1, dist / 6);
      const offset = scale([n[0], n[1], n[2]], maxOffset * amp * transScale);

      const viewDir = normalize(dir);
      const right = normalize(cross(viewDir, pose.up));
      const camUp = normalize(cross(right, viewDir));
      const yaw = n[3] * maxYawDeg * DEG * amp;
      const pitch = n[4] * maxPitchDeg * DEG * amp;
      const rollOff = n[5] * maxRollDeg * DEG * amp;

      let newTargetDir = rotateAxis(viewDir, camUp, yaw);
      newTargetDir = rotateAxis(newTargetDir, right, pitch);
      const newTarget = add(pose.position, scale(newTargetDir, Math.max(dist, 1e-3)));
      return {
        ...pose,
        position: add(pose.position, offset),
        target: newTarget,
        roll: pose.roll + (ctx.reducedMotion ? 0 : rollOff)
      };
    },
    energy: () => trauma
  };
}
