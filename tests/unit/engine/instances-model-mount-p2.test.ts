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

describe("P2 instances.model mount proof", () => {
  it("model instances attach exactly like primitive nodes (no silent N-draw, no dropped copies)", () => {
    const source = readFileSync(resolve(process.cwd(), "packages/engine/src/agent-api/index.ts"), "utf8");
    const inputBuilder = extractFunctionBody(source, "createProductionRuntimeRendererInput");

    // Mount builds one Float32Array of model matrices for every instance.
    expect(inputBuilder).toContain("createProductionModelInstanceTransforms(modelInstances");
    // Per-instance colors ride the same items when the node carries them, exactly like primitives.
    expect(inputBuilder).toContain("createProductionInstanceColors(currentNode.instanceColors");
    // Primitive parity: the same helpers back the primitive path.
    expect(inputBuilder).toContain(
      "instanceTransforms: createProductionInstanceTransforms(currentState.node.instances"
    );
    // Skinned actors cannot instance: warn once and draw single instead of silently dropping copies.
    expect(inputBuilder).toContain("actorItems.some((item) => item.skinning)");
    expect(inputBuilder).toContain("warnOnInstancingFallback");
    expect(inputBuilder).toContain("skinned-palette-overflow-cpu-fallback");
    // The build-time D1 fallback diagnostic is surfaced at mount, never swallowed.
    expect(inputBuilder).toContain("if (currentNode.instancedModelWarning) runtimeWarnings.add(currentNode.instancedModelWarning)");
    // Instance attachments land on every pushed render item with the node's shadow intent.
    expect(inputBuilder).toContain("castShadow: currentNode.castShadow, ...modelInstanceAttach");
  });
});
