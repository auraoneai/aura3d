import {
  type Bounds3,
  type CollectedLight,
  createEnvironmentStage,
  createParticleBatchDiagnostics,
  Geometry,
  type InstancedPBRMaterial,
  type Material,
  type PBRMaterial,
  summarizeParticleBatchDiagnostics,
  type RenderItem,
  type RendererPostProcessOptions,
  type UnlitMaterial
} from "@galileo3d/rendering";
import { DirectionalLight, PointLight } from "@galileo3d/scene";
import type { GalleryState, Resources, SceneFrame } from "./sceneBuilderPrimitives";
import { activeSlice, type RouteEvidencePayload } from "./advancedRouteEvidence";
import { bounds, hash01, modelMatrix, type Vec3 } from "./math";
import {
  createDataGalaxyEvidence,
  createDataGalaxyGeometryEvidence,
  createDataGalaxyRuntimeEvidence,
  type DataGalaxyGeometryEvidence,
  type DataGalaxyRuntimeEvidence
} from "./dataGalaxyEvidence";
import { DATA_GALAXY_DEFAULT_PARTICLES, createDataGalaxyBudgetPlan, createDataGalaxyCompositionProfile } from "./dataGalaxyBudgets";

export function buildDataGalaxyScene(r: Resources, time: number, state: GalleryState): SceneFrame {
  const requestedParticles = Number(state.controls.particles ?? DATA_GALAXY_DEFAULT_PARTICLES);
  const formation = String(state.controls.formation ?? "galaxy");
  const speed = num(state.controls.speed, 1);
  const turbulence = num(state.controls.turbulence, 0.7);
  const connections = bool(state.controls.connections, true);
  const budget = createDataGalaxyBudgetPlan({ requestedParticles, connections });
  const composition = createDataGalaxyCompositionProfile(budget);
  const count = budget.effectiveParticles;
  const primaryCount = budget.primaryCount;
  const vortexCount = budget.vortexCount;
  const networkCount = budget.networkCount;
  const waveCount = budget.waveCount;
  const primaryPoints = getPointCloud(r, formation, primaryCount, turbulence);
  const vortexPoints = getPointCloud(r, "vortex", vortexCount, turbulence * 0.85 + 0.12);
  const networkPoints = getPointCloud(r, "network", networkCount, turbulence * 1.2 + 0.08);
  const wavePoints = getPointCloud(r, "wave", waveCount, turbulence * 0.55 + 0.1);
  const diagnostics = createParticleBatchDiagnostics([
    { name: "primary formation", particleCount: primaryCount },
    { name: "vortex layer", particleCount: vortexCount },
    { name: "network agents", particleCount: networkCount },
    { name: "wave telemetry", particleCount: waveCount }
  ], {
    updateMode: "static-geometry",
    backend: {
      supported: false,
      backend: "none",
      reason: "The V9 data-galaxy route renders through g3d-webgl2 and has no native compute-particle solver bound to it."
    },
    targetFrameMs: 34
  });
  const geometryEvidence = createDataGalaxyGeometryEvidence({
    time,
    requestedParticles: count,
    formation,
    speed,
    turbulence,
    connections,
    pointer: state.pointer
  });
  const evidence = createDataGalaxyEvidence({
    time,
    requestedParticles: count,
    formation,
    speed,
    turbulence,
    connections,
    pointer: state.pointer,
    geometryStats: geometryEvidence
  });
  const runtimeEvidence = createDataGalaxyRuntimeEvidence({
    time,
    requestedParticles: count,
    formation,
    speed,
    turbulence,
    connections,
    pointer: state.pointer,
    geometryStats: geometryEvidence
  }, geometryEvidence, evidence);
  const environmentStage = createEnvironmentStage({
    preset: "deep-space",
    size: 4.4,
    includeStageShell: false,
    includeGroundGrid: false,
    timeSeconds: time
  });
  const environmentLighting: SceneFrame["environment"] = {
    color: environmentStage.lighting.color,
    intensity: environmentStage.lighting.intensity,
    proceduralMap: environmentStage.lighting.proceduralMap ?? dataGalaxyFallbackEnvironment().proceduralMap
  };
  const items = [
    ...environmentStage.items,
    { geometry: primaryPoints, material: mat(r, "dataParticle"), modelMatrix: modelMatrix(composition.primary.position, composition.primary.scale, [0.14 * Math.sin(time * 0.3), time * 0.1 * speed, 0]), label: "primary particle cloud" },
    { geometry: vortexPoints, material: mat(r, "dataParticleViolet"), modelMatrix: modelMatrix(composition.vortex.position, composition.vortex.scale, [-0.12, -time * 0.14 * speed, 0.06]), label: "vortex particle layer" },
    { geometry: networkPoints, material: mat(r, "dataParticleWarm"), modelMatrix: modelMatrix(composition.network.position, composition.network.scale, [0.08, time * 0.06 * speed, -0.04]), label: "warm agent cluster layer" },
    { geometry: wavePoints, material: mat(r, "dataParticleGreen"), modelMatrix: modelMatrix(composition.wave.position, composition.wave.scale, [time * 0.06 * speed, 0, 0.12]), label: "green wave particle layer" }
  ];
  appendDataGalaxyGeometryEvidence(r, items, geometryEvidence);
  appendDataGalaxyAttractorSolids(r, items, geometryEvidence.attractors, time, speed);
  if (composition.telemetryBars) appendDataGalaxyTelemetryBars(r, items, time, speed);
  appendEvidencePayload(r, items, evidence);
  return dataGalaxyFrame(items, bounds(composition.boundsMin, composition.boundsMax), dataGalaxyLights(), environmentLighting, runtimeEvidence, {
    bloom: false,
    colorGrade: { contrast: 1.2, saturation: 1.08 },
    fxaa: true
  }, ["reusable deep-space environment stage", ...environmentStage.systems, "route-owned focal data hierarchy", "default showcase CPU/static density", "separated CPU point-cloud layers", "batched inference spark buffers", "formation controls", "bounded attractor evidence", "connection graph", ...evidence.animatedSystems], [
    ...environmentStage.limitations,
    ...summarizeParticleBatchDiagnostics(diagnostics),
    `Data Galaxy budget mode is ${budget.mode}: requested ${Math.round(budget.requestedParticles).toLocaleString("en-US")} particles, rendering ${Math.round(budget.effectiveParticles).toLocaleString("en-US")} CPU/static points with ${budget.nativeGpuComputeDispatches} native GPU compute dispatches`,
    runtimeEvidence.focalHierarchy.centralSubject,
    runtimeEvidence.focalHierarchy.primaryLayerRole,
    runtimeEvidence.focalHierarchy.authoredGlbRole,
    `${Math.round(geometryEvidence.pointCount).toLocaleString("en-US")} overlay sparks and ${Math.round(geometryEvidence.lineSegmentCount).toLocaleString("en-US")} trail/link/ring segments`,
    `${geometryEvidence.drawBatches} dynamic overlay Geometry.points/lineSegments draws replace per-spark render objects`,
    "The authored Data Galaxy GLB layer is real imported generated support scenery with embedded generated data-glyph textures on key materials; it is not accepted premium focal-hero content.",
    ...evidence.approximations
  ], [
    "Env preset deep-space",
    `Mode ${budget.mode}`,
    runtimeEvidence.budget.defaultShowcaseMode ? "Default showcase" : "Explicit count",
    "Particles",
    "Formation",
    "Attractors",
    "Connections",
    `Point draws ${diagnostics.totalDrawCalls}`,
    `Overlay draws ${geometryEvidence.drawBatches}`,
    "GPU compute 0",
    `Requested ${Math.round(budget.requestedParticles).toLocaleString("en-US")}`,
    `Rendered ${Math.round(budget.effectiveParticles).toLocaleString("en-US")}`,
    ...evidence.metrics
  ].slice(0, composition.evidenceLabelBudget));
}

