// PRD-07 P5-T6 — §8.7 froxel transmittance: uniform σ=0.05, no light
// (sun/ambient black) → the integrated (S,T) at each tile is pure extinction
// T = exp(−σ·z). Reads slice 48 of the froxel-medium grid (far edge z₄₉ ≈
// 20.47m → T = exp(−1.024)) and asserts ≈ exp(−1) within ±3%, plus S ≈ 0.
// Also reports whether the reduced-grid note is present.
import { WebGL2Device } from "/packages/rendering/src/WebGL2Device.js";
import { VolumetricFogPass, froxelGridFor } from "/packages/rendering/src/atmosphere/VolumetricFogPass.js";
import type { FrameContributorContext } from "/packages/rendering/src/contracts/frameGraph.js";

interface Result {
  readonly status: "ready" | "error";
  readonly slice?: number;
  readonly zAtSlice?: number;
  readonly transmittance?: number;
  readonly expected?: number;
  readonly scatter?: readonly [number, number, number];
  readonly note?: string;
  readonly reduced?: boolean;
  readonly reducedSlices?: number;
  readonly reducedNote?: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_FROXEL__?: Result;
  }
}

// Medium grid: near 0.5, far 64, 64 slices. Slice k's far edge is
// z_{k+1} = 0.5·128^((k+1)/64); k=48 → z₄₉ ≈ 20.47m ⇒ T = exp(−0.05·20.47).
const SLICE = 48;
const SIGMA = 0.05;

async function main(): Promise<Result> {
  const canvas = document.getElementById("glstage") as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  try {
    const grid = froxelGridFor("froxel-medium");
    if (!grid) return { status: "error", error: "froxel-medium grid unavailable" };
    const pass = new VolumetricFogPass(device, grid);

    const z = grid.near * Math.pow(grid.far / grid.near, (SLICE + 1) / grid.slices);
    const expected = Math.exp(-SIGMA * z);

    // PRD 07-created depth target (spec: not the frame). Constant far-plane
    // value; the apply pass samples it but the T assertion reads integrate.
    const depthTarget = device.createRenderTarget({ width: 4, height: 4, format: "rgba8", label: "prd07.froxel.specDepth" });
    device.writeRenderTargetPixels?.(depthTarget, new Uint8Array(4 * 4 * 4).fill(255));

    const reduced = froxelGridFor("froxel-high", false);

    const ctx = {
      frameIndex: 0,
      timeSeconds: 0,
      camera: {
        viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        projectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        position: [0, 0, 0],
        previousViewProjectionMatrix: null
      }
    } as unknown as FrameContributorContext;

    device.beginFrame(grid.atlasWidth, grid.atlasHeight);
    pass.update(
      {
        fog: {
          fogA: [SIGMA, 0, 0.2, 0],
          fogB: [0, 0, 0, 0.6],
          fogColor: [0, 0, 0],
          fogAbsorption: [0, 0, 0],
          fogMode: 2,
          fogNear: 0,
          fogFar: grid.far
        },
        fogColor: [0, 0, 0],
        volumes: [],
        sunDirection: [0, -1, 0],
        sunColor: [0, 0, 0],
        ambientColor: [0, 0, 0],
        sceneDepth: depthTarget.colorTexture,
        depthLinearize: [0, 0, 0, 0]
      },
      ctx
    );
    const integrate = pass.debugTargets.integrate!;
    const tx = SLICE % grid.tilesX;
    const ty = Math.floor(SLICE / grid.tilesX);
    device.setRenderTarget(integrate);
    const px = device.readFloatPixels(
      tx * grid.tileWidth + Math.floor(grid.tileWidth / 2),
      ty * grid.tileHeight + Math.floor(grid.tileHeight / 2),
      1,
      1
    );
    device.setRenderTarget(null);
    device.endFrame();
    device.dispose();
    return {
      status: "ready",
      slice: SLICE,
      zAtSlice: z,
      transmittance: px[3],
      expected,
      scatter: [px[0], px[1], px[2]],
      note: grid.note,
      reduced: grid.note === "VOLUMETRIC_GRID_REDUCED",
      reducedSlices: reduced?.slices,
      reducedNote: reduced?.note ?? undefined
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
    window.__QR_PRD07_FROXEL__ = r;
  })
  .catch((e) => {
    window.__QR_PRD07_FROXEL__ = { status: "error", error: String(e) };
  });
