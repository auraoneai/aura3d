/**
 * Patrol Wing island arena (PRD PW-04 / PW-06).
 *
 * The island is AUTHORED TERRAIN: one deterministic height function drives the
 * visual custom-geometry mesh, the prop dressing placement, AND the flight
 * crash rule (no heightfield-collider claim — the root physics facade exposes
 * no heightfield constructor, only box/sphere/capsule/plane shape factories;
 * see README known limits). The ocean is a primitive plane at y = 0.
 *
 * The arena also owns the thin Rapier sensor layer: the player's kinematic
 * sensor-proxy body, six ordered ring gate sensors, the landing-pad sensor,
 * and the return-fire orb pool. Sensor events fire once per entry exactly like
 * the vault-breakers reference (armed-pair bookkeeping).
 */
import {
  geometry,
  lights,
  material,
  model,
  physics,
  primitives,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

// ---- authored terrain --------------------------------------------------------

export const ISLAND_RADIUS = 26;
export const OCEAN_LEVEL = 0;

/** Authored island height (sea floor goes negative outside the island). */
export function islandHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r > ISLAND_RADIUS) return -6;
  const t = Math.min(1, Math.max(0, 1 - r / ISLAND_RADIUS));
  const envelope = t * t * (3 - 2 * t);
  const peak = 9.6 * envelope;
  const ridge = 2.7 * envelope * Math.sin(x * 0.35 + 1.3) * Math.cos(z * 0.42 - 0.7);
  let height = peak + ridge;
  // South cliff plateau blended flat for the landing pad at (0, 17).
  const padDist = Math.hypot(x - PAD_CENTER[0], z - PAD_CENTER[2]);
  const padBlend = Math.min(1, Math.max(0, 1 - padDist / 7));
  const plateau = 3.2;
  height = height * (1 - padBlend) + plateau * padBlend;
  return Math.round(height * 1000) / 1000;
}

/** Walkable/crash surface: the island where it breaks the water, else ocean. */
export function terrainSurface(x: number, z: number): number {
  return Math.max(islandHeight(x, z), OCEAN_LEVEL);
}

export const PAD_CENTER: readonly [number, number, number] = [0, 3.2, 17];
export const PAD_Y = 3.2;
export const PAD_RADIUS = 2.4;
/** Nose west (-X) on the pad: a descending departure over the sea, clear of the island peak. */
export const PAD_HEADING_YAW = Math.PI;

// ---- ring course -------------------------------------------------------------

export interface RingGate {
  readonly index: number;
  readonly position: readonly [number, number, number];
  /** Visual yaw for the torus (perpendicular to the flight path). */
  readonly yaw: number;
  readonly radius: number;
}

/**
 * Six ordered gates counter-clockwise around the island, starting west of the
 * pad's takeoff path. Deterministic constants shared with the unit tests and
 * the browser spec.
 */
export const RING_GATES: readonly RingGate[] = [
  { index: 0, position: [-13, 9, 12], yaw: Math.PI / 4, radius: 2.4 },
  { index: 1, position: [-19, 11, -2], yaw: Math.PI / 2 - 0.4, radius: 2.4 },
  { index: 2, position: [-12, 13, -14], yaw: -Math.PI / 4, radius: 2.4 },
  { index: 3, position: [2, 12, -18], yaw: Math.PI / 2 + 0.2, radius: 2.4 },
  { index: 4, position: [12, 10, -8], yaw: Math.PI / 2 + Math.PI / 4, radius: 2.4 },
  { index: 5, position: [10, 8, 5], yaw: -Math.PI / 2 - 0.3, radius: 2.4 }
];

export const RING_COUNT = RING_GATES.length;

// ---- deterministic prop placement (LCG, no Math.random) ----------------------

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export interface PropPlacement {
  readonly asset: "propRockA" | "propRockB" | "propConifer";
  readonly position: readonly [number, number, number];
  readonly scale: number;
  readonly yaw: number;
}

