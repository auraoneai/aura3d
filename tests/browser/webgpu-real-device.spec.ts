import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface WebGPUHardwareMatrixReport {
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly gitSha: string;
  readonly command: string;
  readonly environment: {
    readonly platform: string;
    readonly release: string;
    readonly arch: string;
    readonly node: string;
  };
  readonly sourceInputs: readonly string[];
  readonly status: "pass";
  readonly source: "tests/browser/webgpu-real-device.spec.ts";
  readonly evidenceType: "real-navigator-gpu-probe";
  readonly results: readonly WebGPUHardwareMatrixResult[];
}

interface WebGPUHardwareMatrixResult {
  readonly browserName: string;
  readonly projectName: string;
  readonly os: {
    readonly platform: string;
    readonly release: string;
  };
  readonly userAgent: string;
  readonly hasNavigatorGpu: boolean;
  readonly adapterStatus: "not-available" | "missing" | "available" | "error";
  readonly deviceStatus: "not-requested" | "available" | "error";
  readonly adapterInfo?: {
    readonly name?: string;
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
  };
  readonly limits?: Record<string, number>;
  readonly features?: readonly string[];
  readonly unsupportedCases: readonly string[];
  readonly error?: string;
}

test.describe("real WebGPU device evidence", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("records real navigator.gpu adapter/device capability evidence when available", async ({ browserName, page }, testInfo) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });

    const probe = await page.evaluate(async () => {
      type NavigatorWithGpu = Navigator & {
        gpu?: {
          requestAdapter?: () => Promise<{
            name?: string;
            info?: {
              vendor?: string;
              architecture?: string;
              device?: string;
              description?: string;
            };
            features?: Iterable<string>;
            limits?: Record<string, number>;
            requestDevice?: () => Promise<{
              features?: Iterable<string>;
              limits?: Record<string, number>;
              destroy?: () => void;
            }>;
          } | null>;
        };
      };
      const unsupportedCases: string[] = [];
      const navigatorWithGpu = navigator as NavigatorWithGpu;

      if (!navigatorWithGpu.gpu?.requestAdapter) {
        unsupportedCases.push("navigator.gpu is not exposed by this browser/runtime");
        return {
          userAgent: navigator.userAgent,
          hasNavigatorGpu: false,
          adapterStatus: "not-available" as const,
          deviceStatus: "not-requested" as const,
          unsupportedCases
        };
      }

      try {
        const adapter = await navigatorWithGpu.gpu.requestAdapter();
        if (!adapter) {
          unsupportedCases.push("navigator.gpu.requestAdapter returned null");
          return {
            userAgent: navigator.userAgent,
            hasNavigatorGpu: true,
            adapterStatus: "missing" as const,
            deviceStatus: "not-requested" as const,
            unsupportedCases
          };
        }

        if (!adapter.requestDevice) {
          unsupportedCases.push("adapter.requestDevice is not exposed");
          return {
            userAgent: navigator.userAgent,
            hasNavigatorGpu: true,
            adapterStatus: "available" as const,
            deviceStatus: "error" as const,
            adapterInfo: {
              name: adapter.name,
              vendor: adapter.info?.vendor,
              architecture: adapter.info?.architecture,
              device: adapter.info?.device,
              description: adapter.info?.description
            },
            limits: adapter.limits,
            features: Array.from(adapter.features ?? []),
            unsupportedCases,
            error: "adapter.requestDevice is missing"
          };
        }

        const device = await adapter.requestDevice();
        const result = {
          userAgent: navigator.userAgent,
          hasNavigatorGpu: true,
          adapterStatus: "available" as const,
          deviceStatus: "available" as const,
          adapterInfo: {
            name: adapter.name,
            vendor: adapter.info?.vendor,
            architecture: adapter.info?.architecture,
            device: adapter.info?.device,
            description: adapter.info?.description
          },
          limits: device.limits ?? adapter.limits,
          features: Array.from(device.features ?? adapter.features ?? []),
          unsupportedCases
        };
        device.destroy?.();
        return result;
      } catch (error) {
        unsupportedCases.push("WebGPU adapter/device request threw");
        return {
          userAgent: navigator.userAgent,
          hasNavigatorGpu: true,
          adapterStatus: "error" as const,
          deviceStatus: "error" as const,
          unsupportedCases,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    const result: WebGPUHardwareMatrixResult = {
      browserName,
      projectName: testInfo.project.name,
      os: {
        platform: platform(),
        release: release()
      },
      ...probe
    };
    const reportPath = "tests/reports/webgpu-hardware-matrix.json";
    const existing = readExistingHardwareMatrixReport(reportPath);
    const results = mergeHardwareMatrixResults(existing?.results ?? [], result);
    const report: WebGPUHardwareMatrixReport = {
      generatedAt: new Date().toISOString(),
      releaseRunId: process.env.A3D_RELEASE_RUN_ID ?? "standalone-webgpu-hardware-matrix-run",
      gitSha: gitSha(),
      command: "pnpm exec playwright test tests/browser/webgpu-real-device.spec.ts",
      environment: {
        platform: platform(),
        release: release(),
        arch: arch(),
        node: process.version
      },
      sourceInputs: [
        "tests/browser/webgpu-real-device.spec.ts",
        "docs/rendering/webgpu-hardware-matrix.md"
      ],
      status: "pass",
      source: "tests/browser/webgpu-real-device.spec.ts",
      evidenceType: "real-navigator-gpu-probe",
      results
    };

    mkdirSync("tests/reports", { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    expect(result.userAgent.length).toBeGreaterThan(0);
    expect(result.adapterStatus).toMatch(/^(not-available|missing|available|error)$/);
    expect(result.deviceStatus).toMatch(/^(not-requested|available|error)$/);
    if (result.hasNavigatorGpu) {
      expect(result.adapterStatus).not.toBe("not-available");
    } else {
      expect(result.unsupportedCases).toContain("navigator.gpu is not exposed by this browser/runtime");
    }
  });
});

function readExistingHardwareMatrixReport(path: string): WebGPUHardwareMatrixReport | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.results)) return null;
    return parsed as WebGPUHardwareMatrixReport;
  } catch {
    return null;
  }
}

function mergeHardwareMatrixResults(existing: readonly WebGPUHardwareMatrixResult[], current: WebGPUHardwareMatrixResult): readonly WebGPUHardwareMatrixResult[] {
  const currentKey = hardwareMatrixResultKey(current);
  return [
    ...existing.filter((entry) => hardwareMatrixResultKey(entry) !== currentKey),
    current,
  ].sort((left, right) => hardwareMatrixResultKey(left).localeCompare(hardwareMatrixResultKey(right)));
}

function hardwareMatrixResultKey(result: WebGPUHardwareMatrixResult): string {
  return [
    result.browserName,
    result.projectName,
    result.os.platform,
    result.os.release,
  ].join("|");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function gitSha(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}
