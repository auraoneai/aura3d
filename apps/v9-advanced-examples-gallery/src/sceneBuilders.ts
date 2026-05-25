import {
  Geometry,
  IndexBuffer,
  InstancedPBRMaterial,
  Material,
  PBRMaterial,
  UnlitMaterial,
  VertexBuffer,
  VertexFormat,
  type RenderItem
} from "@galileo3d/rendering";
import type { DemoDefinition, DemoId } from "./metadata";
import { bounds, clamp, colorFromHex, hash01, lerp, modelMatrix, palette, writeModelMatrix, type Rgba, type Vec3 } from "./math";
import { getPhysicsPlaygroundFrame } from "./physicsSimulation";
import { GalleryWaterMaterial } from "./showcaseShaders";
import { activeSlice, type RouteEvidencePayload } from "./advancedRouteEvidence";
import { buildDataGalaxyScene } from "./dataGalaxyScene";
import { createFogCathedralEvidence } from "./fogCathedralEvidence";
import {
  countFogCathedralProxyGeometryInstances,
  createFogCathedralRendererEnvironmentFog,
  createRoboticsLabRendererEnvironmentFog,
  type RendererEnvironmentFogEvidence
} from "./rendererEnvironmentFogEvidence";
import { createRoboticsLabEvidence } from "./roboticsLabEvidence";
import { createSmartCityRouteEvidence, type SmartCityRouteEvidence } from "./smartCityEvidence";
import {
  createOceanVisualLayers,
  createOceanRouteProfile,
  createWaterLabVisualLayers,
  evaluateOceanProfileHeight,
  evaluateWaterLabHeight,
  sampleWaterLabTelemetry,
  type GalleryWaterTelemetry,
  type GalleryWaterVisualLayerSet,
  type OceanRouteProfile
} from "./waterSystems";
import { buildProductConfiguratorScene } from "./productConfiguratorScene";
import { buildReactorPostScene } from "./reactorPostScene";
import {
  bool,
  env,
  frame,
  instancedItem,
  item,
  lights,
  mat,
  num,
  pushLineGroup,
  pushSegment,
  type ControlValues,
  type GalleryState,
  type Resources,
  type Ripple,
  type SceneFrame
} from "./sceneBuilderPrimitives";

export {
  bool,
  env,
  frame,
  instancedItem,
  item,
  lights,
  mat,
  num,
  pushLineGroup,
  pushSegment,
  type ControlValues,
  type GalleryState,
  type Resources,
  type Ripple,
  type SceneFrame
} from "./sceneBuilderPrimitives";

interface CueInstanceBatch {
  readonly geometry: "cube" | "lineX";
  readonly material: string;
  readonly label: string;
  readonly transforms: Float32Array;
  count: number;
}

interface FlatSliver {
  readonly center: Vec3;
  readonly length: number;
  readonly thickness: number;
  readonly yaw: number;
}

export function createResources(): Resources {
  const material: Record<string, Material | PBRMaterial | UnlitMaterial | InstancedPBRMaterial> = {
    water: new GalleryWaterMaterial({
      name: "cinematic procedural marina water",
      deepColor: [0.012, 0.075, 0.11, 0.78],
      shallowColor: [0.035, 0.18, 0.23, 0.74],
      highlightColor: [0.68, 0.82, 0.84, 1],
      opacity: 0.74
    }),
    ocean: new GalleryWaterMaterial({
      name: "cinematic procedural ocean surface",
      deepColor: [0.004, 0.035, 0.065, 0.86],
      shallowColor: [0.015, 0.12, 0.18, 0.78],
      highlightColor: [0.72, 0.82, 0.84, 1],
      opacity: 0.8
    }),
    sand: pbr("sand", "#9a8260", 0.02, 0.74),
    rock: pbr("rock", "#5e6870", 0.01, 0.82),
    wood: pbr("wood", "#8a5a34", 0.03, 0.56),
    steel: pbr("steel", "#98a4ad", 0.72, 0.26),
    darkSteel: pbr("darkSteel", "#2a323a", 0.65, 0.32),
    glass: pbr("glass", "#9ed9ff", 0.05, 0.05, 0.42, [0.15, 0.55, 0.8], 0.18, 0.55),
    rubber: pbr("rubber", "#111317", 0.0, 0.86),
    matte: pbr("matte", "#485266", 0.02, 0.68),
    white: pbr("white", "#d7dce0", 0.02, 0.5),
    graphite: pbr("graphite", "#20252b", 0.72, 0.22),
    titanium: pbr("titanium", "#aeb5ba", 0.62, 0.24),
    ceramic: pbr("ceramic", "#e4e2dc", 0.08, 0.34),
    crimson: pbr("crimson", "#971c28", 0.28, 0.32),
    cyanGlow: pbr("cyanGlow", "#32e6ff", 0.05, 0.2, 0.12, [0.05, 0.95, 1], 2.8),
    amberGlow: pbr("amberGlow", "#ffad3b", 0.05, 0.22, 0.12, [1, 0.42, 0.06], 2.8),
    violetGlow: pbr("violetGlow", "#a565ff", 0.05, 0.25, 0.12, [0.55, 0.2, 1], 2.6),
    greenGlow: pbr("greenGlow", "#56ff94", 0.04, 0.25, 0.1, [0.1, 1, 0.36], 2.4),
	    redGlow: pbr("redGlow", "#ff4b57", 0.04, 0.28, 0.1, [1, 0.08, 0.1], 2.1),
    reactorCoreGlow: pbr("reactorCoreGlow", "#4cecff", 0.02, 0.28, 0.48, [0.06, 0.58, 0.68], 1.12),
    reactorPanelGlass: unlit("reactorPanelGlass", [0.14, 0.56, 0.68, 0.14], true),
    reactorDimPanel: pbr("reactorDimPanel", "#263f49", 0.18, 0.52, 0.72, [0.01, 0.16, 0.22], 0.32),
    reactorAmberGlass: unlit("reactorAmberGlass", [0.9, 0.42, 0.1, 0.14], true),
    reactorTrace: unlit("reactorTrace", [0.34, 0.82, 0.92, 0.34], true),
    reactorEtchLine: unlit("reactorEtchLine", [0.008, 0.014, 0.018, 1]),
    reactorEvidenceLine: unlit("reactorEvidenceLine", [0.28, 0.82, 0.9, 0.66], true),
	    skyUpper: unlit("skyUpper", [0.06, 0.11, 0.2, 1]),
	    skyHorizon: unlit("skyHorizon", [0.94, 0.36, 0.18, 1]),
	    sunDisc: unlit("sunDisc", [1, 0.63, 0.2, 1]),
	    mountain: pbr("mountain", "#33445a", 0.02, 0.76),
	    shoreline: pbr("shoreline", "#b58a58", 0.02, 0.7),
	    pine: pbr("pine", "#1f6b58", 0.02, 0.78),
	    waterInstanced: instanced("waterInstanced", "#1c7fa7", 0.03, 0.16, [0.05, 0.35, 0.55], 0.28),
    oceanInstanced: instanced("oceanInstanced", "#10547a", 0.02, 0.12, [0.04, 0.28, 0.52], 0.34),
    transparentCyan: unlit("transparentCyan", [0.2, 0.82, 1, 0.28], true),
    transparentAmber: unlit("transparentAmber", [1, 0.56, 0.14, 0.28], true),
    transparentGreen: unlit("transparentGreen", [0.2, 1, 0.52, 0.22], true),
    debug: unlit("debug", [0.9, 0.98, 1, 0.68], true),
    studioWhiteLine: unlit("studioWhiteLine", [0.95, 0.98, 1, 0.92], true),
    showroomFloor: unlit("showroomFloor", [0.088, 0.102, 0.12, 1]),
    showroomCove: unlit("showroomCove", [0.026, 0.032, 0.043, 1]),
    showroomPanel: unlit("showroomPanel", [0.072, 0.092, 0.116, 1]),
    showroomGuide: unlit("showroomGuide", [0.28, 0.52, 0.62, 0.18], true),
    showroomGuideStrong: unlit("showroomGuideStrong", [0.5, 0.8, 0.88, 0.34], true),
    showroomEdge: unlit("showroomEdge", [0.72, 0.86, 0.9, 0.46], true),
    cityA: instanced("cityA", "#316cbb", 0.18, 0.48, [0.04, 0.2, 0.45], 0.32),
    cityB: instanced("cityB", "#7550d8", 0.16, 0.46, [0.2, 0.08, 0.48], 0.34),
    cityC: instanced("cityC", "#1d9c83", 0.14, 0.5, [0.0, 0.38, 0.32], 0.28),
	    traffic: instanced("traffic", "#f3c04a", 0.12, 0.34, [1, 0.42, 0.04], 1.4),
	    particle: unlit("particle", [0.38, 0.9, 1, 0.84], true, 2.2, true),
	    particleWarm: unlit("particleWarm", [1, 0.74, 0.28, 0.78], true, 1.95, true),
	    particleViolet: unlit("particleViolet", [0.66, 0.44, 1, 0.78], true, 1.9, true),
	    particleGreen: unlit("particleGreen", [0.26, 0.96, 0.64, 0.7], true, 1.75, true),
    dataParticle: unlit("dataParticle", [0.48, 0.96, 1, 0.34], true, 1.35, true),
    dataParticleWarm: unlit("dataParticleWarm", [1, 0.66, 0.24, 0.36], true, 1.38, true),
    dataParticleViolet: unlit("dataParticleViolet", [0.66, 0.46, 1, 0.32], true, 1.3, true),
    dataParticleGreen: unlit("dataParticleGreen", [0.3, 1, 0.7, 0.28], true, 1.22, true),
    beam: unlit("beam", [1, 0.78, 0.48, 0.14], true),
    fogVeil: unlit("fogVeil", [0.62, 0.72, 0.72, 0.065], true),
    fogShadow: unlit("fogShadow", [0.07, 0.1, 0.11, 0.16], true),
    dustMote: unlit("dustMote", [0.86, 0.78, 0.62, 0.38], true),
    wire: unlit("wire", [0.72, 0.95, 1, 0.72], true)
  };
  return {
    geometry: {
      cube: Geometry.litCube(1),
      sphere: Geometry.uvSphere(0.5, 32, 16),
      cylinder: Geometry.cylinder({ radius: 0.5, height: 1, segments: 32 }),
      capsule: Geometry.capsule({ radius: 0.28, height: 1, segments: 24, rings: 8 }),
      lineX: Geometry.lineSegments([[-0.5, 0, 0], [0.5, 0, 0]])
    },
    material,
    pointClouds: new Map(),
    dataGalaxyOverlayGeometries: new Map(),
    environmentStages: new Map()
  };
}

export function buildScene(demo: DemoDefinition, resources: Resources, time: number, state: GalleryState): SceneFrame {
  switch (demo.id) {
    case "water-lab": return buildWaterLab(resources, time, state);
    case "ocean-observatory": return buildOcean(resources, time, state);
    case "reactor-post": return buildReactorPostScene(resources, time, state);
    case "smart-city": return buildSmartCity(resources, time, state);
    case "data-galaxy": return buildDataGalaxyScene(resources, time, state);
    case "product-configurator": return buildProductConfiguratorScene(resources, time, state);
    case "robotics-lab": return buildRoboticsLab(resources, time, state);
    case "physics-playground": return buildPhysics(resources, time, state);
    case "fog-cathedral": return buildFogCathedral(resources, time, state);
    case "digital-twin": return buildDigitalTwin(resources, time, state);
    default: return buildWaterLab(resources, time, state);
  }
}

function buildWaterLab(r: Resources, time: number, state: GalleryState): SceneFrame {
  const items: RenderItem[] = [];
  const intensity = num(state.controls.intensity, 1);
  const roughness = clamp(num(state.controls.roughness, 0.22), 0.03, 0.9);
  const debug = bool(state.controls.debug);
  const waterTelemetry = sampleWaterLabTelemetry({
    timeSeconds: time,
    ripples: state.ripples,
    intensity,
    roughness
  });
  const waterVisualLayers = createWaterLabVisualLayers({
    timeSeconds: time,
    ripples: state.ripples,
    intensity,
    roughness
  });
  const waterMaterial = mat(r, "water") as GalleryWaterMaterial;
  waterMaterial.setFrame(time, intensity, state.ripples.length > 0 ? 1 : 0, roughness);
  items.push({
    geometry: createAnimatedWaterMesh(68, 17.6, 13.0, time, state.ripples, intensity),
    material: waterMaterial,
    modelMatrix: modelMatrix([0, -0.11, 0], [1, 1, 1], [0, 0, 0]),
    label: "continuous animated water mesh"
  });
  if (debug) {
    for (let z = 0; z < 12; z += 1) {
      for (let x = 0; x < 16; x += 1) {
        const px = (x / 15 - 0.5) * 15.4;
        const pz = (z / 11 - 0.5) * 10.8;
        const wave = waveHeight(px, pz, time, state.ripples, intensity);
        items.push(item(r, "lineX", "wire", [px, 0.04 + wave, pz], [0.42, 1, 1], [0, time + x * 0.1, 0], "wave normal debug"));
      }
    }
  }
  addMarinaEnvironment(r, items, time, state, waterTelemetry, waterVisualLayers);
  return frame(items, bounds([-7.25, -0.98, -5.72], [6.9, 2.18, 5.35]), lights("sunset"), env("sunset"), {
    bloom: { threshold: 0.48, intensity: 0.28, radius: 4 },
    colorGrade: { contrast: 1.1, saturation: 1.08 },
    fxaa: true
  }, ["layered procedural water", "floating props", "dock lights", "ripple interaction rings", "shoreline foam bands", "debug wave overlay"], [
    "CPU/procedural ripple field rendered as dense G3D geometry; no native GPGPU water solver.",
    "Fresnel, glints, shoreline foam, and wake lines are runtime geometry/material approximations; no planar reflection/refraction or caustic pass."
  ], ["Water", "Layered waves", "Foam", "Wake rings", "Buoys", "Dock"], 0, waterTelemetry);
}

function buildOcean(r: Resources, time: number, state: GalleryState): SceneFrame {
  const items: RenderItem[] = [];
  const wind = num(state.controls.wind, 1.2);
  const scale = num(state.controls.scale, 1.1);
  const mode = String(state.controls.mode ?? "cinematic");
  const isStorm = mode === "storm";
  const pathsEnabled = bool(state.controls.paths, true);
  const oceanProfile = createOceanRouteProfile({ timeSeconds: time, mode, wind, scale });
  const oceanVisualLayers = createOceanVisualLayers({
    profile: oceanProfile,
    timeSeconds: time,
    includePaths: pathsEnabled,
    surfaceWorldYOffset: -0.32,
    surfaceWorldZOffset: -13.2
  });
  const oceanMaterial = mat(r, "ocean") as GalleryWaterMaterial;
  oceanMaterial.setFrame(time, oceanProfile.shaderWaveStrength, isStorm ? 0.85 : oceanProfile.telemetry.maxFoam, oceanProfile.surfaceRoughness);
  items.push({
    geometry: createOceanSurfaceMesh(112, 36, 46, oceanProfile),
    material: oceanMaterial,
    modelMatrix: modelMatrix([0, -0.32, -13.2], [1, 1, 1], [0, 0, 0]),
    label: "continuous multi-frequency ocean mesh"
  });
  addOceanReflections(r, items, time, oceanProfile, oceanVisualLayers);
  addDeck(r, items, time);
  addOceanFloatingObjects(r, items, oceanVisualLayers, time);
  addOceanDetailOverlays(r, items, time, oceanProfile);
  return frame(items, bounds([-8.8, -1.35, -16.2], [8.8, 4.15, 3.7]), lights(isStorm ? "storm" : "dusk"), env(isStorm ? "storm" : String(state.controls.lighting ?? "dusk")), {
    bloom: { threshold: 0.35, intensity: isStorm ? 0.55 : 0.38, radius: 5 },
    colorGrade: { contrast: isStorm ? 1.22 : 1.08, saturation: isStorm ? 0.86 : 1.1 },
    filmGrain: { intensity: isStorm ? 0.08 : 0.025 },
    fxaa: true
  }, ["layered finite-wave ocean", "drone paths", "marker buoys", "observatory deck", "horizon reflection", "foam and spray bands", "wind modes"], [
    "WebGPU/FFT ocean path is not used; verified route is WebGL2 procedural wave geometry with CPU-authored visual layers.",
    "Reflection, refraction, caustics, and underwater volume remain material/geometry approximations surfaced in water telemetry."
  ], ["Ocean", "Whitecaps", "Spray", "Drones", "Deck", "No FFT"], 0, oceanProfile.telemetry);
}

function buildSmartCity(r: Resources, time: number, state: GalleryState): SceneFrame {
  const level = String(state.controls.count ?? "medium");
  const selectedDistrict = String(state.controls.district ?? "all");
  const city = createSmartCityRouteEvidence({
    time,
    level,
    selectedDistrict,
    traffic: bool(state.controls.traffic, true),
    flythrough: bool(state.controls.fly),
    pointer: state.pointer
  });
  const items: RenderItem[] = [];
  appendSmartCityEvidence(r, items, city);
  if (bool(state.controls.wire)) addBoundsGrid(r, items, city.extent * 2, city.extent * 2);
  return frame(items, bounds([-city.extent * 0.96, -0.92, -city.extent * 0.96], [city.extent * 0.96, 4.35, city.extent * 0.96]), lights("city"), env("night"), {
    bloom: { threshold: 0.42, intensity: 0.38, radius: 5 },
    colorGrade: { contrast: 1.12, saturation: 1.16 },
    fxaa: true
  }, city.systems, city.approximations, ["Buildings", "Traffic", "Districts", "Flythrough", "Instancing", ...city.labels]);
}

