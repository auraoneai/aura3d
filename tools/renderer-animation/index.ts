import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPORT_PATH = "tests/reports/animation-complete/report.json";
const MAX_AGE_MS = 40 * 60 * 1000;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const fresh = (value: any): boolean => { const time = Date.parse(String(value.generatedAt ?? "")); return Number.isFinite(time) && Date.now() - time <= MAX_AGE_MS; };

const baseline = json("tests/reports/current-threejs-baseline.json");
const rootPose = json("tests/reports/animation-complete/root-skinned-pose.json");
const rootControls = json("tests/reports/animation-complete/root-clip-controls.json");
const rootMorph = json("tests/reports/animation-complete/root-morph-targets.json");
const lifecycle = json("tests/reports/animation-complete/resource-lifecycle.json");
const additive = json("tests/reports/threejs-parity/skinning-additive-parity.json");
const blending = json("tests/reports/threejs-parity/skinning-blending-parity.json");
const ik = json("tests/reports/threejs-parity/skinning-ik-parity.json");
const morphParity = json("tests/reports/threejs-parity/morphtargets-parity.json");
const controllerTest = source("tests/unit/animation/animation-controller.test.ts");
const mixerTest = source("tests/unit/animation/game-animation-runtime.test.ts");
const retargetTest = source("tests/unit/animation/humanoid-retarget-pose.test.ts");
const eventTest = source("tests/unit/animation/animation-event-tracks.test.ts");
const staticTest = source("tests/unit/animation/animation-animation-runtime.test.ts");

