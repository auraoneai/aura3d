/**
 * Sculpted Multi-Material Procedural 3D Models for Splat (`WP-20`).
 *
 * Replaces all static backdrop & pickup `.glb` assets with multi-material
 * Designer Toy & Art-Studio assemblies built strictly on `@aura3d/engine` 5.5.1
 * (`geometry.multiMaterial`, `geometry.custom`, `group`, physical `material.*`)
 * and `apps/showcase-port-shared/proceduralKernel.ts` — zero `three` imports.
 */
import {
  geometry,
  group,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec
} from "@aura3d/engine";
import {
  bezierCurve2,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  deformMesh,
  extrudePolygonMesh,
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  sminPoly,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type TransformOpts,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import type { MeshData } from "../meshes";
import type { Powerup } from "../sim";

export type BackdropPieceVariant =
  | "islandTree"
  | "islandTower"
  | "balloon"
  | "paintPotIsland"
  | "paletteIsland"
  | "easelIsland";

const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  delete (spec as { name?: string }).name;
  return spec;
};

// ---------------------------------------------------------------------------
// Physical Studio & Designer-Toy Material Palette (9 distinct `material.*` factories)
// ---------------------------------------------------------------------------

export const MAT = {
  cliffLimestone: 0,
  cliffOchre: 1,
  soilTurf: 2,
  beechTimber: 3,
  corkStopper: 4,
  linenCanvas: 5,
  wickerWeave: 6,
  brushedAluminum: 7,
  steelTruss: 8,
  turnedBrass: 9,
  chromeBucket: 10,
  ebonyLacquer: 11,
  cobaltLacquer: 12,
  rubberHose: 13,
  paintVermilion: 14,
  paintCobalt: 15,
  paintCadmium: 16,
  paintMagenta: 17,
  paintMint: 18,
  paintViolet: 19,
  paintIvory: 20,
  practicalWarmGlow: 21,
  practicalCyanGlow: 22,
  pilotSkin: 23,
  pilotSmockCloth: 24
} as const;

export const STUDIO_MATERIALS: readonly AuraMaterialSpec[] = [
  // 0..1: Glazed ceramic / sun-baked limestone & ochre island crag ledges
  unnamed(material.ceramic({ color: "#e8dcc8", roughness: 0.62, clearcoat: 0.16, clearcoatRoughness: 0.38 })),
  unnamed(material.ceramic({ color: "#d59b6a", roughness: 0.68, clearcoat: 0.12, clearcoatRoughness: 0.44 })),
  // 2: Dark studio planter soil / mossy rim
  unnamed(material.pbr({ color: "#4d6b4a", roughness: 0.88, metallic: 0.02 })),
  // 3..4: Seasoned beechwood studio timber & natural apothecary cork
  unnamed(material.physical({
    color: "#c89258",
    roughness: 0.46,
    metallic: 0.02,
    clearcoat: 0.24,
    clearcoatRoughness: 0.28,
    normal: material.proceduralTextures.fabric({ scale: 26, strength: 0.22, contrast: 0.52 })
  })),
  unnamed(material.physical({
    color: "#b98552",
    roughness: 0.84,
    metallic: 0,
    normal: material.proceduralTextures.rubber({ scale: 30, strength: 0.36, contrast: 0.65 })
  })),
  // 5..6: Stretched natural linen studio canvas & woven balloon wicker
  unnamed(material.fabric({ color: "#f6efe2", roughness: 0.88, sheen: 0.48, sheenColor: "#fffaf0" })),
  unnamed(material.fabric({ color: "#a67342", roughness: 0.9, sheen: 0.34, sheenColor: "#dfb483" })),
  // 7..8: Anisotropic crimped aluminum tubes & structural skylight truss steel
  unnamed(material.brushedMetal({ color: "#dde5ee", roughness: 0.24, anisotropy: 0.84 })),
  unnamed(material.brushedMetal({ color: "#526071", roughness: 0.34, anisotropy: 0.72 })),
  // 9..10: Smooth turned brass ferrules/bezels & mirror-polished paint bucket
  unnamed(material.studioMetal({ color: "#e6b95c", roughness: 0.18 })),
  unnamed(material.studioMetal({ color: "#eef3f9", roughness: 0.12 })),
  // 11..12: Satin-lacquered artist brush handles & easel hardware
  unnamed(material.lacquer({ color: "#2b2133", roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.04 })),
  unnamed(material.lacquer({ color: "#2658a8", roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03 })),
  // 13: Vulcanized rubber isolator feet & braided compressor hose
  unnamed(material.pbr({
    color: "#22252d",
    roughness: 0.86,
    metallic: 0.04,
    normal: material.proceduralTextures.rubber({ scale: 28, strength: 0.4, contrast: 0.75 })
  })),
  // 14..20: Vivid Designer Toy & impasto pigments (roughness 0.24..0.28, metalness <= 0.04; zero non-practical emissive fill)
  unnamed(material.clearcoatPaint({ color: "#f0483e", roughness: 0.26, metallic: 0.02, clearcoat: 0.48, clearcoatRoughness: 0.16 })),
  unnamed(material.clearcoatPaint({ color: "#3298f0", roughness: 0.26, metallic: 0.02, clearcoat: 0.48, clearcoatRoughness: 0.16 })),
  unnamed(material.clearcoatPaint({ color: "#f8bf2c", roughness: 0.26, metallic: 0.02, clearcoat: 0.48, clearcoatRoughness: 0.16 })),
  unnamed(material.clearcoatPaint({ color: "#e6499b", roughness: 0.26, metallic: 0.02, clearcoat: 0.48, clearcoatRoughness: 0.16 })),
  unnamed(material.clearcoatPaint({ color: "#39cf9a", roughness: 0.26, metallic: 0.02, clearcoat: 0.48, clearcoatRoughness: 0.16 })),
  unnamed(material.clearcoatPaint({ color: "#9c5cf2", roughness: 0.26, metallic: 0.02, clearcoat: 0.48, clearcoatRoughness: 0.16 })),
  unnamed(material.clearcoatPaint({ color: "#faf6ee", roughness: 0.28, metallic: 0.02, clearcoat: 0.44, clearcoatRoughness: 0.18 })),
  // 21..22: Practical studio luminaires, burner coils & pickup cores (`practical: true`)
  unnamed(material.emissive({ color: "#fff2d6", emissive: "#ffbe6b", emissiveIntensity: 2.2, roughness: 0.18, practical: true })),
  unnamed(material.emissive({ color: "#e4fbff", emissive: "#6ee7ff", emissiveIntensity: 2.0, roughness: 0.16, practical: true })),
  // 23..24: Matte organic pilot skin & woven smock cloth (`clearcoat: 0` so organic surfaces never show clearcoat streaks)
  unnamed(material.pbr({ color: "#ffe4cf", roughness: 0.68, metallic: 0, clearcoat: 0, sheen: 0.24, sheenColor: "#fff3ea" })),
  unnamed(material.fabric({ color: "#39cf9a", roughness: 0.82, sheen: 0.42, sheenColor: "#dcfff2" }))
];

/** Translucent apothecary pigment jar & sawtooth studio skylight glazing (`castShadow: false`). */
export const STUDIO_GLASS_MATERIAL: AuraMaterialSpec = unnamed(
  material.physical({
    color: "#d6f2ff",
    roughness: 0.04,
    opacity: 0.45,
    clearcoat: 1,
    ior: 1.52
  })
);

interface StudioAssembly {
  readonly slots: MultiMatSlot[];
  readonly glassMeshes: RawMesh[];
}

function transformSlots(slots: readonly MultiMatSlot[], opts: TransformOpts): MultiMatSlot[] {
  return slots.map((s) => ({ mesh: transformMesh(s.mesh, opts), materialIndex: s.materialIndex }));
}

function transformAssembly(src: StudioAssembly, opts: TransformOpts): StudioAssembly {
  return {
    slots: transformSlots(src.slots, opts),
    glassMeshes: src.glassMeshes.map((m) => transformMesh(m, opts))
  };
}

function appendAssembly(dst: { slots: MultiMatSlot[]; glassMeshes: RawMesh[] }, src: StudioAssembly, opts?: TransformOpts): void {
  const next = opts ? transformAssembly(src, opts) : src;
  for (const s of next.slots) dst.slots.push(s);
  for (const g of next.glassMeshes) dst.glassMeshes.push(g);
}

/**
 * Normalizes an assembly in-place so its union bounding box has max axis span = `targetMaxDimension`
 * at unit node scale (`updateBackdrop` drives root `.setScale(fade)` every frame).
 */
function normalizeAssembly(
  src: StudioAssembly,
  targetMaxDimension: number,
  anchor: "center" | "waist"
): StudioAssembly {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const visit = (m: RawMesh): void => {
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  };
  for (const s of src.slots) visit(s.mesh);
  for (const g of src.glassMeshes) visit(g);
  const span = Math.max(1e-4, maxX - minX, maxY - minY, maxZ - minZ);
  const k = targetMaxDimension / span;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const cy = anchor === "waist" ? minY + (maxY - minY) * 0.42 : (minY + maxY) * 0.5;
  const remap = (m: RawMesh): RawMesh => {
    const positions = new Array<number>(m.positions.length);
    for (let i = 0; i < m.positions.length; i += 3) {
      positions[i] = (m.positions[i]! - cx) * k;
      positions[i + 1] = (m.positions[i + 1]! - cy) * k;
      positions[i + 2] = (m.positions[i + 2]! - cz) * k;
    }
    return { positions, normals: m.normals.slice(), uvs: m.uvs.slice(), indices: m.indices.slice() };
  };
  return {
    slots: src.slots.map((s) => ({ mesh: remap(s.mesh), materialIndex: s.materialIndex })),
    glassMeshes: src.glassMeshes.map(remap)
  };
}

// ---------------------------------------------------------------------------
// Reusable Designer Toy & Art-Studio Sub-Assemblies
// ---------------------------------------------------------------------------

/** Floating terraced limestone/ochre crag island crowned with a beechwood studio deck (`y = 0` deck top). */
function floatingStudioBaseSlots(seed: number, rx = 2.5, rz = 2.35, depth = 2.4): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Smoothed inverted terraced crag hanging beneath y = 0
  slots.push({
    mesh: transformMesh(
      subdivideSmoothMesh(stratifiedCliffMesh({ radiusX: rx, radiusZ: rz, height: depth * 0.78, terraces: 6, seed }), 1, 0.36),
      { pos: [0, -0.06, 0], rot: [Math.PI, 0, 0] }
    ),
    materialIndex: MAT.cliffLimestone
  });
  slots.push({
    mesh: transformMesh(
      subdivideSmoothMesh(stratifiedCliffMesh({ radiusX: rx * 0.56, radiusZ: rz * 0.54, height: depth * 0.52, terraces: 4, seed: seed + 19 }), 1, 0.36),
      { pos: [0.12, -depth * 0.54, -0.08], rot: [Math.PI, 0.4, 0] }
    ),
    materialIndex: MAT.cliffOchre
  });
  // Smooth rounded mossy studio turf rim
  const turfProfile: V2[] = [
    [0, -0.15],
    [rx * 0.92, -0.15],
    [rx * 0.97, -0.09],
    [rx * 0.99, -0.02],
    [rx * 0.95, 0.04],
    [rx * 0.89, 0.065],
    [0, 0.065]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(turfProfile, 36), { scale: [1, 1, rz / rx] }),
    materialIndex: MAT.soilTurf
  });
  // Chamfered beechwood studio floorboards across the island crown
  const plankCount = 5;
  const deckSpanZ = rz * 1.42;
  const plankW = (deckSpanZ / plankCount) * 0.9;
  for (let i = 0; i < plankCount; i += 1) {
    const z = -deckSpanZ * 0.5 + ((i + 0.5) / plankCount) * deckSpanZ;
    const arch = Math.sqrt(Math.max(0.2, 1 - Math.pow(z / (rz * 0.95), 2)));
    const lenX = rx * 1.56 * arch;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(lenX, 0.1, plankW, 0.024), { pos: [0, 0.09, z] }),
      materialIndex: MAT.beechTimber
    });
  }
  // Turned brass deck corner studs
  const studProfile: V2[] = [[0, 0], [0.09, 0], [0.09, 0.05], [0.055, 0.08], [0, 0.085]];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    slots.push({
      mesh: transformMesh(latheMesh(studProfile, 20), { pos: [sx * rx * 0.52, 0.13, sz * rz * 0.48] }),
      materialIndex: MAT.turnedBrass
    });
  }
  return slots;
}

/**
 * Crimped aluminum artist paint tube (`y = 0..1.72`):
 * `loftSectionsMesh` flattened tail -> elliptical waist -> round barrel -> conical shoulder,
 * folded crimp bar, threaded brass nozzle, ribbed cap, and optional S-curved extruded pigment ribbon.
 */
