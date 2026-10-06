/**
 * PRD-03 — per-stage GPU timing for the v2 post graph (C-28 `gpuMs` feed).
 *
 * Wraps EXT_disjoint_timer_query_webgl2. The extension is absent on some
 * paravirtual/driver stacks, so construction probes it once and every method
 * degrades to undefined/null rather than throwing; the caller only ever sees
 * `gpuMs` values that were actually measured.
 *
 * Results are asynchronous by design: `end()` queues the query and the value
 * appears in `collect()` once the driver reports QUERY_RESULT_AVAILABLE.
 */

export interface PostGpuTimerQuery {
  readonly available: boolean;
}

interface TimerQueryExt {
  readonly TIME_ELAPSED_EXT: number;
}

interface TimerQuery {
  readonly label: string;
  readonly handle: WebGLQuery;
  readonly disjointChecked: boolean;
}

export class PostTimer {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly ext: TimerQueryExt | null;
  private readonly pending = new Map<WebGLQuery, TimerQuery>();
  private current: WebGLQuery | null = null;
  private currentLabel: string | null = null;
  private disjointSeen = false;

  constructor(gl: WebGL2RenderingContext | null | undefined) {
    this.gl = gl ?? null;
    this.ext = this.gl
      ? (this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerQueryExt | null)
      : null;
  }

  /** False when the context or extension is missing — every other call no-ops. */
  get available(): boolean {
    return this.gl !== null && this.ext !== null && !this.disjointSeen;
  }

  /** Begin a GPU-elapsed query for `label`. No-op when unavailable. */
  begin(label: string): void {
    if (!this.gl || !this.ext || this.current !== null || this.disjointSeen) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.current = query;
    this.currentLabel = label;
  }

  /** End the open query; results surface via collect(). */
  end(): void {
    if (!this.gl || !this.ext || this.current === null) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.set(this.current, { label: this.currentLabel ?? "stage", handle: this.current, disjointChecked: false });
    this.current = null;
    this.currentLabel = null;
  }

  /**
   * Harvest finished queries. A GPU disjoint event (context loss, reset)
   * discards pending results and marks the timer unavailable for the rest of
   * the frame rather than reporting garbage nanoseconds.
   */
  collect(): Readonly<Record<string, number>> {
    if (!this.gl || !this.ext) return {};
    const out: Record<string, number> = {};
    if (this.gl.getParameter(0x8fbb /* GPU_DISJOINT_EXT */) === true) {
      this.disjointSeen = true;
      for (const query of this.pending.keys()) this.gl.deleteQuery(query);
      this.pending.clear();
      return out;
    }
    for (const [handle, entry] of this.pending) {
      if (this.gl.getQueryParameter(handle, 0x8867 /* QUERY_RESULT_AVAILABLE */) !== true) continue;
      const ns = Number(this.gl.getQueryParameter(handle, 0x8866 /* QUERY_RESULT */));
      if (Number.isFinite(ns)) out[entry.label] = ns / 1e6;
      this.gl.deleteQuery(handle);
      this.pending.delete(handle);
    }
    return out;
  }

  dispose(): void {
    if (!this.gl) return;
    for (const query of this.pending.keys()) this.gl.deleteQuery(query);
    this.pending.clear();
    if (this.current !== null) this.gl.deleteQuery(this.current);
    this.current = null;
    this.currentLabel = null;
  }
}
