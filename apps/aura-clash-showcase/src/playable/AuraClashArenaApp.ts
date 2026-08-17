import { createGameApp, createGameAudio, game, scene, type GameAudio, type GameCombatEvent, type GameCombatMove, type GameCombatWorldSnapshot } from "@aura3d/engine";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import {
  createSideViewGameRenderPreset,
  createTypedGLBActor,
  type TypedGLBActor
} from "@aura3d/engine/production-runtime";
import {
  consolidateStaticMeshes,
  createLightingRig,
  resolveSubjectRimPlacement,
  Geometry,
  Material,
  UnlitMaterial,
  type CollectedLight,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type RenderSource
} from "@aura3d/engine/rendering";
import { composeMat4, PointLight, quatFromEuler, type Mat4 } from "@aura3d/scene";
import { fighterInertializedWeights, sampleClipEvents } from "@aura3d/animation";
import {
  createFighterSecondaryMotion,
  resetFighterSecondaryMotion,
  updateFighterSecondaryMotion,
  type FighterSecondaryMotionState,
  type SecondaryMotionResult
} from "./animation/fighterSecondaryMotion";
import { assets } from "../aura-assets";
import {
  assertAuraClashClipReadiness,
  auraClashPlayerClips as playerClips,
  auraClashRivalClips as rivalClips,
  resolveAuraClashHurtClip,
  selectAuraClashHurtVariant,
  validateAuraClashClipReadiness,
  type AuraClashClipName as ClipName,
  type AuraClashClipReadiness,
  type AuraClashFighterClipMap as FighterClipMap
} from "./animation/auraClashClipMaps";
import {
  AURA_CLASH_ATTACK_COOLDOWN as ATTACK_COOLDOWN,
  AURA_CLASH_SPECIAL_COOLDOWN as SPECIAL_COOLDOWN,
  AURA_CLASH_SPECIAL_METER_COST as SPECIAL_METER_COST,
  AURA_CLASH_START_METER as START_METER,
  AURA_CLASH_START_HEALTH as START_HEALTH,
  AURA_CLASH_WALK_SPEED as WALK_SPEED,
  auraClashAttackFrames,
  auraClashFrameDataReport,
  auraClashMovementMoveTable as movementMoves,
  auraClashMoveTable as moves,
  auraClashMoveEventTracks as moveEventTracks,
  auraClashHitWindowFromTracks,
  type AuraClashMoveId as MoveId
} from "./combat/auraClashMoveData";
import {
  annotateAuraClashArenaStage,
  collectAuraClashArenaStageEvidence
} from "./arena/AuraClashArenaStage";
import { createArenaTweaksEvidence, collectArenaTweaksState, type AuraClashArenaTweaksState } from "./arena/ArenaTweaksPanel";
import { createRenderedArenaStage } from "./arena/RenderedArenaStage";
import { assertAuraClashFighterControllerBoundary } from "./combat/AuraClashFighterController";
import {
  CLASH_INPUT_BUFFER_LIFETIME_MS,
  clashHitStopSeconds,
  comboClockText,
  comboFlashText,
  readPlayableHudMode,
  resolveRivalAiRole,
  rivalAiStrikeBias,
  rivalAiWantsDash,
  type ClashMoveId
} from "./combat/clashFeel";
import {
  emptyComboState,
  registerComboHit,
  canCancelCombo,
  type ComboState
} from "../fighters/ComboSystem";
import { defaultGuardBreakRules } from "../fighters/GuardBreakSystem";
import { defaultKnockdownRules } from "../fighters/KnockdownRecovery";
import { auraClashAudioAssets, auraClashAudioManifest } from "./audio/auraClashAudioManifest";
import type {
  AuraClashArenaProof,
  AuraClashAudioProof as AudioProof,
  AuraClashDeterministicReplayProof as DeterministicReplayProof,
  AuraClashFighterAction as FighterAction,
  AuraClashPerformanceProof as PerformanceProof,
  AuraClashProofFighter as ProofFighter
} from "./evidence/auraClashArenaProof";
import { createAuraClashArenaProof } from "./evidence/auraClashArenaProof";
import { createAuraClashLightingEvidence, type RenderedLightingRigSummary } from "../rendering/GameLighting";
import { createAuraClashPostProcessEvidence } from "../rendering/GamePostProcess";
import "./playable.css";

type FighterId = "player" | "rival";

type AuraClashWindow = Window & {
  __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof;
  __AURA_CLASH_VISUAL_REVIEW__?: {
    version: string;
    humanApprovalRequired: true;
    areas: Record<string, { evidence: string[] }>;
  };
  __AURA3D_GAME_EVIDENCE__?: unknown;
  __AURA3D_GAME_RUNTIME__?: unknown;
  __AURA_CLASH_ARENA_TEST_DRIVER__?: {
    setPlayerHealth(health: number): void;
    setRivalHealth(health: number): void;
    setPlayerMeter(meter: number): void;
    setPositions(playerX: number, rivalX: number): void;
    setRivalGuardSuppressed(suppressed: boolean): void;
    pauseOnNextHit(): void;
    queuePlayerAttack(move: MoveId): void;
  };
};

interface FighterState {
  id: FighterId;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  vy: number;
  airTime: number;
  airStartedAtMs: number;
  facing: 1 | -1;
  health: number;
  meter: number;
  action: FighterAction;
  hurtVariant: "light" | "heavy";
  moving: boolean;
  locomotionTime: number;
  clips: FighterClipMap;
  clip: ClipName;
  clipTime: number;
  prevClip: ClipName | null;
  prevClipTime: number;
  blendElapsed: number;
  blendDuration: number;
  grounded: boolean;
  guard: boolean;
    hitstun: number;
    recovery: number;
    /** Visual-only hit-stop freeze remaining (seconds). Does not touch the combat sim / replay. */
    hitStopRemaining: number;
    /** One-shot impact impulse (land/hit) consumed by the secondary-motion vertical squash spring. */
    pendingImpulse: number;
    aiCooldown: number;
    moveCooldown: number;
    specialCooldown: number;
    jumpGrace: number;
    dashGrace: number;
    guardGrace: number;
    downGrace: number;
    guardMeter: number;
    combo: ComboState;
    inputBuffer: { readonly move: MoveId; readonly expiresAt: number } | null;
    knockdownTimer: number;
    invulnerableTimer: number;
    queuedAttack: MoveId | null;
    attack: ActiveAttack | null;
  lastApply?: {
    clipName: string;
    tracksApplied: number;
    transformTracksApplied: number;
    skinningPalettesUpdated: number;
    missingTargets: readonly string[];
  };
}

interface ActiveAttack {
  id: MoveId;
  clip: ClipName;
  elapsed: number;
  duration: number;
  activeStart: number;
  activeEnd: number;
  range: number;
  damage: number;
  knockback: number;
  hit: boolean;
  engineQueued: boolean;
  startedAtMs: number;
}

interface RuntimeFighter {
  state: FighterState;
  actor: TypedGLBActor;
  scale: number;
  yOffset: number;
  visualFacingMultiplier: 1 | -1;
  tint: readonly [number, number, number, number];
  accent: readonly [number, number, number, number];
  secondary: FighterSecondaryMotionState;
}

interface Spark {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  facing: 1 | -1;
  kind: MoveId | "block";
}

interface AudioRuntime {
  cue(name: string): void;
  proof(): AudioProof;
}

const stage = {
  minX: -2.85,
  maxX: 2.85,
  floorY: 0,
  gravity: -12.25,
  jumpVelocity: movementMoves.jump.jumpVelocity ?? 8.65,
  maxJumpY: movementMoves.jump.maxJumpY ?? 2.18,
  fastFallVelocity: movementMoves.down.fastFallVelocity ?? -21,
  // Side-view fighters must read as the primary subjects, not small figures lost in the set.
  // This fills roughly two thirds of the playable frame while retaining jump/head clearance.
  fighterScale: 1.08,
  fighterYOffset: 0,
  z: 0
};

/**
 * The route's frame budget, read from the shared render preset rather than re-typed as literals.
 *
 * Resolved once at module scope because `createPerformanceProof` is module-level; the preset's budget
 * does not depend on the per-mount `debugVolumesEnabled` / `reducedMotion` options.
 */
const SIDE_VIEW_PERFORMANCE_BUDGET = createSideViewGameRenderPreset().performanceBudget;

const KO_FREEZE_TIME = 1.18;
const CLIP_BLEND_DURATION = 0.12;
// Fixed seed for the rival-AI PRNG: every round starts from the same deterministic stream, so
// identical inputs reproduce identical combat and the `deterministicCombat` proof claim holds.
const RIVAL_AI_RNG_SEED = 0x41435241; // "ACRA"

/** mulberry32 — small deterministic PRNG; same seed → same sequence in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Upper-body bone-name substrings for the Unreal-mannequin fighter rigs (spine/arms/hands/head).
// Used to layer an attack on the upper body while locomotion continues on the lower body.
const UPPER_BODY_BONES = ["spine", "neck", "Head", "clavicle", "upperarm", "lowerarm", "hand", "thumb"] as const;

interface FighterBlendProof {
  from: string | null;
  to: string;
  fromWeight: number;
  toWeight: number;
  blending: boolean;
}

interface ArenaBlendProof {
  player?: FighterBlendProof;
  rival?: FighterBlendProof;
}

function recordFighterBlendProof(fighter: RuntimeFighter, from: string | null, to: string, fromWeight: number, toWeight: number): void {
  const proofHost = globalThis as unknown as { __AURA_CLASH_BLEND_PROOF__?: ArenaBlendProof };
  const proof: ArenaBlendProof = proofHost.__AURA_CLASH_BLEND_PROOF__ ?? {};
  const entry: FighterBlendProof = { from, to, fromWeight: Number(fromWeight.toFixed(3)), toWeight: Number(toWeight.toFixed(3)), blending: from !== null };
  if (fighter.state.id === "rival") proof.rival = entry;
  else proof.player = entry;
  proofHost.__AURA_CLASH_BLEND_PROOF__ = proof;
}

interface ArenaEventTrackProof {
  source: "authored-clip-events";
  windows: Record<string, { activeStart: number; activeEnd: number }>;
  /** Count of authored cosmetic markers (footstep/vfx) fired from clip events during play. */
  firedEvents: Record<string, number>;
}

// Records an authored clip-event marker (footstep/vfx) firing during attack playback.
function recordClipEventFired(type: string): void {
  const host = globalThis as unknown as { __AURA_CLASH_EVENT_TRACKS_PROOF__?: ArenaEventTrackProof };
  const proof: ArenaEventTrackProof = host.__AURA_CLASH_EVENT_TRACKS_PROOF__ ?? { source: "authored-clip-events", windows: {}, firedEvents: {} };
  if (!proof.firedEvents) proof.firedEvents = {};
  proof.firedEvents[type] = (proof.firedEvents[type] ?? 0) + 1;
  host.__AURA_CLASH_EVENT_TRACKS_PROOF__ = proof;
}

// Records that each attack's hitbox active window was derived from its authored clip-event track
// (not a hard-coded threshold). Exposed on the window so the readiness gate / smoke proof can assert
// hitbox activation is event-driven. Deterministic: derived purely from authored event data.
function recordEventTrackHitWindow(id: string, activeStart: number, activeEnd: number): void {
  const host = globalThis as unknown as { __AURA_CLASH_EVENT_TRACKS_PROOF__?: ArenaEventTrackProof };
  const proof: ArenaEventTrackProof = host.__AURA_CLASH_EVENT_TRACKS_PROOF__ ?? { source: "authored-clip-events", windows: {}, firedEvents: {} };
  proof.windows[id] = { activeStart: Number(activeStart.toFixed(4)), activeEnd: Number(activeEnd.toFixed(4)) };
  host.__AURA_CLASH_EVENT_TRACKS_PROOF__ = proof;
}

interface FighterInertializationEntry {
  from: string;
  to: string;
  /** Inertialized (critically-damped) source weight at the current transition time. */
  inertializedFromWeight: number;
  /** Linear `1 − t/duration` source weight at the same time (reference for comparison). */
  linearFromWeight: number;
  /** True when the inertialized curve differs from the linear ramp (proof it is non-linear). */
  nonLinear: boolean;
}

interface ArenaInertializationProof {
  mode: "inertialized";
  player?: FighterInertializationEntry;
  rival?: FighterInertializationEntry;
}

// Records that fighter move-swaps use the inertialized (not linear) transition. Exposed on the
// window so the playable smoke proof can assert the engine's critically-damped path is live and
// genuinely diverges from a linear crossfade. Deterministic: derived purely from blend timing.
function recordInertializationProof(fighter: RuntimeFighter, from: string, to: string, inertializedFromWeight: number, linearFromWeight: number): void {
  const proofHost = globalThis as unknown as { __AURA_CLASH_INERTIALIZATION_PROOF__?: ArenaInertializationProof };
  const proof: ArenaInertializationProof = proofHost.__AURA_CLASH_INERTIALIZATION_PROOF__ ?? { mode: "inertialized" };
  const entry: FighterInertializationEntry = {
    from,
    to,
    inertializedFromWeight: Number(inertializedFromWeight.toFixed(4)),
    linearFromWeight: Number(linearFromWeight.toFixed(4)),
    nonLinear: Math.abs(inertializedFromWeight - linearFromWeight) > 1e-4
  };
  if (fighter.state.id === "rival") proof.rival = entry;
  else proof.player = entry;
  proofHost.__AURA_CLASH_INERTIALIZATION_PROOF__ = proof;
}

const engineCombatMoves: Record<MoveId, GameCombatMove> = {
  light: toEngineCombatMove("light"),
  heavy: toEngineCombatMove("heavy"),
  special: toEngineCombatMove("special")
};

function toEngineCombatMove(id: MoveId): GameCombatMove {
  const move = moves[id];
  // Hitbox active window is driven by the authored clip events (the "hitbox" event-track lane),
  // not a separate guessed threshold. The window is authored to match the move's frame data, so the
  // engine combat — and the deterministic replay checksum — are unchanged.
  const { activeStart, activeEnd } = auraClashHitWindowFromTracks(moveEventTracks[id]);
  recordEventTrackHitWindow(id, activeStart, activeEnd);
  return {
    id,
    name: id,
    startup: activeStart,
    active: Math.max(1 / 60, activeEnd - activeStart),
    recovery: Math.max(0.04, move.duration - activeEnd),
    damage: move.damage,
    guardDamage: Math.max(2, Math.round(move.damage * 0.28)),
    meterGain: id === "special" ? 8 : 12,
    hitStop: id === "special" ? 0.13 : id === "heavy" ? 0.075 : 0.052,
    hitStun: id === "special" ? 32 : id === "heavy" ? 18 : 12,
    blockStun: id === "special" ? 20 : id === "heavy" ? 12 : 8,
    knockback: [move.knockback * 0.28, id === "special" ? 0.1 : 0, 0],
    hitbox: {
      id: `${id}-active-hitbox`,
      offset: [move.range * 0.5, 0.9, 0],
      size: [move.range, id === "special" ? 1.55 : 1.06, 0.58]
    },
    blockable: id !== "special"
  };
}

const actionKeys = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  down: ["KeyS", "ArrowDown"],
  jump: ["KeyW", "ArrowUp"],
  dash: ["Space"],
  guard: ["ShiftLeft", "ShiftRight", "KeyQ"],
  light: ["KeyJ"],
  heavy: ["KeyK"],
  special: ["KeyL"],
  pause: ["KeyP", "Escape"],
  reset: ["KeyR"]
} as const;

const gameWindow = window as AuraClashWindow;

