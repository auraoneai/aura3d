import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Request } from "@playwright/test";
import { build } from "esbuild";
import { NATIVE_BUNDLE_EXTERNALS } from "./native-bundle-externals";
import { hashConsumerProject, restoreMatrixProject, validateGateMatchesSource, validateSourceMatrixReport } from "../../tools/native-consumer-matrix/index";
import { bindBrowserGate, type BrowserGateRecord } from "../../tools/native-capability-gate/browser-contract";
import { inspectRuntimeNetwork, redactRuntimeNetworkEvents, type RuntimeNetworkEvent } from "../../tools/native-runtime-audit/runtime-network";

/**
 * Phase B only. Restore the source-phase matrix's locked, packed candidate in
 * a clean temporary project before disconnecting the browser. A standalone
 * fixture is bundled against that installed project with no workspace imports.
 * Chromium/other automation browsers and restoration must run remotely.
 *
 * All HTTP and WebSocket attempts are denied. Offline mode is enabled before
 * the fixture executes and a negative-control request verifies interception.
 * A passing result covers this particular root-API scene and its exercised
 * resources, not every lazy package, device or possible application.
 */
const FIXTURE = String.raw`
import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";

let app;
let canvas;

async function start() {
  canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 128;
  canvas.style.width = "128px"; canvas.style.height = "128px";
  document.body.appendChild(canvas);
  const builder = scene({
    background: "#000000",
    camera: camera.orthographic({ position: [0, 0, 5], target: [0, 0, 0], orthographicSize: 2, near: 0, far: 20 })
  }).add(primitives.box({ name: "offline-probe", size: [0.8, 0.9, 0.2],
    material: material.emissive({ color: "#ff1717", emissive: "#ff1717", emissiveIntensity: 1 }) }));
  app = createAuraApp(canvas, { scene: builder, quality: "safe-basic", autoStart: false,
    resize: false, pixelRatio: 1, preserveDrawingBuffer: true, strict: true });
  await app.ready();
}

async function frame(x) {
  app.nodes.require("offline-probe").setPosition(x, 0, 0);
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("The installed consumer did not create a WebGL2 context");
  let pixels;
  for (let i = 0; i < 120; i++) {
    app.step(1 / 60);
    pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (app.diagnostics().drawCalls > 0 && pixels.some((value, index) => index % 4 === 0 && value > 40)) break;
    await new Promise((done) => requestAnimationFrame(done));
  }
  const diagnostic = app.diagnostics();
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  return { width: canvas.width, height: canvas.height, pixels: Array.from(pixels),
    backend: diagnostic.backend, drawCalls: diagnostic.drawCalls, errorCount: diagnostic.errors.length,
    renderer: extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    vendor: extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)) };
}

async function dispose() { if (app) await app.disposeAsync(); if (canvas) canvas.remove(); }
window.__auraOfflineProbe = { start, frame, dispose };
`;

interface Gate extends BrowserGateRecord {
  runId: string;
  sourceInputDigest: string;
  lockfileSha256: string;
  candidatePlan: { path: string; sha256: string };
  archives: { path: string; sha256: string }[];
}
interface Frame {
  width: number; height: number; pixels: number[]; backend: string; drawCalls: number;
  errorCount: number; renderer: string; vendor: string;
}
interface Probe {
  start(): Promise<void>;
  frame(x: number): Promise<Frame>;
  dispose(): Promise<void>;
}
interface RecordedEvent { phase: "control" | "fixture"; event: { url: string; resourceType?: string; method?: string; failure?: string } }

const hash = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const safePath = (root: string, path: string): string => {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Evidence path must be inside the repository");
  return absolute;
};
const contains = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

function frameMetrics(first: Frame, moved: Frame) {
  if (first.width !== 128 || first.height !== 128 || moved.width !== first.width || moved.height !== first.height ||
      first.pixels.length !== 128 * 128 * 4 || moved.pixels.length !== first.pixels.length) throw new Error("Unexpected frame dimensions");
  let redSubjectPixels = 0, changedPixels = 0;
  let centerBefore = 0, centerAfter = 0, cornerBefore = 0, centerSamples = 0, cornerSamples = 0;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4;
    const [r, g, b] = first.pixels.slice(i, i + 3);
    if (r > 35 && r > g * 1.5 && r > b * 1.5) redSubjectPixels++;
    if ([0, 1, 2].reduce((sum, channel) => sum + Math.abs(first.pixels[i + channel]! - moved.pixels[i + channel]!), 0) > 30) changedPixels++;
    if (x >= 58 && x < 70 && y >= 58 && y < 70) {
      centerBefore += r; centerAfter += moved.pixels[i]!; centerSamples++;
    }
    if (x < 12 && y < 12) { cornerBefore += r; cornerSamples++; }
  }
  return { redSubjectPixels, changedPixels, centerBefore: centerBefore / centerSamples,
    centerAfter: centerAfter / centerSamples, cornerBefore: cornerBefore / cornerSamples };
}

