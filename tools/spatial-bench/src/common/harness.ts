// Shared measurement harness: identical timing, counters, labels and result schema for both viewers.
import { MEASURE_MS, WARMUP_MS } from "../../configs.mjs";
import { counters, createGpuTimer, glInfo, glState, installHooks, resetCounters } from "./hooks";
import { generate, orbitPose, probePoints, type Cfg, type SpatialData } from "./data";

installHooks();

export interface ViewerInitResult {
  library: string;
  version: string;
  notes: string[];
  /** Per-path mount/convert details recorded verbatim in results.json. */
  details?: Record<string, unknown>;
}

export interface Viewer {
  /** Build the scene from the first sensor frame and render once. May throw: the failure is the finding. */
  init(canvas: HTMLCanvasElement, cfg: Cfg, data: SpatialData, size: { width: number; height: number }): Promise<ViewerInitResult>;
  /** Consume sensor frame ring slot `slot`. Returns ms spent converting data to the viewer's accepted format (0 if none). */
  applyTick(slot: number): number;
  /** Scripted camera pose then draw exactly one frame. Timed separately. */
  setCamera(pose: { position: [number, number, number]; target: [number, number, number] }): void;
  render(dt: number): void;
  /** Column-major view-projection matrix of the camera last rendered (for the DOM label projection). */
  viewProjection(): ArrayLike<number>;
  /** Picking probe: ray through each NDC point. Returns hits and a plain-text status. */
  pick(ndc: Array<[number, number]>, kind: "points" | "instances"): { hits: number; status: string; usable: boolean };
  /** Viewers whose renderer already owns EXT_disjoint_timer_query (nesting would raise GL errors) report GPU time themselves. */
  gpuSample?(): { ms: number | null; reason?: string };
}

declare global {
  interface Window {
    __SB_DONE__?: boolean;
    __SB_STAGE__?: string;
    __SB_RESULT__?: unknown;
    gc?: () => void;
  }
}

function quantiles(values: number[]): { n: number; mean: number; p50: number; p95: number; p99: number; max: number } {
  if (values.length === 0) return { n: 0, mean: NaN, p50: NaN, p95: NaN, p99: NaN, max: NaN };
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, mean, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1]! };
}

const heapMB = (): number | null => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / 1048576 : null;
};

