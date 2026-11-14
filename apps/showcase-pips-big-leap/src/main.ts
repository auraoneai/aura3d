// Pip's Big Leap — a 3D mascot platformer on the Aura3D shared runtime.
//
// `createGame` owns the mount, input (actions/axes/buffer), the dpad-2btn
// touch preset, game-sfx-core cues, juice events and the evidence global.
// `world.ts` lowers each WorldSpec into a scene + collision world;
// `player.ts` is the kinematic controller; `certify.ts` drives the engine's
// public platformer-geometry pipeline per world.

import {
  createFixedStepLoop,
  game,
  gameFeel,
  installQaHooks,
  material,
  type AuraRuntimeNodeHandle,
  type AuraSceneSnapshot
} from "@aura3d/engine";
import { createFixedStepPresenter, createGame, createRecordBlend, HUD_THEMES, hudThemeFontFaces, registerGameFonts, sfxUrl } from "@aura3d/engine/game";
import { createLocomotionKit } from "@aura3d/animation";
import "../../showcase-port-shared/quickbar.css";
import "./styles.css";
import { createImpactRig, type ImpactRig } from "../../showcase-port-shared/feel.js";
import { BOSS_CLIPS, PIP_CLIPS } from "./aura-assets.js";
import { PIP_RIG_SOCKETS } from "./art/proceduralModels.js";
import { heroCapeMaterial } from "./game/diorama.js";
import { buildWorld, nodeName, tickPlatforms, type BuiltWorld } from "./game/world.js";
import { createPlayer, stepPlayer, type PlayerState } from "./game/player.js";
import { createBoss, damageBoss, stepBoss, type BossPhase, type BossState } from "./game/boss.js";
import { certifyWorld, type WorldCertification } from "./game/certify.js";
import { createHud } from "./game/hud.js";
import { createSaveStore, recordSeeds, totalSeeds, type PipSave } from "./game/save.js";
import { gateState } from "./game/gate.js";
import { CAM_MIN_CLEARANCE, computeCameraClearance, computeFollowCameraPose, framingFor } from "./game/framing.js";
import { createInputLatch } from "./game/simInput.js";
import { deriveWorldMotion } from "./game/motion.js";
import { worldSpec } from "./game/worlds.js";
import { lookModeFromSearch, miniatureFramingFor, worldFromSearch, worldLookMode, type MiniatureFraming } from "./game/looks.js";
import { createDioramaPresentation, type QaCrop } from "./game/presentation.js";
import type { ModeId, WorldId } from "./game/types.js";
import { installBlackFrameGuard } from "@aura3d/debug";
import { createLoadingProgress } from "../../showcase-port-shared/loading-progress.js";
import { labAppOptions, readLabFlags } from "../../showcase-port-shared/lab-flags.js";
import { createWorkerRendererWorker } from "@aura3d/engine/worker";

installBlackFrameGuard();

// --------------------------------------------------------------------- boot

// GU47 phase 3: each world opens in the look that won its blind panel against 4.6.2
// (`WORLD_DEFAULT_LOOK`: the felt-and-clay diorama or the pre-GU47 4.6.2 presentation);
// `?look=diorama` / `?look=original` force one look everywhere. LOOK_MODE is the boot
// world's look (HUD theme, fonts). `?world=<id>` boots straight into a world (capture convenience).
const REDUCED_MOTION = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const BOOT_WORLD: WorldId = worldFromSearch(window.location.search) ?? "w1";
const LOOK_MODE = lookModeFromSearch(window.location.search, BOOT_WORLD);
const lookOf = (id: WorldId) => worldLookMode(id, window.location.search);

// PBL-H1: the diorama HUD is the E-J `storybook` theme: licensed GT Walsheim text and
// Canela display cuts (copied from packages/game/src/fonts, provenance in its NOTICE.txt)
// on parchment chips (styles.css, scoped by data-pbl-look). `?look=original` keeps today's HUD.
document.documentElement.dataset.pblLook = LOOK_MODE;
if (LOOK_MODE === "diorama") {
  // The DOM's FontFaceSet / FontFace are the registry at runtime; their lib.dom types do not
  // match E-J's narrow FontRegistry shape (handoff to E-J), hence the one cast.
  const registry = { fonts: document.fonts, FontFace: window.FontFace } as unknown as Parameters<typeof registerGameFonts>[1];
  // Served from public/pbl-fonts/ (NOTICE.txt beside them): a `?url` font import breaks the
  // example dev server bundle (no .woff2 loader), which left the route blank in captures.
  void registerGameFonts(`${import.meta.env?.BASE_URL ?? "/"}pbl-fonts/`, registry, hudThemeFontFaces("storybook"));
}

interface WorldRuntime {
  readonly spec: ReturnType<typeof worldSpec>;
  readonly built: BuiltWorld;
  readonly cert: WorldCertification;
}

// QA: `?pbl-ao=0` drops the look's ambient occlusion (AO on/off capture pairs).
const AO_OFF = new URLSearchParams(window.location.search).get("pbl-ao") === "0";
const cache = new Map<WorldId, WorldRuntime>();
function ensureWorld(id: WorldId): WorldRuntime {
  let w = cache.get(id);
  if (!w) {
    const spec = worldSpec(id);
    const built = buildWorld(spec, { ambientOcclusion: !AO_OFF, look: lookOf(id), reducedMotion: REDUCED_MOTION });
    w = { spec, built, cert: certifyWorld(spec, built.motion) };
    cache.set(id, w);
  }
  return w;
}

interface Run {
  world: WorldId;
  mode: ModeId;
  player: PlayerState;
  /** Coyote/buffer window sized from this world's derived motion tuning. */
  assist: ReturnType<typeof game.jumpAssist>;
  boss: BossState | null;
  bossEvents: import("./game/boss.js").BossEvent[];
  bossActive: boolean;
  levelTime: number;
  worldClock: number;
  seeds: Set<string>;
  acorns: Set<string>;
  heartsGot: Set<string>;
  acornCount: number;
  paused: boolean;
  complete: boolean;
  deadTimer: number;
  gateUnlocked: boolean;
  bossHp: number;
  clipState: string;
  bossClip: string;
  /** Transient boss clip (Attack/Hit_Reaction) overrides the phase map while >0. */
  bossFxT: number;
  save: PipSave;
}

// Real save, or an in-memory copy while the autopilot demo runs (C4).
const saves = createSaveStore();
let save = saves.current();
let run: Run = makeRun(BOOT_WORLD, "quick");

function makeRun(worldId: WorldId, mode: ModeId): Run {
  const { spec, built } = ensureWorld(worldId);
  return {
    world: worldId,
    mode,
    player: createPlayer(built),
    assist: game.jumpAssist({
      coyoteMs: built.motion.tuning.coyoteMs,
      bufferMs: built.motion.tuning.jumpBufferMs
    }),
    boss: spec.boss ? createBoss() : null,
    bossEvents: [],
    bossActive: false,
    levelTime: 0,
    worldClock: 0,
    seeds: new Set(save.seeds[worldId] ?? []),
    acorns: new Set(),
    heartsGot: new Set(),
    acornCount: 0,
    paused: false,
    complete: false,
    deadTimer: 0,
    gateUnlocked: false,
    bossHp: 3,
    clipState: "",
    bossClip: "",
    bossFxT: 0,
    save
  };
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_PIPS_BIG_LEAP__?: Record<string, unknown>;
    /** E-I crop contract: named rects (0..1, top-left origin) read at every steady-state shot. */
    __AURA_QA__?: { crops: () => readonly QaCrop[] } & Record<string, unknown>;
  }
}

const isCoarseViewport = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

const pipsGame = createGame({
  id: "showcase-pips-big-leap",
  target: "#app",
  pixelRatio: { max: isCoarseViewport() ? 1.35 : 2, min: 1 },
  // Lab flags: WebGPU by default (backend "auto", WebGL2 fallback kept; real-GPU check 2026-11-09 after the 5.5.1 WebGPU
  // draw-path work: same frame, 0 errors, 1.01x WebGL2 fps in the one load-clean pair; owner-approved switch); ?backend=webgl2 opts out. ?gamut=p3 (Display-P3 canvas) and ?worker=1
  // (worker rendering, main-thread fallback kept) stay off by default.
  ...(() => { const { output, renderer, worker } = labAppOptions(readLabFlags(), { backend: "auto", createWorker: createWorkerRendererWorker }); return { ...(output ? { output } : {}), ...(renderer ? { renderer } : {}), ...(worker ? { worker } : {}) }; })(),
  autoStart: true,
  input: {
    actions: {
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      up: ["KeyW", "ArrowUp"],
      down: ["KeyS", "ArrowDown"],
      jump: ["Space"],
      dive: ["ShiftLeft", "ShiftRight"],
      pound: ["KeyC", "ControlLeft", "ControlRight"],
      pause: ["Escape", "KeyP"],
      camLeft: ["KeyQ"],
      camRight: ["KeyE"]
    },
    axes: {
      moveX: { negative: "left", positive: "right" },
      moveZ: { negative: "down", positive: "up" }
    },
    bufferMs: 140
  },
  // The engine's CreateGameOptions theme union predates E-J's storybook preset (handoff), so
  // the diorama passes the storybook vars record, which HudKit applies the same way.
  hud: { theme: LOOK_MODE === "diorama" ? HUD_THEMES.storybook : "sci-fi-telemetry", widgets: [] },
  touch: {
    preset: "dpad-2btn",
    // Control-ids: dpad buttons + the left stick's four directions (platform
    // layout ships left/right/dash holds + jump/attack pulses + two sticks).
    bindings: {
      left: "left", right: "right", up: "up", down: "down",
      jump: "jump", dash: "dive", attack: "pound",
      "stick.up": "up", "stick.down": "down",
      "stick.left": "left", "stick.right": "right",
      // Right stick orbits the follow camera.
      "rstick.left": "camLeft", "rstick.right": "camRight"
    }
  },
  sound: {
    cues: {
      "level-start": { id: "level-start", asset: { url: sfxUrl("stinger.level-start.00") }, volume: 0.6 },
      win: { id: "win", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.7 },
      lose: { id: "lose", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.6 },
      checkpoint: { id: "checkpoint", asset: { url: sfxUrl("stinger.checkpoint.00") }, volume: 0.55 },
      coin: { id: "coin", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.5 },
      power: { id: "power", asset: { url: sfxUrl("pickup.power-up.00") }, volume: 0.6 },
      whoosh: { id: "whoosh", asset: { url: sfxUrl("whoosh.dash.00") }, volume: 0.45 },
      thud: { id: "thud", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.55 },
      bounce: { id: "bounce", asset: { url: sfxUrl("sports.ball-bounce-hard.00") }, volume: 0.55 },
      bumper: { id: "bumper", asset: { url: sfxUrl("sports.bumper.00") }, volume: 0.6 },
      ui: { id: "ui", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.45 },
      confirm: { id: "confirm", asset: { url: sfxUrl("ui.confirm.00") }, volume: 0.55 },
      heart: { id: "heart", asset: { url: sfxUrl("pickup.extra-life.00") }, volume: 0.6 },
      respawn: { id: "respawn", asset: { url: sfxUrl("pickup.power-down.00") }, volume: 0.5 },
      // Per-world ambient beds (looped on the ambience bus; one plays at a time).
      "amb-open": { id: "amb-open", asset: { url: sfxUrl("ambience.wind-open") }, volume: 0.22, loop: true, bus: "ambience" },
      "amb-high": { id: "amb-high", asset: { url: sfxUrl("ambience.wind-high") }, volume: 0.2, loop: true, bus: "ambience" },
      "amb-hum": { id: "amb-hum", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.24, loop: true, bus: "ambience" },
      "amb-space": { id: "amb-space", asset: { url: sfxUrl("ambience.space-hum") }, volume: 0.2, loop: true, bus: "ambience" }
    }
  },
  juice: {
    jump: { punch: { fovDeg: 1.0, ms: 140 } },
    "double-jump": { punch: { fovDeg: 1.6, ms: 200 } },
    land: { punch: { fovDeg: 0.5, ms: 110 } },
    collect: { punch: { fovDeg: 1.2, ms: 160 } },
    checkpoint: { flash: { color: "#ffe9a3", peak: 0.16, ms: 260 } },
    hurt: { flash: { color: "#ff5a5a", peak: 0.2, ms: 220 } },
    gate: { flash: { color: "#ffd95e", peak: 0.22, ms: 420 } },
    "boss-hit": { punch: { fovDeg: 2.4, ms: 320 } }
  },
  // PBL-E1/E2: the diorama declares the live height-fog and sky paths explicitly (both
  // default-on since E-G, so a reverted flip cannot drop them); the original keeps ["game"].
  qualityRebuild: { flags: LOOK_MODE === "diorama" ? ["game", "vfx.fog", "vfx.sky"] : ["game"] },
  evidence: {
    schema: 1,
    sections: { pipsBigLeap: () => window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__ ?? { status: "unbound" } }
  },
  scene: () => ensureWorld(BOOT_WORLD).built.scene
});