function paintTubeSlots(pigmentMat: number, withRibbon = true): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const ringPts = 28;
  const specRows: readonly { y: number; rx: number; rz: number }[] = [
    { y: 0.08, rx: 0.46, rz: 0.032 },
    { y: 0.34, rx: 0.43, rz: 0.11 },
    { y: 0.68, rx: 0.38, rz: 0.24 },
    { y: 1.04, rx: 0.34, rz: 0.32 },
    { y: 1.38, rx: 0.32, rz: 0.32 },
    { y: 1.56, rx: 0.12, rz: 0.12 }
  ];
  const tubeRings: V3[][] = specRows.map(({ y, rx, rz }) =>
    Array.from({ length: ringPts }, (_, i): V3 => {
      const a = (i / ringPts) * Math.PI * 2;
      return [Math.cos(a) * rx, y, Math.sin(a) * rz];
    })
  );
  slots.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(tubeRings, true, false), 1, 0.42), materialIndex: MAT.brushedAluminum });

  // Glossy pigment label band lofted proud of the mid-barrel
  const bandRows: readonly { y: number; rx: number; rz: number }[] = [
    { y: 0.78, rx: 0.376, rz: 0.275 },
    { y: 1.06, rx: 0.348, rz: 0.328 },
    { y: 1.3, rx: 0.332, rz: 0.332 }
  ];
  const bandRings: V3[][] = bandRows.map(({ y, rx, rz }) =>
    Array.from({ length: ringPts }, (_, i): V3 => {
      const a = (i / ringPts) * Math.PI * 2;
      return [Math.cos(a) * rx, y, Math.sin(a) * rz];
    })
  );
  slots.push({ mesh: loftSectionsMesh(bandRings, false, false), materialIndex: pigmentMat });

  // Folded & stamped tail crimp seam
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.96, 0.11, 0.085, 0.02), { pos: [0, 0.055, 0] }),
    materialIndex: MAT.brushedAluminum
  });

  // Threaded brass nozzle neck
  const neckProfile: V2[] = [
    [0, 1.54], [0.125, 1.54], [0.125, 1.62], [0.105, 1.64],
    [0.12, 1.67], [0.1, 1.71], [0.085, 1.74], [0, 1.74]
  ];
  slots.push({ mesh: latheMesh(neckProfile, 28), materialIndex: MAT.turnedBrass });

  // Fluted Designer-Toy cap (either screwed on or resting beside the open nozzle)
  const capFlutes = 28;
  const capRing: V2[] = Array.from({ length: capFlutes }, (_, i): V2 => {
    const a = (i / capFlutes) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.155 : 0.136;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const capMesh = transformMesh(extrudePolygonMesh(capRing, 0.22, 0.025, false), { rot: [Math.PI * 0.5, 0, 0] });
  if (withRibbon) {
    slots.push({
      mesh: transformMesh(capMesh, { pos: [0.46, 0.12, 0.36], rot: [0.35, 0.4, 0.2] }),
      materialIndex: MAT.paintIvory
    });
    const curvePts = catmullRomSpline3(
      [
        [0, 1.73, 0],
        [0.08, 1.88, 0.18],
        [0.24, 1.62, 0.46],
        [0.14, 1.18, 0.72],
        [0.36, 0.78, 0.96],
        [0.58, 0.54, 1.18]
      ],
      10
    );
    const ribbonSpine: V4[] = curvePts.map((p, idx) => {
      const t = idx / Math.max(1, curvePts.length - 1);
      const rad = 0.075 + Math.sin(t * Math.PI) * 0.045 * (1 - t * 0.35);
      return [p[0], p[1], p[2], rad];
    });
    slots.push({ mesh: tubeSweepMesh(ribbonSpine, 18), materialIndex: pigmentMat });
  } else {
    slots.push({ mesh: transformMesh(capMesh, { pos: [0, 1.76, 0] }), materialIndex: MAT.paintIvory });
  }
  return slots;
}

/**
 * Apothecary glass pigment jar (`STUDIO_GLASS_MATERIAL` jar shell with `castShadow: false` +
 * inner glossy pigment fill + spun brass neck collar + tapered natural cork stopper).
 */
function pigmentJarAssembly(pigmentMat: number): StudioAssembly {
  const slots: MultiMatSlot[] = [];
  const glassMeshes: RawMesh[] = [];

  const jarWall = bezierCurve2([0.34, 0.06], [0.44, 0.32], [0.43, 0.76], [0.24, 0.94], 16);
  const jarProfile: V2[] = [
    [0, 0],
    [0.31, 0],
    ...jarWall,
    [0.23, 1.08],
    [0.27, 1.12],
    [0.27, 1.17],
    [0, 1.17]
  ];
  glassMeshes.push(latheMesh(jarProfile, 32));

  // Inner glossy pigment pool visible through translucent glass
  const fillProfile: V2[] = [
    [0, 0.06],
    [0.28, 0.06],
    [0.35, 0.34],
    [0.34, 0.68],
    [0.26, 0.74],
    [0, 0.71]
  ];
  slots.push({ mesh: latheMesh(fillProfile, 28), materialIndex: pigmentMat });

  // Spun brass collar ring + natural cork stopper
  const collarProfile: V2[] = [
    [0.22, 1.02], [0.285, 1.02], [0.285, 1.11], [0.22, 1.11]
  ];
  slots.push({ mesh: latheMesh(collarProfile, 28), materialIndex: MAT.turnedBrass });

  const corkProfile: V2[] = [
    [0, 1.09], [0.205, 1.09], [0.245, 1.32], [0.22, 1.35], [0, 1.35]
  ];
  slots.push({ mesh: latheMesh(corkProfile, 26), materialIndex: MAT.corkStopper });

  return { slots, glassMeshes };
}

/**
 * Turned wood-and-lacquer artist paintbrush (`y = 0..3.15`):
 * `latheMesh` swelled handle + double-beaded crimped brass ferrule + `loftSectionsMesh` bristle tuft & dipped tip.
 */
function paintbrushSlots(handleMat: number, tipMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const lowerGrip = bezierCurve2([0.032, 0.04], [0.065, 0.48], [0.145, 1.18], [0.118, 1.88], 16);
  const handleProfile: V2[] = [[0, 0], ...lowerGrip, [0.105, 2.04], [0, 2.04]];
  slots.push({ mesh: latheMesh(handleProfile, 26), materialIndex: handleMat });

  // Double-beaded crimped brass ferrule
  const ferruleProfile: V2[] = [
    [0, 2.02], [0.114, 2.02], [0.128, 2.06], [0.114, 2.1],
    [0.116, 2.34], [0.13, 2.38], [0.112, 2.42], [0.106, 2.52], [0, 2.52]
  ];
  slots.push({ mesh: latheMesh(ferruleProfile, 26), materialIndex: MAT.turnedBrass });

  // Sculpted hog-bristle belly tapering to a chisel edge, plus wet-pigment dipped tip
  const ringN = 22;
  const mkRing = (y: number, rx: number, rz: number): V3[] =>
    Array.from({ length: ringN }, (_, i): V3 => {
      const a = (i / ringN) * Math.PI * 2;
      return [Math.cos(a) * rx, y, Math.sin(a) * rz];
    });
  slots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh([
        mkRing(2.5, 0.104, 0.098),
        mkRing(2.68, 0.148, 0.088),
        mkRing(2.86, 0.136, 0.058)
      ], true, false),
      1,
      0.46
    ),
    materialIndex: MAT.linenCanvas
  });
  slots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh([
        mkRing(2.84, 0.138, 0.06),
        mkRing(3.02, 0.112, 0.032),
        mkRing(3.16, 0.068, 0.012)
      ], true, false),
      1,
      0.46
    ),
    materialIndex: tipMat
  });
  return slots;
}

/** Designer Toy aerosol spray can (`latheMesh` rolled aluminum body + clearcoat shoulder dome + actuator nozzle). */
function sprayCanSlots(domeMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const bodyProfile: V2[] = [
    [0, 0.02], [0.28, 0.02], [0.31, 0], [0.32, 0.06],
    [0.32, 1.18], [0.335, 1.21], [0.31, 1.24], [0, 1.24]
  ];
  slots.push({ mesh: latheMesh(bodyProfile, 30), materialIndex: MAT.brushedAluminum });

  // Color-coded glossy shoulder dome + wrap label
  const domeCurve = bezierCurve2([0.308, 1.23], [0.3, 1.38], [0.18, 1.48], [0.095, 1.5], 14);
  slots.push({
    mesh: latheMesh([[0, 0.42], [0.326, 0.42], [0.326, 0.96], [0, 0.96]], 30),
    materialIndex: domeMat
  });
  slots.push({
    mesh: latheMesh([[0, 1.23], ...domeCurve, [0, 1.5]], 30),
    materialIndex: domeMat
  });

  // Brass valve cup + white actuator cap
  slots.push({
    mesh: latheMesh([[0, 1.49], [0.105, 1.49], [0.105, 1.55], [0.045, 1.56], [0, 1.56]], 24),
    materialIndex: MAT.turnedBrass
  });
  slots.push({
    mesh: latheMesh([[0, 1.55], [0.082, 1.55], [0.082, 1.68], [0.068, 1.7], [0, 1.7]], 24),
    materialIndex: MAT.paintIvory
  });
  return slots;
}

/** Studio airbrush compressor (`latheMesh` tank, finned cylinder head, brass gauge, coiled `tubeSweepMesh` hose). */
function airbrushCompressorSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const tankProfile: V2[] = [
    [0, -0.78], [0.22, -0.76], [0.38, -0.64], [0.42, -0.46],
    [0.42, 0.46], [0.38, 0.64], [0.22, 0.76], [0, 0.78]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(tankProfile, 32), { pos: [0, 0.56, 0], rot: [0, 0, Math.PI * 0.5] }),
    materialIndex: MAT.paintCobalt
  });

  // 4 vulcanized rubber isolator feet + saddle legs
  const footProfile: V2[] = [[0, 0], [0.12, 0], [0.1, 0.14], [0.07, 0.18], [0, 0.18]];
  for (const [fx, fz] of [[-0.44, -0.26], [0.44, -0.26], [0.44, 0.26], [-0.44, 0.26]] as const) {
    slots.push({ mesh: transformMesh(latheMesh(footProfile, 20), { pos: [fx, 0, fz] }), materialIndex: MAT.rubberHose });
  }

  // Finned aluminum piston head + carry handle
  for (let f = 0; f < 5; f += 1) {
    const y = 0.98 + f * 0.085;
    const w = f === 4 ? 0.44 : 0.38;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(w, 0.048, 0.36, 0.012), { pos: [-0.14, y, 0] }),
      materialIndex: MAT.brushedAluminum
    });
  }
  const handlePts = catmullRomSpline3([[-0.42, 1.38, 0], [-0.14, 1.58, 0], [0.24, 1.54, 0], [0.36, 0.96, 0]], 10);
  slots.push({
    mesh: tubeSweepMesh(handlePts.map((p): V4 => [p[0], p[1], p[2], 0.036]), 14),
    materialIndex: MAT.steelTruss
  });

  // Brass pressure regulator & illuminated dial face
  slots.push({
    mesh: transformMesh(latheMesh([[0, 0], [0.16, 0], [0.16, 0.11], [0, 0.11]], 26), { pos: [0.34, 1.12, 0.18], rot: [Math.PI * 0.5, 0, 0] }),
    materialIndex: MAT.turnedBrass
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, 0], [0.12, 0], [0.12, 0.03], [0, 0.03]], 26), { pos: [0.34, 1.12, 0.23], rot: [Math.PI * 0.5, 0, 0] }),
    materialIndex: MAT.practicalWarmGlow
  });

  // Coiled braided airbrush hose
  const coilCtrl: V3[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const ang = t * Math.PI * 5.2;
    coilCtrl.push([0.52 + t * 0.48 + Math.cos(ang) * 0.18, 0.96 - t * 0.72 + Math.sin(ang) * 0.1, 0.22 + Math.sin(ang) * 0.22]);
  }
  const hosePts = catmullRomSpline3(coilCtrl, 6);
  slots.push({
    mesh: tubeSweepMesh(hosePts.map((p): V4 => [p[0], p[1], p[2], 0.032]), 14),
    materialIndex: MAT.rubberHose
  });
  return slots;
}

/** Timber A-frame studio easel + stretched `material.fabric` linen canvas + glossy impasto strokes. */
function easelAndCanvasSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Splayed front stiles, rear kick-leg & central ratchet mast
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 3.6, 0.14, 0.022), { pos: [-0.62, 1.74, 0.18], rot: [-0.14, 0, -0.14] }), materialIndex: MAT.beechTimber });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 3.6, 0.14, 0.022), { pos: [0.62, 1.74, 0.18], rot: [-0.14, 0, 0.14] }), materialIndex: MAT.beechTimber });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 3.45, 0.14, 0.022), { pos: [0, 1.62, -0.78], rot: [0.36, 0, 0] }), materialIndex: MAT.beechTimber });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 3.85, 0.14, 0.024), { pos: [0, 1.92, 0.14], rot: [-0.14, 0, 0] }), materialIndex: MAT.beechTimber });
  // Grooved shelf tray & top clamp
  slots.push({ mesh: transformMesh(bevelBoxMesh(2.28, 0.16, 0.34, 0.025), { pos: [0, 1.18, 0.34], rot: [-0.14, 0, 0] }), materialIndex: MAT.beechTimber });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.46, 0.16, 0.26, 0.022), { pos: [0, 3.18, 0.02], rot: [-0.14, 0, 0] }), materialIndex: MAT.ebonyLacquer });
  slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.08, 0], [0.08, 0.12], [0, 0.12]], 12), { pos: [0, 3.18, 0.17], rot: [Math.PI * 0.5 - 0.14, 0, 0] }), materialIndex: MAT.turnedBrass });

  // Stretched linen canvas in timber stretcher frame (tilted -0.14 rad back onto easel)
  const canvasFrame: MultiMatSlot[] = [
    { mesh: bevelBoxMesh(2.14, 1.84, 0.12, 0.022), materialIndex: MAT.beechTimber },
    { mesh: transformMesh(bevelBoxMesh(1.98, 1.68, 0.06, 0.014), { pos: [0, 0, 0.05] }), materialIndex: MAT.linenCanvas },
    {
      mesh: transformMesh(
        extrudePolygonMesh([[-0.74, -0.32], [-0.18, -0.52], [0.58, -0.08], [0.76, 0.34], [0.18, 0.44], [-0.52, 0.14]], 0.065, 0.018),
        { pos: [-0.04, -0.06, 0.095] }
      ),
      materialIndex: MAT.paintVermilion
    },
    {
      mesh: transformMesh(
        extrudePolygonMesh([[-0.62, 0.18], [-0.08, 0.04], [0.64, 0.32], [0.46, 0.62], [-0.36, 0.54]], 0.07, 0.018),
        { pos: [0.06, 0.08, 0.11] }
      ),
      materialIndex: MAT.paintCobalt
    },
    {
      mesh: transformMesh(
        extrudePolygonMesh([[-0.22, -0.48], [0.42, -0.56], [0.72, -0.22], [0.24, -0.04], [-0.28, -0.18]], 0.075, 0.02),
        { pos: [0.12, -0.08, 0.12] }
      ),
      materialIndex: MAT.paintCadmium
    }
  ];
  for (const s of transformSlots(canvasFrame, { pos: [0, 2.18, 0.24], rot: [-0.14, 0, 0] })) slots.push(s);
  return slots;
}

