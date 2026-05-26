import {
  Geometry,
  InstancedPBRMaterial,
  Material,
  PBRMaterial,
  UnlitMaterial
} from "@aura3d/rendering";
import { buildDataGalaxyScene } from "./dataGalaxyScene";
import type { DemoDefinition } from "./metadata";
import { colorFromHex, type Rgba } from "./math";
import { buildProductConfiguratorScene } from "./productConfiguratorScene";
import { buildReactorPostScene } from "./reactorPostScene";
import {
  buildDigitalTwin,
  buildFogCathedral,
  buildOcean,
  buildPhysics,
  buildRoboticsLab,
  buildSmartCity,
  buildWaterLab
} from "./proceduralRouteScenes";
import type { GalleryState, Resources, SceneFrame } from "./sceneBuilderPrimitives";
import { GalleryWaterMaterial } from "./showcaseShaders";

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