const app = pipsGame.app;
pipsGame.start();

// GU47 WP-16 runtime presentation (post preset, fog, DOF focus, flicker, VFX, trails,
// squash/stretch, camera sequences, QA crops). `?look=original` makes every call a no-op.
const presentation = createDioramaPresentation(app, {
  mode: LOOK_MODE,
  reducedMotion: REDUCED_MOTION,
  heroNode: nodeName.hero,
  gateRingNode: nodeName.gateRing
});

const input = pipsGame.input;
const hud = createHud();
const feel = gameFeel.create({ app, time: app.time });
const impactRig: ImpactRig = createImpactRig({ reducedMotion: REDUCED_MOTION });
let impactFrame: ReturnType<ImpactRig["step"]> = { simDt: 1 / 60, frozen: false, shakeOffset: [0, 0, 0], shakeRoll: 0, fovDeltaDeg: 0 };
app.feel?.preset("platformer");

const locomotion = createLocomotionKit({
  idleClip: PIP_CLIPS.idle,
  walkClip: PIP_CLIPS.walk,
  runClip: PIP_CLIPS.run,
  walkSpeed: 0.8,
  runSpeed: 2.6
});

// ------------------------------------------------------------ node handles

// Handles are cached per mounted scene (C21): about 40 lookups a frame used to
// go through a try/catch `require`. The cache is dropped whenever a world
// swap starts and again once the new scene has mounted.
// The registry also bumps a version on every reset/remount (quality rebuilds
// included); a changed version or registry object drops the cache.
const nodeCache = new Map<string, AuraRuntimeNodeHandle | null>();
let cacheRegistry: unknown = null;
let cacheVersion: number | undefined;
const node = (name: string): AuraRuntimeNodeHandle | null => {
  const registry = app.nodes as unknown as { readonly version?: number };
  if (registry !== cacheRegistry || registry.version !== cacheVersion) {
    nodeCache.clear();
    cacheRegistry = registry;
    cacheVersion = registry.version;
  }
  const cached = nodeCache.get(name);
  if (cached !== undefined) return cached;
  let handle: AuraRuntimeNodeHandle | null = null;
  try {
    handle = app.nodes.require(name) as AuraRuntimeNodeHandle;
  } catch {
    handle = null;
  }
  // Misses are cached too; a remount clears them.
  nodeCache.set(name, handle);
  return handle;
};

// ------------------------------------------------------------- world load

/**
 * `setScene` disposes the render device and remounts — it reloads every GLB,
 * aborts in-flight asset fetches, and on some GPU stacks leaves the canvas
 * dead. Only pay that cost when the world actually changes; a same-world
 * reload resets the mutated runtime nodes on the mounted scene instead.
 */
let mountedWorld: WorldId | undefined = BOOT_WORLD; // the `scene` factory already mounts it

function loadWorld(id: WorldId, mode?: ModeId): void {
  // Mode survives only where it's meaningful: the gauntlet owns "academy",
  // trial follows the player across worlds, everything else is quick play.
  userEngaged = false;
  const previousRun = run;
  const previousWorld = mountedWorld;
  run = makeRun(id, mode ?? (id === "academy" ? "academy" : run.mode === "trial" ? "trial" : "quick"));
  resetCameraRig();
  pipStridePhase = 0;
  pipSpinTimer = 0;
  impactRig.reset();
  simLoop.resetAccumulator();
  inputLatch.clear();
  pipPresenter.reset();
  const { spec, built } = ensureWorld(id);
  if (mountedWorld !== id) {
    mountedWorld = id;
    nodeCache.clear();
    swapping = true;
    // Route swaps through game.setScene so the FX pool, look signature, and
    // first-presented beacon all re-arm per world.
    const target = run;
    pipsGame
      .setScene(built.scene as unknown as AuraSceneSnapshot)
      .then(() => {
        nodeCache.clear();
        swapping = false;
        // The new scene's nodes exist only now: re-apply this run's state.
        if (run === target) applyRunNodeState();
        presentation.worldMounted(built);
      })
      .catch((error: unknown) => {
        // C10: the old world's visuals are still mounted, so put the old run
        // (and its collision) back instead of simulating an invisible world.
        console.error("[pips-big-leap] world swap failed", error);
        nodeCache.clear();
        swapping = false;
        mountedWorld = previousWorld;
        if (run === target) {
          run = previousRun;
          const prevSpec = ensureWorld(run.world).spec;
          hud.setWorld(prevSpec.title);
          hud.setVenue(run.world);
          hud.setObjective(objectiveText());
          startAmbience(run.world);
        }
        hud.toast(`Could not open ${spec.title}. Staying in ${ensureWorld(run.world).spec.title}.`, 4);
      });
  } else {
    // Same world: undo the node mutations a run leaves behind — collected
    // pickups, unlocked gate, activated checkpoint flags — without remounting.
    for (const s of spec.seeds) node(nodeName.seed(s.id))?.setVisible(!run.seeds.has(s.id));
    for (const a of spec.acorns) node(nodeName.acorn(a.id))?.setVisible(true);
    for (const h of spec.hearts) node(nodeName.heart(h.id))?.setVisible(true);
    for (const cp of spec.checkpoints) {
      (node(nodeName.checkpointFlag(cp.id)) as unknown as { setMaterial(m: unknown): void } | null)?.setMaterial(undefined);
    }
    for (let i = 0; i < 6; i += 1) node(nodeName.bossSpike(i))?.setVisible(false);
  }
  // Persisted progress: collected seeds stay gone, and a world the player
  // already seeded open starts with the Sun-Gate unlatched (boss aside).
  run.gateUnlocked = gateState({ seeds: run.seeds.size, gateSeeds: spec.gateSeeds, boss: Boolean(spec.boss), bossHp: run.bossHp }).unlocked;
  applyRunNodeState();

  // C23: the double jump unlocks in World 2 and in every later world, so a
  // player who opens World 3-6 from the bar or the Atlas has it too.
  if ((spec.doubleJumpGrant || spec.order >= 2) && !save.doubleJump) {
    save = saves.commit({ ...save, doubleJump: true });
    run.save = save;
    hud.toast(spec.doubleJumpGrant && spec.unlockHint ? spec.unlockHint : "Double-jump unlocked — press SPACE again in mid-air!", 4);
  } else if (spec.unlockHint && !save.completed[id]) {
    hud.toast(spec.unlockHint, 3.5);
  }

  hud.setMode(run.mode);
  hud.setWorld(spec.title);
  hud.setHearts(run.player.hearts);
  hud.setSeeds(run.seeds.size, spec.seedGoal);
  hud.setAcorns(0);
  hud.setTimer(run.mode === "trial" ? 0 : run.levelTime, spec.medals);
  hud.setObjective(objectiveText());
  hud.setBoss(3, 3, false);
  hud.showPause(false);
  hud.showComplete(false);
  hud.setVenue(id);
  hud.setTopMode(run.mode);
  hud.banner(spec.title.toUpperCase(), spec.subtitle, 2.8);
  void pipsGame.sound?.cue("level-start");
  startAmbience(id);
  publishEvidence();
}

/** Mirror the run's state onto the mounted scene nodes (pickups, gate lock, studio colours, hero pose). */
function applyRunNodeState(): void {
  const { spec } = ensureWorld(run.world);
  for (const s of spec.seeds) node(nodeName.seed(s.id))?.setVisible(!run.seeds.has(s.id));
  for (const a of spec.acorns) node(nodeName.acorn(a.id))?.setVisible(!run.acorns.has(a.id));
  for (const h of spec.hearts) node(nodeName.heart(h.id))?.setVisible(!run.heartsGot.has(h.id));
  for (const cp of spec.checkpoints) node(nodeName.checkpointFlag(cp.id))?.setVisible(true);
  node(nodeName.gateLock)?.setVisible(!run.gateUnlocked);
  applyStudioColors();
  lastPipScaleY = -1;
  pipSpinTimer = 0;
  pipLandTimer = 0;
  run.clipState = "";
  driveAnimation(run.player, 0);
}

const AMBIENCE_FOR: Record<WorldId, "amb-open" | "amb-high" | "amb-hum" | "amb-space"> = {
  academy: "amb-open",
  w1: "amb-open",
  w2: "amb-open",
  w3: "amb-high",
  w4: "amb-hum",
  w5: "amb-hum",
  w6: "amb-space"
};
let ambience: (typeof AMBIENCE_FOR)[WorldId] | null = null;

/** C24: one looped ambient bed per world; swaps when the world changes. */
function startAmbience(id: WorldId): void {
  const next = AMBIENCE_FOR[id];
  if (ambience && ambience !== next) pipsGame.sound?.stopCue(ambience, 400);
  ambience = next;
  void pipsGame.sound?.cue(next);
}

function objectiveText(): string {
  const { spec } = ensureWorld(run.world);
  const need = spec.gateSeeds;
  if (gateState({ seeds: run.seeds.size, gateSeeds: need, boss: Boolean(spec.boss), bossHp: run.bossHp }).bossBarring) return `Sun-Gate wants ${need} seeds — but Brambleback guards it. Defeat him!`;
  if (run.seeds.size < need) return `Gather sun-seeds for the Sun-Gate (${run.seeds.size}/${need} needed, ${spec.seedGoal} hidden).`;
  return "The Sun-Gate is open — leap through!";
}

// C7: Pip's GLB has one baked material, so there is no cap mesh to tint; the
// Studio tints the cape with the dual-backend cloth shader in diorama mode.
function applyStudioColors(): void {
  const worldDiorama = ensureWorld(run.world).built.presentation.mode === "diorama";
  node(nodeName.heroCape)?.setMaterial(
    worldDiorama
      ? heroCapeMaterial(save.studio.cape, REDUCED_MOTION ? 0.3 : 1)
      : material.pbr({ color: save.studio.cape, roughness: 0.6 })
  );
}

// ------------------------------------------------------------- event sink

type CueName = Parameters<NonNullable<typeof pipsGame.sound>["cue"]>[0];
const cue = (name: CueName) => void pipsGame.sound?.cue(name);
const juice = (name: "jump" | "double-jump" | "land" | "collect" | "checkpoint" | "hurt" | "gate" | "boss-hit") => pipsGame.juice.fire(name);

