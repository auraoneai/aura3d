/**
 * `program/ProgramCache.ts` (PRD-01 §6.4) — real `ProgramCacheLike`.
 *
 * `acquire` normalizes + keys the record, returns the cached handle when
 * present, otherwise generates through `generateProgramImpl` and compiles:
 *   - async path (KHR_parallel_shader_compile polling) when
 *     `o.parallelCompile ?? device.probe?.parallelShaderCompile` and the
 *     device implements `compileAsync` — the handle starts `pending` and
 *     flips `ready`/`failed` when the promise settles;
 *   - sync path otherwise (`createShaderProgram` blocks, handle is
 *     `ready`/`failed` immediately — "warm-then-block" stays the default).
 *
 * `precompile` awaits every pending entry (what `ProgramWarmup`/`app.ready`
 * await). Stats accumulate `compiled`/`pending`/`failed`/`compileMsTotal`.
 */

import type { QrFlags } from "../contracts/core";
import type { ProgramFeatures, ProgramHandle, ProgramCacheLike } from "../contracts/program";
import type { RenderDevice, RenderShaderProgram, ShaderSources } from "../RenderDevice";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER, type GenerateProgramOptions } from "./ProgramGenerator";
import { normalizeProgramFeatures } from "./ProgramFeatures";
import { programKey } from "./ProgramKey";

interface CacheEntry {
  key: string;
  status: "pending" | "ready" | "failed";
  program?: RenderShaderProgram;
  error?: string;
  pending?: Promise<void>;
}

export interface ProgramCacheOptions {
  /** When true, `generateProgramImpl` resolves registered feature contributors. */
  readonly flags?: QrFlags;
  /** When unset, falls back to `device.probe?.parallelShaderCompile`. */
  readonly parallelCompile?: boolean;
  /** Sink for generator degradations (e.g. extension-lobe-pending). */
  readonly onDegradation?: GenerateProgramOptions["onDegradation"];
  /**
   * T0-06 (§403): bound on synchronous compiles issued inside one frame epoch
   * (`beginFrame` resets it). Beyond the bound a new entry stays `pending`
   * without a compile — the next frame's `acquire` retries it. Async
   * (`compileAsync`) compiles do not count against the bound.
   */
  readonly maxSyncCompilesPerFrame?: number;
}

export class ProgramCache implements ProgramCacheLike {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly parallel: boolean;
  private readonly maxSyncCompilesPerFrame: number;
  private compileMsTotal = 0;
  private reuseCount = 0;
  private disposed = false;
  private frameSyncCompiles = 0;
  private readyMarked = false;
  private compiledSinceReadyCount = 0;

  constructor(
    private readonly device: RenderDevice,
    private readonly options: ProgramCacheOptions = {}
  ) {
    this.parallel = options.parallelCompile ?? device.probe?.parallelShaderCompile ?? false;
    this.maxSyncCompilesPerFrame = options.maxSyncCompilesPerFrame ?? 8;
  }

  /** T0-06: start of a frame's sync-compile budget. */
  beginFrame(): void {
    this.frameSyncCompiles = 0;
  }

  /** T0-06: mark the ready barrier — later compiles count `compiledSinceReady`. */
  markReady(): void {
    this.readyMarked = true;
  }

  private noteCompiled(): void {
    if (this.readyMarked) this.compiledSinceReadyCount += 1;
  }

  acquire(features: ProgramFeatures): ProgramHandle {
    const normalized = normalizeProgramFeatures(features);
    const key = programKey(normalized);
    const existing = this.entries.get(key);
    if (existing && (existing.status !== "pending" || existing.pending !== undefined)) {
      this.reuseCount += 1;
      return this.toHandle(existing);
    }
    // A pending entry with no in-flight promise was bounded out by the T0-06
    // per-frame sync-compile bound — fall through to retry under this frame's
    // budget (or the async path).
    const entry: CacheEntry = existing ?? { key, status: "pending" };
    if (!existing) this.entries.set(key, entry);
    const started = Date.now();
    let sources: ShaderSources;
    try {
      const generated = generateProgramImpl(normalized, {
        flags: this.options.flags,
        onDegradation: this.options.onDegradation
      });
      sources = {
        label: `a3d-program:${key.slice(0, 40)}`,
        marker: GENERATED_PROGRAM_MARKER,
        vertex: generated.vertex,
        fragment: generated.fragment
      };
    } catch (error) {
      entry.status = "failed";
      entry.error = error instanceof Error ? error.message : String(error);
      return this.toHandle(entry);
    }

    if (this.parallel && typeof this.device.compileAsync === "function") {
      entry.pending = this.device.compileAsync(sources)
        .then((program) => {
          entry.status = "ready";
          entry.program = program;
          this.compileMsTotal += Date.now() - started;
          this.noteCompiled();
        })
        .catch((error: unknown) => {
          entry.status = "failed";
          entry.error = error instanceof Error ? error.message : String(error);
          this.compileMsTotal += Date.now() - started;
        });
    } else {
      if (this.frameSyncCompiles >= this.maxSyncCompilesPerFrame) {
        // T0-06 per-frame bound: leave the entry pending (no compile, no
        // promise); the next frame's `acquire` retries under a fresh budget.
        return this.toHandle(entry);
      }
      this.frameSyncCompiles += 1;
      try {
        entry.program = this.device.createShaderProgram(sources);
        entry.status = "ready";
        this.noteCompiled();
      } catch (error) {
        entry.status = "failed";
        entry.error = error instanceof Error ? error.message : String(error);
      }
      this.compileMsTotal += Date.now() - started;
    }
    return this.toHandle(entry);
  }

  async precompile(list: readonly ProgramFeatures[]): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const features of list) {
      this.acquire(features);
    }
    for (const entry of this.entries.values()) {
      if (entry.pending) pending.push(entry.pending);
    }
    await Promise.all(pending);
  }

  stats(): { readonly compiled: number; readonly pending: number; readonly failed: number; readonly compileMsTotal: number; readonly compiledSinceReady: number } {
    let compiled = 0;
    let pending = 0;
    let failed = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === "ready") compiled++;
      else if (entry.status === "pending") pending++;
      else failed++;
    }
    return { compiled, pending, failed, compileMsTotal: this.compileMsTotal, compiledSinceReady: this.compiledSinceReadyCount };
  }

  /** PRD-01 Phase 6 C-31: introspection for the lane's `programs` section. */
  keys(): readonly string[] {
    return [...this.entries.keys()];
  }

  /** Acquires served from an existing entry (cache hits). */
  get reused(): number {
    return this.reuseCount;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.program?.dispose();
    }
    this.entries.clear();
  }

  /** Return the live entry so a held "pending" handle observes the flip to ready/failed. */
  private toHandle(entry: CacheEntry): ProgramHandle {
    return entry as ProgramHandle;
  }
}
