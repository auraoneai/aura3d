/**
 * Aura Links 3D — postcard arcade golf on the Aura3D engine.
 *
 * LOOK BRIEF (art-direction §sports): postcard golf — soft morning keys, long
 * grass shadows, water sparkle, flag flutter. Each course retints the turf
 * family and swaps the look preset: St. Auroras dewy dunes, Maple Hollow
 * parkland, Cinder Rim amber-and-ash, Cloud Terrace thin alpine air, Neon Bay
 * saturated night, Mare hard-shadow lunar.
 *
 * ARCHITECTURE
 *   One hole lives in the scene at a time. `buildHoleTerrain` (courses.ts) is
 *   the single source of truth for the playing surface — the physics sim
 *   queries `height/zone/slope` for bounce/roll/lie and this file turns the
 *   same sampler into the render meshes (base heightfield + fairway ribbon +
 *   green/fringe/bunker/water overlays), so what you see is what the ball
 *   feels. Strokes advance holes via `app.setScene` rebuilds.
 *
 *   Shot loop: read wind/lie → club/aim → three-click swing meter (power,
 *   accuracy, spin) → `launchBall`/`stepBall` → events → next lie or card.
 */
import {
  camera,
  createAuraApp,
  createGameAudio,
  effects,
  game,
  geometry,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import {
  createJuice,
  createOverlayDriver,
  createRumbleDriver,
  createTweenEngine,
  createFxParticlePass,
  mountTouchControls,
  sfx,
  sfxUrl
} from "@aura3d/engine/game";
import { assets } from "../../../src/aura-assets";
import type {
  BallEvent,
  BallState,
  ClubId,
  CourseId,
  CourseSpec,
  DifficultyId,
  GameModeId,
  GolferFit,
  HoleSpec,
  HoleTerrain,
  LabScore,
  LieKind,
  ScoreCard,
  TourState,
  Vec2,
  Vec3,
  WindState
} from "./game/types";
import { COURSES, buildHoleTerrain } from "./game/courses";
import {
  CLUBS,
  CLUB_ORDER,
  advanceTour,
  aiHoleScore,
  createScoreCard,
  createSwingMeter,
  createTour,
  launchBall,
  liePenalty,
  makeRng,
  recordHole,
  rollWind,
  scoreLabel,
  stepBall,
  suggestClub
} from "./game/sim";
import { applyGolferFit, buildGolferNodes, poseGolfer, resolveGolferRig } from "./game/rig";

/* ------------------------------------------------------------------ *
 *  Small math helpers                                                 *
 * ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const HIDDEN_SCALE = 0.0001;
const TRAIL_COUNT = 16;
const BALL_R = 0.09;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

/* ------------------------------------------------------------------ *
 *  Game state                                                         *
 * ------------------------------------------------------------------ */

type PlayPhase =
  | "menu"        // menu overlay open
  | "address"     // standing over the ball — aim/club/space
  | "swing"       // meter running (power → accuracy)
  | "flight"      // ball in the air or rolling
  | "between"     // short pause after rest before next lie
  | "card"        // hole card shown, transition to next hole
  | "roundover";  // 9 holes done

interface RoundState {
  holeIndex: number; // 0..8
  strokes: number;
  putts: number;
  ballPos: Vec3;
  prevPos: Vec3;
  lie: LieKind;
  clubIdx: number;
  aimOffset: number; // radians off lineYaw
  skinsPot: number;
  skinsWon: number;
}

const state = {
  mode: "menu" as GameModeId | "menu" | "skins",
  phase: "menu" as PlayPhase,
  courseId: "stAuroras" as CourseId,
  course: COURSES.stAuroras as CourseSpec,
  hole: COURSES.stAuroras.holes[0] as HoleSpec,
  terrain: null as HoleTerrain | null,
  card: null as ScoreCard | null,
  tour: null as TourState | null,
  tourHoleStart: 0,
  lab: null as LabScore | null,
  labRng: makeRng(0x1ab),
  rng: makeRng(0x51ea),
  difficulty: "pro" as DifficultyId,
  fit: { polo: "#2f6ea3", cap: "#14200f", skin: "#c68a5a", trail: "#ffd257" } as GolferFit,
  wind: { speed: 0, yaw: 0 } as WindState,
  round: null as RoundState | null,
  ball: null as BallState | null,
  swing: createSwingMeter(),
  commit: null as import("./game/types").ShotCommit | null,
  reducedMotion: false,
  reducedFlash: false
};

const POLO_SWATCHES = ["#2f6ea3", "#b03030", "#f2f0e2", "#1d2433", "#9be84e", "#ff7a1a"];
const CAP_SWATCHES = ["#14200f", "#f2f0e2", "#ffd257", "#63e2ff", "#b03030", "#26314f"];
const SKIN_SWATCHES = ["#c68a5a", "#8a5f42", "#e8b48a", "#6b4a32", "#d99a6c", "#f0c8a0"];
const TRAIL_SWATCHES = ["#ffd257", "#63e2ff", "#9be84e", "#ff5c5c", "#f2f0e2", "#ff9d3d"];

const DIFF_GREEN_ZONE: Record<DifficultyId, number> = { amateur: 0.2, pro: 0.13, legend: 0.075 };
const DIFF_AI_SKILL: Record<DifficultyId, number> = { amateur: 0.55, pro: 0.72, legend: 0.88 };

/* ------------------------------------------------------------------ *
 *  Terrain → mesh builders                                            *
 * ------------------------------------------------------------------ */

function terrainToMeshSpec(terrain: HoleTerrain, cols: number, rows: number, lift: number) {
  const { minX, maxX, minZ, maxZ } = terrain.bounds;
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + (maxX - minX) * (c / (cols - 1));
      const z = minZ + (maxZ - minZ) * (r / (rows - 1));
      const y = terrain.height(x, z) + lift;
      positions.push([x, y, z]);
      const [sx, sz] = terrain.slope(x, z);
      const inv = 1 / Math.hypot(sx, 1, sz);
      normals.push([-sx * inv, 1 * inv, -sz * inv]);
      uvs.push([x / 18, z / 18]);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c;
      indices.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
    }
  }
  return { kind: "aura-custom-geometry" as const, positions, normals, uvs, indices };
}

/** Ribbon strip conformed to terrain along the hole's intended line. */
function ribbonAlongPath(terrain: HoleTerrain, path: readonly Vec2[], halfWidth: number, lift: number, step = 4) {
  // Resample the polyline at fixed spacing with lateral offsets
  const pts: { x: number; z: number; dx: number; dz: number }[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const segLen = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(segLen / step));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      pts.push({ x: lerp(ax, bx, t), z: lerp(az, bz, t), dx: (bx - ax) / segLen, dz: (bz - az) / segLen });
    }
  }
  const last = path[path.length - 1]!;
  const prev = path[path.length - 2]!;
  const lastLen = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1;
  pts.push({ x: last[0], z: last[1], dx: (last[0] - prev[0]) / lastLen, dz: (last[1] - prev[1]) / lastLen });

  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  // taper width slightly near tee/green
  pts.forEach((p, i) => {
    const taper = clamp(Math.min(i, pts.length - 1 - i) / 4, 0.55, 1);
    const hw = halfWidth * taper;
    const px = -p.dz, pz = p.dx; // lateral normal
    for (const side of [-1, 1] as const) {
      const x = p.x + px * hw * side;
      const z = p.z + pz * hw * side;
      positions.push([x, terrain.height(x, z) + lift, z]);
      const [sx, sz] = terrain.slope(x, z);
      const inv = 1 / Math.hypot(sx, 1, sz);
      normals.push([-sx * inv, inv, -sz * inv]);
      uvs.push([i * step / 10, side * 0.5 + 0.5]);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  return { kind: "aura-custom-geometry" as const, positions, normals, uvs, indices };
}

/** Flat disc conformed to terrain (green, fringe ring handled by inner/outer radii). */
function discOnTerrain(terrain: HoleTerrain, cx: number, cz: number, radius: number, lift: number, segs = 26, innerRadius = 0) {
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  const rings = innerRadius > 0 ? [innerRadius, radius] : [0, radius];
  for (const r of rings) {
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      positions.push([x, terrain.height(x, z) + lift, z]);
      const [sx, sz] = terrain.slope(x, z);
      const inv = 1 / Math.hypot(sx, 1, sz);
      normals.push([-sx * inv, inv, -sz * inv]);
      uvs.push([0.5 + Math.cos(a) * r / (radius * 2), 0.5 + Math.sin(a) * r / (radius * 2)]);
    }
  }
  if (rings.length === 2) {
    for (let s = 0; s < segs; s++) {
      const a0 = s, a1 = s + 1, b0 = segs + 1 + s, b1 = segs + 1 + s + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  } else {
    // fan: centre vertex 0 → outer ring verts starting at segs+1
    for (let s = 0; s < segs; s++) indices.push(0, segs + 1 + s, segs + 1 + s + 1);
  }
  return { kind: "aura-custom-geometry" as const, positions, normals, uvs, indices };
}

/* ------------------------------------------------------------------ *
 *  Course dressing                                                    *
 * ------------------------------------------------------------------ */

function scatterInDisc(rng: () => number, center: Vec2, radius: number, count: number, minEdge = 0.35) {
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = radius * (minEdge + (1 - minEdge) * rng());
    out.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]);
  }
  return out;
}

