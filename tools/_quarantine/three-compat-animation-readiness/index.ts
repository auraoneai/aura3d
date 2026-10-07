import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  AnimationClipThreeCompat,
  AnimationMixerThreeCompat,
  MorphTargetMixerThreeCompat,
  SkeletonThreeCompat,
  SkinnedMeshThreeCompat,
  createThreeCompatAnimationDiagnostics,
  inspectThreeCompatAnimatedAssets
} from "../../packages/animation/src";

interface ThreeCompatAnimationCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/animation/src/threejs-compatibility/AnimationMixer.ts",
  "packages/animation/src/threejs-compatibility/AnimationClip.ts",
  "packages/animation/src/threejs-compatibility/AnimationAction.ts",
  "packages/animation/src/threejs-compatibility/Skeleton.ts",
  "packages/animation/src/threejs-compatibility/SkinnedMesh.ts",
  "packages/animation/src/threejs-compatibility/MorphTargetMixer.ts",
  "packages/animation/src/threejs-compatibility/AnimationDiagnostics.ts",
  "packages/three-compat/src/animation/index.ts",
  "tests/unit/animation/three-compat-animation.test.ts",
  "tests/browser/three-compat-animation.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): ThreeCompatAnimationCheck {
  return { name, pass, detail };
}

const mixer = new AnimationMixerThreeCompat();
const idle = mixer.clipAction(new AnimationClipThreeCompat("idle", 2, [{ target: "hips", property: "rotation", times: [0, 1], values: [0, 1] }])).play();
const run = mixer.clipAction(new AnimationClipThreeCompat("run", 1, [{ target: "hips", property: "position", times: [0, 1], values: [0, 2] }]));
idle.crossFadeTo(run, 0.5);
run.scrub(0.25);
mixer.update(0.25);
const skeleton = new SkeletonThreeCompat([{ name: "root", parentIndex: -1 }, { name: "spine", parentIndex: 0 }]);
const skinned = new SkinnedMeshThreeCompat(skeleton);
const morphs = new MorphTargetMixerThreeCompat();
morphs.setWeight("smile", 0.7);
const diagnostics = createThreeCompatAnimationDiagnostics(mixer, skinned, morphs);
const assets = inspectThreeCompatAnimatedAssets();
const checks: ThreeCompatAnimationCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all Three.js compatibility animation files exist"),
  check("animated-asset-floor", assets.filter((asset) => asset.loaded).length >= 5, assets.map((asset) => `${asset.id}:${asset.loaded}`).join(", ")),
  check("skinning", diagnostics.skinnedBoneCount >= 2 && assets.some((asset) => asset.capabilities.includes("skinning")), `${diagnostics.skinnedBoneCount} bones`),
  check("morph-targets", diagnostics.morphTargetCount >= 1 && assets.some((asset) => asset.capabilities.includes("morph-target")), `${diagnostics.morphTargetCount} morph targets`),
  check("crossfade-loop-play-pause-scrub", diagnostics.supportsCrossfade && diagnostics.supportsScrub && run.playing && run.time >= 0, JSON.stringify({ actionCount: diagnostics.actionCount, playing: diagnostics.playingActionCount })),
  check("diagnostics", diagnostics.warnings.length === 0, diagnostics.warnings.join(", ") || "no animation warnings")
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-animation-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  diagnostics,
  checks
};

const reportPath = resolve("tests/reports/three-compat-animation-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Three.js compatibility animation readiness passed: ${diagnostics.loadedAnimatedAssets} animated assets, ${diagnostics.skinnedBoneCount} bones.`);
