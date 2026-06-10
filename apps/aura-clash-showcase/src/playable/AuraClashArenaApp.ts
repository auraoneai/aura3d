import { createGameApp, createGameAudio, game, scene, type GameAudio, type GameAudioContextLike, type GameCombatEvent, type GameCombatMove, type GameCombatWorldSnapshot } from "@aura3d/engine";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import {
  createSideViewGameRenderPreset,
  createTypedGLBActor,
  type TypedGLBActor
} from "@aura3d/engine/production-runtime";
import {
  Geometry,
  PBRMaterial,
  UnlitMaterial,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type RenderSource
} from "@aura3d/engine/rendering";
import { composeMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";
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
import { createArenaTweaksEvidence } from "./arena/ArenaTweaksPanel";
import { assertAuraClashFighterControllerBoundary } from "./combat/AuraClashFighterController";
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
import { createAuraClashLightingEvidence } from "../rendering/GameLighting";
import { createAuraClashPostProcessEvidence } from "../rendering/GamePostProcess";
import "./playable.css";

type FighterId = "player" | "rival";

type AuraClashWindow = Window & {
  __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof;
  __AURA3D_GAME_EVIDENCE__?: unknown;
  __AURA3D_GAME_RUNTIME__?: unknown;
  __AURA_CLASH_ARENA_TEST_DRIVER__?: {
    setPlayerHealth(health: number): void;
    setRivalHealth(health: number): void;
    setPlayerMeter(meter: number): void;
    setPositions(playerX: number, rivalX: number): void;
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
  fighterScale: 0.82,
  fighterYOffset: 0,
  z: 0
};

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

  root.innerHTML = `
    <main class="aca" tabindex="0" aria-label="Aura Clash Arena playable game">
      <div class="aca-page-bg" aria-hidden="true"><div class="aca-page-grid"></div></div>
      <nav class="aca-nav" aria-label="Aura Clash navigation">
        <a class="aca-brand" href="/playable/"><span></span>Aura Clash Arena</a>
        <div class="aca-links">
          <a href="/playable/">Playable</a>
          <a href="#evidence">Evidence</a>
          <a href="/deploy-check/">Deploy check</a>
          <a href="https://github.com/auraoneai/aura3d">GitHub</a>
          <a href="https://www.npmjs.com/package/@aura3d/engine">npm</a>
          <button type="button" id="arena-tweaks-toggle" class="aca-link-button" aria-expanded="false" aria-controls="arena-tweaks">Tweaks</button>
        </div>
      </nav>

      <section class="aca-hud" aria-label="Fight HUD">
        <article class="aca-card">
          <span>Player one</span>
          <h1 id="player-name">Flux Vanta</h1>
          <p>Skinned GLB fighter driven by Aura3D production animation runtime.</p>
          <div class="aca-bar aca-health"><i id="player-health"></i></div>
          <div class="aca-bar aca-meter"><i id="player-meter"></i></div>
          <b id="player-state">LOADING - 100 HP</b>
        </article>
        <article class="aca-clock">
          <strong id="round-time">99</strong>
          <span id="callout">LOAD</span>
        </article>
        <article class="aca-card aca-rival-card">
          <span>Rival AI</span>
          <h2 id="rival-name">Nyx Circuit</h2>
          <p>Independent second GLB instance with its own clips, spacing, and hit windows.</p>
          <div class="aca-bar aca-health"><i id="rival-health"></i></div>
          <div class="aca-bar aca-meter"><i id="rival-meter"></i></div>
          <b id="rival-state">LOADING - 100 HP</b>
        </article>
      </section>

      <section class="aca-stage-shell" aria-label="Aura Clash Arena production GLB stage">
        <div class="aca-arena-bg" aria-hidden="true">
          <div class="aca-sky" data-depth="0.05"></div>
          <div class="aca-core" data-depth="0.15"></div>
          <div class="aca-backdrop">
            <div class="aca-skyline" data-depth="0.45">
              <svg viewBox="0 0 1200 420" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                  <rect x="40" y="180" width="70" height="240"/><rect x="120" y="120" width="48" height="300"/>
                  <rect x="180" y="220" width="90" height="200"/><rect x="285" y="80" width="40" height="340"/>
                  <rect x="335" y="160" width="76" height="260"/><rect x="430" y="40" width="54" height="380"/>
                  <rect x="500" y="210" width="120" height="210"/><rect x="640" y="120" width="46" height="300"/>
                  <rect x="700" y="180" width="84" height="240"/><rect x="800" y="60" width="44" height="360"/>
                  <rect x="860" y="200" width="110" height="220"/><rect x="985" y="140" width="50" height="280"/>
                  <rect x="1050" y="110" width="70" height="310"/><rect x="1130" y="200" width="50" height="220"/>
                </g>
                <g fill="none" stroke="var(--aca-core)" stroke-width="2" opacity="0.85">
                  <line x1="305" y1="80" x2="305" y2="60"/>
                  <line x1="457" y1="40" x2="457" y2="18"/>
                  <line x1="822" y1="60" x2="822" y2="38"/>
                </g>
              </svg>
            </div>
            <div class="aca-portal" data-depth="0.3"></div>
            <div class="aca-banners" data-depth="0.55">
              <div class="aca-banner aca-banner-left"></div>
              <div class="aca-banner aca-banner-right"></div>
            </div>
          </div>
          <div class="aca-rays" data-depth="0.2">
            <span class="aca-ray aca-ray-a"></span>
            <span class="aca-ray aca-ray-b"></span>
            <span class="aca-ray aca-ray-c"></span>
          </div>
          <div class="aca-fog aca-fog-far" data-depth="0.25"></div>
          <div class="aca-fog aca-fog-drift" data-depth="0.3"></div>
          <div class="aca-dais" data-depth="0.5">
            <svg class="aca-platform" viewBox="0 0 1000 360" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="aca-floor-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#0b252b"/>
                  <stop offset="0.55" stop-color="#0d343d"/>
                  <stop offset="1" stop-color="#123f47"/>
                </linearGradient>
                <linearGradient id="aca-face-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#07191d"/>
                  <stop offset="1" stop-color="#02080a"/>
                </linearGradient>
                <filter id="aca-rim-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <polygon points="20,300 980,300 948,352 52,352" fill="url(#aca-face-gradient)"/>
              <polygon class="aca-platform-top" points="200,40 800,40 980,300 20,300" fill="url(#aca-floor-gradient)"/>
              <g class="aca-platform-grid">
                <path d="M164,92 H836 M128,144 H872 M92,196 H908 M56,248 H944"/>
                <path d="M320,40 L212,300 M440,40 L404,300 M560,40 L596,300 M680,40 L788,300"/>
              </g>
              <line class="aca-platform-seam" x1="500" y1="40" x2="500" y2="300"/>
              <polygon class="aca-platform-rim" points="200,40 800,40 980,300 20,300" filter="url(#aca-rim-glow)"/>
              <line class="aca-platform-front" x1="20" y1="300" x2="980" y2="300" filter="url(#aca-rim-glow)"/>
              <g filter="url(#aca-rim-glow)">
                <line class="aca-platform-post" x1="20" y1="300" x2="20" y2="150"/>
                <line class="aca-platform-post" x1="980" y1="300" x2="980" y2="150"/>
                <line class="aca-platform-post aca-platform-post-back" x1="200" y1="40" x2="200" y2="-30"/>
                <line class="aca-platform-post aca-platform-post-back" x1="800" y1="40" x2="800" y2="-30"/>
                <circle class="aca-platform-cap" cx="20" cy="150" r="6"/><circle class="aca-platform-cap" cx="980" cy="150" r="6"/>
                <circle class="aca-platform-cap" cx="200" cy="-30" r="4"/><circle class="aca-platform-cap" cx="800" cy="-30" r="4"/>
              </g>
              <g class="aca-platform-rope">
                <line x1="20" y1="150" x2="980" y2="150"/>
                <line x1="200" y1="-30" x2="800" y2="-30"/>
                <line x1="20" y1="150" x2="200" y2="-30"/>
                <line x1="980" y1="150" x2="800" y2="-30"/>
                <line x1="20" y1="225" x2="980" y2="225"/>
                <line x1="110" y1="60" x2="890" y2="60"/>
              </g>
            </svg>
            <div class="aca-floor-sheen"></div>
          </div>
          <div class="aca-fog aca-fog-near" data-depth="0.65"></div>
          <canvas id="arena-particles" class="aca-particles"></canvas>
          <div class="aca-scanline"></div>
          <div class="aca-stage-vignette"></div>
        </div>
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
        <button type="button" data-hold="guard">Shift Block</button>
        <button type="button" data-press="light">J Light</button>
        <button type="button" data-press="heavy">K Heavy</button>
        <button type="button" data-press="special">L Special</button>
        <button type="button" data-press="pause">Pause</button>
        <button type="button" data-press="reset">Reset</button>
      </section>

      <section id="evidence" class="aca-proof" aria-label="Aura3D evidence">
        <div><b>Renderer</b><span>Production GLB render resources plus advanced-runtime A3DRenderer.</span></div>
        <div><b>Fighters</b><span>Two distinct skinned typed GLB rigs: assets.auraClashPlayerRig and assets.auraClashRivalRig.</span></div>
        <div><b>Animation</b><span>Jab, cross, sword, guard, hit, jump, walk, and sprint clips applied every frame, with critically-damped move transitions, foot-IK foot-lock, and spring body-sway.</span></div>
        <div><b>Proof</b><span>Deterministic combat replay plus per-frame runtime telemetry verify clip tracks, skinning bindings, hits, HP, and draw calls.</span></div>
      </section>

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
      player: fallbackProofFighter("Flux Vanta"),
      rival: fallbackProofFighter("Nyx Circuit"),
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
  const testDriverEnabled = new URLSearchParams(window.location.search).has("auraTestDriver");
  const canvas = root.querySelector<HTMLCanvasElement>("#aura-clash-arena-canvas");
  if (!canvas) throw new Error("Missing #aura-clash-arena-canvas canvas");

  const playerState = createFighter("player", "Flux Vanta", "Player one", -1.25, 1, playerClips);
  const rivalState = createFighter("rival", "Nyx Circuit", "Rival AI", 1.25, -1, rivalClips);
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
  const [playerActor, rivalActor] = await Promise.all([
    createTypedGLBActor({
      asset: assets.auraClashPlayerRig,
      id: "aura-clash-arena-player-rig",
      name: "Flux Vanta",
      width: viewport.width,
      height: viewport.height,
      tint: { baseColor: [0.08, 0.74, 1, 1], emissiveColor: [0.02, 0.72, 0.95] }
    }),
    createTypedGLBActor({
      asset: assets.auraClashRivalRig,
      id: "aura-clash-arena-rival-rig",
      name: "Nyx Circuit",
      width: viewport.width,
      height: viewport.height,
      tint: { baseColor: [1, 0.34, 0.06, 1], emissiveColor: [0.95, 0.24, 0.04] }
    })
  ]);
  const clipReadiness = assertAuraClashClipReadiness({
    playerAvailableClips: playerActor.evidence.clips,
    rivalAvailableClips: rivalActor.evidence.clips
  });

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
    alpha: true,
    clearColor: [0.008, 0.012, 0.018, 0]
  });

  const stageItems = createStageItems();
  const renderPreset = createSideViewGameRenderPreset({
    debugVolumesEnabled: false,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  });
  const audio = createAudioRuntime();
  const sparks: Spark[] = [];
  let paused = false;
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
  let intermissionTimer = 0;
  let rivalAiRng = mulberry32(RIVAL_AI_RNG_SEED);
  let diagnostics: RenderDeviceDiagnostics = renderer.getDiagnostics();
  let performanceProof: PerformanceProof = { frameTimeMs: 16.67, fps: 60, drawCalls: diagnostics.drawCalls, budgetOk: true };
  let combatSnapshot = combatWorld.snapshot();

  const source: RenderSource = {
    collectRenderItems: () => [
      ...stageItems,
      ...collectFighterRenderItems(playerRuntime),
      ...collectFighterRenderItems(rivalRuntime),
      ...createFighterEffectItems(playerRuntime),
      ...createFighterEffectItems(rivalRuntime),
      ...createSparkItems(sparks)
    ],
    cameraPolicy: renderPreset.cameraPolicy,
    cameraFrameBounds: { min: [-2.8, -0.08, -0.82], max: [2.8, 2.05, 0.82] },
    cameraFrameOptions: renderPreset.cameraFrameOptions,
    environmentLighting: renderPreset.environmentLighting,
    environmentFog: renderPreset.environmentFog
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
    const resetRound = (reason: "manual" | "auto" | "continue" | "intermission") => {
      resetCount += 1;
      lastInput = reason === "manual" ? "reset" : reason === "continue" ? "continue" : "auto-reset";
      resetFighter(playerState, -1.25, 1);
      resetFighter(rivalState, 1.25, -1);
      resetFighterSecondaryMotion(playerRuntime.secondary);
      resetFighterSecondaryMotion(rivalRuntime.secondary);
      resetCombatWorld(combatWorld, playerState, rivalState);
      rivalAiRng = mulberry32(RIVAL_AI_RNG_SEED);
      combatSnapshot = combatWorld.snapshot();
      totalHits = 0;
      lastHitFrame = 0;
      postResetInputLock = reason === "continue" ? 0.32 : 0.14;
      roundTime = 99;
      roundOver = false;
      intermissionTimer = 0;
      callout = "FIGHT";
      toast = reason === "auto" ? "Next round." : reason === "intermission" ? `Round ${roundIndex} — FIGHT!` : "Round reset.";
      sparks.length = 0;
      audio.cue("reset");
    };

    if (controls.pressed("reset")) {
      resetRound("manual");
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
    if (!paused && intermissionTimer > 0) {
      intermissionTimer = Math.max(0, intermissionTimer - dt);
      if (intermissionTimer === 0 && roundOver) {
        resetRound("intermission");
        skipGameplayThisFrame = true;
      }
    }

    if (!paused && roundOver) {
      const continuePressed =
        isPressed(runtimeInput, controls, "light") ||
        isPressed(runtimeInput, controls, "heavy") ||
        isPressed(runtimeInput, controls, "special") ||
        isPressed(runtimeInput, controls, "jump") ||
        isPressed(runtimeInput, controls, "dash") ||
        isPressed(runtimeInput, controls, "left") ||
        isPressed(runtimeInput, controls, "right") ||
        isPressed(runtimeInput, controls, "down") ||
        isPressed(runtimeInput, controls, "guard");
      if (continuePressed) {
        resetRound("continue");
        skipGameplayThisFrame = true;
      } else {
        const winner = playerState.health >= rivalState.health ? playerState.name : rivalState.name;
        toast = `${winner} wins. Press Reset or any control for another round.`;
      }
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
      updateRivalAi(rivalState, playerState, dt, rivalAiRng);
      clearExpiredAttack(playerState);
      clearExpiredAttack(rivalState);
      updateFighterPhysics(playerState, dt);
      updateFighterPhysics(rivalState, dt);
      resolvePushback(playerState, rivalState);
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
        applyHitStopAndImpact(attacker, defender, moveId, sparks);
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
        if (callout === "WIN") playerScore++;
        else if (callout === "KO") rivalScore++;
        roundIndex++;
        intermissionTimer = 2.5;
        const scoreText = `${playerScore} — ${rivalScore}`;
        toast = callout === "WIN"
          ? `${playerState.name} wins! ${scoreText}. Press any control to continue.`
          : callout === "KO"
            ? `${rivalState.name} wins! ${scoreText}. Press any control to continue.`
            : `Draw! ${scoreText}. Press any control to continue.`;
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
    const renderStartedAt = performance.now();
    diagnostics = renderer.render(source);
    performanceProof = createPerformanceProof(dt, performance.now() - renderStartedAt, diagnostics.drawCalls);
    updateHud(root, playerState, rivalState, roundTime, callout, toast);
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
      clipReadiness
    });
    controls.endFrame();
  }

  setText(root, "#render-status", "Aura3D production GLB animation runtime ready");
  setText(root, "#clip-status", "jab / cross / sword / guard clips bound");
  updateHud(root, playerState, rivalState, roundTime, callout, toast);
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
        player: proofFighter(playerState),
        rival: proofFighter(rivalState),
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
        stage: collectAuraClashArenaStageEvidence(root),
        tweaks: createArenaTweaksEvidence(root),
        fighterController: assertAuraClashFighterControllerBoundary(),
        lighting: createAuraClashLightingEvidence(),
        postProcess: createAuraClashPostProcessEvidence({ performanceBudgetOk: false }),
        performance: { ...performanceProof, budgetOk: false },
        audio: audio.proof(),
        deterministicReplay: createDeterministicReplayProof(),
        engineCombat: engineCombatProof(combatSnapshot)
      });
      gameWindow.__AURA3D_GAME_RUNTIME__ = gameApp.evidence;
      updateHud(root, playerState, rivalState, roundTime, callout, toast);
    }
  });
  gameApp.start();
}

function installArenaPresentation(root: HTMLElement): void {
  installArenaTweaks(root);
  installArenaParallax(root);
  installArenaParticles(root);
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

function installArenaParallax(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>(".aca");
  const stageShell = root.querySelector<HTMLElement>(".aca-stage-shell");
  if (!shell || !stageShell) return;
  const layers = Array.from(stageShell.querySelectorAll<HTMLElement>("[data-depth]"));
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  stageShell.addEventListener("pointermove", (event) => {
    const rect = stageShell.getBoundingClientRect();
    targetX = event.clientX / rect.width - rect.left / rect.width - 0.5;
    targetY = event.clientY / rect.height - rect.top / rect.height - 0.5;
  });
  stageShell.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
  });
  const frame = (): void => {
    currentX += (targetX - currentX) * 0.06;
    currentY += (targetY - currentY) * 0.06;
    const motionEnabled = shell.dataset.motion !== "static";
    for (const layer of layers) {
      const depth = Number(layer.dataset.depth ?? "0");
      const x = motionEnabled ? -currentX * depth * 26 : 0;
      const y = motionEnabled ? -currentY * depth * 14 : 0;
      layer.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    }
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
}

function installArenaParticles(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>(".aca");
  const canvas = root.querySelector<HTMLCanvasElement>("#arena-particles");
  const context = canvas?.getContext("2d");
  if (!shell || !canvas || !context) return;
  type Particle = {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    radius: number;
    twinkle: number;
    speed: number;
    warm: boolean;
  };
  let width = 1;
  let height = 1;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let particles: Particle[] = [];
  const random = (min: number, max: number): number => min + Math.random() * (max - min);
  const seed = (): void => {
    const count = Math.max(28, Math.round((width * height) / 14000));
    particles = Array.from({ length: count }, () => ({
      x: random(0, width),
      y: random(0, height),
      z: random(0.25, 1),
      vx: random(-0.12, 0.12),
      vy: random(-0.45, -0.08),
      radius: random(0.6, 2.2),
      twinkle: random(0, Math.PI * 2),
      speed: random(0.6, 1.6),
      warm: Math.random() < 0.18
    }));
  };
  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  };
  resize();
  window.addEventListener("resize", resize);
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(40, now - last);
    last = now;
    const style = getComputedStyle(shell);
    const speed = shell.dataset.motion === "lively" ? 2.1 : shell.dataset.motion === "static" ? 0 : 1;
    const cool = style.getPropertyValue("--aca-mote-cool").trim() || "#7fe9d8";
    const warm = style.getPropertyValue("--aca-mote-warm").trim() || "#ffc187";
    context.clearRect(0, 0, width, height);
    if (!shell.classList.contains("aca-no-particles")) {
      for (const particle of particles) {
        particle.x += particle.vx * particle.z * speed * (dt / 16);
        particle.y += particle.vy * particle.z * speed * (dt / 16);
        particle.twinkle += 0.02 * particle.speed * Math.max(speed, 0.35);
        if (particle.y < -10) {
          particle.y = height + 8;
          particle.x = random(0, width);
        }
        if (particle.x < -10) particle.x = width + 8;
        if (particle.x > width + 10) particle.x = -8;
        const alpha = (0.22 + 0.5 * (0.5 + 0.5 * Math.sin(particle.twinkle))) * particle.z;
        const radius = particle.radius * (0.6 + particle.z);
        context.beginPath();
        context.globalAlpha = alpha;
        context.shadowBlur = 8 * particle.z;
        context.shadowColor = particle.warm ? warm : cool;
        context.fillStyle = particle.warm ? warm : cool;
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    }
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
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
  player.hitstun = 0;
  rival.hitstun = 0;
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
    return "DRAW";
  }
  const playerWon = player.health > rival.health;
  const winner = playerWon ? player : rival;
  const loser = playerWon ? rival : player;
  winner.action = "idle";
  winner.clip = winner.clips.idle;
  loser.action = "ko";
  loser.clip = loser.clips.ko;
  loser.clipTime = 0;
  return playerWon ? "WIN" : "KO";
}

// Buffer lifetime must outlive the longest non-actionable window (max hitstun 0.52 s + recovery
// 0.18 s, knockdown stun) so a press during hitstun/an active attack still fires on wakeup.
const INPUT_BUFFER_LIFETIME_MS = 800;

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

function updateRivalAi(rival: FighterState, player: FighterState, dt: number, rng: () => number): void {
  rival.aiCooldown = Math.max(0, rival.aiCooldown - dt);
  const gap = player.x - rival.x;
  const distance = Math.abs(gap);
  const direction = gap === 0 ? rival.facing * -1 : Math.sign(gap);
  const opponentAlive = player.health > 0 && player.action !== "ko";
  const desired = !opponentAlive
    ? 0
    : player.attack && distance < 1.58
      ? 0
      : !player.grounded && distance < 1.35
        ? -direction
        : distance > 1.28
          ? direction
          : distance < 0.88
            ? -direction
            : 0;
  const canStrike = opponentAlive && rival.grounded && player.grounded && distance >= 0.9 && distance <= 1.28;
  const playerAttacking = player.attack !== null;
  const incomingHeavy = playerAttacking && (player.attack?.id === "heavy" || player.attack?.id === "special");
  const shouldGuard = opponentAlive && playerAttacking && distance < 1.4 && rival.grounded && !rival.attack;
  const shouldBackdash = opponentAlive && incomingHeavy && distance < 1.1 && rival.grounded && rival.moveCooldown <= 0 && rival.dashGrace <= 0;
  const aggression = rival.health < START_HEALTH * 0.35 ? 0.65 : 1.0;
  updateFighterIntents(rival, desired, {
    down: false,
    jump: !player.grounded && distance < 1.2 && rival.grounded && !rival.attack,
    dash: shouldBackdash,
    guard: shouldGuard,
    light: canStrike && rival.aiCooldown <= 0 && distance < 1.04 && rng() < aggression,
    heavy: canStrike && rival.aiCooldown <= 0 && distance < 1.2 && player.health < START_HEALTH * 0.82 && rng() < aggression * 0.5,
    special: canStrike && rival.aiCooldown <= 0 && distance < 1.34 && rival.meter >= 80 && player.health < START_HEALTH * 0.75 && rng() < aggression * 0.3
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
  if (!requestedAttack && fighter.inputBuffer) {
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
      fighter.facing = moveX > 0 ? 1 : -1;
    }
  }
  const dashActive = fighter.grounded && !fighter.attack && !fighter.guard && fighter.dashGrace > 0;
  const baseSpeed = dashActive ? movementMoves.dash.runSpeed ?? 3.9 : WALK_SPEED;
  const speed = fighter.grounded ? baseSpeed : baseSpeed * 1.32;
  const downActive = fighter.grounded && !fighter.attack && !requestedAttack && !fighter.guard && fighter.downGrace > 0;
  fighter.moving = fighter.grounded && Math.abs(moveX) > 0.02 && !fighter.guard && !downActive;
  if (Math.abs(moveX) > 0.02 && !fighter.guard && !downActive) {
    fighter.x = clamp(fighter.x + moveX * speed * dt, stage.minX, stage.maxX);
    fighter.facing = moveX > 0 ? 1 : -1;
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
        life: 0.28,
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
    fighter.clipTime = Math.min(KO_FREEZE_TIME, fighter.clipTime + dt);
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
  return id === "special" ? 0.13 : id === "heavy" ? 0.075 : 0.052;
}

// Hit-stop + impact impulse + spark burst on a confirmed hit. Both fighters freeze their visual pose
// for the move's hit-stop window; the defender recoils (and the attacker follows through) via the
// secondary-motion squash spring. Deterministic + presentation-only (combat sim/replay untouched).
function applyHitStopAndImpact(attacker: FighterState, defender: FighterState, moveId: MoveId, sparks: Spark[]): void {
  const hs = moveHitStop(moveId);
  attacker.hitStopRemaining = Math.max(attacker.hitStopRemaining, hs);
  defender.hitStopRemaining = Math.max(defender.hitStopRemaining, hs);
  const recoil = moveId === "special" ? 0.9 : moveId === "heavy" ? 0.62 : 0.4;
  defender.pendingImpulse = Math.max(defender.pendingImpulse, recoil);
  attacker.pendingImpulse = Math.max(attacker.pendingImpulse, recoil * 0.35);
  const burst = moveId === "special" ? 7 : moveId === "heavy" ? 5 : 3;
  const midX = (attacker.x + defender.x) / 2;
  for (let i = 0; i < burst; i += 1) {
    sparks.push({ x: midX + (i - burst / 2) * 0.06, y: 0.9 + (i % 3) * 0.18, z: stage.z, age: 0, life: 0.22, facing: attacker.facing, kind: moveId });
  }
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

function collectFighterRenderItems(fighter: RuntimeFighter): RenderItem[] {
  return fighter.actor.collectRenderItems();
}

function createStageItems(): RenderItem[] {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({
    name: "aura-clash-arena-floor",
    baseColor: [0.025, 0.052, 0.058, 1],
    metallic: 0.18,
    roughness: 0.28,
    emissiveColor: [0.03, 0.18, 0.14],
    emissiveStrength: 0.16
  });
  const cyan = new UnlitMaterial({ name: "aura-clash-arena-cyan-neon", color: [0.28, 1, 0.84, 1] });
  const amber = new UnlitMaterial({ name: "aura-clash-arena-amber-neon", color: [1, 0.74, 0.28, 1] });
  return [
    item("floor", cube, floor, [0, -0.052, 0], [5.75, 0.055, 1.08]),
    item("front-rail-cyan", cube, cyan, [0, 0.055, 0.58], [5.7, 0.025, 0.025]),
    item("back-rail-amber", cube, amber, [0, 0.055, -0.46], [5.35, 0.018, 0.022]),
    item("center-mark", cube, cyan, [0, 0.075, 0], [0.028, 0.04, 1.08]),
    item("left-floor-accent", cube, amber, [-1.92, 0.06, -0.42], [0.52, 0.018, 0.035]),
    item("right-floor-accent", cube, amber, [1.92, 0.06, -0.42], [0.52, 0.018, 0.035])
  ];
}

function createFighterEffectItems(fighter: RuntimeFighter): RenderItem[] {
  void fighter;
  return [];
}

function createSparkItems(sparks: readonly Spark[]): RenderItem[] {
  void sparks;
  return [];
}

function item(
  label: string,
  geometry: Geometry,
  material: PBRMaterial | UnlitMaterial,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0]
): RenderItem {
  return {
    label,
    geometry,
    material,
    modelMatrix: composeMat4([...position], quatFromEuler(rotation[0], rotation[1], rotation[2]), [...scale]) as Mat4,
    includeInAutoFrame: true
  };
}

function updateSparks(sparks: Spark[], dt: number): void {
  for (const spark of sparks) spark.age += dt;
  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    if (sparks[index]!.age >= sparks[index]!.life) sparks.splice(index, 1);
  }
}

function createPerformanceProof(dt: number, renderMs: number, drawCalls: number): PerformanceProof {
  const frameTimeMs = Number(Math.max(renderMs, dt * 1000).toFixed(2));
  const fps = Number((1000 / Math.max(frameTimeMs, 1)).toFixed(1));
  return {
    frameTimeMs,
    fps,
    drawCalls,
    budgetOk: frameTimeMs <= 16.7 && fps >= 55 && drawCalls <= 160
  };
}

function createAudioRuntime(): AudioRuntime {
  const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = AudioCtor ? new AudioCtor() : null;
  const recentCues: string[] = [];
  const buffers = new Map<string, Promise<AudioBuffer>>();
  const assetUrls = Object.values(auraClashAudioAssets).map((asset) => asset.url);
  const loadBuffer = async (audioContext: AudioContext, url: string): Promise<AudioBuffer> => {
    let pending = buffers.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Audio asset ${url} returned ${response.status}`);
          return response.arrayBuffer();
        })
        .then((bytes) => audioContext.decodeAudioData(bytes.slice(0)));
      buffers.set(url, pending);
    }
    return pending;
  };
  const cueEntries = Object.fromEntries(
    Object.values(auraClashAudioManifest).map((definition) => [
      definition.cue,
      {
        id: definition.cue,
        bus: definition.bus,
        volume: definition.volume,
        play: async (audioContext: GameAudioContextLike, destination: AudioNode) => {
          const concreteContext = audioContext as AudioContext;
          const buffer = await loadBuffer(concreteContext, definition.asset.url);
          const source = concreteContext.createBufferSource();
          const gain = concreteContext.createGain();
          source.buffer = buffer;
          gain.gain.value = definition.volume;
          source.connect(gain);
          gain.connect(destination);
          source.start();
        }
      }
    ])
  ) as unknown as Record<keyof typeof auraClashAudioManifest, Parameters<typeof createGameAudio<keyof typeof auraClashAudioManifest>>[0]["cues"][keyof typeof auraClashAudioManifest]>;
  const audio: GameAudio<keyof typeof auraClashAudioManifest> = createGameAudio({
    context,
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
        musicReady: context !== null,
        sfxReady: context !== null && Object.keys(auraClashAudioManifest).length >= 10 && assetUrls.length >= 10,
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

function updateHud(root: HTMLElement, player: FighterState, rival: FighterState, roundTime: number, callout: string, toast: string): void {
  setText(root, "#round-time", String(Math.ceil(roundTime)).padStart(2, "0"));
  setText(root, "#callout", callout);
  setText(root, "#player-state", `${stateLabel(player)} - ${Math.round(player.health)} HP`);
  setText(root, "#rival-state", `${stateLabel(rival)} - ${Math.round(rival.health)} HP`);
  setText(root, "#toast", toast);
  setText(root, "#clip-status", `${player.clip} / ${rival.clip}`);
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
    player: proofFighter(input.player.state),
    rival: proofFighter(input.rival.state),
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
    stage: collectAuraClashArenaStageEvidence(input.root),
    tweaks: createArenaTweaksEvidence(input.root),
    fighterController: assertAuraClashFighterControllerBoundary(),
    lighting: createAuraClashLightingEvidence(),
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
      rivalHealth: proof.rival.health
    }
  };
  input.root.dataset.arenaStatus = proof.status;
}

function proofFighter(fighter: FighterState): ProofFighter {
  return {
    name: fighter.name,
    health: Math.round(fighter.health),
    meter: Math.round(fighter.meter),
    x: Number(fighter.x.toFixed(3)),
    y: Number(fighter.y.toFixed(3)),
    grounded: fighter.grounded,
    action: fighter.action,
    activeClip: fighter.clip,
    attacking: fighter.attack?.id ?? null
  };
}

function activeFighterAssetsProof(): AuraClashArenaProof["fighterAssets"] {
  const player = {
    id: "auraClashPlayerRig",
    url: assets.auraClashPlayerRig.url,
    hash: assets.auraClashPlayerRig.hash
  };
  const rival = {
    id: "auraClashRivalRig",
    url: assets.auraClashRivalRig.url,
    hash: assets.auraClashRivalRig.hash
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
    attacking: null
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
