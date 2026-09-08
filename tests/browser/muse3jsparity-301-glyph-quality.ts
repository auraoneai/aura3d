import {
  createSdfFontAtlas,
  layoutSdfText,
  rasterizeSdfTextLabelImage,
} from '../../packages/rendering/src/SdfText';
import { VISUAL_SETTINGS_301 } from './muse3jsparity-301-visual-cases';

/** Frozen source-derived contract, declared before GPU captures are inspected. */
export const GLYPH_EDGE_CONTRACT_301 = Object.freeze({
  id: 'glyphEdgeError', direction: 'lower' as const,
  maximum: 0.18, tieTolerance: 0.02,
  minimumDegradedGap: 0.08,
  expectedAlphaThreshold: 0.2,
  observedChannelDeltaThreshold: 6 / 255,
  edgeTolerancePixels: 1.5,
  edgeDistanceCapPixels: 6,
});

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(a: V3): V3 {
  const length = Math.hypot(...a);
  if (!(length > 0)) throw new Error('Degenerate glyph reference camera.');
  return [a[0] / length, a[1] / length, a[2] / length];
}

export interface GlyphReference301 {
  width: number;
  height: number;
  /** Top-left origin, matching PNG decoder pixels, not GL readPixels rows. */
  coverage: Float32Array;
  region: readonly [number, number, number, number];
  source: 'AURA / shared SdfText atlas / 64 texels per world unit';
}

/**
 * Independent projection oracle: ray intersect the actual world-space text plane,
 * then sample the shared source atlas bake. No rendered image determines the mask
 * or the region. Both engines use this same oracle and fixed camera contract.
 */
