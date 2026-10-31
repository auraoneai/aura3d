import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addAsset } from "../../../../packages/aura3d-cli/src";
import { validateCubeLut } from "../../../../packages/aura3d-cli/src/admission/cubeLut";
import { assetsAddHelp, mainHelp } from "../../../../packages/aura3d-cli/src/cli-help";
import { parseCubeLut } from "../../../../packages/rendering/src/post/CubeLut";
import { DisplayLutCache } from "../../../../packages/rendering/src/post/DisplayLutCache";
import { DISPLAY_GRADE_GLSL, DISPLAY_LUT_FETCH_GLSL } from "../../../../packages/rendering/src/post/shaders/displayGrade.glsl";
import { FINALIZE_FXAA_FUSED_GLSL } from "../../../../packages/rendering/src/post/shaders/finalize.glsl";
import { runV2HdrStages, runV2LdrTail } from "../../../../packages/rendering/src/post/v2Stages";
import { postSkippedReasons, postStagesRan, resetPostSkipped } from "../../../../packages/rendering/src/renderer/postSkipped";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { createRootPostPipeline, postLutUrl, postLutsSettled, preloadPostLut, resetPostLuts } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { CAMERA, fakeHost, fakeTarget, recordingGl } from "./recordingGl";

/** GU47 E-C WP-3 item 2: `.cube` LUT admission, delivery, upload and S10b binding. */

const TEAL_ORANGE = readFileSync(join(__dirname, "../../../qr/prd03/fixtures/luts/teal-orange-33.cube"), "utf8");