function buildDressingNodes(course: CourseSpec, hole: HoleSpec, terrain: HoleTerrain, rng: () => number): any[] {
  const nodes: any[] = [];
  const pal = course.palette;
  const theme = course.dressing.theme;
  const [cx, cz] = [terrain.cup[0], terrain.cup[2]];
  const [tx, tz] = [terrain.tee[0], terrain.tee[2]];
  const midT = hole.layout.path[Math.floor(hole.layout.path.length / 2)] ?? [0, hole.lengthM * 0.5];

  // --- Trees / rocks scattered inside woods discs + edges of bounds ---
  const treeSpots: Vec2[] = [];
  for (const w of hole.layout.woods) treeSpots.push(...scatterInDisc(rng, w.center, w.radius, 10, 0.2));
  // frame the hole: a few trees along the outside of the bounds
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const t = rng();
    const z = lerp(terrain.bounds.minZ + 18, terrain.bounds.maxZ - 14, t);
    const x = side * (terrain.bounds.maxX - 8 - rng() * 22);
    treeSpots.push([x, z]);
  }
  if (theme !== "lunar" && theme !== "volcanic" && treeSpots.length) {
    const t = treeSpots.map(([x, z], i) => ({
      position: [x, terrain.height(x, z), z] as readonly [number, number, number],
      rotationY: rng() * Math.PI * 2,
      scale: (theme === "alpine" ? 2.4 : 3.0) + rng() * 1.6
    }));
    const tint = theme === "alpine" ? "#2c4a3a" : theme === "nightCity" ? "#123a30" : theme === "dunes" ? "#3d5a34" : "#2f5a2e";
    nodes.push((instances as any).model(assets.propPineTree, { name: "flora-trees", transforms: t, colors: t.map(() => tint) }));
  }
  if ((theme === "volcanic" || theme === "lunar" || theme === "dunes") && treeSpots.length) {
    const rockKey = rng() > 0.5 ? assets.propRockA : assets.propRockB;
    const t = treeSpots.slice(0, 26).map(([x, z]) => ({
      position: [x, terrain.height(x, z), z] as readonly [number, number, number],
      rotationY: rng() * Math.PI * 2,
      scale: 1.4 + rng() * 2.6
    }));
    const tint = theme === "lunar" ? "#8a8d94" : theme === "volcanic" ? "#4c4038" : "#8d8574";
    nodes.push((instances as any).model(rockKey, { name: "flora-rocks", transforms: t, colors: t.map(() => tint) }));
  }

  // --- Landmark dressing per theme ---
  if (theme === "dunes") {
    nodes.push(
      model(assets.siegeWindmillTowerMeshy, { name: "landmark-windmill", targetHeight: 11 }).position(terrain.bounds.maxX - 24, 0, midT[1] + 20).rotate(0, -0.5, 0),
      model(assets.siegeCastleGatehouseMeshy, { name: "landmark-clubhouse", targetHeight: 9 }).position(tx - 30, 0, tz - 24).rotate(0, 0.7, 0)
    );
    if (hole.layout.water.length) {
      const w = hole.layout.water[0]!;
      nodes.push(
        model(assets.siegeStoneBridgeMeshy, { name: "landmark-bridge", targetHeight: 3.2 })
          .position(w.center[0], terrain.height(w.center[0], w.center[1]) + w.radius * 0.1, w.center[1])
          .rotate(0, 0.2, 0)
      );
    }
  } else if (theme === "parkland") {
    nodes.push(
      model(assets.showcaseTeaHouse, { name: "landmark-clubhouse", targetHeight: 6.5 }).position(tx - 26, terrain.height(tx - 26, tz - 18), tz - 18).rotate(0, 0.9, 0)
    );
  } else if (theme === "volcanic") {
    nodes.push(
      model(assets.skylineCrystalShardMeshy, { name: "landmark-shard", targetHeight: 14 }).position(terrain.bounds.maxX - 18, terrain.height(terrain.bounds.maxX - 18, midT[1]), midT[1]).rotate(0, 0.4, 0)
    );
  } else if (theme === "alpine") {
    nodes.push(
      model(assets.turboAlpineVenueBackdrop, { name: "landmark-alps", targetHeight: 60 }).position(cx + 60, 0, cz + 140).rotate(0, Math.PI, 0)
    );
  } else if (theme === "nightCity") {
    const buildings = [assets.showcaseModernBuildingOne, assets.showcaseModernOfficeBuilding, assets.showcaseVoxelBuilding];
    buildings.forEach((b, i) => {
      const bx = terrain.bounds.minX + 30 + i * 46;
      nodes.push(
        model(b, { name: `landmark-tower-${i}`, targetHeight: 34 + i * 12 }).position(bx, 0, terrain.bounds.maxZ - 6).rotate(0, Math.PI, 0)
      );
    });
    // floodlight pylons around the green
    for (const [lx, lz] of [[-18, -8], [18, -8], [-18, 18], [18, 18]] as const) {
      const x = cx + lx, z = cz + lz;
      nodes.push(
        model(assets.neonStreetLampProp, { name: `lamp-${lx}-${lz}`, targetHeight: 7.5 }).position(x, terrain.height(x, z), z),
        lights.spot({ name: `lamp-spot-${lx}-${lz}`, position: [x, terrain.height(x, z) + 7.2, z], target: [cx, terrain.cup[1], cz], angle: 0.7, penumbra: 0.6, intensity: 1.6, color: "#bfe8ff", distance: 70 })
      );
    }
  } else if (theme === "lunar") {
    nodes.push(
      model(assets.auroraHabitatDomeMeshy, { name: "landmark-dome", targetHeight: 12 }).position(terrain.bounds.maxX - 20, terrain.height(terrain.bounds.maxX - 20, midT[1]), midT[1]).rotate(0, -0.9, 0),
      model(assets.lunarRoverMeshy, { name: "landmark-rover", targetHeight: 2.4 }).position(tx + 12, terrain.height(tx + 12, tz + 8), tz + 8).rotate(0, 0.5, 0).runtime(game.runtimeNode("landmark-rover")),
      model(assets.gravityOrbitalRelayMeshy, { name: "landmark-relay", targetHeight: 9 }).position(terrain.bounds.minX + 16, terrain.height(terrain.bounds.minX + 16, cz + 30), cz + 30)
    );
  }

  // --- Gallery ropes near the green (two low rails) ---
  const railMat = material.pbr({ color: "#d8d4c4", roughness: 0.6 });
  for (const side of [-1, 1] as const) {
    nodes.push(
      primitives.box({ name: `gallery-rope-${side}`, size: [hole.layout.greenRadius * 1.8, 0.04, 0.04], material: railMat })
        .position(cx + side * (hole.layout.greenRadius + 2.2), terrain.height(cx + side * (hole.layout.greenRadius + 2.2), cz) + 0.5, cz)
        .rotate(0, 0.12 * side, 0)
    );
    for (const sgn of [-0.8, 0.8]) {
      nodes.push(
        primitives.cylinder({ name: `rope-post-${side}-${sgn}`, size: [0.03, 0.55, 0.03], material: railMat })
          .position(cx + side * (hole.layout.greenRadius + 2.2), terrain.height(cx + side * (hole.layout.greenRadius + 2.2), cz + sgn * hole.layout.greenRadius) + 0.27, cz + sgn * hole.layout.greenRadius)
      );
    }
  }

  // --- Spectator cluster on tour/final vibes (instanced capsules) ---
  const crowdT: any[] = [];
  const crowdC: string[] = [];
  const crowdCols = ["#3d5a80", "#98c1d9", "#e0fbfc", "#c96f4a", "#d8a75c", "#e8d8b0"];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = hole.layout.greenRadius + 3.4 + rng() * 3.2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    crowdT.push({ position: [x, terrain.height(x, z) + 0.42, z], scale: [0.34, 0.62 + rng() * 0.2, 0.34] });
    crowdC.push(crowdCols[Math.floor(rng() * crowdCols.length)]);
  }
  nodes.push((instances as any).capsule({ name: "gallery-crowd", transforms: crowdT, colors: crowdC, material: material.pbr({ color: "#ffffff", roughness: 0.9 }) }));

  return nodes;
}

/* ------------------------------------------------------------------ *
 *  Hole scene                                                         *
 * ------------------------------------------------------------------ */

