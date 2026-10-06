// PRD-07 P1-T2/P1-T14 — real `app.effects` factory (C-38 member "effects").
// Wraps the per-app ProductionEffectSystem; falls back to StubAppEffects when
// the A3D_QR_VFX flag is off so flag-off behaviour is byte-identical.

import type { AuraApp, AuraVec3, AuraColor, AuraCreateAppOptions } from "../index";
import type { AuraVfxKind, AuraVfxEffectSpec, AuraEffectInstanceHandle } from "../../contracts/effects";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { StubAppEffects } from "../../contracts/effects";
import { ProductionEffectSystem, type AppLike } from "../../production-runtime/effects/ProductionEffectSystem";
import { attachVfxBridge } from "./bridge";
import { bindPrd07RendererFlags } from "@aura3d/rendering/lanes";

interface EffectEntry {
  readonly id: string;
  readonly emitterId: string | null;
  alive: boolean;
}

export interface AuraEffectsExtensionContext {
  readonly flags: QrFlags;
  readonly options: AuraCreateAppOptions;
}

interface BurstPreset {
  readonly speed: [number, number];
  readonly life: [number, number];
  readonly gravity: number;
  readonly color: [number, number, number];
  readonly size: [number, number];
  readonly spread: number;
  readonly additive: boolean;
  /** P2-T7 §6.2.12 light layer — flashes a transient pool light on spawn. */
  readonly light?: { readonly intensity: number; readonly range: number; readonly duration: number };
}

const BURST_PRESETS: Record<string, BurstPreset> = {
  spark: { speed: [2, 5], life: [0.25, 0.6], gravity: -4, color: [4, 2.4, 0.8], size: [0.03, 0.07], spread: 1, additive: true },
  dust: { speed: [0.4, 1.2], life: [0.8, 1.6], gravity: -0.4, color: [0.55, 0.5, 0.42], size: [0.12, 0.3], spread: 1, additive: false },
  debris: { speed: [2, 4.5], life: [0.5, 1.1], gravity: -9.8, color: [0.4, 0.32, 0.25], size: [0.05, 0.12], spread: 1, additive: false },
  ring: { speed: [4, 6], life: [0.3, 0.5], gravity: 0, color: [1.5, 2.6, 4.5], size: [0.05, 0.1], spread: 1, additive: true },
  streak: { speed: [6, 9], life: [0.2, 0.4], gravity: 0, color: [4.5, 3, 1.2], size: [0.04, 0.08], spread: 0.4, additive: true },
  pickup: { speed: [1.5, 2.5], life: [0.5, 0.9], gravity: 1.5, color: [1.2, 4, 1.6], size: [0.06, 0.12], spread: 1, additive: true },
  "explosion-small": { speed: [3, 7], life: [0.4, 0.9], gravity: -2, color: [6, 2.2, 0.6], size: [0.15, 0.35], spread: 1, additive: true, light: { intensity: 14, range: 10, duration: 0.45 } },
  muzzle: { speed: [3, 6], life: [0.05, 0.12], gravity: 0, color: [8, 5, 1.5], size: [0.06, 0.15], spread: 0.3, additive: true, light: { intensity: 10, range: 6, duration: 0.12 } },
  splash: { speed: [1.5, 3.5], life: [0.5, 1], gravity: -7, color: [0.4, 0.6, 1.2], size: [0.05, 0.12], spread: 1, additive: false },
  bubble: { speed: [0.4, 0.9], life: [1.2, 2.4], gravity: 0.8, color: [0.5, 0.7, 1.2], size: [0.05, 0.12], spread: 1, additive: false },
  "impact-flash": { speed: [0.5, 1.5], life: [0.12, 0.25], gravity: 0, color: [6, 4.5, 2], size: [0.2, 0.4], spread: 0.2, additive: true, light: { intensity: 8, range: 6, duration: 0.25 } },
  "super-flash": { speed: [1, 3], life: [0.15, 0.35], gravity: 0, color: [9, 7, 4], size: [0.3, 0.6], spread: 1, additive: true, light: { intensity: 20, range: 14, duration: 0.35 } },
  "impact-decal": { speed: [0, 0], life: [2, 3], gravity: 0, color: [0.15, 0.12, 0.1], size: [0.2, 0.35], spread: 0.05, additive: false },
  "aura-burst": { speed: [2, 4], life: [0.5, 1.1], gravity: 0, color: [1.5, 2.5, 6], size: [0.08, 0.2], spread: 1, additive: true, light: { intensity: 10, range: 8, duration: 0.6 } }
};

