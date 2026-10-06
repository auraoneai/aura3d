// PRD-07 P5-T1 — §8.3 GPU sim parity: 50,000 particles, gravity only, 60
// steps. Reads the pos/vel state textures back with readFloatPixels and
// compares against the fp32 CPU mirror (gpuSimEmit/gpuSimCpuStep) that
// implements the identical formula. Tolerance: 1mm on positions.
import { WebGL2Device } from "/packages/rendering/src/WebGL2Device.js";
import {
  ParticleGpuSim,
  gpuSimCpuStep,
  type GpuSimSpec
} from "/packages/rendering/src/vfx/ParticleGpuSim.js";

interface Result {
  readonly status: "ready" | "error";
  readonly floatAvailable?: boolean;
  readonly capacity?: number;
  readonly steps?: number;
  readonly maxPosDiff?: number;
  readonly maxVelDiff?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_GPUSIM__?: Result;
  }
}

const CAPACITY = 50_000;
const STEPS = 60;
const DT = 1 / 60;

async function main(): Promise<Result> {
  const canvas = document.getElementById("glstage") as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  try {
    if (!ParticleGpuSim.isAvailable(device.probe)) {
      return { status: "ready", floatAvailable: false };
    }
    const spec: GpuSimSpec = {
      capacity: CAPACITY,
      lifetimeMax: 1e9,
      seed: 4242,
      stateWidth: 512,
      gravity: [0, -9.8, 0],
      emitter: {
        origin: [0, 0, 0],
        direction: [0, 1, 0],
        spread: 0,
        speed: [0, 0],
        discRadius: 0.02
      }
    };
    const sim = new ParticleGpuSim(device, spec);

    // CPU mirror — same emission hash + integration, fp32 storage.
    const cpuPos = new Float32Array(CAPACITY * 4);
    const cpuVel = new Float32Array(CAPACITY * 4);
    for (let i = 3; i < cpuPos.length; i += 4) {
      cpuPos[i] = 1e9;
      cpuVel[i] = 1e9;
    }

    device.beginFrame(sim.state!.width, sim.state!.height);
    let cpuHead = 0;
    for (let f = 0; f < STEPS; f += 1) {
      const emitCount = f === 0 ? CAPACITY : 0;
      sim.step(DT, emitCount, f * DT);
      gpuSimCpuStep(cpuPos, cpuVel, spec, DT, f * DT, f, cpuHead, emitCount);
      cpuHead = (cpuHead + emitCount) % CAPACITY;
    }
    const state = sim.state!;
    device.setRenderTarget(state.posTarget);
    const gpuPos = device.readFloatPixels(0, 0, state.width, state.height);
    device.setRenderTarget(state.velTarget);
    const gpuVel = device.readFloatPixels(0, 0, state.width, state.height);
    device.setRenderTarget(null);
    device.endFrame();

    let maxPos = 0;
    let maxVel = 0;
    for (let i = 0; i < CAPACITY; i += 1) {
      for (let c = 0; c < 3; c += 1) {
        maxPos = Math.max(maxPos, Math.abs(gpuPos[i * 4 + c] - cpuPos[i * 4 + c]));
        maxVel = Math.max(maxVel, Math.abs(gpuVel[i * 4 + c] - cpuVel[i * 4 + c]));
      }
    }
    device.dispose();
    return {
      status: "ready",
      floatAvailable: true,
      capacity: CAPACITY,
      steps: STEPS,
      maxPosDiff: maxPos,
      maxVelDiff: maxVel
    };
  } catch (e) {
    try {
      device.dispose();
    } catch {
      // ignore
    }
    return { status: "error", error: String(e) };
  }
}

main()
  .then((r) => {
    window.__QR_PRD07_GPUSIM__ = r;
  })
  .catch((e) => {
    window.__QR_PRD07_GPUSIM__ = { status: "error", error: String(e) };
  });