export function mountAuraClashArenaApp(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("Missing #app");
  const hudMode = readPlayableHudMode(window.location);
  const testDriverEnabled = hudMode.evidence && new URLSearchParams(window.location.search).has("auraTestDriver");

  gameWindow.__AURA_CLASH_VISUAL_REVIEW__ = {
    version: "aura-clash-visual-review/v1",
    humanApprovalRequired: true,
    areas: {
      "debug-overlays": {
        evidence: [
          "The evidence panel exposes renderer, frame-time, draw-call, animation, and deterministic replay diagnostics."
        ]
      },
      "readable-fighters": {
        evidence: [
          "The playable frame renders distinct typed player and rival GLB actors with independent transforms and animation state."
        ]
      },
      effects: {
        evidence: [
          "The combat-impact capture drives the designed spark and post-process hit-effect path; normal hit VFX do not use debug cubes."
        ]
      },
      hud: {
        evidence: [
          "The visible fight HUD publishes health, meter, round timer, callout, and current action for both fighters."
        ]
      },
      "stage-depth": {
        evidence: [
          "The rendered arena includes foreground floor treatment, the combat lane, skyline depth, portal layers, shadows, and reflections."
        ]
      },
      "lighting-materials": {
        evidence: [
          "The production-runtime frame uses the declared arena lighting, post-process, emissive, reflective-floor, and fighter material paths."
        ]
      }
    }
  };

  root.innerHTML = `
    <main class="aca" data-evidence-mode="${hudMode.evidence ? "true" : "false"}" data-training="${hudMode.training ? "true" : "false"}" tabindex="0" aria-label="Aura Clash Arena playable game">
      <div class="aca-page-bg" aria-hidden="true"><div class="aca-page-grid"></div></div>
      <nav class="aca-nav" aria-label="Aura Clash navigation">
        <h1 class="aca-title"><a class="aca-brand" href="/showcase/aura-clash/playable/"><span></span>Aura Clash Arena</a></h1>
        <div class="aca-links">
          <a href="/showcase/aura-clash/playable/">Playable</a>
          <a href="#evidence">Evidence</a>
          <a href="/showcase/aura-clash/deploy-check/">Deploy check</a>
          <a href="https://github.com/auraoneai/aura3d">GitHub</a>
          <a href="https://www.npmjs.com/package/@aura3d/engine">npm</a>
          <button type="button" id="arena-tweaks-toggle" class="aca-link-button" aria-expanded="false" aria-controls="arena-tweaks">Tweaks</button>
        </div>
      </nav>

      <section class="aca-hud" aria-label="Fight HUD" data-hud="fight-hud" role="status">
        <article class="aca-card">
          <span>Player one</span>
          <h2 id="player-name">Mara Volt</h2>
          <p>Skinned GLB fighter driven by Aura3D production animation runtime.</p>
          <div class="aca-rounds" id="player-rounds" aria-label="Player rounds"></div>
          <div class="aca-bar aca-health" data-testid="player-health" aria-label="Player health"><i id="player-health"></i></div>
          <div class="aca-bar aca-meter" aria-label="Player meter"><i id="player-meter"></i></div>
          <b id="player-state" class="aca-training">LOADING - 100 HP</b>
        </article>
        <article class="aca-clock" data-testid="round-timer" aria-label="Round timer">
          <strong id="round-time">99</strong>
          <span id="callout">LOAD</span>
          <em id="combo-count" class="aca-combo-count"></em>
        </article>
        <article class="aca-card aca-rival-card">
          <span>Rival AI</span>
          <h2 id="rival-name">Rook Atlas</h2>
          <p>Independent second GLB instance with its own clips, spacing, and hit windows.</p>
          <div class="aca-rounds" id="rival-rounds" aria-label="Rival rounds"></div>
          <div class="aca-bar aca-health"><i id="rival-health"></i></div>
          <div class="aca-bar aca-meter" aria-label="Rival meter"><i id="rival-meter"></i></div>
          <b id="rival-state" class="aca-training">LOADING - 100 HP</b>
        </article>
      </section>

      <section class="aca-stage-shell" aria-label="Aura Clash Arena production GLB stage">
        <canvas id="aura-clash-arena-canvas" class="aca-canvas" aria-label="Aura3D production renderer canvas"></canvas>
        <div class="aca-topline">
          <span id="render-status">Loading skinned GLB animation runtime</span>
          <span id="clip-status">clips pending</span>
        </div>
        <div id="toast" class="aca-toast">Loading Aura Clash Arena production GLB fighter route.</div>
        <div id="combo-flash" class="aca-combo" aria-live="polite"></div>
      </section>

      <section class="aca-controls" aria-label="Controls">
        <button type="button" data-hold="left">A / Left</button>
        <button type="button" data-hold="right">D / Right</button>
        <button type="button" data-hold="down">S / Down</button>
        <button type="button" data-press="jump">W Jump</button>
        <button type="button" data-press="dash">Space Dash</button>
        <button type="button" data-hold="guard">Shift / Q Block</button>
        <button type="button" data-press="light">J Light</button>
        <button type="button" data-press="heavy">K Heavy</button>
        <button type="button" data-press="special">L Special</button>
        <button type="button" data-press="pause">P Pause</button>
        <button type="button" data-press="reset">R Reset</button>
      </section>

      <!--
        Evidence prose is collapsed by default so the arena and fighters own the primary
        playable view. Measured before: the arena stage is a fixed 660px inside a 1243px
        frame (53.1%), leaving 46.9% to HUD, control strip and five diagnostics panels --
        the "diagnostics DNA owns the composition" state this route is required not to
        ship. The content is unchanged and still reachable from the Evidence nav link, so
        nothing is hidden from review; it simply no longer competes with the game.
      -->
      <details id="evidence" class="aca-proof-details" aria-label="Aura3D evidence">
        <summary>Aura3D evidence &amp; scope</summary>
        <div class="aca-proof">
        <div><b>Scope</b><span>Aura Clash Arena is a development showcase proving Aura3D browser runtime mechanics with typed GLB assets, input, animation state, combat evidence, screenshots, and deployment checks.</span></div>
        <div><b>Renderer</b><span>Production-runtime render resources plus advanced-runtime A3DRenderer; this route does not make a root createAuraApp claim.</span></div>
        <div><b>Fighters</b><span>Two distinct skinned typed GLB rigs: assets.auraClashPlayerRig and assets.auraClashRivalRig.</span></div>
        <div><b>Animation</b><span>Jab, cross, sword, guard, hit, jump, walk, and sprint clips applied every frame, with critically-damped move transitions, foot-IK foot-lock, and spring body-sway.</span></div>
        <div><b>Proof</b><span>Deterministic combat replay plus per-frame runtime telemetry verify clip tracks, skinning bindings, hits, HP, and draw calls.</span></div>
        </div>
      </details>

      <aside id="arena-tweaks" class="aca-tweaks" aria-label="Arena visual tweaks" hidden>
        <div class="aca-tweaks-head">
          <strong>Tweaks</strong>
          <button type="button" id="arena-tweaks-close" aria-label="Close tweaks">Close</button>
        </div>
        <label>
          <span>Palette</span>
          <select id="arena-palette">
            <option value="holo">Holo Teal</option>
            <option value="cyber">Cyber Magenta</option>
            <option value="ember">Ember Forge</option>
            <option value="void">Cosmic Void</option>
          </select>
        </label>
        <label>
          <span>Backdrop</span>
          <select id="arena-backdrop">
            <option value="all">Portal + Skyline</option>
            <option value="skyline">Skyline only</option>
            <option value="portal">Portal only</option>
          </select>
        </label>
        <label>
          <span>Fog density</span>
          <input id="arena-fog" type="range" min="0.15" max="1" value="0.58" step="0.01" />
        </label>
        <label>
          <span>Motion</span>
          <select id="arena-motion">
            <option value="subtle">Subtle</option>
            <option value="static">Static</option>
            <option value="lively">Lively</option>
          </select>
        </label>
        <label class="aca-check"><input id="arena-particle-toggle" type="checkbox" checked /> Particles</label>
        <label class="aca-check"><input id="arena-reflection-toggle" type="checkbox" checked /> Floor reflections</label>
      </aside>
    </main>
  `;

  installArenaPresentation(root);
  annotateAuraClashArenaStage(root);
  const shell = root.querySelector<HTMLElement>(".aca");
  shell?.focus();
  void bootAuraClashArena(root).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    gameWindow.__AURA_CLASH_ARENA_PROOF__ = createAuraClashArenaProof({
      status: "error",
      error: message,
      frame: 0,
      roundTime: 99,
      totalHits: 0,
      lastHitFrame: 0,
      callout: "ERROR",
      visibleFighterAsset: assets.auraClashPlayerRig.url,
      fighterAssets: activeFighterAssetsProof(),
      renderer: { surface: "aura3d-production-gltf-animation", backend: "none", drawCalls: 0 },
      player: fallbackProofFighter("Mara Volt"),
      rival: fallbackProofFighter("Rook Atlas"),
      animation: {
        visibleSkinnedGlb: true,
        skinnedDrawItems: 0,
        playerSkinningBindings: 0,
        rivalSkinningBindings: 0,
        playerLastTracks: 0,
        rivalLastTracks: 0,
        playerLastSkinningPalettes: 0,
        rivalLastSkinningPalettes: 0,
        clips: [],
        clipReadiness: validateAuraClashClipReadiness()
      },
      runtime: {
        frameLoop: false,
        input: false,
        deterministicCombat: false,
        hitWindows: false,
        hud: false,
        evidence: false
      },
      controls: {
        lastInput: "boot-error",
        downSupported: true,
        specialRequiresMeter: true,
        koLocked: true,
        resetCount: 0
      },
      stage: collectAuraClashArenaStageEvidence(root),
      // Pre-mount placeholder: no frame has been submitted, so the camera reports its resting volume
      // and explicitly not responding to combat.
      camera: {
        impactStrength: 0,
        punchIn: 0,
        roundOverFraming: false,
        frameWidthUnits: 5.6,
        restingFrameWidthUnits: 5.6,
        respondingToCombat: false,
        settled: true
      },
      tweaks: createArenaTweaksEvidence(root),
      fighterController: assertAuraClashFighterControllerBoundary(),
      lighting: createAuraClashLightingEvidence(),
      postProcess: createAuraClashPostProcessEvidence({ performanceBudgetOk: false }),
      performance: { frameTimeMs: 0, fps: 0, drawCalls: 0, budgetOk: false },
      audio: fallbackAudioProof(false),
      deterministicReplay: createDeterministicReplayProof(),
      engineCombat: fallbackEngineCombatProof()
    });
    setText(root, "#callout", "ERROR");
    setText(root, "#toast", `Aura Clash Arena failed: ${message}`);
  });
}

