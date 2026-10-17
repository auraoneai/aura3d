/**
 * Aura Slam 3D v2 — flagship 3D court tennis route on the Aura3D engine.
 *
 * LOOK BRIEF (art-direction §sports/table, `interior-industrial`):
 *   Broadcast night-arena tennis — floodlit court under dark stadium bowl,
 *   turf/clay palette per venue with white lines + optic-yellow ball accent;
 *   four corner flood towers cast volumetric light cones through arena haze.
 *   Camera lives on the long-lens broadcast axis, drifting with ball position
 *   and punching in for aces, smashes and championship moments.
 *
 * ARCHITECTURE
 *   The production Top Tennis game bundle (serve/rally/score engine, 32-player
 *   World Tour, Smash Lab, menus, DOM HUD) ships verbatim under
 *   `/toptennis-v2/` and talks to this file through the `window.TennisScene`
 *   renderer bridge (`render/resize/projectCourt/debug`). This file upgrades
 *   everything around that contract: authored look preset, stadium/crowd/venue
 *   dressing from typed catalog + Meshy assets, 2-bone IK athlete rigs via
 *   `game.racketSports`, a cinematic camera director, juice (hit-stop, shake,
 *   FOV punch, rumble), engine VFX bursts, confetti particles, decals, engine
 *   SFX layered under the legacy audio, touch controls, accessibility plumbing,
 *   an event log ticker, and a much richer runtime evidence channel.
 */
import {
  camera,
  createAuraApp,
  createGameAudio,
  decals,
  effects,
  game,
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
import { v2assets } from "./aura-assets-v2";

type JuiceCamera = { readonly shake: { add(n: number): void }; readonly punch: { trigger(o: Record<string, unknown>): void }; evidence(): unknown };
type JuiceSession = { readonly reducedMotion: boolean; readonly reducedFlash: boolean; hitStop(s: number, o?: unknown): void; slowMo(s: number, ms: number, o?: unknown): void };
type GameAudioLike = { unlock(): Promise<unknown>; cue(c: string): Promise<unknown>; evidence: { unlocked: boolean; cueCount: number; playedCueCount: number } };

/* ------------------------------------------------------------------ *
 *  Court / venue constants (real tennis proportions, metres)          *
 * ------------------------------------------------------------------ */

type Vec3 = [number, number, number];

const COURT_X = 5.5; // half-width of doubles court, world metres
const COURT_Z = 8.0; // half-length net → baseline
const COURT_Y = 2.177; // vertical unit used by the normalized ball.z scale
const SINGLES_X = 0.82 * COURT_X;
const DOUBLES_X = 1.08 * COURT_X;
const BASELINE_Z = COURT_Z;
const SERVICE_Z = 0.52 * COURT_Z;
const NET_POST_X = 1.08 * COURT_X;
const NET_POST_H = (1.07 / 2.177) * COURT_Y;
const NET_CENTER_H = (0.914 / 2.177) * COURT_Y;
const TRAIL_COUNT = 18;
const MARK_COUNT = 14;
const WAVER_COUNT = 24;
const HIDDEN_SCALE = 0.0001;
const LOOK_ID = "interior-industrial" as const;

const racketKit = game.racketSports("aura-slam-v2");

interface VenuePalette {
  readonly label: string;
  readonly ground: string;
  readonly apron: string;
  readonly alley: string;
  readonly court: string;
  readonly accent: string;
  readonly hoarding: string;
  readonly crowdWarm: boolean;
  readonly night: boolean;
  readonly moon: boolean;
}

/** Six broadcast venues — same identity as v1, richer accents for v2 dressing. */
const VENUE_PALETTES: Record<string, VenuePalette> = {
  hard:   { label: "NEW YORK HARD",   ground: "#274b63", apron: "#1d3550", alley: "#2f6ea3", court: "#3f88c5", accent: "#d8ff3e", hoarding: "#0e2b46", crowdWarm: false, night: true,  moon: false },
  grass:  { label: "LONDON GRASS",    ground: "#3a5d33", apron: "#31502c", alley: "#4a7a3d", court: "#558b45", accent: "#f6f3e3", hoarding: "#243d1f", crowdWarm: false, night: true,  moon: false },
  clay:   { label: "PARIS CLAY",      ground: "#7a4630", apron: "#6b3d2a", alley: "#9c5c3d", court: "#b0603c", accent: "#ffe9b0", hoarding: "#4d2c1e", crowdWarm: true,  night: true,  moon: false },
  desert: { label: "DUBAI DESERT",    ground: "#8a6b45", apron: "#6d5638", alley: "#9d7c4f", court: "#2472a3", accent: "#ffd76a", hoarding: "#14384f", crowdWarm: true,  night: true,  moon: false },
  beach:  { label: "TROPICAL BEACH",  ground: "#c9ad72", apron: "#b39a63", alley: "#2e8fa8", court: "#3aa8c4", accent: "#ff9a3d", hoarding: "#0f4a5c", crowdWarm: true,  night: false, moon: false },
  moon:   { label: "LUNAR COURT",     ground: "#3c4150", apron: "#2e3340", alley: "#4a5064", court: "#5560c8", accent: "#7dfcff", hoarding: "#141826", crowdWarm: false, night: true,  moon: true }
};

/* ------------------------------------------------------------------ *
 *  Small math helpers                                                 *
 * ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Deterministic 32-bit LCG for any v2-side randomness (crowd colors, confetti). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/* ------------------------------------------------------------------ *
 *  Scene construction                                                 *
 * ------------------------------------------------------------------ */

interface AthleteRigHandles {
  root: string;
  pelvis: any;
  torso: any;
  head: any;
  headband: any;
  upperArmL: any;
  foreArmL: any;
  handL: any;
  upperArmR: any;
  foreArmR: any;
  handR: any;
  thighL: any;
  shinL: any;
  shoeL: any;
  thighR: any;
  shinR: any;
  shoeR: any;
  racketHandle: any;
  racketHead: any;
  racketThroat: any;
  shadow: any;
  ring: any;
  kitTop: any;
  kitShorts: any;
}

function buildAthleteNodes(id: string, isPlayer: boolean): any[] {
  const kit = material.pbr({ color: isPlayer ? "#f2f0e2" : "#26314f", roughness: 0.75 });
  const skin = material.pbr({ color: isPlayer ? "#c68a5a" : "#8a5f42", roughness: 0.8 });
  const accent = material.pbr({ color: isPlayer ? "#d8ff3e" : "#7dfcff", roughness: 0.5 });
  const rubber = material.pbr({ color: "#22262e", roughness: 0.9 });
  const stringMat = material.pbr({ color: "#e8e8d8", roughness: 0.4 });
  const limb = (name: string) =>
    primitives.capsule({ name, size: [1, 1], material: skin }).runtime(game.runtimeNode(name));
  const joint = (name: string, mat = skin) =>
    primitives.sphere({ name, size: [1, 1, 1], material: mat }).runtime(game.runtimeNode(name));

  return [
    // Shadow disc + active-player ring
    primitives.cylinder({ name: `${id}-shadow`, size: [1, 0.01, 1], material: material.pbr({ color: "#000000", roughness: 1, opacity: 0.32 }) }).runtime(game.runtimeNode(`${id}-shadow`)),
    primitives.torus({ name: `${id}-ring`, size: [0.62, 0.03], material: material.emissive({ color: isPlayer ? "#d8ff3e" : "#7dfcff", emissive: isPlayer ? "#d8ff3e" : "#7dfcff", emissiveIntensity: 0.9 }) }).runtime(game.runtimeNode(`${id}-ring`)),
    // Core body
    primitives.box({ name: `${id}-shorts`, size: [0.42, 0.26, 0.27], material: material.pbr({ color: isPlayer ? "#1d2433" : "#ece8d8", roughness: 0.8 }) }).runtime(game.runtimeNode(`${id}-shorts`)),
    primitives.capsule({ name: `${id}-torso`, size: [1, 1], material: kit }).runtime(game.runtimeNode(`${id}-torso`)),
    joint(`${id}-head`, skin),
    primitives.cylinder({ name: `${id}-headband`, size: [1, 1, 1], material: accent }).runtime(game.runtimeNode(`${id}-headband`)),
    // Arms (2-bone IK: shoulder→elbow→hand)
    limb(`${id}-uarm-l`), limb(`${id}-uarm-r`),
    limb(`${id}-farm-l`), limb(`${id}-farm-r`),
    joint(`${id}-hand-l`), joint(`${id}-hand-r`),
    // Legs (2-bone IK: hip→knee→foot)
    limb(`${id}-thigh-l`), limb(`${id}-thigh-r`),
    limb(`${id}-shin-l`), limb(`${id}-shin-r`),
    primitives.box({ name: `${id}-shoe-l`, size: [0.30, 0.11, 0.42], material: rubber }).runtime(game.runtimeNode(`${id}-shoe-l`)),
    primitives.box({ name: `${id}-shoe-r`, size: [0.30, 0.11, 0.42], material: rubber }).runtime(game.runtimeNode(`${id}-shoe-r`)),
    // Racket: handle cylinder + throat + flattened head ring
    primitives.cylinder({ name: `${id}-rhandle`, size: [0.05, 0.42, 0.05], material: material.pbr({ color: "#3a2c20", roughness: 0.85 }) }).runtime(game.runtimeNode(`${id}-rhandle`)),
    primitives.torus({ name: `${id}-rhead`, size: [0.30, 0.035], material: material.pbr({ color: "#20242e", metalness: 0.6, roughness: 0.35 }) }).runtime(game.runtimeNode(`${id}-rhead`)),
    primitives.plane({ name: `${id}-rstrings`, size: [0.52, 0.62], material: material.pbr({ color: "#e8e8d8", roughness: 0.5, opacity: 0.28 }) }).runtime(game.runtimeNode(`${id}-rstrings`))
  ];
}

function buildCourtNodes(): any[] {
  const lineMat = material.pbr({ color: "#f7f5ea", roughness: 0.6, emissive: "#f7f5ea", emissiveIntensity: 0.12 });
  const line = (name: string, w: number, l: number, x: number, z: number) =>
    primitives.box({ name, size: [w, 0.016, l], material: lineMat }).position(x, 0.012, z);

  const nodes: any[] = [
    // Surfaces (materials re-tinted per venue at runtime)
    primitives.plane({ name: "stadium-outer-ground", size: [64, 52], material: material.pbr({ color: "#274b63", roughness: 0.95 }) }).position(0, -0.02, 0).runtime(game.runtimeNode("stadium-outer-ground")),
    primitives.plane({ name: "court-apron", size: [19.4, 21.6], material: material.pbr({ color: "#1d3550", roughness: 0.88 }) }).position(0, -0.005, 0).runtime(game.runtimeNode("court-apron")),
    primitives.plane({ name: "court-doubles-surface", size: [DOUBLES_X * 2, BASELINE_Z * 2], material: material.pbr({ color: "#2f6ea3", roughness: 0.82 }) }).position(0, 0.001, 0).runtime(game.runtimeNode("court-doubles-surface")),
    primitives.plane({ name: "court-singles-surface", size: [SINGLES_X * 2, BASELINE_Z * 2], material: material.pbr({ color: "#3f88c5", roughness: 0.78 }) }).position(0, 0.006, 0).runtime(game.runtimeNode("court-singles-surface"))
  ];

  // Grass mow stripes (hidden unless venue === grass)
  for (let i = 0; i < 8; i++) {
    const w = (DOUBLES_X * 2) / 8;
    nodes.push(
      primitives.plane({ name: `grass-stripe-${i}`, size: [w, BASELINE_Z * 2], material: material.pbr({ color: i % 2 ? "#4f8140" : "#487840", roughness: 0.85 }) })
        .position(-DOUBLES_X + w / 2 + i * w, 0.004, 0)
        .runtime(game.runtimeNode(`grass-stripe-${i}`))
    );
  }

  // Lines: baselines, sidelines, service lines, centre service, net line
  nodes.push(
    line("line-baseline-near", DOUBLES_X * 2 + 0.12, 0.14, 0, BASELINE_Z),
    line("line-baseline-far", DOUBLES_X * 2 + 0.12, 0.14, 0, -BASELINE_Z),
    line("line-sgl-left", 0.1, BASELINE_Z * 2, -SINGLES_X, 0),
    line("line-sgl-right", 0.1, BASELINE_Z * 2, SINGLES_X, 0),
    line("line-dbl-left", 0.1, BASELINE_Z * 2, -DOUBLES_X, 0),
    line("line-dbl-right", 0.1, BASELINE_Z * 2, DOUBLES_X, 0),
    line("line-svc-near", SINGLES_X * 2, 0.1, 0, SERVICE_Z),
    line("line-svc-far", SINGLES_X * 2, 0.1, 0, -SERVICE_Z),
    line("line-centre", 0.08, SERVICE_Z * 2, 0, 0)
  );

  // Net: posts, band, mesh
  nodes.push(
    primitives.cylinder({ name: "net-post-l", size: [0.07, NET_POST_H, 0.07], material: material.pbr({ color: "#20242e", metalness: 0.4, roughness: 0.5 }) }).position(-NET_POST_X, NET_POST_H / 2, 0),
    primitives.cylinder({ name: "net-post-r", size: [0.07, NET_POST_H, 0.07], material: material.pbr({ color: "#20242e", metalness: 0.4, roughness: 0.5 }) }).position(NET_POST_X, NET_POST_H / 2, 0),
    primitives.box({ name: "net-band", size: [NET_POST_X * 2, 0.08, 0.04], material: material.pbr({ color: "#f2f0e2", roughness: 0.6 }) }).position(0, NET_CENTER_H, 0),
    primitives.plane({ name: "net-mesh", size: [NET_POST_X * 2, NET_CENTER_H - 0.04], material: material.pbr({ color: "#14161c", roughness: 0.9, opacity: 0.55 }) }).position(0, (NET_CENTER_H - 0.04) / 2, 0).rotate(Math.PI / 2, 0, 0),
    // Fault LEDs on net posts (runtime materials)
    primitives.sphere({ name: "net-fault-left", size: [0.07, 0.07, 0.07], material: material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 }) }).position(-NET_POST_X, NET_POST_H + 0.06, 0).runtime(game.runtimeNode("net-fault-left")),
    primitives.sphere({ name: "net-fault-right", size: [0.07, 0.07, 0.07], material: material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 }) }).position(NET_POST_X, NET_POST_H + 0.06, 0).runtime(game.runtimeNode("net-fault-right"))
  );

  // Centre-strap
  nodes.push(
    primitives.box({ name: "net-strap", size: [0.05, NET_CENTER_H, 0.06], material: material.pbr({ color: "#e8e8d8", roughness: 0.7 }) }).position(0, NET_CENTER_H / 2, 0)
  );

  return nodes;
}

