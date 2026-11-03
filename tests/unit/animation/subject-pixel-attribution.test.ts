import { describe, expect, it } from "vitest";
import {
  attributeChangedPixels,
  cameraPosesEqual,
  perspectiveViewProjection,
  projectBoundsToPixelRect,
  unionRects,
  type CameraPose,
  type PixelRect
} from "../../browser/subject-pixel-attribution";

const W = 64;
const H = 48;

function frame(fill = 5): Uint8Array {
  const pixels = new Uint8Array(W * H * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = fill; pixels[index + 1] = fill; pixels[index + 2] = fill; pixels[index + 3] = 255;
  }
  return pixels;
}

function paint(pixels: Uint8Array, rect: PixelRect, value: number): void {
  for (let y = rect.y0; y < rect.y1; y += 1) {
    for (let x = rect.x0; x < rect.x1; x += 1) {
      const index = (y * W + x) * 4;
      pixels[index] = value; pixels[index + 1] = value; pixels[index + 2] = value;
    }
  }
}

const camera: CameraPose = { position: [0, 0, 5], target: [0, 0, 0], fov: 60 };

describe("subject pixel attribution (S5-WP11-03)", () => {
  it("projects a centred box symmetrically and a shifted box to the matching side", () => {
    const vp = perspectiveViewProjection(camera, W / H);
    const centred = projectBoundsToPixelRect({ min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, vp, W, H, 0);
    expect(centred.clipped).toBe(false);
    const rect = centred.rect!;
    expect(rect.x0 + rect.x1).toBeCloseTo(W, 0);
    expect(rect.y0 + rect.y1).toBeCloseTo(H, 0);
    // +x world maps to larger column, +y world to larger readPixels row (bottom-up).
    const right = projectBoundsToPixelRect({ min: [1, -0.1, -0.1], max: [1.2, 0.1, 0.1] }, vp, W, H, 0).rect!;
    expect(right.x0).toBeGreaterThan(W / 2);
    const up = projectBoundsToPixelRect({ min: [-0.1, 1, -0.1], max: [0.1, 1.2, 0.1] }, vp, W, H, 0).rect!;
    expect(up.y0).toBeGreaterThan(H / 2);
  });

  it("matches the analytic pinhole projection for a point on the image plane", () => {
    // tan(30deg) * 5 = half-height of the view at z=0; a point at that height lands on the top row.
    const halfHeight = Math.tan(Math.PI / 6) * 5;
    const vp = perspectiveViewProjection(camera, W / H);
    const rect = projectBoundsToPixelRect({ min: [0, halfHeight / 2, 0], max: [0, halfHeight / 2, 0] }, vp, W, H, 1).rect!;
    // A zero-size point with 1px padding yields a 2-3px rect centred on row 0.75 * H.
    expect(Math.abs((rect.y0 + rect.y1) / 2 - H * 0.75)).toBeLessThanOrEqual(0.5);
    expect(rect.y1 - rect.y0).toBeLessThanOrEqual(3);
  });

  it("reports clipped bounds behind the camera instead of inventing a region", () => {
    const vp = perspectiveViewProjection(camera, W / H);
    expect(projectBoundsToPixelRect({ min: [-1, -1, 4], max: [1, 1, 6] }, vp, W, H)).toEqual({ rect: null, clipped: true });
  });

  it("clamps padded rects to the frame and drops fully off-screen subjects", () => {
    const vp = perspectiveViewProjection(camera, W / H);
    const wide = projectBoundsToPixelRect({ min: [-50, -50, -1], max: [50, 50, 1] }, vp, W, H).rect!;
    expect(wide).toEqual({ x0: 0, y0: 0, x1: W, y1: H });
    expect(projectBoundsToPixelRect({ min: [40, 0, 0], max: [41, 1, 1] }, vp, W, H).rect).toBeNull();
  });

  it("attributes deformation inside the subject region and background change outside it", () => {
    const a = frame();
    const b = frame();
    const subject: PixelRect = { x0: 20, y0: 10, x1: 40, y1: 30 };
    paint(a, { x0: 24, y0: 12, x1: 30, y1: 28 }, 200); // limb in pose A
    paint(b, { x0: 30, y0: 12, x1: 36, y1: 28 }, 200); // same limb moved in pose B
    const inside = attributeChangedPixels(a, b, W, H, subject);
    expect(inside.changedPixels).toBe(2 * 6 * 16);
    expect(inside.changedSubjectPixels).toBe(inside.changedPixels);
    expect(inside.changedOutsideSubjectPixels).toBe(0);
    expect(inside.subjectAttribution).toBe(1);
    expect(inside.subjectRegionPixels).toBe(400);

    // A background flicker away from the character is counted outside, not as subject motion.
    paint(b, { x0: 0, y0: 40, x1: 10, y1: 48 }, 90);
    const withNoise = attributeChangedPixels(a, b, W, H, subject);
    expect(withNoise.changedOutsideSubjectPixels).toBe(80);
    expect(withNoise.changedSubjectPixels).toBe(192);
    expect(withNoise.subjectAttribution).toBeCloseTo(192 / 272, 6);
  });

  it("ignores sub-threshold noise and attributes nothing without a region", () => {
    const a = frame(5);
    const b = frame(12);
    expect(attributeChangedPixels(a, b, W, H, { x0: 0, y0: 0, x1: W, y1: H }).changedPixels).toBe(0);
    paint(b, { x0: 0, y0: 0, x1: 4, y1: 4 }, 255);
    const none = attributeChangedPixels(a, b, W, H, null);
    expect(none.changedPixels).toBe(16);
    expect(none.changedSubjectPixels).toBe(0);
    expect(none.subjectAttribution).toBe(0);
    expect(none.subjectRegionPixels).toBe(0);
  });

  it("unions per-frame regions so a moving subject is covered in both poses", () => {
    expect(unionRects({ x0: 1, y0: 2, x1: 5, y1: 6 }, null, { x0: 3, y0: 0, x1: 9, y1: 4 })).toEqual({ x0: 1, y0: 0, x1: 9, y1: 6 });
    expect(unionRects(null, undefined)).toBeNull();
  });

  it("measures camera stability from live poses and fails closed when a pose is unknown", () => {
    expect(cameraPosesEqual(camera, { ...camera, position: [0, 0, 5] })).toBe(true);
    expect(cameraPosesEqual(camera, { ...camera, position: [0, 0.01, 5] })).toBe(false);
    expect(cameraPosesEqual(camera, { ...camera, fov: 61 })).toBe(false);
    expect(cameraPosesEqual(camera, undefined)).toBe(false);
    expect(cameraPosesEqual(undefined, undefined)).toBe(false);
  });
});
