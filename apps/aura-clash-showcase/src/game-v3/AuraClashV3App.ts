import {
  createAnimationController,
  createAuraApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  camera,
  type AuraNamedAnimationClipDefinition
} from "@aura3d/engine";
import { assets } from "../aura-assets";
import "./playable.css";

type FighterId = "player" | "rival";
type FighterClip = "idle" | "walk" | "jump" | "dash" | "guard" | "light" | "heavy" | "special" | "hit" | "ko";
type MoveId = "light" | "heavy" | "special";
type Vec3 = readonly [number, number, number];

type AuraClashWindow = Window & {
  __AURA3D_GAME_SOURCE__?: unknown;
  __AURA3D_GAME_DEBUG__?: unknown;
  __AURA3D_GAME_EVIDENCE__?: unknown;
};

interface FighterState {
  readonly id: FighterId;
  readonly label: string;
  readonly archetype: string;
  readonly accent: string;
  readonly team: string;
  facing: 1 | -1;
  clip: FighterClip;
  lock: number;
  hitstun: number;
  flash: number;
  combo: number;
  lastDamage: number;
  attackToken: number;
}

interface MoveSpec {
  readonly id: MoveId;
  readonly label: string;
  readonly clip: FighterClip;
  readonly duration: number;
  readonly startup: number;
  readonly active: readonly [number, number];
  readonly damage: number;
  readonly guardDamage: number;
  readonly hitStop: number;
  readonly hitStun: number;
  readonly knockback: Vec3;
  readonly hitboxOffset: Vec3;
  readonly hitboxSize: Vec3;
  readonly lunge: number;
  readonly slashScale: Vec3;
  readonly color: string;
}

const gameWindow = window as AuraClashWindow;
const stageBounds = { minX: -2.08, maxX: 2.08, minY: 0, maxY: 1.32, minZ: -0.08, maxZ: 0.08 };
const spawnPositions: Record<FighterId, Vec3> = {
  player: [-1.32, 0, 0],
  rival: [1.32, 0, 0]
};
const fighterScale = 0.9;
const minimumSeparation = 1.02;
const roundSeconds = 99;

const moves: Record<MoveId, MoveSpec> = {
  light: {
    id: "light",
    label: "Jab Chain",
    clip: "light",
    duration: 0.3,
    startup: 0.07,
    active: [1, 5],
    damage: 8,
    guardDamage: 3,
    hitStop: 0.045,
    hitStun: 12,
    knockback: [0.55, 0.08, 0],
    hitboxOffset: [0.74, 0.86, 0],
    hitboxSize: [1.18, 0.58, 0.72],
    lunge: 0.14,
    slashScale: [0.38, 0.04, 0.08],
    color: "#2fffd2"
  },
  heavy: {
    id: "heavy",
    label: "Meteor Hook",
    clip: "heavy",
    duration: 0.48,
    startup: 0.13,
    active: [1, 7],
    damage: 15,
    guardDamage: 7,
    hitStop: 0.07,
    hitStun: 18,
    knockback: [0.92, 0.16, 0],
    hitboxOffset: [0.92, 0.9, 0],
    hitboxSize: [1.56, 0.76, 0.8],
    lunge: 0.2,
    slashScale: [0.5, 0.05, 0.09],
    color: "#ffe68a"
  },
  special: {
    id: "special",
    label: "Aura Burst",
    clip: "special",
    duration: 0.72,
    startup: 0.18,
    active: [1, 12],
    damage: 24,
    guardDamage: 12,
    hitStop: 0.1,
    hitStun: 28,
    knockback: [1.28, 0.28, 0],
    hitboxOffset: [1.08, 0.82, 0],
    hitboxSize: [2.04, 1.02, 0.92],
    lunge: 0.28,
    slashScale: [0.68, 0.065, 0.12],
    color: "#6affff"
  }
};

const fighterClips: readonly AuraNamedAnimationClipDefinition<FighterClip>[] = [
  clip("idle", 1.15, true),
  clip("walk", 0.78, true),
  clip("jump", 0.64, false),
  clip("dash", 0.22, false),
  clip("guard", 0.75, true),
  attackClip(moves.light),
  attackClip(moves.heavy),
  attackClip(moves.special),
  clip("hit", 0.36, false),
  clip("ko", 1.2, false)
];

