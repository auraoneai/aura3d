import { createAuraApp } from "@aura3d/engine";
import marketing from "../../../marketing/package.json";
import { assets } from "./aura-assets";
import { buildStudio, eye, fov, lightSetups, views } from "./stage";

type View = keyof typeof views;
type Light = keyof typeof lightSetups;
const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const statusLine = document.querySelector<HTMLElement>("#status")!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
const camera = { view: "body" as View, ...views.body, distance: 7 };
const state = {
  appId: "vesper-gt", enginePackage: "@aura3d/engine", engineVersion: marketing.dependencies["@aura3d/engine"],
  camera, light: "daylight" as Light, frameCount: 0, drawCalls: 0, triangles: 0, renderer: "",
  assetUrl: assets.coupe.url, assetHash: assets.coupe.hash, status: "loading", error: ""
};
Object.assign(window, { __auraShowcase: state });
if (new URLSearchParams(location.search).get("chrome") === "hidden") document.documentElement.dataset.chrome = "hidden";

function showRetry(message: string) {
  const retry = document.createElement("a");
  retry.href = location.href;
  retry.textContent = "Reload studio";
  retry.addEventListener("click", event => {
    event.preventDefault();
    location.reload();
  });
  statusLine.replaceChildren(message + " ", retry);
}

function watchOpening() {
  return window.setTimeout(() => {
    if (state.status === "loading") {
      state.status = "waiting";
      showRetry("The interactive view is taking longer to load.");
    }
  }, 15_000);
}

let openingTimer = watchOpening();

function fail(error: unknown) {
  clearTimeout(openingTimer);
  state.error = error instanceof Error ? error.message : String(error);
  state.status = "error";
  delete document.body.dataset.sceneReady;
  showRetry("The interactive view could not open.");
  buttons.forEach(button => { button.disabled = true; });
}

async function openStudio() {
  function fitDistance() {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const wheel = camera.view === "wheel";
    camera.distance = Math.max(wheel ? 1.8 : 5.7, camera.width / (2 * Math.tan(fov * Math.PI / 360) * Math.max(0.35, aspect)) + (wheel ? 0.12 : 0.65));
  }
  fitDistance();
  const app = createAuraApp(canvas, {
    scene: buildStudio(eye(camera.yaw, camera.pitch, camera.distance, camera.target)),
    renderer: { backend: "webgl2" }, pixelRatio: { max: 1.75 },
    output: { toneMapping: "aces", exposure: 1.15, dither: true },
    diagnostics: false
  });
  function positionCamera() {
    app.camera?.setPose({ position: eye(camera.yaw, camera.pitch, camera.distance, camera.target), target: camera.target, fov });
  }
  const resize = new ResizeObserver(() => { fitDistance(); positionCamera(); });
  resize.observe(canvas);
  function orbit(dx: number, dy: number) {
    camera.yaw += dx;
    camera.pitch = Math.max(0.045, Math.min(1.15, camera.pitch + dy));
    positionCamera();
  }
  let drag: { id: number; x: number; y: number } | undefined;
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag || state.status !== "running") return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId || !drag) return;
    orbit((drag.x - event.clientX) * 0.007, (event.clientY - drag.y) * 0.005);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener("lostpointercapture", () => { drag = undefined; });
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowDown: [0, -0.075], ArrowUp: [0, 0.075] };
  canvas.addEventListener("keydown", event => {
    if (state.status === "running" && arrows[event.key]) { event.preventDefault(); orbit(...arrows[event.key]); }
  });
  buttons.forEach(button => button.addEventListener("click", () => {
    const view = button.dataset.view as View | undefined;
    const light = button.dataset.light as Light | undefined;
    if (view) {
      Object.assign(camera, views[view], { view });
      fitDistance();
      positionCamera();
    }
    if (light) {
      state.light = light;
      const options = { transitionSeconds: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.35 };
      app.nodes.require("key").setLight?.(lightSetups[light].key, options);
      app.nodes.require("rim").setLight?.(lightSetups[light].rim, options);
      app.nodes.require("side").setLight?.(lightSetups[light].side, options);
    }
    for (const option of buttons) {
      option.setAttribute("aria-pressed", String(option.dataset.view === camera.view || option.dataset.light === state.light));
    }
  }));
  let firstFrame = false;
  let nextSample = 0;
  app.onFrame(({ frame, time }) => {
    state.frameCount = frame;
    if (!firstFrame || state.status === "error" || time < nextSample) return;
    nextSample = time + 0.2;
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length) { fail(diagnostics.errors.join(" · ")); return; }
    // Diagnostics redact URL queries. The manifest ID and digest identify the actual loaded coupe.
    const coupe = diagnostics.assets.find(asset => asset.id === assets.coupe.id && asset.hash === assets.coupe.hash);
    if (coupe?.status === "error") { fail(coupe.message ?? "The coupe could not load."); return; }
    if (diagnostics.drawCalls < 1 || coupe?.status !== "ready") return;
    state.renderer = diagnostics.backend;
    state.drawCalls = diagnostics.drawCalls;
    state.triangles = diagnostics.triangles ?? 0;
    if (state.status !== "running") {
      clearTimeout(openingTimer);
      state.status = "running";
      document.body.dataset.sceneReady = "true";
      statusLine.textContent = "";
      buttons.forEach(button => { button.disabled = false; });
    }
  });
  app.onDeviceLost(() => fail("Graphics device lost."));
  app.onDeviceRestored(() => {
    state.status = "loading";
    state.error = "";
    statusLine.textContent = "Restoring studio…";
    clearTimeout(openingTimer);
    openingTimer = watchOpening();
  });
  window.addEventListener("pagehide", event => {
    if (!event.persisted) { clearTimeout(openingTimer); resize.disconnect(); app.dispose(); }
  });
  await app.readyStrict({ stage: "first-frame" });
  firstFrame = true;
}
void openStudio().catch(fail);