function buildRoboticsLab(r: Resources, time: number, state: GalleryState): SceneFrame {
  const items: RenderItem[] = [];
  const play = bool(state.controls.playing, true);
  const t = play ? time : num(state.controls.timeline) * 12;
  const animationState = String(state.controls.state ?? "training");
  const follow = bool(state.controls.follow, false);
  const activeStage = roboticsStateStageIndex(animationState);
  addLabShell(r, items, t);
  addRoboticsFloorDetail(r, items, t);
  addRoboticsWorkstationDetail(r, items, t);
  addRoboticsCalibrationMicroDetail(r, items, t);
  const stagePads: readonly [number, number, string, string, number][] = [
    [-0.58, 0.04, "cyanGlow", "soldier animation stage", 1.94],
    [0.9, 0.16, "violetGlow", "expressive robot stage", 1.42],
    [1.58, 0.96, "amberGlow", "operator animation stage", 1.04]
  ];
  for (let stageIndex = 0; stageIndex < stagePads.length; stageIndex += 1) {
    const [x, z, material, label, actorHeight] = stagePads[stageIndex];
    const scan = Math.sin(t * 1.8 + stageIndex * 1.4);
    const activeScale = stageIndex === activeStage ? 1.06 : 0.94;
    const guideMaterial = stageIndex === 2 ? "transparentAmber" : "transparentCyan";
    items.push(item(r, "cube", "darkSteel", [x, -0.61, z], [1.12, 0.05, 1.0], [0, 0, 0], "character stage pad"));
    items.push(item(r, "cube", material, [x, -0.566, z], [0.9 * activeScale, 0.016, 0.78 * activeScale], [0, 0, 0], label));
    items.push(item(r, "lineX", guideMaterial, [x, -0.518, z - 0.48], [0.92, 1, 1], [0, 0, 0], "animation state gate"));
    items.push(item(r, "lineX", guideMaterial, [x, -0.518, z + 0.48], [0.92, 1, 1], [0, 0, 0], "animation state gate"));
    items.push(item(r, "lineX", guideMaterial, [x - 0.5, -0.518, z], [0.78, 1, 1], [0, Math.PI / 2, 0], "animation state gate"));
    items.push(item(r, "lineX", guideMaterial, [x + 0.5, -0.518, z], [0.78, 1, 1], [0, Math.PI / 2, 0], "animation state gate"));
    items.push(item(r, "sphere", material, [x + scan * 0.26, -0.42 + actorHeight * 0.82 + Math.cos(t * 2.1 + stageIndex) * 0.045, z - 0.32], [0.052, 0.052, 0.052], [0, 0, 0], "character tracking beacon"));
    items.push(item(r, "cube", material, [x + scan * 0.34, -0.53, z + 0.46], [0.18, 0.028, 0.038], [0, 0, 0], "animated training scanline"));
    items.push(item(r, "cube", stageIndex === activeStage ? "greenGlow" : "transparentCyan", [x, -0.49, z - 0.63], [0.34, 0.024, 0.052], [0, 0, 0], "animation state token"));
    addActorClipBadge(r, items, x, z, actorHeight, t, stageIndex, stageIndex === activeStage);
    addActorGroundingReticle(r, items, x, z, t, stageIndex === activeStage);
  }
  addRoboticsTimelineConsole(r, items, t, animationState, play, follow);
  const centralSweep = Math.sin(t * 2.2);
  items.push(item(r, "cube", "cyanGlow", [centralSweep * 0.82, 1.72, -0.22], [0.42, 0.026, 1.05], [0, 0.18, 0.12], "animated training scanline"));
  items.push(item(r, "cube", "violetGlow", [-centralSweep * 0.64, 1.14, 0.82], [0.96, 0.022, 0.04], [0.08, 0, -0.16], "animated training scanline"));
  const calibrationArms: readonly [Vec3, string, string][] = [
    [[-2.16, -0.39, -0.72], "cyanGlow", "left calibration robot"],
    [[2.18, -0.39, -0.76], "amberGlow", "right calibration robot"],
    [[-2.08, -0.39, 0.92], "greenGlow", "side handoff calibration robot"]
  ];
  for (let i = 0; i < calibrationArms.length; i += 1) {
    const [origin, glow, label] = calibrationArms[i]!;
    addRobot(r, items, origin, t + i * 0.8, glow, label, 0.68);
    items.push(item(r, "cube", "transparentAmber", [origin[0], -0.505, origin[2]], [1.08, 0.018, 1.08], [0, 0, 0], "safety zone"));
  }
  for (let i = 0; i < 10; i += 1) {
    items.push(item(r, "cube", i % 2 ? "cyanGlow" : "greenGlow", [-2.5 + i * 0.55, 0.3 + (i % 2) * 0.1, -1.36], [0.2, 0.055, 0.032], [0, 0, 0], "lab monitor"));
  }
  if (bool(state.controls.skeleton, true)) addSkeletonLines(r, items, t);
  if (follow) addFollowCameraRig(r, items, t, activeStage);
  const evidence = createRoboticsLabEvidence({
    time,
    playing: play,
    timeline: num(state.controls.timeline),
    skeleton: bool(state.controls.skeleton, true),
    follow,
    selectedRobot: roboticsSelectedActorLabel(state.selected, animationState),
    animationState
  });
  appendEvidencePayload(r, items, evidence);
  const rendererFog = createRoboticsLabRendererEnvironmentFog();
  return withEnvironmentFog(frame(items, bounds([-2.55, -1.0, -1.38], [2.72, 2.25, 1.72]), lights("lab"), env("lab"), {
    bloom: { threshold: 0.38, intensity: 0.28, radius: 4 },
    colorGrade: { contrast: 1.08, saturation: 1.05 },
    fxaa: true
  }, ["renderer-level environment fog", "authored animated characters", "clip switching controls", "task zones", "timeline", "camera follow target", "selection/motion evidence", "lab workstations", ...evidence.animatedSystems], [rendererFog.claimBoundary, "Authored animated GLB characters are layered into this route asynchronously; procedural robots remain as lab context and fallback until screenshots are accepted.", ...evidence.approximations], ["Robots", "Timeline", "Lab", "Safety", "Clip switch", "Follow", "Debug", "Renderer fog", ...evidence.metrics]), rendererFog);
}

function buildPhysics(r: Resources, time: number, state: GalleryState): SceneFrame {
  const items: RenderItem[] = [];
  const gravity = num(state.controls.gravity, 1);
  const conveyor = num(state.controls.conveyor, 1.2);
  const physics = getPhysicsPlaygroundFrame({
    time,
    gravityScale: gravity,
    conveyorSpeed: conveyor,
    pusherEnabled: bool(state.controls.pusher, true),
    spawnToken: num(state.controls.spawnToken, 0)
  });
  const pushInstanced = (geometry: keyof Resources["geometry"], material: string, transforms: Float32Array, count: number, label: string): void => {
    if (count > 0) items.push(instancedItem(r, geometry, material, transforms.subarray(0, count * 16), label));
  };
  items.push(item(r, "cube", "darkSteel", [0, -0.72, 0], [7.5, 0.08, 4.4], [0, 0, 0], "testbed floor"));
  items.push(item(r, "cube", "steel", [-2.8, -0.25, -0.6], [2.8, 0.1, 0.9], [0.35, 0, 0], "ramp"));
  items.push(item(r, "cube", "transparentAmber", [-2.8, -0.44, -0.6], [1.42, 0.14, 0.54], [0, 0, 0], "runtime primitive ramp proxy"));
  for (const z of [-1.35, 0, 1.35]) {
    items.push(item(r, "cube", "matte", [1.2, -0.42, z], [3.55, 0.09, 0.25], [0, 0, 0], "conveyor belt"));
    items.push(item(r, "lineX", "wire", [1.2, -0.3, z - 0.22], [3.45, 1, 1], [0, 0, 0], "conveyor lane rail"));
    items.push(item(r, "lineX", "wire", [1.2, -0.3, z + 0.22], [3.45, 1, 1], [0, 0, 0], "conveyor lane rail"));
  }
  const conveyorAmber = new Float32Array(12 * 16);
  const conveyorCyan = new Float32Array(12 * 16);
  let conveyorAmberCount = 0;
  let conveyorCyanCount = 0;
  for (let i = 0; i < 24; i += 1) {
    const lane = i % 3;
    const laneZ = -1.35 + lane * 1.35;
    const p = (((time * conveyor * 0.24 + i * 0.071) % 1) - 0.5) * 3.45;
    if (i % 2) {
      writeModelMatrix(conveyorAmber, conveyorAmberCount * 16, [p + 1.2, -0.31, laneZ], [0.2, 0.035, 0.08], [0, 0, 0]);
      conveyorAmberCount += 1;
    } else {
      writeModelMatrix(conveyorCyan, conveyorCyanCount * 16, [p + 1.2, -0.31, laneZ], [0.2, 0.035, 0.08], [0, 0, 0]);
      conveyorCyanCount += 1;
    }
  }
  pushInstanced("cube", "amberGlow", conveyorAmber, conveyorAmberCount, "conveyor tick");
  pushInstanced("cube", "cyanGlow", conveyorCyan, conveyorCyanCount, "conveyor tick");
  for (let bin = 0; bin < 3; bin += 1) {
    const z = -1.42 + bin * 1.38;
    items.push(item(r, "cube", "darkSteel", [3.25, -0.34, z], [0.08, 0.82, 0.58], [0, 0, 0], "target bin sidewall"));
    items.push(item(r, "cube", "darkSteel", [4.05, -0.34, z], [0.08, 0.82, 0.58], [0, 0, 0], "target bin sidewall"));
    items.push(item(r, "cube", "darkSteel", [3.65, -0.34, z + 0.58], [0.86, 0.82, 0.08], [0, 0, 0], "target bin backwall"));
    items.push(item(r, "cube", "transparentGreen", [3.65, -0.71, z], [0.86, 0.02, 0.58], [0, 0, 0], "target scoring zone"));
    const loadHeight = clamp(physics.binLoads[bin] * 0.055, 0.05, 0.62);
    items.push(item(r, "cube", bin === 1 ? "cyanGlow" : "greenGlow", [4.33, -0.71 + loadHeight * 0.5, z], [0.08, loadHeight, 0.28], [0, 0, 0], "live bin load meter"));
    for (let stripe = 0; stripe < 5; stripe += 1) {
      items.push(item(r, "lineX", stripe % 2 ? "transparentAmber" : "wire", [3.65, -0.03 + stripe * 0.16, z - 0.31], [0.72, 1, 1], [0, 0, 0], "bin measurement rail"));
      items.push(item(r, "lineX", stripe % 2 ? "wire" : "transparentCyan", [3.65, -0.03 + stripe * 0.16, z + 0.31], [0.72, 1, 1], [0, 0, 0], "bin measurement rail"));
    }
  }
  const woodCubes = new Float32Array(physics.bodies.length * 16);
  const rubberCubes = new Float32Array(physics.bodies.length * 16);
  const woodSpheres = new Float32Array(physics.bodies.length * 16);
  const rubberSpheres = new Float32Array(physics.bodies.length * 16);
  const woodCapsules = new Float32Array(physics.bodies.length * 16);
  const rubberCapsules = new Float32Array(physics.bodies.length * 16);
  let woodCubeCount = 0, rubberCubeCount = 0, woodSphereCount = 0, rubberSphereCount = 0, woodCapsuleCount = 0, rubberCapsuleCount = 0;
  for (const body of physics.bodies) {
    if (body.kind === "sphere" && body.material === "wood") {
      writeModelMatrix(woodSpheres, woodSphereCount * 16, body.position, body.scale, body.rotation);
      woodSphereCount += 1;
    } else if (body.kind === "sphere") {
      writeModelMatrix(rubberSpheres, rubberSphereCount * 16, body.position, body.scale, body.rotation);
      rubberSphereCount += 1;
    } else if (body.kind === "capsule" && body.material === "wood") {
      writeModelMatrix(woodCapsules, woodCapsuleCount * 16, body.position, body.scale, body.rotation);
      woodCapsuleCount += 1;
    } else if (body.kind === "capsule") {
      writeModelMatrix(rubberCapsules, rubberCapsuleCount * 16, body.position, body.scale, body.rotation);
      rubberCapsuleCount += 1;
    } else if (body.material === "wood") {
      writeModelMatrix(woodCubes, woodCubeCount * 16, body.position, body.scale, body.rotation);
      woodCubeCount += 1;
    } else {
      writeModelMatrix(rubberCubes, rubberCubeCount * 16, body.position, body.scale, body.rotation);
      rubberCubeCount += 1;
    }
  }
  pushInstanced("cube", "wood", woodCubes, woodCubeCount, "physics object");
  pushInstanced("cube", "rubber", rubberCubes, rubberCubeCount, "physics object");
  pushInstanced("sphere", "wood", woodSpheres, woodSphereCount, "physics object");
  pushInstanced("sphere", "rubber", rubberSpheres, rubberSphereCount, "physics object");
  pushInstanced("capsule", "wood", woodCapsules, woodCapsuleCount, "physics object");
  pushInstanced("capsule", "rubber", rubberCapsules, rubberCapsuleCount, "physics object");

  const velocityAmber = new Float32Array(physics.velocityVectors.length * 16);
  const velocityWire = new Float32Array(physics.velocityVectors.length * 16);
  let velocityAmberCount = 0, velocityWireCount = 0;
  for (const vector of physics.velocityVectors) {
    if (vector.material === "transparentAmber") {
      writeModelMatrix(velocityAmber, velocityAmberCount * 16, vector.position, vector.scale, vector.rotation);
      velocityAmberCount += 1;
    } else {
      writeModelMatrix(velocityWire, velocityWireCount * 16, vector.position, vector.scale, vector.rotation);
      velocityWireCount += 1;
    }
  }
  pushInstanced("lineX", "transparentAmber", velocityAmber, velocityAmberCount, "tracked object velocity vector");
  pushInstanced("lineX", "wire", velocityWire, velocityWireCount, "tracked object velocity vector");

  const contactAmber = new Float32Array(physics.contactMarkers.length * 16);
  const contactWire = new Float32Array(physics.contactMarkers.length * 16);
  let contactAmberCount = 0, contactWireCount = 0;
  for (const marker of physics.contactMarkers) {
    if (marker.material === "transparentAmber") {
      writeModelMatrix(contactAmber, contactAmberCount * 16, marker.position, marker.scale, marker.rotation);
      contactAmberCount += 1;
    } else {
      writeModelMatrix(contactWire, contactWireCount * 16, marker.position, marker.scale, marker.rotation);
      contactWireCount += 1;
    }
  }
  pushInstanced("lineX", "transparentAmber", contactAmber, contactAmberCount, "active contact normal marker");
  pushInstanced("lineX", "wire", contactWire, contactWireCount, "active contact normal marker");

  const floorWire = new Float32Array(52 * 16);
  const floorDebug = new Float32Array(16 * 16);
  const floorAmber = new Float32Array(12 * 16);
  const floorCyan = new Float32Array(60 * 16);
  let floorWireCount = 0, floorDebugCount = 0, floorAmberCount = 0, floorCyanCount = 0;
  for (let i = 0; i < 60; i += 1) {
    const col = i % 12;
    const row = Math.floor(i / 12);
    const x = -4.0 + col * 0.72;
    const z = -2.02 + row * 1.0;
    const y = -0.655 + Math.sin(time * 0.7 + i * 0.19) * 0.01;
    if (i % 5 === 0) {
      writeModelMatrix(floorDebug, floorDebugCount * 16, [x, y, z], [0.32, 1, 1], [0, 0, 0]);
      floorDebugCount += 1;
    } else {
      writeModelMatrix(floorWire, floorWireCount * 16, [x, y, z], [0.32, 1, 1], [0, 0, 0]);
      floorWireCount += 1;
    }
    if (i % 7 === 0) {
      writeModelMatrix(floorAmber, floorAmberCount * 16, [x, y + 0.012, z], [0.26, 1, 1], [0, Math.PI / 2, 0]);
      floorAmberCount += 1;
    } else {
      writeModelMatrix(floorCyan, floorCyanCount * 16, [x, y + 0.012, z], [0.26, 1, 1], [0, Math.PI / 2, 0]);
      floorCyanCount += 1;
    }
  }
  pushInstanced("lineX", "wire", floorWire, floorWireCount, "physics floor calibration mark");
  pushInstanced("lineX", "debug", floorDebug, floorDebugCount, "physics floor calibration mark");
  pushInstanced("lineX", "transparentAmber", floorAmber, floorAmberCount, "physics floor calibration mark");
  pushInstanced("lineX", "transparentCyan", floorCyan, floorCyanCount, "physics floor calibration mark");

  const whiteTiles = new Float32Array(12 * 16);
  const amberTiles = new Float32Array(12 * 16);
  const steelTiles = new Float32Array(48 * 16);
  let whiteTileCount = 0, amberTileCount = 0, steelTileCount = 0;
  for (let i = 0; i < 48; i += 1) {
    const x = -4.05 + (i % 12) * 0.72;
    const z = -2.0 + Math.floor(i / 12) * 1.04;
    const y = -0.61 + Math.sin(time * 0.55 + i) * 0.012;
    if (i % 4 === 0) {
      writeModelMatrix(whiteTiles, whiteTileCount * 16, [x, y, z], [0.11, 0.024, 0.11], [0, 0.18 * Math.sin(i), 0]);
      whiteTileCount += 1;
    } else if (i % 3 === 0) {
      writeModelMatrix(amberTiles, amberTileCount * 16, [x, y, z], [0.11, 0.024, 0.11], [0, 0.18 * Math.sin(i), 0]);
      amberTileCount += 1;
    } else {
      writeModelMatrix(steelTiles, steelTileCount * 16, [x, y, z], [0.11, 0.024, 0.11], [0, 0.18 * Math.sin(i), 0]);
      steelTileCount += 1;
    }
  }
  pushInstanced("cube", "white", whiteTiles, whiteTileCount, "physics optical tracking calibration tile");
  pushInstanced("cube", "amberGlow", amberTiles, amberTileCount, "physics optical tracking calibration tile");
  pushInstanced("cube", "darkSteel", steelTiles, steelTileCount, "physics optical tracking calibration tile");
  const resetCyan = new Float32Array(8 * 16);
  const resetAmber = new Float32Array(8 * 16);
  let resetCyanCount = 0, resetAmberCount = 0;
  for (let i = 0; i < 8; i += 1) {
    const digit = parseInt(physics.resetEvidence.fingerprint[i] ?? "0", 16);
    const value = Number.isFinite(digit) ? digit / 15 : 0;
    const target = i % 2 ? resetAmber : resetCyan;
    const offset = i % 2 ? resetAmberCount : resetCyanCount;
    writeModelMatrix(target, offset * 16, [-4.55 + i * 0.19, -0.55 + value * 0.11, -2.82], [0.12, 0.04 + value * 0.16, 0.09], [0, 0, 0]);
    if (i % 2) resetAmberCount += 1;
    else resetCyanCount += 1;
  }
  pushInstanced("cube", "cyanGlow", resetCyan, resetCyanCount, "deterministic reset fingerprint bar");
  pushInstanced("cube", "amberGlow", resetAmber, resetAmberCount, "deterministic reset fingerprint bar");
  if (physics.pusher.enabled) {
    items.push(item(r, "cube", "greenGlow", physics.pusher.position, physics.pusher.scale, physics.pusher.rotation, "physics kinematic pusher collider"));
    items.push(item(r, "cube", "transparentGreen", [2.48, -0.56, 1.35], [2.02, 0.035, 0.96], [0, 0, 0], "pusher sweep lane"));
    items.push(item(r, "cube", "transparentAmber", [physics.pusher.position[0] + 0.25, physics.pusher.position[1], physics.pusher.position[2]], [0.035, 0.34, 0.98], [0, 0, 0], "pusher contact face"));
    const pusherSparkCount = Math.min(6, physics.contactEvidence.pusherContacts);
    for (let i = 0; i < pusherSparkCount; i += 1) {
      const offset = (i - (pusherSparkCount - 1) * 0.5) * 0.09;
      items.push(item(r, "sphere", "amberGlow", [physics.pusher.position[0] + 0.32, physics.pusher.position[1] + 0.2 + (i % 2) * 0.08, physics.pusher.position[2] + offset], [0.055, 0.055, 0.055], [0, 0, 0], "actual pusher contact spark"));
    }
  }
  const contactMeterHeight = clamp(physics.contactEvidence.contacts * 0.018, 0.04, 0.48);
  const pusherMeterHeight = clamp(physics.contactEvidence.pusherContacts * 0.08, 0.035, 0.5);
  items.push(item(r, "cube", "darkSteel", [-4.42, -0.31, 2.55], [0.72, 0.22, 0.12], [0, 0, 0], "live physics contact meter"));
  items.push(item(r, "cube", "cyanGlow", [-4.64, -0.31 + contactMeterHeight * 0.5, 2.5], [0.08, contactMeterHeight, 0.08], [0, 0, 0], "live physics contact meter"));
  items.push(item(r, "cube", "amberGlow", [-4.38, -0.31 + pusherMeterHeight * 0.5, 2.5], [0.08, pusherMeterHeight, 0.08], [0, 0, 0], "live pusher contact meter"));
  const sorterSweep = Math.sin(time * (1.15 + Math.abs(conveyor) * 0.18));
  const sorterPhase = (time * (0.65 + Math.abs(conveyor) * 0.22)) % 1;
  items.push(item(r, "cube", "transparentAmber", [sorterSweep * 1.75, 0.36, 0.02], [0.055, 1.15, 2.55], [0, 0.16 * sorterSweep, 0], "animated sorter safety curtain"));
  items.push(item(r, "cube", "transparentCyan", [-1.72 + sorterPhase * 3.45, -0.16, -0.08], [0.34, 0.028, 1.34], [0, 0, 0], "animated conveyor flow band"));
  items.push(item(r, "lineX", "transparentAmber", [-1.72 + ((sorterPhase + 0.34) % 1) * 3.45, 0.04, -0.82], [0.62, 1, 1], [0, 0, 0], "animated conveyor velocity marker"));
  items.push(item(r, "lineX", "transparentCyan", [-1.72 + ((sorterPhase + 0.68) % 1) * 3.45, 0.04, 0.82], [0.62, 1, 1], [0, 0, 0], "animated conveyor velocity marker"));
  addRobot(r, items, [3.0, -0.38, 1.2], time, "greenGlow", "pusher robot");
  if (bool(state.controls.debug)) addBoundsGrid(r, items, 7.5, 4.4);
  return frame(items, bounds([-5, -1.3, -3.5], [5, 3.4, 3.5]), lights("lab"), env("lab"), {
    bloom: { threshold: 0.45, intensity: 0.24, radius: 3 },
    colorGrade: { contrast: 1.08, saturation: 1.02 },
    fxaa: true
  }, ["rigid-body objects", "conveyor friction", "contact normals", "kinematic robot pusher", "bin scoring", "deterministic reset"], ["Uses G3D PhysicsWorld rigid bodies with primitive/proxy colliders; mesh colliders and articulated robot dynamics are still bounded route gaps."], [`${physics.stats.bodies} bodies`, `${physics.contactEvidence.contacts} contacts`, `${physics.contactEvidence.pusherContacts} pusher contacts`, `${physics.scoredBodies} scored`, `${physics.stepper.steps} substeps`, `reset ${physics.resetEvidence.fingerprint}`]);
}

