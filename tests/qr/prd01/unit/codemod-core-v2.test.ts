import { describe, expect, it } from "vitest";
import { transformCoreV2, collectSafeBasicInventory, collectAmbientReview } from "../../../../tools/quality-rebuild-codemods/core-v2";

// PRD-01 §15 Phase-2: core-v2 codemod purity + exact-row assertions on
// fixtures copied from the routes (Skyline Runner main.ts:1875-1879,
// Turbo Drift main.ts:2980-2992, showcase-* pixelRatio/qualityProfile sites).

const SKYLINE = `const app = createAuraApp(canvas, {
  renderer: { mode: "production", qualityProfile: "safe-basic", fallback: "safe-basic" },
  // The retained software-WebGL release target cannot sustain the profile default
  // 1.0 pixel ratio with this long typed world; preserve CSS composition while
  // lowering raster cost for the route-local performance budget.
  pixelRatio: 0.7,
  scene: scene()
});`;

const TURBO = `const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  // Exact review screenshots are judged at their 1440x900/390x844 CSS sizes.
  // DPR 1 preserves that full output resolution while avoiding 2.25x fragment
  // work and readback bytes on software-GPU runners. Public gameplay keeps its
  // renderer-selected device pixel ratio.
  ...(visualCaptureCamera ? {
    pixelRatio: 1,
    performanceQuality: { resolutionScale: 1, particleScale: 1, lodBias: 1, shadowSize: 512 }
  } : {}),
  physics: { gravity: [0, -9.8, 0] }
});`;

const SHOWCASE = `createAuraApp(host, {
  pixelRatio: Math.min(1.35, window.devicePixelRatio || 1),
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }
});`;

const NON_OPTIONS = `const pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
const width = Math.max(1, Math.round(cssWidth * pixelRatio));`;

const AMBIENT = `scene().add(lights.ambient({ intensity: 1.6, color: "#aaccff" }));`;

describe("core-v2 codemod", () => {
  it("is pure: identical input → identical output, no clock/random", () => {
    const a = transformCoreV2(SKYLINE, "a.ts");
    const b = transformCoreV2(SKYLINE, "a.ts");
    expect(a).toEqual(b);
    expect(transformCoreV2(SKYLINE, "other.ts").rows[0]!.file).toBe("other.ts");
  });

  it("Skyline: absolute pixelRatio 0.7 → renderer.resolution.pixelRatio, qualityProfile → quality", () => {
    const { code, rows } = transformCoreV2(SKYLINE, "apps/showcase-skyline-runner/src/main.ts");
    expect(code).toContain("resolution: { pixelRatio: 0.7 }");
    expect(code).toContain('quality: "low"');
    // The top-level `pixelRatio:` member is gone (the inserted
    // `resolution: { pixelRatio: 0.7 }` correctly still contains the name).
    expect(code.split("\n").filter((l) => /^\s*pixelRatio\s*:/.test(l))).toEqual([]);
    expect(code).not.toContain("qualityProfile");

    const pr = rows.find((r) => r.construct === "createAuraApp.pixelRatio")!;
    expect(pr.mapping).toBe("exact");
    expect(pr.target).toBe("renderer.resolution.pixelRatio");
    const qp = rows.find((r) => r.construct === "renderer.qualityProfile")!;
    expect(qp.mapping).toBe("exact");
    expect(qp.target).toBe('renderer.quality: "low"');
  });

  it("Turbo Drift: capture-only pixelRatio: 1 stays inside the visualCaptureCamera spread → maxPixelRatio: 1", () => {
    const { code, rows } = transformCoreV2(TURBO, "apps/showcase-turbo-drift-circuit/src/main.ts");
    expect(code).toContain("visualCaptureCamera ? {");
    expect(code).toContain("renderer: { resolution: { maxPixelRatio: 1 } }");
    expect(code).not.toContain("pixelRatio:");
    // The sibling performanceQuality member inside the same branch is preserved.
    expect(code).toContain("performanceQuality: { resolutionScale: 1");

    const pr = rows.find((r) => r.construct === "createAuraApp.pixelRatio")!;
    expect(pr.target).toBe("renderer.resolution.maxPixelRatio");
    expect(pr.note).toContain("conditional spread");
  });

  it("Math.min(cap, devicePixelRatio) → resolution.maxPixelRatio = cap; renderer.resolution merges", () => {
    const { code } = transformCoreV2(SHOWCASE, "apps/x/main.ts");
    expect(code).toContain('resolution: { maxPixelRatio: 1.35 }');
    expect(code).toContain('quality: "high"');
    expect(code).toContain('mode: "production"');
    expect(code).not.toContain("Math.min(1.35");
  });

  it("does not touch pixelRatio used outside createAuraApp options", () => {
    const { code, rows } = transformCoreV2(NON_OPTIONS, "apps/decals/src/main.ts");
    expect(code).toBe(NON_OPTIONS);
    expect(rows.filter((r) => r.construct === "createAuraApp.pixelRatio")).toEqual([]);
  });

  it("unknown qualityProfile values keep the expression and map as approximate", () => {
    const { code, rows } = transformCoreV2(
      `createAuraApp(el, { renderer: { mode: "production", qualityProfile: tierName } });`,
      "x.ts"
    );
    expect(code).toContain("quality: tierName");
    expect(rows.find((r) => r.construct === "renderer.qualityProfile")!.mapping).toBe("approximate");
  });

  it("classifies safe-basic rows: mode-select vs warning-assert vs documentation", () => {
    const inventory = collectSafeBasicInventory([
      { path: "a.ts", text: `renderer: { mode: "safe-basic", fallback: "safe-basic" }` },
      { path: "b.test.ts", text: `expect(warnings).toContain("safe-basic fallback rendered instead")` },
      { path: "c.md", text: `// safe-basic renders a capability floor` }
    ]);
    const byFile = Object.fromEntries(inventory.map((e) => [e.file, e.classification]));
    expect(byFile["a.ts"]).toBe("selects the mode");
    expect(byFile["b.test.ts"]).toBe("asserts the fallback warning string");
    expect(byFile["c.md"]).toBe("documentation");
  });

  it("ambient review rows report old vs physical effective irradiance", () => {
    const review = collectAmbientReview([{ path: "scene.ts", text: AMBIENT }]);
    expect(review).toHaveLength(1);
    expect(review[0]!.intensity).toBe(1.6);
    expect(review[0]!.effectiveIrradianceBefore).toBe(1.6);
    expect(review[0]!.effectiveIrradianceAfter).toBeCloseTo(1.6 / Math.PI, 3);

    const rows = transformCoreV2(AMBIENT, "scene.ts").rows;
    expect(rows[0]!.construct).toBe("lights.ambient");
    expect(rows[0]!.mapping).toBe("none");
    expect(rows[0]!.note).toContain("0.509");
  });

  it("is idempotent: a second pass produces no further pixelRatio edits", () => {
    const first = transformCoreV2(TURBO, "x.ts").code;
    const second = transformCoreV2(first, "x.ts");
    expect(second.code).toBe(first);
    expect(second.rows.filter((r) => r.construct === "createAuraApp.pixelRatio")).toEqual([]);
  });
});