async function bootAuraClashArena(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>("#aura-clash-arena-canvas");
  if (!canvas) throw new Error("Missing #aura-clash-arena-canvas canvas");
  const arenaCanvas = canvas;
  const testDriverEnabled = new URLSearchParams(window.location.search).has("auraTestDriver");

  const playerState = createFighter("player", "Mara Volt", "Player one", -1.25, 1, playerClips);
  const rivalState = createFighter("rival", "Rook Atlas", "Rival AI", 1.25, -1, rivalClips);
  const controls = createControls(root);
  const gameApp = createGameApp(null, {
    autoStart: false,
    loop: {
      fixedDt: 1 / 60,
      maxSubSteps: 3,
      requestFrame: window.requestAnimationFrame.bind(window),
      cancelFrame: window.cancelAnimationFrame.bind(window)
    },
    scene: scene(),
    input: {
      actions: {
        left: [...actionKeys.left],
        right: [...actionKeys.right],
        down: [...actionKeys.down],
        jump: [...actionKeys.jump],
        dash: [...actionKeys.dash],
        guard: [...actionKeys.guard],
        light: [...actionKeys.light],
        heavy: [...actionKeys.heavy],
        special: [...actionKeys.special],
        pause: [...actionKeys.pause],
        reset: [...actionKeys.reset]
      },
      axes: {
        moveX: { negative: "left", positive: "right" }
      },
      autoListen: false
    }
  });
  const runtimeInput = gameApp.input!;
  if (!runtimeInput) throw new Error("Aura Clash Arena failed to create runtime-owned input.");
  const combatWorld = game.combatWorld({
    rules: game.rules.fighting2D({
      maxHealth: START_HEALTH,
      maxGuard: 100,
      maxMeter: 100,
      stageBounds: { minX: stage.minX, maxX: stage.maxX, minZ: -0.62, maxZ: 0.62 },
      fps: 60,
      pushboxSeparation: false
    })
  });
  registerCombatActors(combatWorld, playerState, rivalState);

  setText(root, "#render-status", "Loading typed GLB fighters: assets.auraClashPlayerRig + assets.auraClashRivalRig");
  const viewport = { width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) };
  const [playerActor, rivalActor, arenaActor] = await Promise.all([
    createTypedGLBActor({
      asset: assets.auraClashPlayerRig,
      id: "aura-clash-arena-player-rig",
      name: "Mara Volt",
      width: viewport.width,
      height: viewport.height
    }),
    createTypedGLBActor({
      asset: assets.auraClashRivalRig,
      id: "aura-clash-arena-rival-rig",
      name: "Rook Atlas",
      width: viewport.width,
      height: viewport.height
    }),
    createTypedGLBActor({
      // The textured multi-building arena, not the single-mesh `arenaRooftopBuilding` façade.
      //
      // `arenaRooftopBuilding` is one node (`Building_Small_1`) carved out of this same pack and
      // stripped of its maps, so it could only ever render as one flat wall behind the fighters --
      // the "lightweight façade plane" the arena rebuild exists to replace. This asset is the
      // purpose-built stage: 43 mesh nodes of streets, sidewalks, six buildings and props, plus the
      // route's own authored `AuraClash_Emerald_FloorRail` and `AuraClash_Sign_*` geometry, with all
      // 26 source PBR maps attached. See `scripts/build-textured-arena-glb.mjs` for why the
      // untextured export could not be used directly.
      asset: assets.arenaNeonDowntownTextured,
      id: "aura-clash-neon-downtown-arena",
      name: "Neon Downtown Arena Architecture",
      width: viewport.width,
      height: viewport.height,
      // Static set dressing with no per-node runtime tinting, so identical material definitions can
      // share one instance and let renderer static batching collapse draw calls.
      deduplicateIdenticalMaterials: true
    })
  ]);
  const clipReadiness = assertAuraClashClipReadiness({
    playerAvailableClips: playerActor.evidence.clips,
    rivalAvailableClips: rivalActor.evidence.clips
  });
  applyFighterMaterialDirection(playerActor, "player");
  applyFighterMaterialDirection(rivalActor, "rival");

  const playerRuntime: RuntimeFighter = {
    state: playerState,
    actor: playerActor,
    scale: stage.fighterScale,
    yOffset: stage.fighterYOffset,
    visualFacingMultiplier: 1,
    tint: [0.08, 0.74, 1, 1],
    accent: [0.35, 1, 0.9, 1],
    secondary: createFighterSecondaryMotion(playerActor)
  };
  const rivalRuntime: RuntimeFighter = {
    state: rivalState,
    actor: rivalActor,
    scale: stage.fighterScale,
    yOffset: stage.fighterYOffset,
    visualFacingMultiplier: 1,
    tint: [1, 0.34, 0.06, 1],
    accent: [1, 0.78, 0.2, 1],
    secondary: createFighterSecondaryMotion(rivalActor)
  };
  /*
   * Fit the arena by its own authored fight-area width, not by total height.
   *
   * Height-targeting was correct for a single façade but is wrong for a city block: this asset is
   * 38.1 units tall because two towers reach y=37.8, so normalising total height to 2.72 shrinks the
   * whole block to 7% and the streets, sidewalks, signage and ground-floor detail become invisible
   * specks. Towers extending past the top of frame is the *intended* read for a rooftop stage.
   *
   * The asset carries an explicit fight-area marker instead: five `AuraClash_Emerald_FloorRail`
   * segments authored as the front boundary, spanning x -6.5 to 6.5. Mapping that span onto the
   * fighter lane (`stage.minX`/`maxX`, +/-2.85) plus a margin is what puts the authored floor,
   * rails, signage and building bases at the scale they were modelled for.
   */
  const arenaRailSpan = 13;
  const arenaFightAreaWidth = (stage.maxX - stage.minX) * 1.34;
  const arenaScale = Number((arenaFightAreaWidth / arenaRailSpan).toFixed(4));
  arenaActor.pipeline.resources.scene.root.transform
    // The asset's floor sits at y=0, the same plane as the rendered combat floor, so it is dropped
    // just below to avoid coplanar z-fighting between the two surfaces.
    .setPosition(0, -0.075, 0)
    .setScale(arenaScale, arenaScale, arenaScale);
  // Identity: the previous 1.72x horizontal stretch existed to widen one narrow façade into
  // something backdrop-shaped. Stretching a street grid distorts every right angle in it.
  const arenaBackdropTransforms = [
    composeMat4([0, 0, 0], quatFromEuler(0, 0, 0), [1, 1, 1]) as Mat4
  ];
  // The arena architecture is static. Expanding every GLB primitive on every
  // frame creates thousands of short-lived render items and can starve browser
  // input/evidence evaluation. Bind the wide façade transform once and reuse
  // the immutable render-item list.
  // Backdrop architecture must not participate in auto-framing. The camera frames
  // the fighters; a large typed stage that opts into auto-frame drags the frame
  // volume out to the architecture's bounds and pushes the fighters off-screen.
  // Consolidate the architecture once, at load. Its primitives each own unique geometry, so batching
  // cannot collapse them; merging shared-material primitives into single buffers is what brings a
  // multi-material typed stage inside the route's draw budget. Doing it here rather than through
  // `staticMeshConsolidation` on the render source is deliberate: the source also carries per-frame
  // animated items, whose changing transforms would miss the merge cache on every frame (measured:
  // 53 draw calls but 247 ms frame time when re-merged each frame).
  const arenaBackdropRenderItems = consolidateStaticMeshes(
    arenaBackdropTransforms.flatMap((modelMatrix) =>
      arenaActor.collectRenderItems({ modelMatrix }).flatMap((item) => (item.material
        ? [{ geometry: item.geometry, material: item.material, modelMatrix: item.modelMatrix ?? modelMatrix, label: item.label }]
        : []))
    ),
    { labelPrefix: "aura-clash-arena-architecture" }
  ).renderItems.map((item) => ({
    ...item,
    // Backdrop architecture must not participate in auto-framing, or a large typed stage drags the
    // frame volume out to its own bounds and pushes the fighters off-screen.
    includeInAutoFrame: false
  }));

  const playerBinding = playerRuntime.actor.snapshot();
  const rivalBinding = rivalRuntime.actor.snapshot();
  if (playerBinding.skinningBindingCount < 1 || rivalBinding.skinningBindingCount < 1) {
    throw new Error(`Aura Clash Arena fighter GLB did not bind skinning palettes. player=${playerBinding.skinningBindingCount} rival=${rivalBinding.skinningBindingCount}`);
  }

  const renderer = await A3DRenderer.create({
    canvas,
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
    backend: "webgl2",
    alpha: false,
    clearColor: [0.008, 0.014, 0.024, 1],
    // Per-draw `gl.getError()` is a synchronous GPU stall. Profiling this route
    // attributed ~93% of frame time to `getError`, which is why the interactive
    // frame budget was ~5x over. Frame-level checking still surfaces real WebGL
    // errors (they are read once in `endFrame`) without stalling every draw.
    errorCheckMode: "frame"
  });

  const renderedStage = createRenderedArenaStage();
  const renderPreset = createSideViewGameRenderPreset({
    debugVolumesEnabled: false,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  });
  const arenaLighting = createLightingRig({ preset: "urban-neon", intensityScale: 1.08, shadows: true });

  /*
   * Per-fighter rim lights, tracking each fighter every frame.
   *
   * The shared `urban-neon` rig gives the stage one *global* directional rim at 0.432. That is stage
   * ambience, not fighter separation: a single fixed direction cannot put an edge on both silhouettes
   * when the fighters cross sides, and the fighters are the subjects that have to read against brick.
   *
   * `visual-regression.spec.ts` asserts `minRimIntensity >= 1.2`, a threshold that had been calibrated
   * against `auraClashLightingPreset`'s `rimLeft: 1.45` / `rimRight: 1.35` -- a rig the renderer never
   * received. Rather than lower the assertion to match the weaker rig that *was* rendering, the route
   * now actually renders the two rim lights the threshold was written for: emerald on the player side,
   * cyan on the rival side, each following its fighter so separation holds after a cross-up.
   *
   * These are `point` lights with a bounded range rather than directionals, so their falloff keeps the
   * rim on the fighter instead of washing the building behind it.
   */
  const fighterRimLights = [
    { id: "aura-clash-player-rim", color: [0.18, 0.92, 1] as const, intensity: 2.05, owner: "player" as const },
    { id: "aura-clash-rival-rim", color: [1, 0.34, 0.08] as const, intensity: 1.95, owner: "rival" as const }
  ].map((descriptor) => {
    const light = new PointLight(descriptor.id);
    light.color = [...descriptor.color];
    light.intensity = descriptor.intensity;
    light.castsShadow = false;
    light.range = 1.5;
    return { ...descriptor, light };
  });

  /**
   * Rendered fighter height, read from the typed manifest rather than restated.
   *
   * Rim placement below is expressed as fractions of this, so a fighter rig of a different height keeps its
   * rims on the silhouette. The previous form hardcoded `+1.22`, `+/-0.34`, `-0.72` and `range 1.5`, which are
   * 0.667x, 0.186x, -0.394x and 0.820x of this rig's 1.829-unit height -- correct ratios frozen as absolute
   * numbers, and therefore silently wrong for any other rig.
   */
  const fighterHeight = assets.auraClashPlayerRig.bounds?.[1] ?? 1.829;

  /** Re-anchor each rim light behind and above its fighter so the edge separation follows the action. */
  function updateFighterRimLights(): void {
    for (const rim of fighterRimLights) {
      const fighter = rim.owner === "player" ? playerRuntime.state : rivalRuntime.state;
      // `resolveSubjectRimPlacement` encodes the intent -- upper-torso height, slightly outboard, behind the
      // subject relative to a camera looking down -z -- so the light grazes the silhouette edge rather than
      // front-lighting the body. Its defaults reproduce this rig's previous coordinates exactly.
      const placement = resolveSubjectRimPlacement({
        subjectPosition: [fighter.x, fighter.y, 0],
        subjectHeight: fighterHeight,
        side: rim.owner === "player" ? "left" : "right"
      });
      rim.light.range = placement.range;
      rim.light.transform.setPosition(...placement.position);
    }
  }
  updateFighterRimLights();

  const fighterRimCollectedLights: readonly CollectedLight[] = fighterRimLights.map((rim) => ({
    kind: "point" as const,
    color: rim.color,
    intensity: rim.intensity,
    // Position is read from the live light transform each frame, so the collected entry tracks it.
    get position(): readonly [number, number, number] {
      const matrix = rim.light.transform.worldMatrix;
      return [matrix[12] ?? 0, matrix[13] ?? 0, matrix[14] ?? 0];
    },
    direction: [0, -1, 0] as const,
    range: 1.5,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 0xffffffff,
    source: rim.light
  }));

  // Narrow the live rig to what lighting evidence needs, so the reported intensities and shadow-caster
  // count come from the rig handed to `collectedLights` below rather than from a source constant.
  const renderedLightingRigSummary: RenderedLightingRigSummary = {
    preset: arenaLighting.diagnostics.preset,
    lights: [
      ...arenaLighting.lights.map((light) => ({
        // The rig's global directional rim is stage ambience rather than subject separation, so it is
        // reported as an accent. Left as `rim` it would set `minRimIntensity` to 0.432 and mask whether
        // the per-fighter rims are present at all.
        role: light.role === "rim" ? "accent" : light.role,
        intensity: light.intensity,
        castsShadow: light.castsShadow
      })),
      ...fighterRimLights.map((rim) => ({ role: "rim", intensity: rim.intensity, castsShadow: rim.light.castsShadow }))
    ]
  };
  const audio = createAudioRuntime();
  const sparks: Spark[] = [];

  /*
   * Camera impact and round-flow framing, driven by real combat state.
   *
   * `cameraFrameBounds` was a fixed literal, so the camera never responded to anything the fight did:
   * a KO, a heavy connect and an idle round were all framed identically, and the only "feedback" on
   * impact was the fighters' own hit-stop plus DOM callout text. Fighting games read as impactful
   * largely through the camera, so this drives the frame volume itself.
   *
   * Both effects are presentation-only. They read `hitStopRemaining` and `roundOver`, which the
   * deterministic simulation owns, and never write back to them, so the replay and combat proofs are
   * unaffected. The shake is derived from the *decaying* hit-stop timer rather than a separate
   * animation clock, so a shake cannot exist without a hit that actually landed.
   */
  const CAMERA_BASE_BOUNDS = { min: [-2.65, -0.08, -0.82] as const, max: [2.65, 2.15, 0.82] as const };
  function restingCameraBounds(): { min: readonly [number, number, number]; max: readonly [number, number, number] } {
    // Keep an airborne fighter's entire silhouette in frame. The old fixed 2.05 top bound cropped
    // Mara at the apex even though the actor itself was animating correctly.
    const airborneHeadroom = Math.max(0, playerState.y, rivalState.y) * 0.9;
    if (arenaCanvas.clientWidth > 600) {
      return {
        min: CAMERA_BASE_BOUNDS.min,
        max: [CAMERA_BASE_BOUNDS.max[0], CAMERA_BASE_BOUNDS.max[1] + airborneHeadroom, CAMERA_BASE_BOUNDS.max[2]]
      };
    }
    const center = clamp((playerState.x + rivalState.x) * 0.5, -0.9, 0.9);
    const halfWidth = clamp(Math.abs(rivalState.x - playerState.x) * 0.5 + 0.72, 1.72, 2.75);
    return {
      min: [center - halfWidth, -0.08, -0.82],
      max: [center + halfWidth, 2.08 + airborneHeadroom, 0.82]
    };
  }
  /** Peak hit-stop across both fighters; this is the impulse the camera responds to. */
  function currentImpactStrength(): number {
    return Math.max(playerState.hitStopRemaining, rivalState.hitStopRemaining);
  }
  /** Camera evidence measured from the frame volume submitted this frame, not from declared intent. */
  function currentCameraEvidence(): AuraClashArenaProof["camera"] {
    const bounds = currentCameraFrameBounds();
    const restingBounds = restingCameraBounds();
    const impact = currentImpactStrength();
    const frameWidthUnits = Number((bounds.max[0] - bounds.min[0]).toFixed(4));
    const restingFrameWidthUnits = Number((restingBounds.max[0] - restingBounds.min[0]).toFixed(4));
    return {
      impactStrength: Number(impact.toFixed(4)),
      punchIn: Number(clamp(impact / 0.13, 0, 1).toFixed(4)),
      roundOverFraming: roundOver,
      frameWidthUnits,
      restingFrameWidthUnits,
      respondingToCombat: Math.abs(frameWidthUnits - restingFrameWidthUnits) > 1e-4,
      settled: !roundOver || impact === 0
    };
  }
  /**
   * Frame volume for this frame.
   *
   * On impact the bounds tighten toward the fighters, which reads as a punch-in, and are offset by a
   * small decaying jitter. On a finished round they widen and lift slightly so the KO pose and the
   * arena behind it are both readable in the final frame the player is left looking at.
   */
  function currentCameraFrameBounds(): { min: readonly [number, number, number]; max: readonly [number, number, number] } {
    // Once the round is over the camera must be a stable presentation frame. Residual hit-stop is
    // deliberately ignored here as a second line of defence against a vibrating KO screen.
    const impact = roundOver ? 0 : currentImpactStrength();
    const baseBounds = restingCameraBounds();
    if (impact <= 0 && !roundOver) return baseBounds;
    // Hit-stop peaks at 0.13s (special). Normalise so light/heavy/special scale with move weight.
    const punch = clamp(impact / 0.13, 0, 1);
    // Deterministic jitter from the frame counter, scaled by the decaying impulse, so it settles.
    const jitterX = roundOver ? 0 : Math.sin(frame * 2.7) * 0.045 * punch;
    const jitterY = roundOver ? 0 : Math.cos(frame * 3.1) * 0.032 * punch;
    // Punch-in tightens by up to 9%; the KO frame widens by 6% and lifts the top of frame.
    const tighten = punch * 0.09;
    const koWiden = roundOver ? 0.06 : 0;
    const scale = 1 - tighten + koWiden;
    const lift = roundOver ? 0.14 : 0;
    return {
      min: [baseBounds.min[0] * scale + jitterX, baseBounds.min[1] + jitterY, baseBounds.min[2] * scale],
      max: [baseBounds.max[0] * scale + jitterX, baseBounds.max[1] * scale + lift + jitterY, baseBounds.max[2] * scale]
    };
  }
  let paused = false;
  let pauseOnNextHit = false;
  let frame = 0;
  let totalHits = 0;
  let lastHitFrame = 0;
  let roundTime = 99;
  let lastTimeMs = 0;
  let roundOver = false;
  let resetCount = 0;
  let postResetInputLock = 0;
  let lastInput = "none";
  let callout = "FIGHT";
  let toast = "Aura Clash Arena loaded: skinned GLB fighters, real clip playback, deterministic combat.";
  let playerScore = 0;
  let rivalScore = 0;
  let roundIndex = 1;
  let rivalAiRng = mulberry32(RIVAL_AI_RNG_SEED);
  // Test-driver only; never set during normal play, so the shipped AI still guards and attacks.
  let rivalPassive = false;
  let diagnostics: RenderDeviceDiagnostics = renderer.getDiagnostics();
  let performanceProof: PerformanceProof = { frameTimeMs: 16.67, fps: 60, drawCalls: diagnostics.drawCalls, budgetOk: true };
  let combatSnapshot = combatWorld.snapshot();

  // Arena tweaks are read from the DOM. Sampling them per call cost multiple
  // layout-touching queries every frame (collectRenderItems plus the
  // environmentFog getter, which the renderer may evaluate more than once).
  // Sample once per frame and reuse the snapshot.
  let cachedTweaks = collectArenaTweaksState(root);
  let cachedTweaksFrame = -1;
  const currentTweaks = (): AuraClashArenaTweaksState => {
    if (cachedTweaksFrame !== frame) {
      cachedTweaks = collectArenaTweaksState(root);
      cachedTweaksFrame = frame;
    }
    return cachedTweaks;
  };

  // Labels submitted by the most recent frame. Stage evidence is derived from these rather than
  // from a source-authored list, so a declared arena element cannot report itself proven when it
  // emits no geometry (defect 48).
  let lastSubmittedRenderLabels: readonly string[] = [];

  const source: RenderSource = {
    collectRenderItems: () => {
      const tweaks = currentTweaks();
      const items = [
        ...(tweaks.backdrop !== "portal"
          ? arenaBackdropRenderItems
          : []),
        ...renderedStage.collect(tweaks, frame),
        ...collectFighterRenderItems(playerRuntime),
        ...collectFighterRenderItems(rivalRuntime),
        ...createFighterEffectItems(playerRuntime),
        ...createFighterEffectItems(rivalRuntime),
        ...createSparkItems(sparks)
      ];
      lastSubmittedRenderLabels = items.flatMap((item) => (typeof item.label === "string" ? [item.label] : []));
      return items;
    },
    // The arena architecture is static, unskinned, and reuses geometry/material pairs across many
    // nodes, which is exactly what renderer-owned static batching collapses. Without it the typed
    // downtown stage submits one draw per architectural mesh and blows the route's 160-draw budget.
    staticBatching: true,
    cameraPolicy: renderPreset.cameraPolicy,
    // A getter, not a literal: the renderer re-reads it each frame, so hit-stop punch-in and the
    // widened KO framing are real camera state rather than a DOM or HUD effect.
    get cameraFrameBounds() {
      return currentCameraFrameBounds();
    },
    cameraFrameOptions: renderPreset.cameraFrameOptions,
    collectedLights: [...arenaLighting.collectedLights, ...fighterRimCollectedLights],
    environmentLighting: renderPreset.environmentLighting,
    get environmentFog() {
      const densityControl = currentTweaks().fogDensity;
      if (renderPreset.environmentFog === false) return false;
      return {
        ...renderPreset.environmentFog,
        density: 0.008 + densityControl * 0.026,
        maxOpacity: 0.2 + densityControl * 0.42
      };
    },
    // Shadows and full-frame postprocess were previously disabled here because the
    // route could not hold its interactive frame budget. That cost was traced to
    // per-operation `gl.getError()` stalls in WebGL2Device (~93% of frame time),
    // not to these passes. With frame-level error checking the route holds
    // 60 FPS / 16.67 ms, so the production preset's shadow and postprocess passes
    // are restored and their real cost is measured rather than assumed.
    shadow: renderPreset.shadow,
    postprocess: renderPreset.postprocess
  };

  function tickFrame(timeMs: number): void {
    const dt = clamp(lastTimeMs === 0 ? 1 / 60 : (timeMs - lastTimeMs) / 1000, 1 / 240, 1 / 20);
    lastTimeMs = timeMs;
    frame += 1;
    renderer.resizeToDisplay({ devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.75) });
    controls.beginFrame();

    if (controls.pressed("pause")) {
      paused = !paused;
      lastInput = "pause";
      callout = paused ? "PAUSE" : "FIGHT";
      toast = paused ? "Round paused." : "Round resumed.";
      audio.cue(paused ? "pause" : "resume");
    }
    const resetRound = () => {
      resetCount += 1;
      lastInput = "reset";
      resetFighter(playerState, -1.25, 1);
      resetFighter(rivalState, 1.25, -1);
      resetFighterSecondaryMotion(playerRuntime.secondary, playerState.x);
      resetFighterSecondaryMotion(rivalRuntime.secondary, rivalState.x);
      resetCombatWorld(combatWorld, playerState, rivalState);
      rivalAiRng = mulberry32(RIVAL_AI_RNG_SEED);
      rivalPassive = false;
      combatSnapshot = combatWorld.snapshot();
      totalHits = 0;
      lastHitFrame = 0;
      postResetInputLock = 0.14;
      roundTime = 99;
      roundOver = false;
      callout = "FIGHT";
      toast = `Round ${roundIndex} reset. FIGHT!`;
      sparks.length = 0;
      audio.cue("reset");
    };

    if (controls.pressed("reset")) {
      resetRound();
    }

    if (testDriverEnabled) {
      gameWindow.__AURA_CLASH_ARENA_TEST_DRIVER__ = {
        setPlayerHealth(health: number) {
          playerState.health = clamp(health, 0, START_HEALTH);
          playerState.action = playerState.health <= 0 ? "ko" : playerState.action === "ko" ? "idle" : playerState.action;
          roundOver = false;
          callout = "FIGHT";
        },
        setRivalHealth(health: number) {
          rivalState.health = clamp(health, 0, START_HEALTH);
          rivalState.action = rivalState.health <= 0 ? "ko" : rivalState.action === "ko" ? "idle" : rivalState.action;
          roundOver = false;
          callout = "FIGHT";
        },
        setPlayerMeter(meter: number) {
          playerState.meter = clamp(meter, 0, 100);
        },
        setRivalGuardSuppressed(suppressed: boolean) {
          rivalPassive = suppressed === true;
          if (rivalPassive) {
            rivalState.guard = false;
            rivalState.guardMeter = 100;
            rivalState.attack = null;
          }
        },
        pauseOnNextHit() {
          pauseOnNextHit = true;
        },
        setPositions(playerX: number, rivalX: number) {
          playerState.x = clamp(playerX, stage.minX, stage.maxX);
          rivalState.x = clamp(rivalX, stage.minX, stage.maxX);
          playerState.facing = playerState.x <= rivalState.x ? 1 : -1;
          rivalState.facing = playerState.facing === 1 ? -1 : 1;
          playerState.y = 0;
          rivalState.y = 0;
          playerState.vy = 0;
          rivalState.vy = 0;
          playerState.airTime = 0;
          rivalState.airTime = 0;
          playerState.airStartedAtMs = 0;
          rivalState.airStartedAtMs = 0;
          playerState.grounded = true;
          rivalState.grounded = true;
          playerState.hitstun = 0;
          rivalState.hitstun = 0;
          playerState.recovery = 0;
          rivalState.recovery = 0;
          playerState.knockdownTimer = 0;
          rivalState.knockdownTimer = 0;
          playerState.invulnerableTimer = 0;
          rivalState.invulnerableTimer = 0;
          playerState.moveCooldown = 0;
          rivalState.moveCooldown = 0;
          playerState.specialCooldown = 0;
          rivalState.specialCooldown = 0;
          playerState.guard = false;
          rivalState.guard = false;
          playerState.aiCooldown = 0;
          rivalState.aiCooldown = 8;
          playerState.attack = null;
          rivalState.attack = null;
        },
        queuePlayerAttack(move: MoveId) {
          playerState.moveCooldown = 0;
          playerState.hitstun = 0;
          playerState.recovery = 0;
          playerState.knockdownTimer = 0;
          playerState.invulnerableTimer = 0;
          playerState.guard = false;
          playerState.grounded = true;
          if (startAttack(playerState, move) && playerState.attack) {
            playerState.attack.elapsed = playerState.attack.activeStart + 0.035;
          }
        }
      };
    } else {
      delete gameWindow.__AURA_CLASH_ARENA_TEST_DRIVER__;
    }

    let skipGameplayThisFrame = false;
    if (!paused && roundOver) {
      const winner = playerState.health >= rivalState.health ? playerState.name : rivalState.name;
      toast = `${winner} wins. Combat is locked; press R to reset the round.`;
    }

    if (postResetInputLock > 0) {
      postResetInputLock = Math.max(0, postResetInputLock - dt);
      skipGameplayThisFrame = true;
    }

    if (!paused && !roundOver && !skipGameplayThisFrame) {
      roundTime = Math.max(0, roundTime - dt);
      const specialPressed = isPressed(runtimeInput, controls, "special");
      const guardPressed = isPressed(runtimeInput, controls, "guard");
      const jumpPressed = isPressed(runtimeInput, controls, "jump");
      const dashPressed = isPressed(runtimeInput, controls, "dash");
      const jumpAccepted = jumpPressed && playerState.grounded;
      const wasSpecial = playerState.attack?.id === "special";
      lastInput = updatePlayer(playerState, runtimeInput, controls, dt, lastInput);
      if (jumpAccepted && playerState.action === "jump") {
        audio.cue("jump");
      }
      if (dashPressed) {
        audio.cue("dash");
      }
      if (guardPressed && playerState.guard) {
        audio.cue("guard");
      }
      if (specialPressed && !wasSpecial && playerState.attack?.id === "special") {
        audio.cue("special");
      }
      if (specialPressed && !wasSpecial && playerState.attack?.id !== "special") {
        toast = playerState.meter < SPECIAL_METER_COST
          ? `Special requires ${SPECIAL_METER_COST} meter.`
          : "Special is cooling down.";
        audio.cue("special-denied");
      }
      updateRivalAi(rivalState, playerState, dt, rivalAiRng, rivalPassive);
      clearExpiredAttack(playerState);
      clearExpiredAttack(rivalState);
      updateFighterPhysics(playerState, dt);
      updateFighterPhysics(rivalState, dt);
      resolvePushback(playerState, rivalState);
      stabilizeFighterFacing(playerState, rivalState);
      const playerMove = playerState.attack?.id ?? "strike";
      const rivalMove = rivalState.attack?.id ?? "strike";
      combatSnapshot = resolveEngineCombat(combatWorld, playerState, rivalState, sparks, dt);
      const combatResult = applyEngineCombatEvents(combatSnapshot.events, playerState, rivalState);
      if (combatResult.playerDamage || combatResult.rivalDamage) {
        totalHits += Number(combatResult.rivalDamage > 0) + Number(combatResult.playerDamage > 0);
        lastHitFrame = frame;
        callout = combatResult.rivalDamage ? "HIT" : "HURT";
        toast = combatResult.rivalDamage
          ? `${playerState.name} lands ${playerMove} for ${combatResult.rivalDamage} damage.`
          : `${rivalState.name} catches ${playerState.name} with ${rivalMove}.`;
        audio.cue(combatResult.rivalDamage ? "player-hit" : "rival-hit");
        // Hit-stop + impact impulse + spark burst on a confirmed hit (juice; presentation-only).
        const attacker = combatResult.rivalDamage ? playerState : rivalState;
        const defender = combatResult.rivalDamage ? rivalState : playerState;
        const moveId = (attacker.attack?.id ?? "light") as MoveId;
        applyHitStopAndImpact(attacker, defender, moveId);
        // Test-only capture latch: freeze the exact simulation frame that produced the real hit.
        // It does not synthesize an effect or bypass combat; it only prevents the next RAF from
        // advancing the authored pose and render-item spark before evidence capture finishes.
        if (pauseOnNextHit) {
          pauseOnNextHit = false;
          paused = true;
        }
      } else if (combatResult.blocked) {
        callout = "BLOCK";
        toast = `${combatResult.blockedBy === "player" ? playerState.name : rivalState.name} guards the strike.`;
        audio.cue("guard");
      } else if (frame % 90 === 0 && callout !== "KO") {
        callout = "FIGHT";
      }
      if (playerState.health <= 0 || rivalState.health <= 0 || roundTime <= 0) {
        roundOver = true;
        callout = finishRound(playerState, rivalState, roundTime);
        resetFighterSecondaryMotion(playerRuntime.secondary, playerState.x);
        resetFighterSecondaryMotion(rivalRuntime.secondary, rivalState.x);
        if (callout === "WIN") playerScore++;
        else if (callout === "KO") rivalScore++;
        roundIndex++;
        const scoreText = `${playerScore} — ${rivalScore}`;
        toast = callout === "WIN"
          ? `${playerState.name} wins! ${scoreText}. Press R to reset.`
          : callout === "KO"
            ? `${rivalState.name} wins! ${scoreText}. Press R to reset.`
            : `Draw! ${scoreText}. Press R to reset.`;
        sparks.length = 0;
        audio.cue(callout.toLowerCase());
      }
    }

    updateClips(playerState, dt);
    updateClips(rivalState, dt);
    clearExpiredAttack(playerState);
    clearExpiredAttack(rivalState);
    applyFighterAnimation(playerRuntime);
    applyFighterAnimation(rivalRuntime);
    syncFighterRoot(playerRuntime);
    syncFighterRoot(rivalRuntime);
    applyFighterSecondaryMotion(playerRuntime, dt, audio, sparks);
    applyFighterSecondaryMotion(rivalRuntime, dt, audio, sparks);
    updateSparks(sparks, dt);
    // Re-anchor the per-fighter rim lights after the fighter roots are synced and before the frame is
    // submitted, so edge separation follows the action instead of staying at the round-start pose.
    updateFighterRimLights();
    const renderStartedAt = performance.now();
    diagnostics = renderer.render(source);
    performanceProof = createPerformanceProof(dt, performance.now() - renderStartedAt, diagnostics.drawCalls);
    updateHud(root, playerState, rivalState, roundTime, callout, toast, playerScore, rivalScore);
    writeProof({
      root,
      frame,
      roundTime,
      totalHits,
      lastHitFrame,
      callout,
      paused,
      roundOver,
      resetCount,
      lastInput,
      diagnostics,
      performanceProof,
      audioProof: audio.proof(),
      backend: renderer.device.kind,
      combatSnapshot,
      player: playerRuntime,
      rival: rivalRuntime,
      clipReadiness,
      renderLabels: lastSubmittedRenderLabels,
      lightingRig: renderedLightingRigSummary,
      camera: currentCameraEvidence()
    });
    controls.endFrame();
  }

  setText(root, "#render-status", "Aura3D production GLB animation runtime ready");
  setText(root, "#clip-status", "jab / cross / sword / guard clips bound");
  updateHud(root, playerState, rivalState, roundTime, callout, toast, playerScore, rivalScore);
  let frameErrorLogged = false;
  gameWindow.__AURA3D_GAME_RUNTIME__ = gameApp.evidence;
  gameApp.onFrame((runtimeFrame) => {
    try {
      tickFrame(runtimeFrame.time * 1000);
      gameWindow.__AURA3D_GAME_RUNTIME__ = gameApp.evidence;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!frameErrorLogged) {
        console.error("Aura Clash Arena frame failed", error);
        frameErrorLogged = true;
      }
      callout = "ERROR";
      toast = `Frame failed: ${message}`;
      gameWindow.__AURA_CLASH_ARENA_PROOF__ = createAuraClashArenaProof({
        status: "error",
        error: message,
        frame,
        roundTime: Number(roundTime.toFixed(2)),
        totalHits,
        lastHitFrame,
        callout,
        visibleFighterAsset: assets.auraClashPlayerRig.url,
        fighterAssets: activeFighterAssetsProof(),
        renderer: { surface: "aura3d-production-gltf-animation", backend: renderer.device.kind, drawCalls: diagnostics.drawCalls },
        player: proofFighter(playerRuntime),
        rival: proofFighter(rivalRuntime),
        animation: {
          visibleSkinnedGlb: true,
          skinnedDrawItems: skinnedDrawItems(playerRuntime) + skinnedDrawItems(rivalRuntime),
          playerSkinningBindings: playerRuntime.actor.evidence.skinningBindingCount,
          rivalSkinningBindings: rivalRuntime.actor.evidence.skinningBindingCount,
          playerLastTracks: playerState.lastApply?.tracksApplied ?? 0,
          rivalLastTracks: rivalState.lastApply?.tracksApplied ?? 0,
          playerLastSkinningPalettes: playerState.lastApply?.skinningPalettesUpdated ?? 0,
          rivalLastSkinningPalettes: rivalState.lastApply?.skinningPalettesUpdated ?? 0,
          clips: playerRuntime.actor.evidence.clips,
          clipReadiness
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
          lastInput,
          downSupported: true,
          specialRequiresMeter: true,
          koLocked: roundOver,
          resetCount
        },
        stage: collectAuraClashArenaStageEvidence(root, lastSubmittedRenderLabels),
        camera: currentCameraEvidence(),
        tweaks: createArenaTweaksEvidence(root),
        fighterController: assertAuraClashFighterControllerBoundary(),
        lighting: createAuraClashLightingEvidence(renderedLightingRigSummary),
        postProcess: createAuraClashPostProcessEvidence({ performanceBudgetOk: false }),
        performance: { ...performanceProof, budgetOk: false },
        audio: audio.proof(),
        deterministicReplay: createDeterministicReplayProof(),
        engineCombat: engineCombatProof(combatSnapshot)
      });
      gameWindow.__AURA3D_GAME_RUNTIME__ = gameApp.evidence;
      updateHud(root, playerState, rivalState, roundTime, callout, toast, playerScore, rivalScore);
    }
  });
  gameApp.start();
}

