/**
 * `@aura3d/engine/sculpt` kernel module: High-craft compound sub-assemblies: wheels, lattice trusses, voussoir archways, canopies, conifer tiers, stratified cliffs and articulated folk figures.
 * Re-exported unchanged through `proceduralKernel.ts`; split out of the 5.5.6 kernel with no behaviour change.
 */
import { fbm3, hash01, norm3, type MultiMatSlot, type RawMesh, type V2, type V3, type V4 } from "./kernelMath.js";
import {
  bevelBoxMesh,
  extrudePolygonMesh,
  icosphereSmoothMesh,
  latheMesh,
  loftSectionsMesh,
  mergeRawMeshesToRaw,
  transformMesh,
  tubeSweepMesh
} from "./meshPrimitives.js";
import { taubinSmoothMesh } from "./meshFairing.js";
import { sculptStylizedHeadMesh } from "./sdfSculpt.js";

// ---------------------------------------------------------------------------
// High-Craft Reusable Compound Sub-Assemblies
// ---------------------------------------------------------------------------

/**
 * Sculpted multi-material wheel assembly centered at `[0, 0, 0]` with axle along `X` (`[-width/2, +width/2]`):
 * chamfered rubber tire profile + deep-dish alloy rim barrel + `spokeCount` forged spokes + optional brake rotor.
 */
export function wheelAssemblySlots(opts: {
  readonly radius: number;
  readonly width: number;
  readonly spokeCount?: number;
  readonly tireMat: number;
  readonly rimMat: number;
  readonly rotorMat?: number;
}): MultiMatSlot[] {
  const r = Math.max(0.05, opts.radius);
  const hw = Math.max(0.02, opts.width * 0.5);
  const rimR = r * 0.66;
  const hubR = r * 0.2;
  const spokeCount = Math.max(3, Math.floor(opts.spokeCount ?? 5));
  const slots: MultiMatSlot[] = [];

  // Chamfered sidewall + tread rubber tire revolved around +Y, then rotated so +Y becomes +X axle
  const tireProfile: V2[] = [
    [rimR * 0.98, -hw * 0.88],
    [r * 0.92, -hw],
    [r, -hw * 0.76],
    [r, hw * 0.76],
    [r * 0.92, hw],
    [rimR * 0.98, hw * 0.88]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(tireProfile, 22), { rot: [0, 0, -Math.PI * 0.5] }),
    materialIndex: opts.tireMat
  });

  // Alloy rim outer flanges + recessed barrel + center hub cap
  const rimProfile: V2[] = [
    [0, -hw * 0.55],
    [rimR * 0.99, -hw * 0.55],
    [rimR * 1.02, -hw * 0.86],
    [rimR * 0.92, -hw * 0.86],
    [rimR * 0.84, 0],
    [rimR * 0.92, hw * 0.86],
    [rimR * 1.02, hw * 0.86],
    [hubR * 1.15, hw * 0.62],
    [hubR, hw * 0.92],
    [0, hw * 0.94]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(rimProfile, 20), { rot: [0, 0, -Math.PI * 0.5] }),
    materialIndex: opts.rimMat
  });

  // Sculpted forged spokes on both outer (+X) and inner (-X) faces so left/right wheels both read crisply
  const spokeLen = rimR * 0.92 - hubR * 0.65;
  const spokeMid = (rimR * 0.92 + hubR * 0.65) * 0.5;
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < spokeCount; i += 1) {
      const ang = (i / spokeCount) * Math.PI * 2;
      const sy = Math.cos(ang) * spokeMid;
      const sz = Math.sin(ang) * spokeMid;
      slots.push({
        mesh: transformMesh(
          bevelBoxMesh(hw * 0.24, spokeLen, r * 0.095, r * 0.018),
          { pos: [side * hw * 0.72, sy, sz], rot: [ang, 0, 0] }
        ),
        materialIndex: opts.rimMat
      });
    }
  }

  if (opts.rotorMat !== undefined) {
    const rotorR = rimR * 0.74;
    const rotorProfile: V2[] = [
      [0, -hw * 0.16],
      [rotorR, -hw * 0.16],
      [rotorR, hw * 0.16],
      [0, hw * 0.16]
    ];
    slots.push({
      mesh: transformMesh(latheMesh(rotorProfile, 18), { rot: [0, 0, -Math.PI * 0.5] }),
      materialIndex: opts.rotorMat
    });
    // Performance brake caliper
    slots.push({
      mesh: transformMesh(
        bevelBoxMesh(hw * 0.52, rotorR * 0.52, rotorR * 0.34, r * 0.02),
        { pos: [0, rotorR * 0.56, -rotorR * 0.32], rot: [-0.45, 0, 0] }
      ),
      materialIndex: opts.rotorMat
    });
  }

  return slots;
}

