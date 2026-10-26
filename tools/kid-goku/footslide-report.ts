// Writes evidence/kid-goku-beyond-the-clouds-port/footslide-fix/slide.json: library foot-slide meter over the planted gait at each sim speed.
// usage: node_modules/.bin/tsx tools/kid-goku/footslide-report.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { measure, newGaitStream } from "../../tests/unit/kid-goku-beyond-the-clouds-port/footslide-fk";
import { gaitParams, gaitWeight } from "../../examples/kid-goku-beyond-the-clouds-port/gait";

const rows = [2.5, 4.2, 6, 8, 10.2, 12, 14.5, 17.1, 19.6].map((v) => {
  const m = measure(v, 8, newGaitStream(v));
  const g = gaitParams(v);
  return { speed: v, weight: gaitWeight(v), cadenceStepsPerSecond: +g.cadence.toFixed(2), stanceSeconds: +g.stance.toFixed(3), leanDegrees: +((g.lean * 180) / Math.PI).toFixed(1), p95PlantedSpeed: +m.p95.toFixed(3), maxPlantedSpeed: +m.max.toFixed(3), plantedSamplesLeft: m.left.plantedSamples, plantedSamplesRight: m.right.plantedSamples, liftRange: +m.left.liftRange.toFixed(2), minKneeAngleDegrees: +m.minKneeBend.toFixed(0), passed: m.passed };
});
const dir = "evidence/kid-goku-beyond-the-clouds-port/footslide-fix";
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/slide.json`, JSON.stringify({ meter: "createFootSlideMeter, plantedHeight 0.06 m, threshold 0.15 m/s, 60 Hz, 8 s per speed, independent GLB forward kinematics (tests/unit/kid-goku-beyond-the-clouds-port/footslide-fk.ts)", rows }, null, 2) + "\n");
console.table(rows);
