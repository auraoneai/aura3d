import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG_IDS, assets } from "../../../apps/showcase-teleoperator/src/aura-assets";

const root = resolve(__dirname, "../../..");
const manifest = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8")) as { assets: Array<{ id: string; url: string; sha256: string }> };
const appSrc = (file: string): string => readFileSync(join(root, "apps/showcase-teleoperator/src", file), "utf8");

describe("grid dispatch per-app asset manifest (RH-06, C6)", () => {
  it("does not import the root asset catalog", () => {
    for (const file of ["main.ts", "scene.ts", "sim.ts", "aura-assets.ts"]) expect(appSrc(file)).not.toMatch(/src\/aura-assets["']/);
  });
  it("every entry points at the same file and hash as its root manifest id, so the deploy copies it", () => {
    for (const [key, entry] of Object.entries(assets)) {
      const id = CATALOG_IDS[key as keyof typeof assets];
      if (id === null) {
        // Route-local (WP-36 Meshy admission): the file ships from the app's public tree; its bytes match the typed hash.
        const file = join(root, "apps/showcase-teleoperator/public", entry.url);
        expect(`sha256-${createHash("sha256").update(readFileSync(file)).digest("hex")}`, key).toBe(entry.hash);
        expect(existsSync(join(root, "apps/showcase-teleoperator/public/aura-assets/meshy/provenance", `${basename(entry.url, ".glb")}.rights.json`)), `${key} rights`).toBe(true);
        continue;
      }
      const m = manifest.assets.find((a) => a.id === id);
      expect(m, `${key} -> ${id}`).toBeDefined();
      expect(m!.url, key).toBe(entry.url);
      expect(`sha256-${m!.sha256}`, key).toBe(entry.hash);
    }
  });
  it("game keys and ids carry no real brand names", () => {
    const brands = /waymo|cybercab|cybertruck|corvette|tesla|jaguar|mindblown/i;
    for (const key of Object.keys(assets)) expect(key).not.toMatch(brands);
    for (const file of ["main.ts", "scene.ts", "sim.ts", "rules.ts", "hud.ts", "touch.ts", "audio.ts", "../index.html", "../package.json", "../route-health.json"]) {
      const text = file === "aura-assets.ts" ? "" : appSrc(file);
      expect(text, file).not.toMatch(brands);
    }
  });
});
