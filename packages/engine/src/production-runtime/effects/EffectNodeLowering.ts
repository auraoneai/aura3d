// PRD-07 P1-T13 — Aura effect-node lowering (PRD-07 §6.3.1 + §11 mapping).
// Particles / flipbook-sprite lower to CpuEmitter descriptors; rain / snow
// lower to a §8.2 camera-following ProceduralVolumeEmitter spec (a point
// emitter cannot fill a weather volume — it collapsed to a 5 cm needle at
// the node origin and drew nothing); beam (light-beam) lowers to a beam
// record; every other kind maps to `null` (post/other consumer — reported
// in diagnostics as non-particle kinds).

import type { EmitterDescriptor } from "./CpuEmitter";
import type { AuraVec3 } from "./CpuEmitter";
import { VOLUME_PRESETS, VOLUME_SPRITE_LIMITS, type VolumeEmitterSpec } from "@aura3d/rendering";
import { VFX_SPRITE_LAYOUT, isVfxBuiltinSprite } from "./FlipbookAtlas";
import type { AuraVfxBuiltinSequence } from "../../agent-api/vfx/atlas";

export interface EffectNodeLike {
  readonly kind: string;
  readonly effect?: string;
  readonly name?: string;
  readonly id?: string;
  readonly position?: AuraVec3;
  readonly particleCount?: number;
  readonly emitter?: "fountain" | "swirl" | "ambient";
  readonly color?: string | readonly number[];
  readonly speed?: number | readonly [number, number];
  readonly gravity?: number | AuraVec3;
  readonly emissionRate?: number;
  readonly radius?: number;
  readonly height?: number;
  readonly wind?: AuraVec3;
  readonly turbulence?: number;
  readonly materialMode?: string;
  readonly spriteColumns?: number;
  readonly spriteRows?: number;
  readonly frameRate?: number;
  /** flipbook-sprite: wrap frames (default true) or play once over life. */
  readonly loop?: boolean;
  readonly intensity?: number;
  /** weather density (0..1) — scales the rain/snow volume particle count. */
  readonly density?: number;
  readonly mist?: boolean;
  readonly splashes?: boolean;
  readonly seed?: number;
  // PRD-07 §6.2 emitter surface (options accepted by effects.particles).
  readonly blend?: "alpha" | "premultiplied" | "additive" | "multiply" | "opaque";
  readonly size?: number | readonly [number, number];
  readonly maxParticles?: number;
  readonly prewarm?: number;
  readonly rate?: number;
  readonly lifetime?: number | readonly [number, number];
  readonly drag?: number;
  readonly spread?: number;
  readonly direction?: AuraVec3;
  readonly softDistance?: number;
  readonly nearFade?: number;
  /** Largest on-screen particle diameter as a fraction of the viewport height (0 or absent: uncapped). */
  readonly maxScreen?: number;
  /** P6-T4: mark the batch eligible for the optional half-res particle path. */
  readonly lowRes?: boolean;
  /** One-shot spawn count at t=0 (effects.burst). */
  readonly burst?: number;
  // §6.2.9 trail fields (effects.trail). `path` seeds a static ring (bench
  // scenes); `target` is resolved per frame when it names a scene node.
  readonly width?: number;
  readonly maxPoints?: number;
  readonly minVertexDistance?: number;
  readonly orientation?: "camera" | "surface";
  readonly surfaceNormal?: AuraVec3;
  readonly path?: readonly (readonly number[])[];
  readonly target?: string;
  // §6.2.10 beam-family fields (light-beam / lightCone / auroraRibbon).
  readonly from?: AuraVec3;
  readonly to?: AuraVec3;
  readonly widthWorld?: number;
  readonly segmentCount?: number;
  readonly length?: number;
  readonly coneAngle?: number;
  readonly softness?: number;
  readonly segments?: number;
  readonly sway?: number;
  readonly shimmer?: number;
  readonly colorTop?: string | readonly number[];
  // §6.2.11 mesh-particle fields.
  readonly spin?: number;
  readonly groundBounce?: number;
  readonly castShadow?: boolean;
  readonly mesh?: string;
  // §6.9 decal descriptor on `effect: "decal"` runtime instances (P6).
  readonly decal?: {
    readonly size?: readonly [number, number];
    readonly baseOpacity?: number;
    readonly fade?: { readonly angleStart?: number; readonly angleEnd?: number; readonly near?: number; readonly far?: number };
    readonly polygonOffset?: { readonly factor: number; readonly units: number };
    readonly normalOffset?: number;
    readonly normal?: AuraVec3;
    readonly textureUrl?: string;
    readonly color?: string | readonly number[];
    /** Seconds before fade-out ends the decal (default: permanent). */
    readonly lifetime?: number;
  };
  /** Group nodes nest authored children; false-visible groups hide the subtree. */
  readonly children?: readonly EffectNodeLike[];
  readonly visible?: boolean;
  /** §8.3 sim backend: "gpu" forces ParticleGpuSim, "auto" picks by count. */
  readonly simulation?: "auto" | "cpu" | "gpu";
  /**
   * GU47 E-F emitter sprite: a built-in sequence of the baked VFX atlas ("smoke-a", "dust-mote", ...) or a
   * texture sheet `{ atlas: assets.sheet | url, frame? }` (grid from `spriteColumns` × `spriteRows`).
   */
  readonly sprite?: string | { readonly atlas?: unknown; readonly frame?: number };
  /** GU47 E-F `effects.flipbook({ texture })`: sprite-sheet texture asset ref or URL. */
  readonly texture?: unknown;
}

