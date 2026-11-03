// PRD-07 P1-T1/P1-T8 — frame contributors and the per-device pass registry.
// The engine reaches contributors through `ctx.source` (the RenderSource the
// Renderer was handed, populated via attachRootRenderSource): the engine's
// ProductionEffectSystem publishes a `vfx` feed + atmosphere state there.

import type { RenderDevice, RenderTarget } from "../RenderDevice";
import {
  registerFrameContributor,
  type FrameContributor,
  type FrameContributorContext,
  type TransparentQueueItem
} from "../contracts/frameGraph";
import type { RenderSource } from "../contracts/renderSource";
import type { RenderItem } from "../contracts/renderItem";
import type { ParticleRenderHook } from "../contracts/particles";
import type { AuraSkySpecLike } from "../contracts/atmosphere";
import { frameStatsSlot, type FrameStatsLike } from "../contracts/device";
import { ParticleBatchPass, type ParticlePassDiagnostics } from "./ParticleBatchPass";
import { BeamPass, type BeamDrawSpec } from "./BeamPass";
import { MeshParticlePass, type MeshParticleFeed } from "./MeshParticlePass";
import { RibbonBatch } from "./RibbonBatch";
import {
  PRD07_FOG_DEFAULTS,
  packV2,
  parseFogColor,
  resolvePrd07FogSpec,
  skyHorizonRadiance,
  type Vec3
} from "../atmosphere/HeightFog";
import { packFogVolumes, type Prd07FogVolume } from "../atmosphere/FogVolumes";
import { setPrd07ForwardFog } from "../atmosphere/fogUniformStore";
import { evaluateSky, skyFrame } from "../atmosphere/SkyEval";
import { RibbonPass } from "./RibbonPass";
import { DecalPass } from "./DecalPass";
import { resolveDecalLighting } from "./decalLighting";
import type { DecalBatch } from "./DecalBatch";
import { resolveSceneDepth } from "./SceneDepthAdapter";
import { contextViewProjection, skyDrawPassFor } from "../atmosphere/SkyBackgroundPass";
import { VolumetricFogPass, froxelGridFor, type VolumetricFogPassInput, type FroxelGridSpec } from "../atmosphere/VolumetricFogPass";
import type { PackedFogUniforms } from "../atmosphere/HeightFog";
import { SkyCaptureAdapter, type SkyCaptureAppLike } from "../atmosphere/SkyCaptureAdapter";
import { ParticleGpuSim, ParticleGpuSimInitializationError, particleGpuSimAvailable, type GpuSimSpec } from "./ParticleGpuSim";
import { hasPrd07ManagedFrameContext, producePrd07ManagedFrame } from "./Prd07FrameState";
import { prd07RendererContextSnapshot } from "./Prd07RendererBridge";

/** §8.3 GPU sim request published per emitter whose sim lowered to "gpu". */
export interface GpuSimRequest {
  readonly nodeId: string;
  readonly batchKey: string;
  readonly emitCount: number;
  readonly spec: GpuSimSpec;
}

/** What the engine-side effects system publishes on the RenderSource. */
export interface VfxFrameSource {
  /** Upsert batches + write this frame's live instances through the hook. */
  feed(hook: ParticleRenderHook): void;
  /** §8.3: emitters requesting a ParticleGpuSim (P5-T1). */
  gpuSimFeed?(): readonly GpuSimRequest[];
  /** Called once after the contributor collected queue items, with observed stats. */
  afterDraw?(diagnostics: ParticlePassDiagnostics): void;
  /** P2-T7 transient lights — read by the prd07.lights contributor in collect. */
  lightsFeed?(): readonly import("../LightCollector").CollectedLight[];
  /** §6.2.9 ribbon ring owned by the engine system; prd07.ribbons draws it. */
  ribbonFeed?(): RibbonBatch;
  /** §6.2.10 beam-family draw specs for prd07.beams. */
  beamFeed?(): readonly BeamDrawSpec[];
  /** §6.2.11 instanced mesh batches for prd07.mesh. */
  meshFeed?(): readonly MeshParticleFeed[];
  /** §6.9 merged decal ring for prd07.decals (P6-T1). */
  decalFeed?(): DecalBatch;
}

/** What the engine-side atmosphere state publishes on the RenderSource. */
export interface AtmosphereFrameSource {
  readonly sky: AuraSkySpecLike | null;
  /** P3-T6 — live state + sky-change listener for SkyCaptureAdapter wiring. */
  state?(): { readonly sky: unknown | null };
  onSkyChanged?(listener: () => void): (() => void) | void;
}

export interface Prd07FrameSource extends RenderSource {
  readonly vfx?: VfxFrameSource | null;
  readonly atmosphere?: AtmosphereFrameSource | null;
}

const particlePasses = new WeakMap<RenderDevice, ParticleBatchPass>();
const ribbonPasses = new WeakMap<RenderDevice, RibbonPass>();
const beamPasses = new WeakMap<RenderDevice, BeamPass>();
const meshPasses = new WeakMap<RenderDevice, MeshParticlePass>();
const decalPasses = new WeakMap<RenderDevice, DecalPass>();