function buildHoleScene(course: CourseSpec, hole: HoleSpec, terrain: HoleTerrain, lab: LabScore | null): any {
  const pal = course.palette;
  const lay = hole.layout;
  const rng = makeRng(hole.number * 7919 + course.id.length * 131);
  const isNight = course.look === "night-city" || course.look === "space";

  const nodes: any[] = [];

  // --- Base heightfield (rough) + outer ground shell ---
  const base = terrainToMeshSpec(terrain, 88, 60, -0.015);
  nodes.push(
    geometry.custom(base, { name: "terrain-rough", material: material.pbr({ color: pal.rough, roughness: 0.95 }) })
  );
  const outerY = Math.min(terrain.tee[1], terrain.cup[1]) - 6;
  nodes.push(
    primitives.plane({ name: "outer-ground", size: [terrain.bounds.maxX * 4, terrain.bounds.maxZ * 4, 1], material: material.pbr({ color: theme4(course) === "lunar" ? "#43454c" : theme4(course) === "volcanic" ? "#2e2a26" : pal.rough, roughness: 1 }) }).position(0, outerY, (terrain.bounds.minZ + terrain.bounds.maxZ) / 2)
  );

  // --- Fairway ribbon (two mow stripes) ---
  const fairA = ribbonAlongPath(terrain, lay.path, lay.fairwayWidth / 2, 0.018);
  const fairB = ribbonAlongPath(terrain, lay.path, lay.fairwayWidth / 2 - 2.6, 0.024);
  nodes.push(
    geometry.custom(fairA, { name: "fairway-a", material: material.pbr({ color: pal.fairway, roughness: 0.9 }) }),
    geometry.custom(fairB, { name: "fairway-b", material: material.pbr({ color: shade(pal.fairway, 1.12), roughness: 0.9 }) })
  );

  // --- Green + fringe ---
  const [gx, gz] = [terrain.cup[0], terrain.cup[2]];
  const green = discOnTerrain(terrain, gx, gz, lay.greenRadius, 0.03);
  const fringe = discOnTerrain(terrain, gx, gz, lay.greenRadius + 2.4, 0.026, 26, lay.greenRadius * 0.98);
  nodes.push(
    geometry.custom(green, { name: "green", material: material.pbr({ color: pal.green, roughness: 0.82 }) }),
    geometry.custom(fringe, { name: "fringe", material: material.pbr({ color: shade(pal.green, 0.86), roughness: 0.88 }) })
  );

  // --- Tee box + markers ---
  const teeMat = material.pbr({ color: pal.teeBox, roughness: 0.85 });
  const markMat = material.emissive({ color: pal.accent, emissive: pal.accent, emissiveIntensity: 0.7 });
  nodes.push(
    primitives.box({ name: "tee-box", size: [9, 0.14, 7], material: teeMat }).position(terrain.tee[0], terrain.tee[1] - 0.05, terrain.tee[2]),
    primitives.sphere({ name: "tee-marker-l", size: [0.18, 0.18, 0.18], material: markMat }).position(terrain.tee[0] - 3.2, terrain.tee[1] + 0.1, terrain.tee[2]),
    primitives.sphere({ name: "tee-marker-r", size: [0.18, 0.18, 0.18], material: markMat }).position(terrain.tee[0] + 3.2, terrain.tee[1] + 0.1, terrain.tee[2])
  );

  // --- Bunkers (sand discs sitting in their bowls) ---
  lay.bunkers.forEach((b, i) => {
    const disc = discOnTerrain(terrain, b.center[0], b.center[1], b.radius, 0.045, 20);
    nodes.push(
      geometry.custom(disc, { name: `bunker-${i}`, material: material.pbr({ color: pal.sand, roughness: 0.98 }) })
    );
  });

  // --- Water (emissive pond surfaces) ---
  lay.water.forEach((w, i) => {
    const y = terrain.height(w.center[0], w.center[1]) + 0.32;
    nodes.push(
      primitives.cylinder({ name: `pond-${i}`, size: [w.radius * 0.92, 0.05, w.radius * 0.92], material: material.pbr({ color: pal.water, roughness: 0.25, metalness: 0.35, emissive: pal.water, emissiveIntensity: isNight ? 0.5 : 0.12 }) }).position(w.center[0], y, w.center[1])
    );
  });

  // --- Flag + cup ---
  nodes.push(
    model(assets.siegeFlagstickCupMeshy, { name: "flagstick", targetHeight: 2.3 }).position(terrain.cup[0], terrain.cup[1] - 0.06, terrain.cup[2]).runtime(game.runtimeNode("flagstick")),
    primitives.cylinder({ name: "cup-dark", size: [0.115, 0.06, 0.115], material: material.pbr({ color: "#05070a", roughness: 1 }) }).position(terrain.cup[0], terrain.cup[1] + 0.005, terrain.cup[2])
  );

  // --- Ball + trail + shadow + aim aids ---
  nodes.push(
    model(assets.siegeGolfBall, { name: "golf-ball", targetHeight: BALL_R * 2 }).runtime(game.runtimeNode("golf-ball")),
    primitives.cylinder({ name: "ball-shadow", size: [0.22, 0.008, 0.22], material: material.pbr({ color: "#000000", opacity: 0.38, roughness: 1 }) }).runtime(game.runtimeNode("ball-shadow")),
    effects.trail({ name: "ball-ribbon-trail", target: "golf-ball", color: "#ffffff", width: 0.07, maxPoints: 44, intensity: 0.9 } as any),
    // aim line + predicted landing ring (aim phase only)
    primitives.box({ name: "aim-line", size: [0.09, 0.02, 26], material: material.emissive({ color: pal.accent, emissive: pal.accent, emissiveIntensity: 1.1, opacity: 0.5 }) }).runtime(game.runtimeNode("aim-line")),
    primitives.torus({ name: "landing-ring", size: [1.4, 0.05, 0.05], material: material.emissive({ color: "#63e2ff", emissive: "#63e2ff", emissiveIntensity: 1.2 }) }).runtime(game.runtimeNode("landing-ring")),
    // putt-aim helper
    primitives.torus({ name: "cup-pulse", size: [0.32, 0.03, 0.03], material: material.emissive({ color: pal.accent, emissive: pal.accent, emissiveIntensity: 1.3 }) }).runtime(game.runtimeNode("cup-pulse"))
  );
  for (let i = 0; i < TRAIL_COUNT; i++) {
    nodes.push(
      primitives.sphere({ name: `ball-trail-${i}`, size: [0.07, 0.07, 0.07], material: material.emissive({ color: state.fit.trail, emissive: state.fit.trail, emissiveIntensity: 0.4 }) })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }

  // --- Green read grid arrows (putting lab / on-green) ---
  for (let i = 0; i < 12; i++) {
    nodes.push(
      primitives.box({ name: `read-arrow-${i}`, size: [0.06, 0.02, 0.9], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.8, opacity: 0.55 }) })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`read-arrow-${i}`))
    );
  }

  // --- Range lab target rings ---
  if (lab?.mode === "rangelab") {
    [60, 110, 165, 215].forEach((d, i) => {
      const z = terrain.tee[2] + d;
      const ringMat = material.emissive({ color: i % 2 ? "#63e2ff" : "#ffd257", emissive: i % 2 ? "#63e2ff" : "#ffd257", emissiveIntensity: 1.0 });
      nodes.push(
        primitives.torus({ name: `range-ring-${i}`, size: [7 + i * 1.5, 0.18, 0.18], material: ringMat }).position(terrain.tee[0], terrain.height(terrain.tee[0], z) + 0.1, z).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode(`range-ring-${i}`)),
        primitives.cylinder({ name: `range-bull-${i}`, size: [1.3, 0.04, 1.3], material: material.emissive({ color: "#ff5c5c", emissive: "#ff5c5c", emissiveIntensity: 0.9 }) }).position(terrain.tee[0], terrain.height(terrain.tee[0], z) + 0.06, z)
      );
    });
  }

  // --- Golfer ---
  nodes.push(...buildGolferNodes(state.fit));

  // --- Course dressing ---
  nodes.push(...buildDressingNodes(course, hole, terrain, rng));

  // --- Look + grounding + post ---
  const s = scene()
    .add(looks.preset(course.look, course.lookOverrides ?? {}))
    .addMany(nodes)
    .add(effects.contactShadows({ intensity: 0.75, length: 0.3 }))
    .add(effects.bloom({ intensity: isNight ? 0.42 : 0.22, threshold: 0.75 } as any))
    .camera(
      camera.perspective({
        position: [terrain.tee[0] - 3, terrain.tee[1] + 4.5, terrain.tee[2] - 8],
        target: [terrain.tee[0], terrain.tee[1] + 0.6, terrain.tee[2] + 8],
        fov: 42
      })
    );
  return s;
}

function theme4(course: CourseSpec): string {
  return course.dressing.theme;
}

