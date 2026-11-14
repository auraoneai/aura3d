import type { QaPixels } from "./hooks.js";

/** One non-finite (`NaN`, `Infinity`, `-Infinity`) number discovered in a simulation state snapshot. */
export interface QaNonFiniteEntry {
  /** Simulation step index when the non-finite path was first observed. */
  readonly step: number;
  /** Dot/bracket property path from the state root (for example `"player.vel.x"` or `"enemies[0].hp"`). */
  readonly path: string;
  /** Stringified value (`"NaN"`, `"Infinity"`, or `"-Infinity"`). */
  readonly value: "NaN" | "Infinity" | "-Infinity";
}

export interface QaFindNonFiniteOptions {
  /** Maximum object/array nesting depth inspected (`0` checks root primitives only). Default `4`. */
  readonly maxDepth?: number;
  /** Maximum keys/elements inspected per container to keep per-step overhead bounded. Default `200`. */
  readonly maxKeys?: number;
}

/** Hash + uniform-pixel blankness digest for an RGBA frame readback. */
export interface QaPixelDigest {
  /** 8-character lowercase hex FNV-1a 32-bit digest of RGB pixels. */
  readonly hash: string;
  /** True when the image has zero pixels or every pixel shares the exact same RGB triple. */
  readonly blank: boolean;
  readonly width: number;
  readonly height: number;
}

/** Simulation step wall-clock timing (logic only, excluding frame capture). */
export interface QaStepTiming {
  readonly steps: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly maxMs: number;
}

/** Rendered/readback-flushed frame wall-clock timing. */
export interface QaFrameTiming {
  readonly frames: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly maxMs: number;
  readonly maxAtStep: number;
  readonly over16Ms: number;
  readonly over50Ms: number;
}

/** Input-aware visual stuck telemetry: flags when pixels stop changing while new inputs are fed. */
export interface QaStuckStatus {
  readonly stuck: boolean;
  readonly unchangedSteps: number;
  readonly inputsSinceLastVisualChange: number;
  readonly lastHash: string | null;
  readonly lastChangedAtStep: number;
}

export interface QaFrameSample extends QaPixelDigest {
  readonly step: number;
  readonly durationMs: number;
}

export interface QaTelemetrySnapshot {
  readonly steps: number;
  readonly inputs: number;
  readonly stepTiming: QaStepTiming;
  readonly frameTiming: QaFrameTiming;
  readonly nonFinite: readonly QaNonFiniteEntry[];
  readonly stuck: QaStuckStatus;
}

export interface QaRunMonitorOptions extends QaFindNonFiniteOptions {
  /** Steps without visual hash change (while new inputs arrive) before `stuck.stuck` flips true. Default `600` (10s @ 60Hz). */
  readonly stuckAfterSteps?: number;
  /** Injectable millisecond clock for deterministic tests. Default `performance.now`. */
  readonly now?: () => number;
}

export interface QaRunMonitor {
  /** Wrap a batch of `count` simulation steps, recording pure step duration, input count, and state non-finite checks. */
  recordSteps<T>(count: number, hasInput: boolean, run: () => T, readState?: () => unknown): T;
  /** Increment the delivered-input counter outside `recordSteps` (for example from DOM/replay injectors). */
  recordInput(count?: number): void;
  /** Scan `state` at the current step and record any newly discovered non-finite property paths. */
  inspectState(state: unknown): readonly QaNonFiniteEntry[];
  /** Measure an async RGBA readback (which flushes GPU drawing), updating frame timing, pixel hash, and stuck status. */
  measurePixels(capture: () => Promise<QaPixels>): Promise<QaFrameSample>;
  /** Record an already-captured `QaPixels` buffer with an explicit `durationMs`. */
  recordFrame(pixels: QaPixels, durationMs?: number): QaFrameSample;
  snapshot(): QaTelemetrySnapshot;
  reset(): void;
}

function defaultNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function formatNonFinite(value: number): "NaN" | "Infinity" | "-Infinity" {
  if (Number.isNaN(value)) return "NaN";
  return value > 0 ? "Infinity" : "-Infinity";
}

/**
 * Walk a simulation state object up to `maxDepth` (cycle-safe) and return every path holding `NaN` or `±Infinity`.
 */
export function findNonFinitePaths(
  root: unknown,
  options: QaFindNonFiniteOptions = {}
): Array<{ readonly path: string; readonly value: "NaN" | "Infinity" | "-Infinity" }> {
  const maxDepth = options.maxDepth ?? 4;
  const maxKeys = options.maxKeys ?? 200;
  const out: Array<{ readonly path: string; readonly value: "NaN" | "Infinity" | "-Infinity" }> = [];
  const seen = new WeakSet<object>();

  const walk = (value: unknown, path: string, depth: number): void => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        out.push({ path: path || "<root>", value: formatNonFinite(value) });
      }
      return;
    }
    if (depth >= maxDepth || value === null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      const arrayLike = value as unknown as ArrayLike<unknown>;
      const limit = Math.min(arrayLike.length ?? 0, maxKeys);
      for (let i = 0; i < limit; i++) {
        const nextPath = path ? `${path}[${i}]` : `[${i}]`;
        walk(arrayLike[i], nextPath, depth + 1);
      }
      return;
    }

    const keys = Object.keys(value);
    const limit = Math.min(keys.length, maxKeys);
    for (let i = 0; i < limit; i++) {
      const key = keys[i]!;
      let child: unknown;
      try {
        child = (value as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      const nextPath = path ? `${path}.${key}` : key;
      walk(child, nextPath, depth + 1);
    }
  };

  walk(root, "", 0);
  return out;
}

