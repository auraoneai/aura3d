import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Lane 03 (PRD-03) GPU browser lane: the qr-prd03 post specs on the
 * self-hosted Linux GPU runners (`[self-hosted, azure-gpu]`, NVIDIA L4).
 * Same specs and reporter as the default config; only the Chromium launch
 * differs:
 *  - `channel: "chromium"` runs the full Chromium build in new headless mode
 *    (`--headless=new`), not chromium-headless-shell;
 *  - ANGLE on Vulkan so WebGL2 is hardware-accelerated on the L4.
 * `qr-prd03-gpu-probe.spec.ts` fails the job when the WebGL renderer string
 * is a software rasterizer, so a silent SwiftShader fallback cannot pass.
 * Frames from this lane are compared only within this lane (never against
 * macos-14 or GitLab captures).
 */
// `QR_AZURE_GPU_CHROME_ARGS` (repo variable, shared with qr-azure-gpu.yml)
// overrides the default Vulkan ANGLE set.
const defaultGpuArgs = "--headless=new --use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist --enable-unsafe-webgpu";
const gpuArgs = (process.env.QR_AZURE_GPU_CHROME_ARGS?.trim() || defaultGpuArgs).split(/\s+/).filter(Boolean);

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    channel: "chromium",
    launchOptions: { args: gpuArgs }
  },
  reporter: [["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/reports/browser-gpu.json" }]]
});