/** cheap color shade — lighten/darken a #rrggbb toward white/black */
function shade(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * k), 0, 255);
  const b = clamp(Math.round((n & 255) * k), 0, 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/* ------------------------------------------------------------------ *
 *  App boot                                                           *
 * ------------------------------------------------------------------ */

let auraApp: ReturnType<typeof createAuraApp> | null = null;
let golferRig: ReturnType<typeof resolveGolferRig> | null = null;
let ballHandle: any = null;
let ballShadowHandle: any = null;
let aimLineHandle: any = null;
let landingRingHandle: any = null;
let cupPulseHandle: any = null;
let flagstickHandle: any = null;
let trailHandles: any[] = [];
let readArrowHandles: any[] = [];
let rangeRingHandles: any[] = [];
const tryReq = (id: string) => { try { return (auraApp as any)?.nodes?.require(id); } catch { return null; } };

function resolveHoleHandles(): void {
  const req = (id: string) => (auraApp as any).nodes.require(id);
  golferRig = resolveGolferRig(auraApp);
  ballHandle = req("golf-ball");
  ballShadowHandle = req("ball-shadow");
  aimLineHandle = req("aim-line");
  landingRingHandle = req("landing-ring");
  cupPulseHandle = req("cup-pulse");
  flagstickHandle = tryReq("flagstick");
  trailHandles = Array.from({ length: TRAIL_COUNT }, (_, i) => req(`ball-trail-${i}`));
  readArrowHandles = Array.from({ length: 12 }, (_, i) => req(`read-arrow-${i}`));
  rangeRingHandles = Array.from({ length: 4 }, (_, i) => tryReq(`range-ring-${i}`)).filter(Boolean);
}

/* ------------------------------------------------------------------ *
 *  HUD / DOM                                                          *
 * ------------------------------------------------------------------ */

const eventLog = game.eventLog({ label: "aura-links-3d events", maxEvents: 48 });
let framesRendered = 0;
let audio: { unlock(): Promise<unknown>; cue(c: string): Promise<unknown>; evidence: { unlocked: boolean; cueCount: number; playedCueCount: number } } | null = null;
let juice: ReturnType<typeof createJuice> | null = null;
let touchControls: any = null;
let a11ySettings: any = null;

function pushEvent(type: string, label: string, severity: "info" | "success" | "warning" = "info", value?: number): void {
  const rec = eventLog.push({ type, label, severity, value, time: performance.now() / 1000, frame: framesRendered });
  const ticker = $("h-ticker");
  if (ticker) {
    const item = document.createElement("span");
    item.className = `tick tick-${severity === "warning" ? "warning" : severity === "success" ? "success" : "info"}`;
    item.textContent = rec.label;
    ticker.prepend(item);
    while (ticker.children.length > 5) ticker.lastElementChild?.remove();
    for (const el of Array.from(ticker.children)) el.classList.add("show");
  }
}

let bannerTimer = 0;
function showBanner(text: string, ms = 1700): void {
  const b = $("banner");
  if (!b) return;
  b.textContent = text;
  b.classList.add("show");
  bannerTimer = performance.now() + ms;
}

let msgTimer = 0;
function showMsg(big: string, small = "", ms = 2200): void {
  const m = $("msg");
  if (!m) return;
  const bt = $("msg-text"), st = $("msg-sub");
  if (bt) bt.textContent = big;
  if (st) st.textContent = small;
  m.classList.add("show");
  msgTimer = performance.now() + ms;
}

function setPrompt(text: string | null): void {
  const p = $("prompt");
  if (!p) return;
  if (text) { p.textContent = text; p.classList.add("show"); }
  else p.classList.remove("show");
}

function updateCardHud(): void {
  const r = state.round;
  if (!r || !state.terrain) return;
  const hole = state.hole;
  $("h-hole")!.textContent = String(hole.number);
  $("h-par")!.textContent = `PAR ${hole.par} · ${hole.name.toUpperCase()}`;
  $("h-strokes")!.textContent = String(r.strokes);
  const dist = Math.max(0, state.terrain.cupDistance(r.ballPos[0], r.ballPos[2]));
  $("h-dist")!.textContent = `${dist.toFixed(0)}M TO PIN`;
  const tp = state.card ? state.card.toPar + (r.strokes - hole.par) : 0;
  const el = $("h-topar")!;
  el.textContent = tp === 0 ? "E" : tp > 0 ? `+${tp}` : `${tp}`;
  el.classList.toggle("good", tp <= 0);
  el.classList.toggle("bad", tp > 0);
  $("h-thru")!.textContent = `THRU ${r.holeIndex}`;
  // wind
  const arrow = $("h-wind-arrow");
  if (arrow) arrow.style.transform = `rotate(${(state.wind.yaw * 180) / Math.PI + 90}deg)`;
  $("h-wind-speed")!.textContent = state.wind.speed.toFixed(1);
  // club + lie
  $("h-club")!.textContent = CLUB_ORDER[r.clubIdx]!.toUpperCase();
  const lieEl = $("h-lie")!;
  lieEl.textContent = r.lie.toUpperCase();
  lieEl.className = `v lie-${r.lie}`;
}

function updateModeChips(): void {
  const course = state.course;
  $("h-course-chip")!.innerHTML = `${course.name}<span class="sub" id="h-look-chip">${course.shortName} · ${course.look.toUpperCase()} LOOK</span>`;
  $("h-mode")!.textContent =
    state.mode === "quick" ? "QUICK PLAY" :
    state.mode === "rangelab" ? "RANGE LAB" :
    state.mode === "puttinglab" ? "PUTTING LAB" :
    state.mode === "tour" ? "PRO CIRCUIT" :
    state.mode === "studio" ? "PLAYER STUDIO" : "SKINS MATCH";
  const tourChip = $("h-tour-chip");
  if (tourChip) {
    tourChip.style.display = state.mode === "tour" ? "" : "none";
    const r = $("h-tour-round");
    if (r && state.tour) r.textContent = state.tour.round.toUpperCase();
  }
  const labChip = $("h-lab-chip");
  if (labChip) {
    labChip.style.display = state.lab ? "" : "none";
    const l = $("h-lab-line");
    if (l && state.lab) l.textContent = `SCORE ${state.lab.hits} · STREAK ${state.lab.streak}`;
  }
}

/* ------------------------------------------------------------------ *
 *  Camera director                                                    *
 * ------------------------------------------------------------------ */

type CamMode = "menu" | "address" | "aim" | "flight" | "green" | "celebrate" | "card";
const cam = {
  mode: "menu" as CamMode,
  eye: [0, 4.5, -9] as Vec3,
  target: [0, 0.6, 6] as Vec3,
  fov: 42,
  t: 0,
  orbit: 0,
  zoom: 1
};

function camApply(): void {
  (auraApp as any)?.camera?.setPose?.({ position: cam.eye, target: cam.target, fov: cam.fov });
}

function updateCamera(dt: number): void {
  const t = state.terrain;
  const r = state.round;
  cam.t += dt;
  if (!t || !r) {
    // menu orbit around the cup/tee midpoint
    cam.orbit += dt * 0.14;
    const cc = t ? t.cup : [0, 0, 30] as unknown as Vec3;
    cam.eye = [cc[0] + Math.sin(cam.orbit) * 26, cc[1] + 11, cc[2] + Math.cos(cam.orbit) * 26];
    cam.target = [cc[0], cc[1] + 0.5, cc[2]];
    cam.fov = 34;
    camApply();
    return;
  }

  const ball = state.ball;
  const inFlight = state.phase === "flight" && ball && (ball.status === "flight" || ball.status === "roll");

  if (state.phase === "flight" && inFlight) {
    cam.mode = "flight";
    // chase cam: behind the ball along its velocity, ahead low
    const v = ball.vel;
    const hv = Math.hypot(v[0], v[2]);
    const back = hv > 0.5 ? [v[0] / hv, v[2] / hv] : [Math.sin(r.aimOffset + t.lineYaw), Math.cos(r.aimOffset + t.lineYaw)];
    const distBack = ball.status === "roll" ? 7 : 13;
    cam.eye = [
      ball.pos[0] - back[0] * distBack,
      ball.pos[1] + (ball.status === "roll" ? 3.4 : 6.5),
      ball.pos[2] - back[1] * distBack
    ];
    cam.target = [ball.pos[0] + back[0] * 8, Math.max(t.height(ball.pos[0], ball.pos[2]) + 0.4, ball.pos[1] * 0.55), ball.pos[2] + back[1] * 8];
    cam.fov = ball.status === "roll" ? 38 : 34;
  } else if (state.phase === "card" || state.phase === "roundover" || cam.mode === "celebrate") {
    cam.mode = "celebrate";
    cam.orbit += dt * 0.42;
    cam.eye = [t.cup[0] + Math.sin(cam.orbit) * 9.5, t.cup[1] + 2.4, t.cup[2] + Math.cos(cam.orbit) * 9.5];
    cam.target = [t.cup[0], t.cup[1] + 1.0, t.cup[2]];
    cam.fov = 30;
  } else if (r.lie === "green" || r.lie === "fringe") {
    cam.mode = "green";
    // low read cam behind ball→cup line
    const dx = t.cup[0] - r.ballPos[0], dz = t.cup[2] - r.ballPos[2];
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    const back = 4.2 + d * 0.16;
    cam.eye = [r.ballPos[0] - ux * back, t.height(r.ballPos[0] - ux * back, r.ballPos[2] - uz * back) + 1.35 + d * 0.05, r.ballPos[2] - uz * back];
    cam.target = [t.cup[0], t.cup[1] + 0.15, t.cup[2]];
    cam.fov = 34;
  } else if (state.phase === "swing") {
    cam.mode = "address";
    const yaw = t.lineYaw + r.aimOffset;
    const bx = r.ballPos[0], bz = r.ballPos[2];
    const tx2 = bx + Math.sin(yaw) * 6, tz2 = bz + Math.cos(yaw) * 6;
    const ex = bx - Math.sin(yaw) * 5.2 - Math.cos(yaw) * 2.2;
    const ez = bz - Math.cos(yaw) * 5.2 + Math.sin(yaw) * 2.2;
    cam.eye = lerp3(cam.eye, [ex, t.height(ex, ez) + 2.1, ez], 1 - Math.pow(0.001, dt));
    cam.target = lerp3(cam.eye, [tx2, t.height(tx2, tz2) + 0.4, tz2], 1 - Math.pow(0.001, dt));
    cam.fov = lerp(cam.fov, 38, 1 - Math.pow(0.02, dt));
  } else {
    cam.mode = "aim";
    const yaw = t.lineYaw + r.aimOffset;
    const bx = r.ballPos[0], bz = r.ballPos[2];
    // elevated aim cam — W/S dollies between behind-ball and high overview
    const back = 7.5 * cam.zoom;
    const h = 3.2 * cam.zoom + 1.4;
    const ex = bx - Math.sin(yaw) * back - Math.cos(yaw) * 2.0;
    const ez = bz - Math.cos(yaw) * back + Math.sin(yaw) * 2.0;
    const lookAhead = 14 * cam.zoom;
    const tx2 = bx + Math.sin(yaw) * lookAhead, tz2 = bz + Math.cos(yaw) * lookAhead;
    cam.eye = lerp3(cam.eye, [ex, t.height(ex, ez) + h, ez], 1 - Math.pow(0.002, dt));
    cam.target = lerp3(cam.target, [tx2, t.height(tx2, tz2) + 0.5, tz2], 1 - Math.pow(0.002, dt));
    cam.fov = lerp(cam.fov, cam.zoom > 1.5 ? 46 : 40, 0.08);
  }
  camApply();
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/* ------------------------------------------------------------------ *
 *  Shot lifecycle                                                     *
 * ------------------------------------------------------------------ */

function currentClub() {
  return CLUBS[CLUB_ORDER[state.round!.clubIdx]!]!;
}

function aimYaw(): number {
  return (state.terrain?.lineYaw ?? 0) + (state.round?.aimOffset ?? 0);
}

function beginAddress(): void {
  const r = state.round!;
  const t = state.terrain!;
  r.lie = r.strokes === 0 ? "tee" : t.zone(r.ballPos[0], r.ballPos[2]);
  if (r.lie === "water" || r.lie === "oob") r.lie = "rough";
  r.clubIdx = CLUB_ORDER.indexOf(suggestClub(r.lie, t.cupDistance(r.ballPos[0], r.ballPos[2])));
  r.aimOffset = 0;
  state.phase = "address";
  state.swing.reset();
  setPrompt("SPACE — SWING · A/D AIM · Q/E CLUB");
  $("swing-meter")?.classList.remove("show");
  updateCardHud();
}

function startSwing(): void {
  state.phase = "swing";
  state.swing.press(); // idle → power
  $("swing-meter")?.classList.add("show");
  $("sw-label")!.textContent = "SPACE — SET POWER";
  setPrompt(null);
}

function commitSwing(): void {
  const r = state.round!;
  const t = state.terrain!;
  const s = state.swing.state();
  const club = currentClub();
  const commit = {
    club,
    power: s.power ?? 0.8,
    accuracy: s.accuracy ?? 0.5,
    spin: s.spin ?? 0,
    aimYaw: aimYaw()
  };
  state.commit = commit;
  const lie = r.strokes === 0 ? "tee" : t.zone(r.ballPos[0], r.ballPos[2]);
  const env = {
    terrain: t,
    gravity: state.course.gravity,
    airDensity: state.course.airDensity,
    wind: state.wind,
    lie,
    liePenalty: liePenalty(lie)
  };
  // launchBall spawns on the tee — reposition for non-tee lies (sim contract)
  state.ball = { ...launchBall(commit, env), pos: [...r.ballPos] as Vec3 };
  r.prevPos = [...r.ballPos] as Vec3;
  r.strokes += 1;
  if (club.putter) r.putts += 1;
  state.phase = "flight";
  $("swing-meter")?.classList.remove("show");
  const s2 = state.swing.state();
  const qual = Math.abs(commit.accuracy);
  const spinTxt = commit.spin < -0.25 ? "DRAW" : commit.spin > 0.25 ? "FADE" : "PURE";
  pushEvent("shot", `${club.label} · ${(commit.power * 100) | 0}% · ${qual < 0.14 ? "PURE" : qual < 0.4 ? "GOOD" : "OFF"} · ${spinTxt}`, qual < 0.4 ? "success" : "warning");
  juiceFire("hit", { position: r.ballPos });
  void audio?.cue(club.putter ? "putt" : "drive");
  // golfer: committed swing
  golferPhase = "follow";
  golferPhaseT = 0;
  updateCardHud();
}

const trailPts: Vec3[] = [];

function onBallEvents(events: BallEvent[]): void {
  const r = state.round!;
  for (const ev of events) {
    if (ev.kind === "bounce") {
      juiceFire("bounce", { position: ev.pos });
      const zone = ev.zone;
      if (zone === "sand") { pushEvent("lie", "sand splash", "info"); }
      spawnTurfPuff(ev.pos, zone);
    } else if (ev.kind === "holed") {
      onHoled();
    } else if (ev.kind === "water") {
      pushEvent("penalty", "water hazard — +1 stroke", "warning");
      juiceFire("splash", { position: ev.pos });
      void audio?.cue("splash");
      applyPenaltyDrop(ev.pos);
      return;
    } else if (ev.kind === "oob") {
      pushEvent("penalty", "out of bounds — +1 stroke", "warning");
      applyPenaltyDrop(r.prevPos);
      return;
    } else if (ev.kind === "rest") {
      onBallRest(ev.pos, ev.zone);
      return;
    }
  }
}

function onBallRest(pos: Vec3, zone: LieKind): void {
  const r = state.round!;
  r.ballPos = [pos[0], pos[1], pos[2]];
  r.lie = zone;
  if (state.mode === "rangelab") {
    scoreRangeShot(pos);
    reteeAfter(1400);
    return;
  }
  if (state.mode === "puttinglab") {
    r.lie = "green";
    reteeAfter(1400);
    return;
  }
  if (zone === "water" || zone === "oob") return; // handled by events
  pushEvent("lie", `lie: ${zone} · ${state.terrain!.cupDistance(pos[0], pos[2]).toFixed(0)}m out`, "info");
  state.phase = "between";
  betweenUntil = performance.now() + 850;
}

function onHoled(): void {
  const r = state.round!;
  r.ballPos = [...state.ball!.pos] as Vec3;
  r.lie = "green";
  void audio?.cue("cup");
  const flash = $("cup-flash");
  if (flash && !state.reducedFlash) {
    flash.style.opacity = "1";
    window.setTimeout(() => { flash.style.opacity = "0"; }, 220);
  }
  juiceFire("holed", { position: state.terrain!.cup });
  golferPhase = "celebrate";
  golferPhaseT = 0;
  if (state.mode === "puttinglab") {
    const lab = state.lab!;
    state.lab = { ...lab, hits: lab.hits + 1, streak: lab.streak + 1, attempts: lab.attempts + 1, best: Math.max(lab.best, lab.streak + 1) };
    pushEvent("lab", `putt drops — streak ${lab.streak}`, "success");
    updateModeChips();
    nextPuttingSpot();
    return;
  }
  const label = scoreLabel(state.hole.par, r.strokes);
  pushEvent("score", `${label.toUpperCase()} on ${state.hole.number} (${r.strokes} for par ${state.hole.par})`, r.strokes <= state.hole.par ? "success" : "warning");
  if (r.strokes <= state.hole.par - 1) void audio?.cue("parChime");
  else if (r.strokes >= state.hole.par + 1) void audio?.cue("bogey");
  state.card = recordHole(state.card ?? createScoreCard(state.course), state.hole, r.strokes, r.putts);
  showBanner(label.toUpperCase());
  if (state.mode === "skins") resolveSkin();
  state.phase = "card";
  betweenUntil = performance.now() + 2400;
}

function applyPenaltyDrop(fromPos: Vec3): void {
  const r = state.round!;
  r.strokes += 1;
  // drop back at the previous lie position
  r.ballPos = [...r.prevPos] as Vec3;
  state.ball = null;
  trailPts.length = 0;
  state.phase = "between";
  betweenUntil = performance.now() + 1100;
  updateCardHud();
}

function reteeAfter(ms: number): void {
  state.phase = "between";
  betweenUntil = performance.now() + ms;
}

function nextPuttingSpot(): void {
  const r = state.round!;
  const t = state.terrain!;
  const lab = state.lab!;
  const a = state.labRng() * Math.PI * 2;
  const d = 3 + state.labRng() * 9;
  const x = t.cup[0] + Math.cos(a) * d;
  const z = t.cup[2] + Math.sin(a) * d;
  r.ballPos = [x, t.height(x, z) + BALL_R, z];
  r.prevPos = [...r.ballPos] as Vec3;
  r.strokes = 0;
  state.ball = null;
  trailPts.length = 0;
  state.phase = "between";
  betweenUntil = performance.now() + 700;
}

function scoreRangeShot(pos: Vec3): void {
  const lab = state.lab!;
  const t = state.terrain!;
  let l = { ...lab, attempts: lab.attempts + 1 };
  const rings = [60, 110, 165, 215];
  let best = Infinity;
  for (const d of rings) {
    const dx = pos[0] - t.tee[0];
    const dz = pos[2] - (t.tee[2] + d);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  const carry = Math.hypot(pos[0] - t.tee[0], pos[2] - t.tee[2]);
  if (best < 8) {
    l = { ...l, hits: l.hits + 1, streak: l.streak + 1, best: Math.max(l.best, l.streak + 1) };
    pushEvent("lab", `on the ring — ${carry.toFixed(0)}m carry`, "success");
    void audio?.cue("parChime");
  } else {
    l = { ...l, streak: 0 };
    pushEvent("lab", `${carry.toFixed(0)}m — off the rings by ${best.toFixed(0)}m`, "info");
  }
  state.lab = l;
  updateModeChips();
}

function resolveSkin(): void {
  const r = state.round!;
  const skill = DIFF_AI_SKILL[state.difficulty];
  const ai = aiHoleScore(state.hole.par, skill, state.rng);
  const you = r.strokes;
  r.skinsPot += 1;
  if (you < ai) {
    r.skinsWon += r.skinsPot;
    pushEvent("skins", `skin won — you ${you} vs cpu ${ai} (+${r.skinsPot})`, "success");
    r.skinsPot = 0;
  } else if (you > ai) {
    pushEvent("skins", `skin lost — you ${you} vs cpu ${ai}`, "warning");
    r.skinsPot = 0;
  } else {
    pushEvent("skins", `hole tied — pot carries (${r.skinsPot} skins riding)`, "info");
  }
}

/* ------------------------------------------------------------------ *
 *  Hole / round flow                                                  *
 * ------------------------------------------------------------------ */

let betweenUntil = 0;

function startRound(): void {
  state.card = createScoreCard(state.course);
  startHole(0);
}

function startHole(idx: number): void {
  const hole = state.course.holes[idx]!;
  state.hole = hole;
  state.terrain = buildHoleTerrain(state.course, hole);
  const t = state.terrain;
  state.round = {
    holeIndex: idx,
    strokes: 0,
    putts: 0,
    ballPos: [t.tee[0], t.tee[1] + BALL_R, t.tee[2]],
    prevPos: [t.tee[0], t.tee[1] + BALL_R, t.tee[2]],
    lie: "tee",
    clubIdx: 0,
    aimOffset: 0,
    skinsPot: state.round?.skinsPot ?? 0,
    skinsWon: state.round?.skinsWon ?? 0
  };
  state.wind = rollWind(state.course, state.rng);
  state.ball = null;
  state.commit = null;
  trailPts.length = 0;
  // rebuild the scene for this hole
  (auraApp as any)?.setScene(buildHoleScene(state.course, hole, t, state.lab));
  resolveHoleHandles();
  cam.t = 0;
  cam.zoom = 1;
  showMsg(`HOLE ${hole.number} — ${hole.name.toUpperCase()}`, `PAR ${hole.par} · ${hole.lengthM}M`, 2100);
  pushEvent("hole", `hole ${hole.number}: ${hole.name} · par ${hole.par}`, "info");
  beginAddress();
}

function advanceHole(): void {
  const r = state.round!;
  const next = r.holeIndex + 1;
  if (next >= 9) {
    finishRound();
    return;
  }
  startHole(next);
}

function finishRound(): void {
  state.phase = "roundover";
  const card = state.card!;
  const toPar = card.toPar;
  if (state.mode === "tour" && state.tour) {
    state.tour = advanceTour(state.tour, toPar);
    renderBracket();
    const t = state.tour;
    if (!t.playerAlive) {
      showMsg("CUT — CIRCUIT OVER", `finished ${toPar >= 0 ? "+" : ""}${toPar} · field advanced`, 4000);
      pushEvent("tour", "missed the cut — circuit over", "warning");
    } else if (t.round === "champion") {
      showMsg("PRO CIRCUIT CHAMPION", `${toPar >= 0 ? "+" : ""}${toPar} through the final`, 5200);
      pushEvent("tour", "pro circuit champion!", "success");
      void audio?.cue("win");
    } else {
      showMsg(`ADVANCE — ${t.round.toUpperCase()}`, `carded ${toPar >= 0 ? "+" : ""}${toPar}`, 3400);
      pushEvent("tour", `advanced to ${t.round}`, "success");
      state.tourHoleStart += 9;
    }
    updateModeChips();
  } else if (state.mode === "skins") {
    const r = state.round!;
    showMsg("SKINS MATCH OVER", `${r.skinsWon} skins won · ${toPar >= 0 ? "+" : ""}${toPar}`, 4000);
    pushEvent("skins", `match over — ${r.skinsWon} skins`, "info");
  } else {
    showMsg("ROUND COMPLETE", `${card.totalStrokes} strokes · ${toPar >= 0 ? "+" : ""}${toPar} vs par ${card.totalPar}`, 4200);
    pushEvent("round", `round complete: ${toPar >= 0 ? "+" : ""}${toPar}`, toPar <= 0 ? "success" : "info");
    if (toPar < 0) void audio?.cue("win");
  }
  setPrompt("MENU — NEW ROUND");
}

/* ------------------------------------------------------------------ *
 *  Modes                                                              *
 * ------------------------------------------------------------------ */

function setMode(mode: GameModeId | "skins"): void {
  state.mode = mode;
  state.lab = null;
  state.tour = null;
  if (mode === "rangelab") {
    state.lab = { mode: "rangelab", attempts: 0, hits: 0, best: 0, streak: 0 };
    state.labRng = makeRng(0x9a11);
    startHole(0); // uses hole 1 terrain + range rings
  } else if (mode === "puttinglab") {
    state.lab = { mode: "puttinglab", attempts: 0, hits: 0, best: 0, streak: 0 };
    startHole(2); // a par-3/4 hole with a real green
    nextPuttingSpot();
  } else if (mode === "tour") {
    state.tour = createTour(0x4a32);
    state.tourHoleStart = 0;
    const courseForRound: CourseId[] = ["stAuroras", "mapleHollow", "cinderRim", "cloudTerrace", "mareCourse"];
    selectCourse(courseForRound[0]!, false);
    startRound();
  } else {
    startRound();
  }
  updateModeChips();
}

function selectCourse(id: CourseId, restart = true): void {
  if (!COURSES[id]) return;
  state.courseId = id;
  state.course = COURSES[id]!;
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-course]"))) {
    b.classList.toggle("active", b.dataset.course === id);
  }
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-course-menu]"))) {
    b.classList.toggle("active", b.dataset.courseMenu === id);
  }
  if (restart) {
    startRound();
  }
  updateModeChips();
  pushEvent("venue", `course: ${state.course.name.toLowerCase()}`, "info");
}

