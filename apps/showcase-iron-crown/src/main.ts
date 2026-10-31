import "../../showcase-port-shared/quickbar.css";
import {
  camera,
  game,
  gameFeel,
  games,
  type AuraRuntimeNodeHandle,
  type AuraVec3,
  type GameCombatWorldSnapshot,
  type GameInputController
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import {
  createCpuBrain,
  dummyIntent,
  IDLE_INTENT,
  seededRng,
  type CpuBrain,
  type Difficulty,
  type DummyStance,
  type Intent
} from "./game/ai";
import {
  animationLayer,
  attackLayerEnabled,
  createFighterAnimationController,
  embeddedClipFor,
  fighterById,
  fighterDriveClipId,
  fighterFacingYaw,
  FIGHTERS,
  isLacquerSwatch,
  isLoopingFighterClip,
  PALETTE_SWATCHES,
  resolveTypedFighterAssets,
  THROW_CLIP_SPEED,
  type FighterClip,
  type FighterDef,
  type FighterId,
  type FighterPalette,
  type PaletteId
} from "./game/fighters";
import { frameDataLine, moveFor, specialChip, type AttackKind } from "./game/moves";
import {
  awardRound,
  BACK_WALK_SCALE,
  canUseSpecial,
  createBoutResultTimer,
  hitCueFor,
  koSlowMo,
  METER_MAX,
  moveAgainst,
  nextComboCount,
  resolveHoldBack,
  ROUNDS_TO_WIN,
  timeUpWinner
} from "./game/rules";
import {
  controlsHint,
  EXTRA_TOUCH_BUTTONS,
  loadBindings,
  TOUCH_BINDINGS
} from "./game/controls";
import { mountControlsSheet } from "./game/controlsSheet";
import { mountExtraTouchButtons } from "./game/touchExtras";
import { DEFAULT_STAGE, stageById, type IronStage, type StageId } from "./game/stages";
import { CROWD_IDS, crowdBob, signFlicker } from "./game/ambientMotion";
import { buildArenaScene } from "./game/arena";
import {
  cinematicPost,
  cinematicShot,
  createCinematicClock,
  FIGHT_LENS,
  hudSlamFor,
  letterboxWanted,
  type CinematicPost,
  type CinematicShot
} from "./game/cinematics";
import { backRimPose, FOLLOW_SPOT_ID, followSpotPose, LETTERBOX_BAR, panelLightId, poseDirection, RIM_IDS, stageLook, type SpotPose } from "./game/look";
import { AMBIENT_EMITTERS, createAmbientVfx, installIronCrownVfx, type IronCrownVfxKind } from "./game/vfx";
import { ORIGINAL_VIGNETTE, venueLookMode } from "./game/originalLook";
import { advanceLadder, createLadder, currentRung, type LadderState } from "./game/ladder";
import { createHud, type MenuId, type ModeId } from "./game/hud";
import "./styles.css";
import { installBlackFrameGuard } from "@aura3d/debug";
import { fightCrops, type QaCrop } from "./game/qaCrops";
import { KO_SCORCH_ID, SCORCH_PARKED, scorchAt } from "./game/flareScorch";

installBlackFrameGuard();

type IronCrownWindow = Window & {
  __AURA3D_GAME__?: { readonly state?: string };
  __AURA3D_GAME_DEBUG__?: unknown;
  __AURA3D_GAME_EVIDENCE__?: unknown;
  __AURA3D_GAME_RUNTIME__?: unknown;
  __AURA3D_SHOWCASE_IRON_CROWN__?: unknown;
  __AURA_QA__?: { crops?: readonly QaCrop[]; [key: string]: unknown };
};

const gameWindow = window as IronCrownWindow;

/* ================================================================ */
/* constants                                                         */
/* ================================================================ */

const ROUND_SECONDS = 60;
const THROW_TECH_FRAMES = 9;
const MIN_FIGHTER_SEPARATION = 1.45;
const PLAYER_START: readonly [number, number, number] = [-2.2, 0, 0];
const RIVAL_START: readonly [number, number, number] = [2.2, 0, 0];
const APP_SEED = 20261012;

const { typedFighterAssets, missingFighterAssets, typedFighterAssetCount } = resolveTypedFighterAssets(assets);
const mediaMatches = (query: string) => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
const reducedMotion = mediaMatches("(prefers-reduced-motion: reduce)");
const highContrast = mediaMatches("(prefers-contrast: more)");
const reducedFlash = reducedMotion;

const params = new URLSearchParams(window.location.search);
const freezeRaw = Number(params.get("freeze"));
const freezeMs = Number.isFinite(freezeRaw) && freezeRaw > 0 ? freezeRaw : null;
let autoDemo = params.get("autoplay") === "1" || params.get("demo") === "1";
let appReady = false;
let userEngaged = false;

const fightingControls = games.fighting.controls();
const safeStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

// Bindings come from localStorage when the player rebound them in the controls sheet (audit IC-14). The input controller
// keeps this object and reads it on every lookup, so the sheet rebinds by replacing entries on `input.actions`.
const inputOptions = {
  actions: loadBindings(safeStorage()) as Record<string, string[]>,
  axes: fightingControls.axes,
  bufferMs: 160,
  gamepad: true
};

/** Stage → ambience loop cue (audit IC-17). */
const STAGE_AMBIENCE: Record<StageId, "amb-city-night" | "amb-city-day" | "amb-crowd-sports" | "amb-wind-open" | "amb-wind-high" | "amb-crowd-arena"> = {
  "neo-tokyo-rooftop": "amb-city-night",
  "bangkok-dock": "amb-city-day",
  "colosseum-ruins": "amb-crowd-sports",
  "desert-airbase": "amb-wind-open",
  "himalayan-monastery": "amb-wind-high",
  "crown-arena": "amb-crowd-arena"
};
/** `?icdebug=1` exposes a small bout hook for the remote capture spec (a results frame without a 60 s software-GL bout). */
const debugHooks = params.get("icdebug") === "1";
/** `?iccontact=0` drops the contact-shadow effect, to measure what the 4.5.0 mask adds on a stage. */
const contactShadowsOn = params.get("iccontact") !== "0";
/** PRD §6.4: `?tier=low` halves weather and VFX particles (the engine tier drops local shadows, AO, DOF and grain). */
const lowTier = params.get("tier") === "low";
/** Upper-body attack layering is on by default (IC47-AN1, `attackLayerEnabled`); `?iclayer=0` turns it off. */
const attackLayerWanted = attackLayerEnabled(params);

/* ================================================================ */
/* state                                                             */
/* ================================================================ */

type Phase = "attract" | "intro" | "fight" | "ko" | "roundEnd" | "boutEnd";

interface BoutConfig {
  mode: ModeId;
  p1: FighterDef;
  cpu: FighterDef;
  stage: IronStage;
  difficulty: Difficulty;
  p1Tint?: FighterPalette;
  cpuTint?: FighterPalette;
}

interface FighterRuntime {
  side: "p1" | "cpu";
  def: FighterDef;
  nodeId: "player" | "rival";
  body: ReturnType<typeof game.kinematicBody>;
  anim: ReturnType<typeof createFighterAnimationController>;
  brain: CpuBrain | null;
  attack: { kind: AttackKind; connected: boolean } | null;
  attackAnim: { kind: AttackKind; timer: number } | null;
  appliedClip: string;
  appliedLoop: boolean;
  appliedSpeed: number;
  guardIntent: boolean;
  lastThrowFrame: number;
  dashT: number;
  lastTapDir: -1 | 0 | 1;
  lastTapAt: number;
  crouching: boolean;
  tint?: FighterPalette;
  /** Upper-body attack layer state (audit IC-15 / anim-phys-11). */
  layer: { mode: "off" | "layered" | "fallback"; active: string | null; timer: number };
}

interface BoutState {
  config: BoutConfig;
  phase: Phase;
  phaseT: number;
  round: number;
  pipsP1: number;
  pipsCpu: number;
  timer: number;
  koTimer: number;
  roundWinner: "p1" | "cpu" | "draw" | null;
  slowmo: number;
  stats: { p1Hits: number; cpuHits: number; maxCombo: number; throws: number; specials: number };
}

const lab = { stance: "stand" as DummyStance, frameData: false };
let studioSelection = { fighter: "kenji" as FighterId, palette: "default" as PaletteId };
let ladder: LadderState | null = null;
let currentStageId: StageId = DEFAULT_STAGE;
let paused = false;
let frozenByQuery = false;
let elapsedMs = 0;
let frameCount = 0;
let lastCancelFlashFrame = -999;
let lastTrailLen = -1;

let P1: FighterRuntime;
let CPU: FighterRuntime;
let state: BoutState;

const rng = seededRng(APP_SEED);
function randomCpu(exclude: FighterId): FighterDef {
  const pool = FIGHTERS.filter((f) => f.id !== exclude && f.id !== "sovereign");
  return pool[Math.floor(rng() * pool.length)] ?? fighterById("volt");
}
function studioPaletteFor(fighter: FighterId): FighterPalette | undefined {
  if (studioSelection.fighter !== fighter || studioSelection.palette === "default") return undefined;
  const sw = PALETTE_SWATCHES.find((p) => p.id === studioSelection.palette);
  if (!sw) return undefined;
  const def = fighterById(fighter);
  return { ...def.palette, color: sw.color, emissive: sw.emissive || def.palette.emissive, lacquer: isLacquerSwatch(sw.id) };
}

/* ================================================================ */
/* scene                                                             */
/* ================================================================ */

/**
 * The venue scene (GU47 WP-15): its own look row, floor, dressing, fighters, follow-spot or sun key, two back rims in
 * the fighters' colours, shafts, weather and post (game/arena.ts, game/look.ts).
 */
function buildArena(cfg: BoutConfig) {
  return buildArenaScene({
    stage: cfg.stage,
    p1: cfg.p1,
    cpu: cfg.cpu,
    p1Tint: cfg.p1Tint,
    cpuTint: cfg.cpuTint,
    typedFighterAssets,
    playerStart: PLAYER_START,
    rivalStart: RIVAL_START,
    contactShadows: contactShadowsOn,
    reducedMotion,
    lowTier,
    // GU47 blind-panel pass: the venues the panel did not judge better default to their 4.6.2 look (`?look=` overrides).
    lookMode: venueLookMode(cfg.stage.id, params)
  });
}

const initialConfig: BoutConfig = {
  mode: "quick",
  p1: fighterById("kenji"),
  cpu: fighterById("volt"),
  stage: stageById(DEFAULT_STAGE),
  difficulty: "scrapper"
};

/* ================================================================ */
/* createGame mount                                                  */
/* ================================================================ */

const fightingGame = createGame({
  id: "showcase-iron-crown",
  target: "#app",
  autoStart: true,
  diagnostics: { overlay: false, performancePanel: false },
  input: inputOptions,
  loop: { fixedDt: 1 / 60 },
  scene: () => buildArena(initialConfig),
  hud: { theme: "fighting", widgets: [] },
  touch: {
    preset: "dpad-4btn",
    bindings: TOUCH_BINDINGS
  },
  sound: {
    cues: {
      hit: { id: "hit", asset: { url: sfxUrl("impact.flesh.medium.00") }, volume: 0.72 },
      "hit-light": { id: "hit-light", asset: { url: sfxUrl("impact.flesh.light.00") }, volume: 0.66 },
      "hit-heavy": { id: "hit-heavy", asset: { url: sfxUrl("impact.flesh.heavy.01") }, volume: 0.8 },
      "hit-special": { id: "hit-special", asset: { url: sfxUrl("impact.energy.medium.00") }, volume: 0.82 },
      lose: { id: "lose", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.75 },
      "amb-city-night": { id: "amb-city-night", bus: "ambience", loop: true, asset: { url: sfxUrl("ambience.city-night") }, volume: 0.32 },
      "amb-city-day": { id: "amb-city-day", bus: "ambience", loop: true, asset: { url: sfxUrl("ambience.city-day") }, volume: 0.3 },
      "amb-crowd-sports": { id: "amb-crowd-sports", bus: "ambience", loop: true, asset: { url: sfxUrl("ambience.crowd-sports") }, volume: 0.3 },
      "amb-wind-open": { id: "amb-wind-open", bus: "ambience", loop: true, asset: { url: sfxUrl("ambience.wind-open") }, volume: 0.3 },
      "amb-wind-high": { id: "amb-wind-high", bus: "ambience", loop: true, asset: { url: sfxUrl("ambience.wind-high") }, volume: 0.3 },
      "amb-crowd-arena": { id: "amb-crowd-arena", bus: "ambience", loop: true, asset: { url: sfxUrl("ambience.crowd-arena") }, volume: 0.34 },
      blocked: { id: "blocked", asset: { url: sfxUrl("impact.metal.light.00") }, volume: 0.6 },
      special: { id: "special", asset: { url: sfxUrl("impact.energy.heavy.00") }, volume: 0.85 },
      dash: { id: "dash", asset: { url: sfxUrl("whoosh.dash.00") }, volume: 0.5 },
      throw: { id: "throw", asset: { url: sfxUrl("impact.flesh.heavy.00") }, volume: 0.7 },
      tech: { id: "tech", asset: { url: sfxUrl("impact.metal.medium.00") }, volume: 0.7 },
      ko: { id: "ko", asset: { url: sfxUrl("explosion.medium.00") }, volume: 0.85 },
      "ko-voice": { id: "ko-voice", asset: { url: sfxUrl("creature.announcer.ko.00") }, volume: 0.9 },
      win: { id: "win", asset: { url: sfxUrl("ui.reward.00") }, volume: 0.8 },
      round: { id: "round", asset: { url: sfxUrl("creature.announcer.round.00") }, volume: 0.8 },
      fight: { id: "fight", asset: { url: sfxUrl("creature.announcer.fight.00") }, volume: 0.9 },
      denied: { id: "denied", asset: { url: sfxUrl("ui.error.00") }, volume: 0.5 }
    }
  },
  juice: {
    hit: { hitStop: 0.05, shake: 0.3, punch: { fovDeg: 1.8, ms: 160 }, rumble: { strong: 0.5, ms: 140 } },
    blocked: { shake: 0.12, rumble: { weak: 0.4, ms: 90 } },
    special: { hitStop: 0.07, punch: { fovDeg: 2.6, ms: 260 }, flash: { color: "#ffd76a", peak: 0.22, ms: 240 }, rumble: { strong: 0.75, ms: 260 } },
    dash: { punch: { fovDeg: 1.1, ms: 120 } },
    ko: { hitStop: 0.12, shake: 0.65, punch: { fovDeg: 3.2, ms: 500 }, flash: { color: "#ff4f46", peak: 0.3, ms: 420 }, rumble: { strong: 1, ms: 600 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      ironCrown: () => ({
        showcase: "__AURA3D_SHOWCASE_IRON_CROWN__",
        handle: gameWindow.__AURA3D_SHOWCASE_IRON_CROWN__ ?? { status: "booting" }
      })
    }
  }
});

const app = fightingGame.app;
// IC47-V1: runtime VFX back on with the Iron Crown preset pack (the floating-dot cause is fixed in the engine, E-F);
// `?vfx=off` turns them off. Reduced motion halves the counts, reduced flash drops the flash lights (game/vfx.ts).
const vfxComfort = { reducedMotion, reducedFlash, lowTier };
const vfxLive = installIronCrownVfx(app.effects, vfxComfort, params.get("vfx"));
/** IC47-V2: the venue's ambient embers, motes or dust (one-shot bursts on a fixed cadence; reset per bout). */
/** The venue's ambient emitters; none on a venue in its 4.6.2 look (4.6.2 had no runtime VFX). */
const ambientEmittersFor = (id: StageId) => (venueLookMode(id, params) === "original" ? [] : AMBIENT_EMITTERS[id]);
let ambientVfx = createAmbientVfx(ambientEmittersFor(DEFAULT_STAGE), vfxComfort);
fightingGame.start();
const input = fightingGame.input as GameInputController;
if (!input) throw new Error("Iron Crown: createGame failed to create runtime-owned input.");
// createGame mounts the touch layer hidden until the first touch; on a coarse pointer (phones, tablets) show it at once
// so players see the controls before they tap (audit IC-01).
if (mediaMatches("(pointer: coarse)")) fightingGame.touch?.setVisible(true);

// The live renderer canvas adopts id="game" (the static placeholder is removed).
document.getElementById("game")?.remove();
if (app.canvas instanceof HTMLCanvasElement) {
  app.canvas.id = "game";
  app.canvas.setAttribute("aria-label", "Iron Crown 3D fight scene");
}
if (!app.canvas) {
  const err = document.getElementById("render-error");
  if (err) err.classList.add("on");
}
window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));

