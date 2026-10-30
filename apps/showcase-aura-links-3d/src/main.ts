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
  installQaHooks,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  text3D
} from "@aura3d/engine";
import {
  createJuice,
  createOverlayDriver,
  createRumbleDriver,
  createTweenEngine,
  createFxParticlePass,
  mountTouchControls,
  sfx,
  sfxUrl,
  installGameBeacon
} from "@aura3d/engine/game";
import "../../showcase-port-shared/quickbar.css";
import { assets } from "./aura-assets";
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
import { COURSES, buildHoleTerrain, pondGeometry } from "./game/courses";
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
  PLAYER_NAME,
  recordHole,
  rollWind,
  scoreLabel,
  stepBall,
  suggestClub
} from "./game/sim";
import { defaultAimYaw, pinArrowDegrees, stepAimOffset, wrapAngle, yawToward } from "./game/aim";
import { applyGolferFit, buildGolferNodes, golferTelemetry, poseGolfer, resolveGolferRig, type GolferPhase } from "./game/rig";
import { sweptClubContact, type ClubContact } from "./game/contact";
import { commitStroke } from "./game/strokeCommit";
import { contactShadowIntensity, courseFill } from "./game/lighting";
import { clubForShot, planShot, puttRange, type ShotPlan } from "./game/autopilot";
import {
  bracketRows,
  cameraModeFor,
  menuCanOpen,
  pickupScore,
  scorePuttingLab,
  shouldPickUp,
  tourCourseFor,
  tourFinished,
  type CamMode,
  type PlayPhase
} from "./game/flow";
import { installBlackFrameGuard } from "@aura3d/debug";

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;
/** game-logic clock: wall time plus the simulated time a ?qa=1 advance() has stepped */
let qaClockMs = 0;
const nowMs = (): number => performance.now() + qaClockMs;
let lastEvidence: Record<string, unknown> | null = null;

const publishBeacon = (evidence: object): void => {
  gameBeacon ??= installGameBeacon({ route: "showcase-aura-links-3d", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__", "__AURA3D_SHOWCASE_AURA_LINKS_3D__"] });
  gameBeacon.publishEvidence(evidence);
};

installBlackFrameGuard();

/* ------------------------------------------------------------------ *
 *  Small math helpers                                                 *
 * ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const HIDDEN_SCALE = 0.0001;
const TRAIL_COUNT = 16;
/**
 * drawn ball radius (m): about 2.3x a real 21 mm ball, half the cup's 0.2 m width. At 0.035 the ball hid behind
 * the 5.5 cm club head in the 1280x720 address frame (remote run g10w3-shots); the ground ring marks it at range.
 */
const BALL_R = 0.05;
/** drawn cup radius (m), matching the sim capture radius so a ball that looks in drops in */
const CUP_R = 0.1;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

/* ------------------------------------------------------------------ *
 *  Game state                                                         *
 * ------------------------------------------------------------------ */

// PlayPhase (game/flow.ts): menu · address (aim/club/space) · swing (meter running) · flight (ball moving)
// · between (pause after rest) · card (hole card, then next hole) · roundover (9 holes done)

interface RoundState {
  holeIndex: number; // 0..8
  strokes: number;
  putts: number;
  ballPos: Vec3;
  prevPos: Vec3;
  lie: LieKind;
  clubIdx: number;
  aimBase: number; // yaw the address starts on (toward the pin, or the fairway on a dogleg tee)
  aimOffset: number; // radians off aimBase, unbounded and wrapped at +-PI
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
      // CCW winding when viewed from +Y so gl_FrontFacing is true and sun lighting hits the top surface
      indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
    }
  }
  return { kind: "aura-custom-geometry" as const, positions, normals, uvs, indices };
}

/** Multi-column ribbon strip conformed to terrain along the hole's intended line. */
function ribbonAlongPath(terrain: HoleTerrain, path: readonly Vec2[], halfWidth: number, lift: number, step = 2.5, cols = 9) {
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
  // Subdivide laterally across [-1, 1] so the ribbon follows the +0.15m fairway crown and tee pad without rough poke-through
  pts.forEach((p, i) => {
    const endDist = pts.length - 1 - i;
    const taper = endDist < 4 ? clamp(endDist / 4, 0.78, 1) : 1;
    const hw = halfWidth * taper;
    const px = -p.dz, pz = p.dx; // lateral normal
    for (let c = 0; c < cols; c++) {
      const side = (c / (cols - 1)) * 2 - 1;
      const x = p.x + px * hw * side;
      const z = p.z + pz * hw * side;
      positions.push([x, terrain.height(x, z) + lift, z]);
      const [sx, sz] = terrain.slope(x, z);
      const inv = 1 / Math.hypot(sx, 1, sz);
      normals.push([-sx * inv, inv, -sz * inv]);
      uvs.push([i * step / 10, side * 0.5 + 0.5]);
    }
    if (i > 0) {
      const row0 = (i - 1) * cols;
      const row1 = i * cols;
      for (let c = 0; c < cols - 1; c++) {
        const a = row0 + c;
        // CCW winding when viewed from +Y
        indices.push(a, row1 + c, a + 1, a + 1, row1 + c, row1 + c + 1);
      }
    }
  });
  return { kind: "aura-custom-geometry" as const, positions, normals, uvs, indices };
}

/** Multi-ring disc conformed to terrain (green, fringe ring, and sand bunkers). */
function discOnTerrain(terrain: HoleTerrain, cx: number, cz: number, radius: number, lift: number, segs = 32, innerRadius = 0) {
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  const rings = innerRadius > 0 ? [innerRadius, radius] : [0, radius * 0.35, radius * 0.7, radius];
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
  const stride = segs + 1;
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const baseA = ri * stride;
    const baseB = (ri + 1) * stride;
    for (let s = 0; s < segs; s++) {
      const a0 = baseA + s, a1 = baseA + s + 1, b0 = baseB + s, b1 = baseB + s + 1;
      // CCW winding when viewed from +Y
      indices.push(a0, a1, b0, a1, b1, b0);
    }
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

/** Sample a point along the hole's polyline at normalized parameter u ∈ [0, 1]. */
function samplePathPoint(path: readonly Vec2[], u: number): { x: number; z: number; nx: number; nz: number } {
  const clamped = clamp(u, 0, 1);
  const segCount = Math.max(1, path.length - 1);
  const f = clamped * segCount;
  const idx = Math.min(segCount - 1, Math.floor(f));
  const localT = f - idx;
  const a = path[idx]!;
  const b = path[idx + 1] ?? a;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: lerp(a[0], b[0], localT),
    z: lerp(a[1], b[1], localT),
    nx: -dz / len,
    nz: dx / len
  };
}

/**
 * Stylized summer conifers from instanced primitives. `propPineTree` is a
 * snow-frosted asset, so it is reserved for the alpine course; dunes and
 * parkland get layered green boughs that match their warm palettes. Three
 * instanced sphere tiers + one trunk tier keep this to four draw calls.
 */
function buildConiferNodes(
  terrain: HoleTerrain,
  trees: readonly { x: number; z: number; h: number; yaw: number }[],
  theme: string
): any[] {
  const trunks: any[] = [];
  const low: any[] = [];
  const mid: any[] = [];
  const top: any[] = [];
  const lowColors: string[] = [];
  const midColors: string[] = [];
  const topColors: string[] = [];
  const tones = theme === "dunes"
    ? ["#4f7549", "#5a7f4e", "#446742"]
    : ["#336b3d", "#3b7442", "#2b5f36"];
  trees.forEach((tr, i) => {
    const s = tr.h / 6.2;
    const y = terrain.height(tr.x, tr.z) - 0.12;
    trunks.push({ position: [tr.x, y + 1.3 * s, tr.z], rotation: [0, tr.yaw, 0], scale: [s, s, s] });
    low.push({ position: [tr.x, y + 2.3 * s, tr.z], rotation: [0, tr.yaw, 0], scale: [s, s, s] });
    mid.push({ position: [tr.x, y + 3.65 * s, tr.z], rotation: [0, tr.yaw, 0], scale: [s * 0.78, s * 0.9, s * 0.78] });
    top.push({ position: [tr.x, y + 4.8 * s, tr.z], rotation: [0, tr.yaw, 0], scale: [s * 0.54, s * 0.74, s * 0.54] });
    const tone = tones[i % tones.length]!;
    lowColors.push(tone);
    midColors.push(tone);
    topColors.push(tone);
  });
  const bark = material.pbr({ color: "#5a4634", roughness: 0.94 });
  const bough = material.pbr({ color: "#ffffff", roughness: 0.88 });
  return [
    instances.cylinder({ name: "conifer-trunks", size: [0.26, 2.6, 0.26], material: bark, transforms: trunks, castShadow: true }),
    instances.sphere({ name: "conifer-boughs-low", size: [3.4, 2.6, 3.4], material: bough, transforms: low, colors: lowColors, castShadow: true }),
    instances.sphere({ name: "conifer-boughs-mid", size: [3.4, 2.6, 3.4], material: bough, transforms: mid, colors: midColors, castShadow: true }),
    instances.sphere({ name: "conifer-boughs-top", size: [3.4, 2.6, 3.4], material: bough, transforms: top, colors: topColors, castShadow: true })
  ];
}

/** Three-tier painted-wood bleachers; replaces the badly fitted stadium-seat slice. */
function buildBleacherNodes(
  cx: number,
  cz: number,
  sx: number,
  sz: number,
  terrain: HoleTerrain,
  pal: CourseSpec["palette"],
  id: string
): any[] {
  const yaw = Math.atan2(cx - sx, cz - sz);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const y = terrain.height(sx, sz);
  const at = (lx: number, ly: number, lz: number): [number, number, number] => [sx + lx * c + lz * s, y + ly, sz - lx * s + lz * c];
  const seatMat = material.pbr({ color: "#eee6d4", roughness: 0.82 });
  const frameMat = material.pbr({ color: shade(pal.rough, 0.68), roughness: 0.92 });
  const railMat = material.pbr({ color: "#f8f4e9", roughness: 0.5 });
  const nodes: any[] = [
    primitives.box({ name: `gallery-stand-${id}-base`, size: [6.6, 0.5, 4.0], material: frameMat })
      .position(...at(0, 0.22, -0.35))
      .rotate(0, yaw, 0)
  ];
  for (let tier = 0; tier < 3; tier++) {
    nodes.push(
      primitives.box({ name: `gallery-stand-${id}-tier-${tier}`, size: [6.0, 0.34, 1.06], material: seatMat })
        .position(...at(0, 0.55 + tier * 0.4, 0.95 - tier * 0.95))
        .rotate(0, yaw, 0)
    );
  }
  nodes.push(
    primitives.box({ name: `gallery-stand-${id}-back`, size: [6.2, 1.3, 0.18], material: frameMat })
      .position(...at(0, 0.78, -2.25))
      .rotate(0, yaw, 0),
    primitives.box({ name: `gallery-stand-${id}-rail`, size: [6.0, 0.06, 0.06], material: railMat })
      .position(...at(0, 1.02, 1.55))
      .rotate(0, yaw, 0)
  );
  for (const px of [-2.9, 2.9]) {
    nodes.push(
      primitives.cylinder({ name: `gallery-stand-${id}-post-${px}`, size: [0.05, 1.0, 0.05], material: railMat })
        .position(...at(px, 0.52, 1.55))
    );
  }
  return nodes;
}

/** Gable roof shell (two sloped planes + two triangular gable ends) in world space. */
function gableRoofSpec(
  x: number,
  y: number,
  z: number,
  yaw: number,
  width: number,
  depth: number,
  rise: number
): any {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const p = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const n = (nx: number, ny: number, nz: number): [number, number, number] => [nx * c + nz * s, ny, -nx * s + nz * c];
  const hw = width / 2;
  const hd = depth / 2;
  const RL = p(-hw, rise, 0), RR = p(hw, rise, 0);
  const EL = p(-hw, 0, hd), ER = p(hw, 0, hd);
  const EL2 = p(-hw, 0, -hd), ER2 = p(hw, 0, -hd);
  const slope = Math.hypot(hd, rise);
  const nPos = n(0, hd / slope, rise / slope);
  const nNeg = n(0, hd / slope, -rise / slope);
  const nPosX = n(1, 0, 0);
  const nNegX = n(-1, 0, 0);
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  const tri = (a: [number, number, number], b: [number, number, number], cP: [number, number, number], normal: [number, number, number]) => {
    const base = positions.length;
    positions.push(a, b, cP);
    normals.push(normal, normal, normal);
    uvs.push([0, 0], [1, 0], [0.5, 1]);
    indices.push(base, base + 1, base + 2);
  };
  tri(RL, ER, RR, nPos);
  tri(RL, EL, ER, nPos);
  tri(RL, RR, ER2, nNeg);
  tri(RL, ER2, EL2, nNeg);
  tri(RR, ER, ER2, nPosX);
  tri(RL, EL2, EL, nNegX);
  return { kind: "aura-custom-geometry" as const, positions, normals, uvs, indices };
}