/* ------------------------------------------------------------------ *
 *  Swing meter DOM                                                    *
 * ------------------------------------------------------------------ */

function updateSwingMeter(): void {
  const s = state.swing.state();
  const fill = $("sw-fill"), needle = $("sw-needle"), green = $("sw-green"), perfect = $("sw-perfect");
  const label = $("sw-label");
  const rl = $("sw-readout-l"), rr = $("sw-readout-r");
  if (!fill || !needle || !green || !perfect) return;
  const gz = DIFF_GREEN_ZONE[state.difficulty];
  green.style.left = `${(0.5 - gz) * 100}%`;
  green.style.width = `${gz * 2 * 100}%`;
  perfect.style.left = "calc(50% - 2px)";
  if (s.phase === "power") {
    fill.style.width = `${s.meter * 100}%`;
    needle.style.left = `${s.meter * 100}%`;
    green.style.opacity = "0";
    perfect.style.opacity = "0";
    if (label) label.textContent = "SPACE — SET POWER";
    if (rl) rl.textContent = "";
    if (rr) rr.textContent = `${Math.round(s.meter * 100)}%`;
  } else if (s.phase === "accuracy") {
    fill.style.width = `${(s.power ?? 0) * 100}%`;
    // needle value +1 (left) → -1 (right); 0 centre = pure
    needle.style.left = `${((1 - s.meter) / 2) * 100}%`;
    green.style.opacity = "1";
    perfect.style.opacity = "1";
    if (label) label.textContent = "SPACE — SET ACCURACY · CENTER = PURE";
    if (rl) rl.textContent = "◀ DRAW";
    if (rr) rr.textContent = "FADE ▶";
  } else if (s.phase === "committed") {
    const spin = s.spin ?? 0;
    if (label) label.textContent = spin < -0.25 ? "DRAW" : spin > 0.25 ? "FADE" : "PURE CONTACT";
    if (rl) rl.textContent = `PWR ${Math.round((s.power ?? 0) * 100)}%`;
    if (rr) rr.textContent = `ACC ${Math.round((s.accuracy ?? 0) * 100)}`;
  }
}