export function mountAuraClashV3App(): void {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("AuraClash requires #app.");

  root.innerHTML = `
    <main class="aura-clash-v3" aria-label="Aura Clash V3 playable route">
      <nav class="ac-nav" aria-label="Aura Clash navigation">
        <a class="ac-brand" href="/playable/" aria-label="Aura Clash playable home"><span></span>Aura Clash V3</a>
        <div class="ac-links">
          <a href="/playable/">Playable</a>
          <a href="/evidence/">Evidence</a>
          <a href="/deploy-check/">Deploy check</a>
          <a href="https://github.com/auraoneai/aura3d" rel="noreferrer">GitHub</a>
          <a href="https://www.npmjs.com/package/@aura3d/engine" rel="noreferrer">npm</a>
        </div>
      </nav>

      <section class="ac-hud" aria-live="polite">
        <article class="ac-fighter-card ac-fighter-card--left">
          <p>Player one</p>
          <h1 id="player-name">Sable Iron</h1>
          <span>Fast pressure striker</span>
          <div class="ac-bar ac-bar--health"><i id="player-health"></i></div>
          <div class="ac-bar ac-bar--meter"><i id="player-meter"></i></div>
          <b id="player-state">idle</b>
        </article>
        <article class="ac-round-card">
          <strong id="round-time">99</strong>
          <span>round</span>
        </article>
        <article class="ac-fighter-card ac-fighter-card--right">
          <p>Rival AI</p>
          <h2 id="rival-name">Rook Atlas</h2>
          <span>Heavy grappler</span>
          <div class="ac-bar ac-bar--health"><i id="rival-health"></i></div>
          <div class="ac-bar ac-bar--meter"><i id="rival-meter"></i></div>
          <b id="rival-state">idle</b>
        </article>
      </section>

      <section class="ac-stage-shell" aria-label="Aura3D fighting stage">
        <div id="aura-stage" class="ac-stage"></div>
        <div class="ac-fight-callout" id="fight-callout">FIGHT</div>
        <div class="ac-toast" id="combat-toast">Aura3D runtime mounted: input, kinematic bodies, combat, animation events, effects, camera, evidence.</div>
      </section>

      <section class="ac-controls" aria-label="Controls">
        <button type="button" data-hold="moveLeft">A / Left</button>
        <button type="button" data-hold="moveRight">D / Right</button>
        <button type="button" data-tap="jump">Space Jump</button>
        <button type="button" data-tap="dash">Shift Dash</button>
        <button type="button" data-hold="guard">Q Guard</button>
        <button type="button" data-tap="light">J Light</button>
        <button type="button" data-tap="heavy">K Heavy</button>
        <button type="button" data-tap="special">L Aura Burst</button>
        <button type="button" id="reset-round">Reset</button>
      </section>

      <section class="ac-proof" aria-label="Runtime proof">
        <div><b>1.0.5 API</b><span>AnimationController + events + runtime nodes</span></div>
        <div><b>Typed GLB</b><span>Sable Iron / Rook Atlas / neon arena</span></div>
        <div><b>Gameplay</b><span>bounded 2.5D bodies, hitboxes, hitstun, knockback</span></div>
        <div><b>Evidence</b><span>window.__AURA3D_GAME_EVIDENCE__ updated every frame</span></div>
      </section>
    </main>
  `;

  const player = createFighterState("player", "Sable Iron", "Fast pressure striker", "#2fffd2", "p1", 1);
  const rival = createFighterState("rival", "Rook Atlas", "Heavy grappler", "#ffe68a", "p2", -1);
  const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reducedFlash = reducedMotion || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-contrast: more)").matches);

  const auraMat = material.pbr({ color: "#23ffd0", emissive: "#23ffd0", emissiveIntensity: 0.8, roughness: 0.26 });
  const amberMat = material.pbr({ color: "#ffe68a", emissive: "#ffe68a", emissiveIntensity: 0.72, roughness: 0.3 });
  const impactMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.2, roughness: 0.18 });
  const darkGlass = material.pbr({ color: "#050f0c", roughness: 0.54, metallic: 0.12 });
  const skylineMat = material.pbr({ color: "#172722", emissive: "#10251d", emissiveIntensity: 0.22, roughness: 0.62 });

  const arena = scene()
    .background("#020b07")
    .add(model(assets.auraClashDuelStage, { name: "typed GLB neon city source parked behind playable lane" }).position(0, -1.65, -5.8).scale(0.035))
    .add(primitives.box({ name: "matte skyline wall", material: skylineMat }).position(0, 1.02, -1.15).scale([5.6, 1.22, 0.06]))
    .add(primitives.box({ name: "left skyline tower", material: auraMat }).position(-1.92, 1.16, -1.1).scale([0.42, 1.38, 0.08]))
    .add(primitives.box({ name: "center skyline tower", material: darkGlass }).position(0, 1.34, -1.12).scale([0.74, 1.72, 0.08]))
    .add(primitives.box({ name: "right skyline tower", material: amberMat }).position(1.92, 1.12, -1.1).scale([0.44, 1.28, 0.08]))
    .add(primitives.box({ name: "combat floor slab", material: darkGlass }).position(0, -0.065, 0.02).scale([4.72, 0.08, 0.76]))
    .add(primitives.box({ name: "front neon lane", material: auraMat }).position(0, 0.018, 0.42).scale([4.3, 0.018, 0.016]))
    .add(primitives.box({ name: "rear neon lane", material: auraMat }).position(0, 0.018, -0.38).scale([4.3, 0.018, 0.016]))
    .add(primitives.box({ name: "left grid lane", material: auraMat }).position(-1.6, 0.024, 0.02).scale([0.014, 0.018, 0.78]))
    .add(primitives.box({ name: "mid-left grid lane", material: auraMat }).position(-0.8, 0.024, 0.02).scale([0.014, 0.018, 0.78]))
    .add(primitives.box({ name: "mid-right grid lane", material: auraMat }).position(0.8, 0.024, 0.02).scale([0.014, 0.018, 0.78]))
    .add(primitives.box({ name: "right grid lane", material: auraMat }).position(1.6, 0.024, 0.02).scale([0.014, 0.018, 0.78]))
    .add(primitives.box({ name: "left hard camera bound", material: amberMat }).position(stageBounds.minX - 0.04, 0.56, 0.48).scale([0.026, 1.02, 0.045]))
    .add(primitives.box({ name: "right hard camera bound", material: amberMat }).position(stageBounds.maxX + 0.04, 0.56, 0.48).scale([0.026, 1.02, 0.045]))
    .add(primitives.box({ name: "center line", material: auraMat }).position(0, 0.035, 0.02).scale([0.035, 0.06, 0.88]))
    .add(primitives.torus({ name: "player ground aura", material: auraMat }).position(spawnPositions.player[0], 0.035, 0).rotate(Math.PI / 2, 0, 0).scale([0.32, 0.32, 0.025]).runtime(game.runtimeNode("player-ground-aura", { tags: ["runtime-vfx", "aura-ring"] })))
    .add(primitives.torus({ name: "rival ground aura", material: amberMat }).position(spawnPositions.rival[0], 0.035, 0).rotate(Math.PI / 2, 0, 0).scale([0.32, 0.32, 0.025]).runtime(game.runtimeNode("rival-ground-aura", { tags: ["runtime-vfx", "aura-ring"] })))
    .add(model(assets.fighterSableIron, { name: "Sable Iron typed GLB fighter" }).position(spawnPositions.player[0], 0, 0).scale(fighterScale).runtime(game.runtimeNode("player", { tags: ["fighter", "typed-glb", "pose-fallback-animation"] })))
    .add(model(assets.fighterRookAtlas, { name: "Rook Atlas typed GLB fighter" }).position(spawnPositions.rival[0], 0, 0).rotate(0, Math.PI, 0).scale(fighterScale).runtime(game.runtimeNode("rival", { tags: ["fighter", "typed-glb", "pose-fallback-animation"] })))
    .add(primitives.box({ name: "player slash blade", material: auraMat }).position(-10, 0, 0).scale([0.1, 0.1, 0.1]).runtime(game.runtimeNode("player-slash", { tags: ["runtime-vfx", "slash-trail", "animation-event"] })))
    .add(primitives.box({ name: "rival slash blade", material: amberMat }).position(-10, 0, 0).scale([0.1, 0.1, 0.1]).runtime(game.runtimeNode("rival-slash", { tags: ["runtime-vfx", "slash-trail", "animation-event"] })))
    .add(primitives.sphere({ name: "impact flash", material: impactMat }).position(-10, 0, 0).scale(0.05).runtime(game.runtimeNode("impact-flash", { tags: ["runtime-vfx", "hit-impact", "animation-event"] })))
    .add(primitives.torus({ name: "special shockwave", material: auraMat }).position(-10, 0, 0).rotate(Math.PI / 2, 0, 0).scale([0.05, 0.05, 0.02]).runtime(game.runtimeNode("shockwave", { tags: ["runtime-vfx", "special-impact", "animation-event"] })))
    .add(effects.bloom({ intensity: 0.42 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(lights.directional({ name: "mint rim light", color: "#7dffd8", intensity: 0.8 }).position(-1.5, 4.2, 3.4))
    .add(lights.directional({ name: "gold rim light", color: "#ffe68a", intensity: 0.55 }).position(2.0, 3.2, 2.4))
    .camera(camera.perspective({ position: [0, 1.22, 4.72], target: [0, 0.72, 0.02], fov: 35 }));

  const app = createAuraApp("#aura-stage", {
    diagnostics: { overlay: false, performancePanel: false },
    scene: arena
  });

  const playerNode = app.nodes.require("player");
  const rivalNode = app.nodes.require("rival");
  const playerSlash = app.nodes.require("player-slash");
  const rivalSlash = app.nodes.require("rival-slash");
  const impactFlash = app.nodes.require("impact-flash");
  const shockwave = app.nodes.require("shockwave");
  const playerAura = app.nodes.require("player-ground-aura");
  const rivalAura = app.nodes.require("rival-ground-aura");
  playerSlash.setVisible(false);
  rivalSlash.setVisible(false);
  impactFlash.setVisible(false);
  shockwave.setVisible(false);

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
    axes: {
      moveX: { negative: "moveLeft", positive: "moveRight", gamepadAxis: 0 }
    },
    bufferMs: 150,
    gamepad: true
  });

  wirePointerControls(root, input);

  const playerBody = game.kinematicBody({
    id: "player",
    position: spawnPositions.player,
    bounds: stageBounds,
    groundY: 0,
    maxSpeed: 2.15,
    jumpVelocity: 4.25,
    gravity: -19,
    friction: 18,
    coyoteMs: 85,
    jumpBufferMs: 110
  });
  const rivalBody = game.kinematicBody({
    id: "rival",
    position: spawnPositions.rival,
    bounds: stageBounds,
    groundY: 0,
    maxSpeed: 1.72,
    jumpVelocity: 3.9,
    gravity: -19,
    friction: 18
  });

  const combat = game.combatWorld();
  const runtimeEffects = game.effects({ poolSize: 80, reducedMotion, reducedFlash });
  const cameraDirector = game.cameraDirector({ stageBounds, distance: 4.72, baseFov: 35, minZoom: 0.98, maxZoom: 1.04, reducedMotion });
  const playerAnimation = createFighterAnimationController("player-animation", assets.fighterSableIron);
  const rivalAnimation = createFighterAnimationController("rival-animation", assets.fighterRookAtlas);

  playerAnimation.bindRuntimeNode(playerNode, { id: "player-animation-binding", defaultClipId: "idle", fallbackClipId: "idle" });
  rivalAnimation.bindRuntimeNode(rivalNode, { id: "rival-animation-binding", defaultClipId: "idle", fallbackClipId: "idle" });
  playerAnimation.play("idle", { loop: "loop", layer: "base" });
  rivalAnimation.play("idle", { loop: "loop", layer: "base" });

  playerAnimation.onEvent((invocation) => handleAnimationEvent("player", invocation.event.name, invocation.event.payload));
  rivalAnimation.onEvent((invocation) => handleAnimationEvent("rival", invocation.event.name, invocation.event.payload));

  combat.addActor({
    id: "player",
    team: player.team,
    position: playerBody.position,
    facing: 1,
    hurtboxes: [{ id: "player-body", offset: [0, 0.88, 0], size: [0.62, 1.48, 0.45] }],
    pushboxes: [{ id: "player-push", offset: [0, 0.72, 0], size: [0.55, 1.28, 0.36] }]
  });
  combat.addActor({
    id: "rival",
    team: rival.team,
    position: rivalBody.position,
    facing: -1,
    hurtboxes: [{ id: "rival-body", offset: [0, 0.88, 0], size: [0.66, 1.5, 0.46] }],
    pushboxes: [{ id: "rival-push", offset: [0, 0.72, 0], size: [0.58, 1.28, 0.36] }]
  });

  const uiHandles = createUiHandles();
  const launchStartedAt = performance.now();
  let roundTime = roundSeconds;
  let paused = false;
  let aiCooldown = 0.72;
  let impactTimer = 0;
  let impactPosition: Vec3 = [0, 0.9, 0];
  let shockwaveTimer = 0;
  let lastToast = "AuraClash V3 mounted on Aura3D 1.0.5 runtime.";
  let calloutText = "FIGHT";
  let calloutTimer = 0;
  let lastHitFrame = 0;
  let totalHits = 0;
  let attackEvents = 0;

  root.querySelector<HTMLButtonElement>("#reset-round")?.addEventListener("click", () => resetRound());

  gameWindow.__AURA3D_GAME_SOURCE__ = {
    route: window.location.pathname,
    showcase: "AuraClash V3",
    previousPrototypeStatus: "dumped",
    publicEngineApi: true,
    importsThree: false,
    typedAssetPattern: "src/aura-assets.ts",
    typedAssets: ["fighterSableIron", "fighterRookAtlas", "auraClashDuelStage"],
    currentGlbAnimationClips: {
      fighterSableIron: assets.fighterSableIron.metadata.animations,
      fighterRookAtlas: assets.fighterRookAtlas.metadata.animations
    },
    animationStrategy: "Aura3D 1.0.5 AnimationController clip events with pose-baked fallback because current fighter GLBs expose no embedded skeletal clips."
  };

  app.onFrame(({ dt }) => {
    input.update(dt);
    if (input.pressed("pause")) setPaused(!paused);
    if (paused) return;

    const frameDt = Math.min(dt, 1 / 30);
    roundTime = Math.max(0, roundTime - frameDt);
    updateTimers(player, frameDt);
    updateTimers(rival, frameDt);

    const distance = rivalBody.position[0] - playerBody.position[0];
    player.facing = distance >= 0 ? 1 : -1;
    rival.facing = distance >= 0 ? -1 : 1;

    const currentCombat = combat.snapshot();
    const currentPlayerActor = currentCombat.actors.find((actor) => actor.id === "player");
    const currentRivalActor = currentCombat.actors.find((actor) => actor.id === "rival");
    const playerKo = (currentPlayerActor?.health ?? 100) <= 0;
    const rivalKo = (currentRivalActor?.health ?? 100) <= 0;
    const roundOver = playerKo || rivalKo || roundTime <= 0;
    if (roundOver) {
      if (playerKo) playFighterClip(playerAnimation, player, "ko", false);
      if (rivalKo) playFighterClip(rivalAnimation, rival, "ko", false);
      lastToast = playerKo && rivalKo
        ? "Double KO. Reset the round."
        : playerKo
          ? "Rook Atlas wins. Reset the round."
          : rivalKo
            ? "Sable Iron wins. Reset the round."
            : "Time over. Reset the round.";
    }

    const playerCanAct = !roundOver && player.hitstun <= 0 && player.lock <= 0;
    const moveAxis = playerCanAct ? input.axis("moveX") : 0;
    const guardHeld = input.held("guard") && player.hitstun <= 0;

    if (playerCanAct) {
      playerBody.move(moveAxis, guardHeld ? 1.05 : 2.35);
      if (input.pressed("jump") && playerBody.grounded) {
        playerBody.jump();
        playFighterClip(playerAnimation, player, "jump", true);
      }
      if (input.pressed("dash")) {
        playerBody.dash([player.facing, 0, 0], 5.6);
        playFighterClip(playerAnimation, player, "dash", true);
        runtimeEffects.dashTrail(playerBody.position, { ownerId: "player", color: player.accent, intensity: 0.65 });
        lastToast = "Sable Iron dashes inside the bounded combat lane.";
      }
      if (input.pressed("light")) startAttack("player", "light");
      if (input.pressed("heavy")) startAttack("player", "heavy");
      if (input.pressed("special")) startAttack("player", "special");
    } else {
      playerBody.move(0, 0);
    }

    aiCooldown = Math.max(0, aiCooldown - frameDt);
    const rivalCanAct = !roundOver && rival.hitstun <= 0 && rival.lock <= 0;
    if (rivalCanAct) {
      const aiDistance = playerBody.position[0] - rivalBody.position[0];
      const inAttackRange = Math.abs(aiDistance) < 1.08;
      const aiAxis = inAttackRange ? 0 : Math.sign(aiDistance) * 0.72;
      rivalBody.move(aiAxis, 1.65);
      if (aiCooldown <= 0 && inAttackRange) {
        startAttack("rival", Math.random() > 0.72 ? "heavy" : "light");
        aiCooldown = 0.74 + Math.random() * 0.38;
      }
    } else {
      rivalBody.move(0, 0);
    }

    playerBody.update(frameDt);
    rivalBody.update(frameDt);
    constrainFighters(playerBody, rivalBody);

    combat.setActor("player", {
      position: playerBody.position,
      facing: player.facing,
      guarding: guardHeld,
      hurtboxes: [{ id: "player-body", offset: [0, 0.88, 0], size: [0.62, 1.48, 0.45] }],
      pushboxes: [{ id: "player-push", offset: [0, 0.72, 0], size: [0.55, 1.28, 0.36] }]
    });
    combat.setActor("rival", {
      position: rivalBody.position,
      facing: rival.facing,
      guarding: rivalCanAct && Math.abs(playerBody.position[0] - rivalBody.position[0]) < 0.82 && aiCooldown > 0.55,
      hurtboxes: [{ id: "rival-body", offset: [0, 0.88, 0], size: [0.66, 1.5, 0.46] }],
      pushboxes: [{ id: "rival-push", offset: [0, 0.72, 0], size: [0.58, 1.28, 0.36] }]
    });

    const combatSnapshot = combat.update(frameDt);
    const combatEvents = combat.consumeEvents();
    for (const event of combatEvents) {
      if (event.type === "hit" || event.type === "blocked") {
        totalHits += event.type === "hit" ? 1 : 0;
        lastHitFrame = app.runtime.frame;
        impactPosition = event.position as Vec3;
        impactTimer = event.type === "hit" ? 0.22 : 0.13;
        shockwaveTimer = event.moveId === "special" ? 0.42 : 0;
        calloutText = event.type === "hit" ? "HIT" : "BLOCK";
        calloutTimer = event.type === "hit" ? 0.42 : 0.28;
        cameraDirector.impact(event.type === "hit" ? 0.85 : 0.38, 0.15);
        if (event.type === "hit") runtimeEffects.hitSpark(event.position, { ownerId: event.attackerId, intensity: 1.2 });
        else runtimeEffects.blockSpark(event.position, { ownerId: event.attackerId, intensity: 0.72 });
        const target = event.targetId === "player" ? player : event.targetId === "rival" ? rival : undefined;
        const targetBody = event.targetId === "player" ? playerBody : event.targetId === "rival" ? rivalBody : undefined;
        const targetAnimation = event.targetId === "player" ? playerAnimation : event.targetId === "rival" ? rivalAnimation : undefined;
        const attacker = event.attackerId === "player" ? player : rival;
        if (target && targetBody && targetAnimation) {
          target.hitstun = event.type === "hit" ? 0.34 : 0.16;
          target.flash = event.type === "hit" ? 0.26 : 0.12;
          target.lastDamage = event.damage ?? 0;
          targetBody.applyKnockback([attacker.facing * (event.type === "hit" ? 1.35 : 0.42), event.type === "hit" ? 0.45 : 0.1, 0]);
          playFighterClip(targetAnimation, target, "hit", true);
        }
        lastToast = event.type === "hit"
          ? `${attacker.label} lands ${event.moveId ?? "attack"} for ${Math.round(event.damage ?? 0)} damage.`
          : `${target?.label ?? "Defender"} blocks ${event.moveId ?? "attack"}.`;
      }
      if (event.type === "whiff") {
        lastToast = `${event.attackerId === "player" ? player.label : rival.label} whiffs ${event.moveId ?? "attack"}.`;
      }
    }

    runtimeEffects.update(frameDt);
    cameraDirector.update(frameDt, [
      { id: "player", position: playerBody.position },
      { id: "rival", position: rivalBody.position }
    ]);

    const playerActor = combat.snapshot().actors.find((actor) => actor.id === "player");
    const rivalActor = combat.snapshot().actors.find((actor) => actor.id === "rival");
    updateLocomotionClip(playerAnimation, player, playerBody, moveAxis, guardHeld);
    updateLocomotionClip(rivalAnimation, rival, rivalBody, rivalCanAct ? Math.sign(playerBody.position[0] - rivalBody.position[0]) : 0, false);
    playerAnimation.update(frameDt);
    rivalAnimation.update(frameDt);

    syncFighterNode(playerNode, player, playerBody, playerActor?.health ?? 100, app.runtime.time);
    syncFighterNode(rivalNode, rival, rivalBody, rivalActor?.health ?? 100, app.runtime.time);
    syncAuraRing(playerAura, playerBody.position, player.accent, player.lock, app.runtime.time);
    syncAuraRing(rivalAura, rivalBody.position, rival.accent, rival.lock, app.runtime.time);
    syncSlashNode(playerSlash, player, playerBody.position, app.runtime.time);
    syncSlashNode(rivalSlash, rival, rivalBody.position, app.runtime.time);
    syncImpactNodes(impactFlash, shockwave, impactPosition, impactTimer, shockwaveTimer, app.runtime.time);
    impactTimer = Math.max(0, impactTimer - frameDt);
    shockwaveTimer = Math.max(0, shockwaveTimer - frameDt);
    calloutTimer = Math.max(0, calloutTimer - frameDt);
    if (calloutTimer <= 0 && calloutText !== "FIGHT") calloutText = "FIGHT";

    updateHud(uiHandles, {
      player,
      rival,
      playerHealth: playerActor?.health ?? 100,
      rivalHealth: rivalActor?.health ?? 100,
      playerMeter: playerActor?.meter ?? 0,
      rivalMeter: rivalActor?.meter ?? 0,
      roundTime,
      toast: lastToast,
      callout: calloutText
    });

    gameWindow.__AURA3D_GAME_DEBUG__ = game.debug.overlay({
      runtime: app.runtime,
      input,
      bodies: [playerBody, rivalBody],
      combat,
      effects: runtimeEffects,
      camera: cameraDirector,
      labels: {
        v3: true,
        totalHits,
        lastHitFrame,
        playerClip: player.clip,
        rivalClip: rival.clip,
        hardBounds: `${stageBounds.minX}..${stageBounds.maxX}`,
        oldPrototype: "dumped"
      }
    });

    gameWindow.__AURA3D_GAME_EVIDENCE__ = app.evidence({
      input,
      bodies: [playerBody, rivalBody],
      combat,
      effects: runtimeEffects,
      camera: cameraDirector,
      animation: {
        controllers: 2,
        activeClips: [playerAnimation.snapshot().activeClipId, rivalAnimation.snapshot().activeClipId],
        attackEvents,
        poseBakedFallback: true,
        embeddedGlbClipCounts: {
          fighterSableIron: assets.fighterSableIron.metadata.animations.length,
          fighterRookAtlas: assets.fighterRookAtlas.metadata.animations.length
        },
        visibleRuntimeEffects: [playerSlash.snapshot(), rivalSlash.snapshot(), impactFlash.snapshot(), shockwave.snapshot()].filter((node: any) => node.visible).length
      },
      assets: {
        typedAssets: [assets.fighterSableIron.url, assets.fighterRookAtlas.url, assets.auraClashDuelStage.url],
        noStringAssetIds: true,
        noInventedAssets: true
      },
      stage: {
        id: "aura-clash-v3-neon-duel-lane",
        bounds: stageBounds,
        safeZones: true,
        noBlockingGeometry: true
      },
      source: {
        route: "AuraClash V3 playable",
        publicAura3dApi: true,
        runtimeMountedAfter105: true,
        oldCodeRemoved: true,
        launchAgeMs: Math.round(performance.now() - launchStartedAt)
      }
    });
  });

  function handleAnimationEvent(ownerId: FighterId, eventName: string, payload: unknown): void {
    const state = ownerId === "player" ? player : rival;
    const body = ownerId === "player" ? playerBody : rivalBody;
    const moveId = parseMoveId(payload);
    if (eventName === "vfx.slash" && moveId) {
      runtimeEffects.slashTrail(body.position, { ownerId, color: moves[moveId].color, intensity: moveId === "special" ? 1.05 : 0.75 });
      if (moveId === "special") runtimeEffects.auraBurst(body.position, { ownerId, color: moves[moveId].color, intensity: 0.85 });
    }
    if (eventName === "hitbox.open" && moveId && state.hitstun <= 0) {
      attackEvents += 1;
      combat.beginAttack(ownerId, orientedMove(moveId, state.facing));
    }
  }

  function startAttack(ownerId: FighterId, moveId: MoveId): void {
    const state = ownerId === "player" ? player : rival;
    const body = ownerId === "player" ? playerBody : rivalBody;
    const controller = ownerId === "player" ? playerAnimation : rivalAnimation;
    const move = moves[moveId];
    if (state.lock > 0 || state.hitstun > 0) return;
    state.lock = move.duration;
    state.attackToken += 1;
    state.clip = move.clip;
    body.dash([state.facing, 0, 0], (move.lunge * 0.42) / Math.max(move.startup, 0.04));
    controller.crossFade(move.clip, 0.035, {
      restart: true,
      restartFromFrameZero: true,
      loop: false,
      layer: "upper-body",
      attack: true,
      metadata: { moveId, attackToken: state.attackToken }
    });
    lastToast = `${state.label} starts ${move.label}.`;
  }

  function orientedMove(moveId: MoveId, facing: 1 | -1) {
    const move = moves[moveId];
    return {
      id: move.id,
      name: move.label,
      damage: move.damage,
      guardDamage: move.guardDamage,
      hitStop: move.hitStop,
      hitStun: move.hitStun,
      blockStun: Math.ceil(move.hitStun * 0.45),
      recovery: Math.ceil(move.duration * 60),
      activeFrames: move.active,
      durationFrames: Math.ceil(move.duration * 60),
      knockback: [move.knockback[0] * facing, move.knockback[1], move.knockback[2]],
      hitboxes: [
        {
          id: `${move.id}-event-hitbox`,
          offset: [move.hitboxOffset[0] * facing, move.hitboxOffset[1], move.hitboxOffset[2]],
          size: move.hitboxSize,
          tags: ["animation-event", move.id]
        }
      ]
    };
  }

  function resetRound(): void {
    playerBody.position = spawnPositions.player as [number, number, number];
    rivalBody.position = spawnPositions.rival as [number, number, number];
    playerBody.velocity = [0, 0, 0];
    rivalBody.velocity = [0, 0, 0];
    combat.clear();
    combat.addActor({
      id: "player",
      team: player.team,
      position: playerBody.position,
      facing: 1,
      hurtboxes: [{ id: "player-body", offset: [0, 0.88, 0], size: [0.62, 1.48, 0.45] }],
      pushboxes: [{ id: "player-push", offset: [0, 0.72, 0], size: [0.55, 1.28, 0.36] }]
    });
    combat.addActor({
      id: "rival",
      team: rival.team,
      position: rivalBody.position,
      facing: -1,
      hurtboxes: [{ id: "rival-body", offset: [0, 0.88, 0], size: [0.66, 1.5, 0.46] }],
      pushboxes: [{ id: "rival-push", offset: [0, 0.72, 0], size: [0.58, 1.28, 0.36] }]
    });
    player.lock = 0;
    player.hitstun = 0;
    player.combo = 0;
    rival.lock = 0;
    rival.hitstun = 0;
    rival.combo = 0;
    roundTime = roundSeconds;
    totalHits = 0;
    attackEvents = 0;
    calloutText = "FIGHT";
    calloutTimer = 0;
    playFighterClip(playerAnimation, player, "idle", true);
    playFighterClip(rivalAnimation, rival, "idle", true);
    lastToast = "Round reset. Bounds, animation controllers, combat world, and evidence are live.";
  }

  function setPaused(next: boolean): void {
    paused = next;
    if (paused) {
      app.pause();
      lastToast = "Paused.";
    } else {
      app.resume();
      lastToast = "Resumed.";
    }
  }
}