async function bundleInstalledConsumer(project: string) {
  const packageRoot = realpathSync(join(project, "node_modules", "@aura3d", "engine"));
  if (!contains(project, packageRoot)) throw new Error("Installed engine resolves outside the isolated consumer");
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { name: string; version: string };
  if (manifest.name !== "@aura3d/engine" || !manifest.version) throw new Error("Invalid installed engine manifest");
  const result = await build({
    stdin: { contents: FIXTURE, resolveDir: project, sourcefile: "native-offline-fixture.js", loader: "js" },
    absWorkingDir: project, bundle: true, write: false, metafile: true, platform: "browser", format: "iife",
    external: NATIVE_BUNDLE_EXTERNALS,
    target: "es2022", tsconfigRaw: { compilerOptions: {} }, logLevel: "silent"
  });
  let engineInputs = 0;
  for (const input of Object.keys(result.metafile.inputs)) {
    if (input === "native-offline-fixture.js" || input === "<stdin>") continue;
    const file = realpathSync(resolve(project, input));
    if (!contains(project, file)) throw new Error("Bundle resolved an input outside the isolated installed consumer");
    if (contains(packageRoot, file)) engineInputs++;
  }
  if (!engineInputs || result.outputFiles.length !== 1) throw new Error("The fixture did not bundle the installed candidate engine");
  return { javascript: result.outputFiles[0]!.text, packageVersion: manifest.version, engineInputs };
}

test.use({ serviceWorkers: "block" });

