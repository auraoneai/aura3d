/**
 * On-screen GPU diagnostics panel: renderer string, WebGL limits and extensions, canvas size, WebGPU presence, engine
 * draw calls, shader compile/link failures, WebGL context loss and the last console errors. Intended for real-device
 * bug reports ("open the page with ?diag=1 and send a screenshot"). Nothing is installed until the function is called,
 * and `dispose()` restores every patched browser prototype and console method.
 */
/** Subset of the engine's `diagnostics().shaderFailures` records the panel prints. */
export interface ShaderFailureLike {
  readonly code?: string;
  readonly material?: string;
  readonly stage?: string;
  readonly message?: string;
  readonly locations?: readonly { readonly line?: number; readonly authoredLine?: number; readonly message?: string; readonly window?: readonly { readonly text?: string; readonly error?: boolean }[] }[];
}

export interface DiagnosticsAppLike {
  /** `AuraApp.diagnostics()` shape; only these members are read. */
  diagnostics?(): { readonly backend?: unknown; readonly drawCalls?: unknown; readonly fps?: unknown; readonly warnings?: readonly string[]; readonly errors?: readonly string[]; readonly shaderFailures?: readonly ShaderFailureLike[] } | undefined;
}

export interface DiagnosticsPanelOptions {
  readonly app?: DiagnosticsAppLike;
  readonly title?: string;
  readonly maxLines?: number;
  /** Extra lines appended to the engine section (the safety net adds its rung and switches here). */
  readonly extraLines?: () => readonly string[];
  /** Update period in ms. */
  readonly refreshMs?: number;
}

export interface DiagnosticsPanelHandle {
  readonly lines: readonly string[];
  refresh(): void;
  dispose(): void;
}

export interface GpuProbe {
  readonly renderer: string;
  readonly limits: string;
  readonly extensions: string;
  readonly webgpu: boolean;
  readonly dpr: number;
}

const EXTENSIONS = ["EXT_color_buffer_float", "OES_texture_float_linear", "WEBGL_multi_draw", "EXT_disjoint_timer_query_webgl2"] as const;

export function probeGpu(): GpuProbe | { readonly error: string } {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return { error: "webgl2: unavailable" };
    const info = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
    return {
      renderer: String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      limits: `maxTex ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} units ${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)} samples ${gl.getParameter(gl.MAX_SAMPLES)} fragUniforms ${gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)} varyings ${gl.getParameter(gl.MAX_VARYING_VECTORS)}`,
      extensions: EXTENSIONS.map((name) => `${name.replace(/^(EXT|OES|WEBGL)_/, "")}:${gl.getExtension(name) ? "y" : "n"}`).join(" "),
      webgpu: "gpu" in navigator,
      dpr: globalThis.devicePixelRatio ?? 1
    };
  } catch (error) {
    return { error: `webgl2 probe failed: ${String((error as Error).message)}` };
  }
}

export function formatGpuProbe(probe: GpuProbe | { readonly error: string }): string {
  if ("error" in probe) return probe.error;
  return `gpu: ${probe.renderer}\n${probe.limits}\n${probe.extensions} navigator.gpu:${probe.webgpu ? "y" : "n"} dpr ${probe.dpr}`;
}

/** Pure formatter for the engine section so it can be unit tested without a browser. */
export function formatEngineSection(app: DiagnosticsAppLike | undefined, canvases: ReadonlyArray<{ id?: string; width: number; height: number; clientWidth: number; clientHeight: number }>): string {
  const parts: string[] = [];
  try {
    const report = app?.diagnostics?.();
    if (report) {
      if (report.backend !== undefined) parts.push(`backend=${String(report.backend)}`);
      if (report.drawCalls !== undefined) parts.push(`drawCalls=${String(report.drawCalls)}`);
      if (report.fps !== undefined) parts.push(`fps=${Number(report.fps).toFixed(0)}`);
      for (const warning of (report.warnings ?? []).slice(0, 3)) parts.push(`warn:${String(warning).slice(0, 80)}`);
      for (const error of (report.errors ?? []).slice(0, 3)) parts.push(`error:${String(error).slice(0, 80)}`);
      for (const failure of (report.shaderFailures ?? []).slice(0, 2)) {
        const first = failure.locations?.[0];
        const offending = first?.window?.find((row) => row.error)?.text?.trim();
        const where = first ? ` ${failure.stage ?? ""} line ${first.line}${first.authoredLine !== undefined ? ` (source line ${first.authoredLine})` : ""}` : ` ${failure.stage ?? ""}`;
        parts.push(`\nSHADER ${failure.code ?? "FAILED"} "${failure.material ?? "?"}"${where}: ${String(first?.message ?? failure.message ?? "").slice(0, 100)}${offending ? ` >> ${offending.slice(0, 100)}` : ""}`);
      }
    }
  } catch {
    parts.push("diagnostics() threw");
  }
  const sizes = canvases.map((c) => `${c.id || "canvas"} ${c.width}x${c.height} (css ${c.clientWidth}x${c.clientHeight})`).join("; ");
  return `engine: ${parts.join(" ") || "no diagnostics exposed"}\ncanvas: ${sizes}`;
}