/** Industrial sawtooth skylight truss rig (`latticeTrussMesh` + `STUDIO_GLASS_MATERIAL` glazing + practical luminaire). */
function skylightTrussAssembly(spanX = 3.6, height = 3.4): StudioAssembly {
  const slots: MultiMatSlot[] = [];
  const glassMeshes: RawMesh[] = [];
  // Vertical portal lattice columns + overhead cross-truss
  for (const sx of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(latticeTrussMesh({ span: [0.34, height, 0.34], bays: 5, chordRadius: 0.032 }), { pos: [sx * spanX * 0.44, height * 0.5, 0] }),
      materialIndex: MAT.steelTruss
    });
  }
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [spanX, 0.38, 0.46], bays: 6, chordRadius: 0.034 }), { pos: [0, height, 0] }),
    materialIndex: MAT.steelTruss
  });
  // Sawtooth skylight steel gable ends + translucent glass roof pane (`castShadow: false`)
  const gable: V2[] = [[-0.68, 0], [0.68, 0], [-0.22, 0.72]];
  for (const sx of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(gable, 0.06, 0.012, true), { pos: [sx * spanX * 0.42, height + 0.18, 0], rot: [0, Math.PI * 0.5, 0] }),
      materialIndex: MAT.steelTruss
    });
  }
  glassMeshes.push(
    transformMesh(bevelBoxMesh(spanX * 0.84, 0.045, 1.14, 0.01), { pos: [0, height + 0.52, 0.22], rot: [0.66, 0, 0] })
  );
  // Practical suspended studio daylight bar
  slots.push({
    mesh: transformMesh(bevelBoxMesh(spanX * 0.66, 0.09, 0.14, 0.02), { pos: [0, height - 0.26, 0] }),
    materialIndex: MAT.practicalWarmGlow
  });
  return { slots, glassMeshes };
}

function buildIslandTreeAssembly(): StudioAssembly {
  const out: { slots: MultiMatSlot[]; glassMeshes: RawMesh[] } = {
    slots: floatingStudioBaseSlots(31, 2.55, 2.4, 2.35),
    glassMeshes: []
  };
  // Sculpted S-curved bonsai studio tree trunk + branch + paint-splashed Ghibli canopy
  const trunkPts = catmullRomSpline3([[-0.35, 0.08, -0.15], [-0.52, 0.92, 0.05], [-0.22, 1.78, -0.12], [-0.38, 2.55, 0.08]], 10);
  out.slots.push({
    mesh: tubeSweepMesh(trunkPts.map((p, i): V4 => [p[0], p[1], p[2], 0.34 * (1 - (i / trunkPts.length) * 0.52)]), 18),
    materialIndex: MAT.beechTimber
  });
  out.slots.push({
    mesh: transformMesh(
      subdivideSmoothMesh(layeredCanopyMesh({ radius: 1.55, height: 1.48, puffs: 11, seed: 43 }), 1, 0.46),
      { pos: [-0.36, 2.15, 0.04] }
    ),
    materialIndex: MAT.paintMint
  });
  out.slots.push({
    mesh: transformMesh(icosphereSmoothMesh(0.46, 2, 0.06, 71, 0.4), { pos: [-0.88, 3.05, 0.36], scale: [1.15, 0.72, 1.05] }),
    materialIndex: MAT.paintMagenta
  });
  // Giant crimped vermilion artist paint tube + twin glass pigment jars on studio deck
  for (const s of transformSlots(paintTubeSlots(MAT.paintVermilion, true), { pos: [0.76, 0.14, -0.24], rot: [0.18, -0.55, -0.22], scale: 1.08 })) {
    out.slots.push(s);
  }
  appendAssembly(out, pigmentJarAssembly(MAT.paintCadmium), { pos: [0.92, 0.14, 0.92], scale: 0.78 });
  appendAssembly(out, pigmentJarAssembly(MAT.paintCobalt), { pos: [-1.18, 0.14, 0.86], scale: 0.68 });
  return out;
}

function buildIslandTowerAssembly(): StudioAssembly {
  const out: { slots: MultiMatSlot[]; glassMeshes: RawMesh[] } = {
    slots: floatingStudioBaseSlots(57, 2.65, 2.5, 2.5),
    glassMeshes: []
  };
  appendAssembly(out, skylightTrussAssembly(3.55, 3.45), { pos: [0, 0.14, -0.18] });
  for (const s of transformSlots(airbrushCompressorSlots(), { pos: [-0.62, 0.14, 0.24], rot: [0, 0.32, 0], scale: 0.96 })) {
    out.slots.push(s);
  }
  for (const s of transformSlots(sprayCanSlots(MAT.paintMagenta), { pos: [0.88, 0.14, 0.12], rot: [0, -0.4, 0], scale: 1.32 })) {
    out.slots.push(s);
  }
  for (const s of transformSlots(sprayCanSlots(MAT.paintCadmium), { pos: [1.28, 0.14, 0.82], rot: [0.08, 0.5, -0.12], scale: 0.92 })) {
    out.slots.push(s);
  }
  appendAssembly(out, pigmentJarAssembly(MAT.paintViolet), { pos: [-1.18, 0.14, -0.92], scale: 0.74 });
  return out;
}

function buildPaintPotIslandAssembly(): StudioAssembly {
  const out: { slots: MultiMatSlot[]; glassMeshes: RawMesh[] } = {
    slots: floatingStudioBaseSlots(89, 2.55, 2.45, 2.4),
    glassMeshes: []
  };
  // Steel gantry hoist cradling a tilted chrome studio paint bucket
  for (const sx of [-1, 1] as const) {
    out.slots.push({
      mesh: transformMesh(latticeTrussMesh({ span: [0.3, 2.75, 0.3], bays: 4, chordRadius: 0.028 }), { pos: [sx * 1.15, 1.48, -0.15] }),
      materialIndex: MAT.steelTruss
    });
  }
  out.slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [2.65, 0.3, 0.32], bays: 5, chordRadius: 0.028 }), { pos: [0, 2.86, -0.15] }),
    materialIndex: MAT.steelTruss
  });

  // Tilted ribbed chrome studio paint pot + turned brass lugs + curved wire bail handle + wet cobalt rim meniscus & drips
  const bucketProfile: V2[] = [
    [0, 0], [0.58, 0], [0.62, 0.06], [0.65, 0.44], [0.68, 0.46], [0.66, 0.50],
    [0.71, 0.94], [0.74, 0.97], [0.72, 1.01], [0.75, 1.38],
    [0.80, 1.42], [0.80, 1.49], [0.71, 1.49], [0.68, 1.32], [0, 1.32]
  ];
  const bucketGroup: MultiMatSlot[] = [
    { mesh: latheMesh(bucketProfile, 40), materialIndex: MAT.chromeBucket },
    { mesh: latheMesh([[0, 1.22], [0.69, 1.22], [0.72, 1.36], [0.42, 1.41], [0, 1.38]], 36), materialIndex: MAT.paintCobalt },
    { mesh: transformMesh(icosphereSmoothMesh(0.11, 2, 0, 17, 0.2), { pos: [-0.76, 1.36, 0] }), materialIndex: MAT.turnedBrass },
    { mesh: transformMesh(icosphereSmoothMesh(0.11, 2, 0, 19, 0.2), { pos: [0.76, 1.36, 0] }), materialIndex: MAT.turnedBrass }
  ];
  for (const ang of [-0.36, 0, 0.36] as const) {
    bucketGroup.push({
      mesh: tubeSweepMesh(
        [
          [Math.sin(ang) * 0.74, 1.46, Math.cos(ang) * 0.74, 0.072],
          [Math.sin(ang) * 0.765, 1.29, Math.cos(ang) * 0.765, 0.052],
          [Math.sin(ang) * 0.77, 1.09, Math.cos(ang) * 0.77, 0.044],
          [Math.sin(ang) * 0.76, 0.93, Math.cos(ang) * 0.76, 0.068],
          [Math.sin(ang) * 0.755, 0.87, Math.cos(ang) * 0.755, 0.02]
        ],
        16
      ),
      materialIndex: MAT.paintCobalt
    });
  }
  const bailPts = catmullRomSpline3([[-0.76, 1.38, 0], [-0.82, 1.95, -0.18], [0, 2.28, -0.25], [0.82, 1.95, -0.18], [0.76, 1.38, 0]], 10);
  bucketGroup.push({
    mesh: tubeSweepMesh(bailPts.map((p): V4 => [p[0], p[1], p[2], 0.036]), 18),
    materialIndex: MAT.turnedBrass
  });
  for (const s of transformSlots(bucketGroup, { pos: [0, 1.72, -0.08], rot: [0.98, 0, 0] })) out.slots.push(s);

  // Sweeping `loftSectionsMesh` + `subdivideSmoothMesh` glossy paint cascade pouring over the front island lip
  const cascadeRows: readonly { pos: V3; rx: number; rz: number }[] = [
    { pos: [0, 2.08, 0.72], rx: 0.44, rz: 0.13 },
    { pos: [0, 1.72, 0.98], rx: 0.52, rz: 0.14 },
    { pos: [0, 1.22, 1.32], rx: 0.64, rz: 0.16 },
    { pos: [0, 0.56, 1.6], rx: 0.74, rz: 0.17 },
    { pos: [0, -0.28, 1.78], rx: 0.65, rz: 0.16 },
    { pos: [0, -1.28, 1.86], rx: 0.38, rz: 0.12 }
  ];
  const cascadeRingPts = 22;
  const cascadeRings: V3[][] = cascadeRows.map(({ pos, rx, rz }, rIdx) =>
    Array.from({ length: cascadeRingPts }, (_, i): V3 => {
      const a = (i / cascadeRingPts) * Math.PI * 2;
      const wobble = 0.94 + Math.sin(a * 3 + rIdx * 0.8) * 0.06;
      return [pos[0] + Math.cos(a) * rx * wobble, pos[1] + Math.sin(a) * rz * 0.35, pos[2] + Math.sin(a) * rz];
    })
  );
  out.slots.push({
    mesh: subdivideSmoothMesh(loftSectionsMesh(cascadeRings, true, false), 1, 0.48),
    materialIndex: MAT.paintCobalt
  });

  for (const s of transformSlots(paintTubeSlots(MAT.paintCadmium, false), { pos: [-1.18, 0.14, 0.65], rot: [0.22, 0.5, 0.3], scale: 0.92 })) {
    out.slots.push(s);
  }
  appendAssembly(out, pigmentJarAssembly(MAT.paintVermilion), { pos: [1.15, 0.14, 0.62], scale: 0.78 });
  return out;
}

