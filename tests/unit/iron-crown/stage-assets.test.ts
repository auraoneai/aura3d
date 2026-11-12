import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stageAssets } from "../../../apps/showcase-iron-crown/src/game/stage-assets";

const APP_SRC = path.resolve("apps/showcase-iron-crown/src");
const ROOT_CATALOG = readFileSync(path.resolve("src/aura-assets.ts"), "utf8");
const stages = readFileSync(path.join(APP_SRC, "game/stages.ts"), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []
  );
}

describe("iron crown loads a per-app stage manifest, not the shared catalog (RH-06)", () => {
  it("no app source imports the repo-root src/aura-assets catalog", () => {
    for (const file of sourceFiles(APP_SRC)) {
      expect(readFileSync(file, "utf8"), path.relative(APP_SRC, file)).not.toMatch(/from\s+["'](\.\.\/)+src\/aura-assets["']/);
    }
  });

  it("stages.ts mounts procedural set-pieces with zero static GLB model() props (WP-05)", () => {
    expect(stages).not.toMatch(/\bmodel\s*\(/);
    expect(stages).not.toContain("stageAssets.");
    expect(stages).toContain("../art/proceduralModels");
  });

  it("each entry matches the shared catalog (url and hash) and its file exists under public/aura-assets", () => {
    for (const [id, ref] of Object.entries(stageAssets) as [string, { url: string; hash: string }][]) {
      const start = ROOT_CATALOG.indexOf(`\n  "${id}": {`);
      expect(start, id).toBeGreaterThan(0);
      const block = ROOT_CATALOG.slice(start, start + 600);
      expect(block, id).toContain(`url: "${ref.url}"`);
      expect(block, id).toContain(`hash: "${ref.hash}"`);
      expect(existsSync(path.resolve("public", ref.url.replace(/^\//, ""))), ref.url).toBe(true);
    }
  });

  it("the manifest module is a small fraction of the shared catalog", () => {
    const appBytes = readFileSync(path.join(APP_SRC, "game/stage-assets.ts")).byteLength;
    expect(appBytes).toBeLessThan(ROOT_CATALOG.length / 10);
  });
});

describe("iron crown throne plinth (IC-16 / WP-09 / WP-05)", () => {
  it("the pale gallery pedestal is gone and the procedural throne sits atop the 0.34m stepped dais with the crown on the throne", () => {
    expect(stages).not.toContain("galleryShiftPedestal");
    expect(stages).toContain("buildThronePlinth()");
    expect(stages).toContain("export const PLINTH_TOP = 0.34;");
    expect(stages).toContain('buildSovereignThroneChair("cr-throne-chair", [0, PLINTH_TOP, PLINTH_Z], 0)');
    expect(stages).toContain('buildIronCrownRelic("cr-iron-crown", [0, PLINTH_TOP + 0.48, PLINTH_Z + 0.14], 0)');
  });
});