/* ================================================================ */
/* runtime wiring                                                    */
/* ================================================================ */

const combat = game.combatWorld();
const runtimeEffects = game.effects({ poolSize: 80, reducedMotion, reducedFlash });
const director = game.cameraDirector({ reducedMotion });

const baseFightingRig = camera.rigs.fighting({
  fighters: ["player", "rival"],
  minDistance: 4.9,
  maxDistance: 7.0,
  fov: FIGHT_LENS.fov
});
// IC47-C1: letterboxed intro, K.O. and win shots (camera only; the phase windows are unchanged). The bars are two DOM
// strips over the canvas, LETTERBOX_BAR of the viewport each.
const cineClock = createCinematicClock();
const letterbox = (["top", "bottom"] as const).map((edge) => {
  const bar = document.createElement("div");
  bar.className = `ic-letterbox ic-letterbox-${edge}`;
  bar.setAttribute("aria-hidden", "true");
  bar.style.setProperty("--ic-bar", `${LETTERBOX_BAR * 100}vh`);
  document.body.appendChild(bar);
  return bar;
});
let letterboxOn = false;
/** IC47-H1: the last shot's name, for the HUD slams synced to the intro. */
let lastShotName: CinematicShot["name"] | null = null;
/** IC47-P3: real time of the last special or K.O. (the CA and vignette pulse); the last post cue sent. */
let postPulseAt = Number.NEGATIVE_INFINITY;
/** IC47-AN2: real time of the last K.O. (the Crown crowd jumps). */
let crowdCheerAt = Number.NEGATIVE_INFINITY;
let postSent: { dof: string; ca: number; vignette: number } | null = null;
function applyPostCue(cue: CinematicPost): void {
  const post = app.post;
  if (!post) return;
  const dofKey = cue.dof ? `${cue.dof.focusDistance}/${cue.dof.fStop}` : "off";
  if (postSent?.dof !== dofKey) {
    if (cue.dof) post.setEffect("depthOfField", { focusDistance: cue.dof.focusDistance, fStop: cue.dof.fStop });
    post.setEffectEnabled("depthOfField", cue.dof !== null);
  }
  if (postSent?.ca !== cue.chromaticAberration) {
    if (cue.chromaticAberration > 0) post.setEffect("chromaticAberration", { intensity: cue.chromaticAberration });
    post.setEffectEnabled("chromaticAberration", cue.chromaticAberration > 0);
  }
  if (postSent?.vignette !== cue.vignette) post.setEffect("vignette", { intensity: cue.vignette });
  postSent = { dof: dofKey, ca: cue.chromaticAberration, vignette: cue.vignette };
}
function setLetterbox(on: boolean): void {
  if (on === letterboxOn) return;
  letterboxOn = on;
  for (const bar of letterbox) bar.classList.toggle("on", on);
}

app.camera?.use({
  ...baseFightingRig,
  update(ctx) {
    const pose = baseFightingRig.update(ctx);
    if (state && P1 && CPU) {
      const phase = state.phase;
      const winnerSide = phase === "boutEnd" ? (state.pipsP1 >= ROUNDS_TO_WIN ? P1 : state.pipsCpu >= ROUNDS_TO_WIN ? CPU : null) : null;
      const shot = cinematicShot({
        phase,
        t: cineClock.tick(phase, ctx.dt),
        p1: P1.body.position,
        p2: CPU.body.position,
        winner: winnerSide ? winnerSide.body.position : null,
        reducedMotion
      });
      setLetterbox(letterboxWanted(phase, winnerSide !== null));
      const slam = hudSlamFor(lastShotName, shot?.name ?? null);
      lastShotName = shot?.name ?? null;
      if (slam) hud.slam(slam);
      applyPostCue(cinematicPost(shot, performance.now() / 1000 - postPulseAt, (venueLookMode(state.config.stage.id, params) === "original" ? ORIGINAL_VIGNETTE : stageLook(state.config.stage.id).vignette), reducedMotion));
      if (shot) return { ...pose, position: shot.position, target: shot.target, fov: shot.fov };
    }
    const position: [number, number, number] = [pose.position[0], pose.position[1] + FIGHT_LENS.lift, pose.position[2] - 0.15];
    const target: [number, number, number] = [pose.target[0], pose.target[1] + FIGHT_LENS.aim, pose.target[2]];
    // Portrait phones: the rig frames by vertical FOV, so at 390x844 the fighters' start marks (x ±2.2) sat outside the
    // frame. Pull the camera back along its view line until both fighters plus a margin fit the horizontal FOV.
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect < 1.2 && P1 && CPU) {
      const halfWidth = Math.abs(CPU.body.position[0] - P1.body.position[0]) / 2 + 0.9;
      const need = halfWidth / (Math.tan(((pose.fov ?? 40) * Math.PI) / 360) * aspect);
      const off = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
      const dist = Math.hypot(off[0]!, off[1]!, off[2]!);
      if (dist > 0 && need > dist) {
        const k = Math.min(need, 16) / dist;
        return { ...pose, position: [target[0] + off[0]! * k, target[1] + off[1]! * k, target[2] + off[2]! * k], target };
      }
    }
    return { ...pose, position, target };
  }
});
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("fighting");

const hud = createHud(document, {
  onMode: (m) => selectMode(m),
  onStage: (s) => selectStage(s),
  onFighter: (f) => selectFighter(f),
  onAutopilotToggle: () => setAutopilot(!autoDemo),
  onVersusFight: (sel) =>
    void configureBout({
      mode: "versus",
      p1: fighterById(sel.p1),
      cpu: fighterById(sel.cpu),
      stage: stageById(sel.stage),
      difficulty: sel.difficulty,
      p1Tint: studioPaletteFor(sel.p1)
    }),
  onLadderStart: (fighter) => startLadder(fighter),
  onStudioApply: (fighter, palette) => applyStudioPalette(fighter, palette),
  onStudioFight: (fighter, palette) => {
    studioSelection = { fighter, palette };
    void configureBout({
      mode: "quick",
      p1: fighterById(fighter),
      cpu: randomCpu(fighter),
      stage: stageById(currentStageId),
      difficulty: "scrapper",
      p1Tint: studioPaletteFor(fighter)
    });
  },
  onPauseResume: () => setPaused(false),
  onPauseRematch: () => {
    setPaused(false);
    void configureBout(state.config);
  },
  onPauseQuit: () => toMainMenu(),
  onMenuBack: () => closeSheet(),
  onPauseControls: () => openSheet("controls"),
  onLabStance: (stance) => {
    lab.stance = stance as DummyStance;
  },
  onLabReset: () => resetPositions(),
  onFrameData: (on) => {
    lab.frameData = on;
    if (!on) hud.setFrameData(null);
  }
});

function setAutopilot(next: boolean): void {
  autoDemo = next;
  hud.setAutopilotButton(next);
  if (state) {
    hud.setModeLabel(`${modeLabel(state.config.mode)} · ${state.config.stage.label.toUpperCase()}${autoDemo ? " · AUTO" : ""}`);
  }
}

/** Keyboard codes bound to any fight action (rebuilt when the player rebinds). */
let MANUAL_FIGHT_KEYS = new Set<string>();
function refreshManualFightKeys(): void {
  MANUAL_FIGHT_KEYS = new Set(
    Object.entries(input.actions)
      .filter(([action]) => action !== "pause")
      .flatMap(([, codes]) => codes.filter((c) => !c.startsWith("Gamepad")))
  );
}
refreshManualFightKeys();