export function particlePassFor(device: RenderDevice): ParticleBatchPass {
  let pass = particlePasses.get(device);
  if (!pass) {
    pass = new ParticleBatchPass(device);
    particlePasses.set(device, pass);
  }
  return pass;
}

export function ribbonPassFor(device: RenderDevice): RibbonPass {
  let pass = ribbonPasses.get(device);
  if (!pass) {
    pass = new RibbonPass(device);
    ribbonPasses.set(device, pass);
  }
  return pass;
}

export function beamPassFor(device: RenderDevice): BeamPass {
  let pass = beamPasses.get(device);
  if (!pass) {
    pass = new BeamPass(device);
    beamPasses.set(device, pass);
  }
  return pass;
}

export function meshPassFor(device: RenderDevice): MeshParticlePass {
  let pass = meshPasses.get(device);
  if (!pass) {
    pass = new MeshParticlePass(device);
    meshPasses.set(device, pass);
  }
  return pass;
}

/** C-20: particle update+draw measured under the "particles" FrameStats
 *  scope (Q-07-2). One monitor per process; a frame is opened lazily by the
 *  first wrapped call and closed when the next collect begins. */
let particleStats: FrameStatsLike | null | undefined;
let particleStatsOpen = false;
let lastParticleScopeMs: number | null = null;

function particleStatsMonitor(): FrameStatsLike | null {
  if (particleStats === undefined) {
    try {
      particleStats = frameStatsSlot.get({ values: {}, on: () => false })(240);
    } catch {
      particleStats = null;
    }
  }
  return particleStats;
}

function particleScope<T>(fn: () => T): T {
  const mon = particleStatsMonitor();
  if (!mon) return fn();
  if (!particleStatsOpen) {
    mon.begin(typeof performance !== "undefined" ? performance.now() : Date.now());
    particleStatsOpen = true;
  }
  return mon.scope("particles", fn);
}

/** Close the open monitor frame and capture the last "particles" scope ms. */
function closeParticleScopeFrame(): void {
  const mon = particleStatsMonitor();
  if (mon && particleStatsOpen) {
    const sample = mon.end();
    lastParticleScopeMs = sample.scopes["particles"] ?? null;
  }
  particleStatsOpen = false;
}

/** Last measured "particles" scope ms (feed + draws); null until a frame ran. */
export function lastParticleUpdateMs(): number | null {
  return lastParticleScopeMs;
}

const particlesContributor: FrameContributor = {
  id: "prd07.particles",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["collect", "transparent"],
  collect(items: RenderItem[], ctx: FrameContributorContext): RenderItem[] {
    closeParticleScopeFrame();
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    if (vfx) particleScope(() => vfx.feed(particlePassFor(ctx.device)));
    return items;
  },
  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    if (!vfx) return [];
    const pass = particlePassFor(ctx.device);
    const items = pass.transparentItems(ctx).map((it) => ({ ...it, draw: (c: FrameContributorContext) => particleScope(() => it.draw(c)) }));
    vfx.afterDraw?.(pass.diagnostics);
    return items;
  }
};

/** P2-T7: transient pool lights — collected in the C-01 collect phase. */
const lightsContributor: FrameContributor = {
  id: "prd07.lights",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["collect"],
  collect(items: RenderItem[], ctx: FrameContributorContext): RenderItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const lights = vfx?.lightsFeed?.() ?? [];
    // CollectedLights ride `source.collectedLights` into the forward light
    // merge (collectRenderLights); the blackboard copy keeps them visible to
    // sibling contributors in the same phase.
    ctx.blackboard.set("prd07.lights", lights);
    return items;
  }
};

/** §6.2.9 trails — RibbonPass submits one draw per orientation group. */
const ribbonContributor: FrameContributor = {
  id: "prd07.ribbons",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["transparent"],
  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const batch = vfx?.ribbonFeed?.();
    if (!batch) return [];
    return ribbonPassFor(ctx.device).transparentItems(batch, ctx);
  }
};

/** §6.2.10 beams, light cones, aurora curtains — one draw per beam node. */
const beamContributor: FrameContributor = {
  id: "prd07.beams",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["transparent"],
  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const specs = vfx?.beamFeed?.() ?? [];
    if (specs.length === 0) return [];
    return beamPassFor(ctx.device).transparentItems(specs, ctx);
  }
};

/** §6.2.11 instanced mesh particles — one instanced draw per batch. */
const meshContributor: FrameContributor = {
  id: "prd07.mesh",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["transparent"],
  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const feeds = vfx?.meshFeed?.() ?? [];
    if (feeds.length === 0) return [];
    return meshPassFor(ctx.device).transparentItems(feeds, ctx);
  }
};