export async function runBench(createViewer: () => Viewer, viewerName: "aura" | "three"): Promise<void> {
  const errors: string[] = [];
  window.addEventListener("error", (e) => errors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => errors.push(String((e.reason as Error)?.message ?? e.reason)));
  const params = new URLSearchParams(location.search);
  const cfg = { ...(JSON.parse(params.get("cfg") ?? "{}") as Omit<Cfg, "viewer">), viewer: viewerName } as Cfg;
  const size = { width: window.innerWidth, height: window.innerHeight };
  const result: Record<string, unknown> = { cfg, viewer: viewerName, failed: false, errors, size, dpr: window.devicePixelRatio };
  const finish = (): void => { result.errors = errors; window.__SB_RESULT__ = result; window.__SB_DONE__ = true; };

  try {
    document.body.style.cssText = "margin:0;background:#05070b;overflow:hidden";
    window.__SB_STAGE__ = "generate";
    const data = generate(cfg);
    result.generateMs = data.generateMs;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.style.cssText = `width:${size.width}px;height:${size.height}px;display:block;position:absolute;left:0;top:0`;
    document.body.appendChild(canvas);

    // DOM labels (identical for both viewers).
    const labelEls: HTMLElement[] = [];
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;font:11px monospace;color:#cfe";
    document.body.appendChild(layer);
    for (let i = 0; i < cfg.labels; i++) {
      const el = document.createElement("div");
      el.textContent = `obj-${i}`;
      el.style.cssText = "position:absolute;left:0;top:0;will-change:transform;white-space:nowrap";
      layer.appendChild(el);
      labelEls.push(el);
    }

    const viewer = createViewer();
    const tBuild = performance.now();
    window.__SB_STAGE__ = "init";
    const init = await viewer.init(canvas, cfg, data, size);
    window.__SB_STAGE__ = "loop";
    const buildMs = performance.now() - tBuild;
    result.library = init.library;
    result.libraryVersion = init.version;
    result.notes = init.notes;
    result.mount = { buildMs, ...init.details };
    result.gl = glInfo(glState.gl);
    result.canvasContexts = glState.canvasContexts;
    const ownGpu = typeof viewer.gpuSample === "function";
    const gpu = createGpuTimer(ownGpu || (params.get("dbg") ?? "").includes("notimer") ? null : glState.gl);
    const ownGpuSamples: number[] = [];
    const ownGpuReasons = new Map<string, number>();
    result.gpuTimerAvailable = gpu.available || ownGpu;
    result.gpuTimerSource = ownGpu ? "viewer-reported (renderer-owned timer queries; an external query nests and raises GL errors)" : gpu.available ? "EXT_disjoint_timer_query_webgl2 around render()" : "unavailable";

    // Frame loop.
    const warmupMs = (cfg as unknown as { warmupMs?: number }).warmupMs ?? WARMUP_MS;
    const measureMsCfg = (cfg as unknown as { measureMs?: number }).measureMs ?? MEASURE_MS;
    const renderPeriod = 1000 / cfg.fps;
    const tickPeriod = cfg.rateHz > 0 ? 1000 / cfg.rateHz : Infinity;
    const labelVec = new Float32Array(cfg.labels * 2);
    let rendered = 0;
    let tickCounter = 0;
    let lastRenderAt = -Infinity;
    let lastRafAt = -Infinity;
    let nextTickAt = performance.now();
    let phase: "warmup" | "measure" | "done" = "warmup";
    const startAt = performance.now();
    let measureStartAt = 0;
    const rafDeltas: number[] = [];
    const frameDeltas: number[] = [];
    const cpuTotal: number[] = [];
    const cpuTick: number[] = []; // per applied tick
    const cpuConvert: number[] = [];
    const cpuCam: number[] = [];
    const cpuRender: number[] = [];
    const cpuLabels: number[] = [];
    let ticksApplied = 0;
    let ticksSkipped = 0;
    let rafCount = 0;
    const heapSamples: number[] = [];
    let heapStart: number | null = null;
    let lastHeapAt = 0;
    const dt = 1 / cfg.fps;

    const labelPass = (): void => {
      const vp = viewer.viewProjection();
      const a = data.labelAnchors;
      for (let i = 0; i < cfg.labels; i++) {
        const x = a[i * 3]!, y = a[i * 3 + 1]!, z = a[i * 3 + 2]!;
        const cx = vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!;
        const cy = vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!;
        const cw = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
        const sx = (cx / cw * 0.5 + 0.5) * size.width;
        const sy = (1 - (cy / cw * 0.5 + 0.5)) * size.height;
        labelVec[i * 2] = sx;
        labelVec[i * 2 + 1] = sy;
        labelEls[i]!.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
      }
    };

    await new Promise<void>((resolve, reject) => {
      const onFrame = (now: number): void => {
        try { frameBody(now); } catch (e) { reject(e); }
      };
      const frameBody = (now: number): void => {
        gpu.poll();
        const perfNow = performance.now();
        if (phase === "warmup" && perfNow - startAt >= warmupMs) {
          phase = "measure";
          window.gc?.();
          resetCounters();
          measureStartAt = performance.now();
          heapStart = heapMB();
          lastHeapAt = measureStartAt;
          gpu.samplesMs.length = 0;
          rafDeltas.length = 0; frameDeltas.length = 0; cpuTotal.length = 0; cpuTick.length = 0; cpuConvert.length = 0;
          cpuCam.length = 0; cpuRender.length = 0; cpuLabels.length = 0;
          ticksApplied = 0; ticksSkipped = 0; rafCount = 0;
          lastRenderAt = -Infinity; lastRafAt = -Infinity;
        }
        if (phase === "measure" && perfNow - measureStartAt >= measureMsCfg) {
          phase = "done";
          resolve();
          return;
        }
        if (phase === "measure") {
          rafCount++;
          if (lastRafAt > -Infinity) rafDeltas.push(now - lastRafAt);
          lastRafAt = now;
          if (perfNow - lastHeapAt >= 1000) { const h = heapMB(); if (h !== null) heapSamples.push(h); lastHeapAt = perfNow; }
        }
        if (now - lastRenderAt >= renderPeriod - 3) {
          const t0 = performance.now();
          // Sensor ticks due since the last rendered frame: apply only the newest (older ones are dropped, counted).
          let tickMs = 0;
          let convertMs = 0;
          if (tickPeriod !== Infinity && t0 >= nextTickAt) {
            const due = Math.floor((t0 - nextTickAt) / tickPeriod) + 1;
            ticksSkipped += due - 1;
            nextTickAt += due * tickPeriod;
            const ta = performance.now();
            convertMs = viewer.applyTick(tickCounter++ % (data.pointPositions.length || data.instanceMatrices.length || data.segmentPositions.length || 1));
            tickMs = performance.now() - ta;
            ticksApplied++;
            if (phase === "measure") { cpuTick.push(tickMs); cpuConvert.push(convertMs); }
          }
          const t1 = performance.now();
          if (cfg.orbit) viewer.setCamera(orbitPose(rendered, data.radius));
          const t2 = performance.now();
          gpu.begin();
          viewer.render(dt);
          gpu.end();
          const t3 = performance.now();
          if (cfg.labels > 0) labelPass();
          const t4 = performance.now();
          rendered++;
          if (ownGpu && phase === "measure" && rendered % 15 === 0) {
            const g = viewer.gpuSample!();
            if (g.ms !== null && Number.isFinite(g.ms)) ownGpuSamples.push(g.ms); else ownGpuReasons.set(g.reason ?? "null", (ownGpuReasons.get(g.reason ?? "null") ?? 0) + 1);
          }
          if (phase === "measure") {
            if (lastRenderAt > -Infinity) frameDeltas.push(now - lastRenderAt);
            cpuCam.push(t2 - t1);
            cpuRender.push(t3 - t2);
            cpuLabels.push(t4 - t3);
            cpuTotal.push(t4 - t0);
          }
          lastRenderAt = now;
        }
        requestAnimationFrame(onFrame);
      };
      requestAnimationFrame(onFrame);
    });

    const measuredMs = performance.now() - measureStartAt;
    const frames = Math.max(1, cpuTotal.length);
    const heapEnd = heapMB();
    const dropThreshold = 2 * renderPeriod;
    result.labelSample = Array.from(labelVec.slice(0, 6));
    result.measure = {
      measuredMs,
      renderedFrames: cpuTotal.length,
      rafCallbacks: rafCount,
      effectiveFps: cpuTotal.length / (measuredMs / 1000),
      frameTime: quantiles(frameDeltas),
      rafTime: quantiles(rafDeltas),
      droppedRule: `rendered-frame interval > 2x target period (${dropThreshold.toFixed(1)} ms)`,
      droppedFrames: frameDeltas.filter((d) => d > dropThreshold).length,
      cpuPerFrame: quantiles(cpuTotal),
      cpuTick: quantiles(cpuTick),
      cpuConvert: quantiles(cpuConvert),
      cpuCamera: quantiles(cpuCam),
      cpuRender: quantiles(cpuRender),
      cpuLabels: quantiles(cpuLabels),
      ticksApplied,
      ticksSkipped,
      heap: { startMB: heapStart, endMB: heapEnd, maxMB: heapSamples.length ? Math.max(...heapSamples, heapEnd ?? 0) : heapEnd },
      gl: {
        bufferDataCallsPerFrame: counters.bufferDataCalls / frames,
        bufferDataBytesPerFrame: counters.bufferDataBytes / frames,
        bufferSubDataCallsPerFrame: counters.bufferSubDataCalls / frames,
        bufferSubDataBytesPerFrame: counters.bufferSubDataBytes / frames,
        drawCallsPerFrame: counters.drawCalls / frames,
        drawVerticesPerFrame: counters.drawVertices / frames,
        texUploadCallsPerFrame: counters.texUploadCalls / frames,
        totals: { ...counters }
      },
      gpu: ownGpu
        ? { available: ownGpuSamples.length > 0, source: "viewer-reported", unavailableReasons: Object.fromEntries(ownGpuReasons), frameTime: quantiles(ownGpuSamples) }
        : { available: gpu.available, source: "external timer query", disjoint: gpu.disjoint, frameTime: quantiles(gpu.samplesMs) }
    };

    // Non-blank check (the viewer must have drawn something): read back the last frame and count non-background pixels.
    try {
      const gl = glState.gl;
      if (gl) {
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        viewer.render(dt);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let lit = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i]! + px[i + 1]! + px[i + 2]! > 60) lit++;
        result.nonBlank = { litPixels: lit, fraction: lit / (w * h) };
      }
    } catch (e) { result.nonBlank = { error: String(e) }; }

    // Picking probe (after the window so it cannot disturb frame stats).
    if (cfg.probe) {
      const pts = probePoints(cfg.probe.n);
      const t0 = performance.now();
      try {
        const r = viewer.pick(pts, cfg.probe.kind);
        const ms = performance.now() - t0;
        result.probe = { kind: cfg.probe.kind, n: cfg.probe.n, totalMs: ms, perQueryMs: ms / cfg.probe.n, ...r };
      } catch (e) {
        result.probe = { kind: cfg.probe.kind, n: cfg.probe.n, error: String((e as Error)?.message ?? e), usable: false };
      }
    }
  } catch (e) {
    result.failed = true;
    result.cause = String((e as Error)?.stack ?? e).slice(0, 2000);
  }
  finish();
}
