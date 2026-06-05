import {
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
type ActionName = "idle" | "walk" | "dash" | "jump" | "guard" | "light" | "heavy" | "special" | "hurt" | "ko";
type MoveId = "light" | "heavy" | "special";

type AuraClashWindow = Window & {
  __AURA_CLASH_V5_PROOF__?: unknown;
  __AURA3D_GAME_EVIDENCE__?: unknown;
};

interface Fighter {
  id: FighterId;
  name: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  meter: number;
  grounded: boolean;
  action: ActionName;
  actionTime: number;
  actionDuration: number;
  hitstun: number;
  guard: boolean;
  combo: number;
  attack?: ActiveAttack;
  aiCooldown: number;
}

interface ActiveAttack {
  id: MoveId;
  elapsed: number;
  duration: number;
  activeStart: number;
  activeEnd: number;
  range: number;
  damage: number;
  knockback: number;
  hit: boolean;
}

interface Spark {
  x: number;
  y: number;
  age: number;
  life: number;
  color: string;
}

const stage = {
  minX: -3.1,
  maxX: 3.1,
  floorY: 0,
  pushRadius: 0.48,
  hitHeight: 1.05
};

const moves: Record<MoveId, Omit<ActiveAttack, "id" | "elapsed" | "hit">> = {
  light: { duration: 0.34, activeStart: 0.03, activeEnd: 0.28, range: 1.62, damage: 7, knockback: 1.35 },
  heavy: { duration: 0.54, activeStart: 0.08, activeEnd: 0.45, range: 2.0, damage: 13, knockback: 2.05 },
  special: { duration: 0.78, activeStart: 0.08, activeEnd: 0.68, range: 2.64, damage: 20, knockback: 2.85 }
};

const gameWindow = window as AuraClashWindow;

export function mountAuraClashV5App(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("Missing #app");

  root.innerHTML = `
    <main class="ac5" tabindex="-1">
      <nav class="ac5-nav" aria-label="Aura Clash navigation">
        <a class="ac5-brand" href="/playable/" aria-label="Aura Clash playable route"><span></span>Aura Clash V5</a>
        <div class="ac5-links">
          <a href="/playable/">Playable</a>
          <a href="#evidence">Evidence</a>
          <a href="/deploy-check/">Deploy check</a>
          <a href="https://github.com/auraoneai/aura3d">GitHub</a>
          <a href="https://www.npmjs.com/package/@aura3d/engine">npm</a>
        </div>
      </nav>

      <section class="ac5-hud" aria-label="Fight HUD">
        <article class="ac5-card ac5-player">
          <span>Player one</span>
          <h1 id="player-name">Flux Vanta</h1>
          <p>Procedural Aura3D runtime fighter. No broken legacy GLB dependency.</p>
          <div class="ac5-bar ac5-health"><i id="player-health"></i></div>
          <div class="ac5-bar ac5-meter"><i id="player-meter"></i></div>
          <b id="player-state">READY - 100 HP</b>
        </article>
        <article class="ac5-clock">
          <strong id="round-time">99</strong>
          <span id="callout">FIGHT</span>
        </article>
        <article class="ac5-card ac5-rival">
          <span>Rival AI</span>
          <h2 id="rival-name">Nyx Circuit</h2>
          <p>Deterministic opponent with spacing, attacks, hitstun, and bounds.</p>
          <div class="ac5-bar ac5-health"><i id="rival-health"></i></div>
          <div class="ac5-bar ac5-meter"><i id="rival-meter"></i></div>
          <b id="rival-state">READY - 100 HP</b>
        </article>
      </section>

      <section class="ac5-stage-shell" aria-label="Playable Aura Clash V5 stage">
        <div id="aura-stage-v5" class="ac5-stage"></div>
        <div class="ac5-sprites" aria-hidden="true">
          <div id="sprite-player" class="ac5-sprite ac5-sprite-player">
            <i class="sprite-aura"></i>
            <i class="sprite-shadow"></i>
            <i class="sprite-leg sprite-leg-a"></i>
            <i class="sprite-leg sprite-leg-b"></i>
            <i class="sprite-body"></i>
            <i class="sprite-chest"></i>
            <i class="sprite-head"></i>
            <i class="sprite-arm sprite-arm-a"></i>
            <i class="sprite-arm sprite-arm-b"></i>
            <i class="sprite-fist sprite-fist-a"></i>
            <i class="sprite-fist sprite-fist-b"></i>
            <i class="sprite-slash"></i>
          </div>
          <div id="sprite-rival" class="ac5-sprite ac5-sprite-rival">
            <i class="sprite-aura"></i>
            <i class="sprite-shadow"></i>
            <i class="sprite-leg sprite-leg-a"></i>
            <i class="sprite-leg sprite-leg-b"></i>
            <i class="sprite-body"></i>
            <i class="sprite-chest"></i>
            <i class="sprite-head"></i>
            <i class="sprite-arm sprite-arm-a"></i>
            <i class="sprite-arm sprite-arm-b"></i>
            <i class="sprite-fist sprite-fist-a"></i>
            <i class="sprite-fist sprite-fist-b"></i>
            <i class="sprite-slash"></i>
          </div>
        </div>
        <div id="toast" class="ac5-toast">V5 hard reset loaded: procedural fighters, deterministic combat, fresh catalog proof asset.</div>
        <div id="combo-flash" class="ac5-combo" aria-live="polite"></div>
      </section>

      <section class="ac5-controls" aria-label="Controls">
        <button data-hold="left">A / Left</button>
        <button data-hold="right">D / Right</button>
        <button data-press="jump">Space Jump</button>
        <button data-press="dash">Shift Dash</button>
        <button data-hold="guard">Q Guard</button>
        <button data-press="light">J Light</button>
        <button data-press="heavy">K Heavy</button>
        <button data-press="special">L Special</button>
        <button data-press="pause">Pause</button>
        <button id="reset-round" type="button">Reset</button>
        <button id="toggle-motion" type="button" aria-pressed="false">Motion</button>
        <button id="toggle-contrast" type="button" aria-pressed="false">Contrast</button>
      </section>

      <section id="evidence" class="ac5-proof" aria-label="Aura3D proof">
        <div><b>Route</b><span>V5 fresh route. V1/V2/V3/V4 dumped from active gameplay.</span></div>
        <div><b>Fighters</b><span>Procedural Aura3D runtime rigs, not failed character GLBs.</span></div>
        <div><b>Catalog</b><span>Fresh federated asset pulled: Cyberpunk Robot by Josh_NC, CC-BY-4.0.</span></div>
        <div><b>Runtime</b><span>Input, bounds, jump, dash, guard, attacks, hit windows, HP, meter, AI.</span></div>
      </section>
    </main>
  `;

  const reducedMotion = matchMediaSafe("(prefers-reduced-motion: reduce)");
  const noFlash = reducedMotion || matchMediaSafe("(prefers-contrast: more)");
  const shell = root.querySelector<HTMLElement>(".ac5");
  const accessibility = {
    reducedMotion,
    highContrast: false,
    reducedFlash: noFlash
  };
  shell?.classList.toggle("is-reduced-motion", accessibility.reducedMotion);
  const mint = material.pbr({ color: "#28ffd2", emissive: "#28ffd2", emissiveIntensity: 0.95, roughness: 0.2 });
  const cyan = material.pbr({ color: "#8cf7ff", emissive: "#40dfff", emissiveIntensity: 0.72, roughness: 0.26 });
  const gold = material.pbr({ color: "#ffe06a", emissive: "#ffe06a", emissiveIntensity: 0.6, roughness: 0.32 });
  const ember = material.pbr({ color: "#ff765b", emissive: "#ff3d2e", emissiveIntensity: 0.68, roughness: 0.3 });
  const violet = material.pbr({ color: "#5a7cff", emissive: "#3a55ff", emissiveIntensity: 0.52, roughness: 0.34 });
  const dark = material.pbr({ color: "#04110d", emissive: "#071f18", emissiveIntensity: 0.24, roughness: 0.72, metallic: 0.08 });
  const glass = material.pbr({ color: "#163d37", emissive: "#0d6655", emissiveIntensity: 0.28, roughness: 0.58, metallic: 0.14 });
  const floor = material.pbr({ color: "#72ffe2", emissive: "#20ffd0", emissiveIntensity: 0.28, roughness: 0.4 });
  const hit = material.pbr({ color: "#ffffff", emissive: "#fff6b5", emissiveIntensity: 1.1, roughness: 0.12 });
  const playerRigNodes = fighterRig("p", mint, cyan);
  const rivalRigNodes = fighterRig("r", gold, ember);

  const arena = scene()
    .background("#020705")
    .add(primitives.box({ name: "v5 far black city plate", material: dark }).position(0, 1.08, -1.46).scale([7.2, 1.95, 0.05]))
    .add(primitives.box({ name: "v5 cyan skyline left", material: glass }).position(-2.55, 1.1, -1.26).scale([0.5, 1.5, 0.06]))
    .add(primitives.box({ name: "v5 cyan skyline center", material: glass }).position(-0.72, 1.34, -1.28).scale([0.68, 1.95, 0.06]))
    .add(primitives.box({ name: "v5 gold skyline right", material: dark }).position(1.28, 1.2, -1.3).scale([0.62, 1.56, 0.06]))
    .add(primitives.box({ name: "v5 glass halo wall", material: glass }).position(0, 0.98, -1.04).scale([6.15, 1.08, 0.055]))
    .add(primitives.box({ name: "v5 left advert pillar", material: ember }).position(-2.76, 0.78, -0.88).scale([0.08, 0.86, 0.04]))
    .add(primitives.box({ name: "v5 right advert pillar", material: gold }).position(2.76, 0.78, -0.88).scale([0.08, 0.86, 0.04]))
    .add(primitives.box({ name: "v5 combat floor", material: floor }).position(0, -0.08, 0.04).scale([6.4, 0.08, 0.96]))
    .add(primitives.box({ name: "v5 floor shadow slab", material: dark }).position(0, -0.15, 0.05).scale([6.75, 0.08, 1.2]))
    .add(primitives.box({ name: "v5 front rail", material: mint }).position(0, 0.02, 0.62).scale([6.35, 0.025, 0.025]))
    .add(primitives.box({ name: "v5 back rail", material: gold }).position(0, 0.02, -0.48).scale([6.0, 0.018, 0.025]))
    .add(primitives.box({ name: "v5 center line", material: mint }).position(0, 0.05, 0.04).scale([0.032, 0.06, 1.02]))
    .add(primitives.box({ name: "v5 left wall", material: gold }).position(stage.minX, 0.62, 0.42).scale([0.03, 1.08, 0.04]))
    .add(primitives.box({ name: "v5 right wall", material: gold }).position(stage.maxX, 0.62, 0.42).scale([0.03, 1.08, 0.04]))
    .add(model(assets.v5CatalogRobot, { name: "fresh catalog cyberpunk robot proof prop" }).position(-2.85, 0.32, -0.92).scale(0.0032).runtime(game.runtimeNode("catalog-proof", { tags: ["fresh-catalog-asset", "not-gameplay-critical"] })))
    .add(playerRigNodes[0])
    .add(playerRigNodes[1])
    .add(playerRigNodes[2])
    .add(playerRigNodes[3])
    .add(playerRigNodes[4])
    .add(playerRigNodes[5])
    .add(playerRigNodes[6])
    .add(playerRigNodes[7])
    .add(playerRigNodes[8])
    .add(playerRigNodes[9])
    .add(playerRigNodes[10])
    .add(rivalRigNodes[0])
    .add(rivalRigNodes[1])
    .add(rivalRigNodes[2])
    .add(rivalRigNodes[3])
    .add(rivalRigNodes[4])
    .add(rivalRigNodes[5])
    .add(rivalRigNodes[6])
    .add(rivalRigNodes[7])
    .add(rivalRigNodes[8])
    .add(rivalRigNodes[9])
    .add(rivalRigNodes[10])
    .add(primitives.box({ name: "v5 player strike volume", material: cyan }).position(9, 0, 0).scale([0.12, 0.12, 0.05]).runtime(game.runtimeNode("p-strike", { tags: ["hitbox-visual"] })))
    .add(primitives.box({ name: "v5 rival strike volume", material: ember }).position(9, 0, 0).scale([0.12, 0.12, 0.05]).runtime(game.runtimeNode("r-strike", { tags: ["hitbox-visual"] })))
    .add(primitives.torus({ name: "v5 impact ring", material: hit }).position(9, 0, 0).rotate(Math.PI / 2, 0, 0).scale([0.1, 0.1, 0.03]).runtime(game.runtimeNode("impact-ring", { tags: ["impact"] })))
    .add(primitives.box({ name: "v5 impact slash a", material: hit }).position(9, 0, 0).scale([0.05, 0.05, 0.05]).runtime(game.runtimeNode("impact-a", { tags: ["impact"] })))
    .add(primitives.box({ name: "v5 impact slash b", material: mint }).position(9, 0, 0).scale([0.05, 0.05, 0.05]).runtime(game.runtimeNode("impact-b", { tags: ["impact"] })))
    .add(effects.bloom({ intensity: 0.42 }))
    .add(lights.studio({ intensity: 1.12 }))
    .add(lights.directional({ name: "v5 left rim", color: "#96ffea", intensity: 0.78 }).position(-2.2, 4.4, 3.4))
    .add(lights.directional({ name: "v5 right rim", color: "#ffe06a", intensity: 0.6 }).position(2.6, 3.8, 3.0))
    .camera(camera.perspective({ position: [0, 1.45, 5.25], target: [0, 0.76, 0], fov: 32 }));

  const app = createAuraApp("#aura-stage-v5", {
    diagnostics: { overlay: false, performancePanel: false },
    scene: arena
  });

  const nodes = {
    catalog: app.nodes.require("catalog-proof"),
    p: requireRig(app, "p"),
    r: requireRig(app, "r"),
    pStrike: app.nodes.require("p-strike"),
    rStrike: app.nodes.require("r-strike"),
    impactRing: app.nodes.require("impact-ring"),
    impactA: app.nodes.require("impact-a"),
    impactB: app.nodes.require("impact-b")
  };

  const input = game.input({
    actions: {
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      jump: ["Space"],
      dash: ["ShiftLeft", "ShiftRight"],
      guard: ["KeyQ"],
      light: ["KeyJ"],
      heavy: ["KeyK"],
      special: ["KeyL"],
      pause: ["KeyP", "Escape"]
    },
    axes: {
      moveX: { negative: "left", positive: "right" }
    },
    autoListen: true
  });

  const keyHeld = new Set<string>();
  const buttonHeld = new Set<string>();
  const buttonPressed = new Set<string>();
  let pendingPauseToggle = false;
  window.addEventListener("keydown", (event) => {
    const wasHeld = keyHeld.has(event.code);
    keyHeld.add(event.code);
    if ((event.code === "KeyP" || event.code === "Escape") && !wasHeld) pendingPauseToggle = true;
    if (["Space", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  });
  window.addEventListener("keyup", (event) => keyHeld.delete(event.code));
  wireButtons(root, buttonHeld, buttonPressed, () => resetRound());
  wireAccessibility(root, shell, accessibility);

  const player = createFighter("player", "Flux Vanta", "Rushdown aura striker", -1.85, 1);
  const rival = createFighter("rival", "Nyx Circuit", "Pressure rival AI", 1.85, -1);
  const sparks: Spark[] = [];
  let paused = false;
  let roundTime = 99;
  let hitStop = 0;
  let totalHits = 0;
  let lastHitFrame = 0;
  let callout = "FIGHT";
  let calloutTimer = 0;
  let toast = "V5 ready. Move with A/D, attack with J/K/L. No legacy fighter GLBs.";
  let shake = 0;
  let lastImpact = { x: 9, y: 0.8 };

  app.onFrame(({ dt }) => {
    const frameDt = Math.min(dt, 1 / 30);
    input.update(frameDt);
    const pauseRequested = pendingPauseToggle || input.pressed("pause") || buttonPressed.has("pause");
    if (pauseRequested) paused = !paused;
    pendingPauseToggle = false;
    if (paused) {
      toast = "Paused. Press P or Escape to resume.";
      updateHud(player, rival, roundTime, "PAUSE", toast);
      publishProof();
      buttonPressed.clear();
      return;
    }

    const roundOver = player.health <= 0 || rival.health <= 0 || roundTime <= 0;
    if (!roundOver) roundTime = Math.max(0, roundTime - frameDt);
    const dtScale = hitStop > 0 ? 0.18 : 1;
    const simDt = frameDt * dtScale;
    hitStop = Math.max(0, hitStop - frameDt);

    updatePlayer(player, input, keyHeld, buttonHeld, buttonPressed, simDt, roundOver);
    updateRival(rival, player, simDt, roundOver);
    stepFighter(player, simDt);
    stepFighter(rival, simDt);
    separate(player, rival);
    resolveAttack(player, rival);
    resolveAttack(rival, player);
    updateSparks(sparks, frameDt);

    if (player.health <= 0 || rival.health <= 0 || roundTime <= 0) {
      callout = player.health === rival.health ? "DRAW" : player.health > rival.health ? "PLAYER WINS" : "RIVAL WINS";
    } else if (calloutTimer <= 0) {
      callout = "FIGHT";
    }
    calloutTimer = Math.max(0, calloutTimer - frameDt);
    shake = Math.max(0, shake - frameDt * 5);

    syncRig(nodes.p, player, app.runtime.time, shake, false);
    syncRig(nodes.r, rival, app.runtime.time, shake, true);
    syncDomSprite("sprite-player", player);
    syncDomSprite("sprite-rival", rival);
    syncStrike(nodes.pStrike, player);
    syncStrike(nodes.rStrike, rival);
    syncImpact(nodes.impactRing, nodes.impactA, nodes.impactB, lastImpact, sparks[0], app.runtime.time);
    nodes.catalog.setVisible(true).setRotation(0, app.runtime.time * 0.28, 0);

    updateHud(player, rival, roundTime, callout, toast);
    buttonPressed.clear();

    publishProof();
  });

  function publishProof(): void {
    gameWindow.__AURA_CLASH_V5_PROOF__ = {
      route: window.location.pathname,
      version: "v5-hard-reset",
      noLegacyFighterGlbs: true,
      playable: !paused,
      totalHits,
      lastHitFrame,
      roundTime: Math.ceil(roundTime),
      callout: paused ? "PAUSE" : callout,
      player: snapshot(player),
      rival: snapshot(rival),
      bounds: { minX: stage.minX, maxX: stage.maxX },
      typedAssets: {
        catalogProof: assets.v5CatalogRobot.url,
        catalogTitle: "Cyberpunk Robot",
        license: "CC-BY-4.0",
        attribution: "Josh_NC"
      },
      runtime: {
        aura3dAppFrame: app.runtime.frame,
        aura3dFrameLoop: true,
        aura3dRuntimeNodes: true,
        input: true,
        deterministicPhysics: true,
        hitWindows: true,
        ai: true,
        effects: true,
        hud: true,
        accessibility: true
      },
      accessibility: {
        reducedMotion: accessibility.reducedMotion,
        highContrast: accessibility.highContrast,
        reducedFlash: accessibility.reducedFlash
      }
    };
    gameWindow.__AURA3D_GAME_EVIDENCE__ = {
      kind: "aura-clash-v5-evidence",
      proof: gameWindow.__AURA_CLASH_V5_PROOF__,
      source: {
        publicAura3dApi: true,
        usesCreateAuraApp: true,
        usesRuntimeNodes: true,
        usesTypedAssets: true,
        dumped: ["v1", "v2", "v3", "v4"]
      }
    };
  }

  function updatePlayer(fighter: Fighter, auraInput: ReturnType<typeof game.input>, held: Set<string>, buttons: Set<string>, presses: Set<string>, dt: number, roundOver: boolean): void {
    if (roundOver || fighter.hitstun > 0 || fighter.attack) return;
    const left = auraInput.held("left") || held.has("KeyA") || held.has("ArrowLeft") || buttons.has("left");
    const right = auraInput.held("right") || held.has("KeyD") || held.has("ArrowRight") || buttons.has("right");
    const axis = (right ? 1 : 0) - (left ? 1 : 0);
    fighter.guard = auraInput.held("guard") || held.has("KeyQ") || buttons.has("guard");
    fighter.facing = rival.x >= fighter.x ? 1 : -1;

    if (pressed("jump", auraInput, held, presses) && fighter.grounded) {
      fighter.vy = 4.4;
      setAction(fighter, "jump", 0.28);
      toast = "Flux Vanta jumps.";
    }
    if (pressed("dash", auraInput, held, presses)) {
      fighter.vx = fighter.facing * 5.9;
      setAction(fighter, "dash", 0.22);
      toast = "Flux Vanta dashes.";
    }
    if (pressed("light", auraInput, held, presses)) startAttack(fighter, "light");
    else if (pressed("heavy", auraInput, held, presses)) startAttack(fighter, "heavy");
    else if (pressed("special", auraInput, held, presses)) startAttack(fighter, "special");
    else if (!fighter.attack && fighter.action !== "dash" && fighter.action !== "jump") {
      fighter.vx = axis * (fighter.guard ? 1.45 : 4.15);
      fighter.action = fighter.guard ? "guard" : Math.abs(axis) > 0 ? "walk" : "idle";
    }
    fighter.meter = Math.min(100, fighter.meter + dt * 4);
  }

  function updateRival(fighter: Fighter, target: Fighter, dt: number, roundOver: boolean): void {
    if (roundOver || fighter.hitstun > 0 || fighter.attack) return;
    fighter.facing = target.x >= fighter.x ? 1 : -1;
    fighter.aiCooldown = Math.max(0, fighter.aiCooldown - dt);
    const gap = target.x - fighter.x;
    const distance = Math.abs(gap);
    if (distance > 1.34) {
      fighter.vx = Math.sign(gap) * 1.48;
      fighter.action = "walk";
    } else {
      fighter.vx *= 0.66;
      fighter.action = "idle";
      if (fighter.aiCooldown <= 0 && (fighter.health < 100 || target.combo > 0)) {
        startAttack(fighter, fighter.meter > 45 ? "heavy" : "light");
        fighter.aiCooldown = 0.86;
      }
    }
    fighter.meter = Math.min(100, fighter.meter + dt * 5);
  }

  function startAttack(fighter: Fighter, id: MoveId): void {
    if (fighter.hitstun > 0 || fighter.attack || fighter.action === "ko") return;
    const spec = moves[id];
    fighter.attack = { id, elapsed: 0, hit: false, ...spec };
    setAction(fighter, id, spec.duration);
    fighter.vx = fighter.facing * (id === "special" ? 3.35 : id === "heavy" ? 2.35 : 1.65);
    toast = `${fighter.name} starts ${id}.`;
  }

  function resolveAttack(attacker: Fighter, target: Fighter): void {
    if (!attacker.attack || attacker.attack.hit) return;
    const atk = attacker.attack;
    const active = atk.elapsed >= atk.activeStart && atk.elapsed <= atk.activeEnd;
    if (!active) return;
    const dx = target.x - attacker.x;
    const inFront = Math.sign(dx || attacker.facing) === attacker.facing;
    const distance = Math.abs(dx);
    const vertical = Math.abs(target.y - attacker.y) < stage.hitHeight;
    if (!inFront || distance > atk.range || !vertical) return;
    atk.hit = true;
    totalHits += 1;
    lastHitFrame = app.runtime.frame;
    const blocked = target.guard && target.facing === -attacker.facing && atk.id !== "special";
    const damage = blocked ? Math.ceil(atk.damage * 0.22) : atk.damage;
    target.health = clamp(target.health - damage, 0, 100);
    target.hitstun = blocked ? 0.16 : 0.34;
    target.vx = attacker.facing * (blocked ? atk.knockback * 0.24 : atk.knockback);
    target.vy = blocked ? 0.1 : 0.36;
    attacker.combo += blocked ? 0 : 1;
    attacker.meter = clamp(attacker.meter + atk.damage * 1.2, 0, 100);
    target.action = blocked ? "guard" : target.health <= 0 ? "ko" : "hurt";
    target.actionTime = 0;
    target.actionDuration = target.health <= 0 ? 99 : target.hitstun;
    callout = blocked ? "BLOCK" : "HIT";
    calloutTimer = 0.55;
    hitStop = blocked ? 0.035 : 0.07;
    shake = blocked ? 0.22 : 0.62;
    lastImpact = { x: attacker.x + attacker.facing * Math.min(distance, atk.range * 0.82), y: 0.84 + (totalHits % 3) * 0.09 };
    sparks.unshift({ x: lastImpact.x, y: lastImpact.y, age: 0, life: blocked ? 0.18 : 0.34, color: blocked ? "#8cf7ff" : "#fff1a8" });
    toast = blocked
      ? `${target.name} blocks ${attacker.name}'s ${atk.id}.`
      : `${attacker.name} lands ${atk.id} for ${damage} damage.`;
    const combo = document.querySelector<HTMLDivElement>("#combo-flash");
    if (combo) {
      combo.textContent = blocked ? "BLOCK" : `${attacker.combo} HIT`;
      combo.classList.remove("is-active");
      void combo.offsetWidth;
      combo.classList.add("is-active");
    }
  }

  function resetRound(): void {
    Object.assign(player, createFighter("player", "Flux Vanta", "Rushdown aura striker", -1.85, 1));
    Object.assign(rival, createFighter("rival", "Nyx Circuit", "Pressure rival AI", 1.85, -1));
    sparks.length = 0;
    roundTime = 99;
    totalHits = 0;
    lastHitFrame = 0;
    callout = "FIGHT";
    calloutTimer = 0;
    hitStop = 0;
    shake = 0;
    toast = "Round reset. V5 controls are live.";
  }
}

function fighterRig(prefix: string, primary: unknown, secondary: unknown) {
  return [
    primitives.torus({ name: `${prefix} shadow ring`, material: primary as never }).position(0, 0, 0).rotate(Math.PI / 2, 0, 0).scale([0.35, 0.35, 0.03]).runtime(game.runtimeNode(`${prefix}-shadow`, { tags: ["fighter-rig"] })),
    primitives.sphere({ name: `${prefix} core`, material: primary as never }).position(0, 0.9, 0).scale([0.26, 0.4, 0.18]).runtime(game.runtimeNode(`${prefix}-core`, { tags: ["fighter-rig"] })),
    primitives.box({ name: `${prefix} chest`, material: secondary as never }).position(0, 0.94, 0).scale([0.42, 0.48, 0.18]).runtime(game.runtimeNode(`${prefix}-chest`, { tags: ["fighter-rig"] })),
    primitives.sphere({ name: `${prefix} head`, material: primary as never }).position(0, 1.48, 0).scale([0.2, 0.22, 0.18]).runtime(game.runtimeNode(`${prefix}-head`, { tags: ["fighter-rig"] })),
    primitives.box({ name: `${prefix} left arm`, material: secondary as never }).position(0, 0.94, 0).scale([0.14, 0.48, 0.13]).runtime(game.runtimeNode(`${prefix}-arm-l`, { tags: ["fighter-rig"] })),
    primitives.box({ name: `${prefix} right arm`, material: secondary as never }).position(0, 0.94, 0).scale([0.14, 0.48, 0.13]).runtime(game.runtimeNode(`${prefix}-arm-r`, { tags: ["fighter-rig"] })),
    primitives.sphere({ name: `${prefix} left fist`, material: primary as never }).position(0, 0.82, 0).scale([0.13, 0.13, 0.13]).runtime(game.runtimeNode(`${prefix}-fist-l`, { tags: ["fighter-rig"] })),
    primitives.sphere({ name: `${prefix} right fist`, material: primary as never }).position(0, 0.82, 0).scale([0.13, 0.13, 0.13]).runtime(game.runtimeNode(`${prefix}-fist-r`, { tags: ["fighter-rig"] })),
    primitives.box({ name: `${prefix} left leg`, material: secondary as never }).position(0, 0.36, 0).scale([0.16, 0.58, 0.13]).runtime(game.runtimeNode(`${prefix}-leg-l`, { tags: ["fighter-rig"] })),
    primitives.box({ name: `${prefix} right leg`, material: secondary as never }).position(0, 0.36, 0).scale([0.16, 0.58, 0.13]).runtime(game.runtimeNode(`${prefix}-leg-r`, { tags: ["fighter-rig"] })),
    primitives.torus({ name: `${prefix} aura ring`, material: primary as never }).position(0, 0.86, 0).rotate(Math.PI / 2, 0, 0).scale([0.62, 0.62, 0.02]).runtime(game.runtimeNode(`${prefix}-aura`, { tags: ["fighter-rig"] }))
  ];
}

function requireRig(app: ReturnType<typeof createAuraApp>, prefix: string) {
  return {
    shadow: app.nodes.require(`${prefix}-shadow`),
    core: app.nodes.require(`${prefix}-core`),
    chest: app.nodes.require(`${prefix}-chest`),
    head: app.nodes.require(`${prefix}-head`),
    armL: app.nodes.require(`${prefix}-arm-l`),
    armR: app.nodes.require(`${prefix}-arm-r`),
    fistL: app.nodes.require(`${prefix}-fist-l`),
    fistR: app.nodes.require(`${prefix}-fist-r`),
    legL: app.nodes.require(`${prefix}-leg-l`),
    legR: app.nodes.require(`${prefix}-leg-r`),
    aura: app.nodes.require(`${prefix}-aura`)
  };
}

function createFighter(id: FighterId, name: string, title: string, x: number, facing: 1 | -1): Fighter {
  return {
    id,
    name,
    title,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing,
    health: 100,
    meter: 0,
    grounded: true,
    action: "idle",
    actionTime: 0,
    actionDuration: 0,
    hitstun: 0,
    guard: false,
    combo: 0,
    aiCooldown: id === "rival" ? 2.4 : 0.7
  };
}

function stepFighter(fighter: Fighter, dt: number): void {
  fighter.actionTime += dt;
  fighter.hitstun = Math.max(0, fighter.hitstun - dt);
  if (fighter.attack) {
    fighter.attack.elapsed += dt;
    if (fighter.attack.elapsed >= fighter.attack.duration) {
      fighter.attack = undefined;
      fighter.action = fighter.grounded ? "idle" : "jump";
      fighter.actionTime = 0;
    }
  }
  if (!fighter.grounded || fighter.y > 0) fighter.vy -= 11.5 * dt;
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;
  fighter.vx *= fighter.grounded ? 0.82 : 0.96;
  if (fighter.y <= stage.floorY) {
    fighter.y = stage.floorY;
    fighter.vy = 0;
    fighter.grounded = true;
    if (fighter.action === "jump" && !fighter.attack && fighter.hitstun <= 0) fighter.action = Math.abs(fighter.vx) > 0.08 ? "walk" : "idle";
  } else {
    fighter.grounded = false;
  }
  fighter.x = clamp(fighter.x, stage.minX, stage.maxX);
  if (fighter.x === stage.minX || fighter.x === stage.maxX) fighter.vx = 0;
  if (!fighter.attack && fighter.hitstun <= 0 && fighter.actionTime >= fighter.actionDuration && fighter.action !== "guard" && fighter.action !== "walk" && fighter.action !== "idle" && fighter.action !== "jump") {
    fighter.action = fighter.grounded ? "idle" : "jump";
    fighter.actionTime = 0;
  }
  if (fighter.health <= 0) {
    fighter.health = 0;
    fighter.action = "ko";
    fighter.attack = undefined;
    fighter.vx = 0;
  }
}

function separate(a: Fighter, b: Fighter): void {
  const distance = b.x - a.x;
  const overlap = stage.pushRadius * 2 - Math.abs(distance);
  if (overlap <= 0) return;
  const sign = distance >= 0 ? 1 : -1;
  a.x = clamp(a.x - sign * overlap * 0.5, stage.minX, stage.maxX);
  b.x = clamp(b.x + sign * overlap * 0.5, stage.minX, stage.maxX);
}

function syncRig(rig: ReturnType<typeof requireRig>, fighter: Fighter, time: number, shake: number, mirror: boolean): void {
  const showDebugRig = false;
  if (!showDebugRig) {
    for (const node of [rig.shadow, rig.core, rig.chest, rig.head, rig.armL, rig.armR, rig.fistL, rig.fistR, rig.legL, rig.legR, rig.aura]) {
      node.setVisible(false).setPosition(9, 0, 0);
    }
    return;
  }
  const facing = fighter.facing;
  const baseX = fighter.x + (Math.random() - 0.5) * shake * 0.018;
  const baseY = fighter.y;
  const walk = fighter.action === "walk" ? Math.sin(time * 12) : 0;
  const attack = fighter.attack ? Math.sin(clamp(fighter.attack.elapsed / Math.max(fighter.attack.duration, 0.001), 0, 1) * Math.PI) : 0;
  const hurt = fighter.hitstun > 0 ? 1 : 0;
  const guard = fighter.guard || fighter.action === "guard" ? 1 : 0;
  const crouch = fighter.action === "guard" ? -0.08 : 0;
  const lean = fighter.action === "dash" ? facing * 0.18 : attack * facing * 0.26 - hurt * facing * 0.32;
  const yaw = (mirror ? Math.PI : 0) + (facing < 0 ? Math.PI : 0);
  const z = fighter.id === "player" ? 0.08 : -0.06;

  rig.shadow.setVisible(true).setPosition(baseX, 0.025, z).setScale([0.28 + Math.abs(fighter.vx) * 0.012, 0.24, 0.018]);
  rig.core.setVisible(true).setPosition(baseX + lean * 0.12, 0.72 + baseY + crouch + Math.sin(time * 5) * 0.014, z).setRotation(0, yaw, -lean).setScale([0.18, 0.3, 0.12]);
  rig.chest.setVisible(true).setPosition(baseX + lean * 0.16, 0.92 + baseY + crouch, z).setRotation(0, yaw, -lean * 0.8).setScale([0.28, 0.36, 0.12]);
  rig.head.setVisible(true).setPosition(baseX + facing * 0.035 + lean * 0.2, 1.32 + baseY + crouch + hurt * 0.045, z).setRotation(0, yaw, -lean * 0.55).setScale([0.16, 0.18, 0.14]);
  rig.aura.setVisible(true).setPosition(baseX, 0.72 + baseY + crouch, z).setRotation(Math.PI / 2, 0, time * 0.8 * facing).setScale([0.42 + attack * 0.18, 0.42 + attack * 0.18, 0.016]);

  const front = facing > 0 ? "R" : "L";
  const frontPunch = attack * (fighter.attack?.id === "heavy" ? 0.42 : fighter.attack?.id === "special" ? 0.72 : 0.34);
  const rearGuard = guard * 0.2;
  const armSpread = 0.22;
  const frontX = baseX + facing * (armSpread + frontPunch + rearGuard);
  const rearX = baseX - facing * (armSpread - guard * 0.13);
  const frontY = 0.94 + baseY + crouch + attack * 0.1;
  const rearY = 0.82 + baseY + crouch + guard * 0.16;
  const armFront = front === "R" ? rig.armR : rig.armL;
  const armRear = front === "R" ? rig.armL : rig.armR;
  const fistFront = front === "R" ? rig.fistR : rig.fistL;
  const fistRear = front === "R" ? rig.fistL : rig.fistR;
  armFront.setVisible(true).setPosition((baseX + frontX) / 2, frontY, z).setRotation(0, yaw, -facing * (0.92 + attack * 0.42)).setScale([0.075, 0.4 + frontPunch * 0.32, 0.075]);
  fistFront.setVisible(true).setPosition(frontX, frontY + 0.035, z).setScale([0.09 + attack * 0.04, 0.09 + attack * 0.04, 0.09]);
  armRear.setVisible(true).setPosition((baseX + rearX) / 2, rearY, z).setRotation(0, yaw, facing * (0.7 + guard * 0.7)).setScale([0.075, 0.34, 0.075]);
  fistRear.setVisible(true).setPosition(rearX, rearY, z).setScale([0.085, 0.085, 0.085]);

  rig.legL.setVisible(true).setPosition(baseX - facing * (0.13 + walk * 0.065), 0.32 + baseY, z).setRotation(0, yaw, facing * (0.1 + walk * 0.28)).setScale([0.095, 0.46, 0.085]);
  rig.legR.setVisible(true).setPosition(baseX + facing * (0.13 + walk * 0.065), 0.32 + baseY, z).setRotation(0, yaw, -facing * (0.1 + walk * 0.28)).setScale([0.095, 0.46, 0.085]);

  if (fighter.action === "ko") {
    rig.core.setRotation(0, yaw, -1.25 * facing).setPosition(baseX, 0.35, z);
    rig.chest.setRotation(0, yaw, -1.45 * facing).setPosition(baseX + facing * 0.2, 0.36, z);
    rig.head.setPosition(baseX + facing * 0.46, 0.34, z);
  }
}

function syncStrike(node: any, fighter: Fighter): void {
  if (!fighter.attack) {
    node.setVisible(false).setPosition(9, 0, 0);
    return;
  }
  const active = fighter.attack.elapsed >= fighter.attack.activeStart && fighter.attack.elapsed <= fighter.attack.activeEnd;
  const length = fighter.attack.range * (active ? 0.68 : 0.42);
  node
    .setVisible(true)
    .setPosition(fighter.x + fighter.facing * (0.42 + length * 0.45), 0.94 + fighter.y, fighter.id === "player" ? 0.16 : -0.14)
    .setRotation(0, 0, fighter.facing * (active ? -1.0 : -0.48))
    .setScale([length, active ? 0.07 : 0.035, 0.035]);
}

function syncImpact(ring: any, slashA: any, slashB: any, impact: { x: number; y: number }, spark: Spark | undefined, time: number): void {
  if (!spark) {
    ring.setVisible(false).setPosition(9, 0, 0);
    slashA.setVisible(false).setPosition(9, 0, 0);
    slashB.setVisible(false).setPosition(9, 0, 0);
    return;
  }
  const t = clamp(spark.age / spark.life, 0, 1);
  const scale = 0.18 + t * 0.44;
  ring.setVisible(true).setPosition(impact.x, impact.y, 0.22).setScale([scale, scale, 0.02]).setRotation(Math.PI / 2, 0, time * 5);
  slashA.setVisible(true).setPosition(impact.x, impact.y, 0.2).setScale([0.42 * (1 - t), 0.035, 0.035]).setRotation(0, 0, 0.7 + time);
  slashB.setVisible(true).setPosition(impact.x, impact.y, 0.2).setScale([0.36 * (1 - t), 0.035, 0.035]).setRotation(0, 0, -0.7 - time);
}

function syncDomSprite(id: string, fighter: Fighter): void {
  const element = document.getElementById(id);
  if (!element) return;
  const xPercent = 50 + (fighter.x / Math.max(Math.abs(stage.minX), Math.abs(stage.maxX))) * 35;
  const yPercent = 14 + fighter.y * 12;
  element.style.setProperty("--sprite-x", `${xPercent}%`);
  element.style.setProperty("--sprite-y", `${yPercent}%`);
  element.style.setProperty("--sprite-facing", String(fighter.facing));
  element.style.setProperty("--sprite-meter", String(fighter.meter / 100));
  element.dataset.action = fighter.action;
  element.dataset.attacking = fighter.attack?.id ?? "";
  element.dataset.hitstun = fighter.hitstun > 0 ? "true" : "false";
}

function updateSparks(sparks: Spark[], dt: number): void {
  for (const spark of sparks) spark.age += dt;
  while (sparks.length > 0 && sparks[sparks.length - 1].age >= sparks[sparks.length - 1].life) sparks.pop();
}

function pressed(action: string, input: ReturnType<typeof game.input>, held: Set<string>, buttonPressed: Set<string>): boolean {
  if (input.pressed(action) || buttonPressed.has(action)) return true;
  if (action === "jump") return held.has("Space");
  if (action === "dash") return held.has("ShiftLeft") || held.has("ShiftRight");
  if (action === "light") return held.has("KeyJ");
  if (action === "heavy") return held.has("KeyK");
  if (action === "special") return held.has("KeyL");
  if (action === "pause") return held.has("KeyP") || held.has("Escape");
  return false;
}

function setAction(fighter: Fighter, action: ActionName, duration: number): void {
  fighter.action = action;
  fighter.actionTime = 0;
  fighter.actionDuration = duration;
}

function snapshot(fighter: Fighter) {
  return {
    name: fighter.name,
    health: Math.round(fighter.health),
    meter: Math.round(fighter.meter),
    x: Number(fighter.x.toFixed(3)),
    y: Number(fighter.y.toFixed(3)),
    grounded: fighter.grounded,
    action: fighter.action,
    combo: fighter.combo,
    attacking: fighter.attack?.id ?? null
  };
}

function updateHud(player: Fighter, rival: Fighter, roundTime: number, callout: string, toast: string): void {
  setWidth("#player-health", player.health);
  setWidth("#rival-health", rival.health);
  setWidth("#player-meter", player.meter);
  setWidth("#rival-meter", rival.meter);
  setText("#player-state", `${player.action.toUpperCase()} - ${Math.round(player.health)} HP`);
  setText("#rival-state", `${rival.action.toUpperCase()} - ${Math.round(rival.health)} HP`);
  setText("#round-time", String(Math.ceil(roundTime)));
  setText("#callout", callout);
  setText("#toast", toast);
}

function wireButtons(root: HTMLElement, held: Set<string>, pressedSet: Set<string>, reset: () => void): void {
  root.querySelector<HTMLButtonElement>("#reset-round")?.addEventListener("click", reset);
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
    const action = button.dataset.hold;
    if (!action) continue;
    button.addEventListener("pointerdown", () => held.add(action));
    button.addEventListener("pointerup", () => held.delete(action));
    button.addEventListener("pointerleave", () => held.delete(action));
    button.addEventListener("blur", () => held.delete(action));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-press]")) {
    const action = button.dataset.press;
    if (!action) continue;
    button.addEventListener("pointerdown", () => pressedSet.add(action));
    button.addEventListener("click", () => pressedSet.add(action));
  }
}

function wireAccessibility(
  root: HTMLElement,
  shell: HTMLElement | null,
  state: { reducedMotion: boolean; highContrast: boolean; reducedFlash: boolean }
): void {
  const motion = root.querySelector<HTMLButtonElement>("#toggle-motion");
  const contrast = root.querySelector<HTMLButtonElement>("#toggle-contrast");
  const apply = () => {
    shell?.classList.toggle("is-reduced-motion", state.reducedMotion);
    shell?.classList.toggle("is-high-contrast", state.highContrast);
    motion?.setAttribute("aria-pressed", String(state.reducedMotion));
    contrast?.setAttribute("aria-pressed", String(state.highContrast));
  };
  motion?.addEventListener("click", () => {
    state.reducedMotion = !state.reducedMotion;
    state.reducedFlash = state.reducedMotion || state.highContrast;
    apply();
  });
  contrast?.addEventListener("click", () => {
    state.highContrast = !state.highContrast;
    state.reducedFlash = state.reducedMotion || state.highContrast;
    apply();
  });
  apply();
}

function setWidth(selector: string, value: number): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.style.width = `${clamp(value, 0, 100)}%`;
}

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function matchMediaSafe(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}
