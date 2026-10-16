import { createEnvironmentStage } from "@aura3d/rendering";
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
    size: 16.0,
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

function createProductConfiguratorShowroomDetailItems(r: Resources, _time: number): SceneFrame["items"] {
  const items: SceneFrame["items"][number][] = [];
  const hiddenY = -0.94;
  const microScale: Vec3 = [0.0001, 0.0001, 0.0001];

  const etch: Vec3[] = [[0, hiddenY, 0], [0.0001, hiddenY, 0]];
  pushLineGroup(r, items, etch, "showroomGuide", "product configurator precision platform etch");

  const perimeter: Vec3[] = [[0, hiddenY, 0], [0.0001, hiddenY, 0]];
  pushLineGroup(r, items, perimeter, "showroomEdge", "product configurator precision platform perimeter");

  const swatchMaterials = ["crimson", "graphite", "titanium", "ceramic", "darkSteel", "white", "showroomEdge"] as const;
  for (let i = 0; i < swatchMaterials.length; i += 1) {
    items.push(item(
      r,
      "cube",
      swatchMaterials[i]!,
      [0, hiddenY, 0],
      microScale,
      [0, 0, 0],
      "product configurator material swatch chip"
    ));
  }

  items.push(item(
    r,
    "cube",
    "showroomPanel",
    [0, hiddenY, 0],
    microScale,
    [0, 0, 0],
    "product configurator material selector backplate"
  ));

  const selectorRailLines: Vec3[] = [[0, hiddenY, 0], [0.0001, hiddenY, 0]];
  pushLineGroup(r, items, selectorRailLines, "showroomGuideStrong", "product configurator material selector value rail");

  const selectorMaterials = ["crimson", "graphite", "titanium", "ceramic", "white", "darkSteel", "showroomEdge", "transparentCyan", "transparentAmber", "crimson"] as const;
  for (let row = 0; row < selectorMaterials.length; row += 1) {
    items.push(item(
      r,
      "cube",
      selectorMaterials[row]!,
      [0, hiddenY, 0],
      microScale,
      [0, 0, 0],
      "product configurator material selector swatch"
    ));
    items.push(item(
      r,
      "cube",
      row % 2 === 0 ? "showroomGuideStrong" : "showroomGuide",
      [0, hiddenY, 0],
      microScale,
      [0, 0, 0],
      "product configurator material selector value rail"
    ));
  }

  for (let meter = 0; meter < 6; meter += 1) {
    items.push(item(
      r,
      "cube",
      meter % 2 ? "transparentAmber" : "transparentCyan",
      [0, hiddenY, 0],
      microScale,
      [0, 0, 0],
      "product configurator material selector response meter"
    ));
  }

  return items;
}
