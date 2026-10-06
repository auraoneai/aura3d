// apps/showcase-orbital-defense/src/v2/boot.ts — Orbital Defense v2 shell (T2.1).
// §6.9.4 F-tier full rebuild directly on createGame (does not wait for the
// PRD-13 arena-shooter template — R-14-08). The pure wave/heat/shield rules
// in src/gameplay/waves.ts are kept verbatim; the shell owns scene, camera,
// VFX glue, HUD and evidence.
import { createGame } from "@aura3d/game";
import { scene, camera as cameraNodes, postPresets } from "@aura3d/engine";
import {
  createWaveState, updateWaves, resetGame, polar, playerRadius,
  shieldIds, type WaveState
} from "../gameplay/waves";
import { orbitalEnvironment, orbitalLights } from "./scene/lighting";
import { orbitalWorldNodes, orbitalCombatNodes, STATION_NODE } from "./scene/world";
import { createOrbitalRig } from "./scene/camera";
import { orbitalFxFrame, explosionsLive } from "./scene/fx";
import { publishOrbitalEvidence } from "./evidence";
import { applyOrbitalScenario } from "./scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_ORBITAL_DEFENSE" as const;
const EXPOSURE_EV = 0;
const audioCueLog: string[] = [];
const pushCue = (cue: string) => {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
};

const target = document.getElementById("app") ?? document.body;
const wave = createWaveState();

function fallbackCameraNode() {
  return cameraNodes.perspective({
    position: [0, -8, 4.5],
    target: [0, 0, 0],
    fov: 42
  });
}

function buildScene() {
  return scene()
    .background("#050810")
    .camera(fallbackCameraNode())
    .addMany(orbitalWorldNodes())
    .addMany(orbitalCombatNodes())
    .addMany(orbitalLights())
    .add(orbitalEnvironment());
}

const input = { left: false, right: false, fire: false, shield: false };
const onKey = (ev: KeyboardEvent, down: boolean) => {
  switch (ev.code) {
    case "KeyA": case "ArrowLeft": input.left = down; break;
    case "KeyD": case "ArrowRight": input.right = down; break;
    case "Space": input.fire = down; if (down) ev.preventDefault(); break;
    case "KeyQ": if (down) input.shield = true; break;
    case "KeyR": if (down) resetGame(wave); break;
    case "KeyP": case "Escape":
      if (down) game.session.paused ? game.session.resume() : game.session.pause("user");
      break;
    default: break;
  }
};
window.addEventListener("keydown", (e) => onKey(e, true));
window.addEventListener("keyup", (e) => onKey(e, false));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

const game = createGame({
  id: "showcase-orbital-defense",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "score", kind: "text", anchor: "top-left", label: "SCORE" },
      { id: "wave", kind: "text", anchor: "top", label: "WAVE" },
      { id: "integrity", kind: "bar", anchor: "top-right", label: "PLANET" },
      { id: "heat", kind: "bar", anchor: "bottom-left", label: "HEAT" },
      { id: "shield", kind: "text", anchor: "bottom-right", label: "SHIELD" }
    ]
  },
  touch: {
    preset: "twin-stick",
    bindings: {
      rotate: "stick-left", fire: "stick-right", shield: "btn-a", pause: "menu"
    }
  },
  sound: {
    cues: {
      fire: { asset: "laser", variants: 3 },
      explosion: { asset: "explosion", variants: 3 },
      shield: { asset: "shield-hit", variants: 2 },
      bed: { asset: "space-hum", variants: 1 },
      music: { asset: "orbital-music", variants: 1 }
    }
  },
  juice: {
    "multi-kill-hit-stop": { duration: 0.04 },
    "shield-hit-trauma": { trauma: 0.14 },
    "planet-hit-trauma": { trauma: 0.28 }
  },
  qualityRebuild: { flags: [ROUTE_FLAG] }
});

const rig = createOrbitalRig();
const prevActive = new Map<string, boolean>();

