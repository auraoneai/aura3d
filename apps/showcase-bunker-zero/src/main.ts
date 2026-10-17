/**
 * Bunker Zero — six-floor retro corridor FPS on Aura3D.
 * Real extruded 3D corridors from ASCII grids (instanced boxes — NOT a raycaster),
 * pointer-lock FPS controller, 4 weapons, 3 enemy archetypes + Iron Warden boss,
 * push-wall secrets, key→elevator progression, Kill House skill mode,
 * deterministic ?demo=1 playback, JSON evidence on window.__gameEvidence.
 */
import {
  camera, effects, game, gameFeel, lights, looks, material, model,
  primitives, scene, type AuraNodeBuilder, type AuraSceneNode
} from "@aura3d/engine";
// `@aura3d/engine/game` is missing from vite.aliases.generated (stale); the
// app vite.config maps `@aura3d/game` -> packages/game/src/index.ts directly.
import { createGame, sfxUrl } from "@aura3d/game";
import { assets } from "./aura-assets";
import { CELL, WALL_H, SILO_H, FLOORS, KILL_HOUSE, type FloorDef } from "./maps";
import {
  createSim, cellCenter, WEAPONS, type Sim, type SimInput, type WeaponId
} from "./sim";

declare global {
  interface Window { __gameEvidence?: unknown; __AURA3D_ROUTE_READY__?: unknown }
}

// Ensure A3D_QR_COMPILER is disabled by default so environment lighting is preserved
// without requiring ?a3d-qr=-compiler in the browser URL.
{
  const url = new URL(window.location.href);
  const qr = url.searchParams.get("a3d-qr") ?? "";
  if (!qr.includes("compiler")) {
    url.searchParams.set("a3d-qr", qr ? `${qr},-compiler` : "game,-compiler");
    window.history.replaceState(null, "", url.toString());
  }
}

const DEMO = new URLSearchParams(location.search).has("demo");
let autoPilot = true;
const LOOK_ID = "night-city" as const;
const EYE = 1.55;
const FLOOR_SPAN = 300;
const ALL_FLOORS: { def: FloorDef; slot: number }[] = [
  ...FLOORS.map((def, i) => ({ def, slot: i })),
  { def: KILL_HOUSE, slot: 6 }
];