const controlsSheet = mountControlsSheet(document, {
  actions: input.actions as Record<string, string[]>,
  storage: safeStorage(),
  onChange: () => {
    refreshManualFightKeys();
    if (state && state.config.mode !== "lab") hud.setHint(controlsHint(input.actions));
  },
  onBack: () => setPaused(true)
});
const touchExtras = mountExtraTouchButtons(document, input, EXTRA_TOUCH_BUTTONS, () => fightingGame.touch?.visible ?? false);
app.onFrame(() => touchExtras.sync());

let ambienceCue: (typeof STAGE_AMBIENCE)[StageId] | null = null;
function playStageAmbience(stage: StageId): void {
  const next = STAGE_AMBIENCE[stage];
  if (next === ambienceCue) return;
  if (ambienceCue) fightingGame.sound?.stopCue(ambienceCue, 400);
  ambienceCue = next;
  void fightingGame.sound?.cue(next);
}

// Escape resumes from the pause/sheet layer even while the app loop is paused.
// Any gameplay key disengages AI autopilot immediately so Player 1 has full control.
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && paused) {
    if (controlsSheet.listening) return; // the sheet takes the key (Escape cancels the rebind)
    setPaused(false);
    return;
  }
  if (MANUAL_FIGHT_KEYS.has(ev.code)) {
    userEngaged = true;
    if (autoDemo) {
      setAutopilot(false);
    }
  }
});

function makeFighter(side: "p1" | "cpu", def: FighterDef, position: readonly [number, number, number], tint?: FighterPalette): FighterRuntime {
  const nodeId = side === "p1" ? "player" : "rival";
  const body = game.kinematicBody({
    id: nodeId,
    position,
    bounds: {
      minX: state.config.stage.bounds.minX,
      maxX: state.config.stage.bounds.maxX,
      minY: 0,
      maxY: 3.4,
      minZ: -0.2,
      maxZ: 0.2
    },
    groundY: 0,
    gravity: -26,
    maxSpeed: def.stats.walkSpeed,
    jumpVelocity: def.stats.jumpVelocity,
    groundAccel: 42,
    groundDecel: 55,
    airControl: 0.55,
    coyoteMs: 90,
    jumpBufferMs: 130
  });
  const anim = createFighterAnimationController(`${side}-${def.id}`, def.asset, typedFighterAssets[def.asset]);
  return {
    side,
    def,
    nodeId,
    body,
    anim,
    brain: null,
    attack: null,
    attackAnim: null,
    appliedClip: "",
    appliedLoop: true,
    appliedSpeed: 1,
    guardIntent: false,
    lastThrowFrame: -999,
    dashT: 0,
    lastTapDir: 0,
    lastTapAt: -1,
    crouching: false,
    tint,
    layer: { mode: attackLayerWanted ? "layered" : "off", active: null, timer: 0 }
  };
}

function actorDefaults(f: FighterRuntime) {
  return {
    hurtboxes: [{ id: "body", offset: [0, 0.85, 0] as const, size: [0.72, 1.5, 0.46] as const }],
    guardboxes: [{ id: "guard", offset: [0.34, 0.92, 0] as const, size: [0.68, 1.42, 0.55] as const }],
    pushboxes: [{ id: "push", offset: [0, 0.72, 0] as const, size: [MIN_FIGHTER_SEPARATION, 1.25, 0.5] as const }]
  };
}

function enforceFighterSeparation(): void {
  if (!P1 || !CPU || !state) return;
  const x1 = P1.body.position[0];
  const x2 = CPU.body.position[0];
  const dx = x2 - x1;
  const dist = Math.abs(dx);
  if (dist < MIN_FIGHTER_SEPARATION) {
    const sign = dx >= 0 ? 1 : -1;
    const half = MIN_FIGHTER_SEPARATION * 0.5;
    const minX = state.config.stage.bounds.minX;
    const maxX = state.config.stage.bounds.maxX;
    let mid = (x1 + x2) * 0.5;
    mid = Math.max(minX + half, Math.min(maxX - half, mid));
    const nextP1X = mid - sign * half;
    const nextCpuX = mid + sign * half;
    P1.body.position = [nextP1X, P1.body.position[1], P1.body.position[2]];
    CPU.body.position = [nextCpuX, CPU.body.position[1], CPU.body.position[2]];
    if (P1.body.velocity && sign * P1.body.velocity[0] > 0) {
      P1.body.velocity = [0, P1.body.velocity[1], P1.body.velocity[2]];
    }
    if (CPU.body.velocity && -sign * CPU.body.velocity[0] > 0) {
      CPU.body.velocity = [0, CPU.body.velocity[1], CPU.body.velocity[2]];
    }
  }
}

function resetPositions(): void {
  userEngaged = false;
  P1.body.position = [...PLAYER_START];
  P1.body.velocity = [0, 0, 0];
  CPU.body.position = [...RIVAL_START];
  CPU.body.velocity = [0, 0, 0];
  enforceFighterSeparation();
  syncActors(true);
}

function newBout(config: BoutConfig): void {
  userEngaged = false;
  state = {
    config,
    phase: "fight",
    phaseT: 0,
    round: 1,
    pipsP1: 0,
    pipsCpu: 0,
    timer: ROUND_SECONDS,
    koTimer: 0,
    roundWinner: null,
    slowmo: 1,
    stats: { p1Hits: 0, cpuHits: 0, maxCombo: 0, throws: 0, specials: 0 }
  };
}

/**
 * `setScene` disposes the render device and remounts — expensive (all GLBs
 * reload) and, on some GPU stacks, leaves the canvas dead until the next
 * present. The arena snapshot is fully determined by stage/fighters/tints,
 * so a re-bout with the same signature resets actors on the mounted scene
 * instead of rebuilding it.
 */
let mountedArenaSig: string | undefined;

function arenaSignature(cfg: BoutConfig): string {
  return [cfg.stage.id, cfg.p1.id, cfg.cpu.id, cfg.p1Tint ? JSON.stringify(cfg.p1Tint) : "", cfg.cpuTint ? JSON.stringify(cfg.cpuTint) : ""].join("|");
}

async function configureBout(config: BoutConfig, postPhase?: Phase): Promise<void> {
  if (paused) setPaused(false);
  boutResultTimer.cancel();
  input.clearReplay();
  replayCursor = 0;
  newBout(config);
  playStageAmbience(config.stage.id);
  currentStageId = config.stage.id;
  ambientVfx = createAmbientVfx(ambientEmittersFor(config.stage.id), vfxComfort);
  studioSelection.fighter = config.p1.id;
  const sig = arenaSignature(config);
  if (sig !== mountedArenaSig) {
    mountedArenaSig = sig;
    await fightingGame.setScene(buildArena(config).toJSON());
  }
  resetStageLights();
  // IC47-V3: a re-bout on the mounted scene parks the last bout's scorch again.
  (app.nodes.get(KO_SCORCH_ID) as AuraRuntimeNodeHandle | undefined)?.setPosition(SCORCH_PARKED[0], SCORCH_PARKED[1], SCORCH_PARKED[2]);
  P1 = makeFighter("p1", config.p1, PLAYER_START, config.p1Tint);
  CPU = makeFighter("cpu", config.cpu, RIVAL_START, config.cpuTint);
  P1.brain = createCpuBrain(config.p1, "scrapper", APP_SEED + 7);
  CPU.brain = createCpuBrain(config.cpu, config.difficulty, APP_SEED + 31);
  combat.reset();
  combat.addActor({ id: "player", team: "p1", position: [...PLAYER_START], facing: 1, health: config.p1.stats.maxHealth, ...actorDefaults(P1) });
  combat.addActor({ id: "rival", team: "cpu", position: [...RIVAL_START], facing: -1, health: config.cpu.stats.maxHealth, ...actorDefaults(CPU) });
  snap();
  director.update(0, [
    { id: "player", position: [...PLAYER_START] },
    { id: "rival", position: [...RIVAL_START] }
  ]);
  bindAnimations();
  syncNodes();
  hud.setNames(config.p1.name, config.cpu.name);
  hud.setPips(0, 0);
  hud.setModeLabel(`${modeLabel(config.mode)} · ${config.stage.label.toUpperCase()}${autoDemo ? " · AUTO" : ""}`);
  hud.setStageButtons(config.stage.id);
  hud.setFighterButtons(config.p1.id);
  hud.setAutopilotButton(autoDemo);
  hud.showMenu(null);
  hud.showLab(config.mode === "lab");
  hud.setHint(config.mode === "lab" ? "Dummy stance panel is live — land LIGHT → HEAVY → SPECIAL." : controlsHint(input.actions));
  if (postPhase === "attract") {
    state.phase = "attract";
    hud.setModeLabel("IRON CROWN · ATTRACT");
  } else {
    announceRoundIntro();
  }
}

function bindAnimations(): void {
  const playerNode = app.nodes.get("player") as AuraRuntimeNodeHandle | undefined;
  const rivalNode = app.nodes.get("rival") as AuraRuntimeNodeHandle | undefined;
  playerNode?.setAnimationPose?.(undefined);
  playerNode?.setAnimationBinding?.(undefined);
  rivalNode?.setAnimationPose?.(undefined);
  rivalNode?.setAnimationBinding?.(undefined);
  P1.appliedClip = "";
  CPU.appliedClip = "";
  P1.anim.controller.play(fighterDriveClipId(P1.anim, "idle"), { restart: true, loop: "loop" });
  CPU.anim.controller.play(fighterDriveClipId(CPU.anim, "idle"), { restart: true, loop: "loop" });
  syncAnim(P1, "idle", 0);
  syncAnim(CPU, "idle", 0);
}

function announceRoundIntro(): void {
  state.phase = "fight";
  state.phaseT = 0;
  hud.setRoundLabel(state.config.mode === "lab" ? "COMBO LAB" : `ROUND ${state.round}`);
  const sub =
    state.config.mode === "lab"
      ? "cancel: light → heavy → special"
      : state.config.mode === "ladder" && ladder
        ? (currentRung(ladder)?.title ?? "")
        : "FIGHT!";
  hud.announce(state.config.mode === "lab" ? "COMBO LAB" : `ROUND ${state.round}`, sub, "pop");
  void fightingGame.sound?.cue("round");
}

function modeLabel(mode: ModeId): string {
  switch (mode) {
    case "quick":
      return "QUICK BOUT";
    case "lab":
      return "COMBO LAB";
    case "ladder":
      return "CROWN LADDER";
    case "versus":
      return "VERSUS";
    case "studio":
      return "PLAYER STUDIO";
  }
}

/* ================================================================ */
/* modes + menus                                                     */
/* ================================================================ */

function openSheet(menu: MenuId): void {
  hud.showMenu(menu);
  if (menu === "controls") controlsSheet.render();
  if (!paused) {
    paused = true;
    app.pause();
    startPausedGamepadPoll();
  }
}

function selectFighter(fighter: FighterId): void {
  studioSelection.fighter = fighter;
  hud.setFighterButtons(fighter);
  const cpu = state.config.cpu.id === fighter ? randomCpu(fighter) : state.config.cpu;
  void configureBout({
    ...state.config,
    p1: fighterById(fighter),
    cpu,
    p1Tint: studioPaletteFor(fighter)
  });
}

function selectMode(mode: ModeId): void {
  hud.setModeButtons(mode);
  if (mode === "quick") {
    void configureBout({
      mode: "quick",
      p1: fighterById(studioSelection.fighter),
      cpu: randomCpu(studioSelection.fighter),
      stage: stageById(currentStageId),
      difficulty: "scrapper",
      p1Tint: studioPaletteFor(studioSelection.fighter)
    });
  } else if (mode === "lab") {
    void configureBout({
      mode: "lab",
      p1: fighterById(studioSelection.fighter),
      cpu: fighterById(studioSelection.fighter === "volt" ? "boulder" : "volt"),
      stage: stageById(currentStageId),
      difficulty: "novice",
      p1Tint: studioPaletteFor(studioSelection.fighter)
    });
  } else {
    // Versus, Crown Ladder and Player Studio open their setup sheets (audit IC-14); the sheet's own buttons start the
    // bout, so a click no longer restarts the fight or cycles a palette blind.
    openSheet(mode);
  }
}