function buildFogCathedral(r: Resources, time: number, state: GalleryState): SceneFrame {
  const items: RenderItem[] = [];
  const fog = num(state.controls.fog, 0.62);
  const sun = num(state.controls.sun, 0.1);
  items.push(item(r, "cube", "darkSteel", [0, -0.84, -0.8], [7.2, 0.05, 8.8], [0, 0, 0], "cathedral floor"));
  items.push(item(r, "cube", "fogShadow", [0, 1.18, -5.35], [7.4, 3.8, 0.08], [0, 0, 0], "cathedral depth backing"));
  for (let i = 0; i < 8; i += 1) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    items.push(item(r, "cylinder", "rock", [side * 3.35, 0.45, -4.8 + row * 1.45], [0.16, 2.05 + row * 0.16, 0.16], [0, 0, 0], "foreground architectural silhouette"));
  }
  for (let i = 0; i < 28; i += 1) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    items.push(item(r, "cylinder", "rock", [side * 3.12, 0.65, -8 + row * 0.92], [0.24, 2.8 + (row % 4) * 0.18, 0.24], [0, 0, 0], "temple pillar"));
    if (row % 3 === 0) {
      items.push(item(r, "cube", "amberGlow", [side * 3.08, 2.18, -8 + row * 0.92], [0.26, 0.035, 0.26], [0, time * 0.08, 0], "warm capital glint"));
    }
  }
  for (let i = 0; i < 34; i += 1) {
    const x = -2.8 + hash01(i) * 5.6;
    const z = -8.2 + hash01(i * 7) * 15;
    items.push(item(r, "capsule", "matte", [x, -0.22 + hash01(i * 11) * 0.72, z], [0.07, 0.5 + hash01(i * 5) * 0.7, 0.07], [0.05 * Math.sin(time + i), hash01(i) * Math.PI, 0], "distant nave occluder"));
  }
  const evidence = createFogCathedralEvidence({
    time,
    fog,
    sun,
    beams: bool(state.controls.beams, true)
  });
  const rendererFog = createFogCathedralRendererEnvironmentFog({
    fog,
    proxyGeometryInstanceCount: countFogCathedralProxyGeometryInstances(evidence, bool(state.controls.beams, true))
  });
  addCathedralAtmosphere(r, items, time, fog, sun, bool(state.controls.beams, true));
  addCathedralArchitecturalDetail(r, items, time, fog);
  appendEvidencePayload(r, items, evidence);
  if (bool(state.controls.debug)) addCathedralExposureGuides(r, items, time);
  const beamLabel = bool(state.controls.beams, true) ? "rounded shaft proxies" : "shaft proxies hidden";
  return withEnvironmentFog(frame(items, bounds([-5, -1.2, -10], [5, 5, 8]), lights("cathedral"), env("fog"), {
    bloom: { threshold: 0.44, intensity: 0.28, radius: 5 },
    colorGrade: { contrast: 1.1, saturation: 0.82 },
    filmGrain: { intensity: 0.024 },
    fxaa: true
  }, ["renderer-level environment fog", "foreground/midground/background depth cues", beamLabel, "batched dust", "architectural silhouettes", "cathedral tracery detail", "cinematic camera", ...evidence.animatedSystems], [rendererFog.claimBoundary, "Volumetric god rays still use layered transparent ellipsoid/capsule proxy geometry, occlusion silhouettes, and batched dust; the renderer-level fog claim is separate from those helpers.", ...evidence.approximations], ["Foreground", "Midground", "Background", "Renderer fog", "Haze", "Shaft proxies", "Tracery", "Dust", ...evidence.metrics]), rendererFog);
}

