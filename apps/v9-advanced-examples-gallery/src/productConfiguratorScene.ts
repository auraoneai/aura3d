import { createEnvironmentStage, createLightingRig } from "@galileo3d/rendering";
import { bool, frame, item, type GalleryState, type Resources, type SceneFrame } from "./sceneBuilderPrimitives";
import { bounds } from "./math";
import {
  PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS,
  PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
  PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS
} from "./productConfiguratorVisualCleanup";

export function buildProductConfiguratorScene(r: Resources, time: number, state: GalleryState): SceneFrame {
  void r;
  void state;
  const turntableEnabled = bool(state.controls.turntable, true);
  const lightingControl = String(state.controls.lighting ?? "studio");
  const lightingPreset = lightingControl === "inspection" ? "product-detail" : "product-shot";
  const lightingIntensity = lightingControl === "inspection"
    ? 1.18
    : lightingControl === "environment"
      ? 1.02
      : 1.08;
  const productLighting = createLightingRig({
    preset: lightingPreset,
    intensityScale: lightingIntensity,
    shadows: false
  });
  const stage = createEnvironmentStage({
    preset: "indoor-studio",
    size: 3.04,
    floorY: -0.88,
    studioTone: "product-premium",
    includeGroundGrid: true,
    gridDivisions: 36,
    contactGrounding: {
      label: "product showcase support",
      casterRadius: 0.46,
      receiverDistance: 0.16,
      opacity: 0.26
    },
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
  const studioDetails = productConfiguratorStudioInspectionItems(r, time);
  return frame([...stage.items, ...studioDetails], bounds([-1.56, -1.04, -1.02], [1.56, 0.72, 1.16]), productLighting.collectedLights, productEnvironment, {
    bloom: { threshold: 0.44, intensity: 0.24, radius: 3.2 },
    colorGrade: { contrast: 1.42, saturation: 1.18 },
    fxaa: true
  }, [
    ...PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS,
    turntableEnabled ? "car-concept turntable enabled" : "car-concept turntable paused",
    "route-owned studio inspection rails around original car hero",
    `reusable ${lightingPreset} LightingRig`,
    ...stage.systems
  ], [
    ...PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS,
    productLighting.diagnostics.claimBoundary,
    ...productLighting.diagnostics.disclosures,
    ...stage.limitations
  ], [
    ...PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
    "Car-only studio inspection rails",
    "Material swatches",
    `LightingRig ${lightingPreset}`
  ], 0);
}

function productConfiguratorStudioInspectionItems(r: Resources, time: number): SceneFrame["items"] {
  const items = [];
  for (let i = 0; i < 14; i += 1) {
    const z = -0.86 + i * 0.14;
    const pulse = 0.94 + Math.sin(time * 0.8 + i * 0.37) * 0.06;
    items.push(item(r, "lineX", i % 3 === 0 ? "transparentAmber" : "wire", [0, -0.812, z], [2.55 * pulse, 1, 1], [0, 0, 0], "product studio floor inspection rail"));
  }
  for (let i = 0; i < 12; i += 1) {
    const x = -1.28 + i * 0.23;
    items.push(item(r, "lineX", i % 2 ? "transparentCyan" : "wire", [x, -0.806, 0.78], [0.72, 1, 1], [0, Math.PI / 2, 0], "product studio perspective inspection rail"));
  }
  for (let i = 0; i < 6; i += 1) {
    const x = -1.34 + i * 0.54;
    const height = 0.82 + (i % 3) * 0.16;
    items.push(item(r, "cube", i % 2 ? "cyanGlow" : "amberGlow", [x, -0.34 + height * 0.5, -0.94], [0.052, height, 0.024], [0, 0, 0], "product studio vertical softbox meter"));
  }
  const swatches = ["crimson", "glass", "rubber", "steel", "titanium", "graphite", "ceramic", "white", "cyanGlow", "amberGlow", "greenGlow", "violetGlow", "transparentCyan", "transparentAmber", "transparentGreen", "redGlow"] as const;
  for (let i = 0; i < 32; i += 1) {
    const column = i % 16;
    const row = Math.floor(i / 16);
    const material = swatches[i % swatches.length]!;
    items.push(item(r, "cube", material, [-1.38 + column * 0.184, -0.7 + row * 0.085, 0.99], [0.062, 0.028, 0.076], [0, 0.18, 0], "car material swatch control chip"));
    items.push(item(r, "lineX", row % 2 ? "transparentAmber" : "transparentCyan", [-1.38 + column * 0.184, -0.665 + row * 0.085, 0.91], [0.09, 1, 1], [0, 0.18, 0], "car material swatch etched separator"));
  }
  for (let i = 0; i < 22; i += 1) {
    const column = i % 11;
    const row = Math.floor(i / 11);
    const material = swatches[(i * 5 + row) % swatches.length]!;
    const x = -1.42 + column * 0.284;
    const y = -0.42 + row * 0.095;
    items.push(item(r, "cube", material, [x, y, -1.0], [0.048, 0.036, 0.016], [0, 0, 0], "car material rear calibration chip"));
    items.push(item(r, "lineX", i % 3 === 0 ? "debug" : "wire", [x, y + 0.038, -0.976], [0.08, 1, 1], [0, 0, 0], "car material rear calibration tick"));
  }
  for (let i = 0; i < 34; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2) % 17;
    const material = swatches[(row * 3 + i) % swatches.length]!;
    const x = side * (1.42 + (row % 3) * 0.035);
    const y = -0.48 + row * 0.063;
    items.push(item(r, "cube", material, [x, y, -0.9], [0.042, 0.042, 0.018], [0, side * 0.12, 0], "side studio material calibration chip"));
    items.push(item(r, "lineX", row % 2 ? "debug" : "transparentCyan", [x - side * 0.045, y + 0.032, -0.878], [0.065, 1, 1], [0, side * 0.12, 0], "side studio material calibration tick"));
  }
  for (let i = 0; i < 20; i += 1) {
    const x = -1.16 + i * 0.122;
    const material = i % 5 === 0 ? "white" : i % 3 === 0 ? "cyanGlow" : i % 2 === 0 ? "amberGlow" : "redGlow";
    items.push(item(r, "cube", material, [x, -0.61, -0.68], [0.046, 0.018, 0.024], [0, 0.05, 0], "front studio contrast calibration chip"));
  }
  return items;
}
