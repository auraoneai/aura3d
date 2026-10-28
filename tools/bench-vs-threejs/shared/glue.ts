/* Library-neutral benchmark plumbing: identical for the three.js and Aura3D apps. Not counted as scene source. */
export interface SceneHandle {
  /** Advance the scene by dt seconds and draw exactly one frame. */
  frame(dt: number): void;
  /** Optional scene-specific state for correctness checks (plain data only). */
  state?(): unknown;
  /** Optional headless deterministic replay (scene 4): runs `frames` scripted fixed steps, returns plain-data result. */
  replay?(frames: number): unknown;
}
export type StartFn = (canvas: HTMLCanvasElement) => Promise<SceneHandle>;

export const WIDTH = 640;
export const HEIGHT = 360;

interface BenchApi {
  ready: boolean;
  name: string;
  firstFrameMs: number;
  errors: string[];
  frame(dt: number): void;
  /** frame(dt) without the trailing readPixels sync: the CPU profile uses it to see JS cost apart from GPU wait. */
  frameRaw(dt: number): void;
  /** Blocks until everything submitted so far has executed. */
  sync(): void;
  measure(frames: number, dt: number): { cpuMs: number[]; totalMs: number[] };
  capture(dt: number): { luma: number[]; mean: number; std: number; jpeg: string };
  state(): unknown;
  replay(frames: number): unknown;
}
declare global { interface Window { __BENCH__?: BenchApi } }

export async function runBench(name: string, start: StartFn): Promise<void> {
  const errors: string[] = [];
  window.addEventListener("error", (e) => errors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => errors.push(String((e.reason as Error)?.message ?? e.reason)));
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.cssText = `width:${WIDTH}px;height:${HEIGHT}px;display:block`;
  document.body.appendChild(canvas);
  try {
    const handle = await start(canvas);
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    const sink = new Uint8Array(4);
    // readPixels blocks until the GPU (here: SwiftShader) has executed everything submitted; gl.finish() does not in Chromium.
    const finish = (): void => { gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sink); };
    handle.frame(1 / 60);
    finish();
    const firstFrameMs = performance.now();
    const scratch = document.createElement("canvas");
    scratch.width = WIDTH;
    scratch.height = HEIGHT;
    const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
    const api: BenchApi = {
      ready: true,
      name,
      firstFrameMs,
      errors,
      frame: (dt) => { handle.frame(dt); finish(); },
      frameRaw: (dt) => { handle.frame(dt); },
      sync: finish,
      measure(frames, dt) {
        for (let i = 0; i < 10; i++) { handle.frame(dt); finish(); }
        const cpuMs: number[] = [];
        const totalMs: number[] = [];
        for (let i = 0; i < frames; i++) {
          const t0 = performance.now();
          handle.frame(dt);
          const t1 = performance.now();
          finish();
          const t2 = performance.now();
          cpuMs.push(t1 - t0);
          totalMs.push(t2 - t0);
        }
        return { cpuMs, totalMs };
      },
      capture(dt) {
        handle.frame(dt);
        ctx.drawImage(canvas, 0, 0);
        const data = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
        const luma: number[] = new Array(WIDTH * HEIGHT);
        let sum = 0;
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
          luma[p] = Math.round(l);
          sum += l;
        }
        const mean = sum / luma.length;
        let v = 0;
        for (const l of luma) v += (l - mean) * (l - mean);
        return { luma, mean, std: Math.sqrt(v / luma.length), jpeg: scratch.toDataURL("image/jpeg", 0.85) };
      },
      state: () => handle.state?.() ?? null,
      replay: (frames) => handle.replay?.(frames) ?? null
    };
    window.__BENCH__ = api;
  } catch (error) {
    errors.push(`start failed: ${(error as Error)?.stack ?? error}`);
    window.__BENCH__ = { ready: false, name, firstFrameMs: -1, errors } as unknown as BenchApi;
  }
}
