import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { expect, test, type Browser, type Response } from "@playwright/test";
import type { NativeCodeCompleteGate } from "../../tools/native-capability-gate/index.mjs";
import type { NativePerformanceReport } from "../../tools/performance/native-budget";
import type { CandidateIdentity } from "../../tools/performance/native-benchmark";
import { NATIVE_WORKLOADS, type NativeWorkload, type runNativeWorkload } from "../../tools/performance/native-workloads";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type ProbeResult = Awaited<ReturnType<typeof runNativeWorkload>>;
type Session = { id: string; timedFrames: number; metrics: Record<string, number | null>; unavailable: Record<string, string>; details: unknown };
type ProbeReport = NativePerformanceReport & {
  candidate: CandidateIdentity; deviceEvidence: unknown; browserLaunchOptionsSha256: string; workload: NativeWorkload;
};

const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
// Match the analyzer: each entry is UTF-8 `${tag}:${byteLength}\n`, followed
// by exactly byteLength raw bytes. File order and tags are part of the format.
function workloadDigest(workload: NativeWorkload): string {
  const hash = createHash("sha256");
  const entries: Array<[string, Buffer]> = [
    ["native-workloads.ts", readFileSync(resolve("tools/performance/native-workloads.ts"))],
    ["native-performance-probe.spec.ts", readFileSync(resolve("tests/browser/native-performance-probe.spec.ts"))],
    ["GPUProfiler.ts", readFileSync(resolve("packages/debug/src/GPUProfiler.ts"))],
    ["definition", Buffer.from(JSON.stringify(workload), "utf8")]
  ];
  for (const [tag, bytes] of entries) hash.update(`${tag}:${bytes.length}\n`).update(bytes);
  return hash.digest("hex");
}
const count = (record: Record<string, number>) => Object.values(record).reduce((sum, value) => sum + value, 0);

function addSummary(metrics: Session["metrics"], unavailable: Session["unavailable"], prefix: string,
  summary: { p50: number; p95: number; p99: number } | null, reason: string) {
  for (const [suffix, key] of [["P50Ms", "p50"], ["P95Ms", "p95"], ["P99Ms", "p99"]] as const) {
    metrics[`${prefix}${suffix}`] = summary?.[key] ?? null;
    if (!summary) unavailable[`${prefix}${suffix}`] = reason;
  }
}

async function measureTransfers(responses: readonly Response[], failedRequests: readonly string[]) {
  // The development server serves uncompressed source modules. Compression is
  // computed after the timed frames, once per decoded body, not during rendering.
  let rawBytes = 0, gzipBytes = 0, brotliBytes = 0;
  const errors = [...failedRequests];
  for (const response of responses) {
    if (response.status() < 200 || response.status() >= 300) {
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      continue;
    }
    try {
      const body = await response.body();
      rawBytes += body.length;
      gzipBytes += gzipSync(body).length;
      brotliBytes += brotliCompressSync(body).length;
    } catch (error) {
      errors.push(`body unavailable for ${new URL(response.url()).pathname}: ${String(error)}`);
    }
  }
  return { rawBytes: errors.length ? null : rawBytes, gzipBytes: errors.length ? null : gzipBytes,
    brotliBytes: errors.length ? null : brotliBytes, errors };
}

