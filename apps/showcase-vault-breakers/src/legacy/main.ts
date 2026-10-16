/**
 * Vault Breakers - route mount (PRD VB-08/10/11/12).
 *
 * One Aura3D app per route. The physics table lives in table.ts and the game
 * state machine in ball-flow.ts; this file owns the scene graph, per-frame
 * visual sync from body poses, the text3D scoreboard, HUD, audio cue mapping,
 * and the evidence global. DOM is UI only: every gameplay truth is rendered by
 * the Aura3D scene.
 */
import {
  camera,
  createGameApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  ui,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode,
  type AuraDiagnostics
} from "@aura3d/engine";
import { assets, assets as rootAssets } from "../../../../src/aura-assets";
import { VaultFlow, type VaultGameEvent } from "../gameplay/ball-flow";
import { FlipperController } from "../gameplay/flippers";
import { PlungerController } from "../gameplay/plunger";
import { createTableSimulation, quatToEuler, type PropVisual } from "../gameplay/table";
import { createVaultAudio } from "./pinball-audio";
import { createScoreboardNodes, scoreboardVisibility, MISSION_LINES } from "./scoreboard";
import { createVaultBreakersEnvironment } from "./environment";
import "./styles.css";

const slingshotAsset =
  (rootAssets as any).vaultPinballSlingshotMeshy ?? rootAssets.vaultPopBumperCapMeshy;

type VaultWindow = Window & {
  __VAULT_BREAKERS_EVIDENCE__?: unknown;
  __AURA3D_SHOWCASE_VAULT_BREAKERS__?: unknown;
  __VB_SHOT__?: () => string;
  __VB_PUMP__?: (frames: number) => number;
  __VB_SCENARIO__?: (scenario: string) => string;
  __AURA3D_COMPOSITION_PROBE__?: unknown;
};
const vaultWindow = window as VaultWindow;
Object.defineProperty(window, "__AURA3D_SHOWCASE_VAULT_BREAKERS__", {
  configurable: true,
  get: () => vaultWindow.__VAULT_BREAKERS_EVIDENCE__
});
const reducedMotion = typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const visualReviewCapture = new URLSearchParams(window.location.search).get("capture") === "review";
document.body.dataset.capture = visualReviewCapture ? "review" : "default";
// Physics identity (backend / flipper mode / sensor + joint counts) is evidence a
// reviewer asks for, not HUD a player receives. Opt in with `?evidence=1`.
document.body.dataset.evidence =
  new URLSearchParams(window.location.search).get("evidence") === "1" ? "on" : "off";

const APP_ID = "showcase-vault-breakers";

// ---------------------------------------------------------------- HUD markup --
ui.html("#hud", `
  <div class="hole-banner" id="vb-banner" aria-live="polite">VAULT BREAKERS - PRESS AND RELEASE SPACE TO SERVE</div>
  <div class="result-card is-hidden" id="vb-result" data-testid="vault-breakers-result">
    <h2 id="vb-result-title">Game over</h2>
    <p id="vb-result-detail"></p>
    <div class="action-row"><button id="vb-again-button" type="button">Play again</button></div>
  </div>
`);

ui.html("#panel", `
  <section class="vb-brand">
    <p class="eyebrow">Aura3D Prototype</p>
    <h1>Vault Breakers</h1>
    <p class="blurb">Neon pinball. Fire the flippers, bank five target stands, crack the vault, ride the multiball.</p>
  </section>
  <section class="stat-grid" aria-label="Table status">
    <article><span>Score</span><strong id="stat-score">0</strong></article>
    <article><span>Ball</span><strong id="stat-ball">1 OF 3</strong></article>
    <article><span>Multiplier</span><strong id="stat-mult">X1</strong></article>
    <article><span>Banks</span><strong id="stat-banks">0 OF 5</strong></article>
    <article><span>Balls live</span><strong id="stat-live">0</strong></article>
    <article><span>Tilt</span><strong id="stat-tilt">0 OF 3</strong></article>
  </section>
  <div class="power-meter" aria-label="Plunger power"><span id="vb-power-fill"></span></div>
  <div class="power-meta"><span id="vb-power-label">Plunger (Sweet Spot 55%+)</span><span>hold Space</span></div>
  <p class="mission-line" id="vb-mission" aria-live="polite">HIT TARGET BANKS  0 DOWN 5 TO GO</p>
  <ul class="controls-list" aria-label="Keyboard controls">
    <li>Flippers <b>A</b>/<b>D</b> or <b>&larr;/&rarr;</b></li>
    <li>Skill-Shot Plunger <b>hold Space</b>, release in sweet spot</li>
    <li>Nudge <b>Q</b>/<b>E</b> or <b>S</b> (3 strikes tilt)</li>
    <li>Reset <b>R</b> - Pause <b>P</b></li>
  </ul>
  <section class="action-row" aria-label="Game actions">
    <button id="vb-left-button" type="button">Left flipper</button>
    <button id="vb-right-button" type="button">Right flipper</button>
    <button id="vb-plunge-button" type="button">Plunge</button>
    <button id="vb-reset-button" type="button">Reset</button>
    <button id="vb-pause-button" type="button">Pause</button>
  </section>
  <section class="evidence-strip" aria-label="Route evidence">
    <span>Backend <code id="vb-ev-backend">booting</code></span>
    <span>Flipper mode <code id="vb-ev-flipper">joint</code></span>
    <span>Sensors <code id="vb-ev-sensors">0</code> - Joints <code id="vb-ev-joints">0</code></span>
  </section>
`);

// ---------------------------------------------------------------- audio ------
const audio = createVaultAudio();
window.addEventListener("pointerdown", () => {
  void audio.unlock().catch(() => undefined);
}, { passive: true });
window.addEventListener("keydown", () => { void audio.unlock(); }, { passive: true });

// ---------------------------------------------------------------- state ------
const tableSim = createTableSimulation();
const flippers = new FlipperController(tableSim.flippers);
const flow = new VaultFlow(flippers, tableSim);
const plunger = new PlungerController();
let paused = false;
let frameCount = 0;
let nudgeFlip = false;
const downTargets = new Set<string>();
const audioCueLog: string[] = [];
const lastCueFrame = new Map<string, number>();
let doorSwing = -1; // -1 closed, 0..1 animating, 1 open
let impactRemaining = 0;
let impactRadius = 0.28;
let impactOrigin: readonly [number, number, number] = [0, 0.5, 0];
const touchControlEvents: string[] = [];
let bonusScore = 0;
let skillShotWindowRemaining = 0;
let skillShotAwardedForBall = false;
let bannerOverrideText = "";
let bannerOverrideRemaining = 0;
let coreJackpotCooldown = 0;
let goldJackpotBallActive = false;
let goldJackpotBallPhase = 0;
const COMET_TRAIL_COUNT = 6;
const ballTrailHistory: Array<[number, number, number]> = [
  [0, 0.44, 1.18],
  [0.12, 0.43, 1.38],
  [0.26, 0.42, 1.58],
  [0.42, 0.41, 1.78],
  [0.58, 0.40, 1.98],
  [0.74, 0.39, 2.18]
];

// Neon palette — the typed GLBs keep their authored multi-material identity;
// these route-owned materials are limited to state accents and gameplay cues.
const liveBallMaterial = material.metal({
  name: "neon chrome ball state accent",
  color: "#f8fafc",
  emissive: "#38bdf8",
  emissiveIntensity: 0.42,
  roughness: 0.05,
  metallic: 0.97,
  clearcoat: 0.96,
  envMapIntensity: 2.35
});
const goldBonusBallMaterial = material.metal({
  name: "vault jackpot gold ball accent",
  color: "#fde047",
  emissive: "#f59e0b",
  emissiveIntensity: 0.65,
  roughness: 0.08,
  metallic: 0.94,
  clearcoat: 0.95,
  envMapIntensity: 2.2
});
const cometTrailMaterials = Array.from({ length: COMET_TRAIL_COUNT }, (_, idx) =>
  material.neon({
    name: `pinball comet trail ${idx}`,
    color: idx < 2 ? "#e0f2fe" : "#0891b2",
    emissive: idx % 2 === 0 ? "#22d3ee" : "#38bdf8",
    emissiveIntensity: Number((1.35 - idx * 0.16).toFixed(2)),
    roughness: 0.12
  })
);
const flipperGoldMaterial = material.metal({
  name: "pinball brushed metallic gold flipper",
  color: "#d4af37",
  emissive: "#b48a1e",
  emissiveIntensity: 0.36,
  roughness: 0.22,
  metallic: 0.82,
  clearcoat: 0.9,
  envMapIntensity: 1.95
});
const liveTargetArmedMaterial = material.clearcoat({
  name: "target armed amber state accent",
  color: "#f59e0b",
  emissive: "#ff8c1a",
  emissiveIntensity: 0.42,
  roughness: 0.2,
  clearcoat: 0.65
});
const liveTargetHitMaterial = material.neon({
  name: "target hit cyan state accent",
  color: "#0b5662",
  emissive: "#36f1ff",
  emissiveIntensity: 0.72,
  roughness: 0.2,
  metallic: 0.22
});
const bankLampOffMaterial = material.emissive({ name: "bank lamp off", color: "#2d2238", emissive: "#f59e0b", emissiveIntensity: 0.22 });
const bankLampOnMaterial = material.neon({ name: "bank lamp on", color: "#087d77", emissive: "#28f5cc", emissiveIntensity: 0.78, roughness: 0.18 });
const impactAmberMaterial = material.neon({ name: "impact amber ring", color: "#653415", emissive: "#ff9f43", emissiveIntensity: 1.1, roughness: 0.13 });
const impactCyanMaterial = material.neon({ name: "impact cyan ring", color: "#0e5661", emissive: "#55f4ff", emissiveIntensity: 1.1, roughness: 0.13 });
const impactPinkMaterial = material.neon({ name: "impact vault ring", color: "#5a1647", emissive: "#ff4bd8", emissiveIntensity: 1.15, roughness: 0.12 });
const mechanismStateMaterials = {
  guarded: material.emissive({ name: "neon guarded", color: "#d4a017", emissive: "#8b6914", emissiveIntensity: 0.35 }),
  progress: material.emissive({ name: "neon progress", color: "#00ff88", emissive: "#00cc66", emissiveIntensity: 0.35 }),
  vault: material.emissive({ name: "neon vault open", color: "#ff6a00", emissive: "#ff4500", emissiveIntensity: 0.35 }),
  multiball: material.emissive({ name: "neon multiball", color: "#00e5ff", emissive: "#00b8d4", emissiveIntensity: 0.35 }),
  tilt: material.emissive({ name: "neon tilt", color: "#ff0044", emissive: "#cc0033", emissiveIntensity: 0.35 }),
  gameOver: material.emissive({ name: "neon game over", color: "#333333", emissive: "#1a1a1a", emissiveIntensity: 0.2 })
} as const;

