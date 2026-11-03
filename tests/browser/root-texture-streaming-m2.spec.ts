import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("M2 texture streaming + anisotropy probes", () => {
  test.setTimeout(300_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("residency funds from the texture table with over-budget telemetry", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto(`${server.origin}/tests/browser/root-texture-streaming-m2-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_M2_STREAMING__?.status === "ready" || window.__AURA3D_M2_STREAMING__?.status === "error",
      undefined,
      { timeout: 270_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_M2_STREAMING__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/root-texture-streaming-m2.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/root-texture-streaming-m2.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.captures?.map((capture) => capture.id)).toEqual(["funded", "starved"]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
      expect(capture.nonDarkPixels, capture.id).toBeGreaterThan(50);
    }

    const checks = result?.checks ?? {};
    // Funded: real bytes from the decoded table, nothing evicted.
    expect(checks.fundedOverBudget).toBe(false);
    expect(Number(checks.fundedUsed)).toBeGreaterThan(0);
    expect(Number(checks.fundedRequested)).toBeGreaterThan(0);
    expect(Number(checks.fundedResidents)).toBeGreaterThan(0);
    // The C1 upgrade landed, so the residency funds real uploads.
    expect(checks.fundedTextured).toBe(true);
    // Anisotropy requested from root with capability gating (M2b).
    expect(Number(checks.fundedAnisoMax)).toBeGreaterThanOrEqual(1);
    if (Number(checks.fundedAnisoMax) > 1) {
      expect(Number(checks.fundedAnisoUploads)).toBeGreaterThanOrEqual(1);
    }
    // Starved: 2 KiB budget trips the telemetry instead of thrashing.
    expect(checks.starvedOverBudget).toBe(true);
    expect(Number(checks.starvedOverBytes)).toBeGreaterThan(0);
    expect(Number(checks.starvedBudget)).toBe(2048);
    expect(checks.starvedWarned).toBe(true);
  });

  test("budget ledgers isolate same-name textures across two live WebGL2 devices through eviction and release", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/root-texture-streaming-m2-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (origin) => {
      const rendering = await import(`${origin}/packages/rendering/src/index.ts`) as typeof import("../../packages/rendering/src/index");
      const budget = await import(`${origin}/packages/rendering/src/textures/TextureBudget.ts`) as typeof import("../../packages/rendering/src/textures/TextureBudget");
      type Registry = import("../../packages/rendering/src/webgl2/TextureUpload").WebGL2TextureRegistry;
      const live = (device: unknown): Registry => (device as { host: { textureRegistry: Registry } }).host.textureRegistry;
      const drained = (registry: Registry) => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WebGL texture retirement did not drain")), 20_000);
        registry.onNativeRetirementsDrained(() => { clearTimeout(timer); resolve(); });
      });
      // Count real GL texture objects per context; ledger numbers alone are not residency.
      const makeDevice = (maxBytes: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        document.body.append(canvas);
        const device = rendering.WebGL2Device.create({ canvas, textureBudgetPolicy: { maxBytes } });
        const gl = (device as unknown as { gl?: WebGL2RenderingContext }).gl ?? canvas.getContext("webgl2")!;
        const objects = new Set<WebGLTexture>();
        const create = gl.createTexture.bind(gl), remove = gl.deleteTexture.bind(gl);
        gl.createTexture = () => { const handle = create(); if (handle) objects.add(handle); return handle; };
        gl.deleteTexture = (handle) => { if (handle) objects.delete(handle); remove(handle); };
        return { device, canvas, gl, registry: live(device), objects };
      };
      const texture = (size: number) => new rendering.Texture({
        width: size, height: size, label: "same-name", format: "rgba8", generateMipmaps: false,
        data: new Uint8Array(size * size * 4).fill(200)
      });
      const a = makeDevice(128), b = makeDevice(32);
      const steps: Record<string, unknown> = {};
      const snapshot = (label: string) => {
        steps[label] = {
          aBytes: budget.textureBudgetUsage(a.device), bBytes: budget.textureBudgetUsage(b.device),
          aObjects: a.objects.size, bObjects: b.objects.size,
          bDownscaled: budget.textureBudgetReport(b.device).downscaled.length
        };
      };
      const first = texture(4), second = texture(4), shared = texture(4), extra = texture(4);
      a.registry.getTextureHandle(first);
      a.registry.getTextureHandle(second);
      // The same Texture object and label is admitted independently on device B,
      // whose smaller budget downscales its own copy without touching A.
      b.registry.getTextureHandle(shared);
      b.registry.getTextureHandle(first);
      snapshot("admitted");
      let evictionError: string | null = null;
      try { a.registry.getTextureHandle(extra); } catch (error) { evictionError = String(error); }
      snapshot("overBudget");
      first.dispose();
      a.registry.releaseDisposedTextureHandles();
      b.registry.releaseDisposedTextureHandles();
      snapshot("releasePending");
      await Promise.all([drained(a.registry), drained(b.registry)]);
      snapshot("released");
      // Freed bytes on A admit the previously rejected same-name texture.
      a.registry.getTextureHandle(extra);
      snapshot("readmitted");
      for (const value of [second, shared, extra]) value.dispose();
      a.registry.releaseDisposedTextureHandles();
      b.registry.releaseDisposedTextureHandles();
      await Promise.all([drained(a.registry), drained(b.registry)]);
      snapshot("disposed");
      const glErrors = [a.gl.getError(), b.gl.getError()];
      a.device.dispose(); b.device.dispose(); a.canvas.remove(); b.canvas.remove();
      return { steps, evictionError, glErrors };
    }, server.origin);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/root-texture-streaming-two-device.json"), `${JSON.stringify(result, null, 2)}\n`);
    const step = (name: string) => result.steps[name] as { aBytes: number; bBytes: number; aObjects: number; bObjects: number; bDownscaled: number };
    // 4x4 RGBA8 = 64 bytes. A holds two (128 of 128); B fits a 2x2 copy of each
    // (16 + 16 of 32) and records the downscale.
    expect(step("admitted")).toMatchObject({ aBytes: 128, bBytes: 32, aObjects: 2, bObjects: 2 });
    expect(step("admitted").bDownscaled).toBeGreaterThan(0);
    expect(result.evictionError).toMatch(/budget|fit/i);
    expect(step("overBudget")).toMatchObject({ aBytes: 128, bBytes: 32, aObjects: 2, bObjects: 2 });
    // Release is fence-retired: bytes stay charged until the device drains.
    expect(step("releasePending").aBytes).toBe(128);
    expect(step("released")).toMatchObject({ aBytes: 64, bBytes: 16, aObjects: 1, bObjects: 1 });
    expect(step("readmitted")).toMatchObject({ aBytes: 128, bBytes: 16, aObjects: 2, bObjects: 1 });
    expect(step("disposed")).toMatchObject({ aBytes: 0, bBytes: 0, aObjects: 0, bObjects: 0 });
    expect(result.glErrors).toEqual([0, 0]);
  });
});

declare global {
  interface Window {
    __AURA3D_M2_STREAMING__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly textures: {
          readonly budgetBytes: number;
          readonly usedBytes: number;
          readonly requestedBytes: number;
          readonly overBudget: boolean;
          readonly overBudgetBytes: number;
          readonly residentEntries: number;
          readonly evictedEntries: readonly string[];
        };
        readonly texturedMaterials: readonly {
          readonly nodeName: string;
          readonly status: string;
          readonly pixelBacked: boolean;
        }[];
        readonly samplerAnisotropyUploads: number;
        readonly maxTextureAnisotropy: number;
        readonly warnings: readonly string[];
        readonly checksum: number;
        readonly nonDarkPixels: number;
      }[];
      readonly checks?: Record<string, boolean | number | string>;
      readonly error?: string;
    };
  }
}
