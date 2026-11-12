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
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type TransformOpts,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
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
  practicalCyanGlow: 22
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
  unnamed(material.emissive({ color: "#e4fbff", emissive: "#6ee7ff", emissiveIntensity: 2.0, roughness: 0.16, practical: true }))
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
  // Inverted terraced crag hanging beneath y = 0
  slots.push({
    mesh: transformMesh(
      stratifiedCliffMesh({ radiusX: rx, radiusZ: rz, height: depth * 0.78, terraces: 5, seed }),
      { pos: [0, -0.06, 0], rot: [Math.PI, 0, 0] }
    ),
    materialIndex: MAT.cliffLimestone
  });
  slots.push({
    mesh: transformMesh(
      stratifiedCliffMesh({ radiusX: rx * 0.56, radiusZ: rz * 0.54, height: depth * 0.52, terraces: 3, seed: seed + 19 }),
      { pos: [0.12, -depth * 0.54, -0.08], rot: [Math.PI, 0.4, 0] }
    ),
    materialIndex: MAT.cliffOchre
  });
  // Mossy studio turf rim
  const turfProfile: V2[] = [
    [0, -0.14],
    [rx * 0.94, -0.14],
    [rx * 0.98, -0.02],
    [rx * 0.9, 0.06],
    [0, 0.06]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(turfProfile, 20), { scale: [1, 1, rz / rx] }),
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
      mesh: transformMesh(bevelBoxMesh(lenX, 0.1, plankW, 0.02), { pos: [0, 0.09, z] }),
      materialIndex: MAT.beechTimber
    });
  }
  // Turned brass deck corner studs
  const studProfile: V2[] = [[0, 0], [0.09, 0], [0.09, 0.05], [0.05, 0.08], [0, 0.08]];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    slots.push({
      mesh: transformMesh(latheMesh(studProfile, 12), { pos: [sx * rx * 0.52, 0.13, sz * rz * 0.48] }),
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
  const ringPts = 16;
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
  slots.push({ mesh: loftSectionsMesh(tubeRings, true, false), materialIndex: MAT.brushedAluminum });

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
    mesh: transformMesh(bevelBoxMesh(0.96, 0.11, 0.085, 0.018), { pos: [0, 0.055, 0] }),
    materialIndex: MAT.brushedAluminum
  });

  // Threaded brass nozzle neck
  const neckProfile: V2[] = [
    [0, 1.54], [0.125, 1.54], [0.125, 1.62], [0.105, 1.64],
    [0.12, 1.67], [0.1, 1.71], [0.085, 1.74], [0, 1.74]
  ];
  slots.push({ mesh: latheMesh(neckProfile, 16), materialIndex: MAT.turnedBrass });

  // Fluted Designer-Toy cap (either screwed on or resting beside the open nozzle)
  const capRing: V2[] = Array.from({ length: 16 }, (_, i): V2 => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.155 : 0.132;
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
      6
    );
    const ribbonSpine: V4[] = curvePts.map((p, idx) => {
      const t = idx / Math.max(1, curvePts.length - 1);
      const rad = 0.075 + Math.sin(t * Math.PI) * 0.045 * (1 - t * 0.35);
      return [p[0], p[1], p[2], rad];
    });
    slots.push({ mesh: tubeSweepMesh(ribbonSpine, 10), materialIndex: pigmentMat });
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

  const jarWall = bezierCurve2([0.34, 0.06], [0.44, 0.32], [0.43, 0.76], [0.24, 0.94], 10);
  const jarProfile: V2[] = [
    [0, 0],
    [0.31, 0],
    ...jarWall,
    [0.23, 1.08],
    [0.27, 1.12],
    [0.27, 1.17],
    [0, 1.17]
  ];
  glassMeshes.push(latheMesh(jarProfile, 20));

  // Inner glossy pigment pool visible through translucent glass
  const fillProfile: V2[] = [
    [0, 0.06],
    [0.28, 0.06],
    [0.35, 0.34],
    [0.34, 0.68],
    [0.26, 0.74],
    [0, 0.71]
  ];
  slots.push({ mesh: latheMesh(fillProfile, 18), materialIndex: pigmentMat });

  // Spun brass collar ring + natural cork stopper
  const collarProfile: V2[] = [
    [0.22, 1.02], [0.285, 1.02], [0.285, 1.11], [0.22, 1.11]
  ];
  slots.push({ mesh: latheMesh(collarProfile, 18), materialIndex: MAT.turnedBrass });

  const corkProfile: V2[] = [
    [0, 1.09], [0.205, 1.09], [0.245, 1.32], [0.22, 1.35], [0, 1.35]
  ];
  slots.push({ mesh: latheMesh(corkProfile, 16), materialIndex: MAT.corkStopper });

  return { slots, glassMeshes };
}

