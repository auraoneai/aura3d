/**
 * Lane adapter `prd06-crossfade-filmstrip` (PRD-06 T1.14), Aura3D side.
 *
 * Live choreography (not the frozen `animation:{clip,time}` path — the strip
 * needs moving frames): mounts the spec's scene with the soldier on a mutable
 * runtime node, plays `motion.initialClip`, then at each transition time calls
 * `handle.play(clip, { loop:true, crossFade: fadeSeconds, warp })` — the C-19
 * dispatch that lands on the per-actor PoseMixer's `crossFadeTo(…, 0.25,
 * {warp:true})` (T1.9).
 *
 * After READY the adapter keeps stepping `app.step(1/60)` on rAF so the strip
 * step's screenshots capture the moving crossfades, and samples every bone at
 * a fixed 60 Hz through `handle.animation.socket(bone).worldMatrix()`
 * (T0.18) → `MotionMetrics.ts` (E42: not MotionQuality). Metrics publish to
 * `window.__PRD06_CROSSFADE_FILMSTRIP__` once `motion.horizonSeconds` elapses.
 */
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  model,
  nodeHandleExtensionFor,
  primitives,
  scene
} from "@aura3d/engine";
import {
  footSlide,
  isHumanoidMotionBone,
  locomotionPhaseError,
  motionFrame,
  transitionContinuity,
  type MotionFrame
} from "@aura3d/animation/lanes";
import { hdriAssets, modelAssets } from "../../../shared/assets";
import type { CapabilityEntry, ReadyPayload } from "../../../shared/types";
import { prd06CrossfadeFilmstrip } from "../../../scenes/prd06/crossfade-filmstrip";

const auraAssets = defineAuraAssets({
  soldier: {
    type: "model" as const,
    format: "glb",
    url: modelAssets.soldier.url,
    hash: modelAssets.soldier.sha256,
    bounds: modelAssets.soldier.worldSize,
    metadata: { animations: modelAssets.soldier.animations, license: modelAssets.soldier.provenance, sourcePath: modelAssets.soldier.repoPath }
  },
  studioSmall08: {
    type: "texture" as const,
    format: "hdr",
    url: hdriAssets.studioSmall08.url,
    hash: hdriAssets.studioSmall08.sha256,
    metadata: { license: hdriAssets.studioSmall08.provenance, sourcePath: hdriAssets.studioSmall08.repoPath }
  }
});

declare const __AURA3D_VERSION__: string;

interface Prd06CrossfadeReport {
  readonly status: "running" | "done" | "error";
  readonly error?: string;
  readonly simSeconds?: number;
  readonly firedTransitions?: readonly string[];
  readonly frameCount?: number;
  readonly metrics?: {
    readonly continuity: readonly { readonly at: number; readonly continuity: number; readonly maxAngularSpeedDegPerSec: number; readonly baselineDegPerSec: number }[];
    readonly footSlide: { readonly maxSlideM: number; readonly phases: number };
    readonly phaseError: { readonly maxPhaseError: number; readonly meanPhaseError: number; readonly comparedFrames: number };
  };
  readonly sampledBones?: number;
}

declare global {
  interface Window {
    __PRD06_CROSSFADE_FILMSTRIP__?: Prd06CrossfadeReport;
  }
}

