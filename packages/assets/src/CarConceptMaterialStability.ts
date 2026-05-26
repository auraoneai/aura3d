import type { Material, RenderState, UniformValue } from "@aura3d/rendering";
import type { GLTFMaterialRenderStateOverride } from "./GLTFRenderResources";

export type CarConceptMaterialStabilityProfile = "gallery" | "cinematic";

export interface CarConceptMaterialBaseline {
  readonly roughness?: number;
  readonly metallic?: number;
  readonly clearcoat?: number;
}

export interface CarConceptMaterialStabilityOptions {
  readonly materialKey?: string;
  readonly sourceMaterialName?: string;
  readonly nodeName?: string;
  readonly profile?: CarConceptMaterialStabilityProfile;
  readonly baseline?: CarConceptMaterialBaseline;
  readonly roughnessScale?: number;
  readonly metallicScale?: number;
  readonly clearcoatBoost?: number;
}

const BODY_PATTERN = /Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color|Panel Sides|BodyRoofPanel|BodyPillars|Upper Shell|UpperShell|BodyUpper|UpperBody|Secondary Panel|Wheel ?Arch|Wheelarches|WheelWell|WheelHouse|Fender|Side ?(Panel|Surface)/i;
const GLASS_PATTERN = /Glass|Window|Windshield|Canopy|Headlight|Taillight|Brakelight|Signallight|Turnsignal|Light ?Lens|\bLens\b/i;
const LICENSE_PATTERN = /License(?: Plate)?|LicensePlate|Number ?Plate/i;
const LIGHT_LENS_PATTERN = /Headlight|Taillight|Brakelight|Signallight|Turnsignal|Signal ?Light|Light ?Lens|\bLens\b|BodyHeadlights|BodyTaillights|BodyTurnsignals/i;
const DETAIL_PATTERN = /Tireside|Tiretread|Rim[12]|Disc|Brake|Hardware|Mirror|Dashboard|Mechanical|Interior|Floormat|material[-_ ]?2|Gasket|Wiper|Handle|HoodTopgrill|TaillightsPanels|Trim|Moulding|Molding|Weatherstrip|Seal|Wheel ?Arch|Wheelarches|WheelWell|WheelHouse|License(?: Plate)?|LicensePlate|Number ?Plate/i;
const DARK_TRIM_PATTERN = /Gasket|Wiper|Handle|Mirror|HoodTopgrill|TaillightsPanels|Hardware|material[-_ ]?2|\bTrim\b|Moulding|Molding|Weatherstrip|Seal/i;

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

interface CarConceptMaterialRuntimeSurface {
  readonly opacity: number;
  readonly alphaTest: number;
  readonly transmission: number;
  readonly clearcoat: number;
  readonly specular: number;
  readonly metalness: number;
  readonly roughness: number;
  readonly envMapIntensity: number;
  readonly emissive: Rgb;
  readonly toneMapped: boolean;
}

interface GalleryCarConceptRoleSurface extends CarConceptMaterialRuntimeSurface {
  readonly baseColor: Rgba;
  readonly baseColorTextureEnabled: number;
  readonly normalTextureEnabled: number;
  readonly normalScale: number;
  readonly occlusionTextureEnabled: number;
  readonly occlusionStrength: number;
  readonly metallic: number;
  readonly specularColorFactor: Rgb;
  readonly clearcoatRoughness: number;
  readonly materialEnvironmentSpecularScale: number;
  readonly emissiveStrength: number;
}

