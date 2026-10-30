// PRD-07 P1-T2/P1-T14 — real `app.effects` factory (C-38 member "effects").
// Wraps the per-app ProductionEffectSystem; falls back to StubAppEffects when
// the A3D_QR_VFX flag is off so flag-off behaviour is byte-identical.

import type { AuraApp, AuraVec3, AuraColor, AuraCreateAppOptions } from "../index";
import type { AuraVfxKind, AuraVfxEffectSpec, AuraEffectInstanceHandle, AuraBurstOptions, AuraDecalOptions } from "../../contracts/effects";
import type { QrFlags, AuraQualityTier } from "@aura3d/rendering/contracts";
import { StubAppEffects } from "../../contracts/effects";
import { ProductionEffectSystem, type AppLike } from "../../production-runtime/effects/ProductionEffectSystem";
import type { EffectNodeLike } from "../../production-runtime/effects/EffectNodeLowering";
import { attachVfxBridge } from "./bridge";

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
  /** GU47 E-F: atlas sprite the preset's particles sample (absent: the soft-dot). */
  readonly sprite?: string;
}

/** Largest on-screen diameter (fraction of the viewport height) per preset; flashes and explosions may be bigger. */
const PRESET_MAX_SCREEN: Record<string, number> = { "explosion-small": 0.12, "impact-flash": 0.15, "super-flash": 0.2, "aura-burst": 0.06 };

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

/** super-flash C-05 overlay flash: LDR warm white, 0.3 peak, 180 ms decay. */
const SUPER_FLASH = { color: [1, 0.9, 0.72] as const, peak: 0.3, ms: 180 };

