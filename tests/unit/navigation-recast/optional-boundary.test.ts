import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("optional Recast navigation boundary", () => {
  it("enters the engine only as an optional peer and stays out of recommended runtime dependencies", () => {
    const engine = JSON.parse(readFileSync("packages/engine/package.json", "utf8"));
    expect(engine.dependencies).not.toHaveProperty("@aura3d/navigation-recast");
    expect(engine.peerDependencies).toEqual(expect.objectContaining({ "@aura3d/navigation-recast": "workspace:*" }));
    expect(engine.peerDependenciesMeta?.["@aura3d/navigation-recast"]).toEqual({ optional: true });

    const root = JSON.parse(readFileSync("package.json", "utf8"));
    expect(root.dependencies).not.toHaveProperty("recast-navigation");
    expect(root.optionalDependencies).toEqual({ "recast-navigation": "0.43.1" });

    for (const path of ["packages/rendering/package.json", "packages/product-studio/package.json"]) {
      expect(readFileSync(path, "utf8"), path).not.toContain("@aura3d/navigation-recast");
      expect(readFileSync(path, "utf8"), path).not.toContain("recast-navigation");
    }
  });

  it("pins the selected external implementation exactly", () => {
    const manifest = JSON.parse(readFileSync("packages/navigation-recast/package.json", "utf8"));
    expect(manifest.dependencies).toEqual({ "recast-navigation": "0.43.1" });
    expect(manifest.sideEffects).toBe(false);
  });
});
