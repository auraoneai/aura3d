import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { NATIVE_BUNDLE_EXTERNALS } from "./native-bundle-externals";

/**
 * Run remotely after the code-complete gate. The runner supplies two separate
 * installed consumers, not workspace aliases: A3D_REACT_18_CONSUMER_DIR and
 * A3D_REACT_19_CONSUMER_DIR. Each contains the candidate's packed engine and
 * adapter, the complete installed closure, and matching React/react-dom peers.
 * This spec never installs or rebuilds those packages. Missing consumers are
 * failures so a single installed major cannot be mistaken for peer coverage.
 */
type PeerMajor = 18 | 19;
const expect = baseExpect.configure({ timeout: 60_000 });

interface Consumer {
  readonly directory: string;
  readonly reactVersion: string;
  readonly reactDomVersion: string;
  readonly adapterPackageHash: string;
  readonly enginePackageHash: string;
}

interface Snapshot {
  readonly version: string;
  readonly readyCount: number;
  readonly disposedCount: number;
  readonly failed: readonly string[];
  readonly caught: readonly { message: string; failures: readonly { id: string; message: string }[] }[];
  readonly readyProofs: readonly { backend: string; drawCalls: number; error?: string }[];
  readonly hydrationReusedCanvas: boolean;
  readonly pointer: readonly string[];
  readonly frameCount: number;
  readonly duplicateFrames: number;
  readonly livePointerListeners: number;
  readonly pendingAnimationFrames: number;
  readonly calls: Readonly<Record<string, number>>;
  readonly currentAppId: number | null;
  readonly sceneBackgrounds: readonly string[];
  /** webgl2 getContext acquisitions, counted before any app exists (includes StrictMode's discarded mount). */
  readonly contextAcquisitions: number;
  readonly glObjectsCreated: number;
  /** GL objects created and not yet deleted on contexts that are still alive. */
  readonly liveGlObjects: number;
  readonly retiredCount: number;
  readonly pendingRetirements: number;
  readonly retirementFailures: readonly string[];
  /** Preload flights whose loader signal was aborted. */
  readonly abortedFlights: readonly string[];
}

interface BrowserHarness {
  snapshot(): Snapshot;
  settleRetirements(): Promise<void>;
  update(): void;
  start(mode: "shared" | "failure" | "late"): void;
  resolve(mode: "shared" | "late"): void;
  retry(): Promise<void>;
  unmount(): void;
  remount(): void;
  dispatchDetached(): void;
}

const consumers = new Map<PeerMajor, Consumer>();

