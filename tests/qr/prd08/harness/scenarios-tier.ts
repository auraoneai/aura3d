/**
 * PRD-08 harness scenarios, part 3 — S19 per-tier lane budgets (§17).
 *
 * CPU + memory are measured on a STANDALONE lane set (§17 "measured
 * standalone"): a second `createAuraCameraController` bound to a view of the
 * app (its runtime-node registry, its `app.quality`, no `onFrame` — so it
 * only moves when this scenario presents it), a `createFeelBus`, an
 * `InterpolationStore` over the tier's handle count, the occluder fade +
 * its C-01 contributor, and the `bindFeelSound` listener glue. The timed lane
 * tick is everything except the game's own sim mover:
 *
 *   capturePrevious │ (sim move, untimed) │ captureCurrent → resolve →
 *   camera.present (rig + collision cast) → occluder query → remaining cast
 *   demand → fade.update → feel advance → tiered screen uniforms → listener
 *
 * Cast demand per frame is the lane's tier cap + 1 sphere casts plus one
 * occluder query, so the probe budget is exercised under over-demand.
 *
 * GPU is measured on the MOUNTED app (`tier-gpu`): TIME_ELAPSED over each
 * scripted presented tick, with the lane's GPU features (fade contributor +
 * screen-feel emits) on vs off. Assertions live in checks.ts.
 */
import type { AuraApp } from "@aura3d/engine";
import {
  CAMERA_PROBE_TIER_BUDGETS,
  bindFeelSound,
  createAuraCameraController,
  createChaseRig,
  createFeelBus,
  createInterpolationStore,
  createOccluderFade,
  createOccluderFadeContributor,
  type AuraBudgetedCameraProbe,
  type AuraCameraProbeTier,
  type AuraInterpolableHandle
} from "@aura3d/engine/lanes";
import { registerFrameContributor, type FrameContributorContext, type RenderItem } from "@aura3d/rendering/contracts";
import type { ScenarioContext } from "./scenarios-feel";

export const TIER_SUBJECT = "tier-subject";
export const TIER_WALL = "tier-wall";
const DT = 1 / 60;
const TIERS = ["low", "medium", "high", "ultra"] as const;

type Vec3 = [number, number, number];
interface QualityLike {
  readonly tier: string;
  set(tier: AuraCameraProbeTier): Promise<void>;
}
interface ShadowCamera {
  readonly probe: AuraBudgetedCameraProbe;
  present(realDt: number, timeMs: number, at?: (id: string) => readonly number[] | undefined): unknown;
  presented(): { position: readonly number[]; target: readonly number[] };
  use(rig: unknown): void;
  shake: { add(n: number): void };
  punch: { trigger(o: { fov?: number; dolly?: number }): void };
}

function asTier(tier: unknown): AuraCameraProbeTier {
  if (!TIERS.includes(tier as AuraCameraProbeTier)) throw new Error(`S19: unknown tier ${String(tier)}`);
  return tier as AuraCameraProbeTier;
}

/** Force the C-27 tier through `app.quality.set` and confirm it took. */
export async function forceTier(app: AuraApp, tier: AuraCameraProbeTier): Promise<string> {
  const quality = (app as unknown as { quality?: QualityLike }).quality;
  if (!quality || typeof quality.set !== "function") throw new Error("S19: app.quality (C-27) is not mounted");
  await quality.set(tier);
  if (quality.tier !== tier) throw new Error(`S19: app.quality.set("${tier}") left tier ${quality.tier}`);
  return quality.tier;
}

const subjectPosition = (app: AuraApp): readonly number[] => {
  const h = app.nodes.get(TIER_SUBJECT);
  if (!h) throw new Error(`S19: ${TIER_SUBJECT} runtime node missing (open ?scene=tier)`);
  return h.position;
};

