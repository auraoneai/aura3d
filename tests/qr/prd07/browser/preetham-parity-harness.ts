// PRD-07 P3-T1/P3-T3 (#245) — GPU Preetham parity: draw the §6.1 preetham
// sky program into a 64×64 rgba16f target, read it back through
// `readFloatPixels`, and compare 16 spread directions against the CPU
// `evaluateSky` mirror. Camera = identity view (GL -Z forward) with a 90°
// symmetric perspective, so pixel→direction is the analytic
// normalize([ndcX, ndcY, -1]) — no matrix-library basis ambiguity.

import { WebGL2Device } from "/packages/rendering/src/WebGL2Device.js";
import { skyPassFor } from "/packages/rendering/src/atmosphere/SkyBackgroundPass.js";
import { evaluateSky, skyFrame } from "/packages/rendering/src/atmosphere/SkyEval.js";
import { perspectiveMat4 } from "/packages/scene/src/MathTypes.js";

const W = 64;
const SPEC = { model: "preetham" as const, sun: { elevationDeg: 60, azimuthDeg: 200 }, turbidity: 5 };

interface ParitySample {
  readonly dir: readonly [number, number, number];
  readonly gpu: readonly [number, number, number];
  readonly cpu: readonly [number, number, number];
  readonly relLuma: number;
  readonly relRgb: number;
}

interface ParityResult {
  readonly status: "ready" | "error";
  readonly samples?: readonly ParitySample[];
  readonly maxRelLuma?: number;
  readonly maxRelRgb?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_SKYPAR__?: ParityResult;
  }
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function main(): Promise<void> {
  const canvas = document.getElementById("glstage") as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  const frame = skyFrame(SPEC);
  const pass = skyPassFor(device);
  pass.setSpec(SPEC, 0);

  // 90° fov, square aspect: tan(fov/2) = 1 → dir = normalize([ndcX, ndcY, -1]).
  const vp = new Float32Array(perspectiveMat4(Math.PI / 2, 1, 0.05, 100));
  const target = device.createRenderTarget({ width: W, height: W, format: "rgba16f", depth: false, label: "prd07.skyParity" });
  const prev = device.getRenderTarget?.() ?? null;
  device.setRenderTarget(target);
  try {
    pass.drawSky(vp);
  } finally {
    device.setRenderTarget(prev);
  }
  const px = device.readFloatPixels(0, 0, W, W);

  const samples: ParitySample[] = [];
  for (const gy of [8, 24, 40, 56]) {
    for (const gx of [8, 24, 40, 56]) {
      // readFloatPixels returns GL order (row 0 = bottom = ndcY -1).
      const ndcX = (2 * (gx + 0.5)) / W - 1;
      const ndcY = (2 * (gy + 0.5)) / W - 1;
      const len = Math.hypot(ndcX, ndcY, 1);
      const dir: [number, number, number] = [ndcX / len, ndcY / len, -1 / len];
      const i = (gy * W + gx) * 4;
      const gpu: [number, number, number] = [px[i]!, px[i + 1]!, px[i + 2]!];
      const cpu = evaluateSky(frame, dir) as [number, number, number];
      const gl = luma(gpu[0], gpu[1], gpu[2]);
      const cl = luma(cpu[0], cpu[1], cpu[2]);
      const relLuma = Math.abs(gl - cl) / Math.max(cl, 1e-6);
      const relRgb = Math.max(
        Math.abs(gpu[0] - cpu[0]) / Math.max(cpu[0], 1e-6),
        Math.abs(gpu[1] - cpu[1]) / Math.max(cpu[1], 1e-6),
        Math.abs(gpu[2] - cpu[2]) / Math.max(cpu[2], 1e-6)
      );
      samples.push({ dir, gpu, cpu, relLuma, relRgb });
    }
  }

  window.__QR_PRD07_SKYPAR__ = {
    status: "ready",
    samples,
    maxRelLuma: Math.max(...samples.map((s) => s.relLuma)),
    maxRelRgb: Math.max(...samples.map((s) => s.relRgb))
  };
}

main().catch((error: unknown) => {
  window.__QR_PRD07_SKYPAR__ = { status: "error", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
});
