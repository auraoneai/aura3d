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

const DEMO = new URLSearchParams(location.search).has("demo");
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
  const b = scene().add(looks.preset(LOOK_ID, { fogDensityScale: 2.0 }));
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];

  for (const { def, slot } of ALL_FLOORS) {
    const rows = def.rows;
    const h = rows.length, w = rows[0].length;
    const wallH = def.id === 5 ? SILO_H : WALL_H;
    const wallMat = material.pbr({ color: def.palette.wall, roughness: 0.94, metalness: 0.02 });
    const altMat = material.pbr({ color: def.palette.wallAlt, roughness: 0.9, metalness: 0.05 });
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
        const j = (hash2(x, z) - 0.5) * 0.16;
        wallInst.push({ position: [wx, wallH / 2, wz], scale: [CELL, wallH, CELL] });
        wallCol.push(shade(def.palette.wall, j));
      } else if (ch === "%") {
        altInst.push({ position: [wx, wallH / 2, wz], scale: [CELL, wallH, CELL] });
        altCol.push(shade(def.palette.wallAlt, (hash2(x, z) - 0.5) * 0.1));
      } else if (ch === ",") {
        faltInst.push({ position: [wx, 0.04, wz], scale: [CELL, 0.08, CELL] });
      }
    }
    nodes.push(
      // structural walls — one instanced draw call per material group
      primitives.box({ name: `f${slot} walls`, material: wallMat, instances: wallInst, instanceColors: wallCol }),
      primitives.box({ name: `f${slot} accent`, material: altMat, instances: altInst, instanceColors: altCol }),
      // slab floor + ceiling
      primitives.box({ name: `f${slot} floor`, size: [w * CELL, 0.3, h * CELL], position: [slot * FLOOR_SPAN + w * CELL / 2, -0.15, h * CELL / 2], material: material.pbr({ color: def.palette.floor, roughness: 1 }) }),
      primitives.box({ name: `f${slot} ceil`, size: [w * CELL, 0.3, h * CELL], position: [slot * FLOOR_SPAN + w * CELL / 2, wallH + 0.15, h * CELL / 2], material: material.pbr({ color: def.palette.ceil, roughness: 1 }) })
    );
    if (faltInst.length) {
      nodes.push(primitives.box({
        name: `f${slot} floor-alt`, instances: faltInst,
        material: def.palette.floorEmissive
          ? material.emissive({ color: def.palette.floorAlt, emissive: def.palette.floorEmissive, emissiveIntensity: 1.6, roughness: 0.4 })
          : material.pbr({ color: def.palette.floorAlt, roughness: 1 })
      }));
    }
    // per-floor atmosphere: sparse accent sconces + door/key/exit dressing
    nodes.push(
      lights.hemisphere({ name: `f${slot} hemi`, skyColor: "#1a2430", groundColor: "#0b0806", intensity: 0.55, position: [slot * FLOOR_SPAN, wallH + 2, 0] }),
      lights.point({ name: `f${slot} accent A`, color: def.palette.accent, intensity: 5, distance: 16, decay: 2, position: [slot * FLOOR_SPAN + w * CELL * 0.3, wallH - 0.5, h * CELL * 0.3] }),
      lights.point({ name: `f${slot} accent B`, color: def.palette.accent, intensity: 5, distance: 16, decay: 2, position: [slot * FLOOR_SPAN + w * CELL * 0.7, wallH - 0.5, h * CELL * 0.7] })
    );
    // ---- per-cell runtime dressing ---------------------------------------
    let dI = 0, pI = 0, eI = 0, kI = 0;
    const keys: Record<string, number> = {};
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = rows[z][x];
      const wx = cellX(slot, x), wz = cellCenter(z);
      const key = `${x},${z}`;
      const idx = (keys[key] = (keys[key] ?? -1) + 1);
      switch (ch) {
        case "D":
          nodes.push(
            primitives.box({ name: `f${slot} door ${dI}`, size: [CELL * 0.96, wallH * 0.96, CELL * 0.96], position: [wx, wallH / 2, wz], material: material.pbr({ color: def.palette.accent, roughness: 0.5, metalness: 0.6 }) })
              .runtime(game.runtimeNode(`f${slot}-door-${x}-${z}`, { tags: ["door"] }))
          );
          dI++;
          break;
        case "P": {
          // push block — wall-matched material + cracked emissive cue strip
          const side = pushFace(rows, x, z);
          nodes.push(
            primitives.box({ name: `f${slot} push ${pI}`, size: [CELL * 0.98, wallH * 0.98, CELL * 0.98], position: [wx, wallH / 2, wz], material: material.pbr({ color: shade(def.palette.wall, -0.06), roughness: 0.95 }) })
              .runtime(game.runtimeNode(`f${slot}-pw-${x}-${z}`, { tags: ["pushwall"] })),
            primitives.box({ name: `f${slot} crack ${pI}`, size: [CELL * 0.7, wallH * 0.7, 0.1], position: [wx + side[0] * CELL * 0.49, wallH / 2, wz + side[1] * CELL * 0.49], material: material.emissive({ color: "#3a2c1c", emissive: "#b4762a", emissiveIntensity: 0.55, roughness: 0.9 }) })
              .runtime(game.runtimeNode(`f${slot}-crack-${x}-${z}`, { tags: ["crack"] }))
          );
          pI++;
          break;
        }
        case "E":
          nodes.push(
            primitives.box({ name: `f${slot} exit`, size: [CELL * 0.9, 0.12, CELL * 0.9], position: [wx, 0.06, wz], material: material.emissive({ color: def.palette.accent, emissive: def.palette.accent, emissiveIntensity: 2.2, roughness: 0.4 }) }),
            primitives.cylinder({ name: `f${slot} exitpost`, size: [0.5, wallH * 0.8, 0.5], position: [wx, wallH * 0.4, wz], material: material.pbr({ color: def.palette.wallAlt, metalness: 0.7, roughness: 0.35 }) }),
            lights.point({ name: `f${slot} exitlight`, color: def.palette.accent, intensity: 7, distance: 10, decay: 2, position: [wx, wallH - 0.6, wz] })
          );
          break;
        case "K":
          nodes.push(
            model(assets.vaultCenterCoreTargetMeshy, { name: `f${slot} key`, material: material.emissive({ color: "#ffd76a", emissive: "#ff9d2a", emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.3 }) })
              .position(wx, 1.1, wz).scale(0.14)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "key"] }))
          );
          break;
        case "t": case "T":
          nodes.push(
            model(assets.fpsEnergyCorePickupMeshy, {
              name: `f${slot} treasure ${kI}`,
              material: material.emissive({ color: "#c9a227", emissive: "#ffd76a", emissiveIntensity: ch === "T" ? 2.6 : 1.6, metalness: 0.9, roughness: 0.25 })
            })
              .position(wx, 0.55, wz).scale(ch === "T" ? 0.34 : 0.24)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "treasure"] }))
          );
          kI++;
          break;
        case "+": case "*":
          nodes.push(
            primitives.box({ name: `f${slot} medkit ${x}-${z}`, size: [0.7, 0.5, 0.7], position: [wx, 0.4, wz], material: material.pbr({ color: "#e8e4d8", roughness: 0.7 }) })
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "health"] })),
            primitives.box({ name: `f${slot} cross ${x}-${z}`, size: [0.44, 0.12, 0.16], position: [wx, 0.66, wz], material: material.emissive({ color: "#c22a1f", emissive: "#c22a1f", emissiveIntensity: 0.8 }) })
              .runtime(game.runtimeNode(`f${slot}-pkx-${x}-${z}`, { tags: ["pickup-deco"] })),
            primitives.box({ name: `f${slot} cross2 ${x}-${z}`, size: [0.16, 0.12, 0.44], position: [wx, 0.66, wz], material: material.emissive({ color: "#c22a1f", emissive: "#c22a1f", emissiveIntensity: 0.8 }) })
              .runtime(game.runtimeNode(`f${slot}-pky-${x}-${z}`, { tags: ["pickup-deco"] }))
          );
          break;
        case "a":
          nodes.push(
            model(assets.corridorFireAmmoCrateMeshy, { name: `f${slot} ammo`, material: material.emissive({ color: "#8a9a4a", emissive: "#5a6a2a", emissiveIntensity: 0.5 }) })
              .position(wx, 0.0, wz).scale(0.36)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "ammo"] }))
          );
          break;
        case "r":
          nodes.push(
            model(assets.deepSunkenReactorCoreMeshy, { name: `f${slot} armor`, material: material.emissive({ color: "#4a7a9a", emissive: "#3a8aaa", emissiveIntensity: 1.2 }) })
              .position(wx, 0.0, wz).scale(0.3)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "armor"] }))
          );
          break;
        case "w":
          nodes.push(
            model(assets.corridorPulseRifleMeshy, { name: `f${slot} mgpickup`, material: material.emissive({ color: "#4a5a6a", emissive: "#7dfcff", emissiveIntensity: 1.0 }) })
              .position(wx, 0.55, wz).rotate(0, 0.7, 0).scale(0.42)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "weapon"] }))
          );
          break;
        case "W":
          nodes.push(
            model(assets.corridorPulseRifleMeshy, { name: `f${slot} rocketpickup`, material: material.emissive({ color: "#6a4a3a", emissive: "#ff8a3a", emissiveIntensity: 1.2 }) })
              .position(wx, 0.55, wz).rotate(0, -0.7, 0).scale(0.55)
              .runtime(game.runtimeNode(`f${slot}-pk-${x}-${z}`, { tags: ["pickup", "weapon"] }))
          );
          break;
        case "b":
          nodes.push(
            model(assets.siegeWoodenBarrel, { name: `f${slot} barrel ${x}-${z}`, material: material.emissive({ color: "#7a2a1a", emissive: "#a43a1a", emissiveIntensity: 0.35, roughness: 0.6 }) })
              .position(wx, 0, wz).scale(0.8)
              .runtime(game.runtimeNode(`f${slot}-prop-${x}-${z}`, { tags: ["prop", "barrel"] }))
          );
          break;
        case "c":
          nodes.push(
            model(assets.deepRecoveryCrateStandard, { name: `f${slot} crate ${x}-${z}` })
              .position(wx, 0, wz).scale(0.62)
              .runtime(game.runtimeNode(`f${slot}-prop-${x}-${z}`, { tags: ["prop", "crate"] }))
          );
          break;
        case "o":
          nodes.push(
            primitives.cylinder({ name: `f${slot} column ${x}-${z}`, size: [0.72, wallH, 0.72], position: [wx, wallH / 2, wz], material: material.pbr({ color: shade(def.palette.wallAlt, 0.08), roughness: 0.6, metalness: 0.4 }) })
          );
          break;
        case "g":
          nodes.push(
            model(assets.gallerySecurityGuardMeshy, { name: `f${slot} guard ${eI}`, targetHeight: 1.8 })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-en-${x}-${z}`, { tags: ["enemy", "guard"] }))
          );
          eI++;
          break;
        case "d":
          nodes.push(
            model(assets.showcaseOrangeIndustrialRobot, {
              name: `f${slot} hound ${eI}`, targetHeight: 0.95,
              material: material.pbr({ color: "#3a3430", roughness: 0.7, metalness: 0.3 })
            })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-en-${x}-${z}`, { tags: ["enemy", "dog"] }))
          );
          eI++;
          break;
        case "G":
          nodes.push(
            model(assets.mechHeroPlayerMeshy, {
              name: `f${slot} gunner ${eI}`, targetHeight: 1.9,
              material: material.pbr({ color: "#4a4640", roughness: 0.55, metalness: 0.55 })
            })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-en-${x}-${z}`, { tags: ["enemy", "gunner"] }))
          );
          eI++;
          break;
        case "B":
          nodes.push(
            model(assets.mechHangarRivalUnitMeshy, {
              name: `f${slot} boss ${eI}`, targetHeight: 3.0,
              material: material.emissive({ color: "#5a4526", emissive: "#c46a1a", emissiveIntensity: 0.4, metalness: 0.7, roughness: 0.4 })
            })
              .position(wx, 0, wz)
              .runtime(game.runtimeNode(`f${slot}-en-${x}-${z}`, { tags: ["enemy", "boss"] }))
          );
          eI++;
          break;
      }
    }
  }

  // ---- player rig: viewmodels + muzzle flash + pooled FX ------------------
  const vmBase = { position: [0, 0, 0] as [number, number, number] };
  nodes.push(
    // knife + pistol are primitive viewmodels (supporting weapons); mg/rocket
    // ride the catalog pulse rifle.
    primitives.box({ name: "vm knife", size: [0.05, 0.34, 0.05], material: material.pbr({ color: "#c8ccd4", metalness: 0.9, roughness: 0.25 }), ...vmBase })
      .runtime(game.runtimeNode("vm-knife", { tags: ["viewmodel"] })),
    primitives.box({ name: "vm pistol", size: [0.09, 0.2, 0.34], material: material.pbr({ color: "#2e2f33", metalness: 0.8, roughness: 0.4 }), ...vmBase })
      .runtime(game.runtimeNode("vm-pistol", { tags: ["viewmodel"] })),
    model(assets.corridorPulseRifleMeshy, { name: "vm mg", material: material.pbr({ color: "#3a4148", metalness: 0.7, roughness: 0.35 }) })
      .position(0, 0, 0).scale(0.42)
      .runtime(game.runtimeNode("vm-mg", { tags: ["viewmodel"] })),
    model(assets.corridorPulseRifleMeshy, { name: "vm rocket", material: material.pbr({ color: "#4a3a30", metalness: 0.75, roughness: 0.4 }) })
      .position(0, 0, 0).scale(0.62)
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
      primitives.sphere({ name: `spark ${i}`, size: [0.09, 0.09, 0.09], material: material.emissive({ color: "#ffca7a", emissive: "#ff9a3a", emissiveIntensity: 6 }), position: [0, -50, 0] })
        .runtime(game.runtimeNode(`spark-${i}`, { tags: ["vfx"] }))
    );
  for (let i = 0; i < 6; i++)
    nodes.push(
      primitives.sphere({ name: `boom ${i}`, size: [0.6, 0.6, 0.6], material: material.emissive({ color: "#ff7a2a", emissive: "#ff5a1a", emissiveIntensity: 4 }), position: [0, -50, 0] })
        .runtime(game.runtimeNode(`boom-${i}`, { tags: ["vfx"] })),
      primitives.sphere({ name: `rocket ${i}`, size: [0.16, 0.16, 0.16], material: material.emissive({ color: "#ffd27a", emissive: "#ff7a1a", emissiveIntensity: 7 }), position: [0, -50, 0] })
        .runtime(game.runtimeNode(`rocket-${i}`, { tags: ["vfx"] }))
    );

  return b
    .addMany(nodes)
    .add(effects.fog({ color: "#0b0e14", density: 0.052 }))
    .add(effects.filmGrain({ intensity: 0.06 }))
    .add(effects.vignette({ intensity: 0.32 }))
    .add(effects.bloom({ threshold: 1.0, intensity: 0.42 }))
    .camera(camera.perspective({ position: [1.5, EYE, 4.5], target: [1.5, EYE, 0], fov: 72 }));
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
  qualityRebuild: { flags: ["game"] },
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
canvas.addEventListener("click", () => {
  if (!DEMO && !pointerLocked) canvas.requestPointerLock();
  void mg.sound?.unlock();
  void mg.sound?.cue("ambience");
});
document.addEventListener("pointerlockchange", () => { pointerLocked = document.pointerLockElement === canvas; });
document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || DEMO) return;
  yawDelta -= e.movementX * 0.0024;
  pitchDelta -= e.movementY * 0.002;
});
document.addEventListener("mousedown", (e) => { if (pointerLocked && e.button === 0) mouseFire = true; });
document.addEventListener("mouseup", (e) => { if (e.button === 0) mouseFire = false; });
document.addEventListener("wheel", (e) => { if (pointerLocked) pendingWheel += Math.sign(e.deltaY); });
document.addEventListener("keydown", (e) => { if (e.code === "Escape" && pointerLocked) document.exitPointerLock(); });

let yawDelta = 0, pitchDelta = 0;

// ---------------------------------------------------------------------------
// demo driver — deterministic scripted playthrough for remote capture
let demoT = 0;
function demoInput(dt: number): SimInput {
  demoT += dt;
  const p = sim.state.player;
  const inp: SimInput = { moveX: 0, moveZ: 0, turn: 0, pitchDelta: 0, fire: false, firePressed: false, reload: false, use: false };
  if (demoT < 0.8) return inp;
  // aim at nearest visible enemy; otherwise follow waypoint (key → exit)
  let target: [number, number] | null = null;
  let best = 1e9;
  for (const e of sim.state.enemies) {
    if (e.state === "dead") continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < best && d < 14 && sim.hasLOS(p.x, p.z, e.x, e.z)) { best = d; target = [e.x, e.z]; }
  }
  if (!target) {
    const want = !p.key
      ? sim.state.pickups.find((k) => k.kind === "key" && !k.taken)
      : null;
    target = want ? [want.x, want.z] : findCellCenter(sim, "E");
  }
  if (target) {
    const ang = Math.atan2(target[0] - p.x, -(target[1] - p.z));
    let d = ang - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    inp.turn = Math.max(-2.6 * dt, Math.min(2.6 * dt, d));
    const aligned = Math.abs(d) < 0.25;
    inp.moveZ = aligned || best < 8 ? 1 : 0.4;
    if (best < 9 && aligned) { inp.fire = true; inp.firePressed = true; }
    if (!sim.state.player.key && Math.hypot(target[0] - p.x, target[1] - p.z) < 4) inp.moveZ = 1;
  }
  if (demoT > 40) { inp.use = false; }
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

  // ---- input → SimInput
  const inp: SimInput = DEMO
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

  // ---- camera: eye pose + shake
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

  // ---- viewmodel
  const bob = Math.sin(sim.state.time * 9) * 0.015 * Math.min(1, Math.abs(inp.moveZ) + Math.abs(inp.moveX));
  const rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
  const vmx = p.x + ox + fx * 0.62 + rx * 0.26;
  const vmy = EYE - 0.34 + bob - p.pitch * 0.12;
  const vmz = p.z + fz * 0.62 + rz * 0.26;
  for (const [id, node] of Object.entries(vmNodes) as [WeaponId, typeof vmNodes.knife][]) {
    if (id === p.weapon && p.alive) {
      node.setPosition(vmx, vmy, vmz);
      node.setRotation(id === "knife" ? -0.6 : 0, -p.yaw + Math.PI / 2 + (id === "rocket" ? 0 : 0), id === "knife" ? 0.5 : 0);
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
    const deco = nodeCache.get(`f${slot}-pkx-${pk.cx}-${pk.cz}`);
    if (deco) deco.setVisible(false), nodeCache.get(`f${slot}-pky-${pk.cx}-${pk.cz}`)?.setVisible(false);
  }

  // ---- doors
  for (const d of sim.state.doors) {
    const node = req(`f${slot}-door-${d.cx}-${d.cz}`);
    node.setPosition(cellX(slot, d.cx), WALL_H / 2 - d.open * WALL_H * 0.94, cellCenter(d.cz));
  }

  // ---- push-walls (block + crack cue slide together)
  for (const pw of sim.state.pushWalls) {
    const node = req(`f${slot}-pw-${pw.cx}-${pw.cz}`);
    const crack = req(`f${slot}-crack-${pw.cx}-${pw.cz}`);
    if (pw.state === "closed") continue;
    const px = cellX(slot, pw.cx) + pw.dx * pw.progress * CELL;
    const pz = cellCenter(pw.cz) + pw.dz * pw.progress * CELL;
    node.setPosition(px, WALL_H / 2, pz);
    crack.setPosition(px + pw.dx * 0, WALL_H / 2, pz);
    if (pw.state === "open") crack.setVisible(false);
  }

  // ---- props (barrels extinguish)
  for (const pr of sim.state.props) {
    if (pr.kind === "column") continue;
    const node = req(`f${slot}-prop-${pr.cx}-${pr.cz}`);
    if (!pr.alive) node.setVisible(false);
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
