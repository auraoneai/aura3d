/**
 * Glint Courier arcade-readability kit (owner review 2026-11-18: "make them like pacman type").
 *
 * The genre look of a classic maze-chase cabinet, with original characters:
 * - maze walls are thin neon outline segments (one colour) on a near-black floor (`neon` pool);
 * - the courier is a gold dome orb-bot with a cyan visor arc and a forward nose notch (`courier` + `courierVisor`
 *   pools share one local frame, so both take the same transform);
 * - the four sentries are flat, spinning, star-shaped hover drones (8, 4, 6 and 5 points) in solid saturated colours,
 *   with big white eyes whose pupils look where the drone moves (`eye` pool, pupils are dark instances of it);
 * - pellets are small warm-white glowing beads, power cells are larger pulsing beads, every actor sits on a soft
 *   glow disc in its own colour (`glow` pool).
 *
 * Every pool geometry lies inside [-0.5 .. 0.5]^3 so world.ts sizes instances with plain scale factors.
 * Pure @aura3d/engine procedural geometry (no external 3D engine).
 */
import {
  game,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  bevelBoxMesh,
  icosphereSmoothMesh,
  latheMesh,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
  paintMeshColors,
  transformMesh,
  type RawMesh
} from "../../../showcase-port-shared/proceduralKernel";
import { extrudeStarPolygonMesh, normalizeUnitCubeMesh } from "./proceduralModels.js";

export const ARCADE_CAPS = {
  neon: 1400,
  dot: 240,
  cell: 8,
  marker: 8,
  eye: 64,
  courier: 2,
  courierVisor: 2,
  sentryBlitz: 2,
  sentrySly: 2,
  sentryFlick: 2,
  sentryDim: 2,
  gem: 4,
  glow: 64
} as const;
export type ArcadePoolKey = keyof typeof ARCADE_CAPS;

/** Star point count and inner radius (fraction of the outer radius) per sentry silhouette. */
export const SENTRY_STARS = {
  sentryBlitz: { points: 8, inner: 0.72 },
  sentrySly: { points: 4, inner: 0.6 },
  sentryFlick: { points: 6, inner: 0.74 },
  sentryDim: { points: 5, inner: 0.66 }
} as const;

/**
 * Courier frame (local units, before the world scale): the dome body is COURIER_FRAME.bodyRadius wide, the nose tip
 * reaches COURIER_FRAME.noseTip forward (+z), the dome spans y in [bottom, top].
 */
export const COURIER_FRAME = { bodyRadius: 0.4, noseTip: 0.5, bottom: -0.12, top: 0.2 } as const;

const unit = (parts: readonly RawMesh[], fill: readonly [number, number, number] = [0.992, 0.992, 0.992]): AuraCustomGeometrySpec =>
  mergeRawMeshes([normalizeUnitCubeMesh(mergeRawMeshesToRaw(parts), fill)]);

/** Flat prism from a convex 2D ring in the x/z plane (counter-clockwise when plotted x right, z up), y in [y0, y1]. */
function prismXZ(ring: readonly (readonly [number, number])[], y0: number, y1: number): RawMesh {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const n = ring.length;
  // top fan (+y) and bottom fan (-y); the rings used here are convex
  const top = positions.length / 3;
  for (const [x, z] of ring) { positions.push(x, y1, z); normals.push(0, 1, 0); uvs.push(x + 0.5, z + 0.5); }
  for (let i = 1; i < n - 1; i++) indices.push(top, top + i + 1, top + i);
  const bot = positions.length / 3;
  for (const [x, z] of ring) { positions.push(x, y0, z); normals.push(0, -1, 0); uvs.push(x + 0.5, z + 0.5); }
  for (let i = 1; i < n - 1; i++) indices.push(bot, bot + i, bot + i + 1);
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i]!, [bx, bz] = ring[(i + 1) % n]!;
    let nx = bz - az, nz = -(bx - ax);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const s = positions.length / 3;
    positions.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    for (let k = 0; k < 4; k++) { normals.push(nx, 0, nz); uvs.push(k & 1, k >> 1); }
    indices.push(s, s + 2, s + 1, s, s + 3, s + 2);
  }
  return { positions, normals, uvs, indices };
}