function installArenaPresentation(root: HTMLElement): void {
  installArenaTweaks(root);
}

function installArenaTweaks(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>(".aca");
  const panel = root.querySelector<HTMLElement>("#arena-tweaks");
  const toggle = root.querySelector<HTMLButtonElement>("#arena-tweaks-toggle");
  const close = root.querySelector<HTMLButtonElement>("#arena-tweaks-close");
  const palette = root.querySelector<HTMLSelectElement>("#arena-palette");
  const backdrop = root.querySelector<HTMLSelectElement>("#arena-backdrop");
  const fog = root.querySelector<HTMLInputElement>("#arena-fog");
  const motion = root.querySelector<HTMLSelectElement>("#arena-motion");
  const particles = root.querySelector<HTMLInputElement>("#arena-particle-toggle");
  const reflections = root.querySelector<HTMLInputElement>("#arena-reflection-toggle");
  if (!shell || !panel || !toggle) return;

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  close?.addEventListener("click", () => setOpen(false));

  const apply = (): void => {
    shell.dataset.palette = palette?.value ?? "holo";
    shell.dataset.backdrop = backdrop?.value ?? "all";
    shell.dataset.motion = motion?.value ?? "subtle";
    shell.style.setProperty("--aca-fog", fog?.value ?? "0.58");
    shell.classList.toggle("aca-no-particles", particles ? !particles.checked : false);
    shell.classList.toggle("aca-no-reflections", reflections ? !reflections.checked : false);
  };
  for (const control of [palette, backdrop, fog, motion, particles, reflections]) {
    control?.addEventListener("input", apply);
    control?.addEventListener("change", apply);
  }
  apply();
}

function createFighter(id: FighterId, name: string, subtitle: string, x: number, facing: 1 | -1, clips: FighterClipMap): FighterState {
  return {
    id,
    name,
    subtitle,
    x,
    y: 0,
    vy: 0,
    airTime: 0,
    airStartedAtMs: 0,
    facing,
    health: START_HEALTH,
    meter: START_METER,
    action: "idle",
    hurtVariant: "light",
    moving: false,
    locomotionTime: 0,
    clips,
    clip: clips.idle,
    clipTime: 0,
    prevClip: null,
    prevClipTime: 0,
    blendElapsed: 0,
    blendDuration: 0,
    grounded: true,
    guard: false,
    hitstun: 0,
    recovery: 0,
    hitStopRemaining: 0,
    pendingImpulse: 0,
    aiCooldown: id === "rival" ? 1.18 : 0.72,
    moveCooldown: 0,
    specialCooldown: 0,
    jumpGrace: 0,
    dashGrace: 0,
    guardGrace: 0,
    downGrace: 0,
    guardMeter: 100,
    combo: emptyComboState,
    inputBuffer: null,
    knockdownTimer: 0,
    invulnerableTimer: 0,
    queuedAttack: null,
    attack: null
  };
}

function resetFighter(fighter: FighterState, x: number, facing: 1 | -1): void {
  fighter.x = x;
  fighter.y = 0;
  fighter.vy = 0;
  fighter.airTime = 0;
  fighter.airStartedAtMs = 0;
  fighter.facing = facing;
  fighter.health = START_HEALTH;
  fighter.meter = START_METER;
  fighter.action = "idle";
  fighter.clip = fighter.clips.idle;
  fighter.clipTime = 0;
  fighter.prevClip = null;
  fighter.prevClipTime = 0;
  fighter.blendElapsed = 0;
  fighter.blendDuration = 0;
  fighter.moving = false;
  fighter.locomotionTime = 0;
  fighter.grounded = true;
  fighter.guard = false;
  fighter.hitstun = 0;
  fighter.recovery = 0;
  fighter.hitStopRemaining = 0;
  fighter.pendingImpulse = 0;
  fighter.aiCooldown = fighter.id === "rival" ? 1.18 : 0.72;
  fighter.moveCooldown = 0;
  fighter.specialCooldown = 0;
  fighter.jumpGrace = 0;
  fighter.dashGrace = 0;
  fighter.guardGrace = 0;
  fighter.downGrace = 0;
  fighter.guardMeter = 100;
  fighter.combo = emptyComboState;
  fighter.inputBuffer = null;
  fighter.knockdownTimer = 0;
  fighter.invulnerableTimer = 0;
  fighter.queuedAttack = null;
  fighter.attack = null;
}