/**
 * Open 4-chord structural steel lattice truss (`span = [wx, wy, wz]` centered at origin)
 * with collar frames and X-braced bays along its primary span axis.
 */
export function latticeTrussMesh(opts: {
  readonly span: V3;
  readonly bays: number;
  readonly chordRadius: number;
  readonly braceRadius?: number;
}): RawMesh {
  const [wx, wy, wz] = opts.span;
  const bays = Math.max(1, Math.floor(opts.bays));
  const cr = Math.max(0.008, opts.chordRadius);
  const br = Math.max(0.005, opts.braceRadius ?? cr * 0.62);

  // Pick longest axis as primary truss axis: 0 = X, 1 = Y, 2 = Z
  const primary: 0 | 1 | 2 = wx >= wy && wx >= wz ? 0 : wy >= wz ? 1 : 2;
  const len = opts.span[primary]!;
  const uAxis: 0 | 1 | 2 = primary === 0 ? 1 : 0;
  const vAxis: 0 | 1 | 2 = primary === 2 ? 1 : 2;
  const hu = Math.max(cr * 1.5, opts.span[uAxis]! * 0.5 - cr);
  const hv = Math.max(cr * 1.5, opts.span[vAxis]! * 0.5 - cr);
  const hLen = len * 0.5;

  const mkPt = (s: number, u: number, v: number, rad: number): V4 => {
    const p: [number, number, number] = [0, 0, 0];
    p[primary] = s;
    p[uAxis] = u;
    p[vAxis] = v;
    return [p[0], p[1], p[2], rad];
  };

  const parts: RawMesh[] = [];
  const corners: readonly [number, number][] = [
    [-hu, -hv],
    [hu, -hv],
    [hu, hv],
    [-hu, hv]
  ];

  // 4 longitudinal main chords
  for (const [cu, cv] of corners) {
    parts.push(tubeSweepMesh([mkPt(-hLen, cu, cv, cr), mkPt(hLen, cu, cv, cr)], 6, true));
  }

  // Bay collar struts + diagonal X-bracing on all 4 truss faces
  for (let b = 0; b <= bays; b += 1) {
    const s0 = -hLen + (b / bays) * len;
    for (let c = 0; c < 4; c += 1) {
      const [u0, v0] = corners[c]!;
      const [u1, v1] = corners[(c + 1) % 4]!;
      parts.push(tubeSweepMesh([mkPt(s0, u0, v0, br), mkPt(s0, u1, v1, br)], 5, true));
      if (b < bays) {
        const s1 = -hLen + ((b + 1) / bays) * len;
        parts.push(tubeSweepMesh([mkPt(s0, u0, v0, br * 0.88), mkPt(s1, u1, v1, br * 0.88)], 5, true));
        if (b % 2 === 0) {
          parts.push(tubeSweepMesh([mkPt(s1, u0, v0, br * 0.82), mkPt(s0, u1, v1, br * 0.82)], 5, true));
        }
      }
    }
  }

  return mergeRawMeshesToRaw(parts);
}

/**
 * Radial masonry archway in XY (`y >= 0`, depth along `Z`) composed of alternating
 * chamfered wedge voussoirs (`stoneMatA` / `stoneMatB`) and a proud crown keystone (`keystoneMat`).
 */