const GALLERY_ROLE_SURFACES: Record<Exclude<CarConceptMaterialVisualRole, "unclassified">, GalleryCarConceptRoleSurface> = {
  "body-primary-paint": {
    baseColor: [0.72, 0.0065, 0.0038, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.32,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.18,
    metallic: 0.06,
    roughness: 0.22,
    specular: 0.62,
    specularColorFactor: [0.56, 0.044, 0.028],
    clearcoat: 0.62,
    clearcoatRoughness: 0.28,
    materialEnvironmentSpecularScale: 0.28,
    envMapIntensity: 0.28,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0.06,
    toneMapped: true
  },
  "body-secondary-paint": {
    baseColor: [0.14, 0.0024, 0.0016, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.28,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.2,
    metallic: 0.035,
    roughness: 0.31,
    specular: 0.38,
    specularColorFactor: [0.34, 0.034, 0.024],
    clearcoat: 0.4,
    clearcoatRoughness: 0.4,
    materialEnvironmentSpecularScale: 0.17,
    envMapIntensity: 0.17,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0.035,
    toneMapped: true
  },
  "roof-panel": {
    baseColor: [0.024, 0.028, 0.03, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.24,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.34,
    metallic: 0.02,
    roughness: 0.34,
    specular: 0.22,
    specularColorFactor: [0.11, 0.13, 0.14],
    clearcoat: 0.24,
    clearcoatRoughness: 0.42,
    materialEnvironmentSpecularScale: 0.072,
    envMapIntensity: 0.072,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0.02,
    toneMapped: true
  },
  "side-panel": {
    baseColor: [0.026, 0.004, 0.0026, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.42,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.62,
    metallic: 0.015,
    roughness: 0.48,
    specular: 0.11,
    specularColorFactor: [0.12, 0.032, 0.022],
    clearcoat: 0.08,
    clearcoatRoughness: 0.62,
    materialEnvironmentSpecularScale: 0.04,
    envMapIntensity: 0.04,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0.015,
    toneMapped: true
  },
  "pillar-trim": {
    baseColor: [0.014, 0.016, 0.018, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 0,
    normalScale: 0,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.018,
    metallic: 0,
    roughness: 0.74,
    specular: 0.026,
    specularColorFactor: [0.032, 0.03, 0.028],
    clearcoat: 0,
    clearcoatRoughness: 1,
    materialEnvironmentSpecularScale: 0.006,
    envMapIntensity: 0.006,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  },
  "dark-trim": {
    baseColor: [0.012, 0.012, 0.013, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 0,
    normalScale: 0,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.018,
    metallic: 0,
    roughness: 0.74,
    specular: 0.026,
    specularColorFactor: [0.032, 0.03, 0.028],
    clearcoat: 0,
    clearcoatRoughness: 1,
    materialEnvironmentSpecularScale: 0.006,
    envMapIntensity: 0.006,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  },
  glass: {
    baseColor: [0.008, 0.018, 0.024, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 0,
    normalScale: 0,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.12,
    metallic: 0,
    roughness: 0.28,
    specular: 0.16,
    specularColorFactor: [0.055, 0.072, 0.086],
    clearcoat: 0.06,
    clearcoatRoughness: 0.48,
    materialEnvironmentSpecularScale: 0.052,
    envMapIntensity: 0.052,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  },
  "light-lens": {
    baseColor: [0.018, 0.014, 0.012, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 0,
    normalScale: 0,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.05,
    metallic: 0,
    roughness: 0.42,
    specular: 0.09,
    specularColorFactor: [0.08, 0.056, 0.04],
    clearcoat: 0.04,
    clearcoatRoughness: 0.66,
    materialEnvironmentSpecularScale: 0.018,
    envMapIntensity: 0.018,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  },
  "license-plate": {
    baseColor: [0.46, 0.44, 0.38, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 0,
    normalScale: 0,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.28,
    metallic: 0,
    roughness: 0.78,
    specular: 0.04,
    specularColorFactor: [0.042, 0.04, 0.035],
    clearcoat: 0,
    clearcoatRoughness: 1,
    materialEnvironmentSpecularScale: 0.006,
    envMapIntensity: 0.006,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  },
  tire: {
    baseColor: [0.014, 0.014, 0.013, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.24,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.18,
    metallic: 0,
    roughness: 0.78,
    specular: 0.038,
    specularColorFactor: [0.035, 0.035, 0.034],
    clearcoat: 0,
    clearcoatRoughness: 1,
    materialEnvironmentSpecularScale: 0.012,
    envMapIntensity: 0.012,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  },
  "wheel-metal": {
    baseColor: [0.46, 0.44, 0.38, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.07,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.055,
    metallic: 0.9,
    roughness: 0.22,
    specular: 0.52,
    specularColorFactor: [0.5, 0.46, 0.38],
    clearcoat: 0.08,
    clearcoatRoughness: 1,
    materialEnvironmentSpecularScale: 0.16,
    envMapIntensity: 0.16,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0.9,
    toneMapped: true
  },
  brake: {
    baseColor: [0.48, 0.028, 0.018, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.06,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.08,
    metallic: 0,
    roughness: 0.62,
    specular: 0.055,
    specularColorFactor: [0.055, 0.026, 0.018],
    clearcoat: 0,
    clearcoatRoughness: 1,
    materialEnvironmentSpecularScale: 0.012,
    envMapIntensity: 0.012,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  },
  interior: {
    baseColor: [0.22, 0.048, 0.036, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.085,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.08,
    metallic: 0,
    roughness: 0.52,
    specular: 0.09,
    specularColorFactor: [0.09, 0.046, 0.035],
    clearcoat: 0.035,
    clearcoatRoughness: 0.72,
    materialEnvironmentSpecularScale: 0.025,
    envMapIntensity: 0.025,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  },
  mechanical: {
    baseColor: [0.012, 0.012, 0.012, 1],
    baseColorTextureEnabled: 0,
    normalTextureEnabled: 1,
    normalScale: 0.06,
    occlusionTextureEnabled: 1,
    occlusionStrength: 0.08,
    metallic: 0,
    roughness: 0.74,
    specular: 0.026,
    specularColorFactor: [0.028, 0.028, 0.026],
    clearcoat: 0,
    clearcoatRoughness: 1,
    materialEnvironmentSpecularScale: 0.008,
    envMapIntensity: 0.008,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    opacity: 1,
    alphaTest: 0,
    transmission: 0,
    metalness: 0,
    toneMapped: true
  }
};

export type CarConceptMaterialVisualRole =
  | "body-primary-paint"
  | "body-secondary-paint"
  | "roof-panel"
  | "side-panel"
  | "pillar-trim"
  | "dark-trim"
  | "glass"
  | "light-lens"
  | "license-plate"
  | "tire"
  | "wheel-metal"
  | "brake"
  | "interior"
  | "mechanical"
  | "unclassified";

export interface CarConceptMaterialVisualRoleContext {
  readonly materialKey?: string;
  readonly sourceMaterialName?: string;
  readonly nodeName?: string;
}

export function carConceptMaterialRenderStateOverrides(
  context: "product-configurator" | "current-routes-flagship" = "product-configurator"
): readonly GLTFMaterialRenderStateOverride[] {
  const product = context === "product-configurator";
  return [
    {
      materialName: BODY_PATTERN,
      renderState: { cullMode: "back", blend: false, depthTest: true, depthWrite: true },
      reason: product
        ? "Product car body panels are double-sided in the source GLB; culling back faces prevents subpixel bright seam halos without hiding the original car asset."
        : "Concept-car body panels must not render as double-sided HDR edge overlays in the currentRoutes flagship viewer."
    },
    {
      materialName: GLASS_PATTERN,
      renderState: { cullMode: "back", blend: false, depthTest: true, depthWrite: true },
      reason: product
        ? "Product car glass is rendered as depth-writing dark glazing because the source transmissive/no-depth overlay creates pale HDR silhouette speckle around the windshield and roofline."
        : "Concept-car glass has transmission metadata, but this viewer has no scene-color refraction pass; opaque depth-writing glass prevents white no-depth halos."
    },
    {
      materialName: DETAIL_PATTERN,
      renderState: { cullMode: "back", blend: false, depthTest: true, depthWrite: true },
      reason: product
        ? "Product wheel, tire, trim, and interior detail should not render as blended/no-depth overlay noise in the car hero."
        : "Concept-car trim, wheels, and interior detail must not render as blended HDR speckle overlays."
    }
  ];
}

export function applyCarConceptMaterialStability(
  material: Material,
  options: CarConceptMaterialStabilityOptions = {}
): void {
  const profile = options.profile ?? "gallery";
  if (profile === "cinematic") {
    applyCinematicCarConceptMaterialStability(material, options);
    return;
  }
  applyGalleryCarConceptMaterialStability(material, options);
}

export function carConceptMaterialVisualRole(
  context: CarConceptMaterialVisualRoleContext
): CarConceptMaterialVisualRole {
  const node = context.nodeName ?? "";
  const materialName = `${context.materialKey ?? ""} ${context.sourceMaterialName ?? ""}`;
  const identity = `${node} ${materialName}`;

  if (/BodyRoofPanel|\bRoof\b|Upper Shell|UpperShell|BodyUpper|UpperBody|Top(Panel|Shell)|CanopyPanel|Canopy Shell/i.test(identity)) return "roof-panel";
  if (/Panel Sides|mesh-85-primitive|Side ?(Panel|Panels|Surface|Surfaces|Skirt|Sill)|Wheel ?Arch|Wheelarches|WheelWell|WheelHouse|Fender|QuarterPanel|Rocker/i.test(identity)) return "side-panel";
  if (/BodyPillars|PillarTrim|(^|\b)[ABC][-_ ]?Pillar/i.test(identity)) return "pillar-trim";
  if (LICENSE_PATTERN.test(identity)) return "license-plate";
  if (/Tireside|Tiretread|mesh-(89|91|93|95)-primitive/i.test(identity)) return "tire";
  if (/BrakePad/i.test(node) || (/\bBrake\b/i.test(materialName) && !/Brakelight|Brake Light/i.test(identity))) return "brake";
  if (/Rim[12]|BrakeDisc|Disc|mesh-(90|92|94|96)-primitive/i.test(identity)) return "wheel-metal";
  if (/Interior|Dashboard|Seats|Steering|Pedal|Floormat|Cockpit|Cabin|Console/i.test(identity)) return "interior";
  if (/Mechanical|Engine|Axles|BodyUnderside|BodyHoodUnder/i.test(identity)) return "mechanical";
  if (DARK_TRIM_PATTERN.test(identity)) return "dark-trim";
  if (LIGHT_LENS_PATTERN.test(identity)) return "light-lens";
  if (GLASS_PATTERN.test(identity)) return "glass";
  if (/BodyDoor.*Color1|BodyHood$|BodyRearPanelsColor1|Paint 1 (Carmine|Pearl|Pearly|Graphite)/i.test(identity)) return "body-primary-paint";
  if (/BodyDoor.*Color2|BodyPanelsColor2|Paint 2 (Carmine|Pearl|Pearly|Graphite)|Secondary Panel/i.test(identity)) return "body-secondary-paint";
  if (/^Body/i.test(node) && /Panel|Shell|Surface|Door|Hood|Fender|Arch/i.test(node)) {
    return /Color2|Secondary|Paint 2/i.test(identity) ? "body-secondary-paint" : "body-primary-paint";
  }
  return "unclassified";
}

function applyGalleryCarConceptMaterialStability(
  material: Material,
  options: Pick<CarConceptMaterialStabilityOptions, "materialKey" | "sourceMaterialName" | "nodeName">
): void {
  const name = `${options.materialKey ?? ""} ${options.sourceMaterialName ?? ""} ${material.name}`;
  const role = options.nodeName ? carConceptMaterialVisualRole(options) : "unclassified";
  if (/Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color/i.test(name)) {
    if (/Paint 1 Carmine|Body.*Color/i.test(name)) {
      material.setParameter("u_baseColor", [0.42, 0.008, 0.005, 1]);
    }
    if (/Paint 2 Carmine/i.test(name)) {
      material.setParameter("u_baseColor", [0.24, 0.016, 0.012, 1]);
    }
    if (/Paint [12] (Pearl|Pearly)/i.test(name)) {
      material.setParameter("u_baseColor", [0.34, 0.18, 0.15, 1]);
    }
    if (/Paint [12] Graphite/i.test(name)) {
      material.setParameter("u_baseColor", [0.08, 0.088, 0.092, 1]);
    }
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.035);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.035);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.37);
    material.setParameter("u_specularFactor", 0.22);
    material.setParameter("u_specularColorFactor", [0.28, 0.05, 0.034]);
    material.setParameter("u_clearcoatTextureEnabled", 0);
    material.setParameter("u_clearcoatRoughnessTextureEnabled", 0);
    material.setParameter("u_clearcoatNormalTextureEnabled", 0);
    material.setParameter("u_clearcoatNormalScale", 0);
    material.setParameter("u_clearcoatFactor", 0.28);
    material.setParameter("u_clearcoatRoughnessFactor", 0.58);
    material.setParameter("u_iridescenceTextureEnabled", 0);
    material.setParameter("u_iridescenceThicknessTextureEnabled", 0);
    material.setParameter("u_iridescenceFactor", 0);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.055);
    if (/Paint 1 Carmine|Body.*Color/i.test(name)) {
      material.setParameter("u_normalScale", 0.052);
      material.setParameter("u_occlusionStrength", 0.052);
      material.setParameter("u_metallic", 0.08);
      material.setParameter("u_roughness", 0.34);
      material.setParameter("u_specularFactor", 0.18);
      material.setParameter("u_specularColorFactor", [0.18, 0.03, 0.02]);
      material.setParameter("u_clearcoatFactor", 0.18);
      material.setParameter("u_clearcoatRoughnessFactor", 0.68);
      material.setParameter("u_materialEnvironmentSpecularScale", 0.06);
    }
    if (/Paint 2 Carmine/i.test(name)) {
      material.setParameter("u_normalScale", 0.034);
      material.setParameter("u_occlusionStrength", 0.07);
      material.setParameter("u_metallic", 0.05);
      material.setParameter("u_roughness", 0.46);
      material.setParameter("u_specularFactor", 0.1);
      material.setParameter("u_specularColorFactor", [0.095, 0.03, 0.024]);
      material.setParameter("u_clearcoatFactor", 0.09);
      material.setParameter("u_clearcoatRoughnessFactor", 0.72);
      material.setParameter("u_materialEnvironmentSpecularScale", 0.028);
    }
    if (/Paint [12] (Pearl|Pearly)/i.test(name)) {
      material.setParameter("u_baseColor", [0.34, 0.18, 0.15, 1]);
      material.setParameter("u_normalScale", 0.016);
      material.setParameter("u_occlusionStrength", 0.026);
      material.setParameter("u_roughness", 0.58);
      material.setParameter("u_specularFactor", 0.065);
      material.setParameter("u_specularColorFactor", [0.07, 0.046, 0.04]);
      material.setParameter("u_clearcoatFactor", 0.055);
      material.setParameter("u_clearcoatRoughnessFactor", 0.72);
      material.setParameter("u_materialEnvironmentSpecularScale", 0.014);
    }
    if (/Paint [12] Graphite/i.test(name)) {
      material.setParameter("u_normalScale", 0.014);
      material.setParameter("u_occlusionStrength", 0.02);
      material.setParameter("u_roughness", 0.62);
      material.setParameter("u_specularFactor", 0.045);
      material.setParameter("u_specularColorFactor", [0.045, 0.047, 0.05]);
      material.setParameter("u_clearcoatFactor", 0.04);
      material.setParameter("u_clearcoatRoughnessFactor", 0.68);
      material.setParameter("u_materialEnvironmentSpecularScale", 0.012);
    }
  }
  applyGalleryCarConceptLegacyRoleBlocks(material, name);
  if (role !== "unclassified") {
    applyGalleryCarConceptMaterialVisualRoleStability(material, role);
    finalizeGalleryCarConceptMaterialVisualRole(material, role, options);
  } else if (BODY_PATTERN.test(name) || GLASS_PATTERN.test(name) || DETAIL_PATTERN.test(name)) {
    applyCarConceptOpaqueRuntimeSurface(material, {
      opacity: 1,
      alphaTest: 0,
      transmission: 0,
      clearcoat: numberParameter(material, "u_clearcoatFactor") ?? 0,
      specular: numberParameter(material, "u_specularFactor") ?? 0,
      metalness: numberParameter(material, "u_metallic") ?? 0,
      roughness: numberParameter(material, "u_roughness") ?? 0.72,
      envMapIntensity: numberParameter(material, "u_materialEnvironmentSpecularScale") ?? 0,
      emissive: vector3Parameter(material, "u_emissiveColor") ?? [0, 0, 0],
      toneMapped: true
    });
  }
}

function applyGalleryCarConceptMaterialVisualRoleStability(
  material: Material,
  role: CarConceptMaterialVisualRole
): void {
  disableCarConceptHdrExtensionEscape(material);

  if (role === "body-primary-paint") {
    material.setParameter("u_baseColor", [0.9, 0.012, 0.0065, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.56);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.78);
    material.setParameter("u_metallic", 0.08);
    material.setParameter("u_roughness", 0.28);
    material.setParameter("u_specularFactor", 0.48);
    material.setParameter("u_specularColorFactor", [0.48, 0.055, 0.035]);
    material.setParameter("u_clearcoatFactor", 0.52);
    material.setParameter("u_clearcoatRoughnessFactor", 0.34);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.24);
  }
  if (role === "body-secondary-paint") {
    material.setParameter("u_baseColor", [0.2, 0.004, 0.0024, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.48);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.72);
    material.setParameter("u_metallic", 0.035);
    material.setParameter("u_roughness", 0.36);
    material.setParameter("u_specularFactor", 0.26);
    material.setParameter("u_specularColorFactor", [0.26, 0.043, 0.028]);
    material.setParameter("u_clearcoatFactor", 0.28);
    material.setParameter("u_clearcoatRoughnessFactor", 0.46);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.13);
  }
  if (role === "roof-panel") {
    material.setParameter("u_baseColor", [0.072, 0.067, 0.064, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.026);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.06);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.48);
    material.setParameter("u_specularFactor", 0.085);
    material.setParameter("u_specularColorFactor", [0.08, 0.075, 0.07]);
    material.setParameter("u_clearcoatFactor", 0.09);
    material.setParameter("u_clearcoatRoughnessFactor", 0.62);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.024);
  }
  if (role === "pillar-trim" || role === "dark-trim") {
    material.setParameter("u_baseColor", role === "pillar-trim" ? [0.014, 0.016, 0.018, 1] : [0.012, 0.012, 0.013, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 0);
    material.setParameter("u_normalScale", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.018);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.74);
    material.setParameter("u_specularFactor", 0.026);
    material.setParameter("u_specularColorFactor", [0.032, 0.03, 0.028]);
    material.setParameter("u_clearcoatFactor", 0);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.006);
  }
  if (role === "glass") {
    material.setParameter("u_baseColor", [0.018, 0.032, 0.04, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 0);
    material.setParameter("u_normalScale", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.028);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.36);
    material.setParameter("u_specularFactor", 0.075);
    material.setParameter("u_specularColorFactor", [0.034, 0.044, 0.052]);
    material.setParameter("u_transmissionTextureEnabled", 0);
    material.setParameter("u_transmissionFactor", 0);
    material.setParameter("u_diffuseTransmissionFactor", 0);
    material.setParameter("u_transmissionFallbackEnergy", 0);
    material.setParameter("u_volumeThicknessFactor", 0);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.022);
  }
  if (role === "light-lens") {
    material.setParameter("u_baseColor", [0.018, 0.014, 0.012, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 0);
    material.setParameter("u_normalScale", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.05);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.42);
    material.setParameter("u_specularFactor", 0.09);
    material.setParameter("u_specularColorFactor", [0.08, 0.056, 0.04]);
    material.setParameter("u_clearcoatFactor", 0.04);
    material.setParameter("u_clearcoatRoughnessFactor", 0.66);
    material.setParameter("u_emissiveTextureEnabled", 0);
    material.setParameter("u_emissiveStrength", 0);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.018);
  }
  if (role === "license-plate") {
    material.setParameter("u_baseColor", [0.16, 0.152, 0.138, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 0);
    material.setParameter("u_normalScale", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.12);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.58);
    material.setParameter("u_specularFactor", 0.08);
    material.setParameter("u_specularColorFactor", [0.075, 0.07, 0.062]);
    material.setParameter("u_clearcoatFactor", 0);
    material.setParameter("u_emissiveTextureEnabled", 0);
    material.setParameter("u_emissiveStrength", 0);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.018);
  }
  if (role === "side-panel") {
    material.setParameter("u_baseColor", [0.012, 0.003, 0.0025, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.24);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.9);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.68);
    material.setParameter("u_specularFactor", 0.025);
    material.setParameter("u_specularColorFactor", [0.026, 0.012, 0.01]);
    material.setParameter("u_clearcoatFactor", 0);
    material.setParameter("u_clearcoatRoughnessFactor", 1);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.004);
  }
  if (role === "wheel-metal") {
    material.setParameter("u_baseColor", [0.32, 0.31, 0.28, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.055);
    material.setParameter("u_metallic", 0.9);
    material.setParameter("u_roughness", 0.3);
    material.setParameter("u_specularFactor", 0.36);
    material.setParameter("u_specularColorFactor", [0.34, 0.32, 0.28]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.075);
  }
  if (role === "brake") {
    material.setParameter("u_baseColor", [0.48, 0.028, 0.018, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.06);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.08);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.62);
    material.setParameter("u_specularFactor", 0.055);
    material.setParameter("u_specularColorFactor", [0.055, 0.026, 0.018]);
    material.setParameter("u_clearcoatFactor", 0);
    material.setParameter("u_emissiveTextureEnabled", 0);
    material.setParameter("u_emissiveStrength", 0);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.012);
  }
  if (role === "tire") {
    material.setParameter("u_baseColor", [0.014, 0.014, 0.013, 1]);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.24);
    material.setParameter("u_roughness", 0.78);
    material.setParameter("u_specularFactor", 0.038);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.012);
  }
  if (role === "interior") {
    material.setParameter("u_baseColor", [0.22, 0.048, 0.036, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.085);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.08);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.52);
    material.setParameter("u_specularFactor", 0.09);
    material.setParameter("u_specularColorFactor", [0.09, 0.046, 0.035]);
    material.setParameter("u_clearcoatFactor", 0.035);
    material.setParameter("u_clearcoatRoughnessFactor", 0.72);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.025);
  }
  if (role === "mechanical") {
    material.setParameter("u_baseColor", [0.012, 0.012, 0.012, 1]);
    material.setParameter("u_normalScale", 0.06);
    material.setParameter("u_occlusionStrength", 0.08);
    material.setParameter("u_roughness", 0.74);
    material.setParameter("u_specularFactor", 0.026);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.008);
  }
}