/**
 * Clean postcard clubhouse assembled from primitives: stone base, cream walls,
 * side-gable roof, covered porch, glowing windows at night, roadside sign and a
 * short sand walkway from the green. Replaces the unreadable Meshy pavilion.
 */
function buildClubhouseNodes(
  course: CourseSpec,
  hole: HoleSpec,
  terrain: HoleTerrain,
  x: number,
  z: number
): any[] {
  const y = terrain.height(x, z);
  const yaw = Math.atan2(terrain.cup[0] - x, terrain.cup[2] - z);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const parkland = course.dressing.theme === "parkland";
  const night = course.look === "night-city" || course.look === "space";
  const wallMat = material.pbr({ color: "#f0e7d4", roughness: 0.86 });
  const trimMat = material.pbr({ color: "#fbf7ea", roughness: 0.72 });
  const stoneMat = material.pbr({ color: "#b7ae9c", roughness: 0.95 });
  const roofMat = material.pbr({ color: parkland ? "#6b4038" : "#2f4a42", roughness: 0.76 });
  const roofTrimMat = material.pbr({ color: parkland ? "#4a2b26" : "#213832", roughness: 0.82 });
  const deckMat = material.pbr({ color: "#9a7b55", roughness: 0.9 });
  const doorMat = material.pbr({ color: "#4a3428", roughness: 0.8 });
  const glassMat = night
    ? material.emissive({ color: "#ffd9a0", emissive: "#ffc36b", emissiveIntensity: 0.55, roughness: 0.35 })
    : material.pbr({ color: "#3d5c70", roughness: 0.22, metalness: 0.35 });
  const signMat = material.pbr({ color: parkland ? "#3f2a24" : "#20372f", roughness: 0.7 });
  const shrubMat = material.pbr({ color: shade(course.palette.rough, 1.1), roughness: 0.92 });
  const nodes: any[] = [
    primitives.box({ name: "clubhouse-foundation", size: [11.2, 0.7, 8.2], material: stoneMat })
      .position(...at(0, 0.32, 0)).rotate(0, yaw, 0),
    primitives.box({ name: "clubhouse-body", size: [10.0, 3.1, 7.2], material: wallMat })
      .position(...at(0, 1.85, 0)).rotate(0, yaw, 0),
    primitives.box({ name: "clubhouse-eave-band", size: [10.2, 0.2, 7.4], material: trimMat })
      .position(...at(0, 3.3, 0)).rotate(0, yaw, 0),
    geometry.custom(gableRoofSpec(x, y + 3.4, z, yaw, 11.2, 8.4, 1.3), { name: "clubhouse-roof", material: roofMat, castShadow: true }),
    primitives.box({ name: "clubhouse-ridge", size: [11.4, 0.13, 0.22], material: roofTrimMat })
      .position(...at(0, 4.73, 0)).rotate(0, yaw, 0),
    primitives.box({ name: "clubhouse-porch-deck", size: [11.4, 0.28, 2.6], material: deckMat })
      .position(...at(0, 0.42, 4.9)).rotate(0, yaw, 0),
    primitives.box({ name: "clubhouse-step", size: [4.6, 0.2, 0.9], material: stoneMat })
      .position(...at(0, 0.18, 6.7)).rotate(0, yaw, 0),
    primitives.box({ name: "clubhouse-porch-roof", size: [11.8, 0.2, 2.9], material: roofMat })
      .position(...at(0, 3.16, 4.95)).rotate(0, yaw, 0),
    primitives.box({ name: "clubhouse-door", size: [1.55, 2.3, 0.12], material: doorMat })
      .position(...at(0, 1.46, 3.66)).rotate(0, yaw, 0),
    primitives.box({ name: "clubhouse-sign", size: [5.0, 0.82, 0.14], material: signMat })
      .position(...at(0, 2.78, 3.72)).rotate(0, yaw, 0),
    text3D("AURA LINKS", { size: 0.38, depth: 0.05, letterSpacing: 0.055, backend: "sdf", material: material.emissive({ color: "#f4e7c8", emissive: "#e8d6ad", emissiveIntensity: 0.35 }) })
      .position(...at(-1.58, 2.59, 3.82))
      .rotate(0, yaw, 0),
    primitives.box({ name: "clubhouse-chimney", size: [0.8, 1.5, 0.8], material: stoneMat })
      .position(...at(-3.2, 4.3, -0.8)).rotate(0, yaw, 0)
  ];
  for (const lx of [-5.5, -1.85, 1.85, 5.5]) {
    nodes.push(
      primitives.cylinder({ name: `clubhouse-column-${lx}`, size: [0.17, 2.65, 0.17], material: trimMat })
        .position(...at(lx, 1.75, 6.05))
    );
  }
  for (const [wx, wz] of [[-3.3, 3.64], [3.3, 3.64]] as const) {
    nodes.push(
      primitives.box({ name: `clubhouse-window-trim-${wx}`, size: [2.1, 1.65, 0.08], material: trimMat })
        .position(...at(wx, 2.05, wz)).rotate(0, yaw, 0),
      primitives.box({ name: `clubhouse-window-${wx}`, size: [1.7, 1.3, 0.1], material: glassMat })
        .position(...at(wx, 2.05, wz + 0.04)).rotate(0, yaw, 0)
    );
  }
  for (const side of [-1, 1] as const) {
    nodes.push(
      primitives.box({ name: `clubhouse-side-window-${side}`, size: [0.1, 1.15, 4.1], material: glassMat })
        .position(...at(side * 5.02, 2.05, 0)).rotate(0, yaw, 0)
    );
  }
  for (const [sx, sz, ss] of [[-4.2, 7.4, 1.0], [4.2, 7.4, 1.0], [-6.2, 6.4, 0.8], [6.2, 6.4, 0.8]] as const) {
    nodes.push(
      primitives.sphere({ name: `clubhouse-shrub-${sx}`, size: [1.4 * ss, 0.9 * ss, 1.4 * ss], material: shrubMat })
        .position(...at(sx, 0.5 * ss, sz)).rotate(0, yaw, 0)
    );
  }
  // Short sand walkway links the green to the porch and gives the path a crisp edge.
  const walkStart: Vec2 = [terrain.cup[0], terrain.cup[2] + hole.layout.greenRadius + 2.1];
  const walkEndWorld = at(0, 0, 7.6);
  const walkEnd: Vec2 = [walkEndWorld[0], walkEndWorld[2]];
  nodes.push(
    geometry.custom(ribbonAlongPath(terrain, [walkStart, walkEnd], 1.55, 0.026), {
      name: "clubhouse-walk-edge",
      material: material.pbr({ color: "#b4a179", roughness: 0.96 })
    }),
    geometry.custom(ribbonAlongPath(terrain, [walkStart, walkEnd], 1.18, 0.04), {
      name: "clubhouse-walk",
      material: material.pbr({ color: shade(course.palette.sand, 0.92), roughness: 0.94 })
    })
  );
  return nodes;
}

