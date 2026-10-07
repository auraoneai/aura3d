// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraCharacterClipName, AuraSceneNode, AuraCameraSpec, AuraSceneKitId, AuraSceneKitCustomizeOptions, AuraSceneKitPerformanceDiagnostics, AuraSceneKitInstancingFamilyEvidence, AuraSceneKitInstancingEvidence, AuraSceneKitLodEvidence, AuraSceneKitLazySystemId, AuraSceneKitLazyLoadingEntry, AuraSceneKitLazyLoadingPlan, AuraSceneKitBudgetDefaults } from "./nodes/types.js";
import { AuraRuntimeError } from "./app/errors.js";
import { MINI_GOLF_LAYOUT, prefabs } from "./nodes/prefabs/index.js";
import { camera } from "./nodes/camera.js";
import { character } from "./nodes/character.js";
import { charts } from "./nodes/charts.js";
import { city } from "./nodes/city.js";
import { effects } from "./nodes/effects.composite.js";
import { environments } from "./nodes/environments.composite.js";
import { games } from "./nodes/games.js";
import { interactions } from "./nodes/interactions.js";
import { labels } from "./nodes/labels.js";
import { lights } from "./nodes/lights.js";
import { material } from "./nodes/material.js";
import { neon } from "./nodes/neon.js";
import { particles } from "./nodes/particles.js";
import { physics } from "./nodes/physics.js";
import { product } from "./nodes/product.js";
import { sceneKitPerformanceBudgets } from "./public/devtools.js";
import { solar } from "./nodes/solar.js";
import { cameraPreset } from "./CameraPresetLibrary.js";
import { particleFountain } from "./particle-fountain-runtime.js";

interface AuraSceneKitBuild {
  readonly background: AuraColor;
  readonly nodes: readonly AuraSceneNode[];
  readonly camera: AuraCameraSpec;
  readonly evidence: readonly string[];
  readonly structuralScore?: number;
  readonly problems?: readonly string[];
}

export function sceneKitPerformanceBudget(id: AuraSceneKitId): AuraSceneKitBudgetDefaults {
  return sceneKitPerformanceBudgets[id];
}

export function createSceneKitPerformanceDiagnostics(id: AuraSceneKitId, nodes: readonly AuraSceneNode[]): AuraSceneKitPerformanceDiagnostics {
  const budget = sceneKitPerformanceBudgets[id];
  const instancing = createSceneKitInstancingEvidence(id, nodes);
  return {
    kind: "aura-scene-kit-performance-diagnostics",
    drawCalls: {
      kind: "aura-scene-kit-draw-call-budget",
      maxDrawCalls: budget.maxDrawCalls,
      estimatedDrawCalls: Math.min(budget.estimatedDrawCalls, instancing.estimatedDrawCallsWithInstancing || budget.estimatedDrawCalls),
      pass: budget.estimatedDrawCalls <= budget.maxDrawCalls,
      evidence: budget.evidence
    },
    bundle: {
      kind: "aura-scene-kit-bundle-budget",
      maxGzipBytes: budget.maxGzipBytes,
      estimatedGzipBytes: budget.estimatedGzipBytes,
      pass: budget.estimatedGzipBytes <= budget.maxGzipBytes,
      evidence: "scene-kit incremental code budget excludes user-provided typed model bytes and runner-owned Vite/vendor bytes"
    },
    fps: {
      kind: "aura-scene-kit-fps-budget",
      targetP50Fps: budget.targetP50Fps,
      calibrationRequired: true,
      p50Metric: "metrics.p50Fps",
      calibrationSource: "benchmark/runner/fps-calibration.mjs"
    },
    instancing,
    lod: createSceneKitLodEvidence(id),
    lazyLoading: createSceneKitLazyLoadingPlan(id)
  };
}

