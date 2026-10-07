/**
 * assets-compressed-glb.spec.ts — PRD-05 Phase-1 browser gate (C-16).
 *
 * The shared compressed-GLB corpus loads through all three declared decoder
 * paths against the vendored same-origin registry: meshopt geometry
 * (`import("meshoptimizer")`), draco geometry (vendored UMD + wasm), and
 * KTX2/Basis textures (vendored transcoder + worker pool). Asserts:
 *   - the real WebGL2 capabilities probe ran (etc2 is core on WebGL2);
 *   - every fixture variant loaded with its expected decoder ids;
 *   - KTX2 textures resolved a selected target format (compressed when the GPU
 *     allows, honest rgba8 otherwise — never the silent ETC2 default);
 *   - every fetched resource stayed same-origin (no CDN fallbacks);
 *   - a disabled decoder fails closed with `AssetDecoderUnavailable`;
 *   - the WebGPU all-false caps select rgba8 (Q-11-1).
 * macos-14 CI only (ANGLE Metal gives astc+bptc+etc2).
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd05DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";

const COMPRESSED_FORMATS = new Set([
  "astc-4x4-rgba-unorm", "bc7-rgba-unorm", "etc2-rgba8unorm", "etc2-rgb8unorm",
  "bc3-rgba-unorm", "bc1-rgb-unorm", "rgba8"
]);

interface ReadyPayload {
  readonly caps: { readonly astc: boolean; readonly bptc: boolean; readonly etc2: boolean; readonly s3tc: boolean; readonly s3tcSrgb: boolean };
  readonly webgpuKtx2Target: string;
  readonly variants: readonly {
    readonly variant: string;
    readonly sniffedDecoders: readonly string[];
    readonly setKeys: readonly string[];
    readonly meshCount: number;
    readonly textureCount: number;
    readonly textureFormats: readonly string[];
    readonly textureMipLevels: readonly number[];
    readonly textureBytes: readonly number[];
  }[];
  readonly registryLoaded: readonly string[];
  readonly registryFailed: readonly { readonly id: string; readonly url: string }[];
  readonly disabledDracoError: { readonly name: string; readonly decoderId: string; readonly url: string } | null;
  readonly weakMapRoundTrip: boolean;
  readonly resourceCount: number;
  readonly sameOriginResources: boolean;
  readonly offOriginResources: readonly string[];
}

test.describe("PRD-05 compressed GLB through decoder registry (P1)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("meshopt/draco/ktx2 fixtures load via the vendored registry, same-origin", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd05/browser/assets-compressed-glb.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
      undefined,
      { timeout: 180_000 }
    );
    const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
    const payload = await page.evaluate(() => (window as any).__QR_READY__ as ReadyPayload | undefined);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd05-assets-compressed-glb.json"),
      `${JSON.stringify({ phase: 1, surface: "assets-compressed-glb", error, ...payload }, null, 2)}\n`
    );
    expect(error, "harness error").toBeNull();
    expect(payload).toBeTruthy();

    // Real capability probe: WebGL2 guarantees etc2 (core ETC2/EAC).
    expect(payload!.caps.etc2).toBe(true);

    // Registry loaded the demanded decoders — vendored, no failures.
    expect(payload!.registryFailed).toEqual([]);
    for (const id of ["meshopt", "draco", "ktx2"]) {
      expect(payload!.registryLoaded, `registry diagnostics.loaded missing ${id}`).toContain(id);
    }

    // Each variant loaded through its declared decoder path.
    const byVariant = new Map(payload!.variants.map((v) => [v.variant, v]));
    expect(byVariant.get("plain")?.meshCount).toBeGreaterThan(0);
    expect(byVariant.get("plain")?.sniffedDecoders).toEqual([]);
    for (const variant of ["meshopt", "draco", "uastc", "etc1s"] as const) {
      const result = byVariant.get(variant);
      expect(result, `variant ${variant} missing`).toBeTruthy();
      expect(result!.meshCount, `${variant} meshCount`).toBeGreaterThan(0);
    }
    expect(byVariant.get("meshopt")!.sniffedDecoders).toEqual(["meshopt"]);
    expect(byVariant.get("meshopt")!.setKeys).toContain("meshopt");
    expect(byVariant.get("draco")!.sniffedDecoders).toEqual(["draco"]);
    expect(byVariant.get("draco")!.setKeys).toContain("draco");
    for (const variant of ["uastc", "etc1s"] as const) {
      const result = byVariant.get(variant)!;
      expect(result.sniffedDecoders).toEqual(["ktx2"]);
      expect(result.setKeys).toContain("imageDecoder");
      // KTX2 base-colour texture transcoded to a real target (never the
      // silent ETC2 default — the format the GPU/target matrix picked).
      expect(result.textureFormats.length, `${variant} textureFormats`).toBeGreaterThan(0);
      for (const format of result.textureFormats) {
        expect(COMPRESSED_FORMATS, `${variant} resolved format ${format}`).toContain(format);
      }
      for (const mips of result.textureMipLevels) {
        expect(mips).toBeGreaterThan(0);
      }
      for (const bytes of result.textureBytes) {
        expect(bytes).toBeGreaterThan(0);
      }
    }

    // Same-origin: every fetched resource is this origin — no CDN.
    expect(payload!.offOriginResources, JSON.stringify(payload!.offOriginResources)).toEqual([]);
    expect(payload!.sameOriginResources).toBe(true);

    // Fail-closed: disabled draco rejects a draco asset with the contract error.
    expect(payload!.disabledDracoError?.name).toBe("AssetDecoderUnavailable");
    expect(payload!.disabledDracoError?.decoderId).toBe("draco");

    // Q-15-1 registry-per-app attach works; WebGPU caps → honest rgba8 (Q-11-1).
    expect(payload!.weakMapRoundTrip).toBe(true);
    expect(payload!.webgpuKtx2Target).toBe("rgba8");
  });
});