/**
 * GU47 E-F: the sprite a particle batch samples. `builtin` is a sequence of the baked VFX page (premultiplied
 * sRGB); `texture` is a whole texture asset (straight-alpha sRGB sheet) holding one fixed `frame` of its grid.
 */
export type LoweredSprite =
  | { readonly kind: "builtin"; readonly name: AuraVfxBuiltinSequence; readonly columns: number; readonly rows: number; readonly frames: number; readonly fps?: number; readonly loop?: boolean }
  | { readonly kind: "texture"; readonly url: string; readonly columns: number; readonly rows: number; readonly frames: number; readonly frame: number };

export interface LoweredParticleEffect {
  readonly type: "emitter";
  readonly nodeId: string;
  readonly effect: string;
  readonly batch: LoweredBatchSpec;
  readonly emitter: EmitterDescriptor;
  readonly consumer: "particle-pass";
  readonly sim: "cpu" | "gpu";
  /** GU47 E-F: atlas sprite the batch samples (absent: the analytic soft-dot). */
  readonly sprite?: LoweredSprite;
}

export interface LoweredBeamEffect {
  readonly type: "beam";
  readonly nodeId: string;
  readonly effect: string;
  readonly consumer: "beam-pass";
  readonly sim: "procedural";
}

/**
 * §8.2 procedural weather volume (rain/snow): camera-following wrapped box
 * whose positions are a pure function of (id, t, camera) — no stepped sim.
 * `count` is the fixed live count submitted to the instanced particle pass.
 */
export interface LoweredVolumeEffect {
  readonly type: "volume";
  readonly nodeId: string;
  readonly effect: string;
  readonly batch: LoweredBatchSpec;
  readonly volume: VolumeEmitterSpec;
  readonly count: number;
  readonly consumer: "particle-pass";
  readonly sim: "procedural";
}

export interface LoweredOtherEffect {
  readonly type: "other";
  readonly nodeId: string;
  readonly effect: string;
  readonly consumer: "post" | "scene-fog" | "ribbon-pass" | "mesh-pass" | "decal-pass" | "none";
  readonly sim: "none";
}

export type LoweredEffect = LoweredParticleEffect | LoweredBeamEffect | LoweredVolumeEffect | LoweredOtherEffect;

export interface LoweredBatchSpec {
  readonly blend: "alpha" | "premultiplied" | "additive" | "multiply";
  readonly shading: "unlit" | "lit";
  readonly softDepth: boolean;
  readonly softDistance?: number;
  readonly nearFade?: number;
  readonly maxScreen?: number;
  readonly stretch: boolean;
  readonly frameBlend: boolean;
  readonly atlasKey: string;
  /** P6-T4: half-res path eligibility (default off). */
  readonly lowRes?: boolean;
}

const COLOR_TABLE: Record<string, readonly [number, number, number]> = {
  "additive-glow": [2.0, 1.1, 0.45],
  spark: [3.0, 1.8, 0.6],
  smoke: [0.28, 0.28, 0.3],
  splash: [0.45, 0.65, 0.9],
  dust: [0.6, 0.55, 0.45],
  star: [3.0, 3.0, 2.4],
  "soft-alpha": [1, 1, 1]
};

