// apps/aura-clash-showcase/src/v2/scene/fighter-animation.ts — v2 clip drive.
// Wires the kept UBC rigs to the fighting kit: `createFightingGameKit` owns
// the sim (bodies/combat/AI, advanced by `kit.update(dt)` in boot.ts); this
// module is the missing presentation wire boot.ts deferred ("UBC rigs stay
// at their authored facing until clip playback lands"). One engine
// AnimationController per fighter, clip ids are the EXACT embedded GLB clip
// names from the kept clip maps, validated at construction against the typed
// asset metadata. State selection is pure and driven by FightingGameSnapshot.
//
// Inspected rig metadata (GLB JSON chunk, 2026-10-13; aura3d CLI not built in
// this worktree, parsed directly):
// - auraClashPlayerRig.3318d671.glb: 7,822,664 B, 35,508 tris, 13 meshes,
//   79 nodes, skin "Armature" 65 joints, 0 morph targets, 8 PNG textures
//   (7x512², 1x256², 1x2048²), 12 clips (195 channels each).
// - auraClashRivalRig.c8d844dc.glb: 4,732,472 B, 26,982 tris, 9 meshes,
//   75 nodes, skin "Armature" 65 joints, 0 morph targets, 6x512² PNG,
//   10 clips (195 channels each).
// - arenaNeonDowntownTextured.312f2320.glb: 8,877,352 B, 98,592 tris,
//   26 meshes, 47 nodes, no skin/clips/morphs, 26 textures (512²/1024²).
// Clip-map check: every name in auraClashPlayerClips/auraClashRivalClips is
// embedded verbatim in its rig — zero mismatches, no renames needed.
import {
  AnimationController,
  type AuraAnimationAssetLike,
  type FightingGameSnapshot
} from "@aura3d/engine";

// The public engine surface exports FightingGameSnapshot but not the
// FightingActorState alias, so derive the identical union from the snapshot.
type FightingActorState = FightingGameSnapshot["states"]["player"];
import { assets } from "../../aura-assets";
import {
  auraClashPlayerClips,
  auraClashRivalClips,
  resolveAuraClashHurtClip,
  selectAuraClashHurtVariant,
  validateAuraClashClipMapReadiness,
  validateAuraClashClipReadiness,
  type AuraClashClipReadiness,
  type AuraClashFighterClipMap
} from "../../gameplay/animation/auraClashClipMaps";

/** Inspected clip durations (seconds), keyed by exact embedded clip name. */
export const AURA_CLASH_PLAYER_CLIP_DURATIONS: Readonly<Record<string, number>> = {
  Crouch_Idle_Loop: 2.9333, Death01: 2.4, Hit_Chest: 0.3333, Hit_Head: 0.4333,
  Idle_Loop: 2.5, Jump_Loop: 2.5, Punch_Cross: 1, Punch_Jab: 0.8667,
  Sprint_Loop: 0.6667, Sword_Attack: 1.5333, Walk_Loop: 1.3333, Sword_Block: 1.2333
};
export const AURA_CLASH_RIVAL_CLIP_DURATIONS: Readonly<Record<string, number>> = {
  Hit_Knockback: 0.8333, Idle_FoldArms_Loop: 2.5, LayToIdle: 1.5333,
  Melee_Hook: 0.4667, NinjaJump_Idle_Loop: 2, Shield_Dash_RM: 1.1,
  Sword_Block: 1.2333, Sword_Regular_A: 0.4333, Sword_Regular_Combo: 3,
  Zombie_Walk_Fwd_Loop: 1.3333
};

/** Driver states: kit actor states plus hit/death presentation states. */
export type AuraClashFighterAnimState =
  | "idle" | "walk" | "run" | "air" | "down" | "guard" | "attack" | "hit" | "death";

export interface AuraClashFighterAnimInput {
  readonly state: FightingActorState;
  readonly health: number;
  readonly grounded: boolean;
  /** Player-only: kit has no crouch actor state, so boot passes the raw input. */
  readonly crouch?: boolean;
  /** Damage of the most recent hit taken (combat event), for hurt severity. */
  readonly lastHitDamage?: number;
}

