import { createEnvironmentStage } from "@galileo3d/rendering";
import { bool, frame, item, pushLineGroup, type GalleryState, type Resources, type SceneFrame } from "./sceneBuilderPrimitives";
import { bounds, type Vec3 } from "./math";
import {
  PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS,
  PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
  PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS
} from "./productConfiguratorVisualCleanup";
import {
  createProductConfiguratorShowroomLighting,
  productConfiguratorCarPaintEnvironment
} from "./productConfiguratorLighting";

export function buildProductConfiguratorScene(_r: Resources, time: number, state: GalleryState): SceneFrame {
  const turntableEnabled = bool(state.controls.turntable, false);
  const lightingControl = String(state.controls.lighting ?? "studio");
  const productLighting = createProductConfiguratorShowroomLighting(lightingControl);
  const stage = createEnvironmentStage({
    preset: "indoor-studio",
    size: 3.55,
    floorY: -0.88,
    studioTone: "product-premium",
    includeStageShell: true,
    includeGroundGrid: false,
    includeStageAccents: false,
    contactGrounding: {
      casterRadius: 0.82,
      receiverDistance: 0.12,
      softness: 0.56,
      opacity: 0.22,
      layerCount: 3,
      anisotropy: 1.72
    },
    timeSeconds: time
  });
  if (!stage.lighting.proceduralMap) {
    throw new Error("Product Configurator studio stage must provide procedural environment lighting.");
  }
  const productEnvironment: SceneFrame["environment"] = {
    color: [0.074, 0.071, 0.067],
    intensity: Math.min(Math.max(stage.lighting.intensity, 0.88), 0.92),
    proceduralMap: productConfiguratorCarPaintEnvironment(stage.lighting.proceduralMap)
  };
  const showroomItems = [
    ...stage.items,
    ...createProductConfiguratorShowroomDetailItems(_r, time)
  ];
  return frame(showroomItems, bounds([-1.82, -0.96, -0.94], [1.82, 0.68, 0.96]), productLighting.collectedLights, productEnvironment, false, [
    ...PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS,
    turntableEnabled ? "car-concept turntable enabled" : "car-concept turntable paused",
    "route-owned car-only showroom staging around original car hero",
    "route-owned car paint lighting uses a bounded product-shot rig for red body-paint shape",
    "route-owned car paint lighting limits cool rim energy around roof, glass, trim, and side panels",
    "route-owned car paint environment suppresses blue-gray specular halo",
    "route-owned Product proof uses original car plus controlled configurator platform etch and material swatch tray",
    "route-owned compact material selector panel",
    `bounded ${productLighting.preset} showroom lighting`,
    ...stage.systems
  ], [
    ...PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS,
    "The Product route uses the route-owned product-shot/product-detail lighting rig with bounded direct key/fill/rim energy so red paint remains shaped without bright white roof, glass, trim, or side-panel halos.",
    "The Product route overrides the reusable indoor-studio procedural specular map with a bounded warm-neutral showroom map because the default blue-gray product environment creates pale Fresnel shading around the car silhouette.",
    "The Product route keeps the physical stage shell limited to a compact catch plane, layered contact grounding, fine configurator platform etch, and material swatches; stage detail must support car readability, not hide weak material quality.",
    "The compact configurator control panel is route-owned UI evidence for imported material controls; it is not a replacement hero prop and does not claim picking parity.",
    productLighting.diagnostics.claimBoundary,
    ...productLighting.diagnostics.disclosures,
    ...stage.limitations
  ], [
    ...PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS,
    "Car-only showroom staging",
    "Material controls",
    "Precision platform etch",
    "Material swatch tray",
    "Visible material selector",
    `Product lighting ${productLighting.preset}`
  ], 0);
}