function finalizeGalleryCarConceptMaterialVisualRole(
  material: Material,
  role: Exclude<CarConceptMaterialVisualRole, "unclassified">,
  context: Pick<CarConceptMaterialStabilityOptions, "materialKey" | "sourceMaterialName" | "nodeName"> = {}
): void {
  const surface = galleryCarConceptRoleSurface(role, context);
  material.setParameter("u_baseColor", surface.baseColor);
  material.setParameter("u_baseColorTextureEnabled", surface.baseColorTextureEnabled);
  material.setParameter("u_normalTextureEnabled", surface.normalTextureEnabled);
  material.setParameter("u_normalScale", surface.normalScale);
  material.setParameter("u_metallicRoughnessTextureEnabled", 0);
  material.setParameter("u_occlusionTextureEnabled", surface.occlusionTextureEnabled);
  material.setParameter("u_occlusionStrength", surface.occlusionStrength);
  material.setParameter("u_metallic", surface.metallic);
  material.setParameter("u_roughness", surface.roughness);
  material.setParameter("u_specularTextureEnabled", 0);
  material.setParameter("u_specularColorTextureEnabled", 0);
  material.setParameter("u_specularFactor", surface.specular);
  material.setParameter("u_specularColorFactor", surface.specularColorFactor);
  material.setParameter("u_clearcoatTextureEnabled", 0);
  material.setParameter("u_clearcoatRoughnessTextureEnabled", 0);
  material.setParameter("u_clearcoatNormalTextureEnabled", 0);
  material.setParameter("u_clearcoatNormalScale", 0);
  material.setParameter("u_clearcoatFactor", surface.clearcoat);
  material.setParameter("u_clearcoatRoughnessFactor", surface.clearcoatRoughness);
  material.setParameter("u_iorTextureEnabled", 0);
  material.setParameter("u_transmissionTextureEnabled", 0);
  material.setParameter("u_diffuseTransmissionTextureEnabled", 0);
  material.setParameter("u_diffuseTransmissionColorTextureEnabled", 0);
  material.setParameter("u_volumeThicknessTextureEnabled", 0);
  material.setParameter("u_transmissionFactor", 0);
  material.setParameter("u_diffuseTransmissionFactor", 0);
  material.setParameter("u_diffuseTransmissionColorFactor", [1, 1, 1]);
  material.setParameter("u_transmissionFallbackEnergy", 0);
  material.setParameter("u_volumeThicknessFactor", 0);
  material.setParameter("u_volumeAttenuationDistance", 1_000_000);
  material.setParameter("u_volumeAttenuationColor", [1, 1, 1]);
  material.setParameter("u_transmissionParallaxStrength", 0);
  material.setParameter("u_transmissionBounceCount", 0);
  material.setParameter("u_transmissionCausticStrength", 0);
  material.setParameter("u_transmissionBackdropEnabled", 0);
  material.setParameter("u_transmissionBackdropStrength", 0);
  material.setParameter("u_materialEnvironmentSpecularScale", surface.materialEnvironmentSpecularScale);
  material.setParameter("u_iridescenceTextureEnabled", 0);
  material.setParameter("u_iridescenceThicknessTextureEnabled", 0);
  material.setParameter("u_iridescenceFactor", 0);
  material.setParameter("u_sheenColorTextureEnabled", 0);
  material.setParameter("u_sheenRoughnessTextureEnabled", 0);
  material.setParameter("u_sheenColorFactor", [0, 0, 0]);
  material.setParameter("u_sheenRoughnessFactor", 1);
  material.setParameter("u_anisotropyTextureEnabled", 0);
  material.setParameter("u_anisotropyStrength", 0);
  material.setParameter("u_anisotropyRotation", 0);
  material.setParameter("u_dispersion", 0);
  material.setParameter("u_emissiveTextureEnabled", 0);
  material.setParameter("u_emissiveColor", surface.emissive);
  material.setParameter("u_emissiveStrength", surface.emissiveStrength);
  applyGalleryCarConceptSourceTextureDetail(material, role);
  if (role === "glass") {
    material.setParameter("u_ior", 1);
  }
  applyCarConceptOpaqueRuntimeSurface(material, surface);
}

