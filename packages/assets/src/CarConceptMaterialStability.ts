import type { Material } from "@galileo3d/rendering";
import type { GLTFMaterialRenderStateOverride } from "./GLTFRenderResources";

export type CarConceptMaterialStabilityProfile = "gallery" | "cinematic";

export interface CarConceptMaterialBaseline {
  readonly roughness?: number;
  readonly metallic?: number;
  readonly clearcoat?: number;
}

export interface CarConceptMaterialStabilityOptions {
  readonly materialKey?: string;
  readonly profile?: CarConceptMaterialStabilityProfile;
  readonly baseline?: CarConceptMaterialBaseline;
  readonly roughnessScale?: number;
  readonly metallicScale?: number;
  readonly clearcoatBoost?: number;
}

const BODY_PATTERN = /Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color|Panel Sides|BodyRoofPanel|BodyPillars/i;
const GLASS_PATTERN = /Glass|Window|Windshield/i;
const DETAIL_PATTERN = /Tireside|Tiretread|Rim[12]|Disc|Brake|Hardware|Mirror|Dashboard|Mechanical|Interior|Floormat|material-2/i;

export function carConceptMaterialRenderStateOverrides(
  context: "product-configurator" | "v8-flagship" = "product-configurator"
): readonly GLTFMaterialRenderStateOverride[] {
  const product = context === "product-configurator";
  return [
    {
      materialName: BODY_PATTERN,
      renderState: { cullMode: "back", blend: false, depthWrite: true },
      reason: product
        ? "Product car body panels are double-sided in the source GLB; culling back faces prevents subpixel bright seam halos without hiding the original car asset."
        : "Concept-car body panels must not render as double-sided HDR edge overlays in the v8 flagship viewer."
    },
    {
      materialName: GLASS_PATTERN,
      renderState: { cullMode: "back", blend: false, depthWrite: true },
      reason: product
        ? "Product car glass is rendered as depth-writing dark glazing because the source transmissive/no-depth overlay creates pale HDR silhouette speckle around the windshield and roofline."
        : "Concept-car glass has transmission metadata, but this viewer has no scene-color refraction pass; opaque depth-writing glass prevents white no-depth halos."
    },
    {
      materialName: DETAIL_PATTERN,
      renderState: { cullMode: "back", blend: false, depthWrite: true },
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
  applyGalleryCarConceptMaterialStability(material, options.materialKey);
}

function applyGalleryCarConceptMaterialStability(material: Material, materialKey: string | undefined): void {
  const name = `${materialKey ?? ""} ${material.name}`;
  if (/Paint [12] (Carmine|Pearl|Pearly|Graphite)|Body.*Color/i.test(name)) {
    if (/Paint [12] Carmine|Body.*Color/i.test(name)) {
      material.setParameter("u_baseColor", [0.64, 0.008, 0.004, 1]);
    }
    if (/Paint [12] (Pearl|Pearly)/i.test(name)) {
      material.setParameter("u_baseColor", [0.62, 0.64, 0.66, 1]);
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
    if (/Paint [12] (Pearl|Pearly)/i.test(name)) {
      material.setParameter("u_baseColor", [0.42, 0.43, 0.44, 1]);
      material.setParameter("u_normalScale", 0.012);
      material.setParameter("u_occlusionStrength", 0.018);
      material.setParameter("u_roughness", 0.58);
      material.setParameter("u_specularFactor", 0.08);
      material.setParameter("u_specularColorFactor", [0.08, 0.085, 0.09]);
      material.setParameter("u_clearcoatFactor", 0.08);
      material.setParameter("u_clearcoatRoughnessFactor", 0.66);
      material.setParameter("u_materialEnvironmentSpecularScale", 0.018);
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
  if (/Panel Sides/i.test(name)) {
    material.setParameter("u_baseColor", [0.026, 0.008, 0.006, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.06);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.1);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.5);
    material.setParameter("u_specularFactor", 0.12);
    material.setParameter("u_specularColorFactor", [0.12, 0.035, 0.024]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.045);
  }
  if (/BodyRoofPanel/i.test(name)) {
    material.setParameter("u_baseColor", [0.56, 0.58, 0.6, 1]);
    material.setParameter("u_baseColorTextureEnabled", 0);
    material.setParameter("u_normalTextureEnabled", 1);
    material.setParameter("u_normalScale", 0.035);
    material.setParameter("u_metallicRoughnessTextureEnabled", 0);
    material.setParameter("u_occlusionTextureEnabled", 1);
    material.setParameter("u_occlusionStrength", 0.04);
    material.setParameter("u_specularTextureEnabled", 0);
    material.setParameter("u_specularColorTextureEnabled", 0);
    material.setParameter("u_metallic", 0);
    material.setParameter("u_roughness", 0.44);
    material.setParameter("u_specularFactor", 0.18);
    material.setParameter("u_specularColorFactor", [0.14, 0.15, 0.16]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.055);
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
    material.setParameter("u_baseColor", [0.008, 0.014, 0.018, 1]);
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
    material.setParameter("u_roughness", 0.44);
    material.setParameter("u_specularFactor", 0.08);
    material.setParameter("u_specularColorFactor", [0.035, 0.045, 0.055]);
    material.setParameter("u_materialEnvironmentSpecularScale", 0.024);
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

function numberParameter(material: Material, name: string): number | undefined {
  const value = material.getParameter(name);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
