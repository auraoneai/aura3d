/**
 * Cross-browser fixture and evidence contract. The GLB below is an original,
 * deterministic three-vertex triangle authored for Aura3D and licensed MIT.
 * The module has no DOM side effects when imported by a source test.
 */

import type { AuraWorkerEndpoint, AuraWorkerRenderer, AuraWorkerRequest, AuraWorkerResponse } from "@aura3d/engine/worker";

export type NativeBrowserEvidenceKind = "automation" | "software" | "experimental" | "retail" | "injected" | "physical";
export type NativeBrowserDeviceClass = "unverified" | "software" | "emulated" | "injected" | "physical";
export type NativeBrowserScenarioName = "rendering" | "dom" | "input" | "asset" | "worker" | "lifecycle";
export type NativeBrowserScenarioStatus = "passed" | "failed" | "unsupported" | "skipped";

export interface NativeBrowserScenario {
  name: NativeBrowserScenarioName;
  status: NativeBrowserScenarioStatus;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface NativeBrowserEvidence {
  schema: "aura3d.native-browser/1";
  project: string;
  evidenceKind: NativeBrowserEvidenceKind;
  deviceClass: NativeBrowserDeviceClass;
  physicalProvenance?: { deviceId: string; observedBy: string; observation: string };
  browser: { distribution: string; executableVersion: string };
  os: { name: string; version: string; architecture: string; kernel?: string; versionUnavailableReason?: string };
  backend: string;
  adapter: { value?: string; unavailableReason?: string };
  driver: { value?: string; unavailableReason?: string };
  /** Aura3D-specified launch arguments; does not include Playwright's implicit defaults. */
  featureFlags: string[];
  browserLaunchArguments: { value?: string[]; unavailableReason?: string };
  fixture: { id: string; sha256: string; license: string; byteLength: number };
  scenarios: NativeBrowserScenario[];
}

export const NATIVE_BROWSER_SCENARIOS: NativeBrowserScenarioName[] = ["rendering", "dom", "input", "asset", "worker", "lifecycle"];
export const NATIVE_BROWSER_FIXTURE_ID = "aura3d-independent-triangle-glb-v1";
export const NATIVE_BROWSER_FIXTURE_LICENSE = "MIT; independently authored for Aura3D";
// Pinned below to the exact output of createNativeBrowserFixture(), not supplied
// by the browser under test. A changed byte must be reviewed as a new fixture.
export const NATIVE_BROWSER_FIXTURE_SHA256 = "6fc803586c0846a10398500358c2587a7d5f3ef2a1e77a74dd4b1b89f0df7f7f";
export const NATIVE_BROWSER_FIXTURE_URL = "/__aura3d_native_matrix__/triangle.glb";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : undefined;
}

function meaningful(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/^(?:unknown|n\/?a|undefined|null)$/i.test(value.trim());
}

