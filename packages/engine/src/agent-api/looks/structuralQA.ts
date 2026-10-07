// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
//
// PRD-13 T1.11 (§7.4): every visualQA result additionally returns, always and
// additively, `{ deprecated: true, kind: "structural-name-heuristic" }` — no
// existing key changes or disappears. The same checks with renamed keys live
// on the `structuralQA` namespace at the bottom of this file. The
// `@deprecated` JSDoc on the namespace properties is requested (Q-04-1,
// Q-15-2) since those properties live in other lanes' files.

import type { AuraCharacterVisualQAGap, AuraCharacterVisualQAResult, AuraChartVisualQAResult, AuraCityStateChangeEvidence, AuraCityVisualQAResult, AuraEffectNode, AuraGroupNode, AuraLabelNode, AuraMaterialSpec, AuraMaterialVisualQAResult, AuraModelNode, AuraNeonVisualQAResult, AuraPrimitiveNode, AuraProductDiagnostics, AuraProductVisualQAResult, AuraSceneNode, AuraSolarVisualQAResult, AuraVec3 } from "../index.js";
import { animation, builtInCharacterAssets, character, collectCityInstancingPlan, createAssetProvenance, distance3, findGroupNode, groups, labels, minimumMaterialFeatureDistance, solarMaterialPresetsInNodes } from "../index.js";
import { instances } from "../nodes/instances.js";
import { material } from "../nodes/material.js";

/** §7.4 additive marker on every visualQA result. */
export interface AuraDeprecatedVisualQA {
  readonly deprecated: true;
  readonly kind: "structural-name-heuristic";
}

/** structuralQA result: same checks, renamed keys, no pixel claims. */
export interface AuraStructuralQAResult {
  readonly kind: "structural-name-heuristic";
  readonly ok: boolean;
  readonly checks: Readonly<Record<string, boolean>>;
}

type DeprecatedQA<T> = T & AuraDeprecatedVisualQA;