function clip(id: FighterClip, duration: number, loop: boolean): AuraNamedAnimationClipDefinition<FighterClip> {
  return {
    id,
    duration,
    frameRate: 60,
    loop,
    layer: id === "light" || id === "heavy" || id === "special" ? "upper-body" : "base",
    restartFromFrameZero: id !== "idle" && id !== "walk" && id !== "guard",
    suppressRootMotion: true,
    tracks: [],
    metadata: {
      source: "aura-clash-v3-pose-baked-fallback",
      poseBakedFallback: true,
      currentFighterGlbsHaveEmbeddedAnimations: false
    }
  };
}

function attackClip(move: MoveSpec): AuraNamedAnimationClipDefinition<FighterClip> {
  return {
    ...clip(move.clip, move.duration, false),
    attack: true,
    layer: "upper-body",
    layerMetadata: {
      id: "upper-body",
      role: "attack",
      bodyMask: "upper-body",
      restartFromFrameZero: true
    },
    events: [
      { name: "vfx.slash", type: "vfx", time: Math.max(0.02, move.startup * 0.55), once: true, payload: { moveId: move.id } },
      { name: "hitbox.open", type: "hitbox", time: move.startup, once: true, payload: { moveId: move.id } },
      { name: "camera.impulse", type: "camera", time: move.startup + 0.02, once: true, payload: { moveId: move.id } }
    ]
  };
}