export interface AuraClashFighterAnimSnapshot {
  readonly fighterId: string;
  readonly bound: boolean;
  readonly state: AuraClashFighterAnimState;
  readonly activeClip: string | null;
  /** Clip-local playback time from the controller (the spec's motion probe). */
  readonly clipTime: number | null;
  readonly clipDuration: number | null;
  readonly loop: boolean;
  /** Controller binding actually applying a clip (real GLB drive, not pose). */
  readonly appliedClipId: string | null;
  readonly readinessOk: boolean;
  readonly missingClips: readonly string[];
  readonly diagnostics: readonly string[];
  readonly lastError: string | null;
}

type RuntimeNodeLike = Parameters<AnimationController<string>["bindRuntimeNode"]>[0];

const LOOPING_STATES: ReadonlySet<AuraClashFighterAnimState> = new Set([
  "idle", "walk", "run", "air", "down", "guard"
]);

function embeddedClipNames(asset: unknown): readonly string[] {
  const metadata = (asset as { metadata?: { animations?: unknown } } | null)?.metadata;
  return Array.isArray(metadata?.animations)
    ? metadata.animations.filter((c): c is string => typeof c === "string")
    : [];
}

interface ActiveClip {
  readonly state: AuraClashFighterAnimState;
  readonly clip: string;
  /** Seconds since this clip was started (driver clock, for one-shot latch). */
  elapsed: number;
}

export class AuraClashFighterAnimation {
  readonly controller: AnimationController<string>;
  readonly readinessOk: boolean;
  readonly missingClips: readonly string[];
  private bound = false;
  private active: ActiveClip | null = null;
  private prevKitState: FightingActorState | null = null;
  private dead = false;
  private lastError: string | null = null;

  constructor(
    readonly fighterId: string,
    asset: unknown,
    private readonly clips: AuraClashFighterClipMap,
    private readonly durations: Readonly<Record<string, number>>
  ) {
    const available = embeddedClipNames(asset);
    const readiness = validateAuraClashClipMapReadiness({
      fighterId, clipMap: clips, availableClips: available.length > 0 ? available : undefined
    });
    this.readinessOk = readiness.ok;
    this.missingClips = readiness.missingClips;
    const mapped = [...new Set(Object.values(clips))];
    // Only require clips the registry can actually resolve; a missing clip is
    // a readiness diagnostic (surfaced in evidence), never a boot crash.
    const requiredClips = available.length > 0 ? mapped.filter((n) => available.includes(n)) : mapped;
    this.controller = new AnimationController<string>({
      id: `${fighterId}-fighter-animation`,
      clipRegistry: asset as AuraAnimationAssetLike,
      requiredClips,
      suppressRootMotion: true
    });
  }

