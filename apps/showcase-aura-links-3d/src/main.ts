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
  primitives,
  scene,
  world
} from "@aura3d/engine";
import {
  createFixedStepPresenter,
  createJuice,
  createOverlayDriver,
  createRecordBlend,
  createRumbleDriver,
  createTweenEngine,
  createFxParticlePass,
  mountTouchControls,
  sfx,
  sfxUrl,
  installGameBeacon
} from "@aura3d/engine/game";
import "../../showcase-port-shared/quickbar.css";
import { dualAnimatedWaterSpec } from "../../showcase-port-shared/dual-shaders";
import { createImpactRig } from "../../showcase-port-shared/feel";
import { createFlipbookAtlas } from "../../showcase-port-shared/vfx-pack";
import { labAppOptions, readLabFlags, labCameraOptions } from "../../showcase-port-shared/lab-flags";
import { createLoadingProgress } from "../../showcase-port-shared/loading-progress";
import { formatBackendSelection, publishBackendReport } from "../../showcase-port-shared/backend-report";
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
import { applyGolferFit, buildGolferNodes, golferTelemetry, golferVariantFromSearch, poseGolfer, resolveGolferRig, setGolferVariant, type GolferPhase } from "./game/rig";
import { sweptClubContact, type ClubContact } from "./game/contact";
import { commitStroke } from "./game/strokeCommit";
import { COURSE_LOOKS, contactShadowIntensity, courseFill, flagFlutterAmplitude, type LinksTier } from "./game/lighting";
import { buildCourseRig } from "./game/lookRig";
import { landingVfxFor, registerLinksVfx, type LinksVfxId } from "./game/vfx";
import { IMPACT_FOV_KICK_DEG, cupCamPose, flyoverAllowed, flyoverShots, tracerCamPose, wantsCupCam, wantsTracerCam } from "./game/broadcast";
import { linksQaCrops } from "./game/qaCrops";
import { discOnTerrain, flatPad, ribbonAlongPath, terrainToMeshSpec, type SurfaceUvMode } from "./game/terrainMesh";
import { MASK_COLOR_LIFT, TURF_SURFACES, type LinksSurfaceSlot } from "./game/turf";
import { surfaceMarkTexture, turfTexture } from "./game/turfTextures";
import { coverWind, groundCover } from "./game/groundCover";
import { HORIZON_SPECS, horizonRing } from "./game/horizon";
import { lavaSpec, pondWaterOptions, reflectivePonds } from "./game/water";
import {
  buildAlpineCableCarStationNode,
  buildAlpineHorizonTreelineNode,
  buildBasaltColumnsAndShardNodes,
  buildBurnFootbridgeNode,
  buildCoastalLighthouseNode,
  buildCourseOutcropBatch,
  buildCourseTreeBatches,
  buildDuneGorseBatch,
  buildDuneMarramBatch,
  buildGalleryRopeAndSpectatorBatches,
  buildGolfBallNode,
  buildHarbourSkylineNodes,
  buildLunarExpeditionNodes,
  buildPinFlagstickNode,
  buildTeeFurnitureNodes,
  buildTournamentBleacherNodes,
  buildTudorClubhouseNodes,
  mergeTerrainDiscSpecs
} from "./art/proceduralModels";
import { holeCardTransition, holeCardVisible, holeMap, holeMapSvg, holeSubtitle, holeTitle, shotStatsLabel } from "./game/holeCard";
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
import { createWorkerRendererWorker } from "@aura3d/engine/worker";

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
 *  Presentation mode (GU47 WP-20)                                     *
 * ------------------------------------------------------------------ */

const presentationParams = new URLSearchParams(window.location.search);
/** `?look=original` mounts the 4.6.2 light, atmosphere and post rig (PRD §8 reversibility); default: the GU47 course look */
const lookMode: "gu47" | "original" = presentationParams.get("look") === "original" ? "original" : "gu47";
/** the player uses the 24-joint GU47 golfer profile; `?golfer=old` or `?look=original` selects the classic athlete profile */
setGolferVariant(golferVariantFromSearch(window.location.search));
/**
 * Presentation tier (PRD §6.4): `?aura3d-quality=low` (the engine's own tier override) or `?tier=low` builds the Low
 * variant: 1 cascade PCF key, no grain, god rays, sun flare or ambient particles. The engine gates its post stages by
 * its own resolved tier on top of this.
 */
const presentationTier: LinksTier =
  presentationParams.get("aura3d-quality") === "low" || presentationParams.get("tier") === "low" ? "low" : "high";
/** LINKS-14: index.html scopes the broadcast HUD (lower third, figures face, course accent) to body[data-look="gu47"] */
document.body.dataset.look = lookMode;

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

// terrainToMeshSpec, ribbonAlongPath and discOnTerrain live in game/terrainMesh.ts (pure; LINKS-05 world-metre uv0)

/** LINKS-05: the GU47 look tiles turf, sand, basalt and regolith in world metres; `?look=original` keeps 4.6.2 flat colour. */
const turfOn = lookMode !== "original";
const surfaceUv: SurfaceUvMode = turfOn ? "metres" : "legacy";

/**
 * GU47 phase 4 (shadows): the engine's default (4.2.0, "legacy") sun fit widens every cascade to every caster's bounds, and
 * this course's instanced trees, rocks and marram span the whole 400 m hole, so each cascade covered the hole at 2048 px
 * and the golfer's, the cart's and the trees' cast shadows fell to about one texel (no shadow shapes in any capture,
 * although the map was rendered and sampled with 3 cascades: run g10p4-x1; docs/audits/lanes/e3.md). The 4.3.0 fit
 * (`__A3D_SHADOW_FIT__ = "current"`, as Shadowstep Gauntlet) hugs each cascade to its frustum slice. GU47 look only;
 * `?look=original` and `?shadowfit=legacy` keep the 4.2.0 fit (no real-GPU frame of the 4.3.0 fit for this game yet).
 */
if (turfOn) (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";

/**
 * A course surface's material: on the GU47 look the theme's mask (mow stripes or rough mottling, colour lifted to keep
 * the mean), its normal tile (High tier only; Low keeps the masks) and the cut-grass sheen; otherwise the 4.6.2 colour
 * and roughness. Without canvases (no DOM) the textures drop out and the colour stays.
 */
function surfaceMaterial(course: CourseSpec, slot: LinksSurfaceSlot, color: string, legacyRoughness: number) {
  if (!turfOn) return material.pbr({ color, roughness: legacyRoughness });
  const s = TURF_SURFACES[course.dressing.theme][slot];
  const mask = s.mask ? turfTexture(s.mask) : null;
  const normal = s.normal && presentationTier === "high" ? turfTexture(s.normal) : null;
  return material.physical({
    color: mask && s.mask ? shade(color, MASK_COLOR_LIFT[s.mask.kind]) : color,
    roughness: s.roughness,
    ...(mask ? { texture: mask as any } : {}),
    ...(normal && s.normal ? { normal: normal as any, normalScale: s.normal.scale } : {}),
    ...(s.sheen > 0 ? { sheen: s.sheen, sheenRoughness: slot === "green" ? 0.44 : 0.58, sheenColor: shade(color, 1.38) } : {}),
    ...(s.clearcoat && s.clearcoat > 0 ? { clearcoat: s.clearcoat, clearcoatRoughness: s.clearcoatRoughness ?? 0.42 } : {})
  });
}

function hexLinearRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0.1, 0.35, 0.48];
  const n = parseInt(m[1]!, 16);
  const toLin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [toLin((n >> 16) & 255), toLin((n >> 8) & 255), toLin(n & 255)];
}

let cachedDustSheetUrl: string | null | undefined;
function dustFlipbookDataUrl(): string | null {
  if (cachedDustSheetUrl !== undefined) return cachedDustSheetUrl;
  if (typeof document === "undefined") {
    cachedDustSheetUrl = null;
    return null;
  }
  try {
    const atlas = createFlipbookAtlas("dust", [232, 212, 166]);
    const spec = atlas.texture as unknown as { width: number; height: number; data: Uint8Array };
    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cachedDustSheetUrl = null;
      return null;
    }
    const img = ctx.createImageData(spec.width, spec.height);
    img.data.set(spec.data);
    ctx.putImageData(img, 0, 0);
    cachedDustSheetUrl = canvas.toDataURL("image/png");
    return cachedDustSheetUrl;
  } catch {
    cachedDustSheetUrl = null;
    return null;
  }
}

/**
 * The aim line. GU47 phase 3: the 4.6.2 white bar at emissive 1.35 crossed the bloom threshold on every course and read
 * as a glowing light-sabre over the fairway (Neon Bay worst); on the GU47 look it is a softer broadcast guide line.
 */