function handleEvent(e: import("./game/player.js").PlayerEvent): void {
  const { spec, built } = ensureWorld(run.world);
  // GU47 WP-16 PBL-V1: presentation-only feedback (VFX, squash/stretch, camera); never feeds the sim.
  const fx = (): void => presentation.event(e, built, [run.player.x, run.player.y, run.player.z]);
  switch (e.kind) {
    case "jump": cue("whoosh"); juice("jump"); impactRig.trigger({ freezeSeconds: 0, trauma: 0.08, fovKickDeg: 1.2 }); fx(); break;
    case "double-jump": pipSpinTimer = 0.42; cue("whoosh"); juice("double-jump"); impactRig.trigger({ freezeSeconds: 0, trauma: 0.1, fovKickDeg: 1.6 }); fx(); break;
    case "land": pipLandTimer = 0.24; juice("land"); impactRig.trigger({ freezeSeconds: 0, trauma: 0.14, fovKickDeg: -0.9 }); fx(); break;
    case "glide-start": cue("whoosh"); break;
    case "dive": cue("whoosh"); impactRig.trigger({ freezeSeconds: 0, trauma: 0.12, fovKickDeg: 2.0 }); break;
    case "pound": break;
    case "pound-land": pipLandTimer = 0.34; cue("thud"); juice("land"); impactRig.trigger({ freezeSeconds: 0.032, trauma: 0.36, fovKickDeg: -2.2 }); fx(); break;
    case "spring": cue("bounce"); juice("jump"); impactRig.trigger({ freezeSeconds: 0, trauma: 0.16, fovKickDeg: 2.4 }); fx(); break;
    case "swim": cue("bounce"); break;
    case "hurt": case "boss-contact": {
      fx();
      hud.setHearts(run.player.hearts);
      juice("hurt");
      impactRig.trigger({ freezeSeconds: 0.038, trauma: 0.42, fovKickDeg: -1.8 });
      cue("bumper");
      if (e.kind === "boss-contact" && run.boss && run.boss.phase !== "down") {
        node(nodeName.boss)?.setAnimation?.({ clip: BOSS_CLIPS.attack, loop: false });
        run.bossClip = "attack";
        run.bossFxT = 0.9;
      }
      break;
    }
    case "die": {
      hud.setHearts(0);
      cue("lose");
      run.deadTimer = 1.4;
      break;
    }
    case "respawn": {
      resetCameraRig();
      cue("respawn");
      hud.setHearts(run.player.hearts);
      hud.toast("Back to the last checkpoint!", 1.6);
      break;
    }
    case "checkpoint": {
      fx();
      cue("checkpoint");
      juice("checkpoint");
      node(nodeName.checkpointFlag(e.id ?? ""))?.setMaterial(
        material.emissive({ color: "#ffd95e", emissive: "#ffcf3d", emissiveIntensity: 0.85 })
      );
      hud.toast("Checkpoint!", 1.4);
      break;
    }
    case "seed": {
      const id = e.id ?? "";
      if (run.seeds.has(id)) return;
      run.seeds.add(id);
      fx();
      node(nodeName.seed(id))?.setVisible(false);
      save = saves.commit(recordSeeds(save, run.world, [id]));
      run.save = save;
      hud.setSeeds(run.seeds.size, spec.seedGoal);
      hud.setObjective(objectiveText());
      cue("power");
      juice("collect");
      hud.toast(`Sun-seed ${run.seeds.size}/${spec.seedGoal}`, 1.4);
      if (!run.gateUnlocked) {
        // C6: the lock icon goes only when the gate really opens.
        const gate = gateState({ seeds: run.seeds.size, gateSeeds: spec.gateSeeds, boss: Boolean(spec.boss), bossHp: run.bossHp });
        run.gateUnlocked = gate.unlocked;
        node(nodeName.gateLock)?.setVisible(gate.lockVisible);
        if (gate.unlocked) {
          hud.toast("The Sun-Gate is open!", 2.4);
          presentation.gateUnlocked(built);
        } else if (gate.bossBarring) hud.toast("The gate hums — but Brambleback bars the way!", 2.6);
        hud.setObjective(objectiveText());
      }
      break;
    }
    case "acorn": {
      const id = e.id ?? "";
      if (run.acorns.has(id)) return;
      run.acorns.add(id);
      run.acornCount += 1;
      fx();
      node(nodeName.acorn(id))?.setVisible(false);
      hud.setAcorns(run.acornCount);
      cue("coin");
      break;
    }
    case "heart": {
      const id = e.id ?? "";
      if (run.heartsGot.has(id)) return;
      // C15: at full health the heart stays where it is for later.
      if (run.player.hearts >= 3) return;
      run.heartsGot.add(id);
      node(nodeName.heart(id))?.setVisible(false);
      run.player.hearts += 1;
      hud.setHearts(run.player.hearts);
      cue("heart");
      hud.toast("+1 heart", 1.2);
      break;
    }
    case "boss-hit": {
      if (!run.boss) break;
      damageBoss(run.boss, run.bossEvents);
      run.bossHp = run.boss.hp;
      hud.setBoss(run.bossHp, 3, true);
      if (run.boss.hp > 0) {
        node(nodeName.boss)?.setAnimation?.({ clip: BOSS_CLIPS.hurt, loop: false });
        run.bossClip = "hurt";
        run.bossFxT = 0.7;
      }
      juice("boss-hit");
      impactRig.trigger({ freezeSeconds: 0.045, trauma: 0.46, fovKickDeg: 2.6 });
      cue("thud");
      if (run.boss.hp <= 0) {
        const gate = gateState({ seeds: run.seeds.size, gateSeeds: spec.gateSeeds, boss: true, bossHp: 0 });
        run.gateUnlocked = gate.unlocked;
        node(nodeName.gateLock)?.setVisible(gate.lockVisible);
        if (gate.unlocked) presentation.gateUnlocked(built);
        const short = spec.gateSeeds - run.seeds.size;
        hud.banner("BRAMBLEBACK DOWN!", gate.unlocked ? "The Sun-Gate is unlatched." : `Find ${short} more sun-seed${short === 1 ? "" : "s"} to open the Sun-Gate.`, 3);
        hud.setObjective(objectiveText());
        cue("win");
      } else {
        hud.toast(`Brambleback staggers — ${run.bossHp} hits left!`, 2);
      }
      break;
    }
    case "gate": {
      if (run.complete) return;
      const need = spec.gateSeeds;
      if (run.seeds.size < need) {
        if (run.worldClock % 1 < 0.05) hud.toast(`The gate wants ${need - run.seeds.size} more sun-seed${need - run.seeds.size === 1 ? "" : "s"}…`, 1.2);
        return;
      }
      if (spec.boss && run.bossHp > 0) return;
      completeWorld();
      break;
    }
    default: break;
  }
}

function completeWorld(): void {
  const { spec, built } = ensureWorld(run.world);
  run.complete = true;
  run.player.state = "celebrate";
  cue("win");
  juice("gate");
  presentation.gateOpened(built);
  const completed = { ...save.completed, [run.world]: true as const };
  let next: PipSave = { ...save, completed };
  if (run.world === "academy" && !next.academyDone) {
    next = { ...next, academyDone: true };
  }
  let medal = "";
  if (run.mode === "trial") {
    const best = next.bestTimes[run.world];
    if (best === undefined || run.levelTime < best) {
      next = { ...next, bestTimes: { ...next.bestTimes, [run.world]: Math.round(run.levelTime * 10) / 10 } };
    }
    medal = run.levelTime <= spec.medals.gold ? " · GOLD" : run.levelTime <= spec.medals.silver ? " · SILVER" : run.levelTime <= spec.medals.bronze ? " · BRONZE" : "";
  }
  save = saves.commit(next);
  run.save = save;
  const nextId = nextWorldId(run.world);
  hud.showComplete(
    true,
    run.world === "academy" ? "GAUNTLET CLEARED!" : "SUN-GATE OPENED!",
    `${spec.title} is bright again — ${run.seeds.size}/${spec.seedGoal} seeds, ${run.acornCount} acorns${medal}.`,
    [
      `Time — ${run.levelTime.toFixed(1)}s`,
      `Sun-seeds — ${run.seeds.size}/${spec.seedGoal}`,
      `Acorns — ${run.acornCount}`,
      ...(run.mode === "trial" ? [`Best — ${save.bestTimes[run.world]?.toFixed(1) ?? "—"}s${medal}`] : []),
      ...(spec.boss ? [`Brambleback — ${3 - run.bossHp}/3 hits`] : [])
    ],
    nextId ? `Next — ${worldSpec(nextId).title}` : "The Vale is saved!"
  );
  const nextBtn = document.getElementById("pbl-next-world") as HTMLButtonElement | null;
  if (nextBtn) nextBtn.disabled = !nextId;
  hud.banner("SUN-GATE OPENED!", spec.title, 3);
  if (autopilot) {
    window.setTimeout(() => {
      if (autopilot && run.complete) {
        loadWorld(nextId ?? "w1", run.mode);
      }
    }, 2400);
  }
}

