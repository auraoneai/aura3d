import {
  camera,
  effects,
  game,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraAssetRef
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export type Vec3 = [number, number, number];
export type RouteId = "coast" | "canyon" | "skyway";
export type VehicleKind =
  | "sedan"
  | "hatch"
  | "suv"
  | "taxi"
  | "van"
  | "pickup"
  | "boxtruck"
  | "bus"
  | "carrier";

export interface RouteTheme {
  readonly sky: string;
  readonly accent: string;
  readonly accentHot: string;
  readonly road: string;
  readonly roadEdge: string;
  readonly trim: string;
  readonly sun: string;
  readonly stone: string;
  readonly stoneAlt: string;
  readonly building: string;
  readonly roof: string;
  readonly foliage: string;
  readonly cloud: string;
}

export interface RouteDef {
  readonly id: RouteId;
  readonly index: number;
  readonly name: string;
  readonly tagline: string;
  readonly offsetX: number;
  readonly length: number;
  readonly baseY: number;
  readonly killY: number;
  readonly curveA: number;
  readonly curveFreq: number;
  readonly curveB: number;
  readonly curveFreq2: number;
  readonly hillA: number;
  readonly hillFreq: number;
  readonly hillB: number;
  readonly hillFreq2: number;
  readonly phase: number;
  readonly theme: RouteTheme;
}

export interface RoadPose {
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface Ledge {
  readonly route: RouteId;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly yaw: number;
  readonly halfW: number;
  readonly halfD: number;
  readonly side: number;
}

export interface TrafficSpec {
  readonly asset: AuraAssetRef<"model">;
  readonly maxDim: number;
  readonly width: number;
  readonly length: number;
  readonly height: number;
}

interface Transform {
  readonly position: Vec3;
  readonly rotation?: Vec3;
  readonly scale?: Vec3;
}

type MaterialSpec = ReturnType<typeof material.pbr>;
type SceneBuilder = ReturnType<typeof scene>;

export const HALF_WIDTH = 11.5;
export const LANE_OFFSET = 7.0;
export const SEA_LEVEL = 7;
export const CANYON_FLOOR = 12;
export const ROUTE_ORDER: readonly RouteId[] = ["coast", "canyon", "skyway"];
export const CHECKPOINT_FRACTIONS: readonly number[] = [0.32, 0.62, 0.86];
export const TRAFFIC_PLAN: readonly VehicleKind[] = [
  "sedan",
  "suv",
  "van",
  "pickup",
  "carrier",
  "boxtruck",
  "bus",
  "taxi"
];

export const VEHICLES: Record<VehicleKind, TrafficSpec> = {
  sedan: { asset: assets.roadsterRushSedan, maxDim: 4.64, width: 1.9, length: 4.64, height: 1.5 },
  hatch: { asset: assets.roadsterRushHatch, maxDim: 4.04, width: 1.82, length: 4.04, height: 1.5 },
  suv: { asset: assets.roadsterRushSuv, maxDim: 4.94, width: 2.02, length: 4.94, height: 1.85 },
  taxi: { asset: assets.roadsterRushTaxi, maxDim: 4.74, width: 1.92, length: 4.74, height: 1.55 },
  van: { asset: assets.roadsterRushVan, maxDim: 5.34, width: 2.12, length: 5.34, height: 2.28 },
  pickup: { asset: assets.roadsterRushPickup, maxDim: 5.58, width: 2.02, length: 5.58, height: 1.95 },
  boxtruck: { asset: assets.roadsterRushBoxtruck, maxDim: 8.14, width: 2.44, length: 8.14, height: 2.9 },
  bus: { asset: assets.roadsterRushBus, maxDim: 12.22, width: 2.56, length: 12.22, height: 3.3 },
  carrier: { asset: assets.roadsterRushCarrier, maxDim: 16.12, width: 2.78, length: 16.12, height: 3.5 }
};

export const ROUTES: Record<RouteId, RouteDef> = {
  coast: {
    id: "coast",
    index: 0,
    name: "Sunbreak Coast",
    tagline: "Cliffside bridges and warm sea haze",
    offsetX: 0,
    length: 2200,
    baseY: 28,
    killY: SEA_LEVEL - 3,
    curveA: 24,
    curveFreq: 0.0042,
    curveB: 9,
    curveFreq2: 0.011,
    hillA: 4.2,
    hillFreq: 0.0036,
    hillB: 1.6,
    hillFreq2: 0.012,
    phase: 0.4,
    theme: {
      sky: "#2c1c2b",
      accent: "#ffb45e",
      accentHot: "#ff6a45",
      road: "#2d303a",
      roadEdge: "#4a4f5c",
      trim: "#ffb066",
      sun: "#ffd7a0",
      stone: "#e9dcc4",
      stoneAlt: "#d9c7a8",
      building: "#f3e7d6",
      roof: "#c56a49",
      foliage: "#2f4d3e",
      cloud: "#ffcfae"
    }
  },
  canyon: {
    id: "canyon",
    index: 1,
    name: "Redline Canyon",
    tagline: "Arched mesas and dust-lit drops",
    offsetX: 2400,
    length: 2600,
    baseY: 46,
    killY: CANYON_FLOOR + 2,
    curveA: 42,
    curveFreq: 0.0034,
    curveB: 14,
    curveFreq2: 0.0098,
    hillA: 7,
    hillFreq: 0.0028,
    hillB: 2.6,
    hillFreq2: 0.0105,
    phase: 2.0,
    theme: {
      sky: "#2a1218",
      accent: "#ff7a4a",
      accentHot: "#ff4d33",
      road: "#3a2523",
      roadEdge: "#5c332c",
      trim: "#ff7a4a",
      sun: "#ffc17a",
      stone: "#94422c",
      stoneAlt: "#712f22",
      building: "#9a4a32",
      roof: "#6e2c20",
      foliage: "#5c4a2e",
      cloud: "#e8a077"
    }
  },
  skyway: {
    id: "skyway",
    index: 2,
    name: "Halo Skyway",
    tagline: "Floating expressways under a cyan halo",
    offsetX: 4800,
    length: 3000,
    baseY: 78,
    killY: 18,
    curveA: 52,
    curveFreq: 0.0028,
    curveB: 20,
    curveFreq2: 0.0082,
    hillA: 4.5,
    hillFreq: 0.0031,
    hillB: 1.8,
    hillFreq2: 0.0092,
    phase: 4.1,
    theme: {
      sky: "#070c1c",
      accent: "#6ff3ff",
      accentHot: "#ff6fd8",
      road: "#131b2e",
      roadEdge: "#22334f",
      trim: "#6ff3ff",
      sun: "#c9f7ff",
      stone: "#182741",
      stoneAlt: "#0f1a2e",
      building: "#1a2944",
      roof: "#0f1b30",
      foliage: "#27405c",
      cloud: "#b8e5f2"
    }
  }
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roadPose(route: RouteDef, progress: number): RoadPose {
  const p = clamp(progress, -80, route.length + 260);
  const x =
    route.offsetX +
    route.curveA * Math.sin(p * route.curveFreq + route.phase) +
    route.curveB * Math.sin(p * route.curveFreq2 + route.phase * 1.7);
  const y =
    route.baseY +
    route.hillA * Math.sin(p * route.hillFreq + route.phase) +
    route.hillB * Math.sin(p * route.hillFreq2 + route.phase * 0.7);
  const dx =
    route.curveA * route.curveFreq * Math.cos(p * route.curveFreq + route.phase) +
    route.curveB * route.curveFreq2 * Math.cos(p * route.curveFreq2 + route.phase * 1.7);
  const dy =
    route.hillA * route.hillFreq * Math.cos(p * route.hillFreq + route.phase) +
    route.hillB * route.hillFreq2 * Math.cos(p * route.hillFreq2 + route.phase * 0.7);
  return {
    x,
    y,
    yaw: Math.atan2(dx, 1),
    pitch: Math.atan2(dy, 1)
  };
}

export function checkpointProgress(route: RouteDef): readonly number[] {
  return CHECKPOINT_FRACTIONS.map((fraction) => Math.round(route.length * fraction));
}

export function checkpointsAndFinish(route: RouteDef): readonly number[] {
  return [...checkpointProgress(route), route.length];
}

export function buildLedgeSet(route: RouteDef): Ledge[] {
  const ledges: Ledge[] = [];
  for (let i = 0; i < 10; i++) {
    const progress = 200 + i * 225;
    if (progress > route.length - 140) break;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    ledges.push({
      route: route.id,
      x: pose.x + side * (HALF_WIDTH + 8.5),
      z: -progress,
      y: pose.y + 5.6,
      yaw: pose.yaw,
      halfW: 6,
      halfD: 27,
      side
    });
  }
  return ledges;
}

export const LEDGES: Record<RouteId, readonly Ledge[]> = {
  coast: buildLedgeSet(ROUTES.coast),
  canyon: buildLedgeSet(ROUTES.canyon),
  skyway: buildLedgeSet(ROUTES.skyway)
};

function tf(position: Vec3, rotation: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): Transform {
  return { position, rotation, scale };
}

function boxInstances(
  name: string,
  size: Vec3,
  mat: MaterialSpec,
  transforms: readonly Transform[],
  castShadow = false
) {
  return instances.box({ name, size, material: mat, transforms, castShadow });
}

function lateral(poseX: number, progress: number, yaw: number, offset: number): Vec3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [poseX + offset * cos, 0, -progress + offset * sin];
}

function buildRoads(s: SceneBuilder): void {
  const dashTransforms: Transform[] = [];
  for (const id of ROUTE_ORDER) {
    const route = ROUTES[id];
    const theme = route.theme;
    const decks: Transform[] = [];
    const edges: Transform[] = [];
    const trims: Transform[] = [];

    for (let progress = -40; progress <= route.length + 170; progress += 60) {
      const mid = progress + 30;
      const pose = roadPose(route, mid);
      const roadRotation: Vec3 = [pose.pitch, -pose.yaw, 0];
      decks.push(tf([pose.x, pose.y - 0.36, -mid], roadRotation));
      for (const side of [-1, 1]) {
        const [edgeX, , edgeZ] = lateral(pose.x, mid, pose.yaw, side * (HALF_WIDTH + 0.55));
        edges.push(tf([edgeX, pose.y + 0.54, edgeZ], roadRotation));
        trims.push(tf([edgeX, pose.y + 1.16, edgeZ], roadRotation));
      }
    }

    for (let progress = 0; progress < route.length + 140; progress += 16) {
      const pose = roadPose(route, progress);
      for (const line of [-3.55, 0, 3.55]) {
        const [dashX, , dashZ] = lateral(pose.x, progress, pose.yaw, line);
        dashTransforms.push(tf([dashX, pose.y + 0.015, dashZ], [pose.pitch, -pose.yaw, 0]));
      }
    }

    s.addMany([
      boxInstances(
        `road-${id}-deck`,
        [HALF_WIDTH * 2, 0.72, 64],
        material.pbr({ color: theme.road, roughness: 0.84, metalness: 0.16 }),
        decks
      ),
      boxInstances(
        `road-${id}-edge`,
        [0.92, 1.1, 64],
        material.pbr({ color: theme.roadEdge, roughness: 0.7, metalness: 0.2 }),
        edges
      ),
      boxInstances(
        `road-${id}-trim`,
        [0.17, 0.15, 64],
        material.emissive({ color: theme.trim, emissive: theme.trim, emissiveIntensity: 1.35 }),
        trims
      )
    ]);
  }

  s.add(
    boxInstances(
      "road-lane-dashes",
      [0.16, 0.035, 5],
      material.emissive({ color: "#f4e7d3", emissive: "#f4e7d3", emissiveIntensity: 0.5 }),
      dashTransforms
    )
  );
}

function buildLedges(s: SceneBuilder): void {
  for (const id of ROUTE_ORDER) {
    const route = ROUTES[id];
    const theme = route.theme;
    const slabs: Transform[] = [];
    const trims: Transform[] = [];
    const supports: Transform[] = [];
    const facades: Transform[] = [];

    for (const ledge of LEDGES[id]) {
      const ledgeRotation: Vec3 = [0, -ledge.yaw, 0];
      slabs.push(tf([ledge.x, ledge.y - 0.42, ledge.z], ledgeRotation, [11.2, 0.85, 54]));
      trims.push(tf([ledge.x, ledge.y + 0.04, ledge.z], ledgeRotation, [11.4, 0.15, 54.2]));
      const supportX = ledge.x + ledge.side * 3.4;
      supports.push(tf([supportX, ledge.y - 2.9, ledge.z], ledgeRotation, [1.5, 5.4, 1.5]));
      if (id === "coast") {
        facades.push(
          tf([ledge.x + ledge.side * 10.5, ledge.y + 4.2, ledge.z], ledgeRotation, [14, 12.5, 58])
        );
      } else if (id === "canyon") {
        facades.push(
          tf([ledge.x + ledge.side * 9, ledge.y + 2.4, ledge.z], ledgeRotation, [13, 9, 56])
        );
      } else {
        supports.push(tf([ledge.x, ledge.y - 6.5, ledge.z], ledgeRotation, [3.2, 7, 48]));
        trims.push(tf([ledge.x - ledge.side * 5.4, ledge.y + 0.06, ledge.z], ledgeRotation, [0.6, 0.2, 50]));
      }
    }

    s.addMany([
      boxInstances(
        `ledges-${id}-slabs`,
        [1, 1, 1],
        material.pbr({ color: theme.roadEdge, roughness: 0.78, metalness: 0.12 }),
        slabs,
        true
      ),
      boxInstances(
        `ledges-${id}-trim`,
        [1, 1, 1],
        material.emissive({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 1.5 }),
        trims
      ),
      boxInstances(
        `ledges-${id}-supports`,
        [1, 1, 1],
        material.pbr({ color: theme.stoneAlt, roughness: 0.9 }),
        supports
      ),
      ...(facades.length > 0
        ? [
            boxInstances(
              `ledges-${id}-facades`,
              [1, 1, 1],
              material.pbr({ color: theme.building, roughness: 0.82 }),
              facades,
              true
            )
          ]
        : [])
    ]);
  }
}

function buildGates(s: SceneBuilder): void {
  const pillars: Transform[] = [];
  const beams: Transform[] = [];

  for (const id of ROUTE_ORDER) {
    const route = ROUTES[id];
    const theme = route.theme;
    const trims: Transform[] = [];
    const finishPanels: Transform[] = [];
    const gates = checkpointsAndFinish(route);

    gates.forEach((progress, gateIndex) => {
      const pose = roadPose(route, progress);
      const rotation: Vec3 = [0, -pose.yaw, 0];
      for (const side of [-1, 1]) {
        const [pillarX, , pillarZ] = lateral(pose.x, progress, pose.yaw, side * (HALF_WIDTH + 2.4));
        pillars.push(tf([pillarX, pose.y + 3.3, pillarZ], rotation, [1.25, 6.6, 1.25]));
      }
      beams.push(tf([pose.x, pose.y + 6.75, -progress], rotation, [HALF_WIDTH * 2 + 5.6, 0.72, 0.9]));
      trims.push(tf([pose.x, pose.y + 7.3, -progress], rotation, [HALF_WIDTH * 2 + 4.6, 0.16, 0.98]));
      if (gateIndex === gates.length - 1) {
        finishPanels.push(
          tf([pose.x, pose.y + 9.2, -progress], rotation, [12.5, 2.5, 0.42])
        );
      }
    });

    s.addMany([
      boxInstances(
        `gates-${id}-trim`,
        [1, 1, 1],
        material.emissive({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 1.6 }),
        trims
      ),
      ...(finishPanels.length > 0
        ? [
            boxInstances(
              `gates-${id}-finish-panel`,
              [1, 1, 1],
              material.emissive({
                color: theme.accentHot,
                emissive: theme.accentHot,
                emissiveIntensity: 1.5
              }),
              finishPanels
            )
          ]
        : [])
    ]);
  }

  s.addMany([
    boxInstances(
      "gates-pillars",
      [1, 1, 1],
      material.pbr({ color: "#31343f", roughness: 0.55, metalness: 0.5 }),
      pillars
    ),
    boxInstances(
      "gates-beams",
      [1, 1, 1],
      material.pbr({ color: "#3a3e4a", roughness: 0.5, metalness: 0.55 }),
      beams
    )
  ]);
}

function addCoastScenery(s: SceneBuilder, route: RouteDef): void {
  const theme = route.theme;
  const rng = seeded(101);
  const seaMat = material.pbr({ color: "#1d5068", roughness: 0.2, metalness: 0.38 });
  s.add(
    primitives
      .box({ name: "coast-sea", size: [2500, 1, 3600], material: seaMat })
      .position(route.offsetX, SEA_LEVEL, -route.length / 2)
  );

  const cliffs: Transform[] = [];
  for (let i = 0; i < 46; i++) {
    const progress = 30 + i * 48 + rng() * 22;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    const height = 18 + rng() * 30;
    const width = 20 + rng() * 28;
    const depth = 26 + rng() * 38;
    // A random yaw turns the box; use its bounding radius so no corner reaches
    // the roadway regardless of rotation.
    const clearance = HALF_WIDTH + 9 + Math.hypot(width, depth) / 2;
    cliffs.push(
      tf(
        [pose.x + side * (clearance + rng() * 26), SEA_LEVEL + height / 2 - 2, -progress],
        [0, rng() * Math.PI, 0],
        [width, height, depth]
      )
    );
  }

  const townWalls: Transform[] = [];
  const townRoofs: Transform[] = [];
  const windows: Transform[] = [];
  for (let i = 0; i < 42; i++) {
    const progress = 55 + i * 52 + rng() * 24;
    const side = i % 3 === 0 ? 1 : -1;
    const pose = roadPose(route, progress);
    const base = SEA_LEVEL + 2 + rng() * 9;
    const height = 9 + rng() * 20;
    const width = 8 + rng() * 12;
    const depth = 8 + rng() * 12;
    const x = pose.x + side * (58 + rng() * 74);
    const yaw = rng() * Math.PI;
    townWalls.push(tf([x, base + height / 2, -progress], [0, yaw, 0], [width, height, depth]));
    townRoofs.push(
      tf([x, base + height + 0.4, -progress], [0, yaw, 0], [width + 1.4, 0.8, depth + 1.4])
    );
    for (let w = 0; w < 3; w++) {
      windows.push(
        tf(
          [
            x - side * (width / 2 + 0.08),
            base + 2.6 + rng() * Math.max(2, height - 5),
            -progress + (w - 1) * depth * 0.24
          ],
          [0, yaw, 0],
          [0.14, 1.15, 1.35]
        )
      );
    }
  }

  const trunks: Transform[] = [];
  const fronds: Transform[] = [];
  for (let i = 0; i < 56; i++) {
    const progress = 36 + i * 38;
    if (progress > route.length + 60) break;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    const x = pose.x + side * (15.5 + rng() * 6.5);
    trunks.push(tf([x, pose.y + 3.1, -progress], [0, 0, 0], [0.4, 6.6, 0.4]));
    fronds.push(tf([x, pose.y + 6.5, -progress], [0, rng() * Math.PI, 0], [3.6, 1.1, 3.6]));
  }

  const piers: Transform[] = [];
  for (let progress = 130; progress < route.length + 120; progress += 130) {
    const pose = roadPose(route, progress);
    const height = Math.max(4, pose.y - SEA_LEVEL);
    piers.push(tf([pose.x, SEA_LEVEL + height / 2, -progress], [0, pose.yaw, 0], [3.8, height, 3.8]));
  }

  const headlands: Transform[] = [];
  for (let i = 0; i < 9; i++) {
    const progress = 120 + i * 250;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    headlands.push(
      tf(
        [pose.x + side * (185 + rng() * 90), SEA_LEVEL + 16 + rng() * 28, -progress],
        [0, rng() * Math.PI, 0],
        [90 + rng() * 90, 44 + rng() * 54, 70 + rng() * 80]
      )
    );
  }

  s.addMany([
    boxInstances("coast-cliffs-light", [1, 1, 1], material.pbr({ color: theme.stone, roughness: 0.92 }), cliffs.slice(0, 24), true),
    boxInstances("coast-cliffs-warm", [1, 1, 1], material.pbr({ color: theme.stoneAlt, roughness: 0.94 }), cliffs.slice(24)),
    boxInstances("coast-town-walls", [1, 1, 1], material.pbr({ color: theme.building, roughness: 0.86 }), townWalls, true),
    boxInstances("coast-town-roofs", [1, 1, 1], material.pbr({ color: theme.roof, roughness: 0.82 }), townRoofs),
    boxInstances(
      "coast-town-windows",
      [1, 1, 1],
      material.emissive({ color: "#ffd9a0", emissive: "#ffb45e", emissiveIntensity: 0.9 }),
      windows
    ),
    boxInstances("coast-palm-trunks", [1, 1, 1], material.pbr({ color: "#5a4436", roughness: 0.9 }), trunks),
    boxInstances("coast-palm-fronds", [1, 1, 1], material.pbr({ color: theme.foliage, roughness: 0.88 }), fronds),
    boxInstances("coast-piers", [1, 1, 1], material.pbr({ color: theme.stoneAlt, roughness: 0.9 }), piers),
    boxInstances("coast-headlands", [1, 1, 1], material.pbr({ color: theme.stone, roughness: 0.95 }), headlands)
  ]);

  s.addMany([
    primitives
      .sphere({
        name: "coast-sun",
        size: [52, 52, 12],
        material: material.emissive({ color: theme.sun, emissive: theme.sun, emissiveIntensity: 2.1 })
      })
      .position(route.offsetX + 210, 150, -720),
    primitives
      .torus({
        name: "coast-corona",
        size: [76, 76, 1.4],
        material: material.emissive({ color: theme.accentHot, emissive: theme.accentHot, emissiveIntensity: 1.2 })
      })
      .position(route.offsetX + 210, 150, -718)
  ]);
}

function addCanyonScenery(s: SceneBuilder, route: RouteDef): void {
  const theme = route.theme;
  const rng = seeded(202);
  s.add(
    primitives
      .box({
        name: "canyon-floor",
        size: [2500, 1, 3600],
        material: material.pbr({ color: "#6a3423", roughness: 0.96 })
      })
      .position(route.offsetX, CANYON_FLOOR, -route.length / 2)
  );

  const wallsDark: Transform[] = [];
  const wallsLight: Transform[] = [];
  for (let i = 0; i < 62; i++) {
    const progress = 20 + i * 44 + rng() * 20;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    const height = 34 + rng() * 74;
    const width = 28 + rng() * 42;
    const depth = 34 + rng() * 52;
    // Same clearance rule as the coast cliffs: the rotated wall's nearest
    // corner must stay outside the road edge.
    const clearance = HALF_WIDTH + 12 + Math.hypot(width, depth) / 2;
    const entry = tf(
      [pose.x + side * (clearance + rng() * 30), CANYON_FLOOR + height / 2, -progress],
      [0, rng() * Math.PI, 0],
      [width, height, depth]
    );
    if (i % 3 === 0) wallsLight.push(entry);
    else wallsDark.push(entry);
  }

  const mesas: Transform[] = [];
  for (let i = 0; i < 14; i++) {
    const progress = 90 + i * 195;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    const height = 56 + rng() * 70;
    const diameter = 34 + rng() * 46;
    mesas.push(
      tf(
        [pose.x + side * (96 + rng() * 70), CANYON_FLOOR + height / 2, -progress],
        [0, rng() * Math.PI, 0],
        [diameter, height, diameter]
      )
    );
  }

  const spires: Transform[] = [];
  for (let i = 0; i < 26; i++) {
    const progress = 40 + i * 92;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    const height = 10 + rng() * 20;
    spires.push(
      tf(
        [pose.x + side * (17 + rng() * 7), pose.y + height / 2 - 3, -progress],
        [0, rng() * Math.PI, 0],
        [3 + rng() * 4, height, 3 + rng() * 4]
      )
    );
  }

  s.addMany([
    boxInstances("canyon-walls-dark", [1, 1, 1], material.pbr({ color: theme.stoneAlt, roughness: 0.95 }), wallsDark),
    boxInstances("canyon-walls-light", [1, 1, 1], material.pbr({ color: theme.stone, roughness: 0.93 }), wallsLight),
    boxInstances("canyon-mesas", [1, 1, 1], material.pbr({ color: theme.stone, roughness: 0.9 }), mesas),
    boxInstances("canyon-spires", [1, 1, 1], material.pbr({ color: theme.stoneAlt, roughness: 0.94 }), spires)
  ]);

  for (let i = 0; i < 5; i++) {
    const progress = 420 + i * 430;
    if (progress > route.length - 120) break;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    s.add(
      primitives
        .torus({
          name: `canyon-arch-${i}`,
          size: [40, 40, 5.5],
          material: material.pbr({ color: theme.stone, roughness: 0.9 })
        })
        .position(pose.x + side * 30, pose.y + 15, -progress)
        .rotate(0, 0.3 * side, 0)
    );
  }

  s.add(
    primitives
      .sphere({
        name: "canyon-sun",
        size: [58, 58, 12],
        material: material.emissive({ color: theme.sun, emissive: theme.sun, emissiveIntensity: 2.2 })
      })
      .position(route.offsetX - 180, 150, -760)
  );
}

function addSkywayScenery(s: SceneBuilder, route: RouteDef): void {
  const theme = route.theme;
  const rng = seeded(303);

  const islands: Transform[] = [];
  const islandGlows: Transform[] = [];
  for (let i = 0; i < 34; i++) {
    const progress = 40 + i * 88 + rng() * 40;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    const width = 28 + rng() * 48;
    const height = 7 + rng() * 14;
    const depth = 30 + rng() * 46;
    const y = 26 + rng() * 92;
    const x = pose.x + side * (66 + rng() * 110);
    islands.push(tf([x, y, -progress], [0, rng() * Math.PI, 0], [width, height, depth]));
    islandGlows.push(
      tf([x, y + height / 2 + 0.2, -progress], [0, 0, 0], [width * 0.92, 0.32, depth * 0.92])
    );
  }

  const pylons: Transform[] = [];
  for (let progress = 80; progress < route.length; progress += 130) {
    const pose = roadPose(route, progress);
    pylons.push(tf([pose.x, pose.y - 46, -progress], [0, pose.yaw, 0], [2.8, 92, 2.8]));
  }

  const lampPoles: Transform[] = [];
  const lampTips: Transform[] = [];
  for (let progress = 30; progress < route.length + 60; progress += 56) {
    const side = Math.floor(progress / 56) % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    const x = pose.x + side * (HALF_WIDTH + 1.0);
    lampPoles.push(tf([x, pose.y + 3.6, -progress], [0, 0, 0], [0.34, 7.2, 0.34]));
    lampTips.push(tf([x, pose.y + 7.3, -progress], [0, 0, 0], [0.85, 0.85, 0.85]));
  }

  const stars: Transform[] = [];
  for (let i = 0; i < 320; i++) {
    const progress = rng() * route.length;
    const side = rng() < 0.5 ? -1 : 1;
    const pose = roadPose(route, progress);
    const size = 0.5 + rng() * 1.8;
    stars.push(
      tf(
        [pose.x + side * (40 + rng() * 330), 110 + rng() * 190, -progress],
        [0, 0, 0],
        [size, size, size]
      )
    );
  }

  const clouds: Transform[] = [];
  for (let i = 0; i < 16; i++) {
    const progress = 60 + i * 175;
    const side = i % 2 === 0 ? -1 : 1;
    const pose = roadPose(route, progress);
    clouds.push(
      tf(
        [pose.x + side * (90 + rng() * 150), 12 + rng() * 18, -progress],
        [0, rng() * 0.7, 0],
        [90 + rng() * 90, 4 + rng() * 5, 180 + rng() * 120]
      )
    );
  }

  s.addMany([
    boxInstances("skyway-islands", [1, 1, 1], material.pbr({ color: theme.stone, roughness: 0.88 }), islands),
    boxInstances(
      "skyway-island-glow",
      [1, 1, 1],
      material.emissive({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 1.05 }),
      islandGlows
    ),
    boxInstances("skyway-pylons", [1, 1, 1], material.pbr({ color: theme.stoneAlt, roughness: 0.7, metalness: 0.35 }), pylons),
    boxInstances("skyway-lamp-poles", [1, 1, 1], material.pbr({ color: theme.roadEdge, roughness: 0.5, metalness: 0.6 }), lampPoles),
    boxInstances(
      "skyway-lamp-tips",
      [1, 1, 1],
      material.emissive({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 2.0 }),
      lampTips
    ),
    boxInstances(
      "skyway-stars",
      [1, 1, 1],
      material.emissive({ color: "#e6fbff", emissive: "#bfefff", emissiveIntensity: 1.2 }),
      stars
    ),
    boxInstances("skyway-clouds", [1, 1, 1], material.pbr({ color: theme.cloud, roughness: 1 }), clouds)
  ]);

  s.addMany([
    primitives
      .torus({
        name: "skyway-halo-outer",
        size: [250, 250, 8],
        material: material.emissive({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 1.35 })
      })
      .position(route.offsetX + 170, 175, -620),
    primitives
      .torus({
        name: "skyway-halo-inner",
        size: [150, 150, 5],
        material: material.emissive({ color: theme.accentHot, emissive: theme.accentHot, emissiveIntensity: 1.25 })
      })
      .position(route.offsetX - 190, 150, -1380),
    primitives
      .sphere({
        name: "skyway-sun",
        size: [46, 46, 12],
        material: material.emissive({ color: theme.sun, emissive: theme.sun, emissiveIntensity: 1.9 })
      })
      .position(route.offsetX + 330, 190, -760)
  ]);
}

function buildPlayer(s: SceneBuilder): void {
  const hidden: Vec3 = [0.0001, 0.0001, 0.0001];
  const rearPlume = material.emissive({ color: "#9ff7ff", emissive: "#38e8ff", emissiveIntensity: 2.2 });
  const downPlume = material.emissive({ color: "#7fe9ff", emissive: "#22d3ee", emissiveIntensity: 1.9 });

  const plumes: ReturnType<typeof primitives.cylinder>[] = [];
  const plumeNames = ["player-plume-rear-l", "player-plume-rear-r"];
  for (const name of plumeNames) {
    plumes.push(
      primitives
        .cylinder({ name, size: [0.42, 1.7, 0.42], material: rearPlume })
        .scale(hidden)
        .runtime(game.runtimeNode(name))
    );
  }
  for (let i = 0; i < 4; i++) {
    const name = `player-plume-down-${i}`;
    plumes.push(
      primitives
        .cylinder({ name, size: [0.3, 1.0, 0.3], material: downPlume })
        .scale(hidden)
        .runtime(game.runtimeNode(name))
    );
  }

  s.addMany([
    model(assets.roadsterRushPlayerCar, {
      name: "player-roadster",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 4.35
    })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("player-roadster", { tags: ["primarySubject", "primaryVehicle", "player"] })),
    primitives
      .box({
        name: "player-lightbar",
        size: [1.7, 0.09, 0.1],
        material: material.emissive({ color: "#ff2a3c", emissive: "#ff2a3c", emissiveIntensity: 1.9 })
      })
      .position(0, 0.7, 2.1)
      .runtime(game.runtimeNode("player-lightbar")),
    primitives
      .sphere({
        name: "player-headlight-l",
        size: [0.25, 0.1, 0.16],
        material: material.emissive({ color: "#f4fbff", emissive: "#c7ecff", emissiveIntensity: 1.8 })
      })
      .position(-0.72, 0.55, -2.06)
      .runtime(game.runtimeNode("player-headlight-l")),
    primitives
      .sphere({
        name: "player-headlight-r",
        size: [0.25, 0.1, 0.16],
        material: material.emissive({ color: "#f4fbff", emissive: "#c7ecff", emissiveIntensity: 1.8 })
      })
      .position(0.72, 0.55, -2.06)
      .runtime(game.runtimeNode("player-headlight-r")),
    ...plumes,
    primitives
      .sphere({
        name: "player-contact-shadow",
        size: [5.2, 0.06, 7.4],
        material: material.pbr({ color: "#07080d", roughness: 1 })
      })
      .scale(hidden)
      .runtime(game.runtimeNode("player-contact-shadow"))
  ]);
}

function buildTraffic(s: SceneBuilder): void {
  for (const id of ROUTE_ORDER) {
    const route = ROUTES[id];
    TRAFFIC_PLAN.forEach((kind, index) => {
      const spec = VEHICLES[kind];
      const name = `traffic-${id}-${index}`;
      const pose = roadPose(route, 130 + index * 230);
      s.add(
        model(spec.asset, {
          name,
          role: "setDressing",
          scaleMode: "fit",
          targetMaxDimension: spec.maxDim
        })
          .position(pose.x, pose.y, -(130 + index * 230))
          .rotate(0, -pose.yaw, 0)
          .runtime(game.runtimeNode(name))
      );
    });
  }
}

function buildCheckpointMarker(s: SceneBuilder): void {
  s.addMany([
    primitives
      .torus({
        name: "checkpoint-marker-ring",
        size: [7.4, 7.4, 0.55],
        material: material.emissive({ color: "#ffd28a", emissive: "#ffb45e", emissiveIntensity: 2.0 })
      })
      .position(0, -100, 0)
      .runtime(game.runtimeNode("checkpoint-marker-ring")),
    primitives
      .cylinder({
        name: "checkpoint-marker-beam",
        size: [0.55, 16, 0.55],
        material: material.emissive({ color: "#ffd28a", emissive: "#ffb45e", emissiveIntensity: 1.2 })
      })
      .position(0, -100, 0)
      .scale([0.0001, 0.0001, 0.0001])
      .runtime(game.runtimeNode("checkpoint-marker-beam"))
  ]);
}

export function buildRoadsterHoursScene(): SceneBuilder {
  const s = scene()
    /*
     * Fog is off for the same reason the verified Roadster Rush route turns it
     * off: the outdoor-day preset's horizon-blue fog would white out a dark
     * dusk vista long before the 950-unit camera far plane.
     */
    .add(looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: 0.08 }))
    /*
     * The production renderer captures the scene clear colour at mount, so a
     * later `app.scene.background` write would not repaint the sky. All three
     * horizons are dusk/night, so mount one shared twilight clear colour and
     * let per-route suns, halos, stars and stone carry the identity.
     */
    .background("#110d1d")
    .camera(
      camera.perspective({
        fov: 62,
        near: 0.5,
        far: 950,
        position: [0, 36, 18],
        target: [0, 30, -40]
      })
    )
    .add(lights.ambient({ color: "#ffe4cf", intensity: 0.52 }))
    .add(
      lights.hemisphere({
        skyColor: "#ffbe92",
        groundColor: "#251a30",
        intensity: 0.95
      })
    )
    .add(
      lights.directional({
        color: "#ffc696",
        intensity: 2.6,
        position: [70, 100, -60],
        shadow: true
      })
    )
    .add(
      lights.point({
        color: "#63e9ff",
        intensity: 1.15,
        position: [ROUTES.skyway.offsetX, 120, -900],
        distance: 340
      })
    )
    .add(effects.bloom({ intensity: 0.32, threshold: 0.74, radius: 0.52 }))
    .add(effects.vignette({ intensity: 0.22, smoothness: 0.6 }))
    .add(effects.colorGrade({ contrast: 1.08, saturation: 1.14 }));

  buildRoads(s);
  buildLedges(s);
  buildGates(s);
  addCoastScenery(s, ROUTES.coast);
  addCanyonScenery(s, ROUTES.canyon);
  addSkywayScenery(s, ROUTES.skyway);
  buildPlayer(s);
  buildTraffic(s);
  buildCheckpointMarker(s);
  return s;
}