function createFighterAnimationController(id: string, asset: typeof assets.fighterSableIron | typeof assets.fighterRookAtlas) {
  return createAnimationController<FighterClip>({
    id,
    clipRegistry: asset,
    clips: fighterClips,
    requiredClips: ["idle", "walk", "jump", "dash", "guard", "light", "heavy", "special", "hit", "ko"],
    suppressRootMotion: true,
    layers: [
      { id: "base", role: "locomotion", bodyMask: "full-body" },
      { id: "upper-body", role: "attack", bodyMask: "upper-body", restartFromFrameZero: true }
    ]
  });
}

function createFighterState(id: FighterId, label: string, archetype: string, accent: string, team: string, facing: 1 | -1): FighterState {
  return {
    id,
    label,
    archetype,
    accent,
    team,
    facing,
    clip: "idle",
    lock: 0,
    hitstun: 0,
    flash: 0,
    combo: 0,
    lastDamage: 0,
    attackToken: 0
  };
}

function updateTimers(state: FighterState, dt: number): void {
  state.lock = Math.max(0, state.lock - dt);
  state.hitstun = Math.max(0, state.hitstun - dt);
  state.flash = Math.max(0, state.flash - dt);
}

function updateLocomotionClip(controller: ReturnType<typeof createFighterAnimationController>, state: FighterState, body: { grounded: boolean; velocity: Vec3 }, moveAxis: number, guarding: boolean): void {
  if (state.hitstun > 0 || state.lock > 0) return;
  const nextClip: FighterClip = guarding ? "guard" : !body.grounded ? "jump" : Math.abs(moveAxis) > 0.06 || Math.abs(body.velocity[0]) > 0.35 ? "walk" : "idle";
  playFighterClip(controller, state, nextClip, false);
}