function buildStadiumNodes(): any[] {
  const rng = makeRng(0x5eed);
  const nodes: any[] = [];

  // --- Bleacher bowl: 3 sides (far + two flanks), 4 tiers of benches ---
  const seatMat = material.pbr({ color: "#1c2733", roughness: 0.85 });
  for (let tier = 0; tier < 4; tier++) {
    const y = 0.7 + tier * 1.15;
    const zFar = -13.2 - tier * 1.9;
    const wFar = 26 + tier * 2.4;
    nodes.push(
      primitives.box({ name: `stand-far-${tier}`, size: [wFar, 0.5, 1.6], material: seatMat }).position(0, y, zFar),
      primitives.box({ name: `stand-near-${tier}`, size: [wFar, 0.5, 1.6], material: seatMat }).position(0, y, 15.4 + tier * 1.9)
    );
    const xSide = 12.6 + tier * 1.9;
    const wSide = 26 + tier * 1.6;
    nodes.push(
      primitives.box({ name: `stand-west-${tier}`, size: [1.6, 0.5, wSide], material: seatMat }).position(-xSide, y, 1.2),
      primitives.box({ name: `stand-east-${tier}`, size: [1.6, 0.5, wSide], material: seatMat }).position(xSide, y, 1.2)
    );
  }

  // --- Crowd: one instanced capsule draw (~400 spectators) ---
  const crowdT: any[] = [];
  const crowdC: string[] = [];
  const warm = ["#c96f4a", "#d8a75c", "#e8d8b0", "#a8563c"];
  const cool = ["#3d5a80", "#98c1d9", "#e0fbfc", "#293241", "#ee6c4d"];
  const crowdCols = cool.concat(warm);
  for (let tier = 0; tier < 4; tier++) {
    const y = 1.15 + tier * 1.15;
    const zFar = -13.2 - tier * 1.9;
    const zNear = 15.4 + tier * 1.9;
    const xSide = 12.6 + tier * 1.9;
    const cols = 26 + tier * 2;
    for (let i = 0; i < cols; i++) {
      if (rng() < 0.14) continue; // gaps in the crowd
      const fx = -12.4 + (24.8 / cols) * i + (rng() - 0.5) * 0.4;
      for (const z of [zFar, zNear]) {
        crowdT.push({ position: [fx, y, z + (rng() - 0.5) * 0.5], scale: [0.34, 0.62 + rng() * 0.2, 0.34] });
        crowdC.push(crowdCols[Math.floor(rng() * crowdCols.length)]);
      }
      for (const x of [-xSide, xSide]) {
        if (i % 2 === 0 && i * 0.5 < 12) {
          crowdT.push({ position: [x + (rng() - 0.5) * 0.5, y, -8 + i * 0.85], scale: [0.34, 0.62 + rng() * 0.2, 0.34] });
          crowdC.push(crowdCols[Math.floor(rng() * crowdCols.length)]);
        }
      }
    }
  }
  nodes.push(
    (instances as any).capsule({ name: "crowd-bowl", transforms: crowdT, colors: crowdC, material: material.pbr({ color: "#ffffff", roughness: 0.9 }) })
  );

  // --- Front-row wavers (runtime-animated cheer squad) ---
  for (let i = 0; i < WAVER_COUNT; i++) {
    const x = -8.4 + i * (16.8 / (WAVER_COUNT - 1));
    nodes.push(
      primitives.capsule({ name: `waver-${i}`, size: [1, 1], material: material.pbr({ color: cool[i % cool.length], roughness: 0.85 }) })
        .position(x, 0.62, i % 2 ? -11.6 : 13.4)
        .runtime(game.runtimeNode(`waver-${i}`))
    );
  }

  // --- Floodlight towers + volumetric light cones + real spots ---
  const towerXY: [number, number][] = [[-13.4, -11.2], [13.4, -11.2], [-13.4, 12.8], [13.4, 12.8]];
  towerXY.forEach(([x, z], i) => {
    nodes.push(
      model(assets.rooftopFloodlightTowerMeshy, { name: `flood-tower-${i}`, targetHeight: 9.5 })
        .position(x, 0, z)
        .rotate(0, Math.atan2(-x, -z), 0),
      lights.spot({ name: `flood-spot-${i}`, position: [x * 0.92, 9.2, z * 0.92], target: [0, 0, 0], angle: 0.55, penumbra: 0.5, intensity: 2.1, color: "#cfe8ff", distance: 60 }),
      effects.lightCone({ name: `flood-cone-${i}`, position: [x * 0.92, 9.0, z * 0.92], direction: [-x * 0.055, -1, -z * 0.055], color: "#bfe0ff", intensity: 0.3, length: 10.4, coneAngle: 0.42, softness: 0.55 } as any)
    );
  });

  // --- Broadcast scoreboard gantry behind far baseline ---
  nodes.push(
    model(assets.rooftopScoreboardRigMeshy, { name: "scoreboard-gantry", targetHeight: 6.4 })
      .position(0, 4.6, -19.6),
    // Scoreboard glow panel (emissive, venue-accented)
    primitives.box({ name: "scoreboard-screen", size: [7.6, 2.6, 0.3], material: material.emissive({ color: "#0d2436", emissive: "#1b4a66", emissiveIntensity: 0.85 }) }).position(0, 6.1, -19.4).runtime(game.runtimeNode("scoreboard-screen")),
    // Championship trophy on a pedestal under the gantry
    model(v2assets.tennisTrophy, { name: "championship-trophy", targetHeight: 2.0 })
      .position(-6.4, 0.9, -15.6),
    primitives.cylinder({ name: "trophy-pedestal", size: [1.1, 0.9, 1.1], material: material.pbr({ color: "#1a2130", roughness: 0.6, metalness: 0.35 }) }).position(-6.4, 0.45, -15.6),
    // Champion statue at the stadium entrance (south, behind player baseline)
    model(v2assets.tennisChampionStatue, { name: "champion-statue", targetHeight: 2.8 })
      .position(8.6, 0.62, 13.9)
      .rotate(0, -0.7, 0),
    primitives.cylinder({ name: "statue-plinth", size: [1.5, 0.62, 1.5], material: material.pbr({ color: "#2a3040", roughness: 0.5, metalness: 0.2 }) }).position(8.6, 0.31, 13.9)
  );

  // --- Umpire chair (Meshy) + seated primitive umpire with tracking head ---
  nodes.push(
    model(v2assets.tennisUmpireChair, { name: "umpire-chair", targetHeight: 4.1 })
      .position(-7.1, 0, -0.4)
      .rotate(0, Math.PI / 2, 0),
    primitives.capsule({ name: "umpire-body", size: [1, 1], material: material.pbr({ color: "#233246", roughness: 0.8 }) }).position(-6.68, 2.1, -0.4).scale(0.5),
    primitives.sphere({ name: "umpire-head", size: [0.24, 0.24, 0.24], material: material.pbr({ color: "#c68a5a", roughness: 0.8 }) }).position(-6.68, 2.62, -0.4).runtime(game.runtimeNode("umpire-head"))
  );

  // --- Line judges (typed rigged catalog humanoids, idle clips) ---
  nodes.push(
    model(assets.rooftopShooterCleanMeshy, { name: "line-judge-l", targetHeight: 1.82 })
      .position(-8.6, 0, 4.6).rotate(0, Math.PI / 2, 0)
      .animate({ clip: "Idle_Loop", loop: true } as any),
    model(assets.rooftopShooterCleanMeshy, { name: "line-judge-r", targetHeight: 1.82 })
      .position(8.6, 0, -4.6).rotate(0, -Math.PI / 2, 0)
      .animate({ clip: "Crouch_Idle_Loop", loop: true } as any)
  );

  // --- Courtside dressing: benches, ball cart, mascot ---
  nodes.push(
    primitives.box({ name: "bench-l", size: [1.9, 0.5, 0.6], material: material.pbr({ color: "#26303e", roughness: 0.7 }) }).position(-8.2, 0.25, 9.6),
    primitives.box({ name: "bench-r", size: [1.9, 0.5, 0.6], material: material.pbr({ color: "#26303e", roughness: 0.7 }) }).position(8.2, 0.25, -9.6),
    model(v2assets.tennisBallCart, { name: "ball-cart", targetHeight: 1.05 })
      .position(-8.2, 0, 10.9),
    model(v2assets.tennisMascot, { name: "stadium-mascot", targetHeight: 1.7 })
      .position(9.4, 0, 8.2)
      .rotate(0, -2.2, 0)
      .runtime(game.runtimeNode("stadium-mascot")),
    // Lunar rover — moon venue only (runtime toggled)
    model(assets.lunarRoverMeshy, { name: "lunar-rover", targetHeight: 2.2 })
      .position(-14.5, 0, -17.5)
      .rotate(0, 0.7, 0)
      .runtime(game.runtimeNode("lunar-rover"))
  );

  // --- Sponsor hoarding ring (emissive, venue accent) ---
  const hoardMat = material.emissive({ color: "#0e2b46", emissive: "#0e2b46", emissiveIntensity: 0.5 });
  for (const [x, z, w, rot] of [[0, -10.6, 17.4, 0], [0, 10.8, 17.4, 0], [-10.4, 0, 21, Math.PI / 2], [10.4, 0, 21, Math.PI / 2]] as const) {
    nodes.push(
      primitives.box({ name: `hoarding-${x}-${z}`, size: [w, 0.85, 0.18], material: hoardMat }).position(x, 0.42, z).rotate(0, rot, 0).runtime(game.runtimeNode(`hoarding-${Math.round(x)}-${Math.round(z)}`))
    );
  }

  // --- Baseline wear decals (authored court scuffing) ---
  for (const [x, z, s] of [[-2.2, 7.6, 1.7], [2.4, 7.5, 1.5], [-1.6, -7.7, 1.6], [2.0, -7.6, 1.8], [0, 0.9, 1.2], [-3.4, -4.0, 1.1]] as const) {
    nodes.push(
      decals.project({ name: `scuff-${x}-${z}`, color: "#000000", size: [s, s * 0.6], opacity: 0.16, position: [x, 0.012, z], normal: [0, 1, 0] })
    );
  }

  // --- Confetti cannon (hidden until a championship is won) ---
  nodes.push(
    effects.particles({ name: "confetti-cannon", position: [0, 3.4, 0], color: "#ffd76a", intensity: 1, visible: false, rate: 60, speed: 4.2, size: 0.06, lifetime: 2.6, spread: 0.9, gravity: -1.4 } as any)
      .runtime(game.runtimeNode("confetti-cannon"))
  );

  return nodes;
}