function buildDigitalTwin(r: Resources, time: number, state: GalleryState): SceneFrame {
  const items: RenderItem[] = [];
  const pushInstanced = (geometry: keyof Resources["geometry"], material: string, transforms: Float32Array, count: number, label: string): void => {
    if (count > 0) items.push(instancedItem(r, geometry, material, transforms.subarray(0, count * 16), label));
  };
  const speed = bool(state.controls.running, true) ? num(state.controls.speed, 1) : 0;
  const selectedZone = String(state.controls.zone ?? "all");
  const zones: readonly { readonly id: string; readonly x: number; readonly z: number; readonly w: number; readonly d: number; readonly material: string }[] = [
    { id: "inbound", x: -3.6, z: -1.78, w: 2.05, d: 1.1, material: "transparentAmber" },
    { id: "assembly", x: -1.22, z: -0.18, w: 2.15, d: 1.3, material: "transparentCyan" },
    { id: "qa", x: 1.16, z: 0.08, w: 2.1, d: 1.24, material: "transparentGreen" },
    { id: "outbound", x: 3.58, z: 1.42, w: 1.92, d: 1.08, material: "transparentAmber" }
  ];
  items.push(item(r, "cube", "darkSteel", [0, -0.75, 0], [10.5, 0.08, 6.2], [0, 0, 0], "factory floor"));
  for (let i = 0; i < 8; i += 1) {
    items.push(item(r, "cube", "matte", [-4.6 + i * 1.3, -0.68, -2.8], [1.0, 0.04, 0.05], [0, 0, 0], "floor lane"));
    items.push(item(r, "cube", "matte", [-4.6 + i * 1.3, -0.68, 2.8], [1.0, 0.04, 0.05], [0, 0, 0], "floor lane"));
  }
  for (const zone of zones) {
    const focused = selectedZone === "all" || selectedZone === zone.id;
    items.push(item(r, "cube", focused ? zone.material : "glass", [zone.x, -0.655, zone.z], [zone.w, 0.018, zone.d], [0, 0, 0], "enterprise factory zone"));
    items.push(item(r, "lineX", focused ? "debug" : "wire", [zone.x, -0.61, zone.z - zone.d * 0.5], [zone.w, 1, 1], [0, 0, 0], "enterprise zone boundary"));
    items.push(item(r, "lineX", focused ? "debug" : "wire", [zone.x, -0.61, zone.z + zone.d * 0.5], [zone.w, 1, 1], [0, 0, 0], "enterprise zone boundary"));
    items.push(item(r, "lineX", focused ? zone.material : "wire", [zone.x - zone.w * 0.5, -0.61, zone.z], [zone.d, 1, 1], [0, Math.PI / 2, 0], "enterprise zone boundary"));
    items.push(item(r, "lineX", focused ? zone.material : "wire", [zone.x + zone.w * 0.5, -0.61, zone.z], [zone.d, 1, 1], [0, Math.PI / 2, 0], "enterprise zone boundary"));
    items.push(item(r, "cube", focused ? "cyanGlow" : "darkSteel", [zone.x + zone.w * 0.35, -0.38, zone.z - zone.d * 0.38], [0.36, 0.06, 0.08], [0, 0, 0], "zone health status chip"));
  }
  for (let lane = 0; lane < 3; lane += 1) {
    items.push(item(r, "cube", "steel", [0, -0.52, -1.7 + lane * 1.7], [8.8, 0.1, 0.42], [0, 0, 0], "conveyor"));
  }
  const packageWood = new Float32Array(60 * 16);
  const packageWhite = new Float32Array(30 * 16);
  let packageWoodCount = 0;
  let packageWhiteCount = 0;
  for (let lane = 0; lane < 3; lane += 1) {
    for (let i = 0; i < 24; i += 1) {
      const p = (((time * 0.18 * speed + i * 0.08 + lane * 0.13) % 1) - 0.5) * 8.2;
      const position: Vec3 = [p, -0.25, -1.7 + lane * 1.7];
      const rotation: Vec3 = [0, 0.02 * i, 0];
      if (i % 3) {
        writeModelMatrix(packageWood, packageWoodCount * 16, position, [0.24, 0.18, 0.22], rotation);
        packageWoodCount += 1;
      } else {
        writeModelMatrix(packageWhite, packageWhiteCount * 16, position, [0.24, 0.18, 0.22], rotation);
        packageWhiteCount += 1;
      }
    }
  }
  pushInstanced("cube", "wood", packageWood, packageWoodCount, "package flow");
  pushInstanced("cube", "white", packageWhite, packageWhiteCount, "package flow");
  for (let i = 0; i < 6; i += 1) {
    addRobot(r, items, [-4.2 + i * 1.65, -0.36, 1.6], time * speed + i * 0.7, i % 2 ? "amberGlow" : "cyanGlow", `robot cell ${i + 1}`);
    const health = 0.36 + 0.18 * Math.sin(time * 0.82 * speed + i);
    items.push(item(r, "cube", i % 2 ? "amberGlow" : "greenGlow", [-4.2 + i * 1.65, 1.18 + health * 0.5, 1.08], [0.08, health, 0.08], [0, 0, 0], "robot cell health meter"));
    items.push(item(r, "lineX", "wire", [-4.2 + i * 1.65, 1.05, 1.08], [0.48, 1, 1], [0, time * 0.18 + i, 0], "robot takt telemetry"));
  }
  const routeSegments: readonly [Vec3, Vec3, Vec3, string][] = [
    [[-3.65, -0.59, -2.28], [1.55, 1, 1], [0, 0, 0], "transparentCyan"],
    [[-2.62, -0.59, -1.42], [1.72, 1, 1], [0, Math.PI / 2, 0], "transparentCyan"],
    [[-0.45, -0.59, 1.98], [5.2, 1, 1], [0, 0, 0], "transparentGreen"],
    [[2.72, -0.59, 0.68], [2.55, 1, 1], [0, Math.PI / 2, 0], "transparentAmber"]
  ];
  for (const [position, scale, rotation, material] of routeSegments) {
    items.push(item(r, "lineX", material, position, scale, rotation, "amr fleet route"));
  }
  for (let i = 0; i < 7; i += 1) {
    items.push(item(r, "sphere", i % 2 ? "cyanGlow" : "greenGlow", [-4.3 + i * 1.35, -0.5, i % 2 ? 2.0 : -2.28], [0.07, 0.07, 0.07], [0, 0, 0], "amr route waypoint"));
  }
  const mobileRobots = new Float32Array(10 * 16);
  for (let i = 0; i < 10; i += 1) {
    const p = (time * speed * 0.12 + i / 10) % 1;
    const x = -4.8 + p * 9.6;
    const z = i % 2 ? -2.45 : 2.45;
    writeModelMatrix(mobileRobots, i * 16, [x, -0.28, z], [0.18, 0.34, 0.18], [Math.PI / 2, time + i, 0]);
  }
  pushInstanced("capsule", "greenGlow", mobileRobots, 10, "mobile robot");
  for (let panel = 0; panel < 4; panel += 1) {
    const x = -3.8 + panel * 2.4;
    items.push(item(r, "cube", "darkSteel", [x, 0.38, 3.03], [1.22, 0.52, 0.06], [0.08, 0, 0], "operator status overlay"));
    items.push(item(r, "cube", panel % 2 ? "cyanGlow" : "greenGlow", [x - 0.32, 0.48, 2.98], [0.34, 0.08, 0.035], [0.08, 0, 0], "operator status overlay"));
    items.push(item(r, "cube", panel === 2 ? "amberGlow" : "transparentCyan", [x + 0.2, 0.28, 2.98], [0.46, 0.07 + 0.05 * (panel % 3), 0.035], [0.08, 0, 0], "operator status overlay"));
    items.push(item(r, "sphere", panel === 3 ? "amberGlow" : "greenGlow", [x + 0.54, 0.62, 2.99], [0.055, 0.055, 0.055], [0, 0, 0], "operator status overlay"));
  }
  const timelinePhase = (time * Math.max(0.05, speed) * 0.08) % 1;
  items.push(item(r, "cube", "darkSteel", [0, -0.48, 2.73], [7.8, 0.055, 0.11], [0, 0, 0], "digital twin timeline rail"));
  items.push(item(r, "cube", "cyanGlow", [-3.82 + timelinePhase * 7.64, -0.42, 2.73], [0.18, 0.11, 0.16], [0, 0, 0], "digital twin timeline cursor"));
  for (let tick = 0; tick < 12; tick += 1) {
    const x = -3.58 + tick * 0.65;
    items.push(item(r, "lineX", tick % 3 === 0 ? "transparentAmber" : "wire", [x, -0.39, 2.62], [0.18, 1, 1], [0, Math.PI / 2, 0], "digital twin timeline tick"));
  }
  const eventMaterials = ["greenGlow", "cyanGlow", "amberGlow", "transparentCyan"] as const;
  for (let row = 0; row < 8; row += 1) {
    const activeRow = row === Math.floor(timelinePhase * 8);
    const y = 0.26 + row * 0.075;
    items.push(item(r, "cube", activeRow ? "amberGlow" : "darkSteel", [4.72, y, 2.58], [0.72, 0.038, 0.045], [0.12, -0.28, 0], "factory event log row"));
    items.push(item(r, "cube", eventMaterials[row % eventMaterials.length], [4.38 + (row % 3) * 0.12, y + 0.01, 2.54], [0.12 + (row % 4) * 0.055, 0.018, 0.02], [0.12, -0.28, 0], "factory event log row"));
  }
  const qaSweep = Math.sin(time * speed * 1.18);
  items.push(item(r, "cube", "transparentCyan", [1.16 + qaSweep * 0.74, 0.52, 0.08], [0.045, 1.18, 1.24], [0, 0.06 * qaSweep, 0], "qa inspection volume sweep"));
  items.push(item(r, "lineX", "transparentAmber", [1.16, 1.18, 0.08], [1.55, 1, 1], [0, time * 0.26 * speed, 0.28], "robot inspection scan vector"));
  if (bool(state.controls.sensors, true)) {
    const centralSweep = Math.sin(time * speed * 1.7);
    items.push(item(
      r,
      "cube",
      "cyanGlow",
      [centralSweep * 0.72, 1.18 + Math.cos(time * speed * 1.3) * 0.08, 0],
      [2.2, 0.035, 0.035],
      [0.08, time * speed * 0.55, 0.16],
      "central sensor sweep"
    ));
    items.push(item(
      r,
      "sphere",
      "amberGlow",
      [-centralSweep * 0.9, 0.92, 0.08],
      [0.12, 0.12, 0.12],
      [0, 0, 0],
      "central sensor sweep"
    ));
    const lidarCones = new Float32Array(10 * 16);
    const lidarWire = new Float32Array(5 * 16);
    const lidarCyan = new Float32Array(5 * 16);
    let lidarWireCount = 0;
    let lidarCyanCount = 0;
    for (let i = 0; i < 10; i += 1) {
      const z = 0.2 + Math.sin(time * speed + i) * 1.52;
      writeModelMatrix(lidarCones, i * 16, [-4.5 + i, -0.02, z], [0.22, 0.014, 0.72], [Math.PI / 2, time * 0.5 + i, 0]);
      if (i % 2) {
        writeModelMatrix(lidarCyan, lidarCyanCount * 16, [-4.5 + i, 0.55, z], [0.62, 1, 1], [0, time * 0.34 + i, 0.32]);
        lidarCyanCount += 1;
      } else {
        writeModelMatrix(lidarWire, lidarWireCount * 16, [-4.5 + i, 0.55, z], [0.62, 1, 1], [0, time * 0.34 + i, 0.32]);
        lidarWireCount += 1;
      }
    }
    pushInstanced("cylinder", "transparentCyan", lidarCones, 10, "lidar sensor sweep");
    pushInstanced("lineX", "transparentCyan", lidarCyan, lidarCyanCount, "lidar sensor sweep ray");
    pushInstanced("lineX", "wire", lidarWire, lidarWireCount, "lidar sensor sweep ray");
    const sensorGreen = new Float32Array(12 * 16);
    const sensorCyan = new Float32Array(12 * 16);
    let sensorGreenCount = 0;
    let sensorCyanCount = 0;
    for (let i = 0; i < 24; i += 1) {
      const lane = i % 3;
      const p = (((time * speed * 0.32 + i * 0.11) % 1) - 0.5) * 8.4;
      const z = -1.72 + lane * 1.72;
      const position: Vec3 = [p, -0.18 + Math.sin(time * 2 + i) * 0.025, z];
      const rotation: Vec3 = [0, 0.08 * Math.sin(time + i), 0];
      if (i % 2) {
        writeModelMatrix(sensorGreen, sensorGreenCount * 16, position, [0.34, 0.035, 0.64], rotation);
        sensorGreenCount += 1;
      } else {
        writeModelMatrix(sensorCyan, sensorCyanCount * 16, position, [0.34, 0.035, 0.64], rotation);
        sensorCyanCount += 1;
      }
    }
    pushInstanced("cube", "transparentGreen", sensorGreen, sensorGreenCount, "sensor status pulse");
    pushInstanced("cube", "transparentCyan", sensorCyan, sensorCyanCount, "sensor status pulse");
  }
  if (bool(state.controls.safety, true)) {
    const safetyZones = new Float32Array(6 * 16);
    for (let i = 0; i < 6; i += 1) {
      writeModelMatrix(safetyZones, i * 16, [-4.2 + i * 1.65, -0.5, 1.6], [1.2, 0.025, 1.2], [0, 0, 0]);
    }
    pushInstanced("cube", "transparentAmber", safetyZones, 6, "safety zone");
  }
  if (bool(state.controls.heatmap, true)) {
    const heatmapGreen = new Float32Array(10 * 16);
    const heatmapAmber = new Float32Array(10 * 16);
    let heatmapGreenCount = 0;
    let heatmapAmberCount = 0;
    for (let i = 0; i < 20; i += 1) {
      const x = -4.45 + (i % 10) * 0.94;
      const z = -2.18 + Math.floor(i / 10) * 4.2;
      if (i % 2) {
        writeModelMatrix(heatmapGreen, heatmapGreenCount * 16, [x, -0.605, z], [0.64, 0.016, 0.7], [0, 0, 0]);
        heatmapGreenCount += 1;
      } else {
        writeModelMatrix(heatmapAmber, heatmapAmberCount * 16, [x, -0.605, z], [0.64, 0.016, 0.7], [0, 0, 0]);
        heatmapAmberCount += 1;
      }
    }
    pushInstanced("cube", "transparentGreen", heatmapGreen, heatmapGreenCount, "quality heatmap");
    pushInstanced("cube", "transparentAmber", heatmapAmber, heatmapAmberCount, "quality heatmap");
  }
  return frame(items, bounds([-5.15, -1.25, -3.35], [5.15, 3.6, 3.35]), lights("factory"), env("factory"), {
    bloom: { threshold: 0.42, intensity: 0.32, radius: 4 },
    colorGrade: { contrast: 1.1, saturation: 1.02 },
    fxaa: true
  }, ["conveyors", "robot arms", "mobile robot paths", "package flow", "sensor sweeps", "heatmap", "zone focus", "operator status overlays", "event log", "inspection timeline"], ["Real robot telemetry/CAD import are not connected; simulation data is deterministic in-browser state."], ["Factory", "Robots", "Packages", "Sensors", "Timeline", "Heatmap", "Event log", `Zone ${selectedZone}`]);
}

function addMarinaEnvironment(
  r: Resources,
  items: RenderItem[],
  time: number,
  state: GalleryState,
  waterTelemetry: GalleryWaterTelemetry,
  waterVisualLayers: GalleryWaterVisualLayerSet
): void {
  items.push(item(r, "sphere", "sunDisc", [5.7, 2.35, -6.65], [0.72, 0.72, 0.08], [0, 0, 0], "low sunset sun"));
  for (let i = 0; i < 20; i += 1) {
    const x = -8.8 + i * 0.92;
    const material = i % 5 === 0 ? "amberGlow" : i % 3 === 0 ? "white" : "transparentAmber";
    items.push(item(r, "cube", material, [x, 1.62 + Math.sin(i * 1.9) * 0.08, -6.42], [0.16 + hash01(i * 5) * 0.2, 0.012, 0.012], [0, 0, -0.16 + hash01(i * 7) * 0.32], "sunset cloud highlight"));
  }
  items.push(item(r, "cube", "shoreline", [0, -0.34, -5.8], [9.2, 0.12, 0.72], [0, 0, 0], "far sandy shoreline"));
  items.push(item(r, "cube", "shoreline", [-5.8, -0.34, 5.35], [5.8, 0.12, 0.82], [0, 0.12, 0], "near sandy shoreline"));
  for (let i = 0; i < 9; i += 1) {
    const x = -8.2 + i * 2.05;
    const height = 0.75 + hash01(i * 13) * 1.35;
    items.push(item(r, "cube", "mountain", [x, 0.35 + height * 0.5, -6.55], [1.35, height, 0.12], [0, 0.08 * Math.sin(i), 0.08], "layered mountain ridge"));
  }
  for (let i = 0; i < 14; i += 1) {
    const x = -7.8 + i * 1.15;
    const z = i % 2 ? -5.75 : 5.55;
    items.push(item(r, "cylinder", "pine", [x, 0.25, z], [0.08, 0.72, 0.08], [0, 0, 0], "shore pine trunk"));
    items.push(item(r, "sphere", "pine", [x, 0.86, z], [0.33, 0.52, 0.33], [0, i * 0.31, 0], "shore pine canopy"));
  }
  for (let i = 0; i < 6; i += 1) {
    const x = -6.6 + i * 1.18;
    const h = 0.65 + (i % 3) * 0.28;
    items.push(item(r, "cube", i % 2 ? "darkSteel" : "steel", [x, 0.18 + h * 0.5, -5.72], [0.62, h, 0.42], [0, 0.04, 0], "marina lodge mass"));
    for (let w = 0; w < 3; w += 1) {
      items.push(item(r, "cube", "amberGlow", [x - 0.2 + w * 0.2, 0.34 + h * 0.46, -5.47], [0.055, 0.095, 0.025], [0, 0, 0], "warm lodge window"));
      items.push(item(r, "cube", "darkSteel", [x - 0.2 + w * 0.2, 0.34 + h * 0.46, -5.44], [0.009, 0.13, 0.012], [0, 0, 0], "window mullion"));
    }
  }
  for (let i = 0; i < 22; i += 1) {
    const x = -8.2 + (i % 11) * 1.55;
    const z = i < 16 ? -6.4 : 6.4;
    items.push(item(r, "sphere", "rock", [x, -0.3 + hash01(i) * 0.18, z], [0.42 + hash01(i) * 0.35, 0.24, 0.35], [0, hash01(i) * 3, 0], "shore rocks"));
  }
  for (let i = 0; i < 14; i += 1) {
    items.push(item(r, "cube", "wood", [-4.4 + i * 0.68, 0.04, -3.2], [0.5, 0.08, 1.4], [0, 0, 0], "dock boards"));
    items.push(item(r, "cylinder", "amberGlow", [-4.4 + i * 0.68, 0.45, -3.9], [0.06, 0.55, 0.06], [0, 0, 0], "dock lights"));
    items.push(item(r, "lineX", "wire", [-4.4 + i * 0.68, 0.72, -3.92], [0.5, 1, 1], [0, 0, 0], "dock safety rope"));
    items.push(item(r, "cylinder", "steel", [-4.4 + i * 0.68, 0.28, -2.52], [0.025, 0.48, 0.025], [0, 0, 0], "dock rail post"));
    items.push(item(r, "cube", "darkSteel", [-4.4 + i * 0.68, 0.29, -2.52], [0.035, 0.5, 0.035], [0, 0, 0], "dark dock piling"));
    if (i < 13) {
      items.push(item(r, "cube", "steel", [-4.06 + i * 0.68, 0.62, -2.52], [0.32, 0.024, 0.026], [0, 0, 0], "dock rail crossbar"));
    }
  }
  for (let i = 0; i < 12; i += 1) {
    const x = -5.2 + i * 0.94;
    const z = 2.3 + Math.sin(i) * 0.8;
    const h = waveHeight(x, z, time, state.ripples, num(state.controls.intensity, 1));
    items.push(item(r, "sphere", i % 2 ? "redGlow" : "white", [x, 0.1 + h, z], [0.18, 0.18, 0.18], [0, 0, 0], "buoy"));
  }
  items.push(item(r, "cube", "steel", [2.2, 0.22 + Math.sin(time) * 0.04, 1.7], [1.5, 0.18, 0.58], [0.04 * Math.sin(time), 0.38, 0.04], "small boat hull"));
  items.push(item(r, "cube", "glass", [2.2, 0.45, 1.45], [0.65, 0.28, 0.08], [0, 0.38, 0], "boat canopy"));
  items.push(item(r, "cylinder", "steel", [2.2, 0.98, 1.45], [0.035, 1.08, 0.035], [0, 0.38, 0], "small boat mast"));
  items.push(item(r, "cube", "white", [2.45, 1.05, 1.26], [0.035, 0.62, 0.42], [0.1, 0.38, 0.04], "small boat sail"));
  for (let i = 0; i < 16; i += 1) {
    const x = -7.2 + i * 0.95;
    const z = -4.9 + Math.sin(i * 1.7) * 0.18;
    items.push(item(r, "lineX", "wire", [x, 1.05 + Math.sin(time + i) * 0.05, z], [0.36, 1, 1], [0, 0.25 + i * 0.03, 0], "marina cable lights"));
  }
  for (let i = 0; i < 28; i += 1) {
    const x = -8.0 + (i % 14) * 1.12 + Math.sin(i * 2.1) * 0.08;
    const z = -4.25 + Math.floor(i / 14) * 2.15 + Math.sin(i * 1.3) * 0.16;
    const h = waveHeight(x, z, time, state.ripples, num(state.controls.intensity, 1));
    items.push(item(r, "cube", i % 5 === 0 ? "amberGlow" : "white", [x, -0.005 + h, z], [0.04 + hash01(i * 19) * 0.08, 0.01, 0.12 + hash01(i * 23) * 0.16], [0, time * 0.18 + i * 0.37, 0], "water specular glint"));
  }
  for (let i = 0; i < 18; i += 1) {
    const x = -7.5 + (i % 9) * 1.72;
    const z = -4.72 + Math.floor(i / 9) * 3.1 + Math.sin(i * 0.91 + time) * 0.24;
    const h = waveHeight(x, z, time, state.ripples, num(state.controls.intensity, 1));
    items.push(item(r, "lineX", "transparentCyan", [x, 0.02 + h, z], [0.48 + hash01(i * 29) * 0.62, 1, 1], [0, -0.28 + Math.sin(time * 0.3 + i) * 0.2, 0], "animated foam ripple line"));
  }
  for (const patch of waterTelemetry.foamPatches) {
    const h = waveHeight(patch.x, patch.z, time, state.ripples, num(state.controls.intensity, 1));
    items.push(item(r, "lineX", "transparentCyan", [patch.x, 0.035 + h, patch.z], [0.42 + patch.radius * 2.6, 1, 1], [0, -0.34 + patch.intensity * 0.7, 0], "measured water foam crest"));
  }
  addWaterLabVisualCues(r, items, waterVisualLayers);
  addWaterLabFloatingObjects(r, items, waterVisualLayers, time);
  addWaterLabDetailOverlays(r, items, time, state);
}