/** Double-sided curved band on a dome (a visor arc), angles in radians around +z. */
function domeArc(r0: number, r1: number, a0: number, a1: number, y0: number, y1: number, segs = 18): RawMesh {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    const sx = Math.sin(a), cz = Math.cos(a);
    positions.push(sx * r0, y0, cz * r0, sx * r1, y1, cz * r1);
    normals.push(sx * 0.35, 0.94, cz * 0.35, sx * 0.55, 0.83, cz * 0.55);
    uvs.push(i / segs, 0, i / segs, 1);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, d, a, d, c, a, d, b, a, c, d);
  }
  return { positions, normals, uvs, indices };
}

function domeHeight(r: number): number {
  // matches the courier lathe profile below (linear between its rows)
  const prof: [number, number][] = [[0, COURIER_FRAME.top], [0.2, 0.185], [0.3, 0.15], [0.37, 0.08], [0.4, 0.0]];
  for (let i = 0; i < prof.length - 1; i++) {
    const [ra, ya] = prof[i]!, [rb, yb] = prof[i + 1]!;
    if (r <= rb) return ya + ((yb - ya) * (r - ra)) / Math.max(1e-6, rb - ra);
  }
  return 0;
}

function courierBodySpec(): AuraCustomGeometrySpec {
  const R = COURIER_FRAME.bodyRadius, B = COURIER_FRAME.bottom;
  // bottom centre -> rim -> dome top (lathe order gives outward normals)
  const dome = paintMeshColors(
    latheMesh([[0, B], [R - 0.03, B], [R, B + 0.04], [R, 0], [0.37, 0.08], [0.3, 0.15], [0.2, 0.185], [0, COURIER_FRAME.top]], 40, false),
    [1, 1, 1]
  );
  // darker metallic bezel framing the cyan visor arc so bloom never bleeds gold over the visor
  const bevelAngle = (61 * Math.PI) / 180;
  const visorBevel = paintMeshColors(
    domeArc(0.175, 0.365, -bevelAngle, bevelAngle, domeHeight(0.175) + 0.006, domeHeight(0.365) + 0.006, 22),
    [0.14, 0.16, 0.24]
  );
  // two short side fins (delivery-drone arms) so the silhouette is a rounded "cross", never a wedge
  const finL = paintMeshColors(prismXZ([[-0.36, -0.1], [-0.36, 0.1], [-0.46, 0.07], [-0.46, -0.07]], -0.08, 0.02), [0.92, 0.9, 0.86]);
  const finR = paintMeshColors(prismXZ([[0.36, 0.1], [0.36, -0.1], [0.46, -0.07], [0.46, 0.07]], -0.08, 0.02), [0.92, 0.9, 0.86]);
  return mergeRawMeshes([dome, visorBevel, finL, finR]);
}

function courierVisorSpec(): AuraCustomGeometrySpec {
  const a = (55 * Math.PI) / 180;
  const visor = domeArc(0.2, 0.34, -a, a, domeHeight(0.2) + 0.012, domeHeight(0.34) + 0.012);
  // forward nose notch: a short arrowhead past the rim, pointing along +z (the travel direction)
  const nose = prismXZ([[0, COURIER_FRAME.noseTip], [-0.13, 0.36], [0.13, 0.36]], -0.06, 0.06);
  return mergeRawMeshes([visor, nose]);
}

function sentrySpec(key: keyof typeof SENTRY_STARS): AuraCustomGeometrySpec {
  const s = SENTRY_STARS[key];
  const star = transformMesh(extrudeStarPolygonMesh(s.points, 0.5, 0.5 * s.inner, 0.26, 0.035, true), { rot: [-Math.PI / 2, 0, 0] });
  // a raised hub dome in the middle (the eyes sit on it)
  const hub = latheMesh([[0, 0.1], [0.3, 0.1], [0.27, 0.16], [0.16, 0.2], [0, 0.21]], 28, false);
  return unit([star, hub], [0.992, 0.42, 0.992]);
}

function sphereSpec(): AuraCustomGeometrySpec {
  return unit([icosphereSmoothMesh(0.5, 2, 0, 1)]);
}