/* ------------------------------------------------------------------ *
 *  Juice-lite (camera shake/punch via the same juice stack as tennis)  *
 * ------------------------------------------------------------------ */

function juiceFire(ev: string, at?: Record<string, unknown>): void {
  try { juice?.fire(ev as never, at as never); } catch { /* best-effort */ }
}

const JUICE_EVENTS: Record<string, any> = {
  hit:     { fx: { kind: "spark", count: 8, color: "#ffd257", speed: 2.6 }, cue: "drive", rumble: { ms: 26, weak: 0.4 }, punch: { fovDeg: 1.4, ms: 140 } },
  bounce:  { fx: { kind: "dust", count: 6, color: "#cfc8a8", speed: 1.6 } },
  splash:  { fx: { kind: "splash", count: 18, color: "#63e2ff", speed: 3.4 }, cue: "splash", flash: { color: "#63e2ff", peak: 0.1, ms: 120 } },
  holed:   { fx: { kind: "ring", count: 24, color: "#9be84e", speed: 4.6 }, cue: "cup", hitStop: 0.09, shake: 0.42, punch: { fovDeg: 3.0, dolly: -0.4, ms: 300 }, flash: { color: "#9be84e", peak: 0.2, ms: 170 } },
  eagle:   { cue: "win", shake: 0.5, punch: { fovDeg: 3.6, dolly: -0.5, ms: 380 }, flash: { color: "#ffd257", peak: 0.24, ms: 240 } }
};

function spawnTurfPuff(pos: Vec3, zone: LieKind): void {
  const color = zone === "sand" ? "#e8d8a0" : zone === "green" || zone === "fringe" ? "#9be84e" : zone === "rough" ? "#4a6a3f" : "#7ab85a";
  try { fxCtlRef?.spawn("ground-dust", pos, { radius: 0.35, color, intensity: 1 }); } catch { /* optional */ }
}

let fxCtlRef: any = null;

/* ------------------------------------------------------------------ *
 *  Per-frame update                                                   *
 * ------------------------------------------------------------------ */

let golferPhase: "idle" | "address" | "backswing" | "downswing" | "follow" | "celebrate" | "walk" | "putt" = "address";
let golferPhaseT = 0;
const pressedKeys = new Set<string>();
const justPressed = new Set<string>();

function golferAt(): { pos: Vec3; yaw: number } {
  // rig local frame: origin = ball, +Z = shot direction — pass the lie, not a golfer offset
  const r = state.round!;
  const t = state.terrain!;
  const bp = r.ballPos;
  return { pos: [bp[0], t.height(bp[0], bp[2]), bp[2]], yaw: aimYaw() };
}

function frame(dt: number): void {
  framesRendered += 1;
  if (framesRendered === 1) console.log("[links] first frame tick", dt);
  publishEvidence();
  const now = performance.now();
  const r = state.round;
  const t = state.terrain;

  if (bannerTimer && now > bannerTimer) { $("banner")?.classList.remove("show"); bannerTimer = 0; }
  if (msgTimer && now > msgTimer) { $("msg")?.classList.remove("show"); msgTimer = 0; }

  // --- input edges ---
  if (state.phase !== "menu") {
    if (justPressed.has("Escape")) {
      openMenu();
    }
    if (r && state.phase === "address") {
      if (justPressed.has("KeyQ")) { r.clubIdx = (r.clubIdx + CLUB_ORDER.length - 1) % CLUB_ORDER.length; void audio?.cue("ui"); updateCardHud(); }
      if (justPressed.has("KeyE")) { r.clubIdx = (r.clubIdx + 1) % CLUB_ORDER.length; void audio?.cue("ui"); updateCardHud(); }
      if (justPressed.has("KeyM")) { applyMulligan(); }
      if (justPressed.has("Space")) { startSwing(); }
    } else if (r && state.phase === "swing") {
      if (justPressed.has("Space")) {
        const s = state.swing.press();
        if (s.phase === "committed") commitSwing();
      }
    }
    if (state.phase === "roundover" && justPressed.has("Enter")) {
      openMenu();
    }
  }

  // --- aim/club continuous ---
  if (r && t && (state.phase === "address" || state.phase === "swing")) {
    const aimIn = (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0) - (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0);
    const zoomIn = (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0) - (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0);
    r.aimOffset = clamp(r.aimOffset + aimIn * dt * 0.85, -0.55, 0.55);
    cam.zoom = clamp(cam.zoom - zoomIn * dt * 1.4, 0.7, 2.6);
  }

  // --- swing meter tick ---
  if (state.phase === "swing") {
    const s = state.swing.tick(dt);
    if (s.phase === "committed") commitSwing();
    else {
      const st = state.swing.state();
      golferPhase = st.phase === "power" ? "backswing" : "downswing";
      golferPhaseT = st.phase === "power" ? st.meter : (1 - st.meter) / 2;
    }
    updateSwingMeter();
  }

  // --- ball step ---
  if (state.phase === "flight" && state.ball && t && state.commit) {
    const env = {
      terrain: t,
      gravity: state.course.gravity,
      airDensity: state.course.airDensity,
      wind: state.wind,
      lie: state.commit.club.putter ? ("green" as LieKind) : "fairway",
      liePenalty: 1
    };
    const { ball, events } = stepBall(state.ball, env, dt);
    state.ball = ball;
    trailPts.push(ball.pos);
    if (trailPts.length > TRAIL_COUNT) trailPts.shift();
    if (events.length) onBallEvents(events);
  }

  // --- between → next lie ---
  if (state.phase === "between" && now > betweenUntil) {
    beginAddress();
  }
  if (state.phase === "card" && now > betweenUntil) {
    advanceHole();
  }

  // --- visuals ---
  if (r && t) {
    const bp = state.ball ? state.ball.pos : r.ballPos;
    ballHandle?.setPosition(bp[0], Math.max(bp[1], t.height(bp[0], bp[2]) + BALL_R * 0.6), bp[2]);
    const bh = bp[1] - t.height(bp[0], bp[2]);
    const ss = clamp(1 - bh * 0.05, 0.4, 1);
    ballShadowHandle?.setPosition(bp[0], t.height(bp[0], bp[2]) + 0.02, bp[2]).setScale([ss, 1, ss]).setVisible(bh < 12);

    // trail dots
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const pt = trailPts[trailPts.length - 1 - i];
      const h = trailHandles[i];
      if (!h) continue;
      if (pt && state.phase === "flight" && state.ball?.status === "flight") {
        const s = Math.max(0.2, 1 - i / (TRAIL_COUNT + 1));
        h.setPosition(pt[0], pt[1], pt[2]).setScale([s, s, s]).setVisible(true);
      } else {
        h.setScale(HIDDEN_SCALE).setVisible(false);
      }
    }

    // aim aids during address/swing
    const aiming = state.phase === "address" || state.phase === "swing";
    if (aiming) {
      const yaw = aimYaw();
      const club = currentClub();
      const lx = r.ballPos[0] + Math.sin(yaw) * 14.5;
      const lz = r.ballPos[2] + Math.cos(yaw) * 14.5;
      aimLineHandle?.setPosition(lx, t.height(lx, lz) + 0.06, lz).setRotation(0, yaw, 0).setScale([1, 1, 1]).setVisible(r.lie !== "green");
      const carry = club.carry * 0.92;
      const px = r.ballPos[0] + Math.sin(yaw) * carry;
      const pz = r.ballPos[2] + Math.cos(yaw) * carry;
      landingRingHandle?.setPosition(px, t.height(px, pz) + 0.12, pz).setRotation(Math.PI / 2, 0, 0).setScale([1, 1, 1]).setVisible(r.lie !== "green" && !club.putter);
      cupPulseHandle?.setPosition(t.cup[0], t.cup[1] + 0.05, t.cup[2]).setRotation(Math.PI / 2, 0, now / 480).setScale([1.1, 1.1, 1.1]).setVisible(r.lie === "green" || r.lie === "fringe");
    } else {
      aimLineHandle?.setScale(HIDDEN_SCALE).setVisible(false);
      landingRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
      cupPulseHandle?.setScale(HIDDEN_SCALE).setVisible(false);
    }

    // green read arrows on the green
    const onGreen = r.lie === "green" || r.lie === "fringe" || state.mode === "puttinglab";
    readArrowHandles.forEach((h, i) => {
      if (!h) return;
      if (onGreen) {
        const a = (i / 12) * Math.PI * 2;
        const rr2 = state.hole.layout.greenRadius * 0.55;
        const x = t.cup[0] + Math.cos(a) * rr2;
        const z = t.cup[2] + Math.sin(a) * rr2;
        const [sx2, sz2] = t.slope(x, z);
        const yaw = Math.atan2(sx2, sz2);
        const mag = clamp(Math.hypot(sx2, sz2) * 8, 0.25, 1);
        h.setPosition(x, t.height(x, z) + 0.06, z).setRotation(0, yaw, 0).setScale([1, 1, mag]).setVisible(Math.hypot(sx2, sz2) > 0.01);
      } else {
        h.setScale(HIDDEN_SCALE).setVisible(false);
      }
    });

    // golfer pose
    if (golferRig) {
      const g = golferAt();
      if (state.phase !== "swing") golferPhaseT = clamp(golferPhaseT + dt, 0, 1);
      const phase = state.phase === "flight" && state.commit?.club.putter ? "putt" : golferPhase;
      poseGolfer(golferRig, phase, state.phase === "swing" ? state.swing.state().meter : golferPhaseT, g.pos, g.yaw);
    }

    // flag flutter + cup pulse
    flagstickHandle?.setRotation?.(0, Math.sin(now / 900) * 0.05, Math.sin(now / 700) * 0.03);
  }

  updateCamera(dt);
  touchControls?.update?.();
  justPressed.clear();
}

