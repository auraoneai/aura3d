// PRD-07 P1-T14 — per-app effect runtime (PRD-07 §6.3).
// Lowers every effect node in the scene to a CpuEmitter (or a pass-through
// record for non-particle kinds), steps sim on app.onFrame, feeds the C-20
// hook during the collect phase, and reports observed draws into
// EffectDiagnostics after the transparent phase.

import { Texture } from "@aura3d/rendering";
import type { ParticleBatchDescriptor, ParticleBatchHandle, ParticleRenderHook } from "@aura3d/rendering/contracts";
import { QUALITY_TIERS, type AuraQualityTier } from "@aura3d/rendering/contracts";
import type { ParticlePassDiagnostics } from "@aura3d/rendering";
import { MeshParticleBatch, RibbonBatch, RibbonTrail, DecalBatch, DECAL_TIER_CAP, decalQuadGeometry, ribbonStripToDecalGeometry, PARTICLE_GPU_BUDGET_MS, ProceduralVolumeEmitter, type BeamDrawSpec, type MeshParticleFeed, type DecalVertexData, type GpuSimSpec } from "@aura3d/rendering";
import { createEmitter, stepEmitter, writeEmitterInstances, type EmitterDescriptor, type EmitterState } from "./CpuEmitter";
import { proceduralFireballSheet, VfxSpriteTextures, vfxSpriteFrame, vfxSpritePageSize, type VfxSpriteLoader, type VfxSpriteTextureState } from "./FlipbookAtlas";
import { lowerEffectNode, srgbChannelToLinear, type LoweredEffect, type LoweredSprite, type LoweredVolumeEffect, type EffectNodeLike } from "./EffectNodeLowering";
import { EffectDiagnostics } from "./EffectDiagnostics";
import { LiveAtmosphere } from "./LiveAtmosphere";
import { TransientLightPool, type TransientLightFlash } from "./TransientLightPool";
import type { CollectedLight } from "@aura3d/rendering";

let sharedSoftDot: Texture | null = null;

/** 1×1 white fallback atlas; the particle program detects it and draws the analytic soft-dot. */
export function softDotTexture(): Texture {
  if (!sharedSoftDot) {
    sharedSoftDot = new Texture({ width: 1, height: 1, label: "a3d-soft-dot", data: new Uint8Array([255, 255, 255, 255]) });
  }
  return sharedSoftDot;
}

const flipbookTextures = new Map<string, Texture>();

/** Built-in `fireball` sheet texture for a flipbook emitter (sRGB, straight alpha; cached per grid + seed). */
function flipbookTexture(fb: NonNullable<EmitterDescriptor["flipbook"]>): Texture {
  const sheet = proceduralFireballSheet(fb.columns ?? 1, fb.rows ?? 1, fb.seed ?? 0);
  const key = `${sheet.columns}x${sheet.rows}:${(fb.seed ?? 0) >>> 0}`;
  let texture = flipbookTextures.get(key);
  if (!texture) {
    texture = new Texture({ width: sheet.width, height: sheet.height, colorSpace: "srgb", label: `a3d-flipbook-fireball-${key}`, data: sheet.data });
    flipbookTextures.set(key, texture);
  }
  return texture;
}

interface EmitterBinding {
  readonly lowered: Extract<LoweredEffect, { type: "emitter" }>;
  readonly state: EmitterState;
  scratch: Float32Array;
}

/**
 * GU47 E-F: overwrite the instance `frame` slot (float 13 of the §6.2.1 layout) of every live particle with
 * its sprite frame. `writeEmitterInstances` packs particle i at `i * 16`, so `state.age[i]` / `state.life[i]`
 * line up; rotation and the life fade stay as the emitter wrote them.
 */
export function writeSpriteFrames(state: EmitterState, out: Float32Array, live: number, sprite: LoweredSprite): void {
  const fixed = sprite.kind === "texture" ? { frames: sprite.frames, frame: sprite.frame } : sprite;
  for (let i = 0; i < live; i++) out[i * 16 + 13] = vfxSpriteFrame(fixed, state.age[i], state.life[i]);
}

/** §8.2 weather volume binding — stateless positions, packed fresh in feed. */
interface VolumeBinding {
  readonly lowered: LoweredVolumeEffect;
  readonly emitter: ProceduralVolumeEmitter;
  scratch: Float32Array;
}

interface TrailBinding {
  readonly trail: RibbonTrail;
  readonly node: EffectNodeLike;
  /** GU47 E-F: live-follow state (runtime `effects.trail` and scene trails with a `target`). */
  follow?: TrailFollow;
  /** GU47 E-F: started by `app.effects.trail` (dropped by `runtime = "off"` and `clear()`). */
  runtime?: boolean;
}

/** GU47 E-F: a ribbon that samples its target every frame and drops points older than `life`. */
/** Linear blend of two RGBA colours (`t` 0: `a`, 1: `b`). */
function mixColor4(a: readonly [number, number, number, number], b: readonly [number, number, number, number], t: number): readonly [number, number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}

interface TrailFollow {
  readonly target: unknown;
  /** Seconds a point lives (Infinity: ring only, no fade). */
  readonly life: number;
  readonly width: number;
  readonly color: readonly [number, number, number, number];
  /** GU47 pass 4: tail colour (linear RGBA); points blend from `color` to it over their life. */
  readonly colorTail?: readonly [number, number, number, number];
  /** Width ramp by target speed (m/s): zero at or below [0], full width at or above [1]. */
  readonly widthOverSpeed?: readonly [number, number];
  readonly maxPoints: number;
  readonly minVertexDistance: number;
  readonly points: { position: readonly [number, number, number]; readonly time: number; readonly speed: number }[];
  /** False after a non-immediate stop: points expire, then the trail is removed. */
  following: boolean;
  last: { readonly position: readonly [number, number, number]; readonly time: number } | null;
  missingNoted: boolean;
}

/** GU47 E-F: follow state of a scene `effects.trail({ target })` node (ring of maxPoints, optional life fade). */
function sceneTrailFollow(node: EffectNodeLike, color: readonly [number, number, number, number]): TrailFollow {
  const ramp = node.widthOverSpeed;
  return {
    target: node.target,
    life: typeof node.life === "number" && node.life > 0 ? node.life : Number.POSITIVE_INFINITY,
    width: typeof node.width === "number" && node.width > 0 ? node.width : 0.3,
    color,
    ...(ramp && ramp.length >= 2 && Number.isFinite(ramp[0]) && Number.isFinite(ramp[1]) ? { widthOverSpeed: [ramp[0], ramp[1]] as const } : {}),
    maxPoints: Math.max(2, Math.round(node.maxPoints ?? 48)),
    minVertexDistance: typeof node.minVertexDistance === "number" && node.minVertexDistance >= 0 ? node.minVertexDistance : 0.05,
    points: [],
    following: true,
    last: null,
    missingNoted: false
  };
}

/** Width multiplier for a point sampled at `speed` m/s under `widthOverSpeed` [min, max]. */
export function trailWidthScale(speed: number, ramp: readonly [number, number] | undefined): number {
  if (!ramp) return 1;
  const [lo, hi] = ramp;
  if (!(hi > lo)) return speed >= lo ? 1 : 0;
  return Math.min(1, Math.max(0, (speed - lo) / (hi - lo)));
}

/** GU47 E-F: what an attach target resolves through (runtime node handle, or a bone socket on its actor). */
interface AttachHandleLike {
  getWorldPosition?(): readonly number[];
  readonly position?: readonly number[];
  readonly animation?: { socket?(bone: string): { readonly valid: boolean; worldMatrix(out?: Float32Array): Float32Array } };
}

/** GU47 E-F: an emitter that follows a runtime node; `offset` is the node's authored `position`. */
interface AttachBinding {
  readonly target: unknown;
  readonly offset: readonly [number, number, number];
  missingNoted: boolean;
}