/** HDR colour → chromaticity (max component 1); LDR colours pass unchanged. */
function lightChromaticity(c: readonly number[]): [number, number, number] {
  const m = Math.max(1, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
  return [(c[0] ?? 0) / m, (c[1] ?? 0) / m, (c[2] ?? 0) / m];
}

/** Options every spawn path takes: the public burst options plus the internal continuous/attach switches. */
type SpawnOptions = AuraBurstOptions & { readonly continuous?: boolean; readonly attachTo?: unknown };

/** One pooled emitter's parameters: a built-in preset row, or a registered preset's emitter layer over its base. */
interface EmitterRecipe {
  readonly speed: readonly [number, number];
  readonly life: readonly [number, number];
  readonly gravity: number;
  readonly color: readonly [number, number, number];
  readonly size: readonly [number, number];
  readonly spread: number;
  readonly additive: boolean;
  readonly blend?: "alpha" | "premultiplied" | "additive" | "multiply";
  readonly count?: number;
  readonly sprite?: unknown;
  readonly maxScreen?: number;
  readonly drag?: number;
  readonly direction?: readonly [number, number, number];
}

function builtinRecipe(kind: string): EmitterRecipe {
  const preset = BURST_PRESETS[kind] ?? BURST_PRESETS.spark;
  return { speed: preset.speed, life: preset.life, gravity: preset.gravity, color: preset.color, size: preset.size, spread: preset.spread, additive: preset.additive, ...(preset.sprite !== undefined ? { sprite: preset.sprite } : {}) };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rangeOr(value: unknown, fallback: readonly [number, number]): readonly [number, number] {
  if (typeof value === "number" && Number.isFinite(value)) return [value, value];
  if (Array.isArray(value) && typeof value[0] === "number") return [value[0], typeof value[1] === "number" ? value[1] : value[0]];
  return fallback;
}

const LAYER_BLENDS = new Set(["alpha", "premultiplied", "additive", "multiply"]);

/**
 * GU47 E-F: a registered preset's emitter layer over its base row. The base is the built-in (or genre
 * variant) named by `layer.preset`, else the built-in of the preset's own name, else `spark`. Recognised layer
 * fields: count, speed, life | lifetime, gravity (number or vec3: y is used), color (hex or linear rgb),
 * intensity (multiplies color), size, spread, additive | blend | materialMode, sprite, maxScreen, drag, direction.
 */
function recipeFromLayer(kind: string, layer: Readonly<Record<string, unknown>>): EmitterRecipe {
  const baseKind = typeof layer.preset === "string" && BURST_PRESETS[layer.preset] ? layer.preset : kind;
  const base = builtinRecipe(baseKind);
  const gravity = Array.isArray(layer.gravity) ? numberOr(layer.gravity[1], base.gravity) : numberOr(layer.gravity, base.gravity);
  const rawColor = typeof layer.color === "string" || Array.isArray(layer.color) ? toVec3(layer.color as AuraColor, [...base.color] as [number, number, number]) : base.color;
  const intensity = numberOr(layer.intensity, 1);
  const blend = typeof layer.blend === "string" && LAYER_BLENDS.has(layer.blend) ? (layer.blend as EmitterRecipe["blend"]) : undefined;
  const additive = typeof layer.additive === "boolean"
    ? layer.additive
    : blend !== undefined
      ? blend === "additive"
      : typeof layer.materialMode === "string"
        ? ["additive-glow", "spark", "star"].includes(layer.materialMode)
        : base.additive;
  const direction = Array.isArray(layer.direction) && layer.direction.length >= 3 ? [Number(layer.direction[0]), Number(layer.direction[1]), Number(layer.direction[2])] as const : undefined;
  return {
    speed: rangeOr(layer.speed, base.speed),
    life: rangeOr(layer.life ?? layer.lifetime, base.life),
    gravity,
    color: [rawColor[0] * intensity, rawColor[1] * intensity, rawColor[2] * intensity],
    size: rangeOr(layer.size, base.size),
    spread: numberOr(layer.spread, base.spread),
    additive,
    ...(blend !== undefined ? { blend } : {}),
    ...(typeof layer.count === "number" && layer.count > 0 ? { count: Math.round(layer.count) } : {}),
    ...(layer.sprite !== undefined ? { sprite: layer.sprite } : base.sprite !== undefined ? { sprite: base.sprite } : {}),
    ...(typeof layer.maxScreen === "number" && layer.maxScreen > 0 ? { maxScreen: layer.maxScreen } : {}),
    ...(typeof layer.drag === "number" ? { drag: layer.drag } : {}),
    ...(direction ? { direction } : {})
  };
}

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
    if (kind === "super-flash") startOverlayFlash();
  };

  /*
   * The overlay flash is added after tone mapping (display range), so it must
   * be an LDR colour and it must decay. The old one-shot `[9, 7, 4, 0.85]`
   * added ~7.6 to every pixel and was never cleared: one super-flash left the
   * frame clipped white until some other caller replaced the overlay.
   * Envelope: peak · exp(-5·t/ms), cleared to {} at t >= ms (same shape as the
   * game juice overlay driver).
   */
  let flashAge = -1;
  let offFlashFrame: (() => void) | null = null;
  const writeFlash = (): void => {
    if (flashAge < 0 || flashAge >= SUPER_FLASH.ms / 1000) {
      flashAge = -1;
      app.setOutputOverlay?.({});
      offFlashFrame?.();
      offFlashFrame = null;
      return;
    }
    const amount = SUPER_FLASH.peak * Math.exp((-5 * flashAge * 1000) / SUPER_FLASH.ms);
    app.setOutputOverlay?.({ flash: [...SUPER_FLASH.color, amount] });
  };
  const startOverlayFlash = (): void => {
    flashAge = 0;
    writeFlash();
    if (!offFlashFrame && typeof app.onFrame === "function") {
      offFlashFrame = app.onFrame((frame: { dt: number }) => {
        if (flashAge < 0) return;
        flashAge += Math.max(0, frame.dt);
        writeFlash();
      });
    }
  };

  /** GU47 E-F: presets registered by the app; `burst`/`spawn` resolve these before the built-in table. */
  const registered = new Map<string, AuraVfxEffectSpec>();
  let unsupportedLayerNoted = false;

  // GU47 E-F: delayed preset layers (`layer.at` seconds), fired from the app frame loop.
  interface PendingLayer { readonly due: number; readonly fire: () => void; cancelled: boolean; done: boolean }
  const pendingLayers: PendingLayer[] = [];
  let layerClock = 0;
  let offLayerFrame: (() => void) | null = null;
  const scheduleLayer = (delay: number, fire: () => void): PendingLayer => {
    const entry: PendingLayer = { due: layerClock + delay, fire, cancelled: false, done: false };
    pendingLayers.push(entry);
    if (!offLayerFrame && typeof app.onFrame === "function") {
      offLayerFrame = app.onFrame((frame: { dt: number }) => {
        layerClock += Math.max(0, frame.dt);
        for (let i = 0; i < pendingLayers.length; ) {
          const pending = pendingLayers[i];
          if (pending.cancelled || pending.due <= layerClock) {
            pendingLayers.splice(i, 1);
            pending.done = true;
            if (!pending.cancelled) pending.fire();
          } else i += 1;
        }
      });
    }
    return entry;
  };

  /** Create one pooled emitter instance; returns its id (also the system emitter id). */
  const spawnInstance = (recipe: EmitterRecipe, kind: string, position: AuraVec3, options: SpawnOptions): string => {
    const id = `fx-${nextInstanceId++}`;
    const color = toVec3(options.color, recipe.color);
    const sizeScale = options.scale !== undefined && Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
    // Pool cap: recycle the oldest live instance when the pool is full.
    if (instances.size >= EFFECT_INSTANCE_CAP) {
      const oldest = instances.keys().next().value!;
      const entry = instances.get(oldest)!;
      entry.alive = false;
      if (entry.emitterId) system.removeInstance(entry.emitterId);
      instances.delete(oldest);
    }
    const count = options.count ?? recipe.count;
    const sprite = (options.sprite ?? recipe.sprite) as EffectNodeLike["sprite"];
    const emitterId = system.addInstance(id, {
      kind: "effect",
      effect: "particles",
      id,
      position,
      particleCount: options.continuous ? Math.max(64, count ?? 64) : Math.max(1, count ?? 24),
      ...(options.continuous ? {} : { burst: Math.max(1, count ?? 24) }),
      materialMode: recipe.additive ? "additive-glow" : "soft-alpha",
      ...(recipe.blend !== undefined ? { blend: recipe.blend } : {}),
      speed: options.speed ?? recipe.speed,
      gravity: recipe.gravity,
      // The preset's own life, size and spread: without them every kind inherited the
      // emitter defaults (1.2 to 2.4 s lifetime, 5 to 14 cm glow discs) and read as lingering bubbles.
      lifetime: recipe.life,
      size: [recipe.size[0] * sizeScale, recipe.size[1] * sizeScale],
      spread: recipe.spread,
      // a preset's soft discs never grow past this share of the screen height: sparks and dust stay specks, not bubbles
      maxScreen: recipe.maxScreen ?? PRESET_MAX_SCREEN[kind] ?? 0.05,
      emissionRate: options.continuous ? (count ?? 24) * 2 : 0,
      color,
      seed: options.seed,
      ...(recipe.drag !== undefined ? { drag: recipe.drag } : {}),
      ...(recipe.direction !== undefined ? { direction: recipe.direction } : {}),
      // GU47 E-F: atlas sprite (call site, else preset) and node following.
      ...(sprite !== undefined ? { sprite } : {}),
      ...(options.attachTo !== undefined ? { attachTo: options.attachTo } : {})
    });
    instances.set(id, { id, emitterId, alive: true });
    return id;
  };

  const stopInstance = (id: string, immediate: boolean | undefined): void => {
    const entry = instances.get(id);
    if (!entry) return;
    entry.alive = false;
    if (entry.emitterId) system.removeInstance(entry.emitterId);
    if (!immediate) instances.delete(id);
  };

  /** Built-in preset path (unchanged behaviour): camera layer, light layer, one pooled emitter. */
  const spawnBuiltin = (kind: string, position: AuraVec3, options: SpawnOptions): AuraEffectInstanceHandle => {
    const preset = BURST_PRESETS[kind] ?? BURST_PRESETS.spark;
    if (options.camera !== false) applyPresetLayers(kind);
    const color = toVec3(options.color, preset.color);
    // P2-T7 §6.2.12 light layer — tier-capped transient pool flash.
    if (preset.light) {
      system.flashLight({
        position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0],
        // The particle colour is HDR (up to 9); the light takes chromaticity
        // only so `intensity` alone sets the flash energy (9 × 20 = 180 blew
        // every lit surface in range to white).
        color: lightChromaticity(color),
        intensity: preset.light.intensity * (options.intensity ?? 1),
        range: preset.light.range,
        duration: preset.light.duration
      });
    }
    const id = spawnInstance(builtinRecipe(kind), kind, position, options);
    return {
      id,
      get alive() {
        return instances.get(id)?.alive ?? false;
      },
      stop: (o?: { immediate?: boolean }) => stopInstance(id, o?.immediate),
      setPosition: (p: AuraVec3) => system.setInstanceOrigin(id, p as readonly number[])
    };
  };

  /**
   * GU47 E-F registered preset path: every layer of the spec fires at `position` (after `layer.at` seconds):
   * emitter layers spawn pooled emitters (one-shot bursts for named presets, continuous for authored spec
   * objects), light layers flash the transient pool, camera layers shake/punch, decal layers place a decal.
   */
  const spawnSpec = (spec: AuraVfxEffectSpec, position: AuraVec3, options: SpawnOptions): AuraEffectInstanceHandle => {
    const groupId = `fx-${nextInstanceId++}`;
    const members: string[] = [];
    const timers: PendingLayer[] = [];
    let stopped = false;
    let firstColor: readonly number[] | undefined;
    const fireLayer = (layer: Readonly<Record<string, unknown>> & { readonly type: string }): void => {
      if (stopped) return;
      switch (layer.type) {
        case "emitter": {
          const recipe = recipeFromLayer(spec.name, layer);
          firstColor ??= toVec3(options.color, recipe.color);
          members.push(spawnInstance(recipe, spec.name, position, options));
          break;
        }
        case "light": {
          const color = typeof layer.color === "string" || Array.isArray(layer.color) ? toVec3(layer.color as AuraColor, [1, 1, 1]) : firstColor ?? [1, 1, 1];
          system.flashLight({
            position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0],
            color: lightChromaticity(color),
            intensity: numberOr(layer.intensity, 8) * (options.intensity ?? 1),
            range: numberOr(layer.range, 6),
            duration: numberOr(layer.duration, 0.25)
          });
          break;
        }
        case "camera": {
          if (options.camera === false) break;
          const cam = app.camera;
          if (!cam?.shake) {
            if (!cameraWarned) {
              cameraWarned = true;
              system.diagnostics.note("VFX_LAYER_UNAVAILABLE", spec.name, "camera layers skipped — no C-22 camera extension");
            }
            break;
          }
          const configure = layer.configure as Parameters<NonNullable<typeof cam.shake>["configure"]>[0] | undefined;
          if (configure) cam.shake.configure(configure);
          if (typeof layer.shake === "number") cam.shake.add(layer.shake);
          if (layer.punch && typeof layer.punch === "object") cam.punch?.trigger(layer.punch as Parameters<NonNullable<typeof cam.punch>["trigger"]>[0]);
          break;
        }
        case "decal": {
          const handle = spawnDecal(
            { position, normal: options.normal ?? [0, 1, 0] },
            {
              ...(typeof layer.size === "number" ? { size: layer.size } : {}),
              ...(typeof layer.lifetime === "number" ? { lifetime: layer.lifetime } : {}),
              ...(typeof layer.opacity === "number" ? { opacity: layer.opacity } : {}),
              ...(layer.color !== undefined ? { color: layer.color as AuraColor } : {})
            }
          );
          members.push(handle.id);
          break;
        }
        default:
          if (!unsupportedLayerNoted) {
            unsupportedLayerNoted = true;
            system.diagnostics.note("VFX_PRESET_LAYER_UNSUPPORTED", spec.name, `preset layer type "${layer.type}" is not spawned by burst/spawn (emitter, light, camera and decal are)`);
          }
      }
    };
    // A spec without layers is its named built-in (or spark) as one emitter, as before GU47.
    const layers: AuraVfxEffectSpec["layers"] = spec.layers.length > 0 ? spec.layers : [{ type: "emitter" }];
    for (const layer of layers) {
      const delay = typeof layer.at === "number" && layer.at > 0 ? layer.at : 0;
      if (delay > 0) timers.push(scheduleLayer(delay, () => fireLayer(layer)));
      else fireLayer(layer);
    }
    return {
      id: groupId,
      get alive() {
        return !stopped && (members.some((member) => instances.get(member)?.alive === true) || timers.some((timer) => !timer.cancelled && !timer.done));
      },
      stop: (o?: { immediate?: boolean }) => {
        stopped = true;
        for (const timer of timers) timer.cancelled = true;
        for (const member of members) {
          if (instances.has(member)) stopInstance(member, o?.immediate);
          else system.removeInstance(member);
        }
      },
      setPosition: (p: AuraVec3) => {
        for (const member of members) system.setInstanceOrigin(member, p as readonly number[]);
      }
    };
  };

  const spawnEmitter = (kind: string, position: AuraVec3, options: SpawnOptions): AuraEffectInstanceHandle => {
    const spec = registered.get(kind);
    return spec ? spawnSpec(spec, position, options) : spawnBuiltin(kind, position, options);
  };

  // P6-T1 — runtime decal routed through the merged DecalBatch (§6.9) under A3D_QR_VFX_DECALS.
  const spawnDecal = (at: { position: AuraVec3; normal: AuraVec3; target?: string }, options: AuraDecalOptions | undefined): AuraEffectInstanceHandle => {
    const id = `fx-${nextInstanceId++}`;
    const size = Math.max(0.01, options?.size ?? 0.5);
    system.addInstance(id, {
      kind: "effect",
      effect: "decal",
      id,
      position: at.position,
      decal: {
        size: [size, size],
        normal: at.normal,
        baseOpacity: options?.opacity ?? 0.85,
        ...(options?.color !== undefined ? { color: options.color } : {}),
        ...(options?.lifetime !== undefined ? { lifetime: options.lifetime } : {})
      }
    });
    return {
      id,
      get alive() {
        return true;
      },
      stop: () => system.removeInstance(id),
      setPosition: (p: AuraVec3) => system.setInstanceOrigin(id, p as readonly number[])
    };
  };

  return {
    get runtime() {
      return system.runtimeEffects;
    },
    set runtime(mode: "on" | "off") {
      system.setRuntimeEffects(mode);
    },
    burst(kind: AuraVfxKind | (string & {}), position: AuraVec3, options?: AuraBurstOptions) {
      return spawnEmitter(kind, position, options ?? {});
    },
    spawn(effect: AuraVfxEffectSpec | AuraVfxKind | (string & {}), at: AuraVec3 | { node: string; socket?: string }, options) {
      // GU47 E-F: `{ node, socket }` (or the spec's own attachTo) makes the effect follow that node; the old
      // code spawned it at the world origin.
      const onNode = !Array.isArray(at) && typeof (at as { node?: unknown }).node === "string";
      const position: AuraVec3 = Array.isArray(at) ? (at as unknown as AuraVec3) : [0, 0, 0];
      const attachTo = onNode ? at : typeof effect === "string" ? undefined : effect.attachTo;
      const spawnOptions: SpawnOptions = { ...(options ?? {}), continuous: typeof effect !== "string", ...(attachTo !== undefined ? { attachTo } : {}) };
      // A named preset (registered first, then built-in) is a one-shot impact: it bursts and dies with its
      // particles. Only an authored AuraVfxEffectSpec object is a looping effect that the caller stops.
      return typeof effect === "string" ? spawnEmitter(effect, position, spawnOptions) : spawnSpec(effect, position, spawnOptions);
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
    decal(at, options) {
      return spawnDecal(at, options);
    },
    get presets() {
      const out = {} as Record<string, AuraVfxEffectSpec>;
      for (const [k, v] of presets) out[k] = v;
      return out as unknown as Readonly<Record<AuraVfxKind, AuraVfxEffectSpec>>;
    },
    registerPreset(kind: string, spec: AuraVfxEffectSpec) {
      // GU47 E-F: registered names (new or overriding a built-in) resolve in burst/spawn before BURST_PRESETS.
      registered.set(kind, spec);
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
  const system = registerPrd07System(app, () => new ProductionEffectSystem(app as unknown as AppLike, {
    // T0-34 FIX-transient-lights: resolved C-27 tier from app.quality, not a
    // hard-coded "high" (controls transient-light cap and particle budget).
    tier: (app as { quality?: { tier?: AuraQualityTier } }).quality?.tier
  }));
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
