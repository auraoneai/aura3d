import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The showcase asset-replacement ranker must reject a primary asset that carries no textures.
 *
 * Diagnosing why the four promoted routes all read as "low-poly prototypes" traced to a single shared
 * cause: six of their seven primary assets carry **zero** texture data, so every material is a flat
 * colour factor. That is why no amount of lighting, shadow, composition, or camera work moved the visual
 * verdict.
 *
 * The ranker already recorded `textureCount` on each candidate but never scored it, so an untextured mesh
 * could rank first on name and provenance alone. This pins the penalty that closes that hole.
 */
const source = readFileSync(
  resolve(process.cwd(), "packages/create-aura3d/src/showcase-spec-replacement-candidates.ts"),
  "utf8"
);

describe("replacement ranking penalises untextured primary assets", () => {
  it("applies a surface-detail penalty for primary roles with no textures", () => {
    expect(source).toContain("function surfaceDetailPenalties(");
    expect(source).toContain("penalties.push(...surfaceDetailPenalties(role, asset));");
    expect(source).toContain("carries no textures");
  });

  it("covers every primary role that determines how a route reads", () => {
    const roleLine = source.split("\n").find((line) => line.includes("const primaryRoles = new Set("));
    expect(roleLine, "primaryRoles declaration").toBeDefined();
    for (const role of ["vehicle", "track", "character", "world", "stage", "level"]) {
      expect(roleLine).toContain(`"${role}"`);
    }
  });

  it("exempts non-primary roles, where flat shading is a legitimate choice", () => {
    // Set dressing and abstract visualisation must not be blocked for lacking textures.
    expect(source).toContain("if (!primaryRoles.has(role)) return [];");
  });

  it("weights the penalty heavily enough to outrank a good name match", () => {
    // Text/tag matching contributes single-digit points per term, so a light penalty would not prevent a
    // well-named untextured asset from winning.
    const weightLine = source.split("\n").find((line) => line.includes('penalty.includes("surface detail")'));
    expect(weightLine, "surface-detail penalty weight").toBeDefined();
    const weight = Number(/total \+ (\d+)/.exec(weightLine ?? "")?.[1] ?? "0");
    expect(weight).toBeGreaterThanOrEqual(20);
  });

  it("records the measurement that motivated the gate so it is not silently relaxed", () => {
    // The comment carries the measured evidence; without it a future edit could delete the gate as
    // unexplained strictness.
    expect(source).toContain("zero** textures");
  });
});