/**
 * The Renderer runs the `background` phase only when the frame has an
 * environment background (HDRI or a lane-02 probe). A sky node over a colour
 * background therefore never drew. The contributor marks the frame's
 * blackboard when it drew in `background`; otherwise it draws in
 * `after-opaque`, depth-tested against the forward depth so the sky fills
 * only uncovered pixels (lane-07 S4/S5).
 */
const SKY_DRAWN_KEY = "prd07.sky.drawnInBackground";

const skyContributor: FrameContributor = {
  id: "prd07.sky",
  owner: "prd07",
  flag: "A3D_QR_VFX_SKY",
  phases: ["background", "after-opaque"],
  passes: (phase, ctx) => {
    const atmosphere = (ctx.source as Prd07FrameSource).atmosphere;
    if (!atmosphere?.sky) return [];
    if (phase === "after-opaque" && ctx.blackboard.get(SKY_DRAWN_KEY) === true) return [];
    if (phase === "background") ctx.blackboard.set(SKY_DRAWN_KEY, true);
    const pass = skyDrawPassFor(ctx.device);
    pass.setSpec(atmosphere.sky, ctx.timeSeconds);
    pass.setViewProjection(contextViewProjection(ctx));
    // P4-T7 — the prd07.fog contributor's collect ran first this frame; when the
    // spec affects the background, bind its packed §8.4 uniforms (mode, colour,
    // volumes) + camera/sun so a3dApplyFog shades the sky at backgroundDistance.
    const fogEntry = ctx.flags.on("A3D_QR_VFX_FOG")
      ? (ctx.blackboard.get("prd07.fog") as
          | {
              uniforms: ReturnType<typeof packV2>;
              volumes: readonly Prd07FogVolume[];
              sunColor: Vec3;
              affectsBackground: boolean;
              backgroundDistance: number;
            }
          | undefined)
      : undefined;
    pass.setFog(
      fogEntry && fogEntry.affectsBackground
        ? {
            uniforms: fogEntry.uniforms,
            volumes: packFogVolumes(fogEntry.volumes),
            sunColor: fogEntry.sunColor,
            cameraPosition: ctx.camera?.position ?? [0, 0, 0],
            backgroundDistance: fogEntry.backgroundDistance
          }
        : null
    );
    if (phase === "background") return [pass];
    return [{
      name: "prd07.sky.late",
      reads: [prd07OpaqueColorResource(ctx)],
      writes: ["prd07.sky.late.color"],
      execute: () => pass.executeDepthTested()
    }];
  }
};

/**
 * P4-T4 — prd07.fog: notes the camera pose on LiveAtmosphere (the compiler's
 * packLegacy path reads it) and publishes the packed §8.4 uniforms +
 * fog-volume segments on the blackboard for the prd07.sky pass and any
 * C-02 generator material that binds `a3d_prd07_fog`.
 */
/** Only explicitly registered contexts opt in while renderer integration is staged. */
function managedPrd07Collect(ctx: FrameContributorContext): boolean {
  return hasPrd07ManagedFrameContext(ctx);
}