function aimLineMaterial() {
  return turfOn
    ? material.emissive({ color: "#f4f7fa", emissive: "#f4f7fa", emissiveIntensity: 0.62, opacity: 0.72 })
    : material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.35, opacity: 0.88 });
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

  // --- Corridor botanical trees along left & right rough + behind the green ---
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
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.38 + (i / 7) * Math.PI * 0.76;
    const dist = hole.layout.greenRadius + 16 + (i % 2) * 5;
    const bx = cx + Math.sin(a) * dist;
    const bz = cz + Math.cos(a) * dist;
    corridorTrees.push({ x: bx, z: bz, h: 8.5 + (i % 3) * 1.4, yaw: rng() * Math.PI * 2 });
  }
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
      nodes.push(...buildCourseTreeBatches(terrain, treeSpots, theme, turfOn, state.reducedMotion));
    }
  }

  // --- Stratified coastal / volcanic / lunar rock outcrops along rough ---
  const rockSpots: Vec2[] = [];
  for (const w of hole.layout.woods) rockSpots.push(...scatterInDisc(rng, w.center, w.radius * 0.75, 4, 0.25));
  if ((theme === "volcanic" || theme === "lunar" || theme === "dunes") && rockSpots.length) {
    const rockBatch = buildCourseOutcropBatch(terrain, rockSpots, theme, rng);
    if (rockBatch) nodes.push(rockBatch);
  }

  // --- Multi-material sculpted landmarks per course biome ---
  if (theme === "dunes") {
    const millX = midT[0] - fairHalf - 16;
    const millZ = midT[1] + 18;
    nodes.push(buildCoastalLighthouseNode([millX, terrain.height(millX, millZ) - 0.15, millZ], 0.55));
    if (clubSpot) nodes.push(...buildTudorClubhouseNodes(course, hole, terrain, clubSpot.x, clubSpot.z, turfOn, ribbonAlongPath));
    if (hole.layout.water.length) {
      const w = hole.layout.water[0]!;
      const brX = w.center[0] - w.radius * 0.8;
      const brZ = w.center[1];
      nodes.push(buildBurnFootbridgeNode([brX, terrain.height(brX, brZ) - 0.05, brZ], 0.2));
    }
  } else if (theme === "parkland") {
    if (clubSpot) nodes.push(...buildTudorClubhouseNodes(course, hole, terrain, clubSpot.x, clubSpot.z, turfOn, ribbonAlongPath));
  } else if (theme === "volcanic") {
    nodes.push(...buildBasaltColumnsAndShardNodes(terrain, midT, fairHalf));
  } else if (theme === "alpine") {
    const ccX = Math.min(terrain.bounds.maxX - 10, midT[0] + fairHalf + 26);
    const ccZ = midT[1] + 14;
    nodes.push(
      buildAlpineCableCarStationNode([ccX, terrain.height(ccX, ccZ) - 0.1, ccZ], -1.95),
      buildAlpineHorizonTreelineNode(cx, cz)
    );
  } else if (theme === "nightCity") {
    nodes.push(...buildHarbourSkylineNodes(terrain, midT, cx, cz, lookMode));
  } else if (theme === "lunar") {
    nodes.push(...buildLunarExpeditionNodes(terrain, midT, tx, tz, cz));
  }

  // --- Green-side lattice grandstands + batched gallery ropes & sculpted `articulatedFolkSlots` gallery spectators ---
  for (const side of [-1, 1] as const) {
    const sx = cx + side * (hole.layout.greenRadius + 10.5);
    const sz = cz + 3.5;
    nodes.push(...buildTournamentBleacherNodes(cx, cz, sx, sz, terrain, course.palette, side < 0 ? "l" : "r"));
  }
  nodes.push(...buildGalleryRopeAndSpectatorBatches(cx, cz, hole.layout.greenRadius, terrain, rng));

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
  // LINKS-15: thin surface overlays receive shadows but need not cast them
  // into every cascade. The original-look scene keeps its authored settings.
  const overlayShadow = turfOn ? { castShadow: false } : {};

  const nodes: any[] = [];

  // --- Base heightfield (rough) + outer ground shell ---
  const base = terrainToMeshSpec(terrain, 112, 96, -0.04, surfaceUv);
  nodes.push(
    geometry.custom(base, { name: "terrain-rough", material: surfaceMaterial(course, "rough", pal.rough, 0.92), castShadow: false })
  );
  const outerY = Math.min(terrain.tee[1], terrain.cup[1]) - 6;
  nodes.push(
    primitives.plane({ name: "outer-ground", size: [terrain.bounds.maxX * 4, terrain.bounds.maxZ * 4, 1], material: material.pbr({ color: theme4(course) === "lunar" ? "#43454c" : theme4(course) === "volcanic" ? "#2e2a26" : pal.rough, roughness: 0.96 }), castShadow: false }).position(0, outerY, (terrain.bounds.minZ + terrain.bounds.maxZ) / 2)
  );

  // --- GU47 phase 4: the distant landform ring (dune ridges, wooded rise, crater walls); one draw, GU47 look only ---
  const horizon = turfOn ? HORIZON_SPECS[course.id] : undefined;
  if (horizon) {
    nodes.push(
      geometry.custom(horizonRing(terrain, horizon), {
        name: "horizon-landforms",
        material: material.pbr({ color: horizon.color, roughness: horizon.roughness, doubleSided: true } as any),
        castShadow: false
      })
    );
  }

  // --- LINKS-09 ground cover (GU47 only): two instanced draws in the rough, the theme's tufts and its colour note ---
  if (turfOn) {
    for (const plan of groundCover(terrain, course.dressing.theme, hole.number, presentationTier)) {
      if (plan.transforms.length === 0) continue;
      const l = plan.layer;
      const wind = coverWind(l, state.reducedMotion, COURSE_LOOKS[course.id].flagFlutter);
      const mat = l.emissive > 0
        ? material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: l.emissive, roughness: l.roughness } as any)
        : material.pbr({ color: l.name === "tufts" ? "#567d52" : "#ffffff", roughness: l.roughness });
      nodes.push(
        (instances as any)[l.shape]({
          name: `ground-cover-${l.name}`,
          size: [...l.size],
          material: mat,
          transforms: plan.transforms.map((t) => ({ position: [...t.position], rotation: [...t.rotation], scale: [...t.scale] })),
          colors: [...plan.colors],
          ...(l.emissive > 0 ? { instanceColorTarget: "both" } : {}),
          castShadow: false,
          ...(wind ? { wind } : {})
        })
      );
      // GU47 WP-36 (golfMarram, LINKS-07): St Auroras' rough carries real marram clumps, the Links-owned Meshy model
      // (6,793 triangles, one draw), on every 40th tuft spot nearest the tee, at most 48 (24 on Low)
      if (l.name === "tufts" && course.dressing.theme === "dunes") {
        const tee = lay.path[0] ?? [0, 0];
        const spots = plan.transforms
          .filter((_, i) => i % 8 === 0)
          .map((t) => ({ t, d: Math.hypot(t.position[0] - tee[0], t.position[2] - tee[1]) }))
          .filter((s) => s.d > 6)
          .sort((a, b) => a.d - b.d)
          .slice(0, presentationTier === "low" ? 24 : 48);
        if (spots.length > 0) {
          nodes.push(
            buildDuneMarramBatch(
              "dune-marram",
              spots.map(({ t }, i) => {
                const s = 0.75 + ((i * 37) % 10) * 0.06;
                return {
                  position: [t.position[0], t.position[1] - 0.05, t.position[2]] as [number, number, number],
                  rotation: [0, t.rotation[1], 0] as [number, number, number],
                  scale: [s, s, s] as [number, number, number]
                };
              })
            )
          );
        }
        const gorseSpots = plan.transforms
          .filter((_, i) => i % 8 === 4)
          .map((t) => ({ t, d: Math.hypot(t.position[0] - tee[0], t.position[2] - tee[1]) }))
          .filter((s) => s.d > 8)
          .sort((a, b) => a.d - b.d)
          .slice(0, presentationTier === "low" ? 8 : 16);
        if (gorseSpots.length > 0) {
          nodes.push(
            buildDuneGorseBatch(
              "dune-gorse",
              gorseSpots.map(({ t }, i) => {
                const s = 0.9 + ((i * 53) % 7) * 0.05;
                return {
                  position: [t.position[0], t.position[1] - 0.04, t.position[2]] as [number, number, number],
                  rotation: [0, t.rotation[1] + 0.9, 0] as [number, number, number],
                  scale: [s, s, s] as [number, number, number]
                };
              })
            )
          );
        }
      }
    }
  }

  // --- Fairway ribbon (first-cut collar + two mow stripes) ---
  // (LINKS-05: on the GU47 look the mow stripes are the fairway's mask, banded across the line of play, so the
  // longitudinal stripe ribbon `fairway-b` is gone: one draw fewer)
  const fairEdge = ribbonAlongPath(terrain, lay.path, lay.fairwayWidth / 2 + 1.7, 0.022, undefined, undefined, surfaceUv);
  const fairA = ribbonAlongPath(terrain, lay.path, lay.fairwayWidth / 2, 0.035, undefined, undefined, surfaceUv);
  nodes.push(
    geometry.custom(fairEdge, { name: "fairway-first-cut", material: surfaceMaterial(course, "firstCut", shade(pal.fairway, 0.8), 0.9), ...overlayShadow }),
    geometry.custom(fairA, { name: "fairway-a", material: surfaceMaterial(course, "fairway", pal.fairway, 0.84), ...overlayShadow })
  );
  if (!turfOn) {
    const fairB = ribbonAlongPath(terrain, lay.path, lay.fairwayWidth / 2 - 3.2, 0.05);
    nodes.push(geometry.custom(fairB, { name: "fairway-b", material: material.pbr({ color: shade(pal.fairway, 1.22), roughness: 0.82 }), castShadow: false }));
  }

  // --- Green + collar + fringe ---
  const [gx, gz] = [terrain.cup[0], terrain.cup[2]];
  const collar = discOnTerrain(terrain, gx, gz, lay.greenRadius + 4.4, 0.045, 36, lay.greenRadius + 2.3, surfaceUv);
  const green = discOnTerrain(terrain, gx, gz, lay.greenRadius, 0.065, 36, 0, surfaceUv);
  const fringe = discOnTerrain(terrain, gx, gz, lay.greenRadius + 2.5, 0.055, 36, lay.greenRadius * 0.96, surfaceUv);
  nodes.push(
    geometry.custom(collar, { name: "green-collar", material: surfaceMaterial(course, "firstCut", shade(pal.fringe, 0.82), 0.88), ...overlayShadow }),
    geometry.custom(fringe, { name: "fringe", material: surfaceMaterial(course, "fringe", pal.fringe, 0.85), ...overlayShadow }),
    geometry.custom(green, { name: "green", material: surfaceMaterial(course, "green", pal.green, 0.74), ...overlayShadow })
  );

  // --- Tee box + surround + sculpted tournament markers, ball washer & yardage monuments ---
  const teeMat = material.pbr({ color: pal.teeBox, roughness: 0.82 });
  const teeEdgeMat = material.pbr({ color: shade(pal.teeBox, 0.72), roughness: 0.92 });
  nodes.push(
    primitives.box({ name: "tee-surround", size: [9.3, 0.07, 7.3], material: teeEdgeMat, castShadow: false }).position(terrain.tee[0], terrain.tee[1] - 0.025, terrain.tee[2]),
    primitives.box({ name: "tee-box", size: [8.4, 0.12, 6.4], material: teeMat, castShadow: false }).position(terrain.tee[0], terrain.tee[1] - 0.03, terrain.tee[2]),
    ...buildTeeFurnitureNodes(course, hole, terrain, turfOn)
  );
  if (turfOn) {
    nodes.push(geometry.custom(flatPad(terrain.tee[0], terrain.tee[1] + 0.032, terrain.tee[2], 8.3, 6.3), { name: "tee-deck", material: surfaceMaterial(course, "firstCut", pal.teeBox, 0.82), castShadow: false }));

    // LINKS-10: subtle static divots/footprints and bunker rake lines in one
    // non-shadowing batch. They are presentation-only and never enter terrain.
    const marks: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
    const markColors: string[] = [];
    const addMark = (mx: number, mz: number, width: number, length: number, heightOffset: number, color: string) => {
      const [dx, dz] = terrain.slope(mx, mz);
      marks.push({
        position: [mx, terrain.height(mx, mz) + heightOffset, mz],
        rotation: [-Math.atan(dz), 0, Math.atan(dx)],
        scale: [width, 1, length]
      });
      markColors.push(color);
    };
    for (let i = 0; i < 3; i++) {
      addMark(terrain.tee[0] + 1.2 + i * 0.22, terrain.tee[2] + 1.1 + i * 0.12, 0.08, 0.22, 0.04, shade(pal.teeBox, 0.7));
    }
    const bunker = lay.bunkers[0];
    if (bunker) {
      for (let i = -2; i <= 2; i++) {
        addMark(bunker.center[0] + i * 0.17, bunker.center[1], 0.035, Math.min(1.1, bunker.radius * 0.4), 0.1, shade(pal.sand, 0.72));
      }
    }
    const markTexture = surfaceMarkTexture();
    if (markTexture) {
      nodes.push(instances.plane({
        name: "course-surface-marks", size: [1, 1, 1], transforms: marks, colors: markColors,
        material: material.pbr({ color: "#ffffff", roughness: 1, opacity: 0.5, texture: markTexture as any }),
        castShadow: false, receiveShadow: false
      }));
    }
  }

  // --- Bunkers (merged sand bowls + merged grass lips -> 2 draws instead of 2*N + coastal marram eyebrows) ---
  const bunkerEyebrowTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const bunkerBowlSpecs: ReturnType<typeof discOnTerrain>[] = [];
  const bunkerLipSpecs: ReturnType<typeof discOnTerrain>[] = [];
  lay.bunkers.forEach((b, i) => {
    bunkerBowlSpecs.push(discOnTerrain(terrain, b.center[0], b.center[1], b.radius, 0.09, 28, 0, surfaceUv));
    bunkerLipSpecs.push(discOnTerrain(terrain, b.center[0], b.center[1], b.radius + 0.72, 0.075, 28, b.radius * 0.92));
    if (turfOn && course.dressing.theme === "dunes" && presentationTier === "high" && i < 4) {
      for (let k = 0; k < 4; k++) {
        const ang = terrain.lineYaw - 0.55 + k * 0.36 + i * 0.4;
        const rx = b.center[0] + Math.sin(ang) * (b.radius + 0.68);
        const rz = b.center[1] + Math.cos(ang) * (b.radius + 0.68);
        const sc = 0.72 + ((i + k) % 3) * 0.12;
        bunkerEyebrowTransforms.push({
          position: [rx, terrain.height(rx, rz) - 0.03, rz],
          rotation: [0, ang * 1.7, 0],
          scale: [sc, sc, sc]
        });
      }
    }
  });
  if (bunkerLipSpecs.length > 0) {
    nodes.push(
      geometry.custom(mergeTerrainDiscSpecs(bunkerLipSpecs), {
        name: "bunker-lips",
        material: material.physical({ color: shade(pal.sand, 0.62), roughness: 0.94 }),
        ...overlayShadow
      }),
      geometry.custom(mergeTerrainDiscSpecs(bunkerBowlSpecs), {
        name: "bunkers-sand",
        material: surfaceMaterial(course, "bunker", shade(pal.sand, 1.08), 0.84),
        ...overlayShadow
      })
    );
  }
  if (bunkerEyebrowTransforms.length > 0) {
    nodes.push(buildDuneMarramBatch("bunker-eyebrow-marram", bunkerEyebrowTransforms));
  }

  // --- Water (dark wet bank, shadow rim, then a reflective pond surface) ---
  // LINKS-17 (GU47): the two largest ponds of a hole reflect (E-G world.water lake, planar on High; game/water.ts),
  // secondary ponds render via paired GLSL+WGSL dualAnimatedWaterSpec, and Cinder Rim's pools are scrolling emissive lava.
  const reflecting = reflectivePonds(terrain, hole, course.dressing.theme, { tier: presentationTier, look: lookMode });
  const lava = lookMode !== "original" && theme4(course) === "volcanic" ? material.custom(lavaSpec(state.reducedMotion) as any) : null;
  const lookSun = COURSE_LOOKS[course.id].sun;
  const sunAz = (lookSun.azimuthDeg * Math.PI) / 180;
  const sunEl = (lookSun.elevationDeg * Math.PI) / 180;
  const sunDirVec: [number, number, number] = [Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.cos(sunAz) * Math.cos(sunEl)];
  const dualPondWater = turfOn && !lava
    ? material.custom(
        dualAnimatedWaterSpec({
          deepColor: hexLinearRgb(shade(pal.water, 0.52)),
          shallowColor: hexLinearRgb(shade(pal.water, 1.34)),
          sunDir: sunDirVec,
          waveScale: 0.42,
          waveSpeed: state.reducedMotion ? 0 : 1.1,
          opacity: 0.94
        }) as any
      )
    : null;
  lay.water.forEach((w, i) => {
    const { surfaceY: y, pondDiameter, rimDiameter } = pondGeometry(terrain, w);
    const pond = reflecting.find((p) => p.index === i);
    if (pond) {
      // the bank and the dark rim (the pond floor seen through the water) stay; the lake replaces the water cylinder
      const bank = discOnTerrain(terrain, w.center[0], w.center[1], w.radius + 1.5, 0.02, 32, w.radius * 0.94);
      nodes.push(
        geometry.custom(bank, { name: `pond-bank-${i}`, material: material.pbr({ color: shade(pal.rough, 0.55), roughness: 0.96 }), castShadow: false }),
        primitives.cylinder({ name: `pond-rim-${i}`, size: [rimDiameter, 0.05, rimDiameter], material: material.pbr({ color: shade(pal.water, 0.5), roughness: 0.34, metalness: 0.2 }), castShadow: false }).position(w.center[0], y - 0.3, w.center[1]),
        world.water(pondWaterOptions(pond, pal.water, state.reducedMotion) as any) as any
      );
      return;
    }
    const bank = discOnTerrain(terrain, w.center[0], w.center[1], w.radius + 1.5, 0.02, 32, w.radius * 0.94);
    const waterMat = dualPondWater ?? material.pbr({
      color: shade(pal.water, 1.22),
      roughness: 0.09,
      metalness: 0.38,
      emissive: pal.water,
      emissiveIntensity: isNight ? 0.42 : 0.1
    });
    nodes.push(
      geometry.custom(bank, { name: `pond-bank-${i}`, material: material.pbr({ color: shade(pal.rough, 0.55), roughness: 0.96 }), castShadow: false }),
      primitives.cylinder({ name: `pond-rim-${i}`, size: [rimDiameter, 0.05, rimDiameter], material: material.pbr({ color: shade(pal.water, 0.5), roughness: 0.34, metalness: 0.2 }), castShadow: false }).position(w.center[0], y - 0.03, w.center[1]),
      primitives.cylinder({ name: `pond-${i}`, size: [pondDiameter, 0.06, pondDiameter], material: lava ?? waterMat, castShadow: false }).position(w.center[0], y, w.center[1])
    );
  });

  // --- Flag + cup (procedural tournament pin flagstick has minY = 0 grounded origin) ---
  nodes.push(
    buildPinFlagstickNode(COURSE_LOOKS[course.id].accent, [terrain.cup[0], terrain.cup[1], terrain.cup[2]]),
    primitives.cylinder({ name: "cup-dark", size: [CUP_R * 2, 0.06, CUP_R * 2], material: material.pbr({ color: "#05070a", roughness: 1 }), castShadow: false }).position(terrain.cup[0], terrain.cup[1] + 0.005, terrain.cup[2])
  );

  // --- Ball + trail + shadow + aim aids ---
  nodes.push(
    buildGolfBallNode(BALL_R, turfOn),
    primitives.cylinder({ name: "ball-shadow", size: [BALL_R * 2.4, 0.008, BALL_R * 2.4], material: material.pbr({ color: "#000000", opacity: 0.38, roughness: 1 }), castShadow: false, receiveShadow: false }).runtime(game.runtimeNode("ball-shadow"))
  );
  if (turfOn) {
    const dustSheet = dustFlipbookDataUrl();
    nodes.push(
      effects
        .flipbook({
          name: "vfx-sand-puff",
          ...(dustSheet ? { texture: dustSheet } : { sprite: "smoke-a" }),
          spriteColumns: 8,
          spriteRows: 4,
          frameRate: 28,
          loop: true,
          size: [0.85, 1.35],
          color: shade(pal.sand, 1.08),
          blend: "alpha",
          visible: false
        } as any)
        .position(terrain.tee[0], terrain.tee[1] + 0.25, terrain.tee[2])
        .runtime(game.runtimeNode("vfx-sand-puff"))
    );
  }
  if (lookMode === "original") {
    nodes.push(effects.trail({ name: "ball-ribbon-trail", target: "golf-ball", color: "#ffffff", width: 0.07, maxPoints: 44, intensity: 0.9 } as any));
  }
  nodes.push(
    primitives.torus({ name: "ball-marker", size: [0.5, 0.025, 0.025], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.1, opacity: 0.8 }), castShadow: false, receiveShadow: false, visible: false } as any).scale(HIDDEN_SCALE).runtime(game.runtimeNode("ball-marker")),
    primitives.box({ name: "aim-line", size: [0.14, 0.03, 28], material: aimLineMaterial(), castShadow: false, receiveShadow: false }).runtime(game.runtimeNode("aim-line")),
    primitives.torus({ name: "landing-ring", size: [1.5, 0.06, 0.06], material: material.emissive({ color: "#63e2ff", emissive: "#63e2ff", emissiveIntensity: 1.25 }), castShadow: false, receiveShadow: false }).runtime(game.runtimeNode("landing-ring")),
    primitives.torus({ name: "cup-pulse", size: [0.36, 0.035, 0.035], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.35 }), castShadow: false, receiveShadow: false, visible: false } as any).scale(HIDDEN_SCALE).runtime(game.runtimeNode("cup-pulse"))
  );
  for (let i = 0; i < TRAIL_COUNT; i++) {
    nodes.push(
      primitives.sphere({ name: `ball-trail-${i}`, size: [0.07, 0.07, 0.07], material: material.emissive({ color: state.fit.trail, emissive: state.fit.trail, emissiveIntensity: 0.4 }), castShadow: false, receiveShadow: false, visible: false } as any)
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }

  // --- Green read contour grid (5x5 slope break arrows between ball and cup) ---
  for (let i = 0; i < 25; i++) {
    nodes.push(
      primitives.box({ name: `read-arrow-${i}`, size: [0.05, 0.016, 0.68], material: material.emissive({ color: "#a8f0b0", emissive: "#a8f0b0", emissiveIntensity: 0.72, opacity: 0.58 }), castShadow: false, receiveShadow: false, visible: false } as any)
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
        primitives.torus({ name: `range-ring-${i}`, size: [7 + i * 1.5, 0.18, 0.18], material: ringMat, castShadow: false, receiveShadow: false }).position(terrain.tee[0], terrain.height(terrain.tee[0], z) + 0.1, z).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode(`range-ring-${i}`)),
        primitives.cylinder({ name: `range-bull-${i}`, size: [1.3, 0.04, 1.3], material: material.emissive({ color: "#ff5c5c", emissive: "#ff5c5c", emissiveIntensity: 0.9 }), castShadow: false, receiveShadow: false }).position(terrain.tee[0], terrain.height(terrain.tee[0], z) + 0.06, z)
      );
    });
  }

  // --- Golfer ---
  nodes.push(...buildGolferNodes(state.fit, turfOn));

  // --- Course dressing ---
  nodes.push(...buildDressingNodes(course, hole, terrain, rng));

  // --- Course look (GU47 LINKS-01..04, 16, 18): the course's own HDRI, sun, shadowed key, rim, fog, grade and post
  // from its look-table row (game/lighting.ts) as E-A look overrides, plus its practicals, god rays, flare and
  // ambient particles (game/lookRig.ts). `?look=original` restores the 4.6.2 rig (PRD §8 reversibility).
  if (lookMode === "original") return buildOriginalLookScene(course, terrain, nodes);
  const rig = buildCourseRig(course, hole, terrain, { tier: presentationTier, reducedMotion: state.reducedMotion });
  // LINKS-12: the broadcast depth of field, High only (the engine drops DOF below High); toggled at run time so it is on
  // only in the flyover and the cup cam (setBroadcastDof)
  if (presentationTier === "high") {
    nodes.push(effects.depthOfField({ name: "broadcast depth of field", focusDistance: 70, fStop: 11, maxBlur: 0 }));
  }
  return scene()
    .addMany(rig.before)
    .add(rig.look)
    .addMany(nodes)
    .addMany(rig.nodes)
    .camera(holeOpeningCamera(terrain))
    .background(rig.background);
}

