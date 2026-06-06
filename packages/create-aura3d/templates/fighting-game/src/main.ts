import { camera, createGameApp, effects, game, lights, scene, ui } from "@aura3d/engine";
import { assets } from "./aura-assets";
import {
  animationLayer,
  createFighterAnimationController,
  createFighterNode,
  isLoopingFighterClip,
  publicAssetInstructions,
  REQUIRED_FIGHTER_ASSETS,
  resolveTypedFighterAssets,
  type FighterClip
} from "./game/fighters";
import { heavyMove, lightMove, specialMove } from "./game/moves";
import {
  createFighterColliders,
  createTouchLayout,
  fightingControls,
  fightingRouteReadiness,
  fightingStage,
  fightingStageBounds,
  fightingStageIssues
} from "./game/stage";
import "./styles.css";

type Aura3DGameWindow = Window & {
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

const hudBindings = game.hud.bindings([
  game.hud.health({ actorId: "player", label: "Player health", a11yLabel: "player health" }),
  game.hud.health({ actorId: "rival", label: "Rival health", a11yLabel: "rival health" }),
  game.hud.meter({ actorId: "player", label: "Player meter", a11yLabel: "player special meter" }),
  game.hud.timer({ label: "Round timer", valuePath: "round.timeRemaining", a11yLabel: "round timer" }),
  game.hud.combo({ actorId: "player", label: "Player combo", valuePath: "combat.player.combo", a11yLabel: "player combo" }),
  game.hud.round({ label: "Round", valuePath: "round.index", a11yLabel: "round index" }),
  game.hud.debugToggle({ label: "Runtime evidence", action: "debug", statePath: "debug.visible" })
]);

const accessibilitySources = [
  game.accessibility.label({
    targetId: "hud",
    label: "Live fighting game HUD with health, timer, stage, assets, and replay status.",
    live: true
  }),
  game.accessibility.focus({
    scopeId: "hud-controls",
    label: "HUD controls",
    targets: ["#hud-replay-button", "#hud-pause-button"]
  }),
  game.accessibility.reducedMotion({ enabled: reducedMotion }),
  game.accessibility.reducedFlash({ enabled: reducedFlash }),
  game.accessibility.highContrast({ enabled: highContrast }),
  game.accessibility.pauseControls({
    actions: ["pause", "Escape"],
    resumeActions: ["pause", "Enter"],
    menuId: "hud-controls"
  })
];

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

const arena = scene()
  .background("#10071c")
  .addMany(fightingStage.nodes)
  .add(createFighterNode("player", "playerFighter", "Player fighter", playerStart, 1, "#45f5bb", typedFighterAssets))
  .add(createFighterNode("rival", "rivalFighter", "Rival fighter", rivalStart, -1, "#ffca5f", typedFighterAssets))
  .addMany([
    effects.bloom({ intensity: 0.32 }),
    lights.studio({ intensity: 1.15 }),
    lights.directional({ name: "rim light", color: "#80ffd4", intensity: 0.7 }).position(0, 4, 3)
  ])
  .camera(camera.perspective({ position: [0, 1.75, 5.8], target: [0, 0.85, 0], fov: 42 }));

const gameApp = createGameApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  input: inputOptions,
  loop: { fixedDt: 1 / 60 },
  scene: arena
});

const app = gameApp.app;
const input = gameApp.input;
if (!input) throw new Error("create-aura3d fighting-game template failed to create runtime-owned input.");
const replayInput = game.input({ ...inputOptions, autoListen: false, gamepad: false });
const openingReplay = game.inputReplay(
  [
    { frame: 2, time: 2 / 60, type: "press", binding: "KeyD" },
    { frame: 16, time: 16 / 60, type: "press", binding: "KeyL" },
    { frame: 20, time: 20 / 60, type: "release", binding: "KeyL" },
    { frame: 32, time: 32 / 60, type: "release", binding: "KeyD" },
    { frame: 44, time: 44 / 60, type: "press", binding: "KeyJ" },
    { frame: 48, time: 48 / 60, type: "release", binding: "KeyJ" }
  ],
  { label: "starter approach-special replay", fps: 60, seed: 105 }
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
const playerAnimation = createFighterAnimationController("player", typedFighterAssets.playerFighter);
const rivalAnimation = createFighterAnimationController("rival", typedFighterAssets.rivalFighter);

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
  lifecycle: {
    kind: gameApp.kind,
    usesCreateGameApp: true,
    runtimeEvidenceGlobal: "__AURA3D_GAME_RUNTIME__"
  },
  typedAssetPattern: "src/aura-assets.ts",
  typedAssetKeys: REQUIRED_FIGHTER_ASSETS,
  missingAssets: missingFighterAssets,
  addAssets: publicAssetInstructions,
  touchControls: touchLayout,
  readiness: fightingRouteReadiness
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
  replayActive = true;
  replayHitCount = 0;
  replayDriver.reset();
  replayInput.clearReplay();
  ui.setText(hudReplay, `Replay ${openingReplay.checksum} running`);
});

ui.onClick(pauseButton, () => setPaused(!paused));

gameApp.onFrame(({ dt }) => {
  const activeInput = replayActive ? replayInput : input;
  if (replayActive) {
    replayDriver.step(dt);
    if (replayDriver.snapshot().complete) replayActive = false;
  } else {
    input.update(dt);
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
    if (playerAttack.id.includes("special")) runtimeEffects.auraBurst(playerBody.position, { ownerId: "player", intensity: 0.7 });
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
      if (event.targetId === "player") playerBody.applyKnockback([event.attackerId === "rival" ? -2.2 : 2.2, 1.5, 0]);
      if (event.targetId === "rival") rivalBody.applyKnockback([event.attackerId === "player" ? 2.2 : -2.2, 1.5, 0]);
    }
  }

  runtimeEffects.update(dt);
  const cameraFrame = director.update(dt, [
    { id: "player", position: playerBody.position },
    { id: "rival", position: rivalBody.position }
  ]);

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
  gameWindow.__AURA3D_GAME_RUNTIME__ = gameApp.evidence;
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
  if (paused) gameApp.pause();
  else gameApp.resume();
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
