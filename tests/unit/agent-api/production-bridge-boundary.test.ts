import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function extractFunctionBody(source: string, name: string): string {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  expect(match, `expected function ${name} to exist`).toBeTruthy();

  const braceStart = source.indexOf("{", match!.index);
  expect(braceStart, `expected function ${name} to have a body`).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(braceStart, index + 1);
  }

  throw new Error(`Unable to extract body for ${name}`);
}

describe("createAuraApp production bridge boundary", () => {
  it("keeps the eligible typed-GLB production path on the ProductionRuntimeRenderer bridge", () => {
    const source = readFileSync(resolve(process.cwd(), "packages/engine/src/agent-api/index.ts"), "utf8");
    const sceneRenderer = extractFunctionBody(source, "createProductionSceneRenderer");
    const runtimeRenderer = extractFunctionBody(source, "createProductionRuntimeSceneRenderer");
    const inputBuilder = extractFunctionBody(source, "createProductionRuntimeRendererInput");
    const collectedLights = extractFunctionBody(source, "createProductionRuntimeCollectedLights");

    expect(sceneRenderer).toContain("analyzeProductionBridgeEligibility");
    expect(sceneRenderer).toContain("createProductionRuntimeSceneRenderer");
    expect(sceneRenderer).toContain("Production bridge skipped:");
    expect(sceneRenderer).toContain("Production bridge failed and safe-basic fallback rendered instead:");

    expect(runtimeRenderer).toContain("createTypedGLBActor");
    expect(runtimeRenderer).toContain("ProductionRuntimeRenderer.create");
    expect(runtimeRenderer).toContain("renderInteractiveFrame");
    expect(runtimeRenderer).toContain("createProductionRuntimeCollectedLights(snapshot)");
    expect(runtimeRenderer).toContain("productionRuntimeLights");

    expect(inputBuilder).toContain("entry.actor.collectRenderItems");
    expect(inputBuilder).toContain("applyProductionActorAnimation");
    expect(inputBuilder).toContain("attachProductionActorEvidence");
    expect(inputBuilder).toContain("collectedLights,");

    expect(collectedLights).toContain("groups.flatten(snapshot.nodes)");
    expect(collectedLights).toContain("createProductionRuntimeLightDescriptors");
    expect(collectedLights).toContain("createProductionRuntimeFallbackLights");
    expect(collectedLights).toContain("createProductionRuntimeCollectedLight");

    for (const productionOnlyBody of [runtimeRenderer, inputBuilder]) {
      expect(productionOnlyBody).not.toContain("createWebGLSceneRenderer");
      expect(productionOnlyBody).not.toContain("loadGltfForWebGL");
      expect(productionOnlyBody).not.toContain("createWebGLModel");
      expect(productionOnlyBody).not.toContain("generateModelFallbackGeometry");
    }
  });
});