/** The hole's opening camera (the address cam takes over on the first frame). */
function holeOpeningCamera(terrain: HoleTerrain) {
  return camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"),
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
  const fill = courseFill(course);
  if (fill.hemiI > 0) {
    nodes.push(lights.hemisphere({ name: "course sky-ground fill", skyColor: fill.sky, groundColor: fill.ground, intensity: fill.hemiI + fill.ambientI * 0.65, position: [0, 30, 0] }));
  } else if (fill.ambientI > 0) {
    nodes.push(lights.hemisphere({ name: "course sky-ground fill", skyColor: fill.ambient, groundColor: shade(fill.ambient, 0.55), intensity: fill.ambientI * 0.85, position: [0, 30, 0] }));
  }
  nodes.push(lights.directional({ name: "course rim fill", color: fill.rim, intensity: fill.rimI, position: fill.rimPos }));
  if (fill.flood) {
    nodes.push(lights.directional({ name: "course floodlight key", color: fill.flood.color, intensity: fill.flood.intensity, position: fill.flood.position }));
  }
  const lookV0 = looks.describe(course.look).v0;
  const lookBg = lookV0.background;
  nodes.push(
    effects.fog({ name: "course depth haze", color: lookV0.fog?.color ?? lookBg, near: 120, far: 460, density: isNight ? 0.0014 : 0.0022, intensity: isNight ? 0.14 : 0.2 } as any),
    effects.contactShadows({ intensity: contactShadowIntensity(course), length: 0.32, steps: 12, lights: "sun" }),
    effects.vignette({ name: "course vignette", intensity: 0.15, smoothness: 0.72, roundness: 0.92, color: "#061019" })
  );
  const lookOpts = { exposureEv: -0.06, ...(course.lookOverrides ?? {}), fog: { color: lookV0.fog?.color ?? lookBg, near: 120, far: 460 }, fogDensityScale: 0 };
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
let sandPuffHandle: any = null;
let sandPuffUntil = 0;
let trailHandles: any[] = [];
let readArrowHandles: any[] = [];
let rangeRingHandles: any[] = [];
const tryReq = (id: string) => { try { return (auraApp as any)?.nodes?.require(id); } catch { return null; } };
const FIXED_BALL_DT = 1 / 120;
let ballStepAccum = 0;
let shotPeakApexM = 0;
let shotLaunchSpeedMps = 0;
let impactRig = createImpactRig({ reducedMotion: false });
let impactFrameState: ReturnType<typeof impactRig.step> = {
  simDt: 1 / 60,
  frozen: false,
  shakeOffset: [0, 0, 0],
  shakeRoll: 0,
  fovDeltaDeg: 0
};
const ballPresenter = createFixedStepPresenter<{ pos: Vec3 }>({
  snapshot: () => ({
    pos: state.ball
      ? ([state.ball.pos[0], state.ball.pos[1], state.ball.pos[2]] as Vec3)
      : state.round
        ? ([state.round.ballPos[0], state.round.ballPos[1], state.round.ballPos[2]] as Vec3)
        : ([0, 0, 0] as Vec3)
  }),
  blend: createRecordBlend<{ pos: Vec3 }>({ snapDistance: 8, position: (s) => s.pos })
});
const isCoarseViewport = (): boolean =>
  (window.matchMedia?.("(pointer: coarse)")?.matches ?? false) || (window.innerWidth > 0 && window.innerWidth <= 760);

function triggerDustFlipbook(pos: Vec3): void {
  if (!sandPuffHandle || state.reducedMotion) return;
  sandPuffHandle.setPosition?.(pos[0], pos[1] + 0.28, pos[2])?.setVisible?.(true);
  sandPuffUntil = nowMs() + 780;
}

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
  sandPuffHandle = tryReq("vfx-sand-puff");
  sandPuffUntil = 0;
  sandPuffHandle?.setVisible?.(false);
  trailHandles = Array.from({ length: TRAIL_COUNT }, (_, i) => req(`ball-trail-${i}`));
  readArrowHandles = Array.from({ length: 25 }, (_, i) => req(`read-arrow-${i}`));
  rangeRingHandles = Array.from({ length: 4 }, (_, i) => tryReq(`range-ring-${i}`)).filter(Boolean);
  // a new hole scene re-creates its depth-of-field node: keep it off outside the flyover and the cup cam (LINKS-12)
  if (!flyover && broadcastCam?.kind !== "cup") setBroadcastDof(false);
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
  $("h-course-chip")!.innerHTML = `${course.name}<span class="sub" id="h-look-chip">${course.shortName} · ${turfOn ? COURSE_LOOKS[course.id].timeOfDay.split(/,| in | under /)[0]!.toUpperCase() : `${course.look.toUpperCase()} LOOK`}</span>`;
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

/* LINKS-14: the broadcast lower third and the course accent (GU47 look only; index.html body[data-look="gu47"]) */

let holeCardShown = false;

function setText(id: string, text: string): void {
  const el = $(id);
  if (el) el.textContent = text;
}

/** Hole map, title and subtitle of the hole just started; the stats chip stays empty until its first shot rests. */
function renderHoleCard(): void {
  const t = state.terrain;
  if (lookMode === "original" || !t) return;
  const map = $("hc-map");
  if (map) map.innerHTML = holeMapSvg(holeMap(state.hole, t));
  setText("hc-title", holeTitle(state.hole));
  setText("hc-sub", holeSubtitle(state.hole, state.course.name));
  setText("hc-stats", "");
  $("hole-card")?.classList.remove("has-stats");
}

/** The shot stats chip once a ball comes to rest on the hole (read-only values of the finished shot). */
function showShotStats(club: string, carry: number, roll: number, toPin: number): void {
  if (lookMode === "original") return;
  setText("hc-stats", shotStatsLabel({ club, carry, roll, toPin }));
  $("hole-card")?.classList.add("has-stats");
}

/** Shows or hides the lower third as the phase changes (one class toggle, only when the answer changes). */
function syncHoleCard(): void {
  const want = holeCardVisible({ look: lookMode, phase: state.phase, lab: state.lab !== null, hasRound: state.round !== null });
  if (want === holeCardShown) return;
  holeCardShown = want;
  $("hole-card")?.classList.toggle("show", want);
}

/** The course's HUD accent (COURSE_LOOKS: hues >= 30 deg apart, >= 4.5:1 on the HUD panel); `?look=original` keeps the gold. */
function applyCourseAccent(): void {
  if (lookMode === "original") return;
  document.body.style.setProperty("--accent", COURSE_LOOKS[state.courseId].accent);
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
  const applyJuice = !qaPondView && !isStillMode && !state.reducedMotion;
  const sx = applyJuice ? impactFrameState.shakeOffset[0] : 0;
  const sy = applyJuice ? impactFrameState.shakeOffset[1] : 0;
  const df = applyJuice ? impactFrameState.fovDeltaDeg : 0;
  (auraApp as any)?.camera?.setPose?.({
    position: [cam.eye[0] + sx, cam.eye[1] + sy, cam.eye[2]],
    target: cam.target,
    fov: clamp(cam.fov + df, 24, 68)
  });
}

/* ------------------------------------------------------------------ *
 *  Broadcast camera language (GU47 LINKS-12, the signature effect)    *
 * ------------------------------------------------------------------ */

const broadcastOn = lookMode !== "original";
/** the running hole flyover (an `app.camera.play()` sequence of E-H rail rigs under letterbox bars) */
let flyover: { skip(): void; readonly done: Promise<void> } | null = null;
/** a flyover is due once the hole's scene is mounted (startHole sets it) */
let pendingFlyover = false;
/** tracer cam (drives) or cup cam (short putts) for the shot in the air */
let broadcastCam: { readonly kind: "tracer" | "cup"; readonly launch: Vec3; readonly yaw: number } | null = null;

/** Depth of field only in the flyover and the cup cam (E-C runtime post toggle; the node is High-only). */
function setBroadcastDof(on: boolean, focusDistance?: number): void {
  if (!broadcastOn || presentationTier !== "high") return;
  const post = (auraApp as any)?.post;
  try {
    post?.setEffectEnabled?.("depthOfField", on);
    if (on && focusDistance !== undefined) post?.setEffect?.("depthOfField", { focusDistance });
  } catch { /* a post surface without runtime control keeps the node's state */ }
}

function startFlyover(): void {
  pendingFlyover = false;
  const t = state.terrain;
  const director = (auraApp as any)?.camera;
  const allowed = flyoverAllowed({
    reducedMotion: state.reducedMotion,
    qa: bootUrlParams.get("qa") === "1",
    still: isStillMode,
    disabled: bootUrlParams.get("flyover") === "0"
  });
  // reduced motion, labs and capture modes get the cut to the address cam instead (PRD §6.3)
  if (!broadcastOn || !allowed || !t || state.lab || state.phase !== "address") return;
  if (typeof director?.play !== "function" || typeof director?.rigs?.rail !== "function") return;
  try {
    const shots = flyoverShots(t, state.hole).map((s) => ({
      rig: director.rigs.rail({ points: s.points, lookAt: s.lookAt, fov: s.fov, duration: s.duration, ease: "inOutSine" }),
      duration: s.duration,
      blendIn: 0,
      bars: true
    }));
    // `use` clears the per-frame setPose overrides, so the rails (not the address cam) drive the camera
    director.use?.(director.rig);
    const playback = director.play({ id: `links-flyover-${state.hole.number}`, shots, onEnd: "return" });
    flyover = playback;
    setBroadcastDof(true, 70);
    void playback.done.then(() => {
      if (flyover === playback) {
        flyover = null;
        setBroadcastDof(false);
      }
    });
  } catch {
    flyover = null;
  }
}

/** Skip within one frame: any key, tap, or the swing. */
function skipFlyover(): void {
  const running = flyover;
  if (!running) return;
  flyover = null;
  try { running.skip(); } catch { /* already done */ }
  setBroadcastDof(false);
  camApply();
}

function updateCamera(dt: number): void {
  const t = state.terrain;
  const r = state.round;
  cam.t += dt;
  // the flyover sequence owns the camera until it ends or is skipped
  if (flyover) return;
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
  const shotCam = mode === "flight" && ball && broadcastCam
    ? broadcastCam.kind === "cup"
      ? cupCamPose(t, ball.pos)
      : ball.status === "flight" ? tracerCamPose(t, broadcastCam.launch, broadcastCam.yaw, ball.pos) : null
    : null;
  if (shotCam) {
    // GU47 LINKS-12: the cup cam on short putts, the locked-off tracer cam on drives (until the first bounce)
    cam.mode = "flight";
    cam.eye = [shotCam.position[0], shotCam.position[1], shotCam.position[2]];
    cam.target = [shotCam.target[0], shotCam.target[1], shotCam.target[2]];
    cam.fov = shotCam.fov;
  } else if (mode === "flight" && ball) {
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
  if (broadcastCam) {
    broadcastCam = null;
    setBroadcastDof(false);
  }
  cam.mode = "aim";
  setPrompt(isCoarseViewport() ? "TAP SWING · AIM ◀ ▶ · CLUB / PIN" : "SPACE — SWING · A/D AIM (SHIFT FINE) · P PIN · Q/E CLUB");
  $("swing-meter")?.classList.remove("show");
  $("shot-telemetry")?.classList.remove("show");
  ballStepAccum = 0;
  ballPresenter.reset();
  syncMobileDock();
  updateCardHud();
  if (golferRig) {
    const g = golferAt();
    poseGolfer(golferRig, "address", 0, g.pos, g.yaw, (x, z) => t.height(x, z));
  }
  ballHandle?.setPosition(r.ballPos[0], Math.max(r.ballPos[1] - BALL_R, t.height(r.ballPos[0], r.ballPos[2]) - 0.01), r.ballPos[2]);
  updateCamera(0);
}

function startSwing(): void {
  skipFlyover();
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
  $("sw-label")!.textContent = isCoarseViewport() ? "TAP — LOCK POWER" : "SPACE — SET POWER";
  setPrompt(null);
  syncMobileDock();
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
  shotLaunchSpeedMps = Math.hypot(state.ball.vel[0], state.ball.vel[1], state.ball.vel[2]);
  shotPeakApexM = 0;
  ballStepAccum = 0;
  ballPresenter.reset();
  state.phase = "flight";
  $("swing-meter")?.classList.remove("show");
  syncMobileDock();
  const qual = Math.abs(commit.accuracy);
  pushEvent("shot", `${clubLabel(commit.club.id)} · ${(commit.power * 100) | 0}% · ${contactLabel(qual)} · ${shapeLabel(commit.spin)}`, qual < 0.3 ? "success" : "warning");
  juiceFire("hit", { position: r.ballPos });
  if (!commit.club.putter) {
    impactRig.trigger({
      freezeSeconds: qual === 0 ? 0.025 : 0.012,
      trauma: qual === 0 ? 0.32 : 0.16,
      fovKickDeg: IMPACT_FOV_KICK_DEG
    });
    triggerDustFlipbook(r.ballPos);
  }
  shotLanded = false;
  if (lookMode !== "original") {
    if (!commit.club.putter) linksBurst(state.courseId === "mareCourse" ? "links-lowg-dust" : "links-strike", r.ballPos);
    startTracer();
    // LINKS-12: cup cam on short putts (with depth of field on the ball), tracer cam on drives
    skipFlyover();
    const putter = commit.club.putter === true;
    const launchAt: Vec3 = [r.ballPos[0], r.ballPos[1], r.ballPos[2]];
    broadcastCam = wantsCupCam({ putter, distanceToCup: t.cupDistance(r.ballPos[0], r.ballPos[2]) })
      ? { kind: "cup", launch: launchAt, yaw: commit.aimYaw }
      : wantsTracerCam({ putter, carry: commit.club.carry * commit.power })
        ? { kind: "tracer", launch: launchAt, yaw: commit.aimYaw }
        : null;
    if (broadcastCam?.kind === "cup") setBroadcastDof(true, 1.7 + t.cupDistance(r.ballPos[0], r.ballPos[2]) * 0.5);
  }
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
      if (lookMode === "original") spawnTurfPuff(ev.pos, zone);
      else if (!shotLanded || zone === "sand") {
        linksBurst(landingVfxFor(state.courseId, zone), ev.pos);
        if (zone === "sand" || zone === "fairway" || zone === "rough") triggerDustFlipbook(ev.pos);
      }
      shotLanded = true;
    } else if (ev.kind === "holed") {
      onHoled();
    } else if (ev.kind === "water") {
      pushEvent("penalty", "water hazard — +1 stroke", "warning");
      juiceFire("splash", { position: ev.pos });
      if (lookMode !== "original") linksBurst(landingVfxFor(state.courseId, "water"), ev.pos);
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
  showShotStats(state.commit?.club.label ?? CLUB_ORDER[r.clubIdx]!, air, shot - air, state.terrain!.cupDistance(pos[0], pos[2]));
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
  if (lookMode !== "original") {
    linksBurst("links-holeout-ring", state.terrain!.cup);
    // the hole-out orbit takes over (no depth of field outside the flyover and the cup cam)
    broadcastCam = null;
    setBroadcastDof(false);
  }
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
  clearLandingEffects();
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
  if (turfOn) {
    // GU47 phase 3 (rubric composition): start on the aim-cam pose the camera eases into (same formula as the aim branch
    // of the camera update, zoom 1), not 8 m back and 5 m up with the golfer on the left edge; slow first frames (and
    // the poster and steady-state captures) then show the address framing
    const aspect = (window.innerWidth || 16) / (window.innerHeight || 9);
    const side = clamp(aspect / 1.6, 0.3, 1);
    const portrait = clamp((1.15 - aspect) / 0.6, 0, 1);
    const back = 5.4 + 1.9 * portrait, aimSide = 2.7 * side * (1 - 0.9 * portrait);
    const ex = t.tee[0] - Math.sin(t.lineYaw) * back - Math.cos(t.lineYaw) * aimSide;
    const ez = t.tee[2] - Math.cos(t.lineYaw) * back + Math.sin(t.lineYaw) * aimSide;
    const ax = t.tee[0] + Math.sin(t.lineYaw) * 34, az = t.tee[2] + Math.cos(t.lineYaw) * 34;
    cam.eye = [ex, t.height(ex, ez) + 2.2, ez];
    cam.target = [ax, t.height(ax, az) - 2.2, az];
    cam.fov = 42 + 16 * portrait;
  }
  if (framesRendered > 0 || idx > 0) {
    showMsg(`HOLE ${hole.number} — ${hole.name.toUpperCase()}`, `PAR ${hole.par} · ${hole.lengthM}M`, 2100);
  }
  pushEvent("hole", `hole ${hole.number}: ${hole.name} · par ${hole.par}`, "info");
  renderHoleCard();
  beginAddress();
  // LINKS-12: the hole flyover plays once this hole's scene is mounted (frame() starts it)
  skipFlyover();
  pendingFlyover = broadcastOn;
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
  applyCourseAccent();
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

function syncMobileDock(): void {
  const dock = $("mobile-golf-dock");
  const swingBtn = $("mobile-swing-btn");
  if (!dock || !swingBtn) return;
  const active = state.phase === "address" || state.phase === "swing";
  dock.classList.toggle("active", active);
  if (state.phase === "address") {
    swingBtn.textContent = "SWING";
  } else if (state.phase === "swing") {
    const ph = state.swing.state().phase;
    swingBtn.textContent = ph === "power" ? "LOCK PWR" : ph === "accuracy" ? "ACCURACY" : "STRIKE";
  }
}

function updateShotTelemetry(): void {
  const box = $("shot-telemetry");
  if (!box) return;
  const show = lookMode !== "original" && (state.phase === "flight" || state.phase === "between") && Boolean(state.commit) && !state.commit?.club.putter;
  box.classList.toggle("show", show);
  if (!show) return;
  const ball = state.ball;
  const t = state.terrain;
  if (ball && t) {
    const agl = Math.max(0, ball.pos[1] - t.height(ball.pos[0], ball.pos[2]));
    if (agl > shotPeakApexM) shotPeakApexM = agl;
  }
  const speedKmh = Math.round(shotLaunchSpeedMps * 3.6);
  const carryM = Math.round(ball?.carry ?? 0);
  setText("st-speed", `${speedKmh}`);
  setText("st-apex", `${Math.round(shotPeakApexM)}M`);
  setText("st-carry", `${carryM}M`);
}

function updateSwingMeter(): void {
  const s = state.swing.state();
  const fill = $("sw-fill"), needle = $("sw-needle"), green = $("sw-green"), perfect = $("sw-perfect");
  const label = $("sw-label");
  const rl = $("sw-readout-l"), rr = $("sw-readout-r");
  if (!fill || !needle || !green || !perfect) return;
  const touch = isCoarseViewport();
  const gz = DIFF_GREEN_ZONE[state.difficulty];
  green.style.left = `${(0.5 - gz) * 100}%`;
  green.style.width = `${gz * 2 * 100}%`;
  perfect.style.left = "calc(50% - 2px)";
  if (s.phase === "power") {
    fill.style.width = `${s.meter * 100}%`;
    needle.style.left = `${s.meter * 100}%`;
    green.style.opacity = "0";
    perfect.style.opacity = "0";
    if (label) label.textContent = touch ? "TAP — LOCK POWER" : "SPACE — SET POWER";
    if (rl) rl.textContent = "";
    if (rr) rr.textContent = `${Math.round(s.meter * 100)}%`;
  } else if (s.phase === "accuracy") {
    fill.style.width = `${(s.power ?? 0) * 100}%`;
    // needle value +1 (left) → -1 (right); 0 centre = pure
    needle.style.left = `${((1 - s.meter) / 2) * 100}%`;
    green.style.opacity = "1";
    perfect.style.opacity = "1";
    if (label) label.textContent = touch ? "TAP — LOCK ACCURACY · CENTER = PURE" : "SPACE — SET ACCURACY · CENTER = PURE";
    if (rl) rl.textContent = "◀ DRAW";
    if (rr) rr.textContent = "FADE ▶";
  } else if (s.phase === "committed") {
    const spin = s.spin ?? 0;
    if (label) label.textContent = spin < -0.25 ? "DRAW" : spin > 0.25 ? "FADE" : "PURE CONTACT";
    if (rl) rl.textContent = `PWR ${Math.round((s.power ?? 0) * 100)}%`;
    if (rr) rr.textContent = `ACC ${Math.round((s.accuracy ?? 0) * 100)}`;
  }
  syncMobileDock();
}

/* ------------------------------------------------------------------ *
 *  Juice-lite (camera shake/punch via the same juice stack as tennis)  *
 * ------------------------------------------------------------------ */

function juiceFire(ev: string, at?: Record<string, unknown>): void {
  try { juice?.fire(ev as never, at as never); } catch { /* best-effort */ }
}

const JUICE_EVENTS_462: Record<string, any> = {
  // The strike sound is cued once per stroke where the stroke commits (`audio.cue(putter ? "putt" : "drive")`); the juice event
  // used to cue "drive" as well, so every impact played the strike twice (and a putt also played the driver strike).
  hit:     { fx: { kind: "spark", count: 8, color: "#ffd257", speed: 2.6 }, rumble: { ms: 26, weak: 0.4 }, punch: { fovDeg: 1.4, ms: 140 } },
  bounce:  { fx: { kind: "dust", count: 6, color: "#cfc8a8", speed: 1.6 } },
  splash:  { fx: { kind: "splash", count: 18, color: "#63e2ff", speed: 3.4 }, cue: "splash", flash: { color: "#63e2ff", peak: 0.1, ms: 120 } },
  holed:   { fx: { kind: "ring", count: 24, color: "#9be84e", speed: 4.6 }, cue: "cup", hitStop: 0.09, shake: 0.42, punch: { fovDeg: 3.0, dolly: -0.4, ms: 300 }, flash: { color: "#9be84e", peak: 0.2, ms: 170 } },
  eagle:   { cue: "win", shake: 0.5, punch: { fovDeg: 3.6, dolly: -0.5, ms: 380 }, flash: { color: "#ffd257", peak: 0.24, ms: 240 } }
};

/**
 * GU47 LINKS-11: the course look fires the Links preset pack (game/vfx.ts) from the ball events, so the juice keeps
 * only its cues, rumble, camera punch and flashes; `?look=original` keeps the 4.6.2 juice particles.
 */
const JUICE_EVENTS: Record<string, any> = lookMode === "original"
  ? JUICE_EVENTS_462
  : Object.fromEntries(Object.entries(JUICE_EVENTS_462).map(([k, { fx: _fx, ...rest }]) => [
      k,
      // LINKS-12: the 2-degree FOV kick at impact (the juice scales punches down under reduced motion)
      k === "hit" ? { ...rest, punch: { fovDeg: IMPACT_FOV_KICK_DEG, ms: 140 } } : rest
    ]));

function spawnTurfPuff(pos: Vec3, zone: LieKind): void {
  const color = zone === "sand" ? "#e8d8a0" : zone === "green" || zone === "fringe" ? "#9be84e" : zone === "rough" ? "#4a6a3f" : "#7ab85a";
  try { fxCtlRef?.spawn("ground-dust", pos, { radius: 0.35, color, intensity: 1 }); } catch { /* optional */ }
}

// LINKS-10: eight static marks plus at most 24 live divot decals per hole.
// Retain the composite burst handles so evicting a mark removes its decal too.
const landingEffects: { stop(options?: { immediate?: boolean }): void }[] = [];
const MAX_LANDING_EFFECTS = 24;

function clearLandingEffects(): void {
  for (const handle of landingEffects.splice(0)) {
    try { handle.stop(); } catch { /* optional effects surface */ }
  }
}

/** One Links preset burst (LINKS-11). Divot and sand take the course's own turf and sand; the hole-out ring its accent. */
function linksBurst(id: LinksVfxId, pos: Vec3): void {
  const pal = state.course.palette;
  const color = id === "links-divot" ? shade(pal.rough, 1.25)
    : id === "links-sand-burst" ? shade(pal.sand, 1.12)
    : id === "links-holeout-ring" ? COURSE_LOOKS[state.courseId].accent
    : undefined;
  try {
    const handle = (auraApp as any)?.effects?.burst?.(id, [pos[0], pos[1] + 0.02, pos[2]], { camera: false, ...(color ? { color } : {}) });
    if (id === "links-divot" && handle && typeof handle.stop === "function") {
      if (landingEffects.length >= MAX_LANDING_EFFECTS) {
        try { landingEffects.shift()?.stop(); } catch { /* optional effects surface */ }
      }
      landingEffects.push(handle);
    }
  } catch { /* optional */ }
}

/** First touchdown of the current shot (the landing effect and its pitch-mark decal fire once per shot). */
let shotLanded = false;
/** The broadcast shot tracer of the shot in the air (E-F `app.effects.trail` on the ball). */
let tracerHandle: { stop(o?: { immediate?: boolean }): void } | null = null;

function startTracer(): void {
  tracerHandle?.stop({ immediate: true });
  tracerHandle = null;
  if (lookMode === "original") return;
  try {
    tracerHandle = (auraApp as any)?.effects?.trail?.("golf-ball", { width: 0.09, life: 2.4, color: state.fit.trail, widthOverSpeed: [2, 18] }) ?? null;
  } catch { tracerHandle = null; }
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

function frame(realDt: number): void {
  if (!appReady) return;
  framesRendered += 1;
  // Step hit-stop & camera trauma on REAL frame dt (never frozen simDt!)
  impactFrameState = impactRig.step(realDt);
  const deterministicMode = isStillMode || qaHold || bootUrlParams.get("qa") === "1";
  const dt = deterministicMode ? realDt : impactFrameState.simDt;
  simTime += dt;
  if (framesRendered === 1) diagLog("[links] first frame tick", realDt);
  const now = nowMs();
  if (sandPuffUntil > 0 && now >= sandPuffUntil) {
    sandPuffUntil = 0;
    sandPuffHandle?.setVisible?.(false);
  }
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
  syncHoleCard();

  // --- broadcast flyover (LINKS-12): any key skips it this frame (the key still does its usual job); a due flyover
  // starts once the hole's scene is mounted ---
  if (flyover && justPressed.size > 0) skipFlyover();
  if (pendingFlyover && !pendingHoleScene) startFlyover();

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

  // --- ball step (120 Hz fixed-step simulation + interpolated presentation on live displays) ---
  if (state.phase === "flight" && state.ball && t && state.commit) {
    const env = {
      terrain: t,
      gravity: state.course.gravity,
      airDensity: state.course.airDensity,
      wind: state.wind,
      lie: state.commit.club.putter ? ("green" as LieKind) : "fairway",
      liePenalty: 1
    };
    if (deterministicMode) {
      const { ball, events } = stepBall(state.ball, env, dt);
      state.ball = ball;
      trailPts.push(ball.pos);
      if (trailPts.length > TRAIL_COUNT) trailPts.shift();
      if (events.length) onBallEvents(events);
      ballPresenter.reset();
    } else {
      ballStepAccum = Math.min(ballStepAccum + dt, FIXED_BALL_DT * 8);
      while (ballStepAccum >= FIXED_BALL_DT && state.phase === "flight" && state.ball) {
        ballStepAccum -= FIXED_BALL_DT;
        const { ball, events } = stepBall(state.ball, env, FIXED_BALL_DT);
        state.ball = ball;
        ballPresenter.afterStep();
        trailPts.push(ball.pos);
        if (trailPts.length > TRAIL_COUNT) trailPts.shift();
        if (events.length) onBallEvents(events);
      }
    }
  }
  updateShotTelemetry();

  // --- between → next lie ---
  if (state.phase === "between" && now > betweenUntil) {
    beginAddress();
  }
  if (state.phase === "card" && now > betweenUntil) {
    advanceHole();
  }

  // --- visuals ---
  if (r && t) {
    const bp =
      !deterministicMode && state.phase === "flight" && state.ball
        ? ballPresenter.present({ alpha: ballStepAccum / FIXED_BALL_DT }, true).pos
        : state.ball
          ? state.ball.pos
          : r.ballPos;
    ballHandle?.setPosition(bp[0], Math.max(bp[1] - BALL_R, t.height(bp[0], bp[2]) - 0.01), bp[2]);
    const bh = bp[1] - t.height(bp[0], bp[2]);
    const ss = clamp(1 - bh * 0.05, 0.4, 1);
    ballShadowHandle?.setPosition(bp[0], t.height(bp[0], bp[2]) + 0.02, bp[2]).setScale([ss, 1, ss]).setVisible(bh < 12);

    // trail dots (`?look=original`; the GU47 look draws the tracer ribbon instead, 16 fewer draws in flight)
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const pt = trailPts[trailPts.length - 1 - i];
      const h = trailHandles[i];
      if (!h) continue;
      if (lookMode === "original" && pt && state.phase === "flight" && state.ball?.status === "flight") {
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

    // 5x5 green read slope contour grid between ball and cup on the green
    const onGreen = r.lie === "green" || r.lie === "fringe" || state.mode === "puttinglab";
    if (onGreen) {
      const dxCup = t.cup[0] - r.ballPos[0];
      const dzCup = t.cup[2] - r.ballPos[2];
      const distCup = Math.max(2.4, Math.min(18, Math.hypot(dxCup, dzCup)));
      const fwdX = dxCup / (Math.hypot(dxCup, dzCup) || 1);
      const fwdZ = dzCup / (Math.hypot(dxCup, dzCup) || 1);
      const rightX = fwdZ;
      const rightZ = -fwdX;
      const lateralSpan = Math.max(1.8, Math.min(4.6, distCup * 0.42));
      readArrowHandles.forEach((h, i) => {
        if (!h) return;
        const row = Math.floor(i / 5); // 0..4 along ball -> cup
        const col = (i % 5) - 2; // -2..+2 across putt corridor
        const alongFrac = (row + 0.6) / 5.2;
        const latOffset = (col / 2) * lateralSpan;
        const x = r.ballPos[0] + fwdX * distCup * alongFrac + rightX * latOffset;
        const z = r.ballPos[2] + fwdZ * distCup * alongFrac + rightZ * latOffset;
        const [sx2, sz2] = t.slope(x, z);
        const slopeMag = Math.hypot(sx2, sz2);
        const yaw = Math.atan2(-sx2, -sz2); // points downhill along break direction
        const mag = clamp(slopeMag * 9.5, 0.28, 1.15);
        h.setPosition(x, t.height(x, z) + 0.045, z)
          .setRotation(0, yaw, 0)
          .setScale([1, 1, mag])
          .setVisible(slopeMag > 0.004);
      });
    } else {
      readArrowHandles.forEach((h) => h?.setScale(HIDDEN_SCALE)?.setVisible(false));
    }

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

    // flag flutter (held still under reduced motion). GU47 LINKS-13 + WP-05: flagstick banner yaws with wind direction
    // and flutters proportionally to wind speed (stiff on airless Mare).
    const flutter = lookMode === "original" ? (state.reducedMotion ? 0 : 1) : flagFlutterAmplitude(COURSE_LOOKS[state.courseId], state.wind.speed, state.reducedMotion);
    flagRotation = flutter === 0
      ? [0, 0, 0]
      : lookMode === "original"
        ? [0, Math.sin(now / 900) * 0.05 * flutter, Math.sin(now / 700) * 0.03 * flutter]
        : [
            Math.cos(state.wind.yaw) * 0.03 * flutter,
            state.wind.yaw + Math.sin(now / 520) * 0.12 * flutter,
            Math.sin(state.wind.yaw) * 0.03 * flutter + Math.sin(now / 390) * 0.03 * flutter
          ];
    flagstickHandle?.setRotation?.(flagRotation[0], flagRotation[1], flagRotation[2]);
  }

  updateCamera(realDt);
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

  // WP-05 mobile golf caddy dock (>= 64x64px SWING thumb button + >= 44x44px AIM / CLUB / PIN controls)
  const bindHoldKey = (id: string, code: string) => {
    const el = $(id);
    if (!el) return;
    const press = (ev: Event) => {
      ev.preventDefault();
      lastManualInputAt = simTime;
      pressedKeys.add(code);
      justPressed.add(code);
    };
    const release = () => pressedKeys.delete(code);
    el.addEventListener("pointerdown", press);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
  };
  bindHoldKey("mob-aim-l", "KeyA");
  bindHoldKey("mob-aim-r", "KeyD");
  $("mob-club")?.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    lastManualInputAt = simTime;
    justPressed.add("KeyE");
  });
  $("mob-pin")?.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    lastManualInputAt = simTime;
    justPressed.add("KeyP");
  });
  $("mobile-swing-btn")?.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    lastManualInputAt = simTime;
    justPressed.add("Space");
  });

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
      drive:    { id: "drive", asset: { url: assets.linksDriveStrikeSfx.url }, volume: 0.55 },
      putt:     { id: "putt", asset: { url: sfxUrl(sfx.sports.ballBounceCourt[0]) }, volume: 0.5 },
      bounce:   { id: "bounce", asset: { url: sfxUrl(sfx.sports.ballBounceCourt[1]) }, volume: 0.4 },
      cup:      { id: "cup", asset: { url: assets.linksCupDropSfx.url }, volume: 0.8 },
      rattle:   { id: "rattle", asset: { url: assets.linksFlagstickRattleSfx.url }, volume: 0.45 },
      splash:   { id: "splash", asset: { url: sfxUrl(sfx.sports.ballBounceHard[1]) }, volume: 0.5 },
      parChime: { id: "parChime", asset: { url: assets.linksBirdieChimeSfx.url }, volume: 0.7 },
      bogey:    { id: "bogey", asset: { url: assets.linksBogeyThudSfx.url }, volume: 0.5 },
      win:      { id: "win", asset: { url: sfxUrl(sfx.stinger.win[0]) }, volume: 0.85 },
      ui:       { id: "ui", asset: { url: assets.linksMenuTickSfx.url }, volume: 0.4 },
      wind:     { id: "wind", asset: { url: assets.linksCoastWindLoopSfx.url }, volume: 0.1, loop: true }
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
        // LINKS-11: a water splash is the engine's splash burst, not ground dust (the 4.6.2 map sent it to dust)
        if (kind === "splash") {
          (auraApp as any)?.effects?.burst?.("splash", position, { count: o?.count, color: o?.color, camera: false });
          return;
        }
        const map: Record<string, string> = { spark: "hit-spark", dust: "ground-dust", ring: "ring-shockwave", streak: "dash-trail" };
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