function playFighterClip(controller: ReturnType<typeof createFighterAnimationController>, state: FighterState, clipId: FighterClip, restart: boolean): void {
  if (state.clip === clipId && !restart) return;
  state.clip = clipId;
  const loop = clipId === "idle" || clipId === "walk" || clipId === "guard" ? "loop" : false;
  controller.crossFade(clipId, restart ? 0.025 : 0.08, {
    restart,
    restartFromFrameZero: restart,
    loop,
    layer: clipId === "light" || clipId === "heavy" || clipId === "special" ? "upper-body" : "base",
    attack: clipId === "light" || clipId === "heavy" || clipId === "special"
  });
}

function constrainFighters(playerBody: any, rivalBody: any): void {
  const delta = rivalBody.position[0] - playerBody.position[0];
  const overlap = minimumSeparation - Math.abs(delta);
  if (overlap > 0) {
    const dir = delta >= 0 ? 1 : -1;
    playerBody.position = [clamp(playerBody.position[0] - dir * overlap * 0.5, stageBounds.minX, stageBounds.maxX), playerBody.position[1], 0];
    rivalBody.position = [clamp(rivalBody.position[0] + dir * overlap * 0.5, stageBounds.minX, stageBounds.maxX), rivalBody.position[1], 0];
  }
  playerBody.position = [clamp(playerBody.position[0], stageBounds.minX, stageBounds.maxX), clamp(playerBody.position[1], 0, stageBounds.maxY), 0];
  rivalBody.position = [clamp(rivalBody.position[0], stageBounds.minX, stageBounds.maxX), clamp(rivalBody.position[1], 0, stageBounds.maxY), 0];
}

