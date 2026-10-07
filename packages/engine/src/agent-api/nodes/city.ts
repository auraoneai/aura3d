// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraSceneNode, AuraPrimitiveNode, AuraCameraSpec, CityBlockTimeOfDay, AuraCityCameraPreset, AuraCityBlockOptions, AuraCityStateChangeEvidence, AuraCityInstancingPlan, AuraCityStateController, AuraCityBrowserRuntimeState, AuraCityDayNightToggleOptions, AuraApp } from "./types.js";
import type { AuraUiTarget } from "./ui.js";
import { AuraSceneBuilder, scene } from "./scene.js";
import { camera } from "./camera.js";
import { cityBlock } from "./prefabs/cityBlock.js";
import { effects } from "./effects.composite.js";
import { groups } from "./groups.js";
import { instances } from "./instances.js";
import { lights } from "./lights.js";
import { material } from "./material.js";
import { prefabs } from "./prefabs/index.js";
import { primitives } from "./primitives.js";
import { ui } from "./ui.js";
import { validateCityVisualQA } from "../looks/structuralQA.js";
import { cameraPreset } from "../CameraPresetLibrary.js";
import { distance } from "../SpatialAnchoring.js";

export function makeCityCrosswalk(namePrefix: string, x: number, z: number, orientation: "northSouth" | "eastWest"): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  for (let index = 0; index < 5; index += 1) {
    const offset = -0.56 + index * 0.28;
    nodes.push(primitives.box({
      name: `${namePrefix} stripe ${index + 1}`,
      material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" })
    })
      .position(orientation === "northSouth" ? x + offset : x, 0.036, orientation === "northSouth" ? z : z + offset)
      .scale(orientation === "northSouth" ? [0.075, 0.018, 0.82] : [0.82, 0.018, 0.075])
      .toJSON());
  }
  return nodes;
}

export function makeCityRoadMarkings(timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const paint = material.emissive({
    color: timeOfDay === "night" ? "#f8fafc" : "#ffffff",
    emissive: timeOfDay === "night" ? "#e0f2fe" : "#cbd5e1",
    emissiveIntensity: timeOfDay === "night" ? 0.38 : 0.25
  });
  const bikeLane = material.pbr({ color: timeOfDay === "night" ? "#0f766e" : "#5eead4", roughness: 0.68, metallic: 0.02 });
  const nodes: AuraSceneNode[] = [
    primitives.box({ name: "northbound dashed lane marking 1", material: paint }).position(-0.01, 0.041, -3.56).scale([0.034, 0.016, 0.58]).toJSON(),
    primitives.box({ name: "northbound dashed lane marking 2", material: paint }).position(-0.01, 0.041, -2.28).scale([0.034, 0.016, 0.58]).toJSON(),
    primitives.box({ name: "northbound dashed lane marking 3", material: paint }).position(-0.01, 0.041, 1.78).scale([0.034, 0.016, 0.58]).toJSON(),
    primitives.box({ name: "northbound dashed lane marking 4", material: paint }).position(-0.01, 0.041, 3.06).scale([0.034, 0.016, 0.58]).toJSON(),
    primitives.box({ name: "eastbound dashed lane marking 1", material: paint }).position(-3.6, 0.043, -0.01).scale([0.58, 0.016, 0.034]).toJSON(),
    primitives.box({ name: "eastbound dashed lane marking 2", material: paint }).position(-2.28, 0.043, -0.01).scale([0.58, 0.016, 0.034]).toJSON(),
    primitives.box({ name: "eastbound dashed lane marking 3", material: paint }).position(1.78, 0.043, -0.01).scale([0.58, 0.016, 0.034]).toJSON(),
    primitives.box({ name: "eastbound dashed lane marking 4", material: paint }).position(3.06, 0.043, -0.01).scale([0.58, 0.016, 0.034]).toJSON(),
    primitives.box({ name: "protected bike lane paint north", material: bikeLane }).position(-3.82, 0.039, 0).scale([0.035, 0.014, 9.4]).toJSON(),
    primitives.box({ name: "protected bike lane paint east", material: bikeLane }).position(0, 0.039, 2.86).scale([9.6, 0.014, 0.035]).toJSON(),
    primitives.box({ name: "left turn arrow road marking", material: paint }).position(-0.36, 0.046, -1.04).rotate(0, 0.72, 0).scale([0.32, 0.014, 0.052]).toJSON(),
    primitives.box({ name: "right turn arrow road marking", material: paint }).position(1.06, 0.046, 0.36).rotate(0, -0.72, 0).scale([0.32, 0.014, 0.052]).toJSON()
  ];
  return nodes;
}

