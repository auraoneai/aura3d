// WebGL2 instrumentation, identical for both viewers. Must be imported before any renderer touches a canvas.
export interface GlCounters {
  bufferDataCalls: number;
  bufferDataBytes: number;
  bufferSubDataCalls: number;
  bufferSubDataBytes: number;
  drawCalls: number;
  drawVertices: number;
  texUploadCalls: number;
}

export const counters: GlCounters = { bufferDataCalls: 0, bufferDataBytes: 0, bufferSubDataCalls: 0, bufferSubDataBytes: 0, drawCalls: 0, drawVertices: 0, texUploadCalls: 0 };
/** Diagnosis counters (E6-02): every other GL entry point counted by name, plus JS ms spent inside selected calls (dbg=gltime). */
export const callCounts: Record<string, number> = {};
export const callMs: Record<string, number> = {};
export function resetDiag(): void { const ph = (window as unknown as { __SB_PHASES__?: Record<string, number[]> }).__SB_PHASES__; if (ph) for (const k of Object.keys(ph)) delete ph[k]; for (const k of Object.keys(callCounts)) delete callCounts[k]; for (const k of Object.keys(callMs)) delete callMs[k]; }
const COUNTED = ["createBuffer", "deleteBuffer", "bindBuffer", "bufferData", "bufferSubData", "createVertexArray", "deleteVertexArray", "bindVertexArray", "vertexAttribPointer", "enableVertexAttribArray", "useProgram", "drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "uniform1f", "uniform4fv", "uniformMatrix4fv", "uniformBlockBinding", "bindBufferBase", "bindBufferRange", "createTexture", "texImage2D", "texSubImage2D", "readPixels", "flush", "finish", "getError", "clear", "blitFramebuffer", "bindFramebuffer", "createQuery", "getQueryParameter", "fenceSync", "clientWaitSync", "getParameter", "getUniformLocation", "compileShader", "linkProgram"];
export function resetCounters(): void {
  for (const key of Object.keys(counters) as Array<keyof GlCounters>) counters[key] = 0;
}

export const glState: { gl: WebGL2RenderingContext | null; canvasContexts: string[] } = { gl: null, canvasContexts: [] };

type Fn = (...args: unknown[]) => unknown;
function bytesOf(arg: unknown, fallback = 0): number {
  if (typeof arg === "number") return arg;
  if (arg && typeof (arg as ArrayBufferView).byteLength === "number") return (arg as ArrayBufferView).byteLength;
  return fallback;
}

export function installHooks(): void {
  const dbg = new URLSearchParams(location.search).get("dbg") ?? "";
  if (dbg.includes("nohooks")) return;
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, Fn>;
  const wrap = (name: string, before: (args: unknown[]) => void): void => {
    const original = proto[name];
    if (!original) return;
    proto[name] = function (this: unknown, ...args: unknown[]) {
      before(args);
      return original.apply(this, args);
    };
  };
  // bufferData(target, size|data, usage[, srcOffset, length]); bufferSubData(target, dstOffset, data[, srcOffset, length])
  wrap("bufferData", (a) => {
    counters.bufferDataCalls++;
    let bytes = bytesOf(a[1]);
    if (a.length >= 5 && a[1] && typeof (a[1] as ArrayBufferView).byteLength === "number") {
      const view = a[1] as { BYTES_PER_ELEMENT?: number; byteLength: number };
      const per = view.BYTES_PER_ELEMENT ?? 1;
      const length = (a[4] as number) || view.byteLength / per - ((a[3] as number) || 0);
      bytes = length * per;
    }
    counters.bufferDataBytes += bytes;
  });
  wrap("bufferSubData", (a) => {
    counters.bufferSubDataCalls++;
    let bytes = bytesOf(a[2]);
    if (a.length >= 5 && a[2] && typeof (a[2] as ArrayBufferView).byteLength === "number") {
      const view = a[2] as { BYTES_PER_ELEMENT?: number; byteLength: number };
      const per = view.BYTES_PER_ELEMENT ?? 1;
      const length = (a[4] as number) || view.byteLength / per - ((a[3] as number) || 0);
      bytes = length * per;
    }
    counters.bufferSubDataBytes += bytes;
  });
  if (dbg.includes("gltime") || dbg.includes("glcount")) {
    const timed = dbg.includes("gltime");
    for (const name of COUNTED) {
      const original = proto[name];
      if (!original) continue;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        callCounts[name] = (callCounts[name] ?? 0) + 1;
        if (!timed) return original.apply(this, args);
        const t = performance.now();
        const r = original.apply(this, args);
        callMs[name] = (callMs[name] ?? 0) + (performance.now() - t);
        return r;
      };
    }
  }
  wrap("drawArrays", (a) => { counters.drawCalls++; counters.drawVertices += (a[2] as number) || 0; });
  wrap("drawElements", (a) => { counters.drawCalls++; counters.drawVertices += (a[1] as number) || 0; });
  wrap("drawArraysInstanced", (a) => { counters.drawCalls++; counters.drawVertices += ((a[2] as number) || 0) * ((a[3] as number) || 1); });
  wrap("drawElementsInstanced", (a) => { counters.drawCalls++; counters.drawVertices += ((a[1] as number) || 0) * ((a[4] as number) || 1); });
  wrap("drawRangeElements", (a) => { counters.drawCalls++; counters.drawVertices += (a[3] as number) || 0; });
  wrap("texImage2D", () => { counters.texUploadCalls++; });
  wrap("texSubImage2D", () => { counters.texUploadCalls++; });

  const original = HTMLCanvasElement.prototype.getContext as unknown as Fn;
  (HTMLCanvasElement.prototype as unknown as Record<string, Fn>).getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const ctx = original.apply(this, args);
    glState.canvasContexts.push(String(args[0]));
    if (ctx && args[0] === "webgl2") glState.gl = ctx as WebGL2RenderingContext;
    return ctx;
  };
}

export interface GpuTimer {
  available: boolean;
  begin(): void;
  end(): void;
  poll(): void;
  samplesMs: number[];
  disjoint: number;
}

export function createGpuTimer(gl: WebGL2RenderingContext | null): GpuTimer {
  const timer: GpuTimer = { available: false, begin() {}, end() {}, poll() {}, samplesMs: [], disjoint: 0 };
  if (!gl) return timer;
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  if (!ext) return timer;
  timer.available = true;
  const pending: WebGLQuery[] = [];
  let open = false;
  timer.begin = () => {
    try {
      const q = gl.createQuery()!;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      pending.push(q);
      open = true;
    } catch { open = false; }
  };
  timer.end = () => {
    if (!open) return;
    try { gl.endQuery(ext.TIME_ELAPSED_EXT); } catch { /* nested query in the renderer */ }
    open = false;
  };
  timer.poll = () => {
    while (pending.length) {
      const q = pending[0]!;
      if (open && pending.length === 1) return;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (disjoint) timer.disjoint++;
      else timer.samplesMs.push((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
      gl.deleteQuery(q);
      pending.shift();
    }
  };
  return timer;
}

export function glInfo(gl: WebGL2RenderingContext | null): Record<string, unknown> {
  if (!gl) return { webgl2: false };
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    webgl2: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    version: gl.getParameter(gl.VERSION),
    timerQuery: Boolean(gl.getExtension("EXT_disjoint_timer_query_webgl2")),
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    maxPointSize: gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)
  };
}