interface LaneSet {
  readonly tier: AuraCameraProbeTier;
  readonly camera: ShadowCamera;
  readonly store: ReturnType<typeof createInterpolationStore>;
  readonly handles: { id: string; position: Vec3; rotation: Vec3; scale: number }[];
  readonly fade: ReturnType<typeof createOccluderFade>;
  readonly bus: ReturnType<typeof createFeelBus>;
  readonly listen: () => void;
  readonly unregister: () => void;
  readonly counters: { listenerCalls: number; fadeTracked: number };
  frame: number;
}

let lane: LaneSet | undefined;

function mountLaneSet(app: AuraApp, tier: AuraCameraProbeTier, handleCount: number): LaneSet {
  // View of the app: real registry + quality + scene nodes, own camera spec,
  // no onFrame (the scenario is the only driver).
  const view = {
    nodes: app.nodes,
    quality: (app as unknown as { quality: unknown }).quality,
    canvas: { width: 640, height: 360 },
    scene: { camera: { mode: "perspective", position: [0, 6, 14], target: [0, 1, 0], fov: 50 }, nodes: app.scene?.nodes ?? [] }
  };
  const camera = createAuraCameraController(view as unknown as AuraApp) as unknown as ShadowCamera;
  camera.use(createChaseRig({ target: TIER_SUBJECT, distance: 6, height: 2, collision: true }));

  const store = createInterpolationStore();
  const handles: LaneSet["handles"] = [];
  for (let i = 0; i < handleCount; i += 1) {
    const a = (i / handleCount) * Math.PI * 2;
    const h = { id: `s19-h${i}`, position: [Math.cos(a) * 5, 1, Math.sin(a) * 5] as Vec3, rotation: [0, a, 0] as Vec3, scale: 1 };
    store.registerHandle(h as unknown as AuraInterpolableHandle);
    handles.push(h);
  }
  const fade = createOccluderFade();
  const contributor = createOccluderFadeContributor(fade, {
    itemToNodeId: (item) => item.label?.split(":").at(-1),
    tier: () => (app as unknown as { quality: QualityLike }).quality.tier
  });
  const unregister = registerFrameContributor(contributor);
  const bus = createFeelBus({
    camera: { shake: (n) => camera.shake.add(n), punch: (o) => camera.punch.trigger(o) },
    reducedMotion: () => false
  });
  bus.define("s19-hit", { shake: 0.3, punch: { fov: -1 }, screen: { flash: 0.4, chroma: 0.4, radialBlur: 0.4, vignette: 0.4 } });
  const counters = { listenerCalls: 0, fadeTracked: 0 };
  let tick: ((f: { dt: number }) => void) | undefined;
  const glueApp = { camera, onFrame: (cb: (f: { dt: number }) => void) => ((tick = cb), () => undefined) };
  bindFeelSound(glueApp as unknown as AuraApp, { setListener: () => void (counters.listenerCalls += 1) });
  if (!tick) throw new Error("S19: bindFeelSound did not subscribe");
  const listen = () => tick!({ dt: DT });
  return { tier, camera, store, handles, fade, bus, listen, unregister, counters, frame: 0 };
}

interface FrameOut {
  cpuMs: number;
  stats: ReturnType<AuraBudgetedCameraProbe["stats"]>;
  chroma: number;
  radialBlur: number;
  flash: number;
}