export default async function run(host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }): Promise<ReadyPayload> {
  const started = performance.now();
  const spec = prd06CrossfadeFilmstrip;
  const motion = spec.motion;
  const capabilityLog: CapabilityEntry[] = [];

  const built = scene();
  if (spec.background.kind === "color") built.background(spec.background.color);
  built.camera(camera.perspective({
    position: spec.camera.position,
    target: spec.camera.target,
    fov: spec.camera.fov,
    near: spec.camera.near,
    far: spec.camera.far
  }));
  built.add(environments.hdri({ texture: auraAssets.studioSmall08, intensity: spec.environment!.intensity, rotation: spec.environment!.rotation }));
  const sun = spec.lights[0] as Extract<(typeof spec.lights)[number], { kind: "directional" }>;
  built.add(lights.directional({ name: sun.name, position: sun.position, intensity: sun.intensity, color: sun.color, shadow: sun.castShadow })
    .lookAt(sun.target[0], sun.target[1], sun.target[2]));
  const ground = spec.objects[0] as Extract<typeof spec.objects[number], { kind: "primitive" }>;
  built.add(primitives.plane({
    name: ground.name,
    material: { color: ground.material.color, roughness: ground.material.roughness, metalness: ground.material.metalness },
    size: ground.size,
    castShadow: false,
    receiveShadow: true
  }).position(...ground.position));
  // Mutable runtime id lets the choreography re-drive `handle.play(...)` after mount.
  built.add(model(auraAssets.soldier, {
    name: "soldier",
    scaleMode: "world",
    castShadow: true,
    receiveShadow: true
  }).position(0, 0, 0).runtime({ id: motion.runtimeId }));

  const app = createAuraApp(host, {
    scene: built,
    renderer: { qualityProfile: "production" },
    pixelRatio: opts?.dpr ?? spec.resolution.devicePixelRatio,
    resize: false,
    autoStart: false,
    // Flag-on by default (the lane measures the new path); the page router's
    // `?a3d-qr=` list still wins when it is non-empty.
    qualityRebuild: { flags: opts?.qrFlags && opts.qrFlags.length > 0 ? [...opts.qrFlags] : ["animation"] },
    animation: { mixer: "pose", defaults: "3.1" }
  });
  await app.ready();

  // First real draw (the GLB load is async — same wait as runAuraScene).
  const drawDeadline = performance.now() + 90_000;
  while (performance.now() < drawDeadline) {
    app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  const handle = app.nodes.require(motion.runtimeId);
  // `handle.animation` is the C-37 member minted by the lane's registered
  // node-handle extension — `createRuntimeNodeHandle` does not apply the
  // registry itself, so resolve the `prd06.animation` factory here (flag-off
  // or unregistered → api is the stub, metrics degrade the same way).
  const animationExt = nodeHandleExtensionFor("animation");
  const api = animationExt?.create(handle as never, app as never) as {
    animationState(): { readonly activeActions: readonly { clip: string; weight: number; time: number }[] } | undefined;
    socket(bone: string): { worldMatrix(out?: Float32Array): Float32Array; readonly valid: boolean };
    resolveAnimationClips(): Promise<readonly { name: string; duration: number }[]>;
  } | undefined;

  // Wait for the actor (and its clip map) before playing the first clip.
  // `resolveAnimationClips` stays pending until the lane's actor extension
  // publishes — bound it so a missing actor degrades instead of hanging run().
  let clipDurations = new Map<string, number>();
  try {
    const infos = (await Promise.race([
      api?.resolveAnimationClips() ?? Promise.resolve([]),
      new Promise<readonly never[]>((resolve) => setTimeout(() => resolve([]), 30_000))
    ])) ?? [];
    clipDurations = new Map(infos.map((info) => [info.name, info.duration]));
  } catch { /* clip infos optional — metrics degrade without durations */ }

  // All three clips share syncGroup "locomotion": each new action snaps to the
  // leader's normalised phase, which is what keeps the §17.3 walk/run phase
  // error under 1% during the weighted overlap (warp only equalises rates).
  handle.play(motion.initialClip, { loop: true, syncGroup: "locomotion" });
  for (const runtime of Array.from({ length: spec.settleFrames })) {
    void runtime;
    app.step(0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve(undefined)));
  }

  const frames: MotionFrame[] = [];
  const phaseSamples: { time: number; a: { phase: number; weight: number }; b: { phase: number; weight: number } }[] = [];
  const fired = new Set<string>();
  const report: Prd06CrossfadeReport = { status: "running" };
  const reportMut = report as unknown as Record<string, unknown>;
  const strip = spec.strip!;
  window.__PRD06_CROSSFADE_FILMSTRIP__ = report;
  (window as { __PRD06_APP__?: unknown }).__PRD06_APP__ = app;
  (window as { __PRD06_HANDLE__?: unknown }).__PRD06_HANDLE__ = handle;

  const diagnostics = app.diagnostics();
  const payload: ReadyPayload = {
    engine: "aura3d",
    scene: spec.id,
    engineVersion: typeof __AURA3D_VERSION__ === "string" ? __AURA3D_VERSION__ : "dev",
    capabilityLog,
    drawCalls: diagnostics.drawCalls,
    warnings: diagnostics.warnings.map((warning) => String(warning)),
    errors: diagnostics.errors.map((error) => String(error)),
    loadMs: Math.round(performance.now() - started),
    variant: "default",
    dpr: opts?.dpr ?? 1,
    appliedToneMapping: "aces-filmic",
    appliedExposure: 1,
    lightUnits: "aura-internal",
    shadows: null,
    fallbackLightsActive: null,
    assetHashes: { soldier: modelAssets.soldier.sha256 },
    qrFlags: opts?.qrFlags ?? spec.qrFlags ?? [],
    extra: { filmstrip: true, choreography: motion.transitions.map((t) => `${t.at}s→${t.clip}@${t.fadeSeconds}s`) }
  };

  // Live loop: sim ticks advance() at a fixed 60 Hz against wall-clock time so
  // the horizon lands in ~horizonSeconds of real time regardless of rAF cadence;
  // step(0) renders once per rAF so the 8 strip frames capture the live pose.
  // step() renders every call — rendering each 60 Hz tick under headless
  // SwiftShader costs ~300 ms/frame and the strip never reaches the horizon.
  let sim = 0;
  const dt = 1 / motion.sampleHz;
  const t0 = performance.now();
  // `strip: { frames: 8, intervalMs: 300 }` — captured in-page after each
  // render (canvas toDataURL; compositor screenshots read black under
  // headless SwiftShader, and `app.screenshot()` reads the app's offscreen
  // canvas — the presented canvas is the DOM child). Published for the spec.
  // Two canvases sit in host: the app's own (never presented — toDataURL is
  // black) and the renderer's later-presented canvas. The last DOM child is
  // the one that draws.
  const presentedCanvas = (): HTMLCanvasElement | null => {
    const canvases = host.querySelectorAll("canvas");
    return canvases.item(canvases.length - 1) as HTMLCanvasElement | null;
  };
  const stripFrames: { readonly at: number; readonly dataUrl: string }[] = [];
  let lastStripAt = 0;
  (window as { __PRD06_CROSSFADE_FILMSTRIP_FRAMES__?: unknown }).__PRD06_CROSSFADE_FILMSTRIP_FRAMES__ = stripFrames;
  const sample = (): void => {
    frames.push(motionFrame(sim, motion.sampledBones, (bone) => api?.socket(bone).valid === true ? api.socket(bone).worldMatrix() : undefined));
    const state = api?.animationState();
    const walk = state?.activeActions.find((a) => a.clip === "Walk");
    const run = state?.activeActions.find((a) => a.clip === "Run");
    const walkDur = clipDurations.get("Walk") ?? 0;
    const runDur = clipDurations.get("Run") ?? 0;
    if (walk && run && walkDur > 0 && runDur > 0) {
      phaseSamples.push({
        time: sim,
        a: { phase: (walk.time % walkDur) / walkDur, weight: walk.weight },
        b: { phase: (run.time % runDur) / runDur, weight: run.weight }
      });
    }
  };
  const tick = (): void => {
    try {
      tickBody();
    } catch (error) {
      (report as { status: string }).status = "error";
      reportMut.error = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    }
  };
  const tickBody = (): void => {
    // Keep animating until the strip has its 8 frames too — headless renders
    // cost seconds each, so the horizon usually lands before 8 captures; the
    // last clip keeps looping so late frames still differ.
    const simTarget = (performance.now() - t0) / 1000;
    while (sim < simTarget) {
      sim += dt;
      for (const transition of motion.transitions) {
        if (sim >= transition.at && !fired.has(transition.clip)) {
          fired.add(transition.clip);
          handle.play(transition.clip, { loop: true, crossFade: transition.fadeSeconds, warp: transition.warp, syncGroup: "locomotion" });
        }
      }
      app.advance(dt);
      sample();
    }
    app.step(0);
    if (stripFrames.length < strip.frames && performance.now() - lastStripAt >= strip.intervalMs) {
      const canvas = presentedCanvas();
      if (canvas) {
        stripFrames.push({ at: sim, dataUrl: canvas.toDataURL("image/png") });
        lastStripAt = performance.now();
      }
    }
    reportMut.simSeconds = sim;
    reportMut.frameCount = frames.length;
    if (sim >= motion.horizonSeconds && stripFrames.length >= strip.frames) {
      const slide = footSlide(frames, { footBones: [...motion.footBones] });
      const phase = locomotionPhaseError(phaseSamples);
      (report as { status: string }).status = "done";
      reportMut.simSeconds = sim;
      reportMut.firedTransitions = [...fired];
      reportMut.frameCount = frames.length;
      reportMut.sampledBones = frames.at(-1)?.bones ? Object.keys(frames.at(-1)!.bones).length : 0;
      reportMut.metrics = {
        continuity: motion.transitions.map((t) => ({
          at: t.at,
          ...transitionContinuity(frames, { transitionTime: t.at, baselineWindows: motion.baselineWindows, isBone: isHumanoidMotionBone })
        })),
        footSlide: { maxSlideM: slide.maxSlideM, phases: slide.phases.length },
        phaseError: { maxPhaseError: phase.maxPhaseError, meanPhaseError: phase.meanPhaseError, comparedFrames: phase.comparedFrames }
      };
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return payload;
}