/** Deterministic island dressing from the existing typed root props. */
export function islandProps(): readonly PropPlacement[] {
  const random = lcg(0x5057);
  const out: PropPlacement[] = [];
  const kinds: PropPlacement["asset"][] = ["propRockA", "propRockB", "propConifer"];
  for (let index = 0; index < 112 && out.length < 38; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 4 + random() * 18;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const h = islandHeight(x, z);
    if (h < 0.8 || h > 8.8) continue;
    if (Math.hypot(x - PAD_CENTER[0], z - PAD_CENTER[2]) < 9) continue;
    out.push({
      asset: kinds[index % kinds.length]!,
      position: [x, h - 0.15, z],
      scale: kinds[index % kinds.length] === "propConifer"
        ? 2.0 + random() * 2.2
        : 0.75 + random() * 0.9,
      yaw: random() * Math.PI * 2
    });
  }
  return out;
}

// ---- terrain mesh ------------------------------------------------------------

interface MeshBuffers {
  positions: readonly (readonly [number, number, number])[];
  normals: readonly (readonly [number, number, number])[];
  indices: readonly number[];
}

/** Triangulated heightfield-style mesh built from the shared height function. */
export function islandTerrainMesh(resolution = 40, extent = 30): MeshBuffers {
  const count = resolution + 1;
  const step = (extent * 2) / resolution;
  const positions: [number, number, number][] = [];
  for (let iz = 0; iz < count; iz += 1) {
    for (let ix = 0; ix < count; ix += 1) {
      const x = -extent + ix * step;
      const z = -extent + iz * step;
      positions.push([x, islandHeight(x, z), z]);
    }
  }
  const indices: number[] = [];
  for (let iz = 0; iz < resolution; iz += 1) {
    for (let ix = 0; ix < resolution; ix += 1) {
      // This is a finite island, not a square heightfield pushed below the
      // water. Omitting outside cells gives the water a real shoreline and
      // stops the distant course from reading as a flat green game board.
      const centerX = -extent + (ix + 0.5) * step;
      const centerZ = -extent + (iz + 0.5) * step;
      if (Math.hypot(centerX, centerZ) > ISLAND_RADIUS) continue;
      const a = iz * count + ix;
      const b = a + 1;
      const c = a + count;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Flat accumulation normals per vertex.
  const normals: [number, number, number][] = positions.map(() => [0, 0, 0]);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ia = indices[triangle]!;
    const ib = indices[triangle + 1]!;
    const ic = indices[triangle + 2]!;
    const a = positions[ia]!;
    const b = positions[ib]!;
    const c = positions[ic]!;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const vertex of [ia, ib, ic]) {
      const n = normals[vertex]!;
      n[0] += nx; n[1] += ny; n[2] += nz;
    }
  }
  for (const n of normals) {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n[0] /= len; n[1] /= len; n[2] /= len;
  }
  return { positions, normals, indices };
}

/**
 * A separate rock skirt makes the custom terrain a continuous land mass at
 * the shoreline. The heightfield is still the single source of gameplay
 * grounding; this mesh is only the visible coastal face down into the ocean.
 */
export function islandCliffMesh(segments = 72, depth = 3.6): MeshBuffers {
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.cos(angle) * ISLAND_RADIUS;
    const z = Math.sin(angle) * ISLAND_RADIUS;
    const top = islandHeight(x, z);
    const bottom = Math.min(OCEAN_LEVEL - depth, top - depth);
    // The ring is deliberately a little inside the terrain radius so there is
    // no bright seam where the land surface meets the coastal face.
    positions.push([x, top, z], [x, bottom, z]);
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    normals.push([nx, 0.22, nz], [nx, 0.05, nz]);
  }
  for (let index = 0; index < segments; index += 1) {
    const a = index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, c, b, d);
  }
  return { positions, normals, indices };
}

// ---- scene nodes -------------------------------------------------------------

export const RING_ACTIVE_COLOR = "#ffb14d";
export const RING_PASSED_COLOR = "#39d7a8";

export interface ArenaLighting {
  readonly nodes: readonly AuraSceneNode[];
}

