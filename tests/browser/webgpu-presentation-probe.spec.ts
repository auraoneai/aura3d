import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * R-22 diagnostic matrix (docs/workflows/threejs-parity-gaps.md §12): which route lets a
 * WebGPU GPUDevice present frames on the remote runner without the browser destroying it.
 * Each cell launches its OWN browser with the variant's flags and loads
 * examples/webgpu-presentation-probe/?route=<route>. No Aura3D code is involved.
 * Rows are printed as `[wgpu-probe] {json}` so the ACR run log carries them.
 */

const REPORT_DIRECTORY = resolve("tests/reports/webgpu-presentation");
const BASE_ARGS = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
const ALL_ROUTES = ["onscreen", "detached", "offscreen-main", "offscreen-worker", "copy-external", "premultiplied-rgba8"] as const;
const KEY_ROUTES = ["onscreen", "offscreen-main"] as const;
const DISPLAY = ":99";

interface Variant {
  readonly id: string;
  readonly args?: readonly string[];
  readonly channel?: string;
  readonly headed?: boolean;
  readonly env?: Readonly<Record<string, string>>;
}

interface Row {
  readonly variant: string;
  readonly route: string;
  readonly outcome: string;
  readonly verdict: "PRESENTS" | "alive-no-readback" | "device-lost" | "error";
  readonly pixel?: readonly number[] | null;
  readonly adapter?: Record<string, unknown>;
  readonly ms: number;
}

const rows: Row[] = [];
const notes: string[] = [];
let xvfb: ChildProcess | undefined;

const looksRed = (pixel: readonly number[] | null | undefined): boolean => Array.isArray(pixel) && pixel[0]! > 150 && pixel[1]! < 90 && pixel[2]! < 90;

