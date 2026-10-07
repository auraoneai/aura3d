// PR 0b-1 carve-out (CONTRACTS.md §3.2, GameRuntime.ts region) — verbatim move; 0 changed logic lines.

import type { GameEffectAttachment, GameEffectInstance, GameEffectOptions, GameEffectPreset, GameEffectsController, GameEffectsSnapshot, GameVec3 } from "../GameRuntime.js";
import { addVec3, round, vec3 } from "../GameRuntime.js";
import { prd07FlagOnFor, registerPendingGameEffects } from "./effects-api.js";

/** Carved options declaration (GameRuntime.ts:1155-1164 is re-exported from
 * here per §7.8). The `app`/`autoMount`/`legacyPrimitiveNodes` fields are the
 * PRD-07 auto-mount additions. */
export interface GameEffectsOptions {
  readonly poolSize?: number;
  readonly reducedMotion?: boolean;
  readonly reducedFlash?: boolean;
  readonly sparks?: GameEffectPreset;
  readonly trails?: GameEffectPreset;
  readonly superBurst?: GameEffectPreset;
  readonly presets?: Record<string, GameEffectPreset>;
  /** Bind to this app's `app.effects` (§6.3.4); requires A3D_QR_VFX. */
  readonly app?: unknown;
  /** Default true — register in the realm pending list when no `app` is given. */
  readonly autoMount?: boolean;
  /** Bound only: `nodes()` returns the legacy primitive nodes instead of []. */
  readonly legacyPrimitiveNodes?: boolean;
}

export type GameEffectKind =
  | "hit-spark"
  | "block-spark"
  | "impact-decal"
  | "ground-dust"
  | "dash-trail"
  | "slash-trail"
  | "impact-flash"
  | "aura-burst"
  | "shockwave"
  | "ring-shockwave"
  | "super-flash";

/** §7.8 kind mapping — game-effects kind → AuraVfxKind preset name, plus the
 * option translation (blue 0.6× block-spark; duration/radius → count/speed). */
const GAME_TO_VFX: Record<GameEffectKind, { preset: string; color?: [number, number, number]; intensityScale?: number }> = {
  "hit-spark": { preset: "spark" },
  "block-spark": { preset: "spark", color: [0.4, 0.7, 1], intensityScale: 0.6 },
  "impact-decal": { preset: "impact-decal" },
  "ground-dust": { preset: "dust" },
  "dash-trail": { preset: "streak" },
  "slash-trail": { preset: "streak" },
  "impact-flash": { preset: "impact-flash" },
  "aura-burst": { preset: "aura-burst" },
  shockwave: { preset: "ring" },
  "ring-shockwave": { preset: "ring" },
  "super-flash": { preset: "super-flash" }
};

interface BoundEffectsApp {
  effects?: {
    spawn(effect: string, at: readonly number[], options?: Record<string, unknown>): { stop(o?: { immediate?: boolean }): void };
    liveCount: number;
    clear(): void;
  };
  onFrame?(cb: (frame: { dt: number }) => void): () => void;
}