function nextWorldId(id: WorldId): WorldId | null {
  const order = ["academy", "w1", "w2", "w3", "w4", "w5", "w6"] as const;
  const i = order.indexOf(id);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

// --------------------------------------------------------- AI autopilot

const params = new URLSearchParams(window.location.search);
let autopilot = params.get("autoplay") === "1" || params.get("demo") === "1";
let appReady = false;
let userEngaged = false;
let aiJumpCooldown = 0;
let aiStuckTimer = 0;
let aiLastZ = 0;

function setAutopilot(next: boolean): void {
  autopilot = next;
  if (autopilot) {
    userEngaged = true;
  }
  // C4: the demo plays against an in-memory copy of the save; switching it
  // off drops whatever the AI earned.
  save = saves.setDemo(next);
  run.save = save;
  const btn = document.getElementById("aura-btn-auto");
  if (btn) {
    btn.classList.toggle("active", autopilot);
    btn.setAttribute("aria-pressed", autopilot ? "true" : "false");
    btn.textContent = "Auto";
  }
}

function hasGroundBelow(built: BuiltWorld, x: number, y: number, z: number): boolean {
  for (const s of built.solids) {
    if (!s.active) continue;
    const top = s.y + s.hy;
    if (
      Math.abs(x - s.x) <= s.hx - 0.08 &&
      Math.abs(z - s.z) <= s.hz - 0.08 &&
      top <= y + 0.5 &&
      top >= y - 1.6
    ) {
      return true;
    }
  }
  return false;
}

function computeAutopilotInput(
  built: BuiltWorld,
  spec: BuiltWorld["spec"],
  seconds: number,
  bossVulnerable: boolean,
  bossAt?: readonly [number, number, number]
): import("./game/player.js").PlayerInput {
  const p = run.player;
  aiJumpCooldown = Math.max(0, aiJumpCooldown - seconds);

  // Brief opening showcase beat on the starting platform so Pip, his sidekick,
  // and the Whispering Forest jump course are framed cleanly on initial load.
  if (run.worldClock < 1.15) {
    return {
      moveX: 0,
      moveZ: run.worldClock > 0.45 ? 0.35 : 0,
      jumpPressed: false,
      jumpHeld: false,
      divePressed: false,
      poundPressed: false
    };
  }

  if (Math.abs(p.z - aiLastZ) < 0.12 && Math.hypot(p.vx, p.vz) < 0.7) {
    aiStuckTimer += seconds;
  } else {
    aiStuckTimer = 0;
    aiLastZ = p.z;
  }

  // Pick next waypoint: boss (if in W5 arena), next platform/seed ahead, or Sun-Gate.
  let tx = spec.gate.x;
  let ty = spec.gate.y;
  let tz = spec.gate.z;

  if (run.boss && run.boss.hp > 0 && p.z < -52 && bossAt) {
    if (bossVulnerable) {
      tx = bossAt[0];
      ty = bossAt[1] + 1.1;
      tz = bossAt[2];
    } else {
      const orbitA = run.worldClock * 1.6;
      tx = Math.sin(orbitA) * 4.2;
      ty = 2.0;
      tz = -69 + Math.cos(orbitA) * 4.2;
    }
  } else {
    // Step platform-by-platform along the course so Pip never skips intermediate pads.
    let currentPlat: (typeof built.solids)[number] | null = null;
    for (const s of built.solids) {
      if (!s.active) continue;
      if (Math.abs(p.x - s.x) <= s.hx + 0.35 && Math.abs(p.z - s.z) <= s.hz + 0.35) {
        currentPlat = s;
        break;
      }
    }
    const frontEdgeZ = currentPlat ? currentPlat.z - currentPlat.hz : p.z - 0.4;
    let nextPlat: (typeof built.solids)[number] | null = null;
    let bestNextDist = Infinity;
    for (const s of built.solids) {
      if (!s.active || s === currentPlat) continue;
      if (s.z >= frontEdgeZ + 0.2) continue;
      const d = Math.hypot((s.x - p.x) * 0.9, s.z - frontEdgeZ);
      if (d < bestNextDist) {
        bestNextDist = d;
        nextPlat = s;
      }
    }
    if (nextPlat) {
      tx = nextPlat.x;
      ty = nextPlat.y + nextPlat.hy;
      tz = nextPlat.z;
    }

    // If an uncollected seed sits on the current or next platform, steer through it.
    for (const s of spec.seeds) {
      if (run.seeds.has(s.id)) continue;
      if (s.z <= p.z + 1.0 && s.z >= tz - 1.5 && Math.abs(s.x - tx) <= 2.4) {
        tx = s.x;
        ty = s.y;
        tz = s.z;
        break;
      }
    }
  }

  const dx = tx - p.x;
  const dz = tz - p.z;
  const distXZ = Math.hypot(dx, dz);
  const dirX = distXZ > 0.05 ? dx / distXZ : 0;
  const dirZ = distXZ > 0.05 ? dz / distXZ : -1;

  // Convert desired world direction (dirX, dirZ) into camera-relative moveX, moveZ.
  const fwdX = Math.sin(p.camYaw);
  const fwdZ = Math.cos(p.camYaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;
  const moveZ = Math.max(-1, Math.min(1, dirX * fwdX + dirZ * fwdZ));
  const moveX = Math.max(-1, Math.min(1, dirX * rightX + dirZ * rightZ));

  // Determine jump triggers right near the platform edge (0.42m ahead) so Pip never jumps early into a gap.
  const lookX = p.x + dirX * 0.42;
  const lookZ = p.z + dirZ * 0.42;
  const groundAhead = hasGroundBelow(built, lookX, p.y, lookZ);
  const hazardAhead = built.hazards.some(
    (h) => Math.abs(lookX - h.x) <= h.hx + 0.5 && Math.abs(lookZ - h.z) <= h.hz + 0.5 && Math.abs(p.y - h.y) <= 1.4
  );
  const wantStepJump = ty > p.y + 0.45 && distXZ < 3.4 && !groundAhead;
  const wantGapJump = p.grounded && !groundAhead && distXZ > 0.7;
  const wantBossJump = Boolean(bossVulnerable && bossAt && Math.hypot(bossAt[0] - p.x, bossAt[2] - p.z) < 3.4);

  let jumpPressed = false;
  if (aiJumpCooldown <= 0) {
    if (p.grounded && (wantGapJump || hazardAhead || wantStepJump || wantBossJump || aiStuckTimer > 0.55)) {
      jumpPressed = true;
      aiJumpCooldown = 0.28;
      aiStuckTimer = 0;
    } else if (!p.grounded && p.vy < -0.4 && p.jumpsLeft > 0 && !hasGroundBelow(built, p.x, p.y, p.z)) {
      jumpPressed = true;
      aiJumpCooldown = 0.32;
    }
  }

  const jumpHeld = !p.grounded && (distXZ > 1.4 || ty > p.y - 0.2);
  const divePressed = !p.grounded && p.vy < -1.8 && distXZ > 3.6 && !hasGroundBelow(built, p.x, p.y, p.z);

  return {
    moveX,
    moveZ,
    jumpPressed,
    jumpHeld,
    divePressed,
    poundPressed: false
  };
}

// -------------------------------------------------------------- clip state

/** Boss phase → Meshy clip (idle/chase/telegraph/staggered/down). */
const BOSS_CLIP_FOR: Record<BossPhase, { clip: string; loop?: boolean }> = {
  dormant: { clip: BOSS_CLIPS.idle },
  roll: { clip: BOSS_CLIPS.walk },
  windup: { clip: BOSS_CLIPS.taunt },
  vulnerable: { clip: BOSS_CLIPS.hurt },
  down: { clip: BOSS_CLIPS.die, loop: false }
};

const CLIP_FOR: Record<string, { clip: string; speed?: number; loop?: boolean }> = {
  air: { clip: PIP_CLIPS.fall, speed: 1.15 },
  jump: { clip: PIP_CLIPS.jump, loop: false, speed: 1.25 },
  glide: { clip: PIP_CLIPS.fall, speed: 0.9 },
  dive: { clip: PIP_CLIPS.fall, speed: 1.6 },
  pound: { clip: PIP_CLIPS.crouch, speed: 1.2 },
  swim: { clip: PIP_CLIPS.walk, speed: 0.85 },
  hurt: { clip: PIP_CLIPS.hurt, loop: false, speed: 1.15 },
  dead: { clip: PIP_CLIPS.die, loop: false },
  celebrate: { clip: PIP_CLIPS.celebrate, loop: false }
};

// ------------------------------------------------------- camera occlusion

/** Hysteresis state: shorten smoothly on real blockers, relax back out cleanly. */
const cameraRig = { clearance: 1, ready: false };

function resetCameraRig(): void {
  cameraRig.clearance = 1;
  cameraRig.ready = false;
}

function cameraClearance(p: PlayerState, built: BuiltWorld, camX: number, camZ: number, camY: number): number {
  return computeCameraClearance(p, built.cameraObstacles, camX, camZ, camY);
}

let pipStridePhase = 0;
let pipSpinTimer = 0;
let pipLandTimer = 0;
let lastPipScaleY = -1;

const MAT_TORSO = new Float64Array(9);
const MAT_HEAD = new Float64Array(9);

function writeEulerZYXMatrix(out: Float64Array, rx: number, ry: number, rz: number): void {
  const sx = Math.sin(rx), cx = Math.cos(rx);
  const sy = Math.sin(ry), cy = Math.cos(ry);
  const sz = Math.sin(rz), cz = Math.cos(rz);
  out[0] = cz * cy; out[1] = cz * sy * sx - sz * cx; out[2] = cz * sy * cx + sz * sx;
  out[3] = sz * cy; out[4] = sz * sy * sx + cz * cx; out[5] = sz * sy * cx - cz * sx;
  out[6] = -sy;     out[7] = cy * sx;                out[8] = cy * cx;
}

function placeYawPart(
  handle: ReturnType<typeof node>,
  ox: number,
  oy: number,
  oz: number,
  yaw: number,
  lx: number,
  ly: number,
  lz: number,
  rx: number,
  ry: number,
  rz: number
): void {
  if (!handle) return;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  handle.setPosition(ox + lx * cy + lz * sy, oy + ly, oz - lx * sy + lz * cy);
  const sx = Math.sin(rx), cx = Math.cos(rx);
  const sry = Math.sin(ry), cry = Math.cos(ry);
  const sz = Math.sin(rz), cz = Math.cos(rz);
  const l00 = cz * cry, l01 = cz * sry * sx - sz * cx, l02 = cz * sry * cx + sz * sx;
  const l10 = sz * cry, l11 = sz * sry * sx + cz * cx, l12 = sz * sry * cx - cz * sx;
  const l20 = -sry,     l21 = cry * sx,                l22 = cry * cx;
  const m00 = cy * l00 + sy * l20;
  const m01 = cy * l01 + sy * l21;
  const m02 = cy * l02 + sy * l22;
  const m10 = l10, m11 = l11, m12 = l12;
  const m20 = -sy * l00 + cy * l20;
  const m21 = -sy * l01 + cy * l21;
  const m22 = -sy * l02 + cy * l22;
  const cosEy = Math.hypot(m00, m10);
  const ey = Math.atan2(-m20, cosEy);
  const ex = cosEy > 1e-6 ? Math.atan2(m21, m22) : Math.atan2(-m12, m11);
  const ez = cosEy > 1e-6 ? Math.atan2(m10, m00) : 0;
  handle.setRotation(ex, ey, ez);
}

function animateProceduralPip(p: PlayerState, key: string, planar: number, dt: number): void {
  const torso = node(`${nodeName.hero}:torso`);
  const head = node(`${nodeName.hero}:head`);
  const earL = node(`${nodeName.hero}:ear-l`);
  const earR = node(`${nodeName.hero}:ear-r`);
  const armL = node(`${nodeName.hero}:arm-l`);
  const armR = node(`${nodeName.hero}:arm-r`);
  const footL = node(`${nodeName.hero}:foot-l`);
  const footR = node(`${nodeName.hero}:foot-r`);
  const tail = node(`${nodeName.hero}:tail`);
  if (!torso) return;

  const t = run.worldClock;
  if (dt > 0) {
    pipSpinTimer = Math.max(0, pipSpinTimer - dt);
    pipLandTimer = Math.max(0, pipLandTimer - dt);
    const cadence = key === "run" ? 3.4 + planar * 2.15 : key === "walk" || key === "swim" ? 2.5 + planar * 1.6 : 0;
    pipStridePhase = cadence > 0 ? (pipStridePhase + dt * cadence) % (Math.PI * 2) : pipStridePhase * Math.exp(-8 * dt);
  }

  const s = Math.sin(pipStridePhase);
  const c = Math.cos(pipStridePhase * 2);
  const idleBreath = Math.sin(t * 2.8);
  const earFlutter = Math.sin(t * (key === "glide" ? 14 : 4.4));
  const spinProgress = pipSpinTimer > 0 ? 1 - pipSpinTimer / 0.42 : 0;
  const spinYaw = spinProgress > 0 ? spinProgress * Math.PI * 2 : 0;
  const landCushion = p.grounded && pipLandTimer > 0 ? Math.sin(Math.min(1, pipLandTimer / 0.24) * Math.PI) : 0;

  if (spinYaw !== 0) {
    node(nodeName.hero)?.setRotation(0, p.yaw + spinYaw, 0);
  }

  let bobY = 0;
  let hipBobY = 0;
  let leanX = 0;
  let torsoTwistY = 0;
  let rollZ = 0;
  let headNod = 0;
  let headYaw = 0;
  let headRoll = 0;
  let armPitchL = 0;
  let armPitchR = 0;
  let armSplay = 0.2;
  let legPitchL = 0;
  let legPitchR = 0;
  let legSplay = 0.02;
  let earPerk = 0.04;
  let earSweepBack = 0.06;
  let earPitch = 0;
  let tailPitch = 0.05;
  let tailWag = Math.sin(t * 4.2) * 0.16;

  switch (key) {
    case "run":
      bobY = Math.max(0, -c) * 0.056;
      hipBobY = Math.max(0, -c) * 0.034;
      leanX = Math.min(0.24, 0.09 + planar * 0.024);
      torsoTwistY = -s * 0.16;
      rollZ = -s * 0.065;
      headNod = -0.06 + Math.cos(pipStridePhase * 2) * 0.035;
      headYaw = s * 0.1;
      armPitchL = s * 0.9 - 0.08;
      armPitchR = -s * 0.9 - 0.08;
      armSplay = 0.11 + Math.abs(s) * 0.05;
      legPitchL = -s * 0.82;
      legPitchR = s * 0.82;
      earPerk = -0.04 + Math.sin(pipStridePhase * 2) * 0.08;
      earSweepBack = 0.22;
      tailPitch = -0.14 + Math.cos(pipStridePhase * 2) * 0.14;
      tailWag = s * 0.34;
      break;
    case "walk":
      bobY = Math.max(0, -c) * 0.032;
      hipBobY = Math.max(0, -c) * 0.02;
      leanX = 0.055;
      torsoTwistY = -s * 0.1;
      rollZ = -s * 0.038;
      headYaw = s * 0.06;
      armPitchL = s * 0.54 - 0.05;
      armPitchR = -s * 0.54 - 0.05;
      armSplay = 0.09;
      legPitchL = -s * 0.48;
      legPitchR = s * 0.48;
      earPerk = 0.02 + Math.sin(pipStridePhase * 2) * 0.05;
      earSweepBack = 0.12;
      tailWag = s * 0.24;
      break;
    case "swim":
      bobY = Math.sin(t * 4.5) * 0.04 - 0.08;
      hipBobY = bobY;
      leanX = 0.34;
      headNod = -0.18;
      armPitchL = Math.sin(t * 6.5) * 0.95 - 0.35;
      armPitchR = -Math.sin(t * 6.5) * 0.95 - 0.35;
      armSplay = 0.42;
      legPitchL = -Math.sin(t * 6.5) * 0.45 + 0.25;
      legPitchR = Math.sin(t * 6.5) * 0.45 + 0.25;
      earSweepBack = 0.24;
      tailWag = Math.sin(t * 7.5) * 0.42;
      break;
    case "jump":
    case "air": {
      const rising = Math.max(-1, Math.min(1, p.vy * 0.16));
      const spinning = pipSpinTimer > 0;
      bobY = rising * 0.04;
      hipBobY = bobY;
      leanX = -rising * 0.12 + Math.min(0.18, planar * 0.02);
      headNod = -rising * 0.16;
      if (spinning) {
        armPitchL = -0.92;
        armPitchR = -0.92;
        armSplay = 0.88;
        legPitchL = -0.28;
        legPitchR = 0.34;
      } else if (rising > 0) {
        armPitchL = -0.58 - rising * 0.36;
        armPitchR = -0.68 - rising * 0.78;
        armSplay = 0.44;
        legPitchL = -0.44 * rising + 0.08;
        legPitchR = 0.42 * rising + 0.08;
      } else {
        armPitchL = -0.78;
        armPitchR = -0.78;
        armSplay = 0.56;
        legPitchL = -0.18;
        legPitchR = 0.24;
      }
      legSplay = 0.06;
      earPerk = (rising > 0 ? -0.12 * rising : 0.16) + earFlutter * 0.05;
      earSweepBack = 0.18;
      tailPitch = -0.24 * (1 - rising);
      break;
    }
    case "glide":
      bobY = Math.sin(t * 5.2) * 0.025;
      hipBobY = bobY;
      leanX = 0.36;
      headNod = -0.22;
      armPitchL = -0.22;
      armPitchR = -0.22;
      armSplay = 1.16 + Math.sin(t * 9) * 0.08;
      legPitchL = 0.34;
      legPitchR = 0.34;
      legSplay = 0.08;
      earPerk = 0.08 + earFlutter * 0.11;
      earSweepBack = 0.28;
      tailPitch = -0.22;
      tailWag = Math.sin(t * 11) * 0.28;
      break;
    case "dive":
      leanX = 0.56;
      headNod = -0.2;
      armPitchL = -1.18;
      armPitchR = -1.18;
      armSplay = 0.28;
      legPitchL = 0.48;
      legPitchR = 0.48;
      earPerk = -0.18;
      earSweepBack = 0.34;
      tailPitch = -0.32;
      break;
    case "pound":
      bobY = -0.07;
      hipBobY = bobY;
      leanX = 0.22;
      headNod = 0.14;
      armPitchL = 0.42;
      armPitchR = 0.42;
      armSplay = 0.58;
      legPitchL = -0.58;
      legPitchR = -0.58;
      legSplay = 0.08;
      earPerk = 0.16;
      break;
    case "hurt":
      bobY = 0.03;
      hipBobY = bobY;
      leanX = -0.28;
      rollZ = Math.sin(t * 24) * 0.12;
      headNod = -0.14;
      armPitchL = -0.88;
      armPitchR = -0.88;
      armSplay = 0.68;
      earPerk = -0.22;
      break;
    case "dead":
      bobY = -0.16;
      hipBobY = bobY;
      leanX = 0.62;
      headNod = 0.18;
      armSplay = 0.72;
      legPitchL = 0.38;
      legPitchR = 0.38;
      earPerk = -0.26;
      tailWag = 0;
      break;
    case "celebrate": {
      const hop = Math.abs(Math.sin(t * 6.4));
      bobY = hop * 0.14;
      hipBobY = bobY;
      rollZ = Math.sin(t * 6.4) * 0.1;
      headRoll = Math.sin(t * 6.4) * 0.08;
      headNod = -0.1 * hop;
      armPitchL = -2.28 + Math.sin(t * 12.8) * 0.22;
      armPitchR = -2.28 - Math.sin(t * 12.8) * 0.22;
      armSplay = 0.42;
      legPitchL = hop * 0.35;
      legPitchR = -hop * 0.25;
      earPerk = 0.16 * hop;
      tailWag = Math.sin(t * 10) * 0.46;
      break;
    }
    default:
      bobY = idleBreath * 0.011;
      hipBobY = 0;
      headYaw = Math.sin(t * 1.15) * 0.065;
      headRoll = Math.sin(t * 1.7) * 0.04;
      armPitchL = idleBreath * 0.05 - 0.06;
      armPitchR = -idleBreath * 0.05 - 0.06;
      armSplay = 0.06 + idleBreath * 0.015;
      earPerk = 0.05 + earFlutter * 0.035;
      earPitch = idleBreath * 0.02;
      tailPitch = 0.06 + idleBreath * 0.05;
      break;
  }

  if (landCushion > 0) {
    leanX += landCushion * 0.15;
    headNod += landCushion * 0.2;
    armPitchL -= landCushion * 0.22;
    armPitchR -= landCushion * 0.22;
    armSplay += landCushion * 0.10;
    earPerk -= landCushion * 0.18;
    tailPitch += landCushion * 0.22;
  }

  const effYaw = p.yaw + spinYaw;
  const syScale = presentation.heroScaleY || 1;
  const xzScale = 1 / Math.sqrt(Math.max(0.25, syScale));
  if (Math.abs(syScale - lastPipScaleY) > 1e-3) {
    lastPipScaleY = syScale;
    const sc: [number, number, number] = [xzScale, syScale, xzScale];
    torso.setScale(sc);
    head?.setScale(sc);
    earL?.setScale(sc);
    earR?.setScale(sc);
    armL?.setScale(sc);
    armR?.setScale(sc);
    footL?.setScale(sc);
    footR?.setScale(sc);
    tail?.setScale(sc);
  }

  const torsoBaseY = PIP_RIG_SOCKETS.torso[1];
  const torsoPivotY = (torsoBaseY + bobY) * syScale;
  const hipPivotY = (torsoBaseY + hipBobY) * syScale;
  writeEulerZYXMatrix(MAT_TORSO, leanX, torsoTwistY, rollZ);
  placeYawPart(torso, p.x, p.y, p.z, effYaw, 0, torsoPivotY, 0, leanX, torsoTwistY, rollZ);

  // Head socket locked to rotated torso neck
  const headDx = PIP_RIG_SOCKETS.head[0] * xzScale;
  const headDy = (PIP_RIG_SOCKETS.head[1] - torsoBaseY + Math.max(0, idleBreath) * 0.006) * syScale;
  const headDz = PIP_RIG_SOCKETS.head[2] * xzScale;
  const headLx = MAT_TORSO[0]! * headDx + MAT_TORSO[1]! * headDy + MAT_TORSO[2]! * headDz;
  const headLy = torsoPivotY + MAT_TORSO[3]! * headDx + MAT_TORSO[4]! * headDy + MAT_TORSO[5]! * headDz;
  const headLz = MAT_TORSO[6]! * headDx + MAT_TORSO[7]! * headDy + MAT_TORSO[8]! * headDz;
  const headRx = leanX * 0.58 + headNod;
  const headRy = torsoTwistY * 0.35 + headYaw;
  const headRz = rollZ * 0.45 + headRoll;
  writeEulerZYXMatrix(MAT_HEAD, headRx, headRy, headRz);
  placeYawPart(head, p.x, p.y, p.z, effYaw, headLx, headLy, headLz, headRx, headRy, headRz);

  // Cupped side-ears locked to rotated head sockets beneath the acorn helmet brim
  const earLDx = PIP_RIG_SOCKETS.earFromHeadL[0] * xzScale;
  const earLDy = PIP_RIG_SOCKETS.earFromHeadL[1] * syScale;
  const earLDz = PIP_RIG_SOCKETS.earFromHeadL[2] * xzScale;
  placeYawPart(
    earL,
    p.x,
    p.y,
    p.z,
    effYaw,
    headLx + MAT_HEAD[0]! * earLDx + MAT_HEAD[1]! * earLDy + MAT_HEAD[2]! * earLDz,
    headLy + MAT_HEAD[3]! * earLDx + MAT_HEAD[4]! * earLDy + MAT_HEAD[5]! * earLDz,
    headLz + MAT_HEAD[6]! * earLDx + MAT_HEAD[7]! * earLDy + MAT_HEAD[8]! * earLDz,
    headRx + earPitch,
    headRy - earSweepBack,
    headRz - earPerk
  );
  const earRDx = PIP_RIG_SOCKETS.earFromHeadR[0] * xzScale;
  const earRDy = PIP_RIG_SOCKETS.earFromHeadR[1] * syScale;
  const earRDz = PIP_RIG_SOCKETS.earFromHeadR[2] * xzScale;
  placeYawPart(
    earR,
    p.x,
    p.y,
    p.z,
    effYaw,
    headLx + MAT_HEAD[0]! * earRDx + MAT_HEAD[1]! * earRDy + MAT_HEAD[2]! * earRDz,
    headLy + MAT_HEAD[3]! * earRDx + MAT_HEAD[4]! * earRDy + MAT_HEAD[5]! * earRDz,
    headLz + MAT_HEAD[6]! * earRDx + MAT_HEAD[7]! * earRDy + MAT_HEAD[8]! * earRDz,
    headRx + earPitch,
    headRy + earSweepBack,
    headRz + earPerk
  );

  // Shoulder sockets locked to rotated torso (`-armSplay` on armL and `+armSplay` on armR splay outward)
  const armLDx = PIP_RIG_SOCKETS.armL[0] * xzScale;
  const armLDy = (PIP_RIG_SOCKETS.armL[1] - torsoBaseY) * syScale;
  const armLDz = PIP_RIG_SOCKETS.armL[2] * xzScale;
  placeYawPart(
    armL,
    p.x,
    p.y,
    p.z,
    effYaw,
    MAT_TORSO[0]! * armLDx + MAT_TORSO[1]! * armLDy + MAT_TORSO[2]! * armLDz,
    torsoPivotY + MAT_TORSO[3]! * armLDx + MAT_TORSO[4]! * armLDy + MAT_TORSO[5]! * armLDz,
    MAT_TORSO[6]! * armLDx + MAT_TORSO[7]! * armLDy + MAT_TORSO[8]! * armLDz,
    leanX * 0.35 + armPitchL,
    torsoTwistY,
    rollZ - armSplay
  );
  const armRDx = PIP_RIG_SOCKETS.armR[0] * xzScale;
  const armRDy = (PIP_RIG_SOCKETS.armR[1] - torsoBaseY) * syScale;
  const armRDz = PIP_RIG_SOCKETS.armR[2] * xzScale;
  placeYawPart(
    armR,
    p.x,
    p.y,
    p.z,
    effYaw,
    MAT_TORSO[0]! * armRDx + MAT_TORSO[1]! * armRDy + MAT_TORSO[2]! * armRDz,
    torsoPivotY + MAT_TORSO[3]! * armRDx + MAT_TORSO[4]! * armRDy + MAT_TORSO[5]! * armRDz,
    MAT_TORSO[6]! * armRDx + MAT_TORSO[7]! * armRDy + MAT_TORSO[8]! * armRDz,
    leanX * 0.35 + armPitchR,
    torsoTwistY,
    rollZ + armSplay
  );

  // Hip sockets locked to rotated lower pelvis while keeping soles planted at `y = 0` in idle
  const footLDx = PIP_RIG_SOCKETS.footL[0] * xzScale;
  const footLDy = (PIP_RIG_SOCKETS.footL[1] - torsoBaseY) * syScale;
  const footLDz = PIP_RIG_SOCKETS.footL[2] * xzScale;
  placeYawPart(
    footL,
    p.x,
    p.y,
    p.z,
    effYaw,
    MAT_TORSO[0]! * footLDx + MAT_TORSO[1]! * footLDy + MAT_TORSO[2]! * footLDz,
    hipPivotY + MAT_TORSO[3]! * footLDx + MAT_TORSO[4]! * footLDy + MAT_TORSO[5]! * footLDz,
    MAT_TORSO[6]! * footLDx + MAT_TORSO[7]! * footLDy + MAT_TORSO[8]! * footLDz,
    leanX * 0.45 + legPitchL,
    torsoTwistY * 0.25,
    rollZ * 0.5 - legSplay
  );
  const footRDx = PIP_RIG_SOCKETS.footR[0] * xzScale;
  const footRDy = (PIP_RIG_SOCKETS.footR[1] - torsoBaseY) * syScale;
  const footRDz = PIP_RIG_SOCKETS.footR[2] * xzScale;
  placeYawPart(
    footR,
    p.x,
    p.y,
    p.z,
    effYaw,
    MAT_TORSO[0]! * footRDx + MAT_TORSO[1]! * footRDy + MAT_TORSO[2]! * footRDz,
    hipPivotY + MAT_TORSO[3]! * footRDx + MAT_TORSO[4]! * footRDy + MAT_TORSO[5]! * footRDz,
    MAT_TORSO[6]! * footRDx + MAT_TORSO[7]! * footRDy + MAT_TORSO[8]! * footRDz,
    leanX * 0.45 + legPitchR,
    torsoTwistY * 0.25,
    rollZ * 0.5 + legSplay
  );

  // Trailing curled waist-sprout leaf plume locked to back of waist ring
  const tailDx = PIP_RIG_SOCKETS.tail[0] * xzScale;
  const tailDy = (PIP_RIG_SOCKETS.tail[1] - torsoBaseY) * syScale;
  const tailDz = PIP_RIG_SOCKETS.tail[2] * xzScale;
  placeYawPart(
    tail,
    p.x,
    p.y,
    p.z,
    effYaw,
    MAT_TORSO[0]! * tailDx + MAT_TORSO[1]! * tailDy + MAT_TORSO[2]! * tailDz,
    torsoPivotY + MAT_TORSO[3]! * tailDx + MAT_TORSO[4]! * tailDy + MAT_TORSO[5]! * tailDz,
    MAT_TORSO[6]! * tailDx + MAT_TORSO[7]! * tailDy + MAT_TORSO[8]! * tailDz,
    leanX * 0.75 + tailPitch,
    torsoTwistY + tailWag,
    rollZ * 0.6
  );
}

function driveAnimation(p: PlayerState, dt: number): void {
  const hero = node(nodeName.hero);
  if (!hero) return;
  hero.setPosition(p.x, p.y, p.z);
  hero.setRotation(0, p.yaw, 0);

  const planar = Math.hypot(p.vx, p.vz);
  const sample = locomotion.sample(planar, dt);
  let key: string = p.state;
  if (p.state === "grounded") key = sample.state === "run" ? "run" : sample.state === "walk" ? "walk" : "idle";
  if (key !== run.clipState) {
    run.clipState = key;
    const spec: { clip: string; speed?: number; loop?: boolean } =
      key === "idle" ? { clip: PIP_CLIPS.idle, speed: 1.15 }
      : key === "walk" ? { clip: PIP_CLIPS.walk, speed: 1.35 }
      : key === "run" ? { clip: PIP_CLIPS.run, speed: 1.35 }
      : CLIP_FOR[key] ?? { clip: PIP_CLIPS.idle, speed: 1.15 };
    hero.setAnimation?.({ clip: spec.clip, loop: spec.loop ?? true, speed: spec.speed ?? 1 });
  }
  animateProceduralPip(p, key, planar, dt);

  // Studio cape is strictly opt-in (`save.studio.capeEnabled`, false by default) so
  // nothing sticks out of Pip during normal play. When enabled in Studio, it drapes
  // cleanly behind Pip's back (`-Z` in local space) using yaw-only world rotation.
  const built = ensureWorld(run.world).built;
  const worldDiorama = built.presentation.mode === "diorama";
  const cape = node(nodeName.heroCape);
  const fwdX = Math.sin(p.yaw), fwdZ = Math.cos(p.yaw);
  cape?.setVisible(Boolean(save.studio.capeEnabled) && p.state !== "dead");
  const gliding = p.state === "glide";
  const collarBack = gliding ? 0.13 : 0.11;
  const collarY = p.y + (gliding ? 0.71 : 0.66);
  cape?.setPosition(p.x - fwdX * collarBack, collarY, p.z - fwdZ * collarBack);
  cape?.setRotation(0, p.yaw, 0);

  // Smooth third-person follow camera behind Pip looking down the platformer
  // path. A trunk/boulder between Pip and the lens shortens the boom instead
  // of blacking out the frame; controls and camYaw are untouched.
  const camFwdX = Math.sin(p.camYaw);
  const camFwdZ = Math.cos(p.camYaw);
  const aspect = viewAspect();
  // C18: portrait screens get a wider vertical FOV and a longer boom. GU47 PBL-C2: the
  // diorama look frames Pip from 1.7 m lift with fov 46 (portrait lifts slightly over plinth rim).
  const framing = worldDiorama ? miniatureFramingFor(aspect) : framingFor(aspect);
  const baseLift = worldDiorama ? (framing as MiniatureFraming).lift : 2.25;
  const desiredY = p.y + baseLift;
  const desiredX = p.x - camFwdX * framing.boom;
  const desiredZ = p.z - camFwdZ * framing.boom;
  const targetClearance = cameraClearance(p, built, desiredX, desiredZ, desiredY);
  if (!cameraRig.ready || dt <= 0) {
    cameraRig.clearance = targetClearance;
    cameraRig.ready = true;
  } else {
    // Ease in and out smoothly so transient pass-bys never pop or wedge close.
    const rate = targetClearance < cameraRig.clearance ? 14 : 8;
    cameraRig.clearance += (targetClearance - cameraRig.clearance) * (1 - Math.exp(-rate * dt));
  }
  // PBL-C1: a playing camera sequence (world fly-over, gate cut) owns the lens.
  if (presentation.cameraBusy()) return;
  const targetLift = worldDiorama && aspect < 1 ? 0.72 : 0.55;
  app.camera?.setPose(
    computeFollowCameraPose({
      x: p.x,
      y: p.y,
      z: p.z,
      camYaw: p.camYaw,
      baseBoom: framing.boom,
      baseLift,
      targetLift,
      fov: framing.fov,
      clearance: cameraRig.clearance,
      shakeOffset: impactFrame.shakeOffset,
      fovDeltaDeg: impactFrame.fovDeltaDeg
    })
  );
}

function viewAspect(): number {
  const host = document.getElementById("app");
  const w = host?.clientWidth || window.innerWidth;
  const h = host?.clientHeight || window.innerHeight;
  return h > 0 ? w / h : 16 / 9;
}

// ----------------------------------------------------------------- overlay

const bind = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener("click", () => { cue("ui"); fn(); });

function setPaused(p: boolean): void {
  run.paused = p;
  hud.showPause(p);
}

const overlayIds = ["pbl-atlas", "pbl-studio", "pbl-pause"] as const;
/** C9: any open menu overlay freezes the sim, not just the pause flag. */
function overlayOpen(): boolean {
  return overlayIds.some((id) => {
    const el = document.getElementById(id);
    return Boolean(el && !el.hidden);
  });
}

/** Close Atlas/Studio; if they were opened from Pause, go back to the Pause menu. */
function closeOverlay(which: "atlas" | "studio"): void {
  if (which === "atlas") hud.showAtlas(false);
  else hud.showStudio(false);
  if (run.paused && !run.complete) hud.showPause(true);
}

function showAtlas(show: boolean): void {
  hud.renderAtlas(run.save);
  hud.showAtlas(show);
  if (show) {
    document.querySelectorAll(".pbl-atlas-card").forEach((el) => {
      el.addEventListener("click", () => {
        const id = (el as HTMLElement).dataset.world as WorldId;
        hud.showAtlas(false);
        loadWorld(id, run.mode === "academy" ? "quick" : run.mode);
      });
    });
  }
}

function showStudio(show: boolean): void {
  const render = (): void => {
    hud.renderStudio(run.save, (which, color, enabled = true) => {
      save = saves.commit({ ...save, studio: { ...save.studio, [which]: color, capeEnabled: enabled } });
      run.save = save;
      applyStudioColors();
      driveAnimation(drawnPlayer, 0);
      render();
    });
  };
  if (show) render();
  hud.showStudio(show);
}

function bindShell(): void {
  // A clicked button keeps DOM focus and would swallow Space/Enter as
  // click — Space is Jump, so a focused Play button re-fires mid-jump and
  // restarts the world. Blur every activated button so game keys stay
  // game keys; intentional re-clicks still work.
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button") as HTMLButtonElement | null;
      el?.blur();
    },
    true
  );
  bind("aura-btn-play", () => { loadWorld(run.world === "academy" ? "w1" : run.world, "quick"); });
  bind("aura-btn-academy", () => loadWorld("academy", "academy"));
  bind("aura-btn-atlas", () => showAtlas(true));
  bind("aura-btn-studio", () => showStudio(true));
  bind("aura-btn-trial", () => loadWorld(run.world === "academy" ? "w1" : run.world, "trial"));
  bind("aura-btn-auto", () => setAutopilot(!autopilot));
  document.querySelectorAll("[data-aura-venue]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.auraVenue as WorldId;
      loadWorld(id, run.mode === "trial" ? "trial" : "quick");
    });
  });
  bind("pbl-resume", () => setPaused(false));
  bind("pbl-restart", () => { setPaused(false); loadWorld(run.world); });
  // Opening Atlas/Studio from Pause keeps the run paused behind them.
  bind("pbl-pause-atlas", () => { hud.showPause(false); showAtlas(true); });
  bind("pbl-pause-studio", () => { hud.showPause(false); showStudio(true); });
  bind("pbl-atlas-close", () => closeOverlay("atlas"));
  bind("pbl-studio-close", () => closeOverlay("studio"));
  // C8: on-screen pause for touch (and mouse) players.
  bind("pbl-pause-btn", () => { if (!run.complete && !overlayOpen()) setPaused(true); });
  bind("pbl-complete-retry", () => loadWorld(run.world));
  bind("pbl-complete-atlas", () => { hud.showComplete(false); showAtlas(true); });
  bind("pbl-next-world", () => {
    const next = nextWorldId(run.world);
    if (next) loadWorld(next);
  });
}

