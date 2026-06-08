// Source + runtime readiness gate for T2.3 Morph-target hardening. Confirms the texture-backed morph
// plan exists and lifts the 4/64 cap, normals morph (lighting follows), the named-influence API +
// viseme lip-sync + glTF name loading are wired, and the GPU path falls back instead of throwing.
// Run via tsx + tsconfig.base (path-maps @aura3d/* to src). Exits non-zero on failure.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  applyMorphTargets,
  createMorphTargetPlan,
  planMorphTargets,
  Geometry,
  type MorphTargetDelta
} from "../../packages/rendering/src";
import { visemeSampleToMorphInfluences } from "../../packages/engine/src/agent-api/VisemeController";

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

// 1. Files present.
const requiredFiles = [
  "packages/rendering/src/MorphTargetPlan.ts",
  "packages/rendering/src/MorphTarget.ts",
  "packages/rendering/src/ForwardPass.ts",
  "packages/rendering/src/ShaderLibrary.ts",
  "packages/assets/src/GLTFLoader.ts",
  "packages/engine/src/agent-api/VisemeController.ts",
  "tests/unit/rendering/morph-targets.test.ts",
  "tests/browser/morph-target-face.spec.ts"
] as const;
const missing = requiredFiles.filter((f) => !existsSync(resolve(f)));
check("required-files-present", missing.length === 0, missing.join(", ") || "all morph-target files exist");

// 2. Plan: >4 targets / >64 verts uses the texture path (cap lifted).
const arkitScale = planMorphTargets(52, 4000, true);
check("cap-lifted-texture-path", arkitScale.mode === "texture" && arkitScale.textureWidth === 4000 && arkitScale.textureHeight === 104, `mode=${arkitScale.mode}, ${arkitScale.textureWidth}x${arkitScale.textureHeight}`);

// 3. Plan: cap is a function of device limits (tiny texture limit => CPU fallback, not a hard throw).
const tiny = planMorphTargets(10, 100, false, { maxTextureSize: 64 });
check("cap-is-device-limit-function", tiny.mode === "cpu", `mode=${tiny.mode}`);

// 4. Plan packs positions + normals into the texture, deterministically.
const targets: MorphTargetDelta[] = Array.from({ length: 8 }, (_, t) => ({
  positions: Array.from({ length: 128 }, (_, v) => [0.01 * (t + 1), 0.02 * v, 0] as const),
  normals: Array.from({ length: 128 }, () => [0, 0.1 * (t + 1), 0] as const)
}));
const plan = createMorphTargetPlan(targets, targets.map(() => 0.5), 128);
const plan2 = createMorphTargetPlan(targets, targets.map(() => 0.5), 128);
const packsNormals = plan.rowsPerTarget === 2 && plan.textureData[(1 * 128 + 0) * 4 + 1]! > 0.09;
const deterministic = plan.textureData.length === plan2.textureData.length && plan.textureData.every((x, i) => x === plan2.textureData[i]);
check("plan-packs-normals-deterministic", plan.mode === "texture" && packsNormals && deterministic, `normals=${packsNormals}, deterministic=${deterministic}`);

// 5. applyMorphTargets morphs normals (lighting follows the deformation).
const base = Geometry.litTriangle();
const baseN = base.vertexBuffer.getAttribute(0, "normal");
const morphed = applyMorphTargets(base, [{ positions: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], normals: [[1, 0, 0], [0, 0, 0], [0, 0, 0]] }], [1]);
const outN = morphed.vertexBuffer.getAttribute(0, "normal");
const normalChanged = Math.hypot(outN[0]! - baseN[0]!, outN[1]! - baseN[1]!, outN[2]! - baseN[2]!) > 0.1;
check("applymorph-morphs-normals", normalChanged, `normalChanged=${normalChanged}`);

// 6. Viseme -> morph influence mapping.
const influences = visemeSampleToMorphInfluences({
  time: 0, activeCues: [], visemeId: "aa", primaryVisemeId: "aa", mouthOpenness: 0.8,
  primitiveMouthCard: "wide", weights: { aa: 0.8 }, blendshapeWeights: { jawOpen: 0.7 }
} as never);
check("viseme-to-morph-mapping", influences.jawOpen === 0.7, JSON.stringify(influences));

// 7. Source wiring.
const indexSrc = read("packages/rendering/src/index.ts");
check("plan-exported", indexSrc.includes("createMorphTargetPlan") && indexSrc.includes("planMorphTargets"), "MorphTargetPlan exported from rendering");

const forwardSrc = read("packages/rendering/src/ForwardPass.ts");
const fallsBack = forwardSrc.includes("fall back to the CPU morph") && !forwardSrc.includes("GPU_MORPH_TARGET_LIMIT") && !forwardSrc.includes("GPU_MORPH_VERTEX_LIMIT");
check("forwardpass-cpu-fallback", fallsBack && forwardSrc.includes("u_morphNormalDeltas"), `over-cap falls back to CPU morph (no hard throw); normal deltas uploaded`);

const shaderSrc = read("packages/rendering/src/ShaderLibrary.ts");
check("shader-texture-morph-branch", shaderSrc.includes("u_morphDeltaTexture") && shaderSrc.includes("u_morphUsesTexture") && shaderSrc.includes("sampleMorphTexel"), "morph shader has a texture-sampling branch");

const gltfSrc = read("packages/assets/src/GLTFLoader.ts");
check("gltf-loads-target-names", gltfSrc.includes("readMorphTargetNames") && gltfSrc.includes("targetNames"), "glTF loader reads mesh.extras.targetNames");

const nodeSrc = read("packages/engine/src/agent-api/index.ts");
check("morph-influence-api", nodeSrc.includes("morphInfluence"), "RuntimeNodeHandle exposes morphInfluence(name, weight)");

const visemeSrc = read("packages/engine/src/agent-api/VisemeController.ts");
check("viseme-morph-wired", visemeSrc.includes("applyVisemeMorphInfluences") && visemeSrc.includes("visemeSampleToMorphInfluences"), "viseme -> morph helpers present");

// 8. known-limits honestly updated (morph line reflects the lifted cap + normals).
const knownLimits = read("docs/project/known-limits.md");
check("known-limits-updated", /morph/i.test(knownLimits) && /(texture-backed|normal)/i.test(knownLimits), "known-limits morph entry reflects texture-backed path + normals");

const pass = checks.every((c) => c.pass);
const report = { schema: "animation-morph-target-readiness/v1", generatedAt: new Date().toISOString(), pass, checks };
const reportPath = resolve("tests/reports/animation-engine/morph-target-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(checks.filter((c) => !c.pass).map((c) => `FAIL ${c.name}: ${c.detail}`).join("\n"));
  process.exit(1);
}
console.log(`animation-engine morph-target readiness: OK (${checks.length} checks passed)`);