function addWaterLabDetailOverlays(r: Resources, items: RenderItem[], time: number, state: GalleryState): void {
  const intensity = num(state.controls.intensity, 1);
  const shoreLines: Vec3[] = [];
  const structureLines: Vec3[] = [];
  const warmLines: Vec3[] = [];
  const foamLines: Vec3[] = [];
  const crispFoamLines: Vec3[] = [];
  const foamSlivers: FlatSliver[] = [];
  const detailBatches = new Map<string, CueInstanceBatch>();

  for (let i = 0; i < 74; i += 1) {
    const x = -6.55 + (i % 13) * 1.02;
    const z = i < 42 ? 4.72 + Math.sin(i * 0.72) * 0.12 : -5.18 + Math.cos(i * 0.57) * 0.09;
    const y = -0.09 + waveHeight(x, z, time, state.ripples, intensity) * 0.35;
    pushPlanarLine(shoreLines, [x, y, z], 0.38 + hash01(i * 17) * 0.34, -0.1 + Math.sin(i * 0.39) * 0.28);
  }

  for (let i = 0; i < 58; i += 1) {
    const x = -6.0 + (i % 12) * 1.02;
    const y = 0.36 + Math.floor(i / 12) * 0.15;
    pushPlanarLine(warmLines, [x, y, -5.28], 0.42 + hash01(i * 29) * 0.28, 0.04);
  }

  for (let i = 0; i < 64; i += 1) {
    const x = -4.92 + (i % 14) * 0.62;
    const z = -3.78 + Math.floor(i / 14) * 1.02;
    pushPlanarLine(structureLines, [x, 0.115, z], 0.74 + hash01(i * 31) * 0.24, Math.PI / 2 + 0.02 * Math.sin(i));
  }

  for (let i = 0; i < 128; i += 1) {
    const x = -7.35 + (i % 32) * 0.48;
    const z = -3.55 + Math.floor(i / 32) * 1.62 + Math.sin(i * 0.58 + time * 0.14) * 0.42;
    const h = waveHeight(x, z, time, state.ripples, intensity);
    const length = 0.32 + hash01(i * 37) * 0.52;
    const yaw = -0.46 + Math.sin(i * 0.33) * 0.32;
    pushPlanarLine(foamLines, [x, h + 0.045, z], length, yaw);
    foamSlivers.push({
      center: [x + Math.sin(i * 0.74) * 0.12, h + 0.052, z + Math.cos(i * 0.41) * 0.1],
      length: length * 0.64,
      thickness: 0.018 + hash01(i * 53) * 0.018,
      yaw
    });
    appendCueInstance(
      detailBatches,
      "cube",
      i % 5 === 0 ? "white" : "transparentCyan",
      [x + Math.sin(i * 0.74) * 0.18, h + 0.038, z + Math.cos(i * 0.41) * 0.16],
      [0.18 + hash01(i * 47) * 0.3, 0.008, 0.018 + hash01(i * 53) * 0.018],
      [0, -0.42 + Math.sin(i * 0.27 + time * 0.08) * 0.34, 0],
      "measured water foam crest"
    );
  }

  for (let i = 0; i < 180; i += 1) {
    const row = Math.floor(i / 30);
    const x = -7.32 + (i % 30) * 0.5 + Math.sin(i * 0.47 + time * 0.08) * 0.06;
    const z = -4.18 + row * 0.82 + Math.cos(i * 0.39 + time * 0.1) * 0.14;
    const h = waveHeight(x, z, time, state.ripples, intensity);
    const length = 0.18 + hash01(i * 83) * 0.24;
    const yaw = -0.28 + Math.sin(i * 0.31) * 0.28;
    pushPlanarLine(crispFoamLines, [x, h + 0.064, z], length, yaw);
    if (i % 5 === 0) {
      pushSegment(crispFoamLines, [x - 0.06, h + 0.068, z - 0.04], [x + 0.09, h + 0.068, z + 0.05]);
    }
  }

  for (let i = 0; i < 136; i += 1) {
    const row = Math.floor(i / 17);
    const x = -6.72 + (i % 17) * 0.82;
    const z = -4.72 + row * 0.62 + Math.sin(i * 0.92) * 0.035;
    appendCueInstance(
      detailBatches,
      "cube",
      row % 2 === 0 ? "transparentAmber" : "wire",
      [x, 0.14 + row * 0.01, z],
      [0.31 + hash01(i * 61) * 0.18, 0.009, 0.018],
      [0, 0.02 + Math.sin(i * 0.17) * 0.035, 0],
      row % 2 === 0 ? "dock lights" : "marina cable lights"
    );
  }

  for (let i = 0; i < 14; i += 1) {
    const x = -7.8 + i * 1.15;
    const z = i % 2 ? -5.72 : 5.48;
    for (let tier = 0; tier < 3; tier += 1) {
      const y = 0.68 + tier * 0.24 + Math.sin(time * 0.09 + i + tier) * 0.018;
      const width = 0.54 - tier * 0.11 + hash01(i * 73 + tier) * 0.12;
      pushPlanarLine(structureLines, [x, y, z], width, 0.05 + Math.sin(i * 0.41 + tier) * 0.26);
      pushSegment(
        structureLines,
        [x - width * 0.32, y - 0.08, z + 0.02],
        [x + width * 0.22, y + 0.12, z - 0.02]
      );
    }
  }

  for (let i = 0; i < 34; i += 1) {
    const x = -7.1 + i * 0.43;
    const y = 1.18 + Math.sin(i * 0.36) * 0.24;
    const sag = 0.05 + Math.sin(time * 0.12 + i) * 0.018;
    pushSegment(structureLines, [x, y, -5.42], [x + 0.36, y - sag, -5.08]);
  }

  pushSegment(structureLines, [1.9, 0.42, 1.42], [2.2, 0.98, 1.45]);
  pushSegment(structureLines, [2.5, 0.42, 1.42], [2.2, 0.98, 1.45]);
  pushSegment(structureLines, [2.2, 0.98, 1.45], [2.48, 1.18, 1.06]);
  pushSegment(structureLines, [2.2, 0.98, 1.45], [2.48, 0.72, 1.46]);

  pushLineGroup(r, items, shoreLines, "wire", "shore rocks");
  pushLineGroup(r, items, structureLines, "wire", "marina cable lights");
  pushLineGroup(r, items, warmLines, "transparentAmber", "dock lights");
  pushLineGroup(r, items, foamLines, "transparentCyan", "measured water foam crest");
  pushLineGroup(r, items, crispFoamLines, "debug", "measured water foam crest");
  pushFlatSliverGroup(r, items, foamSlivers, "transparentCyan", "measured water foam crest");
  flushCueBatches(r, items, detailBatches);
}

function addWaterLabVisualCues(r: Resources, items: RenderItem[], layers: GalleryWaterVisualLayerSet): void {
  const batches = new Map<string, CueInstanceBatch>();
  for (const cue of layers.surfaceCues) {
    const material = cue.kind === "specular-glint"
      ? cue.intensity > 0.58 ? "white" : "transparentCyan"
      : cue.kind === "depth-band" || cue.kind === "horizon-band"
        ? cue.intensity > 0.24 ? "transparentAmber" : "transparentCyan"
      : cue.kind === "shoreline-foam"
        ? "transparentCyan"
        : cue.kind === "ripple-ring"
          ? "debug"
          : "transparentCyan";
    const geometry = cue.kind === "specular-glint" || cue.kind === "depth-band" || cue.kind === "horizon-band" ? "cube" : "lineX";
    const yLift = cue.kind === "ripple-ring" ? 0.055 : cue.kind === "specular-glint" ? 0.032 : cue.kind === "depth-band" ? 0.026 : 0.042;
    if (geometry === "cube") {
      appendCueInstance(
        batches,
        "cube",
        material,
        [cue.x, cue.y + yLift, cue.z],
        [cue.length, Math.max(0.006, cue.thickness * 0.45), cue.thickness],
        [0, cue.rotation, 0],
        "measured water foam crest"
      );
    } else {
      appendCueInstance(
        batches,
        "lineX",
        material,
        [cue.x, cue.y + yLift, cue.z],
        [cue.length, 1, 1],
        [0, cue.rotation, 0],
        "measured water foam crest"
      );
    }
  }
  flushCueBatches(r, items, batches);
}

function addWaterLabFloatingObjects(r: Resources, items: RenderItem[], layers: GalleryWaterVisualLayerSet, time: number): void {
  for (const object of layers.floatingObjects) {
    if (object.kind === "lab-buoy") {
      const material = object.intensity > 0.65 ? "redGlow" : object.intensity > 0.48 ? "white" : "amberGlow";
      items.push(item(
        r,
        "sphere",
        material,
        [object.x, object.y + 0.105 * object.scale, object.z],
        [0.16 * object.scale, 0.16 * object.scale, 0.16 * object.scale],
        [object.pitch, object.heading, object.roll],
        "buoy"
      ));
      items.push(item(
        r,
        "lineX",
        "transparentCyan",
        [object.x - Math.sin(object.heading) * 0.18, object.y + 0.034, object.z - Math.cos(object.heading) * 0.18],
        [object.wakeLength, 1, 1],
        [0, object.heading + Math.PI * 0.5, 0],
        "measured water foam crest"
      ));
      continue;
    }

    const hullMaterial = object.kind === "lab-service-boat" ? "steel" : "white";
    const accentMaterial = object.kind === "lab-service-boat" ? "glass" : "cyanGlow";
    items.push(item(
      r,
      "cube",
      hullMaterial,
      [object.x, object.y + 0.18 * object.scale, object.z],
      [1.25 * object.scale, 0.16 * object.scale, 0.46 * object.scale],
      [object.pitch, object.heading, object.roll],
      "small boat hull"
    ));
    items.push(item(
      r,
      "cube",
      accentMaterial,
      [
        object.x - Math.sin(object.heading) * 0.08,
        object.y + 0.4 * object.scale,
        object.z - Math.cos(object.heading) * 0.08
      ],
      [0.52 * object.scale, 0.18 * object.scale, 0.24 * object.scale],
      [object.pitch * 0.4, object.heading, object.roll * 0.4],
      "boat canopy"
    ));
    if (object.kind === "lab-service-boat") {
      items.push(item(
        r,
        "cylinder",
        "steel",
        [object.x, object.y + 0.86 * object.scale, object.z],
        [0.026 * object.scale, 0.82 * object.scale, 0.026 * object.scale],
        [0, object.heading, object.roll],
        "small boat mast"
      ));
      items.push(item(
        r,
        "cube",
        "white",
        [
          object.x + Math.cos(object.heading) * 0.22 * object.scale,
          object.y + 0.92 * object.scale,
          object.z - Math.sin(object.heading) * 0.22 * object.scale
        ],
        [0.032 * object.scale, 0.52 * object.scale, 0.34 * object.scale],
        [0.08 + object.pitch, object.heading, 0.04 + object.roll],
        "small boat sail"
      ));
    }
    items.push(item(
      r,
      "lineX",
      "transparentCyan",
      [
        object.x - Math.sin(object.heading) * 0.64 * object.scale,
        object.y + 0.026,
        object.z - Math.cos(object.heading) * 0.64 * object.scale
      ],
      [object.wakeLength, 1, 1],
      [0, object.heading + Math.PI * 0.5 + Math.sin(time * 0.28) * 0.04, 0],
      "measured water foam crest"
    ));
  }
}

function addDeck(r: Resources, items: RenderItem[], time: number): void {
  items.push(item(r, "cube", "wood", [0, -0.35, 1.08], [11.4, 0.16, 3.55], [0, 0, 0], "observatory deck"));
  items.push(item(r, "cube", "darkSteel", [0, -0.53, 2.78], [11.8, 0.16, 0.22], [0, 0, 0], "deck edge box girder"));
  items.push(item(r, "cube", "darkSteel", [0, -0.53, -0.66], [11.8, 0.16, 0.22], [0, 0, 0], "deck edge box girder"));
  items.push(item(r, "cube", "darkSteel", [-5.78, -0.52, 1.05], [0.22, 0.14, 3.6], [0, 0, 0], "deck side box girder"));
  items.push(item(r, "cube", "darkSteel", [5.78, -0.52, 1.05], [0.22, 0.14, 3.6], [0, 0, 0], "deck side box girder"));
  for (let i = 0; i < 13; i += 1) {
    const x = -5.1 + i * 0.85;
    const plankTone = i % 3 === 0 ? "wood" : i % 3 === 1 ? "sand" : "rock";
    items.push(item(r, "cube", plankTone, [x, -0.235, 1.08], [0.055, 0.035, 3.34], [0, 0.015 * Math.sin(i), 0], "individual deck plank seam"));
  }
  for (let i = 0; i < 10; i += 1) {
    const x = -5.0 + i * 1.12;
    items.push(item(r, "cylinder", "steel", [x, -0.96, 2.12], [0.075, 1.18, 0.075], [0, 0, 0], "outer deck support pylon"));
    items.push(item(r, "cylinder", "darkSteel", [x, -0.88, -0.08], [0.055, 0.94, 0.055], [0, 0, 0], "inner deck support pylon"));
    if (i < 9) {
      items.push(item(r, "cube", "steel", [x + 0.56, -0.82, 1.02], [2.35, 0.035, 0.05], [0, 0, 0.3], "diagonal underdeck brace"));
      items.push(item(r, "cube", "steel", [x + 0.56, -0.8, 1.02], [2.15, 0.035, 0.05], [0, 0, -0.26], "diagonal underdeck brace"));
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const x = -5.35 + i * 0.72;
    items.push(item(r, "cube", "glass", [x, 0.34, -0.62], [0.32, 0.62, 0.045], [0, 0, 0], "laminated glass wind screen"));
    items.push(item(r, "cube", "steel", [x, 0.01, -0.62], [0.035, 0.74, 0.08], [0, 0, 0], "brushed steel rail post"));
  }
  for (let i = 0; i < 9; i += 1) {
    const x = -5.0 + i * 1.25;
    items.push(item(r, "cube", "glass", [x, 0.28, 2.32], [0.78, 0.48, 0.04], [0, 0, 0], "clear wind glass panel"));
    items.push(item(r, "cube", i % 2 ? "steel" : "darkSteel", [x + 0.08, -0.19, 0.08], [0.82, 0.045, 0.2], [0, 0.12, 0], "deck instrumentation rail"));
  }
  for (let i = 0; i < 18; i += 1) {
    const material = i % 6 === 0 ? "white" : "amberGlow";
    items.push(item(r, "cube", material, [-5.15 + i * 0.6, -0.18, 2.52], [0.06, 0.026, 0.18], [0, 0, 0], "warm deck marker light"));
  }
  items.push(item(r, "cube", "darkSteel", [2.25, 0.0, 1.22], [3.05, 0.72, 1.66], [0, -0.08, 0], "observatory equipment plinth"));
  items.push(item(r, "sphere", "glass", [2.25, 0.72, 1.22], [1.62, 0.82, 1.62], [0, time * 0.03, 0], "observatory glazed dome"));
  items.push(item(r, "cylinder", "steel", [2.25, 0.23, 1.22], [1.75, 0.12, 1.75], [0, 0, 0], "observatory circular sill"));
  items.push(item(r, "cube", "steel", [2.25, 1.52, 1.22], [1.45, 0.08, 0.12], [0, -0.08, 0], "observatory roof rib"));
  items.push(item(r, "cube", "steel", [2.25, 1.52, 1.22], [0.12, 0.08, 1.45], [0, -0.08, 0], "observatory roof rib"));
  items.push(item(r, "cube", "glass", [4.12, 0.52, 1.14], [1.26, 0.58, 0.08], [0, -0.28, 0], "observatory control room glass"));
  items.push(item(r, "cube", "darkSteel", [4.2, 0.09, 1.02], [1.48, 0.1, 0.16], [0, -0.28, 0], "observatory service console"));
  items.push(item(r, "cylinder", "steel", [-4.62, 0.94, 1.7], [0.08, 2.22, 0.08], [0, 0, 0], "observatory antenna mast"));
  items.push(item(r, "cube", "steel", [-4.62, 1.92, 1.7], [0.86, 0.035, 0.035], [0, time * 0.24, 0.1], "rotating weather scanner arm"));
  items.push(item(r, "sphere", "amberGlow", [-4.62, 2.12 + Math.sin(time * 1.4) * 0.04, 1.7], [0.13, 0.13, 0.13], [0, 0, 0], "weather beacon"));
  items.push(item(r, "sphere", "amberGlow", [5.4, 2.4 + Math.sin(time) * 0.1, -13.8], [0.58, 0.58, 0.58], [0, 0, 0], "sun reflection source"));
}

function addLabShell(r: Resources, items: RenderItem[], time: number): void {
  items.push(item(r, "cube", "darkSteel", [0, -0.72, 0.16], [5.55, 0.08, 3.2], [0, 0, 0], "lab floor"));
  items.push(item(r, "cube", "graphite", [0, 0.2, -1.54], [5.55, 0.72, 0.07], [0, 0, 0], "lab back wall"));
  items.push(item(r, "cube", "darkSteel", [0, -0.34, -1.32], [5.15, 0.18, 0.34], [0, 0, 0], "workstation"));
  for (let i = 0; i < 7; i += 1) {
    const x = -2.34 + i * 0.78;
    const monitorPulse = 1 + Math.sin(time * 1.3 + i * 0.7) * 0.08;
    items.push(item(r, "cube", "steel", [x, -0.34, -1.18], [0.48, 0.14, 0.2], [0, 0, 0], "workstation"));
    items.push(item(r, "cube", "transparentCyan", [x, 0.1, -1.36], [0.36, 0.2 * monitorPulse, 0.026], [0, 0, 0], "monitor glass"));
    items.push(item(r, "cube", i % 3 === 0 ? "amberGlow" : "cyanGlow", [x, -0.1, -1.0], [0.2, 0.035, 0.034], [0, 0, 0], "lab monitor"));
  }
  for (let i = 0; i < 8; i += 1) {
    const x = -2.46 + i * 0.7;
    items.push(item(r, "lineX", i % 2 ? "transparentAmber" : "transparentCyan", [x, -0.5, -0.98], [0.32, 1, 1], [0, Math.PI / 2, 0], "workstation cable trace"));
  }
  for (let side = -1; side <= 1; side += 2) {
    items.push(item(r, "cube", "graphite", [side * 2.58, -0.1, 0.36], [0.08, 1.0, 2.4], [0, 0, 0], "side cutaway lab rail"));
    items.push(item(r, "cube", "steel", [side * 2.36, -0.46, 1.28], [0.34, 0.2, 0.28], [0, side * 0.18, 0], "side sample cart"));
    items.push(item(r, "cube", side < 0 ? "cyanGlow" : "amberGlow", [side * 2.36, -0.28, 1.28], [0.22, 0.04, 0.18], [0, side * 0.18, 0], "side sample cart"));
  }
}

function addRoboticsFloorDetail(r: Resources, items: RenderItem[], time: number): void {
  const seamCount = 66;
  const seams = new Float32Array(seamCount * 16);
  let seamCursor = 0;
  for (let i = 0; i < 9; i += 1) {
    const x = -1.72 + i * 0.42;
    writeModelMatrix(seams, seamCursor * 16, [x, -0.515, 0.18], [2.86, 1, 1], [0, Math.PI / 2, 0]);
    seamCursor += 1;
  }
  for (let i = 0; i < 6; i += 1) {
    const z = -0.86 + i * 0.34;
    writeModelMatrix(seams, seamCursor * 16, [0.38, -0.512, z], [3.75, 1, 1], [0, 0, 0]);
    seamCursor += 1;
  }
  for (let i = 0; i < 3; i += 1) {
    const x = -1.18 + i * 0.72;
    const z = 1.18 + Math.sin(time * 0.32 + i) * 0.018;
    writeModelMatrix(seams, seamCursor * 16, [x, -0.506, z], [0.22, 1, 1], [0, 0.08, 0]);
    seamCursor += 1;
  }
  for (let i = 0; i < 24; i += 1) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const x = -1.62 + col * 0.48;
    const z = -0.76 + row * 0.74;
    writeModelMatrix(
      seams,
      seamCursor * 16,
      [x, -0.504 + row * 0.002, z],
      [0.24 + (i % 3) * 0.06, 1, 1],
      [0, row % 2 === 0 ? 0.18 : Math.PI / 2 - 0.12, 0]
    );
    seamCursor += 1;
  }
  for (let i = 0; i < 24; i += 1) {
    const col = i % 12;
    const row = Math.floor(i / 12);
    const x = -2.05 + col * 0.38;
    const z = 1.02 + row * 0.42;
    writeModelMatrix(
      seams,
      seamCursor * 16,
      [x, -0.502 + row * 0.004, z],
      [0.18 + (i % 4) * 0.05, 1, 1],
      [0, row === 0 ? 0.08 : Math.PI / 2 - 0.1, 0]
    );
    seamCursor += 1;
  }
  items.push(instancedItem(r, "lineX", "debug", seams.subarray(0, seamCursor * 16), "robotics floor fine detail grid"));

  const boltCount = 9;
  const bolts = new Float32Array(boltCount * 16);
  for (let i = 0; i < boltCount; i += 1) {
    const zone = i % 3;
    const ring = Math.floor(i / 3) % 6;
    const side = Math.floor(i / 9);
    const centerX = zone === 0 ? -0.58 : zone === 1 ? 0.9 : 1.58;
    const centerZ = zone === 0 ? 0.04 : zone === 1 ? 0.16 : 0.96;
    const angle = ring * Math.PI * 0.25 + side * 0.08;
    const radiusX = 0.47 + side * 0.045;
    const radiusZ = 0.39 + side * 0.035;
    writeModelMatrix(bolts, i * 16, [
      centerX + Math.cos(angle) * radiusX,
      -0.498,
      centerZ + Math.sin(angle) * radiusZ
    ], [0.028, 0.01, 0.028], [0, angle, 0]);
  }
  items.push(instancedItem(r, "cube", "steel", bolts, "robotics stage bolt detail"));
}