const fogContributor: FrameContributor = {
  id: "prd07.fog",
  owner: "prd07",
  flag: "A3D_QR_VFX_FOG",
  // `collect`, not "background": FrameGraph only calls `collect()` on
  // contributors listing that phase. Under "background" the fog store was
  // never written, so forward geometry, the sky and the volumetric pass all
  // saw "no fog" and A3D_QR_VFX_FOG frames matched flags-off byte for byte.
  phases: ["collect"],
  collect: (items, ctx) => {
    const managed = managedPrd07Collect(ctx);
    if (managed) {
      // All fog consumers share the already captured app revision. In
      // particular, never call a live source getter while building the managed
      // blackboard after asynchronous warmup.
      const packet = producePrd07ManagedFrame(ctx);
      const snapshot = prd07RendererContextSnapshot(ctx);
      const fog = packet.fog;
      if (fog) {
        ctx.blackboard.set("prd07.fog", {
          uniforms: fog.uniforms, volumes: fog.volumes, sunColor: fog.sunColor,
          affectsBackground: snapshot?.fog?.affectsBackground !== false,
          backgroundDistance: snapshot?.fog?.backgroundDistance ?? ctx.camera?.far ?? 1000
        });
      } else if (snapshot?.fogVolumes.length) {
        const packed = packV2(resolvePrd07FogSpec(null), { fogColor: PRD07_FOG_DEFAULTS.fallbackColor });
        ctx.blackboard.set("prd07.fog", {
          uniforms: { ...packed, fogA: [0, 0, 0, 0], fogMode: 0 }, volumes: snapshot.fogVolumes,
          sunColor: [1, 1, 1], affectsBackground: false, backgroundDistance: ctx.camera?.far ?? 1000
        });
      } else ctx.blackboard.delete("prd07.fog");
      return items;
    }
    const atmosphere = (ctx.source as Prd07FrameSource).atmosphere as {
      resolveFog?: (t: number) => Record<string, unknown> | null;
      fogVolumes?: () => readonly unknown[];
      noteCamera?: (position: readonly [number, number, number], forward: readonly [number, number, number]) => void;
      clockNow?: () => number;
      sky?: Record<string, unknown> | null;
    } | undefined;
    if (!atmosphere) {
      setPrd07ForwardFog(null);
      return items;
    }
    const cam = ctx.camera;
    const forward: readonly [number, number, number] = cam
      ? [-cam.viewMatrix[2], -cam.viewMatrix[6], -cam.viewMatrix[10]]
      : [0, 0, -1];
    if (cam) atmosphere.noteCamera?.(cam.position, forward);
    const spec = atmosphere.resolveFog?.(atmosphere.clockNow?.() ?? ctx.timeSeconds) ?? null;
    const resolved = resolvePrd07FogSpec(spec as Parameters<typeof resolvePrd07FogSpec>[0]);
    const sky = atmosphere.sky ?? null;
    const azimuth = Math.atan2(forward[0], forward[2]);
    const fogColor = resolved.color === "sky"
      ? skyHorizonRadiance(sky, azimuth) ?? PRD07_FOG_DEFAULTS.fallbackColor
      : parseFogColor(resolved.color, PRD07_FOG_DEFAULTS.fallbackColor);
    // Legacy generator (C-04 stub) → parity-mode slots; real C-02 → v2 slots.
    // #187: keyed on the same gate ForwardPass uses for generated programs
    // (qrCoreGeneratorOn: A3D_QR_CORE_GENERATOR, else A3D_QR_CORE — `true` or "v2"), so an
    // absorption spec reaches forward geometry as mode 5, not the legacy
    // luminance-weighted exp collapse.
    // Inlined (renderer/qrSubFlags pulls OutputPass into the vfx chunk).
    const generatorOn = ctx.flags.values["A3D_QR_CORE_GENERATOR"] !== undefined
      ? ctx.flags.on("A3D_QR_CORE_GENERATOR")
      : ctx.flags.on("A3D_QR_CORE");
    const parity = !generatorOn;
    const resolvedPacked = packV2(resolved, {
      fogColor,
      cameraY: cam?.position[1] ?? 0,
      parity
    });
    // No live fog node → fog off for the sky pass and the froxel density too,
    // matching forward geometry (IC-0, setPrd07ForwardFog(null) below). The
    // C-21 default height fog used to leak into the background pass and the
    // froxel inject from `resolvePrd07FogSpec(null)`, fogging scenes that
    // author none (prd07-volumetric-shafts: windows/background at 254).
    // Fog volumes still inject into the froxel grid.
    const packed: PackedFogUniforms = spec
      ? resolvedPacked
      : { ...resolvedPacked, fogA: [0, 0, 0, 0], fogMode: 0 };
    // §6.6 sun inscatter colour — sky radiance at the sun direction (clamped);
    // only multiplied by sunInscatter (default 0) so the approximation is inert.
    let sunColor: Vec3 = [1, 1, 1];
    let sunDirection: Vec3 = [0, 1, 0];
    if (sky) {
      try {
        const frame = skyFrame(sky as Parameters<typeof skyFrame>[0]);
        const sunDir = frame.preetham?.sunDirection ?? frame.gradient?.sunDirection ?? ([0, 1, 0] as Vec3);
        sunDirection = sunDir;
        const e = evaluateSky(frame, sunDir);
        sunColor = [Math.min(e[0], 8), Math.min(e[1], 8), Math.min(e[2], 8)];
      } catch {
        // keep the unit fallback
      }
    }
    const volumes = (atmosphere.fogVolumes?.() ?? []) as readonly Prd07FogVolume[];
    // #187/#82 — forward geometry on the C-02 path binds these per draw via the
    // prd07.fog feature's bindUniforms (absorption = mode 5, Beer-Lambert).
    // No live fog node → mode 0 on forward geometry (IC-0), not default height fog.
    setPrd07ForwardFog(
      spec
        ? { uniforms: packed, volumes, sunDirection, sunColor, cameraPosition: cam ? [cam.position[0], cam.position[1], cam.position[2]] : [0, 0, 0] }
        : null
    );
    ctx.blackboard.set("prd07.fog", {
      uniforms: packed,
      volumes,
      sunColor,
      affectsBackground: resolved.affectsBackground !== false,
      backgroundDistance: resolved.backgroundDistance ?? cam?.far ?? 1000
    });
    return items;
  },
  passes: () => []
};

/** Produce a managed packet on wetness-only frames, without touching legacy state. */
const wetnessContributor: FrameContributor = {
  id: "prd07.wetness",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["collect"],
  collect: (items, ctx) => {
    if (managedPrd07Collect(ctx)) producePrd07ManagedFrame(ctx);
    return items;
  }
};

/**
 * P3-T6 — prd07.environmentProbe: when the source carries a live atmosphere
 * (state + onSkyChanged) and no explicit environment, a per-device
 * SkyCaptureAdapter captures the visible sky into a C-09 probe on mount and
 * re-captures on every sky change. The probe lands on the blackboard for the
 * lighting contributors; GPU-side renderFace capture only — no main-thread
 * CPU prefilter (T0-25).
 */