function applyGalleryCarConceptSourceTextureDetail(
  material: Material,
  role: Exclude<CarConceptMaterialVisualRole, "unclassified">
): void {
  const sourceBaseColorTexture = materialParameter(material, "u_baseColorTexture");
  const occlusionTexture = materialParameter(material, "u_occlusionTexture");
  const detailTexture = sourceBaseColorTexture ?? occlusionTexture;
  if (!detailTexture) return;
  const sourceTextureWeight = role === "body-primary-paint"
    ? 0.36
    : role === "body-secondary-paint"
      ? 0.32
      : role === "roof-panel"
        ? 0.25
        : role === "side-panel"
          ? 0.4
          : role === "glass"
            ? 0.06
            : role === "wheel-metal"
              ? 0.42
              : role === "tire"
                ? 0.32
                : role === "license-plate"
                  ? 0.82
                  : role === "light-lens"
                    ? 0.12
                    : 0;
  const fallbackOcclusionWeight = role === "body-primary-paint"
    ? 0.16
    : role === "body-secondary-paint"
      ? 0.14
      : role === "roof-panel"
        ? 0.18
        : role === "side-panel"
          ? 0.36
          : role === "glass"
            ? 0.04
            : role === "wheel-metal"
              ? 0.2
              : role === "tire"
                ? 0.18
                : role === "license-plate"
                  ? 0.28
                  : role === "light-lens"
                    ? 0.06
                    : 0;
  const weight = sourceBaseColorTexture ? sourceTextureWeight : fallbackOcclusionWeight;
  if (weight <= 0) return;
  if (!sourceBaseColorTexture) material.setParameter("u_baseColorTexture", detailTexture);
  const sourcePrefix = sourceBaseColorTexture ? "u_baseColorTexture" : "u_occlusionTexture";
  for (const suffix of ["Offset", "Scale", "Rotation", "TexCoord", "Wrap"] as const) {
    const value = materialParameter(material, `${sourcePrefix}${suffix}`);
    if (value !== undefined) material.setParameter(`u_baseColorTexture${suffix}`, value);
  }
  material.setParameter("u_baseColorTextureEnabled", weight);
}