/** typed catalog keys the game shows in its evidence (100% native @aura3d/engine procedural geometry, zero GLB models) */
const CATALOG_ASSETS: readonly string[] = [];

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
    // GU47 LINKS-12 broadcast camera (flyover running, tracer/cup cam of the shot in the air) and the look variant
    broadcast: { flyover: Boolean(flyover), shotCam: broadcastCam?.kind ?? null, look: lookMode, tier: presentationTier },
    // GU47 LINKS-14 broadcast HUD: the lower third's state and the course accent the HUD wears
    hud: { holeCard: holeCardShown, accent: lookMode === "original" ? null : COURSE_LOOKS[state.courseId].accent },
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
      const names = ["golfer-body", "caddy-body", "golfer-bag", "golfer-cart", "gallery-spectators"];
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

/**
 * GU47 LINKS-19 / E-I crop contract: `window.__AURA_QA__.crops` (read by the steady-state capture at every shot, so it
 * is published on every boot, not only under ?qa=1): golfer, ball, turf, rough, green, ponds (lava on Cinder Rim) and
 * the sky band, re-projected from the live camera pose (game/qaCrops.ts).
 */
function publishQaCrops(): void {
  const w = window as any;
  w.__AURA_QA__ = Object.assign(w.__AURA_QA__ ?? {}, {
    crops: () => {
      const t = state.terrain;
      const r = state.round;
      if (!t || !r) return [];
      const canvas = document.querySelector("#app canvas") as HTMLCanvasElement | null;
      const aspect = canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : (window.innerWidth || 16) / (window.innerHeight || 9);
      const ball = state.ball ? state.ball.pos : r.ballPos;
      return linksQaCrops({ eye: cam.eye, target: cam.target, fov: cam.fov, aspect }, {
        ball,
        cup: t.cup,
        aimYaw: aimYaw(),
        fairwayHalfWidth: state.hole.layout.fairwayWidth / 2,
        height: (x, z) => t.height(x, z),
        ponds: state.hole.layout.water.map((p) => ({ center: p.center, radius: p.radius, y: pondGeometry(t, p).surfaceY }))
      });
    }
  });
}

