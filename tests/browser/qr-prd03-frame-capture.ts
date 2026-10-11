/**
 * Lane 03 browser probes: read the frame the app just rendered.
 *
 * The production canvas is created without `preserveDrawingBuffer`, so its
 * back buffer is undefined once the browser composites (after the task that
 * rendered it). The v2 post chain also leaves a pooled framebuffer bound. A
 * probe that calls `gl.readPixels` after `await requestAnimationFrame`, or
 * without binding the default framebuffer, reads zeros or an intermediate
 * target — the cause of the all-black frames on the GPU lane (post-quality
 * 38117485212, job 114405182682: bloom offEnergy 0, tone step 0 = 0, DoF
 * bokeh 0). `app.capture()` (C-05) reads the same way this helper does.
 *
 * `installFrameCapture` wraps `app.step` so every rendered frame is read back
 * in the same task, from the default framebuffer, right after it is drawn.
 * The original `readPixels` is taken at module load (before any harness
 * installs a readback counter), so these probe reads never count as engine
 * readbacks.
 */
const rawReadPixels = WebGL2RenderingContext.prototype.readPixels;

export interface FrameCapture {
  /** Pixels of the most recently stepped frame (RGBA8, GL bottom-up rows). */
  read(): Uint8Array;
  readonly width: number;
  readonly height: number;
}

export function readDefaultFramebuffer(gl: WebGL2RenderingContext, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  (rawReadPixels as unknown as (...a: unknown[]) => void).call(gl, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

export function installFrameCapture(app: { step(dt?: number): unknown }, canvas: HTMLCanvasElement): FrameCapture {
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  const step = app.step.bind(app);
  let last: Uint8Array | null = null;
  app.step = (dt?: number) => {
    const result = step(dt);
    last = readDefaultFramebuffer(gl, canvas.width, canvas.height);
    return result;
  };
  return {
    read() {
      if (!last) {
        // Nothing stepped yet: render one frame now so the read is defined.
        app.step(0);
      }
      return last!;
    },
    get width() { return canvas.width; },
    get height() { return canvas.height; }
  };
}

/** PNG data URL of a GL bottom-up RGBA8 frame (rows flipped), for spec artifacts. */
export function frameToPngDataUrl(pixels: Uint8Array, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Mean 8-bit luma of a frame (0..255) — a cheap "is it black?" diagnostic. */
export function meanLuma(pixels: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) sum += 0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!;
  return sum / Math.max(1, pixels.length / 4);
}

/** The post/output diagnostics that explain what the frame ran. */
export function postDiagnostics(app: unknown): unknown {
  const d = (app as { diagnostics?: () => Record<string, unknown> }).diagnostics?.() ?? {};
  const post = (d.post ?? {}) as Record<string, unknown>;
  // Errors first: the spec log line is truncated, and a frame-aborting
  // renderer error is the first thing a black frame needs explained.
  return {
    errors: d.errors,
    lastError: (d as { lastError?: unknown }).lastError,
    renderer: (d as { renderer?: { lastError?: unknown; errors?: unknown } }).renderer?.lastError ?? (d as { renderer?: { errors?: unknown } }).renderer?.errors,
    post: {
      pipeline: post.pipeline,
      submittedPasses: post.submittedPasses,
      skipped: post.skipped,
      customPasses: post.customPasses,
      warnings: post.warnings
    },
    output: d.output
  };
}

/**
 * GL error trace for diagnosis runs: wraps `drawArrays`/`drawElements` so each
 * call records `getError()` and the bound draw framebuffer's completeness.
 * Only first-seen (program label, error) pairs are kept. Probe-only: it adds
 * a getError per draw, so it is installed by the diagnosis harness, never by
 * a timing probe.
 */
export interface GlErrorTrace { readonly entries: string[]; uninstall(): void }

export function traceGlErrors(gl: WebGL2RenderingContext): GlErrorTrace {
  const entries: string[] = [];
  const seen = new Set<string>();
  const names: Record<number, string> = { 0x0500: "INVALID_ENUM", 0x0501: "INVALID_VALUE", 0x0502: "INVALID_OPERATION", 0x0506: "INVALID_FRAMEBUFFER_OPERATION", 0x0505: "OUT_OF_MEMORY" };
  const wrap = (method: "drawArrays" | "drawElements") => {
    const original = gl[method].bind(gl) as (...a: unknown[]) => void;
    (gl as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      const before = gl.getError();
      const status = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER);
      original(...args);
      const after = gl.getError();
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
      const fbo = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const viewport = Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array).join("x");
      const tag = `${method} fbo=${fbo ? "pooled" : "default"} vp=${viewport} status=${status === gl.FRAMEBUFFER_COMPLETE ? "complete" : `0x${status.toString(16)}`} pre=${names[before] ?? before} err=${names[after] ?? after} prog=${program ? "set" : "null"}`;
      if ((after !== 0 || before !== 0 || status !== gl.FRAMEBUFFER_COMPLETE) && !seen.has(tag)) {
        seen.add(tag);
        entries.push(tag);
      }
    };
    return () => { (gl as unknown as Record<string, unknown>)[method] = original; };
  };
  const undo = [wrap("drawArrays"), wrap("drawElements")];
  return { entries, uninstall: () => undo.forEach((fn) => fn()) };
}