export function makeBuildingWindowRows(x: number, z: number, height: number, towerIndex: number, timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const bandHeight = Math.max(0.72, height * 0.58);
  const bandY = 0.36 + bandHeight / 2;
  const warm = timeOfDay === "night"
    ? material.emissive({ color: "#ff7a00", emissive: "#ff7a00", emissiveIntensity: 1.05 })
    : material.pbr({ color: "#d6e8f0", roughness: 0.34, metallic: 0.02, opacity: 0.78 });
  const cool = timeOfDay === "night"
    ? material.emissive({ color: "#5eeaff", emissive: "#5eeaff", emissiveIntensity: 0.98 })
    : material.pbr({ color: "#b8d7e8", roughness: 0.38, metallic: 0.03, opacity: 0.72 });
  const sign = towerIndex % 4 === 0
    ? [primitives.box({
      name: `roofline neon sign ${towerIndex + 1}`,
      material: timeOfDay === "night"
        ? material.emissive({ color: "#ff7ad9", emissive: "#ff7ad9", emissiveIntensity: 0.8 })
        : material.pbr({ color: "#a8558f", roughness: 0.48, metallic: 0.03 })
    }).position(x, height + 0.08, z + 0.64).scale([0.78, 0.08, 0.035]).toJSON()]
    : [];

  const frameMaterial = material.pbr({ color: timeOfDay === "night" ? "#94a3b8" : "#475569", roughness: 0.5, metallic: 0.06 });
  return [
    primitives.box({
      name: `front warm window column ${towerIndex + 1}`,
      material: warm
    }).position(x - 0.24, bandY, z + 0.66).scale([0.12, bandHeight, 0.034]).toJSON(),
    primitives.box({
      name: `front cool window column ${towerIndex + 1}`,
      material: cool
    }).position(x + 0.24, bandY, z + 0.66).scale([0.12, Math.max(0.54, bandHeight * 0.72), 0.034]).toJSON(),
    primitives.box({
      name: `side warm window column ${towerIndex + 1}`,
      material: warm
    }).position(x + 0.66, bandY, z - 0.24).scale([0.034, bandHeight, 0.12]).toJSON(),
    primitives.box({
      name: `side cool window column ${towerIndex + 1}`,
      material: cool
    }).position(x + 0.66, bandY, z + 0.24).scale([0.034, Math.max(0.54, bandHeight * 0.72), 0.12]).toJSON(),
    primitives.box({
      name: `modular facade window frame left rail ${towerIndex + 1}`,
      material: frameMaterial
    }).position(x - 0.43, bandY, z + 0.704).scale([0.028, Math.max(0.72, bandHeight * 1.02), 0.018]).toJSON(),
    primitives.box({
      name: `modular facade window frame center mullion ${towerIndex + 1}`,
      material: frameMaterial
    }).position(x, bandY, z + 0.706).scale([0.024, Math.max(0.72, bandHeight * 1.02), 0.018]).toJSON(),
    primitives.box({
      name: `modular facade window frame right rail ${towerIndex + 1}`,
      material: frameMaterial
    }).position(x + 0.43, bandY, z + 0.704).scale([0.028, Math.max(0.72, bandHeight * 1.02), 0.018]).toJSON(),
    primitives.box({
      name: `modular facade window frame horizontal rail ${towerIndex + 1}`,
      material: frameMaterial
    }).position(x, bandY + bandHeight * 0.18, z + 0.708).scale([0.86, 0.026, 0.018]).toJSON(),
    primitives.box({
      name: `thin facade ledge band ${towerIndex + 1}`,
      material: material.pbr({ color: timeOfDay === "night" ? "#cbd5e1" : "#e2e8f0", roughness: 0.54, metallic: 0.02 })
    }).position(x, Math.min(height - 0.12, 0.58 + bandHeight), z + 0.715).scale([0.86, 0.034, 0.038]).toJSON(),
    ...sign
  ];
}