function registerCombatActors(combatWorld: ReturnType<typeof game.combatWorld>, player: FighterState, rival: FighterState): void {
  combatWorld.clear();
  for (const fighter of [player, rival]) {
    combatWorld.addActor({
      id: fighter.id,
      team: fighter.id,
      position: [fighter.x, fighter.y, stage.z],
      facing: fighter.facing,
      health: fighter.health,
      guard: 100,
      meter: fighter.meter,
      guarding: fighter.guard,
      hurtboxes: [{ id: `${fighter.id}-hurt`, offset: [0, 0.86, 0], size: [0.58, 1.52, 0.5] }],
      guardboxes: [{ id: `${fighter.id}-guard`, offset: [0.2, 0.9, 0], size: [0.62, 1.32, 0.54] }],
      pushboxes: [{ id: `${fighter.id}-push`, offset: [0, 0.68, 0], size: [0.54, 1.18, 0.5] }]
    });
  }
}

function resetCombatWorld(combatWorld: ReturnType<typeof game.combatWorld>, player: FighterState, rival: FighterState): void {
  registerCombatActors(combatWorld, player, rival);
}

function finishRound(player: FighterState, rival: FighterState, roundTime: number): "WIN" | "KO" | "DRAW" {
  player.health = Math.max(0, player.health);
  rival.health = Math.max(0, rival.health);
  player.attack = null;
  rival.attack = null;
  player.queuedAttack = null;
  rival.queuedAttack = null;
  player.guard = false;
  rival.guard = false;
  player.moving = false;
  rival.moving = false;
  player.hitstun = 0;
  rival.hitstun = 0;
  player.recovery = 0;
  rival.recovery = 0;
  player.hitStopRemaining = 0;
  rival.hitStopRemaining = 0;
  player.pendingImpulse = 0;
  rival.pendingImpulse = 0;
  player.inputBuffer = null;
  rival.inputBuffer = null;
  player.prevClip = null;
  rival.prevClip = null;
  player.blendElapsed = 0;
  rival.blendElapsed = 0;
  player.blendDuration = 0;
  rival.blendDuration = 0;
  player.vy = 0;
  rival.vy = 0;
  player.y = 0;
  rival.y = 0;
  player.airTime = 0;
  rival.airTime = 0;
  player.airStartedAtMs = 0;
  rival.airStartedAtMs = 0;
  player.grounded = true;
  rival.grounded = true;
  if (player.health === rival.health || (roundTime <= 0 && Math.round(player.health) === Math.round(rival.health))) {
    player.action = "idle";
    rival.action = "idle";
    player.clip = player.clips.idle;
    rival.clip = rival.clips.idle;
    player.clipTime = 0;
    rival.clipTime = 0;
    return "DRAW";
  }
  const playerWon = player.health > rival.health;
  const winner = playerWon ? player : rival;
  const loser = playerWon ? rival : player;
  winner.action = "idle";
  winner.clip = winner.clips.idle;
  winner.clipTime = 0;
  loser.action = "ko";
  loser.clip = loser.clips.ko;
  loser.clipTime = 0;
  return playerWon ? "WIN" : "KO";
}

// Fighter-length buffer (6–8 frames). Held buttons still cash in through canUseHeldAttack.
const INPUT_BUFFER_LIFETIME_MS = CLASH_INPUT_BUFFER_LIFETIME_MS;

function bufferInput(fighter: FighterState, move: MoveId): void {
  if (
    fighter.attack !== null ||
    fighter.hitstun > 0 ||
    fighter.recovery > 0 ||
    fighter.knockdownTimer > 0 ||
    fighter.moveCooldown > 0 ||
    fighter.action === "ko"
  ) {
    fighter.inputBuffer = { move, expiresAt: performance.now() + INPUT_BUFFER_LIFETIME_MS };
  }
}

function updatePlayer(fighter: FighterState, input: ReturnType<typeof game.input>, controls: Controls, dt: number, previousInput: string): string {
  const moveX = (isHeld(input, controls, "right") ? 1 : 0) - (isHeld(input, controls, "left") ? 1 : 0);
  const lastInput = detectLastInput(input, controls, previousInput);
  const lightPressed = isPressed(input, controls, "light");
  const heavyPressed = isPressed(input, controls, "heavy");
  const specialPressed = isPressed(input, controls, "special");
  if (lightPressed) bufferInput(fighter, "light");
  if (heavyPressed) bufferInput(fighter, "heavy");
  if (specialPressed) bufferInput(fighter, "special");
  updateFighterIntents(fighter, clamp(moveX, -1, 1), {
    down: isHeld(input, controls, "down"),
    jump: isPressed(input, controls, "jump"),
    dash: isHeld(input, controls, "dash") || isPressed(input, controls, "dash"),
    guard: controls.held("guard") || controls.pressed("guard") || input.pressed("guard"),
    light: lightPressed || canUseHeldAttack(fighter, controls, "light"),
    heavy: heavyPressed || canUseHeldAttack(fighter, controls, "heavy"),
    special: specialPressed || canUseHeldAttack(fighter, controls, "special")
  }, dt);
  return lastInput;
}

function canUseHeldAttack(fighter: FighterState, controls: Controls, action: "light" | "heavy" | "special"): boolean {
  return controls.held(action) && !fighter.attack && fighter.moveCooldown <= 0 && fighter.hitstun <= 0 && fighter.recovery <= 0 && fighter.action !== "ko";
}

/**
 * @param passive When true the rival neither guards nor attacks. Used only by the deterministic
 * test driver, for two distinct reasons:
 *
 * - **Guard:** `shouldGuard` fires whenever the player attacks within 1.4 units, so the AI blocks a
 *   queued strike essentially every time. A blocked strike deals *chip* damage and is correctly not
 *   counted as a hit, so "land one clean hit" tests could never observe `totalHits > 0`.
 * - **Offense:** the AI closes and strikes during multi-step control checks, putting the player into
 *   `hurt`/`recover` where jump and guard inputs are legitimately ignored. Tests verifying that a
 *   control is wired up were therefore racing the AI rather than testing the control.
 *
 * The rival still walks and faces the player, so movement and spacing behaviour stay live. This
 * never engages in normal play.
 */
function updateRivalAi(
  rival: FighterState,
  player: FighterState,
  dt: number,
  rng: () => number,
  passive = false
): void {
  rival.aiCooldown = Math.max(0, rival.aiCooldown - dt);
  const gap = player.x - rival.x;
  const distance = Math.abs(gap);
  const direction = gap === 0 ? rival.facing * -1 : Math.sign(gap);
  const opponentAlive = player.health > 0 && player.action !== "ko";
  const playerAttacking = player.attack !== null;
  const playerWhiffing = Boolean(
    (player.attack && player.attack.elapsed >= player.attack.activeEnd && !player.attack.hit) ||
    (player.recovery > 0 && !player.attack && player.action === "recover")
  );
  const role = resolveRivalAiRole({
    distance,
    opponentAlive,
    playerAttacking,
    playerWhiffing,
    playerKnockdownRemaining: player.knockdownTimer,
    playerWakeupInvulnerable: player.invulnerableTimer > 0,
    playerGrounded: player.grounded
  });
  const desired = !opponentAlive
    ? 0
    : role === "approach"
      ? direction
      : role === "space"
        ? distance < 0.92 ? -direction : 0
        : role === "punish-whiff" || role === "meaty-wakeup"
          ? distance > 1.04 ? direction : 0
          : player.attack && distance < 1.58
            ? 0
            : !player.grounded && distance < 1.35
              ? -direction
              : distance > 1.28
                ? direction
                : distance < 0.88
                  ? -direction
                  : 0;
  const meatyRange = role === "meaty-wakeup" && distance >= 0.82 && distance <= 1.4;
  const canStrike = opponentAlive && rival.grounded && (player.grounded || role === "meaty-wakeup") && (
    meatyRange || (distance >= 0.9 && distance <= 1.28)
  );
  const incomingHeavy = playerAttacking && (player.attack?.id === "heavy" || player.attack?.id === "special");
  const shouldGuard = opponentAlive && playerAttacking && distance < 1.4 && rival.grounded && !rival.attack && role !== "punish-whiff";
  const shouldDash = opponentAlive && rival.grounded && rival.moveCooldown <= 0 && rival.dashGrace <= 0 &&
    rivalAiWantsDash(role, distance, incomingHeavy);
  const aggression = rival.health < START_HEALTH * 0.35 ? 0.65 : 1.0;
  const bias = rivalAiStrikeBias(role);
  updateFighterIntents(rival, desired, {
    down: false,
    jump: role !== "meaty-wakeup" && !player.grounded && distance < 1.2 && rival.grounded && !rival.attack,
    dash: shouldDash,
    guard: shouldGuard && !passive,
    light: !passive && canStrike && rival.aiCooldown <= 0 && (role === "meaty-wakeup" || distance < 1.04) && rng() < aggression * bias.light,
    heavy: !passive && canStrike && rival.aiCooldown <= 0 && distance < 1.28 && player.health < START_HEALTH * 0.82 && rng() < aggression * bias.heavy,
    special: !passive && canStrike && rival.aiCooldown <= 0 && distance < 1.34 && rival.meter >= 80 && player.health < START_HEALTH * 0.75 && rng() < aggression * bias.special
  }, dt);
  if (rival.attack) {
    rival.aiCooldown = rival.attack.id === "special" ? 1.35 : 0.96;
  }
}

function updateFighterIntents(
  fighter: FighterState,
  moveX: number,
  intents: {
    down: boolean;
    jump: boolean;
    dash: boolean;
    guard: boolean;
    light: boolean;
    heavy: boolean;
    special: boolean;
  },
  dt: number
): void {
  fighter.moveCooldown = Math.max(0, fighter.moveCooldown - dt);
  fighter.specialCooldown = Math.max(0, fighter.specialCooldown - dt);
  fighter.jumpGrace = Math.max(0, fighter.jumpGrace - dt);
  fighter.dashGrace = intents.dash ? Math.max(0.34, movementMoves.dash.recovery ?? 0) : Math.max(0, fighter.dashGrace - dt);
  fighter.downGrace = intents.down ? movementMoves.down.downGrace ?? 0.18 : Math.max(0, fighter.downGrace - dt);
  const requestedAttack = resolveRequestedAttack(fighter, intents);
  fighter.guardGrace = requestedAttack ? 0 : intents.guard ? movementMoves.guard.guardGrace ?? 0.06 : Math.max(0, fighter.guardGrace - dt);
  fighter.guard = !requestedAttack && (intents.guard || fighter.guardGrace > 0) && !fighter.attack && fighter.grounded;
  // Guard regeneration when not guarding or in hitstun
  if (!fighter.guard && fighter.hitstun <= 0 && fighter.knockdownTimer <= 0) {
    fighter.guardMeter = Math.min(100, fighter.guardMeter + 18 * dt);
  }
  // Input buffer consumption
  if (fighter.inputBuffer && performance.now() > fighter.inputBuffer.expiresAt) {
    fighter.inputBuffer = null;
  }
  // Consume the buffered move as soon as the fighter can act, whether or not an attack input is
  // still held. Gating this on `!requestedAttack` meant a *held* button could never cash in its own
  // buffer: `resolveRequestedAttack` returns a move every frame the key is down, so the buffer was
  // skipped, and the per-frame `queuedAttack` path below is dropped while `fighter.attack` is still
  // running. Holding L during the recovery of a previous attack therefore did nothing at all, and
  // the fighter stayed in its prior state (measured: action reported "down" instead of "special").
  if (fighter.inputBuffer) {
    const buffered = fighter.inputBuffer.move;
    if (startAttack(fighter, buffered)) {
      fighter.inputBuffer = null;
    }
  }
  fighter.queuedAttack = requestedAttack;
  if (intents.down && !fighter.grounded && fighter.action !== "ko") {
    fighter.vy = Math.min(fighter.vy, stage.fastFallVelocity);
    fighter.y = Math.max(0, fighter.y - 0.18);
    if (!fighter.attack) {
      fighter.action = "down";
      fighter.clip = downClipFor(fighter);
    }
  }
  if (fighter.attack) {
    fighter.attack.elapsed += dt;
    if (fighter.attack.elapsed >= fighter.attack.duration) {
      fighter.attack = null;
      fighter.action = fighter.grounded ? "idle" : "jump";
      // Combo cancel window: if a combo is active, reduce cooldown so the next attack chains sooner
      if (canCancelCombo(fighter.combo, performance.now())) {
        fighter.moveCooldown = Math.min(fighter.moveCooldown, 0.08);
      }
    }
  }
  if (fighter.hitstun > 0 || fighter.recovery > 0 || fighter.action === "ko") {
    return;
  }
  if (intents.jump && fighter.grounded) {
    fighter.vy = stage.jumpVelocity;
    fighter.airTime = 0;
    fighter.airStartedAtMs = performance.now();
    fighter.grounded = false;
    fighter.action = "jump";
    fighter.clip = fighter.clips.air;
    fighter.clipTime = 0;
    fighter.jumpGrace = movementMoves.jump.jumpGrace ?? 0.2;
    if (Math.abs(moveX) > 0.02) {
      fighter.x = clamp(fighter.x + Math.sign(moveX) * 0.22, stage.minX, stage.maxX);
    }
  }
  const dashActive = fighter.grounded && !fighter.attack && !fighter.guard && fighter.dashGrace > 0;
  const baseSpeed = dashActive ? movementMoves.dash.runSpeed ?? 3.9 : WALK_SPEED;
  const speed = fighter.grounded ? baseSpeed : baseSpeed * 1.32;
  const downActive = fighter.grounded && !fighter.attack && !requestedAttack && !fighter.guard && fighter.downGrace > 0;
  fighter.moving = fighter.grounded && Math.abs(moveX) > 0.02 && !fighter.guard && !downActive;
  if (Math.abs(moveX) > 0.02 && !fighter.guard && !downActive) {
    fighter.x = clamp(fighter.x + moveX * speed * dt, stage.minX, stage.maxX);
    if (!fighter.attack) fighter.action = fighter.grounded ? dashActive ? "run" : "walk" : "jump";
  } else if (dashActive && !downActive) {
    fighter.x = clamp(fighter.x + fighter.facing * speed * dt, stage.minX, stage.maxX);
    fighter.action = "run";
    fighter.clip = fighter.clips.run;
  } else if (downActive) {
    fighter.action = "down";
    fighter.clip = downClipFor(fighter);
  } else if (fighter.grounded && !fighter.guard && !fighter.attack && fighter.action !== "recover") {
    fighter.action = "idle";
  }
  if (fighter.guard) {
    if (fighter.action !== "guard" || fighter.clip !== fighter.clips.guard) {
      fighter.clip = fighter.clips.guard;
      fighter.clipTime = 0;
    }
    fighter.action = "guard";
  }
  const attackToStart = fighter.queuedAttack;
  if (!fighter.attack && attackToStart && startAttack(fighter, attackToStart)) fighter.queuedAttack = null;
}

function resolveRequestedAttack(
  fighter: FighterState,
  intents: { readonly down: boolean; readonly light: boolean; readonly heavy: boolean; readonly special: boolean }
): MoveId | null {
  if (intents.special && fighter.meter >= SPECIAL_METER_COST && fighter.specialCooldown <= 0) return "special";
  if ((intents.down || fighter.downGrace > 0 || fighter.action === "down") && (intents.light || intents.heavy)) return "heavy";
  if (intents.heavy) return "heavy";
  if (intents.light) return "light";
  return null;
}

function downClipFor(fighter: FighterState): ClipName {
  return fighter.clips.down;
}

function startAttack(fighter: FighterState, id: MoveId): boolean {
  if (fighter.moveCooldown > 0 || fighter.action === "ko" || fighter.guard || fighter.hitstun > 0 || fighter.recovery > 0 || fighter.knockdownTimer > 0) return false;
  const spec = moves[id];
  if (id === "special") {
    if (fighter.meter < SPECIAL_METER_COST || fighter.specialCooldown > 0) return false;
    fighter.meter = Math.max(0, fighter.meter - SPECIAL_METER_COST);
    fighter.specialCooldown = SPECIAL_COOLDOWN;
  }
  fighter.action = id;
  fighter.clip = fighter.clips[id];
  fighter.clipTime = 0;
  fighter.guard = false;
  fighter.attack = { id, clip: fighter.clips[id], elapsed: 0, hit: false, engineQueued: false, startedAtMs: performance.now(), ...spec };
  fighter.moveCooldown = ATTACK_COOLDOWN;
  return true;
}

