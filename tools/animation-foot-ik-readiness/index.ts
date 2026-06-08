// Source + runtime readiness gate for T1.2 Foot IK + foot-lock. Confirms the runtime exists, grounds
// feet, holds a planted foot in world space (no sliding) and releases on lift, is deterministic, and
// is wired to locomotion + exported. Pure Node; exits non-zero on failure.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createFootIkRig, createHeightFieldGround, type FootLegInput } from "../../packages/animation/src";

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

function legs(leftY = 0.035): FootLegInput[] {
  return [
    { side: "left", hip: [-0.18, 1, 0], knee: [-0.18, 0.5, 0.05], ankle: [-0.18, leftY, 0], pole: [-0.18, 0.5, 1] },
    { side: "right", hip: [0.18, 1, 0], knee: [0.18, 0.5, 0.05], ankle: [0.18, 0.035, 0], pole: [0.18, 0.5, 1] }
  ];
}
const flat = createHeightFieldGround(() => ({ height: 0, normal: [0, 1, 0] }));

// 1. Files present.
const requiredFiles = [
  "packages/animation/src/FootIk.ts",
  "packages/animation/src/IK.ts",
  "packages/animation/src/SecondaryAnimationFixtures.ts",
  "packages/animation/src/LocomotionKit.ts",
  "packages/animation/src/LocomotionController.ts",
  "packages/physics/src/Raycast.ts",
  "tests/unit/animation/foot-ik-runtime.test.ts",
  "tests/browser/character-foot-ik.spec.ts"
] as const;
const missing = requiredFiles.filter((f) => !existsSync(resolve(f)));
check("required-files-present", missing.length === 0, missing.join(", ") || "all foot-IK files exist");

// 2. Runtime: feet reach the ground target within tolerance.
const rig = createFootIkRig({ legs: legs(), raycaster: flat });
const grounded = rig.solveFootPlacement();
check("grounds-feet", grounded.groundedFeet === 2 && grounded.feet.every((f) => f.sample.targetError <= 0.02), `grounded=${grounded.groundedFeet}, maxErr=${Math.max(...grounded.feet.map((f) => f.sample.targetError))}`);

// 3. Runtime: knee bends toward the pole hint (+z).
check("knee-bends-to-pole", grounded.feet.every((f) => f.knee[2] > 0), grounded.feet.map((f) => f.knee[2]).join(", "));

// 4. Runtime: foot-lock holds world position during stance, releases on lift.
const lockRig = createFootIkRig({ legs: legs(), raycaster: flat });
const p1 = lockRig.solveFootPlacement().feet[0]!.sample.plantedFoot;
const drift = legs();
drift[0] = { ...drift[0]!, ankle: [-0.05, 0.035, 0] };
const p2 = lockRig.solveFootPlacement({ legs: drift }).feet[0]!.sample.plantedFoot;
const heldDuringStance = Math.abs(p2[0] - p1[0]) < 1e-4 && Math.abs(p2[2] - p1[2]) < 1e-4 && lockRig.isLocked("left");
const swing = lockRig.solveFootPlacement({ legs: legs(0.5) });
const releasedOnLift = !lockRig.isLocked("left") && !swing.feet[0]!.sample.grounded;
check("foot-lock-hold-and-release", heldDuringStance && releasedOnLift, `held=${heldDuringStance}, released=${releasedOnLift}`);

// 5. Runtime: deterministic.
const a = createFootIkRig({ legs: legs(), raycaster: flat });
const b = createFootIkRig({ legs: legs(), raycaster: flat });
check("deterministic", JSON.stringify(a.solveFootPlacement()) === JSON.stringify(b.solveFootPlacement()), "identical solve for identical input");

// 6. Source wiring: exported from both barrels.
const indexSrc = read("packages/animation/src/index.ts");
const browserSrc = read("packages/animation/src/browser-index.ts");
check("exported-from-barrels", indexSrc.includes("./FootIk.js") && browserSrc.includes("./FootIk.js"), "FootIk exported from index.ts + browser-index.ts");

// 7. Source wiring: built on the two-bone solver (reuse, no new solver).
const footSrc = read("packages/animation/src/FootIk.ts");
check("reuses-two-bone-ik", footSrc.includes("solveTwoBoneIk"), "FootIk solves via solveTwoBoneIk");

// 8. Source wiring: locomotion controller + kit expose the foot-IK hook.
const kitSrc = read("packages/animation/src/LocomotionKit.ts");
const ctrlSrc = read("packages/animation/src/LocomotionController.ts");
check("locomotion-hook", kitSrc.includes("footIk") && ctrlSrc.includes("footIk"), "LocomotionKit + LocomotionController expose footIk");

// 9. Source wiring: physics ground-height query adapter present.
const raycastSrc = read("packages/physics/src/Raycast.ts");
check("physics-ground-query", raycastSrc.includes("groundHeightRaycaster"), "physics Raycast exposes groundHeightRaycaster");

// 10. Source wiring: fixture claimBoundary points at the real runtime.
const fixtureSrc = read("packages/animation/src/SecondaryAnimationFixtures.ts");
check("fixture-claim-updated", fixtureSrc.includes("FootIk.ts") && fixtureSrc.includes("real runtimes"), "fixture claimBoundary references the real FootIk runtime");

const pass = checks.every((c) => c.pass);
const report = { schema: "animation-foot-ik-readiness/v1", generatedAt: new Date().toISOString(), pass, checks };
const reportPath = resolve("tests/reports/animation-engine/foot-ik-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(checks.filter((c) => !c.pass).map((c) => `FAIL ${c.name}: ${c.detail}`).join("\n"));
  process.exit(1);
}
console.log(`animation-engine foot-ik readiness: OK (${checks.length} checks passed)`);