function addRoboticsWorkstationDetail(r: Resources, items: RenderItem[], time: number): void {
  const traceCount = 16;
  const traces = new Float32Array(traceCount * 16);
  for (let i = 0; i < traceCount; i += 1) {
    const monitor = i % 4;
    const row = Math.floor(i / 4);
    const x = -2.48 + monitor * 0.7;
    const y = -0.01 + row * 0.055;
    const z = -1.395;
    const length = 0.12 + ((i + row) % 4) * 0.045;
    writeModelMatrix(traces, i * 16, [x + (row % 2) * 0.08, y, z], [length, 1, 1], [0, 0, 0]);
  }
  items.push(instancedItem(r, "lineX", "debug", traces, "robotics workstation waveform detail"));

  const chipSegments: Vec3[] = [];
  const chipCount = 180;
  for (let i = 0; i < chipCount; i += 1) {
    const column = i % 30;
    const row = Math.floor(i / 30);
    const blink = 0.86 + Math.sin(time * 1.8 + i * 0.37) * 0.14;
    const x = -2.52 + column * 0.17;
    const y = 0.14 + row * 0.052;
    pushSegment(chipSegments, [x - 0.014 * blink, y, -1.34], [x + 0.014 * blink, y, -1.34]);
  }
  pushLineGroup(r, items, chipSegments, "debug", "robotics workstation status pixel detail");

  const barSegments: Vec3[] = [];
  const barCount = 132;
  for (let i = 0; i < barCount; i += 1) {
    const column = i % 33;
    const row = Math.floor(i / 33);
    const length = 0.07 + ((i + row) % 4) * 0.028;
    const x = -2.5 + column * 0.15;
    const y = -0.03 + row * 0.065;
    pushSegment(barSegments, [x - length * 0.5, y, -1.372], [x + length * 0.5, y, -1.372]);
  }
  pushLineGroup(r, items, barSegments, "debug", "robotics workstation waveform detail");
}

function addRoboticsCalibrationMicroDetail(r: Resources, items: RenderItem[], time: number): void {
  const stageSegments: Vec3[] = [];
  for (let pad = 0; pad < 3; pad += 1) {
    const centerX = pad === 0 ? -0.58 : pad === 1 ? 0.9 : 1.58;
    const centerZ = pad === 0 ? 0.04 : pad === 1 ? 0.16 : 0.96;
    for (let i = 0; i < 72; i += 1) {
      const angle = i * Math.PI * 2 / 72;
      const radiusX = 0.38 + (i % 5) * 0.016;
      const radiusZ = 0.32 + (i % 7) * 0.012;
      const x = centerX + Math.cos(angle) * radiusX;
      const z = centerZ + Math.sin(angle) * radiusZ;
      const length = 0.035 + (i % 4) * 0.012;
      pushSegment(
        stageSegments,
        [x - Math.cos(angle) * length, -0.492, z - Math.sin(angle) * length],
        [x + Math.cos(angle + 0.16) * length, -0.492, z + Math.sin(angle + 0.16) * length]
      );
    }
  }
  pushLineGroup(r, items, stageSegments, "debug", "robotics optical calibration micro-ticks");

  const rigSegments: Vec3[] = [];
  for (let i = 0; i < 144; i += 1) {
    const column = i % 36;
    const row = Math.floor(i / 36);
    const x = -2.38 + column * 0.135;
    const y = 0.38 + row * 0.085 + Math.sin(time * 0.7 + i * 0.29) * 0.006;
    const z = row % 2 === 0 ? -1.455 : -1.405;
    const length = 0.05 + (i % 6) * 0.01;
    pushSegment(rigSegments, [x - length * 0.5, y, z], [x + length * 0.5, y + 0.018, z]);
  }
  pushLineGroup(r, items, rigSegments, "transparentCyan", "robotics inspection monitor micro-traces");
}

function addRobot(r: Resources, items: RenderItem[], origin: Vec3, time: number, glow: string, label: string, scale = 1): void {
  const [x, y, z] = origin;
  const shoulder = Math.sin(time * 1.2) * 0.55;
  const elbow = Math.cos(time * 1.4) * 0.45;
  items.push(item(r, "cylinder", "steel", [x, y + 0.28 * scale, z], [0.28 * scale, 0.56 * scale, 0.28 * scale], [0, time * 0.35, 0], `${label} base`));
  items.push(item(r, "sphere", glow, [x, y + 0.72 * scale, z], [0.32 * scale, 0.32 * scale, 0.32 * scale], [0, 0, 0], `${label} joint`));
  items.push(item(r, "capsule", "titanium", [x + Math.sin(shoulder) * 0.42 * scale, y + 1.15 * scale, z + Math.cos(shoulder) * 0.42 * scale], [0.22 * scale, 0.82 * scale, 0.22 * scale], [0.8, shoulder, 0.25], `${label} upper arm`));
  items.push(item(r, "capsule", "graphite", [x + Math.sin(shoulder + elbow) * 0.78 * scale, y + 1.35 * scale, z + Math.cos(shoulder + elbow) * 0.78 * scale], [0.18 * scale, 0.72 * scale, 0.18 * scale], [1.1, shoulder + elbow, 0.42], `${label} forearm`));
  items.push(item(r, "cube", glow, [x + Math.sin(shoulder + elbow) * 1.06 * scale, y + (1.05 + Math.sin(time) * 0.1) * scale, z + Math.cos(shoulder + elbow) * 1.06 * scale], [0.34 * scale, 0.1 * scale, 0.16 * scale], [0, shoulder + elbow, 0], `${label} gripper`));
}

function addActorClipBadge(r: Resources, items: RenderItem[], x: number, z: number, actorHeight: number, time: number, stageIndex: number, active: boolean): void {
  const material = active ? "greenGlow" : stageIndex === 2 ? "amberGlow" : "cyanGlow";
  const y = -0.38 + actorHeight * 0.98;
  const wave = Math.sin(time * (1.2 + stageIndex * 0.18));
  items.push(item(r, "cube", "graphite", [x - 0.42, y + 0.06, z - 0.66], [0.34, 0.14, 0.03], [0, 0.24, 0], "selected entity label plate"));
  items.push(item(r, "cube", material, [x - 0.5, y + 0.095, z - 0.635], [0.08 + Math.abs(wave) * 0.028, 0.026, 0.022], [0, 0.24, 0], "selected entity clip label"));
  items.push(item(r, "cube", material, [x - 0.37, y + 0.06, z - 0.635], [0.13, 0.022, 0.022], [0, 0.24, 0], "selected entity clip label"));
  items.push(item(r, "lineX", "transparentCyan", [x - 0.16, y - 0.08, z - 0.48], [0.34, 1, 1], [0, -0.58, -0.28], "selected entity label tether"));
}

function addActorGroundingReticle(r: Resources, items: RenderItem[], x: number, z: number, time: number, active: boolean): void {
  const material = active ? "transparentGreen" : "transparentCyan";
  const pulse = 1 + Math.sin(time * 2.1 + x) * 0.025;
  items.push(item(r, "lineX", material, [x, -0.492, z - 0.34], [0.38 * pulse, 1, 1], [0, 0, 0], "robotics actor grounding reticle"));
  items.push(item(r, "lineX", material, [x, -0.492, z + 0.34], [0.38 * pulse, 1, 1], [0, 0, 0], "robotics actor grounding reticle"));
  items.push(item(r, "lineX", material, [x - 0.24, -0.491, z], [0.54 * pulse, 1, 1], [0, Math.PI / 2, 0], "robotics actor grounding reticle"));
  items.push(item(r, "lineX", material, [x + 0.24, -0.491, z], [0.54 * pulse, 1, 1], [0, Math.PI / 2, 0], "robotics actor grounding reticle"));
}

function addRoboticsTimelineConsole(r: Resources, items: RenderItem[], time: number, stateName: string, playing: boolean, follow: boolean): void {
  const activeStage = roboticsStateStageIndex(stateName);
  items.push(item(r, "cube", "graphite", [-0.3, -0.44, 1.48], [2.95, 0.08, 0.34], [0, 0, 0], "robotics timeline console"));
  items.push(item(r, "cube", playing ? "greenGlow" : "amberGlow", [-1.58, -0.34, 1.36], [0.18, 0.06, 0.05], [0, 0, 0], "play pause control indicator"));
  items.push(item(r, "cube", follow ? "cyanGlow" : "transparentCyan", [1.08, -0.34, 1.36], [0.22, 0.06, 0.05], [0, 0, 0], "follow camera control indicator"));
  for (let i = 0; i < 4; i += 1) {
    const active = i === activeStage || (stateName === "training" && i === 1);
    items.push(item(r, "cube", active ? "greenGlow" : "transparentCyan", [-0.9 + i * 0.42, -0.34, 1.36], [0.24, 0.05, 0.05], [0, 0, 0], "clip switch control indicator"));
  }
  const playhead = ((time % 12) / 12) * 2.44 - 1.22;
  items.push(item(r, "cube", "amberGlow", [playhead, -0.302, 1.55], [0.06, 0.11, 0.07], [0, time * 0.18, 0], "timeline scrub control indicator"));
}

function addFollowCameraRig(r: Resources, items: RenderItem[], time: number, activeStage: number): void {
  const actorGuides: readonly [number, number, number][] = [
    [-0.58, 0.04, 1.94],
    [0.9, 0.16, 1.42],
    [1.58, 0.96, 1.04]
  ];
  const [x, z, height] = actorGuides[activeStage] ?? actorGuides[0]!;
  const bob = Math.sin(time * 1.4) * 0.025;
  items.push(item(r, "cube", "transparentAmber", [x - 0.64, 1.16 + bob, z + 0.74], [0.28, 0.16, 0.035], [0.12, -0.55, 0.05], "robotics follow camera body"));
  items.push(item(r, "lineX", "transparentAmber", [x - 0.43, 1.02 + bob, z + 0.52], [0.55, 1, 1], [0, -0.72, -0.25], "robotics follow camera sightline"));
  items.push(item(r, "lineX", "transparentAmber", [x - 0.22, 0.86 + height * 0.03 + bob, z + 0.28], [0.48, 1, 1], [0, -0.62, -0.2], "robotics follow camera sightline"));
  items.push(item(r, "sphere", "amberGlow", [x, -0.34 + height * 0.82, z - 0.1], [0.055, 0.055, 0.055], [0, 0, 0], "robotics follow camera target"));
}

function addCathedralAtmosphere(r: Resources, items: RenderItem[], time: number, fog: number, sun: number, beams: boolean): void {
  const haze = clamp(fog, 0, 1);
  const hazeTransforms = new Float32Array(7 * 16);
  let hazeCount = 0;
  const depthLobes: readonly Vec3[] = [
    [0, 0.02, 2.82],
    [-1.45, 0.24, 1.18],
    [1.42, 0.32, -0.08],
    [0, 0.58, -1.62],
    [-0.9, 0.88, -3.25],
    [0.94, 1.08, -4.85],
    [0, 1.28, -6.35]
  ];
  for (let i = 0; i < depthLobes.length; i += 1) {
    const [x, y, z] = depthLobes[i]!;
    const depth = i / Math.max(1, depthLobes.length - 1);
    const width = 2.8 - depth * 0.64 + haze * 0.38;
    const height = 0.12 + haze * 0.18 + depth * 0.07;
    const length = 0.22 + depth * 0.16;
    writeModelMatrix(hazeTransforms, hazeCount * 16, [x, y + Math.sin(time * 0.14 + i) * 0.018, z], [width, height, length], [0, Math.sin(i * 1.37) * 0.08, 0.04 * Math.cos(time * 0.08 + i)]);
    hazeCount += 1;
  }
  items.push(instancedItem(r, "sphere", "fogVeil", hazeTransforms.subarray(0, hazeCount * 16), "foreground midground background haze lobes"));

  const shadowTransforms = new Float32Array(8 * 16);
  let shadowCount = 0;
  for (let i = 0; i < 8; i += 1) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    const z = 3.55 - row * 2.35;
    const y = 0.78 + row * 0.18;
    const radius = 0.12 + haze * 0.05 + row * 0.01;
    writeModelMatrix(shadowTransforms, shadowCount * 16, [side * (3.55 - row * 0.16), y, z], [radius, 1.82 + row * 0.36, radius * 0.74], [0, side * (0.1 + row * 0.02), 0]);
    shadowCount += 1;
  }
  items.push(instancedItem(r, "cylinder", "fogShadow", shadowTransforms.subarray(0, shadowCount * 16), "foreground crop mask columns"));

  if (beams) {
    const shaftTransforms = new Float32Array(6 * 16);
    let shaftCount = 0;
    for (let i = 0; i < 6; i += 1) {
      const depth = i / 5;
      const aperture = (i % 3) - 1;
      const x = aperture * 1.08 + depth * 0.42 + sun * 0.28;
      const z = -7.12 + i * 1.48;
      const sway = Math.sin(time * 0.16 + i * 0.9) * 0.035;
      const radius = 0.095 + haze * 0.055 + (i % 2) * 0.014;
      const length = 1.02 - depth * 0.24;
      writeModelMatrix(shaftTransforms, shaftCount * 16, [x, 2.08 - depth * 0.28, z], [radius, length, radius * 0.7], [0.62 - depth * 0.1, sun * 0.42 + i * 0.04 + sway, 0.12]);
      shaftCount += 1;
    }
    items.push(instancedItem(r, "capsule", "beam", shaftTransforms.subarray(0, shaftCount * 16), "aperture-local shaft proxy"));
  }
}