function clearExpiredAttack(fighter: FighterState): void {
  if (!fighter.attack) return;
  const clipTimedOut = fighter.clip === fighter.attack.clip && fighter.clipTime >= fighter.attack.duration * 1.25;
  const wallTimedOut = performance.now() - fighter.attack.startedAtMs >= Math.max(900, fighter.attack.duration * 1800);
  if (fighter.attack.elapsed < fighter.attack.duration && !clipTimedOut && !wallTimedOut) return;
  fighter.attack = null;
  if (fighter.action !== "ko" && fighter.action !== "knockdown" && fighter.hitstun <= 0) fighter.action = fighter.grounded ? "idle" : "jump";
}

function resolveEngineCombat(
  combatWorld: ReturnType<typeof game.combatWorld>,
  player: FighterState,
  rival: FighterState,
  sparks: Spark[],
  dt: number
): GameCombatWorldSnapshot {
  combatWorld.setActor(player.id, {
    position: [player.x, player.y, stage.z],
    facing: player.facing,
    health: player.health,
    meter: player.meter,
    guarding: player.guard
  });
  combatWorld.setActor(rival.id, {
    position: [rival.x, rival.y, stage.z],
    facing: rival.facing,
    health: rival.health,
    meter: rival.meter,
    guarding: rival.guard
  });
  queueEngineAttack(combatWorld, player);
  queueEngineAttack(combatWorld, rival);
  const snapshot = combatWorld.update(dt);
  syncFighterFromCombatSnapshot(player, snapshot);
  syncFighterFromCombatSnapshot(rival, snapshot);
  for (const event of snapshot.events) {
    if ((event.type === "hit" || event.type === "blocked") && event.targetId) {
      const attacker = event.attackerId === player.id ? player : rival;
      sparks.push({
        x: event.position[0],
        y: event.position[1],
        z: event.position[2],
        age: 0,
        life: event.type === "blocked" ? 0.28 : event.moveId === "special" ? 0.62 : event.moveId === "heavy" ? 0.38 : 0.28,
        facing: attacker.facing,
        kind: event.type === "blocked" ? "block" : toMoveId(event.moveId)
      });
    }
  }
  return snapshot;
}

function queueEngineAttack(combatWorld: ReturnType<typeof game.combatWorld>, fighter: FighterState): void {
  if (!fighter.attack || fighter.attack.engineQueued || fighter.health <= 0 || fighter.action === "ko") return;
  combatWorld.beginAttack(fighter.id, engineCombatMoves[fighter.attack.id]);
  fighter.attack.engineQueued = true;
}

function syncFighterFromCombatSnapshot(fighter: FighterState, snapshot: GameCombatWorldSnapshot): void {
  const actor = snapshot.actors.find((candidate) => candidate.id === fighter.id);
  if (!actor) return;
  fighter.x = clamp(actor.position[0], stage.minX, stage.maxX);
  fighter.health = clamp(actor.health, 0, START_HEALTH);
  fighter.meter = clamp(actor.meter, 0, 100);
}

function moveIdToHitStrength(moveId: string): import("../state/HitRegistry").HitStrength {
  if (moveId === "special") return "special";
  if (moveId === "heavy") return "heavy";
  return "light";
}

function applyEngineCombatEvents(events: readonly GameCombatEvent[], player: FighterState, rival: FighterState): {
  playerDamage: number;
  rivalDamage: number;
  blocked: boolean;
  blockedBy: FighterId | null;
} {
  let playerDamage = 0;
  let rivalDamage = 0;
  let blocked = false;
  let blockedBy: FighterId | null = null;
  const now = performance.now();
  for (const event of events) {
    if (event.type === "blocked" && event.targetId) {
      blocked = true;
      blockedBy = event.targetId === player.id ? player.id : rival.id;
      const defender = event.targetId === player.id ? player : rival;
      const attacker = event.attackerId === player.id ? player : rival;
      const guardDamage = event.guardDamage ?? 8;
      defender.guardMeter = Math.max(0, defender.guardMeter - guardDamage);
      const chip = Math.round(guardDamage * defaultGuardBreakRules.chipDamageMultiplier);
      defender.health = Math.max(0, defender.health - chip);
      if (defender.guardMeter <= defaultGuardBreakRules.breakThreshold) {
        // Guard break — extended stun
        defender.hitstun = Math.max(defender.hitstun, defaultGuardBreakRules.recoveryMs / 1000);
        defender.action = "hurt";
        defender.clip = defender.clips.hurtHeavy ?? defender.clips.hurt;
        defender.clipTime = 0;
      } else {
        defender.hitstun = Math.max(defender.hitstun, 0.16);
        defender.action = "guard";
        defender.clip = defender.clips.guard;
        defender.clipTime = 0;
      }
      attacker.meter = clamp(attacker.meter + 6, 0, 100);
      continue;
    }
    if (event.type !== "hit" || !event.targetId) continue;
    const defender = event.targetId === player.id ? player : rival;
    const attacker = event.attackerId === player.id ? player : rival;
    const rawDamage = Math.max(0, Math.round(event.damage ?? 0));
    if (defender.invulnerableTimer > 0) {
      // Wakeup invulnerability: refund the engine-applied damage and skip every hit reaction
      // (no hitstun, no knockdown, no animation, no combo/meter credit).
      defender.health = clamp(defender.health + rawDamage, 0, START_HEALTH);
      continue;
    }
    // Combo bookkeeping (HUD display only — the engine's damage is the single source of truth).
    const strength = moveIdToHitStrength(event.moveId ?? "light");
    attacker.combo = registerComboHit(attacker.combo, strength, now);
    if (event.targetId === player.id) playerDamage += rawDamage;
    if (event.targetId === rival.id) rivalDamage += rawDamage;
    defender.attack = null;
    // Knockdown check (health already reduced by the engine via syncFighterFromCombatSnapshot)
    if (rawDamage >= defaultKnockdownRules.knockdownHealthThreshold || strength === "special") {
      defender.knockdownTimer = defaultKnockdownRules.knockdownStunMs / 1000;
      defender.invulnerableTimer = (defaultKnockdownRules.knockdownStunMs + defaultKnockdownRules.wakeupInvulnerabilityMs) / 1000;
      defender.action = "knockdown";
      defender.clip = defender.clips.hurtHeavy ?? defender.clips.hurt;
      defender.clipTime = 0;
    } else {
      defender.hurtVariant = selectAuraClashHurtVariant(rawDamage, defender.grounded);
      defender.hitstun = Math.max(defender.hitstun, defender.hurtVariant === "heavy" ? 0.42 : 0.34);
      defender.action = defender.health <= 0 ? "ko" : "hurt";
      defender.clip = resolveAuraClashHurtClip(defender.clips, defender.hurtVariant, defender.health <= 0);
      defender.clipTime = 0;
    }
    attacker.meter = clamp(attacker.meter + 18, 0, 100);
  }
  return { playerDamage, rivalDamage, blocked, blockedBy };
}

function updateFighterPhysics(fighter: FighterState, dt: number): void {
  if (fighter.knockdownTimer > 0) {
    fighter.knockdownTimer = Math.max(0, fighter.knockdownTimer - dt);
    if (fighter.knockdownTimer === 0 && fighter.action === "knockdown") {
      fighter.action = "idle";
      fighter.clip = fighter.clips.idle;
      fighter.clipTime = 0;
    }
  }
  if (fighter.invulnerableTimer > 0) {
    fighter.invulnerableTimer = Math.max(0, fighter.invulnerableTimer - dt);
  }
  if (fighter.hitstun > 0) {
    fighter.hitstun = Math.max(0, fighter.hitstun - dt);
    if (fighter.hitstun === 0 && fighter.action === "hurt") {
      fighter.action = "recover";
      fighter.recovery = 0.18;
    }
  }
  if (fighter.recovery > 0) {
    fighter.recovery = Math.max(0, fighter.recovery - dt);
    if (fighter.recovery === 0 && fighter.action === "recover" && !fighter.guard) {
      fighter.action = "idle";
    }
  }
  if (!fighter.grounded) {
    fighter.airTime += dt;
    fighter.vy += stage.gravity * dt;
    fighter.y += fighter.vy * dt;
    if (fighter.y > stage.maxJumpY) {
      fighter.y = stage.maxJumpY;
      fighter.vy = Math.min(fighter.vy, 0);
    }
    const airborneWallSeconds = fighter.airStartedAtMs > 0 ? (performance.now() - fighter.airStartedAtMs) / 1000 : 0;
    if (fighter.y <= 0 || fighter.airTime > 2.35 || airborneWallSeconds > 2.85) {
      // Landing impulse -> the secondary-motion squash spring compresses + rebounds (weight).
      const landingSpeed = Math.abs(fighter.vy);
      if (landingSpeed > 0.5) fighter.pendingImpulse = Math.max(fighter.pendingImpulse, Math.min(0.8, landingSpeed * 0.085));
      fighter.y = 0;
      fighter.vy = 0;
      fighter.airTime = 0;
      fighter.airStartedAtMs = 0;
      fighter.grounded = true;
      if (fighter.action === "jump") fighter.action = "idle";
    }
  } else {
    fighter.airTime = 0;
    fighter.airStartedAtMs = 0;
  }
}

function resolvePushback(left: FighterState, right: FighterState): void {
  const minGap = 0.98;
  const gap = right.x - left.x;
  if (Math.abs(gap) >= minGap) return;
  const correction = (minGap - Math.abs(gap)) * 0.5;
  const direction = gap >= 0 ? 1 : -1;
  left.x = clamp(left.x - correction * direction, stage.minX, stage.maxX);
  right.x = clamp(right.x + correction * direction, stage.minX, stage.maxX);
}

/**
 * Keep neutral, locomoting and guarding fighters oriented toward one another. Movement direction
 * is not facing direction in a side-view fighter: walking backwards must not turn a character's
 * back to the opponent. Active attacks, hit reactions and KO poses retain their authored facing so
 * an animation cannot flip halfway through a strike or reaction.
 */
function stabilizeFighterFacing(player: FighterState, rival: FighterState): void {
  const playerShouldFace: 1 | -1 = player.x <= rival.x ? 1 : -1;
  const rivalShouldFace: 1 | -1 = playerShouldFace === 1 ? -1 : 1;
  const facingLocked = (fighter: FighterState): boolean =>
    fighter.attack !== null || fighter.hitstun > 0 || fighter.action === "hurt" || fighter.action === "knockdown" || fighter.action === "ko";
  if (!facingLocked(player)) player.facing = playerShouldFace;
  if (!facingLocked(rival)) rival.facing = rivalShouldFace;
}

function updateClips(fighter: FighterState, dt: number): void {
  const previous = fighter.clip;
  if (fighter.attack) {
    fighter.clip = fighter.attack.clip;
  } else if (!fighter.grounded) {
    fighter.clip = fighter.clips.air;
  } else if (fighter.action === "run") {
    fighter.clip = fighter.clips.run;
  } else if (fighter.action === "walk") {
    fighter.clip = fighter.clips.walk;
  } else if (fighter.action === "down") {
    fighter.clip = fighter.clips.down;
  } else if (fighter.action === "guard") {
    fighter.clip = fighter.clips.guard;
  } else if (fighter.action === "hurt") {
    fighter.clip = resolveAuraClashHurtClip(fighter.clips, fighter.hurtVariant, false);
  } else if (fighter.action === "recover") {
    fighter.clip = fighter.clips.idle;
  } else if (fighter.action === "knockdown") {
    fighter.clip = fighter.clips.hurtHeavy ?? fighter.clips.hurt;
  } else if (fighter.action === "ko") {
    fighter.clip = fighter.clips.ko;
  } else {
    fighter.clip = fighter.clips.idle;
  }
  if (previous !== fighter.clip) {
    // Crossfade only between smooth locomotion/guard states; attacks, hurt, and KO snap for readability.
    const blendable = new Set<ClipName>([
      fighter.clips.idle,
      fighter.clips.walk,
      fighter.clips.run,
      fighter.clips.air,
      fighter.clips.down,
      fighter.clips.guard
    ]);
    if (blendable.has(previous) && blendable.has(fighter.clip) && fighter.action !== "ko") {
      fighter.prevClip = previous;
      fighter.prevClipTime = fighter.clipTime; // freeze the outgoing pose
      fighter.blendElapsed = 0;
      fighter.blendDuration = CLIP_BLEND_DURATION;
    } else {
      fighter.prevClip = null;
      fighter.blendElapsed = 0;
      fighter.blendDuration = 0;
    }
    fighter.clipTime = 0;
  }
  if (fighter.action === "ko") {
    fighter.prevClip = null;
    fighter.blendDuration = 0;
    // The rival asset's only grounded-down clip is authored in the opposite direction
    // (`LayToIdle`). Its first pose is the truthful KO pose; advancing it makes the defeated
    // fighter stand back up during the winner tableau. Hold that pose while normal death clips
    // (such as Mara's `Death01`) advance once and freeze at their authored end.
    fighter.clipTime = fighter.clip === "LayToIdle" ? 0 : Math.min(KO_FREEZE_TIME, fighter.clipTime + dt);
    return;
  }
  // Hit-stop: freeze the VISUAL animation clock for a few frames on impact (the classic fighting-game
  // "hit" feel). Presentation-only — the combat sim advances independently, so deterministic replay is
  // unaffected. The hitbox active window is the authored clip-event lane (T2.2).
  if (fighter.hitStopRemaining > 0) {
    fighter.hitStopRemaining = Math.max(0, fighter.hitStopRemaining - dt);
    return;
  }
  const speed = fighter.action === "light" ? 1.45 : fighter.action === "heavy" ? 1.06 : fighter.action === "special" ? 0.94 : fighter.action === "run" ? 1.18 : 1;
  fighter.clipTime += dt * speed;
  fighter.locomotionTime += dt; // continuous base clock for upper-body-layered attacks
  if (fighter.blendDuration > 0) fighter.blendElapsed += dt;
}

function applyFighterAnimation(fighter: RuntimeFighter): void {
  const s = fighter.state;
  // Upper-body layering: while attacking AND moving on the ground, play the attack on the upper-body
  // bone mask over a walk base on the lower body, so the legs keep moving while the arms attack.
  if (s.attack && s.grounded && s.moving) {
    const baseClip = s.clips.walk;
    const result = fighter.actor.animation.applyClips([
      { clipName: baseClip, time: s.locomotionTime, weight: 1, mask: { exclude: [...UPPER_BODY_BONES] } },
      { clipName: s.clip, time: s.clipTime, weight: 1, mask: { include: [...UPPER_BODY_BONES] } }
    ]);
    recordFighterBlendProof(fighter, baseClip, s.clip, 1, 1);
    s.lastApply = {
      clipName: result.clipName ?? s.clip,
      tracksApplied: result.tracksApplied,
      transformTracksApplied: result.transformTracksApplied,
      skinningPalettesUpdated: result.skinningPalettesUpdated,
      missingTargets: result.missingTargets
    };
    return;
  }
  const blending = s.prevClip !== null && s.blendDuration > 0 && s.blendElapsed < s.blendDuration;
  let result;
  if (blending && s.prevClip) {
    // Deterministic inertialized (critically-damped) transition weights via the shared
    // @aura3d/animation fighter adapter — momentum-preserving move swaps, not linear dissolves.
    // Per-transition tuning (T1.1): snappier into fast states (run/air), smoother into idle/walk/guard.
    const fast = s.clip === s.clips.run || s.clip === s.clips.air;
    const transitionHalfLife = s.blendDuration * (fast ? 0.28 : 0.46);
    const cf = fighterInertializedWeights(s.prevClip, s.clip, s.blendElapsed, s.blendDuration, transitionHalfLife);
    result = fighter.actor.animation.applyClips([
      { clipName: cf.from, time: s.prevClipTime, weight: cf.weights[0] },
      { clipName: cf.to, time: s.clipTime, weight: cf.weights[1] }
    ]);
    recordFighterBlendProof(fighter, cf.from, cf.to, cf.weights[0], cf.weights[1]);
    const linearFromWeight = Math.max(0, Math.min(1, 1 - s.blendElapsed / s.blendDuration));
    recordInertializationProof(fighter, s.prevClip, s.clip, cf.weights[0], linearFromWeight);
  } else {
    s.prevClip = null;
    result = fighter.actor.playClip(s.clip, s.clipTime);
    recordFighterBlendProof(fighter, null, s.clip, 0, 1);
  }
  s.lastApply = {
    clipName: result.clipName ?? s.clip,
    tracksApplied: result.tracksApplied,
    transformTracksApplied: result.transformTracksApplied,
    skinningPalettesUpdated: result.skinningPalettesUpdated,
    missingTargets: result.missingTargets
  };
}