function cube(size: number, f: (r: number, g: number, b: number) => [number, number, number]): string {
  const rows: string[] = ["TITLE \"gu47\"", `LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b += 1) for (let g = 0; g < size; g += 1) for (let r = 0; r < size; r += 1) {
    rows.push(f(r / (size - 1), g / (size - 1), b / (size - 1)).map((v) => v.toFixed(6)).join(" "));
  }
  return rows.join("\n");
}

const BASE: PostPipelineOptions = {
  antiAliasing: "off",
  depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1,
  toneMapping: "aces",
  dither: true
};

function project(): string {
  const dir = join(tmpdir(), `gu47-ec-lut-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  return dir;
}

afterEach(() => {
  resetPostLuts();
  resetPostSkipped();
});

describe("CLI: aura3d assets add <file.cube> --type lut", () => {
  it("infers type lut from .cube and writes a typed manifest entry", () => {
    const dir = project();
    writeFileSync(join(dir, "assets", "venue.cube"), cube(2, (r, g, b) => [r, g, b]));
    const result = addAsset({ projectDir: dir, file: "assets/venue.cube", name: "venueGrade" });
    const entry = result.manifest.assets.find((asset) => asset.id === "venueGrade")!;
    expect(entry.type).toBe("lut");
    expect(entry.format).toBe("cube");
    expect(entry.url).toMatch(/^\/aura-assets\/venueGrade\.[0-9a-f]{8}\.cube$/);
    expect(readFileSync(join(dir, "src", "aura-assets.ts"), "utf8")).toContain('readonly type: "lut"; readonly format: "cube"');
  });

  it("refuses --type lut on a non-.cube file and on 1-D or malformed LUTs", () => {
    const dir = project();
    writeFileSync(join(dir, "assets", "grade.png"), "not a lut");
    expect(() => addAsset({ projectDir: dir, file: "assets/grade.png", name: "grade", type: "lut" })).toThrow(/expects a \.cube file/);
    writeFileSync(join(dir, "assets", "line.cube"), "LUT_1D_SIZE 4\n0 0 0\n0.3 0.3 0.3\n0.6 0.6 0.6\n1 1 1");
    expect(() => addAsset({ projectDir: dir, file: "assets/line.cube", name: "line", type: "lut" })).toThrow(/CUBE_LUT_1D_UNSUPPORTED/);
    writeFileSync(join(dir, "assets", "short.cube"), "LUT_3D_SIZE 2\n0 0 0\n1 1 1");
    expect(() => addAsset({ projectDir: dir, file: "assets/short.cube", name: "short" })).toThrow(/CUBE_LUT_MALFORMED: expected 8 data rows/);
  });

  it("validateCubeLut matches the runtime parser on the 33^3 fixture", () => {
    const admitted = validateCubeLut(TEAL_ORANGE);
    expect(admitted.size).toBe(33);
    expect(admitted.rows).toBe(33 ** 3);
    expect(parseCubeLut(TEAL_ORANGE).size).toBe(admitted.size);
    expect(() => validateCubeLut("LUT_3D_SIZE 66\n")).toThrow(/CUBE_LUT_SIZE_INVALID/);
  });

  it("help lists the lut type and E-A's --hdri optimize line", () => {
    expect(assetsAddHelp()).toContain("--type model|texture|environment|audio|navigation|lut");
    const main = mainHelp("prop");
    expect(main).toContain("[--type model|texture|environment|audio|navigation|lut]");
    expect(main).toContain("aura3d assets optimize --hdri <1k|2k> [--rgb9e5-cube]");
  });
});

describe("engine bridge: colorGrade({ lut }) delivery", () => {
  const pipeline = (lut: unknown, extra: Record<string, unknown> = {}) =>
    createRootPostPipeline({ nodes: [effects.colorGrade({ lut: lut as never, ...extra }).toJSON()] } as never, undefined, undefined, QUALITY_TIERS.high);

  it("resolves a typed asset ref or a URL string to the served URL", () => {
    expect(postLutUrl("/luts/a.cube")).toBe("/luts/a.cube");
    expect(postLutUrl({ kind: "aura-asset-ref", id: "grade", type: "lut", url: "/aura-assets/grade.1a2b3c4d.cube" })).toBe("/aura-assets/grade.1a2b3c4d.cube");
    expect(postLutUrl(42)).toBeNull();
  });

  it("emits { source, cube, intensity } once the .cube is loaded", () => {
    preloadPostLut("/aura-assets/grade.cube", TEAL_ORANGE);
    const { options, diagnostics } = pipeline({ kind: "aura-asset-ref", id: "grade", type: "lut", url: "/aura-assets/grade.cube" }, { lutIntensity: 0.6 });
    expect(options.lut).toEqual({ source: "/aura-assets/grade.cube", cube: TEAL_ORANGE, intensity: 0.6 });
    expect(diagnostics.some((d) => d.code.startsWith("POST_LUT"))).toBe(false);
  });

  it("carries a status (no cube) while loading and after a failed load, with a diagnostic", async () => {
    const pending = pipeline("relative/never.cube");
    expect(pending.options.lut).toEqual({ source: "relative/never.cube", intensity: 1, status: "pending" });
    expect(pending.diagnostics.map((d) => d.code)).toContain("POST_LUT_PENDING");
    await postLutsSettled();
    const failed = pipeline("relative/never.cube");
    expect(failed.options.lut).toEqual({ source: "relative/never.cube", intensity: 1, status: "failed" });
    expect(failed.diagnostics.map((d) => d.code)).toContain("POST_LUT_UNAVAILABLE");
  });

  it("a lut value that is neither a URL nor an asset ref is dropped with a diagnostic", () => {
    const { options, diagnostics } = pipeline({ kind: "aura-asset-ref", id: "x", type: "lut" });
    expect(options.lut).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toContain("POST_LUT_UNAVAILABLE");
  });
});

describe("renderer: S10b binds the uploaded LUT", () => {
  const lutBag = { source: "/luts/teal-orange.cube", cube: TEAL_ORANGE, intensity: 0.75 };

  it("uploads once (DisplayLutCache), binds it with u_hasLut 1 and the lattice remap, every frame after reuses it", () => {
    const rec = recordingGl();
    const host = fakeHost(rec.gl);
    const tail = { ...BASE, vignette: { intensity: 0.2 }, lut: lutBag } as never;
    runV2HdrStages(host, fakeTarget(), BASE, CAMERA);
    runV2LdrTail(host, fakeTarget("rgba8"), tail, undefined);
    runV2LdrTail(host, fakeTarget("rgba8"), tail, undefined);
    const uploads = rec.texImage3D.filter((u) => u.width === 33);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.depth).toBe(33);
    const grade = rec.draws.filter((d) => d.fragment === DISPLAY_GRADE_GLSL);
    expect(grade).toHaveLength(2);
    for (const d of grade) {
      expect(d.uniforms.u_hasLut).toEqual([1]);
      expect(d.uniforms.u_lutLattice).toEqual([1]);
      expect(d.uniforms.u_lutBypass![0]).toBeCloseTo(0.25, 6);
    }
    expect(postStagesRan()).toContain("S10b:display-grade:vignette:lut");
  });

  it("the fused FXAA finalize binds the same LUT", () => {
    const rec = recordingGl();
    const host = fakeHost(rec.gl);
    runV2HdrStages(host, fakeTarget(), BASE, CAMERA);
    runV2LdrTail(host, fakeTarget("rgba8"), { ...BASE, antiAliasing: "fxaa", lut: lutBag } as never, undefined);
    const fused = rec.draws.find((d) => d.fragment === FINALIZE_FXAA_FUSED_GLSL)!;
    expect(fused.uniforms.u_hasLut).toEqual([1]);
    expect(fused.uniforms.u_lutLattice).toEqual([1]);
    expect(postStagesRan()).toContain("S10b:display-grade:lut:fused-fxaa");
  });

  it("the LUT draws clear the forward pass's sampler object on the LUT unit (receipt effects-lut: a bound mipmapped material sampler left the mip-less TEXTURE_3D incomplete and every fetch black)", () => {
    for (const antiAliasing of ["off", "fxaa"] as const) {
      const rec = recordingGl();
      const host = fakeHost(rec.gl);
      runV2HdrStages(host, fakeTarget(), BASE, CAMERA);
      // The forward pass leaves material samplers bound (webgl2/Samplers.ts) on low units.
      rec.gl.bindSampler(0, { materialSampler: 0 } as never);
      rec.gl.bindSampler(1, { materialSampler: 1 } as never);
      runV2LdrTail(host, fakeTarget("rgba8"), { ...BASE, antiAliasing, lut: lutBag } as never, undefined);
      const lutDraw = rec.draws.find((d) => d.uniforms.u_hasLut?.[0] === 1)!;
      expect(lutDraw, antiAliasing).toBeDefined();
      expect(lutDraw.samplersOn3dUnits[1], antiAliasing).toBeNull();
    }
  });

  it("a pending or failed bag binds the identity LUT and records why", () => {
    const rec = recordingGl();
    const host = fakeHost(rec.gl);
    runV2LdrTail(host, fakeTarget("rgba8"), { ...BASE, lut: { source: "/luts/slow.cube", intensity: 1, status: "pending" } } as never, undefined);
    runV2LdrTail(host, fakeTarget("rgba8"), { ...BASE, lut: { source: "/luts/gone.cube", intensity: 1, status: "failed" } } as never, undefined);
    expect(postSkippedReasons()).toEqual(expect.arrayContaining(["LUT_PENDING:/luts/slow.cube", "LUT_UNAVAILABLE:/luts/gone.cube"]));
    expect(rec.draws.filter((d) => d.fragment === DISPLAY_GRADE_GLSL).every((d) => d.uniforms.u_hasLut?.[0] === 0)).toBe(true);
  });

  it("a LUT that finishes loading withdraws its LUT_PENDING reason (phase-2 receipt: pending outlived the load)", () => {
    const rec = recordingGl();
    const host = fakeHost(rec.gl);
    runV2LdrTail(host, fakeTarget("rgba8"), { ...BASE, lut: { source: "/luts/late.cube", intensity: 1, status: "pending" } } as never, undefined);
    expect(postSkippedReasons()).toContain("LUT_PENDING:/luts/late.cube");
    runV2LdrTail(host, fakeTarget("rgba8"), { ...BASE, lut: { source: "/luts/late.cube", cube: TEAL_ORANGE, intensity: 1 } } as never, undefined);
    expect(postSkippedReasons()).not.toContain("LUT_PENDING:/luts/late.cube");
    expect(postStagesRan()).toContain("S10b:display-grade:lut");
    // A load that fails replaces its pending reason with LUT_UNAVAILABLE.
    runV2LdrTail(host, fakeTarget("rgba8"), { ...BASE, lut: { source: "/luts/lost.cube", intensity: 1, status: "pending" } } as never, undefined);
    runV2LdrTail(host, fakeTarget("rgba8"), { ...BASE, lut: { source: "/luts/lost.cube", intensity: 1, status: "failed" } } as never, undefined);
    expect(postSkippedReasons()).toContain("LUT_UNAVAILABLE:/luts/lost.cube");
    expect(postSkippedReasons()).not.toContain("LUT_PENDING:/luts/lost.cube");
  });

  it("an invalid .cube records LUT_INVALID once and renders the identity grade", () => {
    const rec = recordingGl();
    const host = fakeHost(rec.gl);
    const bad = { ...BASE, lut: { source: "/luts/bad.cube", cube: "LUT_3D_SIZE 2\n0 0 0" } } as never;
    runV2LdrTail(host, fakeTarget("rgba8"), bad, undefined);
    runV2LdrTail(host, fakeTarget("rgba8"), bad, undefined);
    expect(postSkippedReasons()).toContain("LUT_INVALID:/luts/bad.cube:CUBE_LUT_MALFORMED");
    expect(rec.draws.filter((d) => d.fragment === DISPLAY_GRADE_GLSL).every((d) => d.uniforms.u_hasLut?.[0] === 0)).toBe(true);
    expect(rec.texImage3D.filter((u) => u.width === 2)).toHaveLength(0);
  });

  it("both S10b samplers share the fetch, and the default bypass keeps the baked-LUT path unchanged", () => {
    expect(DISPLAY_GRADE_GLSL).toContain(DISPLAY_LUT_FETCH_GLSL);
    expect(FINALIZE_FXAA_FUSED_GLSL).toContain(DISPLAY_LUT_FETCH_GLSL);
    expect(DISPLAY_LUT_FETCH_GLSL).toContain("mix(texture(u_lut3d, lutCoord).rgb, disp, u_lutBypass)");
  });
});

