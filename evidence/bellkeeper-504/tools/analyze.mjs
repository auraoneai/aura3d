import fs from "node:fs";
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let flips = 0, prev = null, simChanges = 0, prevStep = null, cf = 0, moveFrames = 0, phaseBack = 0;
const rows = [];
let lastCap = null, lastClip = null, maxJump = 0;
for (const f of d.frames) {
  const a = f.rig.animation, clip = a.clip;
  if (prev && prev !== clip) flips++;
  prev = clip;
  if (a.crossFade) cf++;
  if (prevStep !== null && f.sim.step !== prevStep) simChanges++;
  prevStep = f.sim.step;
  if (lastClip === clip && clip === "Walk") { let dc = a.captureTime - lastCap; if (dc < -0.5) dc += 1.0667; if (dc < 0) phaseBack++; maxJump = Math.max(maxJump, dc); }
  lastCap = a.captureTime; lastClip = clip;
  rows.push([f.t.toFixed(1), f.sim.step, f.sim.pos.x.toFixed(3), clip, a.captureTime.toFixed(3), a.crossFade]);
}
const walkFrames = d.frames.filter((f) => f.rig.animation.clip === "Walk").length;
console.log(JSON.stringify({ hz: d.hz, frames: d.frames.length, flips, crossfadeIssues: cf, simStepChanges: simChanges, walkFrames, phaseBack, maxWalkPhaseAdvance: +maxJump.toFixed(4) }));
if (process.argv[3]) console.log(rows.slice(+process.argv[3], +process.argv[3] + 40).map((r) => r.join(" ")).join("\n"));