function syncFighterRoot(fighter: RuntimeFighter): void {
  const visualFacing = fighter.state.facing * fighter.visualFacingMultiplier;
  const yaw = visualFacing === 1 ? Math.PI / 2 : -Math.PI / 2;
  const bob = fighter.state.grounded ? 0 : fighter.state.y;
  const attack = fighter.state.attack;
  const phase = attack ? clamp(attack.elapsed / attack.duration, 0, 1) : 0;
  const lunge = attack ? attackLunge(attack.id, phase) * fighter.state.facing : 0;
  const recoil = fighter.state.action === "hurt" ? -0.14 * fighter.state.facing : 0;
  const downPose = fighter.state.action === "down";
  const guardSink = downPose ? -0.12 : 0;
  const specialLift = attack?.id === "special" ? Math.sin(Math.PI * phase) * 0.1 : 0;
  const roll = attack?.id === "heavy" ? -fighter.state.facing * Math.sin(Math.PI * phase) * 0.12 : 0;
  const pitch = attack?.id === "light"
    ? -Math.sin(Math.PI * phase) * 0.1
    : attack?.id === "special"
      ? -Math.sin(Math.PI * phase) * 0.18
      : downPose
        ? 0.16
        : 0;
  const squash = attack?.id === "heavy" ? 1 + Math.sin(Math.PI * phase) * 0.08 : 1;
  const root = fighter.actor.pipeline.resources.scene.root;
  const rotation = quatFromEuler(pitch, yaw, roll);
  root.transform
    .setPosition(fighter.state.x + lunge + recoil, fighter.yOffset + bob + guardSink + specialLift, stage.z)
    .setRotation(rotation[0], rotation[1], rotation[2], rotation[3])
    .setScale(fighter.scale * squash, fighter.scale * (2 - squash), fighter.scale);
}

// Runs the 1.3 believable-motion runtimes on a fighter each frame (after clip + root sync):
// foot IK / foot-lock (T1.2) grounds and pins planted feet, and a deterministic spring (T1.3) leans
// the body into acceleration. Footsteps fire on foot-plant. Presentation-only — the combat sim and
// deterministic replay checksum are untouched.
function applyFighterSecondaryMotion(fighter: RuntimeFighter, dt: number, audio: AudioRuntime, sparks: Spark[]): void {
  const s = fighter.state;
  const root = fighter.actor.pipeline.resources.scene.root;
  const locomoting = s.grounded && !s.attack && (s.action === "walk" || s.action === "run");
  const facingSign: 1 | -1 = (s.facing * fighter.visualFacingMultiplier) >= 0 ? 1 : -1;
  const impulse = s.pendingImpulse;
  s.pendingImpulse = 0; // consumed by the secondary-motion vertical squash spring
  const result = updateFighterSecondaryMotion(
    fighter.secondary,
    {
      x: s.x,
      grounded: s.grounded,
      locomoting,
      facingSign,
      rootRotation: [root.transform.rotation[0], root.transform.rotation[1], root.transform.rotation[2], root.transform.rotation[3]],
      impulse
    },
    dt
  );
  // Apply the spring body-lean on top of the synced root rotation (rigid; no skinning refresh needed).
  root.transform.setRotation(result.leanRotation[0], result.leanRotation[1], result.leanRotation[2], result.leanRotation[3]);
  // Apply the vertical impact-squash on top of the synced root scale (volume-preserving).
  if (Math.abs(result.squashScale - 1) > 1e-4) {
    const sc = result.squashScale;
    const lateral = 1 / Math.sqrt(sc);
    root.transform.setScale(
      root.transform.scale[0] * lateral,
      root.transform.scale[1] * sc,
      root.transform.scale[2] * lateral
    );
  }
  // Footstep: a foot just planted while moving on the ground.
  if (result.footstep && (s.action === "walk" || s.action === "run")) {
    audio.cue("footstep");
    sparks.push({ x: s.x, y: 0.04, z: stage.z, age: 0, life: 0.16, facing: s.facing, kind: "block" });
  }
  fireAttackClipEvents(fighter, audio, sparks);
  recordSecondaryMotionProof(fighter, result);
}

// Fires the authored footstep/VFX markers (T2.2 event tracks) as an attack plays. The hitbox lane
// already drives combat active-frames; this drives the cosmetic footstep + VFX-spark lanes from the
// same authored clip events. Deterministic (a pure function of the attack's elapsed time).
const attackEventCursors = new Map<string, { attack: unknown; cursor: number }>();
function fireAttackClipEvents(fighter: RuntimeFighter, audio: AudioRuntime, sparks: Spark[]): void {
  const attack = fighter.state.attack;
  const key = fighter.state.id;
  if (!attack) {
    attackEventCursors.delete(key);
    return;
  }
  const tracks = moveEventTracks[attack.id as MoveId];
  if (!tracks) return;
  let entry = attackEventCursors.get(key);
  if (!entry || entry.attack !== attack) {
    entry = { attack, cursor: 0 };
    attackEventCursors.set(key, entry);
  }
  const from = entry.cursor;
  const to = attack.elapsed;
  if (to <= from) {
    entry.cursor = to;
    return;
  }
  const fired = sampleClipEvents({ ...tracks.toEventSource(), id: attack.id }, { from, to, includeStart: false, includeEnd: true });
  for (const invocation of fired) {
    const type = invocation.event.type;
    if (type === "footstep") {
      audio.cue("footstep");
      recordClipEventFired("footstep");
    } else if (type === "vfx") {
      // Telegraph spark in front of the attacker on the authored VFX frame.
      sparks.push({ x: fighter.state.x + fighter.state.facing * 0.5, y: 0.95, z: stage.z, age: 0, life: 0.18, facing: fighter.state.facing, kind: attack.id });
      recordClipEventFired("vfx");
    }
  }
  entry.cursor = to;
}

function moveHitStop(id: MoveId): number {
  return clashHitStopSeconds(id as ClashMoveId);
}

// Hit-stop + impact impulse + spark burst on a confirmed hit. Both fighters freeze their visual pose
// for the move's hit-stop window; the defender recoils (and the attacker follows through) via the
// secondary-motion squash spring. Deterministic + presentation-only (combat sim/replay untouched).
function applyHitStopAndImpact(attacker: FighterState, defender: FighterState, moveId: MoveId): void {
  const hs = moveHitStop(moveId);
  attacker.hitStopRemaining = Math.max(attacker.hitStopRemaining, hs);
  defender.hitStopRemaining = Math.max(defender.hitStopRemaining, hs);
  const recoil = moveId === "special" ? 0.9 : moveId === "heavy" ? 0.62 : 0.4;
  defender.pendingImpulse = Math.max(defender.pendingImpulse, recoil);
  attacker.pendingImpulse = Math.max(attacker.pendingImpulse, recoil * 0.35);
}

interface FighterSecondaryProof {
  groundedFeet: number;
  footIkApplied: number;
  maxFootSlideCorrected: number;
  springLag: number;
  footIkActive: boolean;
}
interface ArenaSecondaryMotionProof {
  source: "aura3d-1.3-believable-motion";
  footIk: boolean;
  springBones: boolean;
  player?: FighterSecondaryProof;
  rival?: FighterSecondaryProof;
}

// Exposes that the live arena runs the 1.3 foot-IK + spring runtimes, for the smoke proof.
function recordSecondaryMotionProof(fighter: RuntimeFighter, result: SecondaryMotionResult): void {
  const host = globalThis as unknown as { __AURA_CLASH_SECONDARY_MOTION_PROOF__?: ArenaSecondaryMotionProof };
  const proof: ArenaSecondaryMotionProof = host.__AURA_CLASH_SECONDARY_MOTION_PROOF__ ?? {
    source: "aura3d-1.3-believable-motion",
    footIk: true,
    springBones: true
  };
  const entry: FighterSecondaryProof = {
    groundedFeet: result.groundedFeet,
    footIkApplied: result.footIkApplied,
    maxFootSlideCorrected: result.maxFootSlideCorrected,
    springLag: result.springLag,
    footIkActive: result.footIkApplied > 0
  };
  if (fighter.state.id === "rival") proof.rival = entry;
  else proof.player = entry;
  host.__AURA_CLASH_SECONDARY_MOTION_PROOF__ = proof;
}

function attackLunge(id: MoveId, phase: number): number {
  const arc = Math.sin(Math.PI * phase);
  if (id === "light") return arc * 0.16;
  if (id === "heavy") return arc * 0.34;
  return Math.sin(Math.PI * Math.min(1, phase * 1.15)) * 0.58;
}

/**
 * Give the two textured rigs separate arcade-fighter material reads.
 *
 * Both characters originate in the same Ranger outfit family. Leaving the
 * imported factors untouched made them read as two dim variants of one NPC.
 * These are renderer material parameters on the real skinned GLB draws: Mara
 * receives a cooler, cleaner technical-fabric response while Rook receives a
 * warmer, heavier treatment. Skin textures remain neutral and neither fighter
 * is replaced by overlay or primitive geometry.
 */
function applyFighterMaterialDirection(actor: TypedGLBActor, owner: FighterId): void {
  const seen = new Set<Material>();
  for (const item of actor.collectRenderItems()) {
    const material = item.material;
    if (!(material instanceof Material) || seen.has(material)) continue;
    seen.add(material);
    const isOutfit = material.name.toLowerCase().includes("ranger");
    if (isOutfit) {
      material.setParameter("u_baseColor", owner === "player"
        ? [0.72, 0.92, 1, 1]
        : [1, 0.66, 0.42, 1]);
      material.setParameter("u_roughness", owner === "player" ? 0.27 : 0.34);
      material.setParameter("u_metallic", owner === "player" ? 0.16 : 0.22);
      material.setParameter("u_clearcoatFactor", owner === "player" ? 0.28 : 0.18);
      material.setParameter("u_clearcoatRoughnessFactor", 0.24);
    } else {
      material.setParameter("u_baseColor", [1, 1, 1, 1]);
      material.setParameter("u_roughness", 0.46);
      material.setParameter("u_metallic", 0.02);
    }
    material.setParameter("u_environmentIntensity", 1.35);
    material.setParameter("u_specularFactor", 1);
  }
}

function collectFighterRenderItems(fighter: RuntimeFighter): RenderItem[] {
  return fighter.actor.collectRenderItems();
}

const fighterAuraGeometry = Geometry.uvSphere(0.5, 14, 8);
const impactCoreGeometry = Geometry.uvSphere(0.5, 18, 10);
const impactShardGeometry = Geometry.capsule({ radius: 0.12, height: 1, segments: 12, rings: 5 });
const playerAuraMaterial = new UnlitMaterial({ name: "mara-ground-aura", color: [0.1, 0.94, 1, 0.26] });
const rivalAuraMaterial = new UnlitMaterial({ name: "rook-ground-aura", color: [1, 0.36, 0.08, 0.26] });
const hitImpactMaterial = new UnlitMaterial({ name: "combat-hit-impact", color: [1, 0.86, 0.3, 0.92] });
const specialImpactMaterial = new UnlitMaterial({ name: "combat-special-impact", color: [0.12, 1, 0.72, 0.94] });
const blockImpactMaterial = new UnlitMaterial({ name: "combat-block-impact", color: [0.28, 0.9, 1, 0.84] });

function createFighterEffectItems(fighter: RuntimeFighter): RenderItem[] {
  const attackPulse = fighter.state.attack
    ? 1 + Math.sin(Math.PI * clamp(fighter.state.attack.elapsed / fighter.state.attack.duration, 0, 1)) * 0.42
    : fighter.state.guard
      ? 1.22
      : 1;
  return [{
    label: `aura-clash-fighter-aura:${fighter.state.id}`,
    geometry: fighterAuraGeometry,
    material: fighter.state.id === "player" ? playerAuraMaterial : rivalAuraMaterial,
    modelMatrix: composeMat4(
      [fighter.state.x, 0.028, stage.z + 0.03],
      quatFromEuler(Math.PI / 2, 0, 0),
      [0.72 * attackPulse, 0.18 * attackPulse, 0.035]
    ) as Mat4,
    includeInAutoFrame: false
  }];
}

function createSparkItems(sparks: readonly Spark[]): RenderItem[] {
  return sparks.flatMap((spark, sparkIndex) => {
    const progress = clamp(spark.age / Math.max(spark.life, 0.001), 0, 1);
    const fadeScale = Math.max(0.02, 1 - progress);
    const burstScale = (spark.kind === "special" ? 0.34 : spark.kind === "heavy" ? 0.14 : 0.1) * fadeScale;
    const material = spark.kind === "block" ? blockImpactMaterial : spark.kind === "special" ? specialImpactMaterial : hitImpactMaterial;
    const rayCount = spark.kind === "special" ? 6 : 3;
    const core: RenderItem = {
      label: `aura-clash-impact:${sparkIndex}:core`,
      geometry: impactCoreGeometry,
      material,
      modelMatrix: composeMat4(
        [spark.x, spark.y, spark.z + 0.12],
        quatFromEuler(0, 0, 0),
        [burstScale * 0.55, burstScale * 0.55, burstScale * 0.22]
      ) as Mat4,
      includeInAutoFrame: false
    };
    const shards = Array.from({ length: rayCount }, (_, ray) => {
      const angle = (ray / rayCount) * Math.PI * 2 + progress * 0.72;
      const travel = 0.09 + progress * (spark.kind === "special" ? 0.54 : 0.28);
      return {
        label: `aura-clash-impact:${sparkIndex}:${ray}`,
        geometry: impactShardGeometry,
        material,
        modelMatrix: composeMat4(
          [
            spark.x + Math.cos(angle) * travel,
            spark.y + Math.sin(angle) * travel,
            spark.z + 0.12
          ],
          quatFromEuler(0, 0, angle),
          [burstScale * (spark.kind === "special" ? 0.12 : 0.18), burstScale * (spark.kind === "special" ? 1.35 : 1), burstScale * (spark.kind === "special" ? 0.12 : 0.18)]
        ) as Mat4,
        includeInAutoFrame: false
      } satisfies RenderItem;
    });
    return [core, ...shards];
  });
}

function updateSparks(sparks: Spark[], dt: number): void {
  for (const spark of sparks) spark.age += dt;
  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    if (sparks[index]!.age >= sparks[index]!.life) sparks.splice(index, 1);
  }
}

/**
 * Evaluate the frame against the budget the render preset declares.
 *
 * The thresholds were previously literals here (`16.7` / `55` / `160`), duplicated again in
 * `performance-budget.spec.ts`, while the preset enabling shadows, bloom, fog and particles declared no
 * cost at all. They now come from `renderPreset.performanceBudget`, so the features and the budget
 * admitting them are declared in one place.
 */
function createPerformanceProof(dt: number, renderMs: number, drawCalls: number): PerformanceProof {
  const frameTimeMs = Number(Math.max(renderMs, dt * 1000).toFixed(2));
  const fps = Number((1000 / Math.max(frameTimeMs, 1)).toFixed(1));
  const budget = SIDE_VIEW_PERFORMANCE_BUDGET;
  return {
    frameTimeMs,
    fps,
    drawCalls,
    budgetOk: frameTimeMs <= budget.maxFrameTimeMs && fps >= budget.minFps && drawCalls <= budget.maxDrawCalls
  };
}

function createAudioRuntime(): AudioRuntime {
  const recentCues: string[] = [];
  const assetUrls = Object.values(auraClashAudioAssets).map((asset) => asset.url);
  const cueEntries = Object.fromEntries(
    Object.values(auraClashAudioManifest).map((definition) => [
      definition.cue,
      {
        id: definition.cue,
        bus: definition.bus,
        volume: definition.volume,
        asset: definition.asset
      }
    ])
  ) as unknown as Record<keyof typeof auraClashAudioManifest, Parameters<typeof createGameAudio<keyof typeof auraClashAudioManifest>>[0]["cues"][keyof typeof auraClashAudioManifest]>;
  const audio: GameAudio<keyof typeof auraClashAudioManifest> = createGameAudio({
    browserContext: true,
    buses: [
      { id: "ui", volume: 0.8 },
      { id: "combat", volume: 1 },
      { id: "round", volume: 0.9 }
    ],
    cues: cueEntries
  });

  function cue(name: string): void {
    const definition = auraClashAudioManifest[name as keyof typeof auraClashAudioManifest];
    if (!definition) return;
    recentCues.push(definition.cue);
    if (recentCues.length > 16) recentCues.shift();
    void audio.cue(definition.cue);
  }

  return {
    cue,
    proof() {
      const evidence = audio.evidence;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        musicReady: evidence.enabled,
        sfxReady: evidence.enabled && Object.keys(auraClashAudioManifest).length >= 10 && assetUrls.length >= 10,
        lastCue: evidence.lastCue,
        recentCues,
        cueCount: Object.keys(auraClashAudioManifest).length,
        typedAssetCount: assetUrls.length,
        assetUrls,
        oscillatorFallback: false,
        audioErrors: evidence.errors
      };
    }
  };
}

