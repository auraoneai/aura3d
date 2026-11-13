/**
 * Beat Hopper (`WP-18`) — Native `@aura3d/engine` 5.5.1 Procedural Multi-Material
 * Festival Concert Stage, Synthwave Architecture & Articulated Skater-Bot Library.
 *
 * Replaces all static Meshy `.glb` mounts (`bhSpeakerStack`, `bhSpeakerStackB`, `bhTurntable`)
 * and stacked-box programmer-art placeholders with curved, multi-part, multi-material 3D
 * geometry built on `showcase-port-shared/proceduralKernel` (zero `three` imports):
 *   - Curved J-hang concert line-array speaker towers (`loftSectionsMesh` waveguides +
 *     `latheMesh` excursion woofer cones & bullet phase plugs + `latticeTrussMesh` fly-rigs)
 *   - Folded-horn club subwoofers crowned by stepped Eurorack analog modular synth towers
 *     with `catmullRomSpline3` -> `tubeSweepMesh` patch cables & rotary filter pots
 *   - Aluminum box-truss concert lighting booms (`latticeTrussMesh`) with yoke-mounted
 *     moving-head beam luminaires & `material.physical` (`castShadow: false`) strobe lenses
 *   - Floating twin direct-drive DJ turntable consoles (`latheMesh` strobed platters,
 *     S-curved tubular tonearms, 4-channel club mixer & holographic acrylic shield)
 *   - Hero multi-material 132 BPM Judgement-Threshold Synth Gate (`assembleMultiMaterialNode`)
 *   - Aerodynamic synth-skater bot rig + sculpted corridor obstacles preserving exact `0.97 m`
 *     duck clearance under `BAR_SIZE.y = 1.12`.
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  catmullRomSpline3,
  extrudePolygonMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptHumanoidLimbMesh,
  srgbHexToLinearRgba,
  subdivideSmoothMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import { BAR_SIZE, BLOCK_SIZE, ORB_RADIUS, WALL_SIZE, type ColoredMeshData } from "../meshes";

export interface ToneMeshParts {
  readonly mesh: ColoredMeshData;
  readonly tones: number[];
}

// Material slot indices shared across concert-stage sub-assemblies
const SLOT_CABINET = 0;
const SLOT_METAL = 1;
const SLOT_CONE_DARK = 2;
const SLOT_FABRIC = 3;
const SLOT_CHROME = 4;
const SLOT_GLOW_PRIMARY = 5;
const SLOT_GLOW_ACCENT = 6;

// ---------------------------------------------------------------------------
// Mesh Conversion & Exact Metric Calibration Helpers
// ---------------------------------------------------------------------------

export function rawToMeshData(raw: RawMesh): ColoredMeshData {
  const vCount = Math.floor(raw.positions.length / 3);
  const hasColors = Boolean(raw.colors && raw.colors.length >= vCount * 4);
  return {
    positions: raw.positions.slice(),
    normals: raw.normals.slice(),
    uvs: raw.uvs.slice(),
    indices: raw.indices.slice(),
    ...(hasColors ? { colors: raw.colors!.slice(0, vCount * 4) } : {})
  };
}

function mergeRawList(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const anyColors = parts.some((m) => Boolean(m.colors && m.colors.length >= Math.floor(m.positions.length / 3) * 4));
  const colors: number[] = [];
  for (const m of parts) {
    const vOff = positions.length / 3;
    const vCount = Math.floor(m.positions.length / 3);
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
    if (anyColors) {
      const mHas = Boolean(m.colors && m.colors.length >= vCount * 4);
      if (mHas) {
        for (let i = 0; i < vCount * 4; i += 1) colors.push(m.colors![i]!);
      } else {
        for (let i = 0; i < vCount; i += 1) colors.push(1, 1, 1, 1);
      }
    }
  }
  return anyColors ? { positions, normals, uvs, indices, colors } : { positions, normals, uvs, indices };
}

function mergeToneParts(entries: readonly { readonly mesh: RawMesh; readonly hex: string; readonly boost?: number }[]): ToneMeshParts {
  const rawParts: RawMesh[] = [];
  const tones: number[] = [];
  for (const entry of entries) {
    rawParts.push(entry.mesh);
    const [r, g, b] = srgbHexToLinearRgba(entry.hex);
    const k = entry.boost ?? 1;
    const vCount = Math.floor(entry.mesh.positions.length / 3);
    for (let i = 0; i < vCount; i += 1) {
      tones.push(r * k, g * k, b * k);
    }
  }
  return { mesh: rawToMeshData(mergeRawList(rawParts)), tones };
}

function measureSlotsBounds(slots: readonly MultiMatSlot[]): { min: [number, number, number]; max: [number, number, number] } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const { mesh } of slots) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!, y = mesh.positions[i + 1]!, z = mesh.positions[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX)) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/** Scales a multi-slot assembly uniformly to `targetHeight` with its feet locked at `minY = 0`. */
function fitSlotsToHeightGrounded(slots: readonly MultiMatSlot[], targetHeight: number): MultiMatSlot[] {
  const { min, max } = measureSlotsBounds(slots);
  const spanY = Math.max(1e-4, max[1] - min[1]);
  const s = targetHeight / spanY;
  const cx = (min[0] + max[0]) * 0.5;
  const cz = (min[2] + max[2]) * 0.5;
  return slots.map((slot) => ({
    materialIndex: slot.materialIndex,
    mesh: transformMesh(slot.mesh, {
      pos: [-cx * s, -min[1] * s, -cz * s],
      scale: s
    })
  }));
}

/** Scales a multi-slot assembly uniformly so its largest axis equals `targetMaxDim`, centered in XZ. */
function fitSlotsToMaxDim(slots: readonly MultiMatSlot[], targetMaxDim: number): {
  readonly slots: MultiMatSlot[];
  readonly scale: number;
  readonly center: V3;
} {
  const { min, max } = measureSlotsBounds(slots);
  const maxSpan = Math.max(1e-4, max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const s = targetMaxDim / maxSpan;
  const cx = (min[0] + max[0]) * 0.5;
  const cy = (min[1] + max[1]) * 0.5;
  const cz = (min[2] + max[2]) * 0.5;
  return {
    scale: s,
    center: [cx, cy, cz],
    slots: slots.map((slot) => ({
      materialIndex: slot.materialIndex,
      mesh: transformMesh(slot.mesh, {
        pos: [-cx * s, -cy * s, -cz * s],
        scale: s
      })
    }))
  };
}

// ---------------------------------------------------------------------------
// Physical Concert-Stage Material Library (>= 7 Distinct `material.*` Presets)
// ---------------------------------------------------------------------------

export interface ConcertStageMaterials {
  // Instancing-safe single-lobe materials (`clearcoat: 0, sheen: 0` for any instance count)
  readonly instCabinetMatte: AuraMaterialSpec;
  readonly instTrussAlloy: AuraMaterialSpec;
  readonly instConeVinylDark: AuraMaterialSpec;
  readonly instNeonMagenta: AuraMaterialSpec;
  readonly instNeonCyan: AuraMaterialSpec;
  readonly instNeonGold: AuraMaterialSpec;
  readonly instNeonViolet: AuraMaterialSpec;
  // Multi-lobe hero physical materials (`clearcoatPaint`, `brushedMetal`, `fabric`, `chrome`, `physical`, `emissive`)
  readonly heroClearcoatCyan: AuraMaterialSpec;
  readonly heroClearcoatViolet: AuraMaterialSpec;
  readonly heroBrushedAluminum: AuraMaterialSpec;
  readonly heroGrilleFabric: AuraMaterialSpec;
  readonly heroChromeTrim: AuraMaterialSpec;
  readonly heroSynthGlass: AuraMaterialSpec;
  readonly heroMagentaEmissive: AuraMaterialSpec;
  readonly heroCyanEmissive: AuraMaterialSpec;
}

let cachedStageMaterials: ConcertStageMaterials | null = null;

export function getConcertStageMaterials(): ConcertStageMaterials {
  if (cachedStageMaterials) return cachedStageMaterials;
  cachedStageMaterials = {
    instCabinetMatte: material.pbr({
      name: "bh-inst-cabinet-matte",
      color: "#13172b",
      roughness: 0.56,
      metalness: 0.18,
      clearcoat: 0,
      sheen: 0,
      envMapIntensity: 1.15
    }),
    instTrussAlloy: material.metal({
      name: "bh-inst-truss-alloy",
      color: "#cdd9eb",
      roughness: 0.24,
      metalness: 0.94,
      clearcoat: 0,
      sheen: 0,
      envMapIntensity: 1.55
    }),
    instConeVinylDark: material.pbr({
      name: "bh-inst-cone-vinyl",
      color: "#0b0e1d",
      roughness: 0.36,
      metalness: 0.22,
      clearcoat: 0,
      sheen: 0,
      envMapIntensity: 1.15
    }),
    instNeonMagenta: material.pbr({
      name: "bh-inst-neon-magenta",
      color: "#28081e",
      emissive: "#ff2e88",
      emissiveIntensity: 1.75,
      practical: true,
      roughness: 0.2,
      metalness: 0.05,
      clearcoat: 0,
      sheen: 0
    }),
    instNeonCyan: material.pbr({
      name: "bh-inst-neon-cyan",
      color: "#04222c",
      emissive: "#00f2ff",
      emissiveIntensity: 1.9,
      practical: true,
      roughness: 0.2,
      metalness: 0.05,
      clearcoat: 0,
      sheen: 0
    }),
    instNeonGold: material.pbr({
      name: "bh-inst-neon-gold",
      color: "#2a1c06",
      emissive: "#ffbe2e",
      emissiveIntensity: 1.85,
      practical: true,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0,
      sheen: 0
    }),
    instNeonViolet: material.pbr({
      name: "bh-inst-neon-violet",
      color: "#160d34",
      emissive: "#8b5cf6",
      emissiveIntensity: 1.8,
      practical: true,
      roughness: 0.2,
      metalness: 0.06,
      clearcoat: 0,
      sheen: 0
    }),
    heroClearcoatCyan: material.clearcoatPaint({
      name: "bh-hero-clearcoat-cyan",
      color: "#00f2ff",
      emissive: "#00f2ff",
      emissiveIntensity: 0.42,
      practical: true,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.7
    }),
    heroClearcoatViolet: material.clearcoatPaint({
      name: "bh-hero-clearcoat-violet",
      color: "#181538",
      roughness: 0.12,
      clearcoat: 0.96,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.55
    }),
    heroBrushedAluminum: material.brushedMetal({
      name: "bh-hero-brushed-aluminum",
      color: "#d4deed",
      roughness: 0.26,
      anisotropy: 0.88,
      envMapIntensity: 1.65
    }),
    heroGrilleFabric: material.fabric({
      name: "bh-hero-grille-fabric",
      color: "#13162d",
      roughness: 0.88,
      sheen: 0.52,
      sheenColor: "#00f2ff",
      sheenRoughness: 0.56,
      envMapIntensity: 0.55
    }),
    heroChromeTrim: material.studioMetal({
      name: "bh-hero-studio-metal",
      color: "#dce8f8",
      roughness: 0.14,
      metalness: 1,
      envMapIntensity: 1.9
    }),
    heroSynthGlass: material.physical({
      name: "bh-hero-synth-glass",
      color: "#c8f4ff",
      roughness: 0.04,
      opacity: 0.42,
      clearcoat: 1,
      ior: 1.5
    }),
    heroMagentaEmissive: material.emissive({
      name: "bh-hero-magenta-emissive",
      color: "#2a1804",
      emissive: "#ffbe2e",
      emissiveIntensity: 2.2,
      practical: true,
      roughness: 0.16
    }),
    heroCyanEmissive: material.emissive({
      name: "bh-hero-cyan-emissive",
      color: "#04222c",
      emissive: "#00f2ff",
      emissiveIntensity: 2.35,
      practical: true,
      roughness: 0.16
    })
  };
  return cachedStageMaterials;
}

// ---------------------------------------------------------------------------
// Acoustic Sub-Builders: Revolved Woofer Cones & Moving-Head Beam Luminaires
// ---------------------------------------------------------------------------

/**
 * Revolved excursion woofer driver (`latheMesh`) facing `+Z` at `opts.pos`:
 * die-cast outer basket ring + half-roll surround + exponential concave cone + machined bullet phase plug.
 */
function sculptWooferDriverSlots(opts: {
  readonly radius: number;
  readonly depth: number;
  readonly pos: V3;
  readonly rot?: V3;
  readonly radialSegs?: number;
  readonly plugSlot?: number;
}): MultiMatSlot[] {
  const r = opts.radius;
  const d = opts.depth;
  const segs = opts.radialSegs ?? 18;
  const orient = { pos: opts.pos, rot: opts.rot ?? [Math.PI * 0.5, 0, 0] as V3 };

  // Cast alloy basket flange
  const basketProfile: V2[] = [
    [r * 0.88, 0.0],
    [r * 1.03, 0.008],
    [r * 1.04, d * 0.24],
    [r * 0.93, d * 0.28],
    [r * 0.86, d * 0.12]
  ];
  // Elastomer surround roll + concave carbon-kevlar cone throat
  const coneProfile: V2[] = [
    [r * 0.24, -d * 0.62],
    [r * 0.44, -d * 0.42],
    [r * 0.68, -d * 0.14],
    [r * 0.84, d * 0.08],
    [r * 0.90, d * 0.22],
    [r * 0.95, d * 0.12]
  ];
  // Center bullet phase plug
  const plugProfile: V2[] = [
    [r * 0.25, -d * 0.64],
    [r * 0.22, -d * 0.34],
    [r * 0.14, -d * 0.06],
    [r * 0.04, d * 0.12],
    [0, d * 0.16]
  ];

  return [
    { mesh: transformMesh(latheMesh(basketProfile, segs), orient), materialIndex: SLOT_METAL },
    { mesh: transformMesh(latheMesh(coneProfile, segs), orient), materialIndex: SLOT_CONE_DARK },
    { mesh: transformMesh(latheMesh(plugProfile, Math.max(10, segs - 4)), orient), materialIndex: opts.plugSlot ?? SLOT_METAL }
  ];
}

/** Yoke-mounted concert moving-head beam fixture (`bevelBoxMesh` base + U-yoke + `latheMesh` barrel + emitter). */
function sculptMovingHeadFixtureSlots(opts: {
  readonly pos: V3;
  readonly pitch?: number;
  readonly yaw?: number;
  readonly scale?: number;
  readonly upsideDown?: boolean;
  readonly glowSlot?: number;
}): MultiMatSlot[] {
  const sc = opts.scale ?? 1;
  const sign = opts.upsideDown ? -1 : 1;
  const pitch = opts.pitch ?? (opts.upsideDown ? 0.48 : -0.35);
  const yaw = opts.yaw ?? 0;
  const glowSlot = opts.glowSlot ?? SLOT_GLOW_PRIMARY;
  const slots: MultiMatSlot[] = [];

  const place = (m: RawMesh): RawMesh =>
    transformMesh(m, { pos: opts.pos, rot: [0, yaw, 0], scale: sc });

  // Ballast base housing
  slots.push({
    mesh: place(transformMesh(bevelBoxMesh(0.46, 0.16, 0.36, 0.025), { pos: [0, sign * 0.08, 0] })),
    materialIndex: SLOT_CABINET
  });

  // U-shaped aluminum yoke arms + cross-bridge
  const yokePoly: V2[] = [
    [-0.24, 0], [0.24, 0], [0.24, 0.07], [0.18, 0.07], [0.18, 0.42],
    [0.24, 0.42], [0.24, 0.46], [0.12, 0.46], [0.12, 0.07],
    [-0.12, 0.07], [-0.12, 0.46], [-0.24, 0.46], [-0.24, 0.42],
    [-0.18, 0.42], [-0.18, 0.07], [-0.24, 0.07]
  ];
  slots.push({
    mesh: place(
      transformMesh(extrudePolygonMesh(yokePoly, 0.11, 0.014, true), {
        pos: [0, sign * 0.15, 0],
        scale: [1, sign, 1]
      })
    ),
    materialIndex: SLOT_METAL
  });

  // Ribbed projector head barrel revolved around +Y then pitched toward the runway
  const headPivotY = sign * 0.50;
  const barrelProfile: V2[] = [
    [0, -0.22],
    [0.14, -0.22],
    [0.17, -0.14],
    [0.15, -0.06],
    [0.18, 0.02],
    [0.16, 0.10],
    [0.19, 0.18],
    [0.17, 0.24],
    [0.13, 0.24]
  ];
  slots.push({
    mesh: place(
      transformMesh(latheMesh(barrelProfile, 14), {
        pos: [0, headPivotY, 0],
        rot: [Math.PI * 0.5 + pitch, 0, 0]
      })
    ),
    materialIndex: SLOT_CABINET
  });

  // Glowing front fresnel aperture disc
  const lensProfile: V2[] = [
    [0, 0.235],
    [0.135, 0.238],
    [0.135, 0.252],
    [0, 0.258]
  ];
  slots.push({
    mesh: place(
      transformMesh(latheMesh(lensProfile, 14), {
        pos: [0, headPivotY, 0],
        rot: [Math.PI * 0.5 + pitch, 0, 0]
      })
    ),
    materialIndex: glowSlot
  });

  return slots;
}

/** Trapezoidal cross-section ring in XZ at height `y` (front `+Z` wider than rear `-Z` for horn waveguides). */
function trapezoidSectionXZ(frontW: number, rearW: number, depth: number, y: number, bowZ = 0): V3[] {
  const hf = frontW * 0.5;
  const hr = rearW * 0.5;
  const hd = depth * 0.5;
  return [
    [-hf, y, hd],
    [0, y, hd + bowZ],
    [hf, y, hd],
    [hr, y, -hd],
    [-hr, y, -hd]
  ];
}

// ---------------------------------------------------------------------------
// Assembly 1: Curved J-Hang Concert Line-Array Speaker Tower (`8.6 m` Grounded)
// ---------------------------------------------------------------------------

export function buildLineArrayStackSlots(targetHeight = 8.6): MultiMatSlot[] {
  const raw: MultiMatSlot[] = [];

  // Grounded steel touring bumper plinth + Isolation feet
  raw.push({
    mesh: transformMesh(bevelBoxMesh(2.45, 0.22, 1.85, 0.035), { pos: [0, 0.11, 0] }),
    materialIndex: SLOT_METAL
  });

  // Dual stacked 2x18" bass-reflex touring subwoofers (`loftSectionsMesh` flared horn enclosures)
  for (let tier = 0; tier < 2; tier += 1) {
    const y0 = 0.22 + tier * 1.24;
    const subHull = loftSectionsMesh([
      trapezoidSectionXZ(2.26, 1.86, 1.56, y0 + 0.02, 0.04),
      trapezoidSectionXZ(2.34, 1.92, 1.62, y0 + 0.60, 0.07),
      trapezoidSectionXZ(2.26, 1.86, 1.56, y0 + 1.18, 0.04)
    ], true, true);
    raw.push({ mesh: subHull, materialIndex: SLOT_CABINET });

    // Twin 18" excursion drivers + central rectangular bass-reflex port slot + side handles
    for (const sx of [-0.56, 0.56] as const) {
      raw.push(
        ...sculptWooferDriverSlots({
          radius: 0.44,
          depth: 0.22,
          pos: [sx, y0 + 0.60, 0.80],
          radialSegs: 18,
          plugSlot: SLOT_GLOW_PRIMARY
        })
      );
    }
    raw.push({
      mesh: transformMesh(bevelBoxMesh(0.14, 0.88, 0.08, 0.02), { pos: [0, y0 + 0.60, 0.82] }),
      materialIndex: SLOT_GLOW_PRIMARY
    });
  }

  // Twin vertical forged-aluminum box-truss rigging columns + top cantilevered fly-bumper
  for (const tx of [-1.06, 1.06] as const) {
    raw.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [0.34, 5.75, 0.34], bays: 8, chordRadius: 0.026, braceRadius: 0.015 }),
        { pos: [tx, 5.58, -0.36] }
      ),
      materialIndex: SLOT_METAL
    });
  }
  raw.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [2.56, 0.36, 1.48], bays: 5, chordRadius: 0.028, braceRadius: 0.016 }),
      { pos: [0, 8.32, 0.08] }
    ),
    materialIndex: SLOT_METAL
  });

  // Two underslung moving-head beam cans mounted to the forward fly-bumper chord
  for (const lx of [-0.72, 0.72] as const) {
    raw.push(
      ...sculptMovingHeadFixtureSlots({
        pos: [lx, 8.14, 0.68],
        upsideDown: true,
        pitch: 0.42,
        yaw: lx < 0 ? 0.18 : -0.18,
        scale: 0.88,
        glowSlot: SLOT_GLOW_ACCENT
      })
    );
  }

  // 5-element curved J-hang line-array cluster (progressively splayed downward from top to bottom)
  const elements = 5;
  for (let k = 0; k < elements; k += 1) {
    const frac = k / (elements - 1);
    const splayPitch = -0.04 + frac * frac * 0.44;
    const cy = 7.58 - k * 0.86;
    const cz = 0.16 - frac * frac * 0.48;

    const cab = loftSectionsMesh([
      trapezoidSectionXZ(1.74, 1.28, 0.96, -0.34, 0.06),
      trapezoidSectionXZ(1.80, 1.32, 1.02, 0.0, 0.11),
      trapezoidSectionXZ(1.74, 1.28, 0.96, 0.34, 0.06)
    ], true, true);
    raw.push({
      mesh: transformMesh(cab, { pos: [0, cy, cz], rot: [splayPitch, 0, 0] }),
      materialIndex: SLOT_CABINET
    });

    // Bowed perforated acoustic front grille + central waveguide slot + dual side VU LED bars
    const grille = loftSectionsMesh([
      trapezoidSectionXZ(1.56, 1.50, 0.10, -0.28, 0.09),
      trapezoidSectionXZ(1.60, 1.54, 0.12, 0.0, 0.13),
      trapezoidSectionXZ(1.56, 1.50, 0.10, 0.28, 0.09)
    ], true, false);
    raw.push({
      mesh: transformMesh(grille, { pos: [0, cy, cz + 0.49], rot: [splayPitch, 0, 0] }),
      materialIndex: SLOT_CONE_DARK
    });

    for (const sx of [-0.84, 0.84] as const) {
      raw.push({
        mesh: transformMesh(bevelBoxMesh(0.06, 0.58, 0.09, 0.015), {
          pos: [sx, cy, cz + 0.48],
          rot: [splayPitch, 0, 0]
        }),
        materialIndex: k % 2 === 0 ? SLOT_GLOW_PRIMARY : SLOT_GLOW_ACCENT
      });
      raw.push({
        mesh: transformMesh(bevelBoxMesh(0.07, 0.78, 0.16, 0.015), {
          pos: [sx * 1.06, cy, cz - 0.08],
          rot: [splayPitch, 0, 0]
        }),
        materialIndex: SLOT_METAL
      });
    }
  }

  return fitSlotsToHeightGrounded(raw, targetHeight);
}

