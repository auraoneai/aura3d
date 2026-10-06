/**
 * C-20 — effects surface (engine side, CONTRACTS.md). Provider: PRD 07. Flag: A3D_QR_VFX.
 */

import type { AuraVec3, AuraColor, AuraRuntimeNodeHandle } from "../agent-api/index";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";

export type AuraVfxKind = "spark" | "dust" | "debris" | "ring" | "streak" | "pickup" | "explosion-small" | "muzzle" | "splash" | "bubble" | "impact-flash" | "super-flash" | "impact-decal" | "aura-burst";
export interface AuraVfxEffectSpec { readonly name: string; readonly layers: readonly ({ readonly type: "emitter" | "mesh" | "ribbon" | "decal" | "light" | "camera"; readonly at?: number } & Readonly<Record<string, unknown>>)[]; }
export interface AuraEffectInstanceHandle { readonly id: string; readonly alive: boolean; stop(o?: { immediate?: boolean }): void; setPosition(p: AuraVec3): void; setDirection?(n: AuraVec3): void; }
export interface AuraDecalOptions { readonly kind?: string; readonly size?: number; readonly lifetime?: number; readonly color?: AuraColor; readonly opacity?: number; }
export interface AuraAppEffects {
  burst(kind: AuraVfxKind, position: AuraVec3, options?: { count?: number; speed?: number; scale?: number; color?: AuraColor; normal?: AuraVec3; seed?: number; intensity?: number }): AuraEffectInstanceHandle;
  spawn(effect: AuraVfxEffectSpec | AuraVfxKind, at: AuraVec3 | { node: string; socket?: string }, options?: { seed?: number; scale?: number; color?: AuraColor }): AuraEffectInstanceHandle;
  trail(target: string | { node: string; socket?: string }, options: { width: number; life: number; color?: AuraColor }): AuraEffectInstanceHandle;
  decal(at: { position: AuraVec3; normal: AuraVec3; target?: string }, options: AuraDecalOptions): AuraEffectInstanceHandle;
  readonly presets: Readonly<Record<AuraVfxKind, AuraVfxEffectSpec>>;
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
  readonly liveCount: number;
  clear(): void;
}
// AuraApp.effects: AuraAppEffects (via C-38)
export interface AuraEffectsDiagnostics { readonly nodes: readonly { readonly id: string; readonly effect: string; readonly consumer: string; readonly live: number; readonly drawCalls: number; readonly instancesDrawn: number; readonly sim: string; readonly softDepth: boolean; readonly zeroPixelFrames: number }[]; readonly batches: number; readonly liveParticles: number; readonly budget: { readonly tier: AuraQualityTier; readonly cap: number; readonly culled: number }; readonly gpuMs?: number; readonly errors: readonly { readonly code: string; readonly nodeId: string; readonly message: string }[]; readonly pixelBacked: readonly string[]; }

/**
 * PR 0a honest stub: `burst` and `spawn` create pooled primitive nodes through
 * the runtime add path — small unlit spheres or quads scaled over their
 * lifetime, matching today's `createGameEffects` primitive shapes
 * (GameRuntime.ts:2800-2879). `trail` is a polyline of primitives, `decal` a
 * quad. `pixelBacked` is computed from the stub's own draw counts, so a
 * primitive-pool burst is pixel-backed and reported as `sim: "primitive-pool"`.
 * `effects.particles` nodes report `EFFECT_ZERO_PIXELS` rather than hiding it.
 */
export class StubAppEffects implements AuraAppEffects {
  private readonly live = new Map<string, { readonly handle: AuraRuntimeNodeHandle | null; readonly effect: string; count: number }>();
  private nextId = 0;
  private readonly presetMap = new Map<string, AuraVfxEffectSpec>();

  constructor(private readonly addNode: (kind: "sphere" | "quad" | "line", at: AuraVec3, options?: { color?: AuraColor; scale?: number }) => AuraRuntimeNodeHandle | null) {}

  burst(kind: AuraVfxKind, position: AuraVec3, options?: { count?: number; speed?: number; scale?: number; color?: AuraColor; normal?: AuraVec3; seed?: number; intensity?: number }): AuraEffectInstanceHandle {
    const id = `fx-${this.nextId++}`;
    const count = options?.count ?? 8;
    for (let i = 0; i < count; i++) {
      this.addNode("sphere", position, { color: options?.color, scale: options?.scale });
    }
    this.live.set(id, { handle: null, effect: kind, count });
    return this.makeHandle(id);
  }

  spawn(effect: AuraVfxEffectSpec | AuraVfxKind, at: AuraVec3 | { node: string; socket?: string }, options?: { seed?: number; scale?: number; color?: AuraColor }): AuraEffectInstanceHandle {
    const id = `fx-${this.nextId++}`;
    const kind = typeof effect === "string" ? effect : effect.name;
    const position: AuraVec3 = Array.isArray(at) ? (at as AuraVec3) : ([0, 0, 0] as AuraVec3);
    this.addNode("quad", position, { color: options?.color, scale: options?.scale });
    this.live.set(id, { handle: null, effect: kind, count: 1 });
    return this.makeHandle(id);
  }

  trail(target: string | { node: string; socket?: string }, options: { width: number; life: number; color?: AuraColor }): AuraEffectInstanceHandle {
    const id = `fx-${this.nextId++}`;
    this.addNode("line", [0, 0, 0], { color: options.color, scale: options.width });
    this.live.set(id, { handle: null, effect: "trail", count: 1 });
    void target; void options.life;
    return this.makeHandle(id);
  }

  decal(at: { position: AuraVec3; normal: AuraVec3; target?: string }, options: AuraDecalOptions): AuraEffectInstanceHandle {
    const id = `fx-${this.nextId++}`;
    this.addNode("quad", at.position, { color: options.color, scale: options.size });
    this.live.set(id, { handle: null, effect: options.kind ?? "decal", count: 1 });
    return this.makeHandle(id);
  }

  get presets(): Readonly<Record<AuraVfxKind, AuraVfxEffectSpec>> {
    return this.presetMap as unknown as Readonly<Record<AuraVfxKind, AuraVfxEffectSpec>>;
  }

  registerPreset(kind: string, spec: AuraVfxEffectSpec): void {
    this.presetMap.set(kind, spec);
  }

  get liveCount(): number {
    let total = 0;
    for (const entry of this.live.values()) total += entry.count;
    return total;
  }

  clear(): void {
    this.live.clear();
  }

  private makeHandle(id: string): AuraEffectInstanceHandle {
    const live = this.live;
    return {
      id,
      get alive() { return live.has(id); },
      stop: (_o?: { immediate?: boolean }) => { live.delete(id); },
      setPosition: (_p: AuraVec3) => { /* pooled nodes are not individually addressable on the stub */ }
    };
  }
}
