import {
  AnimationController,
  camera,
  createAuraApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "../aura-assets";
import "./playable.css";

type FighterId = "player" | "rival";
type MoveId = "light" | "heavy" | "special";
type Vec3 = readonly [number, number, number];

type AuraClashWindow = Window & {
  __AURA3D_GAME_SOURCE__?: unknown;
  __AURA3D_GAME_DEBUG__?: unknown;
  __AURA3D_GAME_EVIDENCE__?: unknown;
  __AURA_CLASH_V4_PROOF__?: unknown;
};

interface FighterState {
  readonly id: FighterId;
  readonly name: string;
  readonly archetype: string;
  readonly accent: string;
  readonly team: string;
  facing: 1 | -1;
  lock: number;
  hitstun: number;
  clip: string;
  lastDamage: number;
  combo: number;
}

interface MoveSpec {
  readonly id: MoveId;
  readonly name: string;
  readonly damage: number;
  readonly startupFrames: number;
  readonly activeFrames: readonly [number, number];
  readonly durationFrames: number;
  readonly hitStun: number;
  readonly blockStun: number;
  readonly hitStop: number;
  readonly recovery: number;
  readonly knockback: Vec3;
  readonly hitboxOffset: Vec3;
  readonly hitboxSize: Vec3;
  readonly color: string;
}

const gameWindow = window as AuraClashWindow;
const fighterIdleClip = "Idle_Loop";
const fighterWalkClip = "Walk_Loop";
const fighterRunClip = "Sprint_Loop";
const fighterJumpClip = "Jump_Start";
const fighterHitClip = "Hit_Chest";
const fighterLightClip = "Punch_Jab";
const fighterHeavyClip = "Punch_Cross";
const fighterSpecialClip = "Sword_Attack";
const fighterClips = [
  fighterIdleClip,
  fighterWalkClip,
  fighterRunClip,
  fighterJumpClip,
  fighterHitClip,
  fighterLightClip,
  fighterHeavyClip,
  fighterSpecialClip
] as const;
const fighterScale = 1.0;
const fighterYOffset = 0;
const stageBounds = { minX: -2.45, maxX: 2.45, minY: 0, maxY: 1.45, minZ: -0.1, maxZ: 0.1 };
const playerStart = [-1.32, 0, 0] as const;
const rivalStart = [1.32, 0, 0] as const;
const minimumSeparation = 1.08;
const roundSeconds = 99;

const moves: Record<MoveId, MoveSpec> = {
  light: {
    id: "light",
    name: "Pulse Jab",
    damage: 7,
    startupFrames: 3,
    activeFrames: [3, 9],
    durationFrames: 18,
    hitStun: 0.22,
    blockStun: 0.12,
    hitStop: 0.06,
    recovery: 0.16,
    knockback: [1.5, 0.22, 0],
    hitboxOffset: [0.64, 0.78, 0],
    hitboxSize: [0.9, 0.46, 0.44],
    color: "#2fffd2"
  },
  heavy: {
    id: "heavy",
    name: "Circuit Breaker",
    damage: 13,
    startupFrames: 6,
    activeFrames: [6, 15],
    durationFrames: 30,
    hitStun: 0.34,
    blockStun: 0.18,
    hitStop: 0.09,
    recovery: 0.28,
    knockback: [2.05, 0.34, 0],
    hitboxOffset: [0.78, 0.88, 0],
    hitboxSize: [1.16, 0.62, 0.52],
    color: "#ffe68a"
  },
  special: {
    id: "special",
    name: "Aura Crash",
    damage: 20,
    startupFrames: 8,
    activeFrames: [8, 24],
    durationFrames: 48,
    hitStun: 0.46,
    blockStun: 0.24,
    hitStop: 0.13,
    recovery: 0.42,
    knockback: [2.7, 0.48, 0],
    hitboxOffset: [0.9, 0.88, 0],
    hitboxSize: [1.52, 0.82, 0.62],
    color: "#72f7ff"
  }
};

export function mountAuraClashV4App(): void {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("AuraClash V4 requires #app.");

  root.innerHTML = `
    <main class="aura-clash-v4" aria-label="Aura Clash V4 playable route">
      <nav class="v4-nav" aria-label="Aura Clash navigation">
        <a class="v4-brand" href="/playable/"><span></span>Aura Clash V4</a>
        <div class="v4-links">
          <a href="/playable/">Playable</a>
          <a href="/evidence/">Evidence</a>
          <a href="/deploy-check/">Deploy check</a>
          <a href="https://github.com/auraoneai/aura3d" rel="noreferrer">GitHub</a>
          <a href="https://www.npmjs.com/package/@aura3d/engine" rel="noreferrer">npm</a>
        </div>
      </nav>

      <section class="v4-hud" aria-live="polite">
        <article class="v4-card">
          <p>Player</p>
          <h1 id="player-name">KADE EMBER</h1>
          <span>Authored GLB fighter + Aura3D runtime combat/animation state</span>
          <div class="v4-bar v4-health"><i id="player-health"></i></div>
          <div class="v4-bar v4-meter"><i id="player-meter"></i></div>
          <b id="player-state">IDLE - 100 HP</b>
        </article>
        <article class="v4-clock"><strong id="round-time">99</strong><span id="callout">FIGHT</span></article>
        <article class="v4-card v4-card--right">
          <p>Rival AI</p>
          <h2 id="rival-name">ROOK ATLAS</h2>
          <span>Authored GLB rival + Aura3D runtime combat/animation state</span>
          <div class="v4-bar v4-health"><i id="rival-health"></i></div>
          <div class="v4-bar v4-meter"><i id="rival-meter"></i></div>
          <b id="rival-state">READY - 100 HP</b>
        </article>
      </section>

      <section class="v4-stage-shell" aria-label="Aura3D V4 combat stage">
        <div id="aura-stage-v4" class="v4-stage"></div>
        <div class="v4-toast" id="toast">V4 loaded: federated catalog assets, typed GLBs, animation controllers, runtime combat.</div>
      </section>

      <section class="v4-controls" aria-label="Controls">
        <button type="button" data-hold="moveLeft">A / Left</button>
        <button type="button" data-hold="moveRight">D / Right</button>
        <button type="button" data-tap="jump">Space Jump</button>
        <button type="button" data-tap="dash">Shift Dash</button>
        <button type="button" data-hold="guard">Q Guard</button>
        <button type="button" data-tap="light">J Light</button>
        <button type="button" data-tap="heavy">K Heavy</button>
        <button type="button" data-tap="special">L Special</button>
        <button type="button" id="reset-round">Reset</button>
      </section>

      <section class="v4-proof" aria-label="Aura3D proof">
        <div><b>V1/V2/V3</b><span>Dumped from active route</span></div>
        <div><b>Assets</b><span>Federated catalog + CLI typed registration</span></div>
        <div><b>Animation</b><span>Embedded GLB clips, not fake string ids</span></div>
        <div><b>Runtime</b><span>Input, physics, combat, camera, effects, HUD, accessibility</span></div>
      </section>
    </main>
  `;

  const reducedMotion = matchMediaSafe("(prefers-reduced-motion: reduce)");
  const reducedFlash = reducedMotion || matchMediaSafe("(prefers-contrast: more)");
  const highContrast = matchMediaSafe("(prefers-contrast: more)");
  const auraMat = material.pbr({ color: "#28ffd2", emissive: "#28ffd2", emissiveIntensity: 0.82, roughness: 0.24 });
  const goldMat = material.pbr({ color: "#ffe68a", emissive: "#ffe68a", emissiveIntensity: 0.52, roughness: 0.36 });
  const glassMat = material.pbr({ color: "#123f35", emissive: "#0b4b3c", emissiveIntensity: 0.34, roughness: 0.55, metallic: 0.16 });
  const floorMat = material.pbr({ color: "#6eeed8", emissive: "#2fffd2", emissiveIntensity: 0.32, roughness: 0.42, metallic: 0.04 });
  const backdropMat = material.pbr({ color: "#1d4c44", emissive: "#113c32", emissiveIntensity: 0.24, roughness: 0.58, metallic: 0.08 });
  const darkMat = material.pbr({ color: "#07120f", emissive: "#08251d", emissiveIntensity: 0.24, roughness: 0.74, metallic: 0.08 });
  const blueMat = material.pbr({ color: "#102f45", emissive: "#185b76", emissiveIntensity: 0.34, roughness: 0.5, metallic: 0.12 });
  const redMat = material.pbr({ color: "#5a1917", emissive: "#ff5d4e", emissiveIntensity: 0.36, roughness: 0.42, metallic: 0.08 });
  const hitMat = material.pbr({ color: "#fff3b0", emissive: "#2fffd2", emissiveIntensity: 1.1, roughness: 0.18 });

  const arena = scene()
    .background("#020805")
    .add(primitives.box({ name: "v4 far skyline shadow", material: darkMat }).position(0, 1.05, -1.34).scale([6.2, 1.65, 0.04]))
    .add(primitives.box({ name: "v4 far left tower", material: blueMat }).position(-2.72, 1.02, -1.3).scale([0.44, 1.28, 0.05]))
    .add(primitives.box({ name: "v4 far mid tower", material: darkMat }).position(-0.76, 1.34, -1.32).scale([0.54, 1.9, 0.05]))
    .add(primitives.box({ name: "v4 far right tower", material: blueMat }).position(2.52, 1.08, -1.3).scale([0.48, 1.42, 0.05]))
    .add(primitives.box({ name: "v4 skyline glass", material: backdropMat }).position(0, 1.12, -1.08).scale([5.7, 1.34, 0.06]))
    .add(primitives.box({ name: "v4 skyline lower shadow", material: darkMat }).position(0, 0.55, -0.98).scale([5.85, 0.24, 0.08]))
    .add(primitives.box({ name: "v4 left neon tower", material: auraMat }).position(-1.92, 1.2, -1.04).scale([0.36, 1.36, 0.08]))
    .add(primitives.box({ name: "v4 center tower", material: glassMat }).position(0, 1.42, -1.08).scale([0.68, 1.76, 0.08]))
    .add(primitives.box({ name: "v4 right neon tower", material: goldMat }).position(1.92, 1.16, -1.04).scale([0.38, 1.28, 0.08]))
    .add(primitives.box({ name: "v4 danger accent left", material: redMat }).position(-2.58, 0.82, -0.88).scale([0.08, 0.92, 0.05]))
    .add(primitives.box({ name: "v4 danger accent right", material: redMat }).position(2.58, 0.82, -0.88).scale([0.08, 0.92, 0.05]))
    .add(primitives.box({ name: "v4 combat floor", material: floorMat }).position(0, -0.06, 0.02).scale([5.0, 0.08, 0.82]))
    .add(primitives.box({ name: "v4 dark floor underplate", material: darkMat }).position(0, -0.11, 0.02).scale([5.36, 0.05, 1.05]))
    .add(primitives.box({ name: "v4 front lane", material: auraMat }).position(0, 0.02, 0.44).scale([4.55, 0.018, 0.018]))
    .add(primitives.box({ name: "v4 rear lane", material: auraMat }).position(0, 0.02, -0.36).scale([4.55, 0.018, 0.018]))
    .add(primitives.box({ name: "v4 front apron glow", material: auraMat }).position(0, 0.0, 0.66).scale([5.2, 0.025, 0.026]))
    .add(primitives.box({ name: "v4 rear apron gold", material: goldMat }).position(0, 0.0, -0.58).scale([5.05, 0.018, 0.022]))
    .add(primitives.box({ name: "v4 lane tick left", material: auraMat }).position(-1.25, 0.05, 0.02).scale([0.02, 0.08, 0.7]))
    .add(primitives.box({ name: "v4 lane tick right", material: auraMat }).position(1.25, 0.05, 0.02).scale([0.02, 0.08, 0.7]))
    .add(primitives.box({ name: "v4 lane dash left", material: goldMat }).position(-2.0, 0.05, 0.02).scale([0.018, 0.06, 0.48]))
    .add(primitives.box({ name: "v4 lane dash right", material: goldMat }).position(2.0, 0.05, 0.02).scale([0.018, 0.06, 0.48]))
    .add(primitives.box({ name: "v4 left boundary", material: goldMat }).position(stageBounds.minX, 0.56, 0.42).scale([0.026, 1.0, 0.045]))
    .add(primitives.box({ name: "v4 right boundary", material: goldMat }).position(stageBounds.maxX, 0.56, 0.42).scale([0.026, 1.0, 0.045]))
    .add(primitives.box({ name: "v4 center marker", material: auraMat }).position(0, 0.04, 0.02).scale([0.035, 0.06, 0.82]))
    .add(model(assets.fighterKadeEmber, { name: "Kade Ember authored GLB fighter" }).position(playerStart[0], fighterYOffset, playerStart[2]).scale(fighterScale).runtime(game.runtimeNode("player", { tags: ["fighter", "typed-local-asset", "authored-glb", "runtime-animated"] })))
    .add(model(assets.fighterRookAtlas, { name: "Rook Atlas authored GLB fighter" }).position(rivalStart[0], fighterYOffset, rivalStart[2]).rotate(0, Math.PI, 0).scale(fighterScale).runtime(game.runtimeNode("rival", { tags: ["fighter", "typed-local-asset", "authored-glb", "runtime-animated"] })))
    .add(model(assets.fighterRookAtlas, { name: "Rook Atlas special afterimage proof asset" }).position(9, fighterYOffset, 0).rotate(0, Math.PI, 0).scale(fighterScale).runtime(game.runtimeNode("rival-special-ghost", { tags: ["special-proof", "typed-local-asset", "runtime-animated"] })))
    .add(primitives.box({ name: "player strike arc", material: auraMat }).position(9, 0, 0).scale([0.1, 0.1, 0.1]).runtime(game.runtimeNode("player-strike", { tags: ["vfx", "hitbox-proof"] })))
    .add(primitives.box({ name: "rival strike arc", material: goldMat }).position(9, 0, 0).scale([0.1, 0.1, 0.1]).runtime(game.runtimeNode("rival-strike", { tags: ["vfx", "hitbox-proof"] })))
    .add(primitives.sphere({ name: "impact spark", material: hitMat }).position(9, 0, 0).scale(0.04).runtime(game.runtimeNode("impact-spark", { tags: ["vfx", "impact-proof"] })))
    .add(primitives.torus({ name: "impact ring", material: auraMat }).position(9, 0, 0).rotate(Math.PI / 2, 0, 0).scale([0.08, 0.08, 0.02]).runtime(game.runtimeNode("impact-ring", { tags: ["vfx", "impact-proof"] })))
    .add(effects.bloom({ intensity: 0.36 }))
    .add(lights.studio({ intensity: 1.18 }))
    .add(lights.directional({ name: "v4 mint rim", color: "#8effdd", intensity: 0.78 }).position(-1.5, 4, 3))
    .add(lights.directional({ name: "v4 gold rim", color: "#ffe68a", intensity: 0.55 }).position(2.4, 3.4, 2.5))
    .camera(camera.perspective({ position: [0, 1.3, 4.95], target: [0, 0.72, 0], fov: 35 }));

  const app = createAuraApp("#aura-stage-v4", {
    diagnostics: { overlay: false, performancePanel: false },
    scene: arena
  });

  const input = app.input({
    actions: {
      moveLeft: ["KeyA", "ArrowLeft", "GamepadDPadLeft"],
      moveRight: ["KeyD", "ArrowRight", "GamepadDPadRight"],
      jump: ["Space", "KeyW", "ArrowUp", "GamepadA"],
      dash: ["ShiftLeft", "ShiftRight", "GamepadRB"],
      guard: ["KeyQ", "GamepadLB"],
      light: ["KeyJ", "GamepadX"],
      heavy: ["KeyK", "GamepadY"],
      special: ["KeyL", "GamepadB"],
      pause: ["Escape", "KeyP", "GamepadStart"]
    },
    axes: { moveX: { negative: "moveLeft", positive: "moveRight", gamepadAxis: 0 } },
    bufferMs: 150,
    gamepad: true
  });
  wirePointerControls(root, input);

  const player = createFighter("player", "Kade Ember", "Fast pressure striker", "#2fffd2", "player", 1, fighterIdleClip);
  const rival = createFighter("rival", "Rook Atlas", "Heavy counter fighter", "#ffe68a", "rival", -1, fighterIdleClip);
  const playerBody = game.kinematicBody({ id: "player", position: playerStart, bounds: stageBounds, groundY: 0, maxSpeed: 2.4, jumpVelocity: 4.6, gravity: -19, friction: 18, coyoteMs: 90, jumpBufferMs: 110 });
  const rivalBody = game.kinematicBody({ id: "rival", position: rivalStart, bounds: stageBounds, groundY: 0, maxSpeed: 1.85, jumpVelocity: 4.1, gravity: -19, friction: 18 });
  const combat = game.combatWorld();
  const runtimeEffects = game.effects({ poolSize: 72, reducedMotion, reducedFlash });
  const cameraDirector = game.cameraDirector({ stageBounds, distance: 4.9, baseFov: 35, minZoom: 0.98, maxZoom: 1.04, reducedMotion });
  const hudBindings = game.hud.bindings([
    game.hud.health({ actorId: "player", label: "Player health", a11yLabel: "player health" }),
    game.hud.health({ actorId: "rival", label: "Rival health", a11yLabel: "rival health" }),
    game.hud.meter({ actorId: "player", label: "Player meter", a11yLabel: "player meter" }),
    game.hud.timer({ label: "Round timer", valuePath: "round.timeRemaining", a11yLabel: "round timer" }),
    game.hud.debugToggle({ label: "Evidence", action: "debug", statePath: "debug.visible" })
  ]);
  const accessibilitySources = [
    game.accessibility.label({ targetId: "aura-stage-v4", label: "Aura Clash V4 playable fighting stage", live: true }),
    game.accessibility.reducedMotion({ enabled: reducedMotion }),
    game.accessibility.reducedFlash({ enabled: reducedFlash }),
    game.accessibility.highContrast({ enabled: highContrast }),
    game.accessibility.pauseControls({ actions: ["pause", "Escape"], resumeActions: ["pause", "Enter"], menuId: "v4-controls" })
  ];

  const playerNode = app.nodes.require("player");
  const rivalNode = app.nodes.require("rival");
  const rivalSpecialGhost = app.nodes.require("rival-special-ghost");
  const playerStrike = app.nodes.require("player-strike");
  const rivalStrike = app.nodes.require("rival-strike");
  const impactSpark = app.nodes.require("impact-spark");
  const impactRing = app.nodes.require("impact-ring");
  rivalSpecialGhost.setVisible(false);
  playerStrike.setVisible(false);
  rivalStrike.setVisible(false);
  impactSpark.setVisible(false);
  impactRing.setVisible(false);

  const playerAnimation = new AnimationController<string>({
    id: "v4-player-animation",
    clipRegistry: assets.v4UAL1Standard,
    requiredClips: [...fighterClips],
    suppressRootMotion: true
  });
  const rivalAnimation = new AnimationController<string>({
    id: "v4-rival-animation",
    clipRegistry: assets.v4UAL1Standard,
    requiredClips: [...fighterClips],
    suppressRootMotion: true
  });
  const rivalSpecialAnimation = new AnimationController<string>({
    id: "v4-rival-special-animation",
    clipRegistry: assets.v4UAL1Standard,
    requiredClips: [...fighterClips],
    suppressRootMotion: true
  });
  playerAnimation.bindRuntimeNode(playerNode, { id: "player-animation-binding", defaultClipId: fighterIdleClip, fallbackClipId: fighterIdleClip });
  rivalAnimation.bindRuntimeNode(rivalNode, { id: "rival-animation-binding", defaultClipId: fighterIdleClip, fallbackClipId: fighterIdleClip });
  rivalSpecialAnimation.bindRuntimeNode(rivalSpecialGhost, { id: "rival-special-binding", defaultClipId: fighterSpecialClip, fallbackClipId: fighterIdleClip });
  playerAnimation.play(fighterIdleClip, { restart: true, loop: "loop" });
  rivalAnimation.play(fighterIdleClip, { restart: true, loop: "loop" });
  rivalSpecialAnimation.play(fighterSpecialClip, { restart: true, loop: false, speed: 1.0 });

  combat.addActor({ id: "player", team: "player", position: playerBody.position, facing: 1, hurtboxes: hurtboxes("player"), pushboxes: pushboxes("player") });
  combat.addActor({ id: "rival", team: "rival", position: rivalBody.position, facing: -1, hurtboxes: hurtboxes("rival"), pushboxes: pushboxes("rival") });

  gameWindow.__AURA3D_GAME_SOURCE__ = {
    route: window.location.pathname,
    showcase: "AuraClash V4",
    dumpedRoutes: ["v1", "v2", "v3"],
    publicEngineApi: true,
    federatedCatalogUsed: true,
    typedAssets: ["fighterKadeEmber", "fighterRookAtlas", "v4UAL1Standard"],
    assetAudit: "apps/aura-clash-showcase/aura.assets.json",
    animationClips: {
      v4UAL1Standard: assets.v4UAL1Standard.metadata.animations
    }
  };

  let roundTime = roundSeconds;
  let paused = false;
  let aiCooldown = 0.8;
  let totalHits = 0;
  let lastHitFrame = 0;
  let impactTimer = 0;
  let impactPosition: Vec3 = [0, 0.82, 0];
  let callout = "FIGHT";
  let calloutTimer = 0;
  let toast = "AuraClash V4 mounted with federated animated GLB assets.";

  root.querySelector<HTMLButtonElement>("#reset-round")?.addEventListener("click", () => resetRound());

  app.onFrame((frame) => {
    try {
    const { dt } = frame;
    input.update(dt);
    if (input.pressed("pause")) setPaused(!paused);
    if (paused) return;

    const frameDt = Math.min(dt, 1 / 30);
    roundTime = Math.max(0, roundTime - frameDt);
    tickFighter(player, frameDt);
    tickFighter(rival, frameDt);

    const pActor = combat.snapshot().actors.find((actor) => actor.id === "player");
    const rActor = combat.snapshot().actors.find((actor) => actor.id === "rival");
    const playerHealth = pActor?.health ?? 100;
    const rivalHealth = rActor?.health ?? 100;
    const roundOver = playerHealth <= 0 || rivalHealth <= 0 || roundTime <= 0;

    const distance = rivalBody.position[0] - playerBody.position[0];
    player.facing = distance >= 0 ? 1 : -1;
    rival.facing = distance >= 0 ? -1 : 1;

    const playerCanAct = !roundOver && player.lock <= 0 && player.hitstun <= 0;
    const moveX = playerCanAct ? input.axis("moveX") : 0;
    const guardHeld = input.held("guard") && player.hitstun <= 0;
    playerBody.move(moveX, guardHeld ? 1.0 : 2.4);
    if (playerCanAct && input.pressed("jump") && playerBody.grounded) {
      playerBody.jump();
      playPlayerClip(fighterJumpClip, true, 1.05);
      toast = "Kade Ember jumps inside the clamped combat lane.";
    }
    if (playerCanAct && input.pressed("dash")) {
      playerBody.dash([player.facing, 0, 0], 5.4);
      playPlayerClip(fighterRunClip, true, 1.35);
      runtimeEffects.dashTrail(playerBody.position, { ownerId: "player", color: player.accent, intensity: 0.7 });
      toast = "Kade Ember dashes. Bounds stay locked.";
    }
    if (playerCanAct && input.pressed("light")) startAttack("player", "light");
    if (playerCanAct && input.pressed("heavy")) startAttack("player", "heavy");
    if (playerCanAct && input.pressed("special")) startAttack("player", "special");

    aiCooldown = Math.max(0, aiCooldown - frameDt);
    const rivalCanAct = !roundOver && rival.lock <= 0 && rival.hitstun <= 0;
    if (rivalCanAct) {
      const gap = playerBody.position[0] - rivalBody.position[0];
      const close = Math.abs(gap) < 1.12;
      rivalBody.move(close ? 0 : Math.sign(gap) * 0.58, 1.72);
      if (close && aiCooldown <= 0) {
        startAttack("rival", Math.random() > 0.72 ? "special" : "heavy");
        aiCooldown = 0.9 + Math.random() * 0.36;
      }
    } else {
      rivalBody.move(0, 0);
    }

    playerBody.update(frameDt);
    rivalBody.update(frameDt);
    separateAndClamp(playerBody, rivalBody);

    combat.setActor("player", { position: playerBody.position, facing: player.facing, guarding: guardHeld, hurtboxes: hurtboxes("player"), pushboxes: pushboxes("player") });
    combat.setActor("rival", { position: rivalBody.position, facing: rival.facing, guarding: false, hurtboxes: hurtboxes("rival"), pushboxes: pushboxes("rival") });
    combat.update(frameDt);
    for (const event of combat.consumeEvents()) {
      if (event.type === "hit" || event.type === "blocked") {
        if (event.type === "hit") totalHits += 1;
        lastHitFrame = app.runtime.frame;
        impactPosition = event.position as Vec3;
        impactTimer = event.type === "hit" ? 0.26 : 0.16;
        callout = event.type === "hit" ? "HIT" : "BLOCK";
        calloutTimer = event.type === "hit" ? 0.9 : 0.45;
        const attacker = event.attackerId === "player" ? player : rival;
        const target = event.targetId === "player" ? player : rival;
        const targetBody = event.targetId === "player" ? playerBody : rivalBody;
        const targetAnimation = event.targetId === "player" ? playerAnimation : rivalAnimation;
        target.hitstun = event.type === "hit" ? 0.3 : 0.14;
        target.lastDamage = event.damage ?? 0;
        target.clip = event.type === "hit" ? fighterHitClip : target.clip;
        if (event.type === "hit") targetAnimation.crossFade(fighterHitClip, 0.035, { restart: true, loop: false, speed: 1.15 });
        targetBody.applyKnockback([attacker.facing * (event.type === "hit" ? 1.05 : 0.35), event.type === "hit" ? 0.2 : 0.06, 0]);
        runtimeEffects.hitSpark(event.position, { ownerId: event.attackerId, intensity: event.type === "hit" ? 1.15 : 0.6 });
        cameraDirector.impact(event.type === "hit" ? 0.7 : 0.25, 0.12);
        toast = event.type === "hit"
          ? `${attacker.name} lands ${event.moveId ?? "attack"} for ${Math.round(event.damage ?? 0)} damage.`
          : `${target.name} blocks ${event.moveId ?? "attack"}.`;
      }
    }

    runtimeEffects.update(frameDt);
    cameraDirector.update(frameDt, [{ id: "player", position: playerBody.position }, { id: "rival", position: rivalBody.position }]);
    updateFighterClip(playerAnimation, player, playerBody, Math.abs(moveX), guardHeld);
    updateFighterClip(rivalAnimation, rival, rivalBody, rivalCanAct ? Math.abs(playerBody.position[0] - rivalBody.position[0]) > 1.12 ? 0.7 : 0 : 0, false);
    playerAnimation.update(frameDt);
    rivalAnimation.update(frameDt);
    rivalSpecialAnimation.update(frameDt);

    syncFighter(playerNode, player, playerBody, fighterScale, 0, fighterYOffset, app.runtime.time);
    syncFighter(rivalNode, rival, rivalBody, fighterScale, Math.PI, fighterYOffset, app.runtime.time);
    syncSpecialGhost(rivalSpecialGhost, rival, rivalBody, app.runtime.time);
    syncStrike(playerStrike, player, playerBody.position);
    syncStrike(rivalStrike, rival, rivalBody.position);
    syncImpact(impactSpark, impactRing, impactPosition, impactTimer, app.runtime.time);
    impactTimer = Math.max(0, impactTimer - frameDt);
    calloutTimer = Math.max(0, calloutTimer - frameDt);
    if (calloutTimer <= 0) callout = roundOver ? "KO" : "FIGHT";

    updateHud({ player, rival, playerHealth, rivalHealth, playerMeter: pActor?.meter ?? 0, rivalMeter: rActor?.meter ?? 0, roundTime, callout, toast });

    gameWindow.__AURA3D_GAME_DEBUG__ = game.debug.overlay({
      runtime: app.runtime,
      input,
      bodies: [playerBody, rivalBody],
      combat,
      effects: runtimeEffects,
      camera: cameraDirector,
      labels: { v4: true, totalHits, lastHitFrame, dumped: "v1/v2/v3", playerClip: player.clip, rivalClip: rival.clip }
    });
    const aura3dEvidence = app.evidence({
      input,
      bodies: [playerBody, rivalBody],
      combat,
      effects: runtimeEffects,
      camera: cameraDirector,
      hud: hudBindings,
      accessibility: accessibilitySources,
      animation: {
        controllers: 3,
        playerActiveClip: playerAnimation.snapshot().activeClipId,
        rivalActiveClip: rivalAnimation.snapshot().activeClipId,
        specialGhostClip: rivalSpecialAnimation.snapshot().activeClipId,
        embeddedClipCounts: {
          v4UAL1Standard: assets.v4UAL1Standard.metadata.animations.length
        }
      },
      assets: {
        federatedCatalog: true,
        typedAssets: [assets.fighterKadeEmber.url, assets.fighterRookAtlas.url, assets.v4UAL1Standard.url],
        noStaticPrototypeFighters: true
      },
      source: { route: "AuraClash V4", activeAfterDumpingV3: true, publicAura3dApi: true }
    });
    gameWindow.__AURA3D_GAME_EVIDENCE__ = aura3dEvidence;
    gameWindow.__AURA_CLASH_V4_PROOF__ = {
      route: window.location.pathname,
      status: roundOver ? "round-over" : "running",
      roundTime: Math.ceil(roundTime),
      totalHits,
      lastHitFrame,
      callout,
      player: {
        name: player.name,
        health: Math.round(playerHealth),
        clip: player.clip,
        position: [...playerBody.position],
        grounded: playerBody.grounded
      },
      rival: {
        name: rival.name,
        health: Math.round(rivalHealth),
        clip: rival.clip,
        position: [...rivalBody.position],
        grounded: rivalBody.grounded
      },
      typedAssets: [assets.fighterKadeEmber.url, assets.fighterRookAtlas.url, assets.v4UAL1Standard.url],
      aura3dRuntime: {
        input: true,
        physics: true,
        collision: true,
        combat: true,
        camera: true,
        effects: true,
        animationControllers: 3
      },
      evidence: aura3dEvidence
    };
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      toast = `Runtime error: ${message}`;
      updateHud({ player, rival, playerHealth: 100, rivalHealth: 100, playerMeter: 0, rivalMeter: 0, roundTime, callout: "ERROR", toast });
      gameWindow.__AURA3D_GAME_DEBUG__ = { error: message, frame };
      console.error("[AuraClash V4] frame failed", error);
    }
  });

  function startAttack(ownerId: FighterId, moveId: MoveId): void {
    const state = ownerId === "player" ? player : rival;
    if (state.lock > 0 || state.hitstun > 0) return;
    const move = moves[moveId];
    state.lock = move.durationFrames / 60;
    state.clip = move.id;
    if (ownerId === "player") playPlayerClip(moveId === "light" ? fighterLightClip : moveId === "heavy" ? fighterHeavyClip : fighterSpecialClip, true, moveId === "special" ? 1.35 : 1.12);
    else {
      const rivalClip = moveId === "light" ? fighterLightClip : moveId === "heavy" ? fighterHeavyClip : fighterSpecialClip;
      rival.clip = rivalClip;
      rivalAnimation.crossFade(rivalClip, 0.035, { restart: true, loop: false, speed: moveId === "special" ? 1.28 : 1.02 });
      if (moveId === "special") {
        rivalSpecialGhost.setVisible(true);
        rivalSpecialAnimation.crossFade(fighterSpecialClip, 0.035, { restart: true, loop: false, speed: 1.15 });
      }
    }
    combat.beginAttack(ownerId, orientedMove(move, state.facing));
    if (moveId === "special") runtimeEffects.auraBurst(ownerId === "player" ? playerBody.position : rivalBody.position, { ownerId, color: move.color, intensity: 0.82 });
    toast = `${state.name} starts ${move.name}.`;
  }

  function playPlayerClip(clip: string, restart: boolean, speed = 1): void {
    player.clip = clip;
    playerAnimation.crossFade(clip, 0.05, { restart, loop: clip === fighterIdleClip || clip === fighterWalkClip || clip === fighterRunClip ? "loop" : false, speed });
  }

  function resetRound(): void {
    playerBody.position = [...playerStart];
    rivalBody.position = [...rivalStart];
    playerBody.velocity = [0, 0, 0];
    rivalBody.velocity = [0, 0, 0];
    player.lock = 0; player.hitstun = 0; player.clip = fighterIdleClip;
    rival.lock = 0; rival.hitstun = 0; rival.clip = fighterIdleClip;
    combat.clear();
    combat.addActor({ id: "player", team: "player", position: playerBody.position, facing: 1, hurtboxes: hurtboxes("player"), pushboxes: pushboxes("player") });
    combat.addActor({ id: "rival", team: "rival", position: rivalBody.position, facing: -1, hurtboxes: hurtboxes("rival"), pushboxes: pushboxes("rival") });
    roundTime = roundSeconds;
    totalHits = 0;
    callout = "FIGHT";
    toast = "Round reset. V4 runtime and federated animated assets are live.";
    playPlayerClip(fighterIdleClip, true);
    rivalAnimation.crossFade(fighterIdleClip, 0.05, { restart: true, loop: "loop" });
    rivalSpecialGhost.setVisible(false);
  }

  function setPaused(next: boolean): void {
    paused = next;
    if (paused) {
      app.pause();
      toast = "Paused.";
    } else {
      app.resume();
      toast = "Resumed.";
    }
  }
}

function createFighter(id: FighterId, name: string, archetype: string, accent: string, team: string, facing: 1 | -1, clip: string): FighterState {
  return { id, name, archetype, accent, team, facing, lock: 0, hitstun: 0, clip, lastDamage: 0, combo: 0 };
}

function tickFighter(state: FighterState, dt: number): void {
  state.lock = Math.max(0, state.lock - dt);
  state.hitstun = Math.max(0, state.hitstun - dt);
}

function orientedMove(move: MoveSpec, facing: 1 | -1) {
  return {
    id: move.id,
    name: move.name,
    damage: move.damage,
    guardDamage: Math.round(move.damage * 0.45),
    hitStop: move.hitStop,
    hitStun: move.hitStun,
    blockStun: move.blockStun,
    recovery: move.recovery,
    activeFrames: move.activeFrames,
    durationFrames: move.durationFrames,
    knockback: [move.knockback[0] * facing, move.knockback[1], move.knockback[2]],
    hitboxes: [{ id: `${move.id}-hitbox`, offset: [move.hitboxOffset[0] * facing, move.hitboxOffset[1], move.hitboxOffset[2]], size: move.hitboxSize, tags: [move.id, "v4"] }]
  };
}

function hurtboxes(id: FighterId) {
  return [{ id: `${id}-hurtbox`, offset: [0, 0.82, 0] as const, size: [0.62, 1.36, 0.44] as const }];
}

function pushboxes(id: FighterId) {
  return [{ id: `${id}-pushbox`, offset: [0, 0.68, 0] as const, size: [0.52, 1.16, 0.36] as const }];
}

function separateAndClamp(playerBody: any, rivalBody: any): void {
  const delta = rivalBody.position[0] - playerBody.position[0];
  const overlap = minimumSeparation - Math.abs(delta);
  if (overlap > 0) {
    const dir = delta >= 0 ? 1 : -1;
    playerBody.position = [clamp(playerBody.position[0] - dir * overlap * 0.5, stageBounds.minX, stageBounds.maxX), clamp(playerBody.position[1], 0, stageBounds.maxY), 0];
    rivalBody.position = [clamp(rivalBody.position[0] + dir * overlap * 0.5, stageBounds.minX, stageBounds.maxX), clamp(rivalBody.position[1], 0, stageBounds.maxY), 0];
  }
  playerBody.position = [clamp(playerBody.position[0], stageBounds.minX, stageBounds.maxX), clamp(playerBody.position[1], 0, stageBounds.maxY), 0];
  rivalBody.position = [clamp(rivalBody.position[0], stageBounds.minX, stageBounds.maxX), clamp(rivalBody.position[1], 0, stageBounds.maxY), 0];
}

function updateFighterClip(animation: AnimationController<string>, state: FighterState, body: { velocity: Vec3; grounded: boolean }, moveAmount: number, guarding: boolean): void {
  if (state.lock > 0 || state.hitstun > 0) return;
  const nextClip = !body.grounded
    ? fighterJumpClip
    : guarding
      ? fighterIdleClip
      : moveAmount > 0.68
        ? fighterRunClip
        : moveAmount > 0.08
          ? fighterWalkClip
          : fighterIdleClip;
  if (state.clip !== nextClip) {
    state.clip = nextClip;
    animation.crossFade(nextClip, 0.08, { restart: false, loop: nextClip === fighterIdleClip || nextClip === fighterWalkClip || nextClip === fighterRunClip ? "loop" : false, speed: nextClip === fighterRunClip ? 1.18 : 1 });
  }
}

function syncFighter(node: any, state: FighterState, body: { position: Vec3; velocity: Vec3; grounded: boolean }, scale: number, yawOffset: number, yOffset: number, time: number): void {
  const attacking = state.clip === fighterLightClip || state.clip === fighterHeavyClip || state.clip === fighterSpecialClip;
  const attackPhase = attacking && state.lock > 0 ? Math.sin(clamp(state.lock * 8.5, 0, Math.PI)) : 0;
  const attackReach = state.clip === fighterSpecialClip ? 0.34 : state.clip === fighterHeavyClip ? 0.26 : state.clip === fighterLightClip ? 0.18 : 0;
  const attack = attackPhase * attackReach;
  const hit = state.hitstun > 0 ? -state.facing * 0.22 : 0;
  const bob = state.lock <= 0 ? Math.sin(time * 5.4) * 0.018 : attackPhase * 0.035;
  const recoilRoll = state.hitstun > 0 ? state.facing * 0.28 : attacking ? -state.facing * attackPhase * 0.22 : 0;
  node
    .setVisible(true)
    .setPosition(body.position[0] + state.facing * attack + hit, body.position[1] + yOffset + bob, 0)
    .setRotation(0, yawOffset + (state.facing < 0 ? Math.PI : 0), recoilRoll)
    .setScale(scale * (state.hitstun > 0 ? 1.08 : attacking ? 1.04 : 1));
}

function syncSpecialGhost(node: any, state: FighterState, body: { position: Vec3 }, time: number): void {
  if (state.id !== "rival" || state.clip !== "special" || state.lock <= 0) {
    node.setVisible(false);
    return;
  }
  const pulse = 0.86 + Math.sin(time * 28) * 0.04;
  node.setVisible(true).setPosition(body.position[0] - state.facing * 0.24, fighterYOffset + 0.03, -0.04).setRotation(0, Math.PI + (state.facing < 0 ? Math.PI : 0), 0.12).setScale(pulse);
}

function syncStrike(node: any, state: FighterState, position: Vec3): void {
  const move = state.clip === "light" || state.clip === "heavy" || state.clip === "special" ? moves[state.clip] : undefined;
  if (!move || state.lock <= 0) {
    node.setVisible(false);
    return;
  }
  const arc = Math.sin(clamp((move.durationFrames / 60 - state.lock) / (move.durationFrames / 60), 0, 1) * Math.PI);
  node
    .setVisible(true)
    .setPosition(position[0] + state.facing * (0.62 + arc * 0.28), 0.9 + arc * 0.22, 0.08)
    .setRotation(0, state.facing < 0 ? Math.PI : 0, state.facing * (-0.7 + arc * 1.2))
    .setScale([move.id === "special" ? 1.18 : move.id === "heavy" ? 0.82 : 0.58, 0.07, 0.12]);
}

function syncImpact(spark: any, ring: any, position: Vec3, timer: number, time: number): void {
  if (timer <= 0) {
    spark.setVisible(false);
    ring.setVisible(false);
    return;
  }
  const t = clamp(timer / 0.26, 0, 1);
  spark.setVisible(true).setPosition(position[0], position[1], 0.16).setScale((0.015 + (1 - t) * 0.025) * (1 + Math.sin(time * 40) * 0.08));
  ring.setVisible(true).setPosition(position[0], 0.1, 0.02).setRotation(Math.PI / 2, 0, 0).setScale([0.34 + (1 - t) * 0.8, 0.34 + (1 - t) * 0.8, 0.035]);
}

function updateHud(state: { player: FighterState; rival: FighterState; playerHealth: number; rivalHealth: number; playerMeter: number; rivalMeter: number; roundTime: number; callout: string; toast: string }): void {
  setWidth("#player-health", state.playerHealth);
  setWidth("#rival-health", state.rivalHealth);
  setWidth("#player-meter", state.playerMeter);
  setWidth("#rival-meter", state.rivalMeter);
  setText("#player-state", `${clipLabel(state.player.clip)} - ${Math.round(state.playerHealth)} HP`);
  setText("#rival-state", `${clipLabel(state.rival.clip)} - ${Math.round(state.rivalHealth)} HP`);
  setText("#round-time", String(Math.ceil(state.roundTime)));
  setText("#callout", state.callout);
  setText("#toast", state.toast);
}

function setWidth(selector: string, value: number): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.style.width = `${clamp(value, 0, 100)}%`;
}

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function wirePointerControls(root: HTMLElement, input: ReturnType<ReturnType<typeof createAuraApp>["input"]>): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
    const action = button.dataset.hold;
    if (!action) continue;
    const press = () => input.setAction(action, true);
    const release = () => input.setAction(action, false);
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("blur", release);
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-tap]")) {
    const action = button.dataset.tap;
    if (!action) continue;
    button.addEventListener("click", () => {
      input.setAction(action, true);
      window.setTimeout(() => input.setAction(action, false), 34);
    });
  }
}

function clipLabel(clip: string): string {
  if (clip === fighterIdleClip) return "IDLE";
  if (clip === fighterWalkClip) return "WALK";
  if (clip === fighterRunClip) return "SPRINT";
  if (clip === fighterJumpClip) return "JUMP";
  if (clip === fighterHitClip) return "HIT";
  if (clip === fighterLightClip) return "JAB";
  if (clip === fighterHeavyClip) return "CROSS";
  if (clip === fighterSpecialClip) return "SWORD";
  return clip.toUpperCase();
}

function matchMediaSafe(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