function galleryCarConceptRoleSurface(
  role: Exclude<CarConceptMaterialVisualRole, "unclassified">,
  context: Pick<CarConceptMaterialStabilityOptions, "materialKey" | "sourceMaterialName" | "nodeName">
): GalleryCarConceptRoleSurface {
  const surface = GALLERY_ROLE_SURFACES[role];
  const identity = `${context.nodeName ?? ""} ${context.materialKey ?? ""} ${context.sourceMaterialName ?? ""}`;
  if (role === "body-primary-paint") {
    if (/BodyHood/i.test(identity)) {
      return {
        ...surface,
        baseColor: [0.64, 0.0054, 0.0032, 1],
        normalScale: 0.035,
        occlusionStrength: 0.16,
        roughness: 0.21,
        specular: 0.6,
        specularColorFactor: [0.54, 0.042, 0.026],
        clearcoat: 0.6,
        clearcoatRoughness: 0.28,
        materialEnvironmentSpecularScale: 0.27,
        envMapIntensity: 0.27
      };
    }
    if (/BodyRearPanelsColor1/i.test(identity)) {
      return {
        ...surface,
        baseColor: [0.56, 0.0048, 0.0029, 1],
        normalScale: 0.032,
        occlusionStrength: 0.18,
        roughness: 0.23,
        specular: 0.56,
        specularColorFactor: [0.5, 0.04, 0.025],
        clearcoat: 0.56,
        clearcoatRoughness: 0.3,
        materialEnvironmentSpecularScale: 0.25,
        envMapIntensity: 0.25
      };
    }
    if (/BodyDoor[LR]Color1/i.test(identity)) {
      return {
        ...surface,
        baseColor: [0.76, 0.0072, 0.0042, 1],
        normalScale: 0.04,
        occlusionStrength: 0.18,
        roughness: 0.2,
        specular: 0.66,
        specularColorFactor: [0.58, 0.046, 0.029],
        clearcoat: 0.64,
        clearcoatRoughness: 0.26,
        materialEnvironmentSpecularScale: 0.3,
        envMapIntensity: 0.3
      };
    }
  }
  if (role === "body-secondary-paint") {
    if (/BodyPanelsColor2/i.test(identity)) {
      return {
        ...surface,
        baseColor: [0.078, 0.0015, 0.001, 1],
        normalScale: 0.028,
        occlusionStrength: 0.22,
        roughness: 0.36,
        specular: 0.3,
        specularColorFactor: [0.27, 0.028, 0.02],
        clearcoat: 0.3,
        clearcoatRoughness: 0.48,
        materialEnvironmentSpecularScale: 0.13,
        envMapIntensity: 0.13
      };
    }
    if (/BodyDoor[LR]Color2/i.test(identity)) {
      return {
        ...surface,
        baseColor: [0.17, 0.003, 0.0019, 1],
        normalScale: 0.03,
        occlusionStrength: 0.2,
        roughness: 0.3,
        specular: 0.4,
        specularColorFactor: [0.36, 0.036, 0.024],
        clearcoat: 0.42,
        clearcoatRoughness: 0.4,
        materialEnvironmentSpecularScale: 0.18,
        envMapIntensity: 0.18
      };
    }
  }
  if (role === "light-lens") {
    if (/Headlight/i.test(identity)) {
      return {
        ...surface,
        baseColor: [0.022, 0.024, 0.024, 1],
        specularColorFactor: [0.075, 0.075, 0.068],
        materialEnvironmentSpecularScale: 0.02,
        envMapIntensity: 0.02
      };
    }
    if (/Brake|Tail/i.test(identity)) {
      return {
        ...surface,
        baseColor: [0.045, 0.006, 0.0038, 1],
        specularColorFactor: [0.08, 0.034, 0.024],
        materialEnvironmentSpecularScale: 0.016,
        envMapIntensity: 0.016
      };
    }
    if (/Signal|Turn/i.test(identity)) {
      return {
        ...surface,
        baseColor: [0.04, 0.018, 0.0045, 1],
        specularColorFactor: [0.078, 0.052, 0.026],
        materialEnvironmentSpecularScale: 0.016,
        envMapIntensity: 0.016
      };
    }
  }
  if (role === "side-panel") {
    return {
      ...surface,
      baseColor: [0.024, 0.0038, 0.0025, 1],
      normalScale: 0.42,
      occlusionStrength: 0.62,
      roughness: 0.5,
      specular: 0.1,
      specularColorFactor: [0.11, 0.03, 0.02],
      clearcoat: 0.08,
      clearcoatRoughness: 0.62,
      materialEnvironmentSpecularScale: 0.04,
      envMapIntensity: 0.04
    };
  }
  return surface;
}

