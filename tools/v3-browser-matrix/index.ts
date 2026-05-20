import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, webkit, type BrowserType, type LaunchOptions } from "@playwright/test";
import { startExampleDevServer } from "../../tests/browser/example-dev-server.js";
import { baseReport, writeJson } from "../v3-reporting/index.js";

type BrowserMatrixEntry = {
  readonly id: string;
  readonly label: string;
  readonly family: "chromium" | "webkit";
  readonly locallyAvailable: boolean;
  readonly launch: "playwright-bundled" | "channel";
  readonly channel?: string;
  readonly appEvidencePaths: readonly string[];
  readonly automationExecutablePath?: string;
  readonly status: "pass" | "skipped-unavailable" | "fail";
  readonly userAgent?: string;
  readonly webgl2?: boolean;
  readonly navigatorGpu?: boolean;
  readonly webgpuExampleStatus?: string;
  readonly webgpuAvailability?: string;
  readonly error?: string;
};

type BrowserCandidate = {
  readonly id: string;
  readonly label: string;
  readonly family: "chromium" | "webkit";
  readonly type: BrowserType;
  readonly launch: "playwright-bundled" | "channel";
  readonly channel?: string;
  readonly appEvidencePaths: readonly string[];
  readonly automationExecutablePath?: string;
  readonly locallyAvailable: boolean;
};

const root = process.cwd();
const reportPath = "tests/reports/v3-browser-matrix.json";

export async function runV3BrowserMatrix(): Promise<number> {
  const server = await startExampleDevServer(root);
  const entries: BrowserMatrixEntry[] = [];
  try {
    for (const candidate of createCandidates()) {
      entries.push(await probeCandidate(candidate, server.origin));
    }
  } finally {
    await server.close();
  }

  const availableEntries = entries.filter((entry) => entry.locallyAvailable);
  const violations = [
    ...(availableEntries.length === 0 ? ["No local browser candidate could be probed."] : []),
    ...entries
      .filter((entry) => entry.locallyAvailable && entry.status !== "pass")
      .map((entry) => `${entry.id}: ${entry.error ?? "probe failed"}`),
  ];
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:v3-browser-matrix",
      runIdPrefix: "v3-browser-matrix",
      sourceFiles: [
        "tools/v3-browser-matrix/index.ts",
        "tests/browser/example-dev-server.ts",
        "examples/webgpu-capability/index.html",
        "examples/webgpu-capability/main.ts",
      ],
      violations,
    }),
    matrix: entries,
    summary: {
      candidates: entries.length,
      locallyAvailable: availableEntries.length,
      passed: entries.filter((entry) => entry.status === "pass").length,
      skippedUnavailable: entries.filter((entry) => entry.status === "skipped-unavailable").length,
      failed: entries.filter((entry) => entry.status === "fail").length,
    },
  };
  writeJson(root, reportPath, report);
  console.log(JSON.stringify({ ok: report.ok, locallyAvailable: availableEntries.length, failures: violations.length }, null, 2));
  return report.ok ? 0 : 1;
}

function createCandidates(): readonly BrowserCandidate[] {
  const chromePaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    `${process.env.HOME ?? ""}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  ].filter(Boolean);
  const edgePaths = [
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    `${process.env.HOME ?? ""}/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`,
  ].filter(Boolean);
  const safariPaths = [
    "/Applications/Safari.app/Contents/MacOS/Safari",
    "/System/Applications/Safari.app/Contents/MacOS/Safari",
    "/Applications/Safari Technology Preview.app/Contents/MacOS/Safari Technology Preview",
  ];
  const webkitExecutablePath = webkit.executablePath();
  return [
    {
      id: "playwright-chromium",
      label: "Playwright Chromium",
      family: "chromium",
      type: chromium,
      launch: "playwright-bundled",
      appEvidencePaths: [],
      locallyAvailable: true,
    },
    {
      id: "chrome-stable",
      label: "Google Chrome stable",
      family: "chromium",
      type: chromium,
      launch: "channel",
      channel: "chrome",
      appEvidencePaths: chromePaths,
      locallyAvailable: chromePaths.some((path) => existsSync(path)),
    },
    {
      id: "edge-stable",
      label: "Microsoft Edge stable",
      family: "chromium",
      type: chromium,
      launch: "channel",
      channel: "msedge",
      appEvidencePaths: edgePaths,
      locallyAvailable: edgePaths.some((path) => existsSync(path)),
    },
    {
      id: "safari-webkit",
      label: "Safari/WebKit technology state",
      family: "webkit",
      type: webkit,
      launch: "playwright-bundled",
      appEvidencePaths: safariPaths,
      automationExecutablePath: webkitExecutablePath,
      locallyAvailable: safariPaths.some((path) => existsSync(path)) && existsSync(webkitExecutablePath),
    },
  ];
}

async function probeCandidate(candidate: BrowserCandidate, origin: string): Promise<BrowserMatrixEntry> {
  if (!candidate.locallyAvailable) {
    return {
      id: candidate.id,
      label: candidate.label,
      family: candidate.family,
      locallyAvailable: false,
      launch: candidate.launch,
      channel: candidate.channel,
      appEvidencePaths: candidate.appEvidencePaths,
      automationExecutablePath: candidate.automationExecutablePath,
      status: "skipped-unavailable",
    };
  }

  const options: LaunchOptions = {
    headless: true,
    ...(candidate.channel ? { channel: candidate.channel } : {}),
  };
  let browser: Awaited<ReturnType<BrowserType["launch"]>> | undefined;
  try {
    browser = await candidate.type.launch(options);
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await page.goto(`${origin}/examples/webgpu-capability/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __GALILEO3D_WEBGPU_CAPABILITY__?: { status?: string } }).__GALILEO3D_WEBGPU_CAPABILITY__?.status === "ready", undefined, { timeout: 20_000 });
    const probe = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const webgl2 = canvas.getContext("webgl2") !== null;
      return {
        userAgent: navigator.userAgent,
        webgl2,
        navigatorGpu: "gpu" in navigator,
        webgpuExampleStatus: (window as unknown as { __GALILEO3D_WEBGPU_CAPABILITY__?: { status?: string } }).__GALILEO3D_WEBGPU_CAPABILITY__?.status,
        webgpuAvailability: (window as unknown as { __GALILEO3D_WEBGPU_CAPABILITY__?: { availability?: string } }).__GALILEO3D_WEBGPU_CAPABILITY__?.availability,
      };
    });
    return {
      id: candidate.id,
      label: candidate.label,
      family: candidate.family,
      locallyAvailable: true,
      launch: candidate.launch,
      channel: candidate.channel,
      appEvidencePaths: candidate.appEvidencePaths,
      automationExecutablePath: candidate.automationExecutablePath,
      status: probe.webgl2 ? "pass" : "fail",
      userAgent: probe.userAgent,
      webgl2: probe.webgl2,
      navigatorGpu: probe.navigatorGpu,
      webgpuExampleStatus: probe.webgpuExampleStatus,
      webgpuAvailability: probe.webgpuAvailability,
      ...(probe.webgl2 ? {} : { error: "WebGL2 context was unavailable." }),
    };
  } catch (error) {
    return {
      id: candidate.id,
      label: candidate.label,
      family: candidate.family,
      locallyAvailable: true,
      launch: candidate.launch,
      channel: candidate.channel,
      appEvidencePaths: candidate.appEvidencePaths,
      automationExecutablePath: candidate.automationExecutablePath,
      status: "fail",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runV3BrowserMatrix().then((exitCode) => {
    process.exitCode = exitCode;
  }, (error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
