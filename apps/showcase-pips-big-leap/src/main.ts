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
import { assets, BOSS_CLIPS, PIP_CLIPS } from "./aura-assets.js";
import { buildWorld, nodeName, tickPlatforms, type BuiltWorld } from "./game/world.js";
import { createPlayer, stepPlayer, type PlayerState } from "./game/player.js";
import { createBoss, damageBoss, stepBoss, type BossPhase, type BossState } from "./game/boss.js";
import { certifyWorld, type WorldCertification } from "./game/certify.js";
import { createHud } from "./game/hud.js";
import { createSaveStore, recordSeeds, totalSeeds, type PipSave } from "./game/save.js";
import { gateState } from "./game/gate.js";
import { framingFor } from "./game/framing.js";
import { createInputLatch } from "./game/simInput.js";
import { deriveWorldMotion } from "./game/motion.js";
import { worldSpec } from "./game/worlds.js";
import { MINIATURE_LIFT, lookModeFromSearch, miniatureFramingFor, worldFromSearch, worldLookMode } from "./game/looks.js";
import { createDioramaPresentation, type QaCrop } from "./game/presentation.js";
import type { ModeId, WorldId } from "./game/types.js";
import { installBlackFrameGuard } from "@aura3d/debug";

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

const pipsGame = createGame({
  id: "showcase-pips-big-leap",
  target: "#app",
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
  node(nodeName.gateLock)?.setVisible(!run.gateUnlocked);
  applyStudioColors();
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
// Studio offers the cape only, and the cape now shows at rest too.
function applyStudioColors(): void {
  node(nodeName.heroCape)?.setMaterial(material.pbr({ color: save.studio.cape, roughness: 0.6 }));
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
    case "jump": cue("whoosh"); juice("jump"); fx(); break;
    case "double-jump": cue("whoosh"); juice("double-jump"); fx(); break;
    case "land": juice("land"); fx(); break;
    case "glide-start": cue("whoosh"); break;
    case "dive": cue("whoosh"); break;
    case "pound": break;
    case "pound-land": cue("thud"); juice("land"); fx(); break;
    case "spring": cue("bounce"); juice("jump"); fx(); break;
    case "swim": cue("bounce"); break;
    case "hurt": case "boss-contact": {
      fx();
      hud.setHearts(run.player.hearts);
      juice("hurt");
      cue("bumper");
      if (e.kind === "boss-contact" && run.boss && run.boss.phase !== "down") {
        node(nodeName.boss)?.setAnimation({ clip: BOSS_CLIPS.attack, loop: false });
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
      hud.toast(`☀ Sun-seed ${run.seeds.size}/${spec.seedGoal}`, 1.4);
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
        node(nodeName.boss)?.setAnimation({ clip: BOSS_CLIPS.hurt, loop: false });
        run.bossClip = "hurt";
        run.bossFxT = 0.7;
      }
      juice("boss-hit");
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
    medal = run.levelTime <= spec.medals.gold ? " 🥇 GOLD" : run.levelTime <= spec.medals.silver ? " 🥈 SILVER" : run.levelTime <= spec.medals.bronze ? " 🥉 BRONZE" : "";
  }
  save = saves.commit(next);
  run.save = save;
  const nextId = nextWorldId(run.world);
  hud.showComplete(
    true,
    run.world === "academy" ? "GAUNTLET CLEARED!" : "SUN-GATE OPENED!",
    `${spec.title} is bright again — ☀ ${run.seeds.size}/${spec.seedGoal} seeds, ${run.acornCount} acorns${medal}.`,
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

/** Shortest allowed boom (4.5m * 0.3 ≈ 1.35m behind Pip). */
const CAM_MIN_CLEARANCE = 0.3;
/** Hysteresis state: shorten almost instantly, relax back out gently. */
const cameraRig = { clearance: 1, ready: false };

function resetCameraRig(): void {
  cameraRig.clearance = 1;
  cameraRig.ready = false;
}

/**
 * Sweep Pip's head -> desired lens against the obstacle cylinders baked at
 * world-build time and return the furthest boom fraction that stays in front
 * of the first blocker. Pure math over a short list — no scene raycasts.
 */
function cameraClearance(p: PlayerState, built: BuiltWorld, camX: number, camZ: number, camY: number): number {
  const sx = p.x;
  const sz = p.z;
  const sy = p.y + 1.05;
  const dx = camX - sx;
  const dz = camZ - sz;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return 1;
  let best = 1;
  for (const o of built.cameraObstacles) {
    const top = o.baseY + o.height;
    if (sy > top && camY > top) continue;
    const r = o.radius + 0.22;
    const ox = sx - o.x;
    const oz = sz - o.z;
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * len2 * c;
    if (disc <= 0) continue;
    const root = Math.sqrt(disc);
    const t0 = (-b - root) / (2 * len2);
    const t1 = (-b + root) / (2 * len2);
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    if (lo > hi) continue;
    // Height along the boom rises from Pip's head to the lens; if the
    // blocked stretch sits entirely above the canopy it does not matter.
    const yLo = sy + (camY - sy) * lo;
    const yHi = sy + (camY - sy) * hi;
    if (Math.min(yLo, yHi) > top) continue;
    best = Math.min(best, Math.max(CAM_MIN_CLEARANCE, lo - 0.05));
  }
  return best;
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
    hero.setAnimation({ clip: spec.clip, loop: spec.loop ?? true, speed: spec.speed ?? 1 });
  }

  // Studio cape tracks the 1.25 m hero: it hangs low on his back while he
  // moves and spreads out above him while he glides. Standing still it is
  // hidden (the idle clip turns Pip toward the lens, where a back panel would
  // cover his face).
  const cape = node(nodeName.heroCape);
  const fwdX = Math.sin(p.yaw), fwdZ = Math.cos(p.yaw);
  const moving = Math.hypot(p.vx, p.vz) > 0.4 || !p.grounded;
  cape?.setVisible(p.state === "glide" || (moving && p.state !== "dead"));
  const gliding = p.state === "glide";
  cape?.setPosition(p.x - fwdX * (gliding ? 0.22 : 0.2), p.y + (gliding ? 0.96 : 0.42), p.z - fwdZ * (gliding ? 0.22 : 0.2));
  cape?.setRotation(gliding ? 1.1 : 0.2, p.yaw, 0);

  // Smooth third-person follow camera behind Pip looking down the platformer
  // path. A trunk/boulder between Pip and the lens shortens the boom instead
  // of blacking out the frame; controls and camYaw are untouched.
  const camFwdX = Math.sin(p.camYaw);
  const camFwdZ = Math.cos(p.camYaw);
  const built = ensureWorld(run.world).built;
  // C18: portrait screens get a wider vertical FOV and a longer boom. GU47 PBL-C2: the
  // diorama look frames Pip from 1.7 m with fov 46 (the original keeps 2.25 m / 52).
  const worldDiorama = built.presentation.mode === "diorama";
  const framing = worldDiorama ? miniatureFramingFor(viewAspect()) : framingFor(viewAspect());
  const camY = p.y + (worldDiorama ? MINIATURE_LIFT : 2.25);
  const desiredX = p.x - camFwdX * framing.boom;
  const desiredZ = p.z - camFwdZ * framing.boom;
  const targetClearance = cameraClearance(p, built, desiredX, desiredZ, camY);
  if (!cameraRig.ready || dt <= 0) {
    cameraRig.clearance = targetClearance;
    cameraRig.ready = true;
  } else {
    // Snap in fast to avoid clipping through a trunk, ease back out so the
    // framing never pops when the tree line clears.
    const rate = targetClearance < cameraRig.clearance ? 24 : 5.5;
    cameraRig.clearance += (targetClearance - cameraRig.clearance) * (1 - Math.exp(-rate * dt));
  }
  const boom = framing.boom * Math.max(CAM_MIN_CLEARANCE, cameraRig.clearance);
  // PBL-C1: a playing camera sequence (world fly-over, gate cut) owns the lens.
  if (presentation.cameraBusy()) return;
  app.camera?.setPose({
    position: [p.x - camFwdX * boom, camY, p.z - camFwdZ * boom],
    target: [p.x + camFwdX * 3.2, p.y + 0.55, p.z + camFwdZ * 3.2],
    up: [0, 1, 0],
    fov: framing.fov
  });
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
    hud.renderStudio(run.save, (which, color) => {
      save = saves.commit({ ...save, studio: { ...save.studio, [which]: color } });
      run.save = save;
      applyStudioColors();
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
  isActive: () => appReady && !run.paused && !overlayOpen() && !swapping,
  step: (seconds) => simStep(seconds),
  render: (frameSeconds) => present(frameSeconds)
});

app.onFrame(() => {
  if (!appReady) {
    return;
  }
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
  const steps = simLoop.tick(performance.now());
  if (steps === 0 && (run.paused || overlayOpen())) {
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
      // Drive the rigged clips: phase map unless a transient attack/hit is playing.
      run.bossFxT = Math.max(0, run.bossFxT - seconds);
      if (run.bossFxT <= 0 && run.boss.phase !== run.bossClip) {
        run.bossClip = run.boss.phase;
        const clipSpec = BOSS_CLIP_FOR[run.boss.phase];
        bossNode.setAnimation({ clip: clipSpec.clip, loop: clipSpec.loop ?? true });
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

function present(frameSeconds: number): void {
  const { spec } = ensureWorld(run.world);
  for (const n of ensureWorld(run.world).built.spinNodes) {
    const h = node(n);
    if (h && h.visible !== false) h.setRotation(0, run.worldClock * 1.8, 0);
  }
  Object.assign(drawnPlayer, run.player, pipPresenter.present(simLoop));
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
  }, ensureWorld(run.world).built, node);
  feel.update(frameSeconds * 1000);
  hud.setTimer(run.levelTime, run.mode === "trial" ? spec.medals : undefined);
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
    hero: { assetId: "pipsPip", hash: assets.pip.hash, clips: Object.values(PIP_CLIPS) },
    bossAsset: run.boss ? { assetId: "pipsBrambleback", hash: assets.boss.hash, clips: Object.values(BOSS_CLIPS) } : null,
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

void app.ready().then(async () => {
  await pipsGame.ready();
  nodeCache.clear();
  applyRunNodeState();
  appReady = true;
  presentation.worldMounted(ensureWorld(run.world).built);
  // E-I crop contract, read at every steady-state shot (projected each read).
  // installQaHooks("qa") installs it as window.__AURA_QA__ with the standard hooks beside `crops`.
  installQaHooks("qa", {
    ready: () => appReady,
    state: () => ({ world: run.world, look: ensureWorld(run.world).built.presentation.mode }),
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
