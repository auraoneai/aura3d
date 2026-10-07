// PRD-07 P1-T10 — soft particles: a depth RenderTarget ("depth":"texture")
// holds a plane at viewZ 2m; a particle at 1.9m keeps alpha × 0.2857
// (depth gap 0.1 / softDistance 0.35); beyond 2m → 0.

import { LeanWebGL2Device } from "/packages/rendering/src/LeanWebGL2Device.js";
import { ParticleBatchPass } from "/packages/rendering/src/vfx/ParticleBatchPass.js";
import { PARTICLE_INSTANCE_FLOATS } from "/packages/rendering/src/vfx/ParticleInstanceLayout.js";
import { VertexFormat } from "/packages/rendering/src/VertexFormat.js";
import { Texture } from "/packages/rendering/src/Texture.js";
import type { FrameContributorContext } from "/packages/rendering/src/contracts/frameGraph.js";

interface SoftDepthResult {
  readonly status: "ready" | "error";
  readonly alphaAt1_9?: number;
  readonly alphaAt2_1?: number;
  readonly depthValue?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_SOFT_DEPTH__?: SoftDepthResult;
  }
}

const W = 16;
const H = 16;
const NEAR = 0.1;
const FAR = 10;
const PLANE_VIEWZ = 2;
const SOFT_DISTANCE = 0.35;

// Non-linear buffer depth for viewZ under the perspective formula used by
// a3dSceneViewZ: viewZ = n*f / (f - d*(f-n)) → d = (f - n*f/viewZ) / (f-n).
const depthForViewZ = (viewZ: number) => (FAR - (NEAR * FAR) / viewZ) / (FAR - NEAR);

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function fillDepth(device: LeanWebGL2Device, target: ReturnType<LeanWebGL2Device["createRenderTarget"]>, depth: number): void {
  const vertexBuffer = device.createBuffer(
    "vertex",
    9 * 4,
    new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0])
  );
  const shader = device.createShaderProgram({
    label: "prd07-depth-fill",
    vertex: `in vec3 position;
void main() { gl_Position = vec4(position, 1.0); }`,
    fragment: `uniform float u_d;
out vec4 outColor;
void main() { gl_FragDepth = u_d; outColor = vec4(1.0); }`
  });
  device.setRenderTarget(target);
  device.beginFrame(W, H);
  device.clear([0, 0, 0, 1]);
  device.draw({
    label: "prd07-depth-fill",
    topology: "triangles",
    vertexBuffer,
    vertexFormat: VertexFormat.P3,
    vertexCount: 3,
    shader,
    uniforms: new Map([["u_d", depth]]),
    renderState: { depthTest: true, depthWrite: true }
  });
  device.endFrame();
  device.presentRenderTarget?.(target);
}

function particleAt(device: LeanWebGL2Device, pass: ParticleBatchPass, viewZ: number): void {
  const atlas = new Texture({ width: 1, height: 1, label: "a3d-soft-dot", data: new Uint8Array([255, 255, 255, 255]) });
  const handle = pass.upsertBatch({
    key: `soft-${viewZ}`,
    capacity: 4,
    source: "cpu",
    atlas,
    blend: "premultiplied",
    shading: "unlit",
    softDepth: true,
    softDistance: SOFT_DISTANCE,
    stretch: false,
    frameBlend: false
  });
  const instance = new Float32Array(PARTICLE_INSTANCE_FLOATS);
  instance.set([0, 0, -viewZ, 4], 0); // a_posSize: at origin, viewZ deep, size 4 world units
  instance.set([1, 1, 1, 1], 8); // a_color: white, alpha 1
  instance.set([0, 0, 0.5, 0], 12); // a_rotFrameMisc
  pass.writeInstances(handle, instance, 1);
}

function drawOnce(device: LeanWebGL2Device, pass: ParticleBatchPass, sceneDepthTexture: Texture, target: ReturnType<LeanWebGL2Device["createRenderTarget"]>): number {
  const ctx = {
    device,
    width: W,
    height: H,
    frameIndex: 0,
    timeSeconds: 0,
    camera: {
      viewMatrix: IDENTITY,
      projectionMatrix: IDENTITY,
      viewProjectionMatrix: IDENTITY,
      previousViewProjectionMatrix: null,
      near: NEAR,
      far: FAR,
      projection: "perspective",
      position: [0, 0, 0]
    },
    source: { id: "prd07-soft-depth-harness" },
    items: [],
    tier: {},
    flags: {},
    sceneDepth: { texture: sceneDepthTexture, linearize: { near: NEAR, far: FAR, orthographic: false }, available: true },
    blackboard: new Map<string, unknown>()
  } as unknown as FrameContributorContext;

  device.setRenderTarget(target);
  device.beginFrame(W, H);
  device.clear([0, 0, 0, 0]);
  for (const item of pass.transparentItems(ctx)) item.draw(ctx);
  // Centre pixel: the procedural soft-dot peaks at the billboard centre, so
  // its alpha is fade·1·base — the depth-gap term alone.
  const pixel = Array.from(device.readPixels(W >> 1, H >> 1, 1, 1));
  device.endFrame();
  return (pixel[3] ?? 0) / 255;
}

function main(): void {
  const canvas = document.getElementById("glstage") as HTMLCanvasElement;
  let device: LeanWebGL2Device;
  try {
    device = LeanWebGL2Device.create({ canvas, alpha: false, preserveDrawingBuffer: true });
  } catch (error) {
    window.__QR_PRD07_SOFT_DEPTH__ = { status: "error", error: String(error) };
    return;
  }
  try {
    const planeRt = device.createRenderTarget({ width: W, height: H, label: "prd07-plane-depth", format: "rgba8", depth: "texture" });
    const depthValue = depthForViewZ(PLANE_VIEWZ);
    fillDepth(device, planeRt, depthValue);
    if (!planeRt.depthTexture) throw new Error("depth texture missing");

    const outRt = device.createRenderTarget({ width: W, height: H, label: "prd07-soft-out", format: "rgba8", depth: "texture" });

    const passNear = new ParticleBatchPass(device);
    particleAt(device, passNear, 1.9);
    const alphaAt1_9 = drawOnce(device, passNear, planeRt.depthTexture, outRt);

    const passFar = new ParticleBatchPass(device);
    particleAt(device, passFar, 2.1);
    const alphaAt2_1 = drawOnce(device, passFar, planeRt.depthTexture, outRt);

    window.__QR_PRD07_SOFT_DEPTH__ = { status: "ready", alphaAt1_9, alphaAt2_1, depthValue };
  } catch (error) {
    window.__QR_PRD07_SOFT_DEPTH__ = { status: "error", error: String(error) };
  }
}

main();