/* ------------------------------------------------------------------ *
 *  Boot                                                               *
 * ------------------------------------------------------------------ */

/** boot, RAF and fetch tracing run only with ?diag=1 or ?qa=1 (audit C18) */
const DIAG = bootUrlParams.get("diag") === "1" || bootUrlParams.get("qa") === "1";
function diagLog(...args: unknown[]): void {
  if (DIAG) console.log(...args);
}

/** A1: the course loading bar; stages move it, the first-frame readiness completes it. */
const BOOT_PROGRESS: Record<string, number> = { "scene-build": 0.2, audio: 0.4, "fx-touch": 0.5, "bind-ui": 0.55, studio: 0.6, "resolve-handles": 0.65 };
const courseLoading = createLoadingProgress({
  element: typeof document !== "undefined" ? (document.getElementById("course-loading-bar") ?? undefined) : undefined,
  onProgress: (f) => {
    document.body.dataset.aura3dLoading = f.toFixed(2);
    if (f >= 1) document.getElementById("course-loading")?.setAttribute("data-complete", "true");
  }
});

/** A1: a typed readiness failure (`app.readiness()` state "failed") is shown to the player with its code instead of a silent console error. */
function showRenderFailure(code: string): void {
  document.getElementById("course-loading")?.setAttribute("hidden", "");
  const box = $("render-error");
  const title = box?.querySelector("h2");
  const hint = box?.querySelector("p");
  if (title) title.textContent = "AURA LINKS 3D COULD NOT START";
  if (hint) hint.textContent = "Reload the page. If it keeps happening, report the code below.";
  const line = $("render-error-code");
  if (line) { line.textContent = `ERROR ${code}`; line.hidden = false; }
  if (box) box.hidden = false;
}

