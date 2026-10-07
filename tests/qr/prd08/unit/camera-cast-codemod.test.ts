/**
 * S17 — `camera-cast` codemod: style-(a) rewritten to app.camera calls,
 * style-(b) reported as manual migration, `feel/evidence-only` doctor rule
 * flags capture-gated feel and Math.random() in feel files.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  feelEvidenceOnlyRule,
  transform
} from "../../../../tools/camera-cast-codemod/index.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../../../../tools/camera-cast-codemod/fixtures/${name}`, import.meta.url), "utf8");

describe("S17 — camera-cast codemod", () => {
  it("rewrites pose-fields casts to setPose/setFov (exact)", () => {
    const { code, rows } = transform(fixture("style-a.ts"), "style-a.ts");
    expect(code).toContain("app.camera.setPose({ position: [0, 2, 6], target: [0, 1, 0] });");
    expect(code).toContain("app.camera.setFov(47);");
    expect(code).toContain("app.camera.setFov(51);");
    const exact = rows.filter((r) => r.mapping === "exact");
    expect(exact.length).toBeGreaterThanOrEqual(2);
    // No leftover Object.assign casts to camera specs.
    expect(code).not.toMatch(/Object\.assign\(chaseCameraSpec as unknown as/);
  });

  it("rewrites spec-shape/dynamic updates to rigs.fromSpec merges (approximate)", () => {
    const { code, rows } = transform(fixture("style-a.ts"), "style-a.ts");
    expect(code).toContain("app.camera.use(app.camera.rigs.fromSpec({ ...chaseCameraSpec, ...{");
    expect(code).toContain("...chaseCameraSpec, ...tuning }))");
    const approx = rows.filter((r) => r.mapping === "approximate");
    expect(approx.length).toBeGreaterThanOrEqual(2);
  });

  it("reports style-(b) direct writes without rewriting", () => {
    const src = fixture("style-b.ts");
    const { code, rows } = transform(src, "style-b.ts");
    expect(code).toBe(src); // report-only
    const manual = rows.filter((r) => r.mapping === "none");
    expect(manual.length).toBe(3);
    expect(manual[0]!.construct).toContain("cameraSpec.offset");
  });

  it("is idempotent on rewritten output", () => {
    const once = transform(fixture("style-a.ts"), "x.ts");
    const twice = transform(once.code, "x.ts");
    // Second pass may still report style-(b) rows (the merge spreads match
    // camish.field patterns rarely) but must not change code again.
    expect(twice.code).toBe(once.code);
  });

  it("doctor rule feel/evidence-only", () => {
    const bad = [
      "if (visualReviewCapture) { camera.shake.add(0.4); }",
      "const jitter = Math.random() * shake.strength;"
    ].join("\n");
    const rows = feelEvidenceOnlyRule.check({ path: "feel.ts", text: bad });
    expect(rows.some((r) => r.severity === "warning" && r.message.includes("capture"))).toBe(true);
    expect(rows.some((r) => r.severity === "error" && r.message.includes("Math.random"))).toBe(true);
    expect(feelEvidenceOnlyRule.check({ path: "feel.ts", text: "camera.shake.add(0.2);" })).toEqual([]);
  });
});
