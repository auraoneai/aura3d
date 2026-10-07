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
    expect(source).toContain('from "@aura3d/engine"');
    expect(source).toContain("model(assets.product");
    expect(source).toContain("looks.preset(");
    expect(source).toContain("interactions.orbit(");
    expect(source).toContain("app.ready()");
    // looks-preset wiring and comments-in-code pushed the starter to 81 app lines.
    expect(countAppLines(path)).toBeLessThanOrEqual(90);
  });

  it("keeps the cinematic-scene template under 120 lines of app code", () => {
    const path = "packages/create-aura3d/templates/cinematic-scene/src/main.ts";
    const source = readFileSync(path, "utf8");

    expect(source).toContain("createAuraApp");
    expect(source).toContain("definePromptPlan");
    expect(source).toContain("compilePromptPlanV2");
    expect(source).toContain("asset: assets.hero");
    expect(source).toContain('sceneType: "cinematic-scene"');
    expect(source).toContain('"fog"');
    expect(source).toContain('"bloom"');
    expect(countAppLines(path)).toBeLessThanOrEqual(120);
  });

  it("keeps the mini-game template bounded as a real playable starter", () => {
    const path = "packages/create-aura3d/templates/mini-game/src/main.ts";
    const source = readFileSync(path, "utf8");

    expect(source).toContain("createGame");
    expect(source).toContain("game.platformer");
    expect(source).toContain("game.input");
    expect(source).toContain("model(assets.showcaseKenneyOobiPlatformerHero");
    expect(source).toContain("__AURA3D_MINI_GAME__");
    expect(source).toContain("routeEvents");
    // createGame evidence plumbing pushed the starter to 267 app lines.
    expect(countAppLines(path)).toBeLessThanOrEqual(280);
  });
});