// ------------------------------------------------------------------ frame

const MANUAL_PLAY_KEYS = new Set([
  "KeyA", "KeyD", "KeyW", "KeyS",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Space", "ShiftLeft", "ShiftRight", "KeyC", "ControlLeft", "ControlRight"
]);

window.addEventListener("keydown", (event) => {
  if (MANUAL_PLAY_KEYS.has(event.code)) {
    userEngaged = true;
    if (autopilot) {
      setAutopilot(false);
    }
  }
  // First key press also starts the ambient bed (audio needs a gesture).
  if (ambience) void pipsGame.sound?.cue(ambience);
  if (event.code !== "Escape" && event.code !== "KeyP") return;
  const atlasEl = document.getElementById("pbl-atlas");
  const studioEl = document.getElementById("pbl-studio");
  if (atlasEl && !atlasEl.hidden) { closeOverlay("atlas"); return; }
  if (studioEl && !studioEl.hidden) { closeOverlay("studio"); return; }
  if (run.complete) return;
  setPaused(!run.paused);
});

// C2: drag with the mouse (or press Q/E, or use the right stick) to orbit the camera.
const ORBIT_PER_PIXEL = 0.006;
const ORBIT_KEY_RATE = 2.2; // rad/s
let orbitPending = 0;
let dragPointer: number | null = null;
let dragLastX = 0;
const appHost = document.getElementById("app");
appHost?.addEventListener("pointerdown", (event) => {
  if (ambience) void pipsGame.sound?.cue(ambience);
  if (event.pointerType === "touch") {
    pipsGame.touch?.setVisible(true);
    return;
  }
  if (event.pointerType !== "mouse" || event.button !== 0) return;
  dragPointer = event.pointerId;
  dragLastX = event.clientX;
});
window.addEventListener("pointermove", (event) => {
  if (event.pointerId !== dragPointer) return;
  orbitPending += (event.clientX - dragLastX) * ORBIT_PER_PIXEL;
  dragLastX = event.clientX;
});
const endDrag = (event: PointerEvent) => { if (event.pointerId === dragPointer) dragPointer = null; };
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