function hexToRgb(c: string): readonly [number, number, number] {
  if (c.startsWith("#") && c.length === 7) {
    return [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
  }
  return [1, 1, 1];
}

function effectColor4(node: EffectNodeLike): readonly [number, number, number, number] {
  const c = node.color;
  if (Array.isArray(c) && c.length >= 3) return [Number(c[0]), Number(c[1]), Number(c[2]), Number(c[3] ?? 1)];
  // Hex is sRGB-encoded (three.js Color parity); beams, ribbons and mesh
  // particles shade in linear HDR, so decode here like particles and decals.
  if (typeof c === "string") { const [r, g, b] = hexToLinearRgb(c); return [r, g, b, 1]; }
  return [1, 1, 1, 1];
}

/**
 * Local copy of the agent-api `eulerToQuat` (XYZ half-angle formula — the
 * default node-rotation path; importing agent-api here would cycle).
 */
function prd07EulerToQuat(rotation: readonly [number, number, number]): readonly [number, number, number, number] {
  const [x, y, z] = rotation;
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

/** Minimal rotation quaternion taking unit vector `a` to unit vector `b`. */
function quatFromUnitVectors(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): readonly [number, number, number, number] {
  const an = Math.hypot(a[0], a[1], a[2]) || 1;
  const bn = Math.hypot(b[0], b[1], b[2]) || 1;
  const ax = a[0] / an, ay = a[1] / an, az = a[2] / an;
  const bx = b[0] / bn, by = b[1] / bn, bz = b[2] / bn;
  const dot = ax * bx + ay * by + az * bz;
  if (dot > 0.999999) return [0, 0, 0, 1];
  if (dot < -0.999999) {
    // 180°: pick any orthogonal axis.
    const px = Math.abs(ax) < 0.9 ? 1 : 0;
    const py = px === 1 ? 0 : 1;
    const vx = ay * 0 - az * py, vy = az * px - ax * 0, vz = ax * py - ay * px;
    const vn = Math.hypot(vx, vy, vz) || 1;
    return [vx / vn, vy / vn, vz / vn, 0];
  }
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const w = 1 + dot;
  const n = Math.hypot(cx, cy, cz, w) || 1;
  return [cx / n, cy / n, cz / n, w / n];
}

/** Decal albedo hex → linear (three.js Color parity; the decal BRDF is linear). */
function hexToLinearRgb(c: string): readonly [number, number, number] {
  const [r, g, b] = hexToRgb(c);
  return [srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b)];
}

function decalColor4(color: string | readonly number[] | undefined): readonly [number, number, number, number] {
  if (typeof color === "string") { const [r, g, b] = hexToLinearRgb(color); return [r, g, b, 1]; }
  if (Array.isArray(color) && color.length >= 3) return [Number(color[0]), Number(color[1]), Number(color[2]), Number(color[3] ?? 1)];
  return [1, 1, 1, 1];
}

/**
 * §6.9 decal → DecalBatch vertex data. `primitive: "plane"` decals become a
 * transformed quad (`decalQuadGeometry`); `primitive: "custom"` decals keep
 * their baked projected vertices (positions + normals + uvs + indices).
 */
function decalNodeGeometry(
  node: Record<string, unknown>,
  decal: { size?: readonly [number, number]; normalOffset?: number }
): DecalVertexData | null {
  if (node.primitive === "plane") {
    const size = decal.size ?? [1, 1];
    const quaternion = (node.quaternion as readonly [number, number, number, number] | undefined)
      ?? prd07EulerToQuat((node.rotation as readonly [number, number, number] | undefined) ?? [0, 0, 0]);
    const position = (node.position as readonly [number, number, number] | undefined) ?? [0, 0, 0];
    return decalQuadGeometry(quaternion, position, [size[0], size[1]], decal.normalOffset ?? 0.012);
  }
  const geometry = node.geometry as {
    positions?: readonly (readonly number[])[];
    normals?: readonly (readonly number[])[];
    uvs?: readonly (readonly number[])[];
    indices?: readonly number[];
  } | undefined;
  if (!geometry?.positions || !geometry.indices || geometry.positions.length === 0 || geometry.indices.length === 0) return null;
  const vertices = new Float32Array(geometry.positions.length * 8);
  for (let i = 0; i < geometry.positions.length; i += 1) {
    const p = geometry.positions[i];
    const n = geometry.normals?.[i] ?? [0, 1, 0];
    const uv = geometry.uvs?.[i] ?? [0, 0];
    const o = i * 8;
    vertices[o + 0] = p[0] ?? 0;
    vertices[o + 1] = p[1] ?? 0;
    vertices[o + 2] = p[2] ?? 0;
    vertices[o + 3] = n[0] ?? 0;
    vertices[o + 4] = n[1] ?? 1;
    vertices[o + 5] = n[2] ?? 0;
    vertices[o + 6] = uv[0] ?? 0;
    vertices[o + 7] = uv[1] ?? 0;
  }
  return { vertices, indices: new Uint32Array(geometry.indices) };
}

/** Convert a lowered beam-family node into the pass's draw spec. */
function beamSpec(node: EffectNodeLike, nodeId: string): BeamDrawSpec {
  const color = effectColor4(node);
  const top = node.colorTop !== undefined
    ? (typeof node.colorTop === "string"
        ? ([...hexToLinearRgb(node.colorTop), 1] as readonly [number, number, number, number])
        : ([Number(node.colorTop[0]), Number(node.colorTop[1]), Number(node.colorTop[2]), Number(node.colorTop[3] ?? 1)] as readonly [number, number, number, number]))
    : undefined;
  return {
    nodeId,
    kind: node.effect ?? "light-beam",
    color,
    intensity: node.intensity ?? 1,
    ...(node.position !== undefined ? { position: node.position } : {}),
    ...(node.from !== undefined ? { from: node.from } : {}),
    ...(node.to !== undefined ? { to: node.to } : {}),
    ...(node.widthWorld !== undefined ? { widthWorld: node.widthWorld } : {}),
    ...(node.segmentCount !== undefined ? { segmentCount: node.segmentCount } : {}),
    ...(node.direction !== undefined ? { direction: node.direction } : {}),
    ...(node.length !== undefined ? { length: node.length } : {}),
    ...(node.coneAngle !== undefined ? { coneAngle: node.coneAngle } : {}),
    ...(node.softness !== undefined ? { softness: node.softness } : {}),
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
    ...(node.segments !== undefined ? { segments: node.segments } : {}),
    ...(node.sway !== undefined ? { sway: node.sway } : {}),
    ...(node.shimmer !== undefined ? { shimmer: node.shimmer } : {}),
    ...(top !== undefined ? { colorTop: top as readonly [number, number, number, number] } : {})
  };
}

/** Deterministic spawn for a meshParticles node at attach time. */
function seedMeshBatch(node: EffectNodeLike): MeshParticleBatch {
  const batch = new MeshParticleBatch({
    capacity: Math.max(1, Math.round(node.particleCount ?? 32)),
    ...(node.gravity !== undefined && typeof node.gravity === "number" ? { gravity: node.gravity } : {}),
    ...(node.drag !== undefined ? { drag: node.drag } : {}),
    ...(node.spin !== undefined ? { spinRate: node.spin } : {}),
    groundY: 0,
    restitution: node.groundBounce ?? 0.35,
    seed: typeof node.seed === "number" ? node.seed : 0x9e3779b9
  });
  const origin = node.position ?? [0, 0, 0];
  const color = effectColor4(node);
  const count = batch.capacity;
  const rng = mulberry32(typeof node.seed === "number" ? node.seed : 7);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const speed = 1.5 + rng() * 3;
    batch.spawn({
      position: [origin[0] + (rng() - 0.5) * 0.4, origin[1], origin[2] + (rng() - 0.5) * 0.4],
      velocity: [Math.cos(a) * speed, 2.5 + rng() * 3, Math.sin(a) * speed],
      scale: 0.08 + rng() * 0.15,
      color,
      spinAxis: [rng() - 0.5, rng() - 0.5, rng() - 0.5],
      spin: (node.spin ?? 1) * (0.5 + rng()),
      life: 3 + rng() * 2
    });
  }
  return batch;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AppLike {
  readonly scene: { readonly nodes: readonly EffectNodeLike[] };
  onFrame(callback: (frame: { dt: number }) => void): () => void;
  /** Runtime-node registry — the legacy-sky hiding pass (§6.5) uses it. */
  readonly nodes?: {
    get(id: string): { setVisible?(visible: boolean): void; visible?: boolean } | undefined;
  };
  /** C-27 quality controller (app.quality) — supplies the resolved tier. */
  readonly quality?: { readonly tier: AuraQualityTier };
}

const UNSTOPPED_EMITTER_SECONDS = 5;
const LINGER_SECONDS = 3;
const LINGER_PARTICLE_LIMIT = 24;

export class ProductionEffectSystem {
  readonly diagnostics = new EffectDiagnostics();
  readonly atmosphere = new LiveAtmosphere();
  /** C-27 tier the system budgets against (resolved by the C-38 factory). */
  readonly tier: AuraQualityTier;
  private readonly budgetCap: number;
  private culledTotal = 0;
  private readonly emitters = new Map<string, EmitterBinding>();
  /** Runtime-spawned emitters (addInstance): watched so a forgotten loop or a never-ending burst cannot hang over the scene. */
  private readonly transients = new Map<string, { readonly born: number; warned: boolean }>();
  private lastTransientAt = 0;
  private lingerWarned = false;
  /** `?vfx=on|off` in the URL wins over the app's own setting. */
  private readonly runtimeEffectsUrl: "on" | "off" | null;
  private runtimeEffectsApp: "on" | "off" = "on";
  private readonly volumes = new Map<string, VolumeBinding>();
  /** C-27 budget share applied to stateless weather volumes in feed (1 = full). */
  private volumeScale = 1;
  private readonly batchHandles = new Map<string, ParticleBatchHandle>();
  private readonly groupScratch = new Map<string, Float32Array>();
  private readonly frameBatchMembers = new Map<string, string[]>();
  private readonly frameLive = new Map<string, number>();
  private readonly offFrame: () => void;
  /** P2-T7 transient light pool — tier-capped flashes for the burst presets. */
  readonly transientLights: TransientLightPool;
  /** §6.2.9 ribbon state — trails own the ring; the RibbonPass draws it. */
  readonly ribbons = new RibbonBatch();
  private readonly trails = new Map<string, TrailBinding>();
  private readonly beams = new Map<string, EffectNodeLike>();
  /** P6 runtime decals spawned via effects.decal (drawn by DecalBatch). */
  private readonly decalNodes = new Map<string, EffectNodeLike>();
  private readonly meshBatches = new Map<string, MeshParticleBatch>();
  private drawFeedQueue: ParticlePassDiagnostics | null = null;
  private disposed = false;
  private time = 0;
  private skyFlagOn = false;
  private weatherFlagOn = false;
  private decalFlagOn = false;
  /** §6.9 merged decal ring — C-27 tier cap replaces AURA_DECAL_MAX_DECALS. */
  private readonly decals: DecalBatch;
  /** Last hook passed to feed — lets the host push P6-T4 GPU-ms samples in. */
  private lastHook: ParticleRenderHook | null = null;
  /** True once a canvas render bridge publishes this system to a renderer. */
  private renderBridged = false;
  /** A renderer frame pulled the render source since the last endFrame. */
  private renderSincePrevFrame = false;
  /** GU47 E-F: atlas-sprite and texture-sheet textures, loaded on first use (1k page on low/medium tiers). */
  private readonly sprites: VfxSpriteTextures;
  /** GU47 E-F: emitters that follow a runtime node (`attachTo`), keyed by emitter id. */
  private readonly attachments = new Map<string, AttachBinding>();
  private readonly socketScratch = new Float32Array(16);

  constructor(
    private readonly app: AppLike,
    options: {
      readonly tier?: AuraQualityTier;
      /** GU47 E-F: sprite image loader (default: fetch + createImageBitmap); tests inject a synchronous-data loader. */
      readonly spriteLoader?: VfxSpriteLoader;
      /** GU47 E-F: URL of the baked VFX page per size (default: resolved against the engine module). */
      readonly spritePageUrl?: (pageSize: 1024 | 2048) => string;
    } = {}
  ) {
    // Resolved C-27 tier wins over the explicit option's fallback: callers pass
    // app.quality.tier; "high" remains only as the unresolved default.
    this.tier = options.tier ?? app.quality?.tier ?? "high";
    this.sprites = new VfxSpriteTextures(
      options.spriteLoader,
      vfxSpritePageSize(this.tier),
      (key, message) => this.diagnostics.note("VFX_SPRITE_UNAVAILABLE", key, `sprite texture ${key} failed to load (${message}); the batch keeps the soft-dot`),
      options.spritePageUrl
    );
    this.decals = new DecalBatch(DECAL_TIER_CAP[this.tier]);
    this.budgetCap = QUALITY_TIERS[this.tier].particleBudget;
    this.transientLights = new TransientLightPool(this.tier);
    const search = typeof location !== "undefined" ? location.search : "";
    // `?vfx=off` drops every runtime-spawned effect (to prove whether bubbles come from impact effects or from the scene);
    // `?vfxdebug=1` publishes `window.__AURA_VFX_DEBUG__()` with every live runtime emitter, its age and particle count.
    this.runtimeEffectsUrl = /[?&]vfx=off\b/.test(search) ? "off" : /[?&]vfx=on\b/.test(search) ? "on" : null;
    if (/[?&]vfxdebug=1\b/.test(search) && typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>)["__AURA_VFX_DEBUG__"] = () => ({
        time: this.time,
        live: this.liveCount(),
        transients: [...this.transients].map(([id, record]) => {
          const binding = this.emitters.get(id);
          return { id, age: Number((this.time - record.born).toFixed(2)), live: binding?.state.live ?? 0, emissionRate: binding?.state.desc.emissionRate ?? 0 };
        }),
        scene: [...this.emitters.keys()].filter((id) => !this.transients.has(id)),
        // GU47 E-F: sprite texture load state and live trails (receipts vfx-atlas-sprites, vfx-trail).
        sprites: this.spriteStatus(),
        trails: [...this.trails.keys()].map((id) => ({ id, ...(this.trailInfo(id) ?? { length: 0, pointCount: 0 }) })),
        notes: this.diagnostics.report().errors
      });
    }
    this.rebuildFromScene();
    this.offFrame = app.onFrame((frame) => this.frame(frame.dt));
  }

  /** P6-T4 — measured particle GPU ms; auto-engages the half-res path past the
   *  tier budget (PARTICLE_GPU_BUDGET_MS). Off until a runtime measures. */
  noteParticleGpuMs(ms: number): void {
    this.lastHook?.noteGpuMs?.(ms, PARTICLE_GPU_BUDGET_MS[this.tier] ?? PARTICLE_GPU_BUDGET_MS.default);
  }

  /**
   * Zero-pixel accounting is per *rendered* frame. Once a canvas bridge binds
   * this system to a renderer, sim ticks with no renderer frame in between
   * (async WebGL mount, fixed-step substeps) are not counted; headless apps
   * with no bridge keep counting every tick.
   */
  noteRenderBridgeAttached(): void {
    this.renderBridged = true;
  }

  /** Called by the canvas bridge each time a renderer frame reads the source. */
  noteRenderFrame(): void {
    this.renderSincePrevFrame = true;
  }

  /** P6-T4 — force the half-res particle path on/off regardless of budget. */
  setParticleLowRes(on: boolean): void {
    this.lastHook?.setLowResEnabled?.(on);
  }

  /** The sky spec the current scene's sky node put on LiveAtmosphere (null: the scene has none). */
  private sceneSky: object | null = null;

  /** P3-T4 — sky nodes land on LiveAtmosphere (consumed by prd07.sky flag-on). */
  private rebuildSkyFromScene(): void {
    let found: object | null = null;
    // Grouped-effects walk: sky nodes inside visible groups count too.
    this.walkNodes((node, visible) => {
      if (!visible || (node as { kind?: string }).kind !== "sky") return;
      const spec = (node as { spec?: unknown }).spec;
      if (spec && typeof spec === "object") {
        found = spec;
        this.atmosphere.setSky(spec as Parameters<LiveAtmosphere["setSky"]>[0]);
      }
    });
    // A sky that came from the previous scene's sky node leaves with it (setScene to a scene without one); a sky set
    // at runtime through app.atmosphere.setSky stays. Before this the old sky kept drawing over the next scene.
    if (found === null && this.sceneSky !== null && this.atmosphere.state().sky === this.sceneSky) this.atmosphere.clearSky();
    this.sceneSky = found;
    this.applyLegacySkyVisibility();
  }

  /**
   * §6.5 — `sky.dayNight` legacy primitives are runtime-tagged
   * `prd07.legacySky.<n>`. With `A3D_QR_VFX_SKY` on they hide through their
   * runtime handles; flag-off the setter is never called and the frame is
   * unchanged.
   */
  private applyLegacySkyVisibility(): void {
    if (!this.skyFlagOn || !this.app.nodes) return;
    this.hideTaggedLegacyNodes("prd07.legacySky.");
  }

  /** Bound by the C-38 extension factory with the app's resolved flag state. */
  setSkyFlagOn(on: boolean): void {
    this.skyFlagOn = on;
    this.applyLegacySkyVisibility();
  }

  /**
   * §8.6/P5-T4 — `weather.precipitation`/`weather.wetGround` legacy primitives
   * are runtime-tagged `prd07.legacyWeather.<n>`; under A3D_QR_VFX they hide
   * through their runtime handles. Flag-off the setter is never called and
   * the frame is bit-identical.
   */
  private applyLegacyWeatherVisibility(): void {
    if (!this.weatherFlagOn || !this.app.nodes) return;
    this.hideTaggedLegacyNodes("prd07.legacyWeather.");
  }

  /** Bound by the C-38 extension factory with the app's resolved flag state. */
  setWeatherFlagOn(on: boolean): void {
    this.weatherFlagOn = on;
    this.applyLegacyWeatherVisibility();
  }

  /**
   * §6.9/P6-T1 — decal primitives are runtime-tagged `prd07.legacyDecal.<n>`.
   * Under A3D_QR_VFX_DECALS the tag hides them through their runtime handles
   * and DecalBatch draws them instead; flag-off the setter is never called
   * and the forward decal path is byte-identical to today.
   */
  private applyLegacyDecalVisibility(): void {
    if (!this.decalFlagOn || !this.app.nodes) return;
    this.hideTaggedLegacyNodes("prd07.legacyDecal.");
  }

  /** Bound by the C-38 extension factory with the app's resolved flag state. */
  setDecalFlagOn(on: boolean): void {
    this.decalFlagOn = on;
    this.applyLegacyDecalVisibility();
    // P6-T3 — surface trails move to the decal pass under the flag; the ribbon
    // pass keeps only the camera-oriented group (no double draw).
    this.ribbons.enabledOrientations = on ? ["camera"] : ["camera", "surface"];
  }

  /** Scene snapshot the last rebuild was computed from (nodes ref + version). */
  private lastSceneNodes: readonly EffectNodeLike[] | null = null;
  private lastSceneVersion = -1;

  private sceneSignature(): { nodes: readonly EffectNodeLike[]; version: number } {
    const s = this.app.scene as { nodes: readonly EffectNodeLike[]; version?: number };
    return { nodes: s.nodes, version: s.version ?? -1 };
  }

  /**
   * Hide every runtime-tagged legacy primitive with `prefix`, including ones
   * nested in groups (grouped-effects walk). Hidden ancestors already hide
   * their subtree, so only visible branches are visited.
   */
  private hideTaggedLegacyNodes(prefix: string): void {
    const nodes = this.app.nodes;
    if (!nodes) return;
    this.walkNodes((node, visible) => {
      if (!visible) return;
      const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
      if (typeof runtimeId === "string" && runtimeId.startsWith(prefix)) nodes.get(runtimeId)?.setVisible?.(false);
    });
  }

  /** Recursive scene walk — group children descend only under a visible ancestor. */
  private walkNodes(
    visit: (node: EffectNodeLike, visible: boolean) => void,
    nodes: readonly EffectNodeLike[] = this.app.scene.nodes,
    parentVisible = true
  ): void {
    for (const node of nodes) {
      const visible = parentVisible && node.visible !== false;
      visit(node, visible);
      if (node.children) this.walkNodes(visit, node.children, visible);
    }
  }

  private rebuildFromScene(): void {
    const sig = this.sceneSignature();
    this.lastSceneNodes = sig.nodes;
    this.lastSceneVersion = sig.version;
    this.rebuildSkyFromScene();
    this.applyLegacyDecalVisibility();
    const fogNodes: EffectNodeLike[] = [];
    const fogVolumes: EffectNodeLike[] = [];
    this.walkNodes((node, visible) => {
      if (!visible || node.kind !== "effect") return;
      const lowered = lowerEffectNode(this.placeAttached(node));
      this.diagnostics.track({
        nodeId: lowered.nodeId,
        effect: lowered.effect,
        consumer: lowered.consumer,
        live: lowered.type === "volume" ? lowered.count : 0,
        sim: lowered.sim,
        softDepth: lowered.type === "emitter" || lowered.type === "volume" ? lowered.batch.softDepth : false
      });
      if (lowered.type === "emitter") {
        this.attachEmitter(lowered);
        this.trackAttachment(lowered.nodeId, node);
      } else if (lowered.type === "volume") {
        this.attachVolume(lowered);
      } else {
        this.attachNonEmitter(node, lowered);
      }
      if (lowered.consumer === "scene-fog") {
        (lowered.effect === "fogVolume" ? fogVolumes : fogNodes).push(node);
      }
    });
    this.atmosphere.trackFogNodes(fogNodes);
    this.atmosphere.trackFogVolumes(fogVolumes);
  }

  /**
   * Attach a lowered non-emitter node to its consumer's lane state:
   * beam-pass kinds become draw specs, ribbon-pass trails join the
   * RibbonBatch ring (preseeded from `path`, live points via trailPush),
   * mesh-pass kinds own a MeshParticleBatch.
   */
  private attachNonEmitter(node: EffectNodeLike, lowered: LoweredEffect): void {
    if (lowered.consumer === "beam-pass") {
      this.beams.set(lowered.nodeId, node);
    } else if (lowered.consumer === "ribbon-pass") {
      const color = effectColor4(node);
      const trail = this.ribbons.upsertTrail({
        id: lowered.nodeId,
        maxPoints: node.maxPoints,
        minVertexDistance: node.minVertexDistance,
        width: node.width,
        color,
        orientation: node.orientation === "surface" ? "surface" : "camera",
        ...(node.surfaceNormal !== undefined ? { surfaceNormal: node.surfaceNormal } : {})
      });
      if (Array.isArray(node.path)) {
        const points = node.path.filter((p): p is readonly number[] => Array.isArray(p) && p.length >= 3);
        const step = points.length > 1 ? 0.02 : 0;
        points.forEach((p, i) => trail.push([p[0] ?? 0, p[1] ?? 0, p[2] ?? 0], i * step));
      }
      // GU47 E-F: a scene trail with a `target` (and no static `path`) follows that runtime node every frame;
      // `life` fades and drops old points (absent: a ring of maxPoints). Follow state survives scene rebuilds.
      const follow = node.target !== undefined && !Array.isArray(node.path)
        ? this.trails.get(lowered.nodeId)?.follow ?? sceneTrailFollow(node, color)
        : undefined;
      this.trails.set(lowered.nodeId, { trail, node, ...(follow ? { follow } : {}) });
    } else if (lowered.consumer === "mesh-pass") {
      this.meshBatches.set(lowered.nodeId, seedMeshBatch(node));
    } else if (lowered.consumer === "decal-pass") {
      this.decalNodes.set(lowered.nodeId, node);
    }
    // "post"/"scene-fog"/"none" consumers have no lane state (P3/P4).
  }

  /** Per-frame feed: the RibbonBatch the prd07.ribbons contributor draws. */
  ribbonFeed(): RibbonBatch {
    return this.ribbons;
  }

  /** Per-frame feed: beam-family draw specs for the prd07.beams contributor. */
  beamFeed(): BeamDrawSpec[] {
    return [...this.beams.entries()].map(([nodeId, node]) => beamSpec(node, nodeId));
  }

  /** Per-frame feed: mesh batches for the prd07.mesh contributor. */
  meshFeed(): MeshParticleFeed[] {
    return [...this.meshBatches.entries()].map(([nodeId, batch]) => ({ nodeId, batch }));
  }

  /**
   * Per-frame feed: the merged DecalBatch the prd07.decals contributor draws
   * (§6.9). Syncs authored decal nodes (plane quads + projected customs) into
   * the ring each call so live edits propagate; stale ids are removed.
   */
  decalFeed(): DecalBatch {
    this.syncDecals();
    return this.decals;
  }

  private syncDecals(): void {
    const seen = new Set<string>();
    const nodes = (this.app.scene.nodes ?? []) as unknown as readonly Record<string, unknown>[];
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (node.kind !== "primitive") continue;
      const decal = node.decal as {
        size?: readonly [number, number];
        baseOpacity?: number;
        fade?: { angleStart?: number; angleEnd?: number; near?: number; far?: number };
        polygonOffset?: { factor: number; units: number };
        normalOffset?: number;
        textureUrl?: string;
      } | undefined;
      if (!decal) continue;
      const runtimeId = (node.runtime as { id?: string } | undefined)?.id;
      const id = runtimeId ?? `decal.${i}`;
      seen.add(id);
      const material = (node.material ?? {}) as { color?: unknown; roughness?: number; blend?: unknown; texture?: { url?: string } };
      const [r, g, b] = typeof material.color === "string" ? hexToLinearRgb(material.color) : [1, 1, 1] as const;
      const geometry = decalNodeGeometry(node, decal);
      if (!geometry) continue;
      this.decals.upsert({
        id,
        pageKey: decal.textureUrl ?? material.texture?.url ?? `flat:${String(material.color ?? "#ffffff")}`,
        blend: material.blend === "multiply" ? "multiply" : "alpha",
        geometry,
        color: [r, g, b, decal.baseOpacity ?? 1],
        roughness: material.roughness ?? 0.5,
        fade: decal.fade,
        polygonOffset: decal.polygonOffset,
        life: Number.POSITIVE_INFINITY
      }, this.time);
    }
    // §6.9/P6-T3 — surface-oriented trails ride the decal pass with polygon
    // offset; per-vertex color/fade baked into stride-16 vertices.
    for (const [nodeId, binding] of this.trails) {
      const trailId = `surface-trail.${nodeId}`;
      if (binding.trail.options.orientation !== "surface") continue;
      const strip = this.ribbons.buildGeometry(binding.trail, [0, 0, 0]); // camera unused for surface
      if (!strip) continue;
      seen.add(trailId);
      this.decals.upsert({
        id: trailId,
        pageKey: "surface-trails",
        blend: "alpha",
        geometry: ribbonStripToDecalGeometry(strip),
        polygonOffset: { factor: -2, units: -2 },
        life: Number.POSITIVE_INFINITY
      }, this.time);
    }
    // Runtime decals spawned via effects.decal — quads at their origin,
    // facing `decal.normal` (default +Z, matching Decals.ts).
    for (const [nodeId, node] of this.decalNodes) {
      const d = node.decal;
      const runtimeId = `runtime-decal.${nodeId}`;
      if (!d) continue;
      seen.add(runtimeId);
      const position = node.position ?? [0, 0, 0];
      const size = d.size ?? [1, 1];
      const normal = d.normal ?? [0, 0, 1];
      // Quad in the decal's facing plane: quaternion from +Z to `normal`.
      const quat = quatFromUnitVectors([0, 0, 1], normal);
      this.decals.upsert({
        id: runtimeId,
        pageKey: d.textureUrl ?? `flat:${typeof d.color === "string" ? d.color : "#ffffff"}`,
        blend: "alpha",
        geometry: decalQuadGeometry(quat, [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0], [size[0], size[1]], d.normalOffset ?? 0.012),
        color: decalColor4(d.color),
        roughness: 0.5,
        fade: d.fade,
        polygonOffset: d.polygonOffset,
        life: d.lifetime ?? Number.POSITIVE_INFINITY
      }, this.time);
    }
    // Remove slots whose nodes left the scene.
    for (const existing of this.decals.ids()) {
      if (!seen.has(existing)) this.decals.remove(existing);
    }
  }

  /** Append a live trail point (target-follow / scripted motion callers). */
  trailPush(nodeId: string, position: readonly [number, number, number], width?: number, color?: readonly [number, number, number, number]): boolean {
    const binding = this.trails.get(nodeId);
    if (!binding) return false;
    if (binding.follow) {
      this.sampleTrail(binding.follow, position);
      return true;
    }
    return binding.trail.push(position, this.time, width, color);
  }

  /**
   * GU47 E-F `app.effects.trail`: a camera-facing ribbon on the RibbonBatch that follows `target` (runtime node
   * id, `{ node, socket }` or a node handle; undefined: points come from `trailPush`). Points older than `life`
   * seconds drop off, so the ribbon is as long as the distance the target covered in `life`. The head is
   * opaque and the tail fades; `widthOverSpeed` ramps the width by the target's speed.
   */
  addTrail(
    id: string,
    target: unknown,
    options: { readonly width: number; readonly life: number; readonly color?: unknown; readonly widthOverSpeed?: readonly [number, number]; readonly minVertexDistance?: number; readonly colorTail?: unknown }
  ): string {
    const life = Number.isFinite(options.life) && options.life > 0 ? options.life : 0.5;
    const width = Number.isFinite(options.width) && options.width > 0 ? options.width : 0.3;
    // One point per frame at up to 120 Hz over the life, capped per tier.
    const cap = this.tier === "low" ? 120 : 360;
    const maxPoints = Math.max(8, Math.min(cap, Math.ceil(life * 120) + 2));
    const minVertexDistance = options.minVertexDistance !== undefined && options.minVertexDistance >= 0 ? options.minVertexDistance : 0.05;
    const color = effectColor4({ kind: "effect", color: options.color as EffectNodeLike["color"] });
    const trail = this.ribbons.upsertTrail({ id, maxPoints, minVertexDistance, width, color, orientation: "camera" });
    const ramp = options.widthOverSpeed;
    const follow: TrailFollow = {
      target,
      life,
      width,
      color,
      ...(options.colorTail !== undefined ? { colorTail: effectColor4({ kind: "effect", color: options.colorTail as EffectNodeLike["color"] }) } : {}),
      ...(ramp && ramp.length >= 2 && Number.isFinite(ramp[0]) && Number.isFinite(ramp[1]) ? { widthOverSpeed: [ramp[0], ramp[1]] as const } : {}),
      maxPoints,
      minVertexDistance,
      points: [],
      following: true,
      last: null,
      missingNoted: false
    };
    this.trails.set(id, { trail, node: { kind: "effect", effect: "trail", id }, follow, runtime: true });
    if (target !== undefined) {
      const at = this.resolveTarget(target);
      if (at) this.sampleTrail(follow, at);
    }
    return id;
  }

  /** GU47 E-F: live length (metres along the points) and point count of a trail, or null once it is gone. */
  trailInfo(id: string): { readonly length: number; readonly pointCount: number } | null {
    const binding = this.trails.get(id);
    if (!binding) return null;
    const points = binding.follow ? binding.follow.points.map((p) => p.position) : binding.trail.getPoints().map((p) => p.position);
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
    }
    return { length, pointCount: points.length };
  }

  /** GU47 pass 4: shift every live point (and the speed reference) of a trail by `offset` metres. */
  translateTrail(id: string, offset: readonly [number, number, number]): void {
    const follow = this.trails.get(id)?.follow;
    const [dx, dy, dz] = offset;
    if (!follow || !Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz) || (dx === 0 && dy === 0 && dz === 0)) return;
    const shift = (p: readonly [number, number, number]): readonly [number, number, number] => [p[0] + dx, p[1] + dy, p[2] + dz];
    for (const point of follow.points) point.position = shift(point.position);
    if (follow.last) follow.last = { position: shift(follow.last.position), time: follow.last.time };
  }

  /** GU47 E-F: drop every point of a trail (it restarts from the target's next position). */
  clearTrail(id: string): void {
    const binding = this.trails.get(id);
    if (!binding) return;
    if (binding.follow) {
      binding.follow.points.length = 0;
      binding.follow.last = null;
    }
    binding.trail.clear();
  }

  /** GU47 E-F: stop following; `immediate` removes the ribbon now, otherwise it fades out over `life`. */
  stopTrail(id: string, immediate = false): void {
    const binding = this.trails.get(id);
    if (!binding) return;
    if (immediate || !binding.follow || !Number.isFinite(binding.follow.life)) {
      binding.trail.clear();
      this.ribbons.removeTrail(id);
      this.trails.delete(id);
      return;
    }
    binding.follow.following = false;
  }

  /** Append the target's position when it moved at least `minVertexDistance` since the last point. */
  private sampleTrail(follow: TrailFollow, position: readonly [number, number, number]): void {
    const p: readonly [number, number, number] = [position[0], position[1], position[2]];
    const last = follow.last;
    const elapsed = last ? this.time - last.time : 0;
    const speed = last && elapsed > 1e-6 ? Math.hypot(p[0] - last.position[0], p[1] - last.position[1], p[2] - last.position[2]) / elapsed : 0;
    if (!last || elapsed > 1e-6 || follow.points.length === 0) follow.last = { position: p, time: this.time };
    const head = follow.points[follow.points.length - 1];
    if (!head || Math.hypot(p[0] - head.position[0], p[1] - head.position[1], p[2] - head.position[2]) >= follow.minVertexDistance) {
      follow.points.push({ position: p, time: this.time, speed });
      while (follow.points.length > follow.maxPoints) follow.points.shift();
    }
  }

  /** GU47 E-F: sample every following trail, expire old points and rebuild the ribbon rings (head first). */
  private stepTrails(): void {
    for (const [id, binding] of this.trails) {
      const follow = binding.follow;
      if (!follow) continue;
      if (follow.following && follow.target !== undefined) {
        const at = this.resolveTarget(follow.target);
        if (at) this.sampleTrail(follow, at);
        else if (!follow.missingNoted) {
          follow.missingNoted = true;
          this.diagnostics.note("VFX_ATTACH_TARGET_MISSING", id, "trail target does not resolve to a runtime node; the ribbon stops growing");
        }
      }
      if (Number.isFinite(follow.life)) {
        const cutoff = this.time - follow.life;
        let drop = 0;
        while (drop < follow.points.length && follow.points[drop].time < cutoff) drop++;
        if (drop > 0) follow.points.splice(0, drop);
      }
      if (!follow.following && follow.points.length === 0) {
        binding.trail.clear();
        this.ribbons.removeTrail(id);
        this.trails.delete(id);
        continue;
      }
      binding.trail.clear();
      // Newest first: the batch alpha curve 0.45·(1 − i/maxPoints) then peaks at the target and fades to the tail.
      for (let i = follow.points.length - 1; i >= 0; i--) {
        const point = follow.points[i];
        const fade = Number.isFinite(follow.life) ? Math.max(0, 1 - (this.time - point.time) / follow.life) : 1;
        const c = follow.colorTail ? mixColor4(follow.color, follow.colorTail, 1 - fade) : follow.color;
        binding.trail.push(point.position, point.time, follow.width * trailWidthScale(point.speed, follow.widthOverSpeed), [c[0], c[1], c[2], c[3] * fade]);
      }
    }
  }

  private attachEmitter(lowered: Extract<LoweredEffect, { type: "emitter" }>): EmitterBinding {
    const state = createEmitter(lowered.emitter);
    const binding: EmitterBinding = {
      lowered,
      state,
      scratch: new Float32Array(Math.max(64, lowered.emitter.capacity) * 16)
    };
    this.emitters.set(lowered.nodeId, binding);
    return binding;
  }

  /** §8.2 weather volume: ProceduralVolumeEmitter around the spec + a scratch. */
  private attachVolume(lowered: LoweredVolumeEffect): VolumeBinding {
    const binding: VolumeBinding = {
      lowered,
      emitter: new ProceduralVolumeEmitter(lowered.volume, lowered.count),
      scratch: new Float32Array(Math.max(64, lowered.count) * 16)
    };
    this.volumes.set(lowered.nodeId, binding);
    return binding;
  }

  /** App-level switch for runtime-spawned effects (effects.burst/spawn, game effects, impact presets). The URL's `?vfx=on|off` overrides it. */
  setRuntimeEffects(mode: "on" | "off"): void {
    this.runtimeEffectsApp = mode === "off" ? "off" : "on";
    // GU47 E-F (floating dots): "off" drops the runtime particles that are already running too. Before, only new
    // spawns were refused, so a continuous emitter started before the switch kept emitting at its spot for good.
    if (this.runtimeEffects === "off") this.clearRuntimeParticles();
  }

  /** GU47 E-F: remove every runtime-spawned emitter and runtime trail now (scene effects and decals stay). */
  clearRuntimeParticles(): void {
    for (const id of [...this.transients.keys()]) this.removeInstance(id);
    for (const [id, binding] of [...this.trails]) {
      if (binding.runtime) this.stopTrail(id, true);
    }
  }

  /** GU47 E-F: true while a runtime instance still has an emitter (spent one-shots are retired at once). */
  instanceAlive(id: string): boolean {
    return this.emitters.has(id) || this.trails.has(id) || this.decalNodes.has(id);
  }

  /** Drop a spent runtime emitter: its batch leaves the particle pass on the next feed. */
  private retireEmitter(id: string): void {
    this.emitters.delete(id);
    this.transients.delete(id);
    this.attachments.delete(id);
    this.diagnostics.untrack(id);
  }

  get runtimeEffects(): "on" | "off" {
    return this.runtimeEffectsUrl ?? this.runtimeEffectsApp;
  }

  /**
   * GU47 E-F: world position of an attach target: a runtime node id, `{ node, socket }` (the actor's bone
   * socket when it resolves, else the node), or a node handle. Null when nothing resolves.
   */
  resolveTarget(target: unknown): [number, number, number] | null {
    let handle: AttachHandleLike | undefined;
    let socket: string | undefined;
    if (typeof target === "string") {
      handle = this.app.nodes?.get(target) as AttachHandleLike | undefined;
    } else if (typeof target === "object" && target !== null) {
      const ref = target as { readonly node?: unknown; readonly socket?: unknown };
      if (typeof ref.node === "string") {
        handle = this.app.nodes?.get(ref.node) as AttachHandleLike | undefined;
        socket = typeof ref.socket === "string" ? ref.socket : undefined;
      } else {
        handle = target as AttachHandleLike;
      }
    }
    if (!handle) return null;
    if (socket !== undefined) {
      const bone = handle.animation?.socket?.(socket);
      if (bone?.valid) {
        const m = bone.worldMatrix(this.socketScratch);
        if (Number.isFinite(m[12]) && Number.isFinite(m[13]) && Number.isFinite(m[14])) return [m[12], m[13], m[14]];
      }
    }
    const p = typeof handle.getWorldPosition === "function" ? handle.getWorldPosition() : handle.position;
    if (!p || p.length < 3 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return null;
    return [p[0], p[1], p[2]];
  }

  /** GU47 E-F: an `attachTo` node starts at its target (plus its `position` offset); others pass unchanged. */
  private placeAttached(node: EffectNodeLike): EffectNodeLike {
    if (node.attachTo === undefined) return node;
    const at = this.resolveTarget(node.attachTo);
    if (!at) return node;
    const offset = node.position ?? [0, 0, 0];
    return { ...node, position: [at[0] + offset[0], at[1] + offset[1], at[2] + offset[2]] };
  }

  private trackAttachment(emitterId: string, node: EffectNodeLike): void {
    if (node.attachTo === undefined) {
      this.attachments.delete(emitterId);
      return;
    }
    const offset = node.position ?? [0, 0, 0];
    this.attachments.set(emitterId, { target: node.attachTo, offset: [offset[0], offset[1], offset[2]], missingNoted: false });
  }

  /** GU47 E-F: move every attached emitter's origin to its target before the sim step spawns. */
  private updateAttachments(): void {
    for (const [emitterId, attachment] of this.attachments) {
      const binding = this.emitters.get(emitterId);
      if (!binding) {
        this.attachments.delete(emitterId);
        continue;
      }
      const at = this.resolveTarget(attachment.target);
      if (!at) {
        if (!attachment.missingNoted) {
          attachment.missingNoted = true;
          this.diagnostics.note("VFX_ATTACH_TARGET_MISSING", emitterId, "attachTo target does not resolve to a runtime node; the emitter keeps its last position");
        }
        continue;
      }
      const x = at[0] + attachment.offset[0];
      const y = at[1] + attachment.offset[1];
      const z = at[2] + attachment.offset[2];
      const origin = binding.state.desc.origin;
      if (origin[0] !== x || origin[1] !== y || origin[2] !== z) binding.state.desc = { ...binding.state.desc, origin: [x, y, z] };
    }
  }

  /** Add a transient effect-instance emitter (effects.burst/spawn). */
  addInstance(nodeId: string, node: EffectNodeLike): string {
    if (this.runtimeEffects === "off") return nodeId;
    const lowered = lowerEffectNode(this.placeAttached(node));
    this.diagnostics.track({
      nodeId,
      effect: lowered.effect,
      consumer: lowered.consumer,
      live: lowered.type === "volume" ? lowered.count : 0,
      sim: lowered.sim,
      softDepth: lowered.type === "emitter" || lowered.type === "volume" ? lowered.batch.softDepth : false
    });
    if (lowered.type === "emitter") {
      this.attachEmitter({ ...lowered, nodeId });
      this.trackAttachment(nodeId, node);
      this.transients.set(nodeId, { born: this.time, warned: false });
      this.lastTransientAt = this.time;
    } else if (lowered.type === "volume") {
      this.attachVolume({ ...lowered, nodeId });
    } else {
      this.attachNonEmitter(node, lowered);
    }
    return nodeId;
  }

  setInstanceOrigin(nodeId: string, origin: readonly number[]): void {
    const binding = this.emitters.get(nodeId);
    if (binding) {
      // An explicit position wins over `attachTo`: the emitter stops following its node.
      this.attachments.delete(nodeId);
      binding.state.desc = { ...binding.state.desc, origin: [origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0] as never };
      return;
    }
    const decalNode = this.decalNodes.get(nodeId);
    if (decalNode) this.decalNodes.set(nodeId, { ...decalNode, position: [origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0] as typeof decalNode.position });
  }

  removeInstance(nodeId: string): void {
    this.transients.delete(nodeId);
    this.attachments.delete(nodeId);
    const binding = this.emitters.get(nodeId);
    if (!binding) {
      this.volumes.delete(nodeId);
      this.beams.delete(nodeId);
      this.decalNodes.delete(nodeId);
      const trail = this.trails.get(nodeId);
      if (trail) { trail.trail.clear(); this.ribbons.removeTrail(nodeId); this.trails.delete(nodeId); }
      this.meshBatches.delete(nodeId);
      return;
    }
    binding.state.live = 0;
    this.emitters.delete(nodeId);
    this.diagnostics.untrack(nodeId);
  }

  /** Sim advance — runs inside app.onFrame, before the renderer submits. */
  private frame(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    // Grouped/nested scene changes re-attach on the scene's own version/nodes
    // turnover — not on every set/onLoad call.
    const sig = this.sceneSignature();
    if (sig.nodes !== this.lastSceneNodes || sig.version !== this.lastSceneVersion) {
      this.rebuildFromScene();
    }
    // §6.6 live fog state — advance transitions + refresh runtime-handle
    // visibility before the compiler/packers read the resolved spec.
    this.atmosphere.tick(dt);
    this.atmosphere.updateFogVisibility(this.app);
    // Close the previous rendered frame's draw accounting first. The visible
    // set is the scene's effect nodes that aren't hidden — headless apps have
    // no frustum, so scene-visible == in-frustum here; the contributor's
    // frustum cull narrows it further inside the renderer.
    const visible = new Set<string>();
    this.walkNodes((n, v) => {
      if (v) visible.add(n.id ?? n.name ?? "");
    });
    this.diagnostics.endFrame(visible, !this.renderBridged || this.renderSincePrevFrame);
    this.renderSincePrevFrame = false;
    // Fixed-step sim (CpuEmitter §6.3): app.step(t) hands one large dt to
    // onFrame. Integrating it in a single Euler step launched or dropped every
    // particle by v·dt metres — the promote fountains landed below the floor or
    // far above the frame (runs 38196483050 / 38198732843). Substep at ≤1/60 s,
    // capped at 30 s of simulation per frame like createEmitter's prewarm.
    const substeps = dt > 0 ? Math.min(Math.ceil(dt * 60 - 1e-6), 1800) : 0;
    const h = substeps > 0 ? dt / substeps : 0;
    if (this.attachments.size > 0) this.updateAttachments();
    if (this.trails.size > 0) this.stepTrails();
    for (const binding of this.emitters.values()) {
      for (let s = 0; s < substeps; s++) stepEmitter(binding.state, h);
      this.diagnostics.track({
        nodeId: binding.lowered.nodeId,
        effect: binding.lowered.effect,
        consumer: binding.lowered.consumer,
        live: binding.state.live,
        sim: binding.lowered.sim,
        softDepth: binding.lowered.batch.softDepth
      });
    }
    // §8.2 weather volumes are stateless (positions are pure functions of
    // time + camera) — nothing to step; keep the per-frame accounting live.
    for (const binding of this.volumes.values()) {
      this.diagnostics.track({
        nodeId: binding.lowered.nodeId,
        effect: binding.lowered.effect,
        consumer: binding.lowered.consumer,
        live: binding.lowered.count,
        sim: binding.lowered.sim,
        softDepth: binding.lowered.batch.softDepth
      });
    }
    // C-27 budget cap: when total live exceeds the tier's particleBudget,
    // shrink every emitter proportionally and report the refused count as
    // `budget.culled` (PRD-07 §7.4 "pooled per spec"). Stateless weather
    // volumes can't drop live particles — the feed truncates their
    // submitted count by the same scale instead.
    const live = this.liveCount();
    this.volumeScale = 1;
    if (live > this.budgetCap) {
      const scale = this.budgetCap / live;
      this.volumeScale = scale;
      let kept = 0;
      for (const binding of this.emitters.values()) {
        binding.state.live = Math.floor(binding.state.live * scale);
        kept += binding.state.live;
      }
      for (const binding of this.volumes.values()) kept += Math.floor(binding.lowered.count * scale);
      this.culledTotal += live - kept;
    }
    for (const batch of this.meshBatches.values()) batch.step(dt);
    this.transientLights.step(dt);
    this.watchTransients();
    this.diagnostics.setFrameStats(this.emitters.size + this.volumes.size, this.liveCount());
    this.diagnostics.setBudget({ tier: this.tier, cap: this.budgetCap, culled: this.culledTotal });
  }

  /**
   * Dev diagnostics for runtime-spawned effects: an emitter that is still emitting 5 s after it was spawned
   * (a continuous emitter nobody stopped) and more than {@link LINGER_PARTICLE_LIMIT} transient particles alive
   * {@link LINGER_SECONDS} s after the last spawn (a burst that outlives its design) are reported once each.
   */
  private watchTransients(): void {
    let live = 0;
    for (const [id, record] of this.transients) {
      const binding = this.emitters.get(id);
      if (!binding) {
        this.transients.delete(id);
        continue;
      }
      // GU47 E-F: a one-shot whose particles are all gone is retired now instead of idling in the system (and in
      // the frame's batch list) until the 96-slot instance pool recycles it.
      if (binding.state.live === 0 && binding.state.desc.emissionRate <= 0) {
        this.retireEmitter(id);
        continue;
      }
      live += binding.state.live;
      const age = this.time - record.born;
      if (!record.warned && age > UNSTOPPED_EMITTER_SECONDS && binding.state.desc.emissionRate > 0 && binding.state.live > 0) {
        record.warned = true;
        this.diagnostics.note("VFX_UNSTOPPED_EMITTER", id, `runtime emitter still emitting ${age.toFixed(1)} s after it was spawned: stop() its handle or fire a one-shot burst`);
      }
    }
    if (live === 0) this.lingerWarned = false;
    else if (!this.lingerWarned && live > LINGER_PARTICLE_LIMIT && this.time - this.lastTransientAt > LINGER_SECONDS) {
      this.lingerWarned = true;
      this.diagnostics.note("VFX_LINGERING_PARTICLES", "", `${live} runtime particles still alive ${LINGER_SECONDS} s after the last effect was spawned`);
    }
  }

  /**
   * §8.3 GPU sim requests — read by the prd07.gpuSims contributor, which owns
   * the RenderDevice and instantiates one ParticleGpuSim per emitter whose
   * `sim` lowered to "gpu". The CPU emitter keeps running as the draw source
   * until the batch pass gains the texture-fetch variant (PARTICLE_SOURCE).
   */
  gpuSimFeed(): readonly { nodeId: string; batchKey: string; emitCount: number; spec: GpuSimSpec }[] {
    const out: { nodeId: string; batchKey: string; emitCount: number; spec: GpuSimSpec }[] = [];
    for (const binding of this.emitters.values()) {
      if (binding.lowered.sim !== "gpu") continue;
      const d = binding.lowered.emitter;
      out.push({
        nodeId: d.nodeId,
        batchKey: d.key,
        emitCount: d.emissionRate / 60,
        spec: {
          capacity: d.capacity,
          lifetimeMax: d.life[1],
          gravity: [0, d.gravity, 0],
          drag: d.drag,
          seed: d.seed,
          emitter: { origin: d.origin, direction: d.direction, spread: d.spread, speed: d.speed }
        }
      });
    }
    return out;
  }

  /**
   * RenderSource feed — invoked by the prd07.particles contributor (collect).
   * Emitters are coalesced into one batch per §6.2.2 material key (blend,
   * atlas, stretch, frameBlend, softDepth): two additive emitters on the same
   * atlas submit a single instanced draw.
   */
  feed(hook: ParticleRenderHook): void {
    this.frameBatchMembers.clear();
    const groups = new Map<string, { first: EmitterBinding; parts: { binding: EmitterBinding; live: number }[] }>();
    for (const binding of this.emitters.values()) {
      const live = writeEmitterInstances(binding.state, binding.scratch);
      // Flipbooks keep the frame the emitter wrote (age · frameRate); other sprite emitters get theirs here.
      if (binding.lowered.sprite && !binding.lowered.emitter.flipbook) writeSpriteFrames(binding.state, binding.scratch, live, binding.lowered.sprite);
      this.frameLive.set(binding.lowered.nodeId, live);
      const key = binding.lowered.emitter.key;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { first: binding, parts: [] }));
      group.parts.push({ binding, live });
    }
    const seenKeys = new Set<string>();
    for (const [key, group] of groups) {
      seenKeys.add(key);
      const totalLive = group.parts.reduce((s, p) => s + p.live, 0);
      const flipbook = group.first.lowered.emitter.flipbook;
      const sprite = group.first.lowered.sprite;
      // GU47 E-F: atlas sprites sample their sequence once it has loaded; until then (or after a failed load)
      // the batch draws the analytic soft-dot exactly as before.
      // A flipbook with a `texture` or built-in `sprite` samples that sheet instead of the procedural fireball.
      const spriteTexture = sprite ? this.spriteTexture(sprite) : null;
      const desc: ParticleBatchDescriptor = {
        key,
        capacity: group.parts.reduce((s, p) => s + p.binding.lowered.emitter.capacity, 0),
        source: "cpu",
        atlas: flipbook && !sprite ? flipbookTexture(flipbook) : spriteTexture ?? softDotTexture(),
        ...(flipbook && !sprite ? { atlasGrid: [flipbook.columns ?? 1, flipbook.rows ?? 1] as const, atlasStraightAlpha: true } : {}),
        ...(sprite && spriteTexture
          ? { atlasGrid: [sprite.columns, sprite.rows] as const, ...(sprite.kind === "texture" ? { atlasStraightAlpha: true } : {}) }
          : {}),
        blend: group.first.lowered.batch.blend,
        shading: group.first.lowered.batch.shading,
        softDepth: group.first.lowered.batch.softDepth,
        ...(group.first.lowered.batch.softDistance !== undefined ? { softDistance: group.first.lowered.batch.softDistance } : {}),
        ...(group.first.lowered.batch.nearFade !== undefined ? { nearFade: group.first.lowered.batch.nearFade } : {}),
        ...(group.first.lowered.batch.maxScreen !== undefined ? { maxScreen: group.first.lowered.batch.maxScreen } : {}),
        stretch: group.first.lowered.batch.stretch,
        frameBlend: group.first.lowered.batch.frameBlend,
        ...(group.first.lowered.batch.lowRes === true ? { lowRes: true } : {})
      };
      this.lastHook = hook;
      let handle = this.batchHandles.get(key) ?? null;
      handle = hook.upsertBatch(desc);
      this.batchHandles.set(key, handle);
      if (totalLive === 0) {
        // Keep the batch alive but empty so a revive doesn't thrash capacity.
        hook.writeInstances(handle, group.first.scratch, 0);
        continue;
      }
      let data: Float32Array;
      if (group.parts.length === 1) {
        const part = group.parts[0];
        data = part.binding.scratch.subarray(0, part.live * 16);
      } else {
        data = this.concatScratch(key, totalLive * 16, group.parts);
      }
      hook.writeInstances(handle, data, totalLive);
      this.frameBatchMembers.set(key, group.parts.filter((p) => p.live > 0).map((p) => p.binding.lowered.nodeId));
    }
    // §8.2 weather volumes — one batch per node (specs are per-node); the
    // camera pose arrives via the prd07.fog contributor's noteCamera hookup.
    const volumeCam = this.atmosphere.cameraPose().position;
    for (const binding of this.volumes.values()) {
      const b = binding.lowered.batch;
      const key = `eff.vol.${binding.lowered.nodeId}`;
      seenKeys.add(key);
      const live = Math.max(0, Math.floor(binding.lowered.count * this.volumeScale));
      const desc: ParticleBatchDescriptor = {
        key,
        capacity: binding.lowered.count,
        source: "cpu",
        atlas: softDotTexture(),
        blend: b.blend,
        shading: b.shading,
        softDepth: b.softDepth,
        ...(b.softDistance !== undefined ? { softDistance: b.softDistance } : {}),
        ...(b.nearFade !== undefined ? { nearFade: b.nearFade } : {}),
        ...(b.maxScreen !== undefined ? { maxScreen: b.maxScreen } : {}),
        stretch: b.stretch,
        frameBlend: b.frameBlend,
        ...(b.lowRes === true ? { lowRes: true } : {})
      };
      this.lastHook = hook;
      const handle = hook.upsertBatch(desc);
      this.batchHandles.set(key, handle);
      const { data } = binding.emitter.instanceData(this.time, volumeCam, binding.scratch);
      hook.writeInstances(handle, data, live);
      this.frameLive.set(binding.lowered.nodeId, live);
      this.frameBatchMembers.set(key, live > 0 ? [binding.lowered.nodeId] : []);
    }
    // Retire batches whose key no emitter fed this frame.
    for (const [key, handle] of this.batchHandles) {
      if (!seenKeys.has(key)) {
        hook.removeBatch(handle);
        this.batchHandles.delete(key);
      }
    }
  }

  /** GU47 E-F: texture for a lowered sprite, or null while it loads (or after it failed). */
  private spriteTexture(sprite: LoweredSprite): Texture | null {
    return sprite.kind === "builtin" ? this.sprites.builtin(sprite.name) : this.sprites.texture(sprite.url);
  }

  /** GU47 E-F: load state of every sprite texture requested so far (`vfx:<name>` / `tex:<url>`). */
  spriteStatus(): Readonly<Record<string, VfxSpriteTextureState>> {
    return this.sprites.status();
  }

  /** GU47 E-F: resolves once every sprite texture requested so far has loaded or failed. */
  spritesSettled(): Promise<void> {
    return this.sprites.settled();
  }

  private concatScratch(key: string, floats: number, parts: { binding: EmitterBinding; live: number }[]): Float32Array {
    let buf = this.groupScratch.get(key);
    if (!buf || buf.length < floats) {
      buf = new Float32Array(Math.max(64, floats));
      this.groupScratch.set(key, buf);
    }
    let off = 0;
    for (const part of parts) {
      if (part.live === 0) continue;
      buf.set(part.binding.scratch.subarray(0, part.live * 16), off);
      off += part.live * 16;
    }
    return buf.subarray(0, floats);
  }

  /** Observed draws — invoked by the contributor after queue collection. */
  afterDraw(diag: ParticlePassDiagnostics): void {
    this.drawFeedQueue = diag;
    // Attribute the frame's draws per emitter: a merged batch's draw counts
    // once for every member node (each node's pixels went through that call),
    // so zero-pixel accounting stays per-node honest.
    for (const nodeIds of this.frameBatchMembers.values()) {
      for (const nodeId of nodeIds) {
        this.diagnostics.trackDraw(nodeId, 1, this.frameLive.get(nodeId) ?? 0);
      }
    }
    for (const error of diag.errors) {
      this.diagnostics.note(error.code, error.nodeId, error.message);
    }
    if (diag.deviceCounters !== undefined) {
      this.diagnostics.noteDeviceReadbacks(diag.deviceCounters.readbacks);
    }
  }

  culled(): number {
    return this.culledTotal;
  }

  /** P2-T7 — transient flash for burst presets (impact/explosion/super-flash). */
  flashLight(flash: TransientLightFlash): boolean {
    return this.transientLights.flash(flash);
  }

  /** CollectedLights published to the RenderSource each frame (C-01 collect). */
  collectedLights(): readonly CollectedLight[] {
    return this.transientLights.collect();
  }

  liveCount(): number {
    let total = 0;
    for (const binding of this.emitters.values()) total += binding.state.live;
    for (const binding of this.volumes.values()) total += Math.floor(binding.lowered.count * this.volumeScale);
    return total;
  }

  emitterIds(): readonly string[] {
    return [...this.emitters.keys(), ...this.volumes.keys()];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame();
    // GU47 E-F: the particle pass is shared per device; leaving this system's batches in it kept the last frame's
    // particles drawing (frozen dots) for as long as the device rendered.
    if (this.lastHook) for (const handle of this.batchHandles.values()) this.lastHook.removeBatch(handle);
    this.batchHandles.clear();
    this.emitters.clear();
    this.volumes.clear();
    this.transients.clear();
    this.attachments.clear();
    this.trails.clear();
    this.ribbons.clear();
    this.beams.clear();
    this.meshBatches.clear();
  }
}