function disableCarConceptHdrExtensionEscape(material: Material): void {
  material.setParameter("u_specularTextureEnabled", 0);
  material.setParameter("u_specularColorTextureEnabled", 0);
  material.setParameter("u_clearcoatTextureEnabled", 0);
  material.setParameter("u_clearcoatRoughnessTextureEnabled", 0);
  material.setParameter("u_clearcoatNormalTextureEnabled", 0);
  material.setParameter("u_clearcoatNormalScale", 0);
  material.setParameter("u_clearcoatFactor", 0);
  material.setParameter("u_clearcoatRoughnessFactor", 1);
  material.setParameter("u_iorTextureEnabled", 0);
  material.setParameter("u_transmissionTextureEnabled", 0);
  material.setParameter("u_diffuseTransmissionTextureEnabled", 0);
  material.setParameter("u_diffuseTransmissionColorTextureEnabled", 0);
  material.setParameter("u_volumeThicknessTextureEnabled", 0);
  material.setParameter("u_transmissionFactor", 0);
  material.setParameter("u_diffuseTransmissionFactor", 0);
  material.setParameter("u_diffuseTransmissionColorFactor", [1, 1, 1]);
  material.setParameter("u_transmissionFallbackEnergy", 0);
  material.setParameter("u_volumeThicknessFactor", 0);
  material.setParameter("u_volumeAttenuationDistance", 1_000_000);
  material.setParameter("u_volumeAttenuationColor", [1, 1, 1]);
  material.setParameter("u_transmissionParallaxStrength", 0);
  material.setParameter("u_transmissionBounceCount", 0);
  material.setParameter("u_transmissionCausticStrength", 0);
  material.setParameter("u_transmissionBackdropEnabled", 0);
  material.setParameter("u_transmissionBackdropStrength", 0);
  material.setParameter("u_iridescenceTextureEnabled", 0);
  material.setParameter("u_iridescenceThicknessTextureEnabled", 0);
  material.setParameter("u_iridescenceFactor", 0);
  material.setParameter("u_sheenColorTextureEnabled", 0);
  material.setParameter("u_sheenRoughnessTextureEnabled", 0);
  material.setParameter("u_sheenColorFactor", [0, 0, 0]);
  material.setParameter("u_sheenRoughnessFactor", 1);
  material.setParameter("u_anisotropyTextureEnabled", 0);
  material.setParameter("u_anisotropyStrength", 0);
  material.setParameter("u_anisotropyRotation", 0);
  material.setParameter("u_dispersion", 0);
}

