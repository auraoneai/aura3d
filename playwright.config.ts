import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE ||
  (process.env.A3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);
// Keep the historical launch options for existing suites and configs derived
// from this file. Matrix projects override them explicitly below.
const legacyLaunchOptions = {
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
  args: [
    "--enable-unsafe-webgpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    ...(process.env.AURA3D_FORCE_SWIFTSHADER === "true"
      ? ["--use-gl=angle", "--use-angle=swiftshader"]
      : [])
  ],
};

const selectedProject = process.env.AURA3D_BROWSER_PROJECT;
const matrixProjectNames = [
  "chromium-automation", "firefox-automation", "webkit-automation",
  "chromium-gpu-headless", "chromium-software", "chromium-experimental"
] as const;
const projectNames: readonly string[] = ["legacy-chromium", ...matrixProjectNames];
if (selectedProject && !projectNames.includes(selectedProject)) {
  throw new Error(`Unknown AURA3D_BROWSER_PROJECT ${JSON.stringify(selectedProject)}; choose ${projectNames.join(", ")}`);
}

// Without an explicit project the historical suite runs once, while the
// matrix projects discover only their dedicated scenario. The remote runner
// forwards AURA3D_BROWSER_PROJECT together with --project so a selected
// project can run any requested spec, including GPU and performance probes.
const explicitProjectArgument = process.argv.some((argument) => argument === "--project" || argument.startsWith("--project="));
const matrixTestMatch = selectedProject || explicitProjectArgument ? undefined : ["tests/browser/native-cross-browser.spec.ts"];
const explicitExecutable = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE;
const projects = [
  {
    name: "legacy-chromium",
    testIgnore: ["release-artifacts/**", "tests/browser/native-cross-browser.spec.ts"],
    metadata: { evidenceTier: "experimental", launchProfile: "legacy" },
  },
  {
    name: "chromium-automation",
    testMatch: matrixTestMatch,
    use: { browserName: "chromium" as const, headless: true, launchOptions: {} },
    metadata: { evidenceTier: "automation", launchProfile: "default", customFeatureFlags: [] },
  },
  {
    name: "firefox-automation",
    testMatch: matrixTestMatch,
    use: { browserName: "firefox" as const, headless: true, launchOptions: {} },
    metadata: { evidenceTier: "automation", launchProfile: "default", customFeatureFlags: [] },
  },
  {
    name: "webkit-automation",
    testMatch: matrixTestMatch,
    use: { browserName: "webkit" as const, headless: true, launchOptions: {} },
    metadata: { evidenceTier: "automation", launchProfile: "default", customFeatureFlags: [] },
  },
  {
    name: "chromium-gpu-headless",
    testMatch: matrixTestMatch,
    // Full Chromium's headless mode is selected for GPU probes. Its actual
    // adapter must still be measured; this project name is not hardware proof.
    use: { browserName: "chromium" as const, channel: "chromium", headless: true,
      launchOptions: explicitExecutable ? { executablePath: explicitExecutable } : {} },
    metadata: { evidenceTier: "gpu-probe", launchProfile: "default", customFeatureFlags: [] },
  },
  {
    name: "chromium-software",
    testMatch: matrixTestMatch,
    use: { browserName: "chromium" as const, headless: true,
      launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } },
    metadata: { evidenceTier: "software", launchProfile: "software", customFeatureFlags: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  {
    name: "chromium-experimental",
    testMatch: matrixTestMatch,
    use: { browserName: "chromium" as const, headless: true,
      launchOptions: { ...(explicitExecutable ? { executablePath: explicitExecutable } : {}),
        args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] } },
    metadata: { evidenceTier: "experimental", launchProfile: "experimental", customFeatureFlags: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] },
  }
];

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/browser/**/*.spec.ts", "tests/visual/**/*.spec.ts"],
  testIgnore: ["release-artifacts/**"],
  timeout: 60_000,
  workers: 1,
  // A stray test.only must not narrow a CI run to one spec.
  forbidOnly: !!process.env.CI,
  use: {
    browserName: "chromium",
    headless: process.env.AURA3D_HEADED_XVFB !== "1",
    viewport: { width: 800, height: 600 },
    launchOptions: legacyLaunchOptions,
  },
  projects: selectedProject ? projects.filter((project) => project.name === selectedProject) : projects,
  // CI skips need an explicit entry in tests/support/integrated-pending.json.
  reporter: [["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/reports/browser.json" }], ["./tests/support/noSkipInCiReporter.ts"]]
});