function syncViewportAndTouch(): void {
  const coarse = isCoarseViewport();
  pipsGame.touch?.setVisible(coarse);
  if (appReady) {
    driveAnimation(drawnPlayer, 0);
    publishEvidence(true);
  }
}

syncViewportAndTouch();
const scheduleViewportSync = (): void => {
  syncViewportAndTouch();
  window.requestAnimationFrame(() => syncViewportAndTouch());
};
window.addEventListener("resize", scheduleViewportSync);
window.addEventListener("orientationchange", scheduleViewportSync);
window.visualViewport?.addEventListener("resize", scheduleViewportSync);
if (typeof window.matchMedia === "function") {
  const coarseQuery = window.matchMedia("(pointer: coarse)");
  coarseQuery.addEventListener?.("change", scheduleViewportSync);
}

// C20: the sim runs on a fixed 60 Hz step (createFixedStepLoop) driven from
// the engine frame, so a slow frame runs catch-up steps (up to 6, 0.1 s) and
// a 144 Hz display does not speed Pip up. Edge inputs are latched per frame.
const SIM_STEP_SECONDS = 1 / 60;
const inputLatch = createInputLatch();
let swapping = false;
let frameInput = { moveX: 0, moveZ: 0, jumpHeld: false, orbitRate: 0 };