function dataGalaxyFrame(
  items: RenderItem[],
  frameBounds: Bounds3,
  frameLights: readonly CollectedLight[],
  environment: SceneFrame["environment"],
  dataGalaxyEvidence: DataGalaxyRuntimeEvidence,
  postprocess: RendererPostProcessOptions | false,
  animatedSystems: readonly string[],
  approximations: readonly string[],
  labels: readonly string[]
): SceneFrame {
  const instanceCount = items.reduce((sum, current) => sum + (current.instanceTransforms ? current.instanceTransforms.length / 16 : 0), 0);
  return {
    items,
    bounds: frameBounds,
    lights: frameLights,
    environment,
    dataGalaxyEvidence,
    postprocess,
    objectCount: items.length + instanceCount,
    instanceCount,
    animatedSystems,
    approximations,
    labels
  };
}

function getPointCloud(r: Resources, formation: string, count: number, turbulence: number): Geometry {
  const key = `${formation}:${count}:${turbulence.toFixed(2)}`;
  const cached = r.pointClouds.get(key);
  if (cached) return cached;
  const positions: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = hash01(i);
    const v = hash01(i * 11);
    const w = hash01(i * 29);
    let x = 0;
    let y = 0;
    let z = 0;
    if (formation === "sphere") {
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const radius = 1.2 + w * 3.2;
      x = Math.sin(phi) * Math.cos(theta) * radius;
      y = Math.cos(phi) * radius;
      z = Math.sin(phi) * Math.sin(theta) * radius;
    } else if (formation === "wave") {
      x = (u - 0.5) * 8;
      z = (v - 0.5) * 8;
      y = Math.sin(x * 1.6 + z * 0.7) * 0.9 + (w - 0.5) * turbulence;
    } else if (formation === "network") {
      const cluster = Math.floor(u * 8);
      const a = cluster * 0.785;
      x = Math.cos(a) * 3 + (v - 0.5) * turbulence;
      z = Math.sin(a) * 3 + (w - 0.5) * turbulence;
      y = (hash01(cluster * 17) - 0.5) * 3 + (u - 0.5) * turbulence;
    } else if (formation === "vortex") {
      const a = u * Math.PI * 12;
      const radius = 0.2 + v * 4;
      x = Math.cos(a) * radius;
      z = Math.sin(a) * radius;
      y = (u - 0.5) * 5 + Math.sin(a) * turbulence;
    } else {
      const a = u * Math.PI * 10;
      const radius = Math.sqrt(v) * 4.8;
      x = Math.cos(a) * radius;
      z = Math.sin(a) * radius * 0.55;
      y = (w - 0.5) * 1.8 + Math.sin(radius * 2) * 0.24 * turbulence;
    }
    positions.push([x, y, z]);
  }
  const geometry = Geometry.points(positions);
  r.pointClouds.set(key, geometry);
  return geometry;
}

