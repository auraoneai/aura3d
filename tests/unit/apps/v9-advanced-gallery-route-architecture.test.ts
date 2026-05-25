import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("v9 advanced gallery route architecture containment", () => {
  it("keeps sceneBuilders as shared resource setup plus route dispatch", () => {
    const sceneBuilders = readFileSync("apps/v9-advanced-examples-gallery/src/sceneBuilders.ts", "utf8");

    expect(sceneBuilders).toContain("export function createResources");
    expect(sceneBuilders).toContain("export function buildScene");
    expect(sceneBuilders).toContain('from "./proceduralRouteScenes"');
    expect(sceneBuilders).not.toMatch(/function build(?:WaterLab|Ocean|SmartCity|RoboticsLab|Physics|FogCathedral|DigitalTwin)\s*\(/);
    expect(sceneBuilders).not.toContain("createOceanRouteProfile");
    expect(sceneBuilders).not.toContain("createSmartCityRouteEvidence");
    expect(sceneBuilders).not.toContain("createRoboticsLabEvidence");
    expect(sceneBuilders).not.toContain("createFogCathedralEvidence");
    expect(sceneBuilders).not.toContain("getPhysicsPlaygroundFrame");
  });

  it("keeps authoredLayer generic and routes asset-specific decisions through policy helpers", () => {
    const authoredLayer = readFileSync("apps/v9-advanced-examples-gallery/src/authoredLayer.ts", "utf8");
    const authoredLayerPolicies = readFileSync("apps/v9-advanced-examples-gallery/src/authoredLayerPolicies.ts", "utf8");

    expect(authoredLayer).toContain("authoredRouteAssetConfigs");
    expect(authoredLayer).toContain("authoredAssetMaterialRenderStateOverrides");
    expect(authoredLayer).toContain("authoredMaterialForImportedRenderable");
    expect(authoredLayer).not.toContain("const ROUTE_ASSETS");
    expect(authoredLayer).not.toContain("./productConfiguratorPolicy");
    expect(authoredLayer).not.toContain("createProductConfiguratorShowcaseLayout");
    expect(authoredLayer).not.toContain("productConfiguratorOriginalCarRenderStateOverrides");
    expect(authoredLayer).not.toContain('assetId === "data-galaxy-core-blender"');
    expect(authoredLayer).not.toContain('assetId === "reactor-command-center-blender"');
    expect(authoredLayer).not.toContain('assetId === "product-configurator-studio-blender"');

    expect(authoredLayerPolicies).toContain("const ROUTE_ASSETS");
    expect(authoredLayerPolicies).toContain("createProductConfiguratorShowcaseLayout");
    expect(authoredLayerPolicies).toContain('assetId === "data-galaxy-core-blender"');
    expect(authoredLayerPolicies).toContain('assetId === "reactor-command-center-blender"');
    expect(authoredLayerPolicies).toContain('assetId === "product-configurator-studio-blender"');
  });
});