function buildPaletteIslandAssembly(): StudioAssembly {
  const out: { slots: MultiMatSlot[]; glassMeshes: RawMesh[] } = {
    slots: floatingStudioBaseSlots(113, 2.55, 2.4, 2.3),
    glassMeshes: []
  };
  // Sculpted smooth-curve kidney-shaped beechwood artist thumb-hole palette angled heroically toward the road
  const kidneyCtrl: V3[] = [
    [-1.65, -0.25, 0], [-1.32, -0.98, 0], [-0.45, -1.22, 0], [0.62, -1.14, 0],
    [1.48, -0.68, 0], [1.72, 0.14, 0], [1.34, 0.96, 0], [0.48, 1.24, 0],
    [-0.48, 1.12, 0], [-0.95, 0.68, 0], [-0.55, 0.34, 0], [-0.62, -0.06, 0], [-1.18, 0.12, 0],
    [-1.65, -0.25, 0]
  ];
  const kidneySmooth = catmullRomSpline3(kidneyCtrl, 4).slice(0, -1);
  const kidneyRing: V2[] = kidneySmooth.map((p): V2 => [p[0], p[1]]);
  const paletteSlots: MultiMatSlot[] = [
    { mesh: extrudePolygonMesh(kidneyRing, 0.16, 0.038, false), materialIndex: MAT.beechTimber },
    // Brass thumb-hole grommet bezel
    {
      mesh: transformMesh(latheMesh([[0.22, -0.1], [0.31, -0.1], [0.31, 0.1], [0.22, 0.1]], 28), { pos: [-0.88, 0.24, 0], rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: MAT.turnedBrass
    }
  ];
  const dollopMats = [MAT.paintVermilion, MAT.paintCadmium, MAT.paintMint, MAT.paintCobalt, MAT.paintViolet] as const;
  const dollopXY: readonly V2[] = [[-0.95, -0.66], [-0.08, -0.86], [0.88, -0.62], [1.18, 0.22], [0.36, 0.78]];
  const dollopProfile: V2[] = [[0, 0], [0.28, 0], [0.3, 0.08], [0.24, 0.18], [0.15, 0.28], [0.06, 0.33], [0, 0.35]];
  for (let i = 0; i < dollopMats.length; i += 1) {
    const [dx, dy] = dollopXY[i]!;
    paletteSlots.push({
      mesh: transformMesh(latheMesh(dollopProfile, 26), { pos: [dx, dy, 0.08], rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: dollopMats[i]!
    });
  }
  for (const s of transformSlots(paletteSlots, { pos: [-0.12, 1.55, 0.05], rot: [-0.48, 0.18, 0.08], scale: 1.08 })) {
    out.slots.push(s);
  }
  // Twin crossed giant artist paintbrushes + apothecary pigment jar
  for (const s of transformSlots(paintbrushSlots(MAT.ebonyLacquer, MAT.paintVermilion), { pos: [-0.85, 0.32, -0.35], rot: [0.22, 0.15, -0.58], scale: 1.12 })) {
    out.slots.push(s);
  }
  for (const s of transformSlots(paintbrushSlots(MAT.cobaltLacquer, MAT.paintCadmium), { pos: [0.88, 0.32, -0.28], rot: [0.18, -0.2, 0.54], scale: 1.08 })) {
    out.slots.push(s);
  }
  appendAssembly(out, pigmentJarAssembly(MAT.paintMagenta), { pos: [1.12, 0.14, 0.88], scale: 0.82 });
  return out;
}

function buildEaselIslandAssembly(): StudioAssembly {
  const out: { slots: MultiMatSlot[]; glassMeshes: RawMesh[] } = {
    slots: floatingStudioBaseSlots(139, 2.65, 2.5, 2.45),
    glassMeshes: []
  };
  for (const s of transformSlots(easelAndCanvasSlots(), { pos: [-0.15, 0.14, 0.06], scale: 0.96 })) {
    out.slots.push(s);
  }
  appendAssembly(out, skylightTrussAssembly(3.75, 4.05), { pos: [0, 0.14, -0.12] });
  for (const s of transformSlots(paintTubeSlots(MAT.paintCobalt, true), { pos: [1.05, 0.14, 0.42], rot: [0.14, -0.65, -0.18], scale: 0.94 })) {
    out.slots.push(s);
  }
  appendAssembly(out, pigmentJarAssembly(MAT.paintVermilion), { pos: [-1.22, 0.14, 0.78], scale: 0.78 });
  appendAssembly(out, pigmentJarAssembly(MAT.paintMint), { pos: [-0.72, 0.14, 1.08], scale: 0.64 });
  return out;
}

function buildBalloonAssembly(): StudioAssembly {
  const slots: MultiMatSlot[] = [];
  // 16-gore high-resolution polychrome clearcoat hot-air balloon envelope (`loftSectionsMesh` per smooth cushioned gore)
  const goreCount = 16;
  const envCurve = bezierCurve2([0.52, 1.45], [1.98, 2.35], [2.26, 4.45], [0.16, 5.46], 18);
  const goreMats = [MAT.paintVermilion, MAT.paintIvory, MAT.paintCobalt, MAT.paintCadmium, MAT.paintMagenta, MAT.paintMint] as const;
  for (let g = 0; g < goreCount; g += 1) {
    const a0 = (g / goreCount) * Math.PI * 2;
    const a1 = ((g + 1) / goreCount) * Math.PI * 2;
    const aMid = (a0 + a1) * 0.5;
    const sections: V3[][] = envCurve.map(([r, y]) => {
      const outerArc: V3[] = [];
      const arcSteps = 5;
      for (let s = 0; s <= arcSteps; s += 1) {
        const u = s / arcSteps;
        const a = a0 + (a1 - a0) * u;
        const cushion = 1 + 0.036 * Math.sin(u * Math.PI);
        outerArc.push([Math.cos(a) * r * cushion, y, Math.sin(a) * r * cushion]);
      }
      const rIn = Math.max(0.02, r * 0.9);
      outerArc.push([Math.cos(aMid) * rIn, y, Math.sin(aMid) * rIn]);
      return outerArc;
    });
    slots.push({
      mesh: subdivideSmoothMesh(loftSectionsMesh(sections, true, false), 1, 0.36),
      materialIndex: goreMats[g % goreMats.length]!
    });
  }

  // Spun brass throat skirt, crown cap & practical radiant burner coil
  slots.push({
    mesh: latheMesh([[0.46, 1.32], [0.59, 1.32], [0.59, 1.48], [0.46, 1.48]], 36),
    materialIndex: MAT.turnedBrass
  });
  slots.push({
    mesh: latheMesh([[0, 5.42], [0.44, 5.42], [0.3, 5.56], [0.14, 5.61], [0, 5.63]], 32),
    materialIndex: MAT.turnedBrass
  });
  slots.push({
    mesh: latheMesh([[0, 1.04], [0.22, 1.04], [0.26, 1.24], [0.16, 1.34], [0, 1.34]], 28),
    materialIndex: MAT.practicalWarmGlow
  });

  // 4 braided rigging cables down to Taubin-smoothed woven `material.fabric` studio wicker gondola
  for (const [cx, cz] of [[-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42]] as const) {
    slots.push({
      mesh: tubeSweepMesh([[cx * 0.92, 0.66, cz * 0.92, 0.024], [cx * 1.18, 1.42, cz * 1.18, 0.024]], 14),
      materialIndex: MAT.steelTruss
    });
  }
  slots.push({
    mesh: transformMesh(taubinSmoothMesh(bevelBoxMesh(0.96, 0.68, 0.96, 0.11), 3), { pos: [0, 0.34, 0] }),
    materialIndex: MAT.wickerWeave
  });
  slots.push({
    mesh: transformMesh(taubinSmoothMesh(bevelBoxMesh(1.06, 0.11, 1.06, 0.042), 3), { pos: [0, 0.68, 0] }),
    materialIndex: MAT.beechTimber
  });

  // Cheerful waving Paint-Sprite Gondola Pilot standing inside the basket (`y = 0.62..1.30`, inside envelope bounds)
  const pilotHead = taubinSmoothMesh(
    sculptStylizedHeadMesh(0.11, {
      jawTaper: 0.22,
      cheekFullness: 0.22,
      noseBridge: 0.12,
      browRidge: 0.07,
      subdivisions: 2,
      seed: 61
    }),
    2
  );
  const pilotVisor = taubinSmoothMesh(
    deformMesh(
      sculptStreamlinedHullMesh(0.11, 0.22, 0.068, {
        noseSharpness: 0.36,
        tailTaper: 0.5,
        canopyBulge: 0.24,
        undersideFlat: 0.34,
        stations: 11,
        ringPoints: 16
      }),
      ([x, y, z]) => [x, y + 0.008 * Math.cos((x / 0.12) * Math.PI * 0.5), z - 0.19 * x * x]
    ),
    3
  );
  const pilotSmock = sculptDrapedGarmentMesh(
    [
      { y: 0.62, rx: 0.13, rz: 0.11, folds: 6, foldAmp: 0.04, superellipseN: 2.2 },
      { y: 0.76, rx: 0.125, rz: 0.105, folds: 5, foldAmp: 0.03, superellipseN: 2.15 },
      { y: 0.90, rx: 0.105, rz: 0.09, folds: 4, foldAmp: 0.02, superellipseN: 2.1 },
      { y: 0.98, rx: 0.068, rz: 0.064, superellipseN: 2.0 }
    ],
    { ringPoints: 20, capEnds: true, smoothPasses: 3 }
  );
  slots.push(
    { mesh: pilotSmock, materialIndex: MAT.pilotSmockCloth },
    { mesh: transformMesh(pilotHead, { pos: [0, 1.09, 0.02] }), materialIndex: MAT.pilotSkin },
    { mesh: transformMesh(pilotVisor, { pos: [0, 1.105, 0.095] }), materialIndex: MAT.paintCobalt }
  );
  for (const sgn of [-1, 1] as const) {
    slots.push(
      {
        mesh: transformMesh(icosphereSmoothMesh(0.022, 1, 0, 71), {
          pos: [sgn * 0.038, 1.095, 0.116],
          scale: [0.95, 1.18, 0.55]
        }),
        materialIndex: MAT.ebonyLacquer
      },
      {
        mesh: sculptCurvedHairLockMesh({
          root: [sgn * 0.04, 1.16, 0.01],
          mid: [sgn * 0.13, 1.23, -0.06],
          tip: [sgn * 0.18, 1.06, -0.14],
          width: 0.068,
          thickness: 0.052,
          segments: 10,
          radialSegments: 10
        }),
        materialIndex: sgn < 0 ? MAT.paintMagenta : MAT.paintCadmium
      }
    );
  }
  slots.push(
    {
      mesh: sculptCurvedHairLockMesh({
        root: [0, 1.18, 0.02],
        mid: [0, 1.27, -0.07],
        tip: [0, 1.12, -0.17],
        width: 0.076,
        thickness: 0.056,
        segments: 10,
        radialSegments: 10
      }),
      materialIndex: MAT.paintVermilion
    },
    {
      mesh: sculptAnatomicalLimbMesh(
        [
          { pos: [-0.11, 0.93, 0.02], rx: 0.038, rz: 0.038 },
          { pos: [-0.18, 0.82, 0.10], rx: 0.032, rz: 0.032 },
          { pos: [-0.21, 0.72, 0.22], rx: 0.028, rz: 0.028 }
        ],
        { ringPoints: 14, capEnds: true }
      ),
      materialIndex: MAT.paintMint
    },
    {
      mesh: sculptAnatomicalLimbMesh(
        [
          { pos: [0.11, 0.93, 0.02], rx: 0.038, rz: 0.038 },
          { pos: [0.22, 1.06, 0.08], rx: 0.032, rz: 0.032 },
          { pos: [0.28, 1.22, 0.14], rx: 0.03, rz: 0.03 }
        ],
        { ringPoints: 14, capEnds: true }
      ),
      materialIndex: MAT.paintMint
    }
  );

  // Miniature paint tubes & spray cans hung around the gondola rim
  const rimMats = [MAT.paintVermilion, MAT.paintCobalt, MAT.paintCadmium, MAT.paintMagenta] as const;
  for (let i = 0; i < 4; i += 1) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    for (const s of transformSlots(sprayCanSlots(rimMats[i]!), {
      pos: [Math.cos(ang) * 0.62, 0.16, Math.sin(ang) * 0.62],
      rot: [0, -ang, 0.14],
      scale: 0.34
    })) {
      slots.push(s);
    }
  }
  return { slots, glassMeshes: [] };
}

// ---------------------------------------------------------------------------
// Sculpted Multi-Material Power-Up Pickups (`rainbow`, `shield`, `x2`, `switch`)
// ---------------------------------------------------------------------------

function regularStarPolygon2D(points: number, rOuter: number, rInner: number): V2[] {
  const out: V2[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i += 1) {
    const a = (i / total) * Math.PI * 2 + Math.PI * 0.5;
    const r = i % 2 === 0 ? rOuter : rInner;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function buildPickupAssembly(type: Powerup["type"]): StudioAssembly {
  const slots: MultiMatSlot[] = [];
  const glassMeshes: RawMesh[] = [];

  if (type === "rainbow") {
    // Glossy chromatic ink-drop core (`bezierCurve2` + `latheMesh`) + 4 orbiting star petals + brass crown ring
    const dropWall = bezierCurve2([0.48, -0.35], [0.56, 0.08], [0.24, 0.58], [0.02, 0.92], 18);
    const dropProfile: V2[] = [[0, -0.68], [0.28, -0.64], ...dropWall, [0, 0.94]];
    slots.push({ mesh: latheMesh(dropProfile, 32), materialIndex: MAT.paintViolet });
    slots.push({
      mesh: latheMesh([[0.66, -0.08], [0.76, -0.08], [0.76, 0.08], [0.66, 0.08]], 32),
      materialIndex: MAT.turnedBrass
    });
    const petalPoly: V2[] = [[0, -0.26], [0.18, 0], [0, 0.32], [-0.18, 0]];
    const petalMats = [MAT.paintVermilion, MAT.paintCobalt, MAT.paintCadmium, MAT.paintMint] as const;
    for (let i = 0; i < 4; i += 1) {
      const ang = (i / 4) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(extrudePolygonMesh(petalPoly, 0.11, 0.025, false), {
          pos: [Math.cos(ang) * 0.72, 0.04, Math.sin(ang) * 0.72],
          rot: [0, -ang, 0.25]
        }),
        materialIndex: petalMats[i]!
      });
    }
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.18, 2, 0.02, 19, 0.35), { pos: [0, 0.98, 0] }),
      materialIndex: MAT.practicalWarmGlow
    });
  } else if (type === "shield") {
    // 6-sided bevelled Aegis crest shield + proud brass bezel frame + translucent studio-glass energy chevron
    const outerCrest: V2[] = [
      [0, -0.92], [0.68, -0.44], [0.78, 0.36],
      [0.44, 0.82], [-0.44, 0.82], [-0.78, 0.36], [-0.68, -0.44]
    ];
    const innerCrest: V2[] = outerCrest.map(([x, y]) => [x * 0.82, y * 0.82] as const);
    slots.push({ mesh: extrudePolygonMesh(outerCrest, 0.18, 0.04, false), materialIndex: MAT.turnedBrass });
    slots.push({ mesh: extrudePolygonMesh(innerCrest, 0.28, 0.045, false), materialIndex: MAT.paintCobalt });
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.24, 2, 0.02, 23, 0.35), { pos: [0, 0.06, 0], scale: [1, 1, 0.78] }),
      materialIndex: MAT.practicalCyanGlow
    });
    const chevron: V2[] = [[-0.48, 0.14], [0, -0.34], [0.48, 0.14], [0.34, 0.32], [0, -0.08], [-0.34, 0.32]];
    for (const sz of [-1, 1] as const) {
      glassMeshes.push(
        transformMesh(extrudePolygonMesh(chevron, 0.07, 0.015, false), { pos: [0, 0.08, sz * 0.18] })
      );
    }
  } else if (type === "x2") {
    // Twin interlocked 5-point golden star medallions + tilted brass gyro bezel + radiant core gem
    const starMain = regularStarPolygon2D(5, 0.88, 0.38);
    const starTwin = regularStarPolygon2D(5, 0.66, 0.28);
    slots.push({ mesh: extrudePolygonMesh(starMain, 0.24, 0.045, false), materialIndex: MAT.paintCadmium });
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(starTwin, 0.32, 0.04, false), { rot: [0, Math.PI * 0.28, Math.PI * 0.2] }),
      materialIndex: MAT.paintVermilion
    });
    slots.push({
      mesh: transformMesh(latheMesh([[0.82, -0.06], [0.92, -0.06], [0.92, 0.06], [0.82, 0.06]], 36), { rot: [0.68, 0.24, 0] }),
      materialIndex: MAT.turnedBrass
    });
    slots.push({
      mesh: icosphereSmoothMesh(0.24, 2, 0.02, 37, 0.35),
      materialIndex: MAT.practicalWarmGlow
    });
  } else {
    // `switch`: Yin-yang pair of curved ink-drop swirl lobes (`tubeSweepMesh`) + brass compass ring + 4 colour pips
    for (let sIdx = 0; sIdx < 2; sIdx += 1) {
      const phase = sIdx * Math.PI;
      const ctrl: V3[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const t = i / 8;
        const a = phase + t * Math.PI * 1.32;
        const r = 0.56 - t * 0.16;
        ctrl.push([Math.cos(a) * r, Math.sin(a) * r, Math.sin(t * Math.PI) * (sIdx === 0 ? 0.12 : -0.12)]);
      }
      const spline = catmullRomSpline3(ctrl, 10);
      const spine: V4[] = spline.map((p, idx) => {
        const u = idx / Math.max(1, spline.length - 1);
        const rad = 0.05 + Math.pow(1 - u, 0.65) * 0.19;
        return [p[0], p[1], p[2], rad];
      });
      slots.push({
        mesh: tubeSweepMesh(spine, 22),
        materialIndex: sIdx === 0 ? MAT.paintMint : MAT.paintMagenta
      });
    }
    slots.push({
      mesh: transformMesh(latheMesh([[0.78, -0.06], [0.88, -0.06], [0.88, 0.06], [0.78, 0.06]], 36), { rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: MAT.turnedBrass
    });
    const pipMats = [MAT.paintVermilion, MAT.paintCobalt, MAT.paintCadmium, MAT.paintViolet] as const;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      slots.push({
        mesh: transformMesh(icosphereSmoothMesh(0.135, 2, 0, 51 + i, 0.25), { pos: [Math.cos(a) * 0.83, Math.sin(a) * 0.83, 0] }),
        materialIndex: pipMats[i]!
      });
    }
    slots.push({
      mesh: icosphereSmoothMesh(0.22, 2, 0.02, 61, 0.35),
      materialIndex: MAT.practicalCyanGlow
    });
  }

  return { slots, glassMeshes };
}