let nextInstanceId = 0;

/** Concurrent transient-instance pool cap (E20's `poolSize ?? 96` default). */
const EFFECT_INSTANCE_CAP = 96;

/** Real `AuraAppEffects` — pooled effect instances over the emitter system. */
export function createAppEffects(app: AuraApp, system: ProductionEffectSystem): import("../../contracts/effects").AuraAppEffects {
  const instances = new Map<string, EffectEntry>();
  // §6.4 impact library: every AuraVfxKind resolves to a preset carrying the
  // emitter parameters BURST_PRESETS encodes.
  const presets = new Map<string, AuraVfxEffectSpec>(
    Object.entries(BURST_PRESETS).map(([kind, p]) => [
      kind,
      {
        name: kind,
        layers: [
          {
            type: "emitter",
            effect: "particles",
            materialMode: p.additive ? "additive-glow" : "soft-alpha",
            speed: p.speed,
            life: p.life,
            gravity: p.gravity,
            color: p.color,
            size: p.size,
            spread: p.spread,
          },
        ],
      } as AuraVfxEffectSpec,
    ])
  );

  // P2-T1: presets that also hit the C-22 camera layers. `shake` feeds
  // trauma.add() after an optional configure(); `punch`/`fovKick` trigger the
  // named layers. All calls are optional-chained — the PR 0a app may have no
  // camera extension; we note once and continue (VFX_LAYER_UNAVAILABLE).
  const CAMERA_LAYERS: Record<string, { shake?: number; configure?: { maxAngleDeg?: number; maxOffset?: number; frequency?: number; decayPerSecond?: number }; punch?: { fov?: number; dolly?: number; attack?: number; hold?: number; release?: number } }> = {
    "super-flash": { shake: 0.25, configure: { maxAngleDeg: 2.5 } },
    "explosion-small": { shake: 0.45, configure: { maxAngleDeg: 3 } },
    "impact-flash": { shake: 0.2 },
    muzzle: { shake: 0.12 },
    streak: { shake: 0.08 },
    ring: { shake: 0.15 }
  };
  let cameraWarned = false;
  const applyPresetLayers = (kind: string): void => {
    const layer = CAMERA_LAYERS[kind];
    if (!layer) return;
    const cam = app.camera;
    if (!cam?.shake) {
      if (!cameraWarned) {
        cameraWarned = true;
        system.diagnostics.note("VFX_LAYER_UNAVAILABLE", kind, "camera layers skipped — no C-22 camera extension");
      }
      return;
    }
    if (layer.configure) cam.shake.configure(layer.configure);
    if (layer.shake) cam.shake.add(layer.shake);
    if (layer.punch) cam.punch?.trigger(layer.punch);
    // super-flash also flashes the C-05 output overlay (impact library spec).
    if (kind === "super-flash") {
      app.setOutputOverlay?.({ flash: [9, 7, 4, 0.85] });
    }
  };

  const spawnEmitter = (
    kind: string,
    position: AuraVec3,
    options: { count?: number; speed?: number; scale?: number; color?: AuraColor; seed?: number; intensity?: number; continuous?: boolean }
  ): AuraEffectInstanceHandle => {
    const id = `fx-${nextInstanceId++}`;
    const preset = BURST_PRESETS[kind] ?? BURST_PRESETS.spark;
    applyPresetLayers(kind);
    const color = toVec3(options.color, preset.color);
    // P2-T7 §6.2.12 light layer — tier-capped transient pool flash.
    if (preset.light) {
      system.flashLight({
        position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0],
        color: [color[0], color[1], color[2]],
        intensity: preset.light.intensity * (options.intensity ?? 1),
        range: preset.light.range,
        duration: preset.light.duration
      });
    }
    // Pool cap: recycle the oldest live instance when the pool is full.
    if (instances.size >= EFFECT_INSTANCE_CAP) {
      const oldest = instances.keys().next().value!;
      const entry = instances.get(oldest)!;
      entry.alive = false;
      if (entry.emitterId) system.removeInstance(entry.emitterId);
      instances.delete(oldest);
    }
    const emitterId = system.addInstance(id, {
      kind: "effect",
      effect: "particles",
      id,
      position,
      particleCount: options.continuous ? Math.max(64, options.count ?? 64) : Math.max(1, options.count ?? 24),
      ...(options.continuous ? {} : { burst: Math.max(1, options.count ?? 24) }),
      materialMode: preset.additive ? "additive-glow" : "soft-alpha",
      speed: options.speed ?? preset.speed[1],
      gravity: preset.gravity,
      emissionRate: options.continuous ? (options.count ?? 24) * 2 : 0,
      color,
      seed: options.seed
    });
    instances.set(id, { id, emitterId, alive: true });
    return {
      id,
      get alive() {
        return instances.get(id)?.alive ?? false;
      },
      stop: (o?: { immediate?: boolean }) => {
        const entry = instances.get(id);
        if (!entry) return;
        entry.alive = false;
        if (entry.emitterId) system.removeInstance(entry.emitterId);
        if (!o?.immediate) instances.delete(id);
      },
      setPosition: (p: AuraVec3) => system.setInstanceOrigin(id, p as readonly number[])
    };
  };

  return {
    burst(kind: AuraVfxKind, position: AuraVec3, options) {
      return spawnEmitter(kind, position, options ?? {});
    },
    spawn(effect: AuraVfxEffectSpec | AuraVfxKind, at: AuraVec3 | { node: string }, options) {
      const kind = typeof effect === "string" ? effect : effect.name;
      const position: AuraVec3 = Array.isArray(at) ? (at as unknown as AuraVec3) : [0, 0, 0];
      return spawnEmitter(kind, position, { ...(options ?? {}), continuous: true });
    },
    trail(_target, options) {
      void options;
      system.diagnostics.note("VFX_TRAIL_PENDING", "", "effects.trail lands with P2-T5 ribbons");
      return {
        id: `fx-${nextInstanceId++}`,
        get alive() {
          return false;
        },
        stop: () => {},
        setPosition: () => {}
      };
    },
    decal(_at, options) {
      system.diagnostics.note("VFX_DECAL_PENDING", "", `decal kind "${options.kind ?? "decal"}" lands with P6 decals`);
      return {
        id: `fx-${nextInstanceId++}`,
        get alive() {
          return false;
        },
        stop: () => {},
        setPosition: () => {}
      };
    },
    get presets() {
      const out = {} as Record<string, AuraVfxEffectSpec>;
      for (const [k, v] of presets) out[k] = v;
      return out as unknown as Readonly<Record<AuraVfxKind, AuraVfxEffectSpec>>;
    },
    registerPreset(kind: string, spec: AuraVfxEffectSpec) {
      presets.set(kind, spec);
    },
    get liveCount() {
      return system.liveCount();
    },
    clear() {
      for (const entry of [...instances.values()]) {
        if (entry.emitterId) system.removeInstance(entry.emitterId);
      }
      instances.clear();
    }
  };
}