export function validateMaterialVisualQA(nodes: readonly AuraSceneNode[]): DeprecatedQA<AuraMaterialVisualQAResult> {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const specs = flattened
    .filter((node): node is AuraPrimitiveNode | AuraModelNode => (node.kind === "primitive" || node.kind === "model") && Boolean(node.material))
    .map((node) => node.material!)
    .filter(Boolean);
  const lowerNames = names.map((name) => name.toLowerCase());
  const labelsCount = flattened.filter((node): node is AuraLabelNode => node.kind === "label").length +
    lowerNames.filter((name) => name.includes("material label")).length;
  const plinths = lowerNames.filter((name) => name.includes("label plinth") || name.includes("swatch plinth") || name.includes("material comparison")).length;
  const reflectionCards = lowerNames.filter((name) =>
    name.includes("reflection card") ||
    name.includes("reflection strip") ||
    name.includes("contrast card") ||
    name.includes("softbox reflection") ||
    name.includes("environment reflection")
  ).length;
  const hasNamed = (needle: string) => lowerNames.some((name) => name.includes(needle));
  const classSpecs: Record<string, AuraMaterialSpec | undefined> = {
    chrome: specs.find((spec) => (spec.metalness ?? spec.metallic ?? 0) > 0.85 && (spec.roughness ?? 1) < 0.12) ?? specs.find((_, index) => lowerNames[index]?.includes("chrome")),
    glass: specs.find((spec) => (spec.transmission ?? 0) > 0.55 || (spec.opacity ?? 1) < 0.5),
    rubber: specs.find((spec) => (spec.roughness ?? 0) > 0.82 && (spec.metalness ?? spec.metallic ?? 0) < 0.08 && !spec.emissive),
    emissive: specs.find((spec) => Boolean(spec.emissive)),
    clearcoat: specs.find((spec) => (spec.clearcoat ?? 0) > 0.7 && (spec.transmission ?? 0) < 0.2)
  };
  const classes = Object.entries(classSpecs)
    .filter(([, spec]) => Boolean(spec))
    .map(([key]) => key);
  const minimumMaterialDistance = minimumMaterialFeatureDistance(Object.values(classSpecs).filter((spec): spec is AuraMaterialSpec => Boolean(spec)));
  const chromeReflectsEnvironment = Boolean(classSpecs.chrome) && reflectionCards >= 4 && (hasNamed("chrome bright reflection") || hasNamed("environment reflection"));
  const glassTransparent = Boolean(classSpecs.glass) && (hasNamed("transparent") || hasNamed("refracted") || hasNamed("glass contrast"));
  const rubberSpec = classSpecs.rubber;
  const rubberNonReflective = rubberSpec ? (rubberSpec.roughness ?? 0) >= 0.85 && (rubberSpec.envMapIntensity ?? 1) <= 0.55 : false;
  const emissiveGlows = Boolean(classSpecs.emissive) && (hasNamed("glow halo") || hasNamed("glow spill") || flattened.some((node) => node.kind === "effect" && node.effect === "bloom"));
  const clearcoatLayeredHighlight = Boolean(classSpecs.clearcoat) && (hasNamed("outer gloss layer") || hasNamed("topcoat highlight") || hasNamed("base reflection"));
  const problems: string[] = [];
  if (classes.length < 5) problems.push(`expected five distinguishable material classes, found ${classes.join(", ") || "none"}`);
  if (plinths < 5) problems.push(`expected at least five material plinth/label supports, found ${plinths}`);
  if (labelsCount < 5) problems.push(`expected five readable material labels, found ${labelsCount}`);
  if (reflectionCards < 5) problems.push(`expected reflection/contrast cards, found ${reflectionCards}`);
  if (!chromeReflectsEnvironment) problems.push("chrome lacks readable environment reflection cues");
  if (!glassTransparent) problems.push("glass lacks transparency/refraction cues");
  if (!rubberNonReflective) problems.push("rubber does not read as rough non-reflective material");
  if (!emissiveGlows) problems.push("emissive material lacks controlled glow cues");
  if (!clearcoatLayeredHighlight) problems.push("clearcoat lacks layered specular highlight cues");
  if (minimumMaterialDistance < 0.28) problems.push(`material classes are too similar, minimum feature distance ${minimumMaterialDistance.toFixed(2)}`);
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    classes,
    plinths,
    labels: labelsCount,
    reflectionCards,
    chromeReflectsEnvironment,
    glassTransparent,
    rubberNonReflective,
    emissiveGlows,
    clearcoatLayeredHighlight,
    minimumMaterialDistance,
    problems,
    deprecated: true,
    kind: "structural-name-heuristic"
  };
}

export function validateNeonVisualQA(nodes: readonly AuraSceneNode[]): DeprecatedQA<AuraNeonVisualQAResult> {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const ringCount = names.filter((name) => name.includes("neon tunnel tube ring") || name.includes("receding neon tunnel top segment")).length;
  const hasFog = flattened.some((node) => node.kind === "effect" && node.effect === "fog");
  const bloom = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "bloom");
  const hasBloom = Boolean(bloom);
  const hasReflections = names.some((name) => name.includes("reflection streak") || name.includes("glossy black neon tunnel floor"));
  const hasDepthCues = names.some((name) => name.includes("vanishing") || name.includes("receding"));
  const overexposureRisk = (bloom?.intensity ?? 0) > 1 || names.filter((name) => name.includes("tiny vanishing point glow")).length > 2;
  const problems: string[] = [];
  if (ringCount < 24) problems.push(`expected at least 24 tunnel ring/depth elements, found ${ringCount}`);
  if (!hasFog) problems.push("missing fog depth cue");
  if (!hasBloom) problems.push("missing controlled bloom");
  if (!hasReflections) problems.push("missing reflective floor/wall cues");
  if (!hasDepthCues) problems.push("missing vanishing/receding depth cues");
  if (overexposureRisk) problems.push("bloom or glow risks whiteout");
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    ringCount,
    hasFog,
    hasBloom,
    hasReflections,
    hasDepthCues,
    overexposureRisk,
    problems,
    deprecated: true,
    kind: "structural-name-heuristic"
  };
}