test("a frozen packed consumer renders and updates with the network offline", async ({ page, context, browser, browserName }, testInfo) => {
  test.setTimeout(180_000);
  const root = process.cwd();
  const runId = process.env.NATIVE_ACCEPTANCE_RUN_ID;
  const gatePath = process.env.AURA3D_CODE_COMPLETE_GATE;
  const sourceReport = process.env.NATIVE_MATRIX_SOURCE_REPORT;
  const candidatePlan = process.env.A3D_RELEASE_PLAN;
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(runId) || !gatePath || !sourceReport || !candidatePlan) {
    throw new Error("NATIVE_ACCEPTANCE_RUN_ID, AURA3D_CODE_COMPLETE_GATE, A3D_RELEASE_PLAN and NATIVE_MATRIX_SOURCE_REPORT are required");
  }
  safePath(root, gatePath);
  const reportPath = safePath(root, process.env.NATIVE_NETWORK_REPORT ?? `tests/reports/native-independence/${runId}/network.json`);
  if (existsSync(reportPath)) throw new Error("The network observation report already exists; use a new run ID");
  const gateModule = await import(pathToFileURL(join(root, "tools/native-capability-gate/index.mjs")).href) as {
    validateAcceptanceGate(input: { root: string; gatePath: string; sourceReport: string }): Gate;
  };
  const gate = bindBrowserGate(() => gateModule.validateAcceptanceGate({ root, gatePath, sourceReport }),
    { candidatePlan, reports: { matrixSourceReport: sourceReport } });
  if (hash(readFileSync(safePath(root, sourceReport))) !== gate.matrixSourceReport?.sha256) throw new Error("Matrix source report changed after gate validation");
  const source = validateSourceMatrixReport(root, sourceReport);
  validateGateMatchesSource(gate, source);
  const project = source.projects.find((entry) => entry.id === "npm-react18-peer-absent");
  if (!project) throw new Error("The required isolated npm consumer is absent from the source matrix");

  const temp = realpathSync(mkdtempSync(join(tmpdir(), "aura3d-offline-consumer-")));
  const recorded: RecordedEvent[] = [];
  const byRequest = new Map<Request, RecordedEvent>();
  let pageErrorCount = 0;
  let phase: RecordedEvent["phase"] = "control";
  let status: "passed" | "failed" = "failed";
  let observation: Record<string, unknown> = {};
  let screenshot: { path: string; sha256: string } | undefined;
  try {
    const installed = await restoreMatrixProject(root, source, project.id, join(temp, "consumer"));
    if (hashConsumerProject(installed) !== project.projectSha256) throw new Error("Restored consumer differs from the source report");
    const fixture = await bundleInstalledConsumer(installed);
    await context.route("**/*", (route) => route.abort("internetdisconnected"));
    await context.routeWebSocket("**/*", async (socket) => {
      recorded.push({ phase, event: { url: socket.url(), resourceType: "websocket", method: "GET", failure: "blocked" } });
      await socket.close();
    });
    context.on("request", (request) => {
      const row: RecordedEvent = { phase, event: { url: request.url(), resourceType: request.resourceType(), method: request.method() } };
      recorded.push(row); byRequest.set(request, row);
    });
    context.on("requestfailed", (request) => { const row = byRequest.get(request); if (row) row.event.failure = "failed"; });
    page.on("pageerror", () => { pageErrorCount++; });
    await page.goto("about:blank");
    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    const rejected = await page.evaluate(async () => {
      try { await fetch("https://aura3d-offline-probe.invalid/control"); return false; } catch { return true; }
    });
    expect(rejected).toBe(true);
    await expect.poll(() => recorded.some((entry) => entry.phase === "control" &&
      entry.event.url === "https://aura3d-offline-probe.invalid/control" && entry.event.failure === "failed")).toBe(true);
    const controls = recorded.filter((entry) => entry.phase === "control").map((entry) => entry.event);
    expect(controls).toHaveLength(1);
    const negativeControlEvent = redactRuntimeNetworkEvents(controls)[0]!;
    expect(negativeControlEvent).toEqual({ url: "https://aura3d-offline-probe.invalid/control", resourceType: "fetch", method: "GET", failure: "failed" });
    phase = "fixture";
    await page.addScriptTag({ content: fixture.javascript });
    const before = await page.evaluate(async () => {
      const probe = (window as unknown as { __auraOfflineProbe: Probe }).__auraOfflineProbe;
      await probe.start();
      return probe.frame(0);
    });
    const after = await page.evaluate(async () => (window as unknown as { __auraOfflineProbe: Probe }).__auraOfflineProbe.frame(0.8));
    const metrics = frameMetrics(before, after);
    const screenshotPath = testInfo.outputPath("offline-packed-consumer.png");
    const png = await page.screenshot({ path: screenshotPath });
    screenshot = { path: relative(root, screenshotPath).split(sep).join("/"), sha256: hash(png) };
    await testInfo.attach("offline-packed-consumer", { path: screenshotPath, contentType: "image/png" });
    const userAgent = await page.evaluate(() => navigator.userAgent);
    await page.evaluate(async () => (window as unknown as { __auraOfflineProbe: Probe }).__auraOfflineProbe.dispose());
    // Give requests started by final cleanup a turn to reach the observer.
    await page.evaluate(() => new Promise<void>((done) => setTimeout(done, 100)));
    await page.close();
    const events = redactRuntimeNetworkEvents(recorded.filter((entry) => entry.phase === "fixture").map((entry) => entry.event));
    const network = inspectRuntimeNetwork(events);
    observation = { offline: true, negativeControlBlocked: true, negativeControlEvent, fixtureSha256: hash(FIXTURE), bundleSha256: hash(fixture.javascript),
      installedPackageVersion: fixture.packageVersion, engineInputs: fixture.engineInputs, projectId: project.id,
      projectSha256: project.projectSha256, browserName, browserVersion: browser.version(), browserProject: testInfo.project.name,
      userAgent, os: `${process.platform}-${process.arch}`, backend: before.backend, renderer: before.renderer, vendor: before.vendor,
      drawCallsBefore: before.drawCalls, drawCallsAfter: after.drawCalls, metrics, screenshot };
    expect(before.backend).toBe("webgl2");
    expect(after.backend).toBe("webgl2");
    expect(before.drawCalls).toBeGreaterThan(0);
    expect(after.drawCalls).toBeGreaterThan(0);
    expect(before.errorCount).toBe(0);
    expect(after.errorCount).toBe(0);
    expect(pageErrorCount).toBe(0);
    expect(metrics.redSubjectPixels).toBeGreaterThan(200);
    expect(metrics.changedPixels).toBeGreaterThan(200);
    expect(metrics.centerBefore).toBeGreaterThan(metrics.cornerBefore + 30);
    expect(metrics.centerBefore).toBeGreaterThan(metrics.centerAfter + 20);
    expect(events).toEqual([]);
    expect(network.unexpected).toEqual([]);
    status = "passed";
  } finally {
    try {
      try { if (!page.isClosed()) await page.close(); } finally {
        const events: RuntimeNetworkEvent[] = redactRuntimeNetworkEvents(recorded.filter((entry) => entry.phase === "fixture").map((entry) => entry.event));
        const report = {
          schema: "aura3d.native-runtime-network/1", runId,
          candidate: { sourceSha256: gate.sourceInputDigest, sourceRunId: gate.runId, lockfileSha256: gate.lockfileSha256,
            candidatePlanSha256: gate.candidatePlan.sha256, archives: gate.archives },
          tests: [{ id: "native-offline-independence", status, ...observation }], events
        };
        mkdirSync(dirname(reportPath), { recursive: true });
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
        await testInfo.attach("offline-network-observations", { path: reportPath, contentType: "application/json" });
      }
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
});
