/**
 * prd02 stall-counter harness page (02-S13, PRD-02 §16.1 S13 "No stalls").
 * Built into the lane bundle (vite.lane.config.ts input `counters`) and driven
 * by tests/qr/prd02/browser/counters.spec.ts on macos-14.
 *
 * `?scene=prd02-15-animation-skinning&a3d-qr=lighting[&control=forced-stall]`
 *
 * Runs the lane scene through the shared `runAuraScene` (ready + settle), then
 * — inside its `collectExtra(app)` hook, with the live app — drives its own
 * frame loop:
 *  - steady window: frames 2..120 with no scene change;
 *  - swap window: frames 2..120 (or until the swapped HDRI resolved + 30
 *    frames) with an HDRI swap studioSmall08 → kloppenheim06Puresky at frame 3
 *    through `app.setScene` (the only public environment-swap path on
 *    createAuraApp — it disposes the production controller and remounts).
 *
 * Counters are C-28 device totals read off the live renderer
 * (`app[Symbol.for("a3d.prd01.renderer")].getDiagnostics()` →
 * `programCompileCount` = host.counters.programCompiles, `readPixelsCalls` =
 * host.counters.readbacks; never reset because no caller invokes
 * `resetFrameCounters`). `app.lighting.diagnostics()` is NOT used: its
 * counters come from `Prd02LightingRuntime.attachDevice`, which nothing
 * calls, so they always report 0. A renderer created inside a window (the
 * remount) contributes its full totals (its baseline is 0). Raw WebGL spies
 * (readPixels / compileShader / linkProgram on WebGL2RenderingContext) are
 * recorded alongside as a cross-check, and Long Tasks (PerformanceObserver
 * `longtask`) are collected per window.
 *
 * `control=forced-stall`: inside the steady window, after the frame-2
 * baseline, the page itself calls device.readPixels, device.createShaderProgram
 * and busy-waits 120 ms — the counters, spies and observer must all see it.
 */
import { runAuraScene } from "../../aura3d/common";
import { defineAuraAssets, type AuraApp } from "@aura3d/engine";
import { hdriAssets } from "../../shared/assets";
import { getPrd02Spec } from "./specs";

declare global {
  interface Window {
    __A3D_PRD02_COUNTERS__?: unknown;
  }
}

const RENDERER_SEAM = Symbol.for("a3d.prd01.renderer");
const BASELINE_FRAME = 2;
const LAST_FRAME = 120;
const SWAP_FRAME = 3;
const SWAP_DEADLINE_MS = 180_000;

interface DeviceLike {
  readPixels(x: number, y: number, width: number, height: number): Uint8Array;
  createShaderProgram(sources: { label: string; vertex: string; fragment: string; marker: string }): unknown;
}
interface RendererLike {
  readonly device?: DeviceLike;
  getDiagnostics(): { readonly programCompileCount?: number; readonly readPixelsCalls?: number };
}

const spies = { readPixels: 0, compileShader: 0, linkProgram: 0 };
function installSpies(): void {
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ["readPixels", "compileShader", "linkProgram"] as const) {
    const original = proto[name]!;
    proto[name] = function spied(this: unknown, ...args: unknown[]) {
      spies[name] += 1;
      return original.apply(this, args);
    };
  }
}

const longTasks: { startTime: number; duration: number }[] = [];
function observeLongTasks(): boolean {
  if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return false;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
  }).observe({ type: "longtask", buffered: true });
  return true;
}

async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function rendererOf(app: AuraApp): RendererLike | undefined {
  return (app as unknown as Record<symbol, RendererLike | undefined>)[RENDERER_SEAM];
}

function environmentOf(app: AuraApp): { hdriStatus?: string; iblPixelBacked?: boolean } | undefined {
  return (app.diagnostics().renderer as unknown as { environment?: { hdriStatus?: string; iblPixelBacked?: boolean } } | undefined)?.environment;
}

/** Accumulates C-28 totals across every renderer seen in a window. */
class CounterWindow {
  private readonly rows = new Map<RendererLike, { baseCompiles: number; baseReads: number; compiles: number; reads: number; missing: boolean }>();
  private readonly spyBase = { ...spies };
  constructor(private readonly app: AuraApp, private readonly started: number) {
    this.sample(true);
  }
  sample(baseline = false): void {
    const renderer = rendererOf(this.app);
    if (!renderer) return;
    const diag = renderer.getDiagnostics();
    const compiles = diag.programCompileCount;
    const reads = diag.readPixelsCalls;
    const missing = typeof compiles !== "number" || typeof reads !== "number";
    const row = this.rows.get(renderer);
    if (!row) {
      // A renderer first seen after the baseline was created inside the window: base 0.
      this.rows.set(renderer, { baseCompiles: baseline ? compiles ?? 0 : 0, baseReads: baseline ? reads ?? 0 : 0, compiles: compiles ?? 0, reads: reads ?? 0, missing });
    } else {
      row.compiles = compiles ?? row.compiles;
      row.reads = reads ?? row.reads;
      row.missing ||= missing;
    }
  }
  result(frames: number) {
    const ended = performance.now();
    const rows = [...this.rows.values()];
    return {
      frames,
      renderers: rows.length,
      countersPresent: rows.length > 0 && rows.every((row) => !row.missing),
      programCompileDelta: rows.reduce((sum, row) => sum + row.compiles - row.baseCompiles, 0),
      readPixelsDelta: rows.reduce((sum, row) => sum + row.reads - row.baseReads, 0),
      glSpies: {
        readPixels: spies.readPixels - this.spyBase.readPixels,
        compileShader: spies.compileShader - this.spyBase.compileShader,
        linkProgram: spies.linkProgram - this.spyBase.linkProgram
      },
      longTasks: longTasks.filter((task) => task.startTime >= this.started && task.startTime <= ended),
      durationMs: ended - this.started
    };
  }
}

