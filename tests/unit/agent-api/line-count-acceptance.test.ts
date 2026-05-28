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
    expect(source).toContain("definePromptPlan");
    expect(source).toContain("promptPlanToScene");
    expect(source).toContain("asset: assets.product");
    expect(source).toContain('sceneType: "product-viewer"');
    expect(countAppLines(path)).toBeLessThanOrEqual(60);
  });

  it("keeps the cinematic-scene template under 120 lines of app code", () => {
    const path = "packages/create-aura3d/templates/cinematic-scene/src/main.ts";
    const source = readFileSync(path, "utf8");

    expect(source).toContain("createAuraApp");
    expect(source).toContain("definePromptPlan");
    expect(source).toContain("promptPlanToScene");
    expect(source).toContain("asset: assets.hero");
    expect(source).toContain('sceneType: "cinematic-scene"');
    expect(source).toContain('"rain"');
    expect(source).toContain('"fog"');
    expect(source).toContain('"bloom"');
    expect(countAppLines(path)).toBeLessThanOrEqual(120);
  });

  it("keeps the mini-game template compact through prompt recipe selection", () => {
    const path = "packages/create-aura3d/templates/mini-game/src/main.ts";
    const source = readFileSync(path, "utf8");

    expect(source).toContain("createAuraApp");
    expect(source).toContain("definePromptPlan");
    expect(source).toContain("promptPlanToScene");
    expect(source).toContain("asset: assets.playerModel");
    expect(source).toContain('sceneType: "mini-game"');
    expect(source).toContain('"motion-trail"');
    expect(source).toContain('"hud"');
    expect(countAppLines(path)).toBeLessThanOrEqual(80);
  });
});
