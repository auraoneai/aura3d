// PRD-07 P1-T14 — per-app effect runtime (PRD-07 §6.3).
// Lowers every effect node in the scene to a CpuEmitter (or a pass-through
// record for non-particle kinds), steps sim on app.onFrame, feeds the C-20
// hook during the collect phase, and reports observed draws into
// EffectDiagnostics after the transparent phase.

import { Texture } from "@aura3d/rendering";
import type { ParticleBatchDescriptor, ParticleBatchHandle, ParticleRenderHook } from "@aura3d/rendering/contracts";
import { QUALITY_TIERS, type AuraQualityTier } from "@aura3d/rendering/contracts";
import type { ParticlePassDiagnostics } from "@aura3d/rendering";
import { MeshParticleBatch, RibbonBatch, RibbonTrail, DecalBatch, DECAL_TIER_CAP, decalQuadGeometry, ribbonStripToDecalGeometry, PARTICLE_GPU_BUDGET_MS, type BeamDrawSpec, type MeshParticleFeed, type DecalVertexData } from "@aura3d/rendering";
import { createEmitter, stepEmitter, writeEmitterInstances, type EmitterState } from "./CpuEmitter";
import { lowerEffectNode, type LoweredEffect, type EffectNodeLike } from "./EffectNodeLowering";
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

interface EmitterBinding {
  readonly lowered: Extract<LoweredEffect, { type: "emitter" }>;
  readonly state: EmitterState;
  scratch: Float32Array;
}

interface TrailBinding {
  readonly trail: RibbonTrail;
  readonly node: EffectNodeLike;
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
  if (typeof c === "string") { const [r, g, b] = hexToRgb(c); return [r, g, b, 1]; }
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

function decalColor4(color: string | readonly number[] | undefined): readonly [number, number, number, number] {
  if (typeof color === "string") { const [r, g, b] = hexToRgb(color); return [r, g, b, 1]; }
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
        ? ([...hexToRgb(node.colorTop), 1] as readonly [number, number, number, number])
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
}

export class ProductionEffectSystem {
  readonly diagnostics = new EffectDiagnostics();
  readonly atmosphere = new LiveAtmosphere();
  /** C-27 tier the system budgets against (resolved by the C-38 factory). */
  readonly tier: AuraQualityTier;
  private readonly budgetCap: number;
  private culledTotal = 0;
  private readonly emitters = new Map<string, EmitterBinding>();
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

  constructor(private readonly app: AppLike, options: { readonly tier?: AuraQualityTier } = {}) {
    this.tier = options.tier ?? "high";
    this.decals = new DecalBatch(DECAL_TIER_CAP[this.tier]);
    this.budgetCap = QUALITY_TIERS[this.tier].particleBudget;
    this.transientLights = new TransientLightPool(this.tier);
    this.rebuildFromScene();
    this.offFrame = app.onFrame((frame) => this.frame(frame.dt));
  }

  /** P6-T4 — measured particle GPU ms; auto-engages the half-res path past the
   *  tier budget (PARTICLE_GPU_BUDGET_MS). Off until a runtime measures. */
  noteParticleGpuMs(ms: number): void {
    this.lastHook?.noteGpuMs?.(ms, PARTICLE_GPU_BUDGET_MS[this.tier] ?? PARTICLE_GPU_BUDGET_MS.default);
  }

  /** P6-T4 — force the half-res particle path on/off regardless of budget. */
  setParticleLowRes(on: boolean): void {
    this.lastHook?.setLowResEnabled?.(on);
  }

  /** P3-T4 — sky nodes land on LiveAtmosphere (consumed by prd07.sky flag-on). */
  private rebuildSkyFromScene(): void {
    for (const node of this.app.scene.nodes) {
      if ((node as { kind?: string }).kind !== "sky") continue;
      const spec = (node as { spec?: unknown }).spec;
      if (spec && typeof spec === "object") this.atmosphere.setSky(spec as Parameters<LiveAtmosphere["setSky"]>[0]);
    }
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
    for (const node of this.app.scene.nodes) {
      const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
      if (typeof runtimeId === "string" && runtimeId.startsWith("prd07.legacySky.")) {
        this.app.nodes.get(runtimeId)?.setVisible?.(false);
      }
    }
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
    for (const node of this.app.scene.nodes) {
      const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
      if (typeof runtimeId === "string" && runtimeId.startsWith("prd07.legacyWeather.")) {
        this.app.nodes.get(runtimeId)?.setVisible?.(false);
      }
    }
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
    for (const node of this.app.scene.nodes) {
      const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
      if (typeof runtimeId === "string" && runtimeId.startsWith("prd07.legacyDecal.")) {
        this.app.nodes.get(runtimeId)?.setVisible?.(false);
      }
    }
  }

  /** Bound by the C-38 extension factory with the app's resolved flag state. */
  setDecalFlagOn(on: boolean): void {
    this.decalFlagOn = on;
    this.applyLegacyDecalVisibility();
    // P6-T3 — surface trails move to the decal pass under the flag; the ribbon
    // pass keeps only the camera-oriented group (no double draw).
    this.ribbons.enabledOrientations = on ? ["camera"] : ["camera", "surface"];
  }