function syncFighterNode(node: any, state: FighterState, body: { position: Vec3; velocity: Vec3; grounded: boolean }, health: number, time: number): void {
  const attackMove = state.clip === "light" || state.clip === "heavy" || state.clip === "special" ? moves[state.clip] : undefined;
  const lockProgress = attackMove ? 1 - clamp(state.lock / attackMove.duration, 0, 1) : 0;
  const attackLunge = attackMove ? Math.sin(lockProgress * Math.PI) * attackMove.lunge * 0.42 : 0;
  const recoil = state.hitstun > 0 ? -state.facing * (0.2 + state.hitstun * 0.22) : 0;
  const bob = state.clip === "walk" ? Math.sin(time * 13) * 0.02 : state.clip === "idle" ? Math.sin(time * 4) * 0.01 : 0;
  const healthScale = health <= 0 ? 0.92 : 1;
  const x = clamp(body.position[0] + state.facing * attackLunge + recoil, stageBounds.minX - 0.06, stageBounds.maxX + 0.06);
  const y = clamp(body.position[1] + bob, 0, stageBounds.maxY);
  const yawOffset = state.id === "player" ? Math.PI / 2 : Math.PI;
  const rotY = (state.facing < 0 ? Math.PI : 0) + yawOffset;
  const rotZ = state.hitstun > 0 ? state.facing * 0.14 : attackMove ? -state.facing * Math.sin(lockProgress * Math.PI) * 0.14 : 0;
  node
    .setPosition(x, y, 0)
    .setRotation(0, rotY, rotZ)
    .setScale(fighterScale * healthScale * (state.flash > 0 ? 1.025 : 1));
}