  bind(node: RuntimeNodeLike): void {
    if (this.bound) return;
    this.bound = true;
    try {
      this.controller.bindRuntimeNode(node, {
        id: `${this.fighterId}-runtime-animation`,
        defaultClipId: this.clips.idle
      });
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.start("idle", this.clips.idle, 0);
  }

  private start(state: AuraClashFighterAnimState, clip: string, fade: number): void {
    this.active = { state, clip, elapsed: 0 };
    try {
      this.controller.crossFade(clip, fade, {
        loop: LOOPING_STATES.has(state) ? "loop" : "once",
        restart: true
      });
    } catch (err) {
      // Diagnostics surface binding/registry issues; never break the frame loop.
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  private oneShotDone(): boolean {
    if (!this.active || LOOPING_STATES.has(this.active.state)) return true;
    return this.active.elapsed >= (this.durations[this.active.clip] ?? 0.4);
  }

  update(dt: number, input: AuraClashFighterAnimInput): void {
    this.controller.update(dt);
    if (this.active) this.active.elapsed += dt;
    const prevKitState = this.prevKitState;
    this.prevKitState = input.state;
    const entered = (s: FightingActorState) =>
      input.state === s && prevKitState !== s;

    // Death latches above everything and plays exactly once.
    if (input.health <= 0) {
      if (!this.dead) { this.dead = true; this.start("death", this.clips.ko, 0.15); }
      return;
    }
    this.dead = false;

    // Hit reaction on entering hitstun (severity from damage + grounded).
    if (entered("hitstun")) {
      const variant = selectAuraClashHurtVariant(input.lastHitDamage ?? 0, input.grounded);
      this.start("hit", resolveAuraClashHurtClip(this.clips, variant, false), 0.05);
      return;
    }
    // Attacks are one-frame kit pulses; start on entry, latch till done.
    if (entered("light") || entered("heavy") || entered("special")) {
      if (this.active?.state !== "hit" || this.oneShotDone()) {
        this.start("attack", this.clips[input.state as "light" | "heavy" | "special"], 0.05);
      }
      return;
    }
    if (!this.oneShotDone()) return; // let attack/hit clips finish

    const desired: { state: AuraClashFighterAnimState; clip: string } =
      input.state === "guard" ? { state: "guard", clip: this.clips.guard }
      : input.state === "jump" ? { state: "air", clip: this.clips.air }
      : input.state === "dash" ? { state: "run", clip: this.clips.run }
      : input.crouch === true && input.grounded ? { state: "down", clip: this.clips.down }
      : input.state === "walk" ? { state: "walk", clip: this.clips.walk }
      : { state: "idle", clip: this.clips.idle };
    if (this.active?.clip !== desired.clip) this.start(desired.state, desired.clip, 0.12);
  }

  snapshot(): AuraClashFighterAnimSnapshot {
    const snap = this.controller.snapshot();
    const activeState = snap.clips.find((c) => c.clipId === snap.activeClipId)
      ?? snap.clips.find((c) => c.clipId === this.active?.clip);
    const binding = snap.runtimeNodeBindings[0];
    return {
      fighterId: this.fighterId,
      bound: this.bound,
      state: this.active?.state ?? "idle",
      activeClip: snap.activeClipId ?? this.active?.clip ?? null,
      clipTime: activeState?.localTime ?? null,
      clipDuration: activeState?.duration ?? null,
      loop: this.active ? LOOPING_STATES.has(this.active.state) : true,
      appliedClipId: binding?.appliedClipId ?? binding?.activeClipId ?? null,
      readinessOk: this.readinessOk,
      missingClips: this.missingClips,
      diagnostics: snap.diagnostics.map((d) => `${d.code}: ${d.message}`),
      lastError: this.lastError
    };
  }
}

export interface AuraClashFighterAnimations {
  readonly player: AuraClashFighterAnimation;
  readonly rival: AuraClashFighterAnimation;
  readonly readiness: AuraClashClipReadiness;
  bindNodes(playerNode: RuntimeNodeLike | null | undefined, rivalNode: RuntimeNodeLike | null | undefined): void;
  update(dt: number, snapshot: FightingGameSnapshot, extras?: {
    readonly playerCrouch?: boolean;
    readonly lastHitDamage?: Readonly<Partial<Record<"p1" | "p2", number>>>;
  }): void;
  snapshot(): { readonly p1: AuraClashFighterAnimSnapshot; readonly p2: AuraClashFighterAnimSnapshot; readonly readinessOk: boolean };
}

export function createAuraClashFighterAnimations(): AuraClashFighterAnimations {
  const player = new AuraClashFighterAnimation(
    "p1", assets.auraClashPlayerRig, auraClashPlayerClips, AURA_CLASH_PLAYER_CLIP_DURATIONS);
  const rival = new AuraClashFighterAnimation(
    "p2", assets.auraClashRivalRig, auraClashRivalClips, AURA_CLASH_RIVAL_CLIP_DURATIONS);
  const readiness = validateAuraClashClipReadiness({
    playerAvailableClips: embeddedClipNames(assets.auraClashPlayerRig),
    rivalAvailableClips: embeddedClipNames(assets.auraClashRivalRig)
  });
  return {
    player, rival, readiness,
    bindNodes(playerNode, rivalNode) {
      if (playerNode) player.bind(playerNode);
      if (rivalNode) rival.bind(rivalNode);
    },
    update(dt, snapshot, extras = {}) {
      const actors = snapshot.combat.actors;
      const healthOf = (id: string) => actors.find((a) => a.id === id)?.health ?? 100;
      player.update(dt, {
        state: snapshot.states.player, health: healthOf("p1"),
        grounded: snapshot.player.grounded, crouch: extras.playerCrouch,
        lastHitDamage: extras.lastHitDamage?.p1
      });
      rival.update(dt, {
        state: snapshot.states.opponent, health: healthOf("p2"),
        grounded: snapshot.opponent.grounded,
        lastHitDamage: extras.lastHitDamage?.p2
      });
    },
    snapshot() {
      return { p1: player.snapshot(), p2: rival.snapshot(), readinessOk: readiness.ok };
    }
  };
}
