import { camera, effects, game, lights, looks, scene, ui } from "@aura3d/engine";
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the §7.7 fighting HUD theme, the §6.11 dpad-4btn touch preset,
// game-sfx-core cues, and the juice event map.
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import {
  animationLayer,
  createFighterAnimationController,
  createFighterNode,
  FIGHTER_CERTIFIED_CLIP,
  isLoopingFighterClip,
  PLAYER_FIGHTER_ASSET,
  publicAssetInstructions,
  REQUIRED_FIGHTER_ASSETS,
  resolveTypedFighterAssets,
  RIVAL_FIGHTER_ASSET,
  type FighterClip
} from "./game/fighters";
import { heavyMove, lightMove, specialMove } from "./game/moves";
import {
  createFighterColliders,
  createFightingRouteReadiness,
  createTouchLayout,
  fightingControls,
  fightingStage,
  fightingStageBounds,
  fightingStageIssues
} from "./game/stage";
import "./styles.css";

type Aura3DGameWindow = Window & {
  __AURA3D_GAME__?: { readonly state?: string };
  __AURA3D_GAME_DEBUG__?: unknown;
  __AURA3D_GAME_EVIDENCE__?: unknown;
  __AURA3D_GAME_RUNTIME__?: unknown;
  __AURA3D_GAME_REPLAY__?: unknown;
  __AURA3D_GAME_SOURCE__?: unknown;
};

const gameWindow = window as Aura3DGameWindow;
const { typedFighterAssets, missingFighterAssets, typedFighterAssetCount } = resolveTypedFighterAssets(assets);
const mediaMatches = (query: string) => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
const reducedMotion = mediaMatches("(prefers-reduced-motion: reduce)");
const highContrast = mediaMatches("(prefers-contrast: more)");
const reducedFlash = reducedMotion;

const playerStart = [-0.9, 0, 0] as const;
const rivalStart = [0.9, 0, 0] as const;
const stageWarnings = fightingStageIssues.map((issue) => issue.message);
const touchLayout = createTouchLayout(window.innerWidth, window.innerHeight);
const routeReadiness = createFightingRouteReadiness({ missingFighterAssets });

ui.html(
  "#hud",
  `
    <section class="hud__panel hud__panel--status" aria-label="Round status">
      <p class="hud__eyebrow">Public Aura3D game runtime starter</p>
      <h1>Aura3D Fighting Game Runtime</h1>
      <div class="hud__bars" aria-label="Health and meter">
        <span class="hud__bar"><b>Player</b><span id="hud-player-health">100 HP</span></span>
        <span class="hud__bar"><b>Rival</b><span id="hud-rival-health">100 HP</span></span>
        <span class="hud__bar hud__bar--meter"><b>Meter</b><span id="hud-player-meter">0%</span></span>
      </div>
    </section>
    <section class="hud__panel hud__panel--meta" aria-label="Runtime evidence">
      <span id="hud-round">Round 1 - 99</span>
      <span id="hud-frame">Frame 0</span>
      <span id="hud-camera">Camera zoom 1.00</span>
      <span id="hud-assets">Typed assets ${typedFighterAssetCount}/2</span>
      <span id="hud-stage">Stage ${fightingStage.id}</span>
      <span id="hud-replay">Replay ready</span>
    </section>
    <section id="hud-controls" class="hud__panel hud__panel--controls" aria-label="Controls">
      <button id="hud-replay-button" type="button">Run replay</button>
      <button id="hud-pause-button" type="button" aria-pressed="false">Pause</button>
      <span class="hud__help">Move A/D - Jump W/Space - Guard Q - Dash Shift - J/K/L attacks</span>
    </section>
  `
);

const hudPlayerHealth = ui.text("#hud-player-health");
const hudRivalHealth = ui.text("#hud-rival-health");
const hudPlayerMeter = ui.text("#hud-player-meter");
const hudRound = ui.text("#hud-round");
const hudFrame = ui.text("#hud-frame");
const hudCamera = ui.text("#hud-camera");
const hudAssets = ui.text("#hud-assets");
const hudStage = ui.text("#hud-stage");
const hudReplay = ui.text("#hud-replay");
const replayButton = ui.button("#hud-replay-button");
const pauseButton = ui.button("#hud-pause-button");

