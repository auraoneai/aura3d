/**
 * `parallel-compile` harness tool (01-S7, PRD-01 §6.4): with
 * `KHR_parallel_shader_compile`, `ProgramCache.acquire` returns `pending`
 * without blocking the frame and flips to `ready` once
 * `COMPLETION_STATUS_KHR` reports done (`WebGL2Device.compileAsync`).
 */

import { Renderer } from "../../../../packages/rendering/src";
import { ProgramCache } from "../../../../packages/rendering/src/program/ProgramCache";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { WebGL2Device } from "../../../../packages/rendering/src/WebGL2Device";

export interface ParallelCompileReport {
  readonly extension: boolean;
  readonly probeParallelShaderCompile: boolean;
  readonly firstStatus: string;
  readonly acquireMs: number;
  readonly framesUntilReady: number;
  readonly finalStatus: string;
  readonly pendingDuringFirstFrame: number;
  readonly failed: number;
  readonly errors: readonly string[];
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export async function runParallelCompileTool(stage: HTMLElement): Promise<ParallelCompileReport> {
  const errors: string[] = [];
  await import("../../../../packages/rendering/src/lanes/prd01");
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  stage.appendChild(canvas);
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 64, height: 64 });
  try {
    const device = renderer.device as WebGL2Device;
    const gl = canvas.getContext("webgl2");
    const extension = gl?.getExtension("KHR_parallel_shader_compile") != null;
    const cache = new ProgramCache(device, {
      flags: resolveQrFlags({ env: { A3D_QR_CORE: "v2" } }),
      onDegradation: (d) => errors.push(`${d.code}: ${d.message}`)
    });
    // A lit record heavy enough that the driver cannot finish it inside acquire().
    const features = normalizeProgramFeatures({
      lighting: "lit",
      environment: "equirect",
      lights: { dir: 2, point: 4, spot: 2, rect: 0, clustered: false, hemisphere: false },
      maps: { baseColor: { uvSet: 0, transform: false }, normal: { uvSet: 0, transform: false }, metallicRoughness: { uvSet: 0, transform: false } }
    });
    const t0 = performance.now();
    const first = cache.acquire(features);
    const acquireMs = performance.now() - t0;
    const pendingDuringFirstFrame = device.parallelCompilesPending;
    let frames = 0;
    let handle = first;
    while (handle.status === "pending" && frames < 600) {
      await nextFrame();
      frames += 1;
      handle = cache.acquire(features);
    }
    if (handle.status === "failed") errors.push(`program failed: ${handle.error ?? "unknown"}`);
    const stats = cache.stats();
    cache.dispose();
    return {
      extension,
      probeParallelShaderCompile: device.probe?.parallelShaderCompile === true,
      firstStatus: first.status,
      acquireMs,
      framesUntilReady: frames,
      finalStatus: handle.status,
      pendingDuringFirstFrame,
      failed: stats.failed,
      errors
    };
  } finally {
    renderer.dispose();
  }
}
