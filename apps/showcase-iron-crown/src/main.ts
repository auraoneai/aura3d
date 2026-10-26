import "../../showcase-port-shared/quickbar.css";
import {
  camera,
  effects,
  game,
  gameFeel,
  games,
  lights,
  looks,
  material,
  primitives,
  scene,
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
  createFighterAnimationController,
  createFighterNode,
  embeddedClipFor,
  fighterById,
  fighterDriveClipId,
  fighterFacingYaw,
  FIGHTERS,
  isLoopingFighterClip,
  PALETTE_SWATCHES,
  resolveTypedFighterAssets,
  type FighterClip,
  type FighterDef,
  type FighterId,
  type FighterPalette,
  type PaletteId
} from "./game/fighters";
import { frameDataLine, moveFor, specialChip, type AttackKind } from "./game/moves";
import { DEFAULT_STAGE, stageById, type IronStage, type StageId } from "./game/stages";
import { advanceLadder, createLadder, currentRung, type LadderState } from "./game/ladder";
import { createHud, type MenuId, type ModeId } from "./game/hud";
import "./styles.css";
import { installBlackFrameGuard } from "@aura3d/debug";

installBlackFrameGuard();

type IronCrownWindow = Window & {
  __AURA3D_GAME__?: { readonly state?: string };
  __AURA3D_GAME_DEBUG__?: unknown;
  __AURA3D_GAME_EVIDENCE__?: unknown;
  __AURA3D_GAME_RUNTIME__?: unknown;
  __AURA3D_SHOWCASE_IRON_CROWN__?: unknown;
};

const gameWindow = window as IronCrownWindow;

/* ================================================================ */
/* constants                                                         */
/* ================================================================ */

const ROUND_SECONDS = 60;
const ROUNDS_TO_WIN = 2;
const METER_MAX = 100;
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

const inputOptions = {
  actions: {
    ...fightingControls.actions,
    moveLeft: ["KeyA", "ArrowLeft", "GamepadDPadLeft"],
    moveRight: ["KeyD", "ArrowRight", "GamepadDPadRight"],
    jump: ["KeyW", "ArrowUp", "GamepadDPadUp", "GamepadA"],
    crouch: ["KeyS", "ArrowDown", "GamepadDPadDown"],
    guard: ["KeyQ", "GamepadLB"],
    light: ["KeyJ", "Space", "KeyZ", "GamepadX"],
    heavy: ["KeyK", "KeyX", "GamepadY"],
    special: ["KeyL", "KeyC", "GamepadB"],
    throw: ["KeyU", "GamepadLT"],
    dash: ["ShiftLeft", "ShiftRight", "GamepadRB"],
    pause: ["Escape", "GamepadStart"]
  },
  axes: fightingControls.axes,
  bufferMs: 160,
  gamepad: true
} as const;

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
  return { ...def.palette, color: sw.color, emissive: sw.emissive || def.palette.emissive };
}

/* ================================================================ */
/* scene                                                             */
/* ================================================================ */