async function session(browser: Browser, origin: string, spec: NativeWorkload, runId: string, sessionNumber: number): Promise<{ session: Session; adapter: string | null; backend: string }> {
  const context = await browser.newContext({ viewport: { width: spec.viewport.width, height: spec.viewport.height }, deviceScaleFactor: spec.viewport.dpr });
  try {
    const page = await context.newPage();
    const responses: Response[] = [];
    const failed: string[] = [];
    const errors: string[] = [];
    let requestCount = 0;
    page.on("request", () => { requestCount++; });
    page.on("response", (response) => responses.push(response));
    page.on("requestfailed", (request) => failed.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? "request failed"}`));
    page.on("pageerror", (error) => errors.push(error.message));
    const path = "/tests/browser/native-performance-probe.html";
    await page.route(`**${path}`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><body><script type="module">
    window.__AURA_NATIVE_PERF__ = { status: "running" };
    try {
      const module = await import("/tools/performance/native-workloads.ts");
      window.__AURA_NATIVE_PERF__ = { status: "complete", value: await module.runNativeWorkload(${JSON.stringify(spec.id)}) };
    } catch (error) { window.__AURA_NATIVE_PERF__ = { status: "error", error: String(error?.stack ?? error) }; }
  </script></body>` }));
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const status = (window as unknown as { __AURA_NATIVE_PERF__?: { status: string } }).__AURA_NATIVE_PERF__?.status;
      return status === "complete" || status === "error";
    }, undefined, { timeout: 900_000 });
    const result = await page.evaluate(() => (window as unknown as { __AURA_NATIVE_PERF__: { status: string; value?: ProbeResult; error?: string } }).__AURA_NATIVE_PERF__);
    if (result.status !== "complete" || !result.value || errors.length) throw new Error([result.error, ...errors].filter(Boolean).join("\n") || "Browser workload failed");
    const data = result.value;
    if (data.timedFrames !== spec.timedFrames) throw new Error(`Expected ${spec.timedFrames} frames; received ${data.timedFrames}`);
    const transfers = await measureTransfers(responses, failed);
    const metrics: Session["metrics"] = { startupMs: data.startupMs, heapBytes: data.heapBytes, requestCount,
      rawBytes: transfers.rawBytes, gzipBytes: transfers.gzipBytes, brotliBytes: transfers.brotliBytes,
      liveResources: count(data.liveBeforeDispose.live), resourcesAfterDispose: count(data.liveAfterDispose.live),
      glAllocations: count(data.liveBeforeDispose.allocations), drawCalls: data.diagnostics.drawCalls,
      gpuResidentBytes: null, jsAllocations: null, cpuThreadTimeMs: null,
      bundleRawBytes: null, bundleGzipBytes: null, bundleBrotliBytes: null, installedBytes: null };
    const unavailable: Session["unavailable"] = {
      gpuResidentBytes: "WebGL does not expose actual device-resident memory bytes",
      jsAllocations: "The browser does not expose a complete JavaScript allocation count",
      cpuThreadTimeMs: "The browser does not expose per-frame process CPU time; cpuP* are synchronous wall durations",
      bundleRawBytes: "Production bundle size is measured separately from this source-server workload",
      bundleGzipBytes: "Production bundle size is measured separately from this source-server workload",
      bundleBrotliBytes: "Production bundle size is measured separately from this source-server workload",
      installedBytes: "Installed package bytes are measured separately from this source-server workload"
    };
    if (data.heapBytes === null) unavailable.heapBytes = "performance.memory.usedJSHeapSize is unavailable in this browser";
    if (transfers.errors.length) for (const name of ["rawBytes", "gzipBytes", "brotliBytes"]) unavailable[name] = `Incomplete response bodies: ${transfers.errors.join("; ")}`;
    addSummary(metrics, unavailable, "frame", data.frame, "No complete frame pacing samples");
    addSummary(metrics, unavailable, "cpu", data.cpuWall, "No synchronous step duration samples");
    addSummary(metrics, unavailable, "gpu", data.gpu.summary, data.gpu.unavailable ?? "No complete device timer results");
    return { adapter: data.adapter, backend: data.diagnostics.backend, session: {
      id: `${runId}/${spec.id}/session-${sessionNumber}/${randomUUID()}`, timedFrames: data.timedFrames, metrics, unavailable,
      details: { frame: data.frame, cpuWall: data.cpuWall, gpu: data.gpu, workloadEvidence: data.workloadEvidence, liveBeforeDispose: data.liveBeforeDispose,
        liveAfterDispose: data.liveAfterDispose, diagnostics: data.diagnostics, transferErrors: transfers.errors,
        methods: { frame: "requestAnimationFrame intervals", cpu: "performance.now around synchronous app.step; wall duration, not thread CPU time",
          gpu: "asynchronous EXT_disjoint_timer_query_webgl2, nanoseconds converted to milliseconds",
          resources: "observed WebGL create/delete handles, not GPU residency", bytes: "sum of decoded response bodies and independently gzip/Brotli-compressed bodies after timing" } }
    } };
  } finally { await context.close(); }
}