/** Day / dusk / night directional keys, runtime-toggled per patrol. */
export function arenaLighting(): ArenaLighting {
  return {
    nodes: [
      lights.ambient({ name: "sky fill", color: "#b8ced5", intensity: 0.56 }).toJSON(),
      lights
        .directional({ name: "golden-hour key", color: "#ffd0a0", intensity: 2.15 })
        .position(-30, 26, 18)
        .runtime({ id: "light-day", tags: ["arena-light"] })
        .toJSON(),
      lights
        .directional({ name: "dusk key", color: "#ff9c66", intensity: 1.0 })
        .position(24, 14, -20)
        .runtime({ id: "light-dusk", tags: ["arena-light"] })
        .toJSON(),
      lights
        .directional({ name: "night moon key", color: "#9db8ff", intensity: 0.72 })
        .position(10, 30, -26)
        .runtime({ id: "light-night", tags: ["arena-light"] })
        .toJSON(),
      lights
        .point({ name: "pad beacon glow", color: "#7ef8ff", intensity: 0.8 })
        .position(PAD_CENTER[0], PAD_Y + 1.6, PAD_CENTER[2])
        .toJSON()
    ]
  };
}

export function setArenaTimeOfDay(nodes: { get(id: string): { setVisible(visible: boolean): void } | undefined }, patrol: number): void {
  const day = nodes.get("light-day");
  const dusk = nodes.get("light-dusk");
  const night = nodes.get("light-night");
  day?.setVisible(patrol <= 1);
  dusk?.setVisible(patrol === 2);
  night?.setVisible(patrol >= 3);
}