// ---------------------------------------------------------------------------
// Assembly 2: Folded-Horn Subwoofer & Analog Modular Synth Tower (`6.6 m`)
// ---------------------------------------------------------------------------

export function buildModularSynthTowerSlots(targetHeight = 6.6): MultiMatSlot[] {
  const raw: MultiMatSlot[] = [];

  // Heavy beveled base Isolator plinth
  raw.push({
    mesh: transformMesh(bevelBoxMesh(2.15, 0.20, 1.65, 0.03), { pos: [0, 0.10, 0] }),
    materialIndex: SLOT_METAL
  });

  // Lower dual-horn folded subwoofer enclosure (`loftSectionsMesh`)
  const hornSub = loftSectionsMesh([
    trapezoidSectionXZ(2.04, 1.72, 1.50, 0.20, 0.04),
    trapezoidSectionXZ(2.12, 1.78, 1.58, 1.25, 0.08),
    trapezoidSectionXZ(1.98, 1.68, 1.46, 2.32, 0.03)
  ], true, true);
  raw.push({ mesh: hornSub, materialIndex: SLOT_CABINET });

  for (const sy of [0.82, 1.74] as const) {
    raw.push(
      ...sculptWooferDriverSlots({
        radius: 0.42,
        depth: 0.24,
        pos: [0, sy, 0.77],
        radialSegs: 18,
        plugSlot: SLOT_GLOW_ACCENT
      })
    );
  }

  // Raked stepped Eurorack Analog Modular Synth Tower (`y = 2.32 .. 5.55`)
  const synthHull = loftSectionsMesh([
    trapezoidSectionXZ(1.88, 1.56, 1.32, 2.32, 0.02),
    trapezoidSectionXZ(1.84, 1.48, 1.16, 3.45, 0.05),
    trapezoidSectionXZ(1.72, 1.36, 0.96, 4.55, 0.04),
    trapezoidSectionXZ(1.58, 1.24, 0.82, 5.52, 0.02)
  ], true, true);
  raw.push({ mesh: synthHull, materialIndex: SLOT_CABINET });

  // Brushed aluminum Eurorack module faceplates + rotary filter pots (`latheMesh`)
  const knobProfile: V2[] = [
    [0, 0],
    [0.065, 0],
    [0.062, 0.06],
    [0.048, 0.085],
    [0, 0.09]
  ];
  const baseKnob = latheMesh(knobProfile, 10);

  for (let row = 0; row < 3; row += 1) {
    const ry = 2.82 + row * 0.86;
    const rz = 0.62 - row * 0.085;
    raw.push({
      mesh: transformMesh(bevelBoxMesh(1.52 - row * 0.08, 0.66, 0.07, 0.015), {
        pos: [0, ry, rz],
        rot: [-0.14, 0, 0]
      }),
      materialIndex: SLOT_METAL
    });
    for (let col = 0; col < 4; col += 1) {
      const kx = -0.48 + col * 0.32;
      raw.push({
        mesh: transformMesh(baseKnob, {
          pos: [kx, ry + 0.12, rz + 0.035],
          rot: [Math.PI * 0.5 - 0.14, 0, 0]
        }),
        materialIndex: SLOT_CONE_DARK
      });
      // 16-step LED sequencer pads along bottom of each rack bay
      raw.push({
        mesh: transformMesh(bevelBoxMesh(0.20, 0.09, 0.05, 0.012), {
          pos: [kx, ry - 0.16, rz + 0.03],
          rot: [-0.14, 0, 0]
        }),
        materialIndex: (row + col) % 2 === 0 ? SLOT_GLOW_ACCENT : SLOT_GLOW_PRIMARY
      });
    }
  }

  // Draped `catmullRomSpline3` -> `tubeSweepMesh` modular synth patch cables arcing across the patchbay!
  const patchArcs: readonly [V3, V3, number][] = [
    [[-0.52, 4.42, 0.50], [0.18, 3.56, 0.58], 0.24],
    [[0.46, 4.46, 0.50], [-0.22, 2.78, 0.66], 0.30],
    [[-0.24, 3.62, 0.58], [0.50, 2.76, 0.66], 0.22],
    [[-0.54, 2.86, 0.66], [0.16, 4.52, 0.49], 0.28]
  ];
  for (let p = 0; p < patchArcs.length; p += 1) {
    const [a, b, sag] = patchArcs[p]!;
    const mid: V3 = [(a[0] + b[0]) * 0.5, Math.min(a[1], b[1]) - sag, Math.max(a[2], b[2]) + 0.24];
    const pts = catmullRomSpline3([a, mid, b], 7, false);
    const spine: V4[] = pts.map((pt) => [pt[0], pt[1], pt[2], 0.024]);
    raw.push({
      mesh: tubeSweepMesh(spine, 7, false),
      materialIndex: p % 2 === 0 ? SLOT_GLOW_ACCENT : SLOT_GLOW_PRIMARY
    });
  }

  // Crown dual flared acoustic compression horns (`latheMesh`)
  const hornProfile: V2[] = [
    [0.08, 0],
    [0.11, 0.16],
    [0.19, 0.34],
    [0.34, 0.52],
    [0.38, 0.56],
    [0.33, 0.56]
  ];
  const horn = latheMesh(hornProfile, 16);
  for (const hx of [-0.44, 0.44] as const) {
    raw.push({
      mesh: transformMesh(horn, { pos: [hx, 5.96, -0.05], rot: [Math.PI * 0.5 + 0.08, 0, 0] }),
      materialIndex: SLOT_METAL
    });
    raw.push({
      mesh: transformMesh(bevelBoxMesh(0.08, 2.95, 0.09, 0.015), { pos: [hx * 2.02, 3.92, 0.48], rot: [-0.13, 0, 0] }),
      materialIndex: SLOT_GLOW_ACCENT
    });
  }

  return fitSlotsToHeightGrounded(raw, targetHeight);
}

// ---------------------------------------------------------------------------
// Assembly 3: Twin Direct-Drive DJ Turntable & Mixer Hover-Console (`5.2 m`)
// ---------------------------------------------------------------------------