function createProductConfiguratorShowroomDetailItems(r: Resources, time: number): SceneFrame["items"] {
  const items: SceneFrame["items"][number][] = [];
  const etch: Vec3[] = [];
  const y = -0.802;
  const width = 2.86;
  const depth = 1.58;
  const pulse = 0.5 + Math.sin(time * 0.6) * 0.5;

  for (let zIndex = 0; zIndex <= 12; zIndex += 1) {
    const z = -depth * 0.5 + (depth * zIndex) / 12;
    const inset = Math.abs(z) * 0.22;
    etch.push([-width * 0.5 + inset, y, z], [width * 0.5 - inset, y, z]);
  }
  for (let xIndex = 0; xIndex <= 10; xIndex += 1) {
    const x = -width * 0.5 + (width * xIndex) / 10;
    const inset = Math.abs(x) * 0.16;
    etch.push([x, y + 0.001, -depth * 0.5 + inset], [x, y + 0.001, depth * 0.5 - inset]);
  }
  pushLineGroup(r, items, etch, "showroomGuide", "product configurator precision platform etch");

  const perimeter: Vec3[] = [
    [-1.48, y + 0.004, -0.82], [1.48, y + 0.004, -0.82],
    [1.48, y + 0.004, -0.82], [1.36, y + 0.004, 0.78],
    [1.36, y + 0.004, 0.78], [-1.36, y + 0.004, 0.78],
    [-1.36, y + 0.004, 0.78], [-1.48, y + 0.004, -0.82]
  ];
  for (let i = 0; i < 10; i += 1) {
    const t = i / 9;
    const x = -1.18 + t * 2.36;
    perimeter.push([x, y + 0.006, -0.89], [x + 0.045 + pulse * 0.012, y + 0.006, -0.89]);
  }
  pushLineGroup(r, items, perimeter, "showroomEdge", "product configurator precision platform perimeter");

  const swatchMaterials = ["crimson", "graphite", "titanium", "ceramic", "darkSteel", "white", "showroomEdge"] as const;
  for (let i = 0; i < swatchMaterials.length; i += 1) {
    items.push(item(
      r,
      "cube",
      swatchMaterials[i]!,
      [-1.16 + i * 0.13, y + 0.012, -0.74],
      [0.046, 0.012, 0.082],
      [0, 0.24, 0],
      "product configurator material swatch chip"
    ));
  }

  items.push(item(
    r,
    "cube",
    "showroomPanel",
    [-1.5, 0.02, -0.58],
    [0.052, 0.72, 0.48],
    [0, 0.2, 0],
    "product configurator material selector backplate"
  ));

  const selectorRailLines: Vec3[] = [];
  const selectorX = -1.462;
  const selectorMinY = -0.35;
  const selectorMaxY = 0.46;
  const selectorMinZ = -0.86;
  const selectorMaxZ = -0.28;
  selectorRailLines.push(
    [selectorX, selectorMinY, selectorMinZ], [selectorX, selectorMaxY, selectorMinZ],
    [selectorX, selectorMaxY, selectorMinZ], [selectorX, selectorMaxY, selectorMaxZ],
    [selectorX, selectorMaxY, selectorMaxZ], [selectorX, selectorMinY, selectorMaxZ],
    [selectorX, selectorMinY, selectorMaxZ], [selectorX, selectorMinY, selectorMinZ]
  );
  for (let row = 0; row <= 9; row += 1) {
    const yOffset = selectorMinY + row * ((selectorMaxY - selectorMinY) / 9);
    selectorRailLines.push([selectorX, yOffset, selectorMinZ + 0.05], [selectorX, yOffset, selectorMaxZ - 0.04]);
  }
  for (let col = 0; col <= 4; col += 1) {
    const zOffset = selectorMinZ + 0.11 + col * 0.1;
    selectorRailLines.push([selectorX, selectorMinY + 0.05, zOffset], [selectorX, selectorMaxY - 0.04, zOffset]);
  }
  for (let sample = 0; sample < 7; sample += 1) {
    const yOffset = selectorMinY + 0.1 + sample * 0.052;
    const zA = selectorMinZ + 0.18 + Math.sin(time * 0.18 + sample) * 0.022;
    const zB = selectorMinZ + 0.3 + sample * 0.035;
    selectorRailLines.push([selectorX - 0.002, yOffset, zA], [selectorX - 0.002, yOffset + 0.035, zB]);
  }
  pushLineGroup(r, items, selectorRailLines, "showroomGuideStrong", "product configurator material selector value rail");

  const selectorMaterials = ["crimson", "graphite", "titanium", "ceramic", "white", "darkSteel", "showroomEdge", "transparentCyan", "transparentAmber", "crimson"] as const;
  for (let row = 0; row < selectorMaterials.length; row += 1) {
    const yOffset = -0.28 + row * 0.072;
    items.push(item(
      r,
      "cube",
      selectorMaterials[row]!,
      [-1.43, yOffset, -0.82],
      [0.044, 0.034, 0.052],
      [0, 0.22, 0],
      "product configurator material selector swatch"
    ));
    items.push(item(
      r,
      "cube",
      row % 2 === 0 ? "showroomGuideStrong" : "showroomGuide",
      [-1.43, yOffset, -0.55],
      [0.032, 0.011, 0.19 + row * 0.009],
      [0, 0.22, 0],
      "product configurator material selector value rail"
    ));
  }

  for (let meter = 0; meter < 6; meter += 1) {
    items.push(item(
      r,
      "cube",
      meter % 2 ? "transparentAmber" : "transparentCyan",
      [-1.426, 0.14 + meter * 0.052, -0.72 + meter * 0.034],
      [0.036, 0.013, 0.16 + meter * 0.03],
      [0, 0.22, 0],
      "product configurator material selector response meter"
    ));
  }

  return items;
}
