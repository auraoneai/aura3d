import { createEnvironmentStage, createLightingRig } from "@galileo3d/rendering";
import { bool, frame, item, type GalleryState, type Resources, type SceneFrame } from "./sceneBuilderPrimitives";
import { bounds, type Vec3 } from "./math";
import {
  PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS,
  PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
  PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS,
  removeProductConfiguratorProceduralArtifacts
} from "./productConfiguratorVisualCleanup";

export function buildProductConfiguratorScene(r: Resources, time: number, state: GalleryState): SceneFrame {
  const items = [];
  const explode = bool(state.controls.explode);
  const rot = bool(state.controls.turntable, true) ? time * 0.28 : 0;
  const finish = String(state.controls.finish ?? "graphite");
  const focusPart = String(state.controls.focusPart ?? "overview");
  const bodyMat = productBodyMaterial(finish);
  const accentMat = productAccentMaterial(finish, focusPart);
  const lightingControl = String(state.controls.lighting ?? "studio");
  const lightingIntensity = lightingControl === "inspection"
    ? 1.18
    : lightingControl === "environment"
      ? 1.02
      : 1.08;
  const productLighting = createLightingRig({
    preset: "product-shot",
    intensityScale: lightingIntensity,
    shadows: false
  });
  const stage = createEnvironmentStage({
    preset: "indoor-studio",
    size: 3.25,
    floorY: -0.95,
    studioTone: "product-premium",
    includeGroundGrid: false,
    timeSeconds: time
  });
  if (!stage.lighting.proceduralMap) {
    throw new Error("Product Configurator studio stage must provide procedural environment lighting.");
  }
  const productEnvironment: SceneFrame["environment"] = {
    color: stage.lighting.color,
    intensity: stage.lighting.intensity,
    proceduralMap: stage.lighting.proceduralMap
  };
  const parts: readonly [string, Vec3, Vec3, string][] = [
    ["main chassis", [0, 0, 0], [2.8, 0.42, 1.25], bodyMat],
    ["sensor visor", [0, 0.32, -0.66], [2.4, 0.16, 0.12], "glass"],
    ["thermal spine", [0, 0.48, 0.12], [2.2, 0.12, 0.18], accentMat],
    ["left rail", [-1.48, 0.02, 0], [0.12, 0.32, 1.25], "titanium"],
    ["right rail", [1.48, 0.02, 0], [0.12, 0.32, 1.25], "titanium"],
    ["front camera", [-0.75, 0.1, -0.82], [0.22, 0.22, 0.08], "glass"],
    ["front lidar", [0.75, 0.1, -0.82], [0.22, 0.22, 0.08], "glass"],
    ["port gasket", [-0.95, -0.32, -0.35], [0.42, 0.1, 0.2], "rubber"],
    ["port gasket", [0, -0.32, -0.35], [0.42, 0.1, 0.2], "rubber"],
    ["port gasket", [0.95, -0.32, -0.35], [0.42, 0.1, 0.2], "rubber"],
    ["cooling fin", [-1.0, 0.3, 0.58], [0.08, 0.34, 0.5], "darkSteel"],
    ["cooling fin", [-0.5, 0.3, 0.58], [0.08, 0.34, 0.5], "darkSteel"],
    ["cooling fin", [0, 0.3, 0.58], [0.08, 0.34, 0.5], "darkSteel"],
    ["cooling fin", [0.5, 0.3, 0.58], [0.08, 0.34, 0.5], "darkSteel"],
    ["cooling fin", [1.0, 0.3, 0.58], [0.08, 0.34, 0.5], "darkSteel"]
  ];
  parts.forEach(([label, position, scale, material], index) => {
    const offset = explode ? [(position[0]) * 0.35, (index % 3 - 1) * 0.2, (position[2]) * 0.42] as const : [0, 0, 0] as const;
    items.push(item(r, "cube", material, [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]], scale, [0, rot, 0], label));
  });
  const hotspots: readonly Vec3[] = [
    [-1.16, -0.08, -0.74],
    [-0.34, 0.46, -0.5],
    [0.48, 0.42, -0.14],
    [1.08, 0.0, 0.34],
    [-1.08, -0.5, 0.62],
    [1.34, -0.46, 0.8]
  ];
  hotspots.forEach((position, index) => {
    const activeHotspot = focusPart !== "overview" && index === ({
      lens: 0,
      body: 1,
      sensor: 2,
      battery: 3,
      controls: 4,
      grip: 5
    } as Record<string, number>)[focusPart];
    items.push(item(r, "sphere", activeHotspot ? "amberGlow" : index % 2 === 0 ? accentMat : "cyanGlow", [
      position[0],
      position[1] + Math.sin(time * 1.6 + index) * 0.012,
      position[2]
    ], activeHotspot ? [0.065, 0.065, 0.065] : [0.04, 0.04, 0.04], [0, 0, 0], activeHotspot ? "selected hotspot fallback" : "hotspot"));
  });
  items.push(...stage.items);
  const turntableTickCount = 56;
  for (let i = 0; i < turntableTickCount; i += 1) {
    const a = (i / turntableTickCount) * Math.PI * 2;
    const radiusX = 1.72;
    const radiusZ = 0.92;
    items.push(item(r, "lineX", i % 4 === 0 ? "transparentAmber" : "wire", [
      Math.cos(a) * radiusX,
      -0.906,
      0.1 + Math.sin(a) * radiusZ
    ], [i % 4 === 0 ? 0.17 : 0.1, 1, 1], [0, -a, 0], "product turntable tick"));
  }
  const cleanedItems = removeProductConfiguratorProceduralArtifacts({ items }).items;
  return frame([...cleanedItems], bounds([-2.18, -1.12, -1.24], [2.18, 1.18, 1.34]), productLighting.collectedLights, productEnvironment, {
    bloom: { threshold: 0.44, intensity: 0.24, radius: 3.2 },
    colorGrade: { contrast: 1.14, saturation: 1.02 },
    fxaa: true
  }, [...PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS, "reusable product-shot LightingRig", ...stage.systems], [
    ...PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS,
    productLighting.diagnostics.claimBoundary,
    ...productLighting.diagnostics.disclosures,
    ...stage.limitations
  ], [
    ...PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
    "LightingRig product-shot"
  ], parts.length);
}

function productBodyMaterial(finish: string): string {
  if (finish === "champagne") return "ceramic";
  if (finish === "copper") return "crimson";
  if (finish === "alloy") return "titanium";
  return "graphite";
}

function productAccentMaterial(finish: string, focusPart: string): string {
  return finish === "copper" || focusPart !== "overview" ? "amberGlow" : "cyanGlow";
}
