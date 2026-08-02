import { describe, expect, it } from "vitest";
import {
  AURA_CLASH_ARENA_PROOF_RELEASE,
  AURA_CLASH_ARENA_PROOF_SCHEMA_VERSION,
  AURA_CLASH_ARENA_PROOF_VERSION,
  createAuraClashArenaProof,
  type AuraClashArenaProofInput
} from "../../../apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof";
import {
  auraClashArenaStageElements,
  collectAuraClashArenaStageEvidence
} from "../../../apps/aura-clash-showcase/src/playable/arena/AuraClashArenaStage";
import { createArenaTweaksEvidence } from "../../../apps/aura-clash-showcase/src/playable/arena/ArenaTweaksPanel";
import { assertAuraClashFighterControllerBoundary } from "../../../apps/aura-clash-showcase/src/playable/combat/AuraClashFighterController";
import { createAuraClashLightingEvidence } from "../../../apps/aura-clash-showcase/src/rendering/GameLighting";

function createProofRoot(): ParentNode {
  const selectors = [
    ".aca",
    ".aca-sky",
    ".aca-portal",
    ".aca-skyline",
    ".aca-banners",
    ".aca-rays",
    ".aca-fog-far",
    ".aca-fog-drift",
    ".aca-fog-near",
    ".aca-dais",
    ".aca-platform",
    ".aca-floor-sheen",
    "#arena-particles",
    "#aura-clash-arena-canvas",
    ".aca-scanline",
    ".aca-stage-vignette",
    "#arena-fog"
  ];
  const elements = new Map<string, {
    dataset: Record<string, string>;
    classList: { contains(value: string): boolean };
    style: { getPropertyValue(value: string): string };
    value?: string;
  }>();
  for (const selector of selectors) {
    elements.set(selector, {
      dataset: selector === ".aca" ? { palette: "holo", backdrop: "all", motion: "subtle" } : {},
      classList: { contains: () => false },
      style: { getPropertyValue: () => "" },
      value: selector === "#arena-fog" ? "0.58" : undefined
    });
  }
  return {
    querySelector(selector: string) {
      return elements.get(selector) ?? null;
    }
  } as ParentNode;
}

