// Default render driver for `aura3d verify`: a locally installed Chrome driven over the DevTools protocol on a loopback socket.
// No Playwright, no download, no remote service. The protocol client is ~60 lines on Node's global WebSocket.
// The driver is pluggable: anything that implements `VerifyBrowserDriver` can replace it (tests inject a mock).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RenderCaptureOptions {
  readonly width: number;
  readonly height: number;
  /** Quiet time after the app reports ready, before the first frame. */
  readonly settleMs: number;
  /** Time between the two frames used by the motion check. */
  readonly motionGapMs: number;
  /** Navigation budget. */
  readonly timeoutMs: number;
  /** How long to wait for `data-aura3d-ready` after load. */
  readonly readyTimeoutMs: number;
}

export interface RenderCapture {
  readonly status: number | null;
  readonly consoleMessages: readonly { readonly level: string; readonly text: string }[];
  readonly pageErrors: readonly string[];
  readonly failedRequests: readonly string[];
  readonly badResponses: readonly string[];
  readonly appState: {
    /** document.body.dataset.aura3dReady: "true", "error" or absent. */
    readonly ready?: string;
    readonly error?: string;
    /** Page-level facts that explain a blank frame (tab visibility, canvas count and size, body data attributes). */
    readonly page?: { readonly visibility?: string; readonly canvases?: number; readonly canvasSize?: string; readonly bodyData?: Readonly<Record<string, string>> };
    readonly routeReady?: { readonly status?: string; readonly diagnostics?: { readonly degradations?: readonly { readonly code: string; readonly message: string; readonly nodeId?: string }[]; readonly warnings?: readonly string[]; readonly errors?: readonly string[]; readonly backend?: string; readonly drawCalls?: number } } | null;
  };
  /** PNG frames: [first, second]. */
  readonly frames: readonly Buffer[];
  readonly driver: string;
  /** Live scene facts read from the first app on `globalThis.__AURA3D_LIVE_APPS__` right after the first frame (absent when the page has no live app). */
  readonly scene?: RenderSceneProbe | null;
}

/** World-space box of one visible model or primitive, from the engine's own `node.bounds()`. */
export interface RenderSceneNodeBox {
  readonly id: string;
  readonly kind: string;
  readonly name?: string;
  readonly primitive?: string;
  readonly visible: boolean;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * What `aura3d render` reads from the running app to measure framing with the engine's own maths (`measureFrameFill`)
 * instead of guessing from pixels: the presented camera pose, the view-projection matrix, every spatial node's world box,
 * and the engine's own fps and shadow diagnostics.
 */
export interface RenderSceneProbe {
  readonly apps?: number;
  readonly pose?: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fov: number; readonly source: string };
  /** Column-major view-projection matrix of the presented camera (`app.viewProjection()`). */
  readonly viewProjection?: readonly number[];
  readonly nodes?: readonly RenderSceneNodeBox[];
  /**
   * Top-level scene snapshot nodes (`app.scene.nodes`, JSON, heavy vertex/pixel arrays dropped) whose ids have no live handle,
   * for `camera.worldBounds` in Node. Absent when the snapshot is too large to send.
   */
  readonly sceneNodes?: readonly unknown[];
  readonly fps?: number;
  readonly backend?: string;
  /** Shadow evidence: lights the renderer sampled shadows for, whether the contact-shadow pass ran, and lights that ask for shadows. */
  readonly shadows?: { readonly sampledLights?: number; readonly contact?: boolean; readonly declaredLights: number };
  readonly error?: string;
}

/**
 * Page expression for `RenderSceneProbe`. Plain ES2017, no engine import: it only calls the public members of the live app
 * (`camera.presented()`, `viewProjection()`, `nodes.all()`, `node.snapshot()`, `node.bounds()`, `diagnostics()`).
 */