function syncAuraRing(node: any, position: Vec3, _color: string, lock: number, time: number): void {
  const pulse = 0.29 + Math.sin(time * 7) * 0.018 + (lock > 0 ? 0.08 : 0);
  node
    .setVisible(true)
    .setPosition(position[0], 0.035, 0)
    .setRotation(Math.PI / 2, 0, 0)
    .setScale([pulse, pulse, 0.022]);
}

function syncSlashNode(node: any, state: FighterState, position: Vec3, time: number): void {
  const move = state.clip === "light" || state.clip === "heavy" || state.clip === "special" ? moves[state.clip] : undefined;
  if (!move || state.lock <= 0) {
    node.setVisible(false);
    return;
  }
  const progress = 1 - clamp(state.lock / move.duration, 0, 1);
  const visible = progress > 0.08 && progress < 0.82;
  node.setVisible(visible);
  if (!visible) return;
  const arc = Math.sin(progress * Math.PI);
  node
    .setPosition(position[0] + state.facing * (0.56 + move.lunge * 0.55), 0.9 + arc * 0.16, 0.08)
    .setRotation(0, state.facing < 0 ? Math.PI : 0, state.facing * (-0.96 + progress * 2.05 + Math.sin(time * 22) * 0.04))
    .setScale([move.slashScale[0] * (0.68 + arc * 0.22), move.slashScale[1], move.slashScale[2]]);
}

