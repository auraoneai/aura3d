/**
 * Isolated proof page for native WebGPU ambient occlusion: a cluster of unlit
 * blocks on a floor (creases, stacked corners, a wall), rendered through the
 * public Renderer on either backend with the same post bag. Query flags:
 *   ?backend=webgpu|webgl2  ?ao=0  ?mode=gtao|legacy  ?msaa=0
 * `gtao` is the v2 S2 stage (pipeline.ao, the route games take); `legacy` is
 * the fused-chain ssao pass. The page publishes the native AO pass counters
 * on `document.body.dataset` for capture scripts.
 */
import "../../packages/rendering/src/lanes/prd01";
import "../../packages/rendering/src/lanes/prd03";
import { Geometry } from "../../packages/rendering/src/Geometry";
import { Renderer, type CameraLike } from "../../packages/rendering/src/Renderer";
import { PBRMaterial } from "../../packages/rendering/src/PBRMaterial";
import { createTrustedQrFlags } from "../../packages/rendering/src/contracts/core";

const params = new URLSearchParams(location.search);
const backend = params.get("backend") === "webgl2" ? "webgl2" : "webgpu";
const aoOn = params.get("ao") !== "0";
const legacy = params.get("mode") === "legacy";
const msaa = params.get("msaa") !== "0";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const width = Math.max(1, Math.round(canvas.clientWidth));
const height = Math.max(1, Math.round(canvas.clientHeight));
canvas.width = width;
canvas.height = height;

const near = 0.3, far = 80;
function perspective(fovY: number, aspect: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
}
function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!;
    out[c * 4 + r] = sum;
  }
  return out;
}
function box(x: number, y: number, z: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1]);
}
// Camera at (0, 2.6, 2.2), pitched down 0.55 rad: view = Rx(0.55) * T(0, -2.6, -2.2).
const c = Math.cos(0.55), s = Math.sin(0.55);
const view = multiply(new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]), box(0, -2.6, -2.2, 1, 1, 1));
const projection = perspective(Math.PI / 4, width / height);
const camera: CameraLike = {
  viewMatrix: view, projectionMatrix: projection, viewProjectionMatrix: multiply(projection, view),
  projectionMetadata: { kind: "perspective", near, far, mode: "standard", clipRange: "minus-one-to-one" }
};

const cube = Geometry.litCube(1);
// Lit by the material's uniform environment only (no direct lights), so every
// pixel's indirect fraction is 1 and the full AO term applies on both backends.
const items: { geometry: Geometry; material: PBRMaterial; modelMatrix: Float32Array; label: string }[] = [];
const add = (label: string, color: readonly [number, number, number], m: Float32Array): void => {
  items.push({ geometry: cube, material: new PBRMaterial({ baseColor: [color[0], color[1], color[2], 1], metallic: 0, roughness: 0.8,
    environmentColor: [1, 1, 1], environmentIntensity: 1 }), modelMatrix: m, label });
};
add("floor", [0.78, 0.76, 0.72], box(0, -0.05, -2, 14, 0.1, 14));
add("wall", [0.7, 0.72, 0.78], box(0, 1.5, -6, 14, 3, 0.2));
const blocks: readonly [number, number, number, number, readonly [number, number, number]][] = [
  [-2.2, 0.5, -3, 1, [0.9, 0.55, 0.4]], [-1.1, 0.5, -3, 1, [0.55, 0.75, 0.9]], [-1.65, 1.5, -3, 1, [0.9, 0.85, 0.5]],
  [0.6, 0.35, -2, 0.7, [0.6, 0.85, 0.55]], [1.4, 0.35, -2.2, 0.7, [0.85, 0.6, 0.85]], [1.0, 0.35, -1.4, 0.7, [0.95, 0.95, 0.95]],
  [2.6, 0.75, -4.5, 1.5, [0.8, 0.7, 0.6]], [-3.4, 0.4, -5.3, 0.8, [0.7, 0.8, 0.65]], [0, 0.25, -5.6, 0.5, [0.9, 0.7, 0.5]]
];
for (const [index, [x, y, z, size, color]] of blocks.entries()) add(`block-${index}`, color, box(x, y, z, size, size, size));

const ao = { radius: 0.6, intensity: 1, falloff: 1, directions: 4 as const, steps: 6 as const, halfRes: true, temporal: false, multiBounce: true, fallbackStrength: 0.1 };
const pipeline = {
  ...(aoOn && !legacy ? { ao } : {}),
  antiAliasing: msaa ? ("msaa" as const) : ("off" as const),
  toneMapping: "aces" as const,
  exposure: 1,
  depthRange: { near, far, projection: "perspective" as const }
};
const postprocess = {
  ...(legacy ? {} : { v2: true, pipeline }),
  targetFormat: "rgba16f" as const,
  ...(msaa && !legacy ? { sampleCount: 4 } : { sampleCount: 1 }),
  toneMapping: { operator: "aces" as const, exposure: 1, whitePoint: 1, inputColorSpace: "linear" as const, outputColorSpace: "srgb" as const },
  ...(aoOn && legacy ? { ssao: { radius: 4, intensity: 1, bias: 0.0005 } } : {})
};

const body = document.body;
body.dataset.backendRequested = backend;
// No top-level await: the renderer's lazy chunks import shared code from this entry chunk.
async function main(): Promise<void> {
  try {
    const renderer = await Renderer.create({ backend, canvas, width, height, clearColor: [0.12, 0.16, 0.24, 1],
      qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_POST: true }) });
    body.dataset.backendActive = renderer.device.kind;
    body.dataset.capabilities = (renderer.device.info.capabilities ?? []).join(",");
    let frameId = 0;
    const source = { renderItems: items, cameraPolicy: "require" as const, frustumCulling: false, shadow: { enabled: false }, postprocess };
    const frame = (): void => {
      try {
        renderer.render({ source, camera, frameId: frameId++ });
        const state = renderer.device.captureState?.();
        body.dataset.nativeSsaoPasses = String(state?.get("nativeSsaoPasses") ?? "");
        body.dataset.nativeAoPasses = String(state?.get("nativeAmbientOcclusionPasses") ?? "");
        body.dataset.frames = String(frameId);
        if (frameId < 240) requestAnimationFrame(frame);
      } catch (error) {
        body.dataset.renderError = String((error as { code?: string }).code ?? error);
        console.error("[wgpu-ssao-probe] render failed", error);
      }
    };
    requestAnimationFrame(frame);
  } catch (error) {
    body.dataset.renderError = String((error as { code?: string }).code ?? error);
    console.error("[wgpu-ssao-probe] mount failed", error);
  }
}
void main();