export function makeBuildingDetails(x: number, z: number, height: number, towerIndex: number, timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const storefrontMaterial = material.emissive({
    color: timeOfDay === "night" ? "#fef3c7" : "#dff6ff",
    emissive: timeOfDay === "night" ? "#fbbf24" : "#7dd3fc"
  });
  const awningMaterial = material.clearcoat({
    color: towerIndex % 2 === 0 ? "#ef4444" : "#2563eb",
    roughness: 0.28,
    clearcoat: 0.75,
    clearcoatRoughness: 0.08
  });
  const roofColor = towerIndex % 2 === 0 ? "#1f2933" : "#26313a";
  const nodes: AuraSceneNode[] = [
    primitives.box({
      name: `rooftop mechanical cap ${towerIndex + 1}`,
      material: material.pbr({ color: roofColor, roughness: 0.74, metallic: 0.08 })
    }).position(x - 0.28, height + 0.08, z - 0.2).scale([0.34, 0.16, 0.38]).toJSON(),
    primitives.box({
      name: `street-level lit storefront ${towerIndex + 1}`,
      material: storefrontMaterial
    }).position(x, 0.26, z + 0.67).scale([0.72, 0.22, 0.038]).toJSON(),
    primitives.box({
      name: `striped storefront awning ${towerIndex + 1}`,
      material: awningMaterial
    }).position(x, 0.44, z + 0.71).rotate(-0.16, 0, 0).scale([0.82, 0.055, 0.18]).toJSON(),
    primitives.box({
      name: `street address plaque ${towerIndex + 1}`,
      material: material.emissive({ color: "#f8fafc", emissive: timeOfDay === "night" ? "#dbeafe" : "#93c5fd" })
    }).position(x - 0.42, 0.38, z + 0.713).scale([0.12, 0.08, 0.024]).toJSON(),
    primitives.box({
      name: `dark vertical facade reveal ${towerIndex + 1}`,
      material: material.pbr({ color: "#111827", roughness: 0.8, metallic: 0.02 })
    }).position(x - 0.01, Math.max(0.65, height * 0.5), z + 0.692).scale([0.035, Math.max(0.75, height * 0.62), 0.026]).toJSON()
  ];

  if (towerIndex % 5 === 2) {
    nodes.push(primitives.cylinder({
      name: `round rooftop water tank ${towerIndex + 1}`,
      material: material.metal({ color: "#576574", roughness: 0.36 })
    }).position(x + 0.32, height + 0.18, z + 0.24).scale([0.16, 0.25, 0.16]).toJSON());
  }

  if (towerIndex % 6 === 1) {
    nodes.push(primitives.box({
      name: `thin rooftop antenna ${towerIndex + 1}`,
      material: material.metal({ color: "#d1d5db", roughness: 0.22 })
    }).position(x + 0.36, height + 0.52, z - 0.36).scale([0.025, 0.72, 0.025]).toJSON());
  }

  if (towerIndex % 4 === 3) {
    nodes.push(primitives.box({
      name: `small balcony slab ${towerIndex + 1}`,
      material: material.pbr({ color: "#cbd5e1", roughness: 0.62, metallic: 0.04 })
    }).position(x + 0.32, Math.max(0.88, height * 0.56), z + 0.77).scale([0.46, 0.038, 0.18]).toJSON());
    nodes.push(primitives.box({
      name: `thin balcony guard rail ${towerIndex + 1}`,
      material: material.metal({ color: "#e2e8f0", roughness: 0.28 })
    }).position(x + 0.32, Math.max(0.98, height * 0.56 + 0.11), z + 0.88).scale([0.48, 0.034, 0.026]).toJSON());
  }

  return nodes;
}

