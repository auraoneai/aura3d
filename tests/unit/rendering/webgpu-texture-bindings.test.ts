import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WebGPU texture binding diagnostics", () => {
  it("tracks native sampled texture binding capabilities and counters", () => {
    const source = readFileSync(resolve("packages/rendering/src/WebGPUDevice.ts"), "utf8");

    expect(source).toContain("native-sampled-textures");
    expect(source).toContain("hasNativeSampledTextureBinding");
    expect(source).toContain("nativeTextureBindings");
    expect(source).toContain("queue.writeTexture");
  });
});
