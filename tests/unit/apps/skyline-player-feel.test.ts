import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getSkylineActPalette,
  resolveSkylineActIndex,
  skylineActPaletteSignature
} from "../../../apps/showcase-skyline-runner/src/act-palette";
import { createSkylineFeel } from "../../../apps/showcase-skyline-runner/src/feel";
import { SKYLINE_SECTION_STRIDE } from "../../../apps/showcase-skyline-runner/src/level";

describe("Skyline player feel", () => {
  it("changes act palette signatures across the five acts", () => {
    const signatures = [0, 1, 2, 3, 4].map((actIndex) => skylineActPaletteSignature(getSkylineActPalette(actIndex)));
    expect(new Set(signatures).size).toBe(5);
    expect(getSkylineActPalette(0).title).toBe("Home Grove");
    expect(getSkylineActPalette(4).title).toBe("Aurora Crown");
    expect(getSkylineActPalette(0).skyRamp[0]).not.toBe(getSkylineActPalette(2).skyRamp[0]);
  });

  it("resolves act progression from traversal x", () => {
    expect(resolveSkylineActIndex(0)).toBe(0);
    expect(resolveSkylineActIndex(SKYLINE_SECTION_STRIDE * 2.2)).toBeGreaterThanOrEqual(1);
    expect(resolveSkylineActIndex(SKYLINE_SECTION_STRIDE * 9.2)).toBe(4);
  });

  it("reports frozen simulation while paused", () => {
    const feel = createSkylineFeel({
      reducedMotion: true,
      cameraBaseOffset: [0.4, 0.62, 3.75],
      cameraTargetOffset: [1.05, 0.34, 0]
    });
    expect(feel.snapshot().simFrozen).toBe(false);
    feel.togglePause();
    expect(feel.snapshot().simFrozen).toBe(true);
    feel.resetPause();
    expect(feel.snapshot().simFrozen).toBe(false);
  });

  it("keeps public HUD free of raw x unless debug mode is enabled", () => {
    const hudSource = readFileSync("apps/showcase-skyline-runner/src/hud.ts", "utf8");
    const mainSource = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");
    const publicMetrics = hudSource.slice(
      hudSource.indexOf('class="metrics-row game-metrics"'),
      hudSource.indexOf("checkpoint-row")
    );
    expect(hudSource).toContain('aria-label", "Skyline Runner game HUD"');
    expect(hudSource).toContain("publicSkylineHudShowsRawX");
    expect(hudSource).toContain('debug ? requireElement("x-value") : null');
    expect(publicMetrics).not.toContain("x-value");
    expect(publicMetrics).toContain("score-value");
    expect(publicMetrics).toContain("act-title-value");
    expect(mainSource).toContain("setupSkylineHud");
    expect(mainSource).toContain("updateSkylineHud");
  });

  it("wires pause, cameraDirector, and act palette helpers in main.ts", () => {
    const source = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");
    expect(source).toContain('pause: ["KeyP"]');
    expect(source).toContain("createSkylineFeel");
    expect(source).toContain("if (paused) {");
    expect(source).toContain("applySkylineActPaletteVisibility");
    expect(source).toContain("setupSkylineHud");
    expect(source).not.toContain('aria-label="Skyline Runner controls and evidence"');
  });
});