/** Live-app registry + pending `createGameEffects` controllers (§6.3.4).
 * A controller created with `autoMount` (default) and no explicit `app` binds
 * itself when exactly one flag-on app is live; `GAME_EFFECTS_UNBOUND` is raised
 * on every live app's diagnostics otherwise. */
const liveApps = new Set<AuraApp>();
const appForEffectsValue = new WeakMap<object, AuraApp>();
const flagOnByApp = new WeakMap<AuraApp, boolean>();
interface PendingGameEffects {
  readonly label: string;
  readonly bind: (app: AuraApp) => void;
}
const pendingGameEffects = new Set<PendingGameEffects>();
let gameEffectsUnboundReason: string | null = null;

export function registerPendingGameEffects(rec: PendingGameEffects): void {
  pendingGameEffects.add(rec);
  adoptGameEffects(rec);
}

function adoptGameEffects(rec: PendingGameEffects): void {
  const flagOn = [...liveApps].filter((a) => flagOnByApp.get(a) === true);
  if (flagOn.length === 1) {
    pendingGameEffects.delete(rec);
    rec.bind(flagOn[0]);
    gameEffectsUnboundReason = null;
    return;
  }
  if (liveApps.size === 0) return; // stay pending until an app registers
  const reason = `game-effects "${rec.label}" cannot bind: ${flagOn.length} flag-on apps live`;
  gameEffectsUnboundReason = reason;
  for (const app of liveApps) {
    prd07SystemFor(app)?.diagnostics.note("GAME_EFFECTS_UNBOUND", rec.label, reason);
  }
}