describe("receipt effects-lut expectation (CPU mirror of the S10b fetch)", () => {
  /** Trilinear lattice sample with the shader's half-texel remap (u_lutLattice = 1). */
  function sampleLattice(lut: { size: number; data: Float32Array }, rgb: readonly number[]): number[] {
    const n = lut.size;
    const pos = rgb.map((c) => Math.min(1, Math.max(0, c)) * (n - 1));
    const i0 = pos.map((p) => Math.min(n - 2, Math.floor(p)));
    const t = pos.map((p, k) => p - i0[k]!);
    const out = [0, 0, 0];
    for (let corner = 0; corner < 8; corner += 1) {
      const o = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
      const w = o.reduce((acc, bit, k) => acc * (bit ? t[k]! : 1 - t[k]!), 1);
      const idx = ((i0[2]! + o[2]!) * n * n + (i0[1]! + o[1]!) * n + (i0[0]! + o[0]!)) * 4;
      for (let c = 0; c < 3; c += 1) out[c]! += w * lut.data[idx + c]!;
    }
    return out;
  }

  it("an identity .cube is the identity; the teal-orange LUT moves mean |dRGB| by >= 6", () => {
    const identity = parseCubeLut(cube(17, (r, g, b) => [r, g, b]));
    const graded = parseCubeLut(TEAL_ORANGE);
    let identityErr = 0;
    let delta = 0;
    let count = 0;
    for (let r = 0; r < 16; r += 1) for (let g = 0; g < 16; g += 1) for (let b = 0; b < 16; b += 1) {
      const px = [r / 15, g / 15, b / 15];
      const id = sampleLattice(identity, px);
      const out = sampleLattice(graded, px);
      for (let c = 0; c < 3; c += 1) {
        identityErr = Math.max(identityErr, Math.abs(id[c]! - px[c]!));
        delta += Math.abs(out[c]! - px[c]!) * 255;
        count += 1;
      }
    }
    expect(identityErr).toBeLessThan(1e-6);
    expect(delta / count).toBeGreaterThanOrEqual(6);
  });
});

describe("DisplayLutCache LRU bound", () => {
  it("destroys the least-recently-used handle past maxEntries and keeps the default unbounded", () => {
    const destroyed: number[] = [];
    let next = 0;
    const cache = new DisplayLutCache<number>(() => next++, (h) => destroyed.push(h), { maxEntries: 2 });
    const key = (u: string) => ({ contrast: 1, saturation: 1, vibrance: 0, lutIntensity: 1, userLut: u });
    cache.acquire(key("a"));
    cache.acquire(key("b"));
    cache.acquire(key("a"));
    cache.acquire(key("c"));
    expect(destroyed).toEqual([1]);
    expect(cache.size).toBe(2);
    expect(cache.bakeCount).toBe(3);
    const unbounded = new DisplayLutCache<number>(() => next++, () => undefined);
    for (const u of ["a", "b", "c", "d", "e"]) unbounded.acquire(key(u));
    expect(unbounded.size).toBe(5);
  });
});