export function validateChartVisualQA(nodes: readonly AuraSceneNode[]): DeprecatedQA<AuraChartVisualQAResult> {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const bars = names.filter((name) => name.includes("height-colored data bar")).length;
  const labelsCount = flattened.filter((node) => node.kind === "label").length + names.filter((name) => name.includes("label chip") || name.includes("value label")).length;
  const legends = names.filter((name) => name.includes("legend swatch")).length;
  const selectedOutlines = names.filter((name) => name.includes("selected data bar outline")).length;
  const problems: string[] = [];
  if (bars < 36) problems.push(`expected at least 36 bars, found ${bars}`);
  if (labelsCount < 12) problems.push(`expected grounded axis/title/value labels, found ${labelsCount}`);
  if (legends < 3) problems.push(`expected 3 legend swatches, found ${legends}`);
  const orphanPlanes = names.filter((name) => name.includes("orphan") || name.includes("cobweb") || name.includes("stray"));
  if (orphanPlanes.length > 0) problems.push(`stray geometry markers found: ${orphanPlanes.join(", ")}`);
  const score = Math.max(1, 5 - problems.length);
  return { passes: problems.length === 0, score, bars, labels: labelsCount, legends, selectedOutlines, problems, deprecated: true, kind: "structural-name-heuristic" };
}