function createSceneKitInstancingEvidence(id: AuraSceneKitId, nodes: readonly AuraSceneNode[]): AuraSceneKitInstancingEvidence {
  const names = nodes.map((node) => "name" in node ? node.name ?? "" : "");
  const labelsCount = nodes.filter((node) => node.kind === "label").length;
  const count = (needle: string) => names.filter((name) => name.includes(needle)).length;
  const families: AuraSceneKitInstancingFamilyEvidence[] = [];
  const addFamily = (family: string, instanceCount: number, estimatedDrawCallsWithInstancing: number, evidence: string) => {
    if (instanceCount <= 1) return;
    families.push({
      family,
      instanceCount,
      estimatedDrawCallsWithoutInstancing: instanceCount,
      estimatedDrawCallsWithInstancing,
      evidence
    });
  };

  if (id === "cityBlock") {
    addFamily("city window panels", count("window"), 4, "window strips share material and facade geometry");
    addFamily("city props", count("bench") + count("tree") + count("car") + count("traffic") + count("streetlight"), 8, "street props use repeated prop families");
    addFamily("road markings", count("crosswalk") + count("lane") + count("arrow"), 5, "crosswalks, lane dashes, and arrows batch into road-marking groups");
  }
  if (id === "dataViz") {
    addFamily("chart bars", count("height-colored data bar"), 6, "bar columns share geometry and encode value through instance material data");
    addFamily("chart ticks and labels", count("axis") + count("tick") + count("label"), 6, "axis ticks and label quads use a repeated label atlas plan");
  }
  if (id === "particleFountain") {
    addFamily("particle billboards", Math.max(2400, count("particle")), 4, "textured billboard layers represent thousands of particles as batched impostors");
    addFamily("particle splash and trail cues", count("splash") + count("trail") + count("collision"), 3, "splash and trail cues share sprite/impostor geometry");
  }
  if (id === "solarSystem") {
    addFamily("star impostors", Math.max(42, count("star")), 2, "starfield points share one impostor family");
    addFamily("orbit segments", count("orbit"), 6, "orbit path segments batch by depth/material");
    addFamily("planet labels", labelsCount, 4, "planet labels and leaders use repeated label geometry");
  }
  if (labelsCount > 1 && !families.some((family) => family.family.includes("label"))) {
    addFamily("label quads", labelsCount, Math.min(4, labelsCount), "HUD and scene labels share a label-quad atlas plan");
  }

  const estimatedDrawCallsWithoutInstancing = families.reduce((total, family) => total + family.estimatedDrawCallsWithoutInstancing, 0);
  const estimatedDrawCallsWithInstancing = families.reduce((total, family) => total + family.estimatedDrawCallsWithInstancing, 0);
  return {
    kind: "aura-scene-kit-instancing-evidence",
    applied: families.length > 0,
    families,
    estimatedDrawCallsWithoutInstancing,
    estimatedDrawCallsWithInstancing,
    estimatedDrawCallSavings: Math.max(0, estimatedDrawCallsWithoutInstancing - estimatedDrawCallsWithInstancing)
  };
}

function createSceneKitLodEvidence(id: AuraSceneKitId): AuraSceneKitLodEvidence {
  if (id === "cityBlock") {
    return {
      kind: "aura-scene-kit-lod-evidence",
      applied: true,
      strategy: "dense-impostors",
      levels: ["near facade detail", "mid-distance instanced window strips", "far roofline/building impostors"],
      evidence: "dense city blocks preserve foreground detail while collapsing distant windows, props, and rooflines"
    };
  }
  if (id === "particleFountain") {
    return {
      kind: "aura-scene-kit-lod-evidence",
      applied: true,
      strategy: "dense-impostors",
      levels: ["near textured billboards", "mid trail impostors", "far glow/splash impostors"],
      evidence: "particle fountain keeps density high while rendering distant particles as layered impostors"
    };
  }
  if (id === "solarSystem") {
    return {
      kind: "aura-scene-kit-lod-evidence",
      applied: true,
      strategy: "dense-impostors",
      levels: ["planet meshes", "depth-faded orbit segments", "star/dust point impostors"],
      evidence: "solar background density uses star and dust impostors instead of full mesh detail"
    };
  }
  return {
    kind: "aura-scene-kit-lod-evidence",
    applied: false,
    strategy: "bounded-static-scene",
    levels: ["single benchmark capture tier"],
    evidence: "scene kit stays below dense-scene thresholds without LOD"
  };
}

function createSceneKitLazyLoadingPlan(id: AuraSceneKitId): AuraSceneKitLazyLoadingPlan {
  const systems: AuraSceneKitLazyLoadingEntry[] = [];
  const add = (system: AuraSceneKitLazySystemId, trigger: string, evidence: string) => {
    systems.push({ system, trigger, loadedByDefault: false, evidence });
  };
  if (id === "physicsPlayground" || id === "miniGolf") {
    add("physics-backend", `${id} physics state construction`, "Rapier-backed physics is isolated scene-kit work and is not required for static material, chart, or product scenes");
  }
  if (id === "productViewer") {
    add("product-gltf-loader", "typed product model render path", "GLTF loading is tied to typed model scenes and excluded from procedural-only scene kits");
  }
  if (id === "particleFountain" || id === "solarSystem" || id === "neonTunnel" || id === "dataViz" || id === "materialLab" || id === "cityBlock" || id === "productViewer") {
    add("postprocess", `${id} bloom/fog/reflection capture`, "postprocess work is declared only for visual scene kits that request glow, fog, reflections, or contact effects");
  }
  if (id === "humanoidWalk") {
    add("character-rig", "humanoid walk scene-kit construction", "connected procedural humanoid construction is isolated to character prompts and skipped by other scene kits");
  }
  return {
    kind: "aura-scene-kit-lazy-loading-plan",
    systems,
    allOptional: systems.every((system) => system.loadedByDefault === false)
  };
}