/** One lane tick at 60 Hz; returns the timed lane-only ms and probe stats. */
function laneFrame(app: AuraApp, s: LaneSet): FrameOut {
  const cap = CAMERA_PROBE_TIER_BUDGETS[s.tier].sphereCasts;
  s.frame += 1;
  const timeMs = s.frame * DT * 1000;
  if (s.frame % 30 === 1) s.bus.emit("s19-hit");

  const t0 = performance.now();
  s.store.capturePrevious();
  const t1 = performance.now();
  // Game sim (untimed): subject on a circle, every handle steps.
  const a = s.frame * DT * 0.8;
  app.nodes.get(TIER_SUBJECT)!.setPosition(Math.cos(a) * 3, 0.9, Math.sin(a) * 3);
  for (const h of s.handles) {
    h.position[0] += 0.01;
    h.rotation[1] += 0.01;
  }
  const t2 = performance.now();
  s.store.captureCurrent();
  const resolved = s.store.resolve(0.5);
  s.camera.present(DT, timeMs, (id) => resolved.get(id)?.position);
  const pose = s.camera.presented();
  const subject = subjectPosition(app);
  const occ = s.camera.probe.occluders(pose.position as Vec3, subject as Vec3).filter((id) => id !== TIER_SUBJECT);
  s.counters.fadeTracked += occ.length;
  s.fade.setOccluders(occ);
  for (let st = s.camera.probe.stats(); st.sphereCasts + st.deniedCasts < cap + 1; st = s.camera.probe.stats()) {
    s.camera.probe.sphereCast(pose.target as Vec3, pose.position as Vec3, 0.2);
  }
  s.fade.update(DT);
  s.bus.advance(DT);
  const u = s.bus.screenUniformsForTier(s.tier);
  s.listen();
  const t3 = performance.now();
  return { cpuMs: t1 - t0 + (t3 - t2), stats: s.camera.probe.stats(), chroma: u.chroma, radialBlur: u.radialBlur, flash: u.flash };
}

/** Mount the tier's standalone lane set and warm it to steady state. */
export async function tierMount({ app }: ScenarioContext, o: { tier: string; handles: number; warmup?: number }) {
  const tier = asTier(o.tier);
  await forceTier(app, tier);
  lane?.unregister();
  lane = mountLaneSet(app, tier, o.handles);
  for (let i = 0; i < (o.warmup ?? 120); i += 1) laneFrame(app, lane);
  return { tier, storeSize: lane.store.size };
}

/** Drop the lane set (so a later mount + GC measures retained heap only). */
export function tierUnmount() {
  lane?.unregister();
  lane = undefined;
  return { unmounted: true };
}

/** Run the measured frames on the mounted lane set. */
export function tierCpu({ app }: ScenarioContext, o: { frames: number }) {
  const s = lane;
  if (!s) throw new Error("S19: tier-cpu before tier-mount");
  const out: FrameOut[] = [];
  const listenerBefore = s.counters.listenerCalls;
  for (let i = 0; i < o.frames; i += 1) out.push(laneFrame(app, s));
  // Tier gating of the fade contributor: track the wall explicitly, then ask
  // the contributor — Low must hand the input array back untouched.
  const probeFade = createOccluderFade();
  probeFade.setOccluders([TIER_WALL]);
  probeFade.update(0.5);
  const contributor = createOccluderFadeContributor(probeFade, { tier: () => s.tier });
  const items = [{ label: TIER_WALL }] as unknown as RenderItem[];
  const ctx = { flags: { on: (f: string) => f === "A3D_QR_CAMERA" }, frameIndex: 0 } as unknown as FrameContributorContext;
  return {
    tier: s.tier,
    qualityTier: (app as unknown as { quality: QualityLike }).quality.tier,
    handles: s.handles.length,
    storeSize: s.store.size,
    frames: out.length,
    cpuMs: out.map((f) => f.cpuMs),
    casts: out.map((f) => f.stats),
    castDemand: CAMERA_PROBE_TIER_BUDGETS[s.tier].sphereCasts + 1,
    fadeTracked: s.counters.fadeTracked,
    maxChroma: Math.max(...out.map((f) => Math.abs(f.chroma))),
    maxRadialBlur: Math.max(...out.map((f) => Math.abs(f.radialBlur))),
    maxFlash: Math.max(...out.map((f) => f.flash)),
    contributorPassThrough: contributor.collect!(items, ctx) === items,
    listenerCalls: s.counters.listenerCalls - listenerBefore
  };
}

