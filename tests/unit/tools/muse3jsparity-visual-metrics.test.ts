import { describe, expect, it } from 'vitest';
import { VISUAL_SETTINGS_301, type VisualCapture301 } from '../../browser/muse3jsparity-301-visual-cases';
import { projectVisualPoint, particleTrajectoryProjectionError } from '../../browser/muse3jsparity-301-visual-geometry-quality';
import { createGlyphReference301, measureGlyphEdgeQuality301 } from '../../browser/muse3jsparity-301-glyph-quality';
import { calculateWaterReflectionProjectionError301 } from '../../browser/muse3jsparity-301-water-quality';

// Pinhole projection follows similar triangles: focal pixels = height /
// (2 tan(verticalFov/2)); image coordinates are center + focal * (x/z, -y/z).
// See Hartley and Zisserman, Multiple View Geometry, ch. 6:
// https://doi.org/10.1017/CBO9780511811685
// For the fixture camera let R = hypot(2.35, 4.6). In camera coordinates,
// depth = (2.35 * (2.9 - y) + 4.6 * (4.6 - z)) / R and
// up = (4.6 * (y - 2.9) - 2.35 * (z - 4.6)) / R, with right = x.
// These frame-0 values apply the equations to the reflected world centers;
// they were calculated independently of any renderer or projectVisualPoint.
const REFLECTION_CENTERS_FRAME_0 = [
  [241.06003231588429, 294.9746563761023],
  [354.70861612193187, 268.29292267159104],
] as const;

function capture(family: VisualCapture301['family'], enabled = true, width = 600, height = 380): VisualCapture301 {
  return {
    family, engine: 'aura', enabled, frame: 0, width, height,
    pixels: new Array(width * height * 4).fill(0), dataUrl: '', passes: [], errors: [],
    settings: VISUAL_SETTINGS_301, claimSurface: 'test fixture',
  };
}

function paint(c: VisualCapture301, cx: number, cy: number, color: readonly number[], radius = 3): void {
  for (let y = Math.floor(cy) - radius; y <= Math.floor(cy) + radius; y++) {
    for (let x = Math.floor(cx) - radius; x <= Math.floor(cx) + radius; x++) {
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
      const i = (y * c.width + x) * 4;
      for (let j = 0; j < 3; j++) c.pixels[i + j] = color[j]!;
      c.pixels[i + 3] = 255;
    }
  }
}

