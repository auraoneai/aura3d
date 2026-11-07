import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------- helpers
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const parseHex = (c: string): V3 => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16)
];
const toHex = (c: V3): string =>
  "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const mixHex = (a: string, b: string, t: number): string => {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
};

// ---------------------------------------------------------------- world constants
const CAM_CENTER: V3 = [0, 9, 32];
const LOOP_SECONDS = 48;
const HAZE_ISLAND = "#a9b2e2"; // pale, bluish lavender for aerial perspective
const HAZE_CLOUD = "#f3b0bd";

const hazeAmount = (pos: V3, strength: number): number => {
  const d = Math.hypot(pos[0] - CAM_CENTER[0], pos[1] - CAM_CENTER[1], pos[2] - CAM_CENTER[2]);
  const f = clamp((d - 45) / 230, 0, 1);
  return Math.pow(f, 0.85) * strength;
};

// ---------------------------------------------------------------- island meshes
class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly indices: number[] = [];
  // Triangles are wound so that they face away from this point.
  constructor(private readonly inside: V3) {}

  tri(a: V3, b: V3, c: V3): void {
    let p1 = b;
    let p2 = c;
    let nx = (p1[1] - a[1]) * (p2[2] - a[2]) - (p1[2] - a[2]) * (p2[1] - a[1]);
    let ny = (p1[2] - a[2]) * (p2[0] - a[0]) - (p1[0] - a[0]) * (p2[2] - a[2]);
    let nz = (p1[0] - a[0]) * (p2[1] - a[1]) - (p1[1] - a[1]) * (p2[0] - a[0]);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    const cx = (a[0] + b[0] + c[0]) / 3 - this.inside[0];
    const cy = (a[1] + b[1] + c[1]) / 3 - this.inside[1];
    const cz = (a[2] + b[2] + c[2]) / 3 - this.inside[2];
    if (nx * cx + ny * cy + nz * cz < 0) {
      p1 = c;
      p2 = b;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const base = this.positions.length / 3;
    for (const p of [a, p1, p2]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx / len, ny / len, nz / len);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  quad(a: V3, b: V3, c: V3, d: V3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
}

interface IslandShape {
  readonly outline: (theta: number) => number;
  readonly surfaceY: (x: number, z: number) => number;
  readonly rock: ReturnType<typeof geometry.define>;
  readonly grass: ReturnType<typeof geometry.define>;
}

const SEG = 14;
const GRASS_FRACTIONS = [0, 0.38, 0.72, 1];

const buildIsland = (R: number, H: number, seed: number): IslandShape => {
  const rnd = mulberry32(seed);
  const p1 = rnd() * 6.28;
  const p2 = rnd() * 6.28;
  const p3 = rnd() * 6.28;
  const outline = (theta: number): number =>
    R * (1 + 0.1 * Math.sin(2 * theta + p1) + 0.07 * Math.sin(3 * theta + p2) + 0.04 * Math.sin(5 * theta + p3));
  const thetaAt = (j: number): number => (j / SEG) * Math.PI * 2;

  // Rock: an inverted lump tapering to a ragged tip. Never wider than the outline so the waterfall clears it.
  const rock = new MeshBuilder([0, -H * 0.4, 0]);
  const N = 7;
  const rings: V3[][] = [];
  for (let k = 0; k < N; k += 1) {
    const v = k / N;
    const prof = Math.pow(1 - v, 0.72);
    const y = -H * Math.pow(v, 1.1);
    const ring: V3[] = [];
    for (let j = 0; j < SEG; j += 1) {
      const th = thetaAt(j) + (k === 0 ? 0 : (rnd() - 0.5) * 0.3);
      const jag = k === 0 ? 1 : 0.8 + rnd() * 0.2;
      const r = outline(th) * prof * jag;
      ring.push([r * Math.cos(th), y + (k === 0 ? 0 : (rnd() - 0.5) * H * 0.04), r * Math.sin(th)]);
    }
    rings.push(ring);
  }
  const tip: V3 = [(rnd() - 0.5) * R * 0.15, -H * 1.02, (rnd() - 0.5) * R * 0.15];
  for (let k = 0; k < N - 1; k += 1) {
    for (let j = 0; j < SEG; j += 1) {
      const j2 = (j + 1) % SEG;
      rock.quad(rings[k]![j]!, rings[k]![j2]!, rings[k + 1]![j2]!, rings[k + 1]![j]!);
    }
  }
  for (let j = 0; j < SEG; j += 1) {
    rock.tri(rings[N - 1]![j]!, rings[N - 1]![(j + 1) % SEG]!, tip);
  }

  // Grass: a shallow dome with a short skirt over the rim.
  const dome = 0.1 * R;
  const heights = [dome, dome * 0.82, dome * 0.46, 0];
  const grass = new MeshBuilder([0, -R * 0.6, 0]);
  const top: V3 = [0, dome, 0];
  const gRings: V3[][] = [];
  for (let i = 1; i < GRASS_FRACTIONS.length; i += 1) {
    const f = GRASS_FRACTIONS[i]!;
    const ring: V3[] = [];
    for (let j = 0; j < SEG; j += 1) {
      const th = thetaAt(j);
      const r = outline(th) * f * (i === GRASS_FRACTIONS.length - 1 ? 1.03 : 1);
      const bump = i === GRASS_FRACTIONS.length - 1 ? 0 : (rnd() - 0.5) * dome * 0.18;
      ring.push([r * Math.cos(th), heights[i]! + bump, r * Math.sin(th)]);
    }
    gRings.push(ring);
  }
  const skirt: V3[] = [];
  for (let j = 0; j < SEG; j += 1) {
    const th = thetaAt(j);
    const r = outline(th) * 0.98;
    skirt.push([r * Math.cos(th), -0.09 * R, r * Math.sin(th)]);
  }
  gRings.push(skirt);
  for (let j = 0; j < SEG; j += 1) grass.tri(top, gRings[0]![j]!, gRings[0]![(j + 1) % SEG]!);
  for (let i = 0; i < gRings.length - 1; i += 1) {
    for (let j = 0; j < SEG; j += 1) {
      const j2 = (j + 1) % SEG;
      grass.quad(gRings[i]![j]!, gRings[i]![j2]!, gRings[i + 1]![j2]!, gRings[i + 1]![j]!);
    }
  }

  const bounds = (m: MeshBuilder) => {
    void m;
    return { min: [-R * 1.2, -H * 1.1, -R * 1.2] as V3, max: [R * 1.2, dome * 1.5 + 0.5, R * 1.2] as V3 };
  };
  const define = (m: MeshBuilder) =>
    geometry.define({
      positions: new Float32Array(m.positions),
      normals: new Float32Array(m.normals),
      indices: m.indices,
      bounds: bounds(m)
    });

  const surfaceY = (x: number, z: number): number => {
    const edge = outline(Math.atan2(z, x)) * 1.03;
    const f = clamp(Math.hypot(x, z) / edge, 0, 1);
    for (let i = 1; i < GRASS_FRACTIONS.length; i += 1) {
      const f0 = GRASS_FRACTIONS[i - 1]!;
      const f1 = GRASS_FRACTIONS[i]!;
      if (f <= f1) {
        const t = (f - f0) / (f1 - f0);
        return heights[i - 1]! + (heights[i]! - heights[i - 1]!) * t - 0.15 * dome;
      }
    }
    return 0;
  };

  return { outline, surfaceY, rock: define(rock), grass: define(grass) };
};

// ---------------------------------------------------------------- island layout
interface IslandDef {
  readonly id: string;
  readonly pos: V3;
  readonly R: number;
  readonly H: number;
  readonly speed: number;
  readonly phase: number;
  readonly amp: number;
  readonly trees: number;
  readonly crystals: number;
  readonly crystalColor: string;
}

const ISLANDS: readonly IslandDef[] = [
  { id: "isle-0", pos: [-12, 2, -85], R: 17, H: 28, speed: 0.42, phase: 0.0, amp: 1.5, trees: 9, crystals: 4, crystalColor: "#6ff0ff" },
  { id: "isle-1", pos: [30, 14, -55], R: 9, H: 15, speed: 0.67, phase: 1.7, amp: 1.0, trees: 5, crystals: 2, crystalColor: "#ff7ad9" },
  { id: "isle-2", pos: [-48, 22, -60], R: 7, H: 11, speed: 0.55, phase: 3.1, amp: 0.9, trees: 3, crystals: 3, crystalColor: "#ffd36b" },
  { id: "isle-3", pos: [14, 30, -120], R: 11, H: 17, speed: 0.36, phase: 4.4, amp: 1.3, trees: 6, crystals: 3, crystalColor: "#6ff0ff" },
  { id: "isle-4", pos: [60, 6, -100], R: 8, H: 13, speed: 0.78, phase: 2.2, amp: 1.0, trees: 4, crystals: 2, crystalColor: "#ff7ad9" },
  { id: "isle-5", pos: [-70, -2, -135], R: 12, H: 19, speed: 0.31, phase: 5.3, amp: 1.4, trees: 6, crystals: 3, crystalColor: "#ffd36b" },
  { id: "isle-6", pos: [-20, 34, -170], R: 8, H: 12, speed: 0.6, phase: 0.9, amp: 1.2, trees: 3, crystals: 2, crystalColor: "#6ff0ff" },
  { id: "isle-7", pos: [42, -12, -150], R: 14, H: 21, speed: 0.28, phase: 3.9, amp: 1.6, trees: 7, crystals: 3, crystalColor: "#ff7ad9" },
  { id: "isle-8", pos: [90, 28, -190], R: 10, H: 16, speed: 0.5, phase: 2.8, amp: 1.2, trees: 4, crystals: 2, crystalColor: "#ffd36b" },
  { id: "isle-9", pos: [-2, -8, -45], R: 4.5, H: 7, speed: 0.9, phase: 1.1, amp: 0.6, trees: 2, crystals: 2, crystalColor: "#6ff0ff" },
  { id: "isle-10", pos: [-30, 12, -30], R: 3.5, H: 5.5, speed: 1.05, phase: 4.9, amp: 0.5, trees: 1, crystals: 2, crystalColor: "#ff7ad9" }
];

const WATERFALL_ANGLE = 0.95;
const WATERFALL_LENGTH = 46;
const DROPLETS = 44;

const buildIslandNode = (def: IslandDef, index: number) => {
  const rnd = mulberry32(1000 + index * 77);
  const shape = buildIsland(def.R, def.H, 31 + index * 17);
  const haze = hazeAmount(def.pos, 0.8);
  const tint = (c: string): string => mixHex(c, HAZE_ISLAND, haze);

  const rockMat = material.pbr({ color: tint("#7b5d6c"), roughness: 0.95 });
  const grassMat = material.pbr({ color: tint("#86b445"), roughness: 0.9 });
  const trunkMat = material.pbr({ color: tint("#5b3d2e"), roughness: 1 });
  const crownMat = material.pbr({ color: tint("#3b8050"), roughness: 0.9 });
  const crystalMat = material.emissive({
    color: tint(def.crystalColor),
    emissive: def.crystalColor,
    emissiveIntensity: 1.1 * (1 - haze * 0.6),
    roughness: 0.3
  });

  const sf = clamp(def.R / 8, 0.6, 1.3);
  const trunks: AuraTransformSpec[] = [];
  const crowns: AuraTransformSpec[] = [];
  const spots: Array<[number, number, number]> = [];
  const place = (minDist: number, rhoMin: number, rhoMax: number): [number, number] | undefined => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const th = rnd() * Math.PI * 2;
      const rho = (rhoMin + rnd() * (rhoMax - rhoMin)) * shape.outline(th);
      const x = rho * Math.cos(th);
      const z = rho * Math.sin(th);
      // keep the waterfall lip clear on the biggest island
      if (def.id === "isle-0" && Math.abs(Math.atan2(Math.sin(th - WATERFALL_ANGLE), Math.cos(th - WATERFALL_ANGLE))) < 0.45 && rho > 0.55 * def.R) continue;
      if (spots.every((s) => Math.hypot(s[0] - x, s[1] - z) > Math.max(minDist, s[2]))) {
        spots.push([x, z, minDist]);
        return [x, z];
      }
    }
    return undefined;
  };

  for (let i = 0; i < def.trees; i += 1) {
    const k = sf * (0.7 + rnd() * 0.55);
    const at = place(2.4 * k, 0.1, 0.74);
    if (!at) continue;
    const y = shape.surfaceY(at[0], at[1]);
    trunks.push({ position: [at[0], y + 0.7 * k, at[1]], scale: [0.34 * k, 1.5 * k, 0.34 * k] });
    crowns.push({ position: [at[0], y + 2.3 * k, at[1]], scale: [2.3 * k, 2.8 * k, 2.3 * k], rotation: [0, rnd() * 3, 0] });
    crowns.push({ position: [at[0], y + 3.7 * k, at[1]], scale: [1.6 * k, 2.2 * k, 1.6 * k], rotation: [0, rnd() * 3, 0] });
  }

  const shards: AuraTransformSpec[] = [];
  for (let i = 0; i < def.crystals; i += 1) {
    const at = place(1.6 * sf, 0.2, 0.78);
    if (!at) continue;
    const y = shape.surfaceY(at[0], at[1]);
    const count = 2 + Math.floor(rnd() * 2);
    for (let s = 0; s < count; s += 1) {
      const h = (1.4 + rnd() * 1.8) * sf;
      shards.push({
        position: [at[0] + (rnd() - 0.5) * 0.9 * sf, y + h * 0.4, at[1] + (rnd() - 0.5) * 0.9 * sf],
        scale: [0.42 * sf, h, 0.42 * sf],
        rotation: [(rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5]
      });
    }
  }

  const children = [
    geometry.custom(shape.rock, { name: `${def.id}-rock`, material: rockMat }),
    geometry.custom(shape.grass, { name: `${def.id}-grass`, material: grassMat }),
    ...(trunks.length > 0
      ? [
          instances.cylinder({ name: `${def.id}-trunks`, transforms: trunks, material: trunkMat, params: { radialSegments: 6 } }),
          instances.cone({ name: `${def.id}-crowns`, transforms: crowns, material: crownMat, params: { radialSegments: 7 } })
        ]
      : []),
    ...(shards.length > 0
      ? [instances.cone({ name: `${def.id}-crystals`, transforms: shards, material: crystalMat, params: { radialSegments: 5 } })]
      : [])
  ];

  let lipX = 0;
  let lipZ = 0;
  if (index === 0) {
    const r = shape.outline(WATERFALL_ANGLE) * 1.07;
    lipX = r * Math.cos(WATERFALL_ANGLE);
    lipZ = r * Math.sin(WATERFALL_ANGLE);
    const water = material.emissive({ color: "#d9f3ff", emissive: "#9fd8ff", emissiveIntensity: 0.9, roughness: 0.2, opacity: 0.8 });
    const seg = WATERFALL_LENGTH / 4;
    const widths = [1.3, 1.0, 0.75, 0.5];
    for (let i = 0; i < 4; i += 1) {
      children.push(
        primitives.box({ name: `fall-${i}`, size: [widths[i]!, seg, widths[i]! * 0.7], material: water }).position(lipX, 0.2 - seg * (i + 0.5), lipZ)
      );
    }
    children.push(
      instances.sphere({
        name: "fall-drops",
        transforms: Array.from({ length: DROPLETS }, () => ({ position: [lipX, -5, lipZ] as V3, scale: 0.01 })),
        material: material.emissive({ color: "#ffffff", emissive: "#d6efff", emissiveIntensity: 1, roughness: 0.3 }),
        params: { widthSegments: 8, heightSegments: 6 }
      }).runtime({ id: "fall-drops", mutable: true })
    );
  }

  return {
    node: group(def.id, children, { position: def.pos }).runtime({ id: def.id, mutable: true }),
    lipX,
    lipZ
  };
};

// ---------------------------------------------------------------- clouds
interface CloudDef {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly length: number;
  readonly speed: number;
}

const CLOUDS: readonly CloudDef[] = [
  { id: "cloud-0", x: -40, y: -22, z: -40, length: 34, speed: 0.9 },
  { id: "cloud-1", x: 30, y: -28, z: -55, length: 40, speed: 0.7 },
  { id: "cloud-2", x: 0, y: -35, z: -90, length: 60, speed: 0.5 },
  { id: "cloud-3", x: -60, y: -30, z: -120, length: 70, speed: 0.6 },
  { id: "cloud-4", x: 70, y: -38, z: -140, length: 75, speed: 0.45 },
  { id: "cloud-5", x: 10, y: -45, z: -180, length: 90, speed: 0.35 },
  { id: "cloud-6", x: -30, y: -20, z: -170, length: 80, speed: 0.4 },
  { id: "cloud-7", x: -55, y: 8, z: -45, length: 30, speed: 1.4 },
  { id: "cloud-8", x: 45, y: 36, z: -110, length: 50, speed: 0.8 },
  { id: "cloud-9", x: -10, y: 48, z: -150, length: 60, speed: 0.6 },
  { id: "cloud-10", x: 80, y: -2, z: -200, length: 90, speed: 0.3 },
  { id: "cloud-11", x: -90, y: 24, z: -220, length: 100, speed: 0.3 },
  { id: "cloud-12", x: 20, y: 5, z: -260, length: 110, speed: 0.25 },
  { id: "cloud-13", x: -30, y: 28, z: -320, length: 120, speed: 0.2 }
];

const cloudBank = (def: CloudDef, index: number) => {
  const rnd = mulberry32(500 + index * 31);
  const puffs: AuraTransformSpec[] = [];
  const count = 7 + Math.floor(def.length / 30);
  for (let i = 0; i < count; i += 1) {
    const u = (i + 0.5) / count - 0.5;
    const w = def.length * (0.2 + rnd() * 0.14) * (1 - Math.abs(u) * 0.9);
    puffs.push({
      position: [u * def.length * 0.9, (rnd() - 0.3) * w * 0.18, (rnd() - 0.5) * def.length * 0.22],
      scale: [w * 1.5, w * 0.55, w * 1.0]
    });
  }
  const pos: V3 = [def.x, def.y, def.z];
  const haze = hazeAmount(pos, 0.7);
  const base = mixHex("#ffe2d2", HAZE_CLOUD, haze);
  const mat = material.pbr({
    color: base,
    emissive: mixHex("#ff9f8f", "#d98aa8", haze),
    emissiveIntensity: 0.45,
    roughness: 1
  });
  return instances.sphere({
    name: def.id,
    transforms: puffs,
    material: mat,
    params: { widthSegments: 14, heightSegments: 8 }
  })
    .position(def.x, def.y, def.z)
    .runtime({ id: def.id, mutable: true });
};

// ---------------------------------------------------------------- scene
const sunPos: V3 = [-44, 22, -418];

let sceneBuilder = scene({ background: "#f5a272" })
  .add(
    sky.gradient({
      zenith: "#a24d9e",
      horizon: "#ffb26b",
      ground: "#ffa579",
      exponent: 0.7,
      horizonGlow: 0.6,
      bands: [{ elevationDeg: 8, widthDeg: 22, color: "#ff7fa0", intensity: 0.35 }],
      name: "sunset-sky"
    })
  )
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffb7a0", groundColor: "#8a5a9a", intensity: 0.9 }))
  .add(lights.directional({ name: "sun-rim", position: sunPos, target: [0, 5, -90], intensity: 2.8, color: "#ffb070" }))
  .add(lights.directional({ name: "fill", position: [-50, 60, 80], target: [0, 5, -90], intensity: 2.0, color: "#ffd0b8" }))
  .add(
    primitives.sphere({
      name: "sun",
      size: 92,
      material: material.emissive({ color: "#fff0c4", emissive: "#ffc766", emissiveIntensity: 3.2 })
    }).position(...sunPos)
  );

let lipX = 0;
let lipZ = 0;
ISLANDS.forEach((def, i) => {
  const built = buildIslandNode(def, i);
  if (i === 0) {
    lipX = built.lipX;
    lipZ = built.lipZ;
  }
  sceneBuilder = sceneBuilder.add(built.node);
});

CLOUDS.forEach((def, i) => {
  sceneBuilder = sceneBuilder.add(cloudBank(def, i));
});

// Mist where the waterfall ends (fixed in world space under the largest island).
const big = ISLANDS[0]!;
const mistDef: CloudDef = {
  id: "cloud-mist",
  x: big.pos[0] + lipX,
  y: big.pos[1] - WATERFALL_LENGTH - 2,
  z: big.pos[2] + lipZ,
  length: 26,
  speed: 0
};
sceneBuilder = sceneBuilder.add(cloudBank(mistDef, 99));

sceneBuilder = sceneBuilder
  .add(effects.bloom({ intensity: 0.5, threshold: 0.88, radius: 0.5 }))
  .camera(camera.perspective({ position: [0, 9, 42], target: [0, 8, -80], fov: 50, near: 1, far: 1000 }));

// ---------------------------------------------------------------- run
const cameraAt = (t: number): { position: V3; target: V3 } => {
  const a = (t / LOOP_SECONDS) * Math.PI * 2;
  return {
    position: [CAM_CENTER[0] + 26 * Math.sin(a), CAM_CENTER[1] + 2.5 * Math.sin(2 * a), CAM_CENTER[2] + 10 * (1 - Math.cos(a)) * 0.5 - 4 * Math.cos(a)],
    target: [-6 * Math.sin(a), 8 + 2 * Math.sin(a + 1), -80]
  };
};

const main = async (): Promise<void> => {
  const app = createAuraApp("#app", { scene: sceneBuilder });

  const cloudInfo = [...CLOUDS, mistDef].map((def) => {
    const depth = Math.max(40, CAM_CENTER[2] - def.z);
    return { def, wrap: depth * 0.95 + def.length * 0.8 + 40 };
  });
  const dropSeeds = Array.from({ length: DROPLETS }, (_, i) => {
    const r = mulberry32(9000 + i);
    return { phase: r(), speed: 0.55 + r() * 0.5, jx: (r() - 0.5) * 0.9, jz: (r() - 0.5) * 0.5, size: 0.45 + r() * 0.45 };
  });

  let clock = 0;
  app.onFrame((frame) => {
    clock += Math.min(frame.dt, 0.1);
    const t = clock;

    for (const def of ISLANDS) {
      const y = def.pos[1] + def.amp * Math.sin(t * def.speed + def.phase);
      const node = app.nodes.require(def.id);
      node.setPosition(def.pos[0], y, def.pos[2]);
      node.setRotation(0.012 * Math.sin(t * def.speed * 0.7 + def.phase), 0, 0.012 * Math.cos(t * def.speed * 0.6 + def.phase));
    }

    for (const { def, wrap } of cloudInfo) {
      if (def.speed === 0) continue;
      const x = ((((def.x + def.speed * t + wrap) % (2 * wrap)) + 2 * wrap) % (2 * wrap)) - wrap;
      app.nodes.require(def.id).setPosition(x, def.y + 0.6 * Math.sin(t * 0.2 + def.x), def.z);
    }

    const drops: AuraTransformSpec[] = dropSeeds.map((d) => {
      const f = (d.phase + (t * d.speed) / 3.2) % 1; // 0 at lip, 1 at the end of the fall
      const s = d.size * (1 - f * f) * (f < 0.03 ? f / 0.03 : 1);
      return {
        position: [lipX + d.jx * (1 - f * 0.6), 0.4 - f * WATERFALL_LENGTH, lipZ + d.jz],
        scale: Math.max(0.01, s)
      };
    });
    app.nodes.require("fall-drops").setInstances(drops);

    const pose = cameraAt(t);
    app.camera?.setPose({ position: pose.position, target: pose.target });
  });

  await app.ready();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
};

void main();