game.app.onFrame?.(({ dt }) => {
  const sdt = game.session.scaledDt(dt);
  if (sdt <= 0 || game.session.paused) return;

  const wasFireHeld = input.fire;
  updateWaves(wave, sdt, {
    rotate: (input.left ? 1 : 0) - (input.right ? 1 : 0),
    fire: input.fire,
    shield: input.shield
  });
  input.shield = false;
  if (input.fire && !wasFireHeld) pushCue("fire");

  // Diff enemy deaths / planet hits for fx.
  const kills: { id: string; pos: readonly [number, number, number] }[] = [];
  const planetHits: { id: string; pos: readonly [number, number, number] }[] = [];
  for (const e of wave.enemies) {
    const was = prevActive.get(e.id) ?? false;
    if (was && !e.active) {
      const pos = polar(e.angle, Math.max(e.radius, 0.4), 0);
      if (e.health <= 0) { kills.push({ id: e.id, pos }); pushCue("explosion"); }
      else { planetHits.push({ id: e.id, pos }); pushCue("shield"); }
    }
    prevActive.set(e.id, e.active);
  }
  const shieldHits = wave.player.shieldPulses.map((p) => ({
    pos: polar(p.angle, playerRadius, 0.12) as readonly [number, number, number]
  }));
  const playerPos = polar(wave.player.angle, playerRadius, 0);
  orbitalFxFrame(
    { game: { fx: game.fx, session: game.session }, app: game.app },
    { kills, planetHits, shieldHits, firedThisFrame: input.fire, playerPos },
    sdt
  );

  // Runtime node sync: station (4 parts), enemies, bolts, shield shells.
  syncNodes(wave, playerPos);

  game.hud.set("score", `${wave.score}`);
  game.hud.set("wave", `${wave.wave}`);
  game.hud.set("integrity", `${Math.max(0, Math.round(wave.planetIntegrity))}%`);
  game.hud.set("heat", `${Math.round(wave.player.heat)}%`);
  game.hud.set("shield", wave.player.shieldCooldown <= 0 ? "READY" : `${wave.player.shieldCooldown.toFixed(1)}s`);
});

function syncNodes(state: WaveState, playerPos: readonly [number, number, number]): void {
  const n = game.app.nodes;
  const hub = n.get(`${STATION_NODE}-hub`);
  const barrel = n.get(`${STATION_NODE}-barrel`);
  const wl = n.get(`${STATION_NODE}-wing-l`);
  const wr = n.get(`${STATION_NODE}-wing-r`);
  if (hub && barrel && wl && wr) {
    const a = state.player.angle;
    hub.setPosition(playerPos[0], playerPos[1], playerPos[2]);
    barrel.setPosition(playerPos[0], playerPos[1], playerPos[2] + 0.16);
    // Barrel points radially outward (toward enemies).
    barrel.setRotation(0, 0, a + Math.PI / 2);
    const tx = -Math.sin(a), ty = Math.cos(a);
    wl.setPosition(playerPos[0] + tx * 0.24, playerPos[1] + ty * 0.24, playerPos[2]);
    wr.setPosition(playerPos[0] - tx * 0.24, playerPos[1] - ty * 0.24, playerPos[2]);
    wl.setRotation(0, 0, a);
    wr.setRotation(0, 0, a);
  }
  for (const e of state.enemies) {
    const node = n.get(e.id);
    if (!node) continue;
    if (e.active) {
      const p = polar(e.angle, e.radius, 0);
      node.setPosition(p[0], p[1], p[2]);
      node.setRotation(0, 0, e.angle + Math.PI / 2);
    } else {
      node.setPosition(0, 0, -40);
    }
  }
  for (const p of state.projectiles) {
    const node = n.get(p.id);
    if (!node) continue;
    if (p.active) {
      const pos = polar(p.angle, p.radius, 0.05);
      node.setPosition(pos[0], pos[1], pos[2]);
      node.setRotation(0, 0, p.angle + Math.PI / 2);
    } else {
      node.setPosition(0, 0, -40);
    }
  }
  state.player.shieldPulses.forEach((pulse, i) => {
    const node = n.get(shieldIds[i]);
    if (!node) return;
    const p = polar(pulse.angle, playerRadius + 0.35, 0.1);
    node.setPosition(p[0], p[1], p[2]);
    node.setScale?.(0.4 + (1.2 - pulse.ttl) * 0.9);
  });
  for (let i = state.player.shieldPulses.length; i < shieldIds.length; i += 1) {
    n.get(shieldIds[i])?.setPosition(0, 0, -40);
  }
}

let frame = 0;
game.app.onRender?.(() => { frame += 1; });
game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(rig, { blend: 0.4 });
  void postPresets["space"];
  game.app.setOutput?.({ toneMapping: "aces", exposure: 2 ** EXPOSURE_EV });

  const scenario = new URL(location.href).searchParams.get("scenario");
  if (scenario) applyOrbitalScenario(scenario, wave);

  publishOrbitalEvidence({
    game,
    app: () => game.app,
    wave: () => wave,
    appliedLook: { preset: "space", toneMapping: "aces", exposureEV: EXPOSURE_EV },
    explosionsLive: () => explosionsLive(game.fx.liveCount),
    audioCueLog: () => audioCueLog,
    bootedAtMs: performance.now(),
    frameCount: () => frame
  });

  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt: performance.now(),
    sessionStartedAt: performance.now()
  };
});
