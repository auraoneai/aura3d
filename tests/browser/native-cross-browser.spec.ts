import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { expect, test } from "@playwright/test";
import {
  createNativeBrowserFixture,
  NATIVE_BROWSER_FIXTURE_ID,
  NATIVE_BROWSER_FIXTURE_LICENSE,
  NATIVE_BROWSER_FIXTURE_SHA256,
  NATIVE_BROWSER_FIXTURE_URL,
  NATIVE_BROWSER_SCENARIOS,
  validateNativeBrowserEvidence,
  type NativeBrowserEvidence,
  type NativeBrowserScenario,
  type NativeBrowserScenarioName,
  type NativeCrossBrowserHarness,
} from "./native-cross-browser-harness";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __AURA3D_NATIVE_MATRIX__?: {
      mount(): Promise<NativeCrossBrowserHarness>;
      runWorker(): Promise<NativeBrowserScenario>;
      app?: NativeCrossBrowserHarness;
    };
  }
}

const route = "/__aura3d_native_matrix__/index.html";
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Aura3D browser matrix</title></head>
<body><script type="module">
import { mountNativeCrossBrowserHarness, runNativeWorkerScenario } from "/tests/browser/native-cross-browser-harness.ts";
window.__AURA3D_NATIVE_MATRIX__ = { mount: mountNativeCrossBrowserHarness, runWorker: runNativeWorkerScenario };
</script></body></html>`;

test.describe("native public cross-browser workloads", () => {
  let server: ExampleDevServer | undefined;
  let runIdentity: Record<string, unknown>;

  test.beforeAll(async () => {
    // The remote launcher validates this before provisioning, and this guard
    // also protects a direct Playwright invocation before the server starts.
    const gate = process.env.AURA3D_CODE_COMPLETE_GATE?.trim();
    if (!gate) throw new Error("AURA3D_CODE_COMPLETE_GATE is required before browser acceptance.");
    const runId = process.env.AURA3D_RUN_ID?.trim();
    if (!runId) throw new Error("AURA3D_RUN_ID is required before browser acceptance.");
    execFileSync(process.execPath, ["tools/native-capability-gate/index.mjs", "--phase", "acceptance", "--gate", gate], { stdio: "pipe" });
    const gateBytes = readFileSync(gate);
    const candidate = JSON.parse(gateBytes.toString("utf8")) as Record<string, unknown>;
    runIdentity = {
      runId, gateSha256: createHash("sha256").update(gateBytes).digest("hex"),
      freezeCommit: candidate.freezeCommit, sourceInputDigest: candidate.sourceInputDigest, lockfileSha256: candidate.lockfileSha256,
      candidatePlan: candidate.candidatePlan, archives: candidate.archives,
      sourceConsumerReport: candidate.sourceConsumerReport, matrixSourceReport: candidate.matrixSourceReport
    };
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("runs typed model rendering, DOM, input, controls, worker and teardown", async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000);
    if (!server) throw new Error("Browser fixture server was not started.");
    const bytes = createNativeBrowserFixture();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(NATIVE_BROWSER_FIXTURE_SHA256);

    const project = testInfo.project;
    const browserName = browser.browserType().name();
    const explicitExecutable = project.use.launchOptions?.executablePath;
    const distribution = explicitExecutable
      ? `Custom ${browserName} executable: ${explicitExecutable}`
      : `Playwright ${browserName}${project.use.channel ? ` (${project.use.channel} channel)` : ""}`;
    const flags = project.metadata.customFeatureFlags;
    if (!Array.isArray(flags) || flags.some((flag) => typeof flag !== "string")) throw new Error(`Browser project ${project.name} must declare its configured custom launch arguments.`);
    const evidence: NativeBrowserEvidence = {
      schema: "aura3d.native-browser/1",
      project: project.name,
      evidenceKind: project.name === "chromium-software" ? "software" : project.name === "chromium-experimental" ? "experimental" : "automation",
      deviceClass: "unverified",
      browser: { distribution, executableVersion: browser.version() },
      os: operatingSystem(),
      backend: "unavailable: public renderer has not mounted",
      adapter: { unavailableReason: "Public renderer has not mounted." },
      driver: { unavailableReason: "Public renderer has not mounted." },
      featureFlags: flags,
      browserLaunchArguments: { unavailableReason: "Playwright does not expose the complete effective argument list consistently across browser families." },
      fixture: { id: NATIVE_BROWSER_FIXTURE_ID, sha256: NATIVE_BROWSER_FIXTURE_SHA256, license: NATIVE_BROWSER_FIXTURE_LICENSE, byteLength: bytes.byteLength },
      scenarios: NATIVE_BROWSER_SCENARIOS.map((name) => ({ name, status: "skipped", reason: "Workload did not start." })),
    };
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const setResult = (scenario: NativeBrowserScenario): void => {
      const index = evidence.scenarios.findIndex((item) => item.name === scenario.name);
      if (index >= 0) evidence.scenarios[index] = scenario;
    };
    const fail = (name: NativeBrowserScenarioName, error: unknown): void => setResult({ name, status: "failed", reason: message(error) });
    let mounted = false;
    try {
      await page.route(`**${route}`, (request) => request.fulfill({ status: 200, contentType: "text/html", body: html }));
      await page.route(`**${NATIVE_BROWSER_FIXTURE_URL}`, (request) => request.fulfill({ status: 200, contentType: "model/gltf-binary", body: Buffer.from(bytes) }));
      await page.goto(`${server.origin}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(window.__AURA3D_NATIVE_MATRIX__), undefined, { timeout: 30_000 });
      try {
        await page.evaluate(async () => {
          const api = window.__AURA3D_NATIVE_MATRIX__!;
          api.app = await api.mount();
        });
        mounted = true;
        const dom = await page.evaluate(() => {
          const app = window.__AURA3D_NATIVE_MATRIX__!.app!;
          return { canvasConnected: app.canvas.isConnected, host: app.canvas.parentElement?.id, width: app.canvas.width, height: app.canvas.height };
        });
        if (dom.canvasConnected && dom.host === "native-cross-browser-host" && dom.width > 0 && dom.height > 0) {
          setResult({ name: "dom", status: "passed", details: dom });
        } else fail("dom", `The public app did not attach a usable DOM canvas: ${JSON.stringify(dom)}`);

        try {
          const observed = await page.evaluate(() => window.__AURA3D_NATIVE_MATRIX__!.app!.observe());
          evidence.backend = observed.backend;
          evidence.adapter = observed.adapter;
          evidence.driver = observed.driver;
          if (observed.adapter.value && /swiftshader|llvmpipe|softpipe|software raster|software render/i.test(observed.adapter.value)) evidence.deviceClass = "software";
          if (observed.backend === "webgl2" && observed.drawCalls > 0 && observed.foregroundPixels > 200 && observed.errors.length === 0) {
            setResult({ name: "rendering", status: "passed", details: observed });
          } else fail("rendering", `Public renderer failed to produce the expected WebGL2 frame: ${JSON.stringify(observed)}`);
          if (observed.importedAsset && observed.foregroundPixels > 200) {
            setResult({ name: "asset", status: "passed", details: { id: NATIVE_BROWSER_FIXTURE_ID, importedAsset: true, foregroundPixels: observed.foregroundPixels } });
          } else fail("asset", `Typed GLB was not loaded and rendered: ${JSON.stringify(observed)}`);
        } catch (error) {
          fail("rendering", error);
          fail("asset", error);
        }

        try {
          const canvas = page.locator("#native-cross-browser-host canvas");
          await canvas.focus();
          const box = await canvas.boundingBox();
          if (!box) throw new Error("Input canvas has no bounding box.");
          await page.keyboard.down("KeyA");
          await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 3 + 55, box.y + box.height / 2 + 10, { steps: 3 });
          const input = await page.evaluate(() => window.__AURA3D_NATIVE_MATRIX__!.app!.sampleInput());
          await page.mouse.up();
          await page.keyboard.up("KeyA");
          if (input.keyDown && input.pointerDown && Math.abs(input.orbitAfter - input.orbitBefore) > 0.001) {
            setResult({ name: "input", status: "passed", details: input });
          } else fail("input", `Public input and orbit controls did not react to keyboard and pointer events: ${JSON.stringify(input)}`);
        } catch (error) { fail("input", error); }
      } catch (error) {
        const reason = message(error);
        if (/WebGL2 context unavailable/i.test(reason)) {
          setResult({ name: "rendering", status: "unsupported", reason });
          for (const name of ["asset", "dom", "input", "lifecycle"] as const) setResult({ name, status: "skipped", reason: `Renderer could not mount: ${reason}` });
        } else {
          fail("rendering", error);
          for (const name of ["asset", "dom", "input", "lifecycle"] as const) setResult({ name, status: "skipped", reason: `Renderer mount failed: ${reason}` });
        }
      }

      try {
        setResult(await page.evaluate(() => window.__AURA3D_NATIVE_MATRIX__!.runWorker()));
      } catch (error) { fail("worker", error); }
    } catch (error) {
      const reason = message(error);
      fail("dom", error);
      for (const name of ["rendering", "asset", "input", "worker", "lifecycle"] as const) setResult({ name, status: "skipped", reason: `Fixture page could not initialize: ${reason}` });
    } finally {
      if (mounted) {
        try {
          const outcome = await page.evaluate(async () => {
            const app = window.__AURA3D_NATIVE_MATRIX__!.app!;
            await app.dispose();
            return app.dispose();
          });
          if (outcome.canvasDetached && outcome.controlsDisposed && outcome.inputDetached && outcome.appRejectedAfterDispose) {
            setResult({ name: "lifecycle", status: "passed", details: outcome });
          } else fail("lifecycle", `Disposal failed: ${JSON.stringify(outcome)}`);
        } catch (error) { fail("lifecycle", error); }
      }
      if (pageErrors.length) {
        const existing = evidence.scenarios.find((item) => item.name === "dom");
        setResult({ name: "dom", status: "failed", reason: `Uncaught browser errors: ${pageErrors.join("; ")}`, details: { previousStatus: existing?.status } });
      }
      await testInfo.attach("native-browser-evidence", { body: Buffer.from(JSON.stringify({ ...evidence, runIdentity }, null, 2)), contentType: "application/json" });
    }
    expect(validateNativeBrowserEvidence(evidence)).toEqual([]);
    for (const name of ["rendering", "dom", "input", "asset", "lifecycle"] as const) {
      expect(evidence.scenarios.find((scenario) => scenario.name === name), `${name} must complete on this project`).toMatchObject({ status: "passed" });
    }
    expect(["passed", "unsupported"]).toContain(evidence.scenarios.find((scenario) => scenario.name === "worker")?.status);
  });
});

function message(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function operatingSystem(): NativeBrowserEvidence["os"] {
  const base = { name: platform(), version: "unavailable", architecture: arch(), kernel: release() };
  if (platform() === "linux") {
    try {
      const fields = Object.fromEntries(readFileSync("/etc/os-release", "utf8").split(/\r?\n/).flatMap((line) => {
        const match = /^([A-Z_]+)=(.*)$/.exec(line);
        if (!match) return [];
        return [[match[1], match[2].replace(/^['"]|['"]$/g, "")]];
      }));
      if (fields.NAME && fields.VERSION_ID) return { ...base, name: fields.NAME, version: fields.VERSION_ID };
    } catch { /* record unavailable distribution independently of kernel */ }
  } else if (platform() === "darwin") {
    try { return { ...base, name: "macOS", version: execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim() }; }
    catch { /* record unavailable distribution independently of kernel */ }
  }
  return { ...base, version: "unavailable: distribution version not exposed", versionUnavailableReason: "The runner did not expose an operating system distribution version." };
}
