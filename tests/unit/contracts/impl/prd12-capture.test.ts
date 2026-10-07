import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { idColor } from "../../../../benchmarks/quality-rebuild/three/lib/mask";
import * as THREE from "three";

const root = join(__dirname, "../../../..");
const capture = readFileSync(join(root, "benchmarks/quality-rebuild/capture.mjs"), "utf8");
const sentinels = JSON.parse(readFileSync(join(root, "benchmarks/quality-rebuild/sentinels.json"), "utf8"));
const mainTs = readFileSync(join(root, "benchmarks/quality-rebuild/main.ts"), "utf8");
const maskTs = readFileSync(join(root, "benchmarks/quality-rebuild/three/lib/mask.ts"), "utf8");

describe("PRD-12 capture surface (T1.6, T1.16, §8.1)", () => {
  it("capture.mjs exposes the Phase-1 flags", () => {
    for (const flag of ["--strict", "--calibrate", "--variants", "--dprs"]) {
      expect(capture).toContain(`"${flag}"`);
    }
  });

  it("--strict fails closed on software rasterizers", () => {
    expect(capture).toMatch(/swiftshader\|llvmpipe/i);
    expect(capture).toContain("strictFailure");
  });

  it("writes ready.json and mask pngs next to frames", () => {
    expect(capture).toContain(".ready.json");
    expect(capture).toContain(".mask.png");
    expect(capture).toContain("__QR_MASKS__");
  });

  it("main.ts routes the registry and mask pass", () => {
    expect(mainTs).toContain("ACTIVE_SCENE_IDS");
    expect(mainTs).toContain("laneAdapterModulePath");
    expect(mainTs).toContain("pass=mask");
    expect(mainTs).toContain("a3d-qr");
  });

  it("sentinels.json pins the T1.16 six-scene canary set", () => {
    const ids = sentinels.scenes.map((scene: { id: string }) => scene.id);
    expect(ids).toEqual([
      "01-simple-geometry",
      "03-damaged-helmet",
      "08-skinned-character",
      "12-shadows",
      "13-ibl-only",
      "16-instancing"
    ]);
    // The IC-0 tolerance is measured, never assumed: null until IC-0 fills it.
    expect(sentinels.identityCheck.deltaE2000P99).toBeNull();
  });

  it("idColor encodes ids per §8.1 (r=(i*37)%251+1, g=i>>8, b=0 in linear space)", () => {
    const color = idColor(0, new THREE.Color());
    expect(color.r * 255).toBeCloseTo(1, 0);
    expect(color.g).toBe(0);
    expect(color.b).toBe(0);
    const big = idColor(512, new THREE.Color());
    expect(big.g * 255).toBeCloseTo(2, 0);
    // ids are distinct for the first 251 objects
    const seen = new Set<number>();
    for (let i = 0; i < 251; i += 1) {
      const c = idColor(i, new THREE.Color());
      seen.add(Math.round(c.r * 255) * 65536 + Math.round(c.g * 255) * 256);
    }
    expect(seen.size).toBe(251);
  });

  it("mask renderer is a separate non-AA pipeline with linear output", () => {
    expect(maskTs).toContain("antialias: false");
    expect(maskTs).toContain("NoToneMapping");
    expect(maskTs).toContain("LinearSRGBColorSpace");
    expect(maskTs).toContain("HalfFloatType");
  });
});
