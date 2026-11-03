import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng, iou, maskFromImage, maskToPng } from "../../../../tools/look-metrics/silhouette-iou.mjs";

const root = join(__dirname, "../../../..");
const capture = readFileSync(join(root, "benchmarks/quality-rebuild/capture.mjs"), "utf8");
const sentinels = JSON.parse(readFileSync(join(root, "benchmarks/quality-rebuild/sentinels.json"), "utf8"));
const mainTs = readFileSync(join(root, "benchmarks/quality-rebuild/main.ts"), "utf8");

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

  it("retains independently authored subject pixels exactly in PNG captures", () => {
    // RGBA bytes stand in for one dark and one bright subject on a transparent background.
    const image = {
      width: 2, height: 2,
      data: new Uint8ClampedArray([0, 0, 0, 0, 1, 3, 5, 255, 220, 180, 40, 255, 0, 0, 0, 0])
    };
    const decoded = decodePng(encodePng(image));
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect([...decoded.data]).toEqual([...image.data]);
  });

  it("distinguishes subject masks, background and empty captures using retained bytes", () => {
    const background = [16, 24, 32, 255];
    const pixelImage = (indices: readonly number[]) => {
      const data = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < 16; i += 1) data.set(indices.includes(i) ? [220, 180, 40, 255] : background, i * 4);
      return { width: 4, height: 4, data };
    };
    const left = maskFromImage(pixelImage([5, 9]), { mode: "key", bg: background.slice(0, 3), tolerance: 8 });
    const overlap = maskFromImage(pixelImage([9, 10]), { mode: "key", bg: background.slice(0, 3), tolerance: 8 });
    const empty = maskFromImage(pixelImage([]), { mode: "key", bg: background.slice(0, 3), tolerance: 8 });
    expect(left.count).toBe(2);
    expect(left.bbox).toEqual({ x0: 1, y0: 1, x1: 1, y1: 2 });
    expect(iou(left, overlap)).toBeCloseTo(1 / 3);
    expect(iou(empty, empty)).toBeNull();
    const saved = decodePng(maskToPng(left));
    expect([...saved.data.slice(5 * 4, 5 * 4 + 4)]).toEqual([255, 255, 255, 255]);
    expect([...saved.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
  });
});