  private rebuildFromScene(): void {
    this.rebuildSkyFromScene();
    this.applyLegacyDecalVisibility();
    const fogNodes: EffectNodeLike[] = [];
    const fogVolumes: EffectNodeLike[] = [];
    for (const node of this.app.scene.nodes) {
      if (node.kind !== "effect") continue;
      const lowered = lowerEffectNode(node);
      this.diagnostics.track({
        nodeId: lowered.nodeId,
        effect: lowered.effect,
        consumer: lowered.consumer,
        live: 0,
        sim: lowered.sim,
        softDepth: lowered.type === "emitter" ? lowered.batch.softDepth : false
      });
      if (lowered.type === "emitter") {
        this.attachEmitter(lowered);
      } else {
        this.attachNonEmitter(node, lowered);
      }
      if (lowered.consumer === "scene-fog") {
        (lowered.effect === "fogVolume" ? fogVolumes : fogNodes).push(node);
      }
    }
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
      this.trails.set(lowered.nodeId, { trail, node });
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
      const [r, g, b] = typeof material.color === "string" ? hexToRgb(material.color) : [1, 1, 1] as const;
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
    return binding.trail.push(position, this.time, width, color);
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

  /** Add a transient effect-instance emitter (effects.burst/spawn). */
  addInstance(nodeId: string, node: EffectNodeLike): string {
    const lowered = lowerEffectNode(node);
    this.diagnostics.track({
      nodeId,
      effect: lowered.effect,
      consumer: lowered.consumer,
      live: 0,
      sim: lowered.sim,
      softDepth: lowered.type === "emitter" ? lowered.batch.softDepth : false
    });
    if (lowered.type === "emitter") {
      this.attachEmitter({ ...lowered, nodeId });
    } else {
      this.attachNonEmitter(node, lowered);
    }
    return nodeId;
  }

  setInstanceOrigin(nodeId: string, origin: readonly number[]): void {
    const binding = this.emitters.get(nodeId);
    if (binding) {
      binding.state.desc = { ...binding.state.desc, origin: [origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0] as never };
      return;
    }
    const decalNode = this.decalNodes.get(nodeId);
    if (decalNode) this.decalNodes.set(nodeId, { ...decalNode, position: [origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0] as typeof decalNode.position });
  }

  removeInstance(nodeId: string): void {
    const binding = this.emitters.get(nodeId);
    if (!binding) {
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
    // §6.6 live fog state — advance transitions + refresh runtime-handle
    // visibility before the compiler/packers read the resolved spec.
    this.atmosphere.tick(dt);
    this.atmosphere.updateFogVisibility(this.app);
    // Close the previous rendered frame's draw accounting first. The visible
    // set is the scene's effect nodes that aren't hidden — headless apps have
    // no frustum, so scene-visible == in-frustum here; the contributor's
    // frustum cull narrows it further inside the renderer.
    const visible = new Set<string>();
    for (const node of this.app.scene.nodes) {
      const n = node as EffectNodeLike & { visible?: boolean };
      if (n.visible !== false) visible.add(n.id ?? n.name ?? "");
    }
    this.diagnostics.endFrame(visible);
    for (const binding of this.emitters.values()) {
      stepEmitter(binding.state, dt);
      this.diagnostics.track({
        nodeId: binding.lowered.nodeId,
        effect: binding.lowered.effect,
        consumer: binding.lowered.consumer,
        live: binding.state.live,
        sim: binding.lowered.sim,
        softDepth: binding.lowered.batch.softDepth
      });
    }
    // C-27 budget cap: when total live exceeds the tier's particleBudget,
    // shrink every emitter proportionally and report the refused count as
    // `budget.culled` (PRD-07 §7.4 "pooled per spec").
    const live = this.liveCount();
    if (live > this.budgetCap) {
      const scale = this.budgetCap / live;
      let kept = 0;
      for (const binding of this.emitters.values()) {
        binding.state.live = Math.floor(binding.state.live * scale);
        kept += binding.state.live;
      }
      this.culledTotal += live - kept;
    }
    for (const batch of this.meshBatches.values()) batch.step(dt);
    this.transientLights.step(dt);
    this.diagnostics.setFrameStats(this.emitters.size, this.liveCount());
    this.diagnostics.setBudget({ tier: this.tier, cap: this.budgetCap, culled: this.culledTotal });
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
      const desc: ParticleBatchDescriptor = {
        key,
        capacity: group.parts.reduce((s, p) => s + p.binding.lowered.emitter.capacity, 0),
        source: "cpu",
        atlas: softDotTexture(),
        blend: group.first.lowered.batch.blend,
        shading: group.first.lowered.batch.shading,
        softDepth: group.first.lowered.batch.softDepth,
        ...(group.first.lowered.batch.softDistance !== undefined ? { softDistance: group.first.lowered.batch.softDistance } : {}),
        ...(group.first.lowered.batch.nearFade !== undefined ? { nearFade: group.first.lowered.batch.nearFade } : {}),
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
    // Retire batches whose key no emitter fed this frame.
    for (const [key, handle] of this.batchHandles) {
      if (!seenKeys.has(key)) {
        hook.removeBatch(handle);
        this.batchHandles.delete(key);
      }
    }
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
    return total;
  }

  emitterIds(): readonly string[] {
    return [...this.emitters.keys()];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame();
    this.emitters.clear();
  }
}