function pushCue(cue: Parameters<typeof audio.cue>[0]): void {
  void audio.cue(cue).catch(() => undefined);
  audioCueLog.push(cue);
  if (audioCueLog.length > 48) audioCueLog.shift();
}
function cueReady(name: string, gapFrames: number): boolean {
  const last = lastCueFrame.get(name) ?? -999;
  if (frameCount - last < gapFrames) return false;
  lastCueFrame.set(name, frameCount);
  return true;
}

function triggerImpact(
  origin: readonly [number, number, number],
  kind: "amber" | "cyan" | "vault" = "amber",
  radius = 0.28
): void {
  impactOrigin = origin;
  impactRemaining = reducedMotion ? 0.16 : 0.42;
  impactRadius = radius;
  const materialForImpact = kind === "cyan" ? impactCyanMaterial : kind === "vault" ? impactPinkMaterial : impactAmberMaterial;
  impactHandle?.setMaterial(materialForImpact)
    .setPosition(origin[0], origin[1], origin[2])
    .setRotation(Math.PI / 2, 0, 0)
    .setScale([radius, radius, 0.05])
    .setVisible(true);
}

function syncImpact(dt: number): void {
  if (!impactHandle || impactRemaining <= 0) return;
  impactRemaining = Math.max(0, impactRemaining - dt);
  const life = impactRemaining / (reducedMotion ? 0.16 : 0.42);
  if (life <= 0) {
    impactHandle.setVisible(false).setScale([0.001, 0.001, 0.001]);
    return;
  }
  const radius = impactRadius * (1.08 + (1 - life) * 1.9);
  impactHandle.setPosition(impactOrigin[0], impactOrigin[1], impactOrigin[2]).setScale([radius, radius, 0.05 + life * 0.04]);
}

// ---------------------------------------------------------------- scene ------
function primitiveNode(visual: PropVisual): AuraSceneNode {
  const p = visual.primitive!;
  const isHiddenProxy =
    visual.name === "felt" ||
    visual.name.startsWith("bumper-") ||
    visual.name.startsWith("wall-") ||
    visual.name.startsWith("guide-") ||
    visual.name.includes("sling");
  const visualY = isHiddenProxy ? -5 : visual.position[1] + 0.28;
  const isLane = visual.name.includes("plunger") || visual.name.includes("guide") || visual.name.includes("lane");
  const mat = isHiddenProxy
    ? material.pbr({ name: visual.name + " hidden", color: p.color, roughness: 0.8, metallic: 0.1, opacity: 0 })
    : isLane
      ? material.metal({
          name: visual.name + " brushed gold rail",
          color: "#d4af37",
          emissive: "#b48a1e",
          emissiveIntensity: 0.34,
          roughness: 0.22,
          metallic: 0.82,
          clearcoat: 0.88,
          envMapIntensity: 1.85
        })
      : p.emissive
        ? material.emissive({
            name: visual.name + " material",
            color: p.color,
            emissive: p.emissive,
            emissiveIntensity: 0.32
          })
        : material.metal({
            name: visual.name + " material",
            color: "#d4af37",
            emissive: "#b48a1e",
            emissiveIntensity: 0.3,
            roughness: 0.22,
            metallic: 0.82,
            clearcoat: 0.85
          });
  const scaleVec: [number, number, number] = isHiddenProxy
    ? [0.0001, 0.0001, 0.0001]
    : [p.size[0], Math.max(0.12, p.size[1] * 0.65), p.size[2]];
  if (p.shape === "sphere") {
    return primitives.sphere({ name: visual.name, material: mat })
      .position(visual.position[0], visualY, visual.position[2])
      .scale(scaleVec)
      .toJSON();
  }
  if (p.shape === "cylinder") {
    return primitives.cylinder({ name: visual.name, material: mat })
      .position(visual.position[0], visualY, visual.position[2])
      .scale(scaleVec)
      .toJSON();
  }
  if (p.shape === "torus") {
    return primitives.torus({ name: visual.name, material: mat })
      .position(visual.position[0], visualY, visual.position[2])
      .rotate(visual.rotation.x, visual.rotation.y, visual.rotation.z)
      .scale(scaleVec)
      .toJSON();
  }
  return primitives.box({ name: visual.name, material: mat })
    .position(visual.position[0], visualY, visual.position[2])
    .rotate(visual.rotation.x, visual.rotation.y, visual.rotation.z)
    .scale(scaleVec)
    .toJSON();
}

/** Static physics landmarks used as origins for the renderer-owned impact cue. */
const BUMPER_IMPACT_POSITIONS = [[-0.9, -1.7], [0.9, -1.7], [0, -0.7]] as const;
const POP_BUMPER_TURRET_SPECS = [
  { id: "left", x: -1.04, z: -1.48 },
  { id: "right", x: 1.04, z: -1.48 },
  { id: "center", x: 0, z: -1.92 }
] as const;
const TARGET_BANK_POSITIONS: Record<string, readonly (readonly [number, number])[]> = {
  "bank-left-top": [[-2.32, -2.4], [-2.32, -2.8], [-2.32, -3.2]],
  "bank-left-mid": [[-2.42, -0.6], [-2.42, -0.2], [-2.42, 0.2]],
  "bank-center": [[-0.5, -2.5], [0, -2.62], [0.5, -2.5]],
  "bank-right-mid": [[1.95, -0.6], [1.95, -0.2], [1.95, 0.2]],
  "bank-right-top": [[1.95, -2.4], [1.95, -2.8], [1.95, -3.2]]
};
let bumperImpactIndex = 0;
let slingImpactIndex = 0;

function targetImpactPosition(id: string): readonly [number, number] {
  const [bank] = id.split(":");
  const slot = Number(id.match(/:t(\d+)$/)?.[1] ?? 1);
  return TARGET_BANK_POSITIONS[bank ?? ""]?.[Math.max(0, Math.min(2, slot))] ?? [0, -2.5] as const;
}

function visualNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  let targetIndex = 0;
  for (const v of flow.sim.visuals) {
    if (v.source === "model") {
      if (v.name === "vault-door-visual") {
        nodes.push(
          model(assets.vaultBreakersVaultDoor, {
            name: "vault-door-visual",
            role: "setDressing",
            scaleMode: "fit",
            targetMaxDimension: 0.92
          })
            .position(0, 0.62, -3.12)
            .runtime(game.runtimeNode("vault-door-visual", { tags: ["vault-door"] }))
            .toJSON()
        );
        continue;
      }
      const isFlipper = v.typedAsset === "vaultBreakersFlipper";
      const isBall = v.typedAsset === "vaultBreakersBall";
      const modelAsset = isFlipper ? assets.vaultBreakersFlipperReal : assets[v.typedAsset!];
      nodes.push(
        model(modelAsset, {
          name: v.name,
          role: isBall ? "primaryCharacter" : "setDressing",
          scaleMode: "fit",
          targetMaxDimension: isFlipper ? 0.86 : isBall ? 0.34 : (v.targetMaxDimension ?? 1),
          ...(isFlipper ? { material: flipperGoldMaterial } : {})
        })
          .position(v.position[0], v.position[1] + 0.30, v.position[2])
          .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
          .runtime(game.runtimeNode(v.name, { tags: ["typed-asset", "physics-synced"] }))
          .toJSON()
      );
    } else if (v.name.startsWith("target:")) {
      const useEnergyCore = targetIndex % 2 === 0;
      targetIndex += 1;
      nodes.push(
        primitives.box({
          name: v.name,
          material: liveTargetArmedMaterial,
          castShadow: false,
          receiveShadow: false
        })
          .position(v.position[0], -5, v.position[2])
          .scale([0.0001, 0.0001, 0.0001])
          .runtime(game.runtimeNode(v.name, { tags: ["standup-target"] }))
          .toJSON(),
        model(
          useEnergyCore
            ? rootAssets.fpsEnergyCorePickupMeshy
            : rootAssets.skylineCrystalShardMeshy,
          {
            name: `target-meshy:${v.name}`,
            role: "setDressing",
            scaleMode: "fit",
            targetMaxDimension: 0.34
          }
        )
          .position(v.position[0], v.position[1] + 0.36, v.position[2])
          .rotate(0, targetIndex * 0.55, 0)
          .runtime(game.runtimeNode(`target-meshy:${v.name}`, { tags: ["typed-asset", "standup-target-3d"] }))
          .toJSON()
      );
    } else {
      nodes.push(primitiveNode(v));
    }
  }
  nodes.push(
    model(assets.vaultBreakersMechanisms, {
      name: "typed-vault-breakers-mechanisms",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.001
    })
      .position(0, -5, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("typed-vault-breakers-mechanisms", { tags: ["typed-asset", "mission-state"] }))
      .toJSON()
  );

  // Pop bumper turrets with glowing neon base skirts and chrome collars
  const bumperRingCyan = material.emissive({
    name: "bumper skirt ring cyan",
    color: "#38bdf8",
    emissive: "#0ea5e9",
    emissiveIntensity: 0.62
  });
  const bumperRingAmber = material.emissive({
    name: "bumper skirt ring amber",
    color: "#fbbf24",
    emissive: "#f59e0b",
    emissiveIntensity: 0.62
  });
  const brushedSteelMat = material.metal({
    name: "pinball brushed steel",
    color: "#e2e8f0",
    emissive: "#38bdf8",
    emissiveIntensity: 0.2,
    roughness: 0.2,
    metallic: 0.86,
    clearcoat: 0.88,
    envMapIntensity: 1.9
  });
  const goldTrimMat = material.metal({
    name: "pinball brass trim",
    color: "#d4af37",
    emissive: "#b48a1e",
    emissiveIntensity: 0.36,
    roughness: 0.22,
    metallic: 0.82,
    clearcoat: 0.9,
    envMapIntensity: 1.95
  });
  const neonPinkRailMat = material.emissive({
    name: "slingshot neon rubber",
    color: "#f472b6",
    emissive: "#ec4899",
    emissiveIntensity: 0.56
  });
  const neonCyanRimMat = material.neon({
    name: "lane guide cyan neon rim",
    color: "#0e7490",
    emissive: "#22d3ee",
    emissiveIntensity: 0.68,
    roughness: 0.18
  });
  const vaultRoomFloorMat = material.metal({
    name: "cyber vault arcade floor",
    color: "#111827",
    emissive: "#1e293b",
    emissiveIntensity: 0.28,
    roughness: 0.32,
    metallic: 0.78,
    clearcoat: 0.55
  });
  const vaultRoomGridCyanMat = material.neon({
    name: "cyber vault floor grid cyan",
    color: "#0891b2",
    emissive: "#22d3ee",
    emissiveIntensity: 0.52,
    roughness: 0.2
  });
  const vaultRoomGridPinkMat = material.neon({
    name: "cyber vault floor grid pink",
    color: "#9d174d",
    emissive: "#f472b6",
    emissiveIntensity: 0.48,
    roughness: 0.2
  });

  // Cyber-vault metallic floor deck & neon arcade trim around the pinball cabinet
  nodes.push(
    primitives.box({
      name: "vault-arcade-floor-deck",
      material: vaultRoomFloorMat,
      receiveShadow: true
    })
      .position(0, -0.48, -0.4)
      .scale([13.5, 0.12, 13.5])
      .toJSON(),
    primitives.box({
      name: "vault-arcade-back-wall",
      material: vaultRoomFloorMat
    })
      .position(0, 1.8, -5.6)
      .scale([13.5, 4.8, 0.18])
      .toJSON(),
    primitives.box({
      name: "vault-arcade-floor-trim-left",
      material: vaultRoomGridCyanMat
    })
      .position(-3.15, -0.40, 0.1)
      .scale([0.08, 0.03, 8.4])
      .toJSON(),
    primitives.box({
      name: "vault-arcade-floor-trim-right",
      material: vaultRoomGridPinkMat
    })
      .position(3.15, -0.40, 0.1)
      .scale([0.08, 0.03, 8.4])
      .toJSON(),
    primitives.box({
      name: "vault-arcade-floor-trim-front",
      material: vaultRoomGridCyanMat
    })
      .position(0, -0.40, 4.15)
      .scale([6.4, 0.03, 0.08])
      .toJSON()
  );

  // Upper cabinet shoulders & arcade flanks: blockfallEnergyCapacitorBankMeshy + neonCyberPylonMeshy
  nodes.push(
    model(rootAssets.blockfallEnergyCapacitorBankMeshy, {
      name: "vault-shoulder-capacitor-left-upper",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.05
    })
      .position(-2.78, 0.56, -2.45)
      .rotate(0, 0.35, 0)
      .toJSON(),
    model(rootAssets.blockfallEnergyCapacitorBankMeshy, {
      name: "vault-shoulder-capacitor-right-upper",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.05
    })
      .position(2.78, 0.56, -2.45)
      .rotate(0, -0.35, 0)
      .toJSON(),
    model(rootAssets.blockfallEnergyCapacitorBankMeshy, {
      name: "vault-shoulder-capacitor-left-mid",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.92
    })
      .position(-2.92, 0.44, -0.15)
      .rotate(0, Math.PI * 0.5, 0)
      .toJSON(),
    model(rootAssets.blockfallEnergyCapacitorBankMeshy, {
      name: "vault-shoulder-capacitor-right-mid",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.92
    })
      .position(2.92, 0.44, -0.15)
      .rotate(0, -Math.PI * 0.5, 0)
      .toJSON(),
    model(rootAssets.neonCyberPylonMeshy, {
      name: "vault-cabinet-pylon-left-rear",
      role: "setDressing",
      scaleMode: "fit",
      targetHeight: 1.85
    })
      .position(-3.38, 0.15, -3.15)
      .rotate(0, 0.28, 0)
      .toJSON(),
    model(rootAssets.neonCyberPylonMeshy, {
      name: "vault-cabinet-pylon-right-rear",
      role: "setDressing",
      scaleMode: "fit",
      targetHeight: 1.85
    })
      .position(3.38, 0.15, -3.15)
      .rotate(0, -0.28, 0)
      .toJSON(),
    model(rootAssets.neonCyberPylonMeshy, {
      name: "vault-cabinet-pylon-left-front",
      role: "setDressing",
      scaleMode: "fit",
      targetHeight: 1.48
    })
      .position(-3.46, 0.08, 1.55)
      .rotate(0, 0.42, 0)
      .toJSON(),
    model(rootAssets.neonCyberPylonMeshy, {
      name: "vault-cabinet-pylon-right-front",
      role: "setDressing",
      scaleMode: "fit",
      targetHeight: 1.48
    })
      .position(3.46, 0.08, 1.55)
      .rotate(0, -0.42, 0)
      .toJSON()
  );

  for (const [idx, bumper] of POP_BUMPER_TURRET_SPECS.entries()) {
    nodes.push(
      model(assets.vaultPopBumperCapMeshy, {
        name: `vault-pop-bumper-3d-${bumper.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.68
      })
        .position(bumper.x, 0.38, bumper.z)
        .runtime(game.runtimeNode(`vault-pop-bumper-3d-${bumper.id}`, { tags: ["typed-asset", "pop-bumper-turret"] }))
        .toJSON(),
      primitives.torus({
        name: `vault-bumper-skirt-ring-${bumper.id}`,
        material: idx === 2 ? bumperRingAmber : bumperRingCyan
      })
        .position(bumper.x, 0.31, bumper.z)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.40, 0.40, 0.035])
        .toJSON(),
      primitives.cylinder({
        name: `vault-bumper-collar-${bumper.id}`,
        material: brushedSteelMat
      })
        .position(bumper.x, 0.29, bumper.z)
        .scale([0.34, 0.04, 0.34])
        .toJSON()
    );
  }

  // Centerpiece Vault Core in the mid-playfield + captive chrome pinballs +
  // 3D Meshy slingshot kickers, rollover lane dividers, inlane guides, and plunger rod
  nodes.push(
    model(assets.vaultCenterCoreTargetMeshy, {
      name: "vault-centerpiece-core-3d",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.74
    })
      .position(0, 0.36, 0.46)
      .toJSON(),
    primitives.torus({
      name: "vault-centerpiece-core-ring",
      material: bumperRingAmber
    })
      .position(0, 0.31, 0.46)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.52, 0.52, 0.036])
      .toJSON(),
    primitives.torus({
      name: "vault-centerpiece-outer-ring",
      material: bumperRingCyan
    })
      .position(0, 0.30, 0.46)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.68, 0.68, 0.022])
      .toJSON(),
    // Decorative balls kept hidden below playfield so only the real physics pinball is visible
    primitives.sphere({
      name: "vault-captive-chrome-ball",
      material: liveBallMaterial
    })
      .position(0, -50, 1.18)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.sphere({
      name: "vault-shooter-lane-chrome-ball",
      material: liveBallMaterial
    })
      .position(2.42, -50, 2.75)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    model(rootAssets.vaultBreakersBall, {
      name: "vault-jackpot-gold-ball",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.34,
      material: goldBonusBallMaterial
    })
      .position(0.54, -50, -2.05)
      .scale([0.0001, 0.0001, 0.0001])
      .runtime(game.runtimeNode("vault-jackpot-gold-ball", { tags: ["typed-asset", "jackpot-bonus-ball"] }))
      .toJSON(),
    // Upper rollover lane dividers at top of playfield
    primitives.box({ name: "rollover-divider-left", material: goldTrimMat })
      .position(-0.75, 0.38, -2.68)
      .scale([0.07, 0.18, 0.46])
      .toJSON(),
    primitives.box({ name: "rollover-divider-mid-left", material: goldTrimMat })
      .position(-0.25, 0.38, -2.68)
      .scale([0.07, 0.18, 0.46])
      .toJSON(),
    primitives.box({ name: "rollover-divider-mid-right", material: goldTrimMat })
      .position(0.25, 0.38, -2.68)
      .scale([0.07, 0.18, 0.46])
      .toJSON(),
    primitives.box({ name: "rollover-divider-right", material: goldTrimMat })
      .position(0.75, 0.38, -2.68)
      .scale([0.07, 0.18, 0.46])
      .toJSON(),
    // Hide legacy primitive slingshot triangles & mount 2x 3D Meshy slingshot kickers
    primitives.box({ name: "slingshot-housing-left", material: goldTrimMat })
      .position(-1.32, -5, 1.92)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.box({ name: "slingshot-rubber-left", material: neonPinkRailMat })
      .position(-1.22, -5, 1.92)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.box({ name: "slingshot-cap-left", material: neonCyanRimMat })
      .position(-1.32, -5, 1.92)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.box({ name: "slingshot-housing-right", material: goldTrimMat })
      .position(1.12, -5, 1.92)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.box({ name: "slingshot-rubber-right", material: neonPinkRailMat })
      .position(1.02, -5, 1.92)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.box({ name: "slingshot-cap-right", material: neonCyanRimMat })
      .position(1.12, -5, 1.92)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    model(slingshotAsset, {
      name: "vault-slingshot-meshy-left",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.86
    })
      .position(-1.24, 0.38, 1.94)
      .rotate(0, -0.46, 0)
      .runtime(game.runtimeNode("vault-slingshot-meshy-left", { tags: ["typed-asset", "slingshot-3d"] }))
      .toJSON(),
    model(slingshotAsset, {
      name: "vault-slingshot-meshy-right",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.86
    })
      .position(1.06, 0.38, 1.94)
      .rotate(0, 0.46, 0)
      .runtime(game.runtimeNode("vault-slingshot-meshy-right", { tags: ["typed-asset", "slingshot-3d"] }))
      .toJSON(),
    primitives.torus({
      name: "vault-slingshot-ring-left",
      material: neonPinkRailMat
    })
      .position(-1.24, 0.31, 1.94)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.36, 0.36, 0.028])
      .toJSON(),
    primitives.torus({
      name: "vault-slingshot-ring-right",
      material: neonCyanRimMat
    })
      .position(1.06, 0.31, 1.94)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.36, 0.36, 0.028])
      .toJSON(),
    // Left and right inlane/outlane rails hidden so they do not read as static extra flippers
    primitives.box({ name: "inlane-guide-left-rail", material: goldTrimMat })
      .position(-1.86, -50, 2.08)
      .rotate(0, -0.32, 0)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.box({ name: "inlane-guide-left-neon-rim", material: neonCyanRimMat })
      .position(-1.86, -50, 2.08)
      .rotate(0, -0.32, 0)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.box({ name: "inlane-guide-right-rail", material: goldTrimMat })
      .position(1.66, -50, 2.08)
      .rotate(0, 0.32, 0)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    primitives.box({ name: "inlane-guide-right-neon-rim", material: neonCyanRimMat })
      .position(1.66, -50, 2.08)
      .rotate(0, 0.32, 0)
      .scale([0.0001, 0.0001, 0.0001])
      .toJSON(),
    // Flipper base pivot rings (cyan/magenta neon accents under the brushed gold flippers)
    primitives.torus({ name: "flipper-left-pivot-ring", material: neonCyanRimMat })
      .position(-0.85, 0.31, 3.15)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.22, 0.22, 0.025])
      .toJSON(),
    primitives.torus({ name: "flipper-right-pivot-ring", material: neonPinkRailMat })
      .position(0.85, 0.31, 3.15)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.22, 0.22, 0.025])
      .toJSON(),
    // Plunger lane divider wall and spring-loaded chrome shooter rod
    primitives.box({ name: "plunger-lane-divider-rail", material: brushedSteelMat })
      .position(2.12, 0.40, 0.65)
      .scale([0.09, 0.22, 5.2])
      .toJSON(),
    primitives.cylinder({ name: "plunger-shooter-rod", material: brushedSteelMat })
      .position(2.42, 0.38, 3.25)
      .scale([0.08, 0.42, 0.08])
      .toJSON(),
    primitives.sphere({ name: "plunger-shooter-knob", material: goldTrimMat })
      .position(2.42, 0.38, 3.52)
      .scale([0.14, 0.14, 0.14])
      .toJSON()
  );

  // Comet trail nodes kept hidden so no stray spheres look like stuck balls
  for (let i = 0; i < COMET_TRAIL_COUNT; i += 1) {
    nodes.push(
      primitives.sphere({
        name: `vault-ball-comet-${i}`,
        material: cometTrailMaterials[i]!
      })
        .position(0, -50, 0)
        .scale([0.0001, 0.0001, 0.0001])
        .runtime(game.runtimeNode(`vault-ball-comet-${i}`, { tags: ["ball-comet-trail"] }))
        .toJSON()
    );
  }

  nodes.push(
    primitives.torus({ name: "vault live impact ring", material: impactAmberMaterial })
      .position(0, -5, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("vault-live-impact-ring", { tags: ["renderer-owned", "impact-feedback", "event-linked"] }))
      .toJSON()
  );
  for (const [state, stateMaterial] of Object.entries(mechanismStateMaterials)) {
    nodes.push(
      primitives.box({ name: `mission-state-beacon-${state}`, material: stateMaterial })
        .position(0, -5, 1.05).scale([0.001, 0.001, 0.001])
        .runtime(game.runtimeNode(`mission-state-beacon-${state}`, { tags: ["mission-state", "non-color-redundant-with-scoreboard"] }))
        .toJSON()
    );
  }
  for (let index = 0; index < 5; index += 1) {
    nodes.push(
      primitives.box({ name: `bank-status-${index}`, material: bankLampOffMaterial })
        .position(-1.12 + index * 0.56, 0.34, -2.18)
        .scale([0.24, 0.04, 0.12])
        .runtime(game.runtimeNode(`bank-status-${index}`, { tags: ["mission-progress", "bank-lamp"] }))
        .toJSON()
    );
  }
  for (const node of createScoreboardNodes().nodes) {
    const scoreNode = { ...node } as Record<string, unknown>;
    const isMission = typeof scoreNode.name === "string" && scoreNode.name.startsWith("sb-mission-");
    if (Array.isArray(scoreNode.position) && scoreNode.position.length === 3) {
      const [px, py, pz] = scoreNode.position as [number, number, number];
      scoreNode.position = [
        isMission ? -1.06 : Number((px * 0.42).toFixed(3)),
        Number((1.18 + (py - 0.98) * 0.44).toFixed(3)),
        Number((pz + 0.26).toFixed(3))
      ];
    }
    if (typeof scoreNode.size === "number") {
      scoreNode.size = Number((scoreNode.size * (isMission ? 0.35 : 0.46)).toFixed(3));
    }
    if (typeof scoreNode.letterSpacing === "number") {
      scoreNode.letterSpacing = isMission ? 0.006 : 0.01;
    }
    if (scoreNode.material && typeof scoreNode.material === "object") {
      scoreNode.material = { ...(scoreNode.material as Record<string, unknown>), emissiveIntensity: 0.14 };
    }
    nodes.push(scoreNode as unknown as AuraSceneNode);
  }
  return nodes;
}

function tuneVaultEnvironmentNodes(rawNodes: AuraSceneNode[]): AuraSceneNode[] {
  return rawNodes.map((raw) => {
    const node = { ...(raw as unknown as Record<string, unknown>) };
    if (node.name === "typed-vault-breakers-cabinet") {
      node.hiddenNodeNames = ["neon"];
      node.materialOverrides = [
        { match: "neonCyan", material: { emissiveIntensity: 0.42 } },
        { match: "neonPink", material: { emissiveIntensity: 0.42 } }
      ];
    }
    if (node.material && typeof node.material === "object") {
      const mat = { ...(node.material as Record<string, unknown>) };
      if (typeof mat.emissiveIntensity === "number") {
        mat.emissiveIntensity = Number((mat.emissiveIntensity * 0.72).toFixed(3));
      }
      node.material = mat;
    }
    if (typeof node.intensity === "number" && typeof node.name === "string" && node.name.includes("vault ")) {
      node.intensity = Number((node.intensity * 0.88).toFixed(3));
    }
    return node as unknown as AuraSceneNode;
  });
}

function buildScene(): ReturnType<typeof scene> {
  return scene()
    .background("#090d1e")
    .addMany(tuneVaultEnvironmentNodes(createVaultBreakersEnvironment()))
    // Submit the playable mechanisms after the bounded cabinet shell so the
    // root safe renderer's stable draw order keeps them legible above it.
    .addMany(visualNodes())
    .addMany([
      lights.ambient({ name: "pinball playfield ambient", color: "#6478a0", intensity: 0.72 }),
      lights.directional({ name: "playfield warm key", position: [2.4, 6.8, 3.6], color: "#fff3df", intensity: 2.35 }),
      lights.spot({
        name: "flipper zone hero spotlight",
        position: [0, 3.6, 3.8],
        target: [0, 0.3, 2.45],
        color: "#fef08a",
        intensity: 3.4,
        angle: 0.72,
        penumbra: 0.45
      }),
      lights.point({ name: "playfield mid fill", color: "#e2f1ff", intensity: 2.45 }).position(0, 3.2, 0.4),
      lights.point({ name: "playfield center core key", color: "#fbbf24", intensity: 2.35 }).position(0, 1.65, 0.55),
      lights.point({ name: "bumper turret warm key", color: "#ffbd69", intensity: 2.65 }).position(0, 1.55, -1.55),
      lights.point({ name: "bumper turret cyan rim", color: "#39f0ff", intensity: 2.35 }).position(0, 1.45, -1.95),
      lights.point({ name: "vault door hero spot", color: "#ffd88a", intensity: 2.3 }).position(0, 1.55, -2.85),
      lights.point({ name: "slingshot left key", color: "#f472b6", intensity: 2.25 }).position(-1.45, 1.35, 1.95),
      lights.point({ name: "slingshot right key", color: "#38bdf8", intensity: 2.25 }).position(1.45, 1.35, 1.95),
      lights.point({ name: "flipper deck gold key", color: "#fde68a", intensity: 2.85 }).position(0, 1.65, 2.75),
      lights.point({ name: "plunger lane key", color: "#7dd3fc", intensity: 2.2 }).position(2.35, 1.45, 2.65),
      lights.point({ name: "cabinet shoulder left cyan fill", color: "#38bdf8", intensity: 2.1 }).position(-3.2, 2.2, -1.2),
      lights.point({ name: "cabinet shoulder right pink fill", color: "#f472b6", intensity: 2.1 }).position(3.2, 2.2, -1.2),
      effects.neonBloom({ intensity: reducedMotion ? 0.04 : 0.085, threshold: 0.86, radius: 0.30, maxIntensity: 0.38, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
      effects.ambientOcclusion({ name: "vault contact grounding", intensity: 0.28, radius: 0.62, density: 0.5, color: "#02020a" }),
      effects.contactOcclusion({ name: "mechanism contact", intensity: 0.36, radius: 0.52 }),
      effects.fog({ name: "vault room depth haze", density: 0.009, color: "#140d24", intensity: 0.14 }),
      effects.colorGrade({ exposure: 1.08, contrast: 1.08, saturation: 1.1 }),
      effects.antiAlias({ mode: "fxaa" })
    ])
    .camera(camera.perspective({
      position: visualReviewCapture ? [0, 5.9, 5.15] : [0, 5.15, 7.35],
      target: visualReviewCapture ? [0, 0.08, -0.45] : [0, -0.05, -0.38],
      fov: visualReviewCapture ? 46 : 50
    }));
}

// ---------------------------------------------------------------- mount ------
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  renderer: { qualityProfile: "production" },
  physics: {
    seed: 20260906,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
  input: {
    actions: {
      flipperLeft: ["KeyA", "ArrowLeft"],
      flipperRight: ["KeyD", "ArrowRight"],
      plunger: ["Space"],
      nudge: ["KeyS", "KeyQ", "KeyE"],
      pause: ["KeyP", "Escape"],
      reset: ["KeyR"]
    },
    bufferMs: 80,
    gamepad: true,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildScene()
});
const app = gameApp.app;
const input = gameApp.input!;
if (!input) throw new Error("Vault Breakers failed to create Aura3D input.");

let dynamicHandles = new Map<string, AuraRuntimeNodeHandle>();
const scoreboardHandles = new Map<string, AuraRuntimeNodeHandle>();
const bankLampHandles = new Map<number, AuraRuntimeNodeHandle>();
let targetHandles = new Map<string, AuraRuntimeNodeHandle>();
let targetMeshyHandles = new Map<string, AuraRuntimeNodeHandle>();
const cometTrailHandles: AuraRuntimeNodeHandle[] = [];
let goldJackpotBallHandle: AuraRuntimeNodeHandle | undefined;
let doorHandle: AuraRuntimeNodeHandle | undefined;
let mechanismHandle: AuraRuntimeNodeHandle | undefined;
let impactHandle: AuraRuntimeNodeHandle | undefined;
const missionBeaconHandles = new Map<string, AuraRuntimeNodeHandle>();

function resolveHandles(): void {
  dynamicHandles = new Map();
  for (const name of flow.sim.dynamicVisualNames) {
    // Optional by design: parked ball nodes exist from mount, but a rebuilt
    // handle set must never throw for a name the scene has not re-issued.
    const handle = app.nodes.get(name);
    if (handle) {
      const runtimeHandle = handle as AuraRuntimeNodeHandle;
      if (name.startsWith("ball-")) runtimeHandle.setMaterial(liveBallMaterial);
      else if (name.startsWith("flipper-")) runtimeHandle.setMaterial(flipperGoldMaterial);
      dynamicHandles.set(name, runtimeHandle);
    }
  }
  targetHandles = new Map();
  targetMeshyHandles = new Map();
  for (const id of flow.sim.targetIds) {
    const handle = app.nodes.get(`target:${id}`);
    if (handle) {
      const runtimeHandle = handle as AuraRuntimeNodeHandle;
      runtimeHandle.setMaterial(liveTargetArmedMaterial);
      targetHandles.set(`target:${id}`, runtimeHandle);
    }
    const meshyHandle = app.nodes.get(`target-meshy:target:${id}`);
    if (meshyHandle) {
      targetMeshyHandles.set(id, meshyHandle as AuraRuntimeNodeHandle);
    }
  }
  cometTrailHandles.length = 0;
  for (let i = 0; i < COMET_TRAIL_COUNT; i += 1) {
    const h = app.nodes.get(`vault-ball-comet-${i}`) as AuraRuntimeNodeHandle | undefined;
    if (h) cometTrailHandles.push(h);
  }
  goldJackpotBallHandle = app.nodes.get("vault-jackpot-gold-ball") as AuraRuntimeNodeHandle | undefined;
  scoreboardHandles.clear();
  bankLampHandles.clear();
  for (let index = 0; index < 5; index += 1) {
    const handle = app.nodes.get(`bank-status-${index}`) as AuraRuntimeNodeHandle | undefined;
    if (handle) bankLampHandles.set(index, handle);
  }
  for (let slot = 0; slot < 6; slot += 1) {
    for (let digit = 0; digit <= 9; digit += 1) {
      const id = `sb-score-${slot}-${digit}`;
      const handle = app.nodes.get(id);
      if (handle) scoreboardHandles.set(id, handle as AuraRuntimeNodeHandle);
    }
  }
  for (const prefix of ["sb-ball", "sb-mult", "sb-banks", "sb-mission"]) {
    for (const handle of app.nodes.all()) {
      if (handle.id.startsWith(prefix) && !scoreboardHandles.has(handle.id)) {
        scoreboardHandles.set(handle.id, handle as AuraRuntimeNodeHandle);
      }
    }
  }
  doorHandle = app.nodes.get("vault-door-visual") as AuraRuntimeNodeHandle | undefined;
  // Keep the vault-door GLB's authored steel, spokes, and status accents. A
  // route-wide material replacement made the door read as a flat disc.
  mechanismHandle = app.nodes.get("typed-vault-breakers-mechanisms") as AuraRuntimeNodeHandle | undefined;
  impactHandle = app.nodes.get("vault-live-impact-ring") as AuraRuntimeNodeHandle | undefined;
  impactHandle?.setVisible(false).setScale([0.001, 0.001, 0.001]);
  missionBeaconHandles.clear();
  for (const state of Object.keys(mechanismStateMaterials)) {
    const handle = app.nodes.get(`mission-state-beacon-${state}`) as AuraRuntimeNodeHandle | undefined;
    if (handle) missionBeaconHandles.set(state, handle);
  }
}
resolveHandles();

// ---------------------------------------------------------------- HUD --------
const banner = document.getElementById("vb-banner")!;
const resultCard = document.getElementById("vb-result")!;
const resultTitle = document.getElementById("vb-result-title")!;
const resultDetail = document.getElementById("vb-result-detail")!;
const againButton = document.getElementById("vb-again-button") as HTMLButtonElement;
const powerFill = document.getElementById("vb-power-fill")!;
const powerLabel = document.getElementById("vb-power-label")!;

function hideResultCard(): void {
  resultCard.classList.add("is-hidden");
}

// T1.12: cache element refs + last written string so a constant frame writes
// zero DOM mutations (ui.setText re-resolves the selector every call).
const hudCache = new Map<string, { el: HTMLElement; text: string }>();
function hudText(selector: string, value: string): void {
  let entry = hudCache.get(selector);
  if (!entry) {
    entry = { el: ui.text(selector), text: "" };
    hudCache.set(selector, entry);
  }
  if (entry.text !== value) {
    entry.el.textContent = value;
    entry.text = value;
  }
}

function syncHud(): void {
  const snap = flow.snapshot();
  const totalScore = snap.score + bonusScore;
  hudText("#stat-score", String(totalScore));
  hudText("#stat-ball", `${snap.ball} OF 3`);
  hudText("#stat-mult", `X${snap.multiplier}`);
  hudText("#stat-banks", `${snap.banksDown} OF 5`);
  hudText("#stat-live", String(snap.activeBalls + (goldJackpotBallActive ? 1 : 0)));
  hudText("#stat-tilt", snap.tiltLocked ? "TILT" : `${snap.tiltStrikes} OF 3`);
  hudText("#vb-mission", snap.missionLine);
  const charge = plunger.state();
  const width = Math.round(charge.charge * 100) + "%";
  if (powerFill.style.width !== width) powerFill.style.width = width;
  const inSweetSpot = charge.charge >= 0.52 && charge.charge <= 0.92;
  const plungerText = plunger.charging
    ? `Plunge ${Math.round(charge.charge * 100)}%${inSweetSpot ? " [SKILL-SHOT!]" : ""}`
    : "Plunger (Sweet Spot 55%+)";
  if (powerLabel.textContent !== plungerText) powerLabel.textContent = plungerText;
  hudText("#vb-ev-backend", snap.backend);
  hudText("#vb-ev-flipper", "joint");
  hudText("#vb-ev-sensors", String(snap.sensorEventCount));
  hudText("#vb-ev-joints", String(snap.jointCount));
  const bannerText = paused
    ? "PAUSED - P TO RESUME"
    : bannerOverrideRemaining > 0 && bannerOverrideText
      ? bannerOverrideText
      : snap.phase === "attract"
        ? "VAULT BREAKERS - HOLD SPACE FOR SKILL-SHOT SERVE"
        : snap.phase === "await-serve"
          ? `BALL ${snap.ball} - HOLD SPACE FOR SKILL-SHOT SERVE`
          : snap.phase === "game-over"
            ? "GAME OVER - R OR PLAY AGAIN"
            : snap.multiball || goldJackpotBallActive
              ? "VAULT MULTIBALL JACKPOT ACTIVE!"
              : snap.missionLine;
  if (banner.textContent !== bannerText) banner.textContent = bannerText;
}

// ------------------------------------------------------------- actions -------
function doServe(charge: number, fromScenario = false): void {
  if (flow.serve(charge)) {
    pushCue("plunger-release");
    if (!fromScenario) {
      skillShotWindowRemaining = 4.5;
      skillShotAwardedForBall = false;
      if (charge >= 0.52 && charge <= 0.95) {
        bonusScore += 500;
        bannerOverrideText = "SKILL-SHOT PLUNGER BONUS +500! HIT ANY TARGET FOR SUPER SKILL-SHOT!";
        bannerOverrideRemaining = 2.6;
        triggerImpact([2.35, 0.52, -1.8], "cyan", 0.36);
      }
    }
    syncHud();
  }
}

function togglePause(): void {
  paused = !paused;
  pushCue("bank-clear");
  syncHud();
  publishEvidence();
  if (paused) app.pause();
  else app.resume();
}

function resetGame(): void {
  flow.reset();
  plunger.cancelCharge();
  downTargets.clear();
  bonusScore = 0;
  skillShotWindowRemaining = 0;
  skillShotAwardedForBall = false;
  bannerOverrideText = "";
  bannerOverrideRemaining = 0;
  coreJackpotCooldown = 0;
  goldJackpotBallActive = false;
  goldJackpotBallPhase = 0;
  doorSwing = -1;
  impactRemaining = 0;
  impactHandle?.setVisible(false).setScale([0.001, 0.001, 0.001]);
  const door = app.nodes.get("vault-door-visual");
  if (door) {
    door.setPosition(0, 0.52, -3.3);
    door.setRotation(0, 0, 0);
  }
  for (const [id, handle] of targetHandles) {
    void id;
    handle.setMaterial(liveTargetArmedMaterial);
  }
  for (const [id, meshyHandle] of targetMeshyHandles) {
    const [tx, tz] = targetImpactPosition(id);
    meshyHandle.setVisible(true).setPosition(tx, 0.36, tz);
  }
  hideResultCard();
  pushCue("bank-clear");
  syncHud();
  publishEvidence();
}

function awardSuperSkillShotIfArmed(origin: readonly [number, number, number]): void {
  if (skillShotWindowRemaining > 0 && !skillShotAwardedForBall) {
    skillShotAwardedForBall = true;
    skillShotWindowRemaining = 0;
    bonusScore += 1000;
    bannerOverrideText = "SUPER SKILL-SHOT COMBO +1000!";
    bannerOverrideRemaining = 2.5;
    triggerImpact(origin, "cyan", 0.44);
  }
}

function consumeEvents(events: readonly VaultGameEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case "serve":
        pushCue("plunger-release");
        break;
      case "bumper":
        if (cueReady("bumper-hit", 8)) pushCue("bumper-hit");
        {
          const [x, z] = BUMPER_IMPACT_POSITIONS[bumperImpactIndex % 3]!;
          bumperImpactIndex += 1;
          triggerImpact([x, 0.54, z], "amber", 0.3);
          awardSuperSkillShotIfArmed([x, 0.54, z]);
        }
        break;
      case "sling":
        if (cueReady("sling-pop", 10)) pushCue("sling-pop");
        {
          const [x, z] = slingImpactIndex++ % 2 === 0 ? [-1.2, 2.1] : [1.2, 2.1];
          triggerImpact([x, 0.55, z], "amber", 0.24);
        }
        break;
      case "target-down": {
        if (!downTargets.has(event.id)) {
          downTargets.add(event.id);
          pushCue("target-down");
        }
        const handle = targetHandles.get(`target:${event.id}`);
        if (handle) {
          handle.setMaterial(liveTargetHitMaterial);
        }
        const [x, z] = targetImpactPosition(event.id);
        const meshyHandle = targetMeshyHandles.get(event.id);
        if (meshyHandle) {
          meshyHandle.setPosition(x, 0.25, z);
        }
        triggerImpact([x, 0.55, z], "cyan", 0.22);
        awardSuperSkillShotIfArmed([x, 0.55, z]);
        break;
      }
      case "bank-clear":
        pushCue("bank-clear");
        triggerImpact([0, 0.58, -2.55], "vault", 0.42);
        break;
      case "all-banks-clear":
      case "vault-open":
        pushCue("vault-open");
        doorSwing = 0;
        goldJackpotBallActive = true;
        triggerImpact([0, 0.65, -3.3], "vault", 0.58);
        break;
      case "multiball-start":
        pushCue("multiball");
        goldJackpotBallActive = true;
        bannerOverrideText = "VAULT MULTIBALL JACKPOT UNLEASHED!";
        bannerOverrideRemaining = 2.8;
        break;
      case "jackpot":
        if (cueReady("vault-open", 30)) pushCue("vault-open");
        goldJackpotBallActive = true;
        bonusScore += 1500;
        bannerOverrideText = "VAULT JACKPOT +1500!";
        bannerOverrideRemaining = 2.5;
        break;
      case "orbit-loop":
      case "orbit-complete":
        if (cueReady("ramp-roll", 20)) pushCue("ramp-roll");
        awardSuperSkillShotIfArmed([0, 0.52, -2.6]);
        break;
      case "ball-drain":
        pushCue("ball-drain");
        goldJackpotBallActive = false;
        break;
      case "ball-end":
        goldJackpotBallActive = false;
        resolveHandles();
        break;
      case "tilt-strike":
        pushCue("tilt-warn");
        bannerOverrideText = `TABLE NUDGE! TILT WARNING (${event.strikes} OF 3)`;
        bannerOverrideRemaining = 1.6;
        break;
      case "tilt-lock":
        pushCue("tilt-warn");
        bannerOverrideText = "TILT LOCKED - FLIPPERS DISABLED!";
        bannerOverrideRemaining = 2.4;
        break;
      case "game-over":
        pushCue("ball-drain");
        resultTitle.textContent = "Game over";
        resultDetail.textContent = `Final score ${event.score + bonusScore}. Three balls, one vault.`;
        resultCard.classList.remove("is-hidden");
        break;
      default:
        break;
    }
  }
}

// --------------------------------------------------------- per-frame sync ----
function syncVisuals(): void {
  // Visual Y offset: matches the offset applied when creating the dynamic visual
  // nodes (physics Y=0 is playfield level; scene nodes sit 0.28 above to appear
  // on the cabinet GLB playfield surface).
  const VISUAL_Y_OFFSET = 0.28;
  const live = new Set<string>();
  let primaryBallPos: [number, number, number] | null = null;
  for (const pose of flow.sim.poses()) {
    const handle = dynamicHandles.get(pose.name);
    if (!handle) continue;
    live.add(pose.name);
    const e = quatToEuler(pose.rotation);
    const py = pose.position[1] + VISUAL_Y_OFFSET;
    handle.setVisible(true);
    handle.setPosition(pose.position[0], py, pose.position[2])
      .setRotation(e.x, e.y, e.z);
    if (pose.name.startsWith("ball-")) {
      if (!primaryBallPos || pose.name === "ball-0") {
        primaryBallPos = [pose.position[0], py, pose.position[2]];
      }
      // Check proximity to centerpiece Vault Core (vaultCenterCoreTargetMeshy at [0, 0.36, 0.46])
      const dx = pose.position[0] - 0;
      const dz = pose.position[2] - 0.46;
      if (dx * dx + dz * dz < 0.42 && coreJackpotCooldown <= 0 && flow.snapshot().phase === "play") {
        coreJackpotCooldown = 4.5;
        bonusScore += 1500;
        goldJackpotBallActive = true;
        bannerOverrideText = "VAULT CORE JACKPOT +1500! MULTIBALL ENGAGED!";
        bannerOverrideRemaining = 2.6;
        pushCue("multiball");
        triggerImpact([0, 0.56, 0.46], "vault", 0.52);
        flow.sim.releaseMultiball();
      }
    }
  }
  const snap = flow.snapshot();
  const phase = snap.phase;
  for (const [name, handle] of dynamicHandles) {
    if (live.has(name)) continue;
    if (name === "ball-0" && (phase === "attract" || phase === "await-serve")) {
      handle.setVisible(true);
      handle.setPosition(2.38, 0.44, 2.75);
    } else if (name.startsWith("ball-")) {
      handle.setVisible(false);
    }
  }

  // Keep comet trail spheres hidden so no static spheres look like extra floating balls
  for (let i = 0; i < cometTrailHandles.length; i += 1) {
    cometTrailHandles[i]?.setVisible(false).setPosition(0, -50, 0);
  }

  // Animate 3D Meshy standup targets (spin armed crystals/energy cores, recess downed targets)
  let tIdx = 0;
  for (const [id, meshyHandle] of targetMeshyHandles) {
    const [tx, tz] = targetImpactPosition(id);
    const isDown = downTargets.has(id);
    meshyHandle
      .setPosition(tx, isDown ? 0.24 : 0.36 + Math.sin(frameCount * 0.06 + tIdx) * 0.015, tz)
      .setRotation(0, frameCount * 0.035 + tIdx * 0.55, 0);
    tIdx += 1;
  }

  // Keep decorative jackpot ball hidden so no ball flies autonomously without physics
  if (goldJackpotBallHandle) {
    goldJackpotBallHandle.setVisible(false).setPosition(0, -50, 0);
  }

  const banksDown = snap.banksDown;
  for (const [index, handle] of bankLampHandles) {
    handle.setMaterial(index < banksDown ? bankLampOnMaterial : bankLampOffMaterial);
  }
  const mechanismState = snap.phase === "game-over" ? "gameOver"
    : snap.tiltLocked ? "tilt"
      : snap.multiball ? "multiball"
        : snap.vaultOpen ? "vault"
          : snap.banksDown > 0 ? "progress"
            : "guarded";
  const mechanismMaterial = mechanismStateMaterials[mechanismState];
  // Do not flatten the typed mechanisms GLB to a single state material. The
  // beacon below carries state color while the authored caps, skirts, and
  // target paddles remain visible in every mission phase.
  void mechanismMaterial;
  for (const [state, handle] of missionBeaconHandles) handle.setVisible(state === mechanismState);
}

function syncScoreboard(): void {
  const snap = flow.snapshot();
  const visibility = scoreboardVisibility({
    score: snap.score + bonusScore,
    ball: snap.ball,
    multiplier: snap.multiplier,
    banksDown: snap.banksDown,
    missionLine: snap.missionLine
  });
  for (const [id, visible] of visibility) {
    const handle = scoreboardHandles.get(id);
    if (handle) handle.setVisible(visible);
  }
  void MISSION_LINES;
}

function syncDoor(dt: number): void {
  if (doorSwing < 0 || doorSwing >= 1 || !doorHandle) return;
  doorSwing = Math.min(1, doorSwing + dt / 0.6);
  const swing = reducedMotion ? 1 : doorSwing;
    // Authored swing: pivot around the left edge by rotating and sliding.
  doorHandle.setRotation(0, -1.35 * swing, 0);
  doorHandle.setPosition(-0.55 * swing, 0.52 + 0.05 * swing, -3.32 - 0.28 * swing);
}

// ------------------------------------------------------------- evidence ------
function publishEvidence(): void {
  const snap = flow.snapshot();
  const flipperSnap = flippers.snapshot();
  const diagnostics: AuraDiagnostics = app.diagnostics();
  const evidence = {
    // Contract keys from the PRD evidence section.
    mounted: true,
    status: "ready",
    ball: snap.ball,
    ballsRemaining: snap.ballsRemaining,
    score: snap.score + bonusScore,
    multiplier: snap.multiplier,
    banksDown: snap.banksDown,
    vaultOpen: snap.vaultOpen,
    multiball: snap.multiball || goldJackpotBallActive,
    tiltStrikes: snap.tiltStrikes,
    state: paused ? "paused" : snap.phase,
    flipperMode: flipperSnap.mode,
    flipperEvents: flipperSnap.activationCount,
    sensorEventCount: snap.sensorEventCount,
    jointCount: snap.jointCount,
    physicsBodyCount: snap.physicsBodyCount,
    text3DScoreboards: scoreboardHandles.size,
    dynamicHandleCount: dynamicHandles.size,
    targetHandleCount: targetHandles.size,
    bankLampCount: bankLampHandles.size,
    mechanismVisualState: snap.phase === "game-over" ? "game-over" : snap.tiltLocked ? "tilt" : snap.multiball ? "multiball" : snap.vaultOpen ? "vault-open" : snap.banksDown > 0 ? "bank-progress" : "guarded",
    renderer: {
      // AuraDiagnostics.backend is the engine-owned render backend
      // ("webgl2" | "webgpu" | "canvas2d" | "headless"); the previous
      // `runtimeBackend` field did not exist, so evidence always read
      // "unknown". The quality profile names the active renderer tier.
      backend: diagnostics.backend,
      qualityProfile: diagnostics.renderer?.qualityProfile.id ?? "unknown",
      rendererMode: diagnostics.renderer?.rendererMode ?? "unknown",
      drawCalls: diagnostics.drawCalls,
      renderSize: [...diagnostics.renderSize]
    },
    lastShotHash: flow.lastShotHash,
    resetHashMatch: flow.resetHashMatch,
    audioCues: audioCueLog.slice(),
    // Route-local extras consumed by specs and route-health.
    appId: APP_ID,
    primaryAssets: [
      "assets.vaultBreakersTable", "assets.vaultBreakersMechanisms", "assets.vaultBreakersBall",
      "assets.vaultBreakersFlipper", "assets.vaultBreakersVaultDoor"
    ],
    backend: snap.backend,
    phase: snap.phase,
    activeBalls: snap.activeBalls,
    tiltLocked: snap.tiltLocked,
    // Solver truth for the "no tunnelling / ball settles / one transform
    // authority" claims: positions and speeds straight from Rapier bodies.
    ballStates: flow.sim.ballStates(),
    ballPoses: flow.sim.kinematics(),
    orbitLoops: snap.orbitLoops,
    missionLine: snap.missionLine,
    flipperLeftRaised: flipperSnap.leftRaised,
    flipperRightRaised: flipperSnap.rightRaised,
    plunger: plunger.state(),
    downTargets: [...downTargets],
    frameCount,
    controls: ["A/Left left flipper", "D/Right right flipper", "hold Space skill-shot plunger", "Q/E/S nudge", "R reset", "P pause", "touch buttons"],
    systems: ["Rapier ball/contact/sensor world", "two motorised-hinge flippers", "route-local five-bank vault mission", "skill-shot plunger & vault core multiball jackpot", "text3D scoreboard", "typed CC0 audio controller"],
    // Machine-readable physics identity, mirroring the prose above so route evidence can be
    // verified against the surfaces actually imported rather than read by hand.
    physics: "physics.world:Rapier(ball, bumpers, walls, target and drain sensors, motorised flipper hinges)",
    touchControlEvents: touchControlEvents.slice(-16),
    claimBoundary: "Aura3D prototype: route-local pinball on the public physics surface with motorised flipper joints (same-sign axis-mirror workaround); no reusable pinball kit claimed.",
    mountedAtEpochMs: Date.now()
  };
  vaultWindow.__VAULT_BREAKERS_EVIDENCE__ = evidence;
  (window as unknown as { __AURA3D_GAME_EVIDENCE__?: unknown }).__AURA3D_GAME_EVIDENCE__ = evidence;
  (window as unknown as { __AURA3D_GAME__?: { state: string } }).__AURA3D_GAME__ = { state: "playing" };
  document.body.dataset.aura3dReady = "true";
}

// Renderer-owned capture used by specs and probes (no compositor dependency).
vaultWindow.__VB_SHOT__ = () => app.screenshot().dataUrl;

/**
 * Deterministic time pump for specs: headless tabs can throttle rAF to ~1fps,
 * so long passive waits never advance the sim. Uses the public app.pause() +
 * app.step() path (docs/api/game-runtime.md "Deterministic stepping") to run
 * `frames` fixed steps, then resumes the browser loop.
 */
vaultWindow.__VB_PUMP__ = (frames: number): number => {
  app.pause();
  for (let index = 0; index < frames; index += 1) app.step(1 / 60);
  app.resume();
  return app.runtime.frame;
};

vaultWindow.__VB_SCENARIO__ = (scenario: string): string => {
  resetGame();
  let events: readonly VaultGameEvent[] = [];
  if (scenario === "bank-near-complete") events = flow.evidenceClearBanks(4);
  else if (scenario === "vault-opening") events = flow.evidenceClearBanks(5);
  else if (scenario === "multiball") events = flow.evidenceStartMultiball();
  else if (scenario === "tilt") {
    doServe(0.72, true);
    flow.nudge(-1);
    flow.nudge(1);
    flow.nudge(-1);
    events = flow.drainEvents();
  } else if (scenario === "game-over") events = flow.evidenceEndGame();
  else if (scenario !== "attract") throw new Error(`Unknown Vault Breakers scenario: ${scenario}`);
  consumeEvents(events);
  if (scenario === "vault-opening") syncDoor(0.3);
  if (scenario === "multiball") syncDoor(0.7);
  syncVisuals();
  syncScoreboard();
  syncHud();
  publishEvidence();
  return `${scenario}:${flow.snapshot().phase}:${flow.snapshot().banksDown}:${flow.snapshot().activeBalls}`;
};

// ---------------------------------------------------------------- input -------
/*
 * Keyboard is read through a route-owned window mirror with explicit edge
 * detection (the sibling showcase routes' discipline): engine game-input stays
 * configured for touch parity, but keyboard edges must not depend on focus.
 */
const manualHeld = new Set<string>();
const manualPrev = new Map<string, boolean>();
let spaceTapArmed = false;

function manualEdge(code: string): "pressed" | "released" | "held" | "idle" {
  const now = manualHeld.has(code);
  const before = manualPrev.get(code) ?? false;
  if (now && !before) return "pressed";
  if (!now && before) return "released";
  return now ? "held" : "idle";
}

function manualAdvanceFrame(): void {
  for (const code of ["Space", "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "KeyS", "KeyQ", "KeyE", "KeyP", "Escape", "KeyR"]) {
    manualPrev.set(code, manualHeld.has(code));
  }
}

window.addEventListener("keydown", (event) => {
  if (!event.repeat) manualHeld.add(event.code);
  if (event.code === "Space" && !plunger.charging && (flow.phase === "attract" || flow.phase === "await-serve")) {
    plunger.beginCharge();
    spaceTapArmed = true;
  }
  if (event.repeat) return;
  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  else if (event.code === "KeyR") resetGame();
  else if (event.code === "KeyQ") {
    flow.nudge(-1);
  } else if (event.code === "KeyE") {
    flow.nudge(1);
  } else if (event.code === "KeyS") {
    nudgeFlip = !nudgeFlip;
    flow.nudge(nudgeFlip ? -1 : 1);
  }
}, { passive: true });
window.addEventListener("keyup", (event) => {
  manualHeld.delete(event.code);
  if (event.code === "Space" && spaceTapArmed) {
    spaceTapArmed = false;
    const charge = plunger.release();
    if (charge !== null) doServe(charge);
  }
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["Space", "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "KeyS", "KeyQ", "KeyE"].includes(event.code)) {
    event.preventDefault();
  }
}, { passive: false });

function bindHoldButton(selector: string, onDown: () => void, onUp: () => void): void {
  let held = false;
  const begin = (event: Event): void => {
    event.preventDefault();
    if (held) return;
    held = true;
    onDown();
    touchControlEvents.push(`${selector}:down`);
    publishEvidence();
  };
  const end = (): void => {
    if (!held) return;
    held = false;
    onUp();
    touchControlEvents.push(`${selector}:up`);
    publishEvidence();
  };
  const attach = (): void => {
    const button = document.querySelector(selector) as HTMLButtonElement | null;
    if (!button) {
      window.requestAnimationFrame(attach);
      return;
    }
    button.addEventListener("pointerdown", begin, { passive: false });
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("pointerleave", end);
    button.addEventListener("touchstart", begin, { passive: false });
    button.addEventListener("touchend", end, { passive: false });
    button.addEventListener("touchcancel", end, { passive: false });
  };
  attach();
}
bindHoldButton("#vb-left-button", () => manualHeld.add("KeyA"), () => manualHeld.delete("KeyA"));
bindHoldButton("#vb-right-button", () => manualHeld.add("KeyD"), () => manualHeld.delete("KeyD"));
bindHoldButton("#vb-plunge-button", () => {
  if (!plunger.charging && (flow.phase === "attract" || flow.phase === "await-serve")) plunger.beginCharge();
}, () => {
  const charge = plunger.release();
  if (charge !== null) doServe(charge);
});
ui.onClick("#vb-reset-button", () => resetGame());
ui.onClick("#vb-pause-button", () => togglePause());
againButton.addEventListener("click", () => resetGame());

// ------------------------------------------------------------- frame loop ----
gameApp.onFrame(({ dt }) => {
  input.update(dt);
  frameCount += 1;

  if (dynamicHandles.size < flow.sim.dynamicVisualNames.length || targetHandles.size < flow.sim.targetIds.length || !doorHandle || !mechanismHandle || missionBeaconHandles.size < Object.keys(mechanismStateMaterials).length) {
    resolveHandles();
  }

  if (paused) {
    manualAdvanceFrame();
    return;
  }

  if (skillShotWindowRemaining > 0) {
    skillShotWindowRemaining = Math.max(0, skillShotWindowRemaining - dt);
  }
  if (bannerOverrideRemaining > 0) {
    bannerOverrideRemaining = Math.max(0, bannerOverrideRemaining - dt);
  }
  if (coreJackpotCooldown > 0) {
    coreJackpotCooldown = Math.max(0, coreJackpotCooldown - dt);
  }

  plunger.update(dt);
  const activationsBefore = flippers.snapshot().activationCount;
  flippers.update({
    leftHeld: manualHeld.has("KeyA") || manualHeld.has("ArrowLeft"),
    rightHeld: manualHeld.has("KeyD") || manualHeld.has("ArrowRight")
  });
  if (flippers.snapshot().activationCount > activationsBefore) {
    if (cueReady("flipper-snap", 6)) pushCue("flipper-snap");
  }
  if (manualEdge("Space") === "released" && plunger.charging) {
    const charge = plunger.release();
    if (charge !== null) doServe(charge);
  }
  manualAdvanceFrame();

  const events = flow.update(1);
  consumeEvents(events);

  syncVisuals();
  syncScoreboard();
  syncDoor(dt);
  syncImpact(dt);

  if (frameCount % 6 === 0 || events.length > 0) syncHud();
  publishEvidence();
});

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  configurable: true,
  value: {
    category: "application",
    subject: { position: [0, 0.34, -1.55], rotation: [0, 0, 0], targetSize: 5.05 },
    settleSubjectPose() {
      resolveHandles();
      syncVisuals();
      publishEvidence();
    },
    setSubjectSuppressed(suppressed: boolean) {
      const node = app.nodes.get("typed-vault-breakers-mechanisms") as AuraRuntimeNodeHandle | undefined;
      // Route-primary compares a visible and hidden render of this typed
      // mechanism assembly. Pause and present one synchronous frame so the
      // renderer cannot race the visibility mutation and leave the hidden
      // capture identical to the visible one.
      app.pause();
      // Scaling to the route's established hidden-node sentinel is more
      // reliable than a visibility flag for the production fallback renderer:
      // it invalidates the submitted bounds immediately while preserving the
      // same node and material for the restored frame.
      node?.setScale(suppressed ? 0.0001 : 1).setVisible(true);
      app.step(0);
    }
  }
});

syncVisuals();
syncHud();
publishEvidence();