export const SCENE_PROBE_EXPRESSION = `(() => { try {
  var reg = globalThis.__AURA3D_LIVE_APPS__;
  var app = reg && typeof reg.all === 'function' ? reg.all()[0] : undefined;
  if (!app) return JSON.stringify(null);
  var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : undefined; };
  var vec = function (v) { return v && v.length >= 3 && isFinite(v[0]) && isFinite(v[1]) && isFinite(v[2]) ? [Number(v[0]), Number(v[1]), Number(v[2])] : undefined; };
  var snap = app.scene || {};
  var pose;
  try { var p = app.camera && typeof app.camera.presented === 'function' ? app.camera.presented() : undefined; if (p && vec(p.position) && vec(p.target)) pose = { position: vec(p.position), target: vec(p.target), fov: num(p.fov) || 45, source: 'camera.presented' }; } catch (e) {}
  if (!pose && snap.camera && vec(snap.camera.position) && vec(snap.camera.target)) pose = { position: vec(snap.camera.position), target: vec(snap.camera.target), fov: num(snap.camera.fov) || 45, source: 'scene.camera' };
  var vp;
  try { var m = typeof app.viewProjection === 'function' ? app.viewProjection() : undefined; if (m && m.length === 16) vp = Array.prototype.slice.call(m).map(Number); } catch (e) {}
  var prim = {}, declared = 0;
  var walk = function (list) { for (var i = 0; list && i < list.length; i++) { var n = list[i]; if (!n) continue; if (n.id && n.primitive) prim[n.id] = String(n.primitive); if (n.kind === 'light' && (n.shadow || n.castShadow)) declared++; if (n.children) walk(n.children); if (n.nodes) walk(n.nodes); } };
  walk(snap.nodes);
  var nodes = [];
  var handles = app.nodes && typeof app.nodes.all === 'function' ? app.nodes.all() : [];
  for (var j = 0; j < handles.length && nodes.length < 500; j++) {
    try {
      var s = handles[j].snapshot();
      if (s.kind !== 'model' && s.kind !== 'primitive') continue;
      var b = handles[j].bounds();
      if (!b || !vec(b.min) || !vec(b.max)) continue;
      nodes.push({ id: String(s.id), kind: s.kind, name: s.name, primitive: prim[s.id], visible: s.visible !== false, min: vec(b.min), max: vec(b.max) });
    } catch (e) {}
  }
  var live = {}; for (var k = 0; k < nodes.length; k++) live[nodes[k].id] = true;
  var heavy = { positions: 1, normals: 1, uvs: 1, uv: 1, uv2: 1, indices: 1, colors: 1, tangents: 1, data: 1, pixels: 1, heights: 1, skinIndices: 1, skinWeights: 1, morphTargets: 1, instanceMatrices: 1, instanceRgba: 1, image: 1, source: 1 };
  var sceneNodes;
  try {
    var top = (snap.nodes || []).filter(function (n) { return n && !(n.id && live[n.id]) && !(n.runtime && n.runtime.id && live[n.runtime.id]); });
    var text = JSON.stringify(top, function (key, value) { if (heavy[key] && key !== '') return undefined; if (value && typeof value === 'object' && ArrayBuffer.isView(value)) return undefined; if (typeof value === 'function') return undefined; return value; });
    if (text && text.length <= 1500000) sceneNodes = JSON.parse(text);
  } catch (e) {}
  var diag = {};
  try { diag = app.diagnostics() || {}; } catch (e) {}
  var lighting = diag.lighting || {};
  var sampled = Array.isArray(lighting.shadows) ? lighting.shadows.filter(function (x) { return x && x.sampled !== false; }).length : undefined;
  var contact = lighting.contactShadows ? !!lighting.contactShadows.passExecuted : undefined;
  return JSON.stringify({ apps: typeof reg.count === 'function' ? reg.count() : undefined, pose: pose, viewProjection: vp, nodes: nodes, sceneNodes: sceneNodes, fps: num(diag.fps), backend: typeof diag.backend === 'string' ? diag.backend : undefined, shadows: { sampledLights: sampled, contact: contact, declaredLights: declared } });
} catch (e) { return JSON.stringify({ error: String(e && e.message || e).slice(0, 300) }); } })()`;

export interface VerifyBrowserDriver {
  readonly name: string;
  capture(url: string, options: RenderCaptureOptions): Promise<RenderCapture>;
  close(): Promise<void>;
}

export class BrowserUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "BrowserUnavailableError"; }
}

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"
];

export function findChrome(explicit?: string): string | undefined {
  const fromEnv = explicit ?? process.env.AURA3D_CHROME ?? process.env.CHROME_PATH;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : undefined;
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (found) return found;
  for (const name of ["google-chrome", "chromium", "chrome"]) {
    const which = spawnSync("which", [name], { encoding: "utf8" });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  }
  return undefined;
}