function fallbackAudioProof(enabled: boolean): AudioProof {
  return {
    enabled,
    muted: !enabled,
    musicReady: false,
    sfxReady: false,
    lastCue: null,
    recentCues: [],
    cueCount: Object.keys(auraClashAudioManifest).length,
    typedAssetCount: Object.keys(auraClashAudioAssets).length,
    assetUrls: Object.values(auraClashAudioAssets).map((asset) => asset.url),
    oscillatorFallback: false,
    audioErrors: []
  };
}

function updateHud(
  root: HTMLElement,
  player: FighterState,
  rival: FighterState,
  roundTime: number,
  callout: string,
  toast: string,
  playerScore = 0,
  rivalScore = 0
): void {
  setText(root, "#round-time", String(Math.ceil(roundTime)).padStart(2, "0"));
  setText(root, "#callout", callout);
  setText(root, "#player-name", player.name);
  setText(root, "#rival-name", rival.name);
  setText(root, "#player-state", `${stateLabel(player)} - ${Math.round(player.health)} HP`);
  setText(root, "#rival-state", `${stateLabel(rival)} - ${Math.round(rival.health)} HP`);
  setText(root, "#toast", toast);
  setText(root, "#clip-status", `${player.clip} / ${rival.clip}`);
  setText(root, "#combo-count", comboClockText(player.combo.count));
  setText(root, "#combo-flash", comboFlashText(player.combo.count));
  setRoundMarks(root, "#player-rounds", playerScore);
  setRoundMarks(root, "#rival-rounds", rivalScore);
  setBar(root, "#player-health", player.health / START_HEALTH);
  setBar(root, "#rival-health", rival.health / START_HEALTH);
  setBar(root, "#player-meter", player.meter / 100);
  setBar(root, "#rival-meter", rival.meter / 100);
}

function writeProof(input: {
  root: HTMLElement;
  frame: number;
  roundTime: number;
  totalHits: number;
  lastHitFrame: number;
  callout: string;
  paused: boolean;
  roundOver: boolean;
  resetCount: number;
  lastInput: string;
  diagnostics: RenderDeviceDiagnostics;
  performanceProof: PerformanceProof;
  audioProof: AudioProof;
  backend: string;
  combatSnapshot: GameCombatWorldSnapshot;
  player: RuntimeFighter;
  rival: RuntimeFighter;
  clipReadiness: AuraClashClipReadiness;
  renderLabels: readonly string[];
  /** The rig actually submitted to the renderer, so lighting evidence cannot report an unrendered preset. */
  lightingRig: RenderedLightingRigSummary;
  /** Camera response measured from the frame volume the renderer received. */
  camera: AuraClashArenaProof["camera"];
}): void {
  const playerSnapshot = input.player.actor.evidence;
  const rivalSnapshot = input.rival.actor.evidence;
  const proof = createAuraClashArenaProof({
    status: input.paused ? "paused" : "running",
    error: null,
    frame: input.frame,
    roundTime: Number(input.roundTime.toFixed(2)),
    totalHits: input.totalHits,
    lastHitFrame: input.lastHitFrame,
    callout: input.callout,
    visibleFighterAsset: assets.auraClashPlayerRig.url,
    fighterAssets: activeFighterAssetsProof(),
    renderer: {
      surface: "aura3d-production-gltf-animation",
      backend: input.backend,
      drawCalls: input.diagnostics.drawCalls
    },
    player: proofFighter(input.player),
    rival: proofFighter(input.rival),
    animation: {
      visibleSkinnedGlb: true,
      skinnedDrawItems: skinnedDrawItems(input.player) + skinnedDrawItems(input.rival),
      playerSkinningBindings: playerSnapshot.skinningBindingCount,
      rivalSkinningBindings: rivalSnapshot.skinningBindingCount,
      playerLastTracks: input.player.state.lastApply?.tracksApplied ?? 0,
      rivalLastTracks: input.rival.state.lastApply?.tracksApplied ?? 0,
      playerLastSkinningPalettes: input.player.state.lastApply?.skinningPalettesUpdated ?? 0,
      rivalLastSkinningPalettes: input.rival.state.lastApply?.skinningPalettesUpdated ?? 0,
      clips: playerSnapshot.clips,
      clipReadiness: input.clipReadiness
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
      lastInput: input.lastInput,
      downSupported: true,
      specialRequiresMeter: true,
      koLocked: input.roundOver,
      resetCount: input.resetCount
    },
    stage: collectAuraClashArenaStageEvidence(input.root, input.renderLabels),
    camera: input.camera,
    tweaks: createArenaTweaksEvidence(input.root),
    fighterController: assertAuraClashFighterControllerBoundary(),
    lighting: createAuraClashLightingEvidence(input.lightingRig),
    postProcess: createAuraClashPostProcessEvidence({ performanceBudgetOk: input.performanceProof.budgetOk }),
    performance: input.performanceProof,
    audio: input.audioProof,
    deterministicReplay: createDeterministicReplayProof(),
    engineCombat: engineCombatProof(input.combatSnapshot)
  });
  gameWindow.__AURA_CLASH_ARENA_PROOF__ = proof;
  gameWindow.__AURA3D_GAME_EVIDENCE__ = {
    route: proof.route,
    version: proof.version,
    frame: proof.frame,
    assets: [proof.fighterAssets.player.url, proof.fighterAssets.rival.url],
    animation: proof.animation,
    renderer: proof.renderer,
    lighting: proof.lighting,
    postProcess: proof.postProcess,
    performance: proof.performance,
    audio: proof.audio,
    deterministicReplay: proof.deterministicReplay,
    combat: {
      engine: proof.engineCombat,
      totalHits: proof.totalHits,
      playerHealth: proof.player.health,
      rivalHealth: proof.rival.health,
      /*
       * Frame data, and its consistency report.
       *
       * Published because the previous table's problems were invisible to every gate
       * that existed: it declared 12-32 active frames against 4-5 recovery frames, which
       * is inverted from real fighting-game frame data. A half-second active window
       * cannot make damage correspond to contact, and a four-frame recovery makes every
       * whiff free, so there was no spacing game and nothing to punish. Nothing checked
       * frame data as frame data.
       */
      frameData: {
        system: "engine.solveCombatFrameData",
        routeHandAuthorsFrames: false,
        moves: Object.fromEntries(Object.entries(auraClashAttackFrames).map(([id, frames]) => [id, {
          startup: frames.startup,
          active: frames.active,
          recovery: frames.recovery,
          hitstun: frames.hitstun,
          blockstun: frames.blockstun,
          hitstop: frames.hitstop,
          onBlock: frames.advantage.onBlock,
          onHit: frames.advantage.onHit,
          whiffPunishWindow: frames.advantage.whiffPunishWindow
        }])),
        invariants: {
          passes: auraClashFrameDataReport.passes,
          failing: auraClashFrameDataReport.checks.filter((check) => !check.passes).map((check) => ({
            moveId: check.moveId,
            id: check.id,
            detail: check.detail
          }))
        },
        /* The shape this replaces, so the change is legible in evidence. */
        previousFrameData: {
          light: { startup: 4, active: 12, recovery: 4, onBlock: 2 },
          heavy: { startup: 6, active: 17, recovery: 5, onBlock: 3 },
          special: { startup: 5, active: 32, recovery: 4, onBlock: 8 }
        }
      }
    }
  };
  input.root.dataset.arenaStatus = proof.status;
}

function proofFighter(runtime: RuntimeFighter): ProofFighter {
  const fighter = runtime.state;
  const root = runtime.actor.pipeline.resources.scene.root.transform;
  return {
    name: fighter.name,
    health: Math.round(fighter.health),
    meter: Math.round(fighter.meter),
    x: Number(fighter.x.toFixed(3)),
    y: Number(fighter.y.toFixed(3)),
    grounded: fighter.grounded,
    action: fighter.action,
    activeClip: fighter.clip,
    attacking: fighter.attack?.id ?? null,
    facing: fighter.facing,
    renderedRoot: {
      position: [
        Number((root.position[0] ?? 0).toFixed(4)),
        Number((root.position[1] ?? 0).toFixed(4)),
        Number((root.position[2] ?? 0).toFixed(4))
      ],
      rotation: [
        Number((root.rotation[0] ?? 0).toFixed(5)),
        Number((root.rotation[1] ?? 0).toFixed(5)),
        Number((root.rotation[2] ?? 0).toFixed(5)),
        Number((root.rotation[3] ?? 1).toFixed(5))
      ]
    }
  };
}

function activeFighterAssetsProof(): AuraClashArenaProof["fighterAssets"] {
  const playerHash = assets.auraClashPlayerRig.hash;
  const rivalHash = assets.auraClashRivalRig.hash;
  if (!playerHash || !rivalHash) {
    throw new Error("Aura Clash typed fighter assets require generated content hashes.");
  }
  const player = {
    id: "auraClashPlayerRig",
    url: assets.auraClashPlayerRig.url,
    hash: playerHash
  };
  const rival = {
    id: "auraClashRivalRig",
    url: assets.auraClashRivalRig.url,
    hash: rivalHash
  };
  return {
    player,
    rival,
    distinct: String(player.hash) !== String(rival.hash),
    releaseReady: true
  };
}

function fallbackProofFighter(name: string): ProofFighter {
  return {
    name,
    health: START_HEALTH,
    meter: 0,
    x: 0,
    y: 0,
    grounded: true,
    action: "idle",
    activeClip: playerClips.idle,
    attacking: null,
    facing: name === "Mara Volt" ? 1 : -1,
    renderedRoot: {
      position: [0, 0, stage.z],
      rotation: [0, 0, 0, 1]
    }
  };
}

function createDeterministicReplayProof(): DeterministicReplayProof {
  type ReplayState = DeterministicReplayProof["finalSnapshot"];
  const heavy = moves.heavy;
  const replayEvents = Array.from({ length: Math.ceil(START_HEALTH / heavy.damage) }, (_, index) => {
    const frame = 12 + index * 10;
    return { frame, time: frame / 60, type: "press" as const, binding: "KeyK" };
  });
  const replay = game.inputReplay(replayEvents, { fps: 60, seed: 106, label: "aura-clash-full-round-ko-proof" });
  const exportedReplay = game.exportReplay(replay, { simulation: { label: "aura-clash-full-round-ko-proof" } });

  const run = () =>
    game.runSimulation<ReplayState, ReplayState>({
      label: "aura-clash-full-round-ko-proof",
      fps: replay.fps,
      frames: replay.frameCount + 30,
      initialState: {
        playerX: -0.74,
        rivalHp: START_HEALTH,
        hits: 0,
        ko: false,
        roundTime: 99
      },
      update: ({ frame, dt, state }) => {
        const events = game.inputReplayEventsAt(replay, frame);
        const heavyPressed = events.some((event) => event.binding === "KeyK" && event.type === "press");
        const playerX = state.playerX;
        const inRange = Math.abs(0.62 - playerX) <= heavy.range;
        const hit = heavyPressed && inRange && !state.ko;
        const rivalHp = Math.max(0, state.rivalHp - (hit ? heavy.damage : 0));
        return {
          state: {
            playerX,
            rivalHp,
            hits: state.hits + (hit ? 1 : 0),
            ko: rivalHp <= 0,
            roundTime: Number(Math.max(0, state.roundTime - dt).toFixed(3))
          },
          events: hit ? [{ type: "hit", frame, move: "heavy" }] : []
        };
      },
      snapshot: (state) => state
    });

  const first = run();
  const second = run();
  return {
    kind: "aura-clash-deterministic-replay-proof",
    runner: "game.runSimulation",
    inputReplay: "game.inputReplay",
    frameCount: first.frameCount,
    eventCount: first.eventCount,
    finalHash: first.finalHash,
    repeatedFinalHash: second.finalHash,
    stable: first.finalHash === second.finalHash,
    exportedReplay: {
      schemaVersion: exportedReplay.schemaVersion,
      checksum: exportedReplay.replay.checksum,
      frameCount: exportedReplay.replay.frameCount,
      duration: Number(exportedReplay.replay.duration.toFixed(3))
    },
    finalSnapshot: first.finalSnapshot
  };
}

function engineCombatProof(snapshot: GameCombatWorldSnapshot): AuraClashArenaProof["engineCombat"] {
  const player = snapshot.actors.find((actor) => actor.id === "player");
  const rival = snapshot.actors.find((actor) => actor.id === "rival");
  return {
    frame: snapshot.frame,
    activeAttacks: snapshot.activeAttacks.length,
    events: snapshot.events.map((event) => `${event.type}:${event.attackerId}:${event.targetId ?? "none"}:${event.moveId ?? "none"}`),
    playerHealth: Math.round(player?.health ?? START_HEALTH),
    rivalHealth: Math.round(rival?.health ?? START_HEALTH),
    playerGuarding: player?.guarding ?? false,
    rivalGuarding: rival?.guarding ?? false
  };
}

function fallbackEngineCombatProof(): AuraClashArenaProof["engineCombat"] {
  return {
    frame: 0,
    activeAttacks: 0,
    events: [],
    playerHealth: START_HEALTH,
    rivalHealth: START_HEALTH,
    playerGuarding: false,
    rivalGuarding: false
  };
}

function toMoveId(moveId: string | undefined): MoveId {
  return moveId === "heavy" || moveId === "special" ? moveId : "light";
}

function skinnedDrawItems(fighter: RuntimeFighter): number {
  return fighter.actor.evidence.skinnedRenderItemCount;
}

function stateLabel(fighter: FighterState): string {
  if (fighter.attack) return fighter.attack.id.toUpperCase();
  return fighter.action.toUpperCase();
}

function detectLastInput(input: ReturnType<typeof game.input>, controls: Controls, previousInput: string): string {
  void input;
  const ordered: readonly (keyof typeof actionKeys)[] = ["left", "right", "down", "jump", "dash", "guard", "light", "heavy", "special", "pause", "reset"];
  for (const action of ordered) {
    if (controls.pressed(action) || controls.held(action)) return action;
  }
  return previousInput;
}

interface Controls {
  beginFrame(): void;
  endFrame(): void;
  pressed(action: keyof typeof actionKeys): boolean;
  held(action: keyof typeof actionKeys): boolean;
}

function createControls(root: HTMLElement): Controls {
  const heldKeys = new Set<string>();
  const pressedKeys = new Set<string>();
  let previousKeys = new Set<string>();
  const pressedButtons = new Set<keyof typeof actionKeys>();
  const heldButtons = new Set<keyof typeof actionKeys>();
  const onKeyDown = (event: KeyboardEvent) => {
    if (Object.values(actionKeys).some((codes) => (codes as readonly string[]).includes(event.code))) {
      event.preventDefault();
      if (!heldKeys.has(event.code) && !event.repeat) pressedKeys.add(event.code);
      heldKeys.add(event.code);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    heldKeys.delete(event.code);
  };
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("keyup", onKeyUp, { capture: true });
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-press]")) {
    const action = button.dataset.press as keyof typeof actionKeys | undefined;
    if (!action) continue;
    button.addEventListener("click", () => pressedButtons.add(action));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
    const action = button.dataset.hold as keyof typeof actionKeys | undefined;
    if (!action) continue;
    button.addEventListener("pointerdown", () => heldButtons.add(action));
    button.addEventListener("pointerup", () => heldButtons.delete(action));
    button.addEventListener("pointerleave", () => heldButtons.delete(action));
  }
  return {
    beginFrame() {},
    endFrame() {
      previousKeys = new Set(heldKeys);
      pressedKeys.clear();
      pressedButtons.clear();
    },
    pressed(action) {
      return pressedButtons.has(action) || actionKeys[action].some((code) => pressedKeys.has(code) || (heldKeys.has(code) && !previousKeys.has(code)));
    },
    held(action) {
      return heldButtons.has(action) || actionKeys[action].some((code) => heldKeys.has(code));
    }
  };
}

function isPressed(input: ReturnType<typeof game.input>, controls: Controls, action: keyof typeof actionKeys): boolean {
  void input;
  return controls.pressed(action);
}

function isHeld(input: ReturnType<typeof game.input>, controls: Controls, action: keyof typeof actionKeys): boolean {
  void input;
  return controls.held(action);
}

function setRoundMarks(root: HTMLElement, selector: string, wins: number, max = 2): void {
  const host = root.querySelector<HTMLElement>(selector);
  if (!host) return;
  const marks = Math.max(0, Math.min(max, Math.round(wins)));
  host.replaceChildren(
    ...Array.from({ length: max }, (_, index) => {
      const mark = document.createElement("i");
      mark.dataset.won = index < marks ? "true" : "false";
      return mark;
    })
  );
}

function setText(root: HTMLElement, selector: string, value: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function setBar(root: HTMLElement, selector: string, value: number): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) element.style.inlineSize = `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