/* ------------------------------------------------------------------ *
 *  Mulligan / penalty                                                 *
 * ------------------------------------------------------------------ */

function applyMulligan(): void {
  const r = state.round!;
  r.strokes += 1;
  r.ballPos = [...r.prevPos] as Vec3;
  state.ball = null;
  trailPts.length = 0;
  pushEvent("mulligan", "mulligan — +1 stroke, replay the shot", "warning");
  beginAddress();
}

/* ------------------------------------------------------------------ *
 *  Menu / studio / bracket                                            *
 * ------------------------------------------------------------------ */

function openMenu(): void {
  state.phase = "menu";
  state.mode = "menu";
  $("menu-overlay")?.classList.add("open");
  setPrompt(null);
  $("swing-meter")?.classList.remove("show");
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]"))) b.classList.remove("active");
  document.querySelector<HTMLButtonElement>('[data-mode-btn="menu"]')?.classList.add("active");
}

function closeMenu(): void {
  $("menu-overlay")?.classList.remove("open");
  $("studio-section")!.style.display = "none";
  $("tour-section")!.style.display = "none";
  // release focus from the clicked control — a focused button eats the next
  // Space keyup as a re-click, which would reset the round mid-press
  (document.activeElement as HTMLElement | null)?.blur?.();
}

function startModeFromMenu(mode: string): void {
  closeMenu();
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]"))) {
    b.classList.toggle("active", b.dataset.modeBtn === (mode === "quick" ? "quick" : mode === "rangelab" ? "rangelab" : "menu"));
  }
  if (mode === "studio") {
    $("menu-overlay")?.classList.add("open");
    $("studio-section")!.style.display = "";
    return;
  }
  if (mode === "tour") {
    $("tour-section")!.style.display = "";
  }
  setMode(mode as GameModeId | "skins");
}

function renderBracket(): void {
  const el = $("bracket");
  if (!el || !state.tour) return;
  const t = state.tour;
  const rounds: ("r32" | "r16" | "qtr" | "semi" | "final")[] = ["r32", "r16", "qtr", "semi", "final"];
  const titles = ["ROUND 32", "ROUND 16", "QUARTER", "SEMI", "FINAL"];
  el.innerHTML = rounds.map((rd, i) => {
    const cells = t.results.filter((x) => x.round === rd);
    const rows = cells.length ? cells : [{ round: rd, name: "—", score: 0, advanced: false }];
    return `<div class="bracket-round"><div class="br-title">${titles[i]}</div>${rows.slice(0, 8).map((c) => `<div class="bracket-cell ${c.name === "YOU" ? "you" : ""} ${c.advanced ? "alive" : "done"}">${c.name} ${c.score >= 0 ? "+" : ""}${c.score}</div>`).join("")}</div>`;
  }).join("");
}

function buildStudioSwatches(): void {
  const mk = (rowId: string, colors: string[], key: keyof GolferFit) => {
    const row = $(rowId);
    if (!row) return;
    row.innerHTML = "";
    colors.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch menu-pill" + (state.fit[key] === c ? " active" : "");
      b.style.background = c;
      b.style.width = "30px";
      b.style.height = "30px";
      b.title = c;
      b.addEventListener("click", () => {
        (state.fit as any)[key] = c;
        row.querySelectorAll(".swatch").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      });
      row.appendChild(b);
    });
  };
  mk("studio-polo", POLO_SWATCHES, "polo");
  mk("studio-cap", CAP_SWATCHES, "cap");
  mk("studio-skin", SKIN_SWATCHES, "skin");
  mk("studio-trail", TRAIL_SWATCHES, "trail");
  $("studio-apply")?.addEventListener("click", () => {
    try { localStorage.setItem("aura-links-fit", JSON.stringify(state.fit)); } catch { /* private mode */ }
    if (golferRig) applyGolferFit(golferRig, state.fit);
    for (const h of trailHandles) h?.setMaterial?.(material.emissive({ color: state.fit.trail, emissive: state.fit.trail, emissiveIntensity: 0.4 }));
    closeMenu();
    if (!state.round) startRound();
    else state.phase = "address";
    pushEvent("studio", "fit applied", "success");
  });
}

function bindUi(): void {
  // top bar modes
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]"))) {
    btn.addEventListener("click", () => {
      const m = btn.dataset.modeBtn!;
      for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]"))) b.classList.toggle("active", b === btn);
      if (m === "menu") { openMenu(); return; }
      closeMenu();
      setMode(m as GameModeId);
    });
  }
  // course switcher
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-course]"))) {
    btn.addEventListener("click", () => selectCourse(btn.dataset.course as CourseId));
  }
  // menu overlay
  for (const card of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-start]"))) {
    card.addEventListener("click", () => startModeFromMenu(card.dataset.start!));
  }
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-diff]"))) {
    btn.addEventListener("click", () => {
      state.difficulty = btn.dataset.diff as DifficultyId;
      for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-diff]"))) b.classList.toggle("active", b === btn);
    });
  }
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-course-menu]"))) {
    btn.addEventListener("click", () => selectCourse(btn.dataset.courseMenu as CourseId));
  }
  $("menu-close")?.addEventListener("click", () => { closeMenu(); if (!state.round) { setMode("quick"); } else state.phase = "address"; });
  $("menu-run")?.addEventListener("click", () => { closeMenu(); setMode(state.tour ? "tour" : "quick"); });

  // keys
  window.addEventListener("keydown", (ev) => {
    if (ev.repeat) return;
    pressedKeys.add(ev.code);
    justPressed.add(ev.code);
  });
  window.addEventListener("keyup", (ev) => pressedKeys.delete(ev.code));
  window.addEventListener("blur", () => pressedKeys.clear());
  // a focused button eats the next Space/Enter keyup as a re-click — release
  // focus after every button click so game keys always reach the listener
  document.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest?.("button");
    (b as HTMLElement | null)?.blur?.();
  });
}

/* ------------------------------------------------------------------ *
 *  Audio + fx + boot                                                  *
 * ------------------------------------------------------------------ */