/**
 * Compute an 8-char FNV-1a RGB hash and uniform-color `blank` flag from an RGBA `QaPixels` readback.
 */
export function hashQaPixels(pixels: QaPixels): QaPixelDigest {
  const { width, height, data } = pixels;
  if (!(width > 0) || !(height > 0) || data.length < 4) {
    return { hash: "811c9dc5", blank: true, width: Math.max(0, width | 0), height: Math.max(0, height | 0) };
  }
  let hash = 0x811c9dc5;
  const r0 = data[0]!;
  const g0 = data[1]!;
  const b0 = data[2]!;
  let varied = false;
  for (let i = 0; i + 2 < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    hash = Math.imul(hash ^ r, 0x01000193);
    hash = Math.imul(hash ^ g, 0x01000193);
    hash = Math.imul(hash ^ b, 0x01000193);
    if (!varied && (r !== r0 || g !== g0 || b !== b0)) varied = true;
  }
  return {
    hash: (hash >>> 0).toString(16).padStart(8, "0"),
    blank: !varied,
    width,
    height
  };
}

/**
 * Create a standalone QA run monitor tracking step cost vs. GPU-flushed frame cost, first-seen `NaN`/`Infinity`
 * state paths, and input-aware visual stuck state.
 */
export function createQaRunMonitor(options: QaRunMonitorOptions = {}): QaRunMonitor {
  const stuckAfterSteps = Math.max(1, Math.trunc(options.stuckAfterSteps ?? 600));
  const now = options.now ?? defaultNowMs;

  let steps = 0;
  let inputs = 0;
  let stepTotalMs = 0;
  let stepMaxMs = 0;

  let frames = 0;
  let frameTotalMs = 0;
  let frameMaxMs = 0;
  let frameMaxAtStep = 0;
  let over16Ms = 0;
  let over50Ms = 0;

  let lastHash: string | null = null;
  let lastChangedAtStep = 0;
  let inputsAtLastChange = 0;

  const nonFiniteSeen = new Set<string>();
  const nonFiniteEntries: QaNonFiniteEntry[] = [];

  const inspectState = (state: unknown): readonly QaNonFiniteEntry[] => {
    const hits = findNonFinitePaths(state, options);
    for (const hit of hits) {
      if (nonFiniteSeen.has(hit.path)) continue;
      nonFiniteSeen.add(hit.path);
      nonFiniteEntries.push({ step: steps, path: hit.path, value: hit.value });
    }
    return nonFiniteEntries;
  };

  const recordFrame = (pixels: QaPixels, durationMs = 0): QaFrameSample => {
    const safeMs = Math.max(0, durationMs);
    frames++;
    frameTotalMs += safeMs;
    if (safeMs > frameMaxMs) {
      frameMaxMs = safeMs;
      frameMaxAtStep = steps;
    }
    if (safeMs > 1000 / 60) over16Ms++;
    if (safeMs > 50) over50Ms++;

    const digest = hashQaPixels(pixels);
    if (lastHash === null || digest.hash !== lastHash) {
      lastHash = digest.hash;
      lastChangedAtStep = steps;
      inputsAtLastChange = inputs;
    }
    return {
      ...digest,
      step: steps,
      durationMs: safeMs
    };
  };

  return {
    recordSteps(count, hasInput, run, readState) {
      const n = Math.max(0, Math.trunc(count));
      if (hasInput && n > 0) inputs++;
      const t0 = now();
      const result = run();
      const elapsed = Math.max(0, now() - t0);
      if (n > 0) {
        steps += n;
        stepTotalMs += elapsed;
        const perStep = elapsed / n;
        if (perStep > stepMaxMs) stepMaxMs = perStep;
      }
      if (readState) inspectState(readState());
      return result;
    },
    recordInput(count = 1) {
      if (count > 0 && Number.isFinite(count)) inputs += Math.trunc(count);
    },
    inspectState,
    async measurePixels(capture) {
      const t0 = now();
      const pixels = await capture();
      const elapsed = Math.max(0, now() - t0);
      return recordFrame(pixels, elapsed);
    },
    recordFrame,
    snapshot() {
      const unchangedSteps = lastHash === null ? 0 : Math.max(0, steps - lastChangedAtStep);
      const inputsSinceLastVisualChange = lastHash === null ? 0 : Math.max(0, inputs - inputsAtLastChange);
      return {
        steps,
        inputs,
        stepTiming: {
          steps,
          totalMs: stepTotalMs,
          meanMs: steps > 0 ? stepTotalMs / steps : 0,
          maxMs: stepMaxMs
        },
        frameTiming: {
          frames,
          totalMs: frameTotalMs,
          meanMs: frames > 0 ? frameTotalMs / frames : 0,
          maxMs: frameMaxMs,
          maxAtStep: frameMaxAtStep,
          over16Ms,
          over50Ms
        },
        nonFinite: [...nonFiniteEntries],
        stuck: {
          stuck: lastHash !== null && unchangedSteps >= stuckAfterSteps && inputsSinceLastVisualChange > 0,
          unchangedSteps,
          inputsSinceLastVisualChange,
          lastHash,
          lastChangedAtStep
        }
      };
    },
    reset() {
      steps = 0;
      inputs = 0;
      stepTotalMs = 0;
      stepMaxMs = 0;
      frames = 0;
      frameTotalMs = 0;
      frameMaxMs = 0;
      frameMaxAtStep = 0;
      over16Ms = 0;
      over50Ms = 0;
      lastHash = null;
      lastChangedAtStep = 0;
      inputsAtLastChange = 0;
      nonFiniteSeen.clear();
      nonFiniteEntries.length = 0;
    }
  };
}