// ---------------------------------------------------------------------------
// Deterministic Geometry Spec Cache & Public Scene Node Builders
// ---------------------------------------------------------------------------

interface CompactSlotSpec {
  readonly materialIndex: number;
  readonly spec: AuraCustomGeometrySpec;
}

interface CachedBackdropSpecs {
  readonly opaqueSlots: readonly CompactSlotSpec[];
  readonly glassSpec: AuraCustomGeometrySpec | null;
}

interface CachedPickupSpecs {
  readonly opaqueSpec: AuraCustomGeometrySpec;
  readonly glassSpec: AuraCustomGeometrySpec | null;
}

const BACKDROP_SPEC_CACHE = new Map<string, CachedBackdropSpecs>();
const PICKUP_SPEC_CACHE = new Map<string, CachedPickupSpecs>();

function compileCompactSlots(slots: readonly MultiMatSlot[]): CompactSlotSpec[] {
  const byMat = new Map<number, RawMesh[]>();
  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    let list = byMat.get(s.materialIndex);
    if (!list) byMat.set(s.materialIndex, (list = []));
    list.push(s.mesh);
  }
  return [...byMat.entries()]
    .sort(([a], [b]) => a - b)
    .map(([materialIndex, meshes]) => ({ materialIndex, spec: mergeRawMeshes(meshes) }));
}

function getBackdropSpecs(variant: BackdropPieceVariant, size: number): CachedBackdropSpecs {
  const key = `${variant}:${size.toFixed(3)}`;
  const hit = BACKDROP_SPEC_CACHE.get(key);
  if (hit) return hit;
  const raw =
    variant === "islandTree" ? buildIslandTreeAssembly()
    : variant === "islandTower" ? buildIslandTowerAssembly()
    : variant === "paintPotIsland" ? buildPaintPotIslandAssembly()
    : variant === "paletteIsland" ? buildPaletteIslandAssembly()
    : variant === "easelIsland" ? buildEaselIslandAssembly()
    : buildBalloonAssembly();
  const norm = normalizeAssembly(raw, size, variant === "balloon" ? "center" : "waist");
  const specs: CachedBackdropSpecs = {
    opaqueSlots: compileCompactSlots(norm.slots),
    glassSpec: norm.glassMeshes.length > 0 ? mergeRawMeshes(norm.glassMeshes) : null
  };
  BACKDROP_SPEC_CACHE.set(key, specs);
  return specs;
}

function getPickupSpecs(type: Powerup["type"], size: number): CachedPickupSpecs {
  const key = `${type}:${size.toFixed(3)}`;
  const hit = PICKUP_SPEC_CACHE.get(key);
  if (hit) return hit;
  const norm = normalizeAssembly(buildPickupAssembly(type), size, "center");
  const specs: CachedPickupSpecs = {
    opaqueSpec: buildGroupedGeometrySpec(norm.slots),
    glassSpec: norm.glassMeshes.length > 0 ? mergeRawMeshes(norm.glassMeshes) : null
  };
  PICKUP_SPEC_CACHE.set(key, specs);
  return specs;
}

export function buildBackdropPieceNode(
  variant: BackdropPieceVariant,
  options: {
    readonly id: string;
    readonly size: number;
    readonly castShadow: boolean;
    readonly receiveShadow: boolean;
  }
): ReturnType<typeof group> {
  const specs = getBackdropSpecs(variant, options.size);
  const children = specs.opaqueSlots.map((slot) =>
    geometry.custom(slot.spec, {
      name: `${options.id}-mat-${slot.materialIndex}`,
      material: STUDIO_MATERIALS[slot.materialIndex]!,
      castShadow: options.castShadow,
      receiveShadow: options.receiveShadow
    })
  );
  if (specs.glassSpec) {
    children.push(
      geometry.custom(specs.glassSpec, {
        name: `${options.id}-glass`,
        material: STUDIO_GLASS_MATERIAL,
        castShadow: false,
        receiveShadow: false
      })
    );
  }
  return group(options.id, children).runtime({ id: options.id });
}

export function buildPickupModelNode(
  type: Powerup["type"],
  options: {
    readonly id: string;
    readonly size: number;
  }
): ReturnType<typeof group> {
  const specs = getPickupSpecs(type, options.size);
  if (specs.glassSpec) {
    return group(options.id, [
      geometry.multiMaterial(specs.opaqueSpec, STUDIO_MATERIALS, {
        name: `${options.id}-opaque`,
        castShadow: false,
        receiveShadow: false
      }),
      geometry.custom(specs.glassSpec, {
        name: `${options.id}-glass`,
        material: STUDIO_GLASS_MATERIAL,
        castShadow: false,
        receiveShadow: false
      })
    ]).runtime({ id: options.id });
  }
  return geometry.multiMaterial(specs.opaqueSpec, STUDIO_MATERIALS, {
    name: options.id,
    castShadow: false,
    receiveShadow: false
  }).runtime({ id: options.id });
}

// ---------------------------------------------------------------------------
// Carnival Track Hero Roller Rig, Ink Hazard Puddles, Sweepers & Finish Arches
// ---------------------------------------------------------------------------

function srgbHexToLinear3(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): number => {
    const s = v / 255;
    return s < 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)];
}

function appendTonedRawMesh(
  dst: { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; tones: number[] },
  raw: RawMesh,
  rgb: readonly [number, number, number]
): void {
  const base = dst.positions.length / 3;
  const vCount = raw.positions.length / 3;
  for (let v = 0; v < vCount; v += 1) {
    const i = v * 3;
    dst.positions.push(raw.positions[i]!, raw.positions[i + 1]!, raw.positions[i + 2]!);
    const nx = raw.normals[i] ?? 0;
    const ny = raw.normals[i + 1] ?? 1;
    const nz = raw.normals[i + 2] ?? 0;
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 1e-4 && Number.isFinite(nl)) {
      const inv = 1 / nl;
      dst.normals.push(nx * inv, ny * inv, nz * inv);
    } else {
      dst.normals.push(0, 1, 0);
    }
  }
  for (let i = 0; i < raw.uvs.length; i += 1) {
    dst.uvs.push(raw.uvs[i]!);
  }
  for (let i = 0; i < raw.indices.length; i += 1) {
    dst.indices.push(base + raw.indices[i]!);
  }
  for (let v = 0; v < vCount; v += 1) {
    dst.tones.push(rgb[0], rgb[1], rgb[2]);
  }
}

interface TonedPart {
  readonly mesh: RawMesh;
  readonly rgb: readonly [number, number, number];
}

function appendTonedParts(
  dst: { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; tones: number[] },
  parts: readonly TonedPart[],
  pose?: TransformOpts
): void {
  for (const part of parts) {
    appendTonedRawMesh(dst, pose ? transformMesh(part.mesh, pose) : part.mesh, part.rgb);
  }
}

const cachedPaintRunnerBoot = new Map<boolean, RawMesh>();
function getPaintRunnerBootMesh(hero = false): RawMesh {
  const hit = cachedPaintRunnerBoot.get(hero);
  if (hit) return hit;
  const built = sculptOrganicSdfMesh({
    boundsMin: [-0.072, -0.052, -0.095],
    boundsMax: [0.072, 0.088, 0.135],
    resolution: hero ? [22, 20, 24] : [16, 14, 18],
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const sole = sdfTaperedCapsule(p, [0, -0.016, -0.048], [0, -0.014, 0.082], 0.05, 0.056);
      const toeBox = sdfEllipsoid(p, [0, 0.006, 0.058], [0.056, 0.042, 0.068]);
      const ankleCuff = sdfTaperedCapsule(p, [0, 0.008, -0.022], [0, 0.056, -0.014], 0.046, 0.042);
      return sminPoly(sminPoly(sole, toeBox, 0.028), ankleCuff, 0.026);
    }
  });
  cachedPaintRunnerBoot.set(hero, built);
  return built;
}

const cachedPaintRunnerGlove = new Map<boolean, RawMesh>();
function getPaintRunnerGloveMesh(hero = false): RawMesh {
  const hit = cachedPaintRunnerGlove.get(hero);
  if (hit) return hit;
  const built = sculptOrganicSdfMesh({
    boundsMin: [-0.058, -0.052, -0.062],
    boundsMax: [0.058, 0.052, 0.072],
    resolution: hero ? [22, 20, 22] : [14, 14, 14],
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const mitt = sdfEllipsoid(p, [0, 0, 0.008], [0.042, 0.036, 0.048]);
      const thumb = sdfTaperedCapsule(p, [0.02, -0.006, -0.012], [0.038, 0.01, 0.028], 0.018, 0.015);
      return sminPoly(mitt, thumb, 0.018);
    }
  });
  cachedPaintRunnerGlove.set(hero, built);
  return built;
}

const cachedPaintRunnerCrown = new Map<boolean, RawMesh>();
function getPaintRunnerCrownMesh(hero = false): RawMesh {
  const hit = cachedPaintRunnerCrown.get(hero);
  if (hit) return hit;
  const built = sculptOrganicSdfMesh({
    boundsMin: [-0.145, -0.05, -0.185],
    boundsMax: [0.145, 0.145, 0.145],
    resolution: hero ? [24, 22, 24] : [18, 16, 18],
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const dome = sdfEllipsoid(p, [0, 0.036, -0.012], [0.118, 0.088, 0.126]);
      const crest = sdfTaperedCapsule(p, [0, 0.048, 0.025], [0, 0.086, -0.135], 0.076, 0.042);
      return sminPoly(dome, crest, 0.036);
    }
  });
  cachedPaintRunnerCrown.set(hero, built);
  return built;
}

let cachedSweeperMascotPod: RawMesh | null = null;
function getSweeperMascotPodMesh(): RawMesh {
  if (cachedSweeperMascotPod) return cachedSweeperMascotPod;
  cachedSweeperMascotPod = sculptOrganicSdfMesh({
    boundsMin: [-0.36, 0.16, -0.36],
    boundsMax: [0.36, 1.38, 0.38],
    resolution: [20, 22, 20],
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const waist = sdfTaperedCapsule(p, [0, 0.28, 0], [0, 0.78, 0], 0.18, 0.24);
      const torsoDome = sdfEllipsoid(p, [0, 0.94, 0.015], [0.27, 0.30, 0.26]);
      const brow = sdfEllipsoid(p, [0, 1.12, 0.14], [0.20, 0.075, 0.12]);
      const cheekL = sdfEllipsoid(p, [-0.15, 0.92, 0.16], [0.09, 0.08, 0.08]);
      const cheekR = sdfEllipsoid(p, [0.15, 0.92, 0.16], [0.09, 0.08, 0.08]);
      const base = sminPoly(waist, torsoDome, 0.08);
      return sminPoly(sminPoly(base, brow, 0.045), sminPoly(cheekL, cheekR, 0.05), 0.04);
    }
  });
  return cachedSweeperMascotPod;
}

/**
 * Builds a sleek stylized Paint-Runner Kid / Spectator Mascot in unit character coordinates
 * (feet at `y = 0`, facing `+Z` forward, `+Y` up) with:
 * - `sculptStylizedHeadMesh` + `taubinSmoothMesh`
 * - Expressive 4-part glossy eyes (ivory sclera, vivid iris, deep plum pupil, bright specular catchlight)
 * - Sporty wraparound tinted visor & street headphones
 * - SDF crown mantle (`sculptOrganicSdfMesh`) + 7 curved tentacle/paint-splash crest locks (`sculptCurvedHairLockMesh`)
 *   with vibrant polychrome paint-dipped tips & glossy droplet pearls
 * - Draped studio-street hoodie & flared athletic shorts (`sculptDrapedGarmentMesh`)
 * - Smooth anatomical limbs (`sculptAnatomicalLimbMesh`) & chunky SDF street-paint boots (`sculptOrganicSdfMesh`)
 */
