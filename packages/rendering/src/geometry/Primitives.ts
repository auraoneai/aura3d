/**
 * C-07 (PRD-01) — the single primitive-geometry factory. Routes every
 * `AuraBuiltinPrimitive` to the extended `Geometry` generators with C-27 tier
 * halving (`primitiveSegments: "half"`), capsule folding of `size ⊙ localScale`
 * (PRD §6.3) and a param-keyed geometry cache so equal parameter sets share
 * one GPU upload.
 *
 * Engine routing (createProductionPrimitiveMesh, index.ts) is lane 15's
 * bridge behind `A3D_QR_CORE` (request Q-15-2); lane-01 scenes reach this
 * through the `@aura3d/rendering` public entry directly.
 *
 * `AuraBuiltinPrimitive` is mirrored locally — @aura3d/rendering must not gain
 * an engine dependency edge; the union stays string-identical (C-07).
 */

import { Geometry } from "../Geometry";
import type { AuraPrimitiveTessellation } from "../contracts/geometry";
import type { AuraQualityTierSettings } from "../contracts/quality";
import { coneParityMesh } from "./Cone";
import { circleParityMesh } from "./Circle";
import { ringParityMesh } from "./Ring";
import { torusKnotParityMesh } from "./TorusKnot";
import { polyhedronParityMesh } from "./Polyhedron";
import { roundedBoxParityMesh } from "./RoundedBox";
import { tubeParityMesh } from "./Tube";
import { latheParityMesh } from "./Lathe";
import { extrudeParityMesh } from "./Extrude";
import { shapeParityMesh } from "./Shape";
import { parityMeshToGeometry } from "./Support";

export type AuraPrimitiveKind =
  | "box" | "sphere" | "plane" | "cylinder" | "capsule" | "torus"
  | "cone" | "circle" | "ring" | "tube" | "lathe" | "extrude" | "shape"
  | "torusKnot" | "polyhedron" | "roundedBox";

/**
 * threejs-parity SG-03 — rendering-side mirror of the frozen
 * `AuraPrimitiveParams` (`AA/nodes/types.ts`), so the widened generator union
 * reads three's constructor args without an engine dependency edge. Every
 * field optional; generators apply three's own defaults.
 */
export interface AuraParityPrimitiveParams extends AuraPrimitiveTessellation {
  readonly radius?: number;
  readonly height?: number;
  readonly innerRadius?: number;
  readonly outerRadius?: number;
  readonly thetaStart?: number;
  readonly thetaLength?: number;
  readonly thetaSegments?: number;
  readonly phiStart?: number;
  readonly phiLength?: number;
  readonly phiSegments?: number;
  readonly segments?: number;
  readonly tubeRadius?: number;
  readonly p?: number;
  readonly q?: number;
  readonly detail?: number;
  readonly variant?: "tetrahedron" | "octahedron" | "icosahedron" | "dodecahedron";
  readonly path?: unknown;
  readonly extrudePath?: unknown;
  readonly points?: readonly (readonly number[])[];
  readonly shape?: unknown;
  readonly depth?: number;
  readonly steps?: number;
  readonly bevelEnabled?: boolean;
  readonly bevelThickness?: number;
  readonly bevelSize?: number;
  readonly bevelOffset?: number;
  readonly bevelSegments?: number;
  readonly closed?: boolean;
}

const halve = (segments: number | undefined, fallback: number, min: number): number =>
  Math.max(min, Math.floor((segments ?? fallback) / 2));
const full = (segments: number | undefined, fallback: number, min: number): number =>
  Math.max(min, Math.floor(segments ?? fallback));

/**
 * Cache key: primitive + every resolved generator parameter, so two calls with
 * equal params share one `Geometry` (PRD: "685 boxes produce 1 geometry
 * upload"). The capsule key carries the quantized aspect
 * `(D.y / min(D.x, D.z))` to 0.01 plus the ellipticity ratio.
 */
const cache = new Map<string, Geometry>();

export function primitiveGeometryCacheSize(): number {
  return cache.size;
}

/** Test/diagnostic hook — entries' `dispose()` is NOT called (shared ownership). */
export function clearPrimitiveGeometryCache(): void {
  cache.clear();
}

/**
 * C-07 `createPrimitiveGeometry`. `effectiveDimensions` is `size ⊙ localScale`
 * resolved by the caller; it drives capsule folding (and is ignored for other
 * primitives, which stay unit-sized and take their shape from the node matrix).
 */