function closeSheet(): void {
  hud.setModeButtons(state.config.mode === "studio" ? "quick" : state.config.mode);
  setPaused(false);
}

function selectStage(id: StageId): void {
  currentStageId = id;
  hud.setStageButtons(id);
  // Quick-switch rebuilds the arena everywhere except on the result card.
  if (state.phase !== "boutEnd") {
    void configureBout({ ...state.config, stage: stageById(id) }, state.phase === "attract" ? "attract" : undefined).then(() => {
      if (state.phase === "attract") hud.setModeLabel(`IRON CROWN · ${stageById(id).label.toUpperCase()}`);
    });
  }
}

function startLadder(fighter: FighterId): void {
  ladder = createLadder(fighter);
  const rung = currentRung(ladder);
  if (!rung) return;
  renderLadderBracket();
  hud.setModeButtons("ladder");
  void configureBout({
    mode: "ladder",
    p1: fighterById(fighter),
    cpu: fighterById(rung.opponent),
    stage: stageById(rung.stage),
    difficulty: rung.difficulty,
    p1Tint: studioPaletteFor(fighter)
  }).then(() => hud.announce(`RUNG ${rung.rung} OF 8`, rung.title, "hold"));
}

function renderLadderBracket(): void {
  if (!ladder) return;
  const l = ladder;
  hud.renderBracket(
    l.rungs.map((r, i) => ({
      label: `${r.rung} ${fighterById(r.opponent).name.split(" ")[0]}`,
      state: i < l.cursor ? "won" : i === l.cursor ? "current" : "pending"
    }))
  );
}

function applyStudioPalette(fighter: FighterId, palette: PaletteId): void {
  studioSelection = { fighter, palette };
  const f = fighterById(fighter);
  hud.announce("PALETTE APPLIED", `${f.name} · ${palette.toUpperCase()}`, "pop");
  void configureBout({ ...state.config, p1: f, p1Tint: studioPaletteFor(fighter) });
}

function toMainMenu(): void {
  if (paused) {
    paused = false;
    app.resume();
  }
  hud.setModeButtons("quick");
  void configureBout({ ...initialConfig, stage: stageById(currentStageId) });
}

function setPaused(next: boolean): void {
  paused = next;
  if (next) {
    hud.showMenu("pause");
    app.pause();
    (document.getElementById("pause-resume") as HTMLButtonElement | null)?.focus({ preventScroll: true });
    startPausedGamepadPoll();
  } else {
    controlsSheet.cancelListening();
    hud.showMenu(null);
    app.resume();
  }
}

/**
 * The app loop (and with it the engine's gamepad polling) stops while paused, so a small rAF loop reads the pad directly
 * and resumes on a fresh Start or B press (audit IC-05). Buttons held when the pause opened must be released first, and
 * the resume fires on the release so the press does not reach the fight as a new Start (pause) or B (special) edge.
 */