// Descriptor literals replace the deprecated game.hud.* / game.accessibility.*
// helpers — same evidence shape, no factory call.
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "health", id: "hud:player:health", label: "Player health", source: "combat", targetId: "player", valuePath: "combat.actors.player.health", maxPath: "rules.maxHealth", format: "percent", a11yLabel: "player health" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "health", id: "hud:rival:health", label: "Rival health", source: "combat", targetId: "rival", valuePath: "combat.actors.rival.health", maxPath: "rules.maxHealth", format: "percent", a11yLabel: "rival health" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "meter", id: "hud:player:meter", label: "Player meter", source: "combat", targetId: "player", valuePath: "combat.actors.player.meter", maxPath: "rules.maxMeter", format: "percent", a11yLabel: "player super meter value" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "timer", id: "hud:round:timer", label: "Round timer", source: "app-state", valuePath: "round.timeRemaining", format: "seconds", a11yLabel: "round timer" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "combo", id: "hud:player:combo", label: "Player combo", source: "combat", targetId: "player", valuePath: "combat.player.combo", format: "number", a11yLabel: "player combo" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "round", id: "hud:round:index", label: "Round", source: "app-state", valuePath: "round.index", format: "number", a11yLabel: "round index" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "debug-toggle", id: "hud:debug:toggle", label: "Runtime evidence", source: "app-state", valuePath: "debug.visible", format: "boolean", a11yLabel: "runtime evidence toggle", debugOnly: true }
] as const;

const accessibilitySources = [
  {
    kind: "aura-game-accessibility-source", feature: "label", id: "a11y:hud:label", owner: "app",
    label: "Live fighting game HUD with health, timer, stage, assets, and replay status.",
    targetId: "hud", role: "status", actions: [], source: "dom",
    evidence: "App owns an aria-live label for this gameplay target."
  },
  {
    kind: "aura-game-accessibility-source", feature: "focus", id: "a11y:hud-controls:focus", owner: "app",
    label: "HUD controls", targetId: "hud-controls",
    actions: ["#hud-replay-button", "#hud-pause-button"], source: "dom",
    evidence: "Focus is scoped to the replay and pause controls."
  },
  {
    kind: "aura-game-accessibility-source", feature: "reduced-motion", id: "a11y:reduced-motion", owner: "app",
    label: "reduced motion", actions: [], source: "media-query",
    evidence: reducedMotion ? "prefers-reduced-motion is enabled." : "prefers-reduced-motion is not set."
  },
  {
    kind: "aura-game-accessibility-source", feature: "reduced-flash", id: "a11y:reduced-flash", owner: "app",
    label: "reduced flash", actions: [], source: "media-query",
    evidence: reducedFlash ? "Reduced flash enabled via reduced-motion preference." : "Reduced flash not required."
  },
  {
    kind: "aura-game-accessibility-source", feature: "high-contrast", id: "a11y:high-contrast", owner: "app",
    label: "high contrast", actions: [], source: "media-query",
    evidence: highContrast ? "prefers-contrast: more is enabled." : "prefers-contrast: more is not set."
  },
  {
    kind: "aura-game-accessibility-source", feature: "pause-controls", id: "a11y:pause-controls", owner: "app",
    label: "pause controls", targetId: "hud-controls",
    actions: ["pause", "Escape"], source: "app-state",
    evidence: "Pause/resume through the pause action or Escape; resume via pause or Enter."
  }
] as const;

const inputOptions = {
  actions: {
    ...fightingControls.actions,
    guard: ["KeyQ", "GamepadLB"],
    heavy: ["KeyK", "GamepadY"],
    pause: ["Escape", "GamepadStart"]
  },
  axes: fightingControls.axes,
  bufferMs: 150,
  gamepad: true
} as const;

