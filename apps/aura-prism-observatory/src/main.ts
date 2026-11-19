import { createAuraApp, type AuraApp, type AuraVec3 } from "@aura3d/engine";
import marketing from "../../../marketing/package.json";
import { assets } from "./aura-assets";
import { buildObservatory, cameraPosition, ringNames, target } from "./stage";

const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const status = document.querySelector<HTMLElement>(".stage-status")!;
const align = document.querySelector<HTMLButtonElement>("[data-align]")!;
const motion = document.querySelector<HTMLButtonElement>("[data-motion]")!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>(".tools button")];
const lightButtons = buttons.filter((button) => button.hasAttribute("data-light"));
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const params = new URLSearchParams(location.search);
if (params.get("chrome") === "hidden") document.documentElement.dataset.chrome = "hidden";

const runtime = {
  appId: "aura-prism-observatory", enginePackage: "@aura3d/engine", engineVersion: marketing.dependencies["@aura3d/engine"],
  asset: "Prism Observatory", assetUrl: assets.instrument.url, assetHash: assets.instrument.hash,
  status: "loading", renderer: "", frameCount: 0, drawCalls: 0, triangles: 0,
  renderWidth: 0, renderHeight: 0, fps: 0, error: "", aligned: false, alignment: 0,
  motion: !reduced.matches, light: "daybreak", camera: { yaw: 0.41, pitch: 0.245, distance: 5.85 },
  rings: [] as AuraVec3[]
};
Object.assign(window, { __a3dWowRuntime: runtime, __auraPrismObservatory: runtime });

const openAngles: readonly AuraVec3[] = [
  [0.332, -0.367, 0.122], [-0.262, 0.75, -0.419], [0.942, -0.454, 0.628]
];
function markPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute("aria-pressed", String(pressed));
}
function updateMotion(): void {
  motion.textContent = runtime.motion ? "Pause motion" : "Play motion";
  markPressed(motion, !runtime.motion);
}
function fail(error: unknown): void {
  runtime.status = "error";
  runtime.error = error instanceof Error ? error.message : String(error);
  delete document.body.dataset.sceneReady;
  status.textContent = "Showing a captured view. The live instrument could not start.";
  for (const button of buttons) button.disabled = true;
}

async function openInstrument(): Promise<void> {
  // Keep the complete instrument in frame as the right-hand viewport becomes narrow.
  function fit(): void {
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    runtime.camera.distance = 5.85 * Math.max(1, 0.89 / Math.max(0.4, aspect));
  }
  fit();
  const pose = runtime.camera;
  const app = createAuraApp(canvas, {
    scene: buildObservatory(cameraPosition(pose.yaw, pose.pitch, pose.distance)),
    renderer: { backend: "webgl2" }, pixelRatio: { max: 1.5 },
    output: { toneMapping: "aces", exposure: 0.89, dither: true },
    diagnostics: false
  });
  const rings = ringNames.map((name) => app.nodes.require(name));
  function presentCamera(): void {
    app.camera?.setPose({ position: cameraPosition(pose.yaw, pose.pitch, pose.distance), target, fov: 36 });
  }
  const resize = new ResizeObserver(() => { fit(); presentCamera(); });
  resize.observe(canvas);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) { resize.disconnect(); app.dispose(); }
  });
  function orbit(x: number, y: number): void {
    pose.yaw += x;
    pose.pitch = Math.max(0.025, Math.min(1.12, pose.pitch + y));
    presentCamera();
  }
  let pointer: { id: number; x: number; y: number } | undefined;
  canvas.addEventListener("pointerdown", (event) => {
    if (pointer || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    orbit((pointer.x - event.clientX) * 0.007, (event.clientY - pointer.y) * 0.005);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (pointer?.id === event.pointerId) pointer = undefined;
  });
  const arrows: Record<string, readonly [number, number]> = {
    ArrowLeft: [-0.14, 0], ArrowRight: [0.14, 0], ArrowUp: [0, 0.09], ArrowDown: [0, -0.09]
  };
  canvas.addEventListener("keydown", (event) => {
    const delta = arrows[event.key];
    if (delta) { event.preventDefault(); orbit(...delta); }
  });
  align.addEventListener("click", () => {
    runtime.aligned = !runtime.aligned;
    markPressed(align, runtime.aligned);
    align.textContent = runtime.aligned ? "Open sights" : "Align sights";
  });
  motion.addEventListener("click", () => { runtime.motion = !runtime.motion; updateMotion(); });
  reduced.addEventListener("change", () => { runtime.motion = !reduced.matches; updateMotion(); });
  updateMotion();
  for (const button of lightButtons) {
    button.addEventListener("click", () => {
      const moon = button.dataset.light === "moonrise";
      runtime.light = moon ? "moonrise" : "daybreak";
      const blend = { transitionSeconds: reduced.matches ? 0 : 0.5 };
      app.nodes.require("key").setLight?.({ color: moon ? "#9ecdfb" : "#ffddb0", intensity: moon ? 1.25 : 1.85,
        position: moon ? [-3, 3, -1] : [-4.2, 4.5, 2.4] }, blend);
      app.nodes.require("rim").setLight?.({ color: moon ? "#9bffee" : "#78d8d9", intensity: moon ? 1.9 : 1.45,
        position: moon ? [2.8, 2.4, 2.7] : [3, 2.5, -2.8] }, blend);
      for (const option of lightButtons) markPressed(option, option === button);
    });
  }
  let phase = 0;
  let publishedAt = -Infinity;
  let firstDraw = false;
  function updateEvidence(clock: number, app: AuraApp): void {
    if (!firstDraw || clock - publishedAt < 0.15) return;
    publishedAt = clock;
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length) { fail(diagnostics.errors.join(" · ")); return; }
    if (diagnostics.drawCalls <= 0 || !diagnostics.assets.some((asset) => asset.url === assets.instrument.url && asset.status === "ready")) return;
    runtime.renderer = `a3d-${diagnostics.backend}`;
    runtime.drawCalls = diagnostics.drawCalls;
    runtime.triangles = diagnostics.triangles ?? 0;
    runtime.fps = diagnostics.fps;
    [runtime.renderWidth, runtime.renderHeight] = diagnostics.renderSize;
    if (runtime.status === "loading") {
      runtime.status = "running";
      document.body.dataset.sceneReady = "true";
      status.textContent = "";
      for (const button of buttons) button.disabled = false;
    }
  }
  app.onFrame(({ dt, time, frame }) => {
    runtime.frameCount = frame;
    if (runtime.motion && !runtime.aligned) phase += Math.min(dt, 0.1) * 0.27;
    const goal = runtime.aligned ? 1 : 0;
    runtime.alignment += (goal - runtime.alignment) * (reduced.matches ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 6));
    const open = 1 - runtime.alignment;
    const angles = openAngles.map(([x, y, z], i): AuraVec3 => [
      (x + 0.14 * Math.sin(phase * (i + 1))) * open, (y + 0.26 * Math.sin(phase * (0.65 + i * 0.27))) * open, z * open
    ]);
    angles.forEach((rotation, i) => rings[i].setRotation(...rotation));
    runtime.rings = angles;
    updateEvidence(time, app);
  });
  app.onDeviceLost(() => fail("Graphics device lost."));
  app.onDeviceRestored(() => { runtime.status = "loading"; runtime.error = ""; });
  await app.readyStrict({ stage: "first-frame" });
  firstDraw = true;
  updateEvidence(0, app);
}
void openInstrument().catch(fail);