export function createGameEffects(options: GameEffectsOptions = {}): GameEffectsController {
  const poolSize = options.poolSize ?? 96;
  const reducedMotion = options.reducedMotion ?? false;
  const reducedFlash = options.reducedFlash ?? false;
  const legacyPrimitiveNodes = options.legacyPrimitiveNodes ?? false;
  let spawned = 0;
  let effects: MutableGameEffectInstance[] = [];
  // §6.3.4 bound state: when bound, spawn forwards to app.effects.spawn and
  // the app's onFrame drives update(). The local pool is still maintained so
  // snapshot()/update() semantics don't change for consumers (GameFeel ports).
  let boundApp: BoundEffectsApp | null = options.app ? (options.app as BoundEffectsApp) : null;
  let boundOff: (() => void) | null = null;
  const boundSpawn = (kind: GameEffectKind, position: GameVec3, effectOptions: GameEffectOptions): void => {
    const fx = boundApp?.effects;
    if (!fx) return;
    const map = GAME_TO_VFX[kind];
    fx.spawn(map.preset, position, {
      color: effectOptions.color ?? map.color,
      intensity: (effectOptions.intensity ?? 1) * (map.intensityScale ?? 1),
      count: Math.max(4, Math.round((effectOptions.radius ?? defaultEffectRadius(kind)) * 32)),
      seed: spawned
    });
  };
  const snapshot = (): GameEffectsSnapshot => ({
    kind: "aura-game-effects",
    active: effects.length,
    spawned,
    pooled: poolSize,
    reducedMotion,
    reducedFlash,
    effects: effects.map(publicGameEffectInstance)
  });
  const spawn = (kind: GameEffectKind, position: GameVec3, effectOptions: GameEffectOptions = {}): GameEffectInstance => {
    spawned += 1;
    boundSpawn(kind, resolveEffectAttachmentPosition(effectOptions.attachment, position), effectOptions);
    const flashLimited = reducedFlash && (kind === "impact-flash" || kind === "super-flash");
    const motionLimited = reducedMotion && (kind === "dash-trail" || kind === "slash-trail" || kind === "shockwave" || kind === "ring-shockwave");
    const attachment = effectOptions.attachment;
    const effect: MutableGameEffectInstance = {
      id: effectOptions.ownerId ? `${effectOptions.ownerId}:${kind}:${spawned}` : `${kind}:${spawned}`,
      kind,
      position: resolveEffectAttachmentPosition(attachment, position),
      color: effectOptions.color ?? defaultEffectColor(kind),
      intensity: Math.min(effectOptions.intensity ?? 1, flashLimited ? 0.35 : motionLimited ? 0.55 : Number.POSITIVE_INFINITY),
      duration: Math.min(effectOptions.duration ?? defaultEffectDuration(kind), motionLimited ? 0.18 : Number.POSITIVE_INFINITY),
      radius: effectOptions.radius ?? defaultEffectRadius(kind),
      ownerId: effectOptions.ownerId,
      attachmentId: attachment?.targetId ?? attachment?.id,
      attachmentOffset: attachment?.offset,
      attachment,
      age: 0
    };
    if (effects.length >= poolSize) effects.shift();
    effects.push(effect);
    return publicGameEffectInstance(effect);
  };
  const controller: GameEffectsController = {
    spawn,
    emit(combatEvents, effectOptions) {
      const emitted: GameEffectInstance[] = [];
      for (const event of combatEvents) {
        if (event.type === "hit") emitted.push(spawn("hit-spark", event.position, { ownerId: event.attackerId, ...effectOptions }));
        if (event.type === "blocked") emitted.push(spawn("block-spark", event.position, { ownerId: event.attackerId, ...effectOptions }));
        if (event.type === "push") emitted.push(spawn("ground-dust", event.position, { ownerId: event.attackerId, intensity: 0.45, duration: 0.14, ...effectOptions }));
      }
      return emitted;
    },
    hitSpark: (position, effectOptions) => spawn("hit-spark", position, effectOptions),
    blockSpark: (position, effectOptions) => spawn("block-spark", position, effectOptions),
    impactDecal: (position, effectOptions) => spawn("impact-decal", position, effectOptions),
    groundDust: (position, effectOptions) => spawn("ground-dust", position, effectOptions),
    dashTrail: (position, effectOptions) => spawn("dash-trail", position, effectOptions),
    slashTrail: (position, effectOptions) => spawn("slash-trail", position, effectOptions),
    impactFlash: (position, effectOptions) => spawn("impact-flash", position, effectOptions),
    auraBurst: (position, effectOptions) => spawn("aura-burst", position, effectOptions),
    shockwave: (position, effectOptions) => spawn("shockwave", position, effectOptions),
    ringShockwave: (position, effectOptions) => spawn("ring-shockwave", position, effectOptions),
    superFlash: (position, effectOptions) => spawn("super-flash", position, effectOptions),
    update(dt) {
      const seconds = Math.max(0, dt);
      effects = effects
        .map((effect) => ({
          ...effect,
          position: resolveEffectAttachmentPosition(effect.attachment, effect.position),
          age: effect.age + seconds
        }))
        .filter((effect) => effect.age <= effect.duration);
      return snapshot();
    },
    snapshot,
    nodes() {
      if (boundApp && !legacyPrimitiveNodes) return [];
      return effects.map(effectToSceneNode);
    },
    clear() {
      effects = [];
      boundApp?.effects?.clear();
    }
  };

  // §6.3.4 adoption: explicit flag-on app binds now; otherwise (autoMount
  // default) the controller registers in the realm pending list and the
  // effects extension binds it when exactly one flag-on app is live.
  const bind = (app: BoundEffectsApp): void => {
    boundApp = app;
    boundOff = app.onFrame?.((frame) => controller.update(frame.dt)) ?? null;
  };
  if (options.app && prd07FlagOnFor(options.app as object)) {
    bind(options.app as BoundEffectsApp);
  } else if (options.autoMount !== false && !boundApp) {
    registerPendingGameEffects({ label: "game-effects", bind: (app) => bind(app as BoundEffectsApp) });
  }
  void boundOff;
  return controller;
}