export function createPrimitiveGeometry(
  primitive: AuraPrimitiveKind,
  params: AuraParityPrimitiveParams | undefined,
  tier: Pick<AuraQualityTierSettings, "primitiveSegments">,
  effectiveDimensions?: readonly [number, number, number]
): Geometry {
  const half = tier.primitiveSegments === "half";
  const seg = (v: number | undefined, fb: number, min: number): number => (half ? halve(v, fb, min) : full(v, fb, min));

  let key: string;
  let build: () => Geometry;
  switch (primitive) {
    case "sphere": {
      const width = seg(params?.widthSegments, 64, 3);
      const height = seg(params?.heightSegments, 32, 2);
      key = `sphere|${width}|${height}`;
      build = () => Geometry.uvSphere(0.5, width, height, { textured: true });
      break;
    }
    case "cylinder": {
      const radial = seg(params?.radialSegments, 48, 3);
      const heightSegs = Math.max(1, Math.floor(params?.heightSegments ?? 1));
      const radiusTop = params?.radiusTop ?? 0.5;
      const radiusBottom = params?.radiusBottom ?? 0.5;
      const openEnded = params?.openEnded ?? false;
      key = `cylinder|${radial}|${heightSegs}|${radiusTop}|${radiusBottom}|${openEnded}`;
      build = () =>
        Geometry.cylinder({ radiusTop, radiusBottom, height: 1, segments: radial, heightSegments: heightSegs, openEnded, textured: true });
      break;
    }
    case "capsule": {
      const radial = seg(params?.radialSegments, 32, 3);
      const cap = seg(params?.capSegments, 8, 2);
      // §6.3 folding: D = size ⊙ localScale; radius = 0.5·min(Dx,Dz),
      // height = max(Dy, 2r); x/z ellipticity via a horizontal-only scale.
      const [dx, dy, dz] = effectiveDimensions ?? [1, 1, 1];
      const minXZ = Math.max(1e-6, Math.min(Math.abs(dx), Math.abs(dz)));
      const radius = 0.5 * minXZ;
      const height = Math.max(Math.abs(dy), 2 * radius);
      // rx = radius·ellipticity = Dz/2·(Dx/Dz) = Dx/2, rz = Dz/2 — exact semi-axes.
      const baseRadius = Math.abs(dz) / 2;
      const ellipticity = baseRadius > 1e-12 ? Math.abs(dx) / Math.abs(dz) : 1;
      const aspect = Math.round((Math.abs(dy) / minXZ) * 100) / 100;
      key = `capsule|${radial}|${cap}|a${aspect}|e${Math.round(ellipticity * 1000) / 1000}|h${height}`;
      build = () => Geometry.capsule({ radius: baseRadius, height, segments: radial, rings: cap, ellipticity, textured: true });
      break;
    }
    case "torus": {
      const radial = seg(params?.radialSegments, 64, 3);
      const tubular = seg(params?.tubularSegments, 16, 3);
      const tube = params?.tube ?? 0.045;
      key = `torus|${radial}|${tubular}|${tube}`;
      build = () => Geometry.torus({ radius: 0.43, tube, radialSegments: radial, tubularSegments: tubular });
      break;
    }
    case "plane": {
      const width = Math.max(1, Math.floor(params?.widthSegments ?? 1));
      const height = Math.max(1, Math.floor(params?.heightSegments ?? 1));
      key = `plane|${width}|${height}`;
      build = () => Geometry.litPlane({ widthSegments: width, heightSegments: height, textured: true });
      break;
    }
    case "box": {
      const width = Math.max(1, Math.floor(params?.widthSegments ?? 1));
      const height = Math.max(1, Math.floor(params?.heightSegments ?? 1));
      const depth = Math.max(1, Math.floor(params?.depthSegments ?? 1));
      key = `box|${width}|${height}|${depth}`;
      build = () => Geometry.box({ widthSegments: width, heightSegments: height, depthSegments: depth });
      break;
    }

    // ── SG-03 / L2-01+02: three-parity generators (exact buffer order) ────
    case "cone": {
      const radial = seg(params?.radialSegments, 32, 3);
      const heightSegs = Math.max(1, Math.floor(params?.heightSegments ?? 1));
      const radius = params?.radius ?? params?.radiusBottom ?? 1;
      const height = params?.height ?? 1;
      const openEnded = params?.openEnded ?? false;
      const thetaStart = params?.thetaStart ?? 0;
      const thetaLength = params?.thetaLength ?? Math.PI * 2;
      key = `cone|${radial}|${heightSegs}|${radius}|${height}|${openEnded}|${thetaStart}|${thetaLength}`;
      build = () =>
        parityMeshToGeometry(coneParityMesh({ radius, height, radialSegments: radial, heightSegments: heightSegs, openEnded, thetaStart, thetaLength }));
      break;
    }
    case "circle": {
      const segments = seg(params?.thetaSegments ?? params?.radialSegments, 32, 3);
      const radius = params?.radius ?? 1;
      const thetaStart = params?.thetaStart ?? 0;
      const thetaLength = params?.thetaLength ?? Math.PI * 2;
      key = `circle|${segments}|${radius}|${thetaStart}|${thetaLength}`;
      build = () => parityMeshToGeometry(circleParityMesh({ radius, segments, thetaStart, thetaLength }));
      break;
    }
    case "ring": {
      const thetaSegments = seg(params?.thetaSegments ?? params?.radialSegments, 32, 3);
      const phiSegments = Math.max(1, Math.floor(params?.phiSegments ?? 1));
      const innerRadius = params?.innerRadius ?? 0.5;
      const outerRadius = params?.outerRadius ?? params?.radius ?? 1;
      const thetaStart = params?.thetaStart ?? 0;
      const thetaLength = params?.thetaLength ?? Math.PI * 2;
      key = `ring|${thetaSegments}|${phiSegments}|${innerRadius}|${outerRadius}|${thetaStart}|${thetaLength}`;
      build = () =>
        parityMeshToGeometry(ringParityMesh({ innerRadius, outerRadius, thetaSegments, phiSegments, thetaStart, thetaLength }));
      break;
    }
    case "torusKnot": {
      const tubular = seg(params?.tubularSegments, 64, 3);
      const radial = seg(params?.radialSegments, 8, 3);
      const radius = params?.radius ?? 1;
      const tube = params?.tubeRadius ?? params?.tube ?? 0.4;
      const p = params?.p ?? 2;
      const q = params?.q ?? 3;
      key = `torusKnot|${tubular}|${radial}|${radius}|${tube}|${p}|${q}`;
      build = () =>
        parityMeshToGeometry(torusKnotParityMesh({ radius, tube, tubularSegments: tubular, radialSegments: radial, p, q }));
      break;
    }
    case "polyhedron": {
      const variant = params?.variant ?? "icosahedron";
      const radius = params?.radius ?? 1;
      const detail = half ? Math.max(0, Math.floor((params?.detail ?? 0) / 2)) : Math.floor(params?.detail ?? 0);
      key = `polyhedron|${variant}|${radius}|${detail}`;
      build = () => parityMeshToGeometry(polyhedronParityMesh({ radius, detail, variant }));
      break;
    }
    case "roundedBox": {
      const segments = Math.max(1, Math.floor(params?.widthSegments ?? params?.radialSegments ?? 2));
      const radius = params?.radius ?? 0.1;
      const [w, h, d] = effectiveDimensions ?? [1, 1, 1];
      key = `roundedBox|${segments}|${radius}|${w}|${h}|${d}`;
      build = () =>
        parityMeshToGeometry(roundedBoxParityMesh({ width: Math.abs(w), height: Math.abs(h), depth: Math.abs(d), segments, radius }));
      break;
    }
    case "tube": {
      if (params?.path === undefined) {
        throw new Error('createPrimitiveGeometry: "tube" requires params.path (a Curve or point list)');
      }
      const tubular = seg(params?.tubularSegments, 64, 3);
      const radial = seg(params?.radialSegments, 8, 3);
      const radius = params?.radius ?? 1;
      const closed = params?.closed ?? false;
      // Data-dependent (curve object) — no param-keyed cache entry.
      return parityMeshToGeometry(tubeParityMesh({ path: params.path, tubularSegments: tubular, radius, radialSegments: radial, closed }));
    }
    case "lathe": {
      const points = (params?.points ?? []).map((p) => [p[0] ?? 0, p[1] ?? 0] as const);
      if (points.length < 2) {
        throw new Error('createPrimitiveGeometry: "lathe" requires params.points (a 2D profile of at least two points)');
      }
      const segments = seg(params?.radialSegments, 12, 3);
      const phiStart = params?.phiStart ?? 0;
      const phiLength = params?.phiLength ?? Math.PI * 2;
      return parityMeshToGeometry(latheParityMesh({ points, segments, phiStart, phiLength }));
    }
    case "extrude": {
      if (params?.shape === undefined) {
        throw new Error('createPrimitiveGeometry: "extrude" requires params.shape');
      }
      return parityMeshToGeometry(extrudeParityMesh({
        shape: params.shape,
        steps: Math.max(1, Math.floor(params?.steps ?? 1)),
        depth: params?.depth ?? 1,
        bevelEnabled: params?.bevelEnabled ?? true,
        bevelThickness: params?.bevelThickness,
        bevelSize: params?.bevelSize,
        bevelOffset: params?.bevelOffset,
        bevelSegments: Math.max(0, Math.floor(params?.bevelSegments ?? 3)),
        extrudePath: params?.extrudePath
      }));
    }
    case "shape": {
      if (params?.shape === undefined) {
        throw new Error('createPrimitiveGeometry: "shape" requires params.shape (a Shape or point list)');
      }
      return parityMeshToGeometry(shapeParityMesh({ shape: params.shape }));
    }
    default:
      throw new Error(`createPrimitiveGeometry: unknown primitive "${String(primitive)}"`);
  }

  const existing = cache.get(key);
  if (existing) return existing;
  const geometry = build();
  cache.set(key, geometry);
  return geometry;
}
