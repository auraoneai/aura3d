// Pip's Big Leap — a 3D mascot platformer on the Aura3D shared runtime.
//
// `createGame` owns the mount, input (actions/axes/buffer), the dpad-2btn
// touch preset, game-sfx-core cues, juice events and the evidence global.
// `world.ts` lowers each WorldSpec into a scene + collision world;
// `player.ts` is the kinematic controller; `certify.ts` drives the engine's
// public platformer-geometry pipeline per world.

import {
  camera,
  game,
  gameFeel,
  material,
  type AuraRuntimeNodeHandle,
  type AuraSceneSnapshot
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { createLocomotionKit } from "@aura3d/animation";
import "./styles.css";
import { assets, BOSS_CLIPS, PIP_CLIPS } from "./aura-assets.js";
import { buildWorld, nodeName, tickPlatforms, type BuiltWorld } from "./game/world.js";
import { createPlayer, stepPlayer, type PlayerState } from "./game/player.js";
import { createBoss, damageBoss, stepBoss, type BossPhase, type BossState } from "./game/boss.js";
import { certifyWorld, type WorldCertification } from "./game/certify.js";
import { createHud } from "./game/hud.js";
import { loadSave, persistSave, recordSeeds, totalSeeds, type PipSave } from "./game/save.js";
import { worldSpec } from "./game/worlds.js";
import type { ModeId, WorldId } from "./game/types.js";

// --------------------------------------------------------------------- boot

const BOOT_WORLD: WorldId = "w1";

interface WorldRuntime {
  readonly spec: ReturnType<typeof worldSpec>;
  readonly built: BuiltWorld;
  readonly cert: WorldCertification;
}

const cache = new Map<WorldId, WorldRuntime>();
function ensureWorld(id: WorldId): WorldRuntime {
  let w = cache.get(id);
  if (!w) {
    const spec = worldSpec(id);
    const built = buildWorld(spec);
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

let save = loadSave();
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
      pause: ["Escape"]
    },
    axes: {
      moveX: { negative: "left", positive: "right" },
      moveZ: { negative: "down", positive: "up" }
    },
    bufferMs: 140
  },
  hud: { theme: "sci-fi-telemetry", widgets: [] },
  touch: {
    preset: "dpad-2btn",
    // Control-ids: dpad buttons + the left stick's four directions (platform
    // layout ships left/right/dash holds + jump/attack pulses + two sticks).
    bindings: {
      left: "left", right: "right", up: "up", down: "down",
      jump: "jump", dash: "dive", attack: "pound",
      "stick.up": "up", "stick.down": "down",
      "stick.left": "left", "stick.right": "right"
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
      confirm: { id: "confirm", asset: { url: sfxUrl("ui.confirm.00") }, volume: 0.55 }
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
  // A3D_QR_POST is default-on engine-wide, but its LegacyPost lane loses
  // its render targets after any device lifecycle event (remount, resize)
  // on ANGLE/Vulkan and kills presentation — repro'd on aura-links-3d too.
  // Pin it off until the engine-side LDR postprocess defect is fixed.
  qualityRebuild: { flags: ["game", "-compiler", "-vfxFog"] },
  evidence: {
    schema: 1,
    sections: { pipsBigLeap: () => window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__ ?? { status: "unbound" } }
  },
  scene: () => ensureWorld(BOOT_WORLD).built.scene
});

const app = pipsGame.app;
pipsGame.start();

const input = pipsGame.input;
const hud = createHud();
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("platformer");

const locomotion = createLocomotionKit({
  idleClip: PIP_CLIPS.idle,
  walkClip: PIP_CLIPS.walk,
  runClip: PIP_CLIPS.run,
  walkSpeed: 1.4,
  runSpeed: 4.6
});

// ------------------------------------------------------------ node handles

const node = (name: string): AuraRuntimeNodeHandle | null => {
  try {
    return app.nodes.require(name) as AuraRuntimeNodeHandle;
  } catch {
    return null;
  }
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
  run = makeRun(id, mode ?? (id === "academy" ? "academy" : run.mode === "trial" ? "trial" : "quick"));
  const { spec, built } = ensureWorld(id);
  if (mountedWorld !== id) {
    mountedWorld = id;
    // Route swaps through game.setScene so the FX pool, look signature, and
    // first-presented beacon all re-arm per world.
    void pipsGame.setScene(built.scene as unknown as AuraSceneSnapshot).catch(() => undefined);
  } else {
    // Same world: undo the node mutations a run leaves behind — collected
    // pickups, unlocked gate, activated checkpoint flags — without remounting.
    for (const s of spec.seeds) node(nodeName.seed(s.id))?.setVisible(!run.seeds.has(s.id));
    for (const a of spec.acorns) node(nodeName.acorn(a.id))?.setVisible(true);
    for (const h of spec.hearts) node(nodeName.heart(h.id))?.setVisible(true);
    node(nodeName.gateLock)?.setVisible(!run.gateUnlocked);
    for (const cp of spec.checkpoints) {
      (node(nodeName.checkpointFlag(cp.id)) as unknown as { setMaterial(m: unknown): void } | null)?.setMaterial(undefined);
    }
    for (let i = 0; i < 6; i += 1) node(nodeName.bossSpike(i))?.setVisible(false);
  }
  applyStudioColors();
  driveAnimation(run.player, 0);

  // Persisted progress: collected seeds stay gone, and a world the player
  // already seeded open starts with the Sun-Gate unlatched (boss aside).
  for (const sid of run.seeds) node(nodeName.seed(sid))?.setVisible(false);
  if (run.seeds.size >= spec.gateSeeds) {
    run.gateUnlocked = !(spec.boss && run.bossHp > 0);
    if (run.gateUnlocked) node(nodeName.gateLock)?.setVisible(false);
  }

  if (spec.doubleJumpGrant && !save.doubleJump) {
    save = { ...save, doubleJump: true };
    persistSave(save);
    run.save = save;
    hud.toast(spec.unlockHint ?? "Double-jump unlocked!", 4);
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
}

function objectiveText(): string {
  const { spec } = ensureWorld(run.world);
  const need = spec.gateSeeds;
  if (spec.boss && run.bossHp > 0 && run.seeds.size >= need) return `Sun-Gate wants ${need} seeds — but Brambleback guards it. Defeat him!`;
  if (run.seeds.size < need) return `Gather sun-seeds for the Sun-Gate (${run.seeds.size}/${need} needed, ${spec.seedGoal} hidden).`;
  return "The Sun-Gate is open — leap through!";
}

function applyStudioColors(): void {
  node(nodeName.heroCap)?.setMaterial(material.pbr({ color: save.studio.cap, roughness: 0.7 }));
  node(nodeName.heroCape)?.setMaterial(material.pbr({ color: save.studio.cape, roughness: 0.6 }));
}

// ------------------------------------------------------------- event sink

type CueName = Parameters<NonNullable<typeof pipsGame.sound>["cue"]>[0];
const cue = (name: CueName) => void pipsGame.sound?.cue(name);
const juice = (name: "jump" | "double-jump" | "land" | "collect" | "checkpoint" | "hurt" | "gate" | "boss-hit") => pipsGame.juice.fire(name);

function handleEvent(e: import("./game/player.js").PlayerEvent): void {
  const { spec } = ensureWorld(run.world);
  switch (e.kind) {
    case "jump": cue("whoosh"); juice("jump"); break;
    case "double-jump": cue("whoosh"); juice("double-jump"); break;
    case "land": juice("land"); break;
    case "glide-start": cue("whoosh"); break;
    case "dive": cue("whoosh"); break;
    case "pound": break;
    case "pound-land": cue("thud"); juice("land"); break;
    case "spring": cue("bounce"); juice("jump"); break;
    case "swim": cue("bounce"); break;
    case "hurt": case "boss-contact": {
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
      hud.setHearts(run.player.hearts);
      hud.toast("Back to the last checkpoint!", 1.6);
      break;
    }
    case "checkpoint": {
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
      node(nodeName.seed(id))?.setVisible(false);
      save = recordSeeds(save, run.world, [id]);
      persistSave(save);
      run.save = save;
      hud.setSeeds(run.seeds.size, spec.seedGoal);
      hud.setObjective(objectiveText());
      cue("power");
      juice("collect");
      hud.toast(`☀ Sun-seed ${run.seeds.size}/${spec.seedGoal}`, 1.4);
      if (run.seeds.size >= spec.gateSeeds && !run.gateUnlocked) {
        run.gateUnlocked = !(spec.boss && run.bossHp > 0);
        node(nodeName.gateLock)?.setVisible(false);
        if (spec.boss && run.bossHp > 0) {
          hud.toast("The gate hums — but Brambleback bars the way!", 2.6);
        } else {
          hud.toast("The Sun-Gate is open!", 2.4);
        }
        hud.setObjective(objectiveText());
      }
      break;
    }
    case "acorn": {
      const id = e.id ?? "";
      if (run.acorns.has(id)) return;
      run.acorns.add(id);
      run.acornCount += 1;
      node(nodeName.acorn(id))?.setVisible(false);
      hud.setAcorns(run.acornCount);
      cue("coin");
      break;
    }
    case "heart": {
      const id = e.id ?? "";
      if (run.heartsGot.has(id)) return;
      run.heartsGot.add(id);
      node(nodeName.heart(id))?.setVisible(false);
      if (run.player.hearts < 3) {
        run.player.hearts += 1;
        hud.setHearts(run.player.hearts);
      }
      cue("power");
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
        run.gateUnlocked = run.seeds.size >= spec.gateSeeds;
        node(nodeName.gateLock)?.setVisible(false);
        hud.banner("BRAMBLEBACK DOWN!", "The Sun-Gate is unlatched.", 3);
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
  const { spec } = ensureWorld(run.world);
  run.complete = true;
  run.player.state = "celebrate";
  cue("win");
  juice("gate");
  const completed = { ...save.completed, [run.world]: true as const };
  save = { ...save, completed };
  if (run.world === "academy" && !save.academyDone) {
    save = { ...save, academyDone: true };
  }
  let medal = "";
  if (run.mode === "trial") {
    const best = save.bestTimes[run.world];
    if (best === undefined || run.levelTime < best) {
      save = { ...save, bestTimes: { ...save.bestTimes, [run.world]: Math.round(run.levelTime * 10) / 10 } };
    }
    medal = run.levelTime <= spec.medals.gold ? " 🥇 GOLD" : run.levelTime <= spec.medals.silver ? " 🥈 SILVER" : run.levelTime <= spec.medals.bronze ? " 🥉 BRONZE" : "";
  }
  persistSave(save);
  run.save = save;
  const next = nextWorldId(run.world);
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
    next ? `Next — ${worldSpec(next).title}` : "The Vale is saved!"
  );
  const nextBtn = document.getElementById("pbl-next-world") as HTMLButtonElement | null;
  if (nextBtn) nextBtn.disabled = !next;
  hud.banner("SUN-GATE OPENED!", spec.title, 3);
  if (autopilot) {
    window.setTimeout(() => {
      if (autopilot && run.complete) {
        loadWorld(next ?? "w1", run.mode);
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

let autopilot = true;
let aiJumpCooldown = 0;
let aiStuckTimer = 0;
let aiLastZ = 0;

function setAutopilot(next: boolean): void {
  autopilot = next;
  const btn = document.getElementById("aura-btn-auto");
  if (btn) {
    btn.classList.toggle("active", autopilot);
    btn.textContent = autopilot ? "Auto" : "Manual";
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
  air: { clip: PIP_CLIPS.fall },
  jump: { clip: PIP_CLIPS.jump, loop: false },
  glide: { clip: PIP_CLIPS.fall },
  dive: { clip: PIP_CLIPS.fall, speed: 1.6 },
  pound: { clip: PIP_CLIPS.crouch },
  swim: { clip: PIP_CLIPS.walk, speed: 0.7 },
  hurt: { clip: PIP_CLIPS.hurt, loop: false },
  dead: { clip: PIP_CLIPS.die, loop: false },
  celebrate: { clip: PIP_CLIPS.celebrate, loop: false }
};

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
      key === "idle" ? { clip: PIP_CLIPS.idle, speed: 1 }
      : key === "walk" ? { clip: PIP_CLIPS.walk, speed: Math.max(0.6, planar / 2.2) }
      : key === "run" ? { clip: PIP_CLIPS.run, speed: Math.max(0.8, planar / 4.4) }
      : CLIP_FOR[key] ?? { clip: PIP_CLIPS.idle };
    hero.setAnimation({ clip: spec.clip, loop: spec.loop ?? true, speed: spec.speed ?? 1 });
  }

  // Studio accessories track the 1.25m hero; only show glide cape when gliding.
  const cap = node(nodeName.heroCap);
  const cape = node(nodeName.heroCape);
  const fwdX = Math.sin(p.yaw), fwdZ = Math.cos(p.yaw);
  cap?.setVisible(false);
  cape?.setVisible(p.state === "glide");
  const capeLift = p.state === "glide" ? 0.24 : 0;
  cape?.setPosition(p.x - fwdX * 0.22, p.y + 0.72 + capeLift, p.z - fwdZ * 0.22);
  cape?.setRotation(p.state === "glide" ? 1.1 : 0.35, p.yaw, 0);

  // Smooth third-person follow camera behind Pip looking down the platformer path.
  const camFwdX = Math.sin(p.camYaw);
  const camFwdZ = Math.cos(p.camYaw);
  app.camera?.setPose({
    position: [p.x - camFwdX * 4.5, p.y + 2.25, p.z - camFwdZ * 4.5],
    target: [p.x + camFwdX * 3.2, p.y + 0.55, p.z + camFwdZ * 3.2],
    up: [0, 1, 0],
    fov: 52
  });
}

// ----------------------------------------------------------------- overlay

const bind = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener("click", () => { cue("ui"); fn(); });

function setPaused(p: boolean): void {
  run.paused = p;
  hud.showPause(p);
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
      save = { ...save, studio: { ...save.studio, [which]: color } };
      persistSave(save);
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
  bind("pbl-pause-atlas", () => { setPaused(false); showAtlas(true); });
  bind("pbl-pause-studio", () => { setPaused(false); showStudio(true); });
  bind("pbl-atlas-close", () => hud.showAtlas(false));
  bind("pbl-studio-close", () => hud.showStudio(false));
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
  if (autopilot && MANUAL_PLAY_KEYS.has(event.code)) {
    setAutopilot(false);
  }
  if (event.code !== "Escape") return;
  const atlasEl = document.getElementById("pbl-atlas");
  const studioEl = document.getElementById("pbl-studio");
  if (atlasEl && !atlasEl.hidden) { hud.showAtlas(false); return; }
  if (studioEl && !studioEl.hidden) { hud.showStudio(false); return; }
  if (run.complete) return;
  setPaused(!run.paused);
});

app.onFrame(({ dt }: { readonly dt: number }) => {
  const seconds = Math.min(0.05, dt);
  const { built, spec, cert } = ensureWorld(run.world);
  if (run.paused) {
    // Keep the evidence global honest while the sim is suspended.
    const prior = window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__;
    window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__ = { ...prior, status: "paused", paused: true };
    return;
  }
  run.worldClock += seconds;

  // Boss brain first — the player sim needs its pose this frame.
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

  // Player sim — sync the virtual sticks into the shared input controller
  // first. createGame mounts touch but doesn't tick it per frame; `update`
  // exists on the concrete mount but not the public TouchControls contract.
  (pipsGame.touch as { update?: () => void } | null)?.update?.();
  const manualMoveX = input?.axis("moveX") ?? 0;
  const manualMoveZ = input?.axis("moveZ") ?? 0;
  const manualJumpPressed = input?.pressed("jump") ?? false;
  const manualJumpHeld = input?.held("jump") ?? false;
  const manualDivePressed = input?.pressed("dive") ?? false;
  const manualPoundPressed = input?.pressed("pound") ?? false;
  if (
    autopilot &&
    (Math.abs(manualMoveX) > 0.15 ||
      Math.abs(manualMoveZ) > 0.15 ||
      manualJumpPressed ||
      manualDivePressed ||
      manualPoundPressed)
  ) {
    setAutopilot(false);
  }
  const playerInput = autopilot
    ? computeAutopilotInput(built, spec, seconds, bossVulnerable, bossAt)
    : {
        moveX: manualMoveX,
        moveZ: manualMoveZ,
        jumpPressed: manualJumpPressed,
        jumpHeld: manualJumpHeld,
        divePressed: manualDivePressed,
        poundPressed: manualPoundPressed
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

  // Death → restart at spawn with full hearts.
  if (run.player.state === "dead" && run.deadTimer > 0) {
    run.deadTimer -= seconds;
    if (run.deadTimer <= 0) {
      const fresh = createPlayer(built);
      run.player.x = fresh.x; run.player.y = fresh.y; run.player.z = fresh.z;
      run.player.vx = 0; run.player.vy = 0; run.player.vz = 0;
      run.player.yaw = fresh.yaw; run.player.camYaw = fresh.camYaw;
      run.player.hearts = 3;
      run.player.state = "grounded";
      run.player.invuln = 1.6;
      run.player.checkpoint = fresh.checkpoint;
      hud.setHearts(3);
      hud.toast("Pip's back up!", 1.4);
    }
  }

  // World clock + platform motion + pickup spin.
  if (!run.complete && run.player.state !== "dead") run.levelTime += seconds;
  tickPlatforms(built, run.worldClock, (name) => node(name));
  for (const n of built.spinNodes) {
    const h = node(n);
    if (h && h.visible !== false) h.setRotation(0, run.worldClock * 1.8, 0);
  }

  driveAnimation(run.player, seconds);
  feel.update(seconds * 1000);
  hud.setTimer(run.levelTime, run.mode === "trial" ? spec.medals : undefined);

  // ------------------------------------------------------- evidence global
  const motion = built.motion;
  window.__AURA3D_SHOWCASE_PIPS_BIG_LEAP__ = {
    status: "running",
    paused: false,
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
    camera: { rig: "shoulder:pip", presented: Boolean(app.camera?.presented()), camYaw: Number(run.player.camYaw.toFixed(3)) },
    motion: {
      gravity: Number(motion.tuning.gravity.toFixed(3)),
      jumpVelocity: Number(motion.tuning.jumpVelocity.toFixed(3)),
      moveSpeed: Number(motion.tuning.moveSpeed.toFixed(3)),
      coyoteMs: motion.tuning.coyoteMs,
      jumpBufferMs: motion.tuning.jumpBufferMs,
      reportOk: motion.report.passes,
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
    save: { worldsDone: Object.keys(save.completed).length, academyDone: save.academyDone, doubleJump: save.doubleJump, studio: save.studio },
    hero: { assetId: "pipsPip", hash: assets.pip.hash, clips: Object.values(PIP_CLIPS) },
    bossAsset: run.boss ? { assetId: "pipsBrambleback", hash: assets.boss.hash, clips: Object.values(BOSS_CLIPS) } : null
  };
});

// -------------------------------------------------------------------- wire

bindShell();
hud.setMode(run.mode);
hud.setHearts(3);
hud.setWorld(worldSpec(run.world).title);
hud.setSeeds(0, worldSpec(run.world).seedGoal);
hud.renderAtlas(save);
hud.renderStudio(save, () => {});
loadWorld(BOOT_WORLD, "quick");
document.body.setAttribute("data-aura3d-ready", "true");
window.addEventListener("error", () => {
  document.getElementById("render-error")?.removeAttribute("hidden");
});

try {
  const freezeMs = Number(new URLSearchParams(window.location.search).get("freeze"));
  if (Number.isFinite(freezeMs) && freezeMs > 0) {
    window.setTimeout(() => {
      run.paused = true;
    }, freezeMs);
  }
} catch {
  // Ignore URL parsing errors.
}