const skyCaptureAdapters = new WeakMap<RenderDevice, { source: unknown; adapter: SkyCaptureAdapter }>();

const skyCaptureContributor: FrameContributor = {
  id: "prd07.environmentProbe",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["collect"],
  collect: (items, ctx) => {
    const src = ctx.source as Prd07FrameSource;
    const atmosphere = src.atmosphere;
    if (!atmosphere || typeof atmosphere.state !== "function" || typeof atmosphere.onSkyChanged !== "function") {
      return items;
    }
    const environment = src.environmentLighting ?? src.environmentBackground ?? null;
    let entry = skyCaptureAdapters.get(ctx.device);
    if (!entry || entry.source !== ctx.source) {
      entry?.adapter.dispose();
      entry = {
        source: ctx.source,
        adapter: new SkyCaptureAdapter(
          { atmosphere: atmosphere as SkyCaptureAppLike["atmosphere"], environment },
          ctx.device,
          ctx.flags
        )
      };
      skyCaptureAdapters.set(ctx.device, entry);
    }
    ctx.blackboard.set("prd07.environmentProbe", entry.adapter.current());
    return items;
  },
  passes: () => []
};

/**
 * P5-T1 — prd07.gpuSim: steps each ParticleGpuSim published on the blackboard
 * under "prd07.gpuSims" (engine producers push {sim, emitCount}) during the
 * collect phase — before shadows — so draws read frame N-1 state (§6.2.3).
 * Requires floatColorBuffer; producers gate on `ParticleGpuSim.isAvailable`
 * and keep the CPU emitter otherwise (PARTICLE_GPU_UNAVAILABLE).
 */
interface GpuSimScope {
  simulations: Map<string, ParticleGpuSim>;
  readonly pending: Set<ParticleGpuSim>;
  collecting: boolean;
  disposing: boolean;
  released: boolean;
  revision: number;
}

const gpuSims = new WeakMap<RenderDevice, WeakMap<object, GpuSimScope>>();
const gpuSimDeviceHooks = new WeakSet<RenderDevice>();

function gpuSimScopes(device: RenderDevice): WeakMap<object, GpuSimScope> {
  let scopes = gpuSims.get(device);
  if (!scopes) {
    scopes = new WeakMap();
    gpuSims.set(device, scopes);
  }
  return scopes;
}

function installGpuSimDeviceHook(device: RenderDevice): void {
  if (!gpuSimDeviceHooks.has(device)) {
    const originalDispose = device.dispose.bind(device);
    let disposing = false;
    device.dispose = (): void => {
      if (disposing) return;
      disposing = true;
      try {
        originalDispose();
        // A failed device cleanup still needs the owner mappings for retry.
        gpuSims.delete(device);
      } finally {
        disposing = false;
      }
    };
    gpuSimDeviceHooks.add(device);
  }
}

function retireGpuSim(scope: GpuSimScope, sim: ParticleGpuSim, errors: unknown[]): void {
  try {
    sim.dispose();
    if (sim.cleanupPending) {
      scope.pending.add(sim);
      errors.push(new Error("Particle simulation cleanup is in progress"));
    } else scope.pending.delete(sim);
  } catch (error) {
    if (sim.cleanupPending) scope.pending.add(sim);
    else scope.pending.delete(sim);
    errors.push(error);
  }
}

