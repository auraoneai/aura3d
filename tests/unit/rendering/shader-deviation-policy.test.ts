import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const REGISTER = readFileSync(join(REPO_ROOT, "docs", "rendering", "pbr-gltf-correctness.md"), "utf8");

/**
 * Q0 deviation-policy gate (muse3jsparity-PRD Part Q, box 2).
 *
 * "Any future deviation requires a documented reason + updated vector."
 * This test enforces the first half structurally: every known deviation id
 * must be present in the Q0 register with an explicit Status line, a
 * Reason/Bound justification, and a named pinning test file that exists on
 * disk. The second half (vectors) is enforced behaviorally — a shader edit
 * that changes the math breaks the pinned vectors in the sibling suites.
 */

const ENTRIES: ReadonlyArray<{ id: string; pinningTest: string }> = [
  { id: "DIFFUSE-BURLEY", pinningTest: "tests/unit/rendering/shader-core-brdf-reference.test.ts" },
  { id: "GGX-DISTRIBUTION", pinningTest: "tests/unit/rendering/shader-core-brdf-reference.test.ts" },
  { id: "SMITH-CORRELATED", pinningTest: "tests/unit/rendering/shader-core-brdf-reference.test.ts" },
  { id: "FRESNEL-EXP2", pinningTest: "tests/unit/rendering/shader-core-brdf-reference.test.ts" },
  { id: "CLEARCOAT-LOBE", pinningTest: "tests/unit/rendering/shader-core-brdf-reference.test.ts" },
  { id: "ANISO-NDF", pinningTest: "tests/unit/rendering/shader-brdf-reference.test.ts" },
  { id: "ROUGHNESS-FLOOR-0.045", pinningTest: "tests/unit/rendering/parity-deviations-q1.test.ts" },
  { id: "SRGB-EXACT", pinningTest: "tests/unit/rendering/parity-deviations-q1.test.ts" },
  { id: "IRIDESCENCE-COSINE", pinningTest: "tests/unit/rendering/shader-brdf-reference.test.ts" },
  { id: "TRANSMISSION-TINT", pinningTest: "tests/unit/agent-api/agent-api.test.ts" },
  { id: "RECT-QUADRATURE", pinningTest: "tests/unit/rendering/shader-brdf-reference.test.ts" },
  { id: "SHADOW-BIAS-DISCIPLINE", pinningTest: "tests/unit/rendering/shader-core-brdf-reference.test.ts" },
];

describe("Q0 deviation-policy gate", () => {
  it("states the documented-reason + updated-vector rule", () => {
    expect(REGISTER).toContain("any future deviation from the references below requires a documented");
    expect(REGISTER).toContain("reason in this register AND an updated reference vector");
  });

  it("registers every known deviation with status, justification, and pinning test", () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(12);
    for (const entry of ENTRIES) {
      const section = REGISTER.split(`- ${entry.id} —`)[1]?.split("\n- ")[0] ?? "";
      expect(section.length, `${entry.id} registered`).toBeGreaterThan(0);
      expect(section, `${entry.id} has Status`).toContain("Status:");
      expect(
        section.includes("Reason:") ||
          section.includes("Bound:") ||
          section.includes("DECISION") ||
          section.includes("Status: match"),
        `${entry.id} justified`
      ).toBe(true);
      expect(section, `${entry.id} names pinning test`).toContain("Pinning test:");
      expect(
        existsSync(join(REPO_ROOT, entry.pinningTest)),
        `${entry.id} pinning test exists: ${entry.pinningTest}`
      ).toBe(true);
    }
  });

  it("keeps the anisotropic rotation-response browser proof referenced", () => {
    expect(REGISTER).toContain("anisotropic-rotation-q1");
    expect(
      existsSync(join(REPO_ROOT, "tests", "browser", "anisotropic-rotation-q1.spec.ts")),
      "anisotropic rotation browser spec exists"
    ).toBe(true);
  });
});