interface TimerExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/**
 * GPU ms per presented frame on the mounted app: one TIME_ELAPSED query
 * around each scripted tick (every render the tick submits — one under the
 * §6.5 driver, one per substep under `?renderPerSubstep=1`). `lane: true`
 * turns the lane's GPU features on: the occluder-fade contributor (fed from
 * `app.camera.probe.occluders` each presented frame, so Low's budget denies
 * it) and a screen-feel emit every 20 frames. Fails — never skips — when the
 * runner has no WebGL2 context or no EXT_disjoint_timer_query_webgl2.
 */
export async function tierGpu(
  { app, pipeline: p }: ScenarioContext,
  o: { tier: string; frames: number; lane: boolean; dtMs?: number; warmup?: number }
) {
  const tier = asTier(o.tier);
  await forceTier(app, tier);
  if (!p.tick) throw new Error("S19 GPU: needs the scripted clock (?scripted=1)");
  const canvas = typeof document !== "undefined" ? document.querySelector<HTMLCanvasElement>("#mount canvas") : null;
  const gl = canvas?.getContext("webgl2") ?? null;
  if (!gl) throw new Error("S19 GPU: the harness canvas has no WebGL2 context — GPU budget cannot be measured");
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExt | null;
  if (!ext) {
    throw new Error("S19 GPU: EXT_disjoint_timer_query_webgl2 unavailable on this runner — GPU budget cannot be measured (failing, not skipping)");
  }
  const cam = (app as unknown as { camera: ShadowCamera }).camera;
  if (!cam.probe) throw new Error("S19 GPU: app.camera exposes no tier-budgeted probe");
  let fadedItems = 0;
  const off: (() => void)[] = [];
  if (o.lane) {
    const fade = createOccluderFade();
    off.push(
      registerFrameContributor(
        createOccluderFadeContributor(fade, {
          itemToNodeId: (item) => {
            const id = item.label?.split(":").at(-1);
            if (id !== undefined && fade.fadeFor(id) < 0.999) fadedItems += 1;
            return id;
          },
          tier: () => (app as unknown as { quality: QualityLike }).quality.tier
        })
      )
    );
    const feel = (app as unknown as { feel: { define(e: string, s: unknown): void; emit(e: string): void } }).feel;
    feel.define("s19-screen", { screen: { flash: 0.4, chroma: 0.4, radialBlur: 0.4, vignette: 0.4 } });
    let n = 0;
    off.push(
      p.driver.onRender((f) => {
        const pose = cam.presented();
        const ids = cam.probe.occluders(pose.position as Vec3, subjectPosition(app) as Vec3).filter((id) => id !== TIER_SUBJECT);
        fade.setOccluders(ids);
        fade.update(f.realDt);
        if (n++ % 20 === 0) feel.emit("s19-screen");
      })
    );
  }
  const dtMs = o.dtMs ?? 1000 / 60;
  try {
    for (let i = 0; i < (o.warmup ?? 30); i += 1) p.tick(dtMs);
    fadedItems = 0;
    gl.getParameter(ext.GPU_DISJOINT_EXT); // clear a stale disjoint flag
    const queries: WebGLQuery[] = [];
    let disjoint = 0;
    for (let i = 0; i < o.frames; i += 1) {
      const q = gl.createQuery()!;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      p.tick(dtMs);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      queries.push(q);
    }
    // Query results only become available after control returns to the
    // event loop; poll the last one (results resolve in order).
    const deadline = performance.now() + 10_000;
    while (!gl.getQueryParameter(queries.at(-1)!, gl.QUERY_RESULT_AVAILABLE)) {
      if (performance.now() > deadline) throw new Error("S19 GPU: timer query results never became available");
      await new Promise((r) => setTimeout(r, 16));
    }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) disjoint += 1;
    const gpuMs = queries.map((q) => {
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(q);
      return ns / 1e6;
    });
    p.records.splice(0, p.records.length);
    return { tier, frames: gpuMs.length, gpuMs, disjoint, fadedItems };
  } finally {
    for (const f of off) f();
  }
}