export function validatePrimitiveHumanoidVisualQA(nodes: readonly AuraSceneNode[]): DeprecatedQA<AuraCharacterVisualQAResult> {
  const flattened = groups.flatten(nodes);
  const authoredHumanoid = flattened.find((node): node is AuraModelNode =>
    node.kind === "model" && (node.asset.id === builtInCharacterAssets.humanoid.id || String(node.name ?? "").toLowerCase().includes("authored skinned humanoid"))
  );
  if (authoredHumanoid) {
    const problems: string[] = [];
    const animationNames = authoredHumanoid.asset.metadata?.animations ?? [];
    const hasGrounding = flattened.some((node) =>
      (node.kind === "primitive" && String(node.name ?? "").toLowerCase().includes("contact shadow")) ||
      (node.kind === "effect" && node.effect === "contact-occlusion")
    );
    if (!authoredHumanoid.asset.bounds || authoredHumanoid.asset.bounds[1] < 1.2) problems.push("authored humanoid asset is missing credible humanoid bounds");
    if (animationNames.length < 1) problems.push("authored humanoid asset is missing embedded animation clips");
    if (!authoredHumanoid.animation?.clip) problems.push("authored humanoid model is missing an active animation clip");
    if (!authoredHumanoid.castShadow || !authoredHumanoid.receiveShadow) problems.push("authored humanoid model is missing shadow participation");
    if (!hasGrounding) problems.push("authored humanoid scene is missing contact grounding");
    const rig = findGroupNode(nodes, (node) =>
      String(node.name ?? "").toLowerCase().includes("authored skinned") &&
      String(node.name ?? "").toLowerCase().includes("rig metadata")
    );
    const footPlanting = rig?.character?.footPlanting;
    const rootMotion = rig?.character?.rootMotion;
    const constraints = rig?.character?.constraints;
    if (!footPlanting?.enabled || footPlanting.plantedFeet.length === 0 || footPlanting.groundY !== 0) {
      problems.push("authored humanoid scene is missing foot-planting capture metadata");
    }
    if (!rootMotion?.torsoMovesAsSingleBody || rig?.animation?.jointHierarchy !== true) {
      problems.push("authored humanoid scene is missing connected root-motion/body-bob metadata");
    }
    if (!constraints?.enabled || constraints.correctedChains.length < 5 || constraints.maxJointGap > 0.05) {
      problems.push("authored humanoid scene is missing skeleton constraint-correction metadata");
    }
    const score = Math.max(1, 5 - problems.length);
    return {
      connected: problems.length === 0,
      impossibleProportions: false,
      score,
      gaps: [],
      problems,
      deprecated: true,
      kind: "structural-name-heuristic"
    };
  }
  const primitiveByName = (name: string): AuraPrimitiveNode | undefined =>
    flattened.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === name);
  const point = (name: string): AuraVec3 | undefined => primitiveByName(name)?.position;
  const gaps: AuraCharacterVisualQAGap[] = [];
  const problems: string[] = [];
  const checkGap = (id: string, from: string, to: string, maxDistance: number) => {
    const a = point(from);
    const b = point(to);
    if (!a || !b) {
      problems.push(`missing ${!a ? from : to}`);
      return;
    }
    const distance = distance3(a, b);
    if (distance > maxDistance) gaps.push({ id, from, to, distance, maxDistance });
  };
  const checkOptionalGap = (id: string, from: string, to: string, maxDistance: number) => {
    if (!point(from) || !point(to)) return;
    checkGap(id, from, to, maxDistance);
  };
  const scalarScale = (node: AuraPrimitiveNode | undefined): number => {
    if (typeof node?.scale === "number") return node.scale;
    if (Array.isArray(node?.scale)) return Math.max(...node.scale);
    return 1;
  };

  checkGap("neck-head", "short humanoid neck connector", "humanoid head", 0.28);
  checkGap("spine-neck", "connected blue humanoid torso", "short humanoid neck connector", 0.5);
  checkGap("left-shoulder-arm", "shoulder bar connecting arms", "left attached swinging arm", 0.36);
  checkGap("right-shoulder-arm", "shoulder bar connecting arms", "right attached swinging arm", 0.36);
  checkGap("left-elbow-forearm", "left attached swinging arm", "left bent forearm", 0.34);
  checkGap("right-elbow-forearm", "right attached swinging arm", "right bent forearm", 0.34);
  checkGap("left-wrist-hand", "left bent forearm", "left humanoid hand", 0.24);
  checkGap("right-wrist-hand", "right bent forearm", "right humanoid hand", 0.24);
  checkGap("left-hip-leg", "hip bar connecting legs", "forward connected walking leg", 0.38);
  checkGap("right-hip-leg", "hip bar connecting legs", "back connected walking leg", 0.38);
  checkGap("left-knee-shin", "forward connected walking leg", "forward lower walking shin", 0.38);
  checkGap("right-knee-shin", "back connected walking leg", "back lower walking shin", 0.38);
  checkGap("left-ankle-foot", "forward lower walking shin", "forward foot planted on path", 0.28);
  checkGap("right-ankle-foot", "back lower walking shin", "back foot pushing off path", 0.28);
  checkOptionalGap("optional-left-shoulder-joint", "left shoulder ball joint", "left attached swinging arm", 0.3);
  checkOptionalGap("optional-right-shoulder-joint", "right shoulder ball joint", "right attached swinging arm", 0.3);
  checkOptionalGap("optional-left-knee-joint", "forward knee hinge", "forward lower walking shin", 0.3);
  checkOptionalGap("optional-right-knee-joint", "back knee hinge", "back lower walking shin", 0.3);

  const headScale = scalarScale(primitiveByName("humanoid head"));
  const leftHandScale = scalarScale(primitiveByName("left humanoid hand"));
  const rightHandScale = scalarScale(primitiveByName("right humanoid hand"));
  const leftFoot = primitiveByName("forward foot planted on path");
  const rightFoot = primitiveByName("back foot pushing off path");
  if (headScale > 0.28) problems.push(`head too large: ${headScale.toFixed(3)}`);
  if (leftHandScale > 0.13 || rightHandScale > 0.13) problems.push(`hand too large: ${Math.max(leftHandScale, rightHandScale).toFixed(3)}`);
  if (!leftFoot || !rightFoot) problems.push("missing planted feet");
  const hasNamedRig = (entries: readonly AuraSceneNode[]): boolean => entries.some((node) =>
    node.kind === "group" && ((node.name === "hierarchical primitive humanoid rig" || node.name === "generated low poly humanoid metadata") || hasNamedRig(node.children))
  );
  if (!hasNamedRig(nodes) && nodes.some((node) => node.kind === "group")) {
    problems.push("missing named hierarchical primitive humanoid rig");
  }

  const impossibleProportions = problems.some((problem) => problem.includes("too large"));
  const score = Math.max(1, 5 - gaps.length - (impossibleProportions ? 1 : 0) - Math.max(0, problems.length - (impossibleProportions ? 1 : 0)));
  return {
    connected: gaps.length === 0 && !problems.some((problem) => problem.startsWith("missing")),
    impossibleProportions,
    score,
    gaps,
    problems,
    deprecated: true,
    kind: "structural-name-heuristic"
  };
}

