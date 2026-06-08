// Source + runtime readiness gate for T1.1 Inertialization. Confirms the inertialization module
// exists, behaves correctly (non-linear, deterministic, continuous), and that the crossfade call
// sites across @aura3d/animation and the Aura Clash arena route through the inertialized path with
// the proof object wired. Pure Node; exits non-zero on any failure.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createInertializer,
  fighterCrossfadeWeights,
  fighterInertializedWeights,
  inertializedScalar,
  inertializedTransitionWeight
} from "../../packages/animation/src";

interface Check {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

// 1. Required files present.
const requiredFiles = [
  "packages/animation/src/Inertialization.ts",
  "packages/animation/src/FighterAnimationAdapter.ts",
  "packages/animation/src/AnimationMixer.ts",
  "packages/animation/src/AnimationStateMachine.ts",
  "packages/animation/src/LocomotionKit.ts",
  "tests/unit/animation/inertialization.test.ts",
  "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts"
] as const;
const missing = requiredFiles.filter((file) => !existsSync(resolve(file)));
check("required-files-present", missing.length === 0, missing.join(", ") || "all inertialization files exist");

// 2. Runtime: at t=0 weight is fully on the source (continuity).
check("transition-weight-continuous-at-zero", inertializedTransitionWeight(0, 0.1) === 1, "source weight = 1 at t=0");

// 3. Runtime: the inertialized weight is genuinely non-linear vs the linear crossfade mid-window.
const inert = fighterInertializedWeights("idle", "walk", 0.1, 0.2);
const linear = fighterCrossfadeWeights("idle", "walk", 0.1, 0.2);
const divergence = Math.abs(inert.weights[0] - linear.weights[0]);
check("non-linear-vs-linear-crossfade", divergence > 1e-3 && Math.abs(inert.weights[0] + inert.weights[1] - 1) < 1e-9, `mid-window divergence=${divergence.toFixed(4)}, sum=${(inert.weights[0] + inert.weights[1]).toFixed(4)}`);

// 4. Runtime: decays monotonically toward zero (energy decay).
let prev = 1;
let monotonic = true;
for (let i = 1; i <= 60; i += 1) {
  const w = inertializedTransitionWeight(i * 0.02, 0.1);
  if (w > prev + 1e-9) monotonic = false;
  prev = w;
}
check("monotonic-decay-to-zero", monotonic && prev < 0.05, `settled weight=${prev.toFixed(4)}`);

// 5. Runtime: deterministic (same inputs => identical output).
const determinism = inertializedScalar(3.5, -1.2, 0.037, 0.1) === inertializedScalar(3.5, -1.2, 0.037, 0.1);
check("deterministic", determinism, "identical output for identical inputs");

// 6. Runtime: pose-space inertializer t=0 equals source, settles to target.
const before = { hip: [0, 1, 0] as [number, number, number], speed: 4 };
const after = { hip: [0, 1.4, 0.5] as [number, number, number], speed: 0 };
const poseInert = createInertializer({ halfLife: 0.1 });
poseInert.recordTransition(before, after);
const atZero = poseInert.sampleInertialized(0);
const settled = poseInert.sampleInertialized(2);
const sourceMatch = JSON.stringify(atZero.hip) === JSON.stringify(before.hip) && atZero.speed === 4;
const targetMatch = Math.abs((settled.speed as number)) < 1e-3 && Math.abs((settled.hip as number[])[1] - 1.4) < 1e-3;
check("pose-space-source-and-target", sourceMatch && targetMatch && poseInert.settled(2), `t0Source=${sourceMatch}, settled=${targetMatch}`);

// 7. Source wiring: barrels export the inertialization API.
const indexSrc = read("packages/animation/src/index.ts");
const browserSrc = read("packages/animation/src/browser-index.ts");
check("exported-from-barrels", indexSrc.includes("./Inertialization.js") && browserSrc.includes("./Inertialization.js"), "Inertialization exported from index.ts + browser-index.ts");

// 8. Source wiring: fighter adapter exposes the inertialized weights as the default transition.
const adapterSrc = read("packages/animation/src/FighterAnimationAdapter.ts");
check("fighter-adapter-inertialized", adapterSrc.includes("fighterInertializedWeights") && adapterSrc.includes("inertializedTransitionWeight"), "fighterInertializedWeights present and built on the inertializer");

// 9. Source wiring: mixer + state machine + locomotion kit route transitions through inertialization.
const mixerSrc = read("packages/animation/src/AnimationMixer.ts");
const smSrc = read("packages/animation/src/AnimationStateMachine.ts");
const kitSrc = read("packages/animation/src/LocomotionKit.ts");
check("mixer-inertial-crossfade", mixerSrc.includes("inertialCrossFade") && mixerSrc.includes("inertializedTransitionWeight"), "AnimationMixer.inertialCrossFade wired");
check("state-machine-state-blend", smSrc.includes("stateBlend") && smSrc.includes("inertializedTransitionWeight"), "AnimationStateMachine.stateBlend wired");
check("locomotion-kit-state-transition", kitSrc.includes("stateTransition") && kitSrc.includes("stateBlend"), "LocomotionKit sample exposes the inertialized stateTransition");

// 10. Source wiring: the Aura Clash arena uses the inertialized path and emits the proof.
const arenaSrc = read("apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts");
const arenaWired = arenaSrc.includes("fighterInertializedWeights") && arenaSrc.includes("__AURA_CLASH_INERTIALIZATION_PROOF__") && !arenaSrc.includes("fighterCrossfadeWeights(");
check("arena-uses-inertialization", arenaWired, "arena calls fighterInertializedWeights and emits __AURA_CLASH_INERTIALIZATION_PROOF__ (no linear crossfade call site)");

const pass = checks.every((c) => c.pass);
const report = {
  schema: "animation-engine-inertialization-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  checks
};
const reportPath = resolve("tests/reports/animation-engine/inertialization-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(checks.filter((c) => !c.pass).map((c) => `FAIL ${c.name}: ${c.detail}`).join("\n"));
  process.exit(1);
}
console.log(`animation-engine inertialization readiness: OK (${checks.length} checks passed)`);
