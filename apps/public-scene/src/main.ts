import { G3DAppLifecycle, G3DRenderer, G3DScene, Geometry, PBRMaterial, UnlitMaterial } from "@galileo3d/engine/advanced-runtime";
import type { Quat, Vec3 } from "@galileo3d/scene";

const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
const statusEl = document.querySelector<HTMLElement>("#status");
const objectsEl = document.querySelector<HTMLElement>("#objects");
const drawCallsEl = document.querySelector<HTMLElement>("#draw-calls");
const firstFrameEl = document.querySelector<HTMLElement>("#first-frame");

if (!canvas || !statusEl || !objectsEl || !drawCallsEl || !firstFrameEl) {
  throw new Error("V9 public scene route is missing required DOM nodes.");
}

const startedAt = performance.now();
const lifecycle = new G3DAppLifecycle();
const scene = new G3DScene();
lifecycle.addDisposable(scene);

const floor = scene.createRenderableMesh({
  name: "floor",
  geometryId: "floor",
  geometry: Geometry.litCube(1),
  materialId: "mat-floor",
  material: new PBRMaterial({
    name: "mat-floor",
    baseColor: [0.72, 0.76, 0.8, 1],
    roughness: 0.62,
    metallic: 0.05
  })
});
floor.transform.setPosition(0, -0.72, -2.2);
floor.transform.setScale(3.8, 0.08, 2.8);

const subject = scene.createRenderableMesh({
  name: "subject",
  geometryId: "subject",
  geometry: Geometry.litCube(0.78),
  materialId: "mat-subject",
  material: new PBRMaterial({
    name: "mat-subject",
    baseColor: [0.88, 0.48, 0.24, 1],
    roughness: 0.38,
    metallic: 0.18
  })
});
subject.transform.setPosition(-0.45, -0.08, -2.2);

const marker = scene.createRenderableMesh({
  name: "marker",
  geometryId: "marker",
  geometry: Geometry.litCube(0.28),
  materialId: "mat-marker",
  material: new UnlitMaterial({ name: "mat-marker", color: [0.45, 0.86, 0.95, 1] })
});
marker.transform.setPosition(0.55, 0.08, -2.0);

const renderer = await G3DRenderer.create({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  clearColor: [0.07, 0.08, 0.1, 1]
});
lifecycle.addDisposable(renderer);

let firstFrame = true;
let lastTime = performance.now();

function resize(): void {
  renderer.resizeToDisplay({
    cssWidth: window.innerWidth,
    cssHeight: window.innerHeight,
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2)
  });
}

function frame(time: number): void {
  if (lifecycle.snapshot().disposed) return;
  resize();
  const deltaSeconds = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  const spin = quatFromAxisAngle([0, 1, 0], deltaSeconds * 0.72);
  const tilt = quatFromAxisAngle([1, 0, 0], deltaSeconds * 0.16);
  subject.transform.setRotation(...multiplyQuat(spin, subject.quaternion));
  marker.transform.setRotation(...multiplyQuat(tilt, marker.quaternion));
  const diagnostics = renderer.render(scene);
  Object.assign(window, {
    __G3D_V9_PUBLIC_SCENE__: {
      running: true,
      disposed: false,
      width: canvas.width,
      height: canvas.height,
      visibleObjects: diagnostics.visibleObjects ?? 0,
      drawCalls: diagnostics.drawCalls,
      lifecycle: lifecycle.snapshot()
    }
  });
  statusEl.textContent = "Running";
  objectsEl.textContent = String(diagnostics.visibleObjects ?? 0);
  drawCallsEl.textContent = String(diagnostics.drawCalls);
  if (firstFrame) {
    firstFrame = false;
    firstFrameEl.textContent = `${(performance.now() - startedAt).toFixed(1)}ms`;
  }
  lifecycle.requestAnimationFrame(frame);
}

lifecycle.addEventListener(window, "resize", resize);
lifecycle.addEventListener(window, "pagehide", () => {
  lifecycle.dispose();
  publishDisposedRuntime();
}, { once: true });
lifecycle.addEventListener(window, "beforeunload", () => {
  lifecycle.dispose();
  publishDisposedRuntime();
}, { once: true });
lifecycle.addEventListener(window, "g3d:public-scene-dispose", () => {
  lifecycle.dispose();
  publishDisposedRuntime();
});

const hot = (import.meta as ImportMeta & { readonly hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(() => {
  lifecycle.dispose();
  publishDisposedRuntime();
});

lifecycle.requestAnimationFrame(frame);

function publishDisposedRuntime(): void {
  const diagnostics = renderer.getDiagnostics();
  Object.assign(window, {
    __G3D_V9_PUBLIC_SCENE__: {
      running: false,
      disposed: true,
      width: canvas.width,
      height: canvas.height,
      visibleObjects: diagnostics.visibleObjects ?? 0,
      drawCalls: diagnostics.drawCalls,
      buffers: diagnostics.buffers,
      shaders: diagnostics.shaders,
      textures: diagnostics.textures,
      renderTargets: diagnostics.renderTargets,
      approximateGpuMemoryBytes: diagnostics.approximateGpuMemoryBytes,
      lifecycle: lifecycle.snapshot()
    }
  });
  statusEl.textContent = "Disposed";
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle * 0.5;
  const scale = Math.sin(half);
  return [axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(half)];
}

function multiplyQuat(a: Quat, b: Quat): Quat {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}