function consumerFor(major: PeerMajor): Consumer {
  const cached = consumers.get(major);
  if (cached) return cached;
  const variable = `A3D_REACT_${major}_CONSUMER_DIR`;
  const configured = process.env[variable];
  if (!configured) throw new Error(`${variable} must identify the isolated packed React ${major} consumer`);
  const directory = realpathSync(resolve(configured));
  const manifest = join(directory, "package.json");
  if (!existsSync(manifest)) throw new Error(`${variable} lacks package.json: ${directory}`);
  for (const name of ["react", "react-dom", "@aura3d/react", "@aura3d/engine"]) {
    if (!existsSync(join(directory, "node_modules", name))) {
      throw new Error(`${variable} lacks its own installed ${name}; ancestor/workspace fallback is not valid`);
    }
  }
  const requireFromConsumer = createRequire(manifest);
  const version = (name: "react" | "react-dom"): string => {
    const entry = requireFromConsumer.resolve(`${name}/package.json`);
    return (JSON.parse(readFileSync(entry, "utf8")) as { version: string }).version;
  };
  const reactVersion = version("react");
  const reactDomVersion = version("react-dom");
  if (Number(reactVersion.split(".")[0]) !== major || Number(reactDomVersion.split(".")[0]) !== major) {
    throw new Error(`${variable} expected React/react-dom ${major}, got ${reactVersion}/${reactDomVersion}`);
  }
  const hashInstalledPackage = (name: "@aura3d/react" | "@aura3d/engine"): string => {
    const packageRoot = realpathSync(join(directory, "node_modules", name));
    const workspacePackage = realpathSync(name === "@aura3d/engine" ? "." : "packages/react");
    if (packageRoot === workspacePackage) throw new Error(`${variable} links ${name} to the workspace: ${packageRoot}`);
    const digest = createHash("sha256");
    const walk = (folder: string): void => {
      for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name === "node_modules") continue;
        const path = join(folder, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink inside installed ${name}: ${path}`);
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile()) {
          digest.update(relative(packageRoot, path).split(sep).join("/"));
          digest.update("\0");
          digest.update(readFileSync(path));
          digest.update("\0");
        }
      }
    };
    walk(packageRoot);
    return digest.digest("hex");
  };
  const consumer = {
    directory,
    reactVersion,
    reactDomVersion,
    adapterPackageHash: hashInstalledPackage("@aura3d/react"),
    enginePackageHash: hashInstalledPackage("@aura3d/engine")
  };
  consumers.set(major, consumer);
  return consumer;
}

/** Independently authored, self-contained glTF 2.0 triangle; no external asset or network dependency. */
function triangleGlb(): Buffer {
  const binary = Buffer.alloc(44);
  [-0.7, -0.6, 0, 0.7, -0.6, 0, 0, 0.7, 0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 36 + index * 2));
  const document = {
    asset: { version: "2.0", generator: "Aura3D React lifecycle test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: 42 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.7, -0.6, 0], max: [0.7, 0.7, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ]
  };
  const rawJson = Buffer.from(JSON.stringify(document));
  const json = Buffer.alloc(Math.ceil(rawJson.length / 4) * 4, 0x20);
  rawJson.copy(json);
  const glb = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  const offset = 20 + json.length;
  glb.writeUInt32LE(binary.length, offset);
  glb.writeUInt32LE(0x004e4942, offset + 4);
  binary.copy(glb, offset + 8);
  return glb;
}

/** The browser tree hydrates the same public React output emitted by serverRender. */
function sharedEntry(glbHash: string): string {
  return `
import React, { StrictMode, useEffect, useState } from "react";
import { AuraCanvas, Scene, Model, Lights, useAuraFrame, resourceForDescriptors } from "@aura3d/react";
import { defineAuraAssets } from "@aura3d/engine";
const h = React.createElement;
const asset = defineAuraAssets({ triangle: {
  type: "model", format: "glb", url: "/triangle.glb", hash: "sha256-${glbHash}",
  bounds: [1.4, 1.3, 0], metadata: { license: "MIT" }
} }).triangle;
const descriptors = {
  shared: [{ id: "shared", url: "/triangle.glb" }],
  failure: [{ id: "failure", url: "/triangle.glb" }],
  late: [{ id: "late", url: "/triangle.glb" }]
};
const securityContext = {};
const calls = { shared: 0, failure: 0, late: 0 };
const pending = {};
const flightSignals = {};
const success = (name) => ({ ok: true, loaded: [name], failed: [] });
const loaders = {
  shared: (_descriptors, options) => { calls.shared++; flightSignals.shared = options?.signal; return new Promise((resolve) => { pending.shared = () => resolve(success("shared")); }); },
  failure: () => { calls.failure++; return Promise.resolve(calls.failure === 1
    ? { ok: false, loaded: [], failed: [{ id: "failure", message: "deliberate preload failure" }] }
    : success("failure")); },
  late: (_descriptors, options) => { calls.late++; flightSignals.late = options?.signal; return new Promise((resolve) => { pending.late = () => resolve(success("late")); }); }
};
class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    window.__auraReactTest.caught.push({ message: String(error.message || error), failures: error.evidence?.failed || [] });
  }
  render() { return this.state.error
    ? h("output", { id: "preload-error" }, String(this.state.error.message || this.state.error))
    : this.props.children; }
}
function FrameProbe({ revision }) {
  useAuraFrame((frame) => {
    if (frame.source !== "raf") return;
    const harness = window.__auraReactTest;
    harness.frames++;
    const tick = harness.currentAnimationTick;
    if (tick != null && tick === harness.lastFrameTick) harness.duplicateFrames++;
    harness.lastFrameTick = tick;
  });
  return h("output", { id: "probe", "data-revision": revision }, "hydrated scene");
}
function App() {
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState(window.__INITIAL_SUSPEND__ ? "shared" : null);
  const [boundaryKey, setBoundaryKey] = useState(0);
  useEffect(() => {
    const harness = window.__auraReactTest;
    harness.controls = {
      update: () => setRevision((current) => current + 1),
      start: (next) => setMode(next),
      retry: async () => {
        await resourceForDescriptors(descriptors.failure, loaders.failure, securityContext).retry();
        setBoundaryKey((current) => current + 1);
      }
    };
    return () => { harness.controls = null; };
  }, []);
  const recordReady = (app) => {
    const harness = window.__auraReactTest;
    harness.readyCount++;
    harness.hydrationReusedCanvas ||= document.querySelector("canvas") === harness.serverCanvas;
    const id = ++harness.nextAppId;
    harness.currentAppId = id;
    const dispose = app.dispose.bind(app);
    app.dispose = () => {
      harness.disposedCount++;
      if (harness.currentAppId === id) harness.currentAppId = null;
      dispose();
      // Renderer-owned GPU retirement is asynchronous; track it until it settles.
      harness.pendingRetirements++;
      const retired = typeof app.whenDisposed === "function"
        ? Promise.resolve().then(() => app.whenDisposed())
        : Promise.reject(new Error("packed AuraApp lacks whenDisposed()"));
      retired.then(
        () => { harness.pendingRetirements--; harness.retiredCount++; },
        (error) => { harness.pendingRetirements--; harness.retirementFailures.push(String(error && error.message || error)); }
      );
    };
    const setScene = app.setScene.bind(app);
    app.setScene = (scene) => { harness.sceneBackgrounds.push(scene.toJSON().background); return setScene(scene); };
    // step() is synchronous: a premature callback produces zero draw calls.
    try {
      app.step(0);
      const diagnostics = app.diagnostics();
      harness.readyProofs.push({ backend: diagnostics.backend, drawCalls: diagnostics.drawCalls });
    } catch (error) { harness.readyProofs.push({ backend: app.diagnostics().backend, drawCalls: 0, error: String(error) }); }
  };
  const options = mode ? { suspendOnLoad: descriptors[mode], loader: loaders[mode] } : {};
  const failToBoundary = typeof window !== "undefined" && new URLSearchParams(location.search).has("failure-boundary");
  return h(Boundary, { key: boundaryKey },
    h(AuraCanvas, {
      className: "scene", resize: false, onReady: recordReady,
      onError: failToBoundary ? undefined : (error) => window.__auraReactTest.failed.push(String(error)),
      onPointerDown: () => window.__auraReactTest.pointer.push("down:" + revision),
      onPointerMove: () => window.__auraReactTest.pointer.push("move:" + revision),
      onPointerUp: () => window.__auraReactTest.pointer.push("up:" + revision)
    },
      h(Scene, { background: revision ? "#223344" : "#112233", timeline: { mode: "loop", seconds: 2 } },
        h(Model, { asset, name: "first", securityContext, ...options, fallback: h("output", { "data-fallback": "first" }, "loading") }),
        h(Model, { asset, name: "second", securityContext, position: [0.1, 0, 0], ...options, fallback: h("output", { "data-fallback": "second" }, "loading") }),
        h(Lights, { type: "ambient", intensity: 1 })
      ), h(FrameProbe, { revision })));
}
const tree = () => h(StrictMode, null, h(App));
`;
}

function browserEntry(glbHash: string): string {
  return `${sharedEntry(glbHash)}
import { hydrateRoot, createRoot } from "react-dom/client";
// Installed before hydration, so every app the adapter creates is counted,
// including StrictMode's first mount that is disposed before onReady.
const nativeGetContext = HTMLCanvasElement.prototype.getContext;
let contextAcquisitions = 0;
HTMLCanvasElement.prototype.getContext = function(type, ...args) {
  const context = nativeGetContext.call(this, type, ...args);
  if (type === "webgl2" && context) contextAcquisitions++;
  return context;
};
const glLedger = new Map();
let glObjectsCreated = 0;
for (const kind of ["Buffer", "Texture", "Program", "Shader", "VertexArray", "Framebuffer", "Renderbuffer", "Query", "Sampler", "TransformFeedback"]) {
  const proto = WebGL2RenderingContext.prototype;
  const create = proto["create" + kind];
  const remove = proto["delete" + kind];
  proto["create" + kind] = function(...args) {
    const handle = create.apply(this, args);
    if (handle) {
      if (!glLedger.has(this)) glLedger.set(this, new Set());
      glLedger.get(this).add(handle);
      glObjectsCreated++;
    }
    return handle;
  };
  proto["delete" + kind] = function(handle, ...args) {
    if (handle) glLedger.get(this)?.delete(handle);
    return remove.call(this, handle, ...args);
  };
}
const liveGlObjects = () => [...glLedger].reduce((total, [gl, handles]) => total + (gl.isContextLost() ? 0 : handles.size), 0);
const nativeAdd = HTMLCanvasElement.prototype.addEventListener;
const nativeRemove = HTMLCanvasElement.prototype.removeEventListener;
const listeners = new Map();
const pointerTypes = new Set(["pointerdown", "pointermove", "pointerup"]);
HTMLCanvasElement.prototype.addEventListener = function(type, callback, options) {
  if (pointerTypes.has(type) && callback) {
    if (!listeners.has(this)) listeners.set(this, new Map());
    const byType = listeners.get(this);
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(callback);
  }
  return nativeAdd.call(this, type, callback, options);
};
HTMLCanvasElement.prototype.removeEventListener = function(type, callback, options) {
  listeners.get(this)?.get(type)?.delete(callback);
  return nativeRemove.call(this, type, callback, options);
};
const nativeRaf = window.requestAnimationFrame.bind(window);
const nativeCancel = window.cancelAnimationFrame.bind(window);
const scheduled = new Set();
window.requestAnimationFrame = (callback) => {
  const id = nativeRaf((time) => {
    scheduled.delete(id);
    window.__auraReactTest.currentAnimationTick = time;
    callback(time);
  });
  scheduled.add(id);
  return id;
};
window.cancelAnimationFrame = (id) => { scheduled.delete(id); nativeCancel(id); };
const stage = document.getElementById("stage");
const serverCanvas = stage.querySelector("canvas");
const harness = window.__auraReactTest = {
  controls: null, readyCount: 0, disposedCount: 0, failed: [], caught: [], readyProofs: [],
  serverCanvas, hydrationReusedCanvas: false, pointer: [], frames: 0, duplicateFrames: 0,
  currentAnimationTick: null, lastFrameTick: null, currentAppId: null, nextAppId: 0, sceneBackgrounds: [],
  retiredCount: 0, pendingRetirements: 0, retirementFailures: [],
  snapshot: () => ({
    version: React.version, readyCount: harness.readyCount, disposedCount: harness.disposedCount,
    failed: [...harness.failed], caught: [...harness.caught], readyProofs: [...harness.readyProofs], hydrationReusedCanvas: harness.hydrationReusedCanvas,
    pointer: [...harness.pointer], frameCount: harness.frames, duplicateFrames: harness.duplicateFrames,
    livePointerListeners: [...listeners.values()].reduce((total, byType) => total + [...byType.values()].reduce((n, set) => n + set.size, 0), 0),
    pendingAnimationFrames: scheduled.size, calls: { ...calls }, currentAppId: harness.currentAppId,
    sceneBackgrounds: [...harness.sceneBackgrounds],
    contextAcquisitions, glObjectsCreated, liveGlObjects: liveGlObjects(),
    retiredCount: harness.retiredCount, pendingRetirements: harness.pendingRetirements,
    retirementFailures: [...harness.retirementFailures],
    abortedFlights: Object.keys(flightSignals).filter((name) => flightSignals[name]?.aborted)
  }),
  settleRetirements: async () => {
    // Await asynchronous cleanup: every disposed app's retirement and any GL deletes queued behind it.
    for (let attempt = 0; attempt < 600 && (harness.pendingRetirements > 0 || liveGlObjects() > 0); attempt++) {
      await new Promise((done) => setTimeout(done, 50));
    }
  },
  update: () => harness.controls.update(),
  start: (mode) => harness.controls.start(mode),
  resolve: (mode) => { if (!pending[mode]) throw Error("missing pending loader " + mode); pending[mode](); },
  retry: () => harness.controls.retry(),
  unmount: () => { harness.detachedCanvas = stage.querySelector("canvas"); root.unmount(); },
  remount: () => { root = createRoot(stage); root.render(tree()); },
  dispatchDetached: () => harness.detachedCanvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
};
let root = hydrateRoot(stage, tree());
`;
}

async function bundle(consumer: Consumer, contents: string): Promise<string> {
  const result = await build({
    stdin: { contents, resolveDir: consumer.directory, sourcefile: "native-react-browser.js", loader: "js" },
    absWorkingDir: consumer.directory,
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    target: "es2022",
    define: { "process.env.NODE_ENV": '"development"' },
    external: NATIVE_BUNDLE_EXTERNALS,
    logLevel: "silent"
  });
  const output = result.outputFiles[0]?.text;
  if (!output) throw new Error(`No browser test bundle was emitted for ${consumer.directory}`);
  return output;
}

async function serverRender(consumer: Consumer, glbHash: string, initialSuspend: boolean): Promise<string> {
  // Import the installed ESM entries directly in a fresh DOM-free Node process;
  // bundling SSR would tree-shake import-time failures out of the package.
  const code = `
import { createRequire } from "node:module";
import { resolve } from "node:path";
if (typeof window !== "undefined" || typeof document !== "undefined") throw Error("SSR process has DOM globals");
const req = createRequire(resolve("package.json"));
const React = req("react");
const { renderToString } = req("react-dom/server");
const { AuraCanvas, Scene, Model, Lights, useAuraFrame } = await import("@aura3d/react");
const { defineAuraAssets } = await import("@aura3d/engine");
const h = React.createElement;
const asset = defineAuraAssets({ triangle: {
  type: "model", format: "glb", url: "/triangle.glb", hash: "sha256-${glbHash}",
  bounds: [1.4, 1.3, 0], metadata: { license: "MIT" }
} }).triangle;
function Probe() { useAuraFrame(() => {}); return h("output", { id: "probe", "data-revision": 0 }, "hydrated scene"); }
const preload = ${initialSuspend ? `{ suspendOnLoad: [{ id: "shared", url: "/triangle.glb" }], loader: () => { throw Error("SSR started a browser preload"); } }` : "{}"};
const tree = h(React.StrictMode, null, h(AuraCanvas, { className: "scene", resize: false },
  h(Scene, { background: "#112233", timeline: { mode: "loop", seconds: 2 } },
    h(Model, { asset, name: "first", ...preload, fallback: h("output", { "data-fallback": "first" }, "loading") }),
    h(Model, { asset, name: "second", position: [0.1, 0, 0], ...preload, fallback: h("output", { "data-fallback": "second" }, "loading") }),
    h(Lights, { type: "ambient", intensity: 1 })
  ), h(Probe)));
process.stdout.write(renderToString(tree));
`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
    cwd: consumer.directory, input: code, encoding: "utf8", maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`React ${consumer.reactVersion} server render failed: ${result.stderr}`);
  if (!result.stdout.includes("<canvas")) throw new Error("Server render did not produce a canvas");
  if (initialSuspend && (result.stdout.match(/data-fallback=/g)?.length ?? 0) !== 2) {
    throw new Error("Server render did not preserve both Suspense fallbacks");
  }
  return result.stdout;
}

interface Fixture {
  readonly glb: Buffer;
  readonly html: string;
  readonly suspenseHtml: string;
  readonly javascript: string;
}

const fixtures = new Map<string, Promise<Fixture>>();

function fixtureFor(consumer: Consumer): Promise<Fixture> {
  const cached = fixtures.get(consumer.directory);
  if (cached) return cached;
  const glb = triangleGlb();
  const hash = createHash("sha256").update(glb).digest("hex");
  const fixture = Promise.all([
    serverRender(consumer, hash, false), serverRender(consumer, hash, true), bundle(consumer, browserEntry(hash))
  ]).then(([html, suspenseHtml, javascript]) => ({ glb, html, suspenseHtml, javascript }));
  fixtures.set(consumer.directory, fixture);
  return fixture;
}

async function serve(consumer: Consumer): Promise<{ origin: string; close(): Promise<void> }> {
  const { glb, html, suspenseHtml, javascript } = await fixtureFor(consumer);
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/triangle.glb") {
      response.writeHead(200, { "content-type": "model/gltf-binary", "cache-control": "no-store" }).end(glb);
    } else if (url.pathname === "/main.js") {
      response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }).end(javascript);
    } else if (url.pathname === "/") {
      const initialSuspend = url.searchParams.has("suspense");
      response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end(
        `<!doctype html><html><head><meta charset="utf-8"><title>React lifecycle</title></head><body><div id="stage" style="width:256px;height:256px">${initialSuspend ? suspenseHtml : html}</div><script>window.__INITIAL_SUSPEND__=${initialSuspend}</script><script type="module" src="/main.js"></script></body></html>`
      );
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("React test server did not bind a TCP address");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())) };
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest.snapshot());
}

/** After an unmount, await async cleanup and assert every created renderer and its GPU objects retired. */
async function expectRetired(page: Page): Promise<Snapshot> {
  await page.evaluate(() => (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest.settleRetirements());
  const settled = await snapshot(page);
  expect(settled.retirementFailures).toEqual([]);
  expect(settled.pendingRetirements).toBe(0);
  expect(settled.retiredCount).toBe(settled.disposedCount);
  expect(settled.disposedCount).toBe(settled.readyCount);
  // StrictMode's discarded first mount never reaches onReady; its resources are covered by the GL ledger.
  expect(settled.contextAcquisitions).toBeGreaterThanOrEqual(settled.readyCount);
  expect(settled.liveGlObjects).toBe(0);
  return settled;
}

async function invoke(page: Page, action: "update" | "retry" | "unmount" | "remount" | "dispatchDetached"): Promise<void> {
  await page.evaluate(async (name) => {
    await (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest[name]();
  }, action);
}

test.describe("packed React adapter hydration and lifecycle", () => {
  test.setTimeout(180_000);

  for (const major of [18, 19] as const) {
    test(`React ${major}: server render, hydrate, Suspense, input, retry and cleanup`, async ({ page }) => {
      const consumer = consumerFor(major);
      const other = consumerFor(major === 18 ? 19 : 18);
      expect(consumer.directory).not.toBe(other.directory);
      expect(consumer.adapterPackageHash).toBe(other.adapterPackageHash);
      expect(consumer.enginePackageHash).toBe(other.enginePackageHash);
      const server = await serve(consumer);
      const pageErrors: string[] = [];
      const hydrationErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && /hydrat|server.rendered|did not match/i.test(message.text())) hydrationErrors.push(message.text());
      });
      try {
        await page.goto(server.origin, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean((window as unknown as { __auraReactTest?: unknown }).__auraReactTest));
        await expect.poll(async () => (await snapshot(page)).readyProofs.length).toBe(1);
        await expect.poll(async () => (await snapshot(page)).frameCount).toBeGreaterThan(3);
        const initial = await snapshot(page);
        expect(initial.version).toBe(consumer.reactVersion);
        expect(initial.hydrationReusedCanvas).toBe(true);
        expect(initial.failed).toEqual([]);
        expect(initial.readyCount).toBe(1);
        expect(initial.readyProofs[0]).toMatchObject({ backend: "webgl2" });
        expect(initial.readyProofs[0]?.error).toBeUndefined();
        expect(initial.readyProofs[0]?.drawCalls).toBeGreaterThan(0);
        expect(initial.duplicateFrames).toBe(0);
        // The resource ledger was installed before the adapter created any app.
        expect(initial.contextAcquisitions).toBeGreaterThanOrEqual(1);
        expect(initial.glObjectsCreated).toBeGreaterThan(0);
        expect(initial.liveGlObjects).toBeGreaterThan(0);

        // Updating scene props and callback closures must retain the app and use the latest handlers.
        await invoke(page, "update");
        await expect(page.locator("#probe")).toHaveAttribute("data-revision", "1");
        await expect.poll(async () => (await snapshot(page)).sceneBackgrounds).toContain("#223344");
        await page.locator("canvas.scene").dispatchEvent("pointerdown");
        await page.locator("canvas.scene").dispatchEvent("pointermove");
        await page.locator("canvas.scene").dispatchEvent("pointerup");
        await expect.poll(async () => (await snapshot(page)).pointer).toEqual(["down:1", "move:1", "up:1"]);
        expect((await snapshot(page)).currentAppId).toBe(initial.currentAppId);
        expect((await snapshot(page)).readyCount).toBe(1);

        // Two Model subscribers of the same resource suspend on one flight.
        await page.evaluate(() => (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest.start("shared"));
        await expect(page.locator("[data-fallback]")).toHaveCount(2);
        expect((await snapshot(page)).calls.shared).toBe(1);
        await page.evaluate(() => (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest.resolve("shared"));
        await expect(page.locator("[data-fallback]")).toHaveCount(0);

        // Failed evidence is an error, not a successful Suspense resolution; retry is explicit.
        await page.evaluate(() => (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest.start("failure"));
        await expect(page.locator("#preload-error")).toContainText(/asset preload failed/i);
        await expect.poll(async () => (await snapshot(page)).caught.some((entry) => entry.failures.some(
          (failure) => failure.id === "failure" && failure.message === "deliberate preload failure"
        ))).toBe(true);
        expect((await snapshot(page)).calls.failure).toBe(1);
        await invoke(page, "retry");
        await expect(page.locator("#preload-error")).toHaveCount(0);
        await expect.poll(async () => (await snapshot(page)).readyCount).toBe(2);
        expect((await snapshot(page)).calls.failure).toBe(2);

        // React StrictMode and repeated roots must release frames/listeners on every unmount.
        for (let cycle = 0; cycle < 3; cycle++) {
          const before = await snapshot(page);
          await invoke(page, "unmount");
          await expect.poll(async () => (await snapshot(page)).livePointerListeners).toBe(0);
          await expect.poll(async () => (await snapshot(page)).pendingAnimationFrames).toBe(0);
          const stopped = await expectRetired(page);
          await invoke(page, "dispatchDetached");
          expect((await snapshot(page)).pointer).toEqual(stopped.pointer);
          await invoke(page, "remount");
          await expect.poll(async () => (await snapshot(page)).readyCount).toBe(before.readyCount + 1);
        }

        // A load that finishes after its tree unmounts cannot resurrect the app or callbacks.
        await page.evaluate(() => (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest.start("late"));
        await expect(page.locator("[data-fallback]")).toHaveCount(2);
        await invoke(page, "unmount");
        await expect.poll(async () => (await snapshot(page)).livePointerListeners).toBe(0);
        await expect.poll(async () => (await snapshot(page)).pendingAnimationFrames).toBe(0);
        // The abandoned preload flight is cancelled, and the app's renderer resources are retired.
        await expect.poll(async () => (await snapshot(page)).abortedFlights).toContain("late");
        const beforeLate = await expectRetired(page);
        await page.evaluate(() => (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest.resolve("late"));
        await page.waitForTimeout(100);
        const afterLate = await snapshot(page);
        expect(afterLate.readyCount).toBe(beforeLate.readyCount);
        expect(afterLate.currentAppId).toBeNull();
        expect(afterLate.livePointerListeners).toBe(0);
        expect(afterLate.pendingAnimationFrames).toBe(0);
        expect(afterLate.duplicateFrames).toBe(0);
        expect(afterLate.liveGlObjects).toBe(0);
        expect(afterLate.abortedFlights).not.toContain("shared");
        expect(hydrationErrors).toEqual([]);
        expect(pageErrors.filter((error) => !/asset preload failed/i.test(error))).toEqual([]);
      } finally {
        await server.close();
      }
    });

    test(`React ${major}: server-rendered Suspense fallbacks hydrate before a shared preload resolves`, async ({ page }) => {
      const consumer = consumerFor(major);
      const server = await serve(consumer);
      const hydrationErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && /hydrat|server.rendered|did not match/i.test(message.text())) hydrationErrors.push(message.text());
      });
      try {
        await page.goto(`${server.origin}/?suspense`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-fallback]")).toHaveCount(2);
        await page.waitForFunction(() => Boolean((window as unknown as { __auraReactTest?: unknown }).__auraReactTest));
        await expect.poll(async () => (await snapshot(page)).calls.shared).toBe(1);
        await expect.poll(async () => (await snapshot(page)).readyCount).toBe(1);
        expect((await snapshot(page)).hydrationReusedCanvas).toBe(true);
        await page.evaluate(() => (window as unknown as { __auraReactTest: BrowserHarness }).__auraReactTest.resolve("shared"));
        await expect(page.locator("[data-fallback]")).toHaveCount(0);
        expect(hydrationErrors).toEqual([]);
        await invoke(page, "unmount");
        await expect.poll(async () => (await snapshot(page)).livePointerListeners).toBe(0);
        await expect.poll(async () => (await snapshot(page)).pendingAnimationFrames).toBe(0);
        await expectRetired(page);
      } finally {
        await server.close();
      }
    });

    test(`React ${major}: renderer failure is reported and never announced ready`, async ({ page }) => {
      const consumer = consumerFor(major);
      const server = await serve(consumer);
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
          if (type === "webgl2") return null;
          return (original as (...values: unknown[]) => RenderingContext | null).call(this, type, ...args);
        } as typeof HTMLCanvasElement.prototype.getContext;
      });
      try {
        await page.goto(server.origin, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean((window as unknown as { __auraReactTest?: unknown }).__auraReactTest));
        await expect.poll(async () => (await snapshot(page)).failed.length).toBeGreaterThan(0);
        const failure = await snapshot(page);
        expect(failure.readyCount).toBe(0);
        expect(failure.readyProofs).toEqual([]);
        expect(failure.failed.join(" ")).toMatch(/render|webgl|context/i);
        await invoke(page, "unmount");
        await expect.poll(async () => (await snapshot(page)).livePointerListeners).toBe(0);
        await expect.poll(async () => (await snapshot(page)).pendingAnimationFrames).toBe(0);
      } finally {
        await server.close();
      }
    });

    test(`React ${major}: renderer failure reaches the nearest error boundary without onError`, async ({ page }) => {
      const consumer = consumerFor(major);
      const server = await serve(consumer);
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
          if (type === "webgl2") return null;
          return (original as (...values: unknown[]) => RenderingContext | null).call(this, type, ...args);
        } as typeof HTMLCanvasElement.prototype.getContext;
      });
      try {
        await page.goto(`${server.origin}/?failure-boundary`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("#preload-error")).toContainText(/render|webgl|context/i);
        const failure = await snapshot(page);
        expect(failure.readyCount).toBe(0);
        expect(failure.readyProofs).toEqual([]);
        await expect.poll(async () => (await snapshot(page)).livePointerListeners).toBe(0);
        await expect.poll(async () => (await snapshot(page)).pendingAnimationFrames).toBe(0);
      } finally {
        await server.close();
      }
    });
  }
});