function addCathedralArchitecturalDetail(r: Resources, items: RenderItem[], time: number, fog: number): void {
  const hazeStrength = clamp(fog, 0, 1);
  const fineTracery: Vec3[] = [];
  const floorAmber = new Float32Array(30 * 16);
  const floorCyan = new Float32Array(10 * 16);
  const ribWire = new Float32Array(32 * 16);
  const ribCyan = new Float32Array(20 * 16);
  const glassCyan = new Float32Array(28 * 16);
  const glassAmber = new Float32Array(14 * 16);
  const glassGreen = new Float32Array(12 * 16);
  const glassViolet = new Float32Array(8 * 16);
  let floorAmberCount = 0;
  let floorCyanCount = 0;
  let ribWireCount = 0;
  let ribCyanCount = 0;
  let glassCyanCount = 0;
  let glassAmberCount = 0;
  let glassGreenCount = 0;
  let glassVioletCount = 0;

  for (let i = 0; i < 30; i += 1) {
    const z = 1.58 - i * 0.18;
    const width = 3.28 - Math.min(1.5, i * 0.035);
    writeModelMatrix(floorAmber, floorAmberCount * 16, [0, -0.768 + (i % 2) * 0.003, z], [width, 1, 1], [0, 0, 0],);
    floorAmberCount += 1;
  }
  for (let lane = 0; lane < 8; lane += 1) {
    const x = -1.62 + lane * 0.46;
    writeModelMatrix(floorCyan, floorCyanCount * 16, [x, -0.758, -0.88], [4.92, 1, 1], [0, Math.PI / 2, 0]);
    floorCyanCount += 1;
  }
  for (let bay = 0; bay < 7; bay += 1) {
    const z = 1.38 - bay * 0.62;
    for (const side of [-1, 1] as const) {
      writeModelMatrix(ribWire, ribWireCount * 16, [side * 2.18, 0.6 + bay * 0.035, z], [0.78, 1, 1], [0, Math.PI / 2, 0.8 * side]);
      ribWireCount += 1;
      writeModelMatrix(ribWire, ribWireCount * 16, [side * 1.58, 1.38 + bay * 0.03, z - 0.12], [1.05, 1, 1], [0, Math.PI / 2, 0.48 * side]);
      ribWireCount += 1;
      writeModelMatrix(ribCyan, ribCyanCount * 16, [side * 0.82, 2.02, z - 0.16], [0.76, 1, 1], [0, Math.PI / 2, 0.24 * side + Math.sin(time * 0.08 + bay) * 0.015]);
      ribCyanCount += 1;
    }
  }

  for (let i = 0; i < 48; i += 1) {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const window = row % 3;
    const x = -1.58 + col * 0.39 + Math.sin(row * 1.7) * 0.03;
    const y = 0.16 + window * 0.46 + (row % 2) * 0.08 + hazeStrength * 0.025;
    const z = -3.06 + window * 0.34 + Math.cos(col * 0.7) * 0.02;
    const scale: Vec3 = [0.12 + (i % 3) * 0.025, 0.03, 0.014];
    const rotation: Vec3 = [0.02, 0.05 * Math.sin(i), 0.12 * Math.cos(i * 0.4)];
    if (i % 6 === 0) {
      writeModelMatrix(glassViolet, glassVioletCount * 16, [x, y, z], scale, rotation);
      glassVioletCount += 1;
    } else if (i % 5 === 0) {
      writeModelMatrix(glassGreen, glassGreenCount * 16, [x, y, z], scale, rotation);
      glassGreenCount += 1;
    } else if (i % 3 === 0) {
      writeModelMatrix(glassAmber, glassAmberCount * 16, [x, y, z], scale, rotation);
      glassAmberCount += 1;
    } else {
      writeModelMatrix(glassCyan, glassCyanCount * 16, [x, y, z], scale, rotation);
      glassCyanCount += 1;
    }
  }

  for (let i = 0; i < 140; i += 1) {
    const bay = Math.floor(i / 20);
    const col = i % 20;
    const side = col % 2 === 0 ? -1 : 1;
    const x = side * (0.54 + (col % 10) * 0.145);
    const y = 0.62 + (col % 5) * 0.18 + bay * 0.035;
    const z = 1.08 - bay * 0.58 + Math.sin(i * 0.41 + time * 0.04) * 0.018;
    pushSegment(fineTracery, [x, y, z], [x + side * 0.22, y + 0.16, z - 0.08]);
    if (i % 4 === 0) {
      pushSegment(fineTracery, [x - side * 0.06, y + 0.05, z - 0.02], [x + side * 0.12, y - 0.09, z - 0.12]);
    }
  }

  items.push(instancedItem(r, "lineX", "transparentAmber", floorAmber.subarray(0, floorAmberCount * 16), "cathedral floor seam detail"));
  items.push(instancedItem(r, "lineX", "transparentCyan", floorCyan.subarray(0, floorCyanCount * 16), "cathedral floor seam detail"));
  items.push(instancedItem(r, "lineX", "wire", ribWire.subarray(0, ribWireCount * 16), "cathedral rib tracery detail"));
  items.push(instancedItem(r, "lineX", "transparentCyan", ribCyan.subarray(0, ribCyanCount * 16), "cathedral rib tracery detail"));
  pushLineGroup(r, items, fineTracery, "debug", "cathedral rib tracery detail");
  items.push(instancedItem(r, "cube", "cyanGlow", glassCyan.subarray(0, glassCyanCount * 16), "stained glass color shard"));
  items.push(instancedItem(r, "cube", "amberGlow", glassAmber.subarray(0, glassAmberCount * 16), "stained glass color shard"));
  items.push(instancedItem(r, "cube", "greenGlow", glassGreen.subarray(0, glassGreenCount * 16), "stained glass color shard"));
  items.push(instancedItem(r, "cube", "violetGlow", glassViolet.subarray(0, glassVioletCount * 16), "stained glass color shard"));
  items.push(item(r, "cube", "fogShadow", [0, 1.22, -3.18], [3.8, 1.92, 0.035], [0.03, 0, 0], "cathedral apse shadow relief"));
  items.push(item(r, "lineX", "transparentAmber", [0, 1.98 + Math.sin(time * 0.2) * 0.02, -3.22], [2.28, 1, 1], [0, 0, 0.02], "cathedral apse shadow relief"));
}

function addCathedralExposureGuides(r: Resources, items: RenderItem[], time: number): void {
  for (let i = 0; i < 6; i += 1) {
    items.push(item(r, "lineX", i % 2 ? "transparentAmber" : "transparentCyan", [-2.8 + i * 1.12, -0.78, -1.05], [0.38, 1, 1], [0, Math.PI / 2, 0], "cathedral exposure guide"));
    items.push(item(r, "lineX", "wire", [-2.7 + i * 1.05, 1.2 + Math.sin(time * 0.2 + i) * 0.04, -5.5], [0.42, 1, 1], [0, time * 0.08 + i * 0.12, 0.16], "cathedral exposure guide"));
  }
}

export function addParticleHalo(r: Resources, items: RenderItem[], material: string, count: number, time: number, radius: number, height: number): void {
  for (let i = 0; i < count; i += 1) {
    const a = i * 2.399 + time * (0.2 + (i % 5) * 0.02);
    const rr = radius * Math.sqrt(hash01(i));
    items.push(item(r, i % 3 ? "sphere" : "cube", material, [Math.cos(a) * rr, -0.3 + hash01(i * 7) * height, Math.sin(a) * rr], [0.025, 0.025, 0.025], [0, 0, 0], "particle mote"));
  }
}

function addBoundsGrid(r: Resources, items: RenderItem[], width: number, depth: number): void {
  for (let i = -6; i <= 6; i += 1) {
    items.push(item(r, "lineX", "wire", [0, 0.03, i * depth / 12], [width, 1, 1], [0, 0, 0], "debug grid"));
    items.push(item(r, "lineX", "wire", [i * width / 12, 0.04, 0], [depth, 1, 1], [0, Math.PI / 2, 0], "debug grid"));
  }
}

function addNetworkLines(r: Resources, items: RenderItem[], time: number): void {
  for (let i = 0; i < 22; i += 1) {
    const a = i * 0.57 + time * 0.15;
    items.push(item(r, "lineX", "wire", [Math.cos(a) * 1.5, Math.sin(a * 0.8), Math.sin(a) * 1.5], [1.1 + (i % 4) * 0.3, 1, 1], [0, a, Math.sin(a) * 0.4], "cluster connection"));
  }
}

function addSkeletonLines(r: Resources, items: RenderItem[], time: number): void {
  const actorGuides: readonly [number, number, number][] = [
    [-0.58, 0.04, 1.94],
    [0.9, 0.16, 1.42],
    [1.58, 0.96, 1.04]
  ];
  for (let i = 0; i < actorGuides.length; i += 1) {
    const [x, z, height] = actorGuides[i]!;
    items.push(item(r, "lineX", "wire", [x, -0.36 + height * 0.58, z], [0.72, 1, 1], [0, Math.sin(time + i) * 0.42, 0.5], "skeleton path no IK"));
    items.push(item(r, "lineX", "wire", [x, -0.36 + height * 0.78, z - 0.04], [0.56, 1, 1], [0, Math.cos(time + i) * 0.5, 1.05], "skeleton path no IK"));
  }
}

function roboticsStateStageIndex(stateName: string): number {
  if (stateName === "handoff") return 2;
  if (stateName === "inspect") return 1;
  return 0;
}

function roboticsSelectedActorLabel(selected: string, stateName: string): string {
  const normalized = selected.toLowerCase();
  if (normalized.includes("secondary") || normalized.includes("operator") || normalized.includes("handoff") || stateName === "handoff") return "secondary robot 3";
  if (normalized.includes("expressive") || normalized.includes("primary") || normalized.includes("dance") || stateName === "inspect") return "primary robot 2";
  return "soldier robot 1";
}