export function validateCityVisualQA(nodes: readonly AuraSceneNode[], options: { readonly changed?: AuraCityStateChangeEvidence } = {}): DeprecatedQA<AuraCityVisualQAResult> {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const buildings = flattened.reduce((total, node) => {
    if (!("name" in node) || !node.name?.includes("city tower")) return total;
    return total + (node.kind === "primitive" && node.instances?.length ? node.instances.length : 1);
  }, 0);
  const windows = names.filter((name) => name.includes("window column")).length;
  const streets = names.filter((name) => name.includes("road") || name.includes("street") || name.includes("avenue")).length;
  const crosswalks = names.filter((name) => name.includes("crosswalk")).length;
  const lights = names.filter((name) => name.includes("street lamp") || name.includes("street light") || name.includes("headlight") || name.includes("lamp glow")).length;
  const props = names.filter((name) => name.includes("bench") || name.includes("tree") || name.includes("sign") || name.includes("car body") || name.includes("traffic signal")).length;
  const facadeDetails = names.filter((name) =>
    name.includes("facade") ||
    name.includes("storefront") ||
    name.includes("awning") ||
    name.includes("roof") ||
    name.includes("door") ||
    name.includes("balcony") ||
    name.includes("ledge")
  ).length;
  const instancing = collectCityInstancingPlan(nodes);
  const dayNightChanged = Boolean(options.changed && options.changed.changedNodeNames.length >= 4);
  const problems: string[] = [];
  if (buildings < 18) problems.push(`expected about 20 buildings, found ${buildings}`);
  if (windows < 40) problems.push(`expected dense modular windows, found ${windows}`);
  if (streets < 8) problems.push(`expected readable streets/roads/avenues, found ${streets}`);
  if (crosswalks < 16) problems.push(`expected multiple zebra crosswalk stripes, found ${crosswalks}`);
  if (lights < 10) problems.push(`expected streetlights/headlights/glow evidence, found ${lights}`);
  if (props < 10) problems.push(`expected city props such as trees, benches, signs, cars, and signals, found ${props}`);
  if (facadeDetails < 45) problems.push(`expected modular facade detail, found ${facadeDetails}`);
  if (!instancing.instanced) problems.push("missing repeated-primitive instancing evidence for windows, props, road markings, and lights");
  if (!dayNightChanged) problems.push("missing day/night changed-state evidence");
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    buildings,
    windows,
    streets,
    crosswalks,
    lights,
    props,
    facadeDetails,
    dayNightChanged,
    instancing,
    problems,
    deprecated: true,
    kind: "structural-name-heuristic"
  };
}