function buildBallAndCues(): any[] {
  const nodes: any[] = [
    // Match ball + soft blob shadow + retiring ball
    primitives.sphere({ name: "tennis-ball", size: [0.134, 0.134, 0.134], material: material.emissive({ color: "#e6eb8d", emissive: "#e6eb8d", emissiveIntensity: 0.55 }) }).runtime(game.runtimeNode("tennis-ball")),
    primitives.cylinder({ name: "tennis-ball-shadow", size: [0.3, 0.006, 0.3], material: material.pbr({ color: "#000000", opacity: 0.4, roughness: 1 }) }).runtime(game.runtimeNode("tennis-ball-shadow")),
    primitives.sphere({ name: "retiring-ball", size: [0.134, 0.134, 0.134], material: material.emissive({ color: "#d4d988", emissive: "#d4d988", emissiveIntensity: 0.4 }) }).runtime(game.runtimeNode("retiring-ball")),
    // Engine ribbon trail behind the live ball (P2-T5 trail) + classic dot trail
    effects.trail({ name: "ball-ribbon-trail", target: "tennis-ball", color: "#e6eb8d", width: 0.09, maxPoints: 42, intensity: 0.9 } as any),
    // Serve helpers
    primitives.plane({ name: "service-box-highlight", size: [SINGLES_X, SERVICE_Z], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 0.5, opacity: 0.35 }) }).runtime(game.runtimeNode("service-box-highlight")),
    primitives.torus({ name: "serve-aim-ring", size: [0.34, 0.03], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.2 }) }).runtime(game.runtimeNode("serve-aim-ring")),
    primitives.torus({ name: "serve-toss-ring", size: [0.2, 0.025], material: material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: 1.3 }) }).runtime(game.runtimeNode("serve-toss-ring")),
    primitives.torus({ name: "landing-indicator-ring", size: [0.3, 0.028], material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff", emissiveIntensity: 1.1 }) }).runtime(game.runtimeNode("landing-indicator-ring"))
  ];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    nodes.push(
      primitives.sphere({ name: `ball-trail-${i}`, size: [0.096, 0.096, 0.096], material: material.emissive({ color: "#e6eb8d", emissive: "#e6eb8d", emissiveIntensity: 0.35 }) })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }
  for (let i = 0; i < MARK_COUNT; i++) {
    nodes.push(
      primitives.cylinder({ name: `court-mark-${i}`, size: [0.16, 0.005, 0.16], material: material.pbr({ color: "#f7f5ea", opacity: 0.5, roughness: 0.9 }) })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`court-mark-${i}`))
    );
  }
  return nodes;
}

function buildTennisScene(): any {
  const s = scene()
    .add(looks.preset(LOOK_ID, { fogDensityScale: 0.55, exposureEv: 0.06 }))
    .addMany(buildCourtNodes())
    .addMany(buildStadiumNodes())
    .addMany(buildBallAndCues())
    .addMany(buildAthleteNodes("player", true))
    .addMany(buildAthleteNodes("rival", false))
    // Grounding + post: contact shadows under everything, subtle motion blur
    // for smash cam, gentle DOF tuned wide so gameplay stays tack-sharp.
    .add(effects.contactShadows({ intensity: 0.8, length: 0.32 }))
    .add(effects.motionBlur({ intensity: 0.14 }))
    .add(effects.depthOfField({ intensity: 0.12, focusDistance: 34 } as any))
    .add(effects.bloom({ intensity: 0.28, threshold: 0.78 }))
    .camera(
      camera.perspective({
        position: [0, 25.5, 37.1],
        target: [0, 0, 0.7],
        fov: 15
      })
    );
  return s;
}

/* ------------------------------------------------------------------ *
 *  Athlete rig posing (2-bone IK via game.racketSports)                 *
 * ------------------------------------------------------------------ */

interface TennisPoseResult {
  mode: string;
  sliding?: boolean;
  legs: { hip: Vec3; knee: Vec3; foot: Vec3; planted?: boolean }[];
  right: Vec3;
  left: Vec3;
  racketDirection?: Vec3;
  hipY?: number;
  torsoYaw?: number;
  shoulderY?: number;
  headY?: number;
  leanX?: number;
  leanZ?: number;
}

function resolveAthleteRig(app: any, id: string): AthleteRigHandles {
  const req = (n: string) => app.nodes.require(`${id}-${n}`);
  return {
    root: id,
    pelvis: req("shorts"), torso: req("torso"), head: req("head"), headband: req("headband"),
    upperArmL: req("uarm-l"), foreArmL: req("farm-l"), handL: req("hand-l"),
    upperArmR: req("uarm-r"), foreArmR: req("farm-r"), handR: req("hand-r"),
    thighL: req("thigh-l"), shinL: req("shin-l"), shoeL: req("shoe-l"),
    thighR: req("thigh-r"), shinR: req("shin-r"), shoeR: req("shoe-r"),
    racketHandle: req("rhandle"), racketHead: req("rhead"), racketThroat: req("rstrings"),
    shadow: req("shadow"), ring: req("ring"), kitTop: req("torso"), kitShorts: req("shorts")
  };
}

