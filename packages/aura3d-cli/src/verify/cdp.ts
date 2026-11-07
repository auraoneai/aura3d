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
}

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
        await sleep(o.motionGapMs);
        const second = await shot();
        state = await readState();
        return { status, consoleMessages, pageErrors, failedRequests: failedRequests.map((f) => f), badResponses, appState: state, frames: [first, second], driver: "chrome-cdp" };
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