function eyeSpec(): AuraCustomGeometrySpec {
  return unit([latheMesh([[0, 0], [0.5, 0], [0.5, 0.08], [0.42, 0.2], [0.25, 0.27], [0, 0.29]], 28, false)]);
}

function discSpec(): AuraCustomGeometrySpec {
  return unit([latheMesh([[0, 0], [0.5, 0], [0.5, 0.01], [0, 0.01]], 40, false)], [0.992, 0.02, 0.992]);
}

function markerSpec(): AuraCustomGeometrySpec {
  // a square reticle ring (school-mode target tiles)
  const t = 0.12;
  return unit([
    prismXZ([[-0.5, -0.5], [-0.5, -0.5 + t], [0.5, -0.5 + t], [0.5, -0.5]].reverse() as [number, number][], 0, 0.05),
    prismXZ([[-0.5, 0.5 - t], [-0.5, 0.5], [0.5, 0.5], [0.5, 0.5 - t]].reverse() as [number, number][], 0, 0.05),
    prismXZ([[-0.5, -0.5 + t], [-0.5, 0.5 - t], [-0.5 + t, 0.5 - t], [-0.5 + t, -0.5 + t]].reverse() as [number, number][], 0, 0.05),
    prismXZ([[0.5 - t, -0.5 + t], [0.5 - t, 0.5 - t], [0.5, 0.5 - t], [0.5, -0.5 + t]].reverse() as [number, number][], 0, 0.05)
  ], [0.992, 0.05, 0.992]);
}

function gemSpec(): AuraCustomGeometrySpec {
  // an octagonal plinth under the bonus relic
  const ring: [number, number][] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; ring.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]); }
  return unit([prismXZ(ring, 0, 0.2)], [0.992, 0.3, 0.992]);
}

let geometries: Record<ArcadePoolKey, AuraCustomGeometrySpec> | null = null;
/** Pool geometries (built once, on first use). */
export function arcadeGeometries(): Readonly<Record<ArcadePoolKey, AuraCustomGeometrySpec>> {
  if (!geometries) {
    geometries = {
      neon: mergeRawMeshes([bevelBoxMesh(0.992, 0.992, 0.992, 0.02)]),
      dot: sphereSpec(),
      cell: sphereSpec(),
      marker: markerSpec(),
      eye: eyeSpec(),
      courier: courierBodySpec(),
      courierVisor: courierVisorSpec(),
      sentryBlitz: sentrySpec("sentryBlitz"),
      sentrySly: sentrySpec("sentrySly"),
      sentryFlick: sentrySpec("sentryFlick"),
      sentryDim: sentrySpec("sentryDim"),
      gem: gemSpec(),
      glow: discSpec()
    };
  }
  return geometries;
}

/** Self-lit instanced material: the instance colour drives base and emissive (`instanceColorTarget: "both"`). */
const glow = (name: string, emissiveIntensity: number, roughness = 0.35, extra: Partial<Parameters<typeof material.pbr>[0]> = {}): AuraMaterialSpec =>
  material.pbr({ name, color: "#ffffff", emissive: "#ffffff", emissiveIntensity, roughness, metalness: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.1, practical: true, ...extra });

/** Emissive strengths: the courier is the brightest thing on screen, then the sentries, then pellets, then the walls. */
export const ARCADE_EMISSIVE = { courier: 2.35, sentry: 1.85, eye: 1.4, cell: 2.1, dot: 1.42, neon: 1.15, glow: 0.95 } as const;

export const ARCADE_MATERIALS = {
  neon: glow("maze neon outline", ARCADE_EMISSIVE.neon, 0.5),
  dot: glow("data pellet", ARCADE_EMISSIVE.dot, 0.3),
  cell: glow("power cell", ARCADE_EMISSIVE.cell, 0.25),
  marker: glow("school target reticle", 0.9, 0.5),
  eye: glow("sentry eyes", ARCADE_EMISSIVE.eye, 0.3),
  courier: glow("courier gold dome", ARCADE_EMISSIVE.courier, 0.3),
  courierVisor: glow("courier visor + nose", 2.15, 0.2),
  sentry: glow("sentry drone shell", ARCADE_EMISSIVE.sentry, 0.4),
  gem: glow("relic plinth", 0.8, 0.2),
  glowDisc: material.pbr({
    name: "actor glow disc", color: "#ffffff", emissive: "#ffffff", emissiveIntensity: ARCADE_EMISSIVE.glow, roughness: 1, metalness: 0,
    opacity: 0.32, blend: "additive", depthWrite: false, clearcoat: 0, sheen: 0, practical: true
  })
} as const;

