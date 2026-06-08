// Source + runtime readiness gate for T1.3 Spring bones. Confirms the integrated spring chain
// exists, behaves correctly (settles, swings under root motion, holds bone length, collider
// push-out, deterministic), matches the fixture oracle's invariants, and is wired to the skeleton +
// exported. Pure Node; exits non-zero on failure.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createSpringChain, sampleSecondaryAnimationFixture, type Vec3 } from "../../packages/animation/src";

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

const REST: Vec3[] = [[0, 2, 0], [0, 1.5, 0], [0, 1, 0], [0, 0.5, 0], [0, 0, 0]];
const DT = 1 / 60;

// 1. Files present.
const requiredFiles = [
  "packages/animation/src/SpringBones.ts",
  "packages/animation/src/SecondaryAnimationFixtures.ts",
  "packages/animation/src/Skeleton.ts",
  "packages/animation/src/Bone.ts",
  "tests/unit/animation/spring-bones.test.ts",
  "tests/browser/spring-bones.spec.ts"
] as const;
const missing = requiredFiles.filter((f) => !existsSync(resolve(f)));
check("required-files-present", missing.length === 0, missing.join(", ") || "all spring-bone files exist");

// 2. Runtime: settles to rest (no gravity) after a perturbation; energy decays.
const settle = createSpringChain({ bones: REST, stiffness: 40, damping: 8, gravity: [0, 0, 0] });
for (let i = 0; i < 10; i += 1) settle.integrate(DT, { position: [0.8, 2, 0] });
const peak = settle.telemetry().kineticEnergy;
for (let i = 0; i < 800; i += 1) settle.integrate(DT, { position: [0, 2, 0] });
const settledEnergy = settle.telemetry().kineticEnergy;
check("settles-energy-decays", settledEnergy < 1e-3 && settledEnergy < peak, `settled=${settledEnergy.toExponential(2)}, peak=${peak.toExponential(2)}`);

// 3. Runtime: swings (tip lags) under root acceleration.
const swing = createSpringChain({ bones: REST, stiffness: 30, damping: 2, gravity: [0, 0, 0] });
let maxLag = 0;
for (let i = 0; i < 30; i += 1) {
  swing.integrate(DT, { position: [i * 0.06, 2, 0] });
  const t = swing.telemetry();
  maxLag = Math.max(maxLag, Math.abs(t.rootPosition[0] - t.tipPosition[0]));
}
check("swings-under-motion", maxLag > 0.05, `maxLag=${maxLag.toFixed(4)}`);

// 4. Runtime: distance constraint holds bone length.
const constrained = createSpringChain({ bones: REST, stiffness: 50, damping: 1, gravity: [0, -9.81, 0] });
for (let i = 0; i < 60; i += 1) constrained.integrate(DT, { position: [Math.sin(i * 0.2) * 0.5, 2, 0] });
const pos = constrained.positions();
let lengthOk = true;
for (let i = 1; i < pos.length; i += 1) {
  const seg = Math.hypot(pos[i]![0] - pos[i - 1]![0], pos[i]![1] - pos[i - 1]![1], pos[i]![2] - pos[i - 1]![2]);
  if (Math.abs(seg - 0.5) > 1e-3) lengthOk = false;
}
check("bone-length-constraint", lengthOk, "each segment stays at its 0.5 rest length");

// 5. Runtime: collider push-out keeps particles outside a collider.
const collider = { kind: "sphere" as const, center: [0, 1, 0] as Vec3, radius: 0.4 };
const collided = createSpringChain({ bones: REST, stiffness: 30, damping: 3, gravity: [0, -9.81, 0], colliders: [collider] });
let sawContact = false;
for (let i = 0; i < 200; i += 1) {
  collided.integrate(DT, { position: [0, 2, 0] });
  if (collided.telemetry().collisionContacts > 0) sawContact = true;
}
const allOutside = collided.positions().every((p) => Math.hypot(p[0], p[1] - 1, p[2]) >= collider.radius - 1e-3);
check("collider-push-out", sawContact && allOutside, `contact=${sawContact}, allOutside=${allOutside}`);

// 6. Runtime: deterministic with fixed dt.
const a = createSpringChain({ bones: REST, stiffness: 40, damping: 4, gravity: [0, -9.81, 0] });
const b = createSpringChain({ bones: REST, stiffness: 40, damping: 4, gravity: [0, -9.81, 0] });
for (let i = 0; i < 50; i += 1) {
  a.integrate(DT, { position: [Math.sin(i * 0.3) * 0.4, 2, 0] });
  b.integrate(DT, { position: [Math.sin(i * 0.3) * 0.4, 2, 0] });
}
check("deterministic", JSON.stringify(a.positions()) === JSON.stringify(b.positions()), "identical chains for identical inputs");

// 7. Oracle invariants: the runtime reproduces the fixture oracle's invariants (chain swings out,
// registers collision contacts) using the same SpringBoneSample telemetry shape.
const fixture = sampleSecondaryAnimationFixture();
const oracleInvariants = fixture.springBone.boneCount >= 4 && fixture.springBone.maxDisplacement > 0 && fixture.productionReadiness.springChainTelemetry;
const runtimeMatchesInvariants = swing.telemetry().boneCount >= 4 && swing.telemetry().maxDisplacement > 0 && sawContact;
check("matches-fixture-oracle-invariants", oracleInvariants && runtimeMatchesInvariants, `oracle=${oracleInvariants}, runtime=${runtimeMatchesInvariants}`);

// 8. Source wiring: exported from both barrels.
const indexSrc = read("packages/animation/src/index.ts");
const browserSrc = read("packages/animation/src/browser-index.ts");
check("exported-from-barrels", indexSrc.includes("./SpringBones.js") && browserSrc.includes("./SpringBones.js"), "SpringBones exported from index.ts + browser-index.ts");

// 9. Source wiring: skeleton/bone support tagging + write-back.
const skeletonSrc = read("packages/animation/src/Skeleton.ts");
const boneSrc = read("packages/animation/src/Bone.ts");
check("skeleton-tag-and-writeback", boneSrc.includes("springChain") && skeletonSrc.includes("springChainIndices") && skeletonSrc.includes("writeSpringChainBack"), "Bone.springChain + Skeleton.springChainIndices/writeSpringChainBack present");

// 10. Source wiring: fixture oracle retained + claimBoundary updated to the real runtime.
const fixtureSrc = read("packages/animation/src/SecondaryAnimationFixtures.ts");
check("fixture-oracle-and-claim", fixtureSrc.includes("springSample") && fixtureSrc.includes("SpringBones.ts"), "springSample oracle retained; claimBoundary references the real SpringBones runtime");

const pass = checks.every((c) => c.pass);
const report = { schema: "animation-spring-bone-readiness/v1", generatedAt: new Date().toISOString(), pass, checks };
const reportPath = resolve("tests/reports/animation-engine/spring-bone-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(checks.filter((c) => !c.pass).map((c) => `FAIL ${c.name}: ${c.detail}`).join("\n"));
  process.exit(1);
}
console.log(`animation-engine spring-bone readiness: OK (${checks.length} checks passed)`);