export function makeCityVehicle(name: string, x: number, z: number, color: AuraColor, rotation = 0): AuraSceneNode[] {
  return [
    primitives.box({
      name: `${name} car body`,
      material: material.clearcoat({ color, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.08 })
    }).position(x, 0.115, z).rotate(0, rotation, 0).scale([0.42, 0.15, 0.22]).toJSON(),
    primitives.box({
      name: `${name} windshield`,
      material: material.glass({ color: "#bdefff", opacity: 0.56, transmission: 0.65 })
    }).position(x, 0.22, z).rotate(0, rotation, 0).scale([0.2, 0.09, 0.17]).toJSON(),
    primitives.box({
      name: `${name} headlight pair`,
      material: material.emissive({ color: "#fff7cc", emissive: "#fff7cc" })
    }).position(x + Math.sin(rotation) * 0.24, 0.15, z + Math.cos(rotation) * 0.24).rotate(0, rotation, 0).scale([0.2, 0.035, 0.028]).toJSON()
  ];
}

export function makeCityProps(timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const treeLeaf = material.pbr({ color: timeOfDay === "night" ? "#14532d" : "#22c55e", roughness: 0.82, metallic: 0.01 });
  const bench = material.pbr({ color: timeOfDay === "night" ? "#7c2d12" : "#92400e", roughness: 0.58, metallic: 0.03 });
  const sign = material.emissive({ color: "#dbeafe", emissive: timeOfDay === "night" ? "#38bdf8" : "#93c5fd", emissiveIntensity: timeOfDay === "night" ? 1.5 : 0.42 });
  return [
    primitives.cylinder({ name: "instanced city tree trunk 1", material: material.pbr({ color: "#6b3f21", roughness: 0.78 }) }).position(-2.92, 0.24, -0.9).scale([0.055, 0.48, 0.055]).toJSON(),
    primitives.sphere({ name: "instanced city tree canopy 1", material: treeLeaf }).position(-2.92, 0.72, -0.9).scale([0.26, 0.32, 0.26]).toJSON(),
    primitives.cylinder({ name: "instanced city tree trunk 2", material: material.pbr({ color: "#6b3f21", roughness: 0.78 }) }).position(2.48, 0.24, 0.98).scale([0.055, 0.48, 0.055]).toJSON(),
    primitives.sphere({ name: "instanced city tree canopy 2", material: treeLeaf }).position(2.48, 0.72, 0.98).scale([0.26, 0.32, 0.26]).toJSON(),
    primitives.box({ name: "wood street bench seat 1", material: bench }).position(-2.64, 0.15, 1.98).scale([0.48, 0.055, 0.16]).toJSON(),
    primitives.box({ name: "wood street bench back 1", material: bench }).position(-2.64, 0.25, 2.08).rotate(-0.18, 0, 0).scale([0.5, 0.048, 0.16]).toJSON(),
    primitives.box({ name: "wood street bench seat 2", material: bench }).position(2.34, 0.15, -2.02).rotate(0, 3.1416, 0).scale([0.48, 0.055, 0.16]).toJSON(),
    primitives.box({ name: "wood street bench back 2", material: bench }).position(2.34, 0.25, -2.12).rotate(-0.18, 3.1416, 0).scale([0.5, 0.048, 0.16]).toJSON(),
    primitives.box({ name: "readable bus stop sign panel", material: sign }).position(-3.22, 0.66, 0.42).rotate(0, 0.16, 0).scale([0.22, 0.28, 0.026]).toJSON(),
    primitives.cylinder({ name: "bus stop sign pole", material: material.metal({ color: "#94a3b8", roughness: 0.32 }) }).position(-3.22, 0.34, 0.42).scale([0.025, 0.68, 0.025]).toJSON(),
    primitives.box({ name: "corner wayfinding street sign", material: sign }).position(0.88, 0.82, -0.88).rotate(0, -0.34, 0).scale([0.34, 0.12, 0.025]).toJSON()
  ];
}