export function buildDjTurntableConsoleSlots(targetMaxDim = 5.2): {
  readonly slots: MultiMatSlot[];
  readonly glassShield: RawMesh;
} {
  const raw: MultiMatSlot[] = [];

  // Contoured floating flight-console hull (`loftSectionsMesh`) + twin hover-thruster bells (`latheMesh`)
  const hull = loftSectionsMesh([
    trapezoidSectionXZ(3.85, 3.35, 1.52, -0.52, 0.06),
    trapezoidSectionXZ(4.42, 3.92, 1.92, -0.14, 0.14),
    trapezoidSectionXZ(4.56, 4.08, 2.04, 0.24, 0.16),
    trapezoidSectionXZ(4.36, 3.94, 1.88, 0.42, 0.10)
  ], true, true);
  raw.push({ mesh: hull, materialIndex: SLOT_CABINET });

  const thrusterProfile: V2[] = [
    [0, -0.34],
    [0.52, -0.34],
    [0.58, -0.22],
    [0.44, -0.06],
    [0.36, 0.04]
  ];
  const thrusterGlowProfile: V2[] = [
    [0, -0.36],
    [0.44, -0.36],
    [0.46, -0.31],
    [0, -0.31]
  ];
  for (const tx of [-1.28, 1.28] as const) {
    raw.push({
      mesh: transformMesh(latheMesh(thrusterProfile, 16), { pos: [tx, -0.50, 0] }),
      materialIndex: SLOT_METAL
    });
    raw.push({
      mesh: transformMesh(latheMesh(thrusterGlowProfile, 16), { pos: [tx, -0.50, 0] }),
      materialIndex: SLOT_GLOW_ACCENT
    });
  }

  // Brushed-aluminum top deckplate + glowing wrap-around bumper strip
  raw.push({
    mesh: transformMesh(bevelBoxMesh(4.18, 0.08, 1.72, 0.02), { pos: [0, 0.45, 0.02] }),
    materialIndex: SLOT_METAL
  });
  raw.push({
    mesh: transformMesh(bevelBoxMesh(4.52, 0.07, 2.02, 0.02), { pos: [0, 0.16, 0.04] }),
    materialIndex: SLOT_GLOW_ACCENT
  });

  // Twin direct-drive DJ turntables (`latheMesh` strobed platters, vinyl LPs, center labels & S-curved tonearms)
  const platterRimProfile: V2[] = [
    [0.56, 0.0],
    [0.64, 0.0],
    [0.62, 0.075],
    [0.57, 0.085],
    [0.54, 0.05]
  ];
  const vinylDiscProfile: V2[] = [
    [0.21, 0.052],
    [0.555, 0.052],
    [0.555, 0.094],
    [0.21, 0.094]
  ];
  const recordLabelProfile: V2[] = [
    [0.03, 0.094],
    [0.215, 0.094],
    [0.215, 0.104],
    [0.03, 0.104]
  ];
  const spindleProfile: V2[] = [
    [0, 0.094],
    [0.032, 0.094],
    [0.026, 0.175],
    [0, 0.185]
  ];

  const platterRim = latheMesh(platterRimProfile, 24);
  const vinylDisc = latheMesh(vinylDiscProfile, 24);
  const recordLabel = latheMesh(recordLabelProfile, 18);
  const spindle = latheMesh(spindleProfile, 10);

  for (const [idx, dx] of ([-1.24, 1.24] as const).entries()) {
    const deckPos: V3 = [dx, 0.49, 0.06];
    raw.push({ mesh: transformMesh(platterRim, { pos: deckPos }), materialIndex: SLOT_METAL });
    raw.push({ mesh: transformMesh(vinylDisc, { pos: deckPos }), materialIndex: SLOT_CONE_DARK });
    raw.push({
      mesh: transformMesh(recordLabel, { pos: deckPos }),
      materialIndex: idx === 0 ? SLOT_GLOW_PRIMARY : SLOT_GLOW_ACCENT
    });
    raw.push({ mesh: transformMesh(spindle, { pos: deckPos }), materialIndex: SLOT_METAL });

    // Gimbal counterweight tower + S-curved `catmullRomSpline3` -> `tubeSweepMesh` tonearm + cartridge headshell
    const pivotX = dx + 0.56;
    const pivotZ = -0.44;
    raw.push({
      mesh: transformMesh(latheMesh([[0, 0], [0.11, 0], [0.11, 0.13], [0.07, 0.16], [0, 0.16]], 12), {
        pos: [pivotX, 0.49, pivotZ]
      }),
      materialIndex: SLOT_METAL
    });
    const armCurve = catmullRomSpline3([
      [pivotX, 0.63, pivotZ - 0.14],
      [pivotX, 0.64, pivotZ],
      [pivotX - 0.07, 0.64, pivotZ + 0.30],
      [pivotX - 0.16, 0.63, pivotZ + 0.58],
      [pivotX - 0.28, 0.60, pivotZ + 0.78]
    ], 5, false);
    raw.push({
      mesh: tubeSweepMesh(armCurve.map((p): V4 => [p[0], p[1], p[2], 0.018]), 7, false),
      materialIndex: SLOT_METAL
    });
    raw.push({
      mesh: transformMesh(bevelBoxMesh(0.07, 0.045, 0.12, 0.01), {
        pos: [pivotX - 0.30, 0.59, pivotZ + 0.81],
        rot: [0, 0.36, 0]
      }),
      materialIndex: SLOT_GLOW_PRIMARY
    });

    // Pitch tempo slider rail + fader cap + glossy cue/play transport buttons & strobe rim pips
    raw.push({
      mesh: transformMesh(bevelBoxMesh(0.08, 0.025, 0.48, 0.006), { pos: [dx + 0.66, 0.50, 0.24] }),
      materialIndex: SLOT_CONE_DARK
    });
    raw.push({
      mesh: transformMesh(bevelBoxMesh(0.11, 0.05, 0.06, 0.008), { pos: [dx + 0.66, 0.525, 0.20 + (idx === 0 ? -0.08 : 0.09)] }),
      materialIndex: SLOT_METAL
    });
    for (let b = 0; b < 2; b += 1) {
      raw.push({
        mesh: transformMesh(bevelBoxMesh(0.09, 0.028, 0.09, 0.012), {
          pos: [dx - 0.56 + b * 0.14, 0.505, 0.56]
        }),
        materialIndex: b === 0 ? SLOT_GLOW_ACCENT : SLOT_GLOW_PRIMARY
      });
    }
    for (let st = 0; st < 12; st += 1) {
      const sa = (st / 12) * Math.PI * 2;
      raw.push({
        mesh: transformMesh(bevelBoxMesh(0.032, 0.024, 0.032, 0.006), {
          pos: [deckPos[0] + Math.cos(sa) * 0.605, deckPos[1] + 0.058, deckPos[2] + Math.sin(sa) * 0.605],
          rot: [0, -sa, 0]
        }),
        materialIndex: st % 3 === 0 ? SLOT_GLOW_PRIMARY : SLOT_METAL
      });
    }
  }

  // Central 4-channel club mixer: recessed chassis, 4 channel faders, crossfader, 8 EQ pots & stereo VU meters
  raw.push({
    mesh: transformMesh(bevelBoxMesh(0.96, 0.09, 1.38, 0.02), { pos: [0, 0.50, 0.05] }),
    materialIndex: SLOT_CONE_DARK
  });
  const pot = latheMesh([[0, 0], [0.036, 0], [0.032, 0.055], [0, 0.06]], 9);
  for (let ch = 0; ch < 4; ch += 1) {
    const fx = -0.30 + ch * 0.20;
    raw.push({
      mesh: transformMesh(bevelBoxMesh(0.06, 0.045, 0.045, 0.008), {
        pos: [fx, 0.56, 0.32 - (ch % 2) * 0.09]
      }),
      materialIndex: SLOT_METAL
    });
    for (let eq = 0; eq < 2; eq += 1) {
      raw.push({
        mesh: transformMesh(pot, { pos: [fx, 0.545, -0.14 - eq * 0.20] }),
        materialIndex: SLOT_METAL
      });
    }
  }
  // Crossfader + twin stereo VU LED ladders
  raw.push({
    mesh: transformMesh(bevelBoxMesh(0.07, 0.05, 0.05, 0.008), { pos: [0.04, 0.56, 0.56] }),
    materialIndex: SLOT_GLOW_PRIMARY
  });
  for (const vx of [-0.08, 0.08] as const) {
    raw.push({
      mesh: transformMesh(bevelBoxMesh(0.055, 0.03, 0.44, 0.006), { pos: [vx, 0.555, -0.02] }),
      materialIndex: vx < 0 ? SLOT_GLOW_ACCENT : SLOT_GLOW_PRIMARY
    });
  }

  // Overhead aluminum box-truss DJ goalpost (`latticeTrussMesh`) + 3 moving-head beam fixtures
  for (const gx of [-1.86, 1.86] as const) {
    raw.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [0.24, 2.35, 0.24], bays: 5, chordRadius: 0.02, braceRadius: 0.012 }),
        { pos: [gx, 1.56, -0.68] }
      ),
      materialIndex: SLOT_METAL
    });
  }
  raw.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [3.96, 0.26, 0.26], bays: 7, chordRadius: 0.022, braceRadius: 0.013 }),
      { pos: [0, 2.72, -0.68] }
    ),
    materialIndex: SLOT_METAL
  });
  for (const lx of [-1.15, 0, 1.15] as const) {
    raw.push(
      ...sculptMovingHeadFixtureSlots({
        pos: [lx, 2.58, -0.62],
        upsideDown: true,
        pitch: 0.36,
        scale: 0.68,
        glowSlot: lx === 0 ? SLOT_GLOW_PRIMARY : SLOT_GLOW_ACCENT
      })
    );
  }

  // Raked front holographic waveform glass shield (`material.physical`, `castShadow: false`)
  const rawShield = transformMesh(bevelBoxMesh(3.84, 0.62, 0.045, 0.012), {
    pos: [0, 0.78, 0.88],
    rot: [-0.28, 0, 0]
  });

  const fitted = fitSlotsToMaxDim(raw, targetMaxDim);
  const glassShield = transformMesh(rawShield, {
    pos: [
      -fitted.center[0] * fitted.scale,
      -fitted.center[1] * fitted.scale,
      -fitted.center[2] * fitted.scale
    ],
    scale: fitted.scale
  });
  return { slots: fitted.slots, glassShield };
}

// ---------------------------------------------------------------------------
// Scene Mounts: Hardware-Instanced Concert Dressing & Multi-Material Gate
// ---------------------------------------------------------------------------

function extractSlotSpec(slots: readonly MultiMatSlot[], slotIdx: number): AuraCustomGeometrySpec {
  const matching = slots.filter((s) => s.materialIndex === slotIdx).map((s) => s.mesh);
  return mergeRawMeshes(matching);
}

export function buildConcertDressingNodes(opts: {
  readonly stackATransforms: readonly AuraTransformSpec[];
  readonly stackBTransforms: readonly AuraTransformSpec[];
  readonly deckTransforms: readonly AuraTransformSpec[];
  readonly stackAHeight: number;
  readonly stackBHeight: number;
  readonly deckMaxDim: number;
}): {
  readonly stackChildren: AuraNodeBuilder<AuraPrimitiveNode>[];
  readonly deckChildren: AuraNodeBuilder<AuraPrimitiveNode>[];
} {
  const mats = getConcertStageMaterials();
  const stackASlots = buildLineArrayStackSlots(opts.stackAHeight);
  const stackBSlots = buildModularSynthTowerSlots(opts.stackBHeight);
  const deckBuilt = buildDjTurntableConsoleSlots(opts.deckMaxDim);

  const mkInst = (
    name: string,
    spec: AuraCustomGeometrySpec,
    mat: AuraMaterialSpec,
    transforms: readonly AuraTransformSpec[]
  ): AuraNodeBuilder<AuraPrimitiveNode> =>
    instances.custom(spec, {
      name,
      material: mat,
      transforms,
      castShadow: false,
      receiveShadow: false
    });

  const stackChildren: AuraNodeBuilder<AuraPrimitiveNode>[] = [
    mkInst("dress-stack-a-cabinet", extractSlotSpec(stackASlots, SLOT_CABINET), mats.instCabinetMatte, opts.stackATransforms),
    mkInst("dress-stack-a-truss", extractSlotSpec(stackASlots, SLOT_METAL), mats.instTrussAlloy, opts.stackATransforms),
    mkInst("dress-stack-a-cones", extractSlotSpec(stackASlots, SLOT_CONE_DARK), mats.instConeVinylDark, opts.stackATransforms),
    mkInst("dress-stack-a-gold", extractSlotSpec(stackASlots, SLOT_GLOW_PRIMARY), mats.instNeonGold, opts.stackATransforms),
    mkInst("dress-stack-a-cyan", extractSlotSpec(stackASlots, SLOT_GLOW_ACCENT), mats.instNeonCyan, opts.stackATransforms),

    mkInst("dress-stack-b-cabinet", extractSlotSpec(stackBSlots, SLOT_CABINET), mats.instCabinetMatte, opts.stackBTransforms),
    mkInst("dress-stack-b-metal", extractSlotSpec(stackBSlots, SLOT_METAL), mats.instTrussAlloy, opts.stackBTransforms),
    mkInst("dress-stack-b-cones", extractSlotSpec(stackBSlots, SLOT_CONE_DARK), mats.instConeVinylDark, opts.stackBTransforms),
    mkInst("dress-stack-b-violet", extractSlotSpec(stackBSlots, SLOT_GLOW_PRIMARY), mats.instNeonViolet, opts.stackBTransforms),
    mkInst("dress-stack-b-cyan", extractSlotSpec(stackBSlots, SLOT_GLOW_ACCENT), mats.instNeonCyan, opts.stackBTransforms)
  ];

  // Holographic acrylic glass shields mounted as individual `castShadow: false` glass panels (never `>16` instanced clearcoat)
  const glassPanels: RawMesh[] = opts.deckTransforms.map((tr) =>
    transformMesh(deckBuilt.glassShield, {
      pos: (tr.position as V3 | undefined) ?? [0, 0, 0],
      rot: (tr.rotation as V3 | undefined) ?? [0, 0, 0]
    })
  );

  const deckChildren: AuraNodeBuilder<AuraPrimitiveNode>[] = [
    mkInst("dress-deck-cabinet", extractSlotSpec(deckBuilt.slots, SLOT_CABINET), mats.instCabinetMatte, opts.deckTransforms),
    mkInst("dress-deck-metal", extractSlotSpec(deckBuilt.slots, SLOT_METAL), mats.instTrussAlloy, opts.deckTransforms),
    mkInst("dress-deck-vinyl", extractSlotSpec(deckBuilt.slots, SLOT_CONE_DARK), mats.instConeVinylDark, opts.deckTransforms),
    mkInst("dress-deck-gold", extractSlotSpec(deckBuilt.slots, SLOT_GLOW_PRIMARY), mats.instNeonGold, opts.deckTransforms),
    mkInst("dress-deck-cyan", extractSlotSpec(deckBuilt.slots, SLOT_GLOW_ACCENT), mats.instNeonCyan, opts.deckTransforms),
    geometry.custom(mergeRawMeshes(glassPanels), {
      name: "dress-deck-synth-glass",
      material: mats.heroSynthGlass,
      castShadow: false,
      receiveShadow: false
    })
  ];

  return { stackChildren, deckChildren };
}

/**
 * Hero Multi-Material 132 BPM Judgement-Threshold Synth Gate (`assembleMultiMaterialNode`)
 * flanking `z = 0` on the outer shoulders of the elevated runway (`x = ±3.78 m`),
 * paired with `castShadow: false` `material.physical` strobe lenses.
 */