function applyGalleryCarConceptLegacyRoleBlocks(material: Material, name: string): void {
  if (/Panel Sides/i.test(name)) {
    material.setParameter("u_baseColor", [0.058, 0.014, 0.01, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.06);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.1);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0.04);
    material.setParameter("u_roughness", 0.48);
    material.setParameter("u_specularFactor", 0.12);
    material.setParameter("u_specularColorFactor", [0.11, 0.032, 0.024]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.035);
  }
  if (/BodyRoofPanel/i.test(name)) {
    material.setParameter("u_baseColor", [0.12, 0.09, 0.08, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.028);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.06);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.56);
    material.setParameter("u_specularFactor", 0.075);
    material.setParameter("u_specularColorFactor", [0.065, 0.05, 0.044]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.018);
  }
  if (/BodyPillars/i.test(name)) {
    material.setParameter("u_baseColor", [0.018, 0.02, 0.024, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.04);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.06);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.52);
    material.setParameter("u_specularFactor", 0.1);
    material.setParameter("u_specularColorFactor", [0.07, 0.08, 0.09]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.035);
  }
  if (/Glass|Window|Windshield/i.test(name)) {
    material.setParameter("u_baseColor", [0.014, 0.024, 0.032, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 0);
    material.setParameter("u_normalScale", 0);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.025);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_iorTextureEnabled", 0);
    material.setParameter("u_transmissionTextureEnabled", 0);
    material.setParameter("u_transmissionFactor", 0);
    material.setParameter("u_diffuseTransmissionFactor", 0);
    material.setParameter("u_transmissionFallbackEnergy", 0);
    material.setParameter("u_volumeThicknessFactor", 0);
    material.setParameter("u_transmissionParallaxStrength", 0);
    material.setParameter("u_ior", 1.0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.38);
    material.setParameter("u_specularFactor", 0.06);
    material.setParameter("u_specularColorFactor", [0.026, 0.034, 0.042]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.014);
  }
  if (/Tireside|Tiretread/i.test(name)) {
    material.setParameter("u_baseColor", [0.014, 0.014, 0.013, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalScale", 0.24);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.18);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.8);
    material.setParameter("u_specularFactor", 0.035);
    material.setParameter("u_specularColorFactor", [0.035, 0.035, 0.034]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.008);
  }
  if (/Rim[12]|Disc|Brake/i.test(name)) {
    if (/Rim[12]/i.test(name)) {
      material.setParameter("u_baseColor", /Rim2/i.test(name) ? [0.72, 0.69, 0.62, 1] : [0.23, 0.24, 0.25, 1]);
    }
    if (/Disc/i.test(name)) {
      material.setParameter("u_baseColor", [0.86, 0.82, 0.72, 1]);
      material.setParameter("u_baseColorTextureEnabled", 1);
    }
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", /Disc|Rim[12]/i.test(name) ? 0.05 : 0.04);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", /Disc|Rim[12]/i.test(name) ? 0.06 : 0.04);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", /Disc|Rim[12]/i.test(name) ? 0.86 : 0);
    material.setParameter("u_roughness", /Disc|Rim[12]/i.test(name) ? 0.34 : 0.68);
    material.setParameter("u_specularFactor", /Disc|Rim[12]/i.test(name) ? 0.28 : 0.035);
    material.setParameter("u_specularColorFactor", /Disc|Rim[12]/i.test(name) ? [0.28, 0.26, 0.22] : [0.035, 0.018, 0.012]);
    material.setParameter("u_materialEnvironmentSpecularScale", /Disc|Rim[12]/i.test(name) ? 0.055 : 0.004);
    material.setParameter("u_emissiveTextureEnabled", 0);
    material.setParameter("u_emissiveStrength", /Brake/i.test(name) ? 0.22 : 0.02);
    material.setParameter("u_emissiveColor", /Brake/i.test(name) ? [0.22, 0.02, 0.01] : [0, 0, 0]);
  }
  if (/Hardware|Mirror|Dashboard|material-2/i.test(name)) {
    if (/Mirror|Hardware|material-2/i.test(name)) {
      material.setParameter("u_baseColor", [0.018, 0.017, 0.018, 1]);
      material.setParameter("u_normalScale", 0);
    }
    material.setParameter("u_emissiveTextureEnabled", 0);
    material.setParameter("u_emissiveStrength", /Dashboard/i.test(name) ? 0.22 : 0);
    material.setParameter("u_emissiveColor", /Dashboard/i.test(name) ? [0.16, 0.052, 0.014] : [0, 0, 0]);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionStrength", 0.02);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", /Dashboard/i.test(name) ? 0.62 : 0.72);
    material.setParameter("u_specularFactor", /Dashboard/i.test(name) ? 0.08 : 0.04);
    material.setParameter("u_specularColorFactor", /Dashboard/i.test(name) ? [0.12, 0.055, 0.035] : [0.055, 0.05, 0.045]);
    material.setParameter("u_materialEnvironmentSpecularScale", /Dashboard/i.test(name) ? 0.018 : 0.01);
  }
  if (/Interior|Mechanical|Floormat/i.test(name)) {
    if (/Mechanical|Floormat/i.test(name)) {
      material.setParameter("u_baseColor", [0.016, 0.015, 0.014, 1]);
    }
    if (/Interior 3 Carmine/i.test(name)) {
      material.setParameter("u_baseColor", [0.48, 0.08, 0.055, 1]);
    }
    if (/Interior 3 Pearl/i.test(name)) {
      material.setParameter("u_baseColor", [0.18, 0.158, 0.138, 1]);
    }
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", /Mechanical|Floormat/i.test(name) ? 0.08 : 0.09);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionStrength", /Mechanical|Floormat/i.test(name) ? 0.12 : 0.06);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", /Mechanical|Floormat/i.test(name) ? 0.7 : 0.56);
    material.setParameter("u_specularFactor", /Mechanical|Floormat/i.test(name) ? 0.035 : 0.08);
    material.setParameter("u_specularColorFactor", /Mechanical|Floormat/i.test(name) ? [0.045, 0.045, 0.042] : [0.12, 0.065, 0.04]);
    material.setParameter("u_materialEnvironmentSpecularScale", /Mechanical|Floormat/i.test(name) ? 0.01 : 0.02);
  }
}