function setupAudio(): void {
  audio = createGameAudio({
    browserContext: true,
    cues: {
      drive:    { id: "drive", asset: { url: assets.siegeDriveHitSfx.url }, volume: 0.55 },
      putt:     { id: "putt", asset: { url: sfxUrl(sfx.sports.ballBounceCourt[0]) }, volume: 0.5 },
      bounce:   { id: "bounce", asset: { url: sfxUrl(sfx.sports.ballBounceCourt[1]) }, volume: 0.4 },
      cup:      { id: "cup", asset: { url: assets.siegeCupSinkSfx.url }, volume: 0.8 },
      rattle:   { id: "rattle", asset: { url: assets.siegeMetalClangSfx.url }, volume: 0.45 },
      splash:   { id: "splash", asset: { url: sfxUrl(sfx.sports.ballBounceHard[1]) }, volume: 0.5 },
      parChime: { id: "parChime", asset: { url: assets.siegeParChimeSfx.url }, volume: 0.7 },
      bogey:    { id: "bogey", asset: { url: assets.siegeBogeyStingSfx.url }, volume: 0.5 },
      win:      { id: "win", asset: { url: sfxUrl(sfx.stinger.win[0]) }, volume: 0.85 },
      ui:       { id: "ui", asset: { url: assets.siegeUiConfirmSfx.url }, volume: 0.4 },
      wind:     { id: "wind", asset: { url: assets.siegeAmbientWindSfx.url }, volume: 0.25, loop: true }
    },
    buses: [{ id: "sfx" } as any]
  } as any) as any;
  const unlock = () => { void audio?.unlock(); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  // ambient wind loop after first gesture
  window.addEventListener("pointerdown", () => void audio?.cue("wind"), { once: true });
}

function setupFxAndTouch(): void {
  const params = new URLSearchParams(window.location.search);
  state.reducedMotion = params.has("reducedMotion") || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
  state.reducedFlash = params.has("reducedFlash") || (window.matchMedia?.("(prefers-reduced-flash: reduce)")?.matches ?? false);
  a11ySettings = game.accessibility.settings([], { reducedMotion: state.reducedMotion, reducedFlash: state.reducedFlash, highContrast: params.has("highContrast") });

  fxCtlRef = (game as any).effects({ app: auraApp, reducedMotion: state.reducedMotion, reducedFlash: state.reducedFlash });
  const fx = createFxParticlePass({
    burst: (kind: string, position: any, o: any) => {
      try {
        const map: Record<string, string> = { spark: "hit-spark", dust: "ground-dust", ring: "ring-shockwave", splash: "ground-dust", streak: "dash-trail" };
        fxCtlRef?.spawn(map[kind] ?? "hit-spark", position, { radius: Math.max(0.2, (o?.count ?? 10) / 24), color: o?.color, intensity: 1 });
      } catch { /* optional */ }
    },
    trail: () => ({ stop: () => {} }),
    liveCount: 0
  } as any);
  juice = createJuice({
    events: JUICE_EVENTS as any,
    camera: (auraApp as any)?.camera as any,
    session: { reducedMotion: state.reducedMotion, reducedFlash: state.reducedFlash, hitStop: () => {}, slowMo: () => {} } as any,
    fx,
    overlay: createOverlayDriver({ domElement: $("game-stage")! }),
    tweens: createTweenEngine(),
    rumble: createRumbleDriver(),
    sound: { cue: (cue: string) => { void audio?.cue(cue); } }
  } as any);

  try {
    const keyFor = (b: string): string =>
      ({ left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", hit: "Space", light: "Space", jump: "Space", special: "KeyE", block: "KeyQ", heavy: "KeyM" } as Record<string, string>)[b] ?? b;
    const sink = {
      press: (b: string) => { const c = keyFor(b); pressedKeys.add(c); justPressed.add(c); },
      release: (b: string) => pressedKeys.delete(keyFor(b)),
      setAction: (a: string, held: boolean) => { const c = keyFor(a); if (held) { pressedKeys.add(c); justPressed.add(c); } else pressedKeys.delete(c); }
    };
    touchControls = mountTouchControls(sink as any, {
      preset: "dpad-4btn",
      bindings: { "stick.left": "left", "stick.right": "right", "stick.up": "up", "stick.down": "down", left: "left", right: "right", light: "hit", heavy: "special", special: "special", jump: "hit", block: "block" },
      haptics: { ms: 12 }
    } as any, {
      doc: document as any,
      root: $("game-stage") as any,
      coarsePointer: () => window.matchMedia?.("(pointer: coarse)")?.matches ?? false
    } as any);
  } catch (e) {
    console.warn("[links] touch controls unavailable", e);
  }
}

/* ------------------------------------------------------------------ *
 *  Evidence                                                           *
 * ------------------------------------------------------------------ */

function publishEvidence(): void {
  const r = state.round;
  const evidence = {
    route: "showcase-aura-links-3d",
    engine: "@aura3d/engine",
    engineVersion: "4.0.1",
    ready: true,
    framesRendered,
    mode: state.mode,
    phase: state.phase,
    cameraMode: cam.mode,
    course: state.courseId,
    hole: state.hole.number,
    par: state.hole.par,
    strokes: r?.strokes ?? 0,
    putts: r?.putts ?? 0,
    lie: r?.lie ?? null,
    club: r ? CLUB_ORDER[r.clubIdx] : null,
    aimYaw: r ? aimYaw() : 0,
    wind: state.wind,
    ball: state.ball ? { pos: state.ball.pos, status: state.ball.status, carry: state.ball.carry } : null,
    card: state.card ? { toPar: state.card.toPar, totalStrokes: state.card.totalStrokes } : null,
    lab: state.lab,
    tour: state.tour ? { round: state.tour.round, playerAlive: state.tour.playerAlive, playerScore: state.tour.playerScore } : null,
    fit: state.fit,
    difficulty: state.difficulty,
    juice: (juice as any)?.snapshot?.() ?? null,
    accessibility: a11ySettings ? { reducedMotion: a11ySettings.reducedMotion, reducedFlash: a11ySettings.reducedFlash, highContrast: a11ySettings.highContrast } : null,
    eventLog: eventLog.snapshot(),
    touch: touchControls?.evidence?.() ?? null,
    audio: audio?.evidence ? { unlocked: audio.evidence.unlocked, cueCount: audio.evidence.cueCount, playedCueCount: audio.evidence.playedCueCount } : null,
    catalogAssets: ["siegeGolfBall", "siegeFlagstickCupMeshy", "propPineTree", "propRockA", "propRockB", "siegeWindmillTowerMeshy", "siegeStoneBridgeMeshy", "siegeCastleGatehouseMeshy", "showcaseTeaHouse", "skylineCrystalShardMeshy", "turboAlpineVenueBackdrop", "neonStreetLampProp", "showcaseModernBuildingOne", "showcaseModernOfficeBuilding", "showcaseVoxelBuilding", "auroraHabitatDomeMeshy", "lunarRoverMeshy", "gravityOrbitalRelayMeshy"],
    deterministic: { terrain: "buildHoleTerrain", ball: "stepBall", seed: "lcg" }
  };
  (window as any).__AURA3D_GAME_EVIDENCE__ = evidence;
  (window as any).__AURA3D_GAME__ = evidence;
  (window as any).__AURA3D_SHOWCASE_AURA_LINKS_3D__ = evidence;
}

/* ------------------------------------------------------------------ *
 *  Boot                                                               *
 * ------------------------------------------------------------------ */

function bootStage(name: string): void {
  (window as any).__BOOT_STAGE__ = name;
  console.log("[links] boot:", name);
}

function boot(): void {
  window.addEventListener("error", (e) => console.error("[links] window error:", e.message, e.filename, e.lineno));
  window.addEventListener("unhandledrejection", (e) => console.error("[links] unhandled rejection:", String(e.reason)));
  // Trace every fetch — the SPA fallback serves index.html for missing files,
  // which surfaces as opaque JSON parse errors inside the renderer mount.
  const origFetch = window.fetch.bind(window);
  window.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    try {
      const res = await origFetch(input, init);
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || ct.includes("html")) console.warn(`[links] fetch ${res.status} ${ct} ${url}`);
      return res;
    } catch (err) {
      console.warn(`[links] fetch THREW ${String(err)} ${url}`);
      throw err;
    }
  }) as typeof fetch;
  const params = new URLSearchParams(window.location.search);
  const savedFit = (() => { try { return JSON.parse(localStorage.getItem("aura-links-fit") ?? "null"); } catch { return null; } })();
  if (savedFit && typeof savedFit === "object") state.fit = { ...state.fit, ...savedFit };

  const courseParam = params.get("course") as CourseId | null;
  if (courseParam && COURSES[courseParam]) {
    state.courseId = courseParam;
    state.course = COURSES[courseParam]!;
  }
  state.hole = state.course.holes[0]!;
  state.terrain = buildHoleTerrain(state.course, state.hole);

  bootStage("scene-build");
  auraApp = createAuraApp("#app", {
    scene: buildHoleScene(state.course, state.hole, state.terrain, null),
    ...looks.appOptions(state.course.look)
  } as any);

  bootStage("audio");
  setupAudio();
  bootStage("fx-touch");
  setupFxAndTouch();
  bootStage("bind-ui");
  bindUi();
  bootStage("studio");
  buildStudioSwatches();
  bootStage("resolve-handles");
  resolveHoleHandles();

  document.body.dataset.aura3dReady = "true";
  bootStage("ready");
  pushEvent("system", "aura links 3d online", "success");

  console.log("[links] visibility:", document.visibilityState, "hidden:", document.hidden);
  requestAnimationFrame(() => console.log("[links] raf tick — RAF is live"));
  window.setTimeout(() => console.log("[links] raf after 2s:", (window as any).__rafFired ?? "none"), 2000);
  requestAnimationFrame(() => { (window as any).__rafFired = true; });
  // Evidence pump: publishes state even when RAF is throttled (headless capture)
  window.setInterval(() => publishEvidence(), 500);
  (auraApp as any).ready?.()?.then(() => {
    bootStage("mounted");
    const rr = (window as any).__AURA3D_ROUTE_READY__;
    const diag = (auraApp as any).diagnostics?.() ?? rr?.diagnostics;
    console.log("[links] route-state:", rr?.status ?? "?",
      "backend:", (auraApp as any).backend ?? "?",
      "drawCalls:", diag?.drawCalls ?? "?",
      "errors:", JSON.stringify(diag?.errors ?? []),
      "warnings:", JSON.stringify((diag?.warnings ?? []).slice(0, 4)));
    (auraApp as any).resume?.();
  }).catch((e: any) =>
    console.error("[links] mount failed:", String(e), (e as Error)?.stack ?? ""));
  (auraApp as any).onFrame(({ dt }: { dt: number }) => frame(clamp(dt, 0.001, 0.05)));

  // URL-param start modes (evidence probes)
  const modeParam = params.get("mode");
  const holeParam = Number(params.get("hole"));
  if (modeParam === "rangelab") setMode("rangelab");
  else if (modeParam === "puttinglab") setMode("puttinglab");
  else if (modeParam === "tour") { $("tour-section")!.style.display = ""; setMode("tour"); }
  else if (params.get("menu") === "1") { openMenu(); }
  else if (modeParam === "skins") setMode("skins");
  else {
    setMode("quick");
    if (Number.isFinite(holeParam) && holeParam >= 1 && holeParam <= 9) startHole(holeParam - 1);
  }
  const explicitEntry = modeParam || courseParam || params.get("hole") || params.get("still");
  if (explicitEntry && params.get("menu") !== "1") closeMenu();

  // ?still=N — deterministic capture mode: pause the live loop, step N fixed
  // frames through app.step() (runs frame() + a single simulated-time render
  // each), then publish evidence. Headless captures get a static canvas even
  // when the RAF loop would starve the compositor.
  const stillParam = params.get("still");
  if (stillParam) {
    const n = Math.min(900, Math.max(1, Number(stillParam) || 60));
    void (async () => {
      await (auraApp as any).ready?.();
      (auraApp as any).pause?.();
      for (let i = 0; i < n; i += 1) (auraApp as any).step?.(1 / 60);
      publishEvidence();
      console.log(`[links] still: stepped ${n} frames, framesRendered=${framesRendered}`);
    })();
  }
}

void boot();
