import { MapControls, OrbitControls } from "@aura3d/controls";
import { InputSystem } from "@aura3d/input";
import { Matrix4, Vector3 } from "@aura3d/math";
import { Geometry, Renderer, UnlitMaterial } from "@aura3d/rendering";

// Test-only rendering-package harness: the controls own the attached camera;
// the renderer consumes that camera's projection and view, never a CSS proxy.
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
canvas.oncontextmenu = event => event.preventDefault();
const query = new URLSearchParams(location.search);
const ortho = query.get("camera") === "orthographic";
const target = { x: 0, y: 0, z: 0 };
const camera = {
  position: { x: 0, y: 0, z: 10 }, fov: 60, aspect: 1,
  isOrthographicCamera: ortho, left: -4, right: 4, top: 4, bottom: -4, zoom: 1,
  lookAt(value: { x: number; y: number; z: number }) { Object.assign(target, value); },
  updateProjectionMatrix() {}
};
const Control = query.get("control") === "map" ? MapControls : OrbitControls;
const controls = new Control(camera, {
  maxPolar: Math.PI - 0.001, enableDamping: true, dampingFactor: 0.12, zoomToCursor: true,
  viewport: () => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; },
  panBounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }
});
const input = new InputSystem(canvas);
let frame = 0;
let previous = performance.now();
let renderer: Awaited<ReturnType<typeof Renderer.create>>;
const geometry = Geometry.cube(0.4);
const material = new UnlitMaterial({ color: [1, 0.05, 0.03, 1] });
const anchor = Matrix4.translation(new Vector3(ortho ? 1.2 : Math.tan(Math.PI / 6) * 3, 0, 0));

function draw(): void {
  const p = ortho
    ? Matrix4.orthographic(-4 / camera.zoom, 4 / camera.zoom, -4 / camera.zoom, 4 / camera.zoom, 0.1, 100)
    : Matrix4.perspective(Math.PI / 3, 1, 0.1, 100);
  const view = Matrix4.lookAt(new Vector3(camera.position.x, camera.position.y, camera.position.z),
    new Vector3(target.x, target.y, target.z), new Vector3(0, 1, 0));
  renderer.render({ cameraPolicy: "identity", renderItems: [{
    geometry, material, modelViewProjectionMatrix: new Float32Array(p.multiply(view).multiply(anchor).elements)
  }] });
}

function sample() {
  draw();
  const pixels = renderer.device.readPixels(0, 0, 256, 256);
  let count = 0, x = 0, y = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 120 && pixels[i + 1]! < 80) {
    count++; x += (i / 4) % 256; y += Math.floor(i / 4 / 256);
  }
  return { position: [camera.position.x, camera.position.y, camera.position.z],
    target: [target.x, target.y, target.z], zoom: camera.zoom, distance: controls.getDistance(),
    azimuth: controls.getAzimuthalAngle(), count, centroid: [x / count, y / count],
    pixels: Array.from(pixels), disposed: controls.isDisposed };
}

async function start() {
  renderer = await Renderer.create({ canvas, width: 256, height: 256, backend: "webgl2",
    preserveDrawingBuffer: true, clearColor: [0.02, 0.03, 0.05, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback"], errorCheckMode: "strict" });
  const tick = (now: number) => {
    controls.applyInput(input.update(), Math.max(0.000001, (now - previous) / 1000));
    previous = now; input.endFrame(); draw(); frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  (window as unknown as Record<string, unknown>).__orbit301 = {
    sample, reset() { controls.reset(); },
    dispose() { controls.dispose(); },
    cleanup() { cancelAnimationFrame(frame); controls.dispose(); input.dispose(); canvas.oncontextmenu = null; geometry.dispose(); material.dispose(); renderer.dispose(); }
  };
}
void start().catch(error => { throw error; });