const ADDITIVE_MODES = new Set(["additive-glow", "spark", "star"]);

const VALID_BLENDS = new Set(["alpha", "premultiplied", "additive", "multiply"]);

type Blend = "alpha" | "premultiplied" | "additive" | "multiply";

function asRange(v: number | readonly [number, number] | undefined): readonly [number, number] | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return [v, v];
  return [v[0], v[1] ?? v[0]];
}

function hashSeed(nodeId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < nodeId.length; i++) {
    h ^= nodeId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nodeColor(node: EffectNodeLike): readonly [number, number, number] {
  const c = node.color;
  if (Array.isArray(c) && c.length >= 3) return [Number(c[0]), Number(c[1]), Number(c[2])];
  if (typeof c === "string" && c.startsWith("#") && c.length === 7) {
    // Hex colours are sRGB-encoded (three.js `Color` parity): the particle
    // program shades in linear HDR, so decode before it reaches the instance.
    return [
      srgbChannelToLinear(parseInt(c.slice(1, 3), 16) / 255),
      srgbChannelToLinear(parseInt(c.slice(3, 5), 16) / 255),
      srgbChannelToLinear(parseInt(c.slice(5, 7), 16) / 255)
    ];
  }
  return COLOR_TABLE[node.materialMode ?? "soft-alpha"] ?? [1, 1, 1];
}

/** IEC 61966-2-1 sRGB → linear for one channel in [0, 1]. */
export function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * §11 legacy `emitter: "fountain"` + `radius`/`height` → shape + velocity
 * preset: launch speed whose apex (under the emitter's gravity and drag)
 * reaches `height`, so the plume fills `[0, height]` above a `radius` disc
 * instead of collapsing to a ~0.3 m mound at the base (speed 1 m/s against
 * -1.2 m/s² gravity). A scalar `speed` scales the preset (default 1).
 */
export function fountainLaunchSpeed(height: number, gravity: number, drag: number, life: number): number {
  const g = Math.max(0, -gravity);
  if (!(height > 0)) return 0;
  if (g < 0.05) return height / Math.max(life, 0.1);
  const apex = (v0: number): number => {
    let y = 0;
    let v = v0;
    for (let i = 0; i < 1200 && v > 0; i++) {
      v = v * Math.max(0, 1 - drag / 60) - g / 60;
      y += v / 60;
    }
    return y;
  };
  let lo = 0;
  let hi = Math.sqrt(2 * g * height) * 3;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (apex(mid) < height) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** §8.3 sim backend: "gpu" forces it, "auto"/unset picks gpu past the CPU cap. */
const GPU_AUTO_THRESHOLD = 4096;
function simFor(node: EffectNodeLike, count: number): "cpu" | "gpu" {
  if (node.simulation === "gpu") return "gpu";
  if (node.simulation === "cpu") return "cpu";
  return count > GPU_AUTO_THRESHOLD ? "gpu" : "cpu";
}

/**
 * URL of a texture asset value: an `assets.x` ref (`{ kind: "aura-asset-ref", type: "texture", url }`), a
 * texture-like object with a `url`, or a plain URL string. Null when the value carries no URL.
 */
export function textureAssetUrl(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "object" && value !== null) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === "string" && url.length > 0) return url;
  }
  return null;
}

/**
 * GU47 E-F: resolve an emitter `sprite`. Built-in names other than "soft-dot" sample their atlas sequence;
 * "soft-dot", an absent sprite, an unknown name or an atlas without a URL keep the analytic soft-dot, so
 * scenes that do not opt in lower byte-identically.
 */
export function lowerSprite(node: Pick<EffectNodeLike, "sprite" | "spriteColumns" | "spriteRows">): LoweredSprite | undefined {
  const sprite = node.sprite;
  if (typeof sprite === "string") {
    if (sprite === "soft-dot" || !isVfxBuiltinSprite(sprite)) return undefined;
    const layout = VFX_SPRITE_LAYOUT[sprite];
    return {
      kind: "builtin",
      name: sprite,
      columns: layout.columns,
      rows: layout.rows,
      frames: layout.frames,
      ...(layout.fps !== undefined ? { fps: layout.fps } : {}),
      ...(layout.loop ? { loop: true } : {})
    };
  }
  if (typeof sprite === "object" && sprite !== null) {
    const url = textureAssetUrl(sprite.atlas);
    if (!url) return undefined;
    const columns = Math.max(1, Math.round(node.spriteColumns ?? 1));
    const rows = Math.max(1, Math.round(node.spriteRows ?? 1));
    const frames = columns * rows;
    const frame = Math.min(frames - 1, Math.max(0, Math.floor(sprite.frame ?? 0)));
    return { kind: "texture", url, columns, rows, frames, frame };
  }
  return undefined;
}

