import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("optional physical simulation boundary", () => {
  it("keeps Rapier out of core, product, arcade, and recommended lean entries", () => {
    const paths = [
      "packages/engine/src/agent-api/lean.ts",
      "packages/engine/src/agent-api/lean-product.ts",
      "packages/engine/src/agent-api/lean-game.ts",
      "packages/engine/src/agent-api/GameRuntime.ts",
      "packages/engine/src/agent-api/GameGenreKits.ts"
    ];
    for (const path of paths) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toContain("@dimforge/rapier3d");
      expect(source, path).not.toContain("@aura3d/physics-rapier");
    }
  });

  it("pins one exact engine only inside the optional adapter", () => {
    const manifest = JSON.parse(readFileSync("packages/physics-rapier/package.json", "utf8"));
    expect(manifest.dependencies).toEqual({ "@dimforge/rapier3d-compat": "0.19.3" });
    expect(manifest.sideEffects).toBe(false);
  });
});