const baseProofInput: AuraClashArenaProofInput = {
  status: "running",
  error: null,
  frame: 12,
  roundTime: 98.5,
  totalHits: 1,
  lastHitFrame: 9,
  callout: "HIT",
  visibleFighterAsset: "/assets/player.glb",
  fighterAssets: {
    player: { id: "auraClashPlayerRig", url: "/assets/player.glb", hash: "player-hash" },
    rival: { id: "auraClashRivalRig", url: "/assets/rival.glb", hash: "rival-hash" },
    distinct: true,
    releaseReady: true
  },
  renderer: { surface: "aura3d-production-gltf-animation", backend: "webgl2", drawCalls: 42 },
  player: {
    name: "Flux Vanta",
    health: 360,
    meter: 20,
    x: -1,
    y: 0,
    grounded: true,
    action: "heavy",
    activeClip: "Punch_Cross",
    attacking: "heavy"
  },
  rival: {
    name: "Nyx Circuit",
    health: 347,
    meter: 0,
    x: 1,
    y: 0,
    grounded: true,
    action: "hurt",
    activeClip: "Hit_Knockback",
    attacking: null
  },
  animation: {
    visibleSkinnedGlb: true,
    skinnedDrawItems: 2,
    playerSkinningBindings: 1,
    rivalSkinningBindings: 1,
    playerLastTracks: 18,
    rivalLastTracks: 16,
    playerLastSkinningPalettes: 1,
    rivalLastSkinningPalettes: 1,
    clips: ["Idle_Loop", "Punch_Cross"]
  },
  runtime: {
    frameLoop: true,
    input: true,
    deterministicCombat: true,
    hitWindows: true,
    hud: true,
    evidence: true
  },
  controls: {
    lastInput: "heavy",
    downSupported: true,
    specialRequiresMeter: true,
    koLocked: false,
    resetCount: 0
  },
  // Defect 48: stage evidence is only `evidenceBacked` when render labels from a real frame are
  // supplied, so this fixture models an observed frame rather than a declared-only record.
  stage: collectAuraClashArenaStageEvidence(
    createProofRoot(),
    auraClashArenaStageElements.map((entry) => `aura-clash-rendered-stage:${entry.renderLabel}0`)
  ),
  // Camera evidence models a mid-hit frame: a decaying special-move hit-stop tightening the frame
  // volume below its 5.6-unit resting width, which is what makes `respondingToCombat` meaningful.
  camera: {
    impactStrength: 0.104,
    punchIn: 0.8,
    roundOverFraming: false,
    frameWidthUnits: 5.1968,
    restingFrameWidthUnits: 5.6,
    respondingToCombat: true
  },
  tweaks: createArenaTweaksEvidence(createProofRoot()),
  fighterController: assertAuraClashFighterControllerBoundary(),
  // Lighting evidence is derived from the rig the renderer actually received, so this fixture models
  // a rendered `urban-neon` rig rather than restating the unrendered `auraClashLightingPreset`.
  lighting: createAuraClashLightingEvidence({
    preset: "urban-neon",
    lights: [
      { role: "key", intensity: 1.103, castsShadow: true },
      { role: "accent", intensity: 0.788, castsShadow: false },
      { role: "rim", intensity: 0.42, castsShadow: false }
    ]
  }),
  postProcess: {
    contractId: "aura-clash-material-postprocess-review-v1",
    presetId: "aura-clash-cinematic-readable",
    gameplayVisible: true,
    performanceBudgetOk: true,
    bloomIntensity: 0.58,
    reducedFlashBloomIntensity: 0.18,
    bloomWithinGameplayLimit: true,
    fogRange: [8, 30],
    fogBehindCombatLane: true,
    validatedStates: ["first", "action", "ko"]
  },
  performance: { frameTimeMs: 6.4, fps: 60, drawCalls: 42, budgetOk: true },
  audio: {
    enabled: true,
    muted: false,
    musicReady: true,
    sfxReady: true,
    lastCue: "player-hit",
    recentCues: ["special", "player-hit"],
    cueCount: 12,
    typedAssetCount: 11,
    assetUrls: ["/aura-assets/auraClashHitSfx.b33a8f14.ogg"],
    oscillatorFallback: false,
    audioErrors: []
  },
  deterministicReplay: {
    kind: "aura-clash-deterministic-replay-proof",
    runner: "game.runSimulation",
    inputReplay: "game.inputReplay",
    frameCount: 12,
    eventCount: 1,
    finalHash: "hash-a",
    repeatedFinalHash: "hash-a",
    stable: true,
    exportedReplay: {
      schemaVersion: "aura-game-input-replay/v1",
      checksum: "replay-hash",
      frameCount: 12,
      duration: 0.2
    },
    finalSnapshot: { playerX: -0.68, rivalHp: 347, hits: 1, ko: false, roundTime: 98.8 }
  },
  engineCombat: {
    frame: 12,
    activeAttacks: 0,
    events: ["hit:player:rival:heavy"],
    playerHealth: 360,
    rivalHealth: 347,
    playerGuarding: false,
    rivalGuarding: false
  }
};

describe("Aura Clash arena proof schema", () => {
  it("centralizes the stable proof schema defaults in the evidence helper", () => {
    const proof = createAuraClashArenaProof(baseProofInput);

    expect(proof.schemaVersion).toBe(AURA_CLASH_ARENA_PROOF_SCHEMA_VERSION);
    expect(proof.route).toBe("/playable/");
    expect(proof.app).toBe("Aura Clash Arena");
    expect(proof.release).toBe(AURA_CLASH_ARENA_PROOF_RELEASE);
    expect(proof.version).toBe(AURA_CLASH_ARENA_PROOF_VERSION);
    expect(proof.noPrimitiveFighters).toBe(true);
    expect(proof.deterministicReplay.stable).toBe(true);
    expect(proof.stage.evidenceBacked).toBe(true);
    expect(proof.tweaks.affectsDeterministicReplay).toBe(false);
    expect(proof.fighterController.combatSource).toBe("engine.combatWorld");
    expect(proof.lighting.readable).toBe(true);
    expect(proof.postProcess.gameplayVisible).toBe(true);
  });
});
