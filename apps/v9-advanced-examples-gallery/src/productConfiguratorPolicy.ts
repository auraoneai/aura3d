import type { GLTFRenderResources } from "@galileo3d/assets";
import type { Material } from "@galileo3d/rendering";

export const PRODUCT_CONFIGURATOR_ROUTE_ID = "product-configurator" as const;

export const PRODUCT_CONFIGURATOR_SCENEBUILDER_PATCH_POINTS = [
  "apps/v9-advanced-examples-gallery/src/sceneBuilders.ts: replace the product-configurator switch branch with an import from a product-specific scene module.",
  "apps/v9-advanced-examples-gallery/src/sceneBuilders.ts: move buildProduct, productBodyMaterial, and productAccentMaterial into that product-specific module.",
  "apps/v9-advanced-examples-gallery/src/main.ts: keep visibleProceduralItems(product-configurator) returning [] while the authored GLB is ready."
] as const;

export const PRODUCT_CONFIGURATOR_AUTHORED_SYSTEMS = [
  "texture-backed concept vehicle hero",
  "texture-backed chronograph watch",
  "texture-backed material variant shoe",
  "texture-backed transparent sunglasses",
  "reusable indoor studio stage",
  "named imported parts",
  "imported material variant controls",
  "selected imported part focus",
  "product exploded view",
  "turntable framing"
] as const;

export const PRODUCT_CONFIGURATOR_ROUTE_LIMITATIONS = [
  "The default Product Configurator route now uses the original texture-backed car, watch, shoe, and sunglasses GLBs as the visual subject; the generated no-texture product-studio fixture is not part of the accepted-fidelity path.",
  "The car, watch, and shoe controls consume real imported KHR_materials_variants metadata through the shared authored-layer pipeline where the source assets expose variants.",
  "G3D still does not expose triangle/bounds raycast picking for imported GLB renderables, so hotspot-style part inspection remains bounded to route-side focus controls.",
  "Exploded view uses route-side name-pattern offsets against imported node names, not a product-aware node graph, variant graph, or authored exploded animation timeline."
] as const;

export const PRODUCT_CONFIGURATOR_DIAGNOSTIC_LABELS = [
  "GLB product",
  "Named parts",
  "KHR variants",
  "Reusable studio",
  "Car variant",
  "Watch variant",
  "Shoe variant",
  "Exploded view",
  "Turntable"
] as const;

export type ProductConfiguratorFocusPart = "lens" | "body" | "sensor" | "battery" | "grip" | "controls";

