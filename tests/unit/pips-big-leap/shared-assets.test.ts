// RH-06: Pip's Big Leap uses a per-app copy of the shared-catalog entries it needs.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sharedAssets } from "../../../apps/showcase-pips-big-leap/src/aura-assets.shared";
import { assets as root } from "../../../src/aura-assets";

describe("pips-big-leap shared asset subset (RH-06)", () => {
  it("no app module imports the repo-root catalog", () => {
    for (const f of ["src/aura-assets.ts", "src/main.ts", "src/game/world.ts", "src/game/certify.ts"]) {
      const text = readFileSync(resolve(process.cwd(), "apps/showcase-pips-big-leap", f), "utf8");
      expect(text, f).not.toMatch(/from "\.\.\/\.\.\/\.\.\/src\/aura-assets"/);
    }
  });

  it("matches the root catalog's url, hash and size for every copied entry", () => {
    const rootMap = root as unknown as Record<string, { url: string; hash?: string; sizeBytes?: number }>;
    for (const [key, entry] of Object.entries(sharedAssets as unknown as Record<string, { url: string; hash?: string; sizeBytes?: number }>)) {
      expect(rootMap[key], key).toBeDefined();
      expect(entry.url, key).toBe(rootMap[key]!.url);
      expect(entry.hash, key).toBe(rootMap[key]!.hash);
      expect(entry.sizeBytes, key).toBe(rootMap[key]!.sizeBytes);
    }
  });

  it("the generated file is current", () => {
    const out = execFileSync(process.execPath, ["apps/showcase-pips-big-leap/scripts/sync-shared-assets.mjs", "--check"], { encoding: "utf8" });
    expect(out).toContain("is current");
  });
});