/** Validate untrusted transported evidence without opening a browser or device. */
export function validateNativeBrowserEvidence(value: unknown): string[] {
  const errors: string[] = [];
  const evidence = record(value);
  if (!evidence) return ["Evidence must be an object."];
  if (evidence.schema !== "aura3d.native-browser/1") errors.push("Invalid evidence schema.");
  if (!meaningful(evidence.project)) errors.push("Project is required.");
  const kinds = ["automation", "software", "experimental", "retail", "injected", "physical"];
  const classes = ["unverified", "software", "emulated", "injected", "physical"];
  if (!kinds.includes(String(evidence.evidenceKind))) errors.push("Invalid evidence kind.");
  if (!classes.includes(String(evidence.deviceClass))) errors.push("Invalid device class.");

  const browser = record(evidence.browser);
  if (!meaningful(browser?.distribution)) errors.push("Browser distribution is required.");
  if (!meaningful(browser?.executableVersion) || !/\d/.test(browser.executableVersion) || /\b(?:unavailable|unknown|not available)\b/i.test(browser.executableVersion)) {
    errors.push("Browser executable version is required.");
  }
  const os = record(evidence.os);
  if (!meaningful(os?.name) || !meaningful(os?.version) || !meaningful(os?.architecture)) errors.push("Operating system name, version and architecture are required.");
  if (typeof os?.version === "string" && /^unavailable/i.test(os.version) && !meaningful(os.versionUnavailableReason)) {
    errors.push("An unavailable operating system version requires a reason.");
  }
  if (!meaningful(evidence.backend)) errors.push("Backend is required.");
  for (const field of ["adapter", "driver"] as const) {
    const item = record(evidence[field]);
    if (!meaningful(item?.value) && !meaningful(item?.unavailableReason)) errors.push(`${field} requires a value or an unavailability reason.`);
  }
  if (!Array.isArray(evidence.featureFlags) || evidence.featureFlags.some((flag) => !meaningful(flag))) {
    errors.push("Feature flags must list nonblank custom launch arguments; an empty array means none were configured.");
  }
  const args = record(evidence.browserLaunchArguments);
  if ((!Array.isArray(args?.value) || args.value.some((flag) => !meaningful(flag))) && !meaningful(args?.unavailableReason)) {
    errors.push("Effective browser launch arguments require values or an unavailability reason.");
  }
  const fixture = record(evidence.fixture);
  if (!meaningful(fixture?.id) || !meaningful(fixture?.license) || !Number.isSafeInteger(fixture?.byteLength) || Number(fixture?.byteLength) <= 0) {
    errors.push("Fixture id, license and positive byte length are required.");
  }
  if (typeof fixture?.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(fixture.sha256)) errors.push("Fixture SHA-256 must be 64 hexadecimal characters.");

  const project = typeof evidence.project === "string" ? evidence.project : "";
  const physical = evidence.deviceClass === "physical" || evidence.evidenceKind === "physical";
  if (physical) {
    const provenance = record(evidence.physicalProvenance);
    if (evidence.deviceClass !== "physical" || evidence.evidenceKind !== "physical") errors.push("Physical device class and physical evidence kind must both be explicit.");
    if (/automation|headless|software|experimental|injected|emulat/i.test(project) || (typeof browser?.distribution === "string" && /playwright|headless|automation/i.test(browser.distribution))) {
      errors.push("An automation, headless, software, experimental or injected run cannot claim physical hardware.");
    }
    if (!meaningful(provenance?.deviceId) || !meaningful(provenance?.observedBy) || !meaningful(provenance?.observation)) errors.push("Physical provenance requires a device id, observer and on-device observation.");
    const adapter = record(evidence.adapter);
    const driver = record(evidence.driver);
    const labels = [project, browser?.distribution, os?.name, adapter?.value, driver?.value, provenance?.deviceId, provenance?.observation,
      ...(Array.isArray(evidence.featureFlags) ? evidence.featureFlags : []),
      ...(Array.isArray(args?.value) ? args.value : [])].filter((item): item is string => typeof item === "string").join(" ");
    if (/swiftshader|llvmpipe|softpipe|software raster|software render|emulat|simulator|injected/i.test(labels)) {
      errors.push("Software, emulated or injected evidence cannot be labeled physical hardware.");
    }
  }

  if (!Array.isArray(evidence.scenarios)) {
    errors.push("Scenario results are required.");
  } else {
    const seen = new Set<string>();
    for (const entry of evidence.scenarios) {
      const scenario = record(entry);
      const name = scenario?.name;
      if (typeof name !== "string" || !NATIVE_BROWSER_SCENARIOS.includes(name as NativeBrowserScenarioName)) {
        errors.push("Unknown scenario result.");
        continue;
      }
      if (seen.has(name)) errors.push(`Duplicate scenario: ${name}.`);
      seen.add(name);
      if (!["passed", "failed", "unsupported", "skipped"].includes(String(scenario?.status))) {
        errors.push(`Invalid status for scenario ${name}.`);
      } else if (scenario?.status !== "passed" && (!meaningful(scenario?.reason) || /^(?:not[ -]?run|skipped|unsupported|failed|unavailable|not available)$/i.test(scenario.reason.trim()))) {
        errors.push(`Scenario ${name} requires a specific reason for ${String(scenario?.status)}.`);
      }
    }
    for (const name of NATIVE_BROWSER_SCENARIOS) if (!seen.has(name)) errors.push(`Missing scenario: ${name}.`);
  }
  return errors;
}

/** A self-contained, glTF 2.0 GLB; no downloaded fixture or codec is needed. */
export function createNativeBrowserFixture(): Uint8Array {
  const bin = new Uint8Array(80);
  const view = new DataView(bin.buffer);
  const positions = [-0.75, -0.75, 0, 0.75, -0.75, 0, 0, 0.75, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  positions.forEach((value, index) => view.setFloat32(index * 4, value, true));
  normals.forEach((value, index) => view.setFloat32(36 + index * 4, value, true));
  [0, 1, 2].forEach((value, index) => view.setUint16(72 + index * 2, value, true));
  const json = {
    asset: { version: "2.0", generator: NATIVE_BROWSER_FIXTURE_ID },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.2, 0.8, 0.3, 1], metallicFactor: 0, roughnessFactor: 1 }, emissiveFactor: [0.1, 0.4, 0.1] }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }, { buffer: 0, byteOffset: 36, byteLength: 36, target: 34962 }, { buffer: 0, byteOffset: 72, byteLength: 6, target: 34963 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.75, -0.75, 0], max: [0.75, 0.75, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }]
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = (encoded.byteLength + 3) & ~3;
  const output = new Uint8Array(12 + 8 + jsonLength + 8 + bin.byteLength);
  const header = new DataView(output.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, output.byteLength, true);
  header.setUint32(12, jsonLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(encoded, 20);
  header.setUint32(20 + jsonLength, bin.byteLength, true);
  header.setUint32(24 + jsonLength, 0x004e4942, true);
  output.set(bin, 28 + jsonLength);
  return output;
}