function buildDressingNodes(course: CourseSpec, hole: HoleSpec, terrain: HoleTerrain, rng: () => number): any[] {
  const nodes: any[] = [];
  const theme = course.dressing.theme;
  const [cx, cz] = [terrain.cup[0], terrain.cup[2]];
  const [tx, tz] = [terrain.tee[0], terrain.tee[2]];
  const midT = hole.layout.path[Math.floor(hole.layout.path.length / 2)] ?? [0, hole.lengthM * 0.5];
  const fairHalf = hole.layout.fairwayWidth * 0.5;
  const clubSpot = theme === "dunes"
    ? { x: cx - 16, z: cz + hole.layout.greenRadius + 15 }
    : theme === "parkland"
      ? { x: cx - 15, z: cz + hole.layout.greenRadius + 14 }
      : null;

  // --- Corridor pine trees along left & right rough + behind the green ---
  const corridorTrees: { x: number; z: number; h: number; yaw: number }[] = [];
  const corridorRows = 12;
  for (let r = 0; r < corridorRows; r++) {
    const u = 0.09 + (r / (corridorRows - 1)) * 0.84;
    const p = samplePathPoint(hole.layout.path, u);
    for (const side of [-1, 1] as const) {
      const lat1 = fairHalf + 3.8 + rng() * 4.5;
      const x1 = p.x + p.nx * side * lat1 + (rng() - 0.5) * 2.2;
      const z1 = p.z + p.nz * side * lat1 + (rng() - 0.5) * 3.0;
      corridorTrees.push({ x: x1, z: z1, h: 6.8 + rng() * 3.2, yaw: rng() * Math.PI * 2 });

      const lat2 = fairHalf + 10.5 + rng() * 7.5;
      const x2 = p.x + p.nx * side * lat2 + (rng() - 0.5) * 3.0;
      const z2 = p.z + p.nz * side * lat2 + (rng() - 0.5) * 4.0;
      corridorTrees.push({ x: x2, z: z2, h: 8.2 + rng() * 3.8, yaw: rng() * Math.PI * 2 });
    }
  }
  // Backdrop trees framing behind the green amphitheatre
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.38 + (i / 7) * Math.PI * 0.76;
    const dist = hole.layout.greenRadius + 16 + (i % 2) * 5;
    const bx = cx + Math.sin(a) * dist;
    const bz = cz + Math.cos(a) * dist;
    corridorTrees.push({ x: bx, z: bz, h: 8.5 + (i % 3) * 1.4, yaw: rng() * Math.PI * 2 });
  }
  // A loose second belt deepens the horizon on the two lush courses.
  if (theme === "dunes" || theme === "parkland") {
    for (let i = 0; i < 10; i++) {
      const p = samplePathPoint(hole.layout.path, 0.14 + (i / 9) * 0.72);
      const side = i % 2 === 0 ? -1 : 1;
      const lat = fairHalf + 22 + (i % 4) * 4.5;
      corridorTrees.push({
        x: p.x + p.nx * side * lat + (rng() - 0.5) * 3.5,
        z: p.z + p.nz * side * lat + (rng() - 0.5) * 5.0,
        h: 7.4 + (i % 4) * 1.1,
        yaw: rng() * Math.PI * 2
      });
    }
  }

  if (theme !== "lunar" && theme !== "volcanic") {
    const treeSpots = corridorTrees.filter((tr) => {
      const zKind = terrain.zone(tr.x, tr.z);
      if (zKind === "sand" || zKind === "water" || zKind === "fairway" || zKind === "green") return false;
      return !clubSpot || Math.hypot(tr.x - clubSpot.x, tr.z - clubSpot.z) > 9.5;
    });
    if (treeSpots.length > 0) {
      if (theme === "alpine") {
        // Snow-frosted pines suit the alpine venue; other themes get summer greens.
        const pineTransforms = treeSpots.map((tr) => ({
          position: [tr.x, terrain.height(tr.x, tr.z) - 0.15, tr.z] as [number, number, number],
          rotation: [0, tr.yaw, 0] as [number, number, number],
          scale: [tr.h / 7.8, tr.h / 7.8, tr.h / 7.8] as [number, number, number]
        }));
        nodes.push(
          instances.model(assets.propPineTree, {
            name: "corridor-pines",
            transforms: pineTransforms,
            targetHeight: 7.8,
            castShadow: true
          })
        );
      } else {
        nodes.push(...buildConiferNodes(terrain, treeSpots, theme));
      }
    }
  }

  // --- Coastal / volcanic / lunar rock outcrops along rough ---
  const rockSpots: Vec2[] = [];
  for (const w of hole.layout.woods) rockSpots.push(...scatterInDisc(rng, w.center, w.radius * 0.75, 4, 0.25));
  if ((theme === "volcanic" || theme === "lunar" || theme === "dunes") && rockSpots.length) {
    const rockTransforms = rockSpots
      .slice(0, 14)
      .filter(([rx, rz]) => {
        const zKind = terrain.zone(rx, rz);
        return zKind !== "fairway" && zKind !== "green" && zKind !== "sand" && zKind !== "water";
      })
      .map(([rx, rz], i) => {
        const s = 0.85 + (i % 3) * 0.35;
        return {
          position: [rx, terrain.height(rx, rz) - 0.08, rz] as [number, number, number],
          rotation: [0, rng() * Math.PI * 2, 0] as [number, number, number],
          scale: [s, s, s] as [number, number, number]
        };
      });
    if (rockTransforms.length > 0) {
      nodes.push(
        instances.model(assets.propRockA, {
          name: "rough-rocks",
          transforms: rockTransforms,
          targetHeight: 1.35,
          castShadow: true
        })
      );
    }
  }

  // --- Landmark dressing per theme ---
  if (theme === "dunes") {
    const millX = midT[0] - fairHalf - 16;
    const millZ = midT[1] + 18;
    nodes.push(
      model(assets.siegeWindmillTowerMeshy, { name: "landmark-windmill", targetHeight: 12, role: "setDressing", scaleMode: "fit" })
        .position(millX, terrain.height(millX, millZ), millZ)
        .rotate(0, 0.55, 0)
    );
    if (clubSpot) nodes.push(...buildClubhouseNodes(course, hole, terrain, clubSpot.x, clubSpot.z));
    if (hole.layout.water.length) {
      const w = hole.layout.water[0]!;
      const brX = w.center[0] - w.radius * 0.8;
      const brZ = w.center[1];
      nodes.push(
        model(assets.siegeStoneBridgeMeshy, { name: "landmark-bridge", targetHeight: 2.1, role: "setDressing", scaleMode: "fit" })
          .position(brX, terrain.height(brX, brZ) + 0.14, brZ)
          .rotate(0, 0.2, 0)
      );
    }
  } else if (theme === "parkland") {
    if (clubSpot) nodes.push(...buildClubhouseNodes(course, hole, terrain, clubSpot.x, clubSpot.z));
  } else if (theme === "volcanic") {
    nodes.push(
      model(assets.skylineCrystalShardMeshy, { name: "landmark-shard", targetHeight: 14, role: "setDressing", scaleMode: "fit" })
        .position(terrain.bounds.maxX - 18, terrain.height(terrain.bounds.maxX - 18, midT[1]), midT[1])
        .rotate(0, 0.4, 0)
    );
  } else if (theme === "alpine") {
    nodes.push(
      model(assets.turboAlpineVenueBackdrop, { name: "landmark-alps", targetHeight: 60, role: "setDressing", scaleMode: "fit" })
        .position(cx + 60, 0, cz + 140)
        .rotate(0, Math.PI, 0)
    );
  } else if (theme === "nightCity") {
    const buildings = [assets.showcaseModernBuildingOne, assets.showcaseModernOfficeBuilding, assets.showcaseVoxelBuilding];
    buildings.forEach((b, i) => {
      const bx = terrain.bounds.minX + 30 + i * 46;
      nodes.push(
        model(b, { name: `landmark-tower-${i}`, targetHeight: 34 + i * 12, role: "setDressing", scaleMode: "fit" })
          .position(bx, 0, terrain.bounds.maxZ - 6)
          .rotate(0, Math.PI, 0)
      );
    });
    // floodlight pylons around the green
    for (const [lx, lz] of [[-18, -8], [18, -8], [-18, 18], [18, 18]] as const) {
      const x = cx + lx, z = cz + lz;
      nodes.push(
        model(assets.neonStreetLampProp, { name: `lamp-${lx}-${lz}`, targetHeight: 7.5, role: "setDressing", scaleMode: "fit" })
          .position(x, terrain.height(x, z), z),
        lights.spot({ name: `lamp-spot-${lx}-${lz}`, position: [x, terrain.height(x, z) + 7.2, z], target: [cx, terrain.cup[1], cz], angle: 0.7, penumbra: 0.6, intensity: 1.6, color: "#bfe8ff", distance: 70 })
      );
    }
  } else if (theme === "lunar") {
    nodes.push(
      model(assets.auroraHabitatDomeMeshy, { name: "landmark-dome", targetHeight: 12, role: "setDressing", scaleMode: "fit" })
        .position(terrain.bounds.maxX - 20, terrain.height(terrain.bounds.maxX - 20, midT[1]), midT[1])
        .rotate(0, -0.9, 0),
      model(assets.lunarRoverMeshy, { name: "landmark-rover", targetHeight: 2.4, role: "setDressing", scaleMode: "fit" })
        .position(tx + 12, terrain.height(tx + 12, tz + 8), tz + 8)
        .rotate(0, 0.5, 0)
        .runtime(game.runtimeNode("landmark-rover")),
      model(assets.gravityOrbitalRelayMeshy, { name: "landmark-relay", targetHeight: 9, role: "setDressing", scaleMode: "fit" })
        .position(terrain.bounds.minX + 16, terrain.height(terrain.bounds.minX + 16, cz + 30), cz + 30)
    );
  }

  // --- Gallery ropes near the green (two low rails oriented along Z beside the green) ---
  const railMat = material.pbr({ color: "#f0ede2", roughness: 0.55 });
  for (const side of [-1, 1] as const) {
    const rx = cx + side * (hole.layout.greenRadius + 3.2);
    nodes.push(
      primitives.box({ name: `gallery-rope-${side}`, size: [0.04, 0.04, hole.layout.greenRadius * 1.5], material: railMat })
        .position(rx, terrain.height(rx, cz) + 0.52, cz)
    );
    for (const sgn of [-0.75, 0.75]) {
      const pz = cz + sgn * hole.layout.greenRadius;
      nodes.push(
        primitives.cylinder({ name: `rope-post-${side}-${sgn}`, size: [0.035, 0.55, 0.035], material: railMat })
          .position(rx, terrain.height(rx, pz) + 0.27, pz)
      );
    }
  }

  // --- Green-side grandstands + instanced 3D Meshy gallery spectators ---
  for (const side of [-1, 1] as const) {
    const sx = cx + side * (hole.layout.greenRadius + 10.5);
    const sz = cz + 3.5;
    nodes.push(...buildBleacherNodes(cx, cz, sx, sz, terrain, course.palette, side < 0 ? "l" : "r"));
  }
  const fanTransforms = Array.from({ length: 6 }, (_, i) => {
    const a = ((i + 0.5) / 6) * Math.PI * 1.2 - Math.PI * 0.1 + (rng() - 0.5) * 0.12;
    const r = hole.layout.greenRadius + 3.6 + rng() * 1.4;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.abs(Math.sin(a)) * r * 0.85;
    return {
      position: [x, terrain.height(x, z), z] as [number, number, number],
      rotation: [0, Math.atan2(cx - x, cz - z), 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number]
    };
  });
  // The athlete GLB is skinned, and instances.model falls back on skinned actors (audit C19), so each
  // gallery fan is its own model node on a staggered idle loop.
  fanTransforms.forEach((f, i) => {
    nodes.push(
      model(assets.linksGolferAthleteMeshy, { name: `gallery-fan-${i}`, targetHeight: 1.8, role: "setDressing", scaleMode: "fit" })
        .position(f.position[0], f.position[1], f.position[2])
        .rotate(0, f.rotation[1], 0)
        .animate({ clip: "Idle_Loop", loop: true, speed: 0.8 + (i % 3) * 0.1 })
    );
  });

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
  const base = terrainToMeshSpec(terrain, 112, 96, -0.04);
  nodes.push(
    geometry.custom(base, { name: "terrain-rough", material: material.pbr({ color: pal.rough, roughness: 0.92 }) })
  );
  const outerY = Math.min(terrain.tee[1], terrain.cup[1]) - 6;
  nodes.push(
    primitives.plane({ name: "outer-ground", size: [terrain.bounds.maxX * 4, terrain.bounds.maxZ * 4, 1], material: material.pbr({ color: theme4(course) === "lunar" ? "#43454c" : theme4(course) === "volcanic" ? "#2e2a26" : pal.rough, roughness: 0.96 }) }).position(0, outerY, (terrain.bounds.minZ + terrain.bounds.maxZ) / 2)
  );

  // --- Fairway ribbon (first-cut collar + two mow stripes) ---
  const fairEdge = ribbonAlongPath(terrain, lay.path, lay.fairwayWidth / 2 + 1.7, 0.022);
  const fairA = ribbonAlongPath(terrain, lay.path, lay.fairwayWidth / 2, 0.035);
  const fairB = ribbonAlongPath(terrain, lay.path, lay.fairwayWidth / 2 - 3.2, 0.05);
  nodes.push(
    geometry.custom(fairEdge, { name: "fairway-first-cut", material: material.pbr({ color: shade(pal.fairway, 0.8), roughness: 0.9 }) }),
    geometry.custom(fairA, { name: "fairway-a", material: material.pbr({ color: pal.fairway, roughness: 0.84 }) }),
    geometry.custom(fairB, { name: "fairway-b", material: material.pbr({ color: shade(pal.fairway, 1.22), roughness: 0.82 }) })
  );

  // --- Green + collar + fringe ---
  const [gx, gz] = [terrain.cup[0], terrain.cup[2]];
  const collar = discOnTerrain(terrain, gx, gz, lay.greenRadius + 4.4, 0.045, 36, lay.greenRadius + 2.3);
  const green = discOnTerrain(terrain, gx, gz, lay.greenRadius, 0.065, 36);
  const fringe = discOnTerrain(terrain, gx, gz, lay.greenRadius + 2.5, 0.055, 36, lay.greenRadius * 0.96);
  nodes.push(
    geometry.custom(collar, { name: "green-collar", material: material.pbr({ color: shade(pal.fringe, 0.82), roughness: 0.88 }) }),
    geometry.custom(fringe, { name: "fringe", material: material.pbr({ color: pal.fringe, roughness: 0.85 }) }),
    geometry.custom(green, { name: "green", material: material.pbr({ color: pal.green, roughness: 0.74 }) })
  );

  // --- Tee box + surround + markers ---
  const teeMat = material.pbr({ color: pal.teeBox, roughness: 0.82 });
  const teeEdgeMat = material.pbr({ color: shade(pal.teeBox, 0.72), roughness: 0.92 });
  // low red tee blocks: 22 cm spheres (white, then red) read as a second, larger ball in the address and card frames
  const markMat = material.emissive({ color: "#c8402f", emissive: "#c8402f", emissiveIntensity: 0.25 });
  nodes.push(
    primitives.box({ name: "tee-surround", size: [9.3, 0.07, 7.3], material: teeEdgeMat }).position(terrain.tee[0], terrain.tee[1] - 0.025, terrain.tee[2]),
    primitives.box({ name: "tee-box", size: [8.4, 0.12, 6.4], material: teeMat }).position(terrain.tee[0], terrain.tee[1] - 0.03, terrain.tee[2]),
    primitives.box({ name: "tee-marker-l", size: [0.3, 0.1, 0.12], material: markMat }).position(terrain.tee[0] - 3.2, terrain.tee[1] + 0.05, terrain.tee[2]),
    primitives.box({ name: "tee-marker-r", size: [0.3, 0.1, 0.12], material: markMat }).position(terrain.tee[0] + 3.2, terrain.tee[1] + 0.05, terrain.tee[2])
  );

  // --- Bunkers (bright sand bowls + dark, crisp grass lip) ---
  lay.bunkers.forEach((b, i) => {
    const disc = discOnTerrain(terrain, b.center[0], b.center[1], b.radius, 0.09, 28);
    const lip = discOnTerrain(terrain, b.center[0], b.center[1], b.radius + 0.72, 0.075, 28, b.radius * 0.92);
    nodes.push(
      geometry.custom(lip, { name: `bunker-lip-${i}`, material: material.pbr({ color: shade(pal.sand, 0.64), roughness: 0.96 }) }),
      geometry.custom(disc, { name: `bunker-${i}`, material: material.pbr({ color: shade(pal.sand, 1.08), roughness: 0.84 }) })
    );
  });

  // --- Water (dark wet bank, shadow rim, then a reflective pond surface) ---
  lay.water.forEach((w, i) => {
    const { surfaceY: y, pondDiameter, rimDiameter } = pondGeometry(terrain, w);
    const bank = discOnTerrain(terrain, w.center[0], w.center[1], w.radius + 1.5, 0.02, 32, w.radius * 0.94);
    const waterMat = material.pbr({
      color: shade(pal.water, 1.22),
      roughness: 0.09,
      metalness: 0.38,
      emissive: pal.water,
      emissiveIntensity: isNight ? 0.42 : 0.1
    });
    nodes.push(
      geometry.custom(bank, { name: `pond-bank-${i}`, material: material.pbr({ color: shade(pal.rough, 0.55), roughness: 0.96 }) }),
      primitives.cylinder({ name: `pond-rim-${i}`, size: [rimDiameter, 0.05, rimDiameter], material: material.pbr({ color: shade(pal.water, 0.5), roughness: 0.34, metalness: 0.2 }) }).position(w.center[0], y - 0.03, w.center[1]),
      primitives.cylinder({ name: `pond-${i}`, size: [pondDiameter, 0.06, pondDiameter], material: waterMat }).position(w.center[0], y, w.center[1])
    );
  });

  // --- Flag + cup (linksPinFlagMeshy has minY = 0 grounded origin) ---
  nodes.push(
    model(assets.linksPinFlagMeshy, { name: "flagstick", targetHeight: 3.1 }).position(terrain.cup[0], terrain.cup[1], terrain.cup[2]).runtime(game.runtimeNode("flagstick")),
    primitives.cylinder({ name: "cup-dark", size: [CUP_R * 2, 0.06, CUP_R * 2], material: material.pbr({ color: "#05070a", roughness: 1 }) }).position(terrain.cup[0], terrain.cup[1] + 0.005, terrain.cup[2])
  );

  // --- Ball + trail + shadow + aim aids ---
  nodes.push(
    model(assets.siegeGolfBall, { name: "golf-ball", targetHeight: BALL_R * 2 }).runtime(game.runtimeNode("golf-ball")),
    primitives.cylinder({ name: "ball-shadow", size: [BALL_R * 2.4, 0.008, BALL_R * 2.4], material: material.pbr({ color: "#000000", opacity: 0.38, roughness: 1 }) }).runtime(game.runtimeNode("ball-shadow")),
    effects.trail({ name: "ball-ribbon-trail", target: "golf-ball", color: "#ffffff", width: 0.07, maxPoints: 44, intensity: 0.9 } as any),
    // ground ring that marks the ball when the camera is far from it (the ball itself is near real size)
    primitives.torus({ name: "ball-marker", size: [0.5, 0.025, 0.025], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.1, opacity: 0.8 }) }).scale(HIDDEN_SCALE).runtime(game.runtimeNode("ball-marker")),
    // Crisp white aim line + predicted landing ring (aim phase only)
    primitives.box({ name: "aim-line", size: [0.14, 0.03, 28], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.35, opacity: 0.88 }) }).runtime(game.runtimeNode("aim-line")),
    primitives.torus({ name: "landing-ring", size: [1.5, 0.06, 0.06], material: material.emissive({ color: "#63e2ff", emissive: "#63e2ff", emissiveIntensity: 1.25 }) }).runtime(game.runtimeNode("landing-ring")),
    // putt-aim helper
    primitives.torus({ name: "cup-pulse", size: [0.36, 0.035, 0.035], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.35 }) }).runtime(game.runtimeNode("cup-pulse"))
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

  // --- Course look (GU47 LINKS-01..04, 16): the course's own sun, key, environment, fills, practicals, atmosphere
  // and post from its look-table row (game/lighting.ts), built by game/lookRig.ts through art/engineCompat.ts.
  // `?look=original` restores the 4.6.2 rig (PRD §8 reversibility).
  if (lookMode === "original") return buildOriginalLookScene(course, terrain, nodes);
  const rig = buildCourseRig(course, hole, terrain, { tier: presentationTier, hdriMode });
  return scene()
    .add(rig.look)
    .addMany(nodes)
    .addMany(rig.nodes)
    .camera(holeOpeningCamera(terrain))
    .background(rig.background);
}