function adoptPendingGameEffects(): void {
  for (const rec of [...pendingGameEffects]) adoptGameEffects(rec);
}

export function gameEffectsUnbound(): string | null {
  return gameEffectsUnboundReason;
}

/** True when this app's effects extension ran under A3D_QR_VFX (real API). */
export function prd07FlagOnFor(app: object): boolean {
  return flagOnByApp.get(app as AuraApp) === true;
}

export function unregisterPendingGameEffects(rec: PendingGameEffects): void {
  pendingGameEffects.delete(rec);
}

/** Test hook — clears live apps + pending controllers between cases. */
export function resetPrd07AppRegistry(): void {
  liveApps.clear();
  pendingGameEffects.clear();
  gameEffectsUnboundReason = null;
}

function releasePrd07App(value: object): void {
  const app = appForEffectsValue.get(value);
  if (app) liveApps.delete(app);
}

/** C-38 factory: returns the real API under A3D_QR_VFX, the PR 0a stub otherwise.
 * The ProductionEffectSystem is created even when the flag is off — the
 * diagnostics section needs it to detect the flag-off zero-pixel state
 * (P1-T2's whole point is reporting the bug). The stub keeps flag-off API
 * surface identical; no draws reach the renderer because the prd07.particles
 * contributor is flag-gated. */
export function createEffectsExtension(app: AuraApp, ctx: AuraEffectsExtensionContext): import("../../contracts/effects").AuraAppEffects {
  bindPrd07RendererFlags(ctx.flags);
  const system = registerPrd07System(app, () => new ProductionEffectSystem(app as unknown as AppLike));
  if (app.canvas) attachVfxBridge(app.canvas, system);
  const flagOn = ctx.flags.on("A3D_QR_VFX");
  flagOnByApp.set(app, flagOn);
  liveApps.add(app);
  const fx = flagOn ? createAppEffects(app, system) : new StubAppEffects(() => null);
  appForEffectsValue.set(fx, app);
  adoptPendingGameEffects();
  return fx;
}

/** Called by the lane's AppExtension dispose hook — drops the app from the live registry. */
export function prd07AppDisposed(value: object): void {
  releasePrd07App(value);
}

/** Per-app system registry — also backs app.diagnostics() collection. */
const systems = new WeakMap<AuraApp, ProductionEffectSystem>();

export function registerPrd07System(app: AuraApp, create: () => ProductionEffectSystem): ProductionEffectSystem {
  let system = systems.get(app);
  if (!system) {
    system = create();
    systems.set(app, system);
  }
  return system;
}

export function prd07SystemFor(app: AuraApp): ProductionEffectSystem | null {
  return systems.get(app) ?? null;
}

function toVec3(c: AuraColor | undefined, fallback: [number, number, number]): [number, number, number] {
  if (typeof c === "string" && c.startsWith("#") && c.length === 7) {
    return [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
  }
  if (Array.isArray(c) && c.length >= 3) return [Number(c[0]), Number(c[1]), Number(c[2])];
  return fallback;
}