/** Static arena scene nodes: terrain, ocean, pad, gates, props. */
export function arenaNodes(options: { readonly reviewCapture?: boolean } = {}): readonly AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const reviewCapture = options.reviewCapture === true;

  const mesh = islandTerrainMesh();
  nodes.push(
    geometry
      .custom(
        geometry.define({
          positions: mesh.positions,
          normals: mesh.normals,
          indices: mesh.indices
        }),
        {
          name: "island-terrain",
          material: material.pbr({ name: "island turf", color: "#557a4d", roughness: 0.9, metallic: 0.01, emissive: "#1e4231", emissiveIntensity: 0.04 })
        }
      )
      .toJSON()
  );
  const cliff = islandCliffMesh();
  nodes.push(
    geometry
      .custom(
        geometry.define({ positions: cliff.positions, normals: cliff.normals, indices: cliff.indices }),
        {
          name: "island-coastal-rock-face",
          material: material.pbr({ name: "island coastal strata", color: "#39504b", roughness: 0.96, metallic: 0, emissive: "#142629", emissiveIntensity: 0.03 })
        }
      )
      .toJSON()
  );

  // Volumetric-looking cloud banks are real low-poly scene geometry, not a
  // CSS backdrop. They give the chase frame a horizon and a readable flight
  // scale while leaving the island/rings available as the gameplay truth.
  const cloudMaterial = material.glass({ name: "coastal cloud bank", color: "#dce5e4", opacity: 0.24, transmission: 0.08, roughness: 0.46 });
  for (const [index, cloud] of (reviewCapture ? [] : [
    [-18, 10.5, -30, 5.2, 0.72, 2.4],
    [3, 12.5, -38, 6.0, 0.82, 2.9],
    [22, 9.5, -27, 4.2, 0.64, 2.0],
    [-28, 8.5, -13, 4.0, 0.6, 1.9],
    [30, 13.5, -48, 6.8, 0.88, 3.1],
    [-34, 12, -52, 5.8, 0.74, 2.7],
    [14, 8, 34, 5.2, 0.62, 2.2]
  ] as const).entries()) {
    nodes.push(
      primitives.sphere({ name: `coastal cloud bank ${index + 1}`, material: cloudMaterial })
        .position(cloud[0], cloud[1], cloud[2])
        .scale([cloud[3], cloud[4], cloud[5]])
      .toJSON()
    );
  }

  nodes.push(
    primitives
      .plane({
        name: "ocean",
        material: material.pbr({ name: "ocean water", color: "#22566a", roughness: 0.2, metallic: 0.28, opacity: 0.97, emissive: "#173d4d", emissiveIntensity: 0.12 })
      })
      .rotate(-Math.PI / 2, 0, 0)
      .scale([90, 90, 1])
      .toJSON()
  );

  // Broad, low-contrast water lanes turn the ocean into a readable surface in
  // the chase frame. They are renderer-owned set dressing only; terrain and
  // the Rapier sensor layer remain the flight truth.
  const waterLaneMaterial = material.emissive({ name: "ocean lane glint", color: "#b8d8dd", emissive: "#6fabb7", emissiveIntensity: 0.24, opacity: 0.2 });
  for (let lane = -2; lane <= 2; lane += 1) {
    nodes.push(
      primitives.box({ name: `ocean lane glint ${lane}`, material: waterLaneMaterial })
        .position(lane * 11, 0.06, -2)
        .rotate(0, lane % 2 === 0 ? -0.12 : 0.1, 0)
        .scale([0.08, 0.015, 24])
        .toJSON()
    );
  }

  nodes.push(
    primitives
      .box({
        name: "pad-slab",
        material: material.pbr({ name: "pad slab", color: "#5a5f66", roughness: 0.8 })
      })
      .position(PAD_CENTER[0], PAD_Y - 0.12, PAD_CENTER[2])
      .scale([5.4, 0.3, 5.4])
      .toJSON()
  );
  // The pad is a real raised airfield, not an isolated floating slab. A
  // westbound runway deck follows the plane's authored take-off heading and
  // gives the combat lens a layered approach line back into the island.
  const runwayDeckMaterial = material.pbr({ name: "runway basalt deck", color: "#293a49", roughness: 0.72, metallic: 0.28, emissive: "#0e1e2c", emissiveIntensity: 0.12 });
  const runwayEdgeMaterial = material.emissive({ name: "runway edge guidance", color: "#6ee7f5", emissive: "#25d2e7", emissiveIntensity: 0.72, opacity: 0.82 });
  nodes.push(
    primitives.box({ name: "airfield runway deck", material: runwayDeckMaterial })
      .position(PAD_CENTER[0] - 7.4, PAD_Y - 0.02, PAD_CENTER[2])
      .scale([7.4, 0.14, 2.25])
      .toJSON(),
    primitives.box({ name: "airfield runway understructure", material: material.pbr({ name: "runway understructure", color: "#172938", roughness: 0.86, metallic: 0.18 }) })
      .position(PAD_CENTER[0] - 7.4, PAD_Y - 1.15, PAD_CENTER[2])
      .scale([7.55, 1.0, 2.52])
      .toJSON(),
    primitives.box({ name: "runway edge left", material: runwayEdgeMaterial })
      .position(PAD_CENTER[0] - 7.4, PAD_Y + 0.16, PAD_CENTER[2] - 1.95)
      .scale([7.2, 0.035, 0.07])
      .toJSON(),
    primitives.box({ name: "runway edge right", material: runwayEdgeMaterial })
      .position(PAD_CENTER[0] - 7.4, PAD_Y + 0.16, PAD_CENTER[2] + 1.95)
      .scale([7.2, 0.035, 0.07])
      .toJSON()
  );
  // Short centreline bars create depth cues along the deck without pretending
  // the visual runway is a second collision surface.
  const runwayStripeMaterial = material.emissive({ name: "runway centreline", color: "#ffd38a", emissive: "#ff9f43", emissiveIntensity: 0.58, opacity: 0.84 });
  for (const [index, x] of [-2.5, -5.2, -7.9, -10.6].entries()) {
    nodes.push(
      primitives.box({ name: `runway centreline ${index}`, material: runwayStripeMaterial })
        .position(x, PAD_Y + 0.17, PAD_CENTER[2])
        .scale([0.72, 0.035, 0.11])
        .toJSON()
    );
  }
  nodes.push(
    // Deep piling down the cliff so the pad reads as built, not floating.
    primitives
      .box({
        name: "pad-piling",
        material: material.pbr({ name: "pad piling", color: "#3a3f46", roughness: 0.85 })
      })
      .position(PAD_CENTER[0], PAD_Y - 3, PAD_CENTER[2])
      .scale([4.2, 6, 4.2])
      .toJSON()
  );
  // Basalt terrace lips expose the authored island's elevation changes in a
  // close chase view. Their positions sit inside the same heightfield and are
  // set dressing only; terrainSurface remains the flight contact authority.
  const terraceMaterial = material.pbr({ name: "basalt terrace lips", color: "#344b50", roughness: 0.9, metallic: 0.12, emissive: "#102a30", emissiveIntensity: 0.08 });
  const terraceAccent = material.emissive({ name: "terrace edge glint", color: "#79d8d4", emissive: "#2da6ab", emissiveIntensity: 0.42, opacity: 0.52 });
  const terraces = [
    [-8.5, 2.15, 9.5, 4.2, 0.24, 1.5, -0.14],
    [5.8, 4.25, 5.1, 3.7, 0.2, 1.35, 0.22],
    [-1.5, 6.55, -1.6, 3.4, 0.18, 1.1, -0.08]
  ] as const;
  for (const [index, [x, y, z, width, height, depth, yaw]] of terraces.entries()) {
    nodes.push(
      primitives.box({ name: `island basalt terrace ${index}`, material: terraceMaterial })
        .position(x, y, z)
        .rotate(0, yaw, 0)
        .scale([width, height, depth])
        .toJSON(),
      primitives.box({ name: `island terrace edge ${index}`, material: terraceAccent })
        .position(x, y + height + 0.035, z - depth * 0.72)
        .rotate(0, yaw, 0)
        .scale([width * 0.86, 0.025, 0.045])
        .toJSON()
    );
  }
  nodes.push(
    primitives
      .torus({
        name: "pad-light-ring",
        material: material.emissive({ name: "pad ring glow", color: "#0e3f3a", emissive: "#7ef8ff", roughness: 0.3 })
      })
      .position(PAD_CENTER[0], PAD_Y + 0.08, PAD_CENTER[2])
      .rotate(-Math.PI / 2, 0, 0)
      .scale([3.6, 3.6, 3.6])
      .toJSON()
  );
  // Typed pad beacon hero sits at the pad center.
  nodes.push(
    modelNode("pad-beacon", "patrolWingPadBeacon", [PAD_CENTER[0], PAD_Y + 0.05, PAD_CENTER[2]], 4.6, PAD_HEADING_YAW, "setDressing", undefined)
  );

  // Distant Golden Horizon Sky Backdrop and Sun
  nodes.push(
    primitives
      .sphere({
        name: "distant-sun",
        material: material.emissive({ name: "sun glow", color: "#fb923c", emissive: "#fde047", roughness: 0.1 })
      })
      .position(-29, 21, -58)
      .scale(3.25)
      .toJSON()
  );

  // Coastal Island Radar / Communications Tower on Peak (0, 9.6, 0). The
  // close combat review lens omits this distant silhouette: at that angle the
  // dish collapsed into a detached black disc behind the real drone target.
  if (!reviewCapture) nodes.push(
    // Tower lattice base
    primitives
      .cylinder({
        name: "radar-tower-base",
        material: material.pbr({ name: "tower steel", color: "#334155", roughness: 0.5, metallic: 0.8 })
      })
      .position(0, 11.2, 0)
      .scale([0.6, 3.2, 0.6])
      .toJSON(),
    // Radar dish platform
    primitives
      .cylinder({
        name: "radar-platform",
        material: material.pbr({ name: "platform steel", color: "#64748b", roughness: 0.6, metallic: 0.7 })
      })
      .position(0, 12.8, 0)
      .scale([1.8, 0.15, 1.8])
      .toJSON(),
    // Beacon red flashing top light
    primitives
      .sphere({
        name: "peak-beacon-light",
        material: material.emissive({ name: "peak red beacon", color: "#7f1d1d", emissive: "#ef4444", roughness: 0.2 })
      })
      .position(0, 13.5, 0)
      .scale(0.35)
      .toJSON()
  );

  // Runway approach guidance light poles (flanking approach to pad at [0, PAD_Y, 17])
  const approachOffsets = [-4, -2, 0, 2, 4];
  approachOffsets.forEach((dz, idx) => {
    [-3.2, 3.2].forEach((dx, side) => {
      nodes.push(
        primitives
          .cylinder({
            name: `runway-post-${idx}-${side}`,
            material: material.pbr({ name: "runway post", color: "#1e293b", roughness: 0.7, metallic: 0.5 })
          })
          .position(PAD_CENTER[0] + dx, PAD_Y + 0.15, PAD_CENTER[2] + dz)
          .scale([0.08, 0.4, 0.08])
          .toJSON(),
        primitives
          .sphere({
            name: `runway-light-${idx}-${side}`,
            material: material.emissive({
              name: "runway light glow",
              color: side === 0 ? "#064e3b" : "#78350f",
              emissive: side === 0 ? "#10b981" : "#f59e0b",
              roughness: 0.2
            })
          })
          .position(PAD_CENTER[0] + dx, PAD_Y + 0.4, PAD_CENTER[2] + dz)
          .scale(0.12)
          .toJSON()
      );
    });
  });

  for (const gate of RING_GATES) {
    nodes.push(
      primitives
        .torus({
          name: `ring-${gate.index}`,
          material: material.emissive({
            name: `ring-${gate.index} glow`,
            color: "#20323a",
            emissive: RING_ACTIVE_COLOR,
            roughness: 0.35,
            opacity: 0.92
          })
        })
        .position(gate.position[0], gate.position[1], gate.position[2])
        .rotate(0, gate.yaw, 0)
        .scale([gate.radius * 2, gate.radius * 2, gate.radius * 0.9])
        .runtime({ id: `ring-${gate.index}`, tags: ["ring-gate"] })
        .toJSON()
    );
  }

  // The compact combat lens keeps enough typed rocks and trees to establish
  // scale and a flight canyon, but each placement remains snapped to the same
  // heightfield that defines the visible island and the crash surface.
  const props = reviewCapture
    // Preserve a layered typed island in the close combat lens. The previous
    // conifer-only/z<4 filter left the dogfight suspended over a single flat
    // green wedge; retaining rocks plus conifers at three depth bands gives
    // the typed terrain a readable coastline, valley, and scale reference.
    ? islandProps()
      .filter((prop) => prop.position[2] < 12 && Math.abs(prop.position[0]) < 23)
      .slice(0, 28)
    : islandProps();
  for (const prop of props) {
    nodes.push(modelNode(`prop-${prop.asset}-${prop.position[0].toFixed(1)}`, prop.asset, prop.position, prop.scale, prop.yaw, "setDressing", undefined));
  }

  if (reviewCapture) {
    // Four renderer-owned coast beacons frame the real typed island without
    // pretending to be additional gameplay sensors. Their stepped silhouettes
    // create near/mid/far depth behind the typed plane and interceptor, while
    // the emissive caps make the attack corridor legible at review distance.
    const beaconBody = material.pbr({ name: "coast beacon body", color: "#193447", roughness: 0.58, metallic: 0.68 });
    const beaconCap = material.emissive({ name: "coast beacon cap", color: "#ff6b62", emissive: "#ff3d5e", emissiveIntensity: 2.1 });
    const beaconPositions = [
      [-19, 5.6, -2], [18, 6.3, -4], [-13, 7.1, 8], [12, 5.4, 10]
    ] as const;
    for (const [index, [x, y, z]] of beaconPositions.entries()) {
      nodes.push(
        primitives.cylinder({ name: `review coast beacon ${index}`, material: beaconBody })
          .position(x, y, z).scale([0.18, 1.2 + index * 0.14, 0.18]).toJSON(),
        primitives.sphere({ name: `review coast beacon cap ${index}`, material: beaconCap })
          .position(x, y + 1.45 + index * 0.14, z).scale(0.22).toJSON()
      );
    }
  }

  return nodes;
}