// ---------------------------------------------------------------------------
// deterministic jitter for wall tint variation
const hash2 = (x: number, z: number) => {
  let h = (x * 374761393 + z * 668265263) ^ 0x5bf03635;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// ---------------------------------------------------------------------------
// scene graph — everything exists from boot; runtime nodes move per frame
function cellX(slot: number, cx: number) { return cellCenter(cx) + slot * FLOOR_SPAN; }

function buildScene() {
  const b = scene().add(looks.preset(LOOK_ID, { fogDensityScale: 0.32, exposureEv: 0.55 }));
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    lights.ambient({ name: "bunker ambient", color: "#dce6f7", intensity: 1.55 }),
    lights.hemisphere({ name: "bunker hemi", skyColor: "#9cc0ee", groundColor: "#5c4d3c", intensity: 1.4, position: [0, 12, 0] }),
    lights.directional({ name: "bunker key light", color: "#fff2d8", intensity: 2.1, position: [18, 34, 14] }),
    lights.point({ name: "player tactical light", color: "#fff4dc", intensity: 6.8, distance: 32, decay: 1.15, position: [4.5, EYE + 0.3, 4.5] })
      .runtime(game.runtimeNode("player-light", { tags: ["vfx"] })),
    lights.point({ name: "player ahead light", color: "#ffd89a", intensity: 4.8, distance: 26, decay: 1.2, position: [10.5, EYE + 0.5, 4.5] })
      .runtime(game.runtimeNode("player-ahead-light", { tags: ["vfx"] }))
  ];

  for (const { def, slot } of ALL_FLOORS) {
    const rows = def.rows;
    const h = rows.length, w = rows[0].length;
    const wallH = def.id === 5 ? SILO_H : WALL_H;
    const wallMat = material.pbr({ color: shade(def.palette.wall, 0.14), roughness: 0.68, metalness: 0.12 });
    const altMat = material.pbr({ color: shade(def.palette.wallAlt, 0.16), roughness: 0.62, metalness: 0.18 });
    const wallInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const wallCol: string[] = [];
    const altInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const altCol: string[] = [];
    const faltInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];

    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = rows[z][x];
      const wx = cellX(slot, x), wz = cellCenter(z);
      if (ch === "#" || ch === " " || ch === "P") {
        if (ch === "P") continue; // push-walls are runtime nodes
        const j = (hash2(x, z) - 0.5) * 0.14;
        wallInst.push({ position: [wx, wallH / 2, wz], scale: [CELL, wallH, CELL] });
        wallCol.push(shade(def.palette.wall, 0.12 + j));
      } else if (ch === "%") {
        altInst.push({ position: [wx, wallH / 2, wz], scale: [CELL, wallH, CELL] });
        altCol.push(shade(def.palette.wallAlt, 0.14 + (hash2(x, z) - 0.5) * 0.1));
      } else if (ch === ",") {
        faltInst.push({ position: [wx, 0.04, wz], scale: [CELL, 0.08, CELL] });
      }
    }
    nodes.push(
      // structural walls — one instanced draw call per material group
      primitives.box({ name: `f${slot} walls`, material: wallMat, instances: wallInst, instanceColors: wallCol }),
      primitives.box({ name: `f${slot} accent`, material: altMat, instances: altInst, instanceColors: altCol }),
      // slab floor + high vaulted ceiling so directional/sky fill illuminates the corridors
      primitives.box({ name: `f${slot} floor`, size: [w * CELL, 0.3, h * CELL], position: [slot * FLOOR_SPAN + w * CELL / 2, -0.15, h * CELL / 2], material: material.pbr({ color: shade(def.palette.floor, 0.15), roughness: 0.78, metalness: 0.08 }) }),
      primitives.box({ name: `f${slot} ceil`, size: [w * CELL, 0.24, h * CELL], position: [slot * FLOOR_SPAN + w * CELL / 2, wallH + 4.5, h * CELL / 2], material: material.emissive({ color: shade(def.palette.ceil, 0.2), emissive: def.palette.accent, emissiveIntensity: 0.18, roughness: 0.85 }) })
    );
    if (faltInst.length) {
      nodes.push(primitives.box({
        name: `f${slot} floor-alt`, instances: faltInst,
        material: def.palette.floorEmissive
          ? material.emissive({ color: def.palette.floorAlt, emissive: def.palette.floorEmissive, emissiveIntensity: 1.6, roughness: 0.4 })
          : material.pbr({ color: def.palette.floorAlt, roughness: 0.75 })
      }));
    }
    // ---- per-cell runtime 3D Meshy entities & props -----------------------
    let dI = 0, pI = 0, eI = 0, kI = 0;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = rows[z][x];
      const wx = cellX(slot, x), wz = cellCenter(z);
      switch (ch) {
        case "D":
          nodes.push(
            model(assets.pulseNeonGateArchMeshy, { name: `f${slot} door ${dI}`, targetHeight: wallH * 0.96 })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-door-${x}-${z}`, { tags: ["door"] }))
          );
          dI++;
          break;
        case "P": {
          // push block — 3D Meshy reinforced bunker cover wall + glowing secret beacon
          const side = pushFace(rows, x, z);
          nodes.push(
            model(assets.fpsSciFiCoverCrateMeshy, { name: `f${slot} push ${pI}`, targetHeight: wallH * 0.92 })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-pw-${x}-${z}`, { tags: ["pushwall"] })),
            model(assets.auroraPadBeacon, { name: `f${slot} crack ${pI}`, targetHeight: 0.85 })
              .position(wx + side[0] * CELL * 0.44, 0.2, wz + side[1] * CELL * 0.44)
              .runtime(game.runtimeNode(`f${slot}-crack-${x}-${z}`, { tags: ["crack"] }))
          );
          pI++;
          break;
        }
        case "E":
          nodes.push(
            model(assets.pulseNeonGateArchMeshy, { name: `f${slot} exit`, targetHeight: wallH * 0.98 })
              .position(wx, 0, wz),
            model(assets.auroraPadBeacon, { name: `f${slot} exitpost`, targetHeight: 1.5 })
              .position(wx, 0.05, wz)
          );
          break;
        case "K":
          nodes.push(
            model(assets.bunkerKeyMeshy, { name: `f${slot} key`, material: material.emissive({ color: "#ffd76a", emissive: "#ff9d2a", emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.3 }) })
              .position(wx, 1.1, wz).scale(0.18)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "key"] }))
          );
          break;
        case "t": case "T":
          nodes.push(
            model(assets.bunkerTreasureMeshy, {
              name: `f${slot} treasure ${kI}`,
              material: material.emissive({ color: "#c9a227", emissive: "#ffd76a", emissiveIntensity: ch === "T" ? 2.6 : 1.6, metalness: 0.9, roughness: 0.25 })
            })
              .position(wx, 0.55, wz).scale(ch === "T" ? 0.38 : 0.28)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "treasure"] }))
          );
          kI++;
          break;
        case "+": case "*":
          nodes.push(
            model(assets.fpsEnergyCorePickupMeshy, { name: `f${slot} medkit ${x}-${z}`, targetHeight: 0.82 })
              .position(wx, 0.45, wz)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "health"] }))
          );
          break;
        case "a":
          nodes.push(
            model(assets.corridorFireAmmoCrateMeshy, { name: `f${slot} ammo`, material: material.emissive({ color: "#8a9a4a", emissive: "#5a6a2a", emissiveIntensity: 0.5 }) })
              .position(wx, 0.0, wz).scale(0.42)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "ammo"] }))
          );
          break;
        case "r":
          nodes.push(
            model(assets.bunkerArmorMeshy, { name: `f${slot} armor`, material: material.emissive({ color: "#4a7a9a", emissive: "#3a8aaa", emissiveIntensity: 1.2 }) })
              .position(wx, 0.0, wz).scale(0.36)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "armor"] }))
          );
          break;
        case "w":
          nodes.push(
            model(assets.corridorPulseRifleMeshy, { name: `f${slot} mgpickup`, material: material.emissive({ color: "#4a5a6a", emissive: "#7dfcff", emissiveIntensity: 1.0 }) })
              .position(wx, 0.55, wz).rotate(0, 0.7, 0).scale(0.48)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "weapon"] }))
          );
          break;
        case "W":
          nodes.push(
            model(assets.corridorPulseRifleMeshy, { name: `f${slot} rocketpickup`, material: material.emissive({ color: "#6a4a3a", emissive: "#ff8a3a", emissiveIntensity: 1.2 }) })
              .position(wx, 0.55, wz).rotate(0, -0.7, 0).scale(0.6)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "weapon"] }))
          );
          break;
        case "b":
          nodes.push(
            model(assets.bunkerBarrelMeshy, { name: `f${slot} barrel ${x}-${z}`, material: material.emissive({ color: "#9a3420", emissive: "#c44a22", emissiveIntensity: 0.45, roughness: 0.5 }) })
              .position(wx, 0, wz).scale(0.88)
              .runtime(game.runtimeNode(`f${slot}-prop-${x}-${z}`, { tags: ["prop", "barrel"] }))
          );
          break;
        case "c":
          nodes.push(
            model(assets.bunkerCrateMeshy, { name: `f${slot} crate ${x}-${z}` })
              .position(wx, 0, wz).scale(0.72)
              .runtime(game.runtimeNode(`f${slot}-prop-${x}-${z}`, { tags: ["prop", "crate"] }))
          );
          break;
        case "o":
          nodes.push(
            model(assets.blockfallReactorContainmentPylonMeshy, { name: `f${slot} column ${x}-${z}`, targetHeight: wallH })
              .position(wx, 0, wz)
          );
          break;
        case "g":
          nodes.push(
            model(assets.bunkerGuardMeshy, { name: `f${slot} guard ${eI}`, targetHeight: 1.9 })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-en-${x}-${z}`, { tags: ["enemy", "guard"] }))
          );
          eI++;
          break;
        case "d":
          nodes.push(
            model(assets.bunkerHoundMeshy, {
              name: `f${slot} hound ${eI}`, targetHeight: 1.05
            })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-en-${x}-${z}`, { tags: ["enemy", "dog"] }))
          );
          eI++;
          break;
        case "G":
          nodes.push(
            model(assets.bunkerGunnerMeshy, {
              name: `f${slot} gunner ${eI}`, targetHeight: 2.0
            })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-en-${x}-${z}`, { tags: ["enemy", "gunner"] }))
          );
          eI++;
          break;
        case "B":
          nodes.push(
            model(assets.bunkerWardenMeshy, {
              name: `f${slot} boss ${eI}`, targetHeight: 3.1
            })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-en-${x}-${z}`, { tags: ["enemy", "boss"] }))
          );
          eI++;
          break;
      }
    }
  }

  // ---- player rig: 3D Meshy viewmodels + muzzle flash + pooled FX ---------
  nodes.push(
    model(assets.mechWeaponA, { name: "vm knife", targetHeight: 0.34 })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("vm-knife", { tags: ["viewmodel"] })),
    model(assets.corridorPulseRifleMeshy, { name: "vm pistol" })
      .position(0, 0, 0).scale(0.32)
      .runtime(game.runtimeNode("vm-pistol", { tags: ["viewmodel"] })),
    model(assets.corridorPulseRifleMeshy, { name: "vm mg" })
      .position(0, 0, 0).scale(0.45)
      .runtime(game.runtimeNode("vm-mg", { tags: ["viewmodel"] })),
    model(assets.mechWeaponB, { name: "vm rocket", targetHeight: 0.48 })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("vm-rocket", { tags: ["viewmodel"] })),
    model(assets.corridorMuzzleFlameBurstMeshy, {
      name: "muzzle flash", material: material.emissive({ color: "#ffd27a", emissive: "#ff9a2a", emissiveIntensity: 5, roughness: 0.3 })
    }).position(0, -50, 0).scale(0.3)
      .runtime(game.runtimeNode("muzzle-flash", { tags: ["vfx"] })),
    lights.point({ name: "muzzle light", color: "#ffb648", intensity: 0, distance: 12, decay: 2, position: [0, -50, 0] })
      .runtime(game.runtimeNode("muzzle-light", { tags: ["vfx"] })),
    lights.point({ name: "boom light", color: "#ff6a2a", intensity: 0, distance: 18, decay: 2, position: [0, -50, 0] })
      .runtime(game.runtimeNode("boom-light", { tags: ["vfx"] }))
  );
  for (let i = 0; i < 8; i++)
    nodes.push(
      model(assets.corridorMuzzleFlameBurstMeshy, { name: `spark ${i}`, material: material.emissive({ color: "#ffca7a", emissive: "#ff9a3a", emissiveIntensity: 6 }) })
        .position(0, -50, 0).scale(0.14)
        .runtime(game.runtimeNode(`spark-${i}`, { tags: ["vfx"] }))
    );
  for (let i = 0; i < 6; i++)
    nodes.push(
      model(assets.corridorMuzzleFlameBurstMeshy, { name: `boom ${i}`, material: material.emissive({ color: "#ff7a2a", emissive: "#ff5a1a", emissiveIntensity: 4 }) })
        .position(0, -50, 0).scale(0.6)
        .runtime(game.runtimeNode(`boom-${i}`, { tags: ["vfx"] })),
      model(assets.corridorFireAmmoBoltMeshy, { name: `rocket ${i}`, material: material.emissive({ color: "#ffd27a", emissive: "#ff7a1a", emissiveIntensity: 7 }) })
        .position(0, -50, 0).scale(0.28)
        .runtime(game.runtimeNode(`rocket-${i}`, { tags: ["vfx"] }))
    );

  return b
    .addMany(nodes)
    .add(effects.fog({ color: "#1c2432", density: 0.011 }))
    .add(effects.filmGrain({ intensity: 0.03 }))
    .add(effects.vignette({ intensity: 0.18 }))
    .add(effects.bloom({ threshold: 1.0, intensity: 0.42 }))
    .camera(camera.perspective({ position: [4.5, EYE, 4.5], target: [12.5, EYE, 4.5], fov: 72 }));
}

