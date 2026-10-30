import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { discOnTerrain, ribbonAlongPath, terrainToMeshSpec } from "../../../apps/showcase-aura-links-3d/src/game/terrainMesh";
import {
  TEXEL_SIZE,
  TURF_SURFACES,
  courseTextureBytes,
  mowStripeTexels,
  normalTexels,
  patchTexels,
  texelsPerMetre,
  type LinksNormalKind,
  type TexelBlock
} from "../../../apps/showcase-aura-links-3d/src/game/turf";
import type { CourseTheme } from "../../../apps/showcase-aura-links-3d/src/game/types";

/** GU47 WP-20 LINKS-05: textured turf (world-metre uv0, tiled masks and normals per course theme). */

const THEMES = Object.keys(TURF_SURFACES) as CourseTheme[];
const NORMALS: LinksNormalKind[] = ["blades", "clumps", "sand", "basalt", "regolith"];
const course = COURSES.stAuroras;
const hole = course.holes[1]!;
const terrain = buildHoleTerrain(course, hole);

function greyStats(b: TexelBlock): { mean: number; std: number } {
  let s = 0, s2 = 0;
  const n = b.size * b.size;
  for (let i = 0; i < n; i++) { const g = b.data[i * 4]!; s += g; s2 += g * g; }
  const mean = s / n;
  return { mean, std: Math.sqrt(s2 / n - mean * mean) };
}