// Pip's drawn pose blends the last two sim steps (loop.alpha), so a 60 Hz sim
// still moves every frame on a 120/144 Hz display. Teleports (respawn) snap.
interface PipPose { x: number; y: number; z: number; yaw: number; camYaw: number }
const pipPresenter = createFixedStepPresenter<PipPose>({
  snapshot: () => ({ x: run.player.x, y: run.player.y, z: run.player.z, yaw: run.player.yaw, camYaw: run.player.camYaw }),
  blend: createRecordBlend<PipPose>({ angleKeys: ["yaw", "camYaw"], snapDistance: 2, position: (p) => [p.x, p.y, p.z] })
});
const drawnPlayer = { ...run.player } as PlayerState;

const simLoop = createFixedStepLoop({
  stepSeconds: SIM_STEP_SECONDS,
  maxCatchUpSteps: 6,
  maxFrameSeconds: 0.1,
  isActive: () => appReady && !run.paused && !overlayOpen() && !swapping && !impactFrame.frozen,
  step: (seconds) => simStep(seconds),
  render: (frameSeconds) => present(frameSeconds)
});

let lastDisplayTimeMs = -1;

app.onFrame(() => {
  if (!appReady) {
    return;
  }
  const nowMs = performance.now();
  const realDt = lastDisplayTimeMs < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, (nowMs - lastDisplayTimeMs) / 1000));
  lastDisplayTimeMs = nowMs;
  // Tick impact hit-stop / trauma / FOV punch strictly on REAL frame dt (never frozen simDt).
  impactFrame = impactRig.step(realDt);
  // Sample input once per display frame. createGame mounts touch but doesn't
  // tick it per frame; `update` exists on the concrete mount but not the
  // public TouchControls contract.
  (pipsGame.touch as { update?: () => void } | null)?.update?.();
  const moveX = input?.axis("moveX") ?? 0;
  const moveZ = input?.axis("moveZ") ?? 0;
  const jumpPressed = input?.pressed("jump") ?? false;
  const jumpHeld = input?.held("jump") ?? false;
  const divePressed = input?.pressed("dive") ?? false;
  const poundPressed = input?.pressed("pound") ?? false;
  const orbitRate = ((input?.held("camRight") ? 1 : 0) - (input?.held("camLeft") ? 1 : 0)) * ORBIT_KEY_RATE;
  frameInput = { moveX, moveZ, jumpHeld, orbitRate };
  inputLatch.latch({ jumpPressed, divePressed, poundPressed });
  if (Math.abs(moveX) > 0.15 || Math.abs(moveZ) > 0.15 || jumpPressed || jumpHeld || divePressed || poundPressed || orbitRate !== 0) {
    userEngaged = true;
    // PBL-C1: any play input ends a running camera sequence within the frame.
    presentation.skipSequence();
    if (autopilot) {
      setAutopilot(false);
    }
  }
  const steps = simLoop.tick(nowMs);
  if (steps === 0 && impactFrame.frozen && !run.paused && !overlayOpen() && !swapping) {
    present(realDt);
  } else if (steps === 0 && (run.paused || overlayOpen())) {
    // Keep the evidence global honest while the sim is suspended.
    inputLatch.clear();
    publishEvidence();
  }
});

function simStep(seconds: number): void {
  const { built, spec } = ensureWorld(run.world);
  run.worldClock += seconds;

  // Boss brain first — the player sim needs its pose this step.
  let bossAt: readonly [number, number, number] | undefined;
  let bossVulnerable = false;
  if (run.boss && !run.complete) {
    const frame = stepBoss(run.boss, [run.player.x, run.player.y, run.player.z], seconds);
    for (const ev of frame.events) {
      run.bossEvents.push(ev);
      if (ev.kind === "activate") {
        run.bossActive = true;
        hud.setBoss(3, 3, true);
        hud.banner("BRAMBLEBACK!", "Stomp him while he rests — three hits!", 2.8);
        cue("bumper");
      }
      if (ev.kind === "phase") {
        const spike = ev.phase === "vulnerable" || ev.phase === "down";
        for (let i = 0; i < 6; i += 1) node(nodeName.bossSpike(i))?.setVisible(!spike);
      }
    }
    // Once crumpled ("down") the body is scenery — no contact damage.
    bossAt = run.boss.phase === "down" ? undefined : frame.pos;
    bossVulnerable = frame.vulnerable;
    const bossNode = node(nodeName.boss);
    if (bossNode) {
      // The fitted model's feet sit at the node origin; `frame.pos` is the
      // body centre, so drop by the body radius. "down" keeps sinking so the
      // defeated beast crumples through the arena floor as before.
      const feetY = frame.pos[1] - 1.1;
      const bossY = run.boss.phase === "down" ? feetY : Math.max(run.boss.arena.floorY, feetY);
      bossNode.setPosition(frame.pos[0], bossY, frame.pos[2]);
      bossNode.setRotation(0, run.boss.yaw, 0);
      const squash = run.boss.phase === "vulnerable" ? 0.55 : run.boss.phase === "windup" ? 1.12 : 1;
      bossNode.setScale([1, squash, 1]);
      // Drive procedural Brambleback limbs across dormant/roll/windup/vulnerable/down + transient attack/hurt.
      run.bossFxT = Math.max(0, run.bossFxT - seconds);
      if (run.bossFxT <= 0 && run.boss.phase !== run.bossClip) {
        run.bossClip = run.boss.phase;
        const clipSpec = BOSS_CLIP_FOR[run.boss.phase];
        bossNode.setAnimation?.({ clip: clipSpec.clip, loop: clipSpec.loop ?? true });
      }
      const bBody = node(`${nodeName.boss}:body`);
      const bArmL = node(`${nodeName.boss}:arm-l`);
      const bArmR = node(`${nodeName.boss}:arm-r`);
      const bLegL = node(`${nodeName.boss}:leg-l`);
      const bLegR = node(`${nodeName.boss}:leg-r`);
      const bt = run.worldClock;
      const activeMode = run.bossFxT > 0 ? run.bossClip : run.boss.phase;
      if (bBody) {
        const bx = frame.pos[0];
        const bz = frame.pos[2];
        const byaw = run.boss.yaw;
        const stomp = Math.sin(bt * (activeMode === "roll" ? 11 : 4.2));
        const bodyPitch =
          activeMode === "roll" ? 0.38 + Math.sin(bt * 22) * 0.08
          : activeMode === "windup" ? -0.28 + Math.sin(bt * 16) * 0.06
          : activeMode === "attack" ? 0.45
          : activeMode === "hurt" || activeMode === "vulnerable" ? -0.18
          : activeMode === "down" ? 0.55
          : Math.sin(bt * 2.1) * 0.04;
        const bodyRoll = activeMode === "hurt" ? Math.sin(bt * 28) * 0.16 : activeMode === "roll" ? stomp * 0.08 : 0;
        bBody.setScale([1, squash, 1]);
        placeYawPart(bBody, bx, bossY, bz, byaw, 0, (1.08 + Math.abs(stomp) * (activeMode === "roll" ? 0.08 : 0.025)) * squash, 0, bodyPitch, 0, bodyRoll);
        const armSwing =
          activeMode === "windup" ? -1.45 + Math.sin(bt * 18) * 0.18
          : activeMode === "attack" ? 0.95
          : activeMode === "roll" ? stomp * 0.85
          : activeMode === "vulnerable" || activeMode === "down" ? 0.52
          : Math.sin(bt * 2.1) * 0.12;
        placeYawPart(bArmL, bx, bossY, bz, byaw, -0.78, 1.38 * squash, 0.12, armSwing, 0, 0.22);
        placeYawPart(bArmR, bx, bossY, bz, byaw, 0.78, 1.38 * squash, 0.12, activeMode === "roll" ? -armSwing : armSwing, 0, -0.22);
        const legStride = activeMode === "roll" ? stomp * 0.68 : activeMode === "windup" ? Math.sin(bt * 12) * 0.24 : 0;
        placeYawPart(bLegL, bx, bossY, bz, byaw, -0.44, 0.64 * squash, -0.06, -legStride, 0, 0);
        placeYawPart(bLegR, bx, bossY, bz, byaw, 0.44, 0.64 * squash, -0.06, legStride, 0, 0);
      }
    }
    const spikesOut = run.boss.phase === "roll" || run.boss.phase === "windup" || run.boss.phase === "dormant";
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + run.worldClock * (run.boss.phase === "roll" ? 3 : 0.6);
      const spike = node(nodeName.bossSpike(i));
      spike?.setPosition(frame.pos[0] + Math.cos(a) * 1.15, frame.pos[1] + 0.55, frame.pos[2] + Math.sin(a) * 1.15);
      spike?.setVisible(spikesOut);
    }
  }

  const edges = inputLatch.consume();
  const orbit = orbitPending + frameInput.orbitRate * seconds;
  orbitPending = 0;

  if (autopilot || userEngaged) {
    const playerInput = autopilot
      ? computeAutopilotInput(built, spec, seconds, bossVulnerable, bossAt)
      : {
          moveX: frameInput.moveX,
          moveZ: frameInput.moveZ,
          jumpPressed: edges.jumpPressed,
          jumpHeld: frameInput.jumpHeld,
          divePressed: edges.divePressed,
          poundPressed: edges.poundPressed,
          orbit
        };
    const events = stepPlayer(run.player, built, playerInput, seconds, {
      doubleJump: save.doubleJump,
      assist: run.assist,
      bossVulnerable,
      bossAt
    });
    if (autopilot && !run.player.swim && run.player.y < spec.spawn[1] - 0.15) {
      let nearest = built.solids[0];
      let bestD = Infinity;
      for (const s of built.solids) {
        if (!s.active) continue;
        const d = Math.hypot(s.x - run.player.x, s.z - run.player.z);
        if (d < bestD) {
          bestD = d;
          nearest = s;
        }
      }
      if (nearest) {
        run.player.x = nearest.x;
        run.player.y = nearest.y + nearest.hy;
        run.player.z = nearest.z;
        run.player.vx = 0;
        run.player.vy = 0;
        run.player.vz = 0;
        run.player.grounded = true;
        run.player.groundId = nearest.id;
        run.player.state = "grounded";
      }
    }
    for (const e of events) handleEvent(e);

    // Death → back at the last checkpoint Pip touched, with full hearts (C16:
    // the gold flags he passed stay true).
    if (run.player.state === "dead" && run.deadTimer > 0) {
      run.deadTimer -= seconds;
      if (run.deadTimer <= 0) {
        const cp = run.player.checkpoint;
        run.player.x = cp.x; run.player.y = cp.y + 0.05; run.player.z = cp.z;
        run.player.vx = 0; run.player.vy = 0; run.player.vz = 0;
        run.player.yaw = cp.yaw; run.player.camYaw = cp.yaw;
        resetCameraRig();
        run.player.hearts = 3;
        run.player.state = "air";
        run.player.grounded = false;
        run.player.invuln = 1.6;
        hud.setHearts(3);
        cue("respawn");
        hud.toast(cp.id === "spawn" ? "Pip's back up!" : "Pip's back up at the last checkpoint!", 1.6);
      }
    }

    if (!run.complete && run.player.state !== "dead") run.levelTime += seconds;
  } else {
    // Before first user input (when autopilot is OFF), keep Pip planted on the
    // starting platform in a clean Idle skeletal loop while pickups and moving
    // platforms animate in place. Orbit still turns the camera.
    run.player.vx = 0;
    run.player.vy = 0;
    run.player.vz = 0;
    run.player.grounded = true;
    run.player.state = "grounded";
    run.player.camYaw -= orbit;
  }

  // Platform motion always animates in place (collision and visuals together).
  tickPlatforms(built, run.worldClock, node);
  pipPresenter.afterStep();
}