export function validateProductVisualQA(nodes: readonly AuraSceneNode[], diagnostics?: AuraProductDiagnostics): DeprecatedQA<AuraProductVisualQAResult> {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const modelNodes = flattened.filter((node): node is AuraModelNode => node.kind === "model");
  const model = modelNodes[0];
  const softboxes = flattened.filter((node) =>
    node.kind === "light" && (node.light === "softbox" || node.light === "rect" || node.light === "studio")
  ).length + names.filter((name) => name.includes("softbox")).length;
  const reflectionCards = names.filter((name) => name.includes("reflection card") || name.includes("highlight card") || name.includes("softbox reflection")).length;
  const contactShadows = names.filter((name) => name.includes("contact shadow")).length;
  const materialReadabilityCues = names.filter((name) =>
    name.includes("sneaker mesh") ||
    name.includes("rubber sole") ||
    name.includes("lace detail") ||
    name.includes("rim softbox") ||
    name.includes("fill product photography")
  ).length;
  const inspectionGuides = names.filter((name) => name.includes("fit to bounds") || name.includes("normalized asset") || name.includes("bracket")).length;
  const provenance = model ? createAssetProvenance(model.asset) : diagnostics?.provenance;
  const typedAssetProvenance = Boolean(provenance && provenance.source !== "unsafe-url");
  const cleanHeroMode = diagnostics?.cleanHeroMode ?? (inspectionGuides === 0 && !names.some((name) => name.includes("provenance badge")));
  const centeredAndSeated = Boolean(
    diagnostics?.placement.centered && diagnostics.placement.seatedOnPlinth ||
    (model?.position?.[0] === 0 && model.position[1] >= 0.5 && model.position[2] === -0.65)
  );
  const problems: string[] = [];
  if (modelNodes.length !== 1) problems.push(`expected one typed product model, found ${modelNodes.length}`);
  if (softboxes < 5) problems.push(`expected product photography softbox/fill/rim lighting, found ${softboxes}`);
  if (reflectionCards < 2) problems.push(`expected reflection/highlight cards, found ${reflectionCards}`);
  if (contactShadows < 1) problems.push("missing product footprint contact shadow");
  if (materialReadabilityCues < 3) problems.push(`expected sneaker mesh/rubber/lace detail lighting cues, found ${materialReadabilityCues}`);
  if (!centeredAndSeated) problems.push("product is not centered and seated on the plinth");
  if (!cleanHeroMode) problems.push("clean hero mode includes inspection/provenance clutter");
  if (!typedAssetProvenance) problems.push("missing typed asset provenance report");
  if (!(diagnostics?.turntableEnabled ?? names.some((name) => name.includes("turntable")))) problems.push("missing deterministic turntable evidence");
  if (!(diagnostics?.orbitEnabled ?? names.some((name) => name.includes("orbit control arc") || name.includes("turntable orbit cue")))) problems.push("missing orbit diagnostic evidence");
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    modelCount: modelNodes.length,
    softboxes,
    reflectionCards,
    contactShadows,
    materialReadabilityCues,
    inspectionGuides,
    cleanHeroMode,
    centeredAndSeated,
    typedAssetProvenance,
    problems,
    deprecated: true,
    kind: "structural-name-heuristic"
  };
}