async function runCell(server: ExampleDevServer, variant: Variant, route: string): Promise<Row> {
  const started = Date.now();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({
      headless: !variant.headed,
      ...(variant.channel ? { channel: variant.channel } : {}),
      args: [...BASE_ARGS, ...(variant.args ?? [])],
      env: { ...process.env, ...(variant.env ?? {}) } as Record<string, string>,
      timeout: 60_000
    });
    const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
    await page.goto(`${server.origin}/examples/webgpu-presentation-probe/?route=${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForFunction(
      () => (window as unknown as { __PROBE__?: { status: string } }).__PROBE__?.status !== "running",
      undefined,
      { timeout: 40_000 }
    );
    const probe = await page.evaluate(() => (window as unknown as { __PROBE__: { outcome?: string; pixel?: number[] | null; adapter?: Record<string, unknown>; error?: string } }).__PROBE__);
    const outcome = probe.outcome ?? `error:${probe.error ?? "no outcome"}`;
    const verdict: Row["verdict"] = outcome === "alive" ? (looksRed(probe.pixel) ? "PRESENTS" : "alive-no-readback") : outcome.startsWith("lost") ? "device-lost" : "error";
    return { variant: variant.id, route, outcome: outcome.slice(0, 140), verdict, pixel: probe.pixel ?? null, ...(probe.adapter ? { adapter: probe.adapter } : {}), ms: Date.now() - started };
  } catch (error) {
    return { variant: variant.id, route, outcome: `error:${(error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 140)}`, verdict: "error", ms: Date.now() - started };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function runMatrix(server: ExampleDevServer, variants: readonly Variant[], routes: readonly string[]): Promise<void> {
  for (const variant of variants) {
    if (variant.headed) ensureXvfb();
    for (const route of routes) {
      const row = await runCell(server, variant, route);
      rows.push(row);
      console.log(`[wgpu-probe] ${JSON.stringify(row)}`);
    }
  }
}

function ensureXvfb(): void {
  if (xvfb) return;
  try {
    execSync("which Xvfb", { stdio: "ignore" });
    xvfb = spawn("Xvfb", [DISPLAY, "-screen", "0", "1280x720x24", "-nolisten", "tcp"], { stdio: "ignore" });
    execSync("sleep 1.5");
    notes.push("xvfb started");
  } catch (error) {
    notes.push(`xvfb unavailable: ${(error as Error).message.split("\n")[0]}`);
  }
}

function tryExec(label: string, command: string, timeout: number): boolean {
  try {
    execSync(command, { stdio: "pipe", timeout });
    notes.push(`${label}: ok`);
    return true;
  } catch (error) {
    notes.push(`${label}: FAILED ${(error as Error).message.split("\n")[0]!.slice(0, 160)}`);
    console.log(`[wgpu-probe] note ${notes.at(-1)}`);
    return false;
  }
}

test.describe("webgpu presentation probe (R-22)", () => {
  test.setTimeout(1_500_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });

  test.afterAll(async () => {
    xvfb?.kill();
    writeFileSync(resolve(REPORT_DIRECTORY, "matrix.json"), JSON.stringify({ rows, notes }, null, 2));
    const presents = rows.filter((row) => row.verdict === "PRESENTS");
    console.log(`[wgpu-probe] SUMMARY cells=${rows.length} presents=${presents.length} ${presents.map((row) => `${row.variant}/${row.route}`).join(", ") || "none"}`);
    console.log(`[wgpu-probe] notes ${JSON.stringify(notes)}`);
    await server.close();
  });

  test("phase 1: every route on the baseline flags", async () => {
    await runMatrix(server, [{ id: "baseline" }], ALL_ROUTES);
    expect(rows.length).toBe(ALL_ROUTES.length);
  });

  test("phase 2: launch-flag variants", async () => {
    await runMatrix(server, [
      { id: "in-process-gpu", args: ["--in-process-gpu"] },
      { id: "no-gpu-crash-limit+no-sandbox", args: ["--disable-gpu-process-crash-limit", "--disable-gpu-sandbox", "--no-sandbox"] },
      { id: "no-gpu-compositing", args: ["--disable-gpu-compositing"] },
      { id: "angle-swiftshader-webgl+skia-graphite", args: ["--use-angle=swiftshader-webgl", "--enable-features=Vulkan,UseSkiaGraphite"] },
      { id: "vulkan-swiftshader-no-gl-fallback", args: ["--use-vulkan=swiftshader", "--disable-vulkan-fallback-to-gl-for-testing"] },
      { id: "gl-angle-swiftshader+webgpu-adapter", args: ["--use-gl=angle", "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader"] },
      { id: "ozone-headless", args: ["--ozone-platform=headless"] },
      { id: "headed-xvfb", headed: true, env: { DISPLAY } },
      { id: "headed-xvfb+angle-swiftshader", headed: true, args: ["--use-gl=angle", "--use-angle=swiftshader"], env: { DISPLAY } },
      { id: "headed-xvfb+vulkan-swiftshader", headed: true, args: ["--use-vulkan=swiftshader", "--enable-features=Vulkan"], env: { DISPLAY } }
    ], KEY_ROUTES);
  });

  test("phase 3: other Chromium builds", async () => {
    for (const channel of ["chrome-beta", "chrome-dev"]) {
      const installed = tryExec(`install ${channel}`, `pnpm exec playwright install ${channel}`, 300_000);
      if (!installed) continue;
      await runMatrix(server, [
        { id: `${channel}-headless`, channel },
        { id: `${channel}-headed-xvfb`, channel, headed: true, env: { DISPLAY } }
      ], KEY_ROUTES);
    }
  });

  test("phase 4: software Vulkan (mesa lavapipe) as a native Vulkan device", async () => {
    const installed = tryExec("apt mesa-vulkan-drivers", "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mesa-vulkan-drivers vulkan-tools", 280_000);
    if (!installed) return;
    const icdDir = "/usr/share/vulkan/icd.d";
    const lvp = existsSync(icdDir) ? readdirSync(icdDir).filter((name) => name.startsWith("lvp")).map((name) => `${icdDir}/${name}`) : [];
    notes.push(`lavapipe icd: ${lvp.join(",") || "none"}`);
    if (lvp.length === 0) return;
    const env = { VK_ICD_FILENAMES: lvp[0]! };
    await runMatrix(server, [
      { id: "lavapipe-native-vulkan", args: ["--use-vulkan=native", "--enable-features=Vulkan", "--disable-vulkan-surface"], env },
      { id: "lavapipe-native-vulkan+angle", args: ["--use-vulkan=native", "--enable-features=Vulkan", "--use-gl=angle", "--use-angle=vulkan"], env },
      { id: "lavapipe-headed-xvfb", headed: true, args: ["--use-vulkan=native", "--enable-features=Vulkan"], env: { ...env, DISPLAY } }
    ], KEY_ROUTES);
  });
});