function buildArena(cfg: BoutConfig) {
  const s = cfg.stage;
  // The fighting kit ships debug-style markers (camera safe-zone posts, a centre aura beam, start-lane slabs).
  // They read as stray geometry in a finished arena, so drop them and mark the spawn points with proper rings.
  const KIT_MARKER_NODES = new Set(["left camera safe boundary marker", "right camera safe boundary marker", "center aura combat lane"]);
  const spawnRing = (id: string, x: number, color: string) => [
    primitives
      .cylinder({ name: `${id}-outer`, material: material.emissive({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.4 }), castShadow: false, receiveShadow: false })
      .position(x, 0.012, 0.02)
      .scale([1.15, 0.012, 1.15])
      .toJSON(),
    primitives
      .cylinder({ name: `${id}-inner`, material: material.pbr({ color: "#15121a", roughness: 0.7 }), castShadow: false, receiveShadow: true })
      .position(x, 0.016, 0.02)
      .scale([0.96, 0.012, 0.96])
      .toJSON()
  ];
  const floorStageNodes = s.stage.nodes
    .filter((n: any) => {
      const py = n?.transform?.position?.[1] ?? n?.position?.[1] ?? 0;
      return py <= 0.35 && !KIT_MARKER_NODES.has(n?.name);
    })
    .flatMap((n: any) => {
      if (n?.name === "fighting foreground floor plane") {
        return [{
          ...n,
          position: [0, -0.055, 0] as [number, number, number],
          scale: [44, 1, 32] as [number, number, number]
        }];
      }
      if (n?.name === "player start lane glow") return spawnRing("player-spawn", PLAYER_START[0], s.palette.lane);
      if (n?.name === "opponent start lane glow") return spawnRing("rival-spawn", RIVAL_START[0], s.palette.warning);
      return [n];
    });
  return scene()
    .add(looks.preset(s.lookId, s.lookOverrides ?? {}))
    .addMany(floorStageNodes)
    .addMany(s.dressing)
    .add(createFighterNode("player", cfg.p1, `${cfg.p1.name} (P1)`, PLAYER_START, 1, typedFighterAssets, cfg.p1Tint))
    .add(createFighterNode("rival", cfg.cpu, `${cfg.cpu.name} (CPU)`, RIVAL_START, -1, typedFighterAssets, cfg.cpuTint))
    .addMany([
      effects.contactShadows({ intensity: 0.75, length: 0.3 }),
      effects.vignette({ intensity: 0.16, smoothness: 0.65 }),
      effects.bloom({ intensity: 0.24, threshold: 0.86 }),
      effects.lightCone({
        name: "crown key cone left",
        position: [-6.3, 4.8, -5.5],
        direction: [0.65, -0.42, 0.63],
        color: s.palette.warning,
        intensity: 0.24,
        length: 8.5,
        coneAngle: 0.34,
        softness: 0.6
      }),
      effects.lightCone({
        name: "crown key cone right",
        position: [6.3, 4.8, -5.5],
        direction: [-0.65, -0.42, 0.63],
        color: s.accent,
        intensity: 0.2,
        length: 8.5,
        coneAngle: 0.32,
        softness: 0.6
      }),
      lights.directional({ name: "iron crown rim", color: s.accent, intensity: 0.75 }).position(0, 4.2, 3),
      lights.spot({
        name: "crown ring key",
        position: [-3.9, 5.4, 1.6],
        target: [0, 0.5, 0],
        angle: 0.46,
        penumbra: 0.85,
        distance: 15,
        decay: 1.3,
        intensity: 12,
        color: s.palette.warning
      }),
      lights.spot({
        name: "crown ring fill",
        position: [3.9, 5.4, 1.6],
        target: [0, 0.5, 0],
        angle: 0.46,
        penumbra: 0.85,
        distance: 15,
        decay: 1.3,
        intensity: 9,
        color: s.accent
      })
    ])
    .camera(camera.perspective({ position: [0, 1.6, 5.6], target: [0, 0.82, 0], fov: 40 }));
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
    bindings: {
      left: "left",
      right: "right",
      block: "guard",
      light: "light",
      heavy: "heavy",
      special: "special",
      jump: "jump"
    }
  },
  sound: {
    cues: {
      hit: { id: "hit", asset: { url: sfxUrl("impact.flesh.medium.00") }, volume: 0.72 },
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
// Runtime-spawned effect clouds are off by default until the floating-dot report is root-caused; `?vfx=on` re-enables them for diagnosis.
(app as any).effects.runtime = "off";
fightingGame.start();
const input = fightingGame.input as GameInputController;
if (!input) throw new Error("Iron Crown: createGame failed to create runtime-owned input.");

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
  fov: 40
});
app.camera?.use({
  ...baseFightingRig,
  update(ctx) {
    const pose = baseFightingRig.update(ctx);
    return {
      ...pose,
      position: [pose.position[0], pose.position[1] + 0.82, pose.position[2] - 0.15],
      target: [pose.target[0], pose.target[1] + 0.72, pose.target[2]]
    };
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

const MANUAL_FIGHT_KEYS = new Set([
  "KeyA", "KeyD", "ArrowLeft", "ArrowRight",
  "KeyW", "ArrowUp",
  "KeyS", "ArrowDown",
  "KeyJ", "Space", "KeyZ",
  "KeyK", "KeyX",
  "KeyL", "KeyC",
  "KeyU", "KeyQ",
  "ShiftLeft", "ShiftRight"
]);

// Escape resumes from the pause/sheet layer even while the app loop is paused.
// Any gameplay key disengages AI autopilot immediately so Player 1 has full control.
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && paused) {
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
    tint
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
  newBout(config);
  currentStageId = config.stage.id;
  studioSelection.fighter = config.p1.id;
  const sig = arenaSignature(config);
  if (sig !== mountedArenaSig) {
    mountedArenaSig = sig;
    await fightingGame.setScene(buildArena(config).toJSON());
  }
  P1 = makeFighter("p1", config.p1, PLAYER_START, config.p1Tint);
  CPU = makeFighter("cpu", config.cpu, RIVAL_START, config.cpuTint);
  P1.brain = createCpuBrain(config.p1, "scrapper", APP_SEED + 7);
  CPU.brain = createCpuBrain(config.cpu, config.difficulty, APP_SEED + 31);
  combat.reset();
  combat.addActor({ id: "player", team: "p1", position: [...PLAYER_START], facing: 1, health: config.p1.stats.maxHealth, ...actorDefaults(P1) });
  combat.addActor({ id: "rival", team: "cpu", position: [...RIVAL_START], facing: -1, health: config.cpu.stats.maxHealth, ...actorDefaults(CPU) });
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
  hud.setHint(
    config.mode === "lab"
      ? "Dummy stance panel is live — land LIGHT → HEAVY → SPECIAL."
      : "A/D move · W jump · S crouch-block · J/Space light · K heavy · L special · U throw"
  );
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
  if (!paused) {
    paused = true;
    app.pause();
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
  } else if (mode === "versus") {
    const rivalPool = FIGHTERS.filter((f) => f.id !== studioSelection.fighter);
    const curIdx = rivalPool.findIndex((f) => f.id === state.config.cpu.id);
    const nextCpu = rivalPool[(curIdx + 1) % rivalPool.length] ?? randomCpu(studioSelection.fighter);
    void configureBout({
      mode: "versus",
      p1: fighterById(studioSelection.fighter),
      cpu: nextCpu,
      stage: stageById(currentStageId),
      difficulty: "champion",
      p1Tint: studioPaletteFor(studioSelection.fighter)
    });
  } else if (mode === "ladder") {
    startLadder(studioSelection.fighter);
  } else if (mode === "studio") {
    const curIdx = PALETTE_SWATCHES.findIndex((p) => p.id === studioSelection.palette);
    const nextPalette = PALETTE_SWATCHES[(curIdx + 1) % PALETTE_SWATCHES.length]?.id ?? "default";
    applyStudioPalette(studioSelection.fighter, nextPalette);
  }
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
  } else {
    hud.showMenu(null);
    app.resume();
  }
}

/* ================================================================ */
/* combat helpers                                                    */
/* ================================================================ */

function facingTo(self: FighterRuntime, foe: FighterRuntime): 1 | -1 {
  return foe.body.position[0] >= self.body.position[0] ? 1 : -1;
}

let combatSnapCache: ReturnType<typeof combat.snapshot> | null = null;
function snap() {
  combatSnapCache = combat.snapshot();
  return combatSnapCache;
}

function actorSnap(id: string): GameCombatWorldSnapshot["actors"][number] | undefined {
  return combatSnapCache?.actors.find((a) => a.id === id) ?? combat.snapshot().actors.find((a) => a.id === id);
}

function isAttacking(f: FighterRuntime): boolean {
  return snap().activeAttacks.some((a) => a.attackerId === f.nodeId);
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
    if (f.side === "cpu" && asnap.meter < METER_MAX) {
      return;
    }
    combat.setActor(f.nodeId, { meter: 0 });
    state.stats.specials += 1;
    const pos = f.body.position;
    runtimeEffects.auraBurst([pos[0], pos[1] + 0.9, 0], { ownerId: f.nodeId, intensity: 0.85, color: f.def.special.color });
    runtimeEffects.ringShockwave([pos[0] + facingTo(f, foe) * 0.5, pos[1] + 0.9, 0], { ownerId: f.nodeId, intensity: 0.7, color: f.def.special.color });
    director.special([pos[0], pos[1] + 0.9, 0], 0.5);
    fightingGame.juice.fire("special");
    void fightingGame.sound?.cue("special");
    if (f.side === "p1") hud.announce(f.def.special.name.toUpperCase(), "", "pop");
    app.feel?.emit("special", { strength: 0.7 });
  }
  if (kind === "throw") {
    f.lastThrowFrame = snap().frame;
    state.stats.throws += 1;
    void fightingGame.sound?.cue("throw");
  }
  combat.beginAttack(f.nodeId, moveFor(kind, f.def));
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
    if (f.attack && !snap().activeAttacks.some((a) => a.attackerId === f.nodeId)) f.attack = null;
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
  const holdingAway = axis !== 0 && Math.sign(axis) === -foeDir;
  const crouch = input.held("crouch");
  // Block = dedicated guard key OR holding away (away+crouch = low block).
  const guard = input.held("guard") || holdingAway;

  let dash: -1 | 0 | 1 = 0;
  if (input.pressed("dash")) dash = foeDir;
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

  return { axis, crouch, guard, jump, dash, attack };
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
  const canMove = !ko && !stunned && !busy && !f.crouching && !f.guardIntent;
  const effectiveAxis = canMove && !(movingTowardFoe && dist <= MIN_FIGHTER_SEPARATION + 0.04) ? intent.axis : 0;
  f.body.move(effectiveAxis);

  if (!ko && !stunned && !busy && !f.guardIntent && !f.crouching && intent.jump && f.body.grounded) {
    f.body.jump();
  }

  const dashingTowardFoe = intent.dash * foeDir > 0;
  if (!ko && !stunned && !f.guardIntent && intent.dash !== 0 && f.dashT <= 0 && !(dashingTowardFoe && dist <= MIN_FIGHTER_SEPARATION + 0.22)) {
    f.dashT = 0.34;
    f.body.dash([intent.dash, 0, 0], f.def.stats.dashSpeed);
    runtimeEffects.dashTrail([f.body.position[0], f.body.position[1] + 0.7, 0], { ownerId: f.nodeId, intensity: 0.5 });
    fightingGame.juice.fire("dash");
    void fightingGame.sound?.cue("dash");
  }
  f.dashT = Math.max(0, f.dashT - dt);

  if (!ko && !stunned && !f.guardIntent && intent.attack) {
    tryAttack(f, foe, intent.attack);
  }
}

