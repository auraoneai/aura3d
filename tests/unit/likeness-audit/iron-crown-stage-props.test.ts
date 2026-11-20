import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve("apps/showcase-iron-crown");
const APP_MANIFEST = JSON.parse(readFileSync(path.join(APP, "aura.assets.json"), "utf8"));
const appEntries: Array<{ id: string; hash: string }> = APP_MANIFEST.assets ?? APP_MANIFEST;
const stages = readFileSync(path.join(APP, "src/game/stages.ts"), "utf8");

// The shared trophy-cabinet model's baked texture atlas holds small framed photographs of real people (faces). The Crown
// Arena builds its cabinets from primitives (wood, gold cups, flat crimson banners); the scanned model, its hash or its
// bytes under any name must not come back into Iron Crown. The model has since been removed from the shared catalog, so its
// key prefix and content hash are pinned here.
const OLD_KEY_PREFIX = "billiardsTrophyCabinet";
const OLD_HASH = "sha256-f0e4f16a1c06937f1bae3cb2fe9391ea682781d73d0b2da53e5381dc0fecb700";

describe("iron crown stage props carry no photographic portraits", () => {
  it("the Crown Arena does not reference the photographic cabinet model", () => {
    expect(stages).not.toContain(OLD_KEY_PREFIX);
  });

  it("the Crown Arena draws its cabinets from primitives with flat-colour banners", () => {
    expect(stages).toContain("buildTrophyCabinets()");
    expect(stages).toContain('"cr-cabinet-banner"');
    expect(stages).toContain('"cr-cabinet-cups"');
  });

  it("the old cabinet (by key, hash, file name or bytes) is not shipped with the app", () => {
    expect(appEntries.some((e) => e.id.startsWith(OLD_KEY_PREFIX) || e.hash === OLD_HASH)).toBe(false);
    const dir = path.join(APP, "public/aura-assets");
    const shipped = readdirSync(dir);
    expect(shipped.filter((f) => f.startsWith(OLD_KEY_PREFIX))).toEqual([]);
    for (const f of shipped.filter((x) => x.endsWith(".glb"))) {
      const h = `sha256-${createHash("sha256").update(readFileSync(path.join(dir, f))).digest("hex")}`;
      expect(h === OLD_HASH, `${f} is byte-identical to the old cabinet`).toBe(false);
    }
  });

  it("no Iron Crown stage prop in the shared catalog is the old cabinet", () => {
    const used = [...stages.matchAll(/(?:rootAssets|stageAssets)\.(\w+)/g)].map((m) => m[1]);
    expect(used.filter((key) => key?.startsWith(OLD_KEY_PREFIX))).toEqual([]);
  });
});