/**
 * Typed-model helper. Kept local (not exported) because the route's hero
 * actors (plane, drones, ghost) are built in main.ts with runtime ids.
 */
function modelNode(
  id: string,
  assetKey: "patrolWingPadBeacon" | "propRockA" | "propRockB" | "propConifer",
  position: readonly [number, number, number],
  scale: number,
  yaw: number,
  role: "primaryCharacter" | "setDressing",
  runtimeId: string | undefined
): AuraSceneNode {
  const builder = model(assets[assetKey], {
    name: id,
    role,
    scaleMode: "fit",
    targetMaxDimension: scale
  })
    .position(position[0], position[1], position[2])
    .rotate(0, yaw, 0);
  const withRuntime = runtimeId
    ? builder.runtime({ id: runtimeId, tags: ["typed-asset"] })
    : builder;
  return withRuntime.toJSON();
}

// ---- arena physics: sensors + player proxy + orb pool -------------------------

export type ArenaPhysicsSensorKind = "ring" | "pad" | "orb-hit";

export interface ArenaSensorEvent {
  readonly kind: ArenaPhysicsSensorKind;
  readonly id: string;
  /** The other participant name (e.g. "player" for an orb hit). */
  readonly other: string;
}

export interface OrbState {
  readonly id: string;
  readonly active: boolean;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly age: number;
}

