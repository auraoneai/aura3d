// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraAssetRef, AuraMaterialSpec, AuraAnimationSpec, AuraCharacterClipName, AuraCharacterStyle, AuraCharacterJointName, AuraCharacterClip, AuraCharacterSkeleton, AuraCharacterFootPlantingSpec, AuraCharacterRootMotionSpec, AuraCharacterConstraintCorrectionSpec, AuraProceduralHumanMeshPartName, AuraProceduralHumanMeshPart, AuraProceduralHumanMeshDescriptor, AuraSceneNode, AuraPrimitiveNode, AuraGroupNode, AuraPrimitiveHumanoidPrefabOptions } from "./types.js";
import type { GLTFSceneAnimationRuntime, GLTFSceneAnimationRuntimeOptions } from "@aura3d/assets/browser";
import { animation } from "./animation.js";
import { createAnimationPerformance } from "../AnimationPerformance";
import { effects } from "./effects.composite.js";
import { group } from "./groups.js";
import { markAuraLazySystemLoaded, markAuraLazySystemRequested } from "../devtools/lazySystemEvidence.js";
import { material } from "./material.js";
import { model, builtInCharacterAssets } from "./model.js";
import { performance } from "../devtools/performanceEvidence.js";
import { performanceNow } from "../app/platform.js";
import { prefabs } from "./prefabs/index.js";
import { primitive, primitives } from "./primitives.js";
import { renderer } from "../devtools/rendererDiagnostics.js";
import { validatePrimitiveHumanoidVisualQA } from "../looks/structuralQA.js";

const characterClips: readonly AuraCharacterClip[] = [
  { name: "idle", duration: 2.4, captureTime: 0.4, loop: true },
  { name: "walk", duration: 1.2, captureTime: 0.38, loop: true },
  { name: "run", duration: 0.74, captureTime: 0.22, loop: true },
  { name: "wave", duration: 1.6, captureTime: 0.5, loop: true },
  { name: "turn", duration: 1.4, captureTime: 0.62, loop: false },
  { name: "pose", duration: 1, captureTime: 0.5, loop: false },
  { name: "benchmark-pose", duration: 1, captureTime: 0.42, loop: false }
] as const;

function createPrimitiveHumanoidSkeleton(style: AuraCharacterStyle = "simple"): AuraCharacterSkeleton {
  return {
    kind: "aura-character-skeleton",
    style,
    clips: characterClips,
    joints: [
      { name: "root", position: [0, 0, -0.55] },
      { name: "pelvis", parent: "root", position: [0, 0.51, -0.55] },
      { name: "spine", parent: "pelvis", position: [0, 0.9, -0.55] },
      { name: "neck", parent: "spine", position: [0, 1.31, -0.55] },
      { name: "head", parent: "neck", position: [0, 1.48, -0.55] },
      { name: "left-shoulder", parent: "spine", position: [-0.31, 1.1, -0.55] },
      { name: "left-elbow", parent: "left-shoulder", position: [-0.34, 0.82, -0.39] },
      { name: "left-wrist", parent: "left-elbow", position: [-0.37, 0.54, -0.29] },
      { name: "right-shoulder", parent: "spine", position: [0.31, 1.1, -0.55] },
      { name: "right-elbow", parent: "right-shoulder", position: [0.34, 0.82, -0.71] },
      { name: "right-wrist", parent: "right-elbow", position: [0.37, 0.54, -0.81] },
      { name: "left-hip", parent: "pelvis", position: [-0.18, 0.51, -0.55] },
      { name: "left-knee", parent: "left-hip", position: [-0.2, 0.24, -0.29] },
      { name: "left-ankle", parent: "left-knee", position: [-0.28, 0.07, -0.06] },
      { name: "right-hip", parent: "pelvis", position: [0.18, 0.51, -0.55] },
      { name: "right-knee", parent: "right-hip", position: [0.22, 0.24, -0.81] },
      { name: "right-ankle", parent: "right-knee", position: [0.31, 0.07, -1.02] }
    ]
  };
}

function isHumanoidRigNode(node: AuraSceneNode): node is AuraPrimitiveNode {
  return node.kind === "primitive" && typeof node.name === "string" && (
    node.name.includes("humanoid") ||
    node.name.includes("shoulder") ||
    node.name.includes("elbow") ||
    node.name.includes("forearm") ||
    node.name.includes("hand") ||
    node.name.includes("hip") ||
    node.name.includes("walking leg") ||
    node.name.includes("knee") ||
    node.name.includes("shin") ||
    node.name.includes("foot") ||
    node.name.includes("neck") ||
    node.name.includes("torso")
  );
}

function createHierarchicalPrimitiveHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  const flatNodes = prefabs.primitiveHumanoid(options);
  const rigNodes = flatNodes.filter(isHumanoidRigNode);
  const sceneNodes = flatNodes.filter((node) => !isHumanoidRigNode(node));
  const clip = options.clip ?? "walk";
  const pose = options.pose ?? "mid-stride";
  const style = options.style ?? "simple";
  const chain = (
    name: string,
    predicate: (nodeName: string) => boolean,
    animation: AuraAnimationSpec
  ): AuraGroupNode =>
    group(name, rigNodes.filter((node) => predicate(node.name ?? "")), { animation }).toJSON();

  return [
    ...sceneNodes,
    group("hierarchical primitive humanoid rig", [
      chain("pelvis spine neck head chain", (name) =>
        name.includes("torso") ||
        name.includes("neck") ||
        name.includes("head") ||
        name.includes("eye") ||
        name.includes("mouth") ||
        name.includes("shoulder bar") ||
        name.includes("hip bar")
      , { clip, speed: 0.78, chain: "root", joint: "pelvis", rootBob: true, jointHierarchy: true }),
      chain("left shoulder elbow wrist chain", (name) =>
        name.includes("left shoulder") ||
        name.includes("left attached") ||
        name.includes("left bent forearm") ||
        name.includes("left elbow") ||
        name.includes("left humanoid hand")
      , { clip, speed: 0.9, chain: "left-arm", joint: "left-shoulder", jointHierarchy: true }),
      chain("right shoulder elbow wrist chain", (name) =>
        name.includes("right shoulder") ||
        name.includes("right attached") ||
        name.includes("right bent forearm") ||
        name.includes("right elbow") ||
        name.includes("right humanoid hand")
      , { clip, speed: 0.9, chain: "right-arm", joint: "right-shoulder", jointHierarchy: true }),
      chain("left hip knee ankle chain", (name) =>
        name.includes("left hip") ||
        name.includes("forward connected walking leg") ||
        name.includes("forward lower walking shin") ||
        name.includes("forward knee") ||
        name.includes("forward foot")
      , { clip, speed: 0.95, chain: "left-leg", joint: "left-hip", jointHierarchy: true }),
      chain("right hip knee ankle chain", (name) =>
        name.includes("right hip") ||
        name.includes("back connected walking leg") ||
        name.includes("back lower walking shin") ||
        name.includes("back knee") ||
        name.includes("back foot")
      , { clip, speed: 0.95, chain: "right-leg", joint: "right-hip", jointHierarchy: true })
    ], {
      character: {
        skeleton: createPrimitiveHumanoidSkeleton(style),
        clip,
        pose,
        rootBob: true,
        limbSwing: "joint-hierarchy"
      },
      animation: { clip, speed: clip === "run" ? 1.35 : clip === "idle" ? 0.25 : 0.9, chain: "root", joint: "root", rootBob: true, jointHierarchy: true }
    }).toJSON()
  ];
}

export function createLowPolyHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  // Deliberate decision (1ca640ed, confirmed 2026-06): the benchmark humanoid defaults to the
  // bundled soldier GLB, superseding the earlier "Prompt 09 stays asset-free" constraint.
  // Asset-free primitive rigs remain available via character.primitiveHumanoid / prefabs.primitiveHumanoid.
  return createAuthoredLowPolyHumanoid(options);
}

function createBenchmarkBoxLowPolyHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  const clip = options.clip ?? "benchmark-pose";
  const pose = options.pose ?? "mid-stride";
  const style = options.style ?? "athletic";
  const skin = material.pbr({ color: "#f1c9a5", roughness: 0.58, metallic: 0.01 });
  const shirt = material.clearcoat({ color: "#1d4ed8", roughness: 0.34, clearcoat: 0.14 });
  const sleeve = material.pbr({ color: "#475569", roughness: 0.62, metallic: 0.01 });
  const pants = material.pbr({ color: "#050b16", roughness: 0.74, metallic: 0.01 });
  const shoe = material.pbr({ color: "#020617", roughness: 0.78, metallic: 0.01 });
  const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "walk cycle ground plane", material: material.pbr({ color: "#102018", roughness: 0.88, metallic: 0.01 }) }).position(0, -0.04, -0.5).scale([4.6, 1, 2.7]).toJSON(),
    primitives.cylinder({ name: "humanoid contact shadow", material: material.pbr({ color: "#020617", roughness: 0.95, metallic: 0.01, opacity: 0.5 }) }).position(0.02, 0.028, -0.52).scale([0.6, 0.012, 0.38]).toJSON(),
    primitives.box({ name: "painted walking path", material: material.pbr({ color: "#1f2937", roughness: 0.84, metallic: 0.01 }) }).position(0, 0.012, -0.45).scale([1.7, 0.024, 0.18]).toJSON(),
    primitives.box({ name: "white dashed stride marker 1", material: material.emissive({ color: "#e5e7eb", emissive: "#e5e7eb", emissiveIntensity: 0.42 }) }).position(-0.62, 0.04, -0.45).scale([0.28, 0.02, 0.035]).toJSON(),
    primitives.box({ name: "white dashed stride marker 2", material: material.emissive({ color: "#e5e7eb", emissive: "#e5e7eb", emissiveIntensity: 0.42 }) }).position(0.08, 0.04, -0.45).scale([0.28, 0.02, 0.035]).toJSON(),
    primitives.box({ name: "connected blue humanoid torso", material: shirt }).position(0, 0.9, -0.55).scale([0.44, 0.62, 0.28]).toJSON(),
    primitives.box({ name: "hip bar connecting legs", material: pants }).position(0, 0.52, -0.55).scale([0.44, 0.22, 0.3]).toJSON(),
    primitives.box({ name: "shoulder bar connecting arms", material: sleeve }).position(0, 1.12, -0.55).scale([0.62, 0.12, 0.18]).toJSON(),
    primitives.cylinder({ name: "short humanoid neck connector", material: skin }).position(0, 1.28, -0.53).scale([0.09, 0.18, 0.09]).toJSON(),
    primitives.sphere({ name: "humanoid head", material: skin }).position(0, 1.42, -0.48).scale(0.18).toJSON(),
    primitives.sphere({ name: "left humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a", emissiveIntensity: 0.26 }) }).position(-0.05, 1.45, -0.33).scale(0.018).toJSON(),
    primitives.sphere({ name: "right humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a", emissiveIntensity: 0.26 }) }).position(0.05, 1.45, -0.33).scale(0.018).toJSON(),
    primitives.box({ name: "humanoid mouth line", material: material.emissive({ color: "#991b1b", emissive: "#991b1b", emissiveIntensity: 0.28 }) }).position(0, 1.37, -0.32).scale([0.075, 0.01, 0.012]).toJSON(),
    primitives.box({ name: "left attached swinging arm", material: sleeve }).position(-0.34, 0.9, -0.38).rotate(0.42, 0, 0.08).scale([0.12, 0.48, 0.12]).toJSON(),
    primitives.box({ name: "right attached swinging arm", material: sleeve }).position(0.34, 0.9, -0.72).rotate(-0.42, 0, -0.08).scale([0.12, 0.48, 0.12]).toJSON(),
    primitives.box({ name: "left bent forearm", material: sleeve }).position(-0.42, 0.66, -0.3).rotate(0.22, 0, 0.05).scale([0.1, 0.36, 0.1]).toJSON(),
    primitives.box({ name: "right bent forearm", material: sleeve }).position(0.42, 0.66, -0.8).rotate(-0.22, 0, -0.05).scale([0.1, 0.36, 0.1]).toJSON(),
    primitives.sphere({ name: "left humanoid hand", material: skin }).position(-0.48, 0.6, -0.3).scale(0.052).toJSON(),
    primitives.sphere({ name: "right humanoid hand", material: skin }).position(0.48, 0.6, -0.8).scale(0.052).toJSON(),
    primitives.box({ name: "forward connected walking leg", material: pants }).position(-0.16, 0.34, -0.36).rotate(-0.34, 0, 0.04).scale([0.14, 0.52, 0.14]).toJSON(),
    primitives.box({ name: "back connected walking leg", material: pants }).position(0.16, 0.34, -0.74).rotate(0.34, 0, -0.04).scale([0.14, 0.52, 0.14]).toJSON(),
    primitives.box({ name: "forward lower walking shin", material: pants }).position(-0.22, 0.18, -0.18).rotate(0.2, 0, 0.02).scale([0.12, 0.34, 0.12]).toJSON(),
    primitives.box({ name: "back lower walking shin", material: pants }).position(0.22, 0.18, -0.92).rotate(-0.2, 0, -0.02).scale([0.12, 0.34, 0.12]).toJSON(),
    primitives.box({ name: "forward foot planted on path", material: shoe }).position(-0.28, 0.055, -0.02).rotate(0, -0.12, 0).scale([0.28, 0.07, 0.2]).toJSON(),
    primitives.box({ name: "back foot pushing off path", material: shoe }).position(0.28, 0.055, -1.06).rotate(0, 0.12, 0).scale([0.28, 0.07, 0.2]).toJSON(),
    primitives.box({ name: "orange forward foot motion streak", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", emissiveIntensity: 0.35, opacity: 0.28 }) }).position(-0.08, 0.052, -0.16).rotate(0, -0.18, 0).scale([0.32, 0.018, 0.03]).toJSON()
  ];
  nodes.push(group("hierarchical primitive humanoid rig", [], {
    character: {
      skeleton: createPrimitiveHumanoidSkeleton(style),
      clip,
      pose,
      rootBob: false,
      limbSwing: "joint-hierarchy"
    },
    animation: { clip, speed: 0.9, chain: "root", joint: "root", rootBob: false, jointHierarchy: true }
  }).toJSON());
  return nodes;
}

function createBenchmarkLowPolyPrimitiveHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  const showJoints = options.showJoints ?? false;
  const motionTrail = options.motionTrail ?? true;
  const clip = options.clip ?? "benchmark-pose";
  const pose = options.pose ?? "mid-stride";
  const style = options.style ?? "athletic";
  const skin = material.pbr({ color: "#f1c9a5", roughness: 0.58, metallic: 0.01 });
  const shirt = material.clearcoat({ color: "#2563eb", roughness: 0.28, clearcoat: 0.18 });
  const sleeve = material.clearcoat({ color: "#6fb7e8", roughness: 0.32, clearcoat: 0.12 });
  const pants = material.pbr({ color: "#07111f", roughness: 0.72, metallic: 0.01 });
  const shoe = material.pbr({ color: "#020617", roughness: 0.76, metallic: 0.01 });
  const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "walk cycle ground plane", material: material.pbr({ color: "#114a25", roughness: 0.86, metallic: 0.01 }) }).position(0, -0.04, -0.5).scale([4.6, 1, 2.7]).toJSON(),
    primitives.box({ name: "painted walking path", material: material.pbr({ color: "#202938", roughness: 0.84, metallic: 0.01 }) }).position(0, 0.012, -0.45).scale([3.3, 0.024, 0.32]).toJSON(),
    primitives.box({ name: "white dashed stride marker 1", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.48 }) }).position(-0.92, 0.04, -0.45).scale([0.38, 0.02, 0.04]).toJSON(),
    primitives.box({ name: "white dashed stride marker 2", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.48 }) }).position(0.05, 0.04, -0.45).scale([0.38, 0.02, 0.04]).toJSON(),
    primitives.box({ name: "white dashed stride marker 3", material: material.emissive({ color: "#e0f2fe", emissive: "#e0f2fe", emissiveIntensity: 0.42 }) }).position(1.0, 0.04, -0.45).scale([0.38, 0.02, 0.04]).toJSON(),
    primitives.cylinder({ name: "humanoid contact shadow", material: material.pbr({ color: "#020617", roughness: 0.95, metallic: 0.01, opacity: 0.44 }) }).position(0.02, 0.028, -0.5).scale([0.62, 0.012, 0.4]).toJSON(),
    primitives.cylinder({ name: "connected blue humanoid torso", material: shirt }).position(0, 0.86, -0.55).scale([0.3, 0.7, 0.25]).toJSON(),
    primitives.box({ name: "hip bar connecting legs", material: material.clearcoat({ color: "#1e40af", roughness: 0.34, clearcoat: 0.18 }) }).position(0, 0.52, -0.55).scale([0.42, 0.13, 0.2]).toJSON(),
    primitives.box({ name: "shoulder bar connecting arms", material: sleeve }).position(0, 1.08, -0.55).scale([0.62, 0.1, 0.15]).toJSON(),
    primitives.cylinder({ name: "short humanoid neck connector", material: skin }).position(0, 1.25, -0.55).scale([0.1, 0.28, 0.1]).toJSON(),
    primitives.sphere({ name: "humanoid head", material: skin }).position(0, 1.4, -0.46).scale(0.19).toJSON(),
    primitives.sphere({ name: "left humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a", emissiveIntensity: 0.35 }) }).position(-0.055, 1.44, -0.31).scale(0.022).toJSON(),
    primitives.sphere({ name: "right humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a", emissiveIntensity: 0.35 }) }).position(0.055, 1.44, -0.31).scale(0.022).toJSON(),
    primitives.box({ name: "humanoid mouth line", material: material.emissive({ color: "#b91c1c", emissive: "#b91c1c", emissiveIntensity: 0.32 }) }).position(0, 1.35, -0.29).scale([0.09, 0.012, 0.012]).toJSON(),
    primitives.capsule({ name: "left attached swinging arm", material: sleeve }).position(-0.28, 0.96, -0.48).rotate(0.38, 0, -0.12).scale([0.085, 0.31, 0.085]).toJSON(),
    primitives.capsule({ name: "right attached swinging arm", material: sleeve }).position(0.28, 0.96, -0.64).rotate(-0.38, 0, 0.12).scale([0.085, 0.31, 0.085]).toJSON(),
    primitives.capsule({ name: "left bent forearm", material: sleeve }).position(-0.42, 0.72, -0.36).rotate(-0.18, 0, -0.08).scale([0.076, 0.27, 0.076]).toJSON(),
    primitives.capsule({ name: "right bent forearm", material: sleeve }).position(0.42, 0.72, -0.76).rotate(0.18, 0, 0.08).scale([0.076, 0.27, 0.076]).toJSON(),
    primitives.capsule({ name: "left continuous arm silhouette connector", material: sleeve }).position(-0.38, 0.78, -0.42).rotate(0.18, 0, -0.12).scale([0.062, 0.58, 0.062]).toJSON(),
    primitives.capsule({ name: "right continuous arm silhouette connector", material: sleeve }).position(0.38, 0.78, -0.72).rotate(-0.18, 0, 0.12).scale([0.062, 0.58, 0.062]).toJSON(),
    primitives.sphere({ name: "left humanoid hand", material: skin }).position(-0.48, 0.52, -0.28).scale(0.058).toJSON(),
    primitives.sphere({ name: "right humanoid hand", material: skin }).position(0.48, 0.52, -0.84).scale(0.058).toJSON(),
    primitives.capsule({ name: "forward connected walking leg", material: pants }).position(-0.14, 0.38, -0.43).rotate(-0.42, 0, -0.04).scale([0.1, 0.35, 0.1]).toJSON(),
    primitives.capsule({ name: "back connected walking leg", material: pants }).position(0.14, 0.38, -0.67).rotate(0.42, 0, 0.04).scale([0.1, 0.35, 0.1]).toJSON(),
    primitives.capsule({ name: "forward lower walking shin", material: pants }).position(-0.22, 0.2, -0.22).rotate(0.28, 0, -0.04).scale([0.092, 0.32, 0.092]).toJSON(),
    primitives.capsule({ name: "back lower walking shin", material: pants }).position(0.22, 0.2, -0.88).rotate(-0.28, 0, 0.04).scale([0.092, 0.32, 0.092]).toJSON(),
    primitives.capsule({ name: "forward continuous leg silhouette connector", material: pants }).position(-0.19, 0.27, -0.28).rotate(-0.28, 0, -0.04).scale([0.08, 0.62, 0.08]).toJSON(),
    primitives.capsule({ name: "back continuous leg silhouette connector", material: pants }).position(0.19, 0.27, -0.8).rotate(0.28, 0, 0.04).scale([0.08, 0.62, 0.08]).toJSON(),
    primitives.box({ name: "forward foot planted on path", material: shoe }).position(-0.28, 0.06, -0.03).rotate(0, -0.14, 0).scale([0.26, 0.075, 0.18]).toJSON(),
    primitives.box({ name: "back foot pushing off path", material: shoe }).position(0.28, 0.06, -1.03).rotate(0, 0.14, 0).scale([0.26, 0.075, 0.18]).toJSON()
  ];
  if (showJoints) {
    nodes.push(
      primitives.sphere({ name: "left shoulder ball joint", material: material.clearcoat({ color: "#bfdbfe", roughness: 0.22, clearcoat: 0.16 }) }).position(-0.28, 1.08, -0.52).scale(0.045).toJSON(),
      primitives.sphere({ name: "right shoulder ball joint", material: material.clearcoat({ color: "#bfdbfe", roughness: 0.22, clearcoat: 0.16 }) }).position(0.28, 1.08, -0.58).scale(0.045).toJSON(),
      primitives.sphere({ name: "forward knee hinge", material: material.clearcoat({ color: "#111827", roughness: 0.38, clearcoat: 0.12 }) }).position(-0.19, 0.26, -0.31).scale(0.045).toJSON(),
      primitives.sphere({ name: "back knee hinge", material: material.clearcoat({ color: "#111827", roughness: 0.38, clearcoat: 0.12 }) }).position(0.19, 0.26, -0.79).scale(0.045).toJSON()
    );
  }
  if (motionTrail) {
    nodes.push(
      primitives.box({ name: "orange forward foot motion streak", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", emissiveIntensity: 0.42, opacity: 0.32 }) }).position(-0.08, 0.055, -0.18).rotate(0, -0.18, 0).scale([0.36, 0.02, 0.036]).toJSON(),
      primitives.box({ name: "blue rear foot motion streak", material: material.emissive({ color: "#60a5fa", emissive: "#60a5fa", emissiveIntensity: 0.36, opacity: 0.28 }) }).position(0.16, 0.055, -0.9).rotate(0, 0.18, 0).scale([0.34, 0.02, 0.034]).toJSON()
    );
  }
  nodes.push(group("hierarchical primitive humanoid rig", [], {
    character: {
      skeleton: createPrimitiveHumanoidSkeleton(style),
      clip,
      pose,
      rootBob: false,
      limbSwing: "joint-hierarchy"
    },
    animation: { clip, speed: 0.9, chain: "root", joint: "root", rootBob: false, jointHierarchy: true }
  }).toJSON());
  return nodes;
}

function createAuthoredLowPolyHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  const clip = options.clip ?? "benchmark-pose";
  const pose = options.pose ?? "three-quarter";
  const glbClip = mapAuraClipToBuiltInHumanoidClip(clip);
  const speed = clip === "run" ? 1.18 : clip === "idle" || clip === "pose" ? 0.42 : 0.78;
  const facing = pose === "side-view" ? 0.72 : pose === "planted-foot" ? -0.08 : -0.24;
  const motionModel = createAuthoredHumanoidMotionModel(clip);
  const captureTime = clip === "benchmark-pose" ? 0.72 : motionModel.footPlanting.captureTime;
  const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "humanoid grounded capture floor", material: material.pbr({ color: "#17251c", roughness: 0.9, metallic: 0.01 }) }).position(0, -0.024, -0.55).scale([3.8, 1, 2.6]).toJSON(),
    primitives.box({ name: "subtle authored humanoid walking path stripe", material: material.pbr({ color: "#2f3b45", roughness: 0.84, metallic: 0.01 }) }).position(0, 0.006, -0.52).scale([1.58, 0.012, 0.16]).toJSON(),
    primitives.cylinder({ name: "authored humanoid soft contact shadow", material: material.pbr({ color: "#020617", roughness: 0.95, metallic: 0.01, opacity: 0.42 }) }).position(0.02, 0.012, -0.5).scale([0.62, 0.012, 0.4]).toJSON(),
    model(builtInCharacterAssets.humanoid, {
      name: "authored skinned humanoid character model",
      castShadow: true,
      receiveShadow: true
    })
      .position(0, 0, -0.56)
      .rotate(0, facing, 0)
      .scale(1.0)
      .animate({ clip: glbClip, speed, loop: true, captureTime })
      .toJSON(),
    effects.contactOcclusion({ name: "authored humanoid renderer contact occlusion", intensity: 0.3, radius: 0.58 }).toJSON(),
    group("authored skinned humanoid rig metadata", [], {
      character: {
        skeleton: createPrimitiveHumanoidSkeleton("mannequin"),
        clip,
        pose,
        rootBob: clip !== "idle" && clip !== "pose",
        limbSwing: "joint-hierarchy",
        footPlanting: { ...motionModel.footPlanting, captureTime },
        rootMotion: motionModel.rootMotion,
        constraints: motionModel.constraints
      },
      animation: { clip: glbClip, speed, chain: "root", joint: "root", rootBob: motionModel.rootMotion.bodyBob, jointHierarchy: true }
    }).toJSON()
  ];

  if (options.motionTrail) {
    nodes.push(
      primitives.box({ name: "optional authored humanoid stride streak left foot", material: material.emissive({ color: "#60a5fa", emissive: "#60a5fa", opacity: 0.28 }) }).position(-0.24, 0.044, -0.14).rotate(0, -0.18, 0).scale([0.34, 0.018, 0.032]).toJSON(),
      primitives.box({ name: "optional authored humanoid stride streak rear foot", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", opacity: 0.28 }) }).position(0.2, 0.044, -0.9).rotate(0, 0.18, 0).scale([0.34, 0.018, 0.032]).toJSON()
    );
  }
  return nodes;
}

function createAuthoredHumanoidMotionModel(clip: AuraCharacterClipName): {
  readonly footPlanting: AuraCharacterFootPlantingSpec;
  readonly rootMotion: AuraCharacterRootMotionSpec;
  readonly constraints: AuraCharacterConstraintCorrectionSpec;
} {
  const moving = clip !== "idle" && clip !== "pose";
  const captureTime = clip === "benchmark-pose"
      ? 0.42
    : clip === "run"
      ? 0.18
      : clip === "wave"
        ? 0.5
        : clip === "turn"
          ? 0.62
          : 0.38;
  return {
    footPlanting: {
      enabled: true,
      groundY: 0,
      plantedFeet: clip === "wave" || clip === "idle" || clip === "pose" ? ["left", "right"] : ["left"],
      captureTime,
      evidence: "authored GLB is normalized to ground contact and benchmark capture times choose planted-foot animation phases"
    },
    rootMotion: {
      enabled: moving,
      bodyBob: moving,
      torsoMovesAsSingleBody: true,
      strideLength: clip === "run" ? 0.54 : moving ? 0.32 : 0,
      evidence: "AnimationMixer drives the skinned GLB root clip as one body instead of animating detached primitive limbs"
    },
    constraints: {
      enabled: true,
      correctedChains: ["spine", "left-arm", "right-arm", "left-leg", "right-leg"],
      maxJointGap: 0.035,
      evidence: "skinned GLB joints keep shoulder, elbow, hip, knee, wrist, and ankle chains bound to the authored skeleton"
    }
  };
}

function mapAuraClipToBuiltInHumanoidClip(clip: AuraCharacterClipName): string {
  // Only Idle/Run/TPose/Walk exist in humanoid-fixture.glb; aura clips without an
  // authored equivalent (wave, turn) fall back to the nearest stationary clip.
  if (clip === "idle") return "Idle";
  if (clip === "walk" || clip === "benchmark-pose") return "Walk";
  if (clip === "run") return "Run";
  if (clip === "pose") return "TPose";
  if (clip === "wave") return "Idle";
  if (clip === "turn") return "Idle";
  return "Walk";
}

function createProceduralHumanMesh(options: AuraPrimitiveHumanoidPrefabOptions = {}): AuraProceduralHumanMeshDescriptor {
  const style = options.style ?? "athletic";
  const skin = material.pbr({ color: "#f4c7a1", roughness: 0.58, metallic: 0.01 });
  const shirt = material.clearcoat({ color: style === "robot" ? "#2563eb" : "#475569", roughness: 0.34, clearcoat: 0.28 });
  const pants = material.pbr({ color: "#111827", roughness: 0.64, metallic: 0.02 });
  const shoe = material.pbr({ color: "#020617", roughness: 0.72, metallic: 0.01 });
  const parts: AuraProceduralHumanMeshPart[] = [];
  const addPart = (
    name: AuraProceduralHumanMeshPartName,
    joint: AuraCharacterJointName,
    center: AuraVec3,
    size: AuraVec3,
    partMaterial: AuraMaterialSpec,
    parent?: AuraProceduralHumanMeshPartName
  ) => {
    parts.push({
      name,
      parent,
      joint,
      center,
      size,
      vertices: createProceduralHumanPartVertices(size),
      indices: proceduralHumanPartIndices,
      material: partMaterial
    });
  };

  addPart("pelvis", "pelvis", [0, 0.54, -0.55], [0.42, 0.22, 0.3], pants);
  addPart("torso", "spine", [0, 0.92, -0.55], [0.48, 0.7, 0.32], shirt, "pelvis");
  addPart("neck", "neck", [0, 1.34, -0.55], [0.13, 0.18, 0.13], skin, "torso");
  addPart("head", "head", [0, 1.58, -0.5], [0.34, 0.42, 0.32], skin, "neck");
  addPart("left-shoulder", "left-shoulder", [-0.32, 1.12, -0.55], [0.2, 0.2, 0.2], shirt, "torso");
  addPart("right-shoulder", "right-shoulder", [0.32, 1.12, -0.55], [0.2, 0.2, 0.2], shirt, "torso");
  addPart("left-upper-arm", "left-elbow", [-0.44, 0.9, -0.46], [0.16, 0.38, 0.16], shirt, "left-shoulder");
  addPart("left-lower-arm", "left-wrist", [-0.5, 0.62, -0.35], [0.13, 0.34, 0.13], skin, "left-upper-arm");
  addPart("right-upper-arm", "right-elbow", [0.43, 0.92, -0.64], [0.16, 0.38, 0.16], shirt, "right-shoulder");
  addPart("right-lower-arm", "right-wrist", [0.5, 0.64, -0.77], [0.13, 0.34, 0.13], skin, "right-upper-arm");
  addPart("left-hand", "left-wrist", [-0.52, 0.38, -0.3], [0.14, 0.16, 0.1], skin, "left-lower-arm");
  addPart("right-hand", "right-wrist", [0.53, 0.4, -0.84], [0.14, 0.16, 0.1], skin, "right-lower-arm");
  addPart("left-hip", "left-hip", [-0.18, 0.45, -0.49], [0.18, 0.18, 0.18], pants, "pelvis");
  addPart("right-hip", "right-hip", [0.18, 0.45, -0.61], [0.18, 0.18, 0.18], pants, "pelvis");
  addPart("left-upper-leg", "left-knee", [-0.16, 0.28, -0.34], [0.2, 0.38, 0.2], pants, "left-hip");
  addPart("left-lower-leg", "left-ankle", [-0.23, 0.105, -0.15], [0.17, 0.34, 0.17], pants, "left-upper-leg");
  addPart("right-upper-leg", "right-knee", [0.15, 0.29, -0.73], [0.2, 0.38, 0.2], pants, "right-hip");
  addPart("right-lower-leg", "right-ankle", [0.26, 0.105, -0.94], [0.17, 0.34, 0.17], pants, "right-upper-leg");
  addPart("left-foot", "left-ankle", [-0.27, 0.045, -0.02], [0.3, 0.08, 0.46], shoe, "left-lower-leg");
  addPart("right-foot", "right-ankle", [0.32, 0.045, -1.08], [0.3, 0.08, 0.46], shoe, "right-lower-leg");

  return {
    kind: "aura-procedural-human-mesh",
    style,
    skeleton: createPrimitiveHumanoidSkeleton(style),
    clips: characterClips,
    parts,
    evidence: [
      "procedural generator emits actual vertex/index mesh parts, not string asset ids",
      "anatomical coverage includes torso, pelvis, neck, head, upper/lower arms, upper/lower legs, hands, feet, shoulders, and hips",
      "benchmark-facing humanoid still defaults to the authored skinned GLB; this generator is a fallback/customization primitive"
    ]
  };
}

const proceduralHumanPartIndices = [
  0, 1, 2, 0, 2, 3,
  4, 6, 5, 4, 7, 6,
  0, 4, 5, 0, 5, 1,
  1, 5, 6, 1, 6, 2,
  2, 6, 7, 2, 7, 3,
  3, 7, 4, 3, 4, 0
] as const;

function createProceduralHumanPartVertices(size: AuraVec3): readonly AuraVec3[] {
  const x = size[0] * 0.5;
  const y = size[1] * 0.5;
  const z = size[2] * 0.5;
  return [
    [-x, -y, -z],
    [x, -y, -z],
    [x, y, -z],
    [-x, y, -z],
    [-x, -y, z],
    [x, -y, z],
    [x, y, z],
    [-x, y, z]
  ];
}

export function distance3(a: AuraVec3, b: AuraVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export const character = {
  builtInHumanoidAsset: (): AuraAssetRef<"model", "humanoid"> => builtInCharacterAssets.humanoid,
  skeleton: createPrimitiveHumanoidSkeleton,
  clips: (): readonly AuraCharacterClip[] => characterClips,
  proceduralHumanMesh: createProceduralHumanMesh,
  lowPolyHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => createLowPolyHumanoid(options),
  authoredHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => createAuthoredLowPolyHumanoid(options),
  primitiveHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => createHierarchicalPrimitiveHumanoid(options),
  performance: createAnimationPerformance,
  importedRigRuntime: async (options: GLTFSceneAnimationRuntimeOptions): Promise<GLTFSceneAnimationRuntime> => {
    markAuraLazySystemRequested("character-rig", "character.importedRigRuntime");
    const started = performanceNow();
    const assets = await import("@aura3d/assets/browser");
    markAuraLazySystemLoaded("character-rig", performanceNow() - started);
    return assets.createGLTFSceneAnimationRuntime(options);
  },
  visualQA: validatePrimitiveHumanoidVisualQA,
  validatePrimitiveHumanoid: validatePrimitiveHumanoidVisualQA
} as const;