function forcedStall(app: AuraApp): void {
  const device = rendererOf(app)?.device;
  if (!device) throw new Error("forced-stall control: no live device on the renderer seam");
  device.readPixels(0, 0, 1, 1);
  const marker = "// prd02-s13-forced-stall";
  device.createShaderProgram({
    label: "prd02-s13-forced-stall",
    marker,
    vertex: `#version 300 es\n${marker}\nvoid main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }\n`,
    fragment: `#version 300 es\nprecision mediump float;\n${marker}\nout vec4 c;\nvoid main() { c = vec4(1.0); }\n`
  });
  const until = performance.now() + 120;
  while (performance.now() < until) { /* deliberate main-thread stall */ }
}

async function steadyWindow(app: AuraApp, control: string | null) {
  let counters: CounterWindow | undefined;
  for (let frame = 0; frame <= LAST_FRAME; frame += 1) {
    if (frame === BASELINE_FRAME) {
      counters = new CounterWindow(app, performance.now());
      if (control === "forced-stall") forcedStall(app);
    }
    app.step(1 / 60);
    await nextFrame();
    counters?.sample();
  }
  return counters!.result(LAST_FRAME - BASELINE_FRAME);
}

const swapAssets = defineAuraAssets({
  kloppenheim06Puresky: {
    type: "texture",
    format: "hdr",
    url: hdriAssets.kloppenheim06Puresky.url,
    hash: hdriAssets.kloppenheim06Puresky.sha256,
    metadata: { license: hdriAssets.kloppenheim06Puresky.provenance, sourcePath: hdriAssets.kloppenheim06Puresky.repoPath }
  }
});

interface NodeLike { readonly kind?: string; readonly environment?: string; readonly children?: readonly NodeLike[] }

/** Replace every `environments.hdri` node's texture; returns how many were swapped. */
function swapHdri(nodes: readonly NodeLike[], counter: { swapped: number }): NodeLike[] {
  return nodes.map((node) => {
    const children = node.children ? { children: swapHdri(node.children, counter) } : {};
    if (node.kind === "environment" && node.environment === "hdri") {
      counter.swapped += 1;
      return { ...node, ...children, texture: swapAssets.kloppenheim06Puresky };
    }
    return { ...node, ...children };
  });
}

async function swapWindow(app: AuraApp) {
  let counters: CounterWindow | undefined;
  let swapped = 0;
  let resolvedFrame: number | null = null;
  let remounted = false;
  const before = rendererOf(app);
  const deadline = performance.now() + SWAP_DEADLINE_MS;
  let frame = 0;
  for (; ; frame += 1) {
    if (frame === BASELINE_FRAME) counters = new CounterWindow(app, performance.now());
    if (frame === SWAP_FRAME) {
      // Last reading of the pre-swap renderer before setScene disposes it.
      counters!.sample();
      const current = app.scene as unknown as { nodes: readonly NodeLike[] };
      const counter = { swapped: 0 };
      const nodes = swapHdri(current.nodes, counter);
      swapped = counter.swapped;
      if (swapped === 0) throw new Error("swap window: the scene has no environments.hdri node to swap");
      app.setScene({ ...current, nodes } as unknown as typeof app.scene);
      await app.ready();
    }
    app.step(1 / 60);
    await nextFrame();
    counters?.sample();
    if (frame > SWAP_FRAME) {
      remounted ||= rendererOf(app) !== before;
      const environment = environmentOf(app);
      if (resolvedFrame === null && (environment?.hdriStatus === "ready" || environment?.hdriStatus === "fallback" || environment?.iblPixelBacked)) {
        resolvedFrame = frame;
      }
    }
    const done = frame >= LAST_FRAME && resolvedFrame !== null && frame >= resolvedFrame + 30;
    if (done || performance.now() > deadline) break;
  }
  return {
    ...counters!.result(frame - BASELINE_FRAME),
    swappedNodes: swapped,
    resolvedFrame,
    remounted,
    environment: environmentOf(app) ?? null
  };
}

async function run(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const sceneId = params.get("scene") ?? "prd02-15-animation-skinning";
  const qrParam = params.get("a3d-qr") ?? "lighting";
  const qrFlags = qrParam === "none" ? [] : qrParam.split(",").map((flag) => flag.trim()).filter(Boolean);
  const control = params.get("control");
  const host = document.getElementById("stage");
  if (!host) throw new Error("missing #stage element");
  installSpies();
  const longTaskSupported = observeLongTasks();
  let measured: unknown = null;
  const payload = await runAuraScene(getPrd02Spec(sceneId), host, {
    qrFlags,
    collectExtra: async (app) => {
      const steady = await steadyWindow(app, control);
      const swap = control === null ? await swapWindow(app) : null;
      measured = { steady, swap };
      return { prd02S13: measured };
    }
  });
  window.__A3D_PRD02_COUNTERS__ = {
    status: "ready",
    scene: sceneId,
    qrFlags,
    control,
    longTaskSupported,
    measured,
    payloadErrors: payload.errors
  };
}

run().catch((error: unknown) => {
  window.__A3D_PRD02_COUNTERS__ = { status: "error", error: String(error instanceof Error ? error.stack ?? error : error) };
});