function applyCinematicCarConceptMaterialStability(
  material: Material,
  options: CarConceptMaterialStabilityOptions
): void {
  const name = `${options.materialKey ?? ""} ${material.name}`;
  const carPaint = /Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color/i.test(name);
  const darkPanel = /Panel Sides|BodyRoofPanel|BodyPillars/i.test(name);
  const glass = /Glass|Window|Windshield/i.test(name);
  const tire = /Tireside|Tiretread/i.test(name);
  const wheelMetal = /Rim[12]|Disc|Brake/i.test(name);
  const darkTrim = /Hardware|Mirror|Dashboard|Mechanical|Interior|Floormat|material-2/i.test(name);

  if (carPaint) {
    if (/Paint [12] Carmine|Body.*Color/i.test(name)) {
      material.setParameter("u_baseColor", [0.54, 0.018, 0.011, 1]);
    } else if (/Paint [12] (Pearl|Pearly)|Graphite/i.test(name)) {
      material.setParameter("u_baseColor", [0.24, 0.052, 0.046, 1]);
    }
    material.setParameter("u_normalTextureEnabled", 0);
    material.setParameter("u_normalScale", 0);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.002);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", Math.min(numberParameter(material, "u_metallic") ?? 0, 0.18));
    material.setParameter("u_roughness", Math.max(options.baseline?.roughness !== undefined ? options.baseline.roughness * (options.roughnessScale ?? 1) : 0.62, 0.62));
    material.setParameter("u_specularFactor", Math.min(numberParameter(material, "u_specularFactor") ?? 0.018, 0.018));
    material.setParameter("u_specularColorFactor", [0.15, 0.012, 0.01]);
    material.setParameter("u_clearcoatTextureEnabled", 0);
    material.setParameter("u_clearcoatRoughnessTextureEnabled", 0);
    material.setParameter("u_clearcoatNormalTextureEnabled", 0);
    material.setParameter("u_clearcoatNormalScale", 0);
    material.setParameter("u_clearcoatFactor", 0);
    material.setParameter("u_clearcoatRoughnessFactor", 1);
    material.setParameter("u_iridescenceTextureEnabled", 0);
    material.setParameter("u_iridescenceThicknessTextureEnabled", 0);
    material.setParameter("u_iridescenceFactor", 0);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.001);
  }

  if (darkPanel || glass) {
    material.setParameter("u_baseColor", glass ? [0.014, 0.018, 0.022, 1] : [0.048, 0.04, 0.039, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 0);
    material.setParameter("u_normalScale", 0);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.002);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", glass ? 0.9 : 0.78);
    material.setParameter("u_specularFactor", glass ? 0.004 : 0.01);
    material.setParameter("u_specularColorFactor", glass ? [0.006, 0.007, 0.008] : [0.022, 0.014, 0.012]);
    material.setParameter("u_clearcoatTextureEnabled", 0);
    material.setParameter("u_clearcoatRoughnessTextureEnabled", 0);
    material.setParameter("u_clearcoatNormalTextureEnabled", 0);
    material.setParameter("u_clearcoatNormalScale", 0);
    material.setParameter("u_clearcoatFactor", 0);
    material.setParameter("u_transmissionTextureEnabled", 0);
    material.setParameter("u_transmissionFactor", 0);
    material.setParameter("u_diffuseTransmissionFactor", 0);
    material.setParameter("u_transmissionFallbackEnergy", 0);
    material.setParameter("u_volumeThicknessFactor", 0);
    material.setParameter("u_ior", 1);
    material.setParameter("u_materialEnvironmentSpecularScale", glass ? 0.001 : 0.002);
  }

  if (tire || wheelMetal || darkTrim) {
    if (tire) material.setParameter("u_baseColor", [0.008, 0.008, 0.008, 1]);
    if (wheelMetal) material.setParameter("u_baseColor", /Disc/i.test(name) ? [0.12, 0.12, 0.12, 1] : [0.03, 0.03, 0.032, 1]);
    material.setParameter("u_normalTextureEnabled", tire ? 1 : 0);
    material.setParameter("u_normalScale", tire ? 0.035 : 0);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", tire ? 0.002 : 0.004);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", wheelMetal ? Math.min(numberParameter(material, "u_metallic") ?? 0, 0.08) : 0);
    material.setParameter("u_roughness", tire ? 0.92 : Math.max(numberParameter(material, "u_roughness") ?? 0.72, 0.72));
    material.setParameter("u_specularFactor", wheelMetal ? 0.012 : 0.004);
    material.setParameter("u_specularColorFactor", wheelMetal ? [0.012, 0.012, 0.012] : [0.006, 0.006, 0.006]);
    material.setParameter("u_clearcoatFactor", 0);
    material.setParameter("u_materialEnvironmentSpecularScale", wheelMetal ? 0.002 : 0.001);
  }
}

function applyCarConceptOpaqueRuntimeSurface(
  material: Material,
  surface: CarConceptMaterialRuntimeSurface
): void {
  material.setParameter("u_alphaCutoff", surface.alphaTest);
  material.setParameter("u_opacity", surface.opacity);
  material.setParameter("u_transparent", surface.opacity < 1 ? 1 : 0);
  material.setParameter("u_toneMapped", surface.toneMapped ? 1 : 0);

  const materialRecord = material as unknown as Record<string, unknown>;
  const renderState = (material as unknown as { readonly renderState?: Partial<RenderState> }).renderState;
  if (renderState && typeof renderState === "object") {
    setExistingProperty(renderState, "blend", false);
    setExistingProperty(renderState, "depthTest", true);
    setExistingProperty(renderState, "depthWrite", true);
    setExistingProperty(renderState, "cullMode", "back");
  }

  setExistingProperty(materialRecord, "transparent", false);
  setExistingProperty(materialRecord, "opacity", surface.opacity);
  setExistingProperty(materialRecord, "alphaTest", surface.alphaTest);
  setExistingProperty(materialRecord, "depthTest", true);
  setExistingProperty(materialRecord, "depthWrite", true);
  setExistingMaterialSide(materialRecord);
  setExistingNumberProperty(materialRecord, "transmission", surface.transmission);
  setExistingNumberProperty(materialRecord, "clearcoat", surface.clearcoat);
  setExistingNumberProperty(materialRecord, "specular", surface.specular);
  setExistingNumberProperty(materialRecord, "specularIntensity", surface.specular);
  setExistingNumberProperty(materialRecord, "metalness", surface.metalness);
  setExistingNumberProperty(materialRecord, "roughness", surface.roughness);
  setExistingNumberProperty(materialRecord, "envMapIntensity", surface.envMapIntensity);
  setExistingEmissive(materialRecord, surface.emissive);
  setExistingProperty(materialRecord, "toneMapped", surface.toneMapped);
  setExistingProperty(materialRecord, "needsUpdate", true);
}

function setExistingProperty(target: unknown, key: string, value: unknown): void {
  if (!target || typeof target !== "object") return;
  const record = target as Record<string, unknown>;
  if (!(key in record)) return;
  try {
    record[key] = value;
  } catch {
    // Some downstream material adapters expose readonly mirrors; ignore those safely.
  }
}

function setExistingNumberProperty(target: Record<string, unknown>, key: string, value: number): void {
  if (!(key in target)) return;
  const current = target[key];
  if (current !== undefined && typeof current !== "number") return;
  setExistingProperty(target, key, value);
}

function setExistingMaterialSide(target: Record<string, unknown>): void {
  if (!("side" in target)) return;
  setExistingProperty(target, "side", typeof target.side === "number" ? 0 : "front");
}

function setExistingEmissive(target: Record<string, unknown>, emissive: Rgb): void {
  if (!("emissive" in target)) return;
  const current = target.emissive;
  if (current && typeof current === "object") {
    const color = current as { setRGB?: (r: number, g: number, b: number) => unknown };
    if (typeof color.setRGB === "function") {
      try {
        color.setRGB(emissive[0], emissive[1], emissive[2]);
        return;
      } catch {
        return;
      }
    }
  }
  setExistingProperty(target, "emissive", [...emissive]);
}

function numberParameter(material: Material, name: string): number | undefined {
  const value = materialParameter(material, name);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function vector3Parameter(material: Material, name: string): Rgb | undefined {
  const value = materialParameter(material, name);
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return undefined;
  const components = Array.from(value as ArrayLike<number>);
  if (components.length < 3 || !components.slice(0, 3).every((component) => typeof component === "number" && Number.isFinite(component))) {
    return undefined;
  }
  return [components[0]!, components[1]!, components[2]!];
}

function materialParameter(material: Material, name: string): UniformValue | undefined {
  const getParameter = (material as unknown as { readonly getParameter?: (parameterName: string) => UniformValue | undefined }).getParameter;
  if (typeof getParameter !== "function") return undefined;
  try {
    return getParameter.call(material, name);
  } catch {
    return undefined;
  }
}