export function buildArcadePoolNodes(pad: (count: number) => AuraTransformSpec[]): AuraNodeBuilder<AuraPrimitiveNode>[] {
  const g = arcadeGeometries();
  const pool = (key: ArcadePoolKey, name: string, mat: AuraMaterialSpec, castShadow = false): AuraNodeBuilder<AuraPrimitiveNode> =>
    instances
      .custom(g[key], { name, material: mat, transforms: pad(ARCADE_CAPS[key]), castShadow, receiveShadow: false, instanceColorTarget: "both" })
      .runtime(game.runtimeNode(`pool-${key}`));
  const M = ARCADE_MATERIALS;
  return [
    pool("glow", "actor glow discs", M.glowDisc),
    pool("neon", "maze neon", M.neon),
    pool("dot", "pellets", M.dot),
    pool("cell", "power cells", M.cell),
    pool("marker", "school markers", M.marker),
    pool("gem", "relic plinth", M.gem),
    pool("courier", "courier", M.courier, true),
    pool("courierVisor", "courier visor", M.courierVisor),
    pool("sentryBlitz", "sentry blitz", M.sentry, true),
    pool("sentrySly", "sentry sly", M.sentry, true),
    pool("sentryFlick", "sentry flick", M.sentry, true),
    pool("sentryDim", "sentry dim", M.sentry, true),
    pool("eye", "eyes", M.eye)
  ];
}

export function arcadePoolBounds(key: ArcadePoolKey): { readonly min: readonly number[]; readonly max: readonly number[] } {
  const p = arcadeGeometries()[key].positions as Float32Array;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a]!, p[i + a]!); max[a] = Math.max(max[a]!, p[i + a]!); }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Neon wall outline (classic cabinet look): each wall tile draws a thin line on every face that borders an open
// tile, inset NEON.inset into the wall tile, so a corridor reads 1 + 2 * inset tiles wide between its lines.
// ---------------------------------------------------------------------------
export const NEON = { inset: 0.3, thickness: 0.1, height: 0.1 } as const;

export interface NeonSegment { readonly x: number; readonly z: number; readonly sx: number; readonly sz: number }

/**
 * Neon outline segments (tile coordinates, centre + size in x/z) for a wall grid. Out-of-bounds counts as wall, so
 * the outer frame draws one line on its inner side. Corners: convex corners stop at the inset, concave corners run
 * on to meet the perpendicular line.
 */
export function neonSegments(width: number, height: number, isWall: (x: number, y: number) => boolean): NeonSegment[] {
  const W = (x: number, y: number): boolean => x < 0 || y < 0 || x >= width || y >= height || isWall(x, y);
  const { inset: I, thickness: T } = NEON;
  const out: NeonSegment[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isWall(x, y)) continue;
      // horizontal faces: north (dy -1) and south (dy +1)
      for (const dy of [-1, 1]) {
        if (W(x, y + dy)) continue;
        const z = y + dy * (0.5 - I);
        const start = !W(x - 1, y) ? x - 0.5 + I : W(x - 1, y + dy) ? x - 0.5 - I : x - 0.5;
        const end = !W(x + 1, y) ? x + 0.5 - I : W(x + 1, y + dy) ? x + 0.5 + I : x + 0.5;
        out.push({ x: (start + end) / 2, z, sx: end - start + T, sz: T });
      }
      for (const dx of [-1, 1]) {
        if (W(x + dx, y)) continue;
        const xx = x + dx * (0.5 - I);
        const start = !W(x, y - 1) ? y - 0.5 + I : W(x + dx, y - 1) ? y - 0.5 - I : y - 0.5;
        const end = !W(x, y + 1) ? y + 0.5 - I : W(x + dx, y + 1) ? y + 0.5 + I : y + 0.5;
        out.push({ x: xx, z: (start + end) / 2, sx: T, sz: end - start + T });
      }
    }
  }
  return out;
}