/**
 * Turned wood-and-lacquer artist paintbrush (`y = 0..3.15`):
 * `latheMesh` swelled handle + double-beaded crimped brass ferrule + `loftSectionsMesh` bristle tuft & dipped tip.
 */
function paintbrushSlots(handleMat: number, tipMat: number): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const lowerGrip = bezierCurve2([0.032, 0.04], [0.065, 0.48], [0.145, 1.18], [0.118, 1.88], 12);
  const handleProfile: V2[] = [[0, 0], ...lowerGrip, [0.105, 2.04], [0, 2.04]];
  slots.push({ mesh: latheMesh(handleProfile, 16), materialIndex: handleMat });

  // Double-beaded crimped brass ferrule
  const ferruleProfile: V2[] = [
    [0, 2.02], [0.114, 2.02], [0.128, 2.06], [0.114, 2.1],
    [0.116, 2.34], [0.13, 2.38], [0.112, 2.42], [0.106, 2.52], [0, 2.52]
  ];
  slots.push({ mesh: latheMesh(ferruleProfile, 16), materialIndex: MAT.turnedBrass });

  // Sculpted hog-bristle belly tapering to a chisel edge, plus wet-pigment dipped tip
  const ringN = 14;
  const mkRing = (y: number, rx: number, rz: number): V3[] =>
    Array.from({ length: ringN }, (_, i): V3 => {
      const a = (i / ringN) * Math.PI * 2;
      return [Math.cos(a) * rx, y, Math.sin(a) * rz];
    });
  slots.push({
    mesh: loftSectionsMesh([
      mkRing(2.5, 0.104, 0.098),
      mkRing(2.68, 0.148, 0.088),
      mkRing(2.86, 0.136, 0.058)
    ], true, false),
    materialIndex: MAT.linenCanvas
  });
  slots.push({
    mesh: loftSectionsMesh([
      mkRing(2.84, 0.138, 0.06),
      mkRing(3.02, 0.112, 0.032),
      mkRing(3.16, 0.068, 0.012)
    ], true, false),
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
  slots.push({ mesh: latheMesh(bodyProfile, 18), materialIndex: MAT.brushedAluminum });

  // Color-coded glossy shoulder dome + wrap label
  const domeCurve = bezierCurve2([0.308, 1.23], [0.3, 1.38], [0.18, 1.48], [0.095, 1.5], 8);
  slots.push({
    mesh: latheMesh([[0, 0.42], [0.326, 0.42], [0.326, 0.96], [0, 0.96]], 18),
    materialIndex: domeMat
  });
  slots.push({
    mesh: latheMesh([[0, 1.23], ...domeCurve, [0, 1.5]], 18),
    materialIndex: domeMat
  });

  // Brass valve cup + white actuator cap
  slots.push({
    mesh: latheMesh([[0, 1.49], [0.105, 1.49], [0.105, 1.55], [0.045, 1.56], [0, 1.56]], 14),
    materialIndex: MAT.turnedBrass
  });
  slots.push({
    mesh: latheMesh([[0, 1.55], [0.082, 1.55], [0.082, 1.68], [0.068, 1.7], [0, 1.7]], 14),
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
    mesh: transformMesh(latheMesh(tankProfile, 20), { pos: [0, 0.56, 0], rot: [0, 0, Math.PI * 0.5] }),
    materialIndex: MAT.paintCobalt
  });

  // 4 vulcanized rubber isolator feet + saddle legs
  const footProfile: V2[] = [[0, 0], [0.12, 0], [0.1, 0.14], [0.07, 0.18], [0, 0.18]];
  for (const [fx, fz] of [[-0.44, -0.26], [0.44, -0.26], [0.44, 0.26], [-0.44, 0.26]] as const) {
    slots.push({ mesh: transformMesh(latheMesh(footProfile, 12), { pos: [fx, 0, fz] }), materialIndex: MAT.rubberHose });
  }

  // Finned aluminum piston head + carry handle
  for (let f = 0; f < 5; f += 1) {
    const y = 0.98 + f * 0.085;
    const w = f === 4 ? 0.44 : 0.38;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(w, 0.048, 0.36, 0.01), { pos: [-0.14, y, 0] }),
      materialIndex: MAT.brushedAluminum
    });
  }
  const handlePts = catmullRomSpline3([[-0.42, 1.38, 0], [-0.14, 1.58, 0], [0.24, 1.54, 0], [0.36, 0.96, 0]], 6);
  slots.push({
    mesh: tubeSweepMesh(handlePts.map((p): V4 => [p[0], p[1], p[2], 0.036]), 8),
    materialIndex: MAT.steelTruss
  });

  // Brass pressure regulator & illuminated dial face
  slots.push({
    mesh: transformMesh(latheMesh([[0, 0], [0.16, 0], [0.16, 0.11], [0, 0.11]], 16), { pos: [0.34, 1.12, 0.18], rot: [Math.PI * 0.5, 0, 0] }),
    materialIndex: MAT.turnedBrass
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, 0], [0.12, 0], [0.12, 0.03], [0, 0.03]], 16), { pos: [0.34, 1.12, 0.23], rot: [Math.PI * 0.5, 0, 0] }),
    materialIndex: MAT.practicalWarmGlow
  });

  // Coiled braided airbrush hose
  const coilCtrl: V3[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    const ang = t * Math.PI * 5.2;
    coilCtrl.push([0.52 + t * 0.48 + Math.cos(ang) * 0.18, 0.96 - t * 0.72 + Math.sin(ang) * 0.1, 0.22 + Math.sin(ang) * 0.22]);
  }
  const hosePts = catmullRomSpline3(coilCtrl, 4);
  slots.push({
    mesh: tubeSweepMesh(hosePts.map((p): V4 => [p[0], p[1], p[2], 0.032]), 8),
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
  const trunkPts = catmullRomSpline3([[-0.35, 0.08, -0.15], [-0.52, 0.92, 0.05], [-0.22, 1.78, -0.12], [-0.38, 2.55, 0.08]], 6);
  out.slots.push({
    mesh: tubeSweepMesh(trunkPts.map((p, i): V4 => [p[0], p[1], p[2], 0.34 * (1 - (i / trunkPts.length) * 0.52)]), 10),
    materialIndex: MAT.beechTimber
  });
  out.slots.push({
    mesh: transformMesh(layeredCanopyMesh({ radius: 1.55, height: 1.48, puffs: 9, seed: 43 }), { pos: [-0.36, 2.15, 0.04] }),
    materialIndex: MAT.paintMint
  });
  out.slots.push({
    mesh: transformMesh(icosphereFacetMesh(0.46, 1, 0.12, 71), { pos: [-0.88, 3.05, 0.36], scale: [1.15, 0.72, 1.05] }),
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

  // Tilted chrome paint bucket + curved wire bail handle + wet cobalt rim pool
  const bucketProfile: V2[] = [
    [0, 0], [0.58, 0], [0.62, 0.06], [0.74, 1.38],
    [0.79, 1.42], [0.79, 1.48], [0.71, 1.48], [0.68, 1.32], [0, 1.32]
  ];
  const bucketGroup: MultiMatSlot[] = [
    { mesh: latheMesh(bucketProfile, 22), materialIndex: MAT.chromeBucket },
    { mesh: latheMesh([[0, 1.24], [0.69, 1.24], [0.69, 1.36], [0, 1.36]], 20), materialIndex: MAT.paintCobalt }
  ];
  const bailPts = catmullRomSpline3([[-0.76, 1.38, 0], [-0.82, 1.95, -0.18], [0, 2.28, -0.25], [0.82, 1.95, -0.18], [0.76, 1.38, 0]], 5);
  bucketGroup.push({
    mesh: tubeSweepMesh(bailPts.map((p): V4 => [p[0], p[1], p[2], 0.032]), 8),
    materialIndex: MAT.turnedBrass
  });
  for (const s of transformSlots(bucketGroup, { pos: [0, 1.72, -0.08], rot: [0.98, 0, 0] })) out.slots.push(s);

  // Sweeping `loftSectionsMesh` glossy paint cascade pouring over the front island lip
  const cascadeRows: readonly { pos: V3; rx: number; rz: number }[] = [
    { pos: [0, 2.08, 0.72], rx: 0.42, rz: 0.12 },
    { pos: [0, 1.56, 1.18], rx: 0.56, rz: 0.14 },
    { pos: [0, 0.78, 1.54], rx: 0.72, rz: 0.16 },
    { pos: [0, -0.22, 1.78], rx: 0.64, rz: 0.15 },
    { pos: [0, -1.28, 1.86], rx: 0.36, rz: 0.11 }
  ];
  const cascadeRings: V3[][] = cascadeRows.map(({ pos, rx, rz }, rIdx) =>
    Array.from({ length: 14 }, (_, i): V3 => {
      const a = (i / 14) * Math.PI * 2;
      const wobble = 0.92 + hash01(rIdx * 31 + i * 17) * 0.18;
      return [pos[0] + Math.cos(a) * rx * wobble, pos[1] + Math.sin(a) * rz * 0.35, pos[2] + Math.sin(a) * rz];
    })
  );
  out.slots.push({ mesh: loftSectionsMesh(cascadeRings, true, false), materialIndex: MAT.paintCobalt });

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
  // Sculpted kidney-shaped beechwood artist thumb-hole palette angled heroically toward the road
  const kidneyRing: V2[] = [
    [-1.65, -0.25], [-1.32, -0.98], [-0.45, -1.22], [0.62, -1.14],
    [1.48, -0.68], [1.72, 0.14], [1.34, 0.96], [0.48, 1.24],
    [-0.48, 1.12], [-0.95, 0.68], [-0.55, 0.34], [-0.62, -0.06], [-1.18, 0.12]
  ];
  const paletteSlots: MultiMatSlot[] = [
    { mesh: extrudePolygonMesh(kidneyRing, 0.16, 0.035, false), materialIndex: MAT.beechTimber },
    // Brass thumb-hole grommet bezel
    {
      mesh: transformMesh(latheMesh([[0.22, -0.1], [0.31, -0.1], [0.31, 0.1], [0.22, 0.1]], 16), { pos: [-0.88, 0.24, 0], rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: MAT.turnedBrass
    }
  ];
  const dollopMats = [MAT.paintVermilion, MAT.paintCadmium, MAT.paintMint, MAT.paintCobalt, MAT.paintViolet] as const;
  const dollopXY: readonly V2[] = [[-0.95, -0.66], [-0.08, -0.86], [0.88, -0.62], [1.18, 0.22], [0.36, 0.78]];
  const dollopProfile: V2[] = [[0, 0], [0.28, 0], [0.3, 0.08], [0.22, 0.22], [0.08, 0.32], [0, 0.35]];
  for (let i = 0; i < dollopMats.length; i += 1) {
    const [dx, dy] = dollopXY[i]!;
    paletteSlots.push({
      mesh: transformMesh(latheMesh(dollopProfile, 16), { pos: [dx, dy, 0.08], rot: [Math.PI * 0.5, 0, 0] }),
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
  // 12-gore polychrome clearcoat hot-air balloon envelope (`loftSectionsMesh` per alternating colour pair)
  const goreCount = 12;
  const envCurve = bezierCurve2([0.52, 1.45], [1.95, 2.35], [2.25, 4.45], [0.18, 5.45], 12);
  const goreMats = [MAT.paintVermilion, MAT.paintIvory, MAT.paintCobalt, MAT.paintCadmium, MAT.paintMagenta, MAT.paintMint] as const;
  for (let g = 0; g < goreCount; g += 1) {
    const a0 = (g / goreCount) * Math.PI * 2;
    const a1 = ((g + 1) / goreCount) * Math.PI * 2;
    const aMid = (a0 + a1) * 0.5;
    const sections: V3[][] = envCurve.map(([r, y]) => {
      const puff = 1.04;
      const rIn = Math.max(0.02, r * 0.88);
      return [
        [Math.cos(a0) * r, y, Math.sin(a0) * r],
        [Math.cos(aMid) * r * puff, y, Math.sin(aMid) * r * puff],
        [Math.cos(a1) * r, y, Math.sin(a1) * r],
        [Math.cos(aMid) * rIn, y, Math.sin(aMid) * rIn]
      ];
    });
    slots.push({
      mesh: loftSectionsMesh(sections, true, false),
      materialIndex: goreMats[g % goreMats.length]!
    });
  }

  // Spun brass throat skirt, crown cap & practical radiant burner coil
  slots.push({
    mesh: latheMesh([[0.46, 1.32], [0.58, 1.32], [0.58, 1.48], [0.46, 1.48]], 20),
    materialIndex: MAT.turnedBrass
  });
  slots.push({
    mesh: latheMesh([[0, 5.42], [0.44, 5.42], [0.28, 5.58], [0, 5.62]], 18),
    materialIndex: MAT.turnedBrass
  });
  slots.push({
    mesh: latheMesh([[0, 1.04], [0.22, 1.04], [0.26, 1.24], [0.16, 1.34], [0, 1.34]], 16),
    materialIndex: MAT.practicalWarmGlow
  });

  // 4 braided rigging cables down to woven `material.fabric` studio wicker gondola
  for (const [cx, cz] of [[-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42]] as const) {
    slots.push({
      mesh: tubeSweepMesh([[cx * 0.92, 0.66, cz * 0.92, 0.024], [cx * 1.18, 1.42, cz * 1.18, 0.024]], 6),
      materialIndex: MAT.steelTruss
    });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.96, 0.68, 0.96, 0.08), { pos: [0, 0.34, 0] }), materialIndex: MAT.wickerWeave });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.06, 0.11, 1.06, 0.035), { pos: [0, 0.68, 0] }), materialIndex: MAT.beechTimber });

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
    const dropWall = bezierCurve2([0.48, -0.35], [0.56, 0.08], [0.24, 0.58], [0.02, 0.92], 12);
    const dropProfile: V2[] = [[0, -0.68], [0.28, -0.64], ...dropWall, [0, 0.94]];
    slots.push({ mesh: latheMesh(dropProfile, 20), materialIndex: MAT.paintViolet });
    slots.push({
      mesh: latheMesh([[0.66, -0.08], [0.76, -0.08], [0.76, 0.08], [0.66, 0.08]], 22),
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
      mesh: transformMesh(icosphereFacetMesh(0.18, 1, 0.04, 19), { pos: [0, 0.98, 0] }),
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
      mesh: transformMesh(icosphereFacetMesh(0.24, 1, 0.03, 23), { pos: [0, 0.06, 0], scale: [1, 1, 0.78] }),
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
      mesh: transformMesh(latheMesh([[0.82, -0.06], [0.92, -0.06], [0.92, 0.06], [0.82, 0.06]], 24), { rot: [0.68, 0.24, 0] }),
      materialIndex: MAT.turnedBrass
    });
    slots.push({
      mesh: icosphereFacetMesh(0.24, 1, 0.03, 37),
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
      const spline = catmullRomSpline3(ctrl, 5);
      const spine: V4[] = spline.map((p, idx) => {
        const u = idx / Math.max(1, spline.length - 1);
        const rad = 0.05 + Math.pow(1 - u, 0.65) * 0.19;
        return [p[0], p[1], p[2], rad];
      });
      slots.push({
        mesh: tubeSweepMesh(spine, 12),
        materialIndex: sIdx === 0 ? MAT.paintMint : MAT.paintMagenta
      });
    }
    slots.push({
      mesh: transformMesh(latheMesh([[0.78, -0.06], [0.88, -0.06], [0.88, 0.06], [0.78, 0.06]], 24), { rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: MAT.turnedBrass
    });
    const pipMats = [MAT.paintVermilion, MAT.paintCobalt, MAT.paintCadmium, MAT.paintViolet] as const;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      slots.push({
        mesh: transformMesh(icosphereFacetMesh(0.13, 1, 0, 51 + i), { pos: [Math.cos(a) * 0.83, Math.sin(a) * 0.83, 0] }),
        materialIndex: pipMats[i]!
      });
    }
    slots.push({
      mesh: icosphereFacetMesh(0.22, 1, 0.02, 61),
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
