import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyProductConfiguratorOriginalCarMaterialQualityCorrections,
  applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections,
  applyProductConfiguratorRuntimeMaterialControls,
  createProductConfiguratorShowcaseLayout,
  explodedProductPartOffset,
  focusPartForProductConfiguratorImportedLabel,
  isGeneratedProductConfiguratorFixtureAssetId,
  isProductConfiguratorOriginalProductAssetId,
  isProductConfiguratorHotspotCandidateLabel,
  isProductConfiguratorProceduralArtifactLabel,
  productConfiguratorImportedMaterialControlPlan,
  productConfiguratorOriginalCarMaterialVisualRole,
  productConfiguratorOriginalCarRenderableRenderState,
  productConfiguratorFocusOffset,
  productConfiguratorMaterialOverrideTargetCount,
  productConfiguratorOriginalCarRenderStateOverrides
} from "../../../apps/v9-advanced-examples-gallery/src/productConfiguratorPolicy";
import {
  configuredAuthoredAssetIdsForDemo
} from "../../../apps/v9-advanced-examples-gallery/src/authoredLayer";
import {
  getAuthoredAssetCandidate
} from "../../../apps/v9-advanced-examples-gallery/src/authoredAssets";

describe("v9 product configurator policy", () => {
  it("keeps original Product GLB corrections texture-preserving and out of generated fixture paths", () => {
    const authoredLayerSource = readFileSync("apps/v9-advanced-examples-gallery/src/authoredLayer.ts", "utf8");

    expect(authoredLayerSource).toContain("isProductConfiguratorOriginalProductAssetId(assetId)");
    expect(authoredLayerSource).not.toContain('assetId === "chronograph-watch"');
    expect(authoredLayerSource).not.toContain("Band Carbon Fiber Red");
    expect(authoredLayerSource).not.toContain("Glass Face");
  });

  it("reduces original car paint/glass/tire aliasing while preserving source paint texture roles", () => {
    const paint = createMaterialTarget("paint-carmine", "Paint 1 Carmine");
    const secondaryPaint = createMaterialTarget("paint-carmine-secondary", "Paint 2 Carmine");
    const pearlPaint = createMaterialTarget("paint-pearl", "Paint 1 Pearl");
    const roof = createMaterialTarget("roof-panel", "Panel Sides");
    const roofPanel = createMaterialTarget("body-roof-panel", "BodyRoofPanel");
    const glass = createMaterialTarget("glass", "Glass");
    const tire = createMaterialTarget("tire", "Tireside");
    const rim = createMaterialTarget("rim", "Rim1");
    const disc = createMaterialTarget("disc", "Disc");
    const hardware = createMaterialTarget("hardware", "Hardware");
    const mirror = createMaterialTarget("mirror", "Mirror");
    const dashboard = createMaterialTarget("dashboard", "Dashboard");
    const defaultNamedMaterial = createMaterialTarget("material-2", "");
    const interior = createMaterialTarget("interior", "Interior 3 Carmine");
    const pearlInterior = createMaterialTarget("interior-pearl", "Interior 3 Pearl");
    const mechanical = createMaterialTarget("mechanical", "Mechanical");
    const materialLibrary = new Map([
      [paint.materialKey, paint.material],
      [secondaryPaint.materialKey, secondaryPaint.material],
      [pearlPaint.materialKey, pearlPaint.material],
      [roof.materialKey, roof.material],
      [roofPanel.materialKey, roofPanel.material],
      [glass.materialKey, glass.material],
      [tire.materialKey, tire.material],
      [rim.materialKey, rim.material],
      [disc.materialKey, disc.material],
      [hardware.materialKey, hardware.material],
      [mirror.materialKey, mirror.material],
      [dashboard.materialKey, dashboard.material],
      [defaultNamedMaterial.materialKey, defaultNamedMaterial.material],
      [interior.materialKey, interior.material],
      [pearlInterior.materialKey, pearlInterior.material],
      [mechanical.materialKey, mechanical.material]
    ]);

    applyProductConfiguratorOriginalCarMaterialQualityCorrections(materialLibrary as never);

    expect(paint.material.parameters.get("u_baseColorTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_normalTextureEnabled")).toBe(1);
    expect(paint.material.parameters.get("u_normalScale")).toBe(0.052);
				expect(paint.material.parameters.get("u_baseColor")).toEqual([0.42, 0.008, 0.005, 1]);
    expect(paint.material.parameters.get("u_metallicRoughnessTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_occlusionTextureEnabled")).toBe(1);
			expect(paint.material.parameters.get("u_occlusionStrength")).toBe(0.052);
    expect(paint.material.parameters.get("u_specularTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_specularColorTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_metallic")).toBe(0.08);
					expect(paint.material.parameters.get("u_roughness")).toBe(0.34);
					expect(paint.material.parameters.get("u_specularFactor")).toBe(0.18);
					expect(paint.material.parameters.get("u_specularColorFactor")).toEqual([0.18, 0.03, 0.02]);
    expect(paint.material.parameters.get("u_clearcoatTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_clearcoatRoughnessTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_clearcoatNormalTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_clearcoatNormalScale")).toBe(0);
				expect(paint.material.parameters.get("u_clearcoatFactor")).toBe(0.18);
					expect(paint.material.parameters.get("u_clearcoatRoughnessFactor")).toBe(0.68);
    expect(paint.material.parameters.get("u_iridescenceTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_iridescenceThicknessTextureEnabled")).toBe(0);
    expect(paint.material.parameters.get("u_iridescenceFactor")).toBe(0);
					expect(paint.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.06);
				expect(secondaryPaint.material.parameters.get("u_baseColor")).toEqual([0.24, 0.016, 0.012, 1]);
    expect(secondaryPaint.material.parameters.get("u_normalTextureEnabled")).toBe(1);
				expect(secondaryPaint.material.parameters.get("u_normalScale")).toBe(0.034);
				expect(secondaryPaint.material.parameters.get("u_occlusionStrength")).toBe(0.07);
				expect(secondaryPaint.material.parameters.get("u_metallic")).toBe(0.05);
				expect(secondaryPaint.material.parameters.get("u_roughness")).toBe(0.46);
				expect(secondaryPaint.material.parameters.get("u_specularFactor")).toBe(0.1);
				expect(secondaryPaint.material.parameters.get("u_specularColorFactor")).toEqual([0.095, 0.03, 0.024]);
				expect(secondaryPaint.material.parameters.get("u_clearcoatFactor")).toBe(0.09);
				expect(secondaryPaint.material.parameters.get("u_clearcoatRoughnessFactor")).toBe(0.72);
				expect(secondaryPaint.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.028);
    expect(pearlPaint.material.parameters.get("u_normalTextureEnabled")).toBe(1);
				expect(pearlPaint.material.parameters.get("u_baseColor")).toEqual([0.34, 0.18, 0.15, 1]);
				expect(pearlPaint.material.parameters.get("u_normalScale")).toBe(0.016);
				expect(pearlPaint.material.parameters.get("u_roughness")).toBe(0.58);
				expect(pearlPaint.material.parameters.get("u_specularFactor")).toBe(0.065);
				expect(pearlPaint.material.parameters.get("u_specularColorFactor")).toEqual([0.07, 0.046, 0.04]);
				expect(pearlPaint.material.parameters.get("u_clearcoatFactor")).toBe(0.055);
				expect(pearlPaint.material.parameters.get("u_clearcoatRoughnessFactor")).toBe(0.72);
				expect(pearlPaint.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.014);
					expect(roof.material.parameters.get("u_baseColor")).toEqual([0.058, 0.014, 0.01, 1]);
    expect(roof.material.parameters.get("u_baseColorTextureEnabled")).toBe(0);
    expect(roof.material.parameters.get("u_normalTextureEnabled")).toBe(1);
    expect(roof.material.parameters.get("u_normalScale")).toBe(0.06);
    expect(roof.material.parameters.get("u_metallicRoughnessTextureEnabled")).toBe(0);
    expect(roof.material.parameters.get("u_occlusionTextureEnabled")).toBe(1);
			expect(roof.material.parameters.get("u_occlusionStrength")).toBe(0.1);
    expect(roof.material.parameters.get("u_specularTextureEnabled")).toBe(0);
    expect(roof.material.parameters.get("u_specularColorTextureEnabled")).toBe(0);
    expect(roof.material.parameters.get("u_metallic")).toBe(0.04);
			expect(roof.material.parameters.get("u_roughness")).toBe(0.48);
				expect(roof.material.parameters.get("u_specularFactor")).toBe(0.12);
				expect(roof.material.parameters.get("u_specularColorFactor")).toEqual([0.11, 0.032, 0.024]);
					expect(roof.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.035);
						expect(roofPanel.material.parameters.get("u_baseColor")).toEqual([0.12, 0.09, 0.08, 1]);
			expect(roofPanel.material.parameters.get("u_normalTextureEnabled")).toBe(1);
				expect(roofPanel.material.parameters.get("u_normalScale")).toBe(0.028);
						expect(roofPanel.material.parameters.get("u_roughness")).toBe(0.56);
						expect(roofPanel.material.parameters.get("u_specularFactor")).toBe(0.075);
						expect(roofPanel.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.018);
						expect(glass.material.parameters.get("u_baseColor")).toEqual([0.014, 0.024, 0.032, 1]);
    expect(glass.material.parameters.get("u_baseColorTextureEnabled")).toBe(0);
    expect(glass.material.parameters.get("u_normalTextureEnabled")).toBe(0);
    expect(glass.material.parameters.get("u_metallicRoughnessTextureEnabled")).toBe(0);
    expect(glass.material.parameters.get("u_occlusionTextureEnabled")).toBe(1);
		expect(glass.material.parameters.get("u_occlusionStrength")).toBe(0.025);
    expect(glass.material.parameters.get("u_specularTextureEnabled")).toBe(0);
    expect(glass.material.parameters.get("u_specularColorTextureEnabled")).toBe(0);
    expect(glass.material.parameters.get("u_iorTextureEnabled")).toBe(0);
    expect(glass.material.parameters.get("u_transmissionTextureEnabled")).toBe(0);
    expect(glass.material.parameters.get("u_transmissionFactor")).toBe(0);
    expect(glass.material.parameters.get("u_diffuseTransmissionFactor")).toBe(0);
    expect(glass.material.parameters.get("u_transmissionFallbackEnergy")).toBe(0);
    expect(glass.material.parameters.get("u_volumeThicknessFactor")).toBe(0);
    expect(glass.material.parameters.get("u_transmissionParallaxStrength")).toBe(0);
    expect(glass.material.parameters.get("u_ior")).toBe(1);
    expect(glass.material.parameters.get("u_metallic")).toBe(0);
						expect(glass.material.parameters.get("u_roughness")).toBe(0.38);
						expect(glass.material.parameters.get("u_specularFactor")).toBe(0.06);
						expect(glass.material.parameters.get("u_specularColorFactor")).toEqual([0.026, 0.034, 0.042]);
						expect(glass.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.014);
    expect(tire.material.parameters.get("u_baseColor")).toEqual([0.014, 0.014, 0.013, 1]);
    expect(tire.material.parameters.get("u_baseColorTextureEnabled")).toBe(0);
    expect(tire.material.parameters.get("u_normalScale")).toBe(0.24);
    expect(tire.material.parameters.get("u_metallicRoughnessTextureEnabled")).toBe(0);
    expect(tire.material.parameters.get("u_occlusionTextureEnabled")).toBe(1);
    expect(tire.material.parameters.get("u_occlusionStrength")).toBe(0.18);
    expect(tire.material.parameters.get("u_specularTextureEnabled")).toBe(0);
    expect(tire.material.parameters.get("u_specularColorTextureEnabled")).toBe(0);
    expect(tire.material.parameters.get("u_metallic")).toBe(0);
    expect(tire.material.parameters.get("u_roughness")).toBe(0.8);
    expect(tire.material.parameters.get("u_specularFactor")).toBe(0.035);
    expect(tire.material.parameters.get("u_specularColorFactor")).toEqual([0.035, 0.035, 0.034]);
	    expect(tire.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.008);
		expect(rim.material.parameters.get("u_baseColor")).toEqual([0.23, 0.24, 0.25, 1]);
    expect(rim.material.parameters.get("u_normalTextureEnabled")).toBe(1);
    expect(rim.material.parameters.get("u_normalScale")).toBe(0.05);
    expect(rim.material.parameters.get("u_occlusionTextureEnabled")).toBe(1);
    expect(rim.material.parameters.get("u_occlusionStrength")).toBe(0.06);
    expect(rim.material.parameters.get("u_metallic")).toBe(0.86);
		expect(rim.material.parameters.get("u_roughness")).toBe(0.34);
		expect(rim.material.parameters.get("u_specularFactor")).toBe(0.28);
		expect(rim.material.parameters.get("u_specularColorFactor")).toEqual([0.28, 0.26, 0.22]);
    expect(rim.material.parameters.get("u_emissiveTextureEnabled")).toBe(0);
    expect(rim.material.parameters.get("u_emissiveStrength")).toBe(0.02);
		expect(disc.material.parameters.get("u_baseColor")).toEqual([0.86, 0.82, 0.72, 1]);
    expect(disc.material.parameters.get("u_baseColorTextureEnabled")).toBe(1);
    expect(disc.material.parameters.get("u_normalTextureEnabled")).toBe(1);
    expect(disc.material.parameters.get("u_metallicRoughnessTextureEnabled")).toBe(0);
    expect(disc.material.parameters.get("u_specularTextureEnabled")).toBe(0);
    expect(disc.material.parameters.get("u_specularColorTextureEnabled")).toBe(0);
		expect(disc.material.parameters.get("u_specularFactor")).toBe(0.28);
		expect(disc.material.parameters.get("u_specularColorFactor")).toEqual([0.28, 0.26, 0.22]);
			expect(disc.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.055);
    expect(hardware.material.parameters.get("u_baseColor")).toEqual([0.018, 0.017, 0.018, 1]);
    expect(hardware.material.parameters.get("u_normalScale")).toBe(0);
    expect(hardware.material.parameters.get("u_emissiveTextureEnabled")).toBe(0);
    expect(hardware.material.parameters.get("u_emissiveStrength")).toBe(0);
    expect(hardware.material.parameters.get("u_occlusionStrength")).toBe(0.02);
    expect(hardware.material.parameters.get("u_metallic")).toBe(0);
    expect(mirror.material.parameters.get("u_emissiveTextureEnabled")).toBe(0);
    expect(mirror.material.parameters.get("u_baseColor")).toEqual([0.018, 0.017, 0.018, 1]);
    expect(mirror.material.parameters.get("u_specularFactor")).toBe(0.04);
    expect(mirror.material.parameters.get("u_specularColorFactor")).toEqual([0.055, 0.05, 0.045]);
    expect(dashboard.material.parameters.get("u_emissiveStrength")).toBe(0.22);
    expect(defaultNamedMaterial.material.parameters.get("u_emissiveTextureEnabled")).toBe(0);
    expect(defaultNamedMaterial.material.parameters.get("u_occlusionStrength")).toBe(0.02);
    expect(defaultNamedMaterial.material.parameters.get("u_specularColorFactor")).toEqual([0.055, 0.05, 0.045]);
    expect(interior.material.parameters.get("u_normalScale")).toBe(0.09);
    expect(interior.material.parameters.get("u_occlusionStrength")).toBe(0.06);
    expect(interior.material.parameters.get("u_baseColor")).toEqual([0.48, 0.08, 0.055, 1]);
    expect(pearlInterior.material.parameters.get("u_baseColor")).toEqual([0.18, 0.158, 0.138, 1]);
    expect(mechanical.material.parameters.get("u_baseColor")).toEqual([0.016, 0.015, 0.014, 1]);
    expect(mechanical.material.parameters.get("u_normalTextureEnabled")).toBe(1);
    expect(mechanical.material.parameters.get("u_normalScale")).toBe(0.08);
    expect(mechanical.material.parameters.get("u_occlusionStrength")).toBe(0.12);
    expect(mechanical.material.parameters.get("u_metallic")).toBe(0);
    expect(mechanical.material.parameters.get("u_specularFactor")).toBe(0.035);
	    expect(mechanical.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.01);
  });

  it("routes original car render-state cleanup through GLTF render resources", () => {
    const authoredLayerSource = readFileSync("apps/v9-advanced-examples-gallery/src/authoredLayer.ts", "utf8");
    const overrides = productConfiguratorOriginalCarRenderStateOverrides();

    expect(authoredLayerSource).toContain("materialRenderStateOverrides: productConfiguratorOriginalCarRenderStateOverrides()");
    expect(overrides).toHaveLength(3);
    expect(overrides[0]?.renderState).toMatchObject({ cullMode: "back", blend: false, depthWrite: true });
    expect(String(overrides[0]?.materialName)).toContain("Pearl");
    expect(String(overrides[2]?.materialName)).toContain("Interior");
    expect(overrides[1]?.renderState).toMatchObject({ cullMode: "back", blend: false, depthWrite: true });
    expect(overrides[1]?.reason).toContain("pale HDR silhouette speckle");
  });

  it("classifies shared car materials by node role before route render items are created", () => {
    const primaryPaint = createMaterialTarget("Paint 1 Carmine", "Paint 1 Carmine");
    const bodyPaint = createMaterialTarget("Paint 2 Carmine", "Paint 2 Carmine");
    const roofPanel = createMaterialTarget("Paint 2 Carmine", "Paint 2 Carmine");
    const sidePanel = createMaterialTarget("Panel Sides", "Panel Sides");
    const handleTrim = createMaterialTarget("Paint 2 Carmine", "Paint 2 Carmine");
    const headlight = createMaterialTarget("Headlight", "Headlight");
    const license = createMaterialTarget("License", "License");

    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "BodyHood",
      materialKey: "Paint 1 Carmine",
      sourceMaterialName: "Paint 1 Carmine"
    })).toBe("body-primary-paint");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "BodyDoorLColor2",
      materialKey: "Paint 2 Carmine",
      sourceMaterialName: "Paint 2 Carmine"
    })).toBe("body-secondary-paint");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "BodyRoofPanel",
      materialKey: "Paint 2 Carmine",
      sourceMaterialName: "Paint 2 Carmine"
    })).toBe("roof-panel");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "mesh-85-primitive-0",
      materialKey: "Panel Sides",
      sourceMaterialName: "Panel Sides"
    })).toBe("side-panel");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "BodyDoorLHandle02",
      materialKey: "Paint 2 Carmine",
      sourceMaterialName: "Paint 2 Carmine"
    })).toBe("dark-trim");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "BodyHeadlights",
      materialKey: "Headlight",
      sourceMaterialName: "Headlight"
    })).toBe("light-lens");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "License Plate",
      materialKey: "License",
      sourceMaterialName: "License"
    })).toBe("license-plate");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "BodyTaillightsPanels",
      materialKey: "material-2",
      sourceMaterialName: "material-2"
    })).toBe("dark-trim");

    primaryPaint.material.parameters.set("u_occlusionTexture", "source-ao-texture");
    primaryPaint.material.parameters.set("u_occlusionTextureTexCoord", 1);
    primaryPaint.material.parameters.set("u_occlusionTextureOffset", [0.125, 0.25]);
    primaryPaint.material.parameters.set("u_occlusionTextureScale", [0.5, 0.75]);
    primaryPaint.material.parameters.set("u_occlusionTextureWrap", [1, 1]);
    bodyPaint.material.parameters.set("u_occlusionTexture", "source-secondary-ao-texture");
    sidePanel.material.parameters.set("u_occlusionTexture", "source-side-ao-texture");
    license.material.parameters.set("u_baseColorTexture", "source-license-plate-texture");

    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(primaryPaint.material as never, {
      nodeName: "BodyHood",
      geometryKey: "BodyHood",
      materialKey: primaryPaint.materialKey,
      sourceMaterialName: primaryPaint.sourceMaterialName
    });
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(bodyPaint.material as never, {
      nodeName: "BodyDoorLColor2",
      geometryKey: "BodyDoorLColor2",
      materialKey: bodyPaint.materialKey,
      sourceMaterialName: bodyPaint.sourceMaterialName
    });
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(roofPanel.material as never, {
      nodeName: "BodyRoofPanel",
      geometryKey: "BodyRoofPanel",
      materialKey: roofPanel.materialKey,
      sourceMaterialName: roofPanel.sourceMaterialName
    });
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(sidePanel.material as never, {
      nodeName: "mesh-85-primitive-0",
      geometryKey: "mesh-85-primitive-0",
      materialKey: sidePanel.materialKey,
      sourceMaterialName: sidePanel.sourceMaterialName
    });
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(handleTrim.material as never, {
      nodeName: "BodyDoorLHandle02",
      geometryKey: "BodyDoorLHandle02",
      materialKey: handleTrim.materialKey,
      sourceMaterialName: handleTrim.sourceMaterialName
    });
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(headlight.material as never, {
      nodeName: "BodyHeadlights",
      geometryKey: "BodyHeadlights",
      materialKey: headlight.materialKey,
      sourceMaterialName: headlight.sourceMaterialName
    });
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(license.material as never, {
      nodeName: "License Plate",
      geometryKey: "License Plate",
      materialKey: license.materialKey,
      sourceMaterialName: license.sourceMaterialName
    });

    expect(primaryPaint.material.parameters.get("u_baseColor")).toEqual([0.64, 0.0054, 0.0032, 1]);
    expect(primaryPaint.material.parameters.get("u_normalScale")).toBe(0.035);
    expect(primaryPaint.material.parameters.get("u_occlusionStrength")).toBe(0.16);
    expect(primaryPaint.material.parameters.get("u_specularFactor")).toBe(0.6);
    expect(primaryPaint.material.parameters.get("u_specularColorFactor")).toEqual([0.54, 0.042, 0.026]);
    expect(primaryPaint.material.parameters.get("u_clearcoatFactor")).toBe(0.6);
    expect(primaryPaint.material.parameters.get("u_clearcoatRoughnessFactor")).toBe(0.28);
    expect(primaryPaint.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.27);
    expect(primaryPaint.material.parameters.get("u_baseColorTexture")).toBe("source-ao-texture");
    expect(primaryPaint.material.parameters.get("u_baseColorTextureEnabled")).toBe(0.16);
    expect(primaryPaint.material.parameters.get("u_baseColorTextureTexCoord")).toBe(1);
    expect(primaryPaint.material.parameters.get("u_baseColorTextureOffset")).toEqual([0.125, 0.25]);
    expect(primaryPaint.material.parameters.get("u_baseColorTextureScale")).toEqual([0.5, 0.75]);
    expect(primaryPaint.material.parameters.get("u_baseColorTextureWrap")).toEqual([1, 1]);
    expect(bodyPaint.material.parameters.get("u_baseColor")).toEqual([0.17, 0.003, 0.0019, 1]);
    expect(bodyPaint.material.parameters.get("u_normalScale")).toBe(0.03);
    expect(bodyPaint.material.parameters.get("u_occlusionStrength")).toBe(0.2);
    expect(bodyPaint.material.parameters.get("u_specularFactor")).toBe(0.4);
    expect(bodyPaint.material.parameters.get("u_specularColorFactor")).toEqual([0.36, 0.036, 0.024]);
    expect(bodyPaint.material.parameters.get("u_clearcoatFactor")).toBe(0.42);
    expect(bodyPaint.material.parameters.get("u_clearcoatRoughnessFactor")).toBe(0.4);
    expect(bodyPaint.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.18);
    expect(bodyPaint.material.parameters.get("u_baseColorTextureEnabled")).toBe(0.14);
    expect(roofPanel.material.parameters.get("u_baseColor")).toEqual([0.024, 0.028, 0.03, 1]);
    expect(roofPanel.material.parameters.get("u_specularFactor")).toBe(0.22);
    expect(roofPanel.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.072);
    expect(sidePanel.material.parameters.get("u_baseColor")).toEqual([0.024, 0.0038, 0.0025, 1]);
    expect(sidePanel.material.parameters.get("u_occlusionStrength")).toBe(0.62);
    expect(sidePanel.material.parameters.get("u_normalScale")).toBe(0.42);
    expect(sidePanel.material.parameters.get("u_specularFactor")).toBe(0.1);
    expect(sidePanel.material.parameters.get("u_clearcoatFactor")).toBe(0.08);
    expect(sidePanel.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.04);
    expect(sidePanel.material.parameters.get("u_baseColorTextureEnabled")).toBe(0.36);
    expect(handleTrim.material.parameters.get("u_baseColor")).toEqual([0.012, 0.012, 0.013, 1]);
    expect(handleTrim.material.parameters.get("u_normalTextureEnabled")).toBe(0);
    expect(headlight.material.parameters.get("u_baseColor")).toEqual([0.022, 0.024, 0.024, 1]);
    expect(headlight.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.02);
    expect(headlight.material.parameters.get("u_transmissionFactor")).toBe(0);
    expect(license.material.parameters.get("u_baseColor")).toEqual([0.46, 0.44, 0.38, 1]);
    expect(license.material.parameters.get("u_baseColorTexture")).toBe("source-license-plate-texture");
    expect(license.material.parameters.get("u_baseColorTextureEnabled")).toBe(0.82);
    expect(license.material.parameters.get("u_specularFactor")).toBe(0.04);
    expect(license.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.006);

    const sourceTexturedPaint = createMaterialTarget("Paint 1 Carmine", "Paint 1 Carmine");
    sourceTexturedPaint.material.parameters.set("u_baseColorTexture", "source-paint-color-texture");
    sourceTexturedPaint.material.parameters.set("u_baseColorTextureTexCoord", 0);
    sourceTexturedPaint.material.parameters.set("u_baseColorTextureOffset", [0.25, 0.5]);
    sourceTexturedPaint.material.parameters.set("u_baseColorTextureScale", [0.75, 0.8]);
    sourceTexturedPaint.material.parameters.set("u_occlusionTexture", "source-paint-ao-texture");
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(sourceTexturedPaint.material as never, {
      nodeName: "BodyDoorLColor1",
      geometryKey: "BodyDoorLColor1",
      materialKey: sourceTexturedPaint.materialKey,
      sourceMaterialName: sourceTexturedPaint.sourceMaterialName
    });
    expect(sourceTexturedPaint.material.parameters.get("u_baseColorTexture")).toBe("source-paint-color-texture");
    expect(sourceTexturedPaint.material.parameters.get("u_baseColorTextureEnabled")).toBe(0.36);
    expect(sourceTexturedPaint.material.parameters.get("u_baseColorTextureTexCoord")).toBe(0);
    expect(sourceTexturedPaint.material.parameters.get("u_baseColorTextureOffset")).toEqual([0.25, 0.5]);
    expect(sourceTexturedPaint.material.parameters.get("u_baseColorTextureScale")).toEqual([0.75, 0.8]);
  });

  it("forces classified original-car renderable clones out of transparent shell render state", () => {
    const sourceState = {
      depthTest: true,
      depthWrite: false,
      cullMode: "none",
      blend: true,
      depthCompare: "less-equal",
      colorWrite: [true, true, true, true],
      scissor: null,
      polygonOffset: null,
      stencil: null
    } as const;

    expect(productConfiguratorOriginalCarRenderableRenderState(sourceState, {
      nodeName: "BodyWindshield",
      geometryKey: "BodyWindshield",
      materialKey: "Glass",
      sourceMaterialName: "Glass"
    })).toMatchObject({
      cullMode: "back",
      blend: false,
      depthTest: true,
      depthWrite: true
    });
    expect(productConfiguratorOriginalCarRenderableRenderState(sourceState, {
      nodeName: "UnknownDecor",
      geometryKey: "UnknownDecor",
      materialKey: "unknown",
      sourceMaterialName: "unknown"
    })).toBe(sourceState);
  });

  it("separates brake, wheel metal, and interior roles instead of broad bright legacy buckets", () => {
    const brake = createMaterialTarget("Brake", "Brake");
    const disc = createMaterialTarget("Disc", "Disc");
    const interior = createMaterialTarget("material-2", "material-2");

    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "WheelFrontLBrakePad",
      materialKey: "Brake",
      sourceMaterialName: "Brake"
    })).toBe("brake");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "WheelFrontLBrakeDisc",
      materialKey: "Disc",
      sourceMaterialName: "Disc"
    })).toBe("wheel-metal");
    expect(productConfiguratorOriginalCarMaterialVisualRole({
      nodeName: "InteriorFloor",
      materialKey: "material-2",
      sourceMaterialName: "material-2"
    })).toBe("interior");

    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(brake.material as never, {
      nodeName: "WheelFrontLBrakePad",
      geometryKey: "WheelFrontLBrakePad",
      materialKey: brake.materialKey,
      sourceMaterialName: brake.sourceMaterialName
    });
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(disc.material as never, {
      nodeName: "WheelFrontLBrakeDisc",
      geometryKey: "WheelFrontLBrakeDisc",
      materialKey: disc.materialKey,
      sourceMaterialName: disc.sourceMaterialName
    });
    applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(interior.material as never, {
      nodeName: "InteriorFloor",
      geometryKey: "InteriorFloor",
      materialKey: interior.materialKey,
      sourceMaterialName: interior.sourceMaterialName
    });

    expect(brake.material.parameters.get("u_baseColor")).toEqual([0.48, 0.028, 0.018, 1]);
    expect(brake.material.parameters.get("u_emissiveStrength")).toBe(0);
    expect(brake.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.012);
    expect(disc.material.parameters.get("u_baseColor")).toEqual([0.46, 0.44, 0.38, 1]);
    expect(disc.material.parameters.get("u_baseColorTextureEnabled")).toBe(0);
    expect(disc.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.16);
    expect(interior.material.parameters.get("u_baseColor")).toEqual([0.22, 0.048, 0.036, 1]);
    expect(interior.material.parameters.get("u_materialEnvironmentSpecularScale")).toBe(0.025);
    expect(interior.material.parameters.get("u_specularTextureEnabled")).toBe(0);
  });

  it("keeps procedural cleanup labels explicit and narrow", () => {
    expect(isProductConfiguratorProceduralArtifactLabel("overhead product strip light")).toBe(true);
    expect(isProductConfiguratorProceduralArtifactLabel("studio reflection streak")).toBe(true);
    expect(isProductConfiguratorProceduralArtifactLabel("body-finish swatch station")).toBe(false);
  });

  it("identifies imported hotspot candidates without accepting arbitrary product labels", () => {
    expect(isProductConfiguratorHotspotCandidateLabel("hotspot target lens-material")).toBe(true);
    expect(isProductConfiguratorHotspotCandidateLabel("material swatch rubber")).toBe(true);
    expect(isProductConfiguratorHotspotCandidateLabel("primary product configurator chassis")).toBe(true);
    expect(isProductConfiguratorHotspotCandidateLabel("floor grid helper")).toBe(false);
  });

  it("maps imported hotspot labels to stable focus parts", () => {
    expect(focusPartForProductConfiguratorImportedLabel("lens-material target")).toBe("lens");
    expect(focusPartForProductConfiguratorImportedLabel("body-finish control")).toBe("body");
    expect(focusPartForProductConfiguratorImportedLabel("sensor-module target")).toBe("sensor");
    expect(focusPartForProductConfiguratorImportedLabel("battery-sled hotspot")).toBe("battery");
    expect(focusPartForProductConfiguratorImportedLabel("ribbed grip shell")).toBe("grip");
    expect(focusPartForProductConfiguratorImportedLabel("mode selector control-dial")).toBe("controls");
    expect(focusPartForProductConfiguratorImportedLabel("unmapped imported node")).toBeUndefined();
  });

  it("pins the active product route to original texture-backed product GLBs", () => {
    const ids = configuredAuthoredAssetIdsForDemo("product-configurator");
    const layout = createProductConfiguratorShowcaseLayout();

    expect(ids).toEqual(["car-concept"]);
    expect(layout.items.map((item) => item.assetId)).toEqual(ids);
    expect(layout.items.find((item) => item.assetId === "car-concept")?.targetHeight).toBe(0.92);
    expect(layout.items.find((item) => item.assetId === "chronograph-watch")).toBeUndefined();
    expect(layout.items.find((item) => item.assetId === "sunglasses-khronos")).toBeUndefined();
    expect(layout.items.find((item) => item.assetId === "materials-variants-shoe")).toBeUndefined();
    expect(layout.frame.heroPaddingRatio).toBe(0.02);
    expect(ids.every(isProductConfiguratorOriginalProductAssetId)).toBe(true);
    expect(ids.some(isGeneratedProductConfiguratorFixtureAssetId)).toBe(false);

    expect(getAuthoredAssetCandidate("car-concept").localUrl).toBe("/fixtures/v8/assets/vehicles/car-concept.glb");
    expect(getAuthoredAssetCandidate("car-concept").provenance).toMatchObject({
      sourceKind: "external-fixture",
      generated: false,
      derivative: false,
      supportOnly: false,
      acceptableAsFocalHero: true,
      textureBacked: true
    });
    expect(isGeneratedProductConfiguratorFixtureAssetId("product-configurator-studio-blender")).toBe(true);
    expect(isGeneratedProductConfiguratorFixtureAssetId("car-concept-batched")).toBe(true);
    expect(getAuthoredAssetCandidate("product-configurator-studio-blender").provenance).toMatchObject({
      sourceKind: "generated-local-fixture",
      manifestPath: "fixtures/v9/assets/product-configurator-studio-blender/manifest.json",
      generated: true,
      derivative: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      generatedNoTexture: true
    });
    expect(getAuthoredAssetCandidate("car-concept-batched").provenance).toMatchObject({
      sourceKind: "generated-derivative",
      manifestPath: "fixtures/v9/assets/product-configurator-car-batched/manifest.json",
      sourceAssetPath: "fixtures/v8/assets/vehicles/car-concept.glb",
      generated: true,
      derivative: true,
      supportOnly: true,
      acceptableAsFocalHero: false,
      textureBacked: true
    });
  });

  it("keeps product focus offsets route-scoped and predictable", () => {
    expect(productConfiguratorFocusOffset("other-asset", "lens-material target", { focusPart: "lens" })).toEqual([0, 0, 0]);
    expect(productConfiguratorFocusOffset("product-configurator-studio-blender", "lens-material target", { focusPart: "lens" })).toEqual([0, 0.08, -0.16]);
    expect(productConfiguratorFocusOffset("product-configurator-studio-blender", "battery-sled support", { focusPart: "battery" })).toEqual([0.14, -0.04, 0.12]);
    expect(productConfiguratorFocusOffset("car-concept", "BodyHood", { focusPart: "body" })).toEqual([0, 0, 0]);
    expect(productConfiguratorFocusOffset("product-configurator-studio-blender", "unmatched imported node", { focusPart: "controls" })).toEqual([0, 0, 0]);
  });

  it("keeps exploded offsets bounded to asset-specific imported product part names", () => {
    expect(explodedProductPartOffset("product-configurator-studio-blender", "sensor logic board")).toEqual([0, 0.18, 0.28]);
    expect(explodedProductPartOffset("product-configurator-studio-blender", "left ribbed grip")).toEqual([-0.26, 0.06, 0.02]);
    expect(explodedProductPartOffset("product-configurator-studio-blender", "studio floor plinth label")).toEqual([0, 0, 0]);
    expect(explodedProductPartOffset("car-concept", ["BodyDoorLWindow", "BodyDoorLColor1", "BodyUnderside"])).toEqual([-0.18, 0.06, 0.045]);
    expect(explodedProductPartOffset("car-concept", ["BodyHeadlights", "BodyHood", "BodyUnderside"])).toEqual([0, 0.105, -0.2]);
    expect(explodedProductPartOffset("car-concept", ["BodyRoofPanel", "BodyWindshield"])).toEqual([0, 0.14, -0.06]);
    expect(explodedProductPartOffset("car-concept", ["InteriorSteeringWheel01", "InteriorSeatsColor1"])).toEqual([0, 0.055, 0.06]);
    expect(explodedProductPartOffset("chronograph-watch", "Band Carbon Fiber")).toEqual([0, 0, 0]);
    expect(explodedProductPartOffset("unmatched imported node", "BodyHood")).toEqual([0, 0, 0]);
  });

  it("applies runtime material controls through GLTF render-resource target metadata", () => {
    const carbon = createMaterialTarget("carbon-shell", "deep satin carbon fiber product shell");
    const glass = createMaterialTarget("glass", "smoked sapphire transparent glass");
    const resources = createRenderResources([carbon, glass]);

    expect(productConfiguratorMaterialOverrideTargetCount(resources)).toBe(2);
    applyProductConfiguratorRuntimeMaterialControls("car-concept", resources, { finish: "copper" });
    expect(carbon.material.parameters.get("u_baseColor")).toBeUndefined();

    applyProductConfiguratorRuntimeMaterialControls("product-configurator-studio-blender", resources, { finish: "copper" });

    expect(carbon.material.parameters.get("u_baseColor")).toEqual([0.03, 0.032, 0.032, 1]);
    expect(carbon.material.parameters.get("u_metallic")).toBe(0.22);
    expect(glass.material.parameters.get("u_transmissionFactor")).toBe(0);
    expect(glass.material.parameters.get("u_baseColor")).toEqual([0.055, 0.18, 0.23, 0.34]);
  });

  it("plans imported product material controls from GLTF variant metadata without mutating original asset materials", () => {
    const carPaint = createMaterialTarget("car-paint-carmine", "BodyColor1 Carmine", ["Carmine Candy"]);
    const wheel = createMaterialTarget("car-wheel", "Wheel alloy", []);
    const resources = createRenderResources([carPaint, wheel]);

    const plan = productConfiguratorImportedMaterialControlPlan("car-concept", resources, {
      controlKey: "carVariant",
      selectedVariant: "Carmine Candy"
    });

    expect(plan).toMatchObject({
      assetId: "car-concept",
      controlKey: "carVariant",
      selectedVariant: "Carmine Candy",
      targetCount: 1,
      uniqueMaterialCount: 1,
      usedMetadata: true,
      source: "GLTFRenderResources.materialVariants"
    });
    expect(plan.targetMaterialKeys).toEqual(["car-paint-carmine"]);
    expect(plan.targetSourceMaterials).toEqual(["BodyColor1 Carmine"]);
    expect(carPaint.material.parameters.size).toBe(0);

    const generatedPlan = productConfiguratorImportedMaterialControlPlan("product-configurator-studio-blender", resources, {
      controlKey: "finish",
      selectedVariant: "Carmine Candy"
    });
    expect(generatedPlan).toMatchObject({
      usedMetadata: false,
      source: "not-applicable",
      targetCount: 0
    });
    expect(generatedPlan.limitation).toContain("Generated/support");
  });
});

function createMaterialTarget(
  materialKey: string,
  sourceMaterialName: string,
  variants: readonly string[] = []
) {
  const material = {
    name: sourceMaterialName,
    parameters: new Map<string, unknown>(),
    getParameter(name: string): unknown {
      return this.parameters.get(name);
    },
    setParameter(name: string, value: unknown): void {
      this.parameters.set(name, value);
    }
  };
  return {
    materialKey,
    sourceMaterialName,
    material,
    materialVariants: variants.map((variant) => ({ variant }))
  };
}

function createRenderResources(targets: ReturnType<typeof createMaterialTarget>[]) {
  return {
    collectMaterialOverrideTargets(options: { readonly sourceMaterialName?: RegExp; readonly variant?: string } = {}) {
      return targets.filter((target) => {
        if (options.sourceMaterialName && !options.sourceMaterialName.test(target.sourceMaterialName)) return false;
        if (options.variant && !target.materialVariants.some((mapping) => mapping.variant === options.variant)) return false;
        return true;
      });
    }
  } as never;
}