export function archwayVoussoirSlots(opts: {
  readonly radius: number;
  readonly thickness: number;
  readonly depth: number;
  readonly voussoirs?: number;
  readonly stoneMatA: number;
  readonly stoneMatB: number;
  readonly keystoneMat: number;
}): MultiMatSlot[] {
  const rIn = Math.max(0.1, opts.radius);
  const thick = Math.max(0.05, opts.thickness);
  const rOut = rIn + thick;
  const depth = Math.max(0.05, opts.depth);
  const rawCount = Math.max(5, Math.floor(opts.voussoirs ?? 9));
  const count = rawCount % 2 === 1 ? rawCount : rawCount + 1;
  const midIdx = Math.floor(count / 2);
  const slots: MultiMatSlot[] = [];

  for (let i = 0; i < count; i += 1) {
    const isKey = i === midIdx;
    const a0 = (i / count) * Math.PI + 0.008;
    const a1 = ((i + 1) / count) * Math.PI - 0.008;
    const ri = isKey ? rIn - thick * 0.08 : rIn;
    const ro = isKey ? rOut + thick * 0.16 : rOut;
    const d = isKey ? depth * 1.14 : depth;
    const poly: V2[] = [
      [Math.cos(a0) * ri, Math.sin(a0) * ri],
      [Math.cos(a0) * ro, Math.sin(a0) * ro],
      [Math.cos((a0 + a1) * 0.5) * ro, Math.sin((a0 + a1) * 0.5) * ro],
      [Math.cos(a1) * ro, Math.sin(a1) * ro],
      [Math.cos(a1) * ri, Math.sin(a1) * ri]
    ];
    slots.push({
      mesh: extrudePolygonMesh(poly, d, Math.min(thick, d) * 0.09, true),
      materialIndex: isKey ? opts.keystoneMat : i % 2 === 0 ? opts.stoneMatA : opts.stoneMatB
    });
  }

  return slots;
}

/**
 * Multi-puff stylized broadleaf / Ghibli foliage canopy (`9–14` smooth-shaded botanical leaf puffs
 * with crown-spherical upward-biased normals so sunlit foliage never shows dark faceted triangles).
 */
export function layeredCanopyMesh(opts: {
  readonly radius: number;
  readonly height: number;
  readonly puffs?: number;
  readonly seed?: number;
}): RawMesh {
  const r = Math.max(0.15, opts.radius);
  const h = Math.max(0.15, opts.height);
  const puffs = Math.max(7, Math.floor(opts.puffs ?? 11));
  const seed = opts.seed ?? 11;
  const parts: RawMesh[] = [];

  // Lush smooth central crown billow
  parts.push(
    transformMesh(icosphereSmoothMesh(r * 0.66, 2, 0.08, seed, 0.36), {
      pos: [0, h * 0.66, 0],
      scale: [1.14, (h / r) * 0.58, 1.14]
    })
  );

  // Staggered lower & mid perimeter botanical bough puffs
  const ringCount = puffs - 1;
  const lowerTotal = Math.ceil(ringCount * 0.6);
  const upperTotal = Math.max(1, ringCount - lowerTotal);
  for (let i = 0; i < ringCount; i += 1) {
    const tier = i < lowerTotal ? 0 : 1;
    const idxInTier = tier === 0 ? i : i - lowerTotal;
    const tierTotal = tier === 0 ? lowerTotal : upperTotal;
    const jitter = (hash01(seed * 31 + i * 17) - 0.5) * 0.42;
    const ang = (idxInTier / tierTotal) * Math.PI * 2 + tier * 0.58 + jitter;
    const dist = r * (tier === 0 ? 0.54 : 0.36) * (0.9 + hash01(seed * 47 + i * 13) * 0.2);
    const puffR = r * (tier === 0 ? 0.52 : 0.46) * (0.92 + hash01(seed * 59 + i * 7) * 0.18);
    const py = h * (tier === 0 ? 0.38 : 0.6) + (hash01(seed * 71 + i * 19) - 0.5) * h * 0.09;
    parts.push(
      transformMesh(icosphereSmoothMesh(puffR, 1, 0.09, seed + i * 23, 0.34), {
        pos: [Math.cos(ang) * dist, py, Math.sin(ang) * dist],
        rot: [0, ang, 0],
        scale: [1.2, 0.72, 1.14]
      })
    );
  }

  const merged = mergeRawMeshesToRaw(parts);
  // Blend local puff normals with crown-spherical + sunlit upward bias for cohesive botanical shading
  const crownY = h * 0.42;
  for (let i = 0; i < merged.positions.length; i += 3) {
    const outDir = norm3([
      merged.positions[i]!,
      merged.positions[i + 1]! - crownY + r * 0.35,
      merged.positions[i + 2]!
    ]);
    const blended = norm3([
      merged.normals[i]! * 0.52 + outDir[0] * 0.48,
      merged.normals[i + 1]! * 0.52 + (outDir[1] + 0.28) * 0.48,
      merged.normals[i + 2]! * 0.52 + outDir[2] * 0.48
    ]);
    merged.normals[i] = blended[0];
    merged.normals[i + 1] = blended[1];
    merged.normals[i + 2] = blended[2];
  }
  return merged;
}