function buildPaintRunnerCharacterParts(opts: {
  readonly pose: "surf" | "cheerLeft" | "cheerRight";
  readonly hoodieRgb: readonly [number, number, number];
  readonly shortsRgb: readonly [number, number, number];
  readonly hairRgb: readonly [number, number, number];
  readonly visorRgb: readonly [number, number, number];
  readonly bootRgb: readonly [number, number, number];
  readonly tipRgbs: readonly (readonly [number, number, number])[];
  readonly withBackpack: boolean;
}): TonedPart[] {
  const parts: TonedPart[] = [];
  const skinRgb = srgbHexToLinear3("#ffe4cf");
  const scleraRgb = srgbHexToLinear3("#ffffff");
  const irisRgb = srgbHexToLinear3("#2ad6e8");
  const pupilRgb = srgbHexToLinear3("#241233");
  const brassRgb = srgbHexToLinear3("#f4c568");
  const plumTrimRgb = srgbHexToLinear3("#3d2252");
  const soleRgb = srgbHexToLinear3("#faf5eb");

  const isSurf = opts.pose === "surf";
  const hipY = isSurf ? 0.30 : 0.34;
  const shoulderY = isSurf ? 0.56 : 0.62;
  const headY = isSurf ? 0.72 : 0.78;
  const headZ = isSurf ? 0.035 : 0.015;

  // 1. Smooth anatomical legs (`sculptAnatomicalLimbMesh`) & chunky SDF street boots (`getPaintRunnerBootMesh`)
  const limbSegs = isSurf ? 28 : 16;
  const bootMesh = getPaintRunnerBootMesh(isSurf);
  const bootSole = taubinSmoothMesh(bevelBoxMesh(0.105, 0.026, 0.185, 0.01), 3);
  for (const side of [-1, 1] as const) {
    const footX = side * (isSurf ? 0.115 : 0.088);
    const footZ = isSurf ? (side < 0 ? 0.03 : -0.02) : 0.01;
    const kneeZ = isSurf ? 0.085 : 0.035;
    parts.push(
      {
        mesh: sculptAnatomicalLimbMesh(
          [
            { pos: [side * 0.078, hipY + 0.02, -0.01], rx: 0.052, rz: 0.056 },
            { pos: [side * 0.098, hipY * 0.56, kneeZ], rx: 0.044, rz: 0.048, zOffset: 0.008 },
            { pos: [footX, 0.055, footZ], rx: 0.035, rz: 0.038 }
          ],
          { ringPoints: limbSegs, capEnds: true, muscleBiasZ: -0.01, peakT: 0.4 }
        ),
        rgb: skinRgb
      },
      {
        mesh: transformMesh(bootMesh, {
          pos: [footX, 0.048, footZ + 0.02],
          rot: [0, side * (isSurf ? 0.14 : 0.08), 0]
        }),
        rgb: opts.bootRgb
      },
      {
        mesh: transformMesh(bootSole, {
          pos: [footX, 0.014, footZ + 0.022],
          rot: [0, side * (isSurf ? 0.14 : 0.08), 0]
        }),
        rgb: soleRgb
      }
    );
  }

  // 2. Draped athletic shorts & oversized studio-street hoodie (`sculptDrapedGarmentMesh`)
  const shorts = sculptDrapedGarmentMesh(
    [
      { y: hipY - 0.10, rx: 0.142, rz: 0.112, z: 0.015, folds: 6, foldAmp: 0.045, superellipseN: 2.25 },
      { y: hipY - 0.02, rx: 0.136, rz: 0.108, z: 0.005, folds: 4, foldAmp: 0.03, superellipseN: 2.15 },
      { y: hipY + 0.05, rx: 0.118, rz: 0.096, superellipseN: 2.05 }
    ],
    { ringPoints: isSurf ? 30 : 22, capEnds: true, smoothPasses: 3 }
  );
  const hoodie = sculptDrapedGarmentMesh(
    [
      { y: hipY + 0.01, rx: 0.162, rz: 0.128, z: 0.005, folds: 7, foldAmp: 0.05, superellipseN: 2.25 },
      { y: (hipY + shoulderY) * 0.48, rx: 0.152, rz: 0.122, z: 0.012, folds: 5, foldAmp: 0.035, superellipseN: 2.18 },
      { y: shoulderY - 0.03, rx: 0.138, rz: 0.108, z: 0.018, superellipseN: 2.1 },
      { y: shoulderY + 0.045, rx: 0.076, rz: 0.072, z: 0.02, superellipseN: 2.0 }
    ],
    { ringPoints: isSurf ? 32 : 24, capEnds: true, smoothPasses: 3 }
  );
  const hoodCollar = sculptDrapedGarmentMesh(
    [
      { y: shoulderY + 0.015, rx: 0.108, rz: 0.104, z: 0.006, folds: 4, foldAmp: 0.03, superellipseN: 2.1 },
      { y: shoulderY + 0.068, rx: 0.122, rz: 0.118, z: -0.012, folds: 5, foldAmp: 0.035, superellipseN: 2.15 },
      { y: shoulderY + 0.095, rx: 0.096, rz: 0.095, z: -0.022, superellipseN: 2.05 }
    ],
    { ringPoints: isSurf ? 28 : 20, capEnds: true, smoothPasses: 3 }
  );
  parts.push(
    { mesh: shorts, rgb: opts.shortsRgb },
    { mesh: hoodie, rgb: opts.hoodieRgb },
    { mesh: hoodCollar, rgb: brassRgb }
  );

  // 3. Smooth anatomical arms (`sculptAnatomicalLimbMesh`) & SDF gloves
  const gloveMesh = getPaintRunnerGloveMesh(isSurf);
  for (const side of [-1, 1] as const) {
    const cheerUp =
      (opts.pose === "cheerLeft" && side < 0) || (opts.pose === "cheerRight" && side > 0);
    const stations = isSurf
      ? [
          { pos: [side * 0.128, shoulderY, 0.018] as V3, rx: 0.042, rz: 0.042 },
          { pos: [side * 0.175, shoulderY - 0.075, 0.135] as V3, rx: 0.036, rz: 0.038 },
          { pos: [side * 0.185, shoulderY - 0.095, 0.275] as V3, rx: 0.031, rz: 0.032 }
        ]
      : cheerUp
        ? [
            { pos: [side * 0.125, shoulderY + 0.01, 0.01] as V3, rx: 0.042, rz: 0.042 },
            { pos: [side * 0.205, shoulderY + 0.14, 0.06] as V3, rx: 0.036, rz: 0.036 },
            { pos: [side * 0.245, shoulderY + 0.29, 0.11] as V3, rx: 0.032, rz: 0.032 }
          ]
        : [
            { pos: [side * 0.125, shoulderY + 0.01, 0.01] as V3, rx: 0.042, rz: 0.042 },
            { pos: [side * 0.18, shoulderY - 0.04, 0.09] as V3, rx: 0.036, rz: 0.036 },
            { pos: [side * 0.16, shoulderY + 0.06, 0.18] as V3, rx: 0.032, rz: 0.032 }
          ];
    const handPos = stations[2]!.pos;
    parts.push(
      {
        mesh: sculptAnatomicalLimbMesh(stations, { ringPoints: limbSegs, capEnds: true, peakT: 0.36 }),
        rgb: opts.hoodieRgb
      },
      {
        mesh: transformMesh(gloveMesh, { pos: handPos, scale: 0.88 }),
        rgb: opts.bootRgb
      }
    );
  }

  // 4. Stylized sculpted head (`sculptStylizedHeadMesh` + smooth subdivision), expressive glossy eyes, visor & street headphones
  const headR = 0.115;
  const rawHead = sculptStylizedHeadMesh(headR, {
    jawTaper: 0.24,
    cheekFullness: 0.22,
    noseBridge: 0.15,
    browRidge: 0.08,
    subdivisions: 2,
    seed: 29
  });
  const headMesh = isSurf ? subdivideSmoothMesh(rawHead, 1, 0.48) : taubinSmoothMesh(rawHead, 3);
  parts.push({ mesh: transformMesh(headMesh, { pos: [0, headY, headZ] }), rgb: skinRgb });

  // Expressive 4-part glossy eyes (sclera + cyan iris + plum pupil + bright white specular catchlight)
  const eyeOrb = icosphereSmoothMesh(1, 2, 0, 11);
  const eyePip = icosphereSmoothMesh(1, 1, 0, 11);
  for (const side of [-1, 1] as const) {
    const ex = side * 0.043;
    const ey = headY - 0.008;
    const ez = headZ + headR * 0.88;
    parts.push(
      {
        mesh: transformMesh(eyeOrb, { pos: [ex, ey, ez], rot: [0, side * 0.16, 0], scale: [0.026, 0.032, 0.016] }),
        rgb: scleraRgb
      },
      {
        mesh: transformMesh(eyeOrb, { pos: [ex, ey - 0.001, ez + 0.007], rot: [0, side * 0.16, 0], scale: [0.019, 0.024, 0.012] }),
        rgb: irisRgb
      },
      {
        mesh: transformMesh(eyePip, { pos: [ex, ey - 0.002, ez + 0.012], rot: [0, side * 0.16, 0], scale: [0.011, 0.015, 0.009] }),
        rgb: pupilRgb
      },
      {
        mesh: transformMesh(eyePip, { pos: [ex + side * 0.006, ey + 0.009, ez + 0.015], scale: [0.006, 0.006, 0.005] }),
        rgb: scleraRgb
      }
    );
  }

  // Sporty wraparound tinted visor (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`) + brass brow bar
  const visorLens = taubinSmoothMesh(
    deformMesh(
      sculptStreamlinedHullMesh(0.115, 0.245, 0.072, {
        noseSharpness: 0.34,
        tailTaper: 0.52,
        canopyBulge: 0.26,
        undersideFlat: 0.32,
        stations: isSurf ? 18 : 13,
        ringPoints: isSurf ? 28 : 20
      }),
      ([x, y, z]) => [x, y + 0.009 * Math.cos((x / 0.13) * Math.PI * 0.5), z - 0.20 * (x * x) / 0.016]
    ),
    4
  );
  const browBarPts = catmullRomSpline3(
    [
      [-0.122, headY + 0.036, headZ + 0.035],
      [-0.068, headY + 0.052, headZ + 0.108],
      [0, headY + 0.056, headZ + 0.124],
      [0.068, headY + 0.052, headZ + 0.108],
      [0.122, headY + 0.036, headZ + 0.035]
    ],
    6
  );
  parts.push(
    {
      mesh: transformMesh(visorLens, { pos: [0, headY + 0.022, headZ + 0.078], rot: [0.08, 0, 0] }),
      rgb: opts.visorRgb
    },
    {
      mesh: taubinSmoothMesh(tubeSweepMesh(browBarPts.map((p): V4 => [p[0], p[1], p[2], 0.011]), isSurf ? 24 : 16), 2),
      rgb: brassRgb
    }
  );

  // Cushioned street ear-cup headphones at `±X`
  const earSegs = isSurf ? 32 : 24;
  const earCup = latheMesh(
    [
      [0, 0],
      [0.042, 0],
      [0.048, 0.012],
      [0.045, 0.028],
      [0.028, 0.036],
      [0, 0.038]
    ],
    earSegs
  );
  const earRing = latheMesh([[0.024, 0.032], [0.036, 0.032], [0.036, 0.041], [0.024, 0.041]], earSegs);
  for (const side of [-1, 1] as const) {
    const pose = { pos: [side * 0.112, headY + 0.005, headZ - 0.004] as V3, rot: [0, 0, -side * Math.PI * 0.5] as V3 };
    parts.push(
      { mesh: transformMesh(earCup, pose), rgb: plumTrimRgb },
      { mesh: transformMesh(earRing, pose), rgb: brassRgb }
    );
  }

  // 5. SDF squid/paint-crown mantle + 7 curved tentacle/paint-splash crest locks (`sculptCurvedHairLockMesh`) with glossy polychrome tips
  parts.push({
    mesh: transformMesh(getPaintRunnerCrownMesh(isSurf), { pos: [0, headY + 0.042, headZ - 0.008] }),
    rgb: opts.hairRgb
  });
  const lockSpecs: readonly { root: V3; mid: V3; tip: V3; w: number }[] = [
    { root: [0, 0.11, 0.02], mid: [0, 0.175, -0.135], tip: [0, 0.055, -0.285], w: 0.088 },
    { root: [-0.058, 0.095, 0.01], mid: [-0.145, 0.135, -0.115], tip: [-0.195, -0.015, -0.245], w: 0.078 },
    { root: [0.058, 0.095, 0.01], mid: [0.145, 0.135, -0.115], tip: [0.195, -0.015, -0.245], w: 0.078 },
    { root: [-0.092, 0.055, -0.02], mid: [-0.185, 0.045, -0.105], tip: [-0.225, -0.105, -0.185], w: 0.068 },
    { root: [0.092, 0.055, -0.02], mid: [0.185, 0.045, -0.105], tip: [0.225, -0.105, -0.185], w: 0.068 },
    { root: [-0.036, 0.065, -0.065], mid: [-0.078, 0.015, -0.195], tip: [-0.095, -0.125, -0.265], w: 0.072 },
    { root: [0.036, 0.065, -0.065], mid: [0.078, 0.015, -0.195], tip: [0.095, -0.125, -0.265], w: 0.072 }
  ];
  const pearlOrb = icosphereSmoothMesh(0.016, 2, 0, 33);
  const lockRadSegs = isSurf ? 20 : 14;
  for (let i = 0; i < lockSpecs.length; i += 1) {
    const ls = lockSpecs[i]!;
    const root: V3 = [ls.root[0], headY + ls.root[1], headZ + ls.root[2]];
    const mid: V3 = [ls.mid[0], headY + ls.mid[1], headZ + ls.mid[2]];
    const tip: V3 = [ls.tip[0], headY + ls.tip[1], headZ + ls.tip[2]];
    const tipStart: V3 = [
      mid[0] * 0.36 + tip[0] * 0.64,
      mid[1] * 0.36 + tip[1] * 0.64,
      mid[2] * 0.36 + tip[2] * 0.64
    ];
    const tipMid: V3 = [
      mid[0] * 0.14 + tip[0] * 0.86,
      mid[1] * 0.14 + tip[1] * 0.86,
      mid[2] * 0.14 + tip[2] * 0.86
    ];
    const tipRgb = opts.tipRgbs[i % opts.tipRgbs.length]!;
    parts.push(
      {
        mesh: sculptCurvedHairLockMesh({
          root,
          mid,
          tip,
          width: ls.w,
          thickness: ls.w * 0.74,
          segments: isSurf ? 14 : 12,
          radialSegments: lockRadSegs
        }),
        rgb: opts.hairRgb
      },
      {
        mesh: sculptCurvedHairLockMesh({
          root: tipStart,
          mid: tipMid,
          tip: [tip[0], tip[1] - 0.008, tip[2] - 0.008],
          width: ls.w * 0.68,
          thickness: ls.w * 0.56,
          segments: isSurf ? 10 : 8,
          radialSegments: lockRadSegs
        }),
        rgb: tipRgb
      },
      {
        mesh: transformMesh(pearlOrb, {
          pos: [mid[0] * 0.5 + tip[0] * 0.5, mid[1] * 0.5 + tip[1] * 0.5 - 0.012, mid[2] * 0.5 + tip[2] * 0.5]
        }),
        rgb: scleraRgb
      }
    );
  }

  // 6. Optional sleek pressurized brass & mint paint backpack tank
  if (opts.withBackpack) {
    const tankBody = latheMesh(
      [
        [0, -0.095],
        [0.052, -0.092],
        [0.062, -0.068],
        [0.062, 0.068],
        [0.052, 0.092],
        [0, 0.095]
      ],
      32
    );
    const tankBand = latheMesh([[0.058, -0.018], [0.068, -0.014], [0.068, 0.014], [0.058, 0.018]], 32);
    const packPose: TransformOpts = { pos: [0, (hipY + shoulderY) * 0.55, -0.125], rot: [-0.14, 0, 0] };
    parts.push(
      { mesh: transformMesh(tankBody, packPose), rgb: opts.tipRgbs[0]! },
      { mesh: transformMesh(tankBand, { pos: [0, (hipY + shoulderY) * 0.55 + 0.042, -0.13], rot: [-0.14, 0, 0] }), rgb: brassRgb },
      { mesh: transformMesh(tankBand, { pos: [0, (hipY + shoulderY) * 0.55 - 0.042, -0.12], rot: [-0.14, 0, 0] }), rgb: brassRgb }
    );
  }

  return parts;
}

