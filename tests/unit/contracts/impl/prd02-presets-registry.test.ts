/**
 * PRD-02 §6.2 / PR-B: day-0 baked preset registry.
 * Every `public/aura-environments/` preset entry must carry a license and a
 * SHA-256 that matches the file bytes on disk (and its manifest's hash).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import {
  AURA_ENVIRONMENT_PRESETS,
  validateAuraEnvironmentPresets
} from "../../../../packages/engine/src/devtools/environments/EnvironmentRegistry.js";

const DIR = resolve("public/aura-environments");

describe("aura-environments baked presets (PRD-02 §6.2)", () => {
  it("registry has all five presets with CC0 license + tags", () => {
    const names = AURA_ENVIRONMENT_PRESETS.map((p) => p.name);
    expect(names).toEqual(["studio", "outdoor", "sunset", "night", "indoor"]);
    for (const p of AURA_ENVIRONMENT_PRESETS) {
      expect(p.license).toBe("CC0");
      expect(p.tags.length).toBeGreaterThan(0);
    }
    for (const n of ["night", "indoor"]) {
      expect(AURA_ENVIRONMENT_PRESETS.find((p) => p.name === n)?.tags).toContain("stand-in");
    }
  });

  it("validator reports no issues for the committed files", () => {
    const issues = validateAuraEnvironmentPresets(DIR);
    expect(issues).toEqual([]);
  });

  it("validator catches a sha256 mismatch", () => {
    const fake = [{ ...AURA_ENVIRONMENT_PRESETS[0]!, sha256: { specular: "0".repeat(64), sh9: "0".repeat(64) } }];
    const issues = validateAuraEnvironmentPresets(DIR, fake);
    expect(issues.map((i) => i.reason)).toContain("sha256-mismatch");
  });

  it("baked sh9.f32 holds 27 floats and a plausible room irradiance", () => {
    const buf = readFileSync(join(DIR, "indoor.sh9.f32"));
    expect(buf.byteLength).toBe(27 * 4);
    const sh9 = new Float32Array(buf.buffer, buf.byteOffset, 27);
    expect(sh9[0]).toBeGreaterThan(0.05); // neutral room has nonzero DC
    expect(Number.isFinite(sh9[0])).toBe(true);
  });

  it("manifest sha matches file bytes for every preset", () => {
    for (const p of AURA_ENVIRONMENT_PRESETS) {
      const bytes = readFileSync(join(DIR, `${p.name}.specular.ktx2`));
      const sha = createHash("sha256").update(bytes).digest("hex");
      expect(sha).toBe(p.sha256.specular);
    }
  });
});