export function installDiagnosticsPanel(options: DiagnosticsPanelOptions = {}): DiagnosticsPanelHandle {
  const lines: string[] = [];
  const maxLines = options.maxLines ?? 14;
  const restore: Array<() => void> = [];
  const push = (line: string): void => {
    lines.push(line.slice(0, 220));
    while (lines.length > maxLines) lines.shift();
  };

  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]): void => { push(`error: ${args.map(String).join(" ")}`); originalError.apply(console, args); };
  console.warn = (...args: unknown[]): void => { push(`warn: ${args.map(String).join(" ")}`); originalWarn.apply(console, args); };
  restore.push(() => { console.error = originalError; console.warn = originalWarn; });

  const onError = (event: ErrorEvent): void => push(`uncaught: ${event.message}`);
  const onRejection = (event: PromiseRejectionEvent): void => push(`rejection: ${String((event.reason as Error | undefined)?.message ?? event.reason)}`);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  restore.push(() => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); });

  const proto = (globalThis as { WebGL2RenderingContext?: { prototype: WebGL2RenderingContext } }).WebGL2RenderingContext?.prototype;
  if (proto) {
    const compile = proto.compileShader;
    const link = proto.linkProgram;
    proto.compileShader = function (this: WebGL2RenderingContext, shader: WebGLShader): void {
      compile.call(this, shader);
      if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) push(`SHADER COMPILE FAILED: ${(this.getShaderInfoLog(shader) ?? "").replace(/\s+/g, " ")}`);
    };
    proto.linkProgram = function (this: WebGL2RenderingContext, program: WebGLProgram): void {
      link.call(this, program);
      if (!this.getProgramParameter(program, this.LINK_STATUS)) push(`PROGRAM LINK FAILED: ${(this.getProgramInfoLog(program) ?? "").replace(/\s+/g, " ")}`);
    };
    restore.push(() => { proto.compileShader = compile; proto.linkProgram = link; });
  }

  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]): RenderingContext | null {
    const context = (getContext as (...a: unknown[]) => RenderingContext | null).apply(this, args);
    if (context && !(this as { __auraSafetyWatched?: boolean }).__auraSafetyWatched) {
      (this as { __auraSafetyWatched?: boolean }).__auraSafetyWatched = true;
      this.addEventListener("webglcontextlost", () => push("WEBGL CONTEXT LOST"));
    }
    return context;
  } as typeof HTMLCanvasElement.prototype.getContext;
  restore.push(() => { HTMLCanvasElement.prototype.getContext = getContext; });

  const panel = document.createElement("pre");
  panel.setAttribute("data-aura3d-safety-panel", "");
  panel.style.cssText = "position:fixed;left:8px;top:8px;z-index:2147483001;max-width:min(720px,calc(100vw - 16px));margin:0;padding:6px 9px;border-radius:6px;background:rgba(0,0,0,.78);color:#9dffb0;font:400 11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none";
  document.body.appendChild(panel);
  restore.push(() => panel.remove());

  const staticInfo = formatGpuProbe(probeGpu());
  const refresh = (): void => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const extra = options.extraLines?.() ?? [];
    panel.textContent = `${options.title ?? "Aura3D diagnostics"}\n${staticInfo}\n${formatEngineSection(options.app, canvases)}${extra.length ? `\n${extra.join("\n")}` : ""}\n${lines.length ? lines.join("\n") : "no errors captured"}`;
  };
  refresh();
  const timer = setInterval(refresh, options.refreshMs ?? 1000);
  restore.push(() => clearInterval(timer));

  return {
    lines,
    refresh,
    dispose(): void {
      for (const undo of restore.reverse()) undo();
    }
  };
}