let padPollActive = false;
function startPausedGamepadPoll(): void {
  if (padPollActive || typeof navigator.getGamepads !== "function") return;
  padPollActive = true;
  const RESUME_BUTTONS = [9, 1]; // standard mapping: Start, B
  let phase: "wait-release" | "armed" | "pressed" = "wait-release";
  const tick = (): void => {
    if (!paused) {
      padPollActive = false;
      return;
    }
    let down = false;
    for (const pad of navigator.getGamepads()) {
      if (pad && RESUME_BUTTONS.some((i) => pad.buttons[i]?.pressed)) down = true;
    }
    if (phase === "wait-release" && !down) phase = "armed";
    else if (phase === "armed" && down) phase = "pressed";
    else if (phase === "pressed" && !down) {
      padPollActive = false;
      setPaused(false);
      return;
    }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

/* ================================================================ */
/* combat helpers                                                    */
/* ================================================================ */

function facingTo(self: FighterRuntime, foe: FighterRuntime): 1 | -1 {
  return foe.body.position[0] >= self.body.position[0] ? 1 : -1;
}

// One combat snapshot per sim stage instead of one per query (audit IC-11: `snap()` used to run about 15 full snapshots a
// step). `snap()` refreshes the cache at the points where the combat world changed (step start, after the combat update,
// after a reset); every other read goes through `cur()`.
let combatSnapCache: ReturnType<typeof combat.snapshot> | null = null;
let snapshotsThisFrame = 0;
let lastFrameSnapshots = 0;
function snap() {
  snapshotsThisFrame += 1;
  combatSnapCache = combat.snapshot();
  return combatSnapCache;
}
function cur() {
  return combatSnapCache ?? snap();
}

function actorSnap(id: string): GameCombatWorldSnapshot["actors"][number] | undefined {
  return cur().actors.find((a) => a.id === id);
}

function isAttacking(f: FighterRuntime): boolean {
  return cur().activeAttacks.some((a) => a.attackerId === f.nodeId);
}

const TIER: Record<AttackKind, number> = { light: 1, throw: 1.5, heavy: 2, special: 3 };

function tryAttack(f: FighterRuntime, foe: FighterRuntime, kind: AttackKind): void {
  const asnap = actorSnap(f.nodeId);
  if (!asnap || asnap.knockedOut || asnap.stun > 0) return;
  if (isAttacking(f)) {
    // Cancel chain: only from a CONNECTED attack into a higher tier
    // (light → throw/heavy → special, all the way down the chain).
    const last = f.attack;
    if (!last || !last.connected || TIER[kind] <= TIER[last.kind]) return;
  }
  if (kind === "special") {
    // A special costs the full SUPER meter for both sides (audit IC-02).
    if (!canUseSpecial(asnap.meter)) {
      if (f.side === "p1") {
        void fightingGame.sound?.cue("denied");
        hud.announce("NEED FULL SUPER", "", "pop");
      }
      return;
    }
    combat.setActor(f.nodeId, { meter: 0 });
    state.stats.specials += 1;
    const pos = f.body.position;
    runtimeEffects.auraBurst([pos[0], pos[1] + 0.9, 0], { ownerId: f.nodeId, intensity: 0.85, color: f.def.special.color });
    runtimeEffects.ringShockwave([pos[0] + facingTo(f, foe) * 0.5, pos[1] + 0.9, 0], { ownerId: f.nodeId, intensity: 0.7, color: f.def.special.color });
    fxBurst("ic-special-burst", [pos[0], pos[1] + 0.9, 0], f.def.special.color);
    postPulseAt = performance.now() / 1000;
    director.special([pos[0], pos[1] + 0.9, 0], 0.5);
    fightingGame.juice.fire("special");
    void fightingGame.sound?.cue("special");
    if (f.side === "p1") hud.announce(f.def.special.name.toUpperCase(), "", "pop");
    app.feel?.emit("special", { strength: 0.7 });
  }
  if (kind === "throw") {
    f.lastThrowFrame = cur().frame;
    state.stats.throws += 1;
    void fightingGame.sound?.cue("throw");
  }
  // Damage is scaled by the target's defense before the engine applies it (audit IC-03).
  combat.beginAttack(f.nodeId, moveAgainst(kind, f.def, foe.def));
  startAttackLayer(f, kind);
  f.attack = { kind, connected: false };
  const holdDuration = kind === "special" ? 0.85 : kind === "heavy" || kind === "throw" ? 0.62 : 0.52;
  f.attackAnim = { kind, timer: holdDuration };
  f.appliedClip = "";
  if (state.config.mode === "lab" && f.side === "p1" && lab.frameData) {
    hud.setFrameData(frameDataLine(moveFor(kind, f.def)));
  }
}

function syncActors(force = false): void {
  for (const f of [P1, CPU]) {
    const foe = f === P1 ? CPU : P1;
    const asnap = actorSnap(f.nodeId);
    if (!asnap) continue;
    const facing = f.attack ? asnap.facing : facingTo(f, foe);
    combat.setActor(f.nodeId, {
      position: [f.body.position[0], f.body.position[1], f.body.position[2]],
      facing,
      guarding: (f.guardIntent || f.crouching) && f.body.grounded && !f.attack,
      guardboxes: [{ id: "guard", offset: [facing * 0.26, 0.92, 0], size: [0.55, 1.42, 0.55] }],
      hurtboxes: [{ id: "body", offset: [0, f.crouching ? 0.55 : 0.85, 0], size: [0.6, f.crouching ? 1.0 : 1.5, 0.46] }],
      ...(force ? { health: f.def.stats.maxHealth, meter: 0, guard: 100 } : {})
    });
    if (asnap.meter > METER_MAX) combat.setActor(f.nodeId, { meter: METER_MAX });
    // clear attack bookkeeping once the engine's attack expires
    if (f.attack && !cur().activeAttacks.some((a) => a.attackerId === f.nodeId)) f.attack = null;
  }
}

function syncBodiesFromActors(): void {
  for (const f of [P1, CPU]) {
    const asnap = actorSnap(f.nodeId);
    if (!asnap) continue;
    const dx = asnap.position[0] - f.body.position[0];
    const dz = asnap.position[2] - f.body.position[2];
    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
      f.body.position = [asnap.position[0], f.body.position[1], asnap.position[2]];
    }
  }
}

/* ================================================================ */
/* intents                                                           */
/* ================================================================ */

function playerIntent(): Intent {
  const axis = input.axis("moveX");
  const foeDir = facingTo(P1, CPU);
  const crouch = input.held("crouch");
  // Block = guard key (stand still) OR holding away, which guards while walking back (away+crouch = low block).
  // Shift while holding away is a back-dash (audit IC-06).
  const hold = resolveHoldBack(axis, foeDir, input.held("guard"));
  const guard = hold.guard;

  let dash: -1 | 0 | 1 = 0;
  if (input.pressed("dash")) dash = hold.dashDir;
  const tapNow = input.pressed("moveLeft") ? -1 : input.pressed("moveRight") ? 1 : 0;
  if (tapNow !== 0) {
    const now = performance.now() / 1000;
    if (P1.lastTapDir === tapNow && now - P1.lastTapAt < 0.28) dash = tapNow as -1 | 1;
    P1.lastTapDir = tapNow as -1 | 1;
    P1.lastTapAt = now;
  }

  let attack: AttackKind | undefined;
  if (input.buffered("special", 180)) attack = "special";
  else if (input.buffered("throw", 160)) attack = "throw";
  else if (input.buffered("heavy", 160)) attack = "heavy";
  else if (input.buffered("light", 160)) attack = "light";
  if (attack) input.consume(attack);

  const jump = input.pressed("jump") || input.buffered("jump", 140);

  return { axis, crouch, guard, jump, dash, attack, walkBack: hold.walkBack };
}

function aiCtx(self: FighterRuntime, foe: FighterRuntime) {
  const sSnap = actorSnap(self.nodeId);
  const fSnap = actorSnap(foe.nodeId);
  return {
    selfX: self.body.position[0],
    foeX: foe.body.position[0],
    foeAirborne: !foe.body.grounded,
    foeStunned: (fSnap?.stun ?? 0) > 0,
    foeAttacking: isAttacking(foe),
    selfStunned: (sSnap?.stun ?? 0) > 0,
    selfAttacking: isAttacking(self),
    meter: sSnap?.meter ?? 0,
    foeHealthPct: fSnap ? fSnap.health / foe.def.stats.maxHealth : 1
  };
}

function cpuIntent(dt: number): Intent {
  if (state.config.mode === "lab" && lab.stance !== "cpu") {
    return dummyIntent(lab.stance, null, aiCtx(CPU, P1), dt);
  }
  if (!CPU.brain) return IDLE_INTENT;
  return CPU.brain.think(aiCtx(CPU, P1), dt);
}

/* ================================================================ */
/* drive + combat events                                             */
/* ================================================================ */

function driveFighter(f: FighterRuntime, foe: FighterRuntime, intent: Intent, dt: number): void {
  const asnap = actorSnap(f.nodeId);
  const ko = asnap?.knockedOut ?? false;
  const stunned = (asnap?.stun ?? 0) > 0;
  const busy = f.attack !== null && isAttacking(f);
  f.crouching = intent.crouch && !stunned && !busy && f.body.grounded && !ko;
  f.guardIntent = intent.guard && !stunned && !busy && !ko;

  const foeDir = facingTo(f, foe);
  const dist = Math.abs(foe.body.position[0] - f.body.position[0]);
  const movingTowardFoe = intent.axis * foeDir > 0;
  const walkBack = intent.walkBack === true && !movingTowardFoe;
  const canMove = !ko && !stunned && !busy && !f.crouching && (!f.guardIntent || walkBack);
  const axisScale = f.guardIntent && walkBack ? BACK_WALK_SCALE : 1;
  const effectiveAxis = canMove && !(movingTowardFoe && dist <= MIN_FIGHTER_SEPARATION + 0.04) ? intent.axis * axisScale : 0;
  f.body.move(effectiveAxis);

  if (!ko && !stunned && !busy && !f.guardIntent && !f.crouching && intent.jump && f.body.grounded) {
    f.body.jump();
  }

  const dashingTowardFoe = intent.dash * foeDir > 0;
  if (!ko && !stunned && (!f.guardIntent || walkBack) && intent.dash !== 0 && f.dashT <= 0 && !(dashingTowardFoe && dist <= MIN_FIGHTER_SEPARATION + 0.22)) {
    f.dashT = 0.34;
    f.body.dash([intent.dash, 0, 0], f.def.stats.dashSpeed);
    runtimeEffects.dashTrail([f.body.position[0], f.body.position[1] + 0.7, 0], { ownerId: f.nodeId, intensity: 0.5 });
    fightingGame.juice.fire("dash");
    void fightingGame.sound?.cue("dash");
  }
  f.dashT = Math.max(0, f.dashT - dt);

  if (!ko && !stunned && (!f.guardIntent || walkBack) && intent.attack) {
    tryAttack(f, foe, intent.attack);
  }
}

const combo = {
  p1: { count: 0, timer: 0 },
  cpu: { count: 0, timer: 0 }
};

/** Target stun (frames) before this step's combat update: a hit only extends a combo while the target was still in hitstun. */
const stunBeforeUpdate = { player: 0, rival: 0 };
function recordStunBeforeUpdate(): void {
  // combat.update decrements stun by one before resolving hits, so "still in hitstun" means more than one frame left.
  stunBeforeUpdate.player = actorSnap("player")?.stun ?? 0;
  stunBeforeUpdate.rival = actorSnap("rival")?.stun ?? 0;
}
/** Whether the last stun on each fighter came from a hit (blockstun does not keep a combo alive). */
const lastStunFromHit = { player: false, rival: false };

function handleEvents(): void {
  for (const ev of combat.consumeEvents()) {
    const attacker = ev.attackerId === "player" ? P1 : CPU;
    const target = ev.targetId === "player" ? P1 : ev.targetId === "rival" ? CPU : undefined;
    if (ev.type === "hit" && target) {
      // Damage already carries the target's defense (moveAgainst), so the engine's own knockout check is the truth.
      const raw = ev.damage ?? 0;
      const tKey = target.nodeId;
      const inHitstun = stunBeforeUpdate[tKey] > 1 && lastStunFromHit[tKey];
      lastStunFromHit[tKey] = true;
      if (attacker.attack) attacker.attack.connected = true;
      runtimeEffects.hitSpark(ev.position, { ownerId: ev.attackerId, intensity: 1.05 });
      fxBurst("ic-forge-spark", ev.position);
      director.impact(0.42, 0.16);
      fightingGame.juice.fire("hit");
      void fightingGame.sound?.cue(hitCueFor(ev.moveId));
      app.feel?.emit(ev.moveId?.includes("special") ? "hit-special" : ev.moveId?.includes("heavy") ? "hit-heavy" : "hit-light", { strength: 0.6 });
      if (ev.knockback) {
        target.body.applyKnockback([ev.knockback[0] * 3.0, Math.abs(ev.knockback[1]) * 2.4, 0]);
      }
      const tMeter = (actorSnap(target.nodeId)?.meter ?? 0) + raw * 0.45 * target.def.stats.meterGain;
      combat.setActor(target.nodeId, { meter: Math.min(METER_MAX, tMeter) });
      combo[attacker.side].count = nextComboCount(combo[attacker.side].count, inHitstun);
      combo[attacker.side].timer = 1.35;
      combo[target.side].count = 0;
      state.stats.maxCombo = Math.max(state.stats.maxCombo, combo[attacker.side].count);
      if (attacker.side === "p1") state.stats.p1Hits += 1;
      else state.stats.cpuHits += 1;
      if (state.config.mode === "lab" && attacker.side === "p1" && attacker.attack?.kind === "special" && cur().frame - lastCancelFlashFrame > 90) {
        lastCancelFlashFrame = cur().frame;
        hud.cancelFlash();
      }
    }
    if (ev.type === "blocked" && target) {
      lastStunFromHit[target.nodeId] = false;
      runtimeEffects.blockSpark(ev.position, { ownerId: ev.attackerId, intensity: 0.7 });
      fxBurst("ic-guard-ember", ev.position);
      director.impact(0.16, 0.12);
      fightingGame.juice.fire("blocked");
      void fightingGame.sound?.cue("blocked");
      app.feel?.emit("block", { strength: 0.3 });
      if (attacker.attack) attacker.attack.connected = true; // chains off block too
      if (ev.moveId?.endsWith("-special")) {
        const tSnap = actorSnap(target.nodeId);
        if (tSnap) {
          const chip = specialChip(moveFor("special", attacker.def)) * target.def.stats.defense;
          // Chip never kills (floored at 1 HP), so it cannot reach the engine's knockout latch.
          combat.setActor(target.nodeId, { health: Math.max(1, tSnap.health - chip) });
        }
      }
    }
    if (ev.type === "knockout" && ev.targetId) {
      onKnockout(ev.targetId === "player" ? "cpu" : "p1");
    }
  }
}

function onKnockout(winner: "p1" | "cpu"): void {
  postPulseAt = performance.now() / 1000;
  crowdCheerAt = postPulseAt;
  if (state.phase !== "fight") return;
  state.phase = "ko";
  state.koTimer = 0;
  state.roundWinner = winner;
  // One time-scale source (the session), none under reduced motion (audit IC-08).
  const slow = koSlowMo(reducedMotion);
  if (slow) fightingGame.session.slowMo(slow.scale, slow.ms);
  hud.announce("K.O.", "", "hold");
  void fightingGame.sound?.cue("ko");
  void fightingGame.sound?.cue("ko-voice");
  director.impact(0.7, 0.5);
  runtimeEffects.impactFlash([0, 1.2, -0.4], { intensity: 1.1, color: "#ffd76a" });
  const loser = winner === "p1" ? CPU : P1;
  fxBurst("ic-ko-shower", [loser.body.position[0], loser.body.position[1] + 1.0, 0]);
  // IC47-V3: the scorch lands under the loser and stays for the rest of the scene.
  const scorch = scorchAt(loser.body.position);
  (app.nodes.get(KO_SCORCH_ID) as AuraRuntimeNodeHandle | undefined)?.setPosition(scorch[0], scorch[1], scorch[2]);
  fightingGame.juice.fire("ko");
  app.feel?.emit("ko", { strength: 1 });
}

// The result card shows 1.6 s after the bout ends. A new bout cancels it (audit IC-04).
const boutResultTimer = createBoutResultTimer();

function endRound(winner: "p1" | "cpu" | "draw"): void {
  const award = awardRound({ p1: state.pipsP1, cpu: state.pipsCpu }, winner);
  state.pipsP1 = award.p1;
  state.pipsCpu = award.cpu;
  hud.setPips(state.pipsP1, state.pipsCpu);
  if (award.boutOver) {
    state.phase = "boutEnd";
    state.phaseT = 0;
    const p1Won = award.p1Won;
    void fightingGame.sound?.cue(p1Won ? "win" : "lose");
    // IC47-V2: gold confetti over the winner on the hero shot.
    const champ = p1Won ? P1 : CPU;
    fxBurst("ic-win-confetti", [champ.body.position[0], champ.body.position[1] + 2.4, 0]);
    hud.announce(p1Won ? "YOU WIN" : "YOU LOSE", state.config.mode === "ladder" ? "the crown waits" : "", "hold");
    boutResultTimer.schedule(() => {
      if (state.phase === "boutEnd") showBoutResult(p1Won);
    }, 1600);
  } else {
    state.phase = "roundEnd";
    state.phaseT = 0;
    hud.announce(winner === "draw" ? "DRAW" : winner === "p1" ? "ROUND WON" : "ROUND LOST", winner === "draw" ? "again!" : "", "pop");
  }
}

function showBoutResult(p1Won: boolean): void {
  const st = state.stats;
  const stats = [
    { label: "Hits", value: `${st.p1Hits} / ${st.cpuHits}` },
    { label: "Max combo", value: `${st.maxCombo}` },
    { label: "Specials", value: `${st.specials}` },
    { label: "Throws", value: `${st.throws}` }
  ];
  const cfg = state.config;
  if (autoDemo) {
    if (cfg.mode === "ladder" && ladder) {
      const l = ladder;
      if (p1Won) {
        advanceLadder(l);
        renderLadderBracket();
        if (l.cleared) {
          startLadder(cfg.p1.id);
          return;
        }
      }
      const rung = currentRung(l);
      if (rung) {
        void configureBout({
          mode: "ladder",
          p1: fighterById(l.playerFighter),
          cpu: fighterById(rung.opponent),
          stage: stageById(rung.stage),
          difficulty: rung.difficulty,
          p1Tint: studioPaletteFor(l.playerFighter)
        }).then(() => hud.announce(`RUNG ${rung.rung} OF 8`, rung.title, "hold"));
        return;
      }
    }
    void configureBout({
      ...cfg,
      cpu: randomCpu(cfg.p1.id)
    });
    return;
  }
  if (cfg.mode === "ladder" && ladder) {
    const l = ladder;
    if (p1Won) {
      advanceLadder(l);
      renderLadderBracket();
      if (l.cleared) {
        hud.showResult({
          title: "IRON CROWN CLAIMED",
          sub: `${cfg.p1.name} takes the throne — all 8 rungs cleared.`,
          stats,
          primary: { label: "DEFEND THE CROWN", run: () => startLadder(cfg.p1.id) },
          alt: { label: "Main menu", run: () => toMainMenu() }
        });
        return;
      }
      const next = currentRung(l);
      hud.showResult({
        title: `RUNG ${l.cursor} CLEARED`,
        sub: next ? `Next: ${fighterById(next.opponent).name} — ${next.title}` : "",
        stats,
        primary: {
          label: "NEXT RUNG",
          run: () => {
            const rung = currentRung(l);
            if (!rung) return;
            void configureBout({
              mode: "ladder",
              p1: fighterById(l.playerFighter),
              cpu: fighterById(rung.opponent),
              stage: stageById(rung.stage),
              difficulty: rung.difficulty,
              p1Tint: studioPaletteFor(l.playerFighter)
            }).then(() => hud.announce(`RUNG ${rung.rung} OF 8`, rung.title, "hold"));
          }
        },
        alt: { label: "Retire", run: () => toMainMenu() }
      });
      return;
    }
    hud.showResult({
      title: "THE CROWN HOLDS",
      sub: `Rung ${l.cursor + 1} stopped the ascent.`,
      stats,
      primary: {
        label: "RETRY RUNG",
        run: () => {
          const rung = currentRung(l);
          if (!rung) return;
          void configureBout({
            mode: "ladder",
            p1: fighterById(l.playerFighter),
            cpu: fighterById(rung.opponent),
            stage: stageById(rung.stage),
            difficulty: rung.difficulty,
            p1Tint: studioPaletteFor(l.playerFighter)
          });
        }
      },
      alt: { label: "Abandon run", run: () => toMainMenu() }
    });
    return;
  }
  hud.showResult({
    title: p1Won ? "VICTORY" : "DEFEAT",
    sub: p1Won ? `${cfg.p1.name} stands tall on ${cfg.stage.label}.` : `${cfg.cpu.name} takes it on ${cfg.stage.label}.`,
    stats,
    primary: { label: "REMATCH", run: () => void configureBout(state.config) },
    alt: { label: "Change fighter", run: () => openSheet("versus") }
  });
}

/* ================================================================ */
/* animation + nodes                                                 */
/* ================================================================ */

function desiredClip(f: FighterRuntime): FighterClip {
  const asnap = actorSnap(f.nodeId);
  if (!asnap) return "idle";
  if (asnap.knockedOut) return "ko";
  if (asnap.stun > 0) return "hitstun";
  // With the upper-body layer live, the attack plays on the layer and the base keeps the locomotion clip.
  const layered = f.layer.mode === "layered" && f.layer.active !== null;
  if (!layered && f.attack && cur().activeAttacks.some((a) => a.attackerId === f.nodeId)) return f.attack.kind;
  if (!layered && f.attackAnim && f.attackAnim.timer > 0) {
    const moving = Math.abs(f.body.velocity?.[0] ?? 0) > 0.45;
    if (!moving && f.body.grounded && !f.crouching) {
      return f.attackAnim.kind;
    }
  }
  if (!f.body.grounded) return "jump";
  if (f.dashT > 0.12) return "dash";
  if (f.crouching) return "crouch";
  // Walking back while guarding shows the back-walk clip, not a frozen block (audit IC-06).
  if (asnap.guarding && !(f.guardIntent && Math.abs(f.body.velocity?.[0] ?? 0) > 0.25)) return "guard";
  if (state.phase === "boutEnd") {
    const winner = state.pipsP1 >= ROUNDS_TO_WIN ? "p1" : state.pipsCpu >= ROUNDS_TO_WIN ? "cpu" : null;
    if (winner === f.side) return "win";
  }
  if (Math.abs(f.body.velocity?.[0] ?? 0) > 0.25) return "walk";
  return "idle";
}

function clipPlaybackSpec(f: FighterRuntime, clip: FighterClip): { clip: string; loop: boolean; speed: number } {
  const baseEmbedded = embeddedClipFor(clip).clip;
  if (clip === "walk") {
    const foe = f === P1 ? CPU : P1;
    const facing = foe ? facingTo(f, foe) : 1;
    const vx = f.body.velocity?.[0] ?? 0;
    const movingBack = vx * facing < -0.15 && f.anim.embeddedClips.has("Walk_Fight_Back");
    return {
      clip: movingBack ? "Walk_Fight_Back" : baseEmbedded,
      loop: true,
      speed: 1.45
    };
  }
  switch (clip) {
    case "idle":
      return { clip: baseEmbedded, loop: true, speed: 1.15 };
    case "dash":
      return { clip: baseEmbedded, loop: true, speed: 2.2 };
    case "jump":
      return { clip: baseEmbedded, loop: false, speed: 1.35 };
    case "crouch":
    case "guard":
      return { clip: baseEmbedded, loop: true, speed: 1.1 };
    case "light":
      return { clip: baseEmbedded, loop: false, speed: 2.6 };
    case "heavy":
      return { clip: baseEmbedded, loop: false, speed: 1.85 };
    case "special":
      return { clip: baseEmbedded, loop: false, speed: 2.8 };
    case "throw":
      return { clip: baseEmbedded, loop: false, speed: THROW_CLIP_SPEED };
    case "hitstun":
      return { clip: baseEmbedded, loop: false, speed: 1.6 };
    case "ko":
      return { clip: baseEmbedded, loop: false, speed: 1.2 };
    case "win":
      return { clip: baseEmbedded, loop: true, speed: 1.1 };
  }
}

function syncAnim(f: FighterRuntime, clip: FighterClip, dt: number): void {
  if (f.attackAnim && dt > 0) {
    f.attackAnim.timer = Math.max(0, f.attackAnim.timer - dt);
    if (f.attackAnim.timer <= 0) f.attackAnim = null;
  }
  const desired = fighterDriveClipId(f.anim, clip);
  const current = f.anim.controller.snapshot().activeClipId;
  if (current !== desired) {
    f.anim.controller.crossFade(desired, 0.07, {
      restart: !isLoopingFighterClip(clip),
      loop: isLoopingFighterClip(clip) ? "loop" : false,
      layer: animationLayer(clip),
      ...(clip === "dash" ? { speed: 2 } : {})
    });
  }
  f.anim.controller.update(dt);

  const spec = clipPlaybackSpec(f, clip);
  const runtimeNode = app.nodes.get(f.nodeId) as AuraRuntimeNodeHandle | undefined;
  if (runtimeNode && (f.appliedClip !== spec.clip || f.appliedLoop !== spec.loop || f.appliedSpeed !== spec.speed)) {
    runtimeNode.setAnimation({ clip: spec.clip, loop: spec.loop, speed: spec.speed });
    f.appliedClip = spec.clip;
    f.appliedLoop = spec.loop;
    f.appliedSpeed = spec.speed;
  }
}

type LayerApi = {
  playLayer?(layer: string, clip: string, options?: Record<string, unknown>): unknown;
  stopLayer?(layer: string, fadeOut?: number): unknown;
  animationState?(): { activeActions?: readonly { clip: string; layer: string }[] } | undefined;
};
const ATTACK_LAYER = "upper-body";
const ATTACK_LAYER_SPEED: Record<AttackKind, number> = { light: 2.6, heavy: 1.85, special: 2.8, throw: THROW_CLIP_SPEED };
const ATTACK_LAYER_HOLD: Record<AttackKind, number> = { light: 0.52, heavy: 0.62, special: 0.85, throw: 0.62 };

function layerApi(f: FighterRuntime): LayerApi | undefined {
  return (app.nodes.get(f.nodeId) as unknown as { animation?: LayerApi } | undefined)?.animation;
}

function startAttackLayer(f: FighterRuntime, kind: AttackKind): void {
  if (f.layer.mode !== "layered") return;
  const api = layerApi(f);
  if (!api?.playLayer || !api.stopLayer) {
    f.layer.mode = "fallback";
    return;
  }
  const clip = embeddedClipFor(kind).clip;
  // A second playLayer on a live layer keeps its first clip (audit anim-phys-03), so clear the layer first.
  api.stopLayer(ATTACK_LAYER, 0);
  api.playLayer(ATTACK_LAYER, clip, { weight: 1, fadeIn: 0.04, mask: { humanoid: "upper-body" }, speed: ATTACK_LAYER_SPEED[kind] });
  const live = api.animationState?.()?.activeActions?.some((a) => a.layer === ATTACK_LAYER && a.clip === clip);
  if (live === false) {
    // The runtime has no pose mixer for this node: fall back to the full-body attack clip.
    f.layer.mode = "fallback";
    f.layer.active = null;
    return;
  }
  f.layer.active = clip;
  f.layer.timer = ATTACK_LAYER_HOLD[kind];
}

function updateAttackLayer(f: FighterRuntime, dt: number): void {
  if (f.layer.active === null) return;
  f.layer.timer -= dt;
  const asnap = actorSnap(f.nodeId);
  const interrupted = (asnap?.stun ?? 0) > 0 || asnap?.knockedOut === true;
  if (f.layer.timer <= 0 || interrupted) {
    layerApi(f)?.stopLayer?.(ATTACK_LAYER, interrupted ? 0 : 0.1);
    f.layer.active = null;
  }
}

function syncNodes(): void {
  for (const f of [P1, CPU]) {
    const asnap = actorSnap(f.nodeId);
    const facing = asnap?.facing ?? (f === P1 ? 1 : -1);
    const node = app.nodes.get(f.nodeId) as AuraRuntimeNodeHandle | undefined;
    node
      ?.setPosition(f.body.position[0], f.body.position[1], f.body.position[2])
      .setRotation(0, fighterFacingYaw(facing), 0);
  }
}

/**
 * IC47-L1: the Crown's follow-spot tracks the pair's midpoint and each back rim tracks its fighter (E-B `setLight`;
 * read-only fighter positions). The lights ease after the fighters like a spot operator (6/s); a new bout snaps them.
 */
const lightFollow = { mid: Number.NaN, p1: Number.NaN, p2: Number.NaN, p1y: 0, p2y: 0 };
const LIGHT_FOLLOW_RATE = 6;
const LIGHT_EPSILON = 0.004;
const lightPosesSent = new Map<string, SpotPose>();

function patchSpot(id: string, pose: SpotPose): void {
  const last = lightPosesSent.get(id);
  if (last && Math.abs(last.position[0] - pose.position[0]) < LIGHT_EPSILON && Math.abs(last.position[1] - pose.position[1]) < LIGHT_EPSILON) return;
  const node = app.nodes.get(id) as AuraRuntimeNodeHandle | undefined;
  if (!node?.setLight) return;
  node.setLight({ position: pose.position, direction: poseDirection(pose) });
  lightPosesSent.set(id, pose);
}

function updateStageLights(dt: number): void {
  if (!P1 || !CPU || !state) return;
  const row = stageLook(state.config.stage.id);
  const x1 = P1.body.position[0];
  const x2 = CPU.body.position[0];
  const k = Number.isNaN(lightFollow.mid) ? 1 : Math.min(1, dt * LIGHT_FOLLOW_RATE);
  const ease = (from: number, to: number) => (Number.isNaN(from) ? to : from + (to - from) * k);
  lightFollow.mid = ease(lightFollow.mid, (x1 + x2) / 2);
  lightFollow.p1 = ease(lightFollow.p1, x1);
  lightFollow.p2 = ease(lightFollow.p2, x2);
  lightFollow.p1y = P1.body.position[1];
  lightFollow.p2y = CPU.body.position[1];
  if (row.key.kind === "follow-spot") patchSpot(FOLLOW_SPOT_ID, followSpotPose(row.key, lightFollow.mid));
  patchSpot(RIM_IDS.p1, backRimPose(row.backRim, lightFollow.p1, lightFollow.p1y));
  patchSpot(RIM_IDS.p2, backRimPose(row.backRim, lightFollow.p2, lightFollow.p2y));
}

/** IC47-AN2: Neo-Tokyo's neon panels stutter (`signFlicker`); held steady on reduced motion or reduced flash. */
const panelGainSent = new Map<string, number>();
function updatePanelFlicker(): void {
  if (!state || reducedMotion || reducedFlash) return;
  const row = stageLook(state.config.stage.id);
  const now = performance.now() / 1000;
  row.panels.forEach((panel, index) => {
    const id = panelLightId(index);
    const gain = signFlicker(now, index, false);
    if (panelGainSent.get(id) === gain) return;
    const node = app.nodes.get(id) as AuraRuntimeNodeHandle | undefined;
    if (!node?.setLight) return;
    node.setLight({ intensity: panel.intensity * gain });
    panelGainSent.set(id, gain);
  });
}

function resetStageLights(): void {
  lightFollow.mid = Number.NaN;
  lightFollow.p1 = Number.NaN;
  lightFollow.p2 = Number.NaN;
  lightPosesSent.clear();
  panelGainSent.clear();
}

/** IC47-V1: one-shot bursts of the Iron Crown pack on read-only combat events (the caller owns the camera). */
function fxBurst(kind: IronCrownVfxKind, at: readonly number[], color?: string): void {
  if (!vfxLive) return;
  app.effects?.burst(kind, [at[0] ?? 0, at[1] ?? 0, at[2] ?? 0], { camera: false, seed: frameCount, ...(color ? { color } : {}) });
}

/* ================================================================ */
/* frame loop                                                        */
/* ================================================================ */

const inputTrail: { label: string; attack?: boolean }[] = [];
/** Read position in `input.recorded()`; the log is cleared between bouts and whenever it passes REPLAY_LOG_CAP (audit IC-11). */
let replayCursor = 0;
const REPLAY_LOG_CAP = 512;

const BINDING_LABELS: Record<string, { label: string; attack?: boolean }> = {
  KeyA: { label: "◀" }, ArrowLeft: { label: "◀" }, GamepadDPadLeft: { label: "◀" }, "Touch:left": { label: "◀" }, TouchLeft: { label: "◀" },
  KeyD: { label: "▶" }, ArrowRight: { label: "▶" }, GamepadDPadRight: { label: "▶" }, "Touch:right": { label: "▶" }, TouchRight: { label: "▶" },
  KeyS: { label: "▼" }, ArrowDown: { label: "▼" }, GamepadDPadDown: { label: "▼" },
  KeyW: { label: "▲" }, ArrowUp: { label: "▲" }, GamepadA: { label: "▲" }, "Touch:jump": { label: "▲" }, TouchJump: { label: "▲" },
  KeyJ: { label: "L", attack: true }, Space: { label: "L", attack: true }, KeyZ: { label: "L", attack: true }, GamepadX: { label: "L", attack: true }, "Touch:light": { label: "L", attack: true }, TouchLight: { label: "L", attack: true },
  KeyK: { label: "H", attack: true }, KeyX: { label: "H", attack: true }, GamepadY: { label: "H", attack: true }, "Touch:heavy": { label: "H", attack: true }, TouchHeavy: { label: "H", attack: true },
  KeyL: { label: "SP", attack: true }, KeyC: { label: "SP", attack: true }, GamepadB: { label: "SP", attack: true }, "Touch:special": { label: "SP", attack: true }, TouchSpecial: { label: "SP", attack: true },
  KeyU: { label: "TH", attack: true }, GamepadLT: { label: "TH", attack: true },
  KeyQ: { label: "BLK" }, GamepadLB: { label: "BLK" }, "Touch:guard": { label: "BLK" }, TouchGuard: { label: "BLK" },
  ShiftLeft: { label: "DSH" }, ShiftRight: { label: "DSH" }, GamepadRB: { label: "DSH" },
  // Touch buttons record the action name itself (input.setAction).
  moveLeft: { label: "◀" }, moveRight: { label: "▶" }, jump: { label: "▲" }, crouch: { label: "▼" }, guard: { label: "BLK" },
  light: { label: "L", attack: true }, heavy: { label: "H", attack: true }, special: { label: "SP", attack: true },
  throw: { label: "TH", attack: true }, dash: { label: "DSH" }
};

function playerHasManualInput(): boolean {
  return (
    Math.abs(input.axis("moveX")) > 0.05 ||
    input.held("crouch") ||
    input.held("guard") ||
    input.pressed("jump") ||
    input.buffered("jump", 140) ||
    input.pressed("dash") ||
    input.pressed("light") ||
    input.buffered("light", 160) ||
    input.pressed("heavy") ||
    input.buffered("heavy", 160) ||
    input.pressed("special") ||
    input.buffered("special", 180) ||
    input.pressed("throw") ||
    input.buffered("throw", 160)
  );
}

// E-I capture hook: the IC47-L1 fighter, foot and outer-ring crops, following the presented camera. Read-only.
app.onFrame(() => {
  const vp = app.camera?.evidence().viewProjection;
  if (!P1 || !CPU || !vp || vp.length !== 16) return;
  const qa = (gameWindow.__AURA_QA__ ??= {});
  qa.crops = fightCrops(vp, [
    { id: "p1", position: [P1.body.position[0], P1.body.position[1], P1.body.position[2]] },
    { id: "p2", position: [CPU.body.position[0], CPU.body.position[1], CPU.body.position[2]] }
  ]);
});

app.onFrame(({ dt }) => {
  if (!P1 || !CPU || !state) return;
  lastFrameSnapshots = snapshotsThisFrame;
  snapshotsThisFrame = 0;
  combatSnapCache = null;
  if (!appReady) {
    syncAnim(P1, "idle", 0);
    syncAnim(CPU, "idle", 0);
    syncNodes();
    director.update(0, [
      { id: "player", position: P1.body.position },
      { id: "rival", position: CPU.body.position }
    ]);
    const pSnap = actorSnap("player");
    const cSnap = actorSnap("rival");
    publishEvidence(pSnap, cSnap, "idle", "idle");
    return;
  }
  if (frozenByQuery) {
    const pSnap = actorSnap("player");
    const cSnap = actorSnap("rival");
    publishEvidence(pSnap, cSnap, desiredClip(P1), desiredClip(CPU));
    return;
  }
  frameCount += 1;
  elapsedMs += dt * 1000;
  ambientVfx.step(dt, (kind, at) => fxBurst(kind, at));
  if (currentStageId === "crown-arena" && !reducedMotion) {
    const now = performance.now() / 1000;
    (app.nodes.get(CROWD_IDS.bodies) as AuraRuntimeNodeHandle | undefined)?.setPosition(0, crowdBob(now, now - crowdCheerAt, false), 0);
    (app.nodes.get(CROWD_IDS.heads) as AuraRuntimeNodeHandle | undefined)?.setPosition(0, crowdBob(now, now - crowdCheerAt, false, 0.06), 0);
  }
  updatePanelFlicker();
  if (freezeMs !== null && elapsedMs >= freezeMs) {
    frozenByQuery = true;
    const pSnap = actorSnap("player");
    const cSnap = actorSnap("rival");
    publishEvidence(pSnap, cSnap, desiredClip(P1), desiredClip(CPU));
    return;
  }
  const s = state;
  snap(); // refresh per-frame combat snapshot cache

  if (input.pressed("pause") && (s.phase === "fight" || s.phase === "intro" || s.phase === "roundEnd" || s.phase === "ko")) {
    setPaused(true);
  }

  if (playerHasManualInput()) {
    userEngaged = true;
    if (autoDemo) {
      setAutopilot(false);
    }
  }

  if (s.phase === "attract") {
    // setActor() can never clear knockedOut (it latches true), so a downed
    // attract fighter needs a full world reset — just healing is not enough.
    if (actorSnap("player")?.knockedOut || actorSnap("rival")?.knockedOut) {
      combat.reset([
        { id: "player", team: "p1", position: [...PLAYER_START], facing: 1, health: P1.def.stats.maxHealth, ...actorDefaults(P1) },
        { id: "rival", team: "cpu", position: [...RIVAL_START], facing: -1, health: CPU.def.stats.maxHealth, ...actorDefaults(CPU) }
      ]);
      resetPositions();
      P1.attack = null;
      CPU.attack = null;
      snap();
    } else {
      for (const f of [P1, CPU]) {
        const asnap = actorSnap(f.nodeId);
        if (asnap && asnap.health < 30) combat.setActor(f.nodeId, { health: 60 });
      }
    }
  }

  // KO slow motion runs through fightingGame.session.slowMo only (audit IC-08), so dt already carries it.
  const simDt = dt;

  // input trail (throttled DOM writes): read only the events recorded since the last frame.
  const recorded = input.recorded();
  if (recorded.length < replayCursor) replayCursor = 0;
  for (let i = replayCursor; i < recorded.length; i += 1) {
    const ev = recorded[i]!;
    if (ev.type !== "press") continue;
    const mapped = BINDING_LABELS[ev.binding];
    if (mapped) {
      inputTrail.push(mapped);
      if (inputTrail.length > 10) inputTrail.shift();
    }
  }
  replayCursor = recorded.length;
  if (recorded.length > REPLAY_LOG_CAP) {
    input.clearReplay();
    replayCursor = 0;
  }
  if (inputTrail.length !== lastTrailLen) {
    lastTrailLen = inputTrail.length;
    hud.setInputs(inputTrail);
  }

  const inFight = s.phase === "fight";
  const roundLive = autoDemo || userEngaged;

  if (s.phase === "intro") {
    s.phaseT += dt;
    if (s.phaseT > 1.35 || userEngaged) {
      s.phase = "fight";
      hud.announce("FIGHT!", "", "pop");
      void fightingGame.sound?.cue("fight");
    }
  } else if (s.phase === "ko") {
    s.koTimer += dt;
    if (s.koTimer > 1.7) endRound(s.roundWinner ?? "draw");
  } else if (s.phase === "roundEnd") {
    s.phaseT += dt;
    if (s.phaseT > 1.5) {
      s.round += 1;
      combat.reset();
      combat.addActor({ id: "player", team: "p1", position: [...PLAYER_START], facing: 1, health: P1.def.stats.maxHealth, ...actorDefaults(P1) });
      combat.addActor({ id: "rival", team: "cpu", position: [...RIVAL_START], facing: -1, health: CPU.def.stats.maxHealth, ...actorDefaults(CPU) });
      snap();
      resetPositions();
      P1.attack = null;
      CPU.attack = null;
      s.timer = ROUND_SECONDS;
      announceRoundIntro();
    }
  } else if (inFight) {
    if (s.config.mode !== "lab" && roundLive) {
      s.timer -= simDt;
      if (s.timer <= 0) {
        const pSnap = actorSnap("player");
        const cSnap = actorSnap("rival");
        const pPct = pSnap ? pSnap.health / P1.def.stats.maxHealth : 0;
        const cPct = cSnap ? cSnap.health / CPU.def.stats.maxHealth : 0;
        const winner = timeUpWinner(pPct, cPct);
        hud.announce("TIME UP", "", "pop");
        endRound(winner);
      }
    }
    if (s.config.mode === "lab") {
      const cSnap = actorSnap("rival");
      if (cSnap && cSnap.health < CPU.def.stats.maxHealth * 0.35) {
        combat.setActor("rival", { health: CPU.def.stats.maxHealth });
      }
    }
  }

  const simActive = inFight || s.phase === "attract" || s.phase === "ko" || s.phase === "roundEnd";

  if (simActive) {
    const pIntent =
      s.phase === "attract" || (inFight && autoDemo)
        ? (P1.brain ?? (P1.brain = createCpuBrain(P1.def, "scrapper", APP_SEED + 7))).think(aiCtx(P1, CPU), simDt)
        : inFight
          ? playerIntent()
          : IDLE_INTENT;
    if (
      pIntent.axis !== 0 ||
      pIntent.crouch ||
      pIntent.guard ||
      pIntent.jump ||
      pIntent.dash !== 0 ||
      pIntent.attack !== undefined
    ) {
      userEngaged = true;
    }
    const cIntent =
      s.phase === "attract" || s.phase === "ko" || s.phase === "roundEnd"
        ? cpuIntent(simDt)
        : inFight && (autoDemo || userEngaged)
          ? cpuIntent(simDt)
          : IDLE_INTENT;

    driveFighter(P1, CPU, pIntent, simDt);
    driveFighter(CPU, P1, cIntent, simDt);

    P1.body.update(simDt);
    CPU.body.update(simDt);
    enforceFighterSeparation();
    snap();
    syncActors();
    recordStunBeforeUpdate();
    combat.update(simDt);
    snap();
    handleEvents();
    syncBodiesFromActors();
    enforceFighterSeparation();
    syncActors();
    resolveThrowTech();
  }

  runtimeEffects.update(simDt);
  feel.update(dt * 1000);
  director.update(simDt, [
    { id: "player", position: P1.body.position },
    { id: "rival", position: CPU.body.position }
  ]);

  const pClip = desiredClip(P1);
  const cClip = desiredClip(CPU);
  syncAnim(P1, pClip, simDt);
  syncAnim(CPU, cClip, simDt);
  updateAttackLayer(P1, simDt);
  updateAttackLayer(CPU, simDt);
  syncNodes();
  updateStageLights(dt);

  for (const side of ["p1", "cpu"] as const) {
    if (combo[side].timer > 0) {
      combo[side].timer -= dt;
      if (combo[side].timer <= 0) combo[side].count = 0;
    }
    hud.combo(side === "cpu" ? "p2" : "p1", combo[side].count);
  }

  const pSnap = actorSnap("player");
  const cSnap = actorSnap("rival");
  if (pSnap) hud.setBars("p1", pSnap.health / P1.def.stats.maxHealth, pSnap.meter / METER_MAX);
  if (cSnap) hud.setBars("p2", cSnap.health / CPU.def.stats.maxHealth, cSnap.meter / METER_MAX);
  hud.setTimer(s.config.mode === "lab" ? null : Math.max(0, s.timer));

  publishEvidence(pSnap, cSnap, pClip, cClip);
});

/** The player throw (by its start frame) the CPU already rolled a tech for, so it rolls once per throw. */
let techRolledForThrow = -1;

function resolveThrowTech(): void {
  const csnap = snap();
  const pThrow = csnap.activeAttacks.find((a) => a.attackerId === "player" && a.moveId.includes("throw"));
  const cThrow = csnap.activeAttacks.find((a) => a.attackerId === "rival" && a.moveId.includes("throw"));
  const mutual = Boolean(pThrow && cThrow && Math.abs(pThrow.frame - cThrow.frame) <= THROW_TECH_FRAMES);
  // The CPU techs a player throw by its difficulty's techChance, rolled once per throw inside the tech window
  // (audit IC-13: tryTech was defined but never called).
  let cpuTech = false;
  if (!mutual && pThrow && !cThrow && CPU.brain && pThrow.frame <= THROW_TECH_FRAMES && techRolledForThrow !== P1.lastThrowFrame) {
    techRolledForThrow = P1.lastThrowFrame;
    const dummy = state.config.mode === "lab" && lab.stance !== "cpu";
    cpuTech = !dummy && state.phase === "fight" && CPU.brain.tryTech();
  }
  if (!mutual && !cpuTech) return;
  const pHealth = actorSnap("player")?.health ?? P1.def.stats.maxHealth;
  const cHealth = actorSnap("rival")?.health ?? CPU.def.stats.maxHealth;
  const pMeter = actorSnap("player")?.meter ?? 0;
  const cMeter = actorSnap("rival")?.meter ?? 0;
  const mid = (P1.body.position[0] + CPU.body.position[0]) / 2;
  P1.body.position = [mid - 0.95, 0, 0] as [number, number, number];
  CPU.body.position = [mid + 0.95, 0, 0] as [number, number, number];
  P1.body.applyKnockback([-2.4, 1.2, 0]);
  CPU.body.applyKnockback([2.4, 1.2, 0]);
  P1.attack = null;
  CPU.attack = null;
  combat.reset([
    { id: "player", team: "p1", position: [...P1.body.position], facing: facingTo(P1, CPU), health: pHealth, meter: pMeter, ...actorDefaults(P1) },
    { id: "rival", team: "cpu", position: [...CPU.body.position], facing: facingTo(CPU, P1), health: cHealth, meter: cMeter, ...actorDefaults(CPU) }
  ]);
  snap();
  runtimeEffects.blockSpark([mid, 1.0, 0], { intensity: 0.9, color: "#8ee6ff" });
  hud.announce("THROW TECH", "", "pop");
  void fightingGame.sound?.cue("tech");
}

/* ================================================================ */
/* evidence                                                          */
/* ================================================================ */

/**
 * Evidence is built on demand (audit IC-11): the frame loop only records the two clips, and the window globals are getters
 * that build the objects when a probe reads them. Before, every 60 Hz step allocated all four objects.
 */
let evidenceClips: { p: FighterClip; c: FighterClip } = { p: "idle", c: "idle" };
let evidenceInstalled = false;

function publishEvidence(
  _pSnap: GameCombatWorldSnapshot["actors"][number] | undefined,
  _cSnap: GameCombatWorldSnapshot["actors"][number] | undefined,
  pClip: FighterClip,
  cClip: FighterClip
): void {
  evidenceClips = { p: pClip, c: cClip };
  if (evidenceInstalled) return;
  evidenceInstalled = true;
  const lazy = (name: keyof IronCrownWindow, build: () => unknown) =>
    Object.defineProperty(window, name, { configurable: true, enumerable: true, get: build, set: () => undefined });
  lazy("__AURA3D_SHOWCASE_IRON_CROWN__", buildShowcaseEvidence);
  lazy("__AURA3D_GAME_RUNTIME__", () => ({
    kind: "createGame",
    beacon: gameWindow.__AURA3D_GAME__ ?? { state: "unbound" },
    frame: app.runtime.frame,
    showcase: "iron-crown"
  }));
  lazy("__AURA3D_GAME_DEBUG__", buildDebugEvidence);
  lazy("__AURA3D_GAME_EVIDENCE__", buildGameEvidence);
}

function buildShowcaseEvidence(): unknown {
  const s = state;
  const pClip = evidenceClips.p;
  const cClip = evidenceClips.c;
  const pSnap = actorSnap("player");
  const cSnap = actorSnap("rival");
  return {
    schema: "iron-crown/1.0",
    app: "showcase-iron-crown",
    route: "/apps/showcase-iron-crown/",
    title: "IRON CROWN — 2.5D Arena Fighter",
    frame: frameCount,
    mode: s.config.mode,
    phase: s.phase,
    autopilot: autoDemo,
    userEngaged,
    stage: {
      id: s.config.stage.id,
      label: s.config.stage.label,
      preset: s.config.stage.preset,
      look: s.config.stage.lookId,
      issues: s.config.stage.issues
    },
    bout: {
      round: s.round,
      timer: Math.max(0, s.timer),
      pips: { p1: s.pipsP1, cpu: s.pipsCpu },
      winner: s.roundWinner,
      stats: s.stats
    },
    fighters: {
      p1: {
        id: P1.def.id,
        name: P1.def.name,
        asset: P1.def.asset,
        clip: pClip,
        embeddedClip: P1.appliedClip || embeddedClipFor(pClip).clip,
        health: pSnap?.health ?? 0,
        meter: pSnap?.meter ?? 0,
        position: [...P1.body.position] as AuraVec3,
        grounded: P1.body.grounded,
        tint: P1.tint?.color ?? "default"
      },
      cpu: {
        id: CPU.def.id,
        name: CPU.def.name,
        asset: CPU.def.asset,
        clip: cClip,
        embeddedClip: CPU.appliedClip || embeddedClipFor(cClip).clip,
        health: cSnap?.health ?? 0,
        meter: cSnap?.meter ?? 0,
        position: [...CPU.body.position] as AuraVec3,
        grounded: CPU.body.grounded,
        brain: s.config.difficulty
      }
    },
    combat: cur(),
    perf: { combatSnapshotsLastFrame: lastFrameSnapshots, replayLogLength: input.recorded().length },
    attackLayer: { p1: P1.layer, cpu: CPU.layer },
    ladder: ladder ? { rung: ladder.cursor + 1, cleared: ladder.cleared } : null,
    lab: s.config.mode === "lab" ? { stance: lab.stance, frameData: lab.frameData } : null,
    studio: { fighter: studioSelection.fighter, palette: studioSelection.palette },
    assets: {
      typed: typedFighterAssetCount,
      missing: missingFighterAssets,
      clipStandIns: { p1: P1.anim.standIns, cpu: CPU.anim.standIns }
    },
    a11y: { reducedMotion, reducedFlash, highContrast },
    ready: appReady
  };
}

function buildDebugEvidence(): unknown {
  const s = state;
  return game.debug.overlay({
    runtime: app.runtime,
    input,
    bodies: [P1.body, CPU.body],
    combat,
    effects: runtimeEffects,
    camera: director,
    colliders: [
      game.collider.capsule({ id: "player-body", center: P1.body.position, radius: 0.32, height: 1.7, tags: ["fighter", "player"] }),
      game.collider.capsule({ id: "rival-body", center: CPU.body.position, radius: 0.32, height: 1.7, tags: ["fighter", "rival"] })
    ],
    warnings: s.config.stage.issues.map((i) => i.message)
  });
}

function buildGameEvidence(): unknown {
  const s = state;
  const pClip = evidenceClips.p;
  const cClip = evidenceClips.c;
  return app.evidence({
    input,
    bodies: [P1.body, CPU.body],
    combat,
    effects: runtimeEffects,
    camera: director,
    animation: { controllers: 2, activeClips: [pClip, cClip] },
    assets: { typedAssets: typedFighterAssetCount, missingAssets: missingFighterAssets },
    stage: { id: s.config.stage.id, bounds: s.config.stage.bounds, warnings: s.config.stage.issues.map((i) => i.message) },
    source: { mode: "mounted-runtime", label: "showcase-iron-crown" }
  });
}

/* ================================================================ */
/* boot                                                              */
/* ================================================================ */

state = {
  config: initialConfig,
  phase: "fight",
  phaseT: 0,
  round: 1,
  pipsP1: 0,
  pipsCpu: 0,
  timer: ROUND_SECONDS,
  koTimer: 0,
  roundWinner: null,
  slowmo: 1,
  stats: { p1Hits: 0, cpuHits: 0, maxCombo: 0, throws: 0, specials: 0 }
};
mountedArenaSig = arenaSignature(initialConfig);
P1 = makeFighter("p1", initialConfig.p1, PLAYER_START);
CPU = makeFighter("cpu", initialConfig.cpu, RIVAL_START);
P1.brain = createCpuBrain(initialConfig.p1, "scrapper", APP_SEED + 7);
CPU.brain = createCpuBrain(initialConfig.cpu, "scrapper", APP_SEED + 1);
combat.reset();
combat.addActor({ id: "player", team: "p1", position: [...PLAYER_START], facing: 1, health: initialConfig.p1.stats.maxHealth, ...actorDefaults(P1) });
combat.addActor({ id: "rival", team: "cpu", position: [...RIVAL_START], facing: -1, health: initialConfig.cpu.stats.maxHealth, ...actorDefaults(CPU) });
director.update(0, [
  { id: "player", position: [...PLAYER_START] },
  { id: "rival", position: [...RIVAL_START] }
]);
hud.setNames(initialConfig.p1.name, initialConfig.cpu.name);
hud.setRoundLabel("ROUND 1");
hud.setModeLabel(`QUICK BOUT · ${initialConfig.stage.label.toUpperCase()}${autoDemo ? " · AUTO" : ""}`);
hud.showMenu(null);
hud.setStageButtons(currentStageId);
hud.setFighterButtons(initialConfig.p1.id);
hud.setAutopilotButton(autoDemo);

void app.ready().then(async () => {
  await fightingGame.ready();
  bindAnimations();
  syncNodes();
  director.update(0, [
    { id: "player", position: [...PLAYER_START] },
    { id: "rival", position: [...RIVAL_START] }
  ]);
  appReady = true;
  document.body.dataset.aura3dReady = "true";
  hud.announce("ROUND 1", "FIGHT!", "pop");
  playStageAmbience(currentStageId);
});

// A loop cued before the first gesture is dropped by the browser's autoplay rule; restart it once audio unlocks.
const unlockAmbience = (): void => {
  window.removeEventListener("pointerdown", unlockAmbience);
  window.removeEventListener("keydown", unlockAmbience);
  window.removeEventListener("touchstart", unlockAmbience);
  void fightingGame.sound?.unlock().then(() => {
    if (!ambienceCue) return;
    fightingGame.sound?.stopCue(ambienceCue, 0);
    void fightingGame.sound?.cue(ambienceCue);
  });
};
window.addEventListener("pointerdown", unlockAmbience);
window.addEventListener("keydown", unlockAmbience);
window.addEventListener("touchstart", unlockAmbience);

hud.setHint(controlsHint(input.actions));

if (debugHooks) {
  (window as unknown as { __IRON_CROWN_DEBUG__?: unknown }).__IRON_CROWN_DEBUG__ = {
    /** Put the bout at match point and knock the loser out, so the result card follows on the normal path. */
    finishBout(p1Won: boolean): void {
      if (state.phase !== "fight") state.phase = "fight";
      state.pipsP1 = p1Won ? ROUNDS_TO_WIN - 1 : 0;
      state.pipsCpu = p1Won ? 0 : ROUNDS_TO_WIN - 1;
      combat.setActor(p1Won ? "rival" : "player", { health: 0 });
      snap();
      onKnockout(p1Won ? "p1" : "cpu");
      // Skip the 1.7 s (sim time) K.O. beat: on software GL it is minutes of wall time.
      state.koTimer = 1.7;
    }
  };
}

