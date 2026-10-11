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