const PAINT_ROLLER_CACHE = new Map<string, { mesh: MeshData; tones: number[] }>();

/**
 * Ultra-smooth 64-segment bevelled chrome gyro-gimbal collar, Taubin-faired Aero Hydro-Pods & Aft Surf-Cradle,
 * swept chrome handlebars, and the Playable Paint-Runner Mascot surfing behind the hero chroma orb (`ball-roller`).
 */
export function buildPaintRollerCollarMesh(ballRadius: number): { mesh: MeshData; tones: number[] } {
  const cacheKey = ballRadius.toFixed(3);
  const cached = PAINT_ROLLER_CACHE.get(cacheKey);
  if (cached) return cached;

  const out = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[], tones: [] as number[] };
  const brass = srgbHexToLinear3("#f4c568");
  const chrome = srgbHexToLinear3("#f0f5fc");
  const seamPlum = srgbHexToLinear3("#3b224c");
  const ivory = srgbHexToLinear3("#faf4e8");
  const magenta = srgbHexToLinear3("#eb4998");
  const cyanVisor = srgbHexToLinear3("#38cbff");
  const cobalt = srgbHexToLinear3("#3294f2");
  const mint = srgbHexToLinear3("#39d6a0");
  const vermilion = srgbHexToLinear3("#f54d42");
  const cadmium = srgbHexToLinear3("#f9c438");

  const rIn = ballRadius + 0.036;
  const rOut = ballRadius + 0.086;
  const rGroove = ballRadius + 0.070;

  // 1. 64-segment dual-lip bevelled chrome gimbal ring (ultra-smooth, zero low-poly faceting; upper-front orb stays 100% open)
  for (const sgn of [-1, 1] as const) {
    const y0 = sgn * 0.011;
    const yMid = sgn * 0.028;
    const yOuter = sgn * 0.044;
    const rimProfile: V2[] =
      sgn > 0
        ? [
            [rIn, y0],
            [rGroove, y0],
            [rOut, yMid - 0.008],
            [rOut, yMid + 0.008],
            [rOut - 0.018, yOuter],
            [rIn + 0.008, yOuter],
            [rIn, yMid],
            [rIn, y0]
          ]
        : [
            [rIn, yOuter + 0.016],
            [rIn + 0.008, yOuter],
            [rOut - 0.018, yOuter],
            [rOut, yMid - 0.008],
            [rOut, yMid + 0.008],
            [rGroove, y0],
            [rIn, y0],
            [rIn, yOuter + 0.016]
          ];
    appendTonedRawMesh(out, latheMesh(rimProfile, 64), chrome);
  }

  // 2. Recessed satin-plum equatorial seam channel + twin 64-segment spun-brass bead rings
  const grooveProfile: V2[] = [
    [rIn - 0.002, -0.012],
    [rGroove, -0.012],
    [rGroove - 0.006, 0],
    [rGroove, 0.012],
    [rIn - 0.002, 0.012]
  ];
  appendTonedRawMesh(out, latheMesh(grooveProfile, 64), seamPlum);
  for (const sgn of [-1, 1] as const) {
    const yc = sgn * 0.013;
    appendTonedRawMesh(
      out,
      latheMesh(
        [
          [rGroove, yc - 0.004],
          [rOut + 0.003, yc],
          [rGroove, yc + 0.004]
        ],
        64
      ),
      brass
    );
  }

  // 3. Twin Taubin-faired Aero Hydro-Jet Side Pods (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`) + 32-segment pivot nozzles
  const sideAeroPod = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.30, 0.095, 0.115, {
      noseSharpness: 0.56,
      tailTaper: 0.48,
      canopyBulge: 0.24,
      undersideFlat: 0.36,
      stations: 20,
      ringPoints: 28
    }),
    4
  );
  const bearingHousing = latheMesh(
    [
      [0, 0],
      [0.095, 0],
      [0.104, 0.022],
      [0.090, 0.046],
      [0.066, 0.056],
      [0, 0.056]
    ],
    32
  );
  const bearingRace = latheMesh(
    [
      [0.052, 0.050],
      [0.076, 0.050],
      [0.080, 0.072],
      [0.050, 0.080],
      [0.050, 0.050]
    ],
    32
  );
  const nozzleTip = latheMesh(
    [
      [0, 0.074],
      [0.050, 0.074],
      [0.042, 0.106],
      [0.024, 0.120],
      [0.014, 0.114],
      [0, 0.110]
    ],
    32
  );
  for (const sgn of [-1, 1] as const) {
    appendTonedRawMesh(
      out,
      transformMesh(sideAeroPod, { pos: [sgn * (ballRadius + 0.092), 0, 0.02], rot: [0, Math.PI, sgn * 0.12] }),
      ivory
    );
    const pose = { pos: [sgn * (ballRadius + 0.048), 0, 0] as V3, rot: [0, 0, -sgn * Math.PI * 0.5] as V3 };
    appendTonedRawMesh(out, transformMesh(bearingHousing, pose), brass);
    appendTonedRawMesh(out, transformMesh(bearingRace, pose), chrome);
    appendTonedRawMesh(out, transformMesh(nozzleTip, pose), seamPlum);
  }

  // 4. Ultra-smooth Taubin-faired Aft Gyro Surf-Cradle (`sculptStreamlinedHullMesh` + `taubinSmoothMesh`) & swept chrome handlebars
  const surfDeck = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.24, 0.32, 0.058, {
      noseSharpness: 0.46,
      tailTaper: 0.44,
      canopyBulge: 0.18,
      undersideFlat: 0.65,
      stations: 20,
      ringPoints: 28
    }),
    4
  );
  appendTonedRawMesh(
    out,
    transformMesh(surfDeck, { pos: [0, -0.135, rOut + 0.048], rot: [-0.14, 0, 0] }),
    ivory
  );
  const strutPtsL = catmullRomSpline3([[-0.22, -0.01, rOut - 0.04], [-0.18, -0.09, rOut + 0.01], [-0.12, -0.13, rOut + 0.045]], 8);
  const strutPtsR = catmullRomSpline3([[0.22, -0.01, rOut - 0.04], [0.18, -0.09, rOut + 0.01], [0.12, -0.13, rOut + 0.045]], 8);
  appendTonedRawMesh(out, tubeSweepMesh(strutPtsL.map((p): V4 => [p[0], p[1], p[2], 0.016]), 24), brass);
  appendTonedRawMesh(out, tubeSweepMesh(strutPtsR.map((p): V4 => [p[0], p[1], p[2], 0.016]), 24), brass);

  const handlebarPts = catmullRomSpline3(
    [
      [-0.14, 0.02, rOut - 0.02],
      [-0.12, 0.075, rOut + 0.02],
      [-0.075, 0.095, rOut + 0.032],
      [0.075, 0.095, rOut + 0.032],
      [0.12, 0.075, rOut + 0.02],
      [0.14, 0.02, rOut - 0.02]
    ],
    8
  );
  appendTonedRawMesh(out, tubeSweepMesh(handlebarPts.map((p): V4 => [p[0], p[1], p[2], 0.013]), 28), chrome);

  // 5. Playable Paint-Runner Mascot surfing on the aft cradle (facing forward `-Z` via `rotY = Math.PI`, tucked inside `r <= 0.90` shield bubble)
  const runnerParts = buildPaintRunnerCharacterParts({
    pose: "surf",
    hoodieRgb: ivory,
    shortsRgb: seamPlum,
    hairRgb: magenta,
    visorRgb: cyanVisor,
    bootRgb: cobalt,
    tipRgbs: [mint, vermilion, cadmium, cyanVisor],
    withBackpack: true
  });
  appendTonedParts(out, runnerParts, {
    pos: [0, -0.125, rOut + 0.058],
    rot: [0.34, Math.PI, 0],
    scale: 0.42
  });

  const { tones, ...mesh } = out;
  const built = { mesh, tones };
  PAINT_ROLLER_CACHE.set(cacheKey, built);
  return built;
}

/**
 * Sculpted 3D wet-lacquer ink hazard / splatter puddle (`splats` in carnival):
 * 64-sample undulating multi-lobe puddle lofted through a smooth raised meniscus dome + round satellite crown droplets.
 */
export function buildCarnivalInkHazardMesh(): MeshData {
  const samples = 64;
  const ringRadii = [1.0, 0.93, 0.68, 0.22] as const;
  const ringHeights = [0.004, 0.046, 0.034, 0.038] as const;
  const puddleSections: V3[][] = ringRadii.map((scaleR, rIdx) => {
    const y = ringHeights[rIdx]!;
    return Array.from({ length: samples }, (_, i): V3 => {
      const a = (i / samples) * Math.PI * 2;
      const lobe = 1.12 + 0.22 * Math.sin(a * 3 + 0.4) + 0.14 * Math.cos(a * 5 - 0.7) + 0.07 * Math.sin(a * 7 + 1.1);
      const r = lobe * scaleR;
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    });
  });
  const mainPuddle = loftSectionsMesh(puddleSections, true, true);
  const crownDrops: RawMesh[] = [mainPuddle];
  const dropOffsets: readonly [number, number, number][] = [
    [1.48, 1.18, 0.24],
    [-1.22, -1.46, 0.22],
    [1.36, -0.92, 0.18],
    [-1.42, 0.76, 0.19],
    [0.24, 1.54, 0.16],
    [-0.36, -1.52, 0.15]
  ];
  for (let d = 0; d < dropOffsets.length; d += 1) {
    const [dx, dz, dr] = dropOffsets[d]!;
    crownDrops.push(
      transformMesh(icosphereSmoothMesh(dr, 2, 0, 31 + d, 0.35), {
        pos: [dx, 0.026, dz],
        scale: [1.14, 0.34, 1.08]
      })
    );
  }
  const spec = mergeRawMeshes(crownDrops);
  const specPos = spec.positions as Float32Array;
  const specNorm = spec.normals as Float32Array;
  const specUv = spec.uvs as Float32Array;
  const specIdx = spec.indices as Uint32Array;
  const vCount = specPos.length / 3;
  const positions = Array.from(specPos);
  const normals = new Array<number>(specNorm.length);
  for (let v = 0; v < vCount; v += 1) {
    // Upward-biased smooth normal so `reflect: false` preserves exact pigment hue while catching crisp rim gloss
    const nx = specNorm[v * 3]! * 0.24;
    const ny = Math.max(0.92, Math.abs(specNorm[v * 3 + 1]!));
    const nz = specNorm[v * 3 + 2]! * 0.24;
    const inv = 1 / Math.hypot(nx, ny, nz);
    normals[v * 3] = nx * inv;
    normals[v * 3 + 1] = ny * inv;
    normals[v * 3 + 2] = nz * inv;
  }
  return {
    positions,
    normals,
    uvs: Array.from(specUv),
    indices: Array.from(specIdx)
  };
}

let cachedFinishAndSweeper: {
  archMesh: MeshData;
  archTones: number[];
  sweeperMesh: MeshData;
  sweeperTones: number[];
} | null = null;

/**
 * Celebratory Carnival Milestone / Finish Arch (with cheering Paint-Runner Spectators) &
 * Smooth Rival Gyro-Sweeper Mascots (`sculptOrganicSdfMesh` + `sculptCurvedHairLockMesh` + `taubinSmoothMesh`).
 */