export function getPointCloud(r: Resources, formation: string, count: number, turbulence: number): Geometry {
  const key = `${formation}:${count}:${turbulence.toFixed(2)}`;
  const cached = r.pointClouds.get(key);
  if (cached) return cached;
  const positions: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = hash01(i);
    const v = hash01(i * 11);
    const w = hash01(i * 29);
    let x = 0, y = 0, z = 0;
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

function appendCueInstance(
  batches: Map<string, CueInstanceBatch>,
  geometry: "cube" | "lineX",
  material: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3,
  label: string
): void {
  const key = `${geometry}:${material}:${label}`;
  let batch = batches.get(key);
  if (!batch) {
    batch = {
      geometry,
      material,
      label,
      transforms: new Float32Array(512 * 16),
      count: 0
    };
    batches.set(key, batch);
  }
  if ((batch.count + 1) * 16 > batch.transforms.length) return;
  writeModelMatrix(batch.transforms, batch.count * 16, position, scale, rotation);
  batch.count += 1;
}

function flushCueBatches(r: Resources, items: RenderItem[], batches: Map<string, CueInstanceBatch>): void {
  for (const batch of batches.values()) {
    if (batch.count <= 0) continue;
    items.push(instancedItem(
      r,
      batch.geometry,
      batch.material,
      batch.transforms.subarray(0, batch.count * 16),
      batch.label
    ));
  }
}

export function appendEvidencePayload(r: Resources, items: RenderItem[], evidence: RouteEvidencePayload): void {
  for (const batch of evidence.batches) {
    if (batch.count <= 0) continue;
    items.push(instancedItem(r, batch.geometry, batch.material, activeSlice(batch), batch.label));
  }
  for (const single of evidence.singles) {
    items.push(item(r, single.geometry, single.material, single.position, single.scale, single.rotation, single.label));
  }
}

function appendSmartCityEvidence(r: Resources, items: RenderItem[], evidence: SmartCityRouteEvidence): void {
  for (const batch of evidence.instanceBatches) {
    if (batch.count <= 0) continue;
    items.push(instancedItem(r, batch.geometry, batch.material, batch.transforms, batch.label));
  }
  for (const group of evidence.lineGroups) {
    if (group.positions.length < 2) continue;
    items.push({ geometry: Geometry.lineSegments(group.positions), material: mat(r, group.material), label: group.label });
  }
  for (const group of evidence.pointGroups) {
    if (group.positions.length === 0) continue;
    items.push({ geometry: Geometry.points(group.positions), material: mat(r, group.material), label: group.label });
  }
  for (const single of evidence.singles) {
    items.push(item(r, single.geometry, single.material, single.position, single.scale, single.rotation, single.label));
  }
}

function withEnvironmentFog(frame: SceneFrame, environmentFog: RendererEnvironmentFogEvidence): SceneFrame {
  return {
    ...frame,
    environmentFog
  };
}

function waveHeight(x: number, z: number, time: number, ripples: readonly Ripple[], intensity: number): number {
  return evaluateWaterLabHeight(x, z, time, ripples, intensity);
}

function createAnimatedWaterMesh(segments: number, width: number, depth: number, time: number, ripples: readonly Ripple[], intensity: number): Geometry {
  const verticesPerSide = segments + 1;
  const vertices = new VertexBuffer(VertexFormat.P3N3, verticesPerSide * verticesPerSide);
  const indices: number[] = [];
  const dx = width / segments;
  const dz = depth / segments;
  let cursor = 0;
  for (let z = 0; z <= segments; z += 1) {
    const pz = (z / segments - 0.5) * depth;
    for (let x = 0; x <= segments; x += 1) {
      const px = (x / segments - 0.5) * width;
      const h = waveHeight(px, pz, time, ripples, intensity);
      const hx = waveHeight(px + dx, pz, time, ripples, intensity) - waveHeight(px - dx, pz, time, ripples, intensity);
      const hz = waveHeight(px, pz + dz, time, ripples, intensity) - waveHeight(px, pz - dz, time, ripples, intensity);
      const normal = normalized([-hx / Math.max(dx * 2, 0.0001), 1, -hz / Math.max(dz * 2, 0.0001)]);
      vertices.setAttribute(cursor, "position", [px, h, pz]);
      vertices.setAttribute(cursor, "normal", normal);
      cursor += 1;
    }
  }
  for (let z = 0; z < segments; z += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = z * verticesPerSide + x;
      const b = a + 1;
      const c = a + verticesPerSide;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return new Geometry(vertices, new IndexBuffer(indices, vertices.vertexCount), "triangles", bounds([-width / 2, -0.32, -depth / 2], [width / 2, 0.32, depth / 2]));
}

function createOceanSurfaceMesh(segments: number, width: number, depth: number, profile: OceanRouteProfile): Geometry {
  const verticesPerSide = segments + 1;
  const vertices = new VertexBuffer(VertexFormat.P3N3, verticesPerSide * verticesPerSide);
  const indices: number[] = [];
  const dx = width / segments;
  const dz = depth / segments;
  let cursor = 0;
  for (let z = 0; z <= segments; z += 1) {
    const pz = (z / segments - 0.5) * depth;
    for (let x = 0; x <= segments; x += 1) {
      const px = (x / segments - 0.5) * width;
      const h = oceanHeight(px, pz, profile);
      const hx = oceanHeight(px + dx, pz, profile) - oceanHeight(px - dx, pz, profile);
      const hz = oceanHeight(px, pz + dz, profile) - oceanHeight(px, pz - dz, profile);
      vertices.setAttribute(cursor, "position", [px, h, pz]);
      vertices.setAttribute(cursor, "normal", normalized([-hx / Math.max(dx * 2, 0.0001), 1, -hz / Math.max(dz * 2, 0.0001)]));
      cursor += 1;
    }
  }
  for (let z = 0; z < segments; z += 1) {
    for (let x = 0; x < segments; x += 1) {
      const a = z * verticesPerSide + x;
      const b = a + 1;
      const c = a + verticesPerSide;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return new Geometry(vertices, new IndexBuffer(indices, vertices.vertexCount), "triangles", bounds([-width / 2, -0.78, -depth / 2], [width / 2, 0.78, depth / 2]));
}

function oceanHeight(x: number, z: number, profile: OceanRouteProfile): number {
  return evaluateOceanProfileHeight(profile, x, z);
}

function addOceanReflections(
  r: Resources,
  items: RenderItem[],
  time: number,
  profile: OceanRouteProfile,
  layers: GalleryWaterVisualLayerSet
): void {
  const batches = new Map<string, CueInstanceBatch>();
  for (const cue of layers.surfaceCues) {
    const isReflection = cue.kind === "specular-glint" || cue.kind === "horizon-band" || cue.kind === "depth-band";
    const material = isReflection
      ? cue.intensity > 0.56 ? "transparentAmber" : "transparentCyan"
      : cue.kind === "spray-card"
        ? "white"
        : "transparentCyan";
    const label = isReflection ? "low sun reflection streak" : "subtle foam crest";
    const geometry = cue.kind === "spray-card" || cue.kind === "depth-band" ? "cube" : "lineX";
    if (geometry === "cube") {
      appendCueInstance(
        batches,
        "cube",
        material,
        [cue.x, cue.y + 0.04, cue.z],
        [cue.length, Math.max(0.008, cue.thickness * 0.48), cue.thickness],
        [0, cue.rotation, 0],
        label
      );
    } else {
      appendCueInstance(
        batches,
        "lineX",
        material,
        [cue.x, cue.y + 0.045, cue.z],
        [cue.length, 1, 1],
        [0, cue.rotation, 0],
        label
      );
    }
  }
  flushCueBatches(r, items, batches);
  for (let i = 0; i < 16; i += 1) {
    const lane = i - 8;
    const z = -25.8 + i * 0.92;
    const x = Math.sin(i * 0.64 + time * 0.12) * 1.1 + lane * 0.05;
    const h = oceanHeight(x, z + 13.2, profile);
    const width = 0.24 + Math.max(0, Math.sin(i * 1.21 + time * 0.24)) * 0.64;
    const material = i % 6 === 0 ? "transparentAmber" : "transparentCyan";
    items.push(item(r, "lineX", material, [x, -0.12 + h + i * 0.0008, z], [width, 1, 1], [0, -0.16 + Math.sin(i) * 0.06, 0], "low sun reflection streak"));
  }
  for (let i = 0; i < profile.telemetry.foamPatches.length; i += 1) {
    const patch = profile.telemetry.foamPatches[i]!;
    const x = patch.x * 7.5 + Math.sin(i * 1.9 + time * 0.18) * 0.45;
    const z = -23.8 + i * 1.1 + patch.z * 2.4;
    const h = oceanHeight(x, z + 13.2, profile);
    items.push(item(r, "lineX", "transparentCyan", [x, -0.07 + h, z], [0.26 + patch.radius * 2.8, 1, 1], [0, -0.26 + patch.intensity * 0.22, 0], "subtle foam crest"));
  }
  for (let i = 0; i < 6; i += 1) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const z = -19.2 + row * 2.55 + Math.sin(i * 1.7 + time * 0.1) * 0.12;
    const x = -5.8 + col * 4.3 + Math.sin(i * 0.83 + time * 0.12) * 0.22;
    const h = oceanHeight(x, z + 13.2, profile);
    const material = row % 2 === 0 ? "transparentCyan" : "transparentAmber";
    items.push(item(r, "lineX", material, [x, -0.055 + h, z], [0.28 + hash01(i * 37) * 0.32, 1, 1], [0, -0.36 + Math.sin(i) * 0.18, 0], "subtle foam crest"));
  }
}

function addOceanFloatingObjects(r: Resources, items: RenderItem[], layers: GalleryWaterVisualLayerSet, time: number): void {
  for (const object of layers.floatingObjects) {
    if (object.kind === "ocean-drone") {
      const material = object.intensity > 0.62 ? "amberGlow" : "white";
      items.push(item(
        r,
        "capsule",
        material,
        [object.x, object.y, object.z],
        [0.18 * object.scale, 0.68 * object.scale, 0.18 * object.scale],
        [Math.PI / 2 + object.pitch, object.heading, object.roll],
        "patrol drone"
      ));
      items.push(item(
        r,
        "sphere",
        "cyanGlow",
        [
          object.x + Math.sin(object.heading) * 0.26 * object.scale,
          object.y + 0.04,
          object.z + Math.cos(object.heading) * 0.26 * object.scale
        ],
        [0.055 * object.scale, 0.055 * object.scale, 0.055 * object.scale],
        [0, 0, 0],
        "patrol drone"
      ));
      items.push(item(
        r,
        "lineX",
        "transparentAmber",
        [
          object.x - Math.sin(object.heading) * 0.38 * object.scale,
          object.y - 0.24 + Math.sin(time * 0.5) * 0.04,
          object.z - Math.cos(object.heading) * 0.38 * object.scale
        ],
        [object.wakeLength, 1, 1],
        [0, object.heading + Math.PI * 0.5, 0],
        "drone navigation glint"
      ));
      continue;
    }

    const material = object.intensity > 0.58 ? "cyanGlow" : "amberGlow";
    items.push(item(
      r,
      "sphere",
      material,
      [object.x, object.y + 0.12 * object.scale, object.z],
      [0.14 * object.scale, 0.14 * object.scale, 0.14 * object.scale],
      [object.pitch, object.heading, object.roll],
      "patrol drone"
    ));
    items.push(item(
      r,
      "cylinder",
      "darkSteel",
      [object.x, object.y - 0.03, object.z],
      [0.025 * object.scale, 0.28 * object.scale, 0.025 * object.scale],
      [0, object.heading, 0],
      "patrol drone"
    ));
    items.push(item(
      r,
      "lineX",
      "transparentCyan",
      [
        object.x - Math.sin(object.heading) * 0.22,
        object.y + 0.035,
        object.z - Math.cos(object.heading) * 0.22
      ],
      [object.wakeLength, 1, 1],
      [0, object.heading + Math.PI * 0.5, 0],
      "subtle foam crest"
    ));
  }
}

function addOceanDetailOverlays(r: Resources, items: RenderItem[], time: number, profile: OceanRouteProfile): void {
  const deckLines: Vec3[] = [];
  const railLines: Vec3[] = [];
  const horizonLines: Vec3[] = [];
  const crispInstrumentLines: Vec3[] = [];
  const foamLines: Vec3[] = [];
  const foamSlivers: FlatSliver[] = [];
  const brightFoamSlivers: FlatSliver[] = [];
  const detailBatches = new Map<string, CueInstanceBatch>();

  for (let i = 0; i < 144; i += 1) {
    const col = i % 16;
    const row = Math.floor(i / 16);
    pushPlanarLine(deckLines, [-5.25 + col * 0.68, -0.13 + row * 0.012, 2.22 - row * 0.56], 0.5, 0.02 * Math.sin(i));
    appendCueInstance(
      detailBatches,
      "cube",
      row % 2 === 0 ? "transparentCyan" : "transparentAmber",
      [-5.22 + col * 0.68, -0.105 + row * 0.012, 2.18 - row * 0.56],
      [0.32 + hash01(i * 17) * 0.12, 0.008, 0.016],
      [0, 0.02 * Math.sin(i * 0.29), 0],
      "drone navigation glint"
    );
  }

  for (let i = 0; i < 84; i += 1) {
    const x = -5.62 + (i % 42) * 0.27;
    const y = 0.34 + Math.floor(i / 42) * 0.32 + (i % 3) * 0.035;
    pushPlanarLine(railLines, [x, y, -0.58], 0.52, 0.02);
    if (i % 4 === 0) {
      pushSegment(railLines, [x, 0.18, -0.62], [x + 0.18, 0.78, -0.58]);
    }
  }

  for (let i = 0; i < 164; i += 1) {
    const row = Math.floor(i / 41);
    const x = -8.45 + (i % 41) * 0.42;
    const z = -28.4 + row * 1.72 + Math.sin(i * 0.47 + time * 0.08) * 0.28;
    pushPlanarLine(
      horizonLines,
      [x, -0.18 + oceanHeight(x, z + 13.2, profile) * 0.14, z],
      0.34 + hash01(i * 41) * 0.54,
      -0.08 + Math.sin(i * 0.24) * 0.14
    );
  }

  for (let i = 0; i < 340; i += 1) {
    const x = -8.4 + (i % 34) * 0.5;
    const z = -19.4 + Math.floor(i / 34) * 2.36 + Math.sin(i * 0.63 + time * 0.16) * 0.45;
    const h = oceanHeight(x, z + 13.2, profile);
    const length = 0.28 + hash01(i * 43) * 0.46;
    const yaw = -0.24 + Math.sin(i * 0.31) * 0.32;
    pushPlanarLine(foamLines, [x, -0.09 + h, z], length, yaw);
    (i % 9 === 0 ? brightFoamSlivers : foamSlivers).push({
      center: [x + Math.sin(i * 0.78) * 0.12, -0.068 + h, z + Math.cos(i * 0.51) * 0.12],
      length: length * 0.72,
      thickness: 0.018 + hash01(i * 67) * 0.018,
      yaw
    });
    if (i % 4 !== 1) {
      appendCueInstance(
        detailBatches,
        "cube",
        i % 8 === 0 ? "white" : "transparentCyan",
        [x + Math.sin(i * 0.78) * 0.16, -0.075 + h, z + Math.cos(i * 0.51) * 0.18],
        [0.18 + hash01(i * 59) * 0.28, 0.008, 0.016 + hash01(i * 67) * 0.016],
        [0, -0.22 + Math.sin(i * 0.37 + time * 0.09) * 0.28, 0],
        "subtle foam crest"
      );
    }
  }

  for (let i = 0; i < 120; i += 1) {
    const row = Math.floor(i / 30);
    const x = -7.85 + (i % 30) * 0.54 + Math.sin(i * 0.52 + time * 0.08) * 0.1;
    const z = -8.4 + row * 2.85 + Math.cos(i * 0.67 + time * 0.11) * 0.34;
    const h = oceanHeight(x, z + 13.2, profile);
    const yaw = -0.18 + Math.sin(i * 0.23 + row) * 0.28;
    const length = 0.42 + hash01(i * 79) * 0.64;
    pushPlanarLine(foamLines, [x, -0.07 + h, z], length, yaw);
    (i % 6 === 0 ? brightFoamSlivers : foamSlivers).push({
      center: [x + Math.cos(i * 0.31) * 0.1, -0.05 + h, z + Math.sin(i * 0.37) * 0.1],
      length: length * 0.68,
      thickness: 0.02 + hash01(i * 89) * 0.018,
      yaw
    });
    appendCueInstance(
      detailBatches,
      "cube",
      i % 6 === 0 ? "white" : "transparentCyan",
      [x + Math.cos(i * 0.31) * 0.12, -0.058 + h, z + Math.sin(i * 0.37) * 0.12],
      [0.26 + hash01(i * 83) * 0.34, 0.008, 0.018 + hash01(i * 89) * 0.02],
      [0, yaw, 0],
      "subtle foam crest"
    );
  }

  for (let i = 0; i < 96; i += 1) {
    const row = Math.floor(i / 32);
    const col = i % 32;
    const x = -7.6 + col * 0.5 + Math.sin(i * 0.41 + time * 0.07) * 0.08;
    const z = -5.8 + row * 1.7 + Math.cos(i * 0.53 + time * 0.09) * 0.18;
    const h = oceanHeight(x, z + 13.2, profile);
    const yaw = -0.08 + Math.sin(i * 0.29 + row * 0.37) * 0.18;
    const length = 0.22 + hash01(i * 101) * 0.34;
    pushPlanarLine(foamLines, [x, -0.052 + h, z], length, yaw);
    foamSlivers.push({
      center: [x + Math.sin(i * 0.23) * 0.06, -0.048 + h, z + Math.cos(i * 0.19) * 0.06],
      length: length * 0.62,
      thickness: 0.012 + hash01(i * 103) * 0.012,
      yaw
    });
  }

  for (let i = 0; i < 28; i += 1) {
    const x = -3.9 + (i % 14) * 0.58;
    const y = 0.96 + Math.floor(i / 14) * 0.42 + Math.sin(i * 0.31 + time * 0.06) * 0.018;
    pushSegment(railLines, [x, y, -0.48], [x + 0.32, y + 0.36, -0.72]);
    pushSegment(railLines, [x + 0.32, y + 0.36, -0.72], [x + 0.64, y, -0.48]);
  }

  for (let i = 0; i < 26; i += 1) {
    const x = -4.8 + i * 0.38;
    const y = 1.18 + Math.sin(i * 0.44) * 0.28;
    pushSegment(deckLines, [x, y, 0.4], [x + 0.22, y + 0.2, 0.18]);
  }

  for (let i = 0; i < 72; i += 1) {
    const row = Math.floor(i / 36);
    const x = -3.62 + (i % 36) * 0.16;
    const z = -0.48 + row * 0.84 + Math.sin(i * 0.37) * 0.018;
    pushPlanarLine(deckLines, [x, 1.085 + row * 0.016, z], 0.24 + hash01(i * 71) * 0.18, 0.02);
  }

  for (let i = 0; i < 44; i += 1) {
    const col = i % 11;
    const row = Math.floor(i / 11);
    const x = -3.3 + col * 0.5;
    const y = 0.06 + row * 0.2;
    pushSegment(deckLines, [x, y, -0.18], [x + 0.26, y + 0.12, -0.28]);
    pushSegment(deckLines, [x + 0.32, y, -0.2], [x + 0.08, y + 0.12, -0.3]);
  }

  for (let i = 0; i < 272; i += 1) {
    const col = i % 34;
    const row = Math.floor(i / 34);
    const x = -5.32 + col * 0.31;
    const z = 2.38 - row * 0.72;
    const y = -0.08 + row * 0.035;
    pushPlanarLine(crispInstrumentLines, [x, y, z], 0.2 + hash01(i * 97) * 0.16, row % 2 === 0 ? 0 : Math.PI / 2);
    if (i % 6 === 0) {
      pushSegment(crispInstrumentLines, [x, y + 0.02, z - 0.18], [x + 0.18, y + 0.08, z - 0.32]);
    }
  }

  for (let i = 0; i < 22; i += 1) {
    const angle = -0.9 + i * 0.085;
    const mastX = -4.62 + Math.sin(angle) * 0.28;
    const mastZ = 1.7 + Math.cos(angle) * 0.22;
    pushSegment(railLines, [mastX, 0.48, mastZ], [-4.62, 2.42, 1.7]);
    if (i % 3 === 0) pushSegment(railLines, [mastX, 1.28, mastZ], [-4.14 + i * 0.08, 1.9, 1.36]);
  }

  pushLineGroup(r, items, deckLines, "wire", "drone navigation glint");
  pushLineGroup(r, items, railLines, "debug", "drone navigation glint");
  pushLineGroup(r, items, crispInstrumentLines, "debug", "drone navigation glint");
  pushLineGroup(r, items, horizonLines, "wire", "low sun reflection streak");
  pushLineGroup(r, items, foamLines, "transparentCyan", "subtle foam crest");
  pushFlatSliverGroup(r, items, foamSlivers, "transparentCyan", "subtle foam crest");
  pushFlatSliverGroup(r, items, brightFoamSlivers, "white", "subtle foam crest");
  flushCueBatches(r, items, detailBatches);
}

function pushPlanarLine(target: Vec3[], center: Vec3, length: number, yaw: number): void {
  const dx = Math.cos(yaw) * length * 0.5;
  const dz = Math.sin(yaw) * length * 0.5;
  pushSegment(target, [center[0] - dx, center[1], center[2] - dz], [center[0] + dx, center[1], center[2] + dz]);
}

function pushFlatSliverGroup(r: Resources, items: RenderItem[], slivers: readonly FlatSliver[], material: string, label: string): void {
  if (slivers.length === 0) return;
  const vertices = new VertexBuffer(VertexFormat.P3N3, slivers.length * 4);
  const indices: number[] = [];
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let cursor = 0;
  for (const sliver of slivers) {
    const halfLength = sliver.length * 0.5;
    const halfThickness = sliver.thickness * 0.5;
    const ux = Math.cos(sliver.yaw) * halfLength;
    const uz = Math.sin(sliver.yaw) * halfLength;
    const vx = -Math.sin(sliver.yaw) * halfThickness;
    const vz = Math.cos(sliver.yaw) * halfThickness;
    const corners: Vec3[] = [
      [sliver.center[0] - ux - vx, sliver.center[1], sliver.center[2] - uz - vz],
      [sliver.center[0] - ux + vx, sliver.center[1], sliver.center[2] - uz + vz],
      [sliver.center[0] + ux - vx, sliver.center[1], sliver.center[2] + uz - vz],
      [sliver.center[0] + ux + vx, sliver.center[1], sliver.center[2] + uz + vz]
    ];
    for (const corner of corners) {
      vertices.setAttribute(cursor, "position", corner);
      vertices.setAttribute(cursor, "normal", [0, 1, 0]);
      min[0] = Math.min(min[0], corner[0]);
      min[1] = Math.min(min[1], corner[1]);
      min[2] = Math.min(min[2], corner[2]);
      max[0] = Math.max(max[0], corner[0]);
      max[1] = Math.max(max[1], corner[1]);
      max[2] = Math.max(max[2], corner[2]);
      cursor += 1;
    }
    const base = cursor - 4;
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  items.push({
    geometry: new Geometry(vertices, new IndexBuffer(indices, vertices.vertexCount), "triangles", bounds(min, max)),
    material: mat(r, material),
    label
  });
}

function normalized(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.max(0.000001, Math.hypot(value[0], value[1], value[2]));
  return [value[0] / length, value[1] / length, value[2] / length];
}

function pbr(name: string, hex: string, metallic: number, roughness: number, alpha = 1, emissiveColor: readonly [number, number, number] = [0, 0, 0], emissiveStrength = 1, transmission = 0): PBRMaterial {
  return new PBRMaterial({
    name,
    baseColor: colorFromHex(hex, alpha),
    metallic,
    roughness,
    emissiveColor,
    emissiveStrength,
    transmissionFactor: transmission,
    renderState: alpha < 1 ? { blend: true, depthWrite: false, cullMode: "none" } : undefined
  });
}

function instanced(name: string, hex: string, metallic: number, roughness: number, emissiveColor: readonly [number, number, number] = [0, 0, 0], emissiveStrength = 1): InstancedPBRMaterial {
  return new InstancedPBRMaterial({
    name,
    baseColor: colorFromHex(hex),
    metallic,
    roughness,
    emissiveColor,
    emissiveStrength
  });
}

function unlit(name: string, color: Rgba, transparent = false, pointSize = 7, roundPoints = false): UnlitMaterial {
  return new UnlitMaterial({
    name,
    color,
    pointSize,
    roundPoints,
    renderState: transparent ? { blend: true, depthWrite: false, cullMode: "none" } : undefined
  });
}

function accentMaterial(value: string): string {
  if (value === "amber") return "amberGlow";
  if (value === "violet") return "violetGlow";
  if (value === "white") return "white";
  return "cyanGlow";
}
