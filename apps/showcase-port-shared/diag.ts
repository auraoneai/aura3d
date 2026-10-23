/**
 * `?diag=1` on any showcase port page shows a small on-screen panel with what the browser/GPU actually did:
 * renderer string, WebGL limits, canvas size, WebGPU presence, engine draw calls, shader compile/link failures,
 * WebGL context loss and the last console errors. Off by default; without the query parameter this module does nothing.
 */
export const portDiagnostics = { enabled: false, lines: [] as string[] };

const MAX_LINES = 14;

function install(): void {
  const lines = portDiagnostics.lines;
  const push = (line: string): void => {
    lines.push(line.slice(0, 220));
    while (lines.length > MAX_LINES) lines.shift();
  };

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  console.error = (...args: unknown[]): void => { push(`error: ${args.map(String).join(" ")}`); originalError(...args); };
  console.warn = (...args: unknown[]): void => { push(`warn: ${args.map(String).join(" ")}`); originalWarn(...args); };
  window.addEventListener("error", (event) => push(`uncaught: ${event.message}`));
  window.addEventListener("unhandledrejection", (event) => push(`rejection: ${String((event.reason as Error | undefined)?.message ?? event.reason)}`));

  const proto = (globalThis as { WebGL2RenderingContext?: { prototype: WebGL2RenderingContext } }).WebGL2RenderingContext?.prototype;
  if (proto) {
    const compile = proto.compileShader;
    proto.compileShader = function (this: WebGL2RenderingContext, shader: WebGLShader): void {
      compile.call(this, shader);
      if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) push(`SHADER COMPILE FAILED: ${(this.getShaderInfoLog(shader) ?? "").replace(/\s+/g, " ")}`);
    };
    const link = proto.linkProgram;
    proto.linkProgram = function (this: WebGL2RenderingContext, program: WebGLProgram): void {
      link.call(this, program);
      if (!this.getProgramParameter(program, this.LINK_STATUS)) push(`PROGRAM LINK FAILED: ${(this.getProgramInfoLog(program) ?? "").replace(/\s+/g, " ")}`);
    };
  }
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]): RenderingContext | null {
    const context = (getContext as (...a: unknown[]) => RenderingContext | null).apply(this, args);
    if (context && !(this as { __diagWatched?: boolean }).__diagWatched) {
      (this as { __diagWatched?: boolean }).__diagWatched = true;
      this.addEventListener("webglcontextlost", () => push("WEBGL CONTEXT LOST"));
    }
    return context;
  } as typeof HTMLCanvasElement.prototype.getContext;

  const panel = document.createElement("pre");
  panel.style.cssText = "position:fixed;left:8px;top:8px;z-index:2147483001;max-width:min(720px,calc(100vw - 16px));margin:0;padding:6px 9px;border-radius:6px;background:rgba(0,0,0,.78);color:#9dffb0;font:400 11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none";
  document.body.appendChild(panel);

  const glInfo = (): string => {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return "webgl2: unavailable";
      const ext = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
      const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      const exts = ["EXT_color_buffer_float", "OES_texture_float_linear", "WEBGL_multi_draw", "EXT_disjoint_timer_query_webgl2"].map((e) => `${e.replace(/^(EXT|OES|WEBGL)_/, "")}:${gl.getExtension(e) ? "y" : "n"}`).join(" ");
      return `gpu: ${renderer}\nmaxTex ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} units ${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)} samples ${gl.getParameter(gl.MAX_SAMPLES)} fragUniforms ${gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)} varyings ${gl.getParameter(gl.MAX_VARYING_VECTORS)}\n${exts} navigator.gpu:${"gpu" in navigator ? "y" : "n"} dpr ${devicePixelRatio}`;
    } catch (error) {
      return `webgl2 probe failed: ${String((error as Error).message)}`;
    }
  };
  const staticInfo = glInfo();

  const engineInfo = (): string => {
    const w = window as unknown as Record<string, Record<string, unknown> | undefined>;
    const hookName = Object.keys(w).find((k) => /^__AURA_(?!PORT_MODULES|LIVE_APPS|ROUTE_READY)[A-Z0-9_]+__$/.test(k));
    const hook = hookName ? w[hookName] : undefined;
    const found: string[] = [];
    const walk = (value: unknown, depth: number): void => {
      if (depth > 3 || value === null || typeof value !== "object") return;
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (/^(drawCalls|backend|fallback|fallbackReason|qualityTier|tier|triangles)$/i.test(k) && (typeof v === "number" || typeof v === "string" || typeof v === "boolean")) found.push(`${k}=${String(v)}`);
        else if (typeof v === "object") walk(v, depth + 1);
      }
    };
    for (const name of ["diagnostics", "diag", "info", "snapshot"]) {
      try { const member = hook?.[name]; walk(typeof member === "function" ? (member as () => unknown)() : member, 0); } catch { /* accessor needs arguments */ }
    }
    const canvases = Array.from(document.querySelectorAll("canvas")).map((c) => `${c.id || "canvas"} ${c.width}x${c.height} (css ${c.clientWidth}x${c.clientHeight})`).join("; ");
    return `engine: ${found.slice(0, 10).join(" ") || "no diagnostics exposed"}\ncanvas: ${canvases}`;
  };

  const refresh = (): void => {
    panel.textContent = `Aura3D port diagnostics (?diag=1)\n${staticInfo}\n${engineInfo()}\n${lines.length ? lines.join("\n") : "no errors captured"}`;
  };
  refresh();
  setInterval(refresh, 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined" && new URLSearchParams(window.location.search).get("diag") === "1") {
  portDiagnostics.enabled = true;
  const start = (): void => install();
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
}