/**
 * Stacked scalloped drooping conifer / pine bough tiers from `y = 0` to `y = height`
 * with smooth botanical normals (eliminates harsh dark faceted pine wedges).
 */
export function coniferBoughTierMesh(opts: {
  readonly baseRadius: number;
  readonly height: number;
  readonly tiers?: number;
  readonly seed?: number;
}): RawMesh {
  const baseR = Math.max(0.12, opts.baseRadius);
  const h = Math.max(0.25, opts.height);
  const tiers = Math.max(4, Math.floor(opts.tiers ?? 5));
  const seed = opts.seed ?? 29;
  const parts: RawMesh[] = [];

  for (let t = 0; t < tiers; t += 1) {
    const frac = t / tiers;
    const nextFrac = (t + 1) / tiers;
    const yBase = frac * h * 0.8;
    const yApex = Math.min(h, (frac * 0.76 + 0.36) * h);
    const tierR = baseR * (1 - frac * 0.7);
    const topR = t === tiers - 1 ? 0.015 : baseR * (1 - nextFrac * 0.8) * 0.4;
    const lobes = Math.max(7, 10 - Math.floor(frac * 3));
    const pts = lobes * 2;
    const phase = hash01(seed + t * 37) * Math.PI * 2;

    const ringSkirt: V3[] = [];
    const ringBot: V3[] = [];
    const ringMid: V3[] = [];
    const ringTop: V3[] = [];
    for (let i = 0; i < pts; i += 1) {
      const a = (i / pts) * Math.PI * 2 + phase;
      const isTip = i % 2 === 0;
      const scallop = isTip ? 1.08 : 0.78;
      const droop = isTip ? -h * 0.032 : h * 0.016;
      const r0 = tierR * scallop * (0.95 + hash01(seed * 19 + t * 41 + i * 7) * 0.1);
      const rSkirt = r0 * 0.86;
      const r1 = (tierR * 0.56 + topR * 0.44) * (isTip ? 0.98 : 0.86);
      ringSkirt.push([Math.cos(a) * rSkirt, yBase + droop - h * 0.018, Math.sin(a) * rSkirt]);
      ringBot.push([Math.cos(a) * r0, yBase + droop, Math.sin(a) * r0]);
      ringMid.push([Math.cos(a) * r1, (yBase + yApex) * 0.54, Math.sin(a) * r1]);
      ringTop.push([Math.cos(a) * Math.max(0.015, topR), yApex, Math.sin(a) * Math.max(0.015, topR)]);
    }
    parts.push(loftSectionsMesh([ringSkirt, ringBot, ringMid, ringTop], true, false));
  }

  const merged = mergeRawMeshesToRaw(parts);
  for (let i = 0; i < merged.normals.length; i += 3) {
    const n = norm3([merged.normals[i]!, merged.normals[i + 1]! + 0.32, merged.normals[i + 2]!]);
    merged.normals[i] = n[0];
    merged.normals[i + 1] = n[1];
    merged.normals[i + 2] = n[2];
  }
  return merged;
}

/**
 * Terraced, `fbm3`-faceted sedimentary cliff / mesa / coastal headland (`y in [0, height]`),
 * designed to pair directly with `material.strata(...)`.
 */
