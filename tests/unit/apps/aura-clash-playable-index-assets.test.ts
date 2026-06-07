import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve("apps/aura-clash-showcase");
const publicRoot = join(appRoot, "public");

describe("Aura Clash playable index asset paths", () => {
  it("preloads final GLB and audio assets and points previews at generated public files", () => {
    const html = readFileSync(join(appRoot, "playable/index.html"), "utf8");
    const referencedPaths = Array.from(html.matchAll(/(?:href|content)="https:\/\/aura3d\.auraone\.ai([^"]+)"|(?:href|content)="(\/aura-assets\/[^"]+)"/g))
      .map((match) => match[1] ?? match[2])
      .filter((path): path is string => Boolean(path) && path.startsWith("/aura-assets/"));

    expect(referencedPaths).toContain("/aura-assets/auraClashPlayerRig.d8672924.glb");
    expect(referencedPaths).toContain("/aura-assets/auraClashRivalRig.9a0ffda4.glb");
    expect(referencedPaths).toContain("/aura-assets/auraClashPlayableScene.thumb.svg");
    expect(referencedPaths.filter((path) => path.endsWith(".ogg")).length).toBeGreaterThanOrEqual(11);
    expect(html).not.toContain("/previews/aura-clash-poster.svg");

    for (const path of new Set(referencedPaths)) {
      expect(existsSync(join(publicRoot, path.slice(1))), `${path} should exist under public/`).toBe(true);
    }
  });
});