const combo = {
  p1: { count: 0, timer: 0 },
  cpu: { count: 0, timer: 0 }
};

function handleEvents(): void {
  for (const ev of combat.consumeEvents()) {
    const attacker = ev.attackerId === "player" ? P1 : CPU;
    const target = ev.targetId === "player" ? P1 : ev.targetId === "rival" ? CPU : undefined;
    if (ev.type === "hit" && target) {
      const tSnap = actorSnap(target.nodeId);
      const raw = ev.damage ?? 0;
      const effective = raw * target.def.stats.defense;
      if (tSnap && Math.abs(effective - raw) > 0.01) {
        const corrected = tSnap.health - (effective - raw);
        combat.setActor(target.nodeId, { health: Math.max(0, corrected) });
        if (corrected <= 0) {
          combat.setActor(target.nodeId, { knockedOut: true });
          onKnockout(target.side === "p1" ? "cpu" : "p1");
        }
      }
      if (attacker.attack) attacker.attack.connected = true;
      runtimeEffects.hitSpark(ev.position, { ownerId: ev.attackerId, intensity: 1.05 });
      director.impact(0.42, 0.16);
      fightingGame.juice.fire("hit");
      void fightingGame.sound?.cue("hit");
      app.feel?.emit(ev.moveId?.includes("special") ? "hit-special" : ev.moveId?.includes("heavy") ? "hit-heavy" : "hit-light", { strength: 0.6 });
      if (ev.knockback) {
        target.body.applyKnockback([ev.knockback[0] * 3.0, Math.abs(ev.knockback[1]) * 2.4, 0]);
      }
      const tMeter = (actorSnap(target.nodeId)?.meter ?? 0) + raw * 0.45 * target.def.stats.meterGain;
      combat.setActor(target.nodeId, { meter: Math.min(METER_MAX, tMeter) });
      combo[attacker.side].count += 1;
      combo[attacker.side].timer = 1.35;
      combo[target.side].count = 0;
      state.stats.maxCombo = Math.max(state.stats.maxCombo, combo[attacker.side].count);
      if (attacker.side === "p1") state.stats.p1Hits += 1;
      else state.stats.cpuHits += 1;
      if (state.config.mode === "lab" && attacker.side === "p1" && attacker.attack?.kind === "special" && snap().frame - lastCancelFlashFrame > 90) {
        lastCancelFlashFrame = snap().frame;
        hud.cancelFlash();
      }
    }
    if (ev.type === "blocked" && target) {
      runtimeEffects.blockSpark(ev.position, { ownerId: ev.attackerId, intensity: 0.7 });
      director.impact(0.16, 0.12);
      fightingGame.juice.fire("blocked");
      void fightingGame.sound?.cue("blocked");
      app.feel?.emit("block", { strength: 0.3 });
      if (attacker.attack) attacker.attack.connected = true; // chains off block too
      if (ev.moveId?.endsWith("-special")) {
        const tSnap = actorSnap(target.nodeId);
        if (tSnap) {
          const chip = specialChip(moveFor("special", attacker.def)) * target.def.stats.defense;
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
  if (state.phase !== "fight") return;
  state.phase = "ko";
  state.koTimer = 0;
  state.roundWinner = winner;
  state.slowmo = reducedMotion ? 1 : 0.28;
  fightingGame.session.slowMo(0.28, 1400);
  hud.announce("K.O.", "", "hold");
  void fightingGame.sound?.cue("ko");
  void fightingGame.sound?.cue("ko-voice");
  director.impact(0.7, 0.5);
  runtimeEffects.impactFlash([0, 1.2, -0.4], { intensity: 1.1, color: "#ffd76a" });
  fightingGame.juice.fire("ko");
  app.feel?.emit("ko", { strength: 1 });
}

function endRound(winner: "p1" | "cpu" | "draw"): void {
  if (winner === "p1") state.pipsP1 += 1;
  if (winner === "cpu") state.pipsCpu += 1;
  hud.setPips(state.pipsP1, state.pipsCpu);
  const boutOver = state.pipsP1 >= ROUNDS_TO_WIN || state.pipsCpu >= ROUNDS_TO_WIN;
  if (boutOver) {
    state.phase = "boutEnd";
    state.phaseT = 0;
    const p1Won = state.pipsP1 >= ROUNDS_TO_WIN;
    void fightingGame.sound?.cue(p1Won ? "win" : "ko");
    hud.announce(p1Won ? "YOU WIN" : "YOU LOSE", state.config.mode === "ladder" ? "the crown waits" : "", "hold");
    window.setTimeout(() => showBoutResult(p1Won), 1600);
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
  if (f.attack && snap().activeAttacks.some((a) => a.attackerId === f.nodeId)) return f.attack.kind;
  if (f.attackAnim && f.attackAnim.timer > 0) {
    const moving = Math.abs(f.body.velocity?.[0] ?? 0) > 0.45;
    if (!moving && f.body.grounded && !f.crouching) {
      return f.attackAnim.kind;
    }
  }
  if (!f.body.grounded) return "jump";
  if (f.dashT > 0.12) return "dash";
  if (f.crouching) return "crouch";
  if (asnap.guarding) return "guard";
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
      return { clip: baseEmbedded, loop: false, speed: 2.4 };
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

/* ================================================================ */
/* frame loop                                                        */
/* ================================================================ */

const inputTrail: { label: string; attack?: boolean }[] = [];
const seenInput = new Set<string>();

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
  ShiftLeft: { label: "DSH" }, ShiftRight: { label: "DSH" }, GamepadRB: { label: "DSH" }
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

app.onFrame(({ dt }) => {
  if (!P1 || !CPU || !state) return;
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

  const simDt = dt * s.slowmo;
  s.slowmo = Math.min(1, s.slowmo + dt * 1.4);

  // input trail (throttled DOM writes)
  for (const ev of input.recorded().slice(-8)) {
    const key = `${ev.frame}:${ev.binding}:${ev.type}`;
    if (ev.type === "press" && !seenInput.has(key)) {
      if (seenInput.size > 500) seenInput.clear();
      seenInput.add(key);
      const mapped = BINDING_LABELS[ev.binding];
      if (mapped) {
        inputTrail.push(mapped);
        if (inputTrail.length > 10) inputTrail.shift();
      }
    }
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
        const winner = Math.abs(pPct - cPct) < 0.001 ? "draw" : pPct > cPct ? "p1" : "cpu";
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
  syncNodes();

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

function resolveThrowTech(): void {
  const csnap = snap();
  const pThrow = csnap.activeAttacks.find((a) => a.attackerId === "player" && a.moveId.includes("throw"));
  const cThrow = csnap.activeAttacks.find((a) => a.attackerId === "rival" && a.moveId.includes("throw"));
  if (!pThrow || !cThrow || Math.abs(pThrow.frame - cThrow.frame) > THROW_TECH_FRAMES) return;
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

function publishEvidence(
  pSnap: GameCombatWorldSnapshot["actors"][number] | undefined,
  cSnap: GameCombatWorldSnapshot["actors"][number] | undefined,
  pClip: FighterClip,
  cClip: FighterClip
): void {
  const s = state;
  gameWindow.__AURA3D_SHOWCASE_IRON_CROWN__ = {
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
    combat: snap(),
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
  gameWindow.__AURA3D_GAME_RUNTIME__ = {
    kind: "createGame",
    beacon: gameWindow.__AURA3D_GAME__ ?? { state: "unbound" },
    frame: app.runtime.frame,
    showcase: "iron-crown"
  };
  gameWindow.__AURA3D_GAME_DEBUG__ = game.debug.overlay({
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
  gameWindow.__AURA3D_GAME_EVIDENCE__ = app.evidence({
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
});