const SKIN_PLAYER = material.pbr({ color: "#c68a5a", roughness: 0.8 });
const SKIN_PLAYER_SUIT = material.pbr({ color: "#dfe6ee", roughness: 0.7, metalness: 0.15 });
const KIT_PLAYER = material.pbr({ color: "#f2f0e2", roughness: 0.75 });
const KIT_PLAYER_SUIT = material.pbr({ color: "#e8ecf2", roughness: 0.6, metalness: 0.2 });
const SKIN_RIVAL = material.pbr({ color: "#8a5f42", roughness: 0.8 });
const SKIN_RIVAL_SUIT = material.pbr({ color: "#cfd6e0", roughness: 0.7, metalness: 0.15 });
const KIT_RIVAL = material.pbr({ color: "#26314f", roughness: 0.75 });
const KIT_RIVAL_SUIT = material.pbr({ color: "#8894a8", roughness: 0.6, metalness: 0.25 });

/**
 * Pose one articulated athlete from TennisPose output. All limb segments are
 * capsules oriented with `orientCylinderBetween`; elbows/knees come from the
 * racket-sports 2-bone IK solver — the same deterministic helpers the ball
 * flight model uses, so rig motion stays coherent with the physics space.
 */
function updateAthleteRig(
  rig: AthleteRigHandles,
  playerState: any,
  pose: TennisPoseResult,
  isPlayer: boolean,
  isMoon: boolean,
  appearanceCache: { lastKey: string }
): void {
  const px = (playerState?.x ?? 0) * COURT_X;
  const pz = (playerState?.y ?? 0) * COURT_Z;
  const py = Math.max(0, (playerState?.z ?? 0) * COURT_Y);
  // TennisPose poses are root-local with forward = local -Z. The near-side
  // athlete (z>0) faces world -Z → yaw 0 keeps the map; the far-side athlete
  // faces +Z → yaw π flips it.
  const yaw = pz >= 0 ? 0 : Math.PI;
  const root: Vec3 = [px, py, pz];
  const uni: Vec3 = [1, 1, 1];
  const W = (local: Vec3) => racketKit.localToWorld(root, yaw, uni, local);

  // Moon suit recolor (cached so we don't churn materials per frame)
  const suitKey = `${isMoon ? "suit" : "kit"}-${isPlayer}`;
  if (appearanceCache.lastKey !== suitKey) {
    appearanceCache.lastKey = suitKey;
    rig.torso.setMaterial(isMoon ? (isPlayer ? KIT_PLAYER_SUIT : KIT_RIVAL_SUIT) : (isPlayer ? KIT_PLAYER : KIT_RIVAL));
    rig.kitShorts.setMaterial(isMoon ? (isPlayer ? KIT_PLAYER_SUIT : KIT_RIVAL_SUIT) : material.pbr({ color: isPlayer ? "#1d2433" : "#ece8d8", roughness: 0.8 }));
    rig.head.setMaterial(isMoon ? (isPlayer ? SKIN_PLAYER_SUIT : SKIN_RIVAL_SUIT) : (isPlayer ? SKIN_PLAYER : SKIN_RIVAL));
  }

  const hipY = pose.hipY ?? 0.92;
  const shoulderY = pose.shoulderY ?? 1.39;
  const headY = pose.headY ?? 1.66;
  const leanX = pose.leanX ?? 0;
  const leanZ = pose.leanZ ?? 0;
  const torsoYaw = pose.torsoYaw ?? 0;

  // Core chain
  const hips = W([0, hipY, 0]);
  const chest = W([leanX, shoulderY, leanZ]);
  const head = W([leanX * 1.4, headY, leanZ * 1.4]);
  racketKit.orientCylinderBetween(rig.torso, hips, chest, 0.21, 0.16);
  rig.pelvis.setPosition(hips[0], hips[1], hips[2]).setRotation(0, yaw + torsoYaw * 0.4, 0).setScale([1, 1, 1]).setVisible(true);
  rig.head.setPosition(head[0], head[1] + 0.12, head[2]).setScale([0.21, 0.24, 0.22]).setVisible(true);
  rig.headband.setPosition(head[0], head[1] + 0.17, head[2]).setRotation(Math.PI / 2, 0, yaw + torsoYaw).setScale([0.24, 0.05, 0.24]).setVisible(true);

  // Arms — 2-bone IK. Shoulders sit beside the chest; hands come from pose.
  const shOff = 0.24;
  const shoulderR = W([shOff, shoulderY + 0.05, leanZ]);
  const shoulderL = W([-shOff, shoulderY + 0.05, leanZ]);
  const handR = W(pose.right ?? [0.3, 1.0, 0.2]);
  const handL = W(pose.left ?? [-0.3, 1.0, 0.2]);
  const elbowR = racketKit.solveArmElbow(shoulderR, handR, 1, 0.3, 0.285);
  const elbowL = racketKit.solveArmElbow(shoulderL, handL, -1, 0.3, 0.285);
  racketKit.orientCylinderBetween(rig.upperArmR, shoulderR, elbowR, 0.055);
  racketKit.orientCylinderBetween(rig.foreArmR, elbowR, handR, 0.047);
  racketKit.orientCylinderBetween(rig.upperArmL, shoulderL, elbowL, 0.055);
  racketKit.orientCylinderBetween(rig.foreArmL, elbowL, handL, 0.047);
  rig.handR.setPosition(handR[0], handR[1], handR[2]).setScale([0.075, 0.075, 0.075]).setVisible(true);
  rig.handL.setPosition(handL[0], handL[1], handL[2]).setScale([0.075, 0.075, 0.075]).setVisible(true);

  // Racket: grip at right hand, head along racketDirection
  const dirLocal = pose.racketDirection ?? [0, 0.4, 0.9];
  const dirWorld = racketKit.localDirToWorld(yaw + torsoYaw * 0.5, dirLocal);
  const dLen = Math.hypot(dirWorld[0], dirWorld[1], dirWorld[2]) || 1;
  const dir: Vec3 = [dirWorld[0] / dLen, dirWorld[1] / dLen, dirWorld[2] / dLen];
  const grip: Vec3 = [handR[0] - dir[0] * 0.06, handR[1] - dir[1] * 0.06, handR[2] - dir[2] * 0.06];
  const butt: Vec3 = [grip[0] - dir[0] * 0.16, grip[1] - dir[1] * 0.16, grip[2] - dir[2] * 0.16];
  const headC: Vec3 = [grip[0] + dir[0] * 0.42, grip[1] + dir[1] * 0.42, grip[2] + dir[2] * 0.42];
  racketKit.orientCylinderBetween(rig.racketHandle, butt, headC, 0.028);
  const euler = racketKit.directionToEulerXYZ(dir[0], dir[1], dir[2]);
  rig.racketHead.setPosition(headC[0], headC[1], headC[2]).setRotation(euler[0], euler[1], euler[2]).setScale([1, 1, 1]).setVisible(true);
  rig.racketThroat.setPosition(headC[0], headC[1], headC[2]).setRotation(euler[0], euler[1], euler[2]).setScale([1, 1, 1]).setVisible(true);

  // Legs — 2-bone IK through pose-provided knees; feet plant on the court.
  for (let i = 0; i < 2; i++) {
    const leg = pose.legs?.[i];
    const side = i === 0 ? -1 : 1;
    const hipL = W([(leg?.hip?.[0] ?? side * 0.14) * 1, (leg?.hip?.[1] ?? hipY), leg?.hip?.[2] ?? 0]);
    const kneeL = leg?.knee ? W(leg.knee) : W([side * 0.16, 0.5, 0]);
    const footL = leg?.foot ? W(leg.foot) : W([side * 0.17, 0.06, 0]);
    const thigh = i === 0 ? rig.thighL : rig.thighR;
    const shin = i === 0 ? rig.shinL : rig.shinR;
    const shoe = i === 0 ? rig.shoeL : rig.shoeR;
    racketKit.orientCylinderBetween(thigh, hipL, kneeL, 0.075);
    racketKit.orientCylinderBetween(shin, kneeL, footL, 0.055);
    shoe.setPosition(footL[0], Math.max(0.055, footL[1]), footL[2]).setRotation(0, yaw, 0).setScale([1, 1, 1]).setVisible(true);
  }

  // Blob shadow + active ring
  rig.shadow.setPosition(px, 0.012, pz).setScale([1.1 - py * 0.1, 1, 1.1 - py * 0.1]).setVisible(true);
  rig.ring.setPosition(px, 0.02, pz).setRotation(Math.PI / 2, 0, 0).setScale(isPlayer ? [1, 1, 1] : [0.85, 0.85, 0.85]).setVisible(true);
}

/* ------------------------------------------------------------------ *
 *  Renderer bridge — window.TennisScene                               *
 * ------------------------------------------------------------------ */

function loadScriptSequentially(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.body.appendChild(script);
  });
}

type CamMode = "menu" | "intro" | "broadcast" | "replay" | "celebrate";