export function validateSolarVisualQA(nodes: readonly AuraSceneNode[]): DeprecatedQA<AuraSolarVisualQAResult> {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const planets = names.filter((name) => name.includes("material labeled orbiting planet")).length;
  const orbitSegments = names.filter((name) => name.includes("orbit path segment")).length;
  const labelsCount = flattened.filter((node): node is AuraLabelNode => node.kind === "label" && node.name?.includes("collision-avoiding orbit label") === true).length +
    names.filter((name) => name.includes("readable planet label")).length;
  const leaderLines = names.filter((name) => name.includes("attached label leader line")).length;
  const stars = names.filter((name) => name.includes("background star")).length;
  const dust = names.filter((name) => name.includes("solar dust depth mote")).length;
  const hasSunShader = flattened.some((node) =>
    node.kind === "primitive" && node.material?.shader === "solar-sun" && String(node.name ?? "").includes("sun shader core")
  );
  const hasSunCorona = flattened.some((node) =>
    node.kind === "primitive" && node.material?.shader === "solar-corona" && String(node.name ?? "").includes("sun corona shader")
  ) && flattened.some((node) =>
    node.kind === "primitive" && node.material?.shader === "solar-corona" && String(node.name ?? "").includes("solar glow halo shader")
  );
  const hasBloom = flattened.some((node) => node.kind === "effect" && node.effect === "bloom");
  const orbitAnimatedNodes = flattened.filter((node): node is AuraModelNode | AuraPrimitiveNode | AuraGroupNode | AuraLabelNode =>
    (node.kind === "model" || node.kind === "primitive" || node.kind === "group" || node.kind === "label") && node.animation?.clip === "orbit"
  );
  const deterministicCapturePhase = orbitAnimatedNodes.length > 0 && orbitAnimatedNodes.every((node) => node.animation?.captureTime !== undefined);
  const materialPresets = solarMaterialPresetsInNodes(nodes);
  const problems: string[] = [];
  if (planets < 6) problems.push(`expected six materialized planets, found ${planets}`);
  if (materialPresets.length < 6) problems.push(`expected six planet material presets, found ${materialPresets.join(", ")}`);
  if (orbitSegments < 72) problems.push(`expected readable uncluttered orbit segments, found ${orbitSegments}`);
  if (labelsCount < 12) problems.push(`expected readable attached labels plus sprite labels, found ${labelsCount}`);
  if (leaderLines < 6) problems.push(`expected label leader lines for all planets, found ${leaderLines}`);
  if (stars < 24) problems.push(`expected visible starfield, found ${stars}`);
  if (dust < 6) problems.push(`expected dust/depth background, found ${dust}`);
  if (!hasSunShader || !hasSunCorona || !hasBloom) problems.push("missing sun shader, corona shader, or bloom evidence");
  if (!deterministicCapturePhase) problems.push("orbit animations missing deterministic capture phase");
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    planets,
    materialPresets,
    orbitSegments,
    labels: labelsCount,
    leaderLines,
    stars,
    dust,
    hasSunCorona,
    hasBloom,
    deterministicCapturePhase,
    problems,
    deprecated: true,
    kind: "structural-name-heuristic"
  };
}

// ---------------------------------------------------------------------------
// §7.4 — `structuralQA`: the same checks, renamed keys, no pixel claims.
// `visualQA` names claim pixels (e.g. `chromeReflectsEnvironment`); the
// structural names say exactly what is measured (`...NodesNamed`, `...Count`
// thresholds). Each converter mirrors the validator's thresholds; keep them
// in sync when a validator changes.
// ---------------------------------------------------------------------------