export type MutableGameEffectInstance = Omit<GameEffectInstance, "age" | "attachment"> & {
  age: number;
  readonly attachment?: GameEffectAttachment;
};

export function publicGameEffectInstance(effect: MutableGameEffectInstance): GameEffectInstance {
  const { attachment: _attachment, ...publicEffect } = effect;
  return { ...publicEffect };
}

export function resolveEffectAttachmentPosition(attachment: GameEffectAttachment | undefined, fallback: GameVec3): GameVec3 {
  if (!attachment?.getPosition) return fallback;
  return addVec3(attachment.getPosition(), vec3(attachment.offset, [0, 0, 0]));
}

export function defaultEffectColor(kind: GameEffectKind): string {
  if (kind === "block-spark") return "#8ee7ff";
  if (kind === "impact-decal") return "#ff8b5c";
  if (kind === "ground-dust") return "#c7b38f";
  if (kind === "dash-trail") return "#62f6c8";
  if (kind === "slash-trail") return "#d7fbff";
  if (kind === "aura-burst") return "#5cff87";
  if (kind === "shockwave" || kind === "ring-shockwave") return "#ffd166";
  if (kind === "impact-flash" || kind === "super-flash") return "#ffffff";
  return "#ffb84d";
}

export function defaultEffectDuration(kind: GameEffectKind): number {
  if (kind === "impact-decal") return 0.7;
  if (kind === "ground-dust") return 0.34;
  if (kind === "dash-trail") return 0.28;
  if (kind === "slash-trail") return 0.18;
  if (kind === "aura-burst") return 0.9;
  if (kind === "shockwave" || kind === "ring-shockwave") return 0.42;
  if (kind === "impact-flash") return 0.12;
  if (kind === "super-flash") return 0.2;
  return 0.22;
}

export function defaultEffectRadius(kind: GameEffectKind): number {
  if (kind === "impact-decal") return 0.42;
  if (kind === "aura-burst") return 1.4;
  if (kind === "shockwave" || kind === "ring-shockwave") return 1.05;
  if (kind === "dash-trail") return 0.52;
  if (kind === "slash-trail") return 0.62;
  if (kind === "ground-dust") return 0.36;
  if (kind === "super-flash") return 1.2;
  return 0.28;
}

export function effectToSceneNode(effect: MutableGameEffectInstance): any {
  const life = Math.max(0, 1 - effect.age / Math.max(0.001, effect.duration));
  const ring = effect.kind === "shockwave" || effect.kind === "ring-shockwave";
  const trail = effect.kind === "dash-trail" || effect.kind === "slash-trail";
  const scalarScale = Math.max(0.04, effect.radius * (ring ? 1.4 - life * 0.4 : life));
  const trailScale: GameVec3 = [
    Math.max(0.08, effect.radius * life * 1.6),
    Math.max(0.02, effect.radius * life * 0.18),
    Math.max(0.04, effect.radius * life * 0.32)
  ];
  if (effect.kind === "aura-burst") {
    return {
      kind: "effect",
      effect: "particles",
      name: effect.id,
      color: effect.color,
      intensity: effect.intensity * life,
      particleCount: Math.round(160 + effect.intensity * 220),
      emitter: "swirl",
      radius: effect.radius,
      height: 1.4,
      materialMode: "additive-glow"
    };
  }
  return {
    kind: "primitive",
    primitive: ring ? "torus" : trail ? "box" : "sphere",
    name: effect.id,
    position: effect.position,
    scale: trail ? trailScale : scalarScale,
    material: {
      color: effect.color,
      emissive: effect.color,
      emissiveIntensity: effect.intensity * life,
      opacity: life
    }
  };
}