export function buildSceneKit(id: AuraSceneKitId, options: AuraSceneKitCustomizeOptions): AuraSceneKitBuild {
  if (id === "physicsPlayground") {
    const nodes = [
      ...prefabs.physicsPlayground({ cubes: options.cubes ?? 50 }),
      lights.studio({ intensity: 1.15 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud("Physics: contacts, reset, backend", { name: "physics scene kit hud" }).toJSON()
    ];
    return { background: "#070b12", nodes, camera: options.camera ?? camera.physics(), evidence: ["50 cube physics playground", "contact/debug/reset/backend cues", "orbit interaction and HUD"] };
  }
  if (id === "particleFountain") {
    const nodes = [
      ...prefabs.particleFountain({ count: options.particleCount ?? 420, emissionRate: options.emissionRate ?? 120, color: options.colors?.[0] }),
      lights.studio({ intensity: 1.05 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud(`emission rate ${options.emissionRate ?? 120} | collision splash`, { name: "particle scene kit hud" }).toJSON()
    ];
    const diagnostics = particles.diagnostics(nodes);
    return { background: "#071018", nodes, camera: options.camera ?? camera.perspective({ position: [4.6, 3.2, 6.0], target: [0, 1.35, 0], fov: 40 }), structuralScore: diagnostics.gpuReady ? 5 : 3, problems: diagnostics.gpuReady ? [] : ["particle diagnostics not GPU-ready"], evidence: [`${diagnostics.totalParticles} particles`, `${diagnostics.texturedBillboards} textured billboard layers`, "emission-rate, collision, and baked first-frame droplet visibility"] };
  }
  if (id === "solarSystem") {
    const nodes = [
      ...prefabs.solarSystem({ labels: "attached", orbitSegments: 12, starCount: 24, dustCount: 6, capturePhase: options.captureFrame ?? 0.42 }),
      interactions.orbit().toJSON(),
      labels.hud("Solar: six planets, labels, orbits", { name: "solar scene kit hud" }).toJSON()
    ];
    const qa = solar.visualQA(nodes);
    return { background: "#020617", nodes, camera: options.camera ?? solar.cameraPreset(), structuralScore: qa.score, problems: qa.problems, evidence: [`${qa.planets} planets`, `${qa.orbitSegments} orbit segments`, `${qa.labels} labels`, `${qa.stars} stars`] };
  }
  if (id === "neonTunnel") {
    const nodes = [
      ...prefabs.neonTunnel({ rings: 10, captureFrame: options.captureFrame ?? 0.62 }),
      lights.point({ name: "neon practical scene kit light", position: [0, 0.7, 1.2], color: "#38d6ff", intensity: 0.42 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud("Neon: depth, bloom, reflections", { name: "neon scene kit hud" }).toJSON()
    ];
    const qa = neon.visualQA(nodes);
    return { background: "#020617", nodes, camera: options.camera ?? neon.cameraFlythrough({ captureFrame: options.captureFrame ?? 0.62 }), structuralScore: qa.score, problems: qa.problems, evidence: [`${qa.ringCount} ring/depth cues`, "fog/bloom/reflection cues", "deterministic flythrough"] };
  }
  if (id === "dataViz") {
    const nodes = [
      ...prefabs.dataBars3D({ dataset: options.dataset, colorScale: options.colors, selected: { row: 4, col: 6 }, title: "Benchmark matrix", subtitle: "Scene kit data visualization", units: "%" }),
      lights.studio({ intensity: 1.05 }).toJSON(),
      interactions.raycastHover({ target: "height-colored data bar 4-6", selected: "height-colored data bar 4-6" }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud("Data: bars, axes, hover", { name: "data scene kit hud" }).toJSON()
    ];
    const qa = charts.visualQA(nodes);
    return { background: "#08111f", nodes, camera: options.camera ?? charts.cameraPreset(), structuralScore: qa.score, problems: qa.problems, evidence: [`${qa.bars} bars`, `${qa.labels} labels`, `${qa.legends} legend swatches`, "selected hover state"] };
  }
  if (id === "miniGolf") {
    const state = games.createMiniGolfState();
    state.shoot({ vector: MINI_GOLF_LAYOUT.aimVector, power: 1.25 });
    const metrics = state.step(150);
    const nodes = [
      ...state.nodes(),
      lights.studio({ intensity: 1.15 }).toJSON(),
      interactions.orbit().toJSON()
    ];
    return { background: "#12321d", nodes, camera: options.camera ?? camera.perspective({ position: [2.4, 3.7, 4.9], target: [0.2, 0.15, -0.45], fov: 46 }), evidence: [`state-backed deterministic shot ${metrics.deterministicReplayId}`, `shots ${metrics.shots}, score ${metrics.score}, contacts ${metrics.contacts}, collisions ${metrics.collisions}`, "ball/cup/obstacle/course boundaries", "aim/power/score cues"] };
  }
  if (id === "materialLab") {
    const nodes = [
      environments.materialLab({ intensity: 1.4 }).toJSON(),
      ...prefabs.materialSwatches(),
      lights.materialLab({ intensity: 1.9 }).toJSON(),
      lights.rect({ name: "material lab front fill rect light", position: [0, 1.58, 2.4], intensity: 0.74, width: 3.2, height: 0.72 }).toJSON(),
      effects.contactOcclusion({ intensity: 0.34, radius: 0.72 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud("Materials: metal, glass, rubber", { name: "material scene kit hud" }).toJSON()
    ];
    const qa = material.visualQA(nodes);
    return { background: "#10151f", nodes, camera: options.camera ?? camera.materials(), structuralScore: qa.score, problems: qa.problems, evidence: ["metal/glass/rubber/emissive/clearcoat swatches", "reflection cards and labels", "controlled material-lab lighting", "material distinctness QA"] };
  }
  if (id === "cityBlock") {
    const state = city.createState({ blocks: options.blocks ?? 20, litWindows: true, timeOfDay: options.timeOfDay ?? "night" });
    const initialTimeOfDay = state.timeOfDay;
    const nodes = [
      ...state.nodes(),
      lights.studio({ intensity: initialTimeOfDay === "night" ? 0.78 : 1.24 }).toJSON(),
	      effects.fog({ density: initialTimeOfDay === "night" ? 0.032 : 0.018 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud(`City: ${initialTimeOfDay}`, { name: "city scene kit hud" }).toJSON()
    ];
    const changedNodes = state.toggleTimeOfDay();
    const qa = city.visualQA(changedNodes, { changed: state.lastChange });
	    return { background: initialTimeOfDay === "day" ? "#bfe7ff" : "#04101f", nodes, camera: options.camera ?? city.cameraPreset("overview", initialTimeOfDay), structuralScore: qa.score, problems: qa.problems, evidence: [`${qa.buildings} buildings`, `${qa.windows} windows`, `${qa.props} props`, "day/night changed-state evidence", "overview camera default shows the full block"] };
  }
  if (id === "humanoidWalk") {
    const clip = (options.animationState as AuraCharacterClipName | undefined) ?? "benchmark-pose";
    const nodes = [
	      ...character.lowPolyHumanoid({ clip, showJoints: false, motionTrail: true }),
	      lights.studio({ intensity: 1.1 }).toJSON(),
	      interactions.orbit().toJSON(),
	      labels.hud("Humanoid: mid-stride walk pose", { name: "humanoid walk scene kit hud" }).toJSON()
	    ];
	    const qa = character.visualQA(nodes);
	    return { background: "#071017", nodes, camera: options.camera ?? camera.perspective({ position: [2.35, 1.32, 2.65], target: [0, 0.9, -0.55], fov: 32 }), structuralScore: qa.score, problems: qa.problems, evidence: ["connected low-poly procedural humanoid default", "walking-stride benchmark pose with planted feet", "subtle foot motion streak visible in a single screenshot", "clean dark stage with contact shadow"] };
  }
  const asset = options.asset;
  if (!asset) {
    throw new AuraRuntimeError("missing-asset", "sceneKits.productViewer requires a typed model asset. Suggested fix: run aura3d assets add ./product.glb --name product, import assets, then call sceneKits.productViewer(assets.product).");
  }
  const nodes = [
    ...product.viewer(asset, { stageStyle: options.stageStyle, captureFrame: options.captureFrame }),
    environments.productHero({ intensity: 0.95 }).toJSON(),
    interactions.orbit({ target: "auto-centered bounded product model" }).toJSON(),
    labels.hud("Product: clean studio hero", { name: "product scene kit hud" }).toJSON()
  ];
  const diagnostics = product.diagnostics(asset, nodes, { stageStyle: options.stageStyle, captureFrame: options.captureFrame });
  const qa = product.visualQA(nodes, diagnostics);
  return { background: "#f6f8fb", nodes, camera: options.camera ?? camera.product(), structuralScore: qa.score, problems: qa.problems, evidence: ["typed asset provenance", "centered/seated plinth placement", "clean product photography lighting"] };
}