export function createJudgementThresholdGateNode(shoulderX: number): ReturnType<typeof group> {
  const mats = getConcertStageMaterials();
  const slots: MultiMatSlot[] = [];
  const lensMeshes: RawMesh[] = [];

  for (const side of [-1, 1] as const) {
    const px = side * shoulderX;
    const inward = -side;

    // Weighted beveled chrome base plinth + clearcoat violet acoustic pylon body (`loftSectionsMesh`)
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.56, 0.08, 0.92, 0.02), { pos: [px, 0.04, 0] }),
      materialIndex: SLOT_CHROME
    });
    const pylonBody = loftSectionsMesh([
      trapezoidSectionXZ(0.46, 0.36, 0.76, 0.08, 0.02),
      trapezoidSectionXZ(0.42, 0.32, 0.68, 0.56, 0.04),
      trapezoidSectionXZ(0.34, 0.26, 0.54, 1.08, 0.03),
      trapezoidSectionXZ(0.28, 0.22, 0.44, 1.46, 0.01)
    ], true, true);
    slots.push({
      mesh: transformMesh(pylonBody, { pos: [px, 0, 0], rot: [0, inward * Math.PI * 0.5, 0] }),
      materialIndex: SLOT_CABINET
    });

    // Brushed-aluminum side trim fins + woven acoustic fabric damper inlay
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.06, 1.18, 0.58, 0.014), { pos: [px - inward * 0.19, 0.72, 0] }),
      materialIndex: SLOT_METAL
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.05, 0.78, 0.40, 0.01), { pos: [px + inward * 0.16, 0.62, 0] }),
      materialIndex: SLOT_FABRIC
    });

    // Inward-facing 132 BPM LED timing blades (cyan + magenta) & top strobe projector head (`latheMesh`)
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.06, 0.92, 0.08, 0.012), { pos: [px + inward * 0.19, 0.68, -0.16] }),
      materialIndex: SLOT_GLOW_ACCENT
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.06, 0.92, 0.08, 0.012), { pos: [px + inward * 0.19, 0.68, 0.16] }),
      materialIndex: SLOT_GLOW_PRIMARY
    });

    const strobeHousing = latheMesh([
      [0, -0.14], [0.16, -0.14], [0.19, -0.02], [0.18, 0.12], [0.14, 0.16]
    ], 16);
    slots.push({
      mesh: transformMesh(strobeHousing, {
        pos: [px, 1.62, 0],
        rot: [0, 0, inward * (Math.PI * 0.5 - 0.24)]
      }),
      materialIndex: SLOT_CHROME
    });

    // Companion translucent `material.physical` fresnel strobe lens (`castShadow: false`)
    const lens = latheMesh([
      [0, 0.14], [0.145, 0.145], [0.145, 0.175], [0, 0.19]
    ], 16);
    lensMeshes.push(
      transformMesh(lens, {
        pos: [px, 1.62, 0],
        rot: [0, 0, inward * (Math.PI * 0.5 - 0.24)]
      })
    );
  }

  const palette: readonly AuraMaterialSpec[] = [
    mats.heroClearcoatViolet, // 0: SLOT_CABINET
    mats.heroBrushedAluminum, // 1: SLOT_METAL
    mats.heroClearcoatCyan,   // 2: SLOT_CONE_DARK
    mats.heroGrilleFabric,    // 3: SLOT_FABRIC
    mats.heroChromeTrim,      // 4: SLOT_CHROME
    mats.heroMagentaEmissive, // 5: SLOT_GLOW_PRIMARY
    mats.heroCyanEmissive     // 6: SLOT_GLOW_ACCENT
  ];

  // Ensure every slot index in `0..6` is populated for `buildGroupedGeometrySpec`
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.18, 0.06, 0.52, 0.012), { pos: [-shoulderX, 1.48, 0] }),
    materialIndex: SLOT_CONE_DARK
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.18, 0.06, 0.52, 0.012), { pos: [shoulderX, 1.48, 0] }),
    materialIndex: SLOT_CONE_DARK
  });

  const multiNode = assembleMultiMaterialNode("beat-threshold-stanchions", slots, palette, {
    castShadow: false,
    receiveShadow: true
  });
  const lensNode = geometry.custom(mergeRawMeshes(lensMeshes), {
    name: "beat-threshold-lenses",
    material: mats.heroSynthGlass,
    castShadow: false,
    receiveShadow: false
  });

  return group("beat-threshold-gate", [multiNode, lensNode]).runtime({ id: "beat-threshold-gate" });
}

// ---------------------------------------------------------------------------
// Assembly 4: Articulated 132 BPM Synth-Skater Bot Sculpted Parts
// ---------------------------------------------------------------------------

function ovalRingXZ(rx: number, rz: number, y: number, zOff = 0, segs = 12): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    out.push([Math.cos(a) * rx, y, Math.sin(a) * rz + zOff]);
  }
  return out;
}

export function sculptSkaterBotMeshes(): {
  readonly torso: ColoredMeshData;
  readonly pelvis: ColoredMeshData;
  readonly pelvisBelt: ColoredMeshData;
  readonly head: ColoredMeshData;
  readonly visor: ColoredMeshData;
  readonly headband: ColoredMeshData;
  readonly earCups: ColoredMeshData;
  readonly arm: ColoredMeshData;
  readonly leg: ColoredMeshData;
  readonly kneePad: ColoredMeshData;
  readonly skate: ColoredMeshData;
  readonly skateBlade: ColoredMeshData;
} {
  return memoizeGeometry("bh:skater-bot:v2", () => {
    // Cropped street-tech puffer jacket (`capEnds = true` + `subdivideSmoothMesh`, `y = -0.24..+0.305` -> world `0.38..0.925`)
    // with solar-gold ribbed waist hem, ultraviolet quilted hood/collar, dark charcoal dorsal beat-pack, and multicolor chest EQ badge.
    const jacketShell = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ovalRingXZ(0.206, 0.160, -0.240, 0.005, 14),
          ovalRingXZ(0.214, 0.168, -0.155, 0.004, 14),
          ovalRingXZ(0.236, 0.178, -0.035, 0.0, 14),
          ovalRingXZ(0.268, 0.194, 0.105, -0.008, 14),
          ovalRingXZ(0.276, 0.198, 0.215, -0.006, 14),
          ovalRingXZ(0.190, 0.154, 0.302, 0.004, 14)
        ], true, true),
        1,
        0.52
      ),
      "#00eaff"
    );
    const waistHemRib = paintMeshColors(
      loftSectionsMesh([
        ovalRingXZ(0.208, 0.162, -0.238, 0.005, 16),
        ovalRingXZ(0.220, 0.172, -0.188, 0.004, 16),
        ovalRingXZ(0.212, 0.165, -0.145, 0.003, 16)
      ], true, true),
      "#ffbe2e"
    );
    const hoodCollar = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ovalRingXZ(0.192, 0.162, 0.235, 0.012, 14),
          ovalRingXZ(0.222, 0.195, 0.295, 0.028, 14),
          ovalRingXZ(0.175, 0.165, 0.340, 0.036, 14)
        ], true, true),
        1,
        0.50
      ),
      "#1c223c"
    );
    const beatPack = paintMeshColors(
      transformMesh(
        subdivideSmoothMesh(bevelBoxMesh(0.29, 0.27, 0.135, 0.038), 1, 0.45),
        { pos: [0, 0.095, 0.195] }
      ),
      "#15192f"
    );
    const bassPortProfile: V2[] = [
      [0, 0.095],
      [0.052, 0.092],
      [0.074, 0.068],
      [0.068, 0.015],
      [0.030, 0]
    ];
    const baseBassPort = latheMesh(bassPortProfile, 12);
    const bassPorts = ([-0.072, 0.072] as const).map((bx, idx) =>
      paintMeshColors(
        transformMesh(baseBassPort, { pos: [bx, 0.065, 0.238], rot: [Math.PI * 0.5 + 0.12, 0, 0] }),
        idx === 0 ? "#00f2ff" : "#ffbe2e"
      )
    );
    const shoulderBolsters = ([-1, 1] as const).map((sgn) =>
      paintMeshColors(
        transformMesh(
          subdivideSmoothMesh(bevelBoxMesh(0.145, 0.125, 0.235, 0.042), 1, 0.50),
          { pos: [sgn * 0.255, 0.20, 0.005], rot: [0, 0, -sgn * 0.22] }
        ),
        "#8b5cf6"
      )
    );
    // Front chest equalizer badge (5 harmonic multi-color EQ bars + dark bezel frame)
    const chestEqColors = ["#00f2ff", "#2ef2b8", "#ffbe2e", "#ff7b2e", "#ff2e88"] as const;
    const chestEqBadge: RawMesh[] = [
      paintMeshColors(
        transformMesh(bevelBoxMesh(0.22, 0.135, 0.038, 0.012), { pos: [0, 0.115, -0.184] }),
        "#121629"
      )
    ];
    const eqHeights = [0.055, 0.092, 0.108, 0.082, 0.062];
    for (let b = 0; b < eqHeights.length; b += 1) {
      const bh = eqHeights[b]!;
      chestEqBadge.push(
        paintMeshColors(
          transformMesh(bevelBoxMesh(0.026, bh, 0.032, 0.006), {
            pos: [-0.072 + b * 0.036, 0.072 + bh * 0.5, -0.198]
          }),
          chestEqColors[b]!
        )
      );
    }
    const torso = rawToMeshData(
      bakeMeshCavityAO(
        mergeRawList([jacketShell, waistHemRib, hoodCollar, beatPack, ...bassPorts, ...shoulderBolsters, ...chestEqBadge]),
        0.16
      )
    );

    // Rounded street-tech hip & shorts block (`y = -0.150..+0.155` -> world `0.280..0.585`)
    // with sculpted short-legs at `x = ±0.132` wrapping deeply around both the jacket waist AND upper thighs!
    const pelvicHull = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ovalRingXZ(0.172, 0.138, -0.098, 0.008, 14),
          ovalRingXZ(0.214, 0.168, -0.032, 0.006, 14),
          ovalRingXZ(0.222, 0.174, 0.038, 0.004, 14),
          ovalRingXZ(0.210, 0.164, 0.102, 0.002, 14),
          ovalRingXZ(0.194, 0.150, 0.155, 0.0, 14)
        ], true, true),
        1,
        0.54
      ),
      "#232949"
    );
    const shortCuffL = paintMeshColors(
      sculptHumanoidLimbMesh(
        [
          [-0.122, 0.035, 0.004, 0.098],
          [-0.130, -0.055, 0.004, 0.096],
          [-0.135, -0.148, 0.002, 0.088]
        ],
        12,
        0.08
      ),
      "#8b5cf6"
    );
    const shortCuffR = paintMeshColors(
      sculptHumanoidLimbMesh(
        [
          [0.122, 0.035, 0.004, 0.098],
          [0.130, -0.055, 0.004, 0.096],
          [0.135, -0.148, 0.002, 0.088]
        ],
        12,
        0.08
      ),
      "#8b5cf6"
    );
    const pelvis = rawToMeshData(bakeMeshCavityAO(mergeRawList([pelvicHull, shortCuffL, shortCuffR]), 0.16));

    // High-contrast sculpted street-tech waist belt (`y = 0.015..0.118` -> world `0.445..0.548`)
    const beltRing = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ovalRingXZ(0.224, 0.176, 0.018, 0.004, 16),
          ovalRingXZ(0.232, 0.182, 0.068, 0.003, 16),
          ovalRingXZ(0.218, 0.170, 0.116, 0.002, 16)
        ], true, true),
        1,
        0.45
      ),
      "#181d34"
    );
    const frontBuckle = paintMeshColors(
      transformMesh(bevelBoxMesh(0.145, 0.076, 0.056, 0.014), { pos: [0, 0.068, -0.178] }),
      "#ffbe2e"
    );
    const rearBeltPod = paintMeshColors(
      transformMesh(bevelBoxMesh(0.168, 0.074, 0.058, 0.014), { pos: [0, 0.068, 0.178] }),
      "#00f2ff"
    );
    const sideHipPouches = ([-1, 1] as const).map((sgn) =>
      paintMeshColors(
        transformMesh(bevelBoxMesh(0.054, 0.082, 0.112, 0.014), { pos: [sgn * 0.225, 0.064, 0.01] }),
        "#ffbe2e"
      )
    );
    const pelvisBelt = rawToMeshData(
      bakeMeshCavityAO(mergeRawList([beltRing, frontBuckle, rearBeltPod, ...sideHipPouches]), 0.14)
    );

    // Smooth `subdivideSmoothMesh` glossy visor helmet + street beanie crown + solar-gold aero crest (`y = -0.265..+0.255`)
    const helmetShell = paintMeshColors(
      subdivideSmoothMesh(
        latheMesh([
          [0, -0.265],
          [0.118, -0.255],
          [0.142, -0.195],
          [0.215, -0.115],
          [0.252, -0.005],
          [0.246, 0.108],
          [0.192, 0.198],
          [0.098, 0.244],
          [0, 0.255]
        ], 16),
        1,
        0.55
      ),
      "#00eaff"
    );
    const beanieCuff = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ovalRingXZ(0.256, 0.258, 0.055, 0.008, 16),
          ovalRingXZ(0.264, 0.266, 0.115, 0.012, 16),
          ovalRingXZ(0.238, 0.242, 0.168, 0.016, 16)
        ], true, true),
        1,
        0.48
      ),
      "#1c213b"
    );
    const aeroCrest = paintMeshColors(
      transformMesh(
        subdivideSmoothMesh(bevelBoxMesh(0.084, 0.068, 0.33, 0.024), 1, 0.48),
        { pos: [0, 0.218, 0.045], rot: [-0.16, 0, 0] }
      ),
      "#ffbe2e"
    );
    const head = rawToMeshData(bakeMeshCavityAO(mergeRawList([helmetShell, beanieCuff, aeroCrest]), 0.14));

    // Smooth wraparound visor shield (`loftSectionsMesh` + `subdivideSmoothMesh` wrapping `-Z` forward face)
    const visorSections: V3[][] = [];
    const visorCols = 8;
    for (let i = 0; i <= visorCols; i += 1) {
      const u = i / visorCols;
      const ang = -1.04 + u * 2.08;
      const rOut = 0.272;
      const rIn = 0.236;
      const sa = Math.sin(ang);
      const ca = -Math.cos(ang);
      const hHalf = 0.074 * (1 - 0.20 * Math.abs(u - 0.5) * 2);
      visorSections.push([
        [sa * rOut, -hHalf + 0.016, ca * rOut],
        [sa * (rOut + 0.015), 0.016, ca * (rOut + 0.015)],
        [sa * rOut, hHalf + 0.016, ca * rOut],
        [sa * rIn, hHalf + 0.016, ca * rIn],
        [sa * rIn, -hHalf + 0.016, ca * rIn]
      ]);
    }
    const visor = rawToMeshData(subdivideSmoothMesh(loftSectionsMesh(visorSections, true, true), 1, 0.46));

    // Oversized cushioned DJ headphone arch (`catmullRomSpline3` -> `tubeSweepMesh`)
    const archPts: V3[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const th = (i / 8) * Math.PI;
      archPts.push([Math.cos(th) * 0.292, Math.sin(th) * 0.285 - 0.012, 0.012]);
    }
    const smoothArch = catmullRomSpline3(archPts, 3, false);
    const headband = rawToMeshData(
      paintMeshColors(
        tubeSweepMesh(
          smoothArch.map((p, idx): V4 => {
            const crown = Math.sin((idx / Math.max(1, smoothArch.length - 1)) * Math.PI);
            return [p[0], p[1], p[2], 0.032 + 0.015 * crown];
          }),
          10,
          true
        ),
        (pos) => srgbHexToLinearRgba(pos[1] > 0.16 ? "#ffbe2e" : "#222844")
      )
    );

    // Oversized neon DJ headphone ear-cups (`latheMesh` + `subdivideSmoothMesh` oriented along ±X)
    const cupProfile: V2[] = [
      [0, 0],
      [0.132, 0],
      [0.138, 0.038],
      [0.120, 0.078],
      [0.084, 0.098],
      [0, 0.102]
    ];
    const baseCup = subdivideSmoothMesh(latheMesh(cupProfile, 16), 1, 0.45);
    const earCups = rawToMeshData(
      mergeRawList([
        transformMesh(baseCup, { pos: [-0.246, -0.012, 0.012], rot: [0, 0, Math.PI * 0.5] }),
        transformMesh(baseCup, { pos: [0.246, -0.012, 0.012], rot: [0, 0, -Math.PI * 0.5] })
      ])
    );

    // Puffy street-jacket arm + wrist cuff + fingerless skate glove (`sculptHumanoidLimbMesh`)
    const armShaft = paintMeshColors(
      sculptHumanoidLimbMesh(
        [
          [0, 0.072, 0, 0.078],
          [0, -0.035, 0.004, 0.082],
          [0, -0.145, 0.010, 0.072],
          [0, -0.245, -0.008, 0.078],
          [0, -0.325, -0.018, 0.068]
        ],
        12,
        0.14
      ),
      (pos) => srgbHexToLinearRgba(pos[1] < -0.24 ? "#1a1f38" : pos[1] < -0.19 ? "#ffbe2e" : "#00eaff")
    );
    const arm = rawToMeshData(bakeMeshCavityAO(armShaft, 0.14));

    // Continuous `sculptHumanoidLimbMesh` thigh + knee + tapered shin + ankle shaft (`y = +0.096 .. -0.328`)
    // Top hip ball (`+0.096`) seats deep inside `pelvis` shorts (`-0.150..+0.155`);
    // bottom ankle (`-0.328`) seats deep inside `skate` inline boot cuff (`0.038..0.238`)!
    const legShaft = paintMeshColors(
      sculptHumanoidLimbMesh(
        [
          [0, 0.096, 0.002, 0.088],
          [0, 0.020, 0.002, 0.094],
          [0, -0.068, -0.006, 0.086],
          [0, -0.142, -0.018, 0.074],
          [0, -0.228, -0.006, 0.076],
          [0, -0.285, 0.004, 0.068],
          [0, -0.328, 0.006, 0.060]
        ],
        12,
        0.15
      ),
      "#1c223c"
    );
    const leg = rawToMeshData(bakeMeshCavityAO(legShaft, 0.14));

    // Contoured street-skater hardshell knee pad (`subdivideSmoothMesh`) + shin strap + flared ankle cuff
    const kneeShield = paintMeshColors(
      transformMesh(
        subdivideSmoothMesh(bevelBoxMesh(0.132, 0.102, 0.078, 0.026), 1, 0.52),
        { pos: [0, -0.142, -0.068], rot: [0.10, 0, 0] }
      ),
      "#00f2ff"
    );
    const kneeStrap = paintMeshColors(
      loftSectionsMesh([
        ovalRingXZ(0.082, 0.086, -0.162, -0.014, 12),
        ovalRingXZ(0.084, 0.088, -0.126, -0.014, 12)
      ], true, true),
      "#14182b"
    );
    const ankleCollar = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ovalRingXZ(0.082, 0.090, -0.272, 0.005, 12),
          ovalRingXZ(0.090, 0.098, -0.236, 0.002, 12),
          ovalRingXZ(0.080, 0.086, -0.205, -0.002, 12)
        ], true, true),
        1,
        0.48
      ),
      "#ffbe2e"
    );
    const kneePad = rawToMeshData(bakeMeshCavityAO(mergeRawList([kneeShield, kneeStrap, ankleCollar]), 0.14));

    // High-top molded inline cyber-skate boot (`minY = 0.038`, `maxY = 0.238`) with supportive ankle cuff,
    // dual ratchet buckle straps & rear aero heel spoiler!
    const bootFoot = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh([
          [[-0.068, 0.042, -0.255], [0.068, 0.042, -0.255], [0.078, 0.112, -0.220], [-0.078, 0.112, -0.220]],
          [[-0.092, 0.038, -0.045], [0.092, 0.038, -0.045], [0.098, 0.155, -0.020], [-0.098, 0.155, -0.020]],
          [[-0.088, 0.040, 0.180], [0.088, 0.040, 0.180], [0.092, 0.175, 0.160], [-0.092, 0.175, 0.160]],
          [[-0.062, 0.048, 0.250], [0.062, 0.048, 0.250], [0.066, 0.162, 0.225], [-0.066, 0.162, 0.225]]
        ], true, true),
        1,
        0.50
      ),
      "#1b2038"
    );
    const bootAnkleCuff = paintMeshColors(
      subdivideSmoothMesh(
        loftSectionsMesh([
          ovalRingXZ(0.088, 0.102, 0.125, 0.032, 14),
          ovalRingXZ(0.094, 0.108, 0.185, 0.036, 14),
          ovalRingXZ(0.088, 0.100, 0.238, 0.038, 14)
        ], true, true),
        1,
        0.48
      ),
      "#8b5cf6"
    );
    const cuffBuckle = paintMeshColors(
      transformMesh(bevelBoxMesh(0.198, 0.036, 0.118, 0.010), { pos: [0, 0.192, 0.034] }),
      "#ffbe2e"
    );
    const heelWing = paintMeshColors(
      transformMesh(bevelBoxMesh(0.215, 0.046, 0.142, 0.014), { pos: [0, 0.138, 0.178], rot: [0.22, 0, 0] }),
      "#ff2e88"
    );
    const skate = rawToMeshData(bakeMeshCavityAO(mergeRawList([bootFoot, bootAnkleCuff, cuffBuckle, heelWing]), 0.14));

    // Sleek inline cyber-blade chassis + 4 revolved glowing neon inline wheels (`latheMesh`)!
    const bladePoly: V2[] = [
      [-0.29, 0.018],
      [0.27, 0.018],
      [0.31, 0.042],
      [0.24, 0.058],
      [-0.25, 0.058],
      [-0.32, 0.038]
    ];
    const frameRails = ([-0.034, 0.034] as const).map((rx) =>
      transformMesh(extrudePolygonMesh(bladePoly, 0.018, 0.006, true), {
        pos: [rx, 0, -0.005],
        rot: [0, Math.PI * 0.5, 0]
      })
    );
    const inlineWheelProfile: V2[] = [
      [0, -0.014],
      [0.041, -0.014],
      [0.046, -0.006],
      [0.046, 0.006],
      [0.041, 0.014],
      [0, 0.014]
    ];
    const baseWheel = latheMesh(inlineWheelProfile, 12);
    const inlineWheels = ([-0.215, -0.072, 0.072, 0.215] as const).map((wz) =>
      transformMesh(baseWheel, { pos: [0, 0.046, wz], rot: [0, 0, Math.PI * 0.5] })
    );
    const skateBlade = rawToMeshData(mergeRawList([...frameRails, ...inlineWheels]));

    return { torso, pelvis, pelvisBelt, head, visor, headband, earCups, arm, leg, kneePad, skate, skateBlade };
  });
}


