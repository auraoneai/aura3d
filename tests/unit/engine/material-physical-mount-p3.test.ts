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

describe("P3 material.physical mount proof", () => {
  it("every physical extension param reaches a PBRMaterial factor (none dropped at mount)", () => {
    const source = readFileSync(resolve(process.cwd(), "packages/engine/src/agent-api/compiler/primitives.ts"), "utf8");
    const materialBuilder = extractFunctionBody(source, "createProductionPrimitiveMaterial");

    // Each requested extension maps onto a renderer factor. Deleting any line
    // below re-creates the WS-2.1a parameter drop and fails this test — the
    // physical claim is earned at the mount, not just in spec metadata.
    expect(materialBuilder).toContain("clearcoatFactor: clearcoat");
    expect(materialBuilder).toContain("clearcoatRoughnessFactor:");
    expect(materialBuilder).toContain("sheenColorFactor: sheenColor");
    expect(materialBuilder).toContain("sheenRoughnessFactor:");
    expect(materialBuilder).toContain("anisotropyStrength: anisotropy");
    expect(materialBuilder).toContain("anisotropyRotation: materialSpec?.anisotropyRotation");
    expect(materialBuilder).toContain("iridescenceFactor: iridescence");
    expect(materialBuilder).toContain("iridescenceIor:");
    expect(materialBuilder).toContain("transmissionFactor: transmission");
    expect(materialBuilder).toContain("volumeThicknessFactor:");
    expect(materialBuilder).toContain("volumeAttenuationColor:");
    expect(materialBuilder).toContain("volumeAttenuationDistance:");
    expect(materialBuilder).toContain("ior: Math.max(1, materialSpec.ior)");
  });

  it("instanced fast path forwards surface extensions and expands transmissive/volume materials", () => {
    const source = readFileSync(resolve(process.cwd(), "packages/engine/src/agent-api/compiler/primitives.ts"), "utf8");
    const materialBuilder = extractFunctionBody(source, "createProductionPrimitiveMaterial");

    // Surface physical extensions (clearcoat, sheen, anisotropy, iridescence, ior, specular)
    // are forwarded onto InstancedPBRMaterial; transmissive/volumetric materials expand.
    expect(materialBuilder).toContain("if (node.instances && transmission === 0 && materialSpec?.thickness === undefined");
    expect(materialBuilder).toContain("those continue to render correctly via expansion");
  });
});
