// PR 0b-1 carve-out (CONTRACTS.md §3.2, GameRuntime.ts region) — verbatim move; 0 changed logic lines.

import type { GameEffectAttachment, GameEffectInstance, GameEffectOptions, GameEffectsController, GameEffectsOptions, GameEffectsSnapshot, GameVec3 } from "../GameRuntime.js";
import { addVec3, round, vec3 } from "../GameRuntime.js";
import { material } from "../nodes/material.js";
import { primitive } from "../nodes/primitives.js";

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

export function createGameEffects(options: GameEffectsOptions = {}): GameEffectsController {
  const poolSize = options.poolSize ?? 96;
  const reducedMotion = options.reducedMotion ?? false;
  const reducedFlash = options.reducedFlash ?? false;
  let spawned = 0;
  let effects: MutableGameEffectInstance[] = [];
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
  return {
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
      return effects.map(effectToSceneNode);
    },
    clear() {
      effects = [];
    }
  };
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