// ---------------------------------------------------------------------------
// Assembly 5: Sculpted Corridor Obstacles, Synth-Vinyl Discs & Beat Pads
//   CRITICAL INVARIANT: `sculptPlasmaCrossbarMesh()` preserves exact `0.97 m`
//   duck clearance under `BAR_SIZE.y = 1.12` (`1.12 - 0.30 / 2 = 0.97 m`).
//   All obstacle & collectible meshes are memoized via `memoizeGeometry` so
//   mobile builds share cached geometry templates with zero redundant rebuilds.
// ---------------------------------------------------------------------------

function sharpBoxRaw(w: number, h: number, d: number): RawMesh {
  const x = w * 0.5, y = h * 0.5, z = d * 0.5;
  const faces: { n: V3; c: [V3, V3, V3, V3] }[] = [
    { n: [0, 0, 1], c: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { n: [0, 0, -1], c: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { n: [1, 0, 0], c: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { n: [-1, 0, 0], c: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    { n: [0, 1, 0], c: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { n: [0, -1, 0], c: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] }
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const f of faces) {
    const base = positions.length / 3;
    f.c.forEach((c, idx) => {
      positions.push(c[0], c[1], c[2]);
      normals.push(f.n[0], f.n[1], f.n[2]);
      uvs.push(idx === 1 || idx === 2 ? 1 : 0, idx >= 2 ? 1 : 0);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, uvs, indices };
}

/**
 * Low Jump Hurdle (`BLOCK_SIZE = 1.5 x 0.95 x 0.9`, grounded at `minY = 0`, `maxY = 0.95`):
 * beveled dark-charcoal dual-woofer bass amplifier cabinet + diagonal solar-gold/charcoal
 * hazard-chevron base bars + recessed matte acoustic baffles + twin `latheMesh` 12" concave
 * excursion woofer cones + top synth-laser saddle.
 */
export function sculptSpeakerBlockMesh(): ColoredMeshData {
  return memoizeGeometry("bh:obs:speaker-block:v2", () => {
    const { w, h, d } = BLOCK_SIZE;

    // Grounded touring base plinth (`minY = 0` exact)
    const basePlinth = paintMeshColors(
      transformMesh(sharpBoxRaw(w - 0.02, 0.13, d - 0.02), { pos: [0, 0.065, 0] }),
      "#101425"
    );

    // Alternating solar-gold & obsidian-charcoal diagonal hazard chevrons along +Z base
    const chevrons: RawMesh[] = [];
    const baseChev = sharpBoxRaw(0.148, 0.082, 0.032);
    for (let idx = 0; idx < 7; idx += 1) {
      const cx = -0.57 + idx * 0.19;
      const col = idx % 2 === 0 ? "#ffbe2e" : "#0b0e1c";
      chevrons.push(
        paintMeshColors(
          transformMesh(baseChev, {
            pos: [cx, 0.072, d * 0.5 - 0.004],
            rot: [0, 0, -0.30]
          }),
          col
        )
      );
    }

    // Beveled dark charcoal dual-woofer bass amplifier enclosure (`y = 0.11..0.85`)
    const cabTop = srgbHexToLinearRgba("#222a4a");
    const cabBot = srgbHexToLinearRgba("#121629");
    const cabMid = srgbHexToLinearRgba("#181e36");
    const cabinet = paintMeshColors(
      transformMesh(bevelBoxMesh(w, 0.74, d, 0.052), { pos: [0, 0.48, 0] }),
      (p) => {
        const u = Math.max(0, Math.min(1, (p[1] - 0.11) / 0.74));
        return u > 0.76 ? cabTop : u < 0.18 ? cabBot : cabMid;
      }
    );

    // Recessed front & rear matte-black acoustic baffles
    const baffleF = paintMeshColors(
      transformMesh(sharpBoxRaw(w - 0.16, 0.60, 0.034), { pos: [0, 0.48, d * 0.5 - 0.010] }),
      "#080a14"
    );
    const baffleB = paintMeshColors(
      transformMesh(sharpBoxRaw(w - 0.16, 0.60, 0.034), { pos: [0, 0.48, -(d * 0.5 - 0.010)] }),
      "#080a14"
    );

    // Twin revolved 12" concave excursion woofer cones (`latheMesh` facing +Z camera)
    const wooferProfile: V2[] = [
      [0.048, -0.048],
      [0.105, -0.028],
      [0.175, 0.004],
      [0.228, 0.024],
      [0.256, 0.012],
      [0.265, 0.0]
    ];
    const baseWoofer = latheMesh(wooferProfile, 14);
    const woofers: RawMesh[] = [];
    for (const wx of [-0.37, 0.37] as const) {
      woofers.push(
        paintMeshColors(
          transformMesh(baseWoofer, { pos: [wx, 0.45, d * 0.5 - 0.006], rot: [Math.PI * 0.5, 0, 0] }),
          "#0e1326"
        )
      );
    }

    // Top EQ meter & synthwave laser-hurdle bridge (`maxY = h = 0.95` exact)
    const topBridge = paintMeshColors(
      transformMesh(bevelBoxMesh(w - 0.08, 0.11, d * 0.68, 0.020), { pos: [0, h - 0.055, 0] }),
      "#151b32"
    );
    const topEndCapL = paintMeshColors(
      transformMesh(sharpBoxRaw(0.22, 0.032, d * 0.52), { pos: [-0.54, h - 0.016, 0] }),
      "#00f2ff"
    );
    const topEndCapR = paintMeshColors(
      transformMesh(sharpBoxRaw(0.22, 0.032, d * 0.52), { pos: [0.54, h - 0.016, 0] }),
      "#ffbe2e"
    );

    const merged = bakeMeshCavityAO(
      mergeRawList([basePlinth, ...chevrons, cabinet, baffleF, baffleB, ...woofers, topBridge, topEndCapL, topEndCapR]),
      0.18
    );
    return rawToMeshData(merged);
  });
}

/**
 * Brushed-chrome road-case corner guards, die-cast alloy woofer basket rings, central bass-reflex port,
 * recessed side handles, and top laser-emitter pylons for the low bass-amp jump hurdle.
 */
export function sculptSpeakerBlockHardwareMesh(): ColoredMeshData {
  return memoizeGeometry("bh:obs:speaker-hw:v2", () => {
    const { w, h, d } = BLOCK_SIZE;
    const parts: RawMesh[] = [];

    // 8 brushed-chrome touring corner guards
    const cornerGuard = sharpBoxRaw(0.125, 0.125, 0.125);
    for (const sx of [-1, 1] as const) {
      for (const sy of [0.16, 0.80] as const) {
        for (const sz of [-1, 1] as const) {
          parts.push(
            paintMeshColors(
              transformMesh(cornerGuard, {
                pos: [sx * (w * 0.5 - 0.042), sy, sz * (d * 0.5 - 0.042)]
              }),
              "#dce8f8"
            )
          );
        }
      }
    }

    // Twin die-cast alloy woofer basket flanges (`latheMesh` facing +Z)
    const basketProfile: V2[] = [
      [0.242, 0.0],
      [0.280, 0.010],
      [0.284, 0.030],
      [0.254, 0.034],
      [0.240, 0.012]
    ];
    const baseBasket = latheMesh(basketProfile, 14);
    for (const wx of [-0.37, 0.37] as const) {
      parts.push(
        paintMeshColors(
          transformMesh(baseBasket, { pos: [wx, 0.45, d * 0.5 - 0.004], rot: [Math.PI * 0.5, 0, 0] }),
          "#d6e4f8"
        )
      );
    }

    // Central flared bass-reflex port (`latheMesh` facing +Z)
    const portProfile: V2[] = [
      [0.036, -0.034],
      [0.058, 0.010],
      [0.078, 0.026],
      [0.084, 0.0]
    ];
    parts.push(
      paintMeshColors(
        transformMesh(latheMesh(portProfile, 10), { pos: [0, 0.30, d * 0.5 - 0.004], rot: [Math.PI * 0.5, 0, 0] }),
        "#cad8ee"
      )
    );

    // Recessed side stage crew handles
    const sideHandle = sharpBoxRaw(0.036, 0.18, 0.28);
    for (const sx of [-1, 1] as const) {
      parts.push(
        paintMeshColors(
          transformMesh(sideHandle, { pos: [sx * (w * 0.5 - 0.004), 0.48, 0] }),
          "#c2d2ea"
        )
      );
    }

    // Twin top synth-laser emitter pylons (`y = 0.85..0.942`)
    const emitterMount = latheMesh([[0, 0], [0.064, 0], [0.058, 0.044], [0.044, 0.088], [0, 0.088]], 8);
    for (const sx of [-0.62, 0.62] as const) {
      parts.push(
        paintMeshColors(
          transformMesh(emitterMount, { pos: [sx, h - 0.098, 0] }),
          "#e4f0ff"
        )
      );
    }

    return rawToMeshData(mergeRawList(parts));
  });
}

/**
 * Multi-hue glowing synthwave laser-hurdle bar, cyan/gold concave woofer dust caps & voice-coil rings,
 * and 10-bar LED equalizer meter strip across the low bass-amp jump hurdle.
 */
export function sculptSpeakerBlockGlowParts(): ToneMeshParts {
  return memoizeGeometry("bh:obs:speaker-glow:v2", () => {
    const { h, d } = BLOCK_SIZE;
    const entries: { mesh: RawMesh; hex: string; boost?: number }[] = [];

    // Vivid solar-gold synthwave laser-bar top hurdle beam + electric-cyan focusing collars
    entries.push({
      mesh: tubeSweepMesh([[-0.58, h - 0.044, 0, 0.032], [0.58, h - 0.044, 0, 0.032]], 8, true),
      hex: "#ffbe2e",
      boost: 1.40
    });
    const focusCollar = sharpBoxRaw(0.068, 0.072, 0.086);
    for (const sx of [-0.56, 0.56] as const) {
      entries.push({
        mesh: transformMesh(focusCollar, { pos: [sx, h - 0.044, 0] }),
        hex: "#00f2ff",
        boost: 1.38
      });
    }

    // Twin glowing woofer dust caps & surround rings (`x = -0.37` electric cyan, `x = +0.37` solar gold)
    const dustCap = latheMesh([[0, 0.028], [0.050, 0.018], [0.074, -0.016], [0.080, -0.024]], 12);
    const voiceRing = latheMesh([[0.226, 0.018], [0.240, 0.028], [0.248, 0.016]], 14);
    const wooferSpecs = [
      { wx: -0.37, hex: "#00f2ff" },
      { wx: 0.37, hex: "#ffbe2e" }
    ] as const;
    for (const { wx, hex } of wooferSpecs) {
      entries.push(
        {
          mesh: transformMesh(dustCap, { pos: [wx, 0.45, d * 0.5 - 0.004], rot: [Math.PI * 0.5, 0, 0] }),
          hex,
          boost: 1.38
        },
        {
          mesh: transformMesh(voiceRing, { pos: [wx, 0.45, d * 0.5 - 0.004], rot: [Math.PI * 0.5, 0, 0] }),
          hex,
          boost: 1.12
        }
      );
    }

    // 10-bar multicolor LED equalizer meter strip across the upper front face
    const meterHeights = [0.052, 0.078, 0.102, 0.090, 0.112, 0.112, 0.088, 0.100, 0.076, 0.054] as const;
    for (let k = 0; k < meterHeights.length; k += 1) {
      const barH = meterHeights[k]!;
      const bx = -0.495 + k * 0.11;
      const hex = k < 3 ? "#00f2ff" : k < 5 ? "#2ef2b8" : k < 8 ? "#ffbe2e" : "#ff2e88";
      entries.push({
        mesh: transformMesh(sharpBoxRaw(0.076, barH, 0.026), {
          pos: [bx, 0.725 + barH * 0.5, d * 0.5 - 0.002]
        }),
        hex,
        boost: 1.32
      });
    }

    return mergeToneParts(entries);
  });
}

/**
 * Stepped `latheMesh` chrome stanchion columns, grounded hazard base collars, outer `latticeTrussMesh`
 * gusset ribs, and anodized clevis yokes for the overhead duck gate (`BAR_SIZE`, grounded at `minY = 0`
 * at `x = ±0.85 m`, leaving the interior duck corridor `|x| < 0.72 m` open).
 */
export function sculptStanchionPostsMesh(): ColoredMeshData {
  return memoizeGeometry("bh:obs:stanchion-posts:v2", () => {
    const postX = BAR_SIZE.w * 0.5 - BAR_SIZE.postW * 0.5;
    const topY = BAR_SIZE.y + BAR_SIZE.h * 0.52;
    const columnProfile: V2[] = [
      [0, 0],
      [0.128, 0],
      [0.128, 0.045],
      [0.094, 0.088],
      [0.058, 0.125],
      [0.058, 0.52],
      [0.084, 0.55],
      [0.084, 0.60],
      [0.056, 0.63],
      [0.056, BAR_SIZE.y - 0.12],
      [0.086, BAR_SIZE.y - 0.08],
      [0.086, BAR_SIZE.y + 0.08],
      [0.062, topY - 0.03],
      [0.042, topY],
      [0, topY]
    ];
    const baseCol = paintMeshColors(latheMesh(columnProfile, 12), "#dce8f8");
    const hazardRing = paintMeshColors(
      latheMesh([[0.096, 0.045], [0.132, 0.052], [0.132, 0.086], [0.096, 0.094]], 10),
      "#ffbe2e"
    );
    const outerGusset = paintMeshColors(
      latticeTrussMesh({
        span: [0.06, 0.78, 0.14],
        bays: 2,
        chordRadius: 0.014,
        braceRadius: 0.008
      }),
      "#c6d6ee"
    );
    const yoke = paintMeshColors(
      bevelBoxMesh(0.18, BAR_SIZE.h + 0.03, BAR_SIZE.d + 0.03, 0.022),
      "#8b5cf6"
    );

    return rawToMeshData(
      mergeRawList([
        transformMesh(baseCol, { pos: [-postX, 0, 0] }),
        transformMesh(baseCol, { pos: [postX, 0, 0] }),
        transformMesh(hazardRing, { pos: [-postX, 0, 0] }),
        transformMesh(hazardRing, { pos: [postX, 0, 0] }),
        transformMesh(outerGusset, { pos: [-(postX + 0.062), 0.56, 0] }),
        transformMesh(outerGusset, { pos: [postX + 0.062, 0.56, 0] }),
        transformMesh(yoke, { pos: [-postX, BAR_SIZE.y, 0] }),
        transformMesh(yoke, { pos: [postX, BAR_SIZE.y, 0] })
      ])
    );
  });
}

/**
 * Multi-hue glowing plasma emitter crossbar centered at `y = BAR_SIZE.y = 1.12` with exact
 * vertical half-height `BAR_SIZE.h / 2 = 0.15 m`, preserving exact `minY = 0.97 m` duck clearance
 * (`maxY = 1.27 m`), with an electric-cyan lower clearance guide rail, ultraviolet emitter body,
 * neon coral-magenta harmonic focusing collars, and solar-gold upper trim.
 */
export function sculptPlasmaCrossbarParts(): ToneMeshParts {
  return memoizeGeometry("bh:obs:plasma-crossbar:v2", () => {
    const halfSpan = BAR_SIZE.w * 0.5 - 0.03;

    // Beveled primary plasma housing (`minY = 0.97`, `maxY = 1.27` exact)
    const coreBeam = transformMesh(
      bevelBoxMesh(BAR_SIZE.w - 0.14, BAR_SIZE.h, BAR_SIZE.d * 0.76, 0.034),
      { pos: [0, BAR_SIZE.y, 0] }
    );

    // Revolved harmonic focusing collars along X (`latheMesh` with max radius 0.146 < 0.15)
    const emitterProfile: V2[] = [
      [0.074, -halfSpan],
      [0.140, -halfSpan + 0.03],
      [0.140, -halfSpan + 0.11],
      [0.090, -halfSpan + 0.14],
      [0.090, -0.26],
      [0.146, -0.22],
      [0.146, -0.14],
      [0.094, -0.10],
      [0.094, 0.10],
      [0.146, 0.14],
      [0.146, 0.22],
      [0.090, 0.26],
      [0.090, halfSpan - 0.14],
      [0.140, halfSpan - 0.11],
      [0.140, halfSpan - 0.03],
      [0.074, halfSpan]
    ];
    const emitterTube = transformMesh(latheMesh(emitterProfile, 10), {
      pos: [0, BAR_SIZE.y, 0],
      rot: [0, 0, -Math.PI * 0.5]
    });

    // Crisp electric-cyan lower clearance guide strip (`minY = 0.973 >= 0.97`)
    const clearanceRail = transformMesh(
      sharpBoxRaw(BAR_SIZE.w - 0.22, 0.038, BAR_SIZE.d * 0.86),
      { pos: [0, BAR_SIZE.y - BAR_SIZE.h * 0.5 + 0.022, 0] }
    );

    // Solar-gold upper status bar (`maxY = 1.266 <= 1.27`)
    const crownTrim = transformMesh(
      sharpBoxRaw(0.84, 0.036, BAR_SIZE.d * 0.84),
      { pos: [0, BAR_SIZE.y + BAR_SIZE.h * 0.5 - 0.022, 0] }
    );

    return mergeToneParts([
      { mesh: coreBeam, hex: "#8b5cf6", boost: 1.18 },
      { mesh: emitterTube, hex: "#ff2e88", boost: 1.32 },
      { mesh: clearanceRail, hex: "#00f2ff", boost: 1.42 },
      { mesh: crownTrim, hex: "#ffbe2e", boost: 1.34 }
    ]);
  });
}

export function sculptPlasmaCrossbarMesh(): ColoredMeshData {
  return sculptPlasmaCrossbarParts().mesh;
}

/**
 * Tall Concert Line-Array Speaker Monolith / Dodge Barrier (`WALL_SIZE = 1.7 x 2.3 x 0.45`,
 * grounded at `minY = 0`, crown top at `WALL_SIZE.h + WALL_SIZE.capH = 2.46 m` exact):
 * 3 stacked touring speaker enclosures + recessed matte acoustic baffles + crimson-coral danger crown.
 */
export function sculptMonolithWallMesh(): ColoredMeshData {
  return memoizeGeometry("bh:obs:monolith-wall:v2", () => {
    const { w, h, d, capH } = WALL_SIZE;
    const parts: RawMesh[] = [];

    // Grounded heavy touring plinth (`minY = 0` exact) + amber-coral warning bumper
    parts.push(
      paintMeshColors(
        transformMesh(sharpBoxRaw(w + 0.04, 0.15, d + 0.08), { pos: [0, 0.075, 0] }),
        "#151a30"
      ),
      paintMeshColors(
        transformMesh(sharpBoxRaw(w - 0.14, 0.056, 0.032), {
          pos: [0, 0.075, d * 0.5 + 0.034]
        }),
        "#ff6b3d"
      )
    );

    // 3 stacked concert line-array speaker enclosures (`y = 0.15..2.30`)
    const tiers = [
      { y0: 0.15, y1: 0.85 },
      { y0: 0.88, y1: 1.58 },
      { y0: 1.61, y1: 2.30 }
    ] as const;
    for (const { y0, y1 } of tiers) {
      const th = y1 - y0;
      const ym = (y0 + y1) * 0.5;
      parts.push(
        paintMeshColors(
          transformMesh(bevelBoxMesh(w - 0.16, th, d, 0.034), { pos: [0, ym, 0] }),
          "#14192e"
        ),
        paintMeshColors(
          transformMesh(sharpBoxRaw(w - 0.34, th - 0.12, 0.036), {
            pos: [0, ym, d * 0.5 - 0.008]
          }),
          "#080a14"
        )
      );
    }

    // High-contrast crimson-coral crown cap (`maxY = h + capH = 2.46 m` exact)
    parts.push(
      paintMeshColors(
        transformMesh(bevelBoxMesh(w + 0.08, capH, d + 0.08, 0.024), {
          pos: [0, h + capH * 0.5, 0]
        }),
        "#ff3b5c"
      )
    );

    return rawToMeshData(bakeMeshCavityAO(mergeRawList(parts), 0.18));
  });
}

/**
 * Brushed-aluminum `latticeTrussMesh` vertical side rigging frames, inter-cabinet chrome fly-bars,
 * lower 15" sub-woofer basket, and 4 flared `latheMesh` acoustic waveguide horns for the tall dodge monolith.
 */
export function sculptMonolithWallTrussMesh(): ColoredMeshData {
  return memoizeGeometry("bh:obs:monolith-truss:v2", () => {
    const { w, d } = WALL_SIZE;
    const parts: RawMesh[] = [];

    // Twin full-height aluminum box-truss side frames (`latticeTrussMesh`)
    const sideTruss = paintMeshColors(
      latticeTrussMesh({
        span: [0.14, 2.12, d - 0.04],
        bays: 3,
        chordRadius: 0.020,
        braceRadius: 0.011
      }),
      "#d6e4f6"
    );
    for (const sx of [-1, 1] as const) {
      parts.push(transformMesh(sideTruss, { pos: [sx * (w * 0.5 - 0.055), 1.22, 0] }));
    }

    // Inter-cabinet chrome rigging fly-bars
    const flyBar = paintMeshColors(sharpBoxRaw(w + 0.02, 0.034, d + 0.04), "#dce8f8");
    for (const fy of [0.865, 1.595, 2.295] as const) {
      parts.push(transformMesh(flyBar, { pos: [0, fy, 0] }));
    }

    // Lower 15" sub-bass driver basket & cone rim (`latheMesh` facing +Z)
    const subBasket = paintMeshColors(
      latheMesh([[0.105, -0.044], [0.205, 0.008], [0.255, 0.028], [0.270, 0.006]], 12),
      "#cad8ee"
    );
    parts.push(
      transformMesh(subBasket, { pos: [0, 0.50, d * 0.5 - 0.004], rot: [Math.PI * 0.5, 0, 0] })
    );

    // 4 flared acoustic waveguide horns in middle & upper line-array tiers (`latheMesh` facing +Z)
    const hornWaveguide = paintMeshColors(
      latheMesh([[0.032, -0.062], [0.068, -0.030], [0.136, 0.012], [0.186, 0.032], [0.198, 0.010]], 12),
      "#e0ecfc"
    );
    for (const hy of [1.23, 1.955] as const) {
      for (const hx of [-0.33, 0.33] as const) {
        parts.push(
          transformMesh(hornWaveguide, { pos: [hx, hy, d * 0.5 - 0.004], rot: [Math.PI * 0.5, 0, 0] })
        );
      }
    }

    return rawToMeshData(mergeRawList(parts));
  });
}

/**
 * High-contrast neon crimson-coral danger edge rims, bright amber hazard crown strobe, solar-gold
 * acoustic horn throats, and glowing frequency-grille bars on the tall dodge monolith.
 */
export function sculptMonolithWallGlowParts(): ToneMeshParts {
  return memoizeGeometry("bh:obs:monolith-glow:v2", () => {
    const { w, h, d, capH } = WALL_SIZE;
    const entries: { mesh: RawMesh; hex: string; boost?: number }[] = [];

    // Full-height vertical neon coral-red danger edge rails (`x = ±0.855`)
    const edgeRail = sharpBoxRaw(0.038, 2.08, 0.038);
    for (const sx of [-1, 1] as const) {
      entries.push({
        mesh: transformMesh(edgeRail, {
          pos: [sx * (w * 0.5 + 0.005), 1.22, d * 0.5 - 0.016]
        }),
        hex: "#ff3b5c",
        boost: 1.38
      });
    }

    // Bright amber hazard crown beacon bar (`y = 2.38`)
    entries.push({
      mesh: transformMesh(sharpBoxRaw(w - 0.06, 0.068, d + 0.10), {
        pos: [0, h + capH * 0.5, 0]
      }),
      hex: "#ff9f1c",
      boost: 1.44
    });

    // 4 solar-gold acoustic horn compression throats + lower sub coral phase plug (`latheMesh`)
    const hornThroat = latheMesh([[0, 0.018], [0.048, 0.008], [0.064, -0.020]], 10);
    for (const hy of [1.23, 1.955] as const) {
      for (const hx of [-0.33, 0.33] as const) {
        entries.push({
          mesh: transformMesh(hornThroat, { pos: [hx, hy, d * 0.5 - 0.006], rot: [Math.PI * 0.5, 0, 0] }),
          hex: "#ffbe2e",
          boost: 1.36
        });
      }
    }
    const subPlug = latheMesh([[0, 0.034], [0.058, 0.016], [0.082, -0.022]], 12);
    entries.push({
      mesh: transformMesh(subPlug, { pos: [0, 0.50, d * 0.5 - 0.006], rot: [Math.PI * 0.5, 0, 0] }),
      hex: "#ff3b5c",
      boost: 1.36
    });

    // Horizontal glowing frequency-grille analyzer bars across +Z
    const grilleRows = [
      { gy: 0.25, gw: 1.06, hex: "#ff3b5c" },
      { gy: 0.75, gw: 1.06, hex: "#ff9f1c" },
      { gy: 0.98, gw: 1.12, hex: "#ff9f1c" },
      { gy: 1.48, gw: 1.12, hex: "#ffbe2e" },
      { gy: 1.71, gw: 1.12, hex: "#ff3b5c" },
      { gy: 2.20, gw: 1.12, hex: "#ffbe2e" }
    ] as const;
    for (const { gy, gw, hex } of grilleRows) {
      entries.push({
        mesh: transformMesh(sharpBoxRaw(gw, 0.032, 0.026), { pos: [0, gy, d * 0.5 + 0.004] }),
        hex,
        boost: 1.28
      });
    }

    return mergeToneParts(entries);
  });
}

/**
 * Sculpted double-sided synth-vinyl LP / harmonic energy-disc collectible (`r = ORB_RADIUS = 0.36`):
 * upright-tilted `latheMesh` grooved obsidian record platter + brushed-chrome strobe rim & spindle +
 * solar-gold center record label.
 */
export function sculptVinylBeatDiscMesh(r = ORB_RADIUS): ColoredMeshData {
  return memoizeGeometry(`bh:obs:vinyl-disc:${r.toFixed(3)}:v2`, () => {
    const discProfile: V2[] = [
      [0, -0.078],
      [r * 0.08, -0.072],
      [r * 0.11, -0.036],
      [r * 0.36, -0.036],
      [r * 0.38, -0.024],
      [r * 0.56, -0.028],
      [r * 0.62, -0.020],
      [r * 0.78, -0.026],
      [r * 0.88, -0.020],
      [r * 0.96, -0.032],
      [r * 1.02, -0.018],
      [r * 1.02, 0.018],
      [r * 0.96, 0.032],
      [r * 0.88, 0.020],
      [r * 0.78, 0.026],
      [r * 0.62, 0.020],
      [r * 0.56, 0.028],
      [r * 0.38, 0.024],
      [r * 0.36, 0.036],
      [r * 0.11, 0.036],
      [r * 0.08, 0.072],
      [0, 0.078]
    ];
    const platterRaw = latheMesh(discProfile, 22);
    const cSpindle = srgbHexToLinearRgba("#eef6ff");
    const cLabel = srgbHexToLinearRgba("#ffbe2e");
    const cRim = srgbHexToLinearRgba("#c8f6ff");
    const cGrooveA = srgbHexToLinearRgba("#0e152c");
    const cGrooveB = srgbHexToLinearRgba("#1b2850");
    const paintedPlatter = paintMeshColors(platterRaw, (p) => {
      const rad = Math.hypot(p[0], p[2]);
      if (rad < r * 0.13) return cSpindle; // chrome spindle
      if (rad < r * 0.37) return cLabel; // solar-gold LP center label
      if (rad > r * 0.90) return cRim; // brushed silver-cyan strobe rim
      const grooveBand = Math.floor((rad / r) * 14) % 2;
      return grooveBand === 0 ? cGrooveA : cGrooveB;
    });
    const tilted = transformMesh(bakeMeshCavityAO(paintedPlatter, 0.16), {
      rot: [1.18, 0, 0.22]
    });
    return rawToMeshData(tilted);
  });
}

/**
 * Multi-hue glowing energy halo rings & solar-gold label rings around the sculpted synth-vinyl beat disc.
 */
export function sculptVinylBeatDiscGlowParts(r = ORB_RADIUS): ToneMeshParts {
  return memoizeGeometry(`bh:obs:vinyl-disc-glow:${r.toFixed(3)}:v2`, () => {
    const outerHaloProfile: V2[] = [
      [r * 1.01, -0.016],
      [r * 1.10, -0.022],
      [r * 1.14, 0.0],
      [r * 1.10, 0.022],
      [r * 1.01, 0.016]
    ];
    const outerHalo = transformMesh(latheMesh(outerHaloProfile, 22), {
      rot: [1.18, 0, 0.22]
    });

    // Orthogonal gyroscopic harmonic ribbon so edge-on rotation stays crisp & unmistakable
    const gyroProfile: V2[] = [
      [r * 0.96, -0.012],
      [r * 1.03, 0.0],
      [r * 0.96, 0.012]
    ];
    const gyroRing = transformMesh(latheMesh(gyroProfile, 20), {
      rot: [1.18, Math.PI * 0.5, -0.22]
    });

    // Double-sided solar-gold LP label glow ring
    const labelRingProfile: V2[] = [
      [r * 0.17, -0.040],
      [r * 0.34, -0.040],
      [r * 0.34, 0.040],
      [r * 0.17, 0.040]
    ];
    const labelGlow = transformMesh(latheMesh(labelRingProfile, 18), {
      rot: [1.18, 0, 0.22]
    });

    return mergeToneParts([
      { mesh: outerHalo, hex: "#00f2ff", boost: 1.48 },
      { mesh: gyroRing, hex: "#8b5cf6", boost: 1.24 },
      { mesh: labelGlow, hex: "#ffbe2e", boost: 1.42 }
    ]);
  });
}

function octagonSectionXZ(hx: number, hz: number, y: number, chamferFrac = 0.16): V3[] {
  const cx = hx * (1 - chamferFrac);
  const cz = hz * (1 - chamferFrac);
  return [
    [-cx, y, -hz],
    [cx, y, -hz],
    [hx, y, -cz],
    [hx, y, cz],
    [cx, y, hz],
    [-cx, y, hz],
    [-hx, y, cz],
    [-hx, y, -cz]
  ];
}

/** Beveled octagonal crystal pressure-pad inlays + harmonic timing chevron cores across the 3 lanes at `z = 0`. */
export function sculptBeatPadGlassMesh(lanesX: readonly number[]): ColoredMeshData {
  const padSlab = loftSectionsMesh([
    octagonSectionXZ(0.88, 0.43, 0.003, 0.18),
    octagonSectionXZ(0.85, 0.40, 0.034, 0.18)
  ], true, true);
  const innerChevron = loftSectionsMesh([
    octagonSectionXZ(0.56, 0.24, 0.034, 0.24),
    octagonSectionXZ(0.52, 0.21, 0.048, 0.24)
  ], true, true);
  const laneSlabHex = ["#6ef7ff", "#ffe28a", "#c4a8ff"] as const;
  const laneCoreHex = ["#00f2ff", "#ffbe2e", "#8b5cf6"] as const;
  const parts: RawMesh[] = [];
  lanesX.forEach((lx, idx) => {
    parts.push(
      paintMeshColors(transformMesh(padSlab, { pos: [lx, 0, 0] }), laneSlabHex[idx % 3]!),
      paintMeshColors(transformMesh(innerChevron, { pos: [lx, 0, 0] }), laneCoreHex[idx % 3]!)
    );
  });
  return rawToMeshData(mergeRawList(parts));
}

/** Anodized beveled multi-color perimeter threshold bars + solar-gold corner lock lugs framing each lane's judgement pad at `z = 0`. */
export function sculptBeatPadFrameMesh(lanesX: readonly number[]): ColoredMeshData {
  const frontBackBar = bevelBoxMesh(1.90, 0.028, 0.11, 0.008);
  const sideChevron = bevelBoxMesh(0.095, 0.026, 0.68, 0.007);
  const cornerLug = bevelBoxMesh(0.14, 0.038, 0.14, 0.010);
  const laneAccentHex = ["#00f2ff", "#ffbe2e", "#8b5cf6"] as const;
  const parts: RawMesh[] = [];
  lanesX.forEach((lx, idx) => {
    const sideHex = laneAccentHex[idx % 3]!;
    parts.push(
      paintMeshColors(transformMesh(frontBackBar, { pos: [lx, 0.015, -0.46] }), "#00f2ff"),
      paintMeshColors(transformMesh(frontBackBar, { pos: [lx, 0.015, 0.46] }), "#00f2ff"),
      paintMeshColors(transformMesh(sideChevron, { pos: [lx - 0.92, 0.014, 0] }), sideHex),
      paintMeshColors(transformMesh(sideChevron, { pos: [lx + 0.92, 0.014, 0] }), sideHex),
      paintMeshColors(transformMesh(cornerLug, { pos: [lx - 0.89, 0.019, -0.43] }), "#ffbe2e"),
      paintMeshColors(transformMesh(cornerLug, { pos: [lx + 0.89, 0.019, -0.43] }), "#ffbe2e"),
      paintMeshColors(transformMesh(cornerLug, { pos: [lx - 0.89, 0.019, 0.43] }), "#ffbe2e"),
      paintMeshColors(transformMesh(cornerLug, { pos: [lx + 0.89, 0.019, 0.43] }), "#ffbe2e")
    );
  });
  return rawToMeshData(mergeRawList(parts));
}

// ---------------------------------------------------------------------------
// Assembly 6: Sculpted Synthwave Stage Scenery Builders (`stage.ts`)
//   Replaces stacked-box programmer-art placeholders for cyber-palms, island
//   speaker stacks, 60-bar spectrum EQ columns, stadium box-truss arches, and
//   elevated track trestle pylons.
// ---------------------------------------------------------------------------

/**
 * Curved synthwave cyber-palm (`base at y = 0`, ~1.0 unit tall):
 * `catmullRomSpline3` -> `tubeSweepMesh` tapered trunk + `latheMesh` crown ring +
 * 7 arched pleated `loftSectionsMesh` fronds.
 */
export function sculptCyberPalmMesh(): ColoredMeshData {
  return memoizeGeometry("bh:stage:cyber-palm:v2", () => {
    const trunkCurve = catmullRomSpline3([
      [0, 0, 0],
      [0.025, 0.34, 0.01],
      [0.082, 0.68, 0.015],
      [0.165, 1.0, 0]
    ], 3, false);

    const trunk = tubeSweepMesh(
      trunkCurve.map((p, idx): V4 => {
        const u = idx / Math.max(1, trunkCurve.length - 1);
        const r = 0.042 * (1 - 0.42 * u) * (1 + 0.08 * Math.sin(u * Math.PI * 5));
        return [p[0], p[1], p[2], r];
      }),
      7,
      true
    );

    const crownPos: V3 = [0.165, 1.0, 0];
    const crownPod = transformMesh(
      latheMesh([[0, -0.04], [0.056, -0.01], [0.048, 0.04], [0, 0.055]], 7),
      { pos: crownPos }
    );

    // Arched pleated palm frond (`loftSectionsMesh` pointing along -Z)
    const baseFrond = loftSectionsMesh([
      [[-0.018, 0, 0], [0, 0.014, 0], [0.018, 0, 0]],
      [[-0.085, 0.035, -0.18], [0, 0.068, -0.18], [0.085, 0.035, -0.18]],
      [[-0.068, -0.025, -0.38], [0, 0.012, -0.38], [0.068, -0.025, -0.38]],
      [[-0.012, -0.135, -0.54], [0, -0.12, -0.56], [0.012, -0.135, -0.54]]
    ], false, false);

    const fronds: RawMesh[] = [];
    const frondCount = 7;
    for (let k = 0; k < frondCount; k += 1) {
      const yaw = (k / frondCount) * Math.PI * 2 + 0.28;
      const pitch = -0.18 - (k % 2) * 0.14;
      fronds.push(transformMesh(baseFrond, { pos: crownPos, rot: [pitch, yaw, 0] }));
    }

    return rawToMeshData(mergeRawList([trunk, crownPod, ...fronds]));
  });
}

/**
 * Dual-cabinet horn-loaded speaker stack on floating islands (`minY = 0`, ~2.05 m tall):
 * chamfered bass bin + revolved front woofer cone + raked mid-high waveguide head.
 */
export function sculptIslandSpeakerStackMesh(): ColoredMeshData {
  return memoizeGeometry("bh:stage:island-speaker:v2", () => {
    const bassBin = transformMesh(bevelBoxMesh(1.06, 1.12, 0.86, 0.055), { pos: [0, 0.56, 0] });
    const woofer = transformMesh(
      latheMesh([[0, 0.055], [0.06, 0.04], [0.09, -0.03], [0.28, 0.025], [0.33, 0.0]], 14),
      { pos: [0, 0.58, 0.43], rot: [Math.PI * 0.5, 0, 0] }
    );
    const reflexPorts = ([-0.32, 0.32] as const).map((px) =>
      transformMesh(latheMesh([[0.03, -0.02], [0.065, 0.018], [0.072, 0]], 10), {
        pos: [px, 0.22, 0.43],
        rot: [Math.PI * 0.5, 0, 0]
      })
    );
    const topHornHead = loftSectionsMesh([
      trapezoidSectionXZ(0.94, 0.74, 0.76, 1.13, 0.0),
      trapezoidSectionXZ(0.98, 0.78, 0.82, 1.98, 0.03)
    ], true, true);
    const hornMouth = transformMesh(bevelBoxMesh(0.70, 0.26, 0.07, 0.016), { pos: [0, 1.60, 0.415] });
    const tweeterBullet = transformMesh(
      latheMesh([[0, 0.045], [0.055, 0.02], [0.11, -0.01], [0.12, 0]], 12),
      { pos: [0, 1.60, 0.445], rot: [Math.PI * 0.5, 0, 0] }
    );

    return rawToMeshData(mergeRawList([bassBin, woofer, ...reflexPorts, topHornHead, hornMouth, tweeterBullet]));
  });
}

/**
 * Unit `1 x 1 x 1` centered chamfered octagonal EQ spectrum column (`[-0.5 .. +0.5]^3`),
 * flat-shaded for crisp specular facet highlights while keeping per-column vertex count low
 * for 60-column real-time 132 BPM height updates.
 */
export function sculptEqVisualizerColumnMesh(): ColoredMeshData {
  const prism = toFlatShaded(
    loftSectionsMesh([
      octagonSectionXZ(0.5, 0.5, -0.5, 0.22),
      octagonSectionXZ(0.46, 0.46, 0.46, 0.22),
      octagonSectionXZ(0.38, 0.38, 0.5, 0.22)
    ], true, true)
  );
  return rawToMeshData(prism);
}

/**
 * Open aluminum box-truss stadium concert arch (`top = 12.6 m`, chamfered upper corners
 * preserving portrait `390x844` sky/HUD framing) with 4 underslung moving-head spot cans.
 */
export function sculptTrussBeatArchMesh(floorY: number): ColoredMeshData {
  return memoizeGeometry(`bh:stage:truss-arch:${floorY}:v2`, () => {
    const shoulderY = 10.6;
    const top = 12.6;
    const legH = shoulderY - floorY;

    const verticalLeg = latticeTrussMesh({
      span: [0.52, legH, 0.52],
      bays: 9,
      chordRadius: 0.042,
      braceRadius: 0.024
    });
    const chamferHaunch = bevelBoxMesh(0.48, 2.86, 0.48, 0.04);
    const crownTruss = latticeTrussMesh({
      span: [12.1, 0.52, 0.52],
      bays: 10,
      chordRadius: 0.042,
      braceRadius: 0.024
    });

    const spotCan = latheMesh([[0, -0.18], [0.16, -0.16], [0.18, 0.16], [0.21, 0.22], [0, 0.22]], 10);
    const spots = [-4.2, -1.5, 1.5, 4.2].map((sx, idx) =>
      transformMesh(spotCan, {
        pos: [sx, top - 0.44, 0.08],
        rot: [0.95 + (idx % 2) * 0.18, 0, 0]
      })
    );

    return rawToMeshData(
      mergeRawList([
        transformMesh(verticalLeg, { pos: [-7.9, floorY + legH * 0.5, 0] }),
        transformMesh(verticalLeg, { pos: [7.9, floorY + legH * 0.5, 0] }),
        transformMesh(chamferHaunch, { pos: [-6.9, 11.6, 0], rot: [0, 0, -Math.PI * 0.25] }),
        transformMesh(chamferHaunch, { pos: [6.9, 11.6, 0], rot: [0, 0, Math.PI * 0.25] }),
        transformMesh(crownTruss, { pos: [0, top, 0] }),
        ...spots
      ])
    );
  });
}

/**
 * Multi-hue neon tube frame + 4 multicolored concert spotlight apertures & angled down-beams
 * (`#00f2ff` cyan, `#ffbe2e` solar gold, `#8b5cf6` ultraviolet, `#ff2e88` coral-magenta) mounted
 * inside each raised stadium concert truss arch.
 */
export function sculptArchGlowParts(): ToneMeshParts {
  return memoizeGeometry("bh:stage:arch-glow:v2", () => {
    const shoulderY = 10.2;
    const top = 12.05;
    const legH = shoulderY - 0.2;
    const entries: { mesh: RawMesh; hex: string; boost?: number }[] = [
      { mesh: transformMesh(bevelBoxMesh(0.12, legH, 0.12, 0.02), { pos: [-7.4, 0.2 + legH * 0.5, 0] }), hex: "#8b5cf6", boost: 0.92 },
      { mesh: transformMesh(bevelBoxMesh(0.12, legH, 0.12, 0.02), { pos: [7.4, 0.2 + legH * 0.5, 0] }), hex: "#8b5cf6", boost: 0.92 },
      { mesh: transformMesh(bevelBoxMesh(0.12, 2.65, 0.12, 0.02), { pos: [-6.48, 11.12, 0], rot: [0, 0, -Math.PI * 0.25] }), hex: "#ffbe2e", boost: 1.02 },
      { mesh: transformMesh(bevelBoxMesh(0.12, 2.65, 0.12, 0.02), { pos: [6.48, 11.12, 0], rot: [0, 0, Math.PI * 0.25] }), hex: "#ffbe2e", boost: 1.02 },
      { mesh: transformMesh(bevelBoxMesh(11.3, 0.12, 0.12, 0.02), { pos: [0, top, 0] }), hex: "#00f2ff", boost: 1.08 }
    ];

    // 4 multicolored concert spotlight lenses + soft volumetric down-cones at the 4 spot cans
    const spotLens = latheMesh([[0, 0.23], [0.19, 0.23], [0.20, 0.19]], 10);
    const spotCone = latheMesh([[0.17, 0.24], [0.88, 4.4]], 12);
    const spotColors = ["#00f2ff", "#ffbe2e", "#8b5cf6", "#ff2e88"] as const;
    const spotXs = [-4.2, -1.5, 1.5, 4.2] as const;
    spotXs.forEach((sx, idx) => {
      const hex = spotColors[idx]!;
      const pitch = 1.18 + (idx % 2) * 0.14;
      const yaw = (idx - 1.5) * -0.10;
      entries.push(
        {
          mesh: transformMesh(spotLens, { pos: [sx, 12.16, -0.24], rot: [pitch, yaw, 0] }),
          hex,
          boost: 1.45
        },
        {
          mesh: transformMesh(spotCone, { pos: [sx, 12.16, -0.24], rot: [pitch, yaw, 0] }),
          hex,
          boost: 0.18
        }
      );
    });

    return mergeToneParts(entries);
  });
}

/**
 * V-braced architectural stage trestle pylon supporting the elevated runway every 12 m:
 * chamfered pier + twin tubular V-struts + flared crosshead saddle girder.
 */
export function sculptTrackTrestlePylonMesh(floorY: number): ColoredMeshData {
  return memoizeGeometry(`bh:stage:trestle-pylon:${floorY}:v2`, () => {
    const pierH = -floorY - 1.1;
    const pier = transformMesh(bevelBoxMesh(0.92, pierH, 0.92, 0.08), {
      pos: [0, floorY + pierH * 0.5, 0]
    });
    const plinth = transformMesh(bevelBoxMesh(1.48, 0.36, 1.48, 0.06), {
      pos: [0, floorY + 0.18, 0]
    });
    const strutL = tubeSweepMesh([[0, floorY + pierH * 0.58, 0, 0.12], [-2.15, -0.92, 0, 0.10]], 8, false);
    const strutR = tubeSweepMesh([[0, floorY + pierH * 0.58, 0, 0.12], [2.15, -0.92, 0, 0.10]], 8, false);
    const saddle = loftSectionsMesh([
      trapezoidSectionXZ(4.6, 4.6, 0.66, -1.14, 0),
      trapezoidSectionXZ(5.5, 5.5, 0.78, -0.62, 0)
    ], true, true);

    return rawToMeshData(mergeRawList([plinth, pier, strutL, strutR, saddle]));
  });
}

// ---------------------------------------------------------------------------
// Assembly 7: Hardware-Instanced Runway Rails & 132 BPM Equalizer Tower Banks
//   Eliminates per-frame CPU vertex rewriting (`eq.place` / `eq.flush`) by
//   driving `instances.custom` banks via runtime transform handles (`>=60 FPS`).
// ---------------------------------------------------------------------------

export const EQ_HARMONIC_BANDS = 5;

/**
 * Hardware-instanced multi-color synthwave runway side rails flanking the obsidian highway:
 * dark charcoal bumper housings + crisp electric-cyan (`#00f2ff`) inner guide strips +
 * solar-gold (`#ffbe2e`) outer side accent rails.
 */
export function buildRunwayRailsNode(
  roadWidth: number,
  trackLen: number,
  deckZ: number
): ReturnType<typeof group> {
  const mats = getConcertStageMaterials();
  const halfZ = trackLen * 0.5;
  const bumperProfile = loftSectionsMesh([
    [[-0.12, -0.18, -halfZ], [0.12, -0.18, -halfZ], [0.11, 0.11, -halfZ], [-0.11, 0.11, -halfZ]],
    [[-0.12, -0.18, halfZ], [0.12, -0.18, halfZ], [0.11, 0.11, halfZ], [-0.11, 0.11, halfZ]]
  ], true, true);
  const innerGuideStrip = bevelBoxMesh(0.068, 0.055, trackLen, 0.010);
  const outerGoldStrip = bevelBoxMesh(0.048, 0.048, trackLen, 0.008);

  const railX = roadWidth * 0.5 + 0.13;
  return group("rails", [
    instances.custom(mergeRawMeshes([bumperProfile]), {
      name: "rails-housing",
      material: mats.instCabinetMatte,
      transforms: [
        { position: [-railX, 0.02, deckZ] },
        { position: [railX, 0.02, deckZ] }
      ],
      castShadow: false,
      receiveShadow: false
    }),
    instances.custom(mergeRawMeshes([innerGuideStrip]), {
      name: "rails-cyan-guide",
      material: mats.instNeonCyan,
      transforms: [
        { position: [-(railX - 0.048), 0.145, deckZ] },
        { position: [railX - 0.048, 0.145, deckZ] }
      ],
      castShadow: false,
      receiveShadow: false
    }),
    instances.custom(mergeRawMeshes([outerGoldStrip]), {
      name: "rails-gold-trim",
      material: mats.instNeonGold,
      transforms: [
        { position: [-(railX + 0.098), 0.06, deckZ] },
        { position: [railX + 0.098, 0.06, deckZ] }
      ],
      castShadow: false,
      receiveShadow: false
    })
  ]).runtime({ id: "rails" });
}

/**
 * Builds 5 harmonic-phase `instances.custom` equalizer tower banks (`60` columns total, `12` per bank,
 * grounded at local `minY = 0` inside `grp-eq` so `setScale([1, scaleY, 1])` dances tower heights on
 * the 132 BPM beat across 4 crisp multi-hue spectrum bands: cyan -> ultraviolet -> solar gold -> coral peak).
 */
export function buildEqualizerTowerBanks(opts: {
  readonly floorY: number;
  readonly nearZ: number;
  readonly farZ: number;
  readonly period: number;
}): {
  readonly rootGroup: ReturnType<typeof group>;
  readonly bandPhases: readonly number[];
} {
  const mats = getConcertStageMaterials();
  const unitBody = toFlatShaded(
    loftSectionsMesh([
      octagonSectionXZ(0.50, 0.50, 0.0, 0.22),
      octagonSectionXZ(0.47, 0.47, 0.92, 0.22),
      octagonSectionXZ(0.39, 0.39, 1.0, 0.22)
    ], true, true)
  );
  const lowCyanGlow = mergeRawList(
    [0.14, 0.28].map((ry) => transformMesh(bevelBoxMesh(1.02, 0.046, 1.02, 0.010), { pos: [0, ry, 0] }))
  );
  const midVioletGlow = mergeRawList(
    [0.44, 0.58].map((ry) => transformMesh(bevelBoxMesh(0.98, 0.046, 0.98, 0.010), { pos: [0, ry, 0] }))
  );
  const highGoldGlow = transformMesh(bevelBoxMesh(0.93, 0.050, 0.93, 0.012), { pos: [0, 0.75, 0] });
  const peakCoralGlow = transformMesh(bevelBoxMesh(0.84, 0.054, 0.84, 0.014), { pos: [0, 0.95, 0] });

  const bodySpec = mergeRawMeshes([unitBody]);
  const lowSpec = mergeRawMeshes([lowCyanGlow]);
  const midSpec = mergeRawMeshes([midVioletGlow]);
  const highSpec = mergeRawMeshes([highGoldGlow]);
  const peakSpec = mergeRawMeshes([peakCoralGlow]);

  let s = 0xbea7 >>> 0;
  const eqRand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const eqPer = 10;
  const eqCopies = Math.ceil((opts.nearZ - (opts.farZ - opts.period)) / opts.period);
  const eqTpl = Array.from({ length: eqPer }, (_, k) => {
    const side = k % 2 === 0 ? -1 : 1;
    return {
      x: side * (9 + ((k >> 1) % 2) * 3.2 + eqRand() * 0.8),
      z: -((k >> 1) / (eqPer / 2)) * opts.period - (side > 0 ? opts.period / eqPer : 0),
      base: 2 + eqRand() * 7,
      phase: eqRand() * Math.PI * 2
    };
  });

  const bankTransforms: AuraTransformSpec[][] = Array.from({ length: EQ_HARMONIC_BANDS }, () => []);
  const bandPhases = Array.from({ length: EQ_HARMONIC_BANDS }, (_, b) => (b / EQ_HARMONIC_BANDS) * Math.PI * 2);

  for (let c = 0; c < eqCopies; c += 1) {
    for (let k = 0; k < eqTpl.length; k += 1) {
      const t = eqTpl[k]!;
      const z = opts.nearZ + t.z - c * opts.period;
      if (z > 2.5) continue;
      const bandIdx = (k + c * 2) % EQ_HARMONIC_BANDS;
      const baseHeight = (t.base * 0.72) - opts.floorY;
      bankTransforms[bandIdx]!.push({
        position: [t.x, 0, z],
        scale: [1.15, Math.max(2.5, baseHeight), 1.15]
      });
    }
  }

  const bankGroups = bankTransforms.map((transforms, b) => {
    const safeTransforms: readonly AuraTransformSpec[] =
      transforms.length > 0 ? transforms : [{ position: [12, 0, -40], scale: [1.15, 6, 1.15] }];
    return group(`eq-band-${b}`, [
      instances.custom(bodySpec, {
        name: `eq-band-${b}-body`,
        material: mats.instCabinetMatte,
        transforms: safeTransforms,
        castShadow: false,
        receiveShadow: false
      }),
      instances.custom(lowSpec, {
        name: `eq-band-${b}-low`,
        material: mats.instNeonCyan,
        transforms: safeTransforms,
        castShadow: false,
        receiveShadow: false
      }),
      instances.custom(midSpec, {
        name: `eq-band-${b}-mid`,
        material: mats.instNeonViolet,
        transforms: safeTransforms,
        castShadow: false,
        receiveShadow: false
      }),
      instances.custom(highSpec, {
        name: `eq-band-${b}-high`,
        material: mats.instNeonGold,
        transforms: safeTransforms,
        castShadow: false,
        receiveShadow: false
      }),
      instances.custom(peakSpec, {
        name: `eq-band-${b}-peak`,
        material: mats.instNeonMagenta,
        transforms: safeTransforms,
        castShadow: false,
        receiveShadow: false
      })
    ])
      .position(0, opts.floorY, 0)
      .runtime({ id: `eq-band-${b}` });
  });

  return {
    rootGroup: group("grp-eq", bankGroups).runtime({ id: "grp-eq" }),
    bandPhases
  };
}