function cityCameraPreset(preset: AuraCityCameraPreset = "overview", timeOfDay: CityBlockTimeOfDay = "night"): AuraCameraSpec {
  if (preset === "street-level") {
    return camera.perspective({ position: [-2.8, 0.92, 3.7], target: [0.18, 0.62, -0.34], fov: 48 });
  }
  if (preset === "cinematic-night") {
    return camera.dolly({
      from: [-5.4, 2.42, 6.35],
      to: [-3.6, 2.02, 4.65],
      target: [0, 0.92, 0],
      seconds: 8,
      fov: timeOfDay === "night" ? 48 : 46,
      captureTime: 0.38
    });
  }
  return camera.orbit({ target: [0, 0.9, 0], distance: timeOfDay === "night" ? 8.2 : 8.8, fov: 44 });
}

function cityScene(options: AuraCityBlockOptions & { readonly cameraPreset?: AuraCityCameraPreset } = {}): AuraSceneBuilder {
  const timeOfDay = options.timeOfDay ?? "night";
  const night = timeOfDay === "night";
  return scene()
    .background(night ? "#04101f" : "#bfe7ff")
    .addMany(prefabs.cityBlock(options))
    .add(lights.studio({ intensity: night ? 0.78 : 1.24 }))
    .add(effects.fog({ density: night ? 0.032 : 0.018, color: night ? "#10294f" : "#dff6ff" }))
    .add(effects.bloom({ intensity: night ? 0.12 : 0.07, color: night ? "#93c5fd" : "#fde68a" }))
    .camera(cityCameraPreset(options.cameraPreset ?? "overview", timeOfDay));
}

export function collectCityInstancingPlan(nodes: readonly AuraSceneNode[]): AuraCityInstancingPlan {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const nativeInstanceNodes = flattened.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && Boolean(node.instances?.length));
  const nativeInstances = nativeInstanceNodes.reduce((total, node) => total + (node.instances?.length ?? 0), 0);
  const windows = names.filter((name) => name.includes("window column")).length;
  const props = names.filter((name) => name.includes("bench") || name.includes("tree") || name.includes("sign") || name.includes("car body") || name.includes("traffic signal")).length;
  const roadMarkings = names.filter((name) => name.includes("lane marking") || name.includes("road stripe") || name.includes("crosswalk") || name.includes("turn arrow") || name.includes("bike lane")).length;
  const lights = names.filter((name) => name.includes("street lamp") || name.includes("headlight") || name.includes("lamp glow") || name.includes("city glow")).length;
  const groupsList = [
    nativeInstanceNodes.some((node) => node.name?.includes("city tower")) ? "city towers" : "",
    windows >= 8 ? "window columns" : "",
    props >= 6 ? "street props" : "",
    roadMarkings >= 8 ? "road markings" : "",
    lights >= 6 ? "street/head lights" : ""
  ].filter(Boolean);
  return {
    kind: "aura-city-instancing-plan",
    rendererPath: "productionRuntimeNativeInstancing",
    windows,
    props,
    roadMarkings,
    lights,
    nativeInstanceGroups: nativeInstanceNodes.length,
    nativeInstances,
    groups: groupsList,
    instanced: nativeInstanceNodes.length > 0 && nativeInstances > 0
  };
}

function changedCityNodeNames(previous: readonly AuraSceneNode[], next: readonly AuraSceneNode[]): readonly string[] {
  const previousNames = new Set(groups.flatten(previous).map((node) => "name" in node ? node.name ?? "" : ""));
  return groups.flatten(next)
    .map((node) => "name" in node ? node.name ?? "" : "")
    .filter((name) => name.length > 0 && !previousNames.has(name))
    .slice(0, 18);
}