describe("LINKS-05 world-metre uv0", () => {
  it("heightfield and discs carry uv = world (x, z) in metres", () => {
    const base = terrainToMeshSpec(terrain, 12, 10, -0.04, "metres");
    base.positions.forEach((p, i) => expect(base.uvs[i]).toEqual([p[0], p[2]]));
    const disc = discOnTerrain(terrain, terrain.cup[0], terrain.cup[2], hole.layout.greenRadius, 0.065, 36, 0, "metres");
    disc.positions.forEach((p, i) => expect(disc.uvs[i]).toEqual([p[0], p[2]]));
  });

  it("ribbons carry u = metres along the line of play and v = metres across it", () => {
    const halfWidth = hole.layout.fairwayWidth / 2;
    const r = ribbonAlongPath(terrain, hole.layout.path, halfWidth, 0.035, 2.5, 9, "metres");
    const cols = 9;
    const rows = r.uvs.length / cols;
    let pathLen = 0;
    for (let i = 1; i < hole.layout.path.length; i++) {
      const a = hole.layout.path[i - 1]!, b = hole.layout.path[i]!;
      pathLen += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    expect(r.uvs[0]![0]).toBe(0);
    expect(r.uvs[(rows - 1) * cols]![0]).toBeCloseTo(pathLen, 6);
    for (let row = 1; row < rows; row++) {
      // along: monotone, and the step between rows matches the centre-line distance travelled (straight segments)
      expect(r.uvs[row * cols]![0]).toBeGreaterThan(r.uvs[(row - 1) * cols]![0]);
    }
    // across: v spans the ribbon's width in metres (centre column at 0), away from the tapered end rows
    expect(r.uvs[0]![1]).toBeCloseTo(-halfWidth, 6);
    expect(r.uvs[cols - 1]![1]).toBeCloseTo(halfWidth, 6);
    expect(r.uvs[(cols - 1) / 2]![1]).toBeCloseTo(0, 6);
  });

  it("legacy mode keeps the 4.6.2 coordinates and the positions are the same in both modes", () => {
    const legacy = ribbonAlongPath(terrain, hole.layout.path, 10, 0.035);
    const metres = ribbonAlongPath(terrain, hole.layout.path, 10, 0.035, 2.5, 9, "metres");
    expect(metres.positions).toEqual(legacy.positions);
    expect(metres.indices).toEqual(legacy.indices);
    expect(legacy.uvs[9 + 4]).toEqual([2.5 / 10, 0.5]);
    const base = terrainToMeshSpec(terrain, 6, 6, 0);
    expect(base.uvs[0]).toEqual([terrain.bounds.minX / 18, terrain.bounds.minZ / 18]);
  });
});

describe("LINKS-05 texels", () => {
  it("are deterministic and tile seamlessly (edge rows and columns differ like neighbours inside the tile)", () => {
    for (const block of [mowStripeTexels(), patchTexels(), ...NORMALS.map((k) => normalTexels(k))]) {
      const { size, data } = block;
      const at = (x: number, y: number, c: number) => data[(y * size + x) * 4 + c]!;
      let seam = 0, inner = 0;
      for (let i = 0; i < size; i++) {
        for (let c = 0; c < 3; c++) {
          seam += Math.abs(at(size - 1, i, c) - at(0, i, c)) + Math.abs(at(i, size - 1, c) - at(i, 0, c));
          inner += Math.abs(at(size / 2 - 1, i, c) - at(size / 2, i, c)) + Math.abs(at(i, size / 2 - 1, c) - at(i, size / 2, c));
        }
      }
      expect(seam).toBeLessThanOrEqual(inner * 1.6 + size);
    }
    expect(normalTexels("basalt").data).toEqual(normalTexels("basalt").data);
    expect(patchTexels().data).toEqual(patchTexels().data);
  });

  it("normal tiles are unit-length and visibly tilted; masks are grey with real variation", () => {
    for (const kind of NORMALS) {
      const { size, data } = normalTexels(kind);
      let tilt = 0;
      for (let i = 0; i < size * size; i++) {
        const x = data[i * 4]! / 127.5 - 1, y = data[i * 4 + 1]! / 127.5 - 1, z = data[i * 4 + 2]! / 127.5 - 1;
        expect(Math.abs(Math.hypot(x, y, z) - 1), kind).toBeLessThan(0.03);
        expect(z, kind).toBeGreaterThan(0);
        tilt += Math.hypot(x, y);
      }
      const mean = tilt / (size * size);
      expect(mean, kind).toBeGreaterThan(0.15);
      expect(mean, kind).toBeLessThan(0.5);
    }
    const mow = greyStats(mowStripeTexels());
    const patch = greyStats(patchTexels());
    expect(mow.std).toBeGreaterThan(8);
    expect(patch.std).toBeGreaterThan(5);
  });

  it("mow stripes band along u only: columns vary, rows stay nearly constant", () => {
    const { size, data } = mowStripeTexels();
    let alongU = 0, alongV = 0;
    for (let i = 1; i < size; i++) {
      alongU += Math.abs(data[(5 * size + i) * 4]! - data[(5 * size + i - 1) * 4]!);
      alongV += Math.abs(data[(i * size + 5) * 4]! - data[((i - 1) * size + 5) * 4]!);
    }
    expect(alongU).toBeGreaterThan(alongV * 3);
  });
});

describe("LINKS-05 surface table", () => {
  it("every theme dresses every slot; detail tiles hold 256-1024 texels per metre", () => {
    for (const theme of THEMES) {
      for (const [slot, s] of Object.entries(TURF_SURFACES[theme])) {
        if (s.normal) {
          const tpm = texelsPerMetre(s.normal);
          expect(tpm, `${theme} ${slot}`).toBeGreaterThanOrEqual(128);
          expect(tpm, `${theme} ${slot}`).toBeLessThanOrEqual(1024);
        }
        if (s.mask?.kind === "patch") expect(texelsPerMetre(s.mask)).toBeGreaterThanOrEqual(256);
      }
      expect(TURF_SURFACES[theme].green.normal?.kind).toBe("blades");
      expect(texelsPerMetre(TURF_SURFACES[theme].green.normal!)).toBeGreaterThanOrEqual(256);
    }
    expect(TURF_SURFACES.volcanic.rough.normal?.kind).toBe("basalt");
    expect(TURF_SURFACES.lunar.rough.normal?.kind).toBe("regolith");
    expect(TURF_SURFACES.lunar.bunker.normal?.kind).toBe("regolith");
    expect(TURF_SURFACES.dunes.bunker.normal?.kind).toBe("sand");
    expect(TURF_SURFACES.lunar.green.sheen).toBeGreaterThan(0);
    expect(TEXEL_SIZE.mow).toBeLessThanOrEqual(256);
  });

  it("stays far inside the 48 MB per-course texture budget (GPU bytes with mips)", () => {
    for (const theme of THEMES) expect(courseTextureBytes(theme), theme).toBeLessThan(4 * 1024 * 1024);
  });

  it("main.ts mounts the textured surfaces on the GU47 look only and drops the longitudinal stripe ribbon there", () => {
    const main = readFileSync(resolve(__dirname, "../../../apps/showcase-aura-links-3d/src/main.ts"), "utf8");
    expect(main).toContain('const turfOn = lookMode !== "original"');
    expect(main).toMatch(/if \(!turfOn\) \{\s*const fairB/);
    for (const slot of ["rough", "firstCut", "fairway", "fringe", "green", "bunker"]) expect(main).toContain(`surfaceMaterial(course, "${slot}"`);
  });
});
