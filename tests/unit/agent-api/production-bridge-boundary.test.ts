import { readFileSync, readdirSync } from "node:fs";
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
  it("keeps every eligible authored scene on the production Renderer bridge", () => {
    const source = (function agentApiSource() {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(resolve(d, e.name)) : e.name.endsWith(".ts") ? [resolve(d, e.name)] : []);
  return walk("packages/engine/src/agent-api").map((f) => readFileSync(f, "utf8")).join("\n");
})();
    const sceneRenderer = extractFunctionBody(source, "createProductionSceneRenderer");
    // T2.4: the bridge lives in compiler/renderer.ts (15-owned carve-out); the
    // input/postprocess/shadows builders moved to their own compiler modules.
    const rendererSource = readFileSync(resolve(process.cwd(), "packages/engine/src/agent-api/compiler/renderer.ts"), "utf8");
    const runtimeRenderer = extractFunctionBody(rendererSource, "createProductionRuntimeSceneRenderer");
    const renderInputSource = readFileSync(resolve(process.cwd(), "packages/engine/src/agent-api/compiler/renderInput.ts"), "utf8");
    const inputBuilder = extractFunctionBody(renderInputSource, "createProductionRuntimeRendererInput");
    const collectedLights = extractFunctionBody(source, "createProductionRuntimeCollectedLights");
    const postprocessSource = readFileSync(resolve(process.cwd(), "packages/engine/src/agent-api/compiler/postprocess.ts"), "utf8");
    const postprocess = extractFunctionBody(postprocessSource, "createProductionRuntimePostprocess");
    const shadowsSource = readFileSync(resolve(process.cwd(), "packages/engine/src/agent-api/compiler/shadows.ts"), "utf8");
    const shadows = extractFunctionBody(shadowsSource, "createProductionRuntimeShadowOptions");

    expect(sceneRenderer).toContain("analyzeProductionBridgeEligibility");
    expect(sceneRenderer).toContain("createProductionRuntimeSceneRenderer");
    expect(sceneRenderer).toContain("production renderer rejected this scene");
    expect(sceneRenderer).toContain("Production bridge failed and safe-basic fallback rendered instead:");

    expect(runtimeRenderer).toContain("createTypedGLBActor");
    expect(runtimeRenderer).toContain('node.role === "primaryWorld" ? { consolidateStaticMeshes: true }');
    expect(runtimeRenderer).toContain("actor.dispose()");
    expect(runtimeRenderer).toContain("modelNodes.length > 0");
    expect(runtimeRenderer).toContain("Renderer.create");
    expect(runtimeRenderer).toContain("productionRenderer.render(");
    expect(runtimeRenderer).toContain("productionRenderer.renderAsync(");
    expect(runtimeRenderer).toContain("rendererInteractiveFeatureReport");
    expect(runtimeRenderer).toContain("createProductionRuntimeCollectedLights(snapshot)");
    expect(runtimeRenderer).toContain("productionRuntimeLights");
    expect(runtimeRenderer).toContain("productionRenderer.resize");
    expect(runtimeRenderer).toContain("productionRenderer.onDeviceLost");
    expect(runtimeRenderer).toContain("productionRenderer.onDeviceRestored");

    expect(inputBuilder).toContain("entry.actor.collectRenderItems");
    expect(inputBuilder).toContain("castShadow: currentNode.castShadow");
    expect(inputBuilder).toContain("applyProductionActorAnimation");
    expect(inputBuilder).toContain("attachProductionActorEvidence");
    expect(inputBuilder).toContain("collectedLights,");
    // muse3jsparity-PRD A5 task 2: the postprocess builder takes the collected
    // light list + render size so the volumetric quality scaler can reuse the
    // dominant light and drop step count with resolution scale.
    expect(inputBuilder).toContain("createProductionRuntimePostprocess(snapshot, collectedLights,");
    expect(inputBuilder).toContain("createProductionRuntimeShadowOptions(snapshot, collectedLights)");

    expect(collectedLights).toContain("groups.flatten(snapshot.nodes)");
    expect(collectedLights).toContain("createProductionRuntimeLightDescriptors");
    expect(collectedLights).toContain("createProductionRuntimeFallbackLights");
    expect(collectedLights).toContain("createProductionRuntimeCollectedLight");

    expect(postprocess).toContain("authoredBloom");
    expect(postprocess).toContain("bloomRequested");
    expect(postprocess).toContain('operator: "aces"');
    // muse3jsparity-PRD A3: color-grade / outline / fxaa / ssr / depth-of-field
    // submit real native options. R02 now binds temporal history for supported
    // geometry; motion blur/TAA remain gated rather than submitted unconditionally.
    expect(postprocess).toContain("authoredColorGrade");
    expect(postprocess).toContain("authoredOutline");
    expect(postprocess).toContain("fxaaRequested");
    expect(postprocess).toContain("authoredSsr");
    expect(postprocess).toContain("authoredDof");
    expect(postprocess).toContain("colorGrade: {");
    expect(postprocess).toContain("outline: {");
    expect(postprocess).toContain("ssr: {");
    expect(postprocess).toContain("depthOfField: {");
    expect(postprocess).toContain("const temporalRequested = temporalSupported &&");
    expect(postprocess).toContain("...(temporalRequested ? {");
    expect(postprocess).toContain("temporal: { sceneKey }");
    expect(postprocess).toContain("motionBlur: {");
    expect(postprocess).toContain("taa: {");
    expect(shadows).toContain("resolveRendererSceneCategory(snapshot, names)");
    expect(shadows).toContain("sceneRadius");
    expect(shadows).toContain("collectedLights.find");
    expect(shadows).toContain("sceneRadius > 30 ? 4096 : sceneRadius > 10 ? 2048 : 1024");
    expect(source).not.toContain("PRODUCTION_RUNTIME_POSTPROCESS");
    expect(source).not.toContain("PRODUCTION_RUNTIME_SHADOWS");

    for (const productionOnlyBody of [runtimeRenderer, inputBuilder]) {
      expect(productionOnlyBody).not.toContain("createWebGLSceneRenderer");
      expect(productionOnlyBody).not.toContain("loadGltfForWebGL");
      expect(productionOnlyBody).not.toContain("createWebGLModel");
      expect(productionOnlyBody).not.toContain("generateModelFallbackGeometry");
    }
  });
});