function createCityStateController(options: AuraCityBlockOptions = {}): AuraCityStateController {
  let timeOfDay = options.timeOfDay ?? "night";
  const blocks = Math.max(3, Math.min(30, options.blocks ?? 20));
  const litWindows = options.litWindows ?? true;
  let revision = 0;
  let lastChange: AuraCityStateChangeEvidence | undefined;
  const build = () => prefabs.cityBlock({ blocks, litWindows, timeOfDay });
  return {
    kind: "aura-city-state",
    blocks,
    litWindows,
    get timeOfDay() {
      return timeOfDay;
    },
    get revision() {
      return revision;
    },
    get lastChange() {
      return lastChange;
    },
    setTimeOfDay(next) {
      const previous = build();
      const from = timeOfDay;
      timeOfDay = next;
      revision += 1;
      const built = build();
      lastChange = { from, to: next, revision, changedNodeNames: changedCityNodeNames(previous, built) };
      return built;
    },
    toggleTimeOfDay() {
      return this.setTimeOfDay(timeOfDay === "night" ? "day" : "night");
    },
    scene() {
      return cityScene({ blocks, litWindows, timeOfDay });
    },
    applyTo(builder) {
      const night = timeOfDay === "night";
      return builder
        .background(night ? "#04101f" : "#bfe7ff")
        .addMany(build())
        .add(lights.studio({ intensity: night ? 0.78 : 1.24 }))
        .add(effects.fog({ density: night ? 0.032 : 0.018, color: night ? "#10294f" : "#dff6ff" }))
        .add(effects.bloom({ intensity: night ? 0.12 : 0.07, color: night ? "#93c5fd" : "#fde68a" }))
        .camera(cityCameraPreset("overview", timeOfDay));
    },
    nodes() {
      return build();
    }
  };
}

function bindCityDayNightToggle(
  target: AuraUiTarget<HTMLButtonElement>,
  app: AuraApp,
  state: AuraCityStateController = createCityStateController(),
  options: AuraCityDayNightToggleOptions = {}
): HTMLButtonElement {
  const button = ui.toggle(target, {
    pressed: state.timeOfDay === "night",
    onLabel: "Switch to day",
    offLabel: "Switch to night"
  });
  const ownerWindow = button.ownerDocument?.defaultView;
  const publish = (): AuraCityBrowserRuntimeState => {
    const runtimeState: AuraCityBrowserRuntimeState = {
      kind: "aura-city-browser-runtime",
      mounted: true,
      timeOfDay: state.timeOfDay,
      revision: state.revision,
      changedNodeNames: state.lastChange?.changedNodeNames ?? []
    };
    button.dataset.auraCityRuntime = "mounted";
    button.dataset.auraCityTimeOfDay = state.timeOfDay;
    button.dataset.auraCityRevision = String(state.revision);
    button.setAttribute("aria-pressed", String(state.timeOfDay === "night"));
    button.textContent = state.timeOfDay === "night" ? "Switch to day" : "Switch to night";
    if (ownerWindow) {
      (ownerWindow as unknown as { __AURA3D_CITY__?: AuraCityBrowserRuntimeState }).__AURA3D_CITY__ = runtimeState;
    }
    options.onChange?.(state.timeOfDay, runtimeState);
    return runtimeState;
  };
  button.onclick = () => {
    state.toggleTimeOfDay();
    app.setScene(state.scene());
    publish();
  };
  publish();
  return button;
}

export const city = {
  createState: createCityStateController,
  bindDayNightToggle: bindCityDayNightToggle,
  block: (options: AuraCityBlockOptions = {}): readonly AuraSceneNode[] => prefabs.cityBlock(options),
  cityBlock: (options: AuraCityBlockOptions = {}): readonly AuraSceneNode[] => prefabs.cityBlock(options),
  scene: cityScene,
  cameraPreset: cityCameraPreset,
  cameras: (timeOfDay: CityBlockTimeOfDay = "night"): Record<AuraCityCameraPreset, AuraCameraSpec> => ({
    overview: cityCameraPreset("overview", timeOfDay),
    "street-level": cityCameraPreset("street-level", timeOfDay),
    "cinematic-night": cityCameraPreset("cinematic-night", "night")
  }),
  instancing: collectCityInstancingPlan,
  visualQA: validateCityVisualQA
} as const;