describe('V01 independent pixel quality oracles', () => {
  it('projects pinhole camera landmarks with the expected field of view and orientation', () => {
    const eye = [0, 0, 4], target = [0, 0, 0];
    const cases = [
      { point: [0, 0, 0], expected: [400, 200] },
      { point: [1, 0, 0], expected: [450, 200] },
      { point: [-1, -1, 2], expected: [300, 300] },
      { point: [0, 1, 2], expected: [400, 100] },
    ];
    for (const { point, expected } of cases) {
      const actual = projectVisualPoint(point, eye, target, 90, 800, 400);
      expect(actual[0]).toBeCloseTo(expected[0]!, 10);
      expect(actual[1]).toBeCloseTo(expected[1]!, 10);
    }
    const turned = projectVisualPoint([2, 1, 1], [0, 0, 0], [1, 0, 0], 90, 800, 400);
    expect(turned[0]).toBeCloseTo(500, 10);
    expect(turned[1]).toBeCloseTo(100, 10);
    expect(() => projectVisualPoint([0, 0, 5], eye, target, 90, 800, 400)).toThrow();
  });

  it('projects the configured tilted camera against fixed geometric landmarks', () => {
    const s = VISUAL_SETTINGS_301.camera;
    expect(s).toEqual({ position: [0, 2.9, 4.6], target: [0, 0.55, 0], fov: 40, near: 0.1, far: 100 });
    const cases = [
      { point: [-0.65, -0.75, 0], expected: REFLECTION_CENTERS_FRAME_0[0] },
      { point: [0.65, -0.75, -0.5], expected: REFLECTION_CENTERS_FRAME_0[1] },
      { point: [1, 1, 2], expected: [464.1706862434273, 273.58687771698476] },
      { point: [0, 0.55, 0], expected: [300, 190] },
    ];
    for (const { point, expected } of cases) {
      const actual = projectVisualPoint(point, s.position, s.target, s.fov, 600, 380);
      expect(actual[0]).toBeCloseTo(expected[0]!, 8);
      expect(actual[1]).toBeCloseTo(expected[1]!, 8);
    }
  });

  it('missing particles cannot receive zero trajectory error and a displaced grid is rejected', () => {
    const empty = capture('particles', true, 640, 360);
    expect(particleTrajectoryProjectionError(empty)).toBe(1);
    const centered = capture('particles', true, 640, 360);
    paint(centered, 319.5, 179.5, [255, 180, 80], 20);
    expect(particleTrajectoryProjectionError(centered)).toBeLessThan(0.002);
    const shifted = capture('particles', true, 640, 360);
    paint(shifted, 410, 180, [255, 180, 80], 20);
    expect(particleTrajectoryProjectionError(shifted)).toBeGreaterThan(0.1);
  });

  it('reflected sources at independently projected positions beat missing or displaced reflection', () => {
    expect([VISUAL_SETTINGS_301.width, VISUAL_SETTINGS_301.height]).toEqual([600, 380]);
    const on = capture('water-reflections');
    const off = capture('water-reflections', false);
    const bad = capture('water-reflections');
    REFLECTION_CENTERS_FRAME_0.forEach(([x, y], i) => {
      const color = i ? [0, 60, 255] : [255, 0, 0];
      paint(on, x, y, color);
      paint(bad, x + 60, y, color);
    });
    expect(calculateWaterReflectionProjectionError301(on, off)).toBeLessThan(0.002);
    expect(calculateWaterReflectionProjectionError301(bad, off)).toBeGreaterThan(0.06);
    expect(calculateWaterReflectionProjectionError301(capture('water-reflections'), off)).toBe(1);
  });

  it('glyph oracle rejects absent and horizontally shifted glyph pixels', () => {
    const reference = createGlyphReference301();
    const off = capture('sdf-text', false), ideal = capture('sdf-text'), shifted = capture('sdf-text');
    for (let y = 0; y < 380; y++) for (let x = 0; x < 600; x++) {
      const alpha = reference.coverage[y * 600 + x]!;
      if (alpha < 0.2) continue;
      for (let k = 0; k < 3; k++) {
        ideal.pixels[(y * 600 + x) * 4 + k] = 255;
        if (x + 16 < 600) shifted.pixels[(y * 600 + x + 16) * 4 + k] = 255;
      }
    }
    expect(measureGlyphEdgeQuality301(ideal.pixels, off.pixels, reference).glyphEdgeError).toBe(0);
    expect(measureGlyphEdgeQuality301(off.pixels, off.pixels, reference).glyphEdgeError).toBe(1);
    expect(measureGlyphEdgeQuality301(shifted.pixels, off.pixels, reference).glyphEdgeError).toBeGreaterThan(0.18);
    const noisy = capture('sdf-text');
    for (let y = reference.region[1]; y <= reference.region[3]; y++) {
      for (let x = reference.region[0]; x <= reference.region[2]; x++) {
        const i = (y * 600 + x) * 4;
        if (reference.coverage[y * 600 + x]! >= 0.2) continue;
        noisy.pixels[i] = 80; noisy.pixels[i + 1] = 45; noisy.pixels[i + 2] = 20;
      }
    }
    for (let y = 0; y < 380; y++) for (let x = 0; x < 600; x++) {
      if (reference.coverage[y * 600 + x]! < 0.2) continue;
      for (let k = 0; k < 3; k++) noisy.pixels[(y * 600 + x) * 4 + k] = 255;
    }
    expect(measureGlyphEdgeQuality301(noisy.pixels, off.pixels, reference).glyphEdgeError).toBe(0);
  });
});