interface HarnessObservation {
  backend: string;
  graphicsVersion: string;
  adapter: NativeBrowserEvidence["adapter"];
  driver: NativeBrowserEvidence["driver"];
  drawCalls: number;
  foregroundPixels: number;
  importedAsset: boolean;
  errors: string[];
}

export interface NativeCrossBrowserHarness {
  canvas: HTMLCanvasElement;
  observe(): Promise<HarnessObservation>;
  sampleInput(): { keyDown: boolean; pointerDown: boolean; orbitBefore: number; orbitAfter: number };
  dispose(): Promise<{ canvasDetached: boolean; controlsDisposed: boolean; inputDetached: boolean; appRejectedAfterDispose: boolean }>;
}

/** Mount the public typed-asset, app, input and controls paths in a real document. */
export async function mountNativeCrossBrowserHarness(): Promise<NativeCrossBrowserHarness> {
  const [{ createAuraApp, defineModelAssets, model, scene, camera, lights }, { InputSystem }, { OrbitControls }] = await Promise.all([
    import("@aura3d/engine"), import("@aura3d/input"), import("@aura3d/controls")
  ]);
  const host = document.createElement("main");
  host.id = "native-cross-browser-host";
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  canvas.tabIndex = 0;
  host.append(canvas);
  document.body.replaceChildren(host);
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
  if (!gl) {
    host.remove();
    throw new Error("WebGL2 context unavailable for the public renderer workload");
  }
  const fixture = defineModelAssets({ triangle: {
    url: NATIVE_BROWSER_FIXTURE_URL, sha256: NATIVE_BROWSER_FIXTURE_SHA256,
    sizeBytes: createNativeBrowserFixture().byteLength, license: NATIVE_BROWSER_FIXTURE_LICENSE
  } }, { enabled: true });
  const app = createAuraApp(canvas, {
    autoStart: false, resize: false, pixelRatio: 1, preserveDrawingBuffer: true, strict: true,
    renderer: { qualityProfile: "production" },
    scene: scene().background("#05070b")
      .camera(camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 45 }))
      .add(model(fixture.refs.triangle, { name: "triangle" }).runtime({ id: "triangle" }))
      .add(lights.directional({ intensity: 3 }).position(1, 2, 3))
  });
  const input = new InputSystem(canvas);
  const controlCamera = { position: { x: 0, y: 0, z: 3 }, lookAt() {} };
  const controls = new OrbitControls(controlCamera);
  let disposed = false;

  try {
    await app.readyStrict();
  } catch (error) {
    input.dispose();
    controls.dispose();
    app.dispose();
    host.remove();
    throw error;
  }

  return {
    canvas,
    async observe() {
      let importedAsset = false;
      const deadline = performance.now() + 15_000;
      do {
        await app.stepAsync(1 / 60);
        importedAsset = Boolean(app.nodes.require("triangle").snapshot().importedAssetEvidence);
        if (importedAsset && app.diagnostics().drawCalls > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 40));
      } while (performance.now() < deadline);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const background = [pixels[0], pixels[1], pixels[2]];
      let foregroundPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const delta = Math.abs(pixels[index] - background[0]) + Math.abs(pixels[index + 1] - background[1]) + Math.abs(pixels[index + 2] - background[2]);
        if (delta > 40 && pixels[index + 3] > 0) foregroundPixels += 1;
      }
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "") : "";
      const diagnostics = app.diagnostics();
      return {
        backend: /^WebGL 2/.test(String(gl.getParameter(gl.VERSION))) ? "webgl2" : "unavailable",
        graphicsVersion: String(gl.getParameter(gl.VERSION)),
        adapter: meaningful(renderer) ? { value: renderer } : { unavailableReason: "Browser did not expose an unmasked adapter identity." },
        driver: { unavailableReason: "WebGL does not expose a separately identifiable driver version." },
        drawCalls: diagnostics.drawCalls, foregroundPixels, importedAsset,
        errors: [...diagnostics.errors]
      };
    },
    sampleInput() {
      const snapshot = input.update();
      const orbitBefore = controls.getAzimuthalAngle();
      controls.applyInput(snapshot);
      const orbitAfter = controls.getAzimuthalAngle();
      input.endFrame();
      return { keyDown: snapshot.key("KeyA").down, pointerDown: snapshot.button(0).down, orbitBefore, orbitAfter };
    },
    async dispose() {
      if (!disposed) {
        input.dispose();
        controls.dispose();
        app.dispose();
        host.remove();
        disposed = true;
      }
      canvas.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", bubbles: true }));
      const appRejectedAfterDispose = await app.stepAsync(1 / 60).then(() => false, () => true);
      return { canvasDetached: !canvas.isConnected, controlsDisposed: controls.isDisposed, inputDetached: !input.update().key("KeyA").down, appRejectedAfterDispose };
    }
  };
}