export interface ProductConfiguratorHotspotTarget {
  readonly focusPart: ProductConfiguratorFocusPart;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

type RgbaTuple = readonly [number, number, number, number];
type ProductFinish = "graphite" | "alloy" | "champagne" | "copper";

const PRODUCT_CONFIGURATOR_STUDIO_ASSET_ID = "product-configurator-studio-blender";

export const PRODUCT_CONFIGURATOR_ORIGINAL_PRODUCT_ASSET_IDS = [
  "chronograph-watch",
  "car-concept",
  "sunglasses-khronos",
  "materials-variants-shoe"
] as const;

export const PRODUCT_CONFIGURATOR_GENERATED_FIXTURE_ASSET_IDS = [
  PRODUCT_CONFIGURATOR_STUDIO_ASSET_ID,
  "car-concept-batched"
] as const;

const ZERO_OFFSET: readonly [number, number, number] = [0, 0, 0];

const PRODUCT_FINISHES = new Set<string>(["graphite", "alloy", "champagne", "copper"]);

const PRODUCT_CONFIGURATOR_FINISH_PROFILES: Record<ProductFinish, {
  readonly carbon: readonly [RgbaTuple, number, number, number, number];
  readonly aluminum: readonly [RgbaTuple, number, number, number, number];
  readonly champagne: readonly [RgbaTuple, number, number, number, number];
  readonly copper: readonly [RgbaTuple, number, number, number, number];
}> = {
  graphite: {
    carbon: [[0.028, 0.034, 0.038, 1], 0.42, 0.32, 0.14, 0.22],
    aluminum: [[0.72, 0.76, 0.76, 1], 0.84, 0.28, 0.16, 0.24],
    champagne: [[0.82, 0.62, 0.36, 1], 0.62, 0.34, 0.14, 0.2],
    copper: [[0.74, 0.34, 0.14, 1], 0.68, 0.36, 0.14, 0.2]
  },
  alloy: {
    carbon: [[0.045, 0.049, 0.052, 1], 0.18, 0.46, 0.12, 0.16],
    aluminum: [[0.86, 0.88, 0.86, 1], 0.86, 0.34, 0.18, 0.26],
    champagne: [[0.52, 0.47, 0.39, 1], 0.44, 0.48, 0.1, 0.14],
    copper: [[0.58, 0.27, 0.13, 1], 0.52, 0.5, 0.1, 0.14]
  },
  champagne: {
    carbon: [[0.038, 0.034, 0.03, 1], 0.24, 0.48, 0.1, 0.14],
    aluminum: [[0.72, 0.62, 0.48, 1], 0.68, 0.38, 0.14, 0.2],
    champagne: [[1.0, 0.74, 0.38, 1], 0.74, 0.31, 0.18, 0.25],
    copper: [[0.66, 0.32, 0.16, 1], 0.54, 0.48, 0.1, 0.14]
  },
  copper: {
    carbon: [[0.03, 0.032, 0.032, 1], 0.22, 0.5, 0.09, 0.14],
    aluminum: [[0.42, 0.44, 0.44, 1], 0.72, 0.42, 0.12, 0.18],
    champagne: [[0.5, 0.42, 0.3, 1], 0.46, 0.52, 0.08, 0.12],
    copper: [[1.0, 0.43, 0.16, 1], 0.82, 0.32, 0.18, 0.24]
  }
};

const PRODUCT_CONFIGURATOR_PROCEDURAL_ARTIFACT_LABELS = new Set([
  "overhead product strip light",
  "studio reflection streak"
]);

const PRODUCT_CONFIGURATOR_ORIGINAL_PRODUCT_ASSET_ID_SET = new Set<string>(PRODUCT_CONFIGURATOR_ORIGINAL_PRODUCT_ASSET_IDS);
const PRODUCT_CONFIGURATOR_GENERATED_FIXTURE_ASSET_ID_SET = new Set<string>(PRODUCT_CONFIGURATOR_GENERATED_FIXTURE_ASSET_IDS);

const PRODUCT_CONFIGURATOR_HOTSPOT_CANDIDATE_LABEL = /product configurator|hotspot|swatch|control|grip/i;

export interface ProductConfiguratorMaterialControlPlan {
  readonly assetId: string;
  readonly controlKey?: string;
  readonly selectedVariant?: string;
  readonly targetCount: number;
  readonly uniqueMaterialCount: number;
  readonly usedMetadata: boolean;
  readonly source: "GLTFRenderResources.materialVariants" | "not-applicable";
  readonly targetMaterialKeys: readonly string[];
  readonly targetSourceMaterials: readonly string[];
  readonly limitation?: string;
}

const HOTSPOT_LABEL_TO_FOCUS: readonly [RegExp, ProductConfiguratorFocusPart][] = [
  [/lens-material|hotspot.*lens|target.*lens/i, "lens"],
  [/body-finish|hotspot.*body|target.*body/i, "body"],
  [/sensor-module|hotspot.*sensor|target.*sensor/i, "sensor"],
  [/battery-sled|hotspot.*battery|target.*battery/i, "battery"],
  [/ribbed grip|material swatch.*rubber|target.*grip|grip shell/i, "grip"],
  [/control-dial|hotspot.*control|target.*control|mode selector|shutter crown/i, "controls"]
] as const;

export function isProductConfiguratorProceduralArtifactLabel(label: string): boolean {
  return PRODUCT_CONFIGURATOR_PROCEDURAL_ARTIFACT_LABELS.has(label);
}

export function isProductConfiguratorOriginalProductAssetId(assetId: string): boolean {
  return PRODUCT_CONFIGURATOR_ORIGINAL_PRODUCT_ASSET_ID_SET.has(assetId);
}

export function isGeneratedProductConfiguratorFixtureAssetId(assetId: string): boolean {
  return PRODUCT_CONFIGURATOR_GENERATED_FIXTURE_ASSET_ID_SET.has(assetId);
}

export function isProductConfiguratorHotspotCandidateLabel(label: string): boolean {
  return PRODUCT_CONFIGURATOR_HOTSPOT_CANDIDATE_LABEL.test(label);
}

export function focusPartForProductConfiguratorImportedLabel(label: string): ProductConfiguratorFocusPart | undefined {
  for (const [pattern, focusPart] of HOTSPOT_LABEL_TO_FOCUS) {
    if (pattern.test(label)) return focusPart;
  }
  return undefined;
}

export function applyProductConfiguratorRuntimeMaterialControls(
  assetId: string,
  resources: GLTFRenderResources,
  controls: Readonly<Record<string, unknown>>
): void {
  if (assetId !== PRODUCT_CONFIGURATOR_STUDIO_ASSET_ID) return;
  const profile = PRODUCT_CONFIGURATOR_FINISH_PROFILES[productFinishForControls(controls)];
  applyProductMaterialTargets(resources, /deep satin carbon fiber product shell|recessed carbon optical core|carbon/i, profile.carbon);
  applyProductMaterialTargets(resources, /bead blasted silver aluminum|machined silver|brushed aluminum|side spine|top command bridge|aluminum/i, profile.aluminum);
  applyProductMaterialTargets(resources, /champagne anodized variant|champagne retaining|structural bridge|removable battery sled|champagne/i, profile.champagne);
  applyProductMaterialTargets(resources, /copper thermal module|lower copper|copper terminal|copper/i, profile.copper);
  for (const target of resources.collectMaterialOverrideTargets({ sourceMaterialName: /smoked sapphire transparent glass|clear cyan coated optical glass/i })) {
    applyProductGlassMaterial(target.material, [0.055, 0.18, 0.23, 0.34], 0.36, 0.05);
  }
  for (const target of resources.collectMaterialOverrideTargets({ sourceMaterialName: /transparent configurator ui glass/i })) {
    applyProductGlassMaterial(target.material, [0.035, 0.16, 0.22, 0.18], 0.46, 0.12);
  }
  for (const target of resources.collectMaterialOverrideTargets({ sourceMaterialName: /active oled configurator display|cyan hotspot emissive|amber selection state emissive|soft white etched component labels/i })) {
    target.material.setParameter("u_environmentSpecularIntensity", 0.08);
    target.material.setParameter("u_specularFactor", 0.08);
  }
}

export function productConfiguratorImportedMaterialControlPlan(
  assetId: string,
  resources: GLTFRenderResources,
  options: {
    readonly controlKey?: string;
    readonly selectedVariant?: string;
  } = {}
): ProductConfiguratorMaterialControlPlan {
  if (!isProductConfiguratorOriginalProductAssetId(assetId)) {
    return {
      assetId,
      ...(options.controlKey ? { controlKey: options.controlKey } : {}),
      ...(options.selectedVariant ? { selectedVariant: options.selectedVariant } : {}),
      targetCount: 0,
      uniqueMaterialCount: 0,
      usedMetadata: false,
      source: "not-applicable",
      targetMaterialKeys: [],
      targetSourceMaterials: [],
      limitation: "Generated/support Product fixtures may not prove imported material-control binding for the accepted Product route."
    };
  }
  if (!options.selectedVariant) {
    return {
      assetId,
      ...(options.controlKey ? { controlKey: options.controlKey } : {}),
      targetCount: 0,
      uniqueMaterialCount: 0,
      usedMetadata: false,
      source: "not-applicable",
      targetMaterialKeys: [],
      targetSourceMaterials: [],
      limitation: "No selected imported material variant was active for this Product asset."
    };
  }
  const targets = resources.collectMaterialOverrideTargets({
    variant: options.selectedVariant,
    uniqueMaterials: false
  });
  const targetMaterialKeys = [...new Set(targets.map((target) => target.materialKey))].sort();
  const targetSourceMaterials = [...new Set(targets.map((target) => target.sourceMaterialName))].sort();
  return {
    assetId,
    ...(options.controlKey ? { controlKey: options.controlKey } : {}),
    selectedVariant: options.selectedVariant,
    targetCount: targets.length,
    uniqueMaterialCount: targetMaterialKeys.length,
    usedMetadata: targets.length > 0,
    source: targets.length > 0 ? "GLTFRenderResources.materialVariants" : "not-applicable",
    targetMaterialKeys,
    targetSourceMaterials,
    ...(targets.length === 0 ? { limitation: "The selected Product control did not resolve to imported GLTF material-variant mappings." } : {})
  };
}

export function productConfiguratorMaterialOverrideTargetCount(resources: GLTFRenderResources): number {
  const patterns = [
    /deep satin carbon fiber product shell|recessed carbon optical core|carbon/i,
    /bead blasted silver aluminum|machined silver|brushed aluminum|side spine|top command bridge|aluminum/i,
    /champagne anodized variant|champagne retaining|structural bridge|removable battery sled|champagne/i,
    /copper thermal module|lower copper|copper terminal|copper/i,
    /smoked sapphire transparent glass|clear cyan coated optical glass/i,
    /transparent configurator ui glass/i,
    /active oled configurator display|cyan hotspot emissive|amber selection state emissive|soft white etched component labels/i
  ];
  const materialKeys = new Set<string>();
  for (const sourceMaterialName of patterns) {
    for (const target of resources.collectMaterialOverrideTargets({ sourceMaterialName })) {
      materialKeys.add(target.materialKey);
    }
  }
  return materialKeys.size;
}

export function productConfiguratorFocusOffset(
  assetId: string,
  nodeName: string,
  controls: Readonly<Record<string, unknown>>
): readonly [number, number, number] {
  if (assetId !== PRODUCT_CONFIGURATOR_STUDIO_ASSET_ID) return ZERO_OFFSET;
  const focus = String(controls.focusPart ?? "overview");
  if (focus === "overview") return ZERO_OFFSET;
  if (focus === "lens" && /lens|optical|aperture|retaining ring|coating|sapphire|hotspot.*lens-material|lens-material|named component.*lens|material swatch.*glass/i.test(nodeName)) {
    return [0, 0.08, -0.16];
  }
  if (focus === "body" && /chassis|body-finish|carbon optical core|side spine|structural bridge|hotspot.*body|material swatch.*alloy|material swatch.*carbon/i.test(nodeName)) {
    return [0, 0.1, 0];
  }
  if (focus === "sensor" && /sensor|logic board|circuit board|oled|standoff|hotspot.*sensor-module|sensor-module|named component.*sensor/i.test(nodeName)) {
    return [0, 0.08, 0.16];
  }
  if (focus === "battery" && /battery|terminal|hotspot.*battery-sled|battery-sled|named component.*battery/i.test(nodeName)) {
    return [0.14, -0.04, 0.12];
  }
  if (focus === "grip" && /grip|ribbed|hotspot.*body-finish|named component.*ribbed grip|material swatch.*rubber/i.test(nodeName)) {
    if (/left/i.test(nodeName)) return [-0.14, 0.04, 0.02];
    if (/right/i.test(nodeName)) return [0.14, 0.04, 0.02];
    return [0, 0.05, 0.08];
  }
  if (focus === "controls" && /control|dial|crown|status slit|mode selector|command bridge|hotspot.*control-dial|control-dial/i.test(nodeName)) {
    return [0, 0.13, 0];
  }
  return ZERO_OFFSET;
}

export function explodedProductPartOffset(
  assetId: string,
  nodeNameOrPath: string | readonly string[]
): readonly [number, number, number] {
  const nodePath = typeof nodeNameOrPath === "string" ? nodeNameOrPath : nodeNameOrPath.join(" ");
  if (assetId === "car-concept") return explodedOriginalCarPartOffset(nodePath);
  if (assetId !== PRODUCT_CONFIGURATOR_STUDIO_ASSET_ID) return ZERO_OFFSET;
  const nodeName = nodePath;
  if (/sensor|logic board|circuit board|oled|standoff/i.test(nodeName)) return [0, 0.18, 0.28];
  if (/lens|optical|aperture|retaining ring|coating/i.test(nodeName)) return [0, 0.18, -0.28];
  if (/battery|terminal/i.test(nodeName)) return [0.22, -0.1, 0.16];
  if (/left .*grip|left .*spine|left grip/i.test(nodeName)) return [-0.26, 0.06, 0.02];
  if (/right .*grip|right .*spine|right grip/i.test(nodeName)) return [0.26, 0.06, 0.02];
  if (/heat sink|thermal|lower copper/i.test(nodeName)) return [0, -0.18, 0.08];
  if (/chassis shell|structural bridge|control dial|shutter crown|status slit|mode selector/i.test(nodeName)) return [0, 0.08, 0];
  if (/swatch|hotspot|station|studio|floor|plinth|softbox|panel|leader|nameplate|label|separation|turntable|tile|baffle|cove|trough|calibration|readout|shelf|rig|cable|light/i.test(nodeName)) return [0, 0, 0];
  return [0, 0, 0];
}

function explodedOriginalCarPartOffset(nodePath: string): readonly [number, number, number] {
  if (/WheelFrontL|WheelRearL/i.test(nodePath)) return [-0.1, -0.02, 0.04];
  if (/WheelFrontR|WheelRearR/i.test(nodePath)) return [0.1, -0.02, 0.04];
  if (/BodyDoorLColor1|BodyDoorL/i.test(nodePath)) return [-0.1, 0.03, 0.02];
  if (/BodyDoorRColor1|BodyDoorR/i.test(nodePath)) return [0.1, 0.03, 0.02];
  if (/BodyHood/i.test(nodePath)) return [0, 0.04, -0.1];
  if (/BodyRearPanelsColor1|BodyRear|BodyTaillights|BodyTurnsignalsRear/i.test(nodePath)) return [0, 0.04, 0.1];
  return ZERO_OFFSET;
}

function productFinishForControls(controls: Readonly<Record<string, unknown>>): ProductFinish {
  const requested = String(controls.finish ?? "graphite");
  return PRODUCT_FINISHES.has(requested) ? requested as ProductFinish : "graphite";
}

function applyProductMaterialTargets(
  resources: GLTFRenderResources,
  sourceMaterialName: RegExp,
  params: readonly [RgbaTuple, number, number, number, number]
): void {
  for (const target of resources.collectMaterialOverrideTargets({ sourceMaterialName })) {
    applyProductPbrMaterial(target.material, params);
  }
}

function applyProductPbrMaterial(
  material: Material,
  params: readonly [RgbaTuple, number, number, number, number]
): void {
  const [baseColor, metallic, roughness, specular, environmentSpecular] = params;
  material.setParameter("u_baseColor", baseColor);
  material.setParameter("u_metallic", metallic);
  material.setParameter("u_roughness", roughness);
  material.setParameter("u_specularFactor", specular);
  material.setParameter("u_environmentSpecularIntensity", environmentSpecular);
  material.setParameter("u_clearcoatFactor", 0);
  material.setParameter("u_iridescenceFactor", 0);
}

function applyProductGlassMaterial(
  material: Material,
  baseColor: RgbaTuple,
  roughness: number,
  emissiveStrength: number
): void {
  material.setParameter("u_baseColor", baseColor);
  material.setParameter("u_transmissionFactor", 0);
  material.setParameter("u_diffuseTransmissionFactor", 0);
  material.setParameter("u_transmissionFallbackEnergy", 0);
  material.setParameter("u_volumeThicknessFactor", 0);
  material.setParameter("u_roughness", roughness);
  material.setParameter("u_specularFactor", 0.04);
  material.setParameter("u_environmentSpecularIntensity", 0.08);
  material.setParameter("u_emissiveStrength", emissiveStrength);
  material.setParameter("u_ior", 1.08);
}