const PICKUP_CULL_DIST_SQ = 30 * 30;
const CHECKPOINT_CULL_DIST_SQ = 38 * 38;

function present(frameSeconds: number): void {
  const { spec, built } = ensureWorld(run.world);
  Object.assign(drawnPlayer, run.player, pipPresenter.present(simLoop));
  const seqBusy = presentation.cameraBusy();
  const px = drawnPlayer.x;
  const pz = drawnPlayer.z;
  const spinRot = run.worldClock * 1.8;
  for (const s of spec.seeds) {
    const h = node(nodeName.seed(s.id));
    if (!h) continue;
    const vis = !run.seeds.has(s.id) && (seqBusy || (s.x - px) * (s.x - px) + (s.z - pz) * (s.z - pz) <= PICKUP_CULL_DIST_SQ);
    if (h.visible !== vis) h.setVisible(vis);
    if (vis) h.setRotation(0, spinRot, 0);
  }
  for (const a of spec.acorns) {
    const h = node(nodeName.acorn(a.id));
    if (!h) continue;
    const vis = !run.acorns.has(a.id) && (seqBusy || (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz) <= PICKUP_CULL_DIST_SQ);
    if (h.visible !== vis) h.setVisible(vis);
    if (vis) h.setRotation(0, spinRot, 0);
  }
  for (const hpt of spec.hearts) {
    const h = node(nodeName.heart(hpt.id));
    if (!h) continue;
    const vis = !run.heartsGot.has(hpt.id) && (seqBusy || (hpt.x - px) * (hpt.x - px) + (hpt.z - pz) * (hpt.z - pz) <= PICKUP_CULL_DIST_SQ);
    if (h.visible !== vis) h.setVisible(vis);
    if (vis) h.setRotation(0, spinRot, 0);
  }
  for (const cp of spec.checkpoints) {
    const h = node(nodeName.checkpointFlag(cp.id));
    if (!h) continue;
    const vis = seqBusy || (cp.x - px) * (cp.x - px) + (cp.z - pz) * (cp.z - pz) <= CHECKPOINT_CULL_DIST_SQ;
    if (h.visible !== vis) h.setVisible(vis);
  }
  driveAnimation(drawnPlayer, frameSeconds);
  presentation.frame({
    dt: frameSeconds,
    time: run.worldClock,
    state: drawnPlayer.state,
    grounded: drawnPlayer.grounded,
    position: [drawnPlayer.x, drawnPlayer.y, drawnPlayer.z],
    aspect: viewAspect(),
    clearance: Math.max(CAM_MIN_CLEARANCE, cameraRig.clearance),
    gateUnlocked: run.gateUnlocked
  }, built, node);
  feel.update(frameSeconds * 1000);
  hud.setTimer(run.levelTime, run.mode === "trial" ? spec.medals : undefined);
  if (run.complete) {
    hud.setGateCompass(null, false);
  } else {
    const gx = spec.gate.x - drawnPlayer.x;
    const gz = spec.gate.z - drawnPlayer.z;
    const worldAngle = Math.atan2(gx, gz);
    const relBearing = worldAngle - drawnPlayer.camYaw;
    hud.setGateCompass(relBearing, run.gateUnlocked);
  }
  publishEvidence();
}

// ------------------------------------------------------- evidence global

const EVIDENCE_INTERVAL_MS = 250;
let evidenceAt = -Infinity;

/** C21: the evidence object is rebuilt at most 4 times a second, not every frame. */
function publishEvidence(force = false): void {
  const now = performance.now();
  if (!force && now - evidenceAt < EVIDENCE_INTERVAL_MS) return;
  evidenceAt = now;
  const { spec, built, cert } = ensureWorld(run.world);
  const suspended = run.paused || overlayOpen();
  const motion = built.motion;
  window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__ = {
    status: suspended ? "paused" : "running",
    paused: suspended,
    autopilot,
    appId: "showcase-pips-big-leap",
    route: "/apps/showcase-pips-big-leap/",
    world: { id: run.world, title: spec.title, look: spec.look },
    mode: run.mode,
    player: {
      position: [Number(run.player.x.toFixed(3)), Number(run.player.y.toFixed(3)), Number(run.player.z.toFixed(3))],
      velocity: [Number(run.player.vx.toFixed(3)), Number(run.player.vy.toFixed(3)), Number(run.player.vz.toFixed(3))],
      state: run.player.state,
      grounded: run.player.grounded,
      hearts: run.player.hearts,
      jumpsLeft: run.player.jumpsLeft,
      checkpoint: run.player.checkpoint.id
    },
    seeds: { got: run.seeds.size, goal: spec.seedGoal, totalAcrossVale: totalSeeds(save) },
    acorns: run.acornCount,
    levelTime: Number(run.levelTime.toFixed(2)),
    gate: { seedsNeeded: spec.gateSeeds, unlocked: run.gateUnlocked, complete: run.complete },
    boss: run.boss ? { active: run.bossActive, hp: run.bossHp, phase: run.boss.phase } : null,
    camera: { rig: "shoulder:pip", presented: Boolean(app.camera?.presented()), camYaw: Number(run.player.camYaw.toFixed(3)), ...framingFor(viewAspect()) },
    sim: { stepSeconds: SIM_STEP_SECONDS, steps: simLoop.steps, worldClock: Number(run.worldClock.toFixed(3)) },
    medals: spec.medals,
    motion: {
      gravity: Number(motion.tuning.gravity.toFixed(3)),
      jumpVelocity: Number(motion.tuning.jumpVelocity.toFixed(3)),
      moveSpeed: Number(motion.tuning.moveSpeed.toFixed(3)),
      coyoteMs: motion.tuning.coyoteMs,
      jumpBufferMs: motion.tuning.jumpBufferMs,
      reportOk: motion.report.passes,
      failedChecks: motion.report.checks.filter((c) => !c.passes).map((c) => c.id),
      springEdges: motion.springEdges,
      maxRise: motion.facts.maxRise,
      maxGap: motion.facts.maxGap,
      platformCount: motion.facts.platformCount
    },
    moveset: {
      doubleJump: save.doubleJump,
      coyote: true, jumpBuffer: true, variableJump: true,
      dive: true, pound: true, glide: true,
      springs: spec.springs.length, movers: built.movingSolids.length, timed: built.timedSolids.length,
      swimPockets: built.waters.length
    },
    engineHelpers: {
      assetBoundLevel: cert.ok,
      surfaceCount: cert.surfaceCount,
      presentationCounts: cert.presentationCounts,
      geometryCertification: cert.geometry ? { publicReady: cert.geometry.publicReady, blockers: cert.geometry.blockers } : cert.error,
      presentationCertification: cert.presentation ? { publicReady: cert.presentation.publicReady, blockers: cert.presentation.blockers } : null,
      kitSnapshot: cert.kitSnapshot ?? null,
      notes: cert.notes
    },
    save: { demo: saves.demo, worldsDone: Object.keys(save.completed).length, academyDone: save.academyDone, doubleJump: save.doubleJump, studio: save.studio },
    hero: { assetId: "procedural-pip", procedural: true, clips: Object.values(PIP_CLIPS) },
    bossAsset: run.boss ? { assetId: "procedural-brambleback", procedural: true, clips: Object.values(BOSS_CLIPS) } : null,
    // GU47 WP-16: look mode, per-world look facts and the runtime presentation counters.
    diorama: {
      look: built.presentation.mode,
      bootLook: LOOK_MODE,
      hour: built.presentation.look.hour,
      postPreset: built.presentation.mode === "diorama" ? built.presentation.look.post.preset : null,
      baseTop: built.presentation.baseTop,
      floraCount: built.presentation.floraCount,
      instancedPlatforms: built.presentation.instancedPlatforms,
      ...presentation.evidence()
    }
  };
}

// P1: in dev, say which motion checks a world fails (none should).
if (import.meta.env?.DEV) {
  for (const id of ["academy", "w1", "w2", "w3", "w4", "w5", "w6"] as const) {
    const report = deriveWorldMotion(worldSpec(id)).report;
    if (!report.passes) console.warn(`[pips-big-leap] ${id} motion report fails`, report.checks.filter((c) => !c.passes));
  }
}

// -------------------------------------------------------------------- wire

bindShell();
setAutopilot(autopilot);
hud.setMode(run.mode);
hud.setHearts(3);
hud.setWorld(worldSpec(run.world).title);
hud.setSeeds(0, worldSpec(run.world).seedGoal);
hud.renderAtlas(save);
hud.renderStudio(save, () => {});
loadWorld(BOOT_WORLD, "quick");

// A1: drive the engine loading screen from the shared helper (monotonic fraction, rejected work still settles).
const loading = createLoadingProgress({ shell: pipsGame.shell });

void loading.track(app.ready(), 3, "Loading world").then(async () => {
  await loading.track(pipsGame.ready(), 1, "Starting");
  loading.done();
  nodeCache.clear();
  applyRunNodeState();
  appReady = true;
  syncViewportAndTouch();
  presentation.worldMounted(ensureWorld(run.world).built);
  // E-I crop contract, read at every steady-state shot (projected each read).
  // installQaHooks("qa") installs it as window.__AURA_QA__ with the standard hooks beside `crops`.
  installQaHooks("qa", {
    ready: () => appReady,
    state: () => ({ world: run.world, look: ensureWorld(run.world).built.presentation.mode }),
    // Capture tooling only: run the same fixed sim steps the frame loop runs (autopilot included), without rendering each
    // one, so software-GL capture runners reach the results panel. Stops at the gate or whenever the loop would be idle.
    stepFrames: (n: number) => {
      for (let i = 0; i < n; i += 1) {
        if (!appReady || run.paused || overlayOpen() || swapping || run.complete) break;
        simStep(SIM_STEP_SECONDS);
      }
    },
    app,
    extras: { crops: () => presentation.crops(ensureWorld(run.world).built, [drawnPlayer.x, drawnPlayer.y, drawnPlayer.z]) }
  });
  publishEvidence(true);
  document.body.dataset.aura3dReady = "true";
  try {
    const freezeMs = Number(params.get("freeze"));
    if (Number.isFinite(freezeMs) && freezeMs > 0) {
      window.setTimeout(() => {
        run.paused = true;
      }, freezeMs);
    }
  } catch {
    // Ignore URL parsing errors.
  }
});

window.addEventListener("error", () => {
  document.getElementById("render-error")?.removeAttribute("hidden");
});
