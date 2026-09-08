import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  analyzePerfBloomPair,
  BLOOM_PERF_QUALITY_LIMITS,
  validatePerfBloomQuality,
  validateEnginePerfReport
} from "./muse3jsparity-301-engine-perf-contract";
import type { EnginePerfResult, Engine, Workload } from "./muse3jsparity-301-engine-perf-harness";

const REPORT_DIR = resolve("tests/reports/muse3jsparity");
const REPORT_PATH = resolve(REPORT_DIR, "engine-perf-301.json");
const BLOOM_FRAGMENT = resolve(REPORT_DIR, "engine-perf-301-bloom-quality.json");
const WORKLOADS = ["bloomChain", "instance4k", "light64", "particle10k"] as const satisfies readonly Workload[];
const workloadFragment = (workload: Workload) => resolve(REPORT_DIR, `engine-perf-301-${workload}.json`);

interface WorkloadFragment {
  readonly generatedAt: string;
  readonly workload: Workload;
  readonly engines: Partial<Record<Engine, EnginePerfResult>>;
  readonly failures: readonly string[];
  readonly errors: readonly string[];
}

/** Actual engine measurements; raw-WebGL microbenchmarks cannot satisfy this producer. */
test.describe("3.0.1 V02 actual engine comparative performance", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIR, { recursive: true });
  });

  test.afterAll(async () => { await server.close(); });

  test("retains equivalent bloom output quality for both measured engines", async ({ page }, testInfo) => {
    testInfo.setTimeout(900_000);
    expect(JSON.parse(readFileSync(resolve("node_modules/three/package.json"), "utf8")).version).toBe("0.185.1");
    rmSync(REPORT_PATH, { force: true });
    rmSync(BLOOM_FRAGMENT, { force: true });
    for (const workload of WORKLOADS) rmSync(workloadFragment(workload), { force: true });

    const failures: string[] = [];
    const errors = captureErrors(page);
    const bloomQuality: any = {
      limits: BLOOM_PERF_QUALITY_LIMITS,
      artifacts: [],
      input: {
        viewport: [640, 360], radiance: 6, threshold: 1, strength: 1,
        radius: 1, exposure: 1, toneMapping: "aces", outputColorSpace: "srgb"
      }
    };
    for (const engine of ["aura", "three"] as const) {
      const captures: any = {};
      for (const enabled of [false, true]) {
        console.log(`V02_STAGE bloom-quality/${engine}/${enabled ? "on" : "off"}`);
        await openHarness(page, server);
        try {
          const capture = await page.evaluate(
            async ({ engine, enabled }) => window.__AURA301_ENGINE_PERF__!.captureBloom(engine, enabled),
            { engine, enabled }
          );
          captures[enabled ? "on" : "off"] = capture;
          const path = `tests/reports/muse3jsparity/engine-perf-bloom-${engine}-${enabled ? "on" : "off"}.png`;
          writeFileSync(resolve(path), Buffer.from(capture.png.split(",")[1]!, "base64"));
          bloomQuality.artifacts.push({
            path,
            sha256: createHash("sha256").update(readFileSync(resolve(path))).digest("hex")
          });
        } catch (error) {
          failures.push(`bloom-quality/${engine}/${enabled}: ${String(error)}`);
        }
      }
      if (captures.on && captures.off) {
        bloomQuality[engine] = {
          ...analyzePerfBloomPair(captures.off.pixels, captures.on.pixels),
          observation: captures.on.observation
        };
      }
    }
    failures.push(...validatePerfBloomQuality(bloomQuality));
    const fragment = { generatedAt: new Date().toISOString(), bloomQuality, failures, errors };
    writeFileSync(BLOOM_FRAGMENT, `${JSON.stringify(fragment, null, 2)}\n`);
    await testInfo.attach("engine-performance-bloom-quality", { path: BLOOM_FRAGMENT, contentType: "application/json" });
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
  });

  for (const [index, workload] of WORKLOADS.entries()) {
    test(`retains repeated GPU-completed ${workload} engine frames`, async ({ page }, testInfo) => {
      // Each pair retains three 30-frame warmups and three 60-frame measured
      // trials per engine. Isolating pairs prevents a later workload from
      // discarding already completed same-machine evidence.
      testInfo.setTimeout(1_800_000);
      const failures: string[] = [];
      const errors = captureErrors(page);
      const engines: Partial<Record<Engine, EnginePerfResult>> = {};
      for (const engine of (index % 2 ? ["three", "aura"] : ["aura", "three"]) as Engine[]) {
        console.log(`V02_STAGE timing/${workload}/${engine}`);
        await openHarness(page, server);
        try {
          engines[engine] = await page.evaluate(
            async ({ engine, workload }) => window.__AURA301_ENGINE_PERF__!.run(engine, workload),
            { engine, workload }
          );
        } catch (error) {
          failures.push(`${workload}/${engine}: ${String(error)}`);
        }
      }
      const fragment: WorkloadFragment = {
        generatedAt: new Date().toISOString(), workload, engines, failures, errors
      };
      const path = workloadFragment(workload);
      writeFileSync(path, `${JSON.stringify(fragment, null, 2)}\n`);
      await testInfo.attach(`engine-performance-${workload}`, { path, contentType: "application/json" });
      assertWorkload(fragment);
      expect(failures).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("assembles and validates the complete actual-engine comparison", async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    expect(existsSync(BLOOM_FRAGMENT), "Bloom quality fragment must come from this producer run").toBe(true);
    const bloom = JSON.parse(readFileSync(BLOOM_FRAGMENT, "utf8")) as {
      bloomQuality: unknown; failures: string[]; errors: string[];
    };
    const fragments = WORKLOADS.map((workload) => {
      const path = workloadFragment(workload);
      expect(existsSync(path), `Missing completed ${workload} fragment`).toBe(true);
      return JSON.parse(readFileSync(path, "utf8")) as WorkloadFragment;
    });
    const workloads = fragments.map(({ workload, engines }) => ({ workload, engines }));
    const failures = [...bloom.failures, ...fragments.flatMap((fragment) => fragment.failures)];
    const errors = [...bloom.errors, ...fragments.flatMap((fragment) => fragment.errors)];
    const report = {
      schema: "aura3d.engine-perf-301/v1",
      producer: "tests/browser/muse3jsparity-301-engine-perf.spec.ts",
      generatedAt: new Date().toISOString(),
      complete: false,
      workloads,
      failures,
      errors,
      bloomQuality: bloom.bloomQuality,
      measurement: {
        completion: "WebGL fenceSync flushed and polled to signaled; separate 1px readback",
        cpuSubmission: "Synchronous invocation prefix before promise await; engineCallAwaitMs separately records full awaited engine call",
        textureStorage: "Observed texture allocations only; excludes renderbuffers, geometry buffers and shader memory",
        samplesPerTrial: 60,
        warmupPerTrial: 30,
        trials: 3,
        claim: "Same-machine fixed-workload comparison; no universal hardware claim. GPU completion is elapsed queue drain, not isolated GPU timer-query duration."
      },
      governor: { complete: false, reason: "Separate actual overloaded root governor resource-change evidence is required." },
      comparison: workloads.map(({ workload, engines }) => comparisonRow(workload, engines))
    };
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    await testInfo.attach("actual-engine-performance-attempt", { path: REPORT_PATH, contentType: "application/json" });
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    const candidate = { ...report, complete: true };
    expect(validateEnginePerfReport(candidate)).toEqual([]);
    writeFileSync(REPORT_PATH, `${JSON.stringify(candidate, null, 2)}\n`);
    await testInfo.attach("actual-engine-performance-verified", { path: REPORT_PATH, contentType: "application/json" });
  });
});