/** The hole's opening camera (the address cam takes over on the first frame). */
function holeOpeningCamera(terrain: HoleTerrain) {
  return camera.perspective({
    position: [terrain.tee[0] - 2.0, terrain.tee[1] + 5.8, terrain.tee[2] - 8.6],
    target: [terrain.tee[0] + Math.sin(terrain.lineYaw) * 40, terrain.tee[1] + 0.5, terrain.tee[2] + Math.cos(terrain.lineYaw) * 40],
    fov: 40
  });
}

/**
 * `?look=original`: the 4.6.2 light, atmosphere and post rig, byte for byte (PRD §8 reversibility): the shared look
 * preset with the course's 4.6.2 overrides, ambient + rim (+ hemisphere and floodlight at night), one gentle haze
 * node in the look's fog colour and the blanket vignette.
 */
function buildOriginalLookScene(course: CourseSpec, terrain: HoleTerrain, nodes: any[]): any {
  const isNight = course.look === "night-city" || course.look === "space";
  const fill = originalCourseFill(course);
  nodes.push(lights.ambient({ name: "course ambient fill", color: fill.ambient, intensity: fill.ambientI }));
  if (fill.hemiI > 0) {
    nodes.push(lights.hemisphere({ name: "course sky-ground fill", skyColor: fill.sky, groundColor: fill.ground, intensity: fill.hemiI, position: [0, 30, 0] }));
  }
  nodes.push(lights.directional({ name: "course rim fill", color: fill.rim, intensity: fill.rimI, position: fill.rimPos }));
  if (fill.flood) {
    nodes.push(lights.directional({ name: "course floodlight key", color: fill.flood.color, intensity: fill.flood.intensity, position: fill.flood.position }));
  }
  const lookV0 = looks.describe(course.look).v0;
  const lookBg = lookV0.background;
  nodes.push(
    effects.fog({ name: "course depth haze", color: lookV0.fog?.color ?? lookBg, density: isNight ? 0.0016 : 0.003, intensity: isNight ? 0.16 : 0.22 }),
    effects.contactShadows({ intensity: contactShadowIntensity(course), length: 0.32, steps: 12, lights: "sun" }),
    effects.vignette({ name: "course vignette", intensity: 0.15, smoothness: 0.72, roundness: 0.92, color: "#061019" })
  );
  const lookOpts = { exposureEv: -0.06, ...(course.lookOverrides ?? {}), fogDensityScale: 0 };
  return scene()
    .add(looks.preset(course.look, lookOpts))
    .addMany(nodes)
    .camera(holeOpeningCamera(terrain))
    .background(lookBg);
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
let mountedHoleSig: string | undefined;
let golferRig: ReturnType<typeof resolveGolferRig> | null = null;
let ballHandle: any = null;
let ballShadowHandle: any = null;
let aimLineHandle: any = null;
let landingRingHandle: any = null;
let cupPulseHandle: any = null;
let ballMarkerHandle: any = null;
let flagRotation: [number, number, number] = [0, 0, 0];
let flagstickHandle: any = null;
let trailHandles: any[] = [];
let readArrowHandles: any[] = [];
let rangeRingHandles: any[] = [];
const tryReq = (id: string) => { try { return (auraApp as any)?.nodes?.require(id); } catch { return null; } };

/** true while frame() runs inside the engine's onFrame callback (scene swaps are deferred until it returns) */
let inEngineFrame = false;
/** ?qa=1 hold: game logic advances only through the QA hook */
let qaHold = false;
let pendingHoleScene: unknown = null;
function flushPendingHoleScene(): void {
  const next = pendingHoleScene;
  if (!next) return;
  pendingHoleScene = null;
  (auraApp as any)?.setScene(next);
  resolveHoleHandles();
}

function resolveHoleHandles(): void {
  const req = (id: string) => (auraApp as any).nodes.require(id);
  golferRig = resolveGolferRig(auraApp);
  ballHandle = req("golf-ball");
  ballShadowHandle = req("ball-shadow");
  aimLineHandle = req("aim-line");
  landingRingHandle = req("landing-ring");
  cupPulseHandle = req("cup-pulse");
  ballMarkerHandle = tryReq("ball-marker");
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
  const rec = eventLog.push({ type, label, severity, value, time: nowMs() / 1000, frame: framesRendered });
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
  bannerTimer = nowMs() + ms;
}

let msgTimer = 0;
function showMsg(big: string, small = "", ms = 2200): void {
  const m = $("msg");
  if (!m) return;
  const bt = $("msg-text"), st = $("msg-sub");
  if (bt) bt.textContent = big;
  if (st) st.textContent = small;
  m.classList.add("show");
  msgTimer = nowMs() + ms;
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
  // once the round is over the card is final (the last hole is already recorded)
  const over = state.phase === "roundover";
  const tp = state.card ? state.card.toPar + (over ? 0 : Math.max(0, r.strokes - hole.par)) : 0;
  const el = $("h-topar")!;
  el.textContent = tp === 0 ? "E" : tp > 0 ? `+${tp}` : `${tp}`;
  el.classList.toggle("good", tp <= 0);
  el.classList.toggle("bad", tp > 0);
  $("h-thru")!.textContent = over ? "FINAL" : `THRU ${r.holeIndex}`;
  // wind
  const arrow = $("h-wind-arrow");
  if (arrow) arrow.style.transform = `rotate(${(state.wind.yaw * 180) / Math.PI + 90}deg)`;
  $("h-wind-speed")!.textContent = state.wind.speed.toFixed(1);
  // club + lie
  const clubId = CLUB_ORDER[r.clubIdx]!;
  $("h-club")!.textContent = clubId === "putter" ? `PUTTER ${puttRange(dist)}M` : clubId.toUpperCase();
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

const cam = {
  mode: "menu" as CamMode,
  eye: [-2.0, 7.2, -8.2] as Vec3,
  target: [1.7, 1.4, 42] as Vec3,
  fov: 40,
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
  if (qaPondView) {
    // ?qa=1 pond check: straight down over the hazard, the zone radius filling about 70% of the frame height
    const p = qaPondView;
    cam.eye = [p.x + 0.01, p.y + p.r * 3.4, p.z - 0.01];
    cam.target = [p.x, p.y, p.z];
    cam.fov = 40;
    camApply();
    return;
  }
  if (!t || !r) {
    // menu orbit around the cup/tee midpoint (held still under reduced motion)
    if (!state.reducedMotion) cam.orbit += dt * 0.14;
    const cc = t ? t.cup : [0, 0, 30] as unknown as Vec3;
    cam.eye = [cc[0] + Math.sin(cam.orbit) * 26, cc[1] + 11, cc[2] + Math.cos(cam.orbit) * 26];
    cam.target = [cc[0], cc[1] + 0.5, cc[2]];
    cam.fov = 34;
    camApply();
    return;
  }

  const ball = state.ball;
  const inFlight = state.phase === "flight" && ball && (ball.status === "flight" || ball.status === "roll");

  // portrait viewports have a much narrower horizontal fov — pull the lateral
  // offset in so the golfer/ball stay framed instead of sliding off-screen
  const aspect = (window.innerWidth || 16) / (window.innerHeight || 9);
  const side = clamp(aspect / 1.6, 0.3, 1);
  // 0 on landscape and square windows, 1 on a phone held upright: the horizontal fov is only ~20 degrees there, so the
  // camera comes nearly onto the shot line, steps back and opens the fov until the golfer beside the ball and the club fit.
  const portrait = clamp((1.15 - aspect) / 0.6, 0, 1);

  // Keep the golfer AND the ball framed through the strike: for the first
  // moments after impact the swing-cam still holds (the viewer sees the
  // clubhead hit the ball), then the chase cam takes over.
  const strikeHold = state.phase === "flight" && inFlight && simTime - impactAt < 0.55;

  const mode = cameraModeFor({ phase: state.phase, ballMoving: Boolean(inFlight), strikeHold: Boolean(strikeHold), lie: r.lie });
  if (mode === "flight" && ball) {
    cam.mode = "flight";
    // chase cam: behind the ball along its velocity, ahead low
    const v = ball.vel;
    const hv = Math.hypot(v[0], v[2]);
    const back = hv > 0.5 ? [v[0] / hv, v[2] / hv] : [Math.sin(aimYaw()), Math.cos(aimYaw())];
    const distBack = ball.status === "roll" ? 7 : 13;
    cam.eye = [
      ball.pos[0] - back[0] * distBack,
      ball.pos[1] + (ball.status === "roll" ? 3.4 : 6.5),
      ball.pos[2] - back[1] * distBack
    ];
    cam.target = [ball.pos[0] + back[0] * 8, Math.max(t.height(ball.pos[0], ball.pos[2]) + 0.4, ball.pos[1] * 0.55), ball.pos[2] + back[1] * 8];
    cam.fov = ball.status === "roll" ? 38 : 34;
  } else if (mode === "celebrate") {
    cam.mode = "celebrate";
    if (!state.reducedMotion) cam.orbit += dt * 0.42;
    cam.eye = [t.cup[0] + Math.sin(cam.orbit) * 9.5, t.cup[1] + 2.4, t.cup[2] + Math.cos(cam.orbit) * 9.5];
    cam.target = [t.cup[0], t.cup[1] + 1.0, t.cup[2]];
    cam.fov = 30;
  } else if (mode === "green") {
    cam.mode = "green";
    // low read cam behind ball→cup line
    const dx = t.cup[0] - r.ballPos[0], dz = t.cup[2] - r.ballPos[2];
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    const back = 4.2 + d * 0.16;
    cam.eye = [r.ballPos[0] - ux * back, t.height(r.ballPos[0] - ux * back, r.ballPos[2] - uz * back) + 1.35 + d * 0.05, r.ballPos[2] - uz * back];
    cam.target = [t.cup[0], t.cup[1] + 0.15, t.cup[2]];
    cam.fov = 34;
  } else if (mode === "address") {
    cam.mode = "address";
    const yaw = aimYaw();
    const bx = r.ballPos[0], bz = r.ballPos[2];
    // Low 3/4 view that keeps the full stance, club and swing arc in frame —
    // and through the strike the ball leaving the tee.
    const tx2 = bx + Math.sin(yaw) * 2.8, tz2 = bz + Math.cos(yaw) * 2.8;
    const addrBack = 4.4 + 1.9 * portrait, addrSide = 2.5 * side * (1 - 0.9 * portrait);
    const ex = bx - Math.sin(yaw) * addrBack - Math.cos(yaw) * addrSide;
    const ez = bz - Math.cos(yaw) * addrBack + Math.sin(yaw) * addrSide;
    cam.eye = lerp3(cam.eye, [ex, t.height(ex, ez) + 2.3, ez], 1 - Math.pow(0.001, dt));
    cam.target = lerp3(cam.target, [tx2, t.height(tx2, tz2) + 1.0, tz2], 1 - Math.pow(0.001, dt));
    cam.fov = lerp(cam.fov, 42 + 16 * portrait, 1 - Math.pow(0.02, dt));
  } else {
    cam.mode = "aim";
    const yaw = aimYaw();
    const bx = r.ballPos[0], bz = r.ballPos[2];
    // Over-the-shoulder aim cam — W/S dollies between behind-golfer and overview,
    // low enough that the 1.84 m golfer and club never fall below the frame.
    const back = 5.4 * cam.zoom + 1.9 * portrait;
    const h = 1.2 * cam.zoom + 1.0;
    const aimSide = 2.7 * side * (1 - 0.9 * portrait);
    const ex = bx - Math.sin(yaw) * back - Math.cos(yaw) * aimSide;
    const ez = bz - Math.cos(yaw) * back + Math.sin(yaw) * aimSide;
    const lookAhead = 34 * cam.zoom;
    const tx2 = bx + Math.sin(yaw) * lookAhead, tz2 = bz + Math.cos(yaw) * lookAhead;
    cam.eye = lerp3(cam.eye, [ex, t.height(ex, ez) + h, ez], 1 - Math.pow(0.002, dt));
    // aimed below the fairway so the ball sits in the lower third with the golfer instead of on the bottom edge
    // (it projected to y 710 of 720 at 1280x720 with a +0.9 m target, remote run g10f-links-figures-neonBay)
    cam.target = lerp3(cam.target, [tx2, t.height(tx2, tz2) - 2.2, tz2], 1 - Math.pow(0.002, dt));
    cam.fov = lerp(cam.fov, (cam.zoom > 1.5 ? 46 : 42) + 16 * portrait, 0.08);
  }
  camApply();
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/* ------------------------------------------------------------------ *
 *  Visual swing drive — the REAL swing timeline                        *
 *                                                                     *
 *  The three-click meter only sets shot parameters. The animation is  *
 *  its own timeline: takeaway → full backswing → committed pause at   *
 *  the top → accelerating downswing → IMPACT (ball launches exactly   *
 *  then — the clubhead is ON the ball at the bottom of the arc) →     *
 *  full follow-through → hold the finish watching the shot.           *
 * ------------------------------------------------------------------ */

const SWING_TIMING = {
  backswingS: 0.92,  // takeaway + full backswing to the top
  topHoldMinS: 0.14, // committed pause at the top before the release
  topHoldMaxS: 2.6,  // auto-release if the meter never commits
  downswingS: 0.30,  // accelerating strike — impact at the END of this
  followS: 0.55,     // full wrap: hands finish high over the lead shoulder
  settleS: 0.45,     // relax toward address after holding the finish
  puttBackS: 0.5,
  puttDownS: 0.28,
  puttFollowS: 0.4
} as const;

type DrivePhase = "idle" | "backswing" | "top" | "downswing" | "follow" | "settle";
const swingDrive = {
  phase: "idle" as DrivePhase,
  t: 0, // seconds inside the current phase
  putt: false,
  committed: false,
  impactFired: true,
  topHold: 0
};
let pendingCommit: import("./game/types").ShotCommit | null = null;
/** simTime of the last ball strike (camera keeps the golfer framed past it) */
let impactAt = -10;

/** club-head radius added to the ball radius for the swept strike test (m) */
const CLUB_HEAD_REACH_R = 0.04;
/** fallback: if the head never touched the ball this long after the downswing, strike anyway so the shot cannot soft-lock */
const CONTACT_FALLBACK_S = 0.06;
let prevClubHead: Vec3 | null = null;
let lastContact: (ClubContact & { fallback: boolean; simTime: number }) | null = null;

/** The strike is decided by the club head's swept path against the ball, not by a timer. */
function checkClubContact(dt: number, shotYaw: number): void {
  const driving = swingDrive.phase === "downswing" || swingDrive.phase === "follow";
  const head = golferTelemetry().clubHeadWorld as Vec3;
  if (!driving || swingDrive.impactFired || !golferRig) {
    prevClubHead = driving ? head : null;
    return;
  }
  const ball = golferTelemetry().ballWorld as Vec3;
  const hit = prevClubHead
    ? sweptClubContact(prevClubHead, head, ball, BALL_R + CLUB_HEAD_REACH_R, dt, shotYaw)
    : null;
  prevClubHead = head;
  if (!hit) return;
  swingDrive.impactFired = true;
  impactAt = simTime;
  lastContact = { ...hit, fallback: false, simTime };
  fireImpact();
}

/** drive → (pose phase, normalized t) for poseGolfer */
function drivePose(): [GolferPhase, number] {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  if (swingDrive.putt) {
    switch (swingDrive.phase) {
      case "backswing": return ["putt-back", clamp01(swingDrive.t / SWING_TIMING.puttBackS)];
      case "top": return ["putt-address", 0];
      // the putter strikes the ball at u=0.5 (the KP_IMPACT key) — the
      // downswing phase ends exactly there, follow finishes the stroke
      case "downswing": return ["putt-through", 0.5 * clamp01(swingDrive.t / SWING_TIMING.puttDownS)];
      case "follow": return ["putt-through", 0.5 + 0.5 * clamp01(swingDrive.t / SWING_TIMING.puttFollowS)];
      case "settle": return ["putt-through", 1];
      default: return ["putt-address", 0];
    }
  }
  switch (swingDrive.phase) {
    case "backswing": return ["backswing", clamp01(swingDrive.t / SWING_TIMING.backswingS)];
    case "top": return ["top", 0];
    case "downswing": return ["downswing", clamp01(swingDrive.t / SWING_TIMING.downswingS)];
    case "follow": return ["follow", clamp01(swingDrive.t / SWING_TIMING.followS)];
    case "settle": return ["follow", 1]; // hold the finish while the ball flies
    default: return ["address", 0];
  }
}

function advanceSwingDrive(dt: number): void {
  // the follow-through/settle keep animating while the ball is in flight
  if (state.phase !== "swing" && !(state.phase === "flight" && swingDrive.phase !== "idle")) return;
  swingDrive.t += dt;
  for (let guard = 0; guard < 4; guard++) {
    switch (swingDrive.phase) {
      case "backswing": {
        const dur = swingDrive.putt ? SWING_TIMING.puttBackS : SWING_TIMING.backswingS;
        if (swingDrive.t >= dur) {
          swingDrive.phase = "top";
          swingDrive.t = 0;
          swingDrive.topHold = 0;
          continue;
        }
        return;
      }
      case "top": {
        swingDrive.topHold += dt;
        const ready = swingDrive.committed && swingDrive.topHold >= SWING_TIMING.topHoldMinS;
        const overdue = swingDrive.topHold >= SWING_TIMING.topHoldMaxS;
        if (ready || overdue) {
          if (!swingDrive.committed) {
            // meter never committed — auto-commit a mid shot so the swing completes
            commitSwing();
          }
          swingDrive.phase = "downswing";
          swingDrive.t = 0;
          continue;
        }
        return;
      }
      case "downswing": {
        const dur = swingDrive.putt ? SWING_TIMING.puttDownS : SWING_TIMING.downswingS;
        if (swingDrive.t >= dur) {
          // the head is at the ball now; `checkClubContact` fires the strike from the swept path
          swingDrive.phase = "follow";
          swingDrive.t = 0;
          continue;
        }
        return;
      }
      case "follow": {
        if (!swingDrive.impactFired && swingDrive.t >= CONTACT_FALLBACK_S) {
          swingDrive.impactFired = true;
          impactAt = simTime;
          lastContact = {
            u: 1, point: golferTelemetry().clubHeadWorld as Vec3, pathDir: [0, 0, 1], speed: 0,
            pathYawDeg: 0, offsetM: golferTelemetry().impactDistance ?? 0, fallback: true, simTime
          };
          fireImpact();
        }
        const dur = swingDrive.putt ? SWING_TIMING.puttFollowS : SWING_TIMING.followS;
        if (swingDrive.t >= dur) {
          swingDrive.phase = "settle";
          swingDrive.t = 0;
          continue;
        }
        return;
      }
      case "settle": {
        if (swingDrive.t >= SWING_TIMING.settleS) {
          swingDrive.phase = "idle";
          swingDrive.t = 0;
        }
        return;
      }
      default:
        return;
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Shot lifecycle                                                     *
 * ------------------------------------------------------------------ */

function currentClub() {
  return CLUBS[CLUB_ORDER[state.round!.clubIdx]!]!;
}

function aimYaw(): number {
  return (state.round?.aimBase ?? state.terrain?.lineYaw ?? 0) + (state.round?.aimOffset ?? 0);
}

function pinYaw(): number {
  const r = state.round!;
  return yawToward([r.ballPos[0], r.ballPos[2]], [state.terrain!.cup[0], state.terrain!.cup[2]]);
}

function updatePinIndicator(): void {
  const r = state.round;
  const t = state.terrain;
  if (!r || !t) return;
  const arrow = $("h-pin-arrow");
  if (arrow) arrow.style.transform = `rotate(${pinArrowDegrees(aimYaw(), pinYaw()).toFixed(1)}deg)`;
  const dist = $("h-pin-dist");
  if (dist) dist.textContent = `${t.cupDistance(r.ballPos[0], r.ballPos[2]).toFixed(0)}M`;
}

function beginAddress(): void {
  const r = state.round!;
  const t = state.terrain!;
  r.lie = r.strokes === 0 ? "tee" : t.zone(r.ballPos[0], r.ballPos[2]);
  if (r.lie === "water" || r.lie === "oob") r.lie = "rough";
  r.clubIdx = CLUB_ORDER.indexOf(suggestClub(r.lie, t.cupDistance(r.ballPos[0], r.ballPos[2])));
  r.aimBase = defaultAimYaw({
    ball: [r.ballPos[0], r.ballPos[2]],
    cup: [t.cup[0], t.cup[2]],
    lineYaw: t.lineYaw,
    onTee: r.strokes === 0
  });
  r.aimOffset = 0;
  state.phase = "address";
  state.swing.reset();
  swingDrive.phase = "idle";
  swingDrive.t = 0;
  swingDrive.impactFired = true;
  swingDrive.committed = false;
  pendingCommit = null;
  heroCelebrate = false;
  autoPlan = null;
  cam.mode = "aim";
  setPrompt("SPACE — SWING · A/D AIM (SHIFT FINE) · P PIN · Q/E CLUB");
  $("swing-meter")?.classList.remove("show");
  updateCardHud();
  if (golferRig) {
    const g = golferAt();
    poseGolfer(golferRig, "address", 0, g.pos, g.yaw, (x, z) => t.height(x, z));
  }
  ballHandle?.setPosition(r.ballPos[0], Math.max(r.ballPos[1] - BALL_R, t.height(r.ballPos[0], r.ballPos[2]) - 0.01), r.ballPos[2]);
  updateCamera(0);
}

function startSwing(): void {
  state.phase = "swing";
  // the difficulty sets the pure strip of the accuracy needle (amateur wide, legend narrow)
  state.swing.setDeadZone(pureStrip(state.difficulty));
  state.swing.press(); // idle → power
  swingDrive.phase = "backswing";
  swingDrive.t = 0;
  swingDrive.putt = currentClub().putter === true;
  swingDrive.committed = false;
  swingDrive.impactFired = false;
  swingDrive.topHold = 0;
  pendingCommit = null;
  $("swing-meter")?.classList.add("show");
  $("sw-label")!.textContent = "SPACE — SET POWER";
  setPrompt(null);
}

/**
 * The meter finished — lock the shot parameters. The ball does NOT launch
 * yet: the downswing is still in flight and launchBall fires from the
 * impact event (fireImpact), when the clubhead reaches the ball.
 */
function commitSwing(): void {
  const r = state.round!;
  if (swingDrive.committed) return;
  const s = state.swing.state();
  const club = shotClub();
  // The player's presses decide the shot. The demo autopilot (?autoplay=1) plays its planned shot exactly.
  const plan = autopilot ? autoPlan : null;
  pendingCommit = plan
    ? { club, power: plan.power, accuracy: 0, spin: 0, aimYaw: aimYaw() }
    : {
        club,
        power: s.power ?? 0.8,
        accuracy: s.accuracy ?? 0.5,
        spin: s.spin ?? 0,
        aimYaw: aimYaw()
      };
  commitStroke(r, swingDrive, !!club.putter);
  updateCardHud();
}

/**
 * IMPACT — the clubhead strikes the ball at the bottom of the swing arc.
 * Called from advanceSwingDrive at the instant the downswing completes (the
 * swing solve puts the clubhead exactly on the ball at that frame); the ball
 * leaves the tee now, not before and not on a timer.
 */
function fireImpact(): void {
  const r = state.round!;
  const t = state.terrain!;
  if (!pendingCommit) return;
  const commit = pendingCommit;
  pendingCommit = null;
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
  state.phase = "flight";
  $("swing-meter")?.classList.remove("show");
  const qual = Math.abs(commit.accuracy);
  pushEvent("shot", `${clubLabel(commit.club.id)} · ${(commit.power * 100) | 0}% · ${contactLabel(qual)} · ${shapeLabel(commit.spin)}`, qual < 0.3 ? "success" : "warning");
  juiceFire("hit", { position: r.ballPos });
  void audio?.cue(commit.club.putter ? "putt" : "drive");
  updateCardHud();
}

function clubLabel(id: import("./game/types").ClubId): string {
  return CLUBS[id]?.label ?? id;
}

/** contact quality from the needle: 0 inside the pure strip */
function contactLabel(accuracy: number): string {
  return accuracy === 0 ? "PURE" : accuracy < 0.3 ? "GOOD" : "OFF";
}

/** ball flight shape from the spin: zero spin flies straight */
function shapeLabel(spin: number): string {
  return spin < -0.25 ? "DRAW" : spin > 0.25 ? "FADE" : "STRAIGHT";
}

/** accuracy-needle pure strip half-width for the difficulty, in needle units (the meter bar draws it as DIFF_GREEN_ZONE of the bar each side) */
function pureStrip(d: DifficultyId): number {
  return DIFF_GREEN_ZONE[d] * 2;
}

/** the club the next shot launches with: the putter range scales to the putt */
function shotClub() {
  const r = state.round!;
  const t = state.terrain!;
  return clubForShot(CLUB_ORDER[r.clubIdx]!, t.cupDistance(r.ballPos[0], r.ballPos[2]));
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
    // a putt that stops out of the cup is a miss: count the attempt, reset the streak, move to the next spot
    state.lab = scorePuttingLab(state.lab!, false);
    pushEvent("lab", `putt misses — ${state.lab.hits}/${state.lab.attempts}, streak 0`, "info");
    updateModeChips();
    nextPuttingSpot();
    return;
  }
  if (zone === "water" || zone === "oob") return; // handled by events
  if (pickUpIfOver()) return;
  // carry plus roll readout (audit C19)
  const shot = Math.hypot(pos[0] - r.prevPos[0], pos[2] - r.prevPos[2]);
  const air = Math.min(shot, state.ball?.carry ?? shot);
  pushEvent("lie", `lie: ${zone} · ${air.toFixed(0)}m carry + ${(shot - air).toFixed(0)}m roll · ${state.terrain!.cupDistance(pos[0], pos[2]).toFixed(0)}m out`, "info");
  state.phase = "between";
  betweenUntil = nowMs() + 850;
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
  heroCelebrate = true;
  if (state.mode === "puttinglab") {
    state.lab = scorePuttingLab(state.lab!, true);
    pushEvent("lab", `putt drops — streak ${state.lab.streak}`, "success");
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
  betweenUntil = nowMs() + 2400;
}

/**
 * Pickup at par+5 (audit C1): once the strokes reach par+5 without holing
 * out, the hole is scored par+5 and play moves to the next hole.
 */
function pickUpIfOver(): boolean {
  const r = state.round!;
  if (state.lab || !shouldPickUp(r.strokes, state.hole.par)) return false;
  const score = pickupScore(state.hole.par);
  r.strokes = score;
  state.ball = null;
  trailPts.length = 0;
  pushEvent("score", `picked up on ${state.hole.number} — scored ${score} (par ${state.hole.par} + ${score - state.hole.par})`, "warning");
  state.card = recordHole(state.card ?? createScoreCard(state.course), state.hole, score, r.putts);
  showBanner("PICKED UP");
  if (state.mode === "skins") resolveSkin();
  state.phase = "card";
  betweenUntil = nowMs() + 2400;
  updateCardHud();
  return true;
}

function applyPenaltyDrop(fromPos: Vec3): void {
  const r = state.round!;
  r.strokes += 1;
  // drop back at the previous lie position
  r.ballPos = [...r.prevPos] as Vec3;
  state.ball = null;
  trailPts.length = 0;
  if (pickUpIfOver()) return;
  state.phase = "between";
  betweenUntil = nowMs() + 1100;
  updateCardHud();
}

function reteeAfter(ms: number): void {
  state.phase = "between";
  betweenUntil = nowMs() + ms;
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
  betweenUntil = nowMs() + 700;
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
  // carry is the air distance; total adds the roll to where the ball stopped (audit C17)
  const total = Math.hypot(pos[0] - t.tee[0], pos[2] - t.tee[2]);
  const carry = state.ball?.carry ?? total;
  const dist = `${carry.toFixed(0)}m carry · ${total.toFixed(0)}m total`;
  if (best < 8) {
    l = { ...l, hits: l.hits + 1, streak: l.streak + 1, best: Math.max(l.best, l.streak + 1) };
    pushEvent("lab", `on the ring — ${dist}`, "success");
    void audio?.cue("parChime");
  } else {
    l = { ...l, streak: 0 };
    pushEvent("lab", `${dist} — off the rings by ${best.toFixed(0)}m`, "info");
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
  hideFinalCard();
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
    aimBase: t.lineYaw,
    aimOffset: 0,
    skinsPot: state.round?.skinsPot ?? 0,
    skinsWon: state.round?.skinsWon ?? 0
  };
  state.wind = rollWind(state.course, state.rng);
  state.ball = null;
  state.commit = null;
  trailPts.length = 0;
  // rebuild the scene for this hole — but setScene disposes the render device
  // and remounts, which on some GPU stacks leaves the canvas dead (see the
  // iron-crown/pips-big-leap remount fix). The boot scene already mounts hole 1,
  // so skip the identical re-mount.
  const sig = `${state.course.id}|${hole.number}|${state.lab ? "lab" : "round"}`;
  if (sig !== mountedHoleSig) {
    mountedHoleSig = sig;
    const next = buildHoleScene(state.course, hole, t, state.lab);
    // setScene disposes the mounted scene's GPU resources. Called from inside the engine's frame callback, the
    // rest of that frame then draws disposed materials ("Material a3d-production-sdf-text-label is disposed"),
    // so the swap waits until the frame has been submitted.
    if (inEngineFrame) pendingHoleScene = next;
    else (auraApp as any)?.setScene(next);
  }
  resolveHoleHandles();
  cam.t = 0;
  cam.zoom = 1;
  const initEx = t.tee[0] - Math.sin(t.lineYaw) * 8.2 - Math.cos(t.lineYaw) * 2.0;
  const initEz = t.tee[2] - Math.cos(t.lineYaw) * 8.2 + Math.sin(t.lineYaw) * 2.0;
  const initTx = t.tee[0] + Math.sin(t.lineYaw) * 42;
  const initTz = t.tee[2] + Math.cos(t.lineYaw) * 42;
  cam.eye = [initEx, t.height(initEx, initEz) + 5.3, initEz];
  cam.target = [initTx, t.height(initTx, initTz) - 2.4, initTz];
  cam.fov = 40;
  if (framesRendered > 0 || idx > 0) {
    showMsg(`HOLE ${hole.number} — ${hole.name.toUpperCase()}`, `PAR ${hole.par} · ${hole.lengthM}M`, 2100);
  }
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

/** closing scorecard (audit C19): hole-by-hole strokes against par, totals, and the skins result in Skins mode */
function renderFinalCard(title: string, foot: string): void {
  const card = state.card;
  const box = $("final-card");
  if (!card || !box) return;
  const holes = card.holes;
  const cells = (pick: (h: (typeof holes)[number]) => string, cls?: (h: (typeof holes)[number]) => string) =>
    holes.map((h) => `<td${cls ? ` class="${cls(h)}"` : ""}>${pick(h)}</td>`).join("");
  const tp = card.toPar === 0 ? "E" : card.toPar > 0 ? `+${card.toPar}` : `${card.toPar}`;
  $("fc-title")!.textContent = title;
  $("fc-table")!.innerHTML =
    `<tr><th>HOLE</th>${holes.map((h) => `<th>${h.hole}</th>`).join("")}<th>TOT</th></tr>` +
    `<tr><td>PAR</td>${cells((h) => String(h.par))}<td>${card.totalPar}</td></tr>` +
    `<tr><td>YOU</td>${cells((h) => String(h.strokes), (h) => (h.strokes < h.par ? "under" : h.strokes > h.par ? "over" : ""))}<td>${card.totalStrokes}</td></tr>`;
  $("fc-foot")!.textContent = `${state.course.name.toUpperCase()} · ${tp} · ${foot}`;
  box.classList.add("show");
}

function hideFinalCard(): void {
  $("final-card")?.classList.remove("show");
}

function finishRound(): void {
  state.phase = "roundover";
  updateCardHud();
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
    renderFinalCard(`PRO CIRCUIT · ${t.playerAlive ? (t.round === "champion" ? "CHAMPION" : t.round.toUpperCase()) : "CUT"}`, t.playerAlive && t.round !== "champion" ? "MENU — NEXT ROUND" : "MENU — NEW CIRCUIT");
    const r = state.round!;
    // a pot still carried after hole 9 is shown, not silently dropped (audit C19)
    const pot = r.skinsPot > 0 ? ` · ${r.skinsPot} carried, unclaimed` : "";
    showMsg("SKINS MATCH OVER", `${r.skinsWon} of 9 skins won${pot} · ${toPar >= 0 ? "+" : ""}${toPar}`, 4000);
    renderFinalCard("SKINS MATCH OVER", `SKINS WON ${r.skinsWon} OF 9${r.skinsPot > 0 ? ` · ${r.skinsPot} UNCLAIMED` : ""}`);
    pushEvent("skins", `match over — ${r.skinsWon} skins won${pot}`, "info");
  } else {
    showMsg("ROUND COMPLETE", `${card.totalStrokes} strokes · ${toPar >= 0 ? "+" : ""}${toPar} vs par ${card.totalPar}`, 4200);
    renderFinalCard("ROUND COMPLETE", `${card.totalStrokes} STROKES · MENU FOR A NEW ROUND`);
    pushEvent("round", `round complete: ${toPar >= 0 ? "+" : ""}${toPar}`, toPar <= 0 ? "success" : "info");
    if (toPar < 0) void audio?.cue("win");
  }
  setPrompt("MENU — NEW ROUND");
}

/* ------------------------------------------------------------------ *
 *  Modes                                                              *
 * ------------------------------------------------------------------ */

function setMode(mode: GameModeId | "skins"): void {
  // a Pro Circuit in progress survives a trip to the menu; a new one starts only when none is running
  const keepTour = mode === "tour" && !tourFinished(state.tour) ? state.tour : null;
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
    state.tour = keepTour ?? createTour(0x4a32);
    if (!keepTour) state.tourHoleStart = 0;
    // each round of the circuit is played on its own course (r32 St Auroras … final Mare)
    selectCourse(tourCourseFor(state.tour.round), false);
    renderBracket();
    startRound();
  } else {
    startRound();
  }
  updateModeChips();
}

/**
 * After a round: in a live Pro Circuit, play the next round on its course;
 * otherwise (finished circuit, other modes) start a fresh round.
 */
function continueAfterRound(): void {
  if (state.mode === "tour" && !tourFinished(state.tour)) setMode("tour");
  else if (state.mode === "tour") { state.tour = null; setMode("tour"); }
  else setMode(state.mode === "menu" ? "quick" : state.mode);
}

/** highlight the current course in the top bar and the menu (also on boot, so ?course= is reflected) */
function syncCourseButtons(): void {
  const id = state.courseId;
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-course]"))) {
    b.classList.toggle("active", b.dataset.course === id);
    b.setAttribute("aria-pressed", String(b.dataset.course === id));
  }
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-course-menu]"))) {
    b.classList.toggle("active", b.dataset.courseMenu === id);
  }
}

function selectCourse(id: CourseId, restart = true): void {
  if (!COURSES[id]) return;
  state.courseId = id;
  state.course = COURSES[id]!;
  syncCourseButtons();
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

let heroCelebrate = false;
/** the demo autopilot's planned shot for the current stroke */
let autoPlan: ShotPlan | null = null;
let simTime = 0;
let lastManualInputAt = -10;
let addressEnteredAt = 0;
let roundOverEnteredAt = 0;
let lastObservedPhase = "";
const bootUrlParams = new URLSearchParams(window.location.search);
const isStillMode = bootUrlParams.has("still");
let autopilot = bootUrlParams.get("autoplay") === "1" || bootUrlParams.get("demo") === "1";
let appReady = false;
const pressedKeys = new Set<string>();
let aimHeldFor = 0;
let aimHeldDir = 0;
const justPressed = new Set<string>();

function golferAt(): { pos: Vec3; yaw: number } {
  // rig local frame: origin = ball, +Z = shot direction — pass the lie, not a golfer offset
  const r = state.round!;
  const t = state.terrain!;
  const bp = r.ballPos;
  return { pos: [bp[0], t.height(bp[0], bp[2]), bp[2]], yaw: aimYaw() };
}

function frame(dt: number): void {
  if (!appReady) return;
  framesRendered += 1;
  simTime += dt;
  if (framesRendered === 1) diagLog("[links] first frame tick", dt);
  const now = nowMs();
  const r = state.round;
  const t = state.terrain;

  if (state.phase !== lastObservedPhase) {
    lastObservedPhase = state.phase;
    if (state.phase === "address") {
      addressEnteredAt = simTime;
    } else if (state.phase === "roundover") {
      roundOverEnteredAt = simTime;
    }
  }

  if (bannerTimer && now > bannerTimer) { $("banner")?.classList.remove("show"); bannerTimer = 0; }
  if (msgTimer && now > msgTimer) { $("msg")?.classList.remove("show"); msgTimer = 0; }

  // --- input edges ---
  if (state.phase !== "menu") {
    if (justPressed.has("Escape") && menuCanOpen(state.phase)) {
      openMenu();
    }
    if (r && state.phase === "address") {
      if (justPressed.has("KeyQ")) { r.clubIdx = (r.clubIdx + CLUB_ORDER.length - 1) % CLUB_ORDER.length; void audio?.cue("ui"); updateCardHud(); }
      if (justPressed.has("KeyE")) { r.clubIdx = (r.clubIdx + 1) % CLUB_ORDER.length; void audio?.cue("ui"); updateCardHud(); }
      if (justPressed.has("KeyM")) { applyMulligan(); }
      if (justPressed.has("KeyP")) { r.aimOffset = wrapAngle(pinYaw() - r.aimBase); void audio?.cue("ui"); }
      if (justPressed.has("KeyF")) { r.aimOffset = wrapAngle(t!.lineYaw - r.aimBase); void audio?.cue("ui"); }
      if (justPressed.has("Space") || justPressed.has("Enter")) { startSwing(); }
    } else if (r && state.phase === "swing") {
      if (justPressed.has("Space") || justPressed.has("Enter")) {
        const s = state.swing.press();
        if (s.phase === "committed") commitSwing();
      }
    }
    if (state.phase === "roundover" && justPressed.has("Enter")) {
      openMenu();
    }
  }

  // --- autopilot ONLY when explicitly enabled via ?autoplay=1 or ?demo=1 ---
  if (autopilot && state.phase !== "menu" && !isStillMode && simTime - lastManualInputAt > 2.2) {
    if (r && t && state.phase === "address" && simTime - addressEnteredAt > 1.35) {
      const lie: LieKind = r.strokes === 0 ? "tee" : t.zone(r.ballPos[0], r.ballPos[2]);
      autoPlan = planShot({
        terrain: t,
        gravity: state.course.gravity,
        airDensity: state.course.airDensity,
        wind: state.wind,
        ballPos: r.ballPos,
        lie: lie === "water" || lie === "oob" ? "rough" : lie
      });
      r.clubIdx = CLUB_ORDER.indexOf(autoPlan.club);
      r.aimOffset = wrapAngle(autoPlan.aimYaw - r.aimBase);
      updateCardHud();
      startSwing();
    } else if (state.phase === "roundover" && simTime - roundOverEnteredAt > 3.2) {
      continueAfterRound();
    }
  }

  // --- aim/club continuous ---
  let isTurningAim = false;
  if (r && t && (state.phase === "address" || state.phase === "swing")) {
    const aimIn = (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0) - (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0);
    const zoomIn = (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0) - (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0);
    isTurningAim = aimIn !== 0;
    aimHeldFor = aimIn !== 0 && aimIn === aimHeldDir ? aimHeldFor + dt : 0;
    aimHeldDir = aimIn;
    const fineAim = pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight");
    if (aimIn !== 0) r.aimOffset = stepAimOffset(r.aimOffset, aimIn, dt, aimHeldFor, fineAim);
    updatePinIndicator();
    cam.zoom = clamp(cam.zoom - zoomIn * dt * 1.4, 0.7, 2.6);
  }

  // --- swing meter tick (sets shot params only; the swing drive animates) ---
  // The meter runs in real time and only the player's presses set power and accuracy. The demo autopilot presses
  // on its planned power and at the centre of the needle; its planned shot is what launches (commitSwing).
  if (state.phase === "swing" && r && t) {
    const s = state.swing.tick(dt);
    if (s.phase === "committed") {
      commitSwing();
    } else if (autopilot && autoPlan) {
      if (s.phase === "power" && s.meter >= autoPlan.power) {
        state.swing.press();
      } else if (s.phase === "accuracy" && Math.abs(s.meter) <= state.swing.deadZone() * 0.5) {
        if (state.swing.press().phase === "committed") commitSwing();
      }
    }
    updateSwingMeter();
  }

  // --- visual swing drive: backswing → top → downswing → IMPACT → follow ---
  advanceSwingDrive(dt);

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
    ballHandle?.setPosition(bp[0], Math.max(bp[1] - BALL_R, t.height(bp[0], bp[2]) - 0.01), bp[2]);
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
      const club = shotClub();
      const sw = state.swing.state();
      if (club.putter) {
        // putt pace line: the aim line spans the putter's full-power roll; the ring tracks the power meter
        const range = club.carry;
        const lx = r.ballPos[0] + Math.sin(yaw) * range * 0.5;
        const lz = r.ballPos[2] + Math.cos(yaw) * range * 0.5;
        aimLineHandle?.setPosition(lx, t.height(lx, lz) + 0.04, lz).setRotation(0, yaw, 0).setScale([0.45, 1, range / 28]).setVisible(true);
        const pw = sw.phase === "power" ? sw.meter : sw.power ?? null;
        if (pw !== null) {
          const px = r.ballPos[0] + Math.sin(yaw) * range * pw;
          const pz = r.ballPos[2] + Math.cos(yaw) * range * pw;
          landingRingHandle?.setPosition(px, t.height(px, pz) + 0.05, pz).setRotation(Math.PI / 2, 0, 0).setScale([0.35, 0.35, 0.35]).setVisible(true);
        } else {
          landingRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        }
      } else {
        const lx = r.ballPos[0] + Math.sin(yaw) * 14.5;
        const lz = r.ballPos[2] + Math.cos(yaw) * 14.5;
        aimLineHandle?.setPosition(lx, t.height(lx, lz) + 0.06, lz).setRotation(0, yaw, 0).setScale([1, 1, 1]).setVisible(r.lie !== "green");
        const carry = club.carry * 0.92;
        const px = r.ballPos[0] + Math.sin(yaw) * carry;
        const pz = r.ballPos[2] + Math.cos(yaw) * carry;
        landingRingHandle?.setPosition(px, t.height(px, pz) + 0.12, pz).setRotation(Math.PI / 2, 0, 0).setScale([1, 1, 1]).setVisible(r.lie !== "green");
      }
      const pulse = state.reducedMotion ? 0 : now / 480;
      cupPulseHandle?.setPosition(t.cup[0], t.cup[1] + 0.05, t.cup[2]).setRotation(Math.PI / 2, 0, pulse).setScale([1.1, 1.1, 1.1]).setVisible(r.lie === "green" || r.lie === "fringe");
    } else {
      aimLineHandle?.setScale(HIDDEN_SCALE).setVisible(false);
      landingRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
      cupPulseHandle?.setScale(HIDDEN_SCALE).setVisible(false);
    }

    // ground ring that marks the ball when the camera is far away
    if (ballMarkerHandle) {
      const camDist = Math.hypot(cam.eye[0] - bp[0], cam.eye[1] - bp[1], cam.eye[2] - bp[2]);
      const show = camDist > 9 && state.phase !== "card" && state.ball?.status !== "holed";
      const k = clamp(camDist * 0.03, 0.3, 3);
      if (show) ballMarkerHandle.setPosition(bp[0], t.height(bp[0], bp[2]) + 0.03, bp[2]).setRotation(Math.PI / 2, 0, 0).setScale([k, k, k]).setVisible(true);
      else ballMarkerHandle.setScale(HIDDEN_SCALE).setVisible(false);
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

    // golfer pose — the swing drive owns the animation through the shot
    if (golferRig) {
      const g = golferAt();
      let phase: GolferPhase;
      let u = 0;
      if (heroCelebrate) {
        phase = "celebrate";
        u = clamp((simTime - impactAt) / 1.4, 0, 1);
      } else if (state.phase === "swing") {
        [phase, u] = drivePose();
      } else if (state.phase === "address") {
        phase = isTurningAim ? "walk" : "address";
      } else if (state.phase === "flight" || state.phase === "between") {
        // the follow-through plays out (drive animates through flight), then
        // the golfer holds the finish watching the shot before relaxing
        if (swingDrive.phase !== "idle") {
          [phase, u] = drivePose();
        } else {
          phase = "idle";
        }
      } else {
        phase = "idle";
      }
      poseGolfer(golferRig, phase, u, g.pos, g.yaw, (x, z) => t.height(x, z));
      checkClubContact(dt, g.yaw);
    }

    // flag flutter (held still under reduced motion)
    flagRotation = state.reducedMotion ? [0, 0, 0] : [0, Math.sin(now / 900) * 0.05, Math.sin(now / 700) * 0.03];
    flagstickHandle?.setRotation?.(flagRotation[0], flagRotation[1], flagRotation[2]);
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

/** the play state the menu was opened from, restored by menu-close (audit C8) */
let menuReturn: { phase: PlayPhase; mode: typeof state.mode } | null = null;

function openMenu(): void {
  hideFinalCard();
  if (state.phase !== "menu") menuReturn = { phase: state.phase, mode: state.mode };
  state.phase = "menu";
  state.mode = "menu";
  setMenuOverlay(true);
  setPrompt(null);
  $("swing-meter")?.classList.remove("show");
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]"))) b.classList.remove("active");
  document.querySelector<HTMLButtonElement>('[data-mode-btn="menu"]')?.classList.add("active");
}

/** show or hide the menu overlay; a closed menu is inert and leaves the accessibility tree (audit P-1) */
function setMenuOverlay(open: boolean): void {
  const el = $("menu-overlay");
  if (!el) return;
  el.classList.toggle("open", open);
  el.toggleAttribute("inert", !open);
  el.setAttribute("aria-hidden", open ? "false" : "true");
}

function closeMenu(): void {
  setMenuOverlay(false);
  $("studio-section")!.style.display = "none";
  $("tour-section")!.style.display = "none";
  // release focus from the clicked control — a focused button eats the next
  // Space keyup as a re-click, which would reset the round mid-press
  (document.activeElement as HTMLElement | null)?.blur?.();
}

/**
 * Close the menu back into the hole exactly where it was: a ball in flight
 * keeps flying, a running swing restarts from address, a finished round stays
 * finished. Nothing re-enters address with the ball in the cup.
 */
function resumeFromMenu(): void {
  const back = menuReturn;
  menuReturn = null;
  if (!state.round || !back) { setMode("quick"); return; }
  state.mode = back.mode;
  updateModeChips();
  if (back.phase === "swing" || back.phase === "address") { beginAddress(); return; }
  state.phase = back.phase;
  if (back.phase === "between") betweenUntil = nowMs() + 300;
  if (back.phase === "roundover") setPrompt("MENU — NEW ROUND");
}

function startModeFromMenu(mode: string): void {
  closeMenu();
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]"))) {
    b.classList.toggle("active", b.dataset.modeBtn === (mode === "quick" ? "quick" : mode === "rangelab" ? "rangelab" : "menu"));
  }
  if (mode === "studio") {
    setMenuOverlay(true);
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
    // the player row is pinned in every round it played (audit C9)
    const picked = bracketRows(t.results, rd, 8, PLAYER_NAME);
    const rows = picked.length ? picked : [{ name: "—", score: 0, advanced: false, you: false }];
    return `<div class="bracket-round"><div class="br-title">${titles[i]}</div>${rows.map((c) => `<div class="bracket-cell ${c.you ? "you" : ""} ${c.advanced ? "alive" : "done"}">${c.name} ${c.score >= 0 ? "+" : ""}${c.score}</div>`).join("")}</div>`;
  }).join("");
}