export function stratifiedCliffMesh(opts: {
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly height: number;
  readonly terraces?: number;
  readonly seed?: number;
}): RawMesh {
  const rx = Math.max(0.2, opts.radiusX);
  const rz = Math.max(0.2, opts.radiusZ);
  const h = Math.max(0.2, opts.height);
  const terraces = Math.max(3, Math.floor(opts.terraces ?? 5));
  const seed = opts.seed ?? 17;
  const radialSegs = 16;

  const sections: V3[][] = [];
  const totalRings = terraces * 2;
  for (let rIdx = 0; rIdx <= totalRings; rIdx += 1) {
    const t = rIdx / totalRings;
    const stepIdx = Math.floor(rIdx / 2);
    const isLedgeTop = rIdx % 2 === 1 && rIdx < totalRings;
    const yFrac = isLedgeTop
      ? (stepIdx + 0.86) / terraces
      : Math.min(1, stepIdx / terraces + (rIdx === totalRings ? 0 : 0.04));
    const taper = 1 - Math.pow(t, 1.35) * 0.36 - (isLedgeTop ? 0.04 : 0);
    const ring: V3[] = [];
    for (let i = 0; i < radialSegs; i += 1) {
      const a = (i / radialSegs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const n = fbm3(ca * 1.65 + 2.3, yFrac * 2.4, sa * 1.65 - 1.9, seed);
      const crag = 0.78 + n * 0.44;
      ring.push([
        ca * rx * taper * crag,
        yFrac * h,
        sa * rz * taper * crag
      ]);
    }
    sections.push(ring);
  }

  return loftSectionsMesh(sections, true, true);
}

/** Radial resolution of the folk torso loft, collar, belt and neck (24 keeps silhouettes round at close crops). */
const FOLK_TORSO_RING = 24;

/**
 * Sculpted articulated human townsperson / spectator / caddie (`y = 0..height`, default `1.72 m`)
 * with tailored flared coat/jacket, scarf/collar, neck & head, hat/coiffed hair, two bent arms
 * with hands, two distinct legs, shoes, and optional satchel — eliminates "bowling-pin" pegs.
 */
export function articulatedFolkSlots(opts: {
  readonly height?: number;
  readonly coatMat: number;
  readonly trimMat: number;
  readonly skinMat: number;
  readonly hairHatMat: number;
  readonly trouserMat: number;
  readonly shoeMat?: number;
  readonly bagMat?: number;
  readonly wearingHat?: boolean;
  readonly seed?: number;
}): MultiMatSlot[] {
  const h = opts.height ?? 1.72;
  const s = h / 1.72;
  const seed = opts.seed ?? 7;
  const shoeMat = opts.shoeMat ?? opts.trouserMat;
  const slots: MultiMatSlot[] = [];

  // Two distinct legs + tailored shoes
  for (const side of [-1, 1] as const) {
    const lx = side * 0.095 * s;
    const stride = side * (hash01(seed * 13 + 3) - 0.5) * 0.07 * s;
    slots.push({
      mesh: tubeSweepMesh(
        [
          [lx, 0.07 * s, stride, 0.056 * s],
          [lx * 1.02, 0.42 * s, stride * 0.5, 0.068 * s],
          [lx * 0.96, 0.78 * s, 0, 0.078 * s]
        ],
        16
      ),
      materialIndex: opts.trouserMat
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.095 * s, 0.075 * s, 0.21 * s, 0.024 * s), {
        pos: [lx, 0.038 * s, stride + 0.035 * s]
      }),
      materialIndex: shoeMat
    });
  }

  // Sculpted elliptical-lofted tailored coat / athletic jacket (`y = 0.62..1.34`)
  const mkTorsoRing = (y: number, rx: number, rz: number, zShift = 0): V3[] => {
    const ring: V3[] = [];
    for (let i = 0; i < FOLK_TORSO_RING; i += 1) {
      const a = (i / FOLK_TORSO_RING) * Math.PI * 2;
      ring.push([Math.cos(a) * rx * s, y * s, (Math.sin(a) * rz + zShift) * s]);
    }
    return ring;
  };
  slots.push({
    mesh: taubinSmoothMesh(loftSectionsMesh([
      mkTorsoRing(0.62, 0.21, 0.145, -0.01),
      mkTorsoRing(0.86, 0.175, 0.12, 0),
      mkTorsoRing(1.12, 0.205, 0.135, 0.008),
      mkTorsoRing(1.31, 0.225, 0.13, 0.005),
      mkTorsoRing(1.36, 0.13, 0.095, 0)
    ], true), 2),
    materialIndex: opts.coatMat
  });

  // Cozy scarf / collar ring + belt trim
  slots.push({
    mesh: transformMesh(latheMesh([[0.085 * s, 0], [0.135 * s, 0.025 * s], [0.132 * s, 0.075 * s], [0.09 * s, 0.095 * s]], FOLK_TORSO_RING), {
      pos: [0, 1.32 * s, 0.005 * s]
    }),
    materialIndex: opts.trimMat
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0.176 * s, 0], [0.184 * s, 0.02 * s], [0.184 * s, 0.048 * s], [0.176 * s, 0.06 * s]], FOLK_TORSO_RING), {
      pos: [0, 0.87 * s, 0]
    }),
    materialIndex: opts.trimMat
  });

  // Two articulated bent arms (shoulder -> elbow -> cuff) + sculpted hands
  const leftSwing = (hash01(seed * 29 + 5) - 0.35) * 0.18;
  const rightSwing = (hash01(seed * 41 + 9) - 0.35) * 0.22;
  for (const side of [-1, 1] as const) {
    const swing = side < 0 ? leftSwing : rightSwing;
    const sx = side * 0.225 * s;
    const ex = side * 0.265 * s;
    const hx = side * 0.22 * s;
    const hz = (0.09 + swing * 0.45) * s;
    slots.push({
      mesh: tubeSweepMesh(
        [
          [sx, 1.29 * s, 0, 0.058 * s],
          [ex, 1.03 * s, swing * 0.15 * s, 0.052 * s],
          [hx, 0.83 * s, hz, 0.046 * s]
        ],
        14
      ),
      materialIndex: opts.coatMat
    });
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.042 * s, 2, 0.02, seed + side), {
        pos: [hx, 0.795 * s, hz + 0.015 * s],
        scale: [0.88, 1.08, 1.05]
      }),
      materialIndex: opts.skinMat
    });
  }

  // Sculpted neck + appealing stylized head with jaw taper, brow & nose bridge
  slots.push({
    mesh: transformMesh(latheMesh([[0.058 * s, 0], [0.052 * s, 0.095 * s], [0, 0.105 * s]], FOLK_TORSO_RING), {
      pos: [0, 1.38 * s, 0.005 * s]
    }),
    materialIndex: opts.skinMat
  });
  slots.push({
    mesh: transformMesh(sculptStylizedHeadMesh(0.112 * s, { jawTaper: 0.22, noseBridge: 0.16, seed: seed + 11 }), {
      pos: [0, 1.545 * s, 0.012 * s]
    }),
    materialIndex: opts.skinMat
  });

  // Brimmed fedora / trilby / wool cap OR sculpted hair crown
  if (opts.wearingHat ?? (hash01(seed * 53) > 0.42)) {
    slots.push({
      mesh: transformMesh(
        latheMesh(
          [
            [0.108 * s, 0],
            [0.185 * s, 0.008 * s],
            [0.182 * s, 0.024 * s],
            [0.116 * s, 0.032 * s],
            [0.108 * s, 0.115 * s],
            [0.075 * s, 0.138 * s],
            [0, 0.142 * s]
          ],
          18
        ),
        { pos: [0, 1.605 * s, 0.006 * s], rot: [-0.06, 0, (hash01(seed * 61) - 0.5) * 0.08] }
      ),
      materialIndex: opts.hairHatMat
    });
  } else {
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.118 * s, 2, 0.05, seed + 31), {
        pos: [0, 1.575 * s, -0.008 * s],
        scale: [0.96, 0.94, 1.04]
      }),
      materialIndex: opts.hairHatMat
    });
  }

  // Optional side satchel / briefcase
  if (opts.bagMat !== undefined) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.085 * s, 0.22 * s, 0.28 * s, 0.022 * s), {
        pos: [0.245 * s, 0.72 * s, 0.04 * s],
        rot: [0.05, 0, -0.08]
      }),
      materialIndex: opts.bagMat
    });
  }

  return slots;
}