export function buildFinishArchAndSweeperMeshes(): {
  archMesh: MeshData;
  archTones: number[];
  sweeperMesh: MeshData;
  sweeperTones: number[];
} {
  if (cachedFinishAndSweeper) return cachedFinishAndSweeper;

  const ivory = srgbHexToLinear3("#faf3e6");
  const brass = srgbHexToLinear3("#f2be5c");
  const plum = srgbHexToLinear3("#6a3a6c");
  const darkPlum = srgbHexToLinear3("#291438");
  const mint = srgbHexToLinear3("#8ce8b8");
  const rose = srgbHexToLinear3("#f3a8bc");
  const cobalt = srgbHexToLinear3("#5fa6f2");
  const cyanVisor = srgbHexToLinear3("#46d4ff");
  const vermilion = srgbHexToLinear3("#f45448");
  const cadmium = srgbHexToLinear3("#f9c642");
  const white = srgbHexToLinear3("#ffffff");

  // 1. Celebratory Finish / Milestone Arch spanning clear outside the 8 m deck (`x = ±4.55`)
  const arch = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[], tones: [] as number[] };
  const plinth = latheMesh(
    [
      [0, 0],
      [0.46, 0],
      [0.46, 0.08],
      [0.42, 0.22],
      [0.34, 0.3],
      [0.3, 0.38],
      [0, 0.38]
    ],
    32
  );
  const pillar = latheMesh(
    [
      [0, 0.36],
      [0.26, 0.36],
      [0.24, 0.54],
      [0.22, 3.78],
      [0.29, 3.94],
      [0.27, 4.04],
      [0, 4.06]
    ],
    32
  );
  const pillarBand = latheMesh(
    [
      [0.22, 1.48],
      [0.28, 1.54],
      [0.285, 1.82],
      [0.28, 2.1],
      [0.22, 2.16]
    ],
    32
  );
  for (const sgn of [-1, 1] as const) {
    const px = sgn * 4.55;
    appendTonedRawMesh(arch, transformMesh(plinth, { pos: [px, 0, 0] }), brass);
    appendTonedRawMesh(arch, transformMesh(pillar, { pos: [px, 0, 0] }), ivory);
    appendTonedRawMesh(arch, transformMesh(pillarBand, { pos: [px, 0, 0] }), sgn < 0 ? rose : mint);
  }

  // Cheering Paint-Runner Spectator Mascots perched atop the left & right pillar capitals (`x = ±4.55, y = 4.06`, facing `+Z` toward the runner)
  const fanLeft = buildPaintRunnerCharacterParts({
    pose: "cheerRight",
    hoodieRgb: mint,
    shortsRgb: plum,
    hairRgb: rose,
    visorRgb: cyanVisor,
    bootRgb: cobalt,
    tipRgbs: [cadmium, cobalt, ivory],
    withBackpack: false
  });
  const fanRight = buildPaintRunnerCharacterParts({
    pose: "cheerLeft",
    hoodieRgb: rose,
    shortsRgb: plum,
    hairRgb: cobalt,
    visorRgb: cadmium,
    bootRgb: mint,
    tipRgbs: [rose, mint, ivory],
    withBackpack: false
  });
  appendTonedParts(arch, fanLeft, { pos: [-4.55, 4.05, 0.02], rot: [0, 0.32, 0], scale: 0.92 });
  appendTonedParts(arch, fanRight, { pos: [4.55, 4.05, 0.02], rot: [0, -0.32, 0], scale: 0.92 });

  // Smooth 72-step overhead arch span x 26 radial segments + turned brass arch clasp rings
  const spanPts = catmullRomSpline3(
    [
      [-4.55, 3.96, 0],
      [-3.35, 4.62, 0],
      [-1.75, 5.1, 0],
      [0, 5.3, 0],
      [1.75, 5.1, 0],
      [3.35, 4.62, 0],
      [4.55, 3.96, 0]
    ],
    14
  );
  appendTonedRawMesh(
    arch,
    tubeSweepMesh(
      spanPts.map((p, idx): V4 => {
        const u = idx / Math.max(1, spanPts.length - 1);
        const swell = 0.19 + 0.03 * Math.sin(u * Math.PI);
        return [p[0], p[1], p[2], swell];
      }),
      26
    ),
    plum
  );
  const archRing = latheMesh([[0.19, -0.055], [0.245, -0.04], [0.25, 0], [0.245, 0.04], [0.19, 0.055]], 28);
  for (const frac of [0.18, 0.36, 0.64, 0.82] as const) {
    const idx = Math.min(spanPts.length - 2, Math.max(1, Math.round(frac * (spanPts.length - 1))));
    const p = spanPts[idx]!;
    const pNext = spanPts[idx + 1]!;
    const pPrev = spanPts[idx - 1]!;
    const tangentAngle = Math.atan2(pNext[1] - pPrev[1], pNext[0] - pPrev[0]);
    appendTonedRawMesh(
      arch,
      transformMesh(archRing, { pos: [p[0], p[1], p[2]], rot: [0, 0, tangentAngle - Math.PI * 0.5] }),
      brass
    );
  }

  // Crowned miniature golden paint-pot finial with cobalt meniscus & bail atop the arch keystone
  appendTonedRawMesh(
    arch,
    transformMesh(
      latheMesh(
        [
          [0, 0],
          [0.28, 0],
          [0.31, 0.06],
          [0.35, 0.54],
          [0.39, 0.6],
          [0.39, 0.65],
          [0.32, 0.65],
          [0.3, 0.56],
          [0, 0.56]
        ],
        32
      ),
      { pos: [0, 5.44, 0] }
    ),
    brass
  );
  appendTonedRawMesh(
    arch,
    transformMesh(latheMesh([[0, 0.52], [0.31, 0.52], [0.22, 0.61], [0, 0.63]], 28), { pos: [0, 5.44, 0] }),
    cobalt
  );

  // Smooth rounded scalloped festival shield pennants hanging beneath the arch curve
  const bannerPoly: V2[] = [];
  const bannerSteps = 14;
  for (let i = 0; i <= bannerSteps; i += 1) {
    const u = i / bannerSteps;
    const x = -0.3 + u * 0.6;
    const y = -0.14 - 0.52 * Math.pow(Math.sin(u * Math.PI), 1.35);
    bannerPoly.push([x, y]);
  }
  bannerPoly.push([0.3, 0.03], [-0.3, 0.03]);
  for (const bx of [-2.55, -1.28, 1.28, 2.55] as const) {
    const archY = 5.26 - (bx * bx) * 0.062;
    appendTonedRawMesh(
      arch,
      transformMesh(taubinSmoothMesh(extrudePolygonMesh(bannerPoly, 0.06, 0.018, false), 2), {
        pos: [bx, archY - 0.16, -0.03]
      }),
      bx < 0 ? mint : rose
    );
  }

  // 2. Smooth Rival Gyro-Sweeper Mascot (`sculptOrganicSdfMesh` pod body + wraparound visor & glossy eyes + `sculptCurvedHairLockMesh` crest locks + dual 32-seg plush paint rollers)
  const sw = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[], tones: [] as number[] };
  // 32-segment spun-brass hover pedestal & gyro collar
  appendTonedRawMesh(
    sw,
    latheMesh(
      [
        [0, 0],
        [0.32, 0],
        [0.34, 0.06],
        [0.27, 0.18],
        [0.20, 0.28],
        [0, 0.30]
      ],
      32
    ),
    brass
  );
  appendTonedRawMesh(
    sw,
    latheMesh([[0.22, 0.68], [0.29, 0.72], [0.29, 0.80], [0.22, 0.84]], 32),
    brass
  );
  // Seamless SDF-sculpted & Taubin-faired mascot pod body (`getSweeperMascotPodMesh`)
  appendTonedRawMesh(sw, getSweeperMascotPodMesh(), ivory);

  // Sporty wraparound visor + twin expressive glossy eyes with catchlights
  const swVisor = taubinSmoothMesh(
    deformMesh(
      sculptStreamlinedHullMesh(0.22, 0.44, 0.13, {
        noseSharpness: 0.36,
        tailTaper: 0.52,
        canopyBulge: 0.26,
        undersideFlat: 0.32,
        stations: 16,
        ringPoints: 26
      }),
      ([x, y, z]) => [x, y + 0.015 * Math.cos((x / 0.24) * Math.PI * 0.5), z - 0.22 * (x * x) / 0.05]
    ),
    4
  );
  appendTonedRawMesh(sw, transformMesh(swVisor, { pos: [0, 1.03, 0.19], rot: [0.06, 0, 0] }), plum);
  const swEyeOrb = icosphereSmoothMesh(1, 2, 0, 41);
  const swEyePip = icosphereSmoothMesh(1, 1, 0, 41);
  for (const sgn of [-1, 1] as const) {
    appendTonedRawMesh(
      sw,
      transformMesh(swEyeOrb, { pos: [sgn * 0.088, 1.02, 0.282], rot: [0, sgn * 0.16, 0], scale: [0.048, 0.058, 0.024] }),
      white
    );
    appendTonedRawMesh(
      sw,
      transformMesh(swEyeOrb, { pos: [sgn * 0.088, 1.018, 0.294], rot: [0, sgn * 0.16, 0], scale: [0.034, 0.042, 0.018] }),
      vermilion
    );
    appendTonedRawMesh(
      sw,
      transformMesh(swEyePip, { pos: [sgn * 0.088, 1.016, 0.304], rot: [0, sgn * 0.16, 0], scale: [0.019, 0.026, 0.014] }),
      darkPlum
    );
    appendTonedRawMesh(
      sw,
      transformMesh(swEyePip, { pos: [sgn * 0.098, 1.036, 0.309], scale: [0.011, 0.011, 0.008] }),
      white
    );
  }

  // 4 curved tentacle / paint-splash crest locks (`sculptCurvedHairLockMesh`) with glossy pigment tips
  const swCrests: readonly { root: V3; mid: V3; tip: V3; w: number; baseRgb: readonly [number, number, number]; tipRgb: readonly [number, number, number] }[] = [
    { root: [0, 1.28, 0.04], mid: [0, 1.48, -0.14], tip: [0, 1.28, -0.34], w: 0.14, baseRgb: plum, tipRgb: cadmium },
    { root: [-0.11, 1.24, 0.01], mid: [-0.24, 1.38, -0.14], tip: [-0.31, 1.14, -0.28], w: 0.115, baseRgb: rose, tipRgb: mint },
    { root: [0.11, 1.24, 0.01], mid: [0.24, 1.38, -0.14], tip: [0.31, 1.14, -0.28], w: 0.115, baseRgb: mint, tipRgb: rose },
    { root: [0, 1.20, -0.12], mid: [0, 1.26, -0.32], tip: [0, 1.02, -0.42], w: 0.11, baseRgb: cobalt, tipRgb: cadmium }
  ];
  for (const cr of swCrests) {
    const tipStart: V3 = [
      cr.mid[0] * 0.35 + cr.tip[0] * 0.65,
      cr.mid[1] * 0.35 + cr.tip[1] * 0.65,
      cr.mid[2] * 0.35 + cr.tip[2] * 0.65
    ];
    const tipMid: V3 = [
      cr.mid[0] * 0.12 + cr.tip[0] * 0.88,
      cr.mid[1] * 0.12 + cr.tip[1] * 0.88,
      cr.mid[2] * 0.12 + cr.tip[2] * 0.88
    ];
    appendTonedRawMesh(
      sw,
      sculptCurvedHairLockMesh({
        root: cr.root,
        mid: cr.mid,
        tip: cr.tip,
        width: cr.w,
        thickness: cr.w * 0.72,
        segments: 12,
        radialSegments: 12
      }),
      cr.baseRgb
    );
    appendTonedRawMesh(
      sw,
      sculptCurvedHairLockMesh({
        root: tipStart,
        mid: tipMid,
        tip: [cr.tip[0], cr.tip[1] - 0.01, cr.tip[2] - 0.01],
        width: cr.w * 0.68,
        thickness: cr.w * 0.56,
        segments: 8,
        radialSegments: 12
      }),
      cr.tipRgb
    );
  }

  // Smooth sculpted dual lateral sweeper arms (`sculptAnatomicalLimbMesh`) & 32-segment plush paint rollers
  const rollerDrum = latheMesh(
    [
      [0, -0.29],
      [0.175, -0.29],
      [0.22, -0.235],
      [0.235, 0],
      [0.22, 0.235],
      [0.175, 0.29],
      [0, 0.29]
    ],
    32
  );
  const rollerEndCap = latheMesh([[0, 0], [0.17, 0], [0.148, 0.042], [0, 0.048]], 28);
  for (const sgn of [-1, 1] as const) {
    appendTonedRawMesh(
      sw,
      sculptAnatomicalLimbMesh(
        [
          { pos: [sgn * 0.21, 0.88, 0], rx: 0.068, rz: 0.068 },
          { pos: [sgn * 0.39, 0.90, 0.02], rx: 0.056, rz: 0.056 },
          { pos: [sgn * 0.56, 0.90, 0], rx: 0.048, rz: 0.048 }
        ],
        { ringPoints: 16, capEnds: true }
      ),
      brass
    );
    const rx = sgn * 0.58;
    appendTonedRawMesh(sw, transformMesh(rollerDrum, { pos: [rx, 0.90, 0], rot: [0, 0, Math.PI * 0.5] }), sgn < 0 ? rose : mint);
    for (const capSgn of [-1, 1] as const) {
      appendTonedRawMesh(
        sw,
        transformMesh(rollerEndCap, { pos: [rx + capSgn * 0.285, 0.90, 0], rot: [0, 0, -capSgn * Math.PI * 0.5] }),
        brass
      );
    }
  }

  const { tones: archTones, ...archMesh } = arch;
  const { tones: sweeperTones, ...sweeperMesh } = sw;
  cachedFinishAndSweeper = { archMesh, archTones, sweeperMesh, sweeperTones };
  return cachedFinishAndSweeper;
}