const checks: Check[] = [
  check("current-three-r185", baseline.pass === true && baseline.three?.version === "0.185.1" && baseline.three?.tag === "r185", `three=${String(baseline.three?.version)}; tag=${String(baseline.three?.tag)}`),
  check("root-skinned-subject-pixels-stable-camera", rootPose.renderer?.runtimeBackend === "production-runtime" && rootPose.animation?.cameraStable === true && rootPose.animation?.diff?.changedSubjectPixels > 120 && rootPose.animation?.diff?.meanDelta > 0.05 && rootPose.asset?.skinningPaletteUpdated === true, `changedSubject=${String(rootPose.animation?.diff?.changedSubjectPixels)}; meanDelta=${String(rootPose.animation?.diff?.meanDelta)}; cameraStable=${String(rootPose.animation?.cameraStable)}`),
  check("root-clip-state-crossfade-pause", rootControls.animation?.playbackControls?.crossFade === true && rootControls.animation?.diff?.changedSubjectPixels > 80 && rootControls.animation?.pauseDiff?.changedSubjectPixels < 20 && rootControls.animation?.activeClipId === "RUN", `moving=${String(rootControls.animation?.diff?.changedSubjectPixels)}; paused=${String(rootControls.animation?.pauseDiff?.changedSubjectPixels)}; clip=${String(rootControls.animation?.activeClipId)}`),
  check("root-morph-subject-pixels", rootMorph.evidence?.renderer?.runtimeBackend === "production-runtime" && rootMorph.morphDiff?.changedSubjectPixels > 20 && rootMorph.neutralDiff?.changedSubjectPixels > 20 && rootMorph.evidence?.asset?.morphRenderItemCount > 0, `morph=${String(rootMorph.morphDiff?.changedSubjectPixels)}; neutral=${String(rootMorph.neutralDiff?.changedSubjectPixels)}`),
  check("static-pose-rejection", /rejects static pose samples masquerading as animation/.test(staticTest) && /staticPoseRejected/.test(staticTest), "static source assets are supported, but a static pose cannot satisfy an animation claim"),
  check("crossfade-root-motion-events", /crossFade/.test(mixerTest) && /appliedRootMotion/.test(mixerTest) && /crossFadeStart/.test(controllerTest) && /hitbox/.test(eventTest), "focused unit gate executed crossfade, root motion, clip events, and controller state; additive blending is separately verified in the current-Three browser comparison"),
  check("humanoid-retargeting", /retargetHumanoidPose/.test(retargetTest) && /reconciles differing rest orientations/.test(retargetTest) && /scales translations by the per-bone length ratio/.test(retargetTest), "focused unit gate executed explicit humanoid mapping, differing-rest-pose reconciliation, and proportional translation scaling"),
  check("same-asset-additive-current-three", additive.status === "ready" && additive.assertions?.sameAssetUrl === true && additive.assertions?.actualThreeAdditiveBlendMode === true && additive.assertions?.a3dAppliedTracksAndSkinning === true && additive.diff?.structuralSimilarityProxy >= 0.25, `similarity=${String(additive.diff?.structuralSimilarityProxy)}; tracks=${String(additive.a3d?.animation?.tracksApplied)}`),
  check("same-asset-blending-current-three", blending.status === "ready" && blending.assertions?.sameAssetUrl === true && blending.assertions?.actualThreeAnimationMixer === true && blending.assertions?.a3dAppliedTracksAndSkinning === true && blending.diff?.structuralSimilarityProxy >= 0.25, `similarity=${String(blending.diff?.structuralSimilarityProxy)}; clips=${String(blending.a3d?.animation?.clips?.join(","))}`),
  check("same-asset-ik-current-three", ik.status === "ready" && ik.assertions?.sameAssetUrl === true && ik.assertions?.actualThreeBoneTransforms === true && ik.assertions?.endpointsNearTarget === true && ik.a3d?.solution?.endDistanceToTarget < 0.55, `auraDistance=${String(ik.a3d?.solution?.endDistanceToTarget)}; threeDistance=${String(ik.threejs?.solution?.endDistanceToTarget)}`),
  check("same-asset-morph-current-three", morphParity.status === "ready" && morphParity.assertions?.sameAssetUrl === true && morphParity.assertions?.actualThreeMorphTargetInfluences === true && morphParity.assertions?.a3dAppliedMorphWeights === true && morphParity.diff?.structuralSimilarityProxy >= 0.25, `similarity=${String(morphParity.diff?.structuralSimilarityProxy)}; target=${String(morphParity.morph?.target)}`),
  check("repeat-load-play-stop-dispose", lifecycle.status === "ready" && lifecycle.cycles?.length === 3 && lifecycle.cycles.every((cycle: any) => cycle.update?.tracksApplied > 0 && cycle.afterStop?.activeClipNames?.length === 0 && cycle.bindingAfterDispose?.actionCount === 0 && Object.values(cycle.resourcesAfterDispose ?? {}).every((value) => value === 0)), `cycles=${String(lifecycle.cycles?.length)}; after=${JSON.stringify(lifecycle.cycles?.map((cycle: any) => cycle.resourcesAfterDispose))}`),
  check("reports-fresh", [baseline, rootPose, rootControls, rootMorph, lifecycle, additive, blending, ik, morphParity].every(fresh), `generatedAt=${[baseline, rootPose, rootControls, rootMorph, lifecycle, additive, blending, ik, morphParity].map((entry) => entry.generatedAt).join(",")}`)
];

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.renderer-animation/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claim: "bounded-root-visible-animation-and-current-threejs-selected-fixture-comparison",
  currentThree: { version: baseline.three?.version, tag: baseline.three?.tag, releaseCommit: baseline.three?.releaseCommit },
  root: { skinnedPose: rootPose, clipControls: rootControls, morphTargets: rootMorph },
  selectedSameAssetComparisons: {
    additive: { asset: additive.asset, a3d: additive.a3d, threejs: additive.threejs, diff: additive.diff },
    blending: { asset: blending.asset, a3d: blending.a3d, threejs: blending.threejs, diff: blending.diff },
    ik: { asset: ik.asset, a3d: ik.a3d, threejs: ik.threejs, diff: ik.diff },
    morph: { asset: morphParity.asset, a3d: morphParity.a3d, threejs: morphParity.threejs, diff: morphParity.diff }
  },
  lifecycle,
  scope: {
    proven: ["root typed-GLB skinned playback with stable-camera subject-region pose delta", "root named morph-target on/off/on subject-region delta", "package additive layers, crossfade, root motion, deterministic events, clip state, humanoid pose retargeting, and imported two-bone IK", "same Robot Expressive asset comparisons against actual current Three.js r185 loader/renderer/mixer for additive, weighted blending, IK, and morph targets", "three repeated real WebGL2 load/play/stop/dispose cycles returning tracked renderer and mixer resources to zero"],
    limited: ["retargeting is explicit humanoid-map package behavior, not automatic arbitrary-rig retargeting", "IK proof is a two-bone imported-skeleton chain, not full-body IK", "same-asset comparisons cover selected Robot Expressive workloads, not all clips, rigs, masks, morph combinations, or transition graphs"],
    blocked: ["blanket arbitrary-rig animation parity", "claiming a static pose or metadata-only state as visible animation", "unmeasured animation behavior outside the selected fixtures"]
  },
  checks,
  failures: failures.map(({ id, detail }) => ({ id, detail })),
  evidence: ["tests/reports/animation-complete/root-skinned-pose.json", "tests/reports/animation-complete/root-clip-controls.json", "tests/reports/animation-complete/root-morph-targets.json", "tests/reports/animation-complete/resource-lifecycle.json", "tests/reports/threejs-parity/skinning-additive-parity.json", "tests/reports/threejs-parity/skinning-blending-parity.json", "tests/reports/threejs-parity/skinning-ik-parity.json", "tests/reports/threejs-parity/morphtargets-parity.json"]
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`Animation proof is UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; }
else console.log(`Animation proof PASS: Three.js ${String(report.currentThree.version)}; ${checks.length}/${checks.length} checks; ${REPORT_PATH}`);