const LOOK_ID = "arena-fight" as const;
const arena = scene()
  // The arena-fight look supplies the interior-industrial backdrop, key light,
  // haze and post grade; only the accent rim spot rides on top of it.
  .add(looks.preset(LOOK_ID))
  .addMany(fightingStage.nodes)
  // The creature rival renders roughly twice the player height at scale 1, so
  // it mounts slightly under scale to share the frame with the humanoid player.
  .add(createFighterNode("player", PLAYER_FIGHTER_ASSET, "Player fighter", playerStart, 1, "#45f5bb", typedFighterAssets, 1))
  .add(createFighterNode("rival", RIVAL_FIGHTER_ASSET, "Rival fighter", rivalStart, -1, "#ffca5f", typedFighterAssets, 0.75))
  .addMany([
    effects.bloom({ intensity: 0.32 }),
    lights.directional({ name: "rim light", color: "#80ffd4", intensity: 0.7 }).position(0, 4, 3)
  ])
  .camera(camera.perspective({ position: [0, 1.75, 5.8], target: [0, 0.85, 0], fov: 42 }));

const fightingGame = createGame({
  id: "fighting-game",
  target: "#app",
  autoStart: true,
  diagnostics: { overlay: false, performancePanel: false },
  input: inputOptions,
  loop: { fixedDt: 1 / 60 },
  scene: () => arena,
  hud: { theme: "fighting", widgets: [] },
  touch: {
    preset: "dpad-4btn",
    bindings: { left: "left", right: "right", block: "guard", light: "light", heavy: "heavy", special: "special", jump: "jump" }
  },
  sound: {
    cues: {
      hit: { id: "hit", asset: { url: sfxUrl("impact.flesh.medium.00") }, volume: 0.7 },
      blocked: { id: "blocked", asset: { url: sfxUrl("impact.metal.light.00") }, volume: 0.6 },
      special: { id: "special", asset: { url: sfxUrl("impact.energy.heavy.00") }, volume: 0.8 },
      dash: { id: "dash", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.35 },
      "replay-start": { id: "replay-start", asset: { url: sfxUrl("ui.confirm.00") }, volume: 0.5 }
    }
  },
  juice: {
    hit: { hitStop: 0.045, shake: 0.32, punch: { fovDeg: 1.8, ms: 160 }, rumble: { strong: 0.5, ms: 140 } },
    blocked: { shake: 0.14, rumble: { weak: 0.4, ms: 100 } },
    special: { hitStop: 0.06, punch: { fovDeg: 2.4, ms: 260 }, flash: { color: "#45f5bb", peak: 0.2, ms: 240 }, rumble: { strong: 0.7, ms: 260 } },
    dash: { punch: { fovDeg: 1.1, ms: 120 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      fightingGame: () => ({
        replay: gameWindow.__AURA3D_GAME_REPLAY__ ?? { status: "unbound" },
        debug: gameWindow.__AURA3D_GAME_DEBUG__ ?? { status: "unbound" },
        source: gameWindow.__AURA3D_GAME_SOURCE__ ?? { status: "unbound" }
      })
    }
  }
});
const app = fightingGame.app;
const input = fightingGame.input;
if (!input) throw new Error("create-aura3d fighting-game template failed to create runtime-owned input.");
const replayInput = game.input({ ...inputOptions, autoListen: false, gamepad: false });
const openingReplay = game.inputReplay(
  [
    { frame: 1, time: 1 / 60, type: "press", binding: "KeyL" },
    { frame: 8, time: 8 / 60, type: "release", binding: "KeyL" },
    { frame: 12, time: 12 / 60, type: "press", binding: "KeyJ" },
    { frame: 16, time: 16 / 60, type: "release", binding: "KeyJ" }
  ],
  { label: "starter close-range special replay", fps: 60, seed: 105 }
);
const replayDriver = game.inputReplayDriver(replayInput, openingReplay);

const playerBody = game.kinematicBody({
  id: "player",
  position: playerStart,
  bounds: fightingStageBounds,
  groundY: 0,
  coyoteMs: 100,
  jumpBufferMs: 120
});
const rivalBody = game.kinematicBody({
  id: "rival",
  position: rivalStart,
  bounds: fightingStageBounds,
  groundY: 0
});
const playerJumpAssist = game.jumpAssist({ coyoteMs: 100, bufferMs: 120 });
const combat = game.combatWorld();
const runtimeEffects = game.effects({ poolSize: 64, reducedMotion, reducedFlash });
const director = game.cameraDirector({
  stageBounds: { minX: fightingStage.combatBounds.minX, maxX: fightingStage.combatBounds.maxX },
  reducedMotion
});
const playerNode = app.nodes.require("player");
const rivalNode = app.nodes.require("rival");
// C-22: the camera controller presents the fighting rig once, then the
// camera director drives its pose every frame below (position/target/fov from
// the director snapshot, applied through setPose — not into evidence).
app.camera?.use(camera.rigs.fighting({ fighters: ["player", "rival"] }));
const playerAnimation = createFighterAnimationController("player", typedFighterAssets[PLAYER_FIGHTER_ASSET]);
const rivalAnimation = createFighterAnimationController("rival", typedFighterAssets[RIVAL_FIGHTER_ASSET]);

playerAnimation.bindRuntimeNode(playerNode, { defaultClipId: "idle", fallbackClipId: "idle" });
rivalAnimation.bindRuntimeNode(rivalNode, { defaultClipId: "idle", fallbackClipId: "idle" });
playerAnimation.play("idle", { restart: true, loop: "loop" });
rivalAnimation.play("idle", { restart: true, loop: "loop" });

combat.addActor({ id: "player", team: "player", position: playerBody.position, facing: 1 });
combat.addActor({ id: "rival", team: "rival", position: rivalBody.position, facing: -1 });

gameWindow.__AURA3D_GAME_SOURCE__ = {
  route: window.location.pathname,
  template: "fighting-game",
  package: "create-aura3d",
  publicEngineApi: true,
  look: { id: LOOK_ID, category: "studio", biome: "interior-industrial" },
  lifecycle: {
    kind: "createGame",
    usesCreateGameApp: false,
    usesCreateGame: true,
    beaconGlobal: "__AURA3D_GAME__",
    evidenceGlobal: "__AURA3D_GAME_EVIDENCE__"
  },
  typedAssetPattern: "src/aura-assets.ts",
  typedAssetKeys: REQUIRED_FIGHTER_ASSETS,
  missingAssets: missingFighterAssets,
  heroAssets: {
    player: {
      assetId: assets[PLAYER_FIGHTER_ASSET]?.id ?? PLAYER_FIGHTER_ASSET,
      url: assets[PLAYER_FIGHTER_ASSET]?.url,
      certifiedClip: FIGHTER_CERTIFIED_CLIP.player
    },
    rival: {
      assetId: assets[RIVAL_FIGHTER_ASSET]?.id ?? RIVAL_FIGHTER_ASSET,
      url: assets[RIVAL_FIGHTER_ASSET]?.url,
      certifiedClip: FIGHTER_CERTIFIED_CLIP.rival
    }
  },
  addAssets: publicAssetInstructions,
  touchControls: touchLayout,
  readiness: routeReadiness
};

let aiCooldown = 0;
let roundTime = 99;
let replayActive = false;
let paused = false;
let replayHitCount = 0;
let totalHitCount = 0;
let playerClip: FighterClip = "idle";
let rivalClip: FighterClip = "idle";

ui.onClick(replayButton, () => {
  void fightingGame.sound?.cue("replay-start");
  replayActive = true;
  replayHitCount = 0;
  replayDriver.reset();
  replayInput.clearReplay();
  ui.setText(hudReplay, `Replay ${openingReplay.checksum} running`);
});

ui.onClick(pauseButton, () => setPaused(!paused));

app.onFrame(({ dt }) => {
  const activeInput = replayActive ? replayInput : input;
  if (replayActive) {
    replayDriver.step(dt);
    if (replayDriver.snapshot().complete) replayActive = false;
  }

  if (activeInput.pressed("pause")) setPaused(!paused);

  roundTime = Math.max(0, roundTime - dt);
  const moveX = activeInput.axis("moveX");
  playerBody.move(moveX);

  const jumpAssist = playerJumpAssist.update(dt, {
    grounded: playerBody.grounded,
    jumpPressed: activeInput.pressed("jump")
  });
  if (jumpAssist.canJump && jumpAssist.jumpBuffered && playerJumpAssist.consume()) playerBody.jump();

  if (activeInput.pressed("dash")) {
    playerBody.dash([playerBody.facing, 0, 0], 8);
    runtimeEffects.dashTrail(playerBody.position, { ownerId: "player", intensity: 0.55 });
    fightingGame.juice.fire("dash");
    void fightingGame.sound?.cue("dash");
  }

  aiCooldown -= dt;
  const distance = playerBody.position[0] - rivalBody.position[0];
  const rivalFacing = directionToPlayer();
  rivalBody.move(Math.abs(distance) > 1.45 ? rivalFacing * 0.65 : -rivalFacing * 0.18);
  if (aiCooldown <= 0 && Math.abs(distance) < 1.3) {
    aiCooldown = 0.72;
    combat.beginAttack("rival", heavyMove("rival-heavy", rivalFacing));
  }

  const liveSpecialCombo = input.combo(["light", "heavy", "special"], 650);
  const replaySpecialCombo = replayInput.combo(["light", "heavy", "special"], 650);
  const playerAttack = activeInput.pressed("heavy")
    ? heavyMove("player-heavy", playerBody.facing)
    : activeInput.pressed("special") || liveSpecialCombo || replaySpecialCombo
      ? specialMove("player-special", playerBody.facing)
      : activeInput.pressed("light")
        ? lightMove("player-light", playerBody.facing)
        : undefined;
  if (playerAttack) {
    combat.beginAttack("player", playerAttack);
    if (playerAttack.id.includes("special")) {
      runtimeEffects.auraBurst(playerBody.position, { ownerId: "player", intensity: 0.7 });
      fightingGame.juice.fire("special");
      void fightingGame.sound?.cue("special");
    }
  }

  playerBody.update(dt);
  rivalBody.update(dt);
  combat.setActor("player", { position: playerBody.position, facing: playerBody.facing, guarding: activeInput.held("guard") });
  combat.setActor("rival", { position: rivalBody.position, facing: rivalFacing, guarding: aiCooldown > 0.5 });
  combat.update(dt);

  const combatEvents = combat.consumeEvents();
  for (const event of combatEvents) {
    if (event.type === "hit" || event.type === "blocked") {
      const spark = event.type === "hit" ? runtimeEffects.hitSpark : runtimeEffects.blockSpark;
      spark(event.position, { ownerId: event.attackerId, intensity: event.type === "hit" ? 1.1 : 0.65 });
      director.impact(event.type === "hit" ? 0.42 : 0.18, 0.16);
      if (event.type === "hit") {
        totalHitCount += 1;
        if (replayActive || replayDriver.snapshot().frame > 0) replayHitCount += 1;
      }
      fightingGame.juice.fire(event.type);
      void fightingGame.sound?.cue(event.type);
      if (event.targetId === "player") playerBody.applyKnockback([event.attackerId === "rival" ? -2.2 : 2.2, 1.5, 0]);
      if (event.targetId === "rival") rivalBody.applyKnockback([event.attackerId === "player" ? 2.2 : -2.2, 1.5, 0]);
    }
  }

  runtimeEffects.update(dt);
  const cameraFrame = director.update(dt, [
    { id: "player", position: playerBody.position },
    { id: "rival", position: rivalBody.position }
  ]);
  app.camera?.setPose(
    { position: cameraFrame.position, target: cameraFrame.target, fov: cameraFrame.fov },
    { cut: true }
  );

  playerClip = activeInput.held("guard")
    ? "guard"
    : playerAttack
      ? playerAttack.id.includes("special")
        ? "special"
        : playerAttack.id.includes("heavy")
          ? "heavy"
          : "light"
      : !playerBody.grounded
        ? "jump"
        : Math.abs(moveX) > 0.05
          ? "walk"
          : "idle";
  rivalClip = aiCooldown > 0.5 ? "heavy" : !rivalBody.grounded ? "jump" : "idle";

  syncFighterAnimation(playerAnimation, playerClip, dt);
  syncFighterAnimation(rivalAnimation, rivalClip, dt);

  playerNode
    .setPosition(playerBody.position[0], playerBody.position[1], playerBody.position[2])
    .setRotation(0, playerBody.facing < 0 ? Math.PI : 0, 0);
  rivalNode
    .setPosition(rivalBody.position[0], rivalBody.position[1], rivalBody.position[2])
    .setRotation(0, rivalFacing < 0 ? Math.PI : 0, 0);

  const snapshot = combat.snapshot();
  const player = snapshot.actors.find((actor) => actor.id === "player");
  const rival = snapshot.actors.find((actor) => actor.id === "rival");
  if (player && rival) {
    ui.setText(hudPlayerHealth, `${Math.round(player.health)} HP`);
    ui.setText(hudRivalHealth, `${Math.round(rival.health)} HP`);
    ui.setText(hudPlayerMeter, `${Math.round(player.meter)}%`);
    ui.setText(hudRound, `Round 1 - ${Math.ceil(roundTime)}`);
    ui.setText(hudFrame, `Frame ${app.runtime.frame}`);
    ui.setText(hudCamera, `Camera zoom ${cameraFrame.zoom.toFixed(2)}`);
    ui.setText(
      hudAssets,
      missingFighterAssets.length === 0
        ? "Typed assets ready"
        : `Source placeholders: add ${missingFighterAssets.join(", ")}`
    );
    ui.setText(hudStage, stageWarnings.length === 0 ? `Stage ${fightingStage.id} ready` : `Stage warnings ${stageWarnings.length}`);
    ui.setText(
      hudReplay,
      replayActive
        ? `Replay ${replayDriver.snapshot().frame}/${openingReplay.frameCount}`
        : `Replay ${openingReplay.checksum} hits ${replayHitCount}`
    );
  }

  const colliders = createFighterColliders(playerBody.position, rivalBody.position);
  const animationSnapshots = [playerAnimation.snapshot(), rivalAnimation.snapshot()];
  const activeClips = animationSnapshots.map((animation) => animation.activeClipId ?? "idle");

  gameWindow.__AURA3D_GAME_REPLAY__ = {
    plan: openingReplay,
    driver: replayDriver.snapshot(),
    hitCount: replayHitCount,
    totalHitCount,
    liveInputEvents: input.recorded()
  };
  gameWindow.__AURA3D_GAME_RUNTIME__ = {
    kind: "createGame",
    beacon: gameWindow.__AURA3D_GAME__ ?? { state: "unbound" },
    frame: app.runtime.frame
  };
  gameWindow.__AURA3D_GAME_DEBUG__ = game.debug.overlay({
    runtime: app.runtime,
    input: activeInput,
    bodies: [playerBody, rivalBody],
    combat,
    effects: runtimeEffects,
    camera: director,
    colliders,
    warnings: stageWarnings
  });
  gameWindow.__AURA3D_GAME_EVIDENCE__ = app.evidence({
    input: activeInput,
    bodies: [playerBody, rivalBody],
    combat,
    effects: runtimeEffects,
    camera: director,
    animation: { controllers: animationSnapshots.length, activeClips, eventCount: runtimeEffects.snapshot().spawned },
    assets: { typedAssets: typedFighterAssetCount, missingAssets: missingFighterAssets },
    stage: { id: fightingStage.id, safeZones: true, bounds: fightingStage.combatBounds, warnings: stageWarnings },
    hud: hudBindings,
    accessibility: accessibilitySources,
    source: {
      mode: "mounted-runtime",
      expectsGame: true,
      label: "create-aura3d fighting-game scaffold"
    }
  });
});

function directionToPlayer(): 1 | -1 {
  return playerBody.position[0] >= rivalBody.position[0] ? 1 : -1;
}

function setPaused(next: boolean): void {
  paused = next;
  ui.setPressed(pauseButton, paused);
  ui.setText(pauseButton, paused ? "Resume" : "Pause");
  if (paused) app.pause();
  else app.resume();
}

function syncFighterAnimation(controller: ReturnType<typeof createFighterAnimationController>, clip: FighterClip, dt: number): void {
  const current = controller.snapshot().activeClipId;
  const loop = isLoopingFighterClip(clip) ? "loop" : false;
  const layer = animationLayer(clip);
  if (current !== clip) {
    controller.crossFade(clip, 0.08, {
      restart: !isLoopingFighterClip(clip),
      loop,
      layer,
      attack: layer === "upper-body"
    });
  }
  controller.update(dt);
}