async function openHarness(page: Page, server: ExampleDevServer): Promise<void> {
  await page.goto(`${server.origin}/tests/browser/muse3jsparity-301-engine-perf-harness.html`);
  await page.waitForFunction(() => Boolean(window.__AURA301_ENGINE_PERF__), undefined, { timeout: 120_000 });
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().startsWith("V02_STAGE ")) console.log(message.text());
  });
  return errors;
}

function assertWorkload(fragment: WorkloadFragment): void {
  const { workload, engines } = fragment;
  expect(engines.aura?.qualityFingerprint).toBe(engines.three?.qualityFingerprint);
  expect(engines.aura?.hardware).toBe(engines.three?.hardware);
  for (const engine of ["aura", "three"] as const) {
    const result = engines[engine]!;
    expect(result.trials).toHaveLength(3);
    expect(result.adaptation).toEqual([]);
    for (const trial of result.trials) {
      expect(trial.samples).toHaveLength(60);
      for (const sample of trial.samples) {
        expect(sample.native.drawCalls).toBeGreaterThan(0);
        expect(sample.completedFrameMs).toBeGreaterThan(0);
        if (workload === "instance4k") expect(sample.native.maxDrawInstances).toBe(4000);
        if (workload === "particle10k") {
          expect(sample.liveParticles).toBe(10000);
          expect(sample.native.triangles).toBe(20000);
        }
        if (workload === "bloomChain") expect(sample.textureStorageBytes).toBeGreaterThan(640 * 360 * 8);
      }
    }
    if (workload === "light64") expect(result.effectiveLights).toBe(64);
  }
}

function comparisonRow(workload: Workload, engines: Partial<Record<Engine, EnginePerfResult>>) {
  const aura = engines.aura?.trials.flatMap((trial) => trial.samples.map((sample) => sample.completedFrameMs));
  const three = engines.three?.trials.flatMap((trial) => trial.samples.map((sample) => sample.completedFrameMs));
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.5) - 1]!;
  const ratio = aura && three ? median(aura) / median(three) : null;
  return {
    workload,
    auraMedianMs: aura ? median(aura) : null,
    threeMedianMs: three ? median(three) : null,
    ratio,
    winner: ratio === null ? "unverified" : ratio < 0.95 ? "aura" : ratio > 1.05 ? "three" : "tie-within-5-percent",
    tieBand: { lower: 0.95, upper: 1.05 },
    trialMedianVariance: {
      aura: engines.aura?.trialMedianStatistics?.variance ?? null,
      three: engines.three?.trialMedianStatistics?.variance ?? null
    }
  };
}
