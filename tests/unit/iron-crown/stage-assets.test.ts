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

  it("every stage prop used in stages.ts is defined in the app manifest", () => {
    const used = [...new Set([...stages.matchAll(/stageAssets\.(\w+)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThan(20);
    for (const id of used) expect((stageAssets as Record<string, unknown>)[id], id).toBeDefined();
    expect(Object.keys(stageAssets).sort()).toEqual([...used].sort());
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

describe("iron crown throne plinth (IC-16)", () => {
  it("the pale gallery pedestal is gone and the crown sits on the plinth top", () => {
    expect(stages).not.toContain("galleryShiftPedestal");
    expect(stages).toContain("buildThronePlinth()");
    expect(stages).toMatch(/cr-iron-crown[\s\S]{0,120}\.position\(0, PLINTH_TOP, -2\.5\)/);
  });
});