export const structuralQA = {
  material(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult {
    const qa = validateMaterialVisualQA(nodes);
    return {
      kind: "structural-name-heuristic",
      ok: qa.passes,
      checks: {
        fiveMaterialClassesNamed: qa.classes.length >= 5,
        fivePlinthNodesNamed: qa.plinths >= 5,
        fiveLabelNodesNamed: qa.labels >= 5,
        fiveReflectionCardNodesNamed: qa.reflectionCards >= 5,
        chromeReflectionNodesNamed: qa.chromeReflectsEnvironment,
        glassTransparencyNodesNamed: qa.glassTransparent,
        rubberNonReflectiveNodeNamed: qa.rubberNonReflective,
        emissiveGlowNodesNamed: qa.emissiveGlows,
        clearcoatLayeredHighlightNodesNamed: qa.clearcoatLayeredHighlight,
        materialClassesFeatureDistance: qa.minimumMaterialDistance >= 0.28
      }
    };
  },

  neon(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult {
    const qa = validateNeonVisualQA(nodes);
    return {
      kind: "structural-name-heuristic",
      ok: qa.passes,
      checks: {
        tunnelDepthElementsNamed: qa.ringCount >= 24,
        fogDepthCuePresent: qa.hasFog,
        bloomPassPresent: qa.hasBloom,
        reflectiveFloorNodesNamed: qa.hasReflections,
        vanishingDepthNodesNamed: qa.hasDepthCues,
        bloomWhiteoutRisk: qa.overexposureRisk
      }
    };
  },

  charts(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult {
    const qa = validateChartVisualQA(nodes);
    return {
      kind: "structural-name-heuristic",
      ok: qa.passes,
      checks: {
        dataBarsNamed: qa.bars >= 36,
        axisLabelsNamed: qa.labels >= 12,
        legendSwatchesNamed: qa.legends >= 3,
        selectionOutlinesNamed: qa.selectedOutlines > 0
      }
    };
  },

  character(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult {
    const qa = validatePrimitiveHumanoidVisualQA(nodes);
    return {
      kind: "structural-name-heuristic",
      ok: qa.connected && !qa.impossibleProportions && qa.problems.length === 0,
      checks: {
        humanoidStructureConnected: qa.connected,
        proportionsPlausible: !qa.impossibleProportions,
        noGapViolations: qa.gaps.length === 0
      }
    };
  },

  city(nodes: readonly AuraSceneNode[], options: { readonly changed?: AuraCityStateChangeEvidence } = {}): AuraStructuralQAResult {
    const qa = validateCityVisualQA(nodes, options);
    return {
      kind: "structural-name-heuristic",
      ok: qa.passes,
      checks: {
        cityBuildingsNamed: qa.buildings >= 18,
        modularWindowsNamed: qa.windows >= 40,
        streetsNamed: qa.streets >= 8,
        crosswalkStripesNamed: qa.crosswalks >= 16,
        streetLightingNamed: qa.lights >= 10,
        cityPropsNamed: qa.props >= 10,
        facadeDetailNamed: qa.facadeDetails >= 45,
        instancedPrimitivesPresent: qa.instancing.instanced,
        dayNightStateEvidence: qa.dayNightChanged
      }
    };
  },

  product(nodes: readonly AuraSceneNode[], diagnostics?: AuraProductDiagnostics): AuraStructuralQAResult {
    const qa = validateProductVisualQA(nodes, diagnostics);
    return {
      kind: "structural-name-heuristic",
      ok: qa.passes,
      checks: {
        singleTypedModelPresent: qa.modelCount === 1,
        photographySoftboxesNamed: qa.softboxes >= 5,
        reflectionCardsNamed: qa.reflectionCards >= 2,
        contactShadowNamed: qa.contactShadows >= 1,
        materialReadabilityCuesNamed: qa.materialReadabilityCues >= 3,
        freeOfInspectionGuides: qa.inspectionGuides === 0,
        cleanHeroModeReported: qa.cleanHeroMode,
        centeredAndSeatedReported: qa.centeredAndSeated,
        typedProvenanceReported: qa.typedAssetProvenance
      }
    };
  },

  solar(nodes: readonly AuraSceneNode[]): AuraStructuralQAResult {
    const qa = validateSolarVisualQA(nodes);
    return {
      kind: "structural-name-heuristic",
      ok: qa.passes,
      checks: {
        sixPlanetsNamed: qa.planets >= 6,
        planetMaterialPresetsNamed: qa.materialPresets.length >= 6,
        orbitSegmentsNamed: qa.orbitSegments >= 72,
        orbitLabelsNamed: qa.labels >= 12,
        labelLeaderLinesNamed: qa.leaderLines >= 6,
        starfieldNamed: qa.stars >= 24,
        dustLayerNamed: qa.dust >= 6,
        sunCoronaShaderNamed: qa.hasSunCorona,
        bloomPassPresent: qa.hasBloom,
        deterministicOrbitCapture: qa.deterministicCapturePhase
      }
    };
  }
} as const;