function installAura3DTopTennisRenderer(): void {
  let auraApp: ReturnType<typeof createAuraApp> | null = null;
  let playerRig: AthleteRigHandles | null = null;
  let rivalRig: AthleteRigHandles | null = null;

  let ballHandle: any = null;
  let ballShadowHandle: any = null;
  let retiringBallHandle: any = null;
  let serviceBoxHighlightHandle: any = null;
  let serveAimRingHandle: any = null;
  let serveTossRingHandle: any = null;
  let landingRingHandle: any = null;
  let umpireHeadHandle: any = null;
  let netFaultLeftHandle: any = null;
  let netFaultRightHandle: any = null;
  let outerGroundHandle: any = null;
  let courtApronHandle: any = null;
  let doublesSurfaceHandle: any = null;
  let singlesSurfaceHandle: any = null;
  let grassStripeHandles: any[] = [];
  let trailHandles: any[] = [];
  let markHandles: any[] = [];
  let waverHandles: any[] = [];
  let confettiHandle: any = null;
  let mascotHandle: any = null;
  let lunarRoverHandle: any = null;
  let scoreboardScreenHandle: any = null;
  const hoardingHandles: any[] = [];

  let viewportWidth = 1280;
  let viewportHeight = 800;
  let currentVenueKey = "";
  let lastFaultActive = false;
  let lastBallWorld: Vec3 = [0, 0.8, 6.4];
  let lastPlayerPose: TennisPoseResult | null = null;
  let framesRendered = 0;
  const playerAppearanceCache = { lastKey: "" };
  const rivalAppearanceCache = { lastKey: "" };

  // ---- V2 systems ----
  const eventLog = game.eventLog({ label: "aura-slam-v2 events", maxEvents: 48 });
  let juice: ReturnType<typeof createJuice> | null = null;
  let audio: GameAudioLike | null = null;
  let touchControls: any = null;
  let reducedMotion = false;
  let reducedFlash = false;
  let a11ySettings: any = null;
  let hitStopUntil = 0;
  let frozenBall: Vec3 | null = null;
  let confettiUntil = 0;
  let venueBannerUntil = 0;

  // Camera director state
  const cam = {
    mode: "broadcast" as CamMode,
    eye: [0, 25.5, 37.1] as Vec3,
    target: [0, 0, 0.7] as Vec3,
    fov: 15,
    modeT: 0,
    orbitAngle: 0,
    followX: 0,
    fovKick: 0,
    replayCenter: [0, 0.4, 0] as Vec3
  };
  let prevMode = "";
  let prevPhase = "";
  let prevRallyHits = 0;
  let prevBounceCount = 0;
  let prevLastCall = "";
  let prevGamesA = 0;
  let prevGamesB = 0;
  let lastNow = 0;

  const VENUE_EVENTS: Record<string, { fx?: { kind: any; count?: number; color?: string; speed?: number }; cue?: string; shake?: number; punch?: { fovDeg?: number; dolly?: number; ms?: number }; hitStop?: number; flash?: { color: string; peak: number; ms: number }; rumble?: { ms: number; strong?: number; weak?: number } }> = {
    hit:      { fx: { kind: "spark", count: 10, color: "#e6eb8d", speed: 3.4 }, cue: "ballHit", rumble: { ms: 24, weak: 0.35 }, punch: { fovDeg: 0.6, ms: 90 } },
    serve:    { fx: { kind: "spark", count: 8, color: "#ffd76a", speed: 3.0 }, cue: "racketHit", rumble: { ms: 30, weak: 0.4 } },
    ace:      { fx: { kind: "ring", count: 22, color: "#d8ff3e", speed: 5.5 }, cue: "aceSting", hitStop: 0.085, shake: 0.5, punch: { fovDeg: 3.4, dolly: -0.4, ms: 260 }, flash: { color: "#d8ff3e", peak: 0.22, ms: 140 } },
    smash:    { fx: { kind: "streak", count: 16, color: "#ffd76a", speed: 6.0 }, cue: "smashWhoosh", hitStop: 0.07, shake: 0.42, punch: { fovDeg: 2.6, dolly: -0.3, ms: 220 }, rumble: { ms: 60, strong: 0.6, weak: 0.9 } },
    winner:   { fx: { kind: "ring", count: 16, color: "#7dfcff", speed: 4.4 }, cue: "pointWon", punch: { fovDeg: 1.8, ms: 200 }, flash: { color: "#7dfcff", peak: 0.12, ms: 110 } },
    fault:    { cue: "netLet", flash: { color: "#ff3b30", peak: 0.1, ms: 100 } },
    out:      { fx: { kind: "dust", count: 8, color: "#ff9a3d", speed: 2.2 }, cue: "outCall", flash: { color: "#ff3b30", peak: 0.14, ms: 130 } },
    bounce:   { fx: { kind: "dust", count: 5, color: "#cfc8a8", speed: 1.4 } },
    gameWin:  { cue: "gameSting", shake: 0.3, punch: { fovDeg: 2.2, ms: 300 }, flash: { color: "#d8ff3e", peak: 0.18, ms: 180 } },
    matchWin: { cue: "matchSting", shake: 0.55, punch: { fovDeg: 3.8, dolly: -0.5, ms: 420 }, flash: { color: "#ffd76a", peak: 0.26, ms: 260 } },
    letNet:   { cue: "netLet" }
  };

  function pushEvent(type: string, label: string, severity: "info" | "success" | "warn" = "info", value?: number): void {
    const rec = eventLog.push({ type, label, severity, value, time: performance.now() / 1000, frame: framesRendered });
    const ticker = document.getElementById("v2-event-ticker");
    if (ticker) {
      const item = document.createElement("span");
      item.className = `v2-tick v2-tick-${severity}`;
      item.textContent = rec.label;
      ticker.prepend(item);
      while (ticker.children.length > 5) ticker.lastElementChild?.remove();
      for (const el of Array.from(ticker.children)) el.classList.add("show");
    }
  }

  function juiceFire(ev: string, at?: Record<string, unknown>): void {
    try { juice?.fire(ev as never, at as never); } catch { /* juice/camera layers are best-effort */ }
  }

  function camPose(): { position: Vec3; target: Vec3; fov: number } {
    return { position: cam.eye, target: cam.target, fov: cam.fov };
  }

  function updateCamera(dt: number, state: any): void {
    const now = performance.now() / 1000;
    const mode = state?.mode ?? "menu";
    const phase = state?.phase ?? "";
    cam.modeT += dt;

    // --- Mode transitions ---
    if (mode !== prevMode) {
      prevMode = mode;
      cam.modeT = 0;
      if (mode === "playing") {
        cam.mode = "intro";
        pushEvent("camera", "broadcast cam: intro sweep", "info");
        void audio?.cue("crowd");
      } else if (mode === "menu") {
        cam.mode = "menu";
      } else if (mode === "gameover") {
        cam.mode = "celebrate";
      }
    }
    if (phase !== prevPhase) {
      // Serve contact: toss/swing resolved into a live rally ball
      if ((prevPhase === "serveToss" || prevPhase === "serveSwing" || prevPhase === "serve") && phase === "rally" && cam.mode === "broadcast") {
        juiceFire("serve", { position: lastBallWorld });
        pushEvent("serve", `serve in — ${state?.lastShotSpeed ?? "?"} km/h`, "info");
      }
      if (phase === "pointOver" && cam.mode === "broadcast") {
        const big = /ace|winner|game|break|championship|match/i.test(state?.lastCall ?? "");
        if (big && !reducedMotion) {
          cam.mode = "replay";
          cam.modeT = 0;
          cam.replayCenter = [...lastBallWorld] as Vec3;
          const badge = document.getElementById("v2-replay-badge");
          if (badge) {
            badge.classList.remove("hidden");
            window.setTimeout(() => badge.classList.add("hidden"), 1900);
          }
        }
      }
      prevPhase = phase;
    }

    const ball = state?.ball ?? {};
    const ballSpeed = Math.abs(ball?.lastSpeed ?? state?.lastShotSpeed ?? 0) || 0;
    const kickTarget = clamp(ballSpeed / 190, 0, 1) * 2.2;
    cam.fovKick = lerp(cam.fovKick, kickTarget, 1 - Math.pow(0.02, dt));
    cam.followX = lerp(cam.followX, clamp((ball.x ?? 0) * COURT_X * 0.35, -1.6, 1.6), 1 - Math.pow(0.05, dt));

    if (cam.mode === "menu") {
      cam.orbitAngle += dt * 0.12;
      const r = 27;
      cam.eye = [Math.sin(cam.orbitAngle) * r, 15.5 + Math.sin(cam.orbitAngle * 0.7) * 2, Math.cos(cam.orbitAngle) * r];
      cam.target = [0, 1.2, 0];
      cam.fov = 26;
    } else if (cam.mode === "intro") {
      const t = smoothstep(clamp(cam.modeT / 2.4, 0, 1));
      const start: Vec3 = [-26, 16, -34];
      const mid: Vec3 = [10, 19, 8];
      const end: Vec3 = [0, 25.5, 37.1];
      cam.eye = t < 0.5 ? mix3(start, mid, smoothstep(t * 2)) : mix3(mid, end, smoothstep(t * 2 - 1));
      cam.target = mix3([0, 3, -6], [0, 0, 0.7], t);
      cam.fov = lerp(22, 15, t);
      if (cam.modeT >= 2.4) cam.mode = "broadcast";
    } else if (cam.mode === "replay") {
      const t = clamp(cam.modeT / 1.9, 0, 1);
      const a = -0.8 + t * 1.1;
      const c = cam.replayCenter;
      cam.eye = [c[0] + Math.sin(a) * 5.4, 2.4 + Math.sin(t * Math.PI) * 0.8, c[2] + Math.cos(a) * 5.4];
      cam.target = [c[0], Math.max(0.3, c[1] * 0.5), c[2]];
      cam.fov = lerp(30, 24, t);
      if (cam.modeT >= 1.9) cam.mode = "broadcast";
    } else if (cam.mode === "celebrate") {
      cam.orbitAngle += dt * 0.32;
      const winnerX = (state?.matchWon ? state.player?.x ?? 0 : state?.ai?.x ?? 0) * COURT_X;
      const winnerZ = (state?.matchWon ? state.player?.y ?? 0.6 : state?.ai?.y ?? -0.6) * COURT_Z;
      cam.eye = [winnerX + Math.sin(cam.orbitAngle) * 7.4, 3.1, winnerZ + Math.cos(cam.orbitAngle) * 7.4];
      cam.target = [winnerX, 1.15, winnerZ];
      cam.fov = 24;
    } else {
      // broadcast: long-lens behind the near baseline, drifting with the ball
      const serveDip = phase === "serve" || phase === "serveToss" ? -1.6 : 0;
      const serverShift = state?.server === "player" && (phase === "serve" || phase === "serveToss") ? (state.serveSide === "deuce" ? -1.4 : 1.4) : 0;
      cam.eye = [cam.followX + serverShift, 25.5 + serveDip, 37.1];
      cam.target = [cam.followX * 0.4, serveDip ? 0.9 : 0, 0.7];
      cam.fov = 15 + cam.fovKick;
    }
    auraApp?.camera?.setPose?.(camPose());
  }

  function projectWorldPoint(wx: number, wy: number, wz: number): { x: number; y: number; visible: boolean; ndc: Vec3 } {
    const f = [cam.target[0] - cam.eye[0], cam.target[1] - cam.eye[1], cam.target[2] - cam.eye[2]];
    const fLen = Math.hypot(f[0], f[1], f[2]) || 1;
    const fx = f[0] / fLen, fy = f[1] / fLen, fz = f[2] / fLen;
    const rLen = Math.hypot(fz, fx) || 1;
    const rx = -fz / rLen, ry = 0, rz = fx / rLen;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    const dx = wx - cam.eye[0], dy = wy - cam.eye[1], dz = wz - cam.eye[2];
    const cx = dx * rx + dy * ry + dz * rz;
    const cy = dx * ux + dy * uy + dz * uz;
    const cz = -(dx * fx + dy * fy + dz * fz);
    if (cz >= -0.1) return { x: viewportWidth * 0.5, y: viewportHeight * 0.5, visible: false, ndc: [0, 0, 2] };
    const aspect = Math.max(0.2, viewportWidth / Math.max(1, viewportHeight));
    const tanHalfFov = Math.tan((cam.fov * Math.PI) / 360);
    const ndcX = cx / (-cz * tanHalfFov * aspect);
    const ndcY = cy / (-cz * tanHalfFov);
    const visible = Math.abs(ndcX) <= 1.05 && Math.abs(ndcY) <= 1.05 && cz < -0.1;
    return { x: (ndcX + 1) * 0.5 * viewportWidth, y: (1 - ndcY) * 0.5 * viewportHeight, visible, ndc: [ndcX, ndcY, 0.5] };
  }

  function setupV2Systems(canvas: HTMLCanvasElement): void {
    const params = new URLSearchParams(window.location.search);
    reducedMotion = params.has("reducedMotion") || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
    reducedFlash = params.has("reducedFlash") || (window.matchMedia?.("(prefers-reduced-flash: reduce)")?.matches ?? false);
    a11ySettings = game.accessibility.settings([], { reducedMotion, reducedFlash, highContrast: params.has("highContrast") });

    // FX overlay element (juice flash/vignette driver target)
    const shell = document.querySelector<HTMLElement>(".game-shell") ?? document.body;
    let fxLayer = document.getElementById("v2-fx-layer");
    if (!fxLayer) {
      fxLayer = document.createElement("div");
      fxLayer.id = "v2-fx-layer";
      fxLayer.setAttribute("aria-hidden", "true");
      fxLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;background:transparent;z-index:26;";
      shell.appendChild(fxLayer);
    }

    // Engine game-effects controller bound to the app's VFX spawner
    const fxCtl = (game as any).effects({ app: auraApp, reducedMotion, reducedFlash });
    const FX_KIND_MAP: Record<string, string> = {
      spark: "hit-spark", dust: "ground-dust", debris: "hit-spark", ring: "ring-shockwave",
      streak: "dash-trail", pickup: "aura-burst", "explosion-small": "super-flash", muzzle: "impact-flash",
      splash: "ground-dust", bubble: "aura-burst"
    };
    const fx = createFxParticlePass({
      burst: (kind: string, position: any, o: any) => {
        try {
          fxCtl.spawn(FX_KIND_MAP[kind] ?? "hit-spark", position, { radius: Math.max(0.2, (o?.count ?? 10) / 24), color: o?.color, intensity: 1 });
        } catch { /* app.effects unavailable — fx is best-effort */ }
      }
    });

    const sessionShim: JuiceSession = {
      reducedMotion,
      reducedFlash,
      hitStop: (seconds: number) => { hitStopUntil = performance.now() / 1000 + seconds; frozenBall = [...lastBallWorld] as Vec3; },
      slowMo: () => { /* sessionless route: slow-mo handled by hit-stop hold */ }
    };

    audio = createGameAudio({
      browserContext: true,
      cues: {
        ballHit:    { id: "ballHit", asset: { url: "/toptennis-v2/assets/audio/racket.wav" }, volume: 0.5 },
        racketHit:  { id: "racketHit", asset: { url: "/toptennis-v2/assets/audio/racket.wav" }, volume: 0.55 },
        ballBounce: { id: "ballBounce", asset: { url: sfxUrl(sfx.sports.ballBounceCourt[0]) }, volume: 0.45 },
        netLet:     { id: "netLet", asset: { url: sfxUrl(sfx.sports.netSwish[0]) }, volume: 0.5 },
        aceSting:   { id: "aceSting", asset: { url: sfxUrl(sfx.stinger.checkpoint[0]) }, volume: 0.7 },
        pointWon:   { id: "pointWon", asset: { url: sfxUrl(sfx.stinger.checkpoint[1]) }, volume: 0.5 },
        gameSting:  { id: "gameSting", asset: { url: sfxUrl(sfx.stinger.win[0]) }, volume: 0.8 },
        matchSting: { id: "matchSting", asset: { url: sfxUrl(sfx.stinger.win[1]) }, volume: 0.9 },
        outCall:    { id: "outCall", asset: { url: sfxUrl(sfx.stinger.lose[0]) }, volume: 0.35 },
        smashWhoosh:{ id: "smashWhoosh", asset: { url: sfxUrl(sfx.sports.ballBounceHard[1]) }, volume: 0.6 },
        crowd:      { id: "crowd", asset: { url: sfxUrl(sfx.ambience.crowdSports[0]) }, volume: 0.32, loop: true }
      },
      buses: [{ id: "sfx" } as any]
    } as any);
    // Unlock audio on first gesture
    const unlock = () => { void audio?.unlock(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    juice = createJuice({
      events: VENUE_EVENTS as any,
      camera: (auraApp as any)?.camera as JuiceCamera,
      session: sessionShim,
      fx,
      overlay: createOverlayDriver({ domElement: fxLayer }),
      tweens: createTweenEngine(),
      rumble: createRumbleDriver(),
      sound: { cue: (cue: string) => { void audio?.cue(cue); } }
    } as any);

    // Touch controls — dpad-4btn preset bridging into the legacy keyboard layer
    try {
      const keyFor = (binding: string): string =>
        ({ left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", hit: "Space", lob: "KeyE", drop: "KeyQ", power: "KeyR", block: "KeyQ", light: "Space", heavy: "KeyR", special: "KeyE", jump: "Space" } as Record<string, string>)[binding] ?? binding;
      const sink = {
        press: (b: string) => window.dispatchEvent(new KeyboardEvent("keydown", { code: keyFor(b) })),
        release: (b: string) => window.dispatchEvent(new KeyboardEvent("keyup", { code: keyFor(b) })),
        setAction: (a: string, held: boolean) => {
          const code = keyFor(a);
          window.dispatchEvent(new KeyboardEvent(held ? "keydown" : "keyup", { code }));
        }
      };
      touchControls = mountTouchControls(sink as any, {
        preset: "dpad-4btn",
        bindings: { "stick.left": "left", "stick.right": "right", "stick.up": "up", "stick.down": "down", left: "left", right: "right", light: "hit", heavy: "power", special: "lob", jump: "hit", block: "drop" },
        haptics: { ms: 12 }
      } as any, {
        doc: document as any,
        root: shell as any,
        coarsePointer: () => window.matchMedia?.("(pointer: coarse)")?.matches ?? false
      } as any);
    } catch (e) {
      console.warn("[v2] touch controls unavailable", e);
    }

    pushEvent("system", "v2 broadcast systems online", "success");
  }

  (window as any).TennisScene = {
    createRenderer(canvas: HTMLCanvasElement) {
      auraApp = createAuraApp(canvas, {
        scene: buildTennisScene(),
        ...looks.appOptions(LOOK_ID)
      } as any);

      const req = (id: string) => (auraApp as any).nodes.require(id);
      playerRig = resolveAthleteRig(auraApp, "player");
      rivalRig = resolveAthleteRig(auraApp, "rival");
      ballHandle = req("tennis-ball");
      ballShadowHandle = req("tennis-ball-shadow");
      retiringBallHandle = req("retiring-ball");
      serviceBoxHighlightHandle = req("service-box-highlight");
      serveAimRingHandle = req("serve-aim-ring");
      serveTossRingHandle = req("serve-toss-ring");
      landingRingHandle = req("landing-indicator-ring");
      umpireHeadHandle = req("umpire-head");
      netFaultLeftHandle = req("net-fault-left");
      netFaultRightHandle = req("net-fault-right");
      outerGroundHandle = req("stadium-outer-ground");
      courtApronHandle = req("court-apron");
      doublesSurfaceHandle = req("court-doubles-surface");
      singlesSurfaceHandle = req("court-singles-surface");
      scoreboardScreenHandle = req("scoreboard-screen");
      grassStripeHandles = Array.from({ length: 8 }, (_, i) => req(`grass-stripe-${i}`));
      trailHandles = Array.from({ length: TRAIL_COUNT }, (_, i) => req(`ball-trail-${i}`));
      markHandles = Array.from({ length: MARK_COUNT }, (_, i) => req(`court-mark-${i}`));
      waverHandles = Array.from({ length: WAVER_COUNT }, (_, i) => req(`waver-${i}`));
      // Optional nodes (effects/models may not register runtime handles — degrade gracefully)
      const tryReq = (id: string) => { try { return req(id); } catch { return null; } };
      confettiHandle = tryReq("confetti-cannon");
      mascotHandle = tryReq("stadium-mascot");
      lunarRoverHandle = tryReq("lunar-rover");
      for (const [x, z] of [[0, -10.6], [0, 10.8], [-10.4, 0], [10.4, 0]] as const) {
        const h = tryReq(`hoarding-${Math.round(x)}-${Math.round(z)}`);
        if (h) hoardingHandles.push(h);
      }

      setupV2Systems(canvas);
      document.body.dataset.aura3dReady = "true";
      canvas.dataset.ready = "true";

      function applyVenueMaterials(venue: string): void {
        const key = VENUE_PALETTES[venue] ? venue : "hard";
        if (currentVenueKey === key) return;
        currentVenueKey = key;
        const pal = VENUE_PALETTES[key]!;
        outerGroundHandle?.setMaterial(material.pbr({ color: pal.ground, roughness: 0.94 }));
        courtApronHandle?.setMaterial(material.pbr({ color: pal.apron, roughness: 0.88 }));
        doublesSurfaceHandle?.setMaterial(material.pbr({ color: pal.alley, roughness: 0.82 }));
        singlesSurfaceHandle?.setMaterial(material.pbr({ color: pal.court, roughness: 0.78 }));
        scoreboardScreenHandle?.setMaterial(material.emissive({ color: pal.hoarding, emissive: pal.accent, emissiveIntensity: 0.35 }));
        for (const h of hoardingHandles) {
          h?.setMaterial(material.emissive({ color: pal.hoarding, emissive: pal.accent, emissiveIntensity: 0.4 }));
        }
        const isGrass = key === "grass";
        for (let i = 0; i < grassStripeHandles.length; i++) {
          grassStripeHandles[i]!.setScale(isGrass ? [1, 1, 1] : HIDDEN_SCALE).setVisible(isGrass);
        }
        lunarRoverHandle?.setVisible(pal.moon);
        // Venue ribbon lower-third
        const banner = document.getElementById("v2-venue-banner");
        if (banner) {
          banner.textContent = `${pal.label} — AURA SLAM 3D`;
          banner.classList.remove("hidden");
          venueBannerUntil = performance.now() / 1000 + 2.6;
          window.setTimeout(() => banner.classList.add("hidden"), 2600);
        }
        pushEvent("venue", `venue: ${pal.label.toLowerCase()}`, "info");
      }

      function detectEvents(state: any): void {
        const now = performance.now() / 1000;
        const ball = state?.ball ?? {};
        const lastCall = String(state?.lastCall ?? "");
        const hits = state?.rallyHits ?? 0;
        const score = state?.score ?? {};
        const gamesA = score?.playerGames ?? 0;
        const gamesB = score?.aiGames ?? 0;

        if (lastCall !== prevLastCall) {
          if (lastCall) {
            const lc = lastCall.toLowerCase();
            if (/ace/.test(lc)) { juiceFire("ace", { position: lastBallWorld }); pushEvent("call", lastCall, "success"); }
            else if (/smash|overhead/.test(lc)) { juiceFire("smash", { position: lastBallWorld }); pushEvent("call", lastCall, "success"); }
            else if (/fault|let/.test(lc)) { juiceFire("fault", {}); pushEvent("call", lastCall, "warn"); }
            else if (/out|wide|long/.test(lc)) { juiceFire("out", { position: lastBallWorld }); pushEvent("call", lastCall, "warn"); }
            else if (/winner|game|set|match/.test(lc)) { juiceFire("winner", { position: lastBallWorld }); pushEvent("call", lastCall, "success"); }
            else pushEvent("call", lastCall, "info");
          }
          prevLastCall = lastCall;
        }

        if (hits > prevRallyHits) {
          juiceFire("hit", { position: lastBallWorld, strength: 0.7 });
          if ((state?.lastShotType ?? "").toLowerCase() === "smash") {
            juiceFire("smash", { position: lastBallWorld });
            pushEvent("shot", "overhead smash", "success", state?.lastShotSpeed);
          }
        }
        prevRallyHits = hits;

        const bc = ball?.bounceCount ?? 0;
        if (bc > prevBounceCount && ball?.active) {
          juiceFire("bounce", { position: [lastBallWorld[0], 0.05, lastBallWorld[2]], strength: 0.5 });
        }
        prevBounceCount = bc;

        if (gamesA !== prevGamesA || gamesB !== prevGamesB) {
          juiceFire("gameWin", {});
          pushEvent("score", `game ${Math.max(gamesA, gamesB)}-${Math.min(gamesA, gamesB)}`, "success");
          void audio?.cue("crowd");
          prevGamesA = gamesA; prevGamesB = gamesB;
        }

        if (state?.mode === "gameover" && confettiUntil < now) {
          confettiUntil = now + 5;
          juiceFire("matchWin", { position: [0, 1.2, 0] });
          confettiHandle?.setVisible(true).setPosition(0, 3.2, 0);
          pushEvent("match", "championship decided — confetti!", "success");
          window.setTimeout(() => confettiHandle?.setVisible(false), 5200);
        }
      }

      function render(state: any, serveCue?: any, _tournamentPresentation?: any): void {
        if (!state || !auraApp) return;
        const now = performance.now() / 1000;
        const dt = lastNow ? clamp(now - lastNow, 0.001, 0.05) : 0.016;
        lastNow = now;
        framesRendered += 1;

        const venue = state.venue || "hard";
        const pal = VENUE_PALETTES[VENUE_PALETTES[venue] ? venue : "hard"]!;
        const isMoon = pal.moon;
        applyVenueMaterials(venue);
        detectEvents(state);
        updateCamera(dt, state);
        touchControls?.update?.();

        const frozen = hitStopUntil > now;
        const ball = state.ball ?? { x: 0, y: 0.8, z: 0.3, trail: [] };
        if (!frozen) {
          const bx = (ball.x ?? 0) * COURT_X;
          const by = Math.max(0.072, (ball.z ?? 0.3) * COURT_Y);
          const bz = (ball.y ?? 0) * COURT_Z;
          lastBallWorld = [bx, by, bz];
        } else if (frozenBall) {
          lastBallWorld = frozenBall;
        }
        const [bx, by, bz] = lastBallWorld;

        ballHandle?.setPosition(bx, by, bz).setScale([1, 1, 1]).setVisible(true);
        const shadowScale = clamp(1 - by * 0.16, 0.35, 1.05);
        ballShadowHandle?.setPosition(bx, 0.014, bz).setScale([shadowScale, 1, shadowScale]).setVisible(true);

        if (state.retiringBall) {
          retiringBallHandle?.setPosition(state.retiringBall.x * COURT_X, Math.max(0.072, state.retiringBall.z * COURT_Y), state.retiringBall.y * COURT_Z).setScale([0.92, 0.92, 0.92]).setVisible(true);
        } else {
          retiringBallHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        }

        const trail = Array.isArray(ball.trail) ? ball.trail : [];
        for (let i = 0; i < TRAIL_COUNT; i++) {
          const pt = trail[trail.length - 1 - i];
          if (pt && state.mode === "playing" && (ball.active || state.phase === "serveToss") && !frozen) {
            const s = Math.max(0.25, 1 - i / (TRAIL_COUNT + 1));
            trailHandles[i]!.setPosition(pt.x * COURT_X, Math.max(0.06, pt.z * COURT_Y), pt.y * COURT_Z).setScale([s, s, s]).setVisible(true);
          } else {
            trailHandles[i]!.setScale(HIDDEN_SCALE).setVisible(false);
          }
        }

        const marks = Array.isArray(state.marks) ? state.marks : [];
        for (let i = 0; i < MARK_COUNT; i++) {
          const mk = marks[i];
          if (mk && state.mode !== "menu" && mk.life > 0) {
            markHandles[i]!.setPosition(mk.x * COURT_X, 0.016, mk.y * COURT_Z).setScale([1, 1, 1]).setVisible(true);
          } else {
            markHandles[i]!.setScale(HIDDEN_SCALE).setVisible(false);
          }
        }

        const isPlayerServing = state.mode === "playing" && state.server === "player" && (state.phase === "serve" || state.phase === "serveToss" || state.phase === "serveSwing");
        const serveAim = state.serveAttempt?.lockedAim || state.serveAttempt?.aim;
        if (isPlayerServing && serveAim) {
          const boxSignX = state.serveSide === "deuce" ? -1 : 1;
          serviceBoxHighlightHandle?.setPosition(boxSignX * SINGLES_X * 0.5, 0.011, -SERVICE_Z * 0.5).setScale([1, 1, 1]).setVisible(true);
          serveAimRingHandle?.setPosition(serveAim.x * COURT_X, 0.022, serveAim.y * COURT_Z).setScale([1, 1, 1]).setVisible(true);
        } else {
          serviceBoxHighlightHandle?.setScale(HIDDEN_SCALE).setVisible(false);
          serveAimRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        }

        if (state.mode === "playing" && state.server === "player" && state.phase === "serveToss" && ball.z >= 0.75 && ball.z <= 1.08) {
          serveTossRingHandle?.setPosition(bx, by, bz).setRotation(0, (state.time ?? 0) * 4, 0).setScale([1.15, 1.15, 1.15]).setVisible(true);
        } else {
          serveTossRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        }

        const physicsApi = (window as any).TennisPhysics;
        if (state.mode === "playing" && state.phase === "rally" && ball.active && ball.vy > 0 && ball.bounceCount === 0 && physicsApi?.landing) {
          const land = physicsApi.landing(ball);
          if (land && Number.isFinite(land.x) && Number.isFinite(land.y)) {
            landingRingHandle?.setPosition(land.x * COURT_X, 0.02, land.y * COURT_Z).setScale([1, 1, 1]).setVisible(true);
          } else landingRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);
        } else landingRingHandle?.setScale(HIDDEN_SCALE).setVisible(false);

        const faultOn = Boolean((serveCue?.visible && serveCue?.kind === "fault") || (state.outFeedback && state.outFeedback.remaining > 0));
        if (faultOn !== lastFaultActive) {
          lastFaultActive = faultOn;
          const m = faultOn
            ? material.emissive({ color: "#ff3b30", emissive: "#ff3b30", emissiveIntensity: 1.45 })
            : material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 });
          netFaultLeftHandle?.setMaterial(m);
          netFaultRightHandle?.setMaterial(m);
        }

        const umpireYaw = clamp(-bx * 0.055, -0.42, 0.42);
        umpireHeadHandle?.setPosition(-6.68, 2.62, -0.4).setRotation(0, Math.PI * 0.5 + umpireYaw, 0);

        // Front-row wavers: cheering during pointOver / gameover
        const t = Number(state.time ?? now);
        const cheering = state.phase === "pointOver" || state.mode === "gameover";
        for (let i = 0; i < waverHandles.length; i++) {
          const bounce = cheering ? Math.abs(Math.sin(t * 9 + i * 1.3)) * 0.16 : Math.sin(t * 2.2 + i) * 0.02;
          waverHandles[i]!.setPosition(-8.4 + i * (16.8 / (WAVER_COUNT - 1)), 0.62 + bounce, i % 2 ? -11.6 : 13.4);
        }
        mascotHandle?.setRotation(0, -2.2 + Math.sin(t * 1.6) * 0.25, 0);

        // Articulated athletes
        const poseApi = (window as any).TennisPose;
        if (poseApi?.pose && playerRig && rivalRig && !frozen) {
          const pPose: TennisPoseResult = poseApi.pose(state.player, state);
          const aiPose: TennisPoseResult = poseApi.pose(state.ai, state);
          lastPlayerPose = pPose;
          updateAthleteRig(playerRig, state.player, pPose, true, isMoon, playerAppearanceCache);
          updateAthleteRig(rivalRig, state.ai, aiPose, false, isMoon, rivalAppearanceCache);
        }

        // Evidence
        const evidence = {
          route: "showcase-top-tennis-v2",
          engine: "@aura3d/engine",
          engineVersion: "4.0.1",
          ready: true,
          framesRendered,
          look: LOOK_ID,
          mode: state.mode,
          phase: state.phase,
          cameraMode: cam.mode,
          venue,
          score: state.score,
          playerPosition: [state.player?.x ?? 0, state.player?.y ?? 0.86],
          aiPosition: [state.ai?.x ?? 0, state.ai?.y ?? -0.86],
          ballWorld: lastBallWorld,
          rallyHits: state.rallyHits ?? 0,
          juice: juice?.snapshot?.() ?? null,
          accessibility: a11ySettings ? { reducedMotion: a11ySettings.reducedMotion, reducedFlash: a11ySettings.reducedFlash, highContrast: a11ySettings.highContrast } : null,
          eventLog: eventLog.snapshot(),
          touch: touchControls?.evidence?.() ?? null,
          audio: audio?.evidence ? { unlocked: audio.evidence.unlocked, cueCount: audio.evidence.cueCount, playedCueCount: audio.evidence.playedCueCount } : null,
          meshyAssets: ["tennis-trophy", "tennis-umpire-chair", "tennis-mascot", "tennis-ball-cart", "tennis-champion-statue", "tennis-athlete"],
          hud: (game as any).hud.snapshot({
            bindings: [],
            appState: {
              score: `${state.score?.playerGames ?? 0}-${state.score?.aiGames ?? 0}`,
              points: `${state.score?.playerPoints ?? 0}-${state.score?.aiPoints ?? 0}`,
              server: state.server ?? "player",
              venue
            }
          }),
          hitStop: { active: frozen, until: hitStopUntil },
          deterministic: { ballStepper: "game.racketSports.stepBallPhysics", ik: "solveArmElbow", seed: "lcg:0x5eed" }
        };
        (window as any).__AURA3D_GAME_EVIDENCE__ = evidence;
        (window as any).__AURA3D_GAME__ = evidence;
      }

      function resize(width: number, height: number): void {
        viewportWidth = Math.max(1, width);
        viewportHeight = Math.max(1, height);
      }

      function projectCourt(x: number, y: number, z = 0): { x: number; y: number; visible: boolean } {
        const p = projectWorldPoint(x * COURT_X, Math.max(0.04, z * COURT_Y), y * COURT_Z);
        return { x: p.x, y: p.y, visible: p.visible };
      }

      function debug(): any {
        return {
          type: "aura3d-slam-v2",
          engine: "@aura3d/engine",
          playerStyle: "3d-ik-v2",
          look: LOOK_ID,
          displayBall: [...lastBallWorld],
          camera: { ...camPose(), near: 0.1, far: 180, aspect: viewportWidth / Math.max(1, viewportHeight), mode: cam.mode },
          viewport: { width: viewportWidth, height: viewportHeight, bottom: 0, pixelRatio: window.devicePixelRatio || 1 },
          audience: { visible: true, count: waverHandles.length, instancedBowl: true },
          environment: { venue: currentVenueKey || "hard" },
          umpire: { visible: true, meshyChair: true },
          netPostLights: { active: lastFaultActive },
          outfits: { player: currentVenueKey === "moon" ? "apollo" : "tennis", rival: currentVenueKey === "moon" ? "apollo" : "tennis" },
          playerPose: lastPlayerPose ? { mode: lastPlayerPose.mode, legs: lastPlayerPose.legs, rightHand: lastPlayerPose.right, leftHand: lastPlayerPose.left } : null
        };
      }

      return { render, resize, projectCourt, debug };
    }
  };
}

/* ------------------------------------------------------------------ *
 *  Toolbar + boot                                                     *
 * ------------------------------------------------------------------ */

function bindQuickToolbar(): void {
  const playBtn = document.getElementById("aura-btn-play");
  const practiceBtn = document.getElementById("aura-btn-practice");
  const menuBtn = document.getElementById("aura-btn-menu");
  const venueBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-aura-venue]"));

  function setActiveModeBtn(active: HTMLElement | null): void {
    for (const btn of [playBtn, practiceBtn, menuBtn]) btn?.classList.toggle("active", btn === active);
  }

  function startMode(mode: "single" | "practice", active: HTMLElement | null): void {
    const local = (window as any).TennisLocal;
    const menu = (window as any).TennisMenu;
    const modeRadio = document.querySelector<HTMLInputElement>(`input[name="game-mode"][value="${mode}"]`);
    if (modeRadio) {
      modeRadio.checked = true;
      modeRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    menu?.started?.();
    local?.startOffline?.();
    document.getElementById("menu")?.classList.add("hidden");
    document.getElementById("match-intro")?.setAttribute("hidden", "");
    document.getElementById("match-hud")?.classList.remove("hidden");
    setActiveModeBtn(active);
  }

  playBtn?.addEventListener("click", () => startMode("single", playBtn));
  practiceBtn?.addEventListener("click", () => startMode("practice", practiceBtn));
  menuBtn?.addEventListener("click", () => { (window as any).TennisMenu?.home?.(); setActiveModeBtn(menuBtn); });

  for (const btn of venueBtns) {
    btn.addEventListener("click", () => {
      const v = btn.dataset.auraVenue || "hard";
      for (const b of venueBtns) b.classList.toggle("active", b === btn);
      (window as any).TennisLocal?.selectVenue?.(v);
      const st = (window as any).__TOP_TENNIS_CONTROL__?.getState?.();
      if (st) st.venue = v;
    });
  }

  const params = new URLSearchParams(window.location.search);
  const requestedVenue = params.get("venue");
  if (requestedVenue && VENUE_PALETTES[requestedVenue]) {
    venueBtns.find((b) => b.dataset.auraVenue === requestedVenue)?.click();
  }
  if (params.get("menu") !== "1" && !params.get("mode")) {
    startMode("single", playBtn);
  } else if (params.get("mode") === "practice") {
    startMode("practice", practiceBtn);
  }
}

function injectStylesheet(href: string): void {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function installOfflineApiMocks(): void {
  (window as any).TennisAnalytics = new Proxy({}, { get: () => () => {} });
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    // Re-root any legacy /toptennis/ asset request into the v2 bundle
    if (urlStr.startsWith("/toptennis/")) {
      return origFetch(urlStr.replace("/toptennis/", "/toptennis-v2/") as any, init);
    }
    if (urlStr.includes("/api/games-played")) {
      return new Response(JSON.stringify({ count: 14820 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (urlStr.includes("/api/players-online")) {
      return new Response(JSON.stringify({ online: 28 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (urlStr.includes("/api/tour/me") || urlStr.includes("/api/auth/")) {
      return new Response(JSON.stringify({ authenticated: false, user: null, profile: null }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return origFetch(input, init);
  };
}

async function loadAndRunScriptsInOrder(urls: readonly string[]): Promise<void> {
  const sources = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
      return { url, code: await res.text() };
    })
  );
  for (const { url, code } of sources) {
    const script = document.createElement("script");
    // Re-root legacy bundle-relative references onto the v2 namespace.
    script.text = code.replaceAll("/toptennis/", "/toptennis-v2/") + `\n//# sourceURL=${url}`;
    document.body.appendChild(script);
  }
}

async function bootTopTennisAura3D(): Promise<void> {
  installOfflineApiMocks();

  const cssFiles = [
    "/toptennis-v2/brand.css",
    "/toptennis-v2/matchpoint-fonts.css",
    "/toptennis-v2/styles.css",
    "/toptennis-v2/menu.css",
    "/toptennis-v2/player-select.css",
    "/toptennis-v2/appearance-select.css",
    "/toptennis-v2/multiplayer-build.css",
    "/toptennis-v2/tour.css",
    "/toptennis-v2/tournament-view.css",
    "/toptennis-v2/matchpoint-game.css",
    "/toptennis-v2/controls-settings.css"
  ];
  for (const href of cssFiles) injectStylesheet(href);

  const preRendererScripts = [
    "/toptennis-v2/games-played.js",
    "/toptennis-v2/physics.js",
    "/toptennis-v2/strokes.js",
    "/toptennis-v2/player-pose.js",
    "/toptennis-v2/player-appearance.js",
    "/toptennis-v2/player-characters.js",
    "/toptennis-v2/player-roster.js",
    "/toptennis-v2/match-engine.js",
    "/toptennis-v2/player-select.js",
    "/toptennis-v2/random-id.js",
    "/toptennis-v2/appearance-select.js",
    "/toptennis-v2/multiplayer-build.js",
    "/toptennis-v2/tour-catalog.js",
    "/toptennis-v2/tournament.js",
    "/toptennis-v2/tour-engine-loader.js",
    "/toptennis-v2/tour-client.js",
    "/toptennis-v2/tour-guest.bundle.js",
    "/toptennis-v2/tour-hub.js",
    "/toptennis-v2/tournament-view.js",
    "/toptennis-v2/tennis-audio.js",
    "/toptennis-v2/controls.js",
    "/toptennis-v2/mobile-swipe.js",
    "/toptennis-v2/match-results.js"
  ];
  await loadAndRunScriptsInOrder(preRendererScripts);

  installAura3DTopTennisRenderer();

  const postRendererScripts = [
    "/toptennis-v2/game.js",
    "/toptennis-v2/controls-settings.js",
    "/toptennis-v2/menu-flow.js"
  ];
  await loadAndRunScriptsInOrder(postRendererScripts);

  bindQuickToolbar();

  if (new URLSearchParams(window.location.search).get("play") === "1") {
    setTimeout(() => document.getElementById("aura-btn-play")?.click(), 1200);
  }
}

void bootTopTennisAura3D();