function bootStage(name: string): void {
  (window as any).__BOOT_STAGE__ = name;
  const staged = BOOT_PROGRESS[name];
  if (staged !== undefined) courseLoading.set(staged, name);
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

  // accessibility first: the course look halves its ambient emission under reduced motion (PRD §6.3)
  state.reducedMotion = params.has("reducedMotion") || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
  state.reducedFlash = params.has("reducedFlash") || (window.matchMedia?.("(prefers-reduced-flash: reduce)")?.matches ?? false);
  impactRig = createImpactRig({ reducedMotion: state.reducedMotion });
  // LINKS-14: the course accent, and the lower third without its fade and rise under reduced motion
  applyCourseAccent();
  const holeCardEl = $("hole-card");
  if (holeCardEl) holeCardEl.style.transition = holeCardTransition(state.reducedMotion);

  bootStage("scene-build");
  // 5.0 lab flags (EXPERIMENTAL, default OFF): ?backend=, ?gamut=p3 and ?worker=1 (worker rendering, main-thread fallback kept) are wired; ?depth is ignored here (?depth fails the contact-shadow mount: CONTACT_SHADOW_DEPTH_CONVENTION_UNSUPPORTED).
  // With no flag in the URL both fragments are empty and the options are exactly the 4.x/5.0.1 ones.
  const lab = readLabFlags();
  // WebGPU by default (backend "auto", WebGL2 fallback kept; real-GPU check 2026-11-09 after WebGPU perf round 3: same frame, >= 0.92x WebGL2 fps); ?backend=webgl2 opts out.
  const labFragment = labAppOptions(lab, { backend: "auto", createWorker: createWorkerRendererWorker });
  const baseAppOpts = looks.appOptions(state.course.look) as Record<string, any>;
  const coarsePixelRatio = (window.matchMedia?.("(pointer: coarse)")?.matches ?? false)
    ? Math.min(window.devicePixelRatio || 1, 1.35)
    : undefined;
  const labOptions: Record<string, unknown> = {
    ...(coarsePixelRatio !== undefined ? { pixelRatio: coarsePixelRatio } : {}),
    output: {
      ...(baseAppOpts.output ?? {}),
      toneMapping: "agx",
      dither: true,
      ...(labFragment.output ?? {})
    }
  };
  if (labFragment.renderer || coarsePixelRatio !== undefined) {
    labOptions.renderer = {
      ...(baseAppOpts.renderer ?? {}),
      ...(labFragment.renderer ?? {}),
      ...(coarsePixelRatio !== undefined ? { pixelRatio: coarsePixelRatio } : {})
    };
  }
  mountedHoleSig = `${state.course.id}|${state.hole.number}|round`;
  auraApp = createAuraApp("#app", {
    scene: buildHoleScene(state.course, state.hole, state.terrain, null),
    ...baseAppOpts,
    ...labOptions,
    ...(labFragment.worker ? { worker: labFragment.worker } : {}),
    qualityRebuild: { flags: ["game"] }
  } as any);
  // GU47 LINKS-11: runtime VFX are on again (E-F root-caused and fixed the floating dots in the engine; `?vfx=off` still
  // turns them off). The Links preset pack registers on the app's effects surface.
  registerLinksVfx((auraApp as any).effects, { reducedMotion: state.reducedMotion, reducedFlash: state.reducedFlash });
  // LINKS-12: the broadcast depth of field starts off (only the flyover and the cup cam turn it on); a tap skips the flyover
  setBroadcastDof(false);
  window.addEventListener("pointerdown", () => skipFlyover());
  publishQaCrops();

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
    courseLoading.done("ready");
    const rr = (window as any).__AURA3D_ROUTE_READY__;
    const diag = (auraApp as any).diagnostics?.() ?? rr?.diagnostics;
    diagLog("[links] route-state:", rr?.status ?? "?",
      "backend:", (auraApp as any).backend ?? "?",
      "drawCalls:", diag?.drawCalls ?? "?",
      "errors:", JSON.stringify(diag?.errors ?? []),
      "warnings:", JSON.stringify((diag?.warnings ?? []).slice(0, 4)));
    (auraApp as any).resume?.();
    // A2: publish the backend selection and readiness report on the QA hook (and the ?diag=1 log)
    const qaHook = ((window as any).__AURA_QA__ ??= {}) as Record<string, unknown>;
    void publishBackendReport(auraApp as any, qaHook).then((report) => {
      if (report.readiness.state === "failed") showRenderFailure(report.readiness.code);
      if (report.backendSelection) diagLog("[links]", formatBackendSelection(report.backendSelection));
    }).catch(() => undefined);
    publishEvidence();
  }).catch((e: any) => {
    console.error("[links] mount failed:", String(e), (e as Error)?.stack ?? "");
    showRenderFailure("MOUNT_FAILED");
  });

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