function syncImpactNodes(impactNode: any, waveNode: any, position: Vec3, impactTimer: number, shockwaveTimer: number, time: number): void {
  if (impactTimer > 0) {
    const t = clamp(impactTimer / 0.22, 0, 1);
    const scale = 0.08 + (1 - t) * 0.24;
    impactNode.setVisible(true).setPosition(position[0], position[1], 0.08).setScale(scale * (1 + Math.sin(time * 48) * 0.08));
  } else {
    impactNode.setVisible(false);
  }
  if (shockwaveTimer > 0) {
    const scale = 0.24 + (1 - shockwaveTimer / 0.42) * 0.92;
    waveNode.setVisible(true).setPosition(position[0], 0.08, 0).setRotation(Math.PI / 2, 0, 0).setScale([scale, scale, 0.03]);
  } else {
    waveNode.setVisible(false);
  }
}

function parseMoveId(payload: unknown): MoveId | undefined {
  if (!payload || typeof payload !== "object" || !("moveId" in payload)) return undefined;
  const value = String((payload as { moveId?: unknown }).moveId);
  return value === "light" || value === "heavy" || value === "special" ? value : undefined;
}

function createUiHandles() {
  return {
    playerHealth: document.querySelector<HTMLElement>("#player-health"),
    rivalHealth: document.querySelector<HTMLElement>("#rival-health"),
    playerMeter: document.querySelector<HTMLElement>("#player-meter"),
    rivalMeter: document.querySelector<HTMLElement>("#rival-meter"),
    playerState: document.querySelector<HTMLElement>("#player-state"),
    rivalState: document.querySelector<HTMLElement>("#rival-state"),
    roundTime: document.querySelector<HTMLElement>("#round-time"),
    toast: document.querySelector<HTMLElement>("#combat-toast"),
    callout: document.querySelector<HTMLElement>("#fight-callout")
  };
}

function updateHud(handles: ReturnType<typeof createUiHandles>, state: { player: FighterState; rival: FighterState; playerHealth: number; rivalHealth: number; playerMeter: number; rivalMeter: number; roundTime: number; toast: string; callout?: string }): void {
  setBar(handles.playerHealth, state.playerHealth);
  setBar(handles.rivalHealth, state.rivalHealth);
  setBar(handles.playerMeter, state.playerMeter);
  setBar(handles.rivalMeter, state.rivalMeter);
  setText(handles.playerState, `${state.player.clip.toUpperCase()} - ${Math.round(state.playerHealth)} HP`);
  setText(handles.rivalState, `${state.rival.clip.toUpperCase()} - ${Math.round(state.rivalHealth)} HP`);
  setText(handles.roundTime, String(Math.ceil(state.roundTime)));
  setText(handles.toast, state.toast);
  if (handles.callout) {
    handles.callout.textContent = state.callout ?? (state.playerHealth <= 0 || state.rivalHealth <= 0
      ? "KO"
      : state.toast.includes("blocks")
        ? "BLOCK"
        : state.toast.includes("lands")
          ? "HIT"
          : "FIGHT");
  }
}

function setBar(element: HTMLElement | null, value: number): void {
  if (!element) return;
  element.style.width = `${clamp(value, 0, 100)}%`;
}

function setText(element: HTMLElement | null, text: string): void {
  if (element) element.textContent = text;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