test.describe("Native performance workloads (acceptance only)", () => {
  let server: ExampleDevServer | undefined;
  let gate: NativeCodeCompleteGate;
  let runId: string;
  let directory: string;
  test.beforeAll(async ({}, testInfo) => {
    // Gate validation rehashes the frozen source and reports before any job.
    test.setTimeout(600_000);
    const gatePath = process.env.AURA3D_CODE_COMPLETE_GATE;
    if (!gatePath) throw new Error("AURA3D_CODE_COMPLETE_GATE is required before performance acceptance");
    // The gate is validated before the server starts or any browser fixture is requested.
    const validator = await import("../../tools/native-capability-gate/index.mjs");
    gate = validator.validateAcceptanceGate({ root: process.cwd(), gatePath });
    runId = process.env.NATIVE_ACCEPTANCE_RUN_ID ?? "";
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(runId)) throw new Error("NATIVE_ACCEPTANCE_RUN_ID must be a safe, unique acceptance run ID");
    const project = process.env.AURA3D_BROWSER_PROJECT;
    if (!project || project !== testInfo.project.name || !["chromium-automation", "firefox-automation", "webkit-automation",
      "chromium-gpu-headless", "chromium-software", "chromium-experimental"].includes(project)) {
      throw new Error("AURA3D_BROWSER_PROJECT must explicitly match the selected native acceptance project");
    }
    if (testInfo.project.use.headless === false) throw new Error("Native performance acceptance requires a headless browser project");
    const expectedOutput = `tests/reports/native-performance/${runId}/manifest.json`;
    if (process.env.NATIVE_MEASUREMENT_REPORT && process.env.NATIVE_MEASUREMENT_REPORT !== expectedOutput) throw new Error(`NATIVE_MEASUREMENT_REPORT must be ${expectedOutput}`);
    for (const workload of NATIVE_WORKLOADS) if (workload.asset) {
      const actual = digest(readFileSync(resolve(workload.asset.url.slice(1))));
      if (actual !== workload.asset.sha256) throw new Error(`Asset digest mismatch for ${workload.id}`);
    }
    const reportRoot = resolve("tests/reports/native-performance");
    mkdirSync(reportRoot, { recursive: true });
    directory = resolve(reportRoot, runId);
    // A non-recursive mkdir reserves this run atomically, including across
    // concurrent workers. Never overwrite an earlier or partial report.
    mkdirSync(directory);
    server = await startExampleDevServer();
  });
  test.afterAll(async () => { await server?.close(); });

  test("collect seven workloads across three independent browser sessions", async ({ playwright }, testInfo) => {
    test.setTimeout(5_400_000);
    const browserName = testInfo.project.use.browserName ?? "chromium";
    const browserType = playwright[browserName];
    const launchOptions = { ...testInfo.project.use.launchOptions, headless: true,
      ...(testInfo.project.use.channel ? { channel: testInfo.project.use.channel } : {}) };
    // Include the selected configuration in the comparison identity without
    // disclosing possible environment values inside the launch options.
    const launchOptionsSha256 = digest(JSON.stringify(launchOptions));
    const candidate: CandidateIdentity = { sourceSha256: gate.sourceInputDigest, sourceRunId: gate.runId,
      lockfileSha256: gate.lockfileSha256, candidatePlanSha256: gate.candidatePlan.sha256, archives: gate.archives };
    const workloads: Array<{ id: string; workloadSha256: string; report: string; sha256: string }> = [];
    const failures: string[] = [];
    for (const spec of NATIVE_WORKLOADS) {
      try {
        const hash = workloadDigest(spec);
        const observations: Array<Awaited<ReturnType<typeof session>> & { browserName: string; browserVersion: string }> = [];
        for (let index = 1; index <= 3; index++) {
          const browser = await browserType.launch(launchOptions);
          try {
            const observation = await session(browser, server!.origin, spec, runId, index);
            observations.push({ ...observation, browserName: browser.browserType().name(), browserVersion: browser.version() });
          } finally {
            await browser.close();
          }
        }
        const first = observations[0]!;
        if (observations.some((observation) => observation.adapter !== first.adapter || observation.backend !== first.backend ||
          observation.browserName !== first.browserName || observation.browserVersion !== first.browserVersion)) {
          throw new Error("Browser, version, backend or adapter changed between independent sessions");
        }
        if (hash !== workloadDigest(spec)) throw new Error("Workload or instrumentation changed during measurement");
        const report: ProbeReport = { schema: "aura3d.native-performance/1", runId, candidate, baselineVersion: gate.freezeCommit, identity: {
          workloadId: spec.id, workloadSha256: hash, assetSha256: spec.asset?.sha256 ?? null,
          seed: spec.seed, look: spec.look, quality: spec.quality, viewport: spec.viewport,
          browser: `${first.browserName}/${testInfo.project.name}/${launchOptionsSha256}`, browserVersion: first.browserVersion,
          os: `${platform()} ${release()} ${arch()}`, backend: first.backend,
          device: process.env.NATIVE_PERF_DEVICE || "unavailable", adapter: first.adapter, driver: process.env.NATIVE_PERF_DRIVER || null
        }, sessions: observations.map((observation) => observation.session),
        deviceEvidence: { adapterSource: first.adapter ? "WEBGL_debug_renderer_info" : "unavailable", deviceSource: process.env.NATIVE_PERF_DEVICE ? "runner-supplied stable identity" : "unavailable",
          hardwareStatus: /swiftshader|llvmpipe|softpipe|lavapipe|software/i.test(first.adapter ?? "") ? "software" : "unverified", driverSource: process.env.NATIVE_PERF_DRIVER ? "runner-supplied" : "unavailable" },
        browserLaunchOptionsSha256: launchOptionsSha256, workload: spec };
        const filename = `${spec.id}.json`;
        const serialized = `${JSON.stringify(report, null, 2)}\n`;
        writeFileSync(resolve(directory, filename), serialized, { flag: "wx" });
        workloads.push({ id: spec.id, workloadSha256: hash, report: filename, sha256: digest(serialized) });
      } catch (error) { failures.push(`${spec.id}: ${String(error)}`); }
    }
    const manifest = { schema: "aura3d.native-performance-manifest/1", runId, candidate,
      status: failures.length ? "partial" : "complete", workloads, failures };
    writeFileSync(resolve(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    expect(failures, failures.join("\n")).toEqual([]);
    expect(workloads).toHaveLength(NATIVE_WORKLOADS.length);
  });
});