export function createGlyphReference301(): GlyphReference301 {
  const { width, height, camera, sdfText } = VISUAL_SETTINGS_301;
  const position = camera.position as unknown as V3;
  const forward = normalize(sub(camera.target as unknown as V3, position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tangent = Math.tan(camera.fov * Math.PI / 360);
  const atlas = createSdfFontAtlas();
  const layout = layoutSdfText(sdfText.text, atlas, { size: sdfText.size });
  const raster = rasterizeSdfTextLabelImage(layout, atlas, { texelsPerWorldUnit: sdfText.texelsPerWorldUnit });
  const coverage = new Float32Array(width * height);
  let minX: number = width, minY: number = height, maxX = -1, maxY = -1;
  const alpha = (x: number, y: number): number => {
    const sx = Math.max(0, Math.min(raster.width - 1, x));
    const sy = Math.max(0, Math.min(raster.height - 1, y));
    return raster.data[(sy * raster.width + sx) * 4 + 3]! / 255;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nx = (2 * (x + 0.5) / width - 1) * tangent * width / height;
    const ny = (1 - 2 * (y + 0.5) / height) * tangent;
    const ray: V3 = [forward[0] + right[0] * nx + up[0] * ny, forward[1] + right[1] * nx + up[1] * ny, forward[2] + right[2] * nx + up[2] * ny];
    if (Math.abs(ray[2]) < 1e-10) continue;
    const t = (sdfText.position[2]! - position[2]) / ray[2];
    if (t <= 0) continue;
    const lx = position[0] + t * ray[0] - sdfText.position[0]!;
    const ly = position[1] + t * ray[1] - sdfText.position[1]!;
    if (lx < 0 || lx > layout.widthWorld || ly < 0 || ly > layout.heightWorld) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    // Texture-coordinate reconstruction uses raster dimensions, including ceil.
    const tx = lx / layout.widthWorld * raster.width - 0.5;
    // The raw atlas upload maps row zero to texture v=0. The SDF bake uses
    // that row convention directly, so world-space y increases with the
    // sampled row. Inverting it here made the oracle reward upside-down text.
    const ty = ly / layout.heightWorld * raster.height - 0.5;
    const ix = Math.floor(tx), iy = Math.floor(ty), fx = tx - ix, fy = ty - iy;
    coverage[y * width + x] =
      alpha(ix, iy) * (1 - fx) * (1 - fy) + alpha(ix + 1, iy) * fx * (1 - fy) +
      alpha(ix, iy + 1) * (1 - fx) * fy + alpha(ix + 1, iy + 1) * fx * fy;
  }
  if (maxX < minX || maxY < minY) throw new Error('Glyph reference projects outside the capture.');
  return { width, height, coverage, region: [Math.max(0, minX - 6), Math.max(0, minY - 6), Math.min(width - 1, maxX + 6), Math.min(height - 1, maxY + 6)], source: 'AURA / shared SdfText atlas / 64 texels per world unit' };
}

export interface GlyphEdgeResult301 {
  glyphEdgeError: number;
  edgeMismatch: number;
  coverageMismatch: number;
  expectedPixels: number;
  observedPixels: number;
  expectedEdgePixels: number;
  observedEdgePixels: number;
}

/** Compare RGBA8 on/off captures; lower is better. Missing glyphs cannot pass. */
export function measureGlyphEdgeQuality301(
  enabled: ArrayLike<number>, disabled: ArrayLike<number>,
  reference: GlyphReference301 = createGlyphReference301(),
): GlyphEdgeResult301 {
  const { width, height, coverage, region } = reference;
  if (enabled.length !== width * height * 4 || disabled.length !== enabled.length) throw new Error('Glyph captures must be matching 600×380 RGBA8 arrays.');
  const expected = new Uint8Array(width * height), observed = new Uint8Array(width * height);
  let expectedPixels = 0, observedPixels = 0;
  const [x0, y0, x1, y1] = region;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * width + x;
    const delta = Math.max(...[0, 1, 2].map(c => {
      const on = enabled[i * 4 + c]!, off = disabled[i * 4 + c]!;
      if (!Number.isFinite(on) || !Number.isFinite(off) || on < 0 || on > 255 || off < 0 || off > 255) throw new Error('Glyph capture contains invalid RGBA8 data.');
      return Math.abs(on - off) / 255;
    }));
    expected[i] = coverage[i]! >= GLYPH_EDGE_CONTRACT_301.expectedAlphaThreshold ? 1 : 0;
    // The paired engines mount the same scene independently. Small lighting or
    // shadow changes behind the text can produce RGB deltas inside this region,
    // but they are not glyph coverage. The frozen label is white, so require a
    // meaningful on/off delta and an achromatic near-white enabled pixel.
    const r = enabled[i * 4]!, g = enabled[i * 4 + 1]!, b = enabled[i * 4 + 2]!;
    const nearWhite = Math.min(r, g, b) >= 180 && Math.max(r, g, b) - Math.min(r, g, b) <= 40;
    observed[i] = delta >= GLYPH_EDGE_CONTRACT_301.observedChannelDeltaThreshold && nearWhite ? 1 : 0;
    expectedPixels += expected[i]!; observedPixels += observed[i]!;
  }
  const edges = (mask: Uint8Array): number[] => {
    const result: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      if (mask[i] && (x === 0 || y === 0 || x === width - 1 || y === height - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width])) result.push(i);
    }
    return result;
  };
  const expectedEdges = edges(expected), observedEdges = edges(observed);
  const directed = (from: number[], to: number[]): number => {
    if (!from.length || !to.length) return 1;
    let total = 0;
    for (const i of from) {
      let best: number = GLYPH_EDGE_CONTRACT_301.edgeDistanceCapPixels;
      for (const j of to) best = Math.min(best, Math.hypot(i % width - j % width, Math.floor(i / width) - Math.floor(j / width)));
      total += Math.max(0, best - GLYPH_EDGE_CONTRACT_301.edgeTolerancePixels) / (GLYPH_EDGE_CONTRACT_301.edgeDistanceCapPixels - GLYPH_EDGE_CONTRACT_301.edgeTolerancePixels);
    }
    return total / from.length;
  };
  const edgeMismatch = (directed(expectedEdges, observedEdges) + directed(observedEdges, expectedEdges)) / 2;
  const coverageMismatch = Math.min(1, Math.abs(observedPixels - expectedPixels) / Math.max(1, expectedPixels));
  return { glyphEdgeError: Math.max(edgeMismatch, coverageMismatch), edgeMismatch, coverageMismatch, expectedPixels, observedPixels, expectedEdgePixels: expectedEdges.length, observedEdgePixels: observedEdges.length };
}