type Listener = (params: Record<string, unknown>, sessionId?: string) => void;

class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
  private readonly listeners = new Map<string, Listener[]>();
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string }; method?: string; params?: Record<string, unknown>; sessionId?: string };
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result ?? {});
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {}, message.sessionId);
      }
    });
    socket.addEventListener("close", () => { for (const waiter of this.pending.values()) waiter.reject(new Error("DevTools connection closed")); this.pending.clear(); });
  }
  static connect(url: string): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new CdpConnection(socket)), { once: true });
      socket.addEventListener("error", () => reject(new Error(`could not open DevTools socket ${url}`)), { once: true });
    });
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(method: string, listener: Listener): void { this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]); }
  close(): void { try { this.socket.close(); } catch { /* already closed */ } }
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export interface ChromeDriverOptions {
  readonly chromePath?: string;
  /** Force software GL (SwiftShader). Default: the machine's GPU. */
  readonly softwareGl?: boolean;
  readonly extraArgs?: readonly string[];
}

/** Launch Chrome headless on an ephemeral loopback debugging port and drive one page per `capture`. */
export function createChromeCdpDriver(options: ChromeDriverOptions = {}): VerifyBrowserDriver {
  let chrome: ChildProcess | undefined;
  let profileDir: string | undefined;
  let connection: CdpConnection | undefined;

  async function launch(): Promise<CdpConnection> {
    if (connection) return connection;
    const executable = findChrome(options.chromePath);
    if (!executable) throw new BrowserUnavailableError("No Chrome found. Pass --chrome <path> or set AURA3D_CHROME.");
    profileDir = mkdtempSync(join(tmpdir(), "aura3d-verify-chrome-"));
    const args = [
      "--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profileDir}`,
      "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      "--ignore-gpu-blocklist", "--hide-scrollbars", "--mute-audio",
      ...(options.softwareGl ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : []),
      ...(options.extraArgs ?? []), "about:blank"
    ];
    chrome = spawn(executable, args, { stdio: "ignore" });
    const portFile = join(profileDir, "DevToolsActivePort");
    const deadline = Date.now() + 20_000;
    while (!existsSync(portFile)) {
      if (chrome.exitCode !== null) throw new BrowserUnavailableError(`Chrome exited early (code ${chrome.exitCode}).`);
      if (Date.now() > deadline) throw new BrowserUnavailableError("Chrome did not open a DevTools port within 20s.");
      await sleep(100);
    }
    await sleep(100);
    const [port, path] = readFileSync(portFile, "utf8").trim().split("\n");
    connection = await CdpConnection.connect(`ws://127.0.0.1:${port}${path}`);
    return connection;
  }

  return {
    name: "chrome-cdp",
    async capture(url, o) {
      const cdp = await launch();
      const { targetId } = (await cdp.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
      const { sessionId } = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
      const send = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
      const consoleMessages: { level: string; text: string }[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];
      const badResponses: string[] = [];
      const documentRequests = new Set<string>();
      let status: number | null = null;
      let loaded = false;
      const mine = (id?: string): boolean => id === sessionId;
      const pathOf = (value: string): string => { try { return new URL(value).pathname; } catch { return value.slice(0, 120); } };
      cdp.on("Runtime.consoleAPICalled", (p, id) => {
        if (!mine(id)) return;
        const type = String(p.type);
        const args = (p.args as { value?: unknown; description?: string }[] | undefined) ?? [];
        const text = args.map((a) => (a.value !== undefined ? String(a.value) : a.description ?? "")).join(" ").slice(0, 600);
        consoleMessages.push({ level: type === "warning" ? "warning" : type, text });
      });
      cdp.on("Runtime.exceptionThrown", (p, id) => {
        if (!mine(id)) return;
        const d = (p.exceptionDetails ?? {}) as { text?: string; exception?: { description?: string }; lineNumber?: number };
        pageErrors.push(String(d.exception?.description ?? d.text ?? "exception").split("\n").slice(0, 3).join(" | ").slice(0, 600));
      });
      cdp.on("Log.entryAdded", (p, id) => {
        if (!mine(id)) return;
        const entry = (p.entry ?? {}) as { level?: string; text?: string; url?: string };
        if (entry.level === "error" && entry.text) consoleMessages.push({ level: "error", text: `${entry.text}${entry.url ? ` (${pathOf(entry.url)})` : ""}`.slice(0, 600) });
      });
      cdp.on("Network.responseReceived", (p, id) => {
        if (!mine(id)) return;
        const response = (p.response ?? {}) as { status?: number; url?: string };
        if (p.type === "Document" && status === null) status = response.status ?? null;
        if ((response.status ?? 0) >= 400) badResponses.push(`${response.status} ${pathOf(response.url ?? "")}`);
      });
      cdp.on("Network.requestWillBeSent", (p, id) => { if (mine(id) && p.type === "Document") documentRequests.add(String(p.requestId)); });
      cdp.on("Network.loadingFailed", (p, id) => {
        if (!mine(id) || p.canceled) return;
        failedRequests.push(`${p.requestId} (${String(p.errorText ?? "failed")})`);
      });
      cdp.on("Page.loadEventFired", (_p, id) => { if (mine(id)) loaded = true; });
      try {
        await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");
        await send("Emulation.setDeviceMetricsOverride", { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: false });
        await send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
        const nav = (await send("Page.navigate", { url })) as { errorText?: string };
        if (nav.errorText) throw new Error(`navigation failed: ${nav.errorText}`);
        const deadline = Date.now() + o.timeoutMs;
        while (!loaded && Date.now() < deadline) await sleep(50);
        const readyDeadline = Date.now() + o.readyTimeoutMs;
        const stateExpr = `(() => { const b = document.body; const r = window.__AURA3D_ROUTE_READY__; return JSON.stringify({ ready: b && b.dataset ? b.dataset.aura3dReady : undefined, error: b && b.dataset ? b.dataset.aura3dError : undefined, page: { visibility: document.visibilityState, canvases: document.querySelectorAll('canvas').length, canvasSize: (document.querySelector('canvas') || {}).width + 'x' + (document.querySelector('canvas') || {}).height, bodyData: b ? Object.assign({}, b.dataset) : {} }, routeReady: r ? { status: r.status, diagnostics: r.diagnostics ? { degradations: (r.diagnostics.degradations || []).slice(0, 40).map(function (d) { return { code: d.code, message: String(d.message).slice(0, 400), nodeId: d.nodeId }; }), warnings: r.diagnostics.warnings, errors: r.diagnostics.errors, backend: r.diagnostics.backend, drawCalls: r.diagnostics.drawCalls } : undefined } : null }); })()`;
        const readState = async (): Promise<RenderCapture["appState"]> => {
          const result = (await send("Runtime.evaluate", { expression: stateExpr, returnByValue: true })) as { result?: { value?: string } };
          return JSON.parse(result.result?.value ?? "{}") as RenderCapture["appState"];
        };
        let state = await readState();
        while (state.ready === undefined && Date.now() < readyDeadline) { await sleep(250); state = await readState(); }
        await sleep(o.settleMs);
        const shot = async (): Promise<Buffer> => Buffer.from(((await send("Page.captureScreenshot", { format: "png" })) as { data: string }).data, "base64");
        const first = await shot();
        // Read the live scene at (nearly) the instant of the first frame, so framing is measured on what that frame shows.
        let scene: RenderSceneProbe | null = null;
        try {
          const probe = (await send("Runtime.evaluate", { expression: SCENE_PROBE_EXPRESSION, returnByValue: true })) as { result?: { value?: string } };
          scene = JSON.parse(probe.result?.value ?? "null") as RenderSceneProbe | null;
        } catch { scene = null; }
        await sleep(o.motionGapMs);
        const second = await shot();
        state = await readState();
        return { status, consoleMessages, pageErrors, failedRequests: failedRequests.map((f) => f), badResponses, appState: state, frames: [first, second], driver: "chrome-cdp", scene };
      } finally {
        await cdp.send("Target.closeTarget", { targetId }).catch(() => undefined);
      }
    },
    async close() {
      connection?.close();
      connection = undefined;
      if (chrome && chrome.exitCode === null) chrome.kill("SIGTERM");
      await sleep(150);
      if (chrome && chrome.exitCode === null) chrome.kill("SIGKILL");
      if (profileDir) rmSync(profileDir, { recursive: true, force: true });
      chrome = undefined; profileDir = undefined;
    }
  };
}
