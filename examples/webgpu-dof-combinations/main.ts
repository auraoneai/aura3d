/**
 * Isolated proof page for the native WebGPU depth-of-field chain (W2): unlit
 * cubes at several depths, rendered with depth of field plus MSAA, chromatic
 * aberration, vignette and film grain. Query flags:
 *   ?backend=webgpu|webgl2  ?msaa=0  ?stages=0  ?dof=0
 * The page publishes the renderer's native DoF diagnostics on
 * `document.body.dataset` for capture scripts.
 */
import { Geometry, UnlitMaterial, Renderer, type CameraLike } from "@aura3d/rendering";
import { createTrustedQrFlags } from "@aura3d/rendering/contracts";

const params = new URLSearchParams(location.search);
const backend = params.get("backend") === "webgl2" ? "webgl2" : "webgpu";
const msaa = params.get("msaa") !== "0";
const stages = params.get("stages") !== "0";
const dofOn = params.get("dof") !== "0";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const width = Math.max(1, Math.round(canvas.clientWidth));
const height = Math.max(1, Math.round(canvas.clientHeight));
canvas.width = width;
canvas.height = height;

const near = 0.5, far = 60;
function perspective(fovY: number, aspect: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
}
function translate(x: number, y: number, z: number, s = 1): Float32Array {
  return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1]);
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

const projection = perspective(Math.PI / 4, width / height);
const view = translate(0, -0.9, 0);
const camera: CameraLike = {
  viewMatrix: view, projectionMatrix: projection, viewProjectionMatrix: multiply(projection, view),
  projectionMetadata: { kind: "perspective", near, far, mode: "standard", clipRange: "minus-one-to-one" }
};

const cube = Geometry.cube(1);
const palette: readonly (readonly [number, number, number])[] = [
  [0.95, 0.35, 0.2], [0.2, 0.75, 0.95], [0.95, 0.85, 0.25], [0.45, 0.9, 0.4], [0.85, 0.4, 0.9], [1, 1, 1]
];
const items: { geometry: Geometry; material: UnlitMaterial; modelMatrix: Float32Array; label: string }[] = [];
let index = 0;
for (let row = 0; row < 7; row++) {
  const z = -3 - row * 3;
  for (let column = -3; column <= 3; column++) {
    const color = palette[(index++) % palette.length]!;
    items.push({ geometry: cube, material: new UnlitMaterial({ color: [color[0], color[1], color[2], 1] }),
      modelMatrix: translate(column * 1.6 + (row % 2) * 0.8, -0.6, z, 0.55), label: `cube-${row}-${column}` });
  }
}
// A thin ground strip of dark tiles, so the focal falloff reads along the floor.
for (let z = -2; z > -26; z -= 1) {
  for (let x = -6; x <= 6; x += 1) {
    const shade = (Math.abs(x + z) % 2) ? 0.12 : 0.2;
    items.push({ geometry: cube, material: new UnlitMaterial({ color: [shade, shade, shade * 1.1, 1] }),
      modelMatrix: multiply(translate(x, -1.05, z), new Float32Array([1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])), label: `tile-${x}-${z}` });
  }
}

const pipeline = {
  ...(dofOn ? { dof: { focusDistance: 9, fStop: 1.4, focalLengthMm: 50, maxBlurPx: 10 } } : {}),
  antiAliasing: msaa ? ("msaa" as const) : ("off" as const),
  toneMapping: "aces" as const,
  exposure: 1,
  depthRange: { near, far, projection: "perspective" as const },
  ...(stages ? {
    vignette: { intensity: 0.55, smoothness: 0.7, roundness: 1, color: { r: 0.06, g: 0.02, b: 0.12 } },
    filmGrain: { intensity: 0.08, size: 1, luminanceResponse: 0.6 },
    chromaticAberration: { intensity: 0.05 }
  } : {})
};
const postprocess = {
  v2: true,
  targetFormat: "rgba16f" as const,
  ...(msaa ? { sampleCount: 4 } : { sampleCount: 1 }),
  toneMapping: { operator: "aces" as const, exposure: 1, whitePoint: 1, inputColorSpace: "linear" as const, outputColorSpace: "srgb" as const },
  colorGrade: { contrast: 1.05, saturation: 1.1 },
  pipeline
};

const body = document.body;
body.dataset.backendRequested = backend;
// No top-level await: the renderer's lazy chunks import shared code from this
// entry chunk, which would deadlock while the entry is still evaluating.
async function main(): Promise<void> {
try {
  console.log("[wgpu-dof-example] creating renderer", backend, width, height);
  const renderer = await Renderer.create({ backend, canvas, width, height, clearColor: [0.03, 0.035, 0.06, 1],
    qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_POST: true }) });
  body.dataset.backendActive = renderer.device.kind;
  console.log("[wgpu-dof-example] renderer ready", renderer.device.kind);
  let frameId = 0;
  const source = { renderItems: items, cameraPolicy: "require" as const, frustumCulling: false, shadow: { enabled: false }, postprocess };
  const frame = (): void => {
    try {
      const diagnostics = renderer.render({ source, camera, frameId: frameId++ });
      body.dataset.nativeDof = JSON.stringify(diagnostics.nativeDepthOfField ?? null);
      body.dataset.frames = String(frameId);
      if (frameId < 240) requestAnimationFrame(frame);
    } catch (error) {
      body.dataset.renderError = String((error as { code?: string }).code ?? error);
      console.error("[wgpu-dof-example] render failed", error);
    }
  };
  requestAnimationFrame(frame);
} catch (error) {
  body.dataset.renderError = String((error as { code?: string }).code ?? error);
  console.error("[wgpu-dof-example] mount failed", error);
}
}
void main();