function appendEvidencePayload(r: Resources, items: RenderItem[], evidence: RouteEvidencePayload): void {
  for (const batch of evidence.batches) {
    if (batch.count <= 0) continue;
    items.push(dataGalaxyInstancedItem(r, batch.geometry, batch.material, activeSlice(batch), batch.label));
  }
  for (const single of evidence.singles) {
    items.push(dataGalaxyItem(r, single.geometry, single.material, single.position, single.scale, single.rotation, single.label));
  }
}

function dataGalaxyItem(r: Resources, geometry: keyof Resources["geometry"], material: string, position: Vec3, scale: Vec3, rotation: Vec3, label: string): RenderItem {
  return { geometry: r.geometry[geometry], material: mat(r, material), modelMatrix: modelMatrix(position, scale, rotation), label };
}

function dataGalaxyInstancedItem(r: Resources, geometry: keyof Resources["geometry"], material: string, transforms: Float32Array, label: string): RenderItem {
  return { geometry: r.geometry[geometry], material: mat(r, material), instanceTransforms: transforms, label };
}

function mat(r: Resources, key: string): Material | PBRMaterial | UnlitMaterial | InstancedPBRMaterial {
  return r.material[key] ?? r.material.matte!;
}

function dataGalaxyLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("data-key");
  const fill = new DirectionalLight("data-fill");
  const point = new PointLight("data-point");
  key.color = [1, 0.88, 0.68];
  key.intensity = 3.1;
  fill.color = [0.55, 0.7, 1];
  fill.intensity = 0.9;
  point.color = [1, 0.55, 0.2];
  point.intensity = 18;
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [5, 7, 5], direction: [-0.45, -0.72, -0.42], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-5, 4, -4], direction: [0.5, -0.34, 0.5], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill },
    { kind: "point", color: point.color, intensity: point.intensity, position: [0, 2.4, 0], direction: [0, -1, 0], range: 8, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: point }
  ];
}

function dataGalaxyFallbackEnvironment(): SceneFrame["environment"] {
  return {
    color: [0.25, 0.36, 0.62],
    intensity: 0.48,
    proceduralMap: {
      skyColor: [0.03, 0.06, 0.14],
      horizonColor: [0.1, 0.18, 0.35],
      groundColor: [0.035, 0.04, 0.05],
      specularColor: [0.92, 0.95, 1],
      intensity: 0.55,
      specularIntensity: 0.82
    }
  };
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function appendDataGalaxyGeometryEvidence(r: Resources, items: RenderItem[], evidence: DataGalaxyGeometryEvidence): void {
  for (const group of evidence.pointGroups) {
    if (group.positions.length === 0) continue;
    items.push({ geometry: Geometry.points(group.positions), material: mat(r, group.material), label: group.label });
  }
  for (const group of evidence.lineGroups) {
    if (group.positions.length < 2) continue;
    items.push({ geometry: Geometry.lineSegments(group.positions), material: mat(r, group.material), label: group.label });
  }
}

function appendDataGalaxyAttractorSolids(r: Resources, items: RenderItem[], attractors: readonly Vec3[], time: number, speed: number): void {
  for (let i = 0; i < attractors.length; i += 1) {
    const attractor = attractors[i]!;
    const scale = 0.042 + (i % 3) * 0.012;
    items.push(dataGalaxyItem(
      r,
      "sphere",
      i % 3 === 0 ? "amberGlow" : i % 2 === 0 ? "violetGlow" : "cyanGlow",
      attractor,
      [scale, scale, scale],
      [0, time * (0.22 + i * 0.01) * speed, 0],
      "animated attractor solid"
    ));
  }
}

function appendDataGalaxyTelemetryBars(r: Resources, items: RenderItem[], time: number, speed: number): void {
  for (let i = 0; i < 10; i += 1) {
    const lane = i % 2;
    const x = -0.72 + i * 0.14;
    const height = 0.018 + (i % 3) * 0.005 + Math.sin(time * 0.72 * speed + i * 0.37) * 0.003;
    items.push(dataGalaxyItem(
      r,
      "cube",
      lane === 0 ? "transparentCyan" : "transparentAmber",
      [x, -0.76 + lane * 0.035, 0.96 + lane * 0.06],
      [0.06, height, 0.018],
      [0, 0.08, 0],
      "particle batch telemetry bar"
    ));
  }
}
