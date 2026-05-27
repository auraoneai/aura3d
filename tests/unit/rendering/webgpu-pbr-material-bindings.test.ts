import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WebGPU PBR material bindings", () => {
  it("keeps glTF PBR texture channels wired into the WebGPU submission path", () => {
    const source = readFileSync(resolve("packages/rendering/src/WebGPUDevice.ts"), "utf8");

    expect(source).toContain("actualBaseColor");
    expect(source).toContain("actualNormal");
    expect(source).toContain("actualMetallicRoughness");
    expect(source).toContain("actualOcclusion");
    expect(source).toContain("u_metallicRoughnessTextureEnabled");
    expect(source).toContain("u_occlusionTextureEnabled");
    expect(source).toContain("materialFlags");
    expect(source).toContain("nativePbrSubmissions");
  });
});
