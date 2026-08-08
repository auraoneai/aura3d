import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("optional Recast navigation boundary", () => {
  it("does not enter recommended engine or renderer manifests", () => {
    for (const path of ["package.json", "packages/engine/package.json", "packages/rendering/package.json", "packages/product-studio/package.json"]) {
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