export function disposePrd07GpuSimsForOwner(device: RenderDevice, owner: object): void {
  const scopes = gpuSims.get(device);
  const scope = scopes?.get(owner);
  if (!scope || scope.disposing) return;
  scope.disposing = true;
  scope.released = true;
  scope.revision += 1;
  const simulations = new Set([...scope.simulations.values(), ...scope.pending]);
  scope.simulations.clear();
  scope.pending.clear();
  const errors: unknown[] = [];
  try {
    for (const sim of simulations) retireGpuSim(scope, sim, errors);
    // The collection may still return newly allocated resources after this
    // callback. Keep its scope and tell the renderer to retry when it unwinds.
    if (scope.collecting) errors.push(new Error("Particle simulation collection was interrupted by owner cleanup"));
  } finally {
    scope.disposing = false;
    if (!scope.collecting && scope.simulations.size === 0 && scope.pending.size === 0 && scopes?.get(owner) === scope) {
      scopes?.delete(owner);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Particle simulation owner cleanup failed");
}

const gpuSimContributor: FrameContributor = {
  id: "prd07.gpuSim",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["collect"],
  collect: (items, ctx) => {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const requests = vfx?.gpuSimFeed?.() ?? [];
    const owner = ctx.postScopeId ?? ctx.device;
    if (requests.length > 0 && particleGpuSimAvailable(ctx.device)) {
      const scopes = gpuSimScopes(ctx.device);
      const scope: GpuSimScope = scopes.get(owner) ?? {
        simulations: new Map(), pending: new Set(), collecting: false, disposing: false, released: false, revision: 0
      };
      if (!scopes.has(owner)) scopes.set(owner, scope);
      if (scope.collecting || scope.disposing) throw new Error("Particle simulation owner is busy");
      scope.collecting = true;
      scope.released = false;
      const revision = scope.revision;
      const current = (): boolean => !scope.released && scope.revision === revision && scopes.get(owner) === scope;
      const previous = scope.simulations;
      const created = new Set<ParticleGpuSim>();
      try {
        const map = new Map<string, ParticleGpuSim>();
        const entries: { sim: ParticleGpuSim; emitCount: number }[] = [];
        const reused = new Set<ParticleGpuSim>();
        try {
          for (const r of requests) {
            if (!current()) throw new Error("Particle simulation collection invalidated");
            let sim = map.get(r.nodeId) ?? previous.get(r.nodeId);
            if (!sim || sim.disposed) {
              sim = new ParticleGpuSim(ctx.device, r.spec, ctx.flags);
              created.add(sim);
            } else if (!created.has(sim)) reused.add(sim);
            if (!current()) throw new Error("Particle simulation collection invalidated");
            map.set(r.nodeId, sim);
            entries.push({ sim, emitCount: r.emitCount });
          }
          for (const sim of reused) {
            sim.useFlags(ctx.flags);
            if (!current()) throw new Error("Particle simulation collection invalidated");
          }
          scope.simulations = map;
        } catch (error) {
          const errors: unknown[] = [error];
          if (error instanceof ParticleGpuSimInitializationError && error.simulation.cleanupPending) {
            scope.pending.add(error.simulation);
          }
          for (const sim of created) retireGpuSim(scope, sim, errors);
          if (errors.length > 1) throw new AggregateError(errors, "Particle simulation collection failed");
          throw error;
        }
        const active = new Set(map.values());
        const retiring = new Set([...scope.pending, ...previous.values()]);
        const errors: unknown[] = [];
        for (const sim of retiring) {
          if (!active.has(sim)) retireGpuSim(scope, sim, errors);
        }
        if (errors.length) throw new AggregateError(errors, "Particle simulation retirement failed");
        if (!current()) throw new Error("Particle simulation collection invalidated");
        ctx.blackboard.set("prd07.gpuSims", entries);
        for (const entry of entries) {
          if (!current()) throw new Error("Particle simulation collection invalidated");
          entry.sim.step(1 / 60, entry.emitCount, ctx.timeSeconds);
        }
      } finally {
        scope.collecting = false;
        // Install outside the simulation's device hook, after construction,
        // so mappings are dropped only if the entire device cleanup succeeds.
        installGpuSimDeviceHook(ctx.device);
        if (scope.simulations.size === 0 && scope.pending.size === 0 && scopes.get(owner) === scope) {
          scopes.delete(owner);
        }
      }
    } else {
      // floatColorBuffer absent (PARTICLE_GPU_UNAVAILABLE) or no gpu emitters:
      // CPU emitter stays the only sim (§8.3 fallback).
      ctx.blackboard.set("prd07.gpuSims", []);
      disposePrd07GpuSimsForOwner(ctx.device, owner);
    }
    return items;
  },
  passes: () => []
};

/**
 * P6-T1 — prd07.decals (§6.9): merged page×blend draws after opaque, before
 * transparents. Decal nodes (hidden `prd07.legacyDecal.*` primitives under
 * the flag) are published by the engine on `vfx.decalFeed()`; one draw per
 * page×blend group replaces E46's one-draw-per-decal.
 */
function decalPassFor(device: RenderDevice): DecalPass {
  let pass = decalPasses.get(device);
  if (!pass) {
    pass = new DecalPass(device, {
      // §8.8 / I3: shade with the scene's own lights so marks match the surface.
      lighting: resolveDecalLighting,
      fog: true,
      fogUniforms: (ctx) => {
        const entry = ctx.blackboard.get("prd07.fog") as
          | { uniforms: PackedFogUniforms; volumes: readonly Prd07FogVolume[]; sunColor: Vec3 }
          | undefined;
        if (!entry) return null;
        const f = entry.uniforms;
        return new Map<string, import("../RenderDevice").UniformValue>([
          ["u_fogA", f.fogA],
          ["u_fogB", f.fogB],
          ["u_fogColor", f.fogColor],
          ["u_fogAbsorption", f.fogAbsorption],
          ["u_fogMode", f.fogMode],
          ["u_fogNear", f.fogNear],
          ["u_fogFar", f.fogFar],
          ["u_fogVolumes", packFogVolumes(entry.volumes)],
          ["u_cameraPosition", [...(ctx.camera?.position ?? [0, 0, 0])]],
          ["u_sunColor", [...entry.sunColor]]
        ]);
      },
      onNote: (code, message) => console.warn(`[${code}] ${message}`)
    });
    decalPasses.set(device, pass);
  }
  return pass;
}

export const decalsContributor: FrameContributor = {
  id: "prd07.decals",
  owner: "prd07",
  flag: "A3D_QR_VFX_DECALS",
  phases: ["after-opaque"],
  passes: (phase, ctx) => {
    if (phase !== "after-opaque") return [];
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const batch = vfx?.decalFeed?.();
    if (!batch || batch.size === 0) return [];
    const pass = decalPassFor(ctx.device);
    const now = ctx.timeSeconds;
    return [{
      name: "prd07.decals",
      // Ordered after the opaque pass; depth-tests against the bound forward
      // depth attachment (no sampled scene depth).
      reads: [prd07OpaqueColorResource(ctx)],
      writes: ["prd07.decals.color"],
      execute: () => pass.draw(batch, ctx, now)
    }];
  }
};

/**
 * T0-34 / #1111 — render-graph resources the after-opaque lane passes may
 * declare. Only resources a pass in `Renderer.render()` actually writes:
 * the opaque forward pass writes `aura.scene.color.opaque` on the v2 output
 * path (A3D_QR_CORE_OUTPUT, else A3D_QR_CORE) and `color` on the legacy
 * path; `aura.scene.depth.copy` exists only on the v2 path (SceneDepthCopyPass).
 * Nothing writes `aura.scene.depth`, and `aura.scene.color` is written once,
 * by the final transparent pass — declaring either made `compilePlan` throw.
 * Each lane pass writes its own namespaced resource (single-producer rule).
 * Inlined (renderer/qrSubFlags pulls OutputPass into the vfx chunk).
 */
function v2OutputOn(ctx: FrameContributorContext): boolean {
  return ctx.flags.values["A3D_QR_CORE_OUTPUT"] !== undefined
    ? ctx.flags.on("A3D_QR_CORE_OUTPUT")
    : ctx.flags.on("A3D_QR_CORE");
}

export function prd07OpaqueColorResource(ctx: FrameContributorContext): string {
  return v2OutputOn(ctx) ? "aura.scene.color.opaque" : "color";
}

/** Reads for a pass that samples the scene-depth copy (v2 path only). */
export function prd07DepthCopyReads(ctx: FrameContributorContext): readonly string[] {
  return v2OutputOn(ctx) ? [prd07OpaqueColorResource(ctx), "aura.scene.depth.copy"] : [prd07OpaqueColorResource(ctx)];
}

/** Per-device froxel pass cache — the grid spec selects the atlas layout. */
const volumetricPasses = new WeakMap<import("../RenderDevice").RenderDevice, Map<string, VolumetricFogPass>>();

// C-31 measured-cost gate (FIX-froxel-cost): a runtime that measures the
// volumetric pass feeds samples through `notePrd07VolumetricGpuMs`; once the
// EWMA clears the tier budget for 8+ frames the contributor stops emitting
// the froxel pass and the analytic fog path covers it instead.
interface VolumetricCostEntry { ewma: number; frames: number; fallback: boolean }
const volumetricCost = new WeakMap<RenderDevice, VolumetricCostEntry>();

/** Feed one measured volumetric-GPU-ms sample for `device`. */
export function notePrd07VolumetricGpuMs(device: RenderDevice, ms: number): void {
  const s = volumetricCost.get(device) ?? { ewma: 0, frames: 0, fallback: false };
  s.ewma = s.frames === 0 ? ms : s.ewma * 0.8 + ms * 0.2;
  s.frames += 1;
  volumetricCost.set(device, s);
}

const WEBDRIVER = (globalThis as { navigator?: { webdriver?: boolean } }).navigator?.webdriver === true;
/** C-31 atmosphere scope of the §18 tier envelope: 1.2ms medium / 2.0ms high;
 *  WebDriver (software GL) pins the tight 0.6ms cap. */
export function froxelBudgetMs(tier: { readonly volumetricFog?: string | null }): number {
  if (WEBDRIVER) return 0.6;
  return tier.volumetricFog === "froxel-high" ? 2.0 : 1.2;
}

/** EWMA-with-hysteresis gate — true while the measured cost exceeds `budgetMs`. */
export function prd07VolumetricCostFallback(device: RenderDevice, budgetMs: number): boolean {
  const s = volumetricCost.get(device);
  if (!s || s.frames < 8) return s?.fallback ?? false;
  s.fallback = s.fallback ? s.ewma > budgetMs * 0.75 : s.ewma > budgetMs;
  return s.fallback;
}

function volumetricPassFor(device: import("../RenderDevice").RenderDevice, grid: FroxelGridSpec): VolumetricFogPass {
  const key = `${grid.tileWidth}x${grid.tileHeight}x${grid.slices}`;
  let map = volumetricPasses.get(device);
  if (!map) volumetricPasses.set(device, (map = new Map()));
  let pass = map.get(key);
  if (!pass) map.set(key, (pass = new VolumetricFogPass(device, grid)));
  return pass;
}

/**
 * P5-T6 — prd07.volumetric: froxel volumetrics (§6.7). Runs only when the
 * C-27 tier maps to a froxel grid AND `resolveSceneDepth(ctx).available`
 * (the stub reports false → VOLUMETRIC_DEPTH_PENDING, analytic fog covers
 * every tier instead). Temporal reprojection (Ultra) needs C-01
 * previousViewProjectionMatrix — null → VOLUMETRIC_TEMPORAL_PENDING.
 */
const volumetricContributor: FrameContributor = {
  id: "prd07.volumetric",
  owner: "prd07",
  flag: "A3D_QR_VFX_VOLUMETRIC",
  phases: ["after-opaque"],
  passes: (phase, ctx) => {
    if (phase !== "after-opaque") return [];
    const depth = resolveSceneDepth(ctx);
    const grid = froxelGridFor(ctx.tier.volumetricFog);
    if (!grid || !depth.available || !ctx.camera) return [];
    if (prd07VolumetricCostFallback(ctx.device, froxelBudgetMs(ctx.tier))) {
      ctx.blackboard.set("prd07.volumetric.costFallback", "VOLUMETRIC_COST_FALLBACK");
      return [];
    }
    const pass = volumetricPassFor(ctx.device, grid);
    // Fog spec comes from the prd07.fog blackboard entry (written in collect).
    const fogEntry = ctx.flags.on("A3D_QR_VFX_FOG")
      ? (ctx.blackboard.get("prd07.fog") as { uniforms?: PackedFogUniforms; volumes?: readonly Prd07FogVolume[]; sunColor?: Vec3 } | undefined)
      : undefined;
    const sky = managedPrd07Collect(ctx)
      ? (prd07RendererContextSnapshot(ctx)?.skyForFog as Record<string, unknown> | null | undefined) ?? null
      : ((ctx.source as Prd07FrameSource).atmosphere as { sky?: Record<string, unknown> | null } | undefined)?.sky ?? null;
    let sunDirection: Vec3 = [0, 1, 0];
    let sunColor: Vec3 = (fogEntry?.sunColor ?? [1, 1, 1]) as Vec3;
    // Without a sky, light the froxels with the scene's own key light and
    // ambient (the same lights the surfaces get). A fixed +Y unit sun and a
    // hard-coded [0.2, 0.22, 0.26] ambient washed the dark hangar of
    // prd07-volumetric-shafts to grey (promote run 38198732843).
    const sceneLighting = resolveDecalLighting(ctx);
    const key = sceneLighting?.lights.find((light) => light.kind === "directional");
    if (sky) {
      try {
        const frame = skyFrame(sky as Parameters<typeof skyFrame>[0]);
        sunDirection = frame.preetham?.sunDirection ?? frame.gradient?.sunDirection ?? sunDirection;
      } catch { /* keep default */ }
    } else if (key) {
      sunDirection = [key.vector[0], key.vector[1], key.vector[2]];
      sunColor = [key.radiance[0], key.radiance[1], key.radiance[2]];
    }
    const input: VolumetricFogPassInput = {
      fog: fogEntry?.uniforms ?? null,
      fogColor: [0.663, 0.737, 0.812],
      volumes: fogEntry?.volumes ?? [],
      sunDirection,
      sunColor,
      // Ambient irradiance E (colour × intensity) → uniform radiance E/π, the
      // same 1/π convention as the forward ambient (BRDF_Lambert).
      ambientColor: sceneLighting
        ? [sceneLighting.ambient[0] / Math.PI, sceneLighting.ambient[1] / Math.PI, sceneLighting.ambient[2] / Math.PI]
        : [0.2, 0.22, 0.26],
      sceneDepth: depth.source.texture,
      depthLinearize: [depth.source.linearize.near, depth.source.linearize.far, depth.source.linearize.orthographic ? 1 : 0, 0]
    };
    return [{
      name: "prd07.volumetric",
      // Samples the scene-depth copy (resolveSceneDepth), applies into the
      // forward target after opaque.
      reads: prd07DepthCopyReads(ctx),
      writes: ["prd07.volumetric.color"],
      execute: () => {
        const { apply } = pass.update(input, ctx);
        // T0-34: apply into the live forward target (prd01.forwardTarget), not
        // the canvas — and verify the pass leaves the bound target untouched.
        const boundBefore = ctx.device.getRenderTarget?.() ?? null;
        const forward = ctx.blackboard.get("prd01.forwardTarget") as RenderTarget | undefined;
        apply(forward ?? boundBefore);
        if ((ctx.device.getRenderTarget?.() ?? null) !== boundBefore) {
          console.warn("prd07.volumetric: bound render target changed inside contributor");
          ctx.device.setRenderTarget(boundBefore);
        }
      }
    }];
  }
};

/** Idempotent lane registration (P1-T1): safe on repeated barrel imports. */
export function registerPrd07Contributors(): void {
  for (const contributor of [particlesContributor, lightsContributor, ribbonContributor, beamContributor, meshContributor, gpuSimContributor, skyCaptureContributor, fogContributor, wetnessContributor, skyContributor, decalsContributor, volumetricContributor]) {
    try {
      registerFrameContributor(contributor);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes(contributor.id))) throw error;
    }
  }
}