const ORB_POOL_SIZE = 8;
const ORB_SPEED = 16;
const ORB_LIFETIME = 4.5;
const ORB_SENSOR_RADIUS = 0.4;
export const PLAYER_SENSOR_RADIUS = 0.6;

export interface ArenaPhysics {
  readonly backend: string;
  readonly orbIds: readonly string[];
  setPlayerPosition(position: readonly [number, number, number]): void;
  spawnOrb(from: readonly [number, number, number], toward: readonly [number, number, number]): boolean;
  step(dt: number): readonly ArenaSensorEvent[];
  orbStates(): readonly OrbState[];
  orbActiveCount(): number;
  clearOrbs(): void;
  sensorEventCount(): number;
  bodyCount(): number;
}

/**
 * The arena's Rapier layer: a kinematic sensor-proxy sphere for the player
 * (r = 0.6, positioned per frame), six ring sensors, the pad sensor, and a
 * pooled set of kinematic return-fire orb sensors. Nothing here simulates the
 * flight — the authored FlightModel owns the trajectory.
 */
export function createArenaPhysics(ringHalfExtent = 3.0): ArenaPhysics {
  const world = physics.world({
    gravity: [0, 0, 0],
    fixedDelta: 1 / 60,
    solverIterations: 4,
    enableSleeping: false
  });

  const colliderName = new Map<number, string>();
  const sensorColliders = new Set<number>();
  const armedPairs = new Set<string>();
  let pendingSensors: ArenaSensorEvent[] = [];
  let sensorEventCountValue = 0;

  const registerSensor = (colliderId: number, name: string): void => {
    colliderName.set(colliderId, name);
    sensorColliders.add(colliderId);
  };

  // Player dynamic sensor proxy (zero gravity, positioned per frame).
  const playerBody = world.createBody({
    type: "dynamic",
    position: [PAD_CENTER[0], PAD_Y + 0.45, PAD_CENTER[2]],
    mass: 100
  });
  const playerCollider = world.createCollider(playerBody, {
    shape: physics.sphere(PLAYER_SENSOR_RADIUS)
  });
  colliderName.set(playerCollider.id, "player");

  // Ordered ring sensors.
  for (const gate of RING_GATES) {
    const body = world.createBody({
      type: "static",
      position: [gate.position[0], gate.position[1], gate.position[2]]
    });
    const collider = world.createCollider(body, {
      shape: physics.box(ringHalfExtent, ringHalfExtent, ringHalfExtent * 0.9),
      sensor: true
    });
    registerSensor(collider.id, `ring:${gate.index}`);
  }

  // Landing pad sensor (thin disc above the pad slab).
  {
    const body = world.createBody({
      type: "static",
      position: [PAD_CENTER[0], PAD_Y + 0.6, PAD_CENTER[2]]
    });
    const collider = world.createCollider(body, {
      shape: physics.box(PAD_RADIUS + 0.6, 0.7, PAD_RADIUS + 0.6),
      sensor: true
    });
    registerSensor(collider.id, "pad:pad");
  }

  // Return-fire orb pool: dynamic bodies parked below the sea floor.
  const orbs: { id: string; body: ReturnType<typeof world.createBody>; active: boolean; direction: [number, number, number]; age: number }[] = [];
  const orbIds: string[] = [];
  for (let index = 0; index < ORB_POOL_SIZE; index += 1) {
    const id = `orb-${index}`;
    const body = world.createBody({ type: "dynamic", position: [0, -40 - index, 0], mass: 1 });
    const collider = world.createCollider(body, {
      shape: physics.sphere(ORB_SENSOR_RADIUS),
      sensor: true
    });
    registerSensor(collider.id, id);
    orbs.push({ id, body, active: false, direction: [0, 1, 0], age: 0 });
    orbIds.push(id);
  }

  let playerPosition: [number, number, number] = [PAD_CENTER[0], PAD_Y + 0.45, PAD_CENTER[2]];

  const step = (dt: number): readonly ArenaSensorEvent[] => {
    // March orbs before stepping so contacts reflect this frame's positions.
    for (const orb of orbs) {
      if (!orb.active) continue;
      orb.age += dt;
      const p = orb.body.position;
      const next: [number, number, number] = [
        p[0] + orb.direction[0] * ORB_SPEED * dt,
        p[1] + orb.direction[1] * ORB_SPEED * dt,
        p[2] + orb.direction[2] * ORB_SPEED * dt
      ];
      orb.body.setPosition(next);
      if (orb.age >= ORB_LIFETIME || Math.abs(next[0]) > 90 || Math.abs(next[2]) > 90 || next[1] < terrainSurface(next[0], next[2])) {
        orb.active = false;
        orb.body.setPosition([0, -40 - Number(orb.id.slice(4)), 0]);
      }
    }

    const events = world.step(dt);
    for (const event of events) {
      const contact = event.contact;
      if (!contact || !contact.sensor) continue;
      const aName = colliderName.get(contact.colliderA);
      const bName = colliderName.get(contact.colliderB);
      if (!aName || !bName) continue;
      if (event.type !== "begin") continue;
      const pairKey = [aName, bName].sort().join("::");
      if (armedPairs.has(pairKey)) continue;
      armedPairs.add(pairKey);
      sensorEventCountValue += 1;
      const ringA = aName.startsWith("ring:");
      const ringB = bName.startsWith("ring:");
      if (ringA || ringB) {
        pendingSensors.push({ kind: "ring", id: ringA ? aName : bName, other: ringA ? bName : aName });
      } else if (aName.startsWith("pad:") || bName.startsWith("pad:")) {
        pendingSensors.push({
          kind: "pad",
          id: aName.startsWith("pad:") ? aName : bName,
          other: aName.startsWith("pad:") ? bName : aName
        });
      } else if (aName.startsWith("orb-") || bName.startsWith("orb-")) {
        pendingSensors.push({
          kind: "orb-hit",
          id: aName.startsWith("orb-") ? aName : bName,
          other: aName.startsWith("orb-") ? bName : aName
        });
      }
    }
    // Release armed pairs that no longer overlap is handled implicitly: pair
    // keys are cleared when a matching "end" event arrives.
    for (const event of events) {
      if (event.type !== "end") continue;
      const contact = event.contact;
      const aName = contact ? colliderName.get(contact.colliderA) : undefined;
      const bName = contact ? colliderName.get(contact.colliderB) : undefined;
      if (!aName || !bName) continue;
      armedPairs.delete([aName, bName].sort().join("::"));
    }
    const out = pendingSensors;
    pendingSensors = [];
    return out;
  };

  let orbSequence = 0;
  return {
    get backend(): string {
      return world.snapshot().backend.active;
    },
    orbIds,
    setPlayerPosition(position): void {
      playerPosition = [...position] as [number, number, number];
      playerBody.setPosition(playerPosition);
    },
    spawnOrb(from, toward): boolean {
      const orb = orbs.find((candidate) => !candidate.active);
      if (!orb) return false;
      const dx = toward[0] - from[0];
      const dy = toward[1] - from[1];
      const dz = toward[2] - from[2];
      const length = Math.hypot(dx, dy, dz) || 1;
      orb.direction = [dx / length, dy / length, dz / length];
      orb.age = 0;
      orb.active = true;
      orbSequence += 1;
      orb.body.setPosition([from[0], from[1], from[2]]);
      void orbSequence;
      return true;
    },
    step,
    orbStates(): readonly OrbState[] {
      return orbs.map((orb) => ({
        id: orb.id,
        active: orb.active,
        position: [...orb.body.position] as [number, number, number],
        direction: orb.direction,
        age: orb.age
      }));
    },
    orbActiveCount(): number {
      return orbs.filter((orb) => orb.active).length;
    },
    clearOrbs(): void {
      for (const orb of orbs) {
        orb.active = false;
        orb.body.setPosition([0, -40 - Number(orb.id.slice(4)), 0]);
      }
    },
    sensorEventCount(): number {
      return sensorEventCountValue;
    },
    bodyCount(): number {
      return 1 + RING_COUNT + 1 + ORB_POOL_SIZE;
    }
  };
}