const SWATCH_GROUP_LABEL: Partial<Record<keyof GolferFit, string>> = { polo: "Polo", cap: "Cap", skin: "Skin tone", trail: "Ball trail" };

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
      b.setAttribute("aria-label", `${SWATCH_GROUP_LABEL[key] ?? String(key)} colour ${c}`);
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
  $("menu-close")?.addEventListener("click", () => { closeMenu(); resumeFromMenu(); });
  $("menu-run")?.addEventListener("click", () => { closeMenu(); menuReturn = null; setMode(!tourFinished(state.tour) ? "tour" : "quick"); });

  // keys
  window.addEventListener("keydown", (ev) => {
    if (ev.repeat) return;
    lastManualInputAt = simTime;
    pressedKeys.add(ev.code);
    justPressed.add(ev.code);
  });
  window.addEventListener("keyup", (ev) => pressedKeys.delete(ev.code));
  window.addEventListener("blur", () => pressedKeys.clear());
  // a focused button eats the next Space/Enter keyup as a re-click — release
  // focus after every button click in capture phase so game keys always reach the listener
  document.addEventListener(
    "click",
    (ev) => {
      const b = (ev.target as HTMLElement | null)?.closest?.("button");
      (b as HTMLElement | null)?.blur?.();
    },
    true
  );
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
      ({ left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", hit: "Space", light: "Space", special: "KeyE", heavy: "KeyM", pin: "KeyP", fine: "ShiftLeft" } as Record<string, string>)[b] ?? b;
    const sink = {
      press: (b: string) => { lastManualInputAt = simTime; const c = keyFor(b); pressedKeys.add(c); justPressed.add(c); },
      release: (b: string) => pressedKeys.delete(keyFor(b)),
      setAction: (a: string, held: boolean) => { lastManualInputAt = simTime; const c = keyFor(a); if (held) { pressedKeys.add(c); justPressed.add(c); } else pressedKeys.delete(c); }
    };
    touchControls = mountTouchControls(sink as any, {
      preset: "dpad-4btn",
      // touch: light = swing, heavy = mulligan, special = next club, jump = aim at the pin, hold block = fine aim (audit C14)
      bindings: { "stick.left": "left", "stick.right": "right", "stick.up": "up", "stick.down": "down", left: "left", right: "right", light: "hit", heavy: "heavy", special: "special", jump: "pin", block: "fine" },
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

/** typed catalog keys the game shows in its evidence (hoisted: the evidence is built every 500 ms, not every frame, audit C13) */
const CATALOG_ASSETS: readonly string[] = [
  "linksGolferAthleteMeshy",
  "linksGolfCartMeshy",
  "linksPinFlagMeshy",
  "siegeGolfBall",
  "propPineTree",
  "propRockA",
  "propRockB",
  "siegeWindmillTowerMeshy",
  "siegeStoneBridgeMeshy",
  "skylineCrystalShardMeshy",
  "turboAlpineVenueBackdrop",
  "neonStreetLampProp",
  "showcaseModernBuildingOne",
  "showcaseModernOfficeBuilding",
  "showcaseVoxelBuilding",
  "auroraHabitatDomeMeshy",
  "lunarRoverMeshy",
  "gravityOrbitalRelayMeshy"
];

function publishEvidence(): void {
  const r = state.round;
  const evidence = {
    route: "showcase-aura-links-3d",
    engine: "@aura3d/engine",
    ready: true,
    framesRendered,
    mode: state.mode,
    phase: state.phase,
    cameraMode: cam.mode,
    cameraEye: [...cam.eye],
    flagRotation,
    course: state.courseId,
    hole: state.hole.number,
    par: state.hole.par,
    strokes: r?.strokes ?? 0,
    putts: r?.putts ?? 0,
    lie: r?.lie ?? null,
    club: r ? CLUB_ORDER[r.clubIdx] : null,
    aimYaw: r ? aimYaw() : 0,
    wind: state.wind,
    windSpeed: state.wind.speed,
    windYaw: state.wind.yaw,
    ball: state.ball ? { pos: state.ball.pos, status: state.ball.status, carry: state.ball.carry } : null,
    swing: (() => {
      const tl = golferTelemetry();
      return {
        drivePhase: swingDrive.phase,
        phase: tl.phase,
        t: swingDrive.t,
        putt: swingDrive.putt,
        committed: swingDrive.committed,
        impactFired: swingDrive.impactFired,
        impactDistance: tl.impactDistance,
        clubHeadWorld: tl.clubHeadWorld,
        gripWorld: tl.gripWorld,
        ballWorld: tl.ballWorld,
        clubAttached: tl.attached,
        contact: lastContact
          ? {
              fallback: lastContact.fallback,
              speed: lastContact.speed,
              pathYawDeg: lastContact.pathYawDeg,
              offsetM: lastContact.offsetM,
              u: lastContact.u
            }
          : null
      };
    })(),
    ballStatus: state.ball?.status ?? null,
    ballX: state.ball?.pos[0] ?? null,
    ballY: state.ball?.pos[1] ?? null,
    ballZ: state.ball?.pos[2] ?? null,
    carry: state.ball?.carry ?? null,
    card: state.card ? { toPar: state.card.toPar, totalStrokes: state.card.totalStrokes } : null,
    toPar: state.card?.toPar ?? null,
    totalStrokes: state.card?.totalStrokes ?? null,
    lab: state.lab,
    tour: state.tour ? { round: state.tour.round, playerAlive: state.tour.playerAlive, playerScore: state.tour.playerScore } : null,
    fit: state.fit,
    difficulty: state.difficulty,
    juice: (juice as any)?.snapshot?.() ?? null,
    accessibility: a11ySettings ? { reducedMotion: a11ySettings.reducedMotion, reducedFlash: a11ySettings.reducedFlash, highContrast: a11ySettings.highContrast } : null,
    eventLog: eventLog.snapshot(),
    touch: touchControls?.evidence?.() ?? null,
    audio: audio?.evidence ? { unlocked: audio.evidence.unlocked, cueCount: audio.evidence.cueCount, playedCueCount: audio.evidence.playedCueCount } : null,
    catalogAssets: CATALOG_ASSETS,
    deterministic: { terrain: "buildHoleTerrain", ball: "stepBall", seed: "lcg" }
  };
  lastEvidence = evidence;
  publishBeacon(evidence);
}

/**
 * ?qa=1 hook for the remote gameplay probes (tests/browser/audit-fix/aura-links-3d.spec.ts). Software GL presents
 * a frame every several seconds, so advance() steps the game's own frame() in simulated time (the logic clock moves
 * with it) and the next presented frame shows the state the logic reached.
 */
function installQaHook(): void {
  installQaHooks("links-qa", {
    ready: () => document.body.dataset.aura3dReady === "true",
    state: () => { publishEvidence(); return lastEvidence; },
    app: () => auraApp as any,
    extras: {
    advance(seconds: number): Record<string, unknown> | null {
      const step = 1 / 30;
      for (let t = 0; t < seconds; t += step) {
        qaClockMs += step * 1000;
        frame(step);
        justPressed.clear();
      }
      publishEvidence();
      return lastEvidence;
    },
    evidence(): Record<string, unknown> | null {
      publishEvidence();
      return lastEvidence;
    },
    /** while held, only advance() moves game logic; the engine keeps presenting frames (deterministic screenshots) */
    hold(on: boolean) {
      qaHold = on;
      return qaHold;
    },
    /** world positions of the people on the tee and by the green (framing checks) */
    figures() {
      const names = ["golfer-body", "caddy-body", "golfer-bag", "golfer-cart", ...Array.from({ length: 6 }, (_, i) => `gallery-fan-${i}`)];
      const out: Record<string, unknown> = { ball: state.round?.ballPos ?? null, eye: cam.eye, target: cam.target };
      for (const n of names) {
        const h = tryReq(n);
        out[n] = h ? { position: h.position ?? null, visible: h.visible ?? null } : null;
      }
      return out;
    },
    /** park the camera above pond i of the current hole (C6 check); returns the hazard and drawn sizes */
    framePond(i: number) {
      const t = state.terrain!;
      const w = state.hole.layout.water[i];
      if (!w) return null;
      const g = pondGeometry(t, w);
      state.phase = "menu";
      $("menu-overlay")?.classList.remove("open");
      cam.mode = "card";
      qaPondView = { x: w.center[0], z: w.center[1], y: g.surfaceY, r: w.radius };
      return { center: w.center, hazardRadius: w.radius, drawnRadius: g.pondDiameter / 2, rimRadius: g.rimDiameter / 2, surfaceY: g.surfaceY };
    }
    }
  });
}
let qaPondView: { x: number; z: number; y: number; r: number } | null = null;

/* ------------------------------------------------------------------ *
 *  Boot                                                               *
 * ------------------------------------------------------------------ */

/** boot, RAF and fetch tracing run only with ?diag=1 or ?qa=1 (audit C18) */
const DIAG = bootUrlParams.get("diag") === "1" || bootUrlParams.get("qa") === "1";
function diagLog(...args: unknown[]): void {
  if (DIAG) console.log(...args);
}

function bootStage(name: string): void {
  (window as any).__BOOT_STAGE__ = name;
  diagLog("[links] boot:", name);
}

function boot(): void {
  window.addEventListener("error", (e) => console.error("[links] window error:", e.message, e.filename, e.lineno));
  window.addEventListener("unhandledrejection", (e) => console.error("[links] unhandled rejection:", String(e.reason)));
  // Trace every fetch — the SPA fallback serves index.html for missing files,
  // which surfaces as opaque JSON parse errors inside the renderer mount.
  const origFetch = window.fetch.bind(window);
  if (DIAG) window.fetch = (async (input: any, init?: any) => {
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
  mountedHoleSig = `${state.course.id}|${state.hole.number}|round`;
  auraApp = createAuraApp("#app", {
    scene: buildHoleScene(state.course, state.hole, state.terrain, null),
    ...looks.appOptions(state.course.look),
    qualityRebuild: { flags: ["game"] }
  } as any);
  // Runtime-spawned effect clouds are off by default until the floating-dot report is root-caused; `?vfx=on` re-enables them for diagnosis.
  (auraApp as any).effects.runtime = "off";

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
  syncCourseButtons();

  pushEvent("system", "aura links 3d online", "success");

  // URL-param start modes (evidence probes) — boots immediately into live Quick Play unless ?menu=1
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
  if (params.get("menu") !== "1") closeMenu();
  if (params.get("qa") === "1") installQaHook();

  if (DIAG) {
    diagLog("[links] visibility:", document.visibilityState, "hidden:", document.hidden);
    requestAnimationFrame(() => diagLog("[links] raf tick — RAF is live"));
    window.setTimeout(() => diagLog("[links] raf after 2s:", (window as any).__rafFired ?? "none"), 2000);
    requestAnimationFrame(() => { (window as any).__rafFired = true; });
  }
  // Evidence pump: publishes state even when RAF is throttled (headless capture)
  window.setInterval(() => publishEvidence(), 500);
  (auraApp as any).onFrame(({ dt }: { dt: number }) => {
    if (!appReady || qaHold) return;
    inEngineFrame = true;
    try {
      frame(clamp(dt, 0.001, 0.05));
    } finally {
      inEngineFrame = false;
    }
    if (pendingHoleScene) queueMicrotask(flushPendingHoleScene);
  });
  void (auraApp as any).ready?.()?.then(() => {
    appReady = true;
    document.body.dataset.aura3dReady = "true";
    bootStage("ready");
    bootStage("mounted");
    const rr = (window as any).__AURA3D_ROUTE_READY__;
    const diag = (auraApp as any).diagnostics?.() ?? rr?.diagnostics;
    diagLog("[links] route-state:", rr?.status ?? "?",
      "backend:", (auraApp as any).backend ?? "?",
      "drawCalls:", diag?.drawCalls ?? "?",
      "errors:", JSON.stringify(diag?.errors ?? []),
      "warnings:", JSON.stringify((diag?.warnings ?? []).slice(0, 4)));
    (auraApp as any).resume?.();
    publishEvidence();
  }).catch((e: any) =>
    console.error("[links] mount failed:", String(e), (e as Error)?.stack ?? ""));

  // ?still=N — deterministic capture mode: pause the live loop, step N fixed
  // frames through app.step() (runs frame() + a single simulated-time render
  // each), then publish evidence. Headless captures get a static canvas even
  // when the RAF loop would starve the compositor.
  const stillParam = params.get("still");
  if (stillParam) {
    const n = Math.min(900, Math.max(1, Number(stillParam) || 60));
    void (async () => {
      await (auraApp as any).ready?.();
      appReady = true;
      document.body.dataset.aura3dReady = "true";
      (auraApp as any).pause?.();
      for (let i = 0; i < n; i += 1) (auraApp as any).step?.(1 / 60);
      publishEvidence();
      diagLog(`[links] still: stepped ${n} frames, framesRendered=${framesRendered}`);
    })();
  }
}

void boot();
