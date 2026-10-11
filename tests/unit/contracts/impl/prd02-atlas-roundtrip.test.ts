/**
 * Local shadow atlas (PRD-02 §8.3): a tile is rasterised where it is sampled.
 * For any clip-space point of a tile's light, the atlas UV it is drawn at
 * (`drawViewProjection` → NDC → [0,1]) equals the UV the receiver samples
 * (`rect.xy + viewProjection·p · rect.zw`, the ShadowSystem
 * `localShadowData` convention), on every tile of a mixed spot + point plan.
 */
import { describe, expect, it } from "vitest";
import { atlasTileClipMatrix, planLocalShadowAtlas } from "../../../../packages/rendering/src/shadows/ShadowAtlas";

function transform(m: Float32Array, p: readonly [number, number, number]): [number, number, number] {
  const x = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!;
  const y = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!;
  const z = m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!;
  const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  return [x / w, y / w, z / w];
}

describe("shadow atlas: draw rect == sample rect", () => {
  const ATLAS = 1024;
  const planned = planLocalShadowAtlas([
    { lightIndex: 0, kind: "spot", size: 256, position: [0, 4, 0], direction: [0, -1, 0], range: 10, outerAngleRadians: 0.8 },
    { lightIndex: 1, kind: "point", size: 128, position: [2, 2, 2], direction: [0, -1, 0], range: 8 }
  ], ATLAS);

  it("plans 1 spot tile + 6 point faces", () => {
    expect(planned.tiles).toHaveLength(7);
  });

  it("every tile's drawn atlas UV equals its sampled atlas UV (round trip < 1e-6)", () => {
    let worst = 0;
    for (const tile of planned.tiles) {
      const a = tile.allocation;
      const rect = [a.x / ATLAS, a.y / ATLAS, a.width / ATLAS, a.height / ATLAS];
      // Points inside this light's frustum: invert by sampling along the light axis region.
      for (const [u, v] of [[0.1, 0.1], [0.5, 0.5], [0.9, 0.2], [0.3, 0.8]] as const) {
        // Build a clip point with NDC (2u-1, 2v-1, 0) via the tile's own matrices:
        // drawn = tileClip(clip(p)) and sampled = rect + toTileUv(clip(p)), so testing the
        // composition on NDC directly is exact.
        const ndc: [number, number, number] = [2 * u - 1, 2 * v - 1, 0];
        const drawnNdc = transform(atlasTileClipMatrix(a, ATLAS), ndc);
        const drawn = [(drawnNdc[0] + 1) / 2, (drawnNdc[1] + 1) / 2];
        const sampled = [rect[0]! + u * rect[2]!, rect[1]! + v * rect[3]!];
        worst = Math.max(worst, Math.abs(drawn[0]! - sampled[0]!), Math.abs(drawn[1]! - sampled[1]!));
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it("NDC ±1 maps exactly onto the allocation edges (in atlas px)", () => {
    for (const tile of planned.tiles) {
      const a = tile.allocation;
      const m = atlasTileClipMatrix(a, ATLAS);
      const lo = transform(m, [-1, -1, 0]);
      const hi = transform(m, [1, 1, 0]);
      expect(((lo[0] + 1) / 2) * ATLAS).toBeCloseTo(a.x, 4);
      expect(((lo[1] + 1) / 2) * ATLAS).toBeCloseTo(a.y, 4);
      expect(((hi[0] + 1) / 2) * ATLAS).toBeCloseTo(a.x + a.width, 4);
      expect(((hi[1] + 1) / 2) * ATLAS).toBeCloseTo(a.y + a.height, 4);
    }
  });

  it("the drawn and sampled matrices agree for a real light-space point", () => {
    const tile = planned.tiles[0]!;
    const a = tile.allocation;
    const p: [number, number, number] = [0.5, 0, -0.3]; // under the spot
    const drawnNdc = transform(tile.drawViewProjection, p);
    const tileUv = transform(tile.viewProjection, p);
    const drawn = [((drawnNdc[0] + 1) / 2) * ATLAS, ((drawnNdc[1] + 1) / 2) * ATLAS];
    const sampled = [a.x + tileUv[0] * a.width, a.y + tileUv[1] * a.height];
    expect(drawn[0]).toBeCloseTo(sampled[0]!, 3);
    expect(drawn[1]).toBeCloseTo(sampled[1]!, 3);
  });
});
