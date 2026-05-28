import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function countAppLines(path: string): number {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .length;
}

describe("agent API line-count acceptance", () => {
  it("keeps the product-viewer template under 60 lines of app code", () => {
    const path = "packages/create-aura3d/templates/product-viewer/src/main.ts";
    const source = readFileSync(path, "utf8");

    expect(source).toContain("createAuraApp");
    expect(source).toContain("model(assets.product");
    expect(source).toContain("lights.studio");
    expect(countAppLines(path)).toBeLessThanOrEqual(60);
  });

  it("keeps the cinematic-scene template under 120 lines of app code", () => {
    const path = "packages/create-aura3d/templates/cinematic-scene/src/main.ts";
    const source = readFileSync(path, "utf8");

    expect(source).toContain("createAuraApp");
    expect(source).toContain("model(assets.hero");
    expect(source).toContain("camera.dolly");
    expect(source).toContain("effects.rain");
    expect(source).toContain("effects.fog");
    expect(source).toContain("effects.bloom");
    expect(countAppLines(path)).toBeLessThanOrEqual(120);
  });
});