// crack cue faces the first open neighbor
function pushFace(rows: readonly string[], x: number, z: number): [number, number] {
  const at = (x2: number, z2: number) => rows[z2]?.[x2] ?? " ";
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const c = at(x + dx, z + dz);
    if (c !== "#" && c !== "%" && c !== " " && c !== "P") return [-dx, -dz];
  }
  return [0, 0];
}
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt * 255));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt * 255));
  const b = Math.max(0, Math.min(255, (n & 255) + amt * 255));
  return `#${((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// audio cues — game-sfx-core pack (served under /packs/)
const CUES = {
  pistol: { id: "pistol", asset: { url: sfxUrl("explosion.laser.00", "opus.webm") }, volume: 0.5, bus: "sfx" },
  mg: { id: "mg", asset: { url: sfxUrl("explosion.zap.00", "opus.webm") }, volume: 0.4, bus: "sfx" },
  rocket: { id: "rocket", asset: { url: sfxUrl("explosion.large.00", "opus.webm") }, volume: 0.8, bus: "sfx" },
  knife: { id: "knife", asset: { url: sfxUrl("whoosh.swing-light.00", "opus.webm") }, volume: 0.6, bus: "sfx" },
  dry: { id: "dry", asset: { url: sfxUrl("ui.error.00", "opus.webm") }, volume: 0.5, bus: "ui" },
  reload: { id: "reload", asset: { url: sfxUrl("ui.toggle.00", "opus.webm") }, volume: 0.6, bus: "ui" },
  hit: { id: "hit", asset: { url: sfxUrl("impact.flesh.medium.00", "opus.webm") }, volume: 0.55, bus: "sfx" },
  kill: { id: "kill", asset: { url: sfxUrl("creature.grunt-heavy.00", "opus.webm") }, volume: 0.65, bus: "sfx" },
  hurt: { id: "hurt", asset: { url: sfxUrl("impact.flesh.heavy.00", "opus.webm") }, volume: 0.6, bus: "sfx" },
  bite: { id: "bite", asset: { url: sfxUrl("impact.flesh.light.00", "opus.webm") }, volume: 0.7, bus: "sfx" },
  boom: { id: "boom", asset: { url: sfxUrl("explosion.medium.00", "opus.webm") }, volume: 0.75, bus: "sfx" },
  step: { id: "step", asset: { url: sfxUrl("footsteps.concrete.00", "opus.webm") }, volume: 0.28, bus: "sfx" },
  secret: { id: "secret", asset: { url: sfxUrl("stinger.checkpoint.00", "opus.webm") }, volume: 0.8, bus: "ui" },
  pickup: { id: "pickup", asset: { url: sfxUrl("pickup.coin.00", "opus.webm") }, volume: 0.55, bus: "ui" },
  key: { id: "key", asset: { url: sfxUrl("ui.unlock.00", "opus.webm") }, volume: 0.8, bus: "ui" },
  weapon: { id: "weapon", asset: { url: sfxUrl("pickup.power-up.00", "opus.webm") }, volume: 0.7, bus: "ui" },
  door: { id: "door", asset: { url: sfxUrl("impact.metal.medium.00", "opus.webm") }, volume: 0.4, bus: "sfx" },
  alert: { id: "alert", asset: { url: sfxUrl("creature.grunt-light.00", "opus.webm") }, volume: 0.5, bus: "sfx" },
  boss: { id: "boss", asset: { url: sfxUrl("stinger.alarm.00", "opus.webm") }, volume: 0.7, bus: "sfx" },
  win: { id: "win", asset: { url: sfxUrl("stinger.win.00", "opus.webm") }, volume: 0.9, bus: "ui" },
  lose: { id: "lose", asset: { url: sfxUrl("stinger.lose.00", "opus.webm") }, volume: 0.8, bus: "ui" },
  switch: { id: "switch", asset: { url: sfxUrl("ui.click.00", "opus.webm") }, volume: 0.5, bus: "ui" },
  ambience: { id: "ambience", asset: { url: sfxUrl("ambience.interior-hum", "opus.webm") }, volume: 0.32, loop: true, bus: "ambience" }
} as const;
type CueId = keyof typeof CUES;

// ---------------------------------------------------------------------------
const inputOptions = {
  actions: {
    forward: ["KeyW", "ArrowUp"],
    back: ["KeyS", "ArrowDown"],
    strafeLeft: ["KeyA"],
    strafeRight: ["KeyD"],
    turnLeft: ["ArrowLeft"],
    turnRight: ["ArrowRight"],
    fire: ["Space"],
    reload: ["KeyR"],
    use: ["KeyE"],
    weapon1: ["Digit1"], weapon2: ["Digit2"], weapon3: ["Digit3"], weapon4: ["Digit4"],
    sprint: ["ShiftLeft", "ShiftRight"],
    map: ["KeyM", "Tab"],
    pause: ["Escape", "KeyP"]
  },
  axes: {
    moveZ: { negative: "back", positive: "forward" },
    moveX: { negative: "strafeLeft", positive: "strafeRight" },
    turn: { negative: "turnLeft", positive: "turnRight" }
  },
  bufferMs: { fire: 120, use: 160, reload: 160 },
  pointer: true
} as const;

const mg = createGame({
  id: "showcase-bunker-zero",
  target: "#app",
  autoStart: true,
  scene: buildScene,
  input: inputOptions,
  sound: { cues: { ...CUES } },
  juice: {
    fire: { shake: 0.06 },
    kill: { punch: { fovDeg: 2.2, ms: 180 } },
    hurt: { shake: 0.5, flash: { color: "#c22a1f", peak: 0.3, ms: 260 } },
    secret: { punch: { fovDeg: 1.6, ms: 280 }, flash: { color: "#ffb648", peak: 0.12, ms: 300 } },
    win: { punch: { fovDeg: 2.6, ms: 420 }, flash: { color: "#ffd76a", peak: 0.2, ms: 500 } }
  },
  qualityRebuild: { flags: ["game", "-compiler"] },
  evidence: { schema: 1, sections: { bunkerZero: () => window.__gameEvidence ?? { status: "unbound" } } }
});
const app = mg.app;
mg.start();
const input = mg.input!;
const feel = gameFeel.create({ app, time: app.time });

// ---------------------------------------------------------------------------
// sim + node-handle caches
let sim: Sim;
let mode: "descent" | "killhouse" = "descent";
let floorIdx = 0;
let camoTint = "#ffb648";
let dogtag = "RAZOR-6";
const nodeCache = new Map<string, ReturnType<typeof app.nodes.require>>();
function req(id: string) {
  let n = nodeCache.get(id);
  if (!n) { n = app.nodes.require(id); nodeCache.set(id, n); }
  return n;
}
const vmNodes = { knife: req("vm-knife"), pistol: req("vm-pistol"), mg: req("vm-mg"), rocket: req("vm-rocket") };
const muzzleFlash = req("muzzle-flash");
const muzzleLight = req("muzzle-light");
const boomLight = req("boom-light");
const playerLight = req("player-light");
const playerAheadLight = req("player-ahead-light");
const sparkNodes = Array.from({ length: 8 }, (_, i) => req(`spark-${i}`));
const boomNodes = Array.from({ length: 6 }, (_, i) => req(`boom-${i}`));
const rocketNodes = Array.from({ length: 6 }, (_, i) => req(`rocket-${i}`));

function startFloor(idx: number, m: "descent" | "killhouse") {
  mode = m;
  floorIdx = idx;
  const def = m === "killhouse" ? KILL_HOUSE : FLOORS[idx];
  sim = createSim(def, { ox: (m === "killhouse" ? 6 : idx) * FLOOR_SPAN, mode: m, seed: 1337 + idx * 97 + (m === "killhouse" ? 7 : 0) });
  hideAllRuntime();
  bindFloor();
  lastEventIdx = 0;
  banner(`FLOOR ${def.id + 1} — ${def.name.toUpperCase()}`, def.subtitle);
  if (m === "killhouse") banner("KILL HOUSE", "clear the floor before the clock runs out");
}
function hideAllRuntime() {
  for (const { slot } of ALL_FLOORS) {
    const ids = nodeCache.keys();
    for (const id of ids) if (id.startsWith(`f${slot}-`)) nodeCache.get(id)!.setVisible(false);
  }
  for (const v of Object.values(vmNodes)) v.setVisible(false);
  muzzleFlash.setVisible(false);
}
function bindFloor() {
  // lazily grab handles for this floor's entities
  const slot = sim.state.mode === "killhouse" ? 6 : floorIdx;
  for (const e of sim.state.enemies) req(`f${slot}-en-${e.sx}-${e.sz}`);
  for (const pk of sim.state.pickups) req(`f${slot}-pk-${pk.cx}-${pk.cz}`);
  for (const d of sim.state.doors) req(`f${slot}-door-${d.cx}-${d.cz}`);
  for (const pw of sim.state.pushWalls) { req(`f${slot}-pw-${pw.cx}-${pw.cz}`); req(`f${slot}-crack-${pw.cx}-${pw.cz}`); }
  for (const pr of sim.state.props) if (pr.kind !== "column") req(`f${slot}-prop-${pr.cx}-${pr.cz}`);
}
const cellOf = (v: number) => Math.floor(v / CELL);

// ---------------------------------------------------------------------------
// HUD
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const elHud = $<HTMLElement>("bz-hud"), elHp = $("bz-hp"), elArmor = $("bz-armor"), elAmmo = $("bz-ammo"),
  elWeapon = $("bz-weapon-name"), elScore = $("bz-score"), elKills = $("bz-kills"), elTime = $("bz-time"),
  elVign = $("bz-vignette"), elBanner = $("bz-banner"), elTag = $("bz-floor-tag"), elFeed = $("bz-feed"),
  elCross = $("bz-crosshair"), elMenu = $("bz-menu");
let bannerT = 0;
function banner(big: string, small = "") {
  elBanner.innerHTML = `${big}<small>${small}</small>`;
  elBanner.classList.add("show");
  bannerT = 3;
}
const FEED: string[] = [];
function feed(s: string, warn = false) {
  FEED.push(s);
  if (FEED.length > 6) FEED.shift();
  elFeed.innerHTML = FEED.map((f) => `<div class="bz-tick${warn ? " warn" : ""}">${f}</div>`).join("");
}

// ---------------------------------------------------------------------------
// pointer lock + mouse
const canvas = document.querySelector<HTMLCanvasElement>("#app canvas")!;
let pointerLocked = false;
let mouseFire = false;
let pendingWheel = 0;
let manualIdleT = 0;
canvas.addEventListener("click", () => {
  if (!DEMO) {
    autoPilot = false;
    manualIdleT = 0;
    if (!pointerLocked) canvas.requestPointerLock();
  }
  void mg.sound?.unlock();
  void mg.sound?.cue("ambience");
});
document.addEventListener("pointerlockchange", () => { pointerLocked = document.pointerLockElement === canvas; });
document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || DEMO) return;
  autoPilot = false;
  manualIdleT = 0;
  yawDelta -= e.movementX * 0.0024;
  pitchDelta -= e.movementY * 0.002;
});
document.addEventListener("mousedown", (e) => { if (pointerLocked && e.button === 0) { autoPilot = false; manualIdleT = 0; mouseFire = true; } });
document.addEventListener("mouseup", (e) => { if (e.button === 0) mouseFire = false; });
document.addEventListener("wheel", (e) => { if (pointerLocked) { autoPilot = false; manualIdleT = 0; pendingWheel += Math.sign(e.deltaY); } });
document.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && pointerLocked) document.exitPointerLock();
  if (!DEMO && /^(Key[WASDER]|Arrow|Space|Digit[1234])/.test(e.code)) {
    autoPilot = false;
    manualIdleT = 0;
  }
});

let yawDelta = 0, pitchDelta = 0;

// ---------------------------------------------------------------------------
// demo / autopilot driver — active 60 FPS gameplay on boot, yields on user input
let demoT = 0;
function demoInput(dt: number): SimInput {
  demoT += dt;
  const p = sim.state.player;
  const inp: SimInput = { moveX: 0, moveZ: 0, turn: 0, pitchDelta: 0, fire: false, firePressed: false, reload: false, use: false };
  if (demoT < 0.15) return inp;
  // Auto-open nearby doors or push-walls
  const pcx = cellOf(p.x), pcz = cellOf(p.z);
  for (const d of sim.state.doors) {
    if (Math.abs(d.cx - pcx) + Math.abs(d.cz - pcz) <= 1 && d.open < 0.2) inp.use = true;
  }
  // aim at nearest visible enemy; otherwise follow waypoint (weapon → key → exit)
  let target: [number, number] | null = null;
  let best = 1e9;
  for (const e of sim.state.enemies) {
    if (e.state === "dead") continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < best && d < 24 && sim.hasLOS(p.x, p.z, e.x, e.z)) { best = d; target = [e.x, e.z]; }
  }
  if (!target) {
    const mgPk = sim.state.pickups.find((k) => (k.kind === "mg" || k.kind === "armor") && !k.taken && Math.hypot(k.x - p.x, k.z - p.z) < 9);
    const want = mgPk ?? (!p.key ? sim.state.pickups.find((k) => k.kind === "key" && !k.taken) : null);
    target = want ? [want.x, want.z] : findCellCenter(sim, "E");
  }
  if (target) {
    const ang = Math.atan2(target[0] - p.x, -(target[1] - p.z));
    let d = ang - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    inp.turn = Math.max(-3.0 * dt, Math.min(3.0 * dt, d));
    const aligned = Math.abs(d) < 0.35;
    inp.moveZ = best < 4.2 && aligned ? 0.2 : aligned || best < 10 ? 1 : 0.55;
    inp.moveX = best < 12 ? Math.sin(demoT * 2.2) * 0.45 : 0;
    if (best < 18 && aligned) { inp.fire = true; inp.firePressed = true; }
    if (p.mag === 0 && p.reloading <= 0) inp.reload = true;
  }
  return inp;
}
function findCellCenter(s: Sim, ch: string): [number, number] | null {
  for (let z = 0; z < s.state.h; z++) for (let x = 0; x < s.state.w; x++)
    if (s.state.grid[z * s.state.w + x] === ch) return [cellCenter(x), cellCenter(z)];
  return null;
}

// ---------------------------------------------------------------------------
// per-frame: read input → tick sim → drive nodes/camera/HUD
let lastEventIdx = 0;
let simSteps = 0;
app.onFrame(({ dt }) => {
  if (!sim) return;
  const p = sim.state.player;

  const userActive =
    Math.abs(input.axis("moveX")) > 0.01 ||
    Math.abs(input.axis("moveZ")) > 0.01 ||
    Math.abs(input.axis("turn")) > 0.01 ||
    input.held("fire") || mouseFire ||
    input.pressed("reload") || input.pressed("use");
  if (userActive && !DEMO) {
    autoPilot = false;
    manualIdleT = 0;
  } else if (!DEMO && !pointerLocked) {
    manualIdleT += dt;
    if (manualIdleT > 10) autoPilot = true;
  }

  // ---- input → SimInput
  const useAuto = DEMO || autoPilot;
  const inp: SimInput = useAuto
    ? demoInput(dt)
    : {
        moveX: input.axis("moveX"),
        moveZ: input.axis("moveZ"),
        turn: yawDelta - input.axis("turn") * 2.4 * dt,
        pitchDelta,
        fire: input.held("fire") || mouseFire,
        firePressed: input.pressed("fire") || mouseFire,
        reload: input.pressed("reload"),
        use: input.pressed("use"),
        weapon: input.pressed("weapon1") ? "knife" : input.pressed("weapon2") ? "pistol" : input.pressed("weapon3") ? "mg" : input.pressed("weapon4") ? "rocket" : undefined,
        weaponDelta: pendingWheel !== 0 ? Math.sign(pendingWheel) : 0
      };
  yawDelta = 0; pitchDelta = 0; pendingWheel = 0;

  // ---- tick (fixed 60Hz substeps for demo determinism)
  if (DEMO) {
    demoAcc += dt;
    while (demoAcc >= 1 / 60) { sim.tick(1 / 60, inp); demoAcc -= 1 / 60; simSteps++; }
  } else {
    let remaining = Math.min(0.1, dt);
    while (remaining > 0) { const st = Math.min(1 / 60, remaining); sim.tick(st, inp); remaining -= st; simSteps++; }
  }

  // ---- drain events → audio + juice + feed
  const evs = sim.state.events;
  for (; lastEventIdx < evs.length; lastEventIdx++) handleEvent(evs[lastEventIdx]);
  if (evs.length > 60) { sim.state.events.splice(0, evs.length - 40); lastEventIdx = Math.min(lastEventIdx, sim.state.events.length); }

  // ---- camera: eye pose + shake + tactical flashlight tracking
  const shake = sim.state.shake + (p.hurtT > 0 ? 0.3 : 0);
  const shakeYaw = shake * Math.sin(sim.state.time * 91) * 0.012;
  const eyeY = EYE + Math.sin(sim.state.time * 8.4) * 0.02 * (Math.abs(inp.moveZ) + Math.abs(inp.moveX));
  const ox = sim.state.ox;
  const fx = Math.sin(p.yaw + shakeYaw), fz = -Math.cos(p.yaw + shakeYaw);
  app.camera?.setPose({
    position: [p.x + ox, eyeY + p.pitch * 0.4, p.z],
    target: [p.x + ox + fx, eyeY + Math.tan(p.pitch), p.z + fz],
    fov: 72
  });
  playerLight.setPosition(p.x + ox, eyeY + 0.4, p.z);
  playerAheadLight.setPosition(p.x + ox + fx * 6.5, eyeY + 0.6, p.z + fz * 6.5);

  // ---- viewmodel
  const bob = Math.sin(sim.state.time * 9) * 0.015 * Math.min(1, Math.abs(inp.moveZ) + Math.abs(inp.moveX));
  const rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
  const vmx = p.x + ox + fx * 0.62 + rx * 0.26;
  const vmy = EYE - 0.34 + bob - p.pitch * 0.12;
  const vmz = p.z + fz * 0.62 + rz * 0.26;
  for (const [id, node] of Object.entries(vmNodes) as [WeaponId, typeof vmNodes.knife][]) {
    if (id === p.weapon && p.alive) {
      node.setPosition(vmx, vmy, vmz);
      node.setRotation(id === "knife" ? -0.6 : 0, -p.yaw + Math.PI / 2, id === "knife" ? 0.5 : 0);
      node.setVisible(true);
    } else node.setVisible(false);
  }

  // ---- muzzle flash + light
  if (sim.state.muzzle > 0) {
    const mx = p.x + ox + fx * 1.0 + rx * 0.26, my = EYE - 0.22, mz = p.z + fz * 1.0 + rz * 0.26;
    muzzleFlash.setPosition(mx, my, mz);
    muzzleFlash.setRotation(0, -p.yaw + Math.PI / 2, 0);
    muzzleFlash.setScale(0.24 + sim.state.rng() * 0.12);
    muzzleFlash.setVisible(true);
    muzzleLight.setPosition(mx, my, mz);
  } else {
    muzzleFlash.setVisible(false);
    muzzleFlash.setPosition(0, -50, 0);
    muzzleLight.setPosition(0, -50, 0);
  }

  // ---- enemies
  const slot = sim.state.mode === "killhouse" ? 6 : floorIdx;
  for (const e of sim.state.enemies) {
    const node = req(`f${slot}-en-${e.sx}-${e.sz}`);
    if (e.state === "dead") {
      if (e.deathT < 4) {
        node.setPosition(e.x + ox, Math.max(-0.6, -e.deathT * 0.2), e.z);
        node.setRotation(Math.min(Math.PI / 2, e.deathT * 4), e.facing, 0);
        node.setVisible(true);
      } else node.setVisible(false);
      continue;
    }
    node.setPosition(e.x + ox, e.state === "attack" && e.kind === "boss" ? Math.sin(sim.state.time * 30) * 0.03 : 0, e.z);
    node.setRotation(0, -e.facing, 0);
    node.setVisible(true);
  }

  // ---- pickups (bob + spin)
  for (const pk of sim.state.pickups) {
    const node = req(`f${slot}-pk-${pk.cx}-${pk.cz}`);
    if (pk.taken) { node.setVisible(false); continue; }
    node.setPosition(pk.x + ox, (pk.kind === "key" ? 1.1 : 0.55) + Math.sin(sim.state.time * 2.4 + pk.cx) * 0.1, pk.z);
    node.setRotation(0, sim.state.time * 1.6, 0);
    node.setVisible(true);
  }

  // ---- doors
  for (const d of sim.state.doors) {
    const node = req(`f${slot}-door-${d.cx}-${d.cz}`);
    node.setPosition(cellX(slot, d.cx), -d.open * WALL_H * 0.94, cellCenter(d.cz));
    node.setVisible(true);
  }

  // ---- push-walls (block + crack cue slide together)
  for (const pw of sim.state.pushWalls) {
    const node = req(`f${slot}-pw-${pw.cx}-${pw.cz}`);
    const crack = req(`f${slot}-crack-${pw.cx}-${pw.cz}`);
    node.setVisible(true);
    if (pw.state === "closed") { crack.setVisible(true); continue; }
    const px = cellX(slot, pw.cx) + pw.dx * pw.progress * CELL;
    const pz = cellCenter(pw.cz) + pw.dz * pw.progress * CELL;
    node.setPosition(px, 0, pz);
    crack.setPosition(px, 0.2, pz);
    if (pw.state === "open") crack.setVisible(false);
  }

  // ---- props (barrels extinguish)
  for (const pr of sim.state.props) {
    if (pr.kind === "column") continue;
    const node = req(`f${slot}-prop-${pr.cx}-${pr.cz}`);
    node.setVisible(pr.alive);
  }

  // ---- rockets + explosions + sparks
  const rockets = sim.state.rockets;
  for (let i = 0; i < rocketNodes.length; i++) {
    if (i < rockets.length) rocketNodes[i].setPosition(rockets[i].x + ox, 1.3, rockets[i].z), rocketNodes[i].setVisible(true);
    else rocketNodes[i].setPosition(0, -50, 0);
  }
  const exps = sim.state.explosions;
  for (let i = 0; i < boomNodes.length; i++) {
    if (i < exps.length && exps[i].t < 0.55) {
      const e = exps[i];
      boomNodes[i].setPosition(e.x + ox, 1.0, e.z);
      boomNodes[i].setScale(0.5 + e.t * 6);
      boomNodes[i].setVisible(true);
      if (i === 0) boomLight.setPosition(e.x + ox, 1.4, e.z);
    } else boomNodes[i].setVisible(false), boomNodes[i].setPosition(0, -50, 0);
  }
  if (exps.every((e) => e.t > 0.55)) boomLight.setPosition(0, -50, 0);
  const shots = sim.state.shots;
  for (let i = 0; i < sparkNodes.length; i++) {
    if (i < shots.length && shots[i].t < 0.2) {
      sparkNodes[i].setPosition(shots[i].x + ox, 1.2, shots[i].z);
      sparkNodes[i].setScale(Math.max(0.15, 0.5 - shots[i].t * 2));
      sparkNodes[i].setVisible(true);
    } else sparkNodes[i].setVisible(false), sparkNodes[i].setPosition(0, -50, 0);
  }

  // ---- floor transitions
  if (sim.state.finished && !transitionPending) {
    transitionPending = true;
    banner(mode === "killhouse" ? "KILL HOUSE CLEAR" : `${sim.state.floor.name.toUpperCase()} — CLEARED`,
      `medal: ${sim.state.medal.toUpperCase()} · time ${fmtTime(sim.state.time)}`);
    void mg.sound?.cue("win");
    mg.juice?.fire("win");
    setTimeout(() => {
      transitionPending = false;
      if (mode === "killhouse") startFloor(0, "descent");
      else if (floorIdx < FLOORS.length - 1) startFloor(floorIdx + 1, "descent");
      else banner("BUNKER ZERO COMPLETE", "the Iron Warden is down — the bunker is yours");
    }, 2600);
  }
  if (!p.alive && !deathPending) {
    deathPending = true;
    void mg.sound?.cue("lose");
    banner("YOU DIED", "press any key to retry the floor");
    setTimeout(() => { deathPending = false; startFloor(floorIdx, mode); }, 2200);
  }

  renderHud();
  publishEvidence();
  feel.update(dt * 1000);
  bannerT -= dt;
  if (bannerT <= 0) elBanner.classList.remove("show");
});
let transitionPending = false, deathPending = false, demoAcc = 0;

// ---------------------------------------------------------------------------
function handleEvent(ev: string) {
  const [type, a] = ev.split(":");
  switch (type) {
    case "fire": void mg.sound?.cue(a === "pistol" ? "pistol" : a === "mg" ? "mg" : a === "rocket" ? "rocket" : a === "dry" ? "dry" : "knife"); mg.juice?.fire("fire"); break;
    case "hit": void mg.sound?.cue("hit"); elCross.classList.add("hit"); setTimeout(() => elCross.classList.remove("hit"), 90); break;
    case "kill": void mg.sound?.cue("kill"); mg.juice?.fire("kill"); feed(`kill confirmed — ${a}`); break;
    case "hurt": void mg.sound?.cue("hurt"); mg.juice?.fire("hurt"); break;
    case "dog": void mg.sound?.cue("bite"); break;
    case "step": void mg.sound?.cue("step"); break;
    case "secret": void mg.sound?.cue("secret"); mg.juice?.fire("secret"); feed("push-wall revealed a secret"); break;
    case "pickup": void mg.sound?.cue(a === "key" ? "key" : a === "mg" || a === "rocket" ? "weapon" : "pickup"); feed(a === "key" ? "brass key secured" : `${a} collected`); break;
    case "door": void mg.sound?.cue("door"); break;
    case "reload": void mg.sound?.cue("reload"); break;
    case "weapon": void mg.sound?.cue("switch"); break;
    case "rocket": void mg.sound?.cue("boom"); break;
    case "barrel": void mg.sound?.cue("boom"); mg.juice?.fire("fire"); break;
    case "boss": void mg.sound?.cue("boss"); feed("the Iron Warden moves", true); break;
    case "alert": case "spot": void mg.sound?.cue("alert"); break;
    case "floor": break; // handled in frame loop
    case "player": break;
    case "guard": case "gunner": break;
    case "use": break;
    case "pushwall": break;
  }
}

// ---------------------------------------------------------------------------
let lastHud = "";
function renderHud() {
  const p = sim.state.player;
  const wpn = WEAPONS[p.weapon];
  const ammoStr = wpn.ammo === "none" ? "—" : `${p.mag} / ${p.ammo[wpn.ammo as "bullets" | "rockets"]}`;
  const hud = `${Math.ceil(p.hp)}|${Math.ceil(p.armor)}|${ammoStr}|${sim.state.score}|${sim.state.kills}|${sim.state.time}|${p.weapon}`;
  if (hud !== lastHud) {
    lastHud = hud;
    elHp.textContent = String(Math.ceil(p.hp));
    elHp.classList.toggle("low", p.hp <= 30);
    elArmor.textContent = String(Math.ceil(p.armor));
    elAmmo.textContent = p.reloading > 0 ? "RELOADING" : ammoStr;
    elWeapon.textContent = wpn.name;
    elScore.textContent = String(sim.state.score);
    elKills.textContent = `${sim.state.kills}/${sim.state.totalEnemies}`;
    elTime.textContent = mode === "killhouse" ? fmtTime(Math.max(0, sim.state.killhouseLeft)) : fmtTime(sim.state.time);
    elVign.style.opacity = String(Math.max(p.hurtT * 1.6, p.alive && p.hp <= 30 ? 0.4 : 0));
    elVign.classList.toggle("low", p.alive && p.hp <= 30);
    elTag.innerHTML = mode === "killhouse"
      ? `SKILL LAB — KILL HOUSE<small>${dogtag} · clear the floor</small>`
      : `FLOOR ${floorIdx + 1} — ${sim.state.floor.name.toUpperCase()}<small>${p.key ? "key secured · " : ""}${sim.state.floor.subtitle} · ${dogtag}</small>`;
  }
  if (sim.state.msg) feed2(sim.state.msg);
}
let lastFeedMsg = "";
function feed2(s: string) { if (s !== lastFeedMsg) { lastFeedMsg = s; feed(s, /LOCKED|DIED|WARDEN|OUT/.test(s)); } }
function fmtTime(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
let evCount = 0;
function publishEvidence() {
  evCount++;
  if (evCount % 6) return; // ~10Hz
  const p = sim.state.player;
  window.__gameEvidence = {
    status: "playing",
    mode, floor: floorIdx + 1,
    floorName: sim.state.floor.name,
    player: {
      x: +(p.x.toFixed(2)), z: +(p.z.toFixed(2)), yaw: +p.yaw.toFixed(3),
      hp: Math.ceil(p.hp), armor: Math.ceil(p.armor), alive: p.alive,
      weapon: p.weapon, mag: p.mag, ammo: p.ammo, key: p.key
    },
    enemiesAlive: sim.state.enemies.filter((e) => e.state !== "dead").length,
    kills: sim.state.kills, score: sim.state.score,
    secrets: `${sim.state.secrets}/${sim.state.totalSecrets}`,
    time: +sim.state.time.toFixed(1),
    simSteps,
    events: sim.state.events.slice(-12),
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category }
  };
}

// ---------------------------------------------------------------------------
// shell wiring
function setModeButtons() {
  $("bz-btn-play").classList.toggle("active", mode === "descent");
  $("bz-btn-killhouse").classList.toggle("active", mode === "killhouse");
  document.querySelectorAll<HTMLButtonElement>(".floor-btn").forEach((b, i) =>
    b.classList.toggle("active", mode === "descent" && i === floorIdx));
}
$("bz-btn-play").addEventListener("click", () => { startFloor(0, "descent"); setModeButtons(); });
$("bz-btn-killhouse").addEventListener("click", () => { startFloor(0, "killhouse"); setModeButtons(); });
$("bz-btn-menu").addEventListener("click", () => elMenu.classList.toggle("open"));
$("bz-menu-close").addEventListener("click", () => elMenu.classList.remove("open"));
document.querySelectorAll<HTMLButtonElement>(".floor-btn").forEach((b) =>
  b.addEventListener("click", () => { startFloor(parseInt(b.dataset.auraFloor!, 10), "descent"); setModeButtons(); }));
$("bz-dogtag").addEventListener("input", (e) => { dogtag = (e.target as HTMLInputElement).value.toUpperCase() || "RAZOR-6"; });
document.querySelectorAll<HTMLButtonElement>(".bz-swatch").forEach((b) =>
  b.addEventListener("click", () => {
    camoTint = b.dataset.tint!;
    document.querySelectorAll(".bz-swatch").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
  }));

// floor select cards
const floorList = $("bz-floor-list");
floorList.innerHTML = FLOORS.map((f, i) =>
  `<button type="button" class="bz-floor-card" data-f="${i}"><span class="medal">◎</span><strong>F${i + 1} — ${f.name}</strong><small>par ${fmtTime(f.par)} · descent</small></button>`).join("");
floorList.querySelectorAll(".bz-floor-card").forEach((b) =>
  b.addEventListener("click", () => { startFloor(parseInt((b as HTMLElement).dataset.f!, 10), "descent"); elMenu.classList.remove("open"); setModeButtons(); }));
$("bz-tour-stats").innerHTML = [
  `<div class="bz-kv"><span>WEAPONS</span><span>knife · pistol · MG · rockets</span></div>`,
  `<div class="bz-kv"><span>ENEMIES</span><span>guard · hound · gunner · IRON WARDEN</span></div>`,
  `<div class="bz-kv"><span>SECRETS</span><span>2 push-walls per floor</span></div>`,
  `<div class="bz-kv"><span>ENGINE</span><span>Aura3D ${"4.0.1"} · night-city look</span></div>`
].join("");

// ---------------------------------------------------------------------------
startFloor(0, "descent");
setModeButtons();
elHud.classList.remove("hidden");
void mg.ready().then(() => {
  document.body.dataset.aura3dReady = "true";
  window.__AURA3D_ROUTE_READY__ = { ready: true };
}).catch((err: unknown) => {
  const el = document.getElementById("render-error") ?? document.createElement("div");
  el.id = "render-error"; el.className = "render-error";
  el.textContent = `Bunker Zero failed to start: ${err instanceof Error ? err.message : String(err)}`;
  document.body.append(el);
});