async function deadline<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${operation} timed out`)), ms); })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Run the actual public worker renderer with a same-origin module worker. */
export async function runNativeWorkerScenario(): Promise<NativeBrowserScenario> {
  const engine = await import("@aura3d/engine");
  const api = await import("@aura3d/engine/worker");
  if (typeof api.supportsWorkerRendering !== "function" || typeof api.createWorkerRenderer !== "function" || typeof api.installWorkerRenderer !== "function") {
    throw new Error("The public Aura3D worker renderer entrypoints are unavailable.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 128;
  document.body.append(canvas);
  if (!api.supportsWorkerRendering(canvas)) {
    canvas.remove();
    return { name: "worker", status: "unsupported", reason: "OffscreenCanvas transfer is unavailable; the documented main-thread fallback must be used." };
  }
  const workerUrl = new URL("/tests/browser/native-cross-browser-harness.ts?native-worker=1", location.origin);
  let worker: Worker;
  try {
    worker = new Worker(workerUrl, { type: "module", name: "aura3d-native-matrix" });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  let renderer: AuraWorkerRenderer | undefined;
  try {
    await deadline(new Promise<void>((resolve, reject) => {
      const ready = (event: MessageEvent): void => {
        if (event.data?.type !== "native-matrix-worker-ready") return;
        worker.removeEventListener("message", ready);
        worker.removeEventListener("error", failed);
        resolve();
      };
      const failed = (): void => {
        worker.removeEventListener("message", ready);
        worker.removeEventListener("error", failed);
        reject(new Error("Same-origin worker module failed to load."));
      };
      worker.addEventListener("message", ready);
      worker.addEventListener("error", failed);
    }), 15_000, "Worker entrypoint");
    const snapshot = engine.scene().background("#05070b")
      .camera(engine.camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 45 }))
      .add(engine.primitives.box({ material: engine.material.pbr({ color: "#62b779" }) }))
      .add(engine.lights.directional({ intensity: 3 }).position(1, 2, 3)).toJSON();
    renderer = api.createWorkerRenderer({ canvas, worker, scene: snapshot, autoStart: false, bridgeEvents: false, size: { width: 192, height: 128, pixelRatio: 1 } });
    await deadline(renderer.ready, 20_000, "Worker renderer readiness");
    await renderer.resize({ width: 160, height: 96, pixelRatio: 1 });
    await renderer.setInput({ pointers: [], keys: ["KeyA"], timestamp: 1 });
    const frame = await deadline(renderer.step(1 / 60), 10_000, "Worker frame");
    if (!meaningful(frame.backend) || frame.drawCalls <= 0 || frame.width !== 160 || frame.height !== 96) {
      throw new Error(`Worker frame did not render or resize: ${JSON.stringify(frame)}`);
    }
    await renderer.dispose();
    await renderer.dispose();
    return { name: "worker", status: "passed", details: { entry: workerUrl.pathname, sameOrigin: workerUrl.origin === location.origin, frame } };
  } finally {
    if (renderer) await renderer.dispose();
    else worker.terminate();
    canvas.remove();
  }
}

// A dedicated worker loads this same-origin module with an explicit query.
// Node and ordinary page imports do not install a worker runtime or touch DOM.
if (typeof window === "undefined" && typeof self !== "undefined" && new URL(self.location.href).searchParams.get("native-worker") === "1") {
  void import("@aura3d/engine/worker").then((module) => {
    if (typeof module.installWorkerRenderer !== "function") throw new Error("Aura3D worker runtime export is unavailable.");
    module.installWorkerRenderer(self as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>);
    (self as unknown as { postMessage(message: unknown): void }).postMessage({ type: "native-matrix-worker-ready" });
  });
}