/** Batch atlas key of a sprite: batches merge only when they sample the same texture. */
export function spriteAtlasKey(sprite: LoweredSprite): string {
  return sprite.kind === "builtin" ? `vfx:${sprite.name}` : `tex:${sprite.url}:${sprite.columns}x${sprite.rows}`;
}

/** Lower one scene node; `seed` overrides hashing (benchmark scenes pin it). */
export function lowerEffectNode(node: EffectNodeLike, seedOverride?: number): LoweredEffect {
  const nodeId = node.id ?? node.name ?? `effect-${node.effect ?? "none"}`;
  const effect = node.effect ?? "particles";
  const position = node.position ?? [0, 0, 0];

  switch (effect) {
    case "particles": {
      const materialMode = node.materialMode ?? "soft-alpha";
      const additive = ADDITIVE_MODES.has(materialMode);
      const blend: Blend = node.blend && VALID_BLENDS.has(node.blend) ? (node.blend as Blend) : additive ? "additive" : "alpha";
      const count = Math.max(1, Math.min(200000, Math.round(node.maxParticles ?? node.particleCount ?? 200)));
      const gravity = typeof node.gravity === "number" ? node.gravity : Array.isArray(node.gravity) ? node.gravity[1] ?? 0 : additive ? -1.2 : -0.6;
      const drag = node.drag ?? 0.12;
      const life = asRange(node.lifetime) ?? [1.2, 2.4];
      // §11: fountain + authored height → plume preset (scalar speed scales it).
      const plume = (node.emitter ?? "fountain") === "fountain" && typeof node.height === "number" && node.height > 0 && !Array.isArray(node.speed);
      const plumeSpeed = plume ? fountainLaunchSpeed(node.height!, gravity, drag, life[1]) * (typeof node.speed === "number" ? node.speed : 1) : 0;
      const speedScalar = typeof node.speed === "number" ? node.speed : node.emitter === "fountain" ? 3 : 1;
      const speedRange: readonly [number, number] = plume && plumeSpeed > 0
        ? [plumeSpeed * 0.85, plumeSpeed]
        : asRange(node.speed) ?? [speedScalar * 0.7, speedScalar];
      // GU47 E-F: an atlas sprite replaces the analytic soft-dot (own batch key, frame blend on multi-frame sequences).
      const sprite = lowerSprite(node);
      const atlasKey = sprite ? spriteAtlasKey(sprite) : "soft-dot";
      return {
        type: "emitter",
        nodeId,
        effect,
        consumer: "particle-pass",
        sim: simFor(node, count),
        batch: {
          blend,
          shading: "unlit",
          softDepth: node.softDistance !== undefined ? true : materialMode !== "spark",
          ...(node.softDistance !== undefined ? { softDistance: node.softDistance } : {}),
          ...(node.nearFade !== undefined ? { nearFade: node.nearFade } : {}),
          ...(node.maxScreen !== undefined && node.maxScreen > 0 ? { maxScreen: node.maxScreen } : {}),
          stretch: materialMode === "spark",
          frameBlend: sprite?.kind === "builtin" && sprite.frames > 1,
          atlasKey,
          ...(node.lowRes === true ? { lowRes: true } : {})
        },
        ...(sprite ? { sprite } : {}),
        emitter: {
          // §6.2.2 material key — identical blend/atlas/flags merge into one
          // instanced draw in ProductionEffectSystem.feed.
          // Trailing bit: lowRes batches never merge with full-res ones.
          key: `eff.${blend}.${atlasKey}.${materialMode !== "spark"}.${materialMode === "spark"}.${node.lowRes === true ? 1 : 0}${node.maxScreen !== undefined && node.maxScreen > 0 ? `.m${node.maxScreen}` : ""}`, 
          nodeId,
          origin: position,
          capacity: count,
          emissionRate: node.rate ?? node.emissionRate ?? (node.burst !== undefined ? 0 : count / 2.5),
          life,
          speed: speedRange,
          // Plume preset: tight column over the `radius` spawn disc.
          spread: node.spread ?? (node.emitter === "ambient" ? 1 : node.emitter === "swirl" ? 0.35 : plume ? 0.06 : 0.18),
          ...(typeof node.radius === "number" && node.radius > 0 ? { spawnRadius: node.radius } : {}),
          direction: node.direction ?? (node.emitter === "ambient" ? [0.15, 0.4, 0.1] : [0, 1, 0]),
          gravity,
          size: asRange(node.size) ?? (node.emitter === "ambient" ? [0.04, 0.1] : [0.05, 0.14]),
          color: nodeColor(node),
          alpha: materialMode === "smoke" ? 0.35 : 0.85,
          spin: node.emitter === "swirl" ? 2.4 : 0.6,
          stretch: materialMode === "spark" ? 0.02 : 0,
          drag,
          seed: seedOverride ?? (node.seed ?? hashSeed(nodeId)),
          ...(node.prewarm !== undefined ? { prewarm: node.prewarm } : {}),
          ...(node.burst !== undefined ? { burst: node.burst } : {})
        }
      };
    }
    case "rain":
    case "snow": {
      // §8.2 procedural weather volume: a camera-following wrapped box
      // (ProceduralVolumeEmitter). The old CpuEmitter lowering spawned a
      // ~5 cm disc at the node origin firing straight down — a needle of
      // particles below the floor that no camera ever saw (zero-pixel
      // frames). `intensity` scales alpha + count, `density` scales count,
      // `wind` shears the fall, `speed` scales the fall velocity, and
      // `size`/`color`/`particleCount`/`seed` override the §14 preset.
      const isRain = effect === "rain";
      const intensity = Math.min(1, Math.max(0, node.intensity ?? 0.4));
      const density = Math.min(1, Math.max(0, node.density ?? 1));
      const wind = node.wind ?? [0, 0, 0];
      const speed = typeof node.speed === "number" && node.speed > 0 ? node.speed : 1;
      const base = isRain ? VOLUME_PRESETS.rain : VOLUME_PRESETS.snow;
      const size = asRange(node.size);
      const count = Math.max(200, Math.min(20000, Math.round(
        node.particleCount ?? node.maxParticles ?? (isRain ? 4000 : 2400) * (0.3 + intensity * 0.7) * (0.25 + density * 0.75)
      )));
      const volume: VolumeEmitterSpec = {
        ...base,
        extent: node.radius !== undefined && node.radius > 0
          ? [node.radius * 2, base.extent[1], node.radius * 2]
          : base.extent,
        fallVelocity: [
          base.fallVelocity[0] * speed + wind[0] * (isRain ? 1.6 : 0.5),
          base.fallVelocity[1] * speed * (0.6 + intensity * 0.8) + wind[1] * (isRain ? 0.4 : 0.1),
          base.fallVelocity[2] * speed + wind[2] * (isRain ? 1.6 : 0.5)
        ],
        alpha: base.alpha * (0.5 + intensity * 0.5),
        ...(size !== undefined ? { size: (size[0] + size[1]) / 2 } : {}),
        color: nodeColor(node),
        seed: seedOverride ?? (node.seed ?? hashSeed(nodeId))
      };
      return {
        type: "volume",
        nodeId,
        effect,
        consumer: "particle-pass",
        sim: "procedural",
        batch: {
          blend: "alpha",
          shading: "unlit",
          softDepth: true,
          stretch: isRain,
          frameBlend: false,
          atlasKey: isRain ? "streak" : "soft-dot",
          // snow and rain are camera-following world-size sprites: cap their on-screen size and fade them near the lens
          maxScreen: node.maxScreen !== undefined && node.maxScreen > 0 ? node.maxScreen : (isRain ? VOLUME_SPRITE_LIMITS.rain : VOLUME_SPRITE_LIMITS.snow).maxScreen,
          nearFade: node.nearFade !== undefined ? node.nearFade : (isRain ? VOLUME_SPRITE_LIMITS.rain : VOLUME_SPRITE_LIMITS.snow).nearFade,
          ...(node.lowRes === true ? { lowRes: true } : {})
        },
        volume,
        count
      };
    }
    case "flipbook-sprite": {
      // §6.2 flipbook-sprite: one upright sprite per instance, alive from
      // t = 0 (burst), frame = age · frameRate over the sheet (wrapping when
      // `loop`, the default). Atlas = built-in seeded `fireball` sheet
      // (FlipbookAtlas.ts) on `spriteColumns × spriteRows`. The old lowering
      // re-emitted 2 sprites/s at random rotation with frame 0 pinned and
      // sampled the soft-dot fallback, so both flipbooks drew as plain discs.
      const count = Math.max(1, Math.min(64, Math.round(node.particleCount ?? 1)));
      // GU47 E-F sheet source: `texture` asset (grid from spriteColumns × spriteRows), else a built-in
      // atlas `sprite` (its own grid), else the procedural fireball sheet (unchanged default).
      const textureUrl = textureAssetUrl(node.texture);
      const builtin = !textureUrl ? lowerSprite({ sprite: typeof node.sprite === "string" ? node.sprite : undefined }) : undefined;
      const columns = builtin ? builtin.columns : Math.max(1, Math.round(node.spriteColumns ?? 8));
      const rows = builtin ? builtin.rows : Math.max(1, Math.round(node.spriteRows ?? 8));
      const frames = builtin ? builtin.frames : columns * rows;
      const frameRate = node.frameRate ?? 24;
      const loop = node.loop !== false;
      const blend: Blend = node.blend && VALID_BLENDS.has(node.blend) ? (node.blend as Blend) : "alpha";
      const sheetSeed = (node.seed ?? hashSeed(nodeId)) >>> 0;
      const sprite: LoweredSprite | undefined = textureUrl
        ? { kind: "texture", url: textureUrl, columns, rows, frames, frame: 0 }
        : builtin;
      const atlasKey = sprite ? spriteAtlasKey(sprite) : `flipbook.${columns}x${rows}.${sheetSeed}`;
      return {
        type: "emitter",
        nodeId,
        effect,
        consumer: "particle-pass",
        sim: simFor(node, count),
        batch: {
          blend,
          shading: "unlit",
          softDepth: false,
          stretch: false,
          frameBlend: true,
          atlasKey,
          ...(node.lowRes === true ? { lowRes: true } : {})
        },
        ...(sprite ? { sprite } : {}),
        emitter: {
          key: `eff.${blend}.${atlasKey}.0.0.${node.lowRes === true ? 1 : 0}`,
          nodeId,
          origin: position,
          capacity: count,
          emissionRate: 0,
          burst: count,
          life: loop ? [1e9, 1e9] : [frames / Math.max(frameRate, 1e-3), frames / Math.max(frameRate, 1e-3)],
          speed: [0, 0],
          spread: 0,
          direction: [0, 1, 0],
          gravity: 0,
          size: asRange(node.size) ?? [1, 1],
          color: nodeColor(node),
          alpha: 1,
          spin: 0,
          stretch: 0,
          drag: 0,
          spawnRadius: 1e-6,
          seed: seedOverride ?? sheetSeed,
          flipbook: { frames, frameRate, loop, columns, rows, seed: sheetSeed },
          ...(node.prewarm !== undefined ? { prewarm: node.prewarm } : {})
        }
      };
    }
    case "light-beam":
      return { type: "beam", nodeId, effect, consumer: "beam-pass", sim: "procedural" };
    case "lightCone":
    case "auroraRibbon":
      return { type: "beam", nodeId, effect, consumer: "beam-pass", sim: "procedural" };
    case "trail":
      return { type: "other", nodeId, effect, consumer: "ribbon-pass", sim: "none" };
    case "meshParticles":
      return { type: "other", nodeId, effect, consumer: "mesh-pass", sim: "none" };
    case "decal":
      return { type: "other", nodeId, effect, consumer: "decal-pass", sim: "none" };
    case "fogVolume":
      return { type: "other", nodeId, effect, consumer: "scene-fog", sim: "none" };
    case "fog":
    case "volumetric-fog":
      return { type: "other", nodeId, effect, consumer: "scene-fog", sim: "none" };
    case "bloom":
    case "ambient-occlusion":
    case "contact-occlusion":
    case "color-grade":
    case "anti-alias":
    case "outline":
    case "screen-space-reflections":
    case "depth-of-field":
    case "motion-blur":
    // The post bridge renders these display stages too (postBridge.ts reads
    // `vignette`, `film-grain` and `chromatic-aberration` nodes).
    case "vignette":
    case "film-grain":
    case "chromatic-aberration":
      return { type: "other", nodeId, effect, consumer: "post", sim: "none" };
    default:
      return { type: "other", nodeId, effect, consumer: "none", sim: "none" };
  }
}
