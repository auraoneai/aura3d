/**
 * Frame tap: tells the black-frame guard when a WebGL canvas has just been drawn to, in the same task as the draw.
 *
 * A WebGL canvas created without `preserveDrawingBuffer` only holds its pixels until the browser composites the frame; read
 * it from a different task (for example an unrelated `requestAnimationFrame` callback that runs before the app draws) and it
 * returns zeros, so a healthy game looks black. The tap wraps the GL draw calls (`drawArrays`, `drawElements`, the instanced
 * and multi-draw forms) and, for the first draw to the default framebuffer in a task, queues a microtask. The microtask runs
 * after the drawing code returns and before the browser composites, so a read in `onFrame` sees the finished frame. Draws to
 * an offscreen framebuffer do not count, so a render-to-texture pass never triggers a read of an empty canvas.
 *
 * The tap never renders, never changes context attributes and adds one array lookup per draw call.
 */
const DRAW_METHODS = ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"] as const;
const MULTI_DRAW_METHODS = ["multiDrawArraysWEBGL", "multiDrawElementsWEBGL", "multiDrawArraysInstancedWEBGL", "multiDrawElementsInstancedWEBGL"] as const;
const GL_FRAMEBUFFER = 0x8d40;
const GL_DRAW_FRAMEBUFFER = 0x8ca9;

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;
type GlLike = { canvas?: unknown };

export interface FrameTapOptions {
  /** Called once per task in which the default framebuffer of a sufficiently large canvas was drawn, after the draw code returned. */
  readonly onFrame: (canvas: HTMLCanvasElement) => void;
  /** Prototypes to wrap. Defaults to `WebGL2RenderingContext.prototype` and `WebGLRenderingContext.prototype`. */
  readonly prototypes?: readonly object[];
  /** Schedules `fn` after the current call stack unwinds and before compositing. Defaults to `queueMicrotask`. */
  readonly enqueue?: (fn: () => void) => void;
  /** Canvases smaller than this are never reported (minimaps, HUD widgets, probe canvases). Defaults 128 x 96. */
  readonly minWidth?: number;
  readonly minHeight?: number;
}

export interface FrameTap {
  /** Draw calls to the default framebuffer seen so far, summed over every canvas. */
  drawCalls(): number;
  /** Tasks that were reported through `onFrame` so far. */
  frames(): number;
  /** The reported canvas with the largest area (the world view), or undefined before any frame. */
  worldCanvas(): HTMLCanvasElement | undefined;
  /** Restores every wrapped method. */
  dispose(): void;
}

interface CanvasState {
  pending: boolean;
}

function isElementCanvas(value: unknown): value is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== "undefined" ? value instanceof HTMLCanvasElement : typeof value === "object" && value !== null && typeof (value as { width?: unknown }).width === "number";
}

export function installFrameTap(options: FrameTapOptions): FrameTap {
  const prototypes =
    options.prototypes ??
    ([typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext.prototype : undefined, typeof WebGLRenderingContext !== "undefined" ? WebGLRenderingContext.prototype : undefined].filter(Boolean) as object[]);
  const enqueue = options.enqueue ?? ((fn: () => void) => queueMicrotask(fn));
  const minWidth = options.minWidth ?? 128;
  const minHeight = options.minHeight ?? 96;
  const restores: Array<() => void> = [];
  const drawFramebuffer = new WeakMap<object, unknown>();
  const states = new WeakMap<object, CanvasState>();
  const wrappedExtensions = new WeakSet<object>();
  let draws = 0;
  let frames = 0;
  let world: HTMLCanvasElement | undefined;

  const noteDraw = (gl: GlLike): void => {
    if (drawFramebuffer.get(gl) != null) return;
    const canvas = gl.canvas;
    if (!isElementCanvas(canvas)) return;
    draws += 1;
    let state = states.get(canvas);
    if (!state) {
      state = { pending: false };
      states.set(canvas, state);
    }
    if (state.pending) return;
    state.pending = true;
    const st = state;
    enqueue(() => {
      st.pending = false;
      if (canvas.width < minWidth || canvas.height < minHeight) return;
      if (!world || canvas.width * canvas.height >= world.width * world.height) world = canvas;
      frames += 1;
      try {
        options.onFrame(canvas);
      } catch {
        /* a failing observer must never break the page */
      }
    });
  };

  for (const proto of prototypes) {
    const target = proto as Record<string, unknown>;
    for (const name of DRAW_METHODS) {
      const original = target[name];
      if (typeof original !== "function") continue;
      target[name] = function (this: GlLike, ...args: unknown[]): unknown {
        const result = (original as AnyFn).apply(this, args);
        noteDraw(this);
        return result;
      };
      restores.push(() => {
        target[name] = original;
      });
    }
    const bind = target.bindFramebuffer;
    if (typeof bind === "function") {
      target.bindFramebuffer = function (this: object, glTarget: number, framebuffer: unknown): unknown {
        if (glTarget === GL_FRAMEBUFFER || glTarget === GL_DRAW_FRAMEBUFFER) drawFramebuffer.set(this, framebuffer);
        return (bind as AnyFn).call(this, glTarget, framebuffer);
      };
      restores.push(() => {
        target.bindFramebuffer = bind;
      });
    }
    const getExtension = target.getExtension;
    if (typeof getExtension === "function") {
      target.getExtension = function (this: GlLike, name: string): unknown {
        const extension = (getExtension as AnyFn).call(this, name) as Record<string, unknown> | null;
        if (extension && typeof name === "string" && /multi_draw/i.test(name) && !wrappedExtensions.has(extension)) {
          wrappedExtensions.add(extension);
          const gl = this;
          for (const method of MULTI_DRAW_METHODS) {
            const original = extension[method];
            if (typeof original !== "function") continue;
            extension[method] = function (this: unknown, ...args: unknown[]): unknown {
              const result = (original as AnyFn).apply(this, args);
              noteDraw(gl);
              return result;
            };
          }
        }
        return extension;
      };
      restores.push(() => {
        target.getExtension = getExtension;
      });
    }
  }

  return {
    drawCalls: () => draws,
    frames: () => frames,
    worldCanvas: () => world,
    dispose(): void {
      for (const restore of restores.splice(0)) restore();
    }
  };
}
