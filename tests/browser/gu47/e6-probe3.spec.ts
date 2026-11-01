import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 phase-7 lane e6 probe (remote runner only, tools/remote-acr/run.sh; never local).
 * 1. `e6p7-game-*`: on the loaded software-WebGL2 runner, do textured upgrades now land (texPending -> 0) with the
 *    `<img>` decode fallback? Counts createImageBitmap calls that settled / stayed open and `<img>` blob decodes
 *    (`E6P7_TEX` lines), then a JPEG of the frame in `E6P7_FRAME` chunks.
 * 2. `e6p7-pixels`: on a quiet page, every texture URL the games loaded (plus a generated alpha PNG and a JPEG) is
 *    decoded both ways (createImageBitmap with the engine's options, and `<img>`), uploaded with the engine's unpack
 *    settings into RGBA8 and SRGB8_ALPHA8 textures and read back; the bytes must be equal (`E6P7_PIX` lines).
 */
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

let server: ExampleDevServer;
const textureUrls = new Set<string>();
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

const INSTRUMENT = (): void => {
  if (typeof window === "undefined" || typeof window.createImageBitmap !== "function") return;
  const w = window as unknown as { __E6P7__: { bitmapCalls: number; bitmapSettled: number; imgBlobDecodes: number; imgBlobDecoded: number } };
  w.__E6P7__ = { bitmapCalls: 0, bitmapSettled: 0, imgBlobDecodes: 0, imgBlobDecoded: 0 };
  const original = window.createImageBitmap.bind(window);
  (window as unknown as { createImageBitmap: unknown }).createImageBitmap = (...args: unknown[]) => {
    w.__E6P7__.bitmapCalls += 1;
    const result = (original as (...a: unknown[]) => Promise<ImageBitmap>)(...args);
    void result.then(() => { w.__E6P7__.bitmapSettled += 1; }, () => { w.__E6P7__.bitmapSettled += 1; });
    return result;
  };
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
    const blob = this.src.startsWith("blob:");
    if (blob) w.__E6P7__.imgBlobDecodes += 1;
    const result = decode.call(this);
    if (blob) void result.then(() => { w.__E6P7__.imgBlobDecoded += 1; }, () => undefined);
    return result;
  };
};

const GAMES = [
  ["fc-munich", "/apps/showcase-aura-fc-3d/index.html?venue=munich"],
  ["top-tennis", "/apps/showcase-top-tennis/"]
] as const;

for (const [name, path] of GAMES) {
  test(`e6p7-game-${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(INSTRUMENT);
    const errors: string[] = [];
    page.on("pageerror", (error) => { if (errors.length < 12) errors.push(`pageerror ${String(error).slice(0, 300)}`); });
    page.on("console", (message) => { if (message.type() === "error" && errors.length < 12) errors.push(`console ${message.text().slice(0, 300)}`); });
    const t00 = Date.now();
    await page.goto(`${server.origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    const ready = await page.waitForFunction(READY, undefined, { timeout: 900_000, polling: 1000 }).then(() => true, () => false);
    log(`E6P7_READY ${JSON.stringify({ name, ready, s: Math.round((Date.now() - t00) / 1000), errors })}`);
    const t0 = Date.now();
    let last = "";
    for (let i = 0; i < 18; i += 1) {
      await page.waitForTimeout(10_000);
      const out = await page.evaluate(() => {
        const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all?.()[0];
        const rows: any[] = app?.diagnostics?.()?.renderer?.runtime?.texturedMaterials ?? [];
        const counts: Record<string, number> = {};
        for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
        const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u));
        return { counts, pending: rows.filter((r) => r.status === "pending").slice(0, 6).map((r) => ({ node: r.nodeName, stage: r.stage, pendingMs: r.pendingMs })),
          fallback: rows.filter((r) => r.status === "fallback").slice(0, 3).map((r) => ({ node: r.nodeName, warnings: (r.warnings ?? []).slice(0, 1) })),
          probe: (window as any).__E6P7__, urls };
      });
      for (const url of out.urls) textureUrls.add(url.replace(server.origin, ""));
      last = JSON.stringify({ name, s: Math.round((Date.now() - t0) / 1000), counts: out.counts, pending: out.pending, fallback: out.fallback, probe: out.probe });
      log(`E6P7_TEX ${last}`);
      if ((out.counts.pending ?? 0) === 0 && (out.counts.textured ?? 0) > 0 && i >= 2) break;
    }
    const jpeg = (await page.screenshot({ type: "jpeg", quality: 55 })).toString("base64");
    for (let i = 0; i < jpeg.length; i += 8000) log(`E6P7_FRAME ${name} ${i / 8000} ${jpeg.slice(i, i + 8000)}`);
    log(`E6P7_FRAME_END ${name} ${Math.ceil(jpeg.length / 8000)}`);
  });
}

test("e6p7-pixels", async ({ page }) => {
  await page.goto(`${server.origin}/e6p7-blank`, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch(() => undefined);
  const urls = [...textureUrls].slice(0, 24);
  log(`E6P7_PIX_URLS ${JSON.stringify(urls)}`);
  const results = await page.evaluate(async (list) => {
    const generated = async (type: string): Promise<Blob> => {
      const canvas = document.createElement("canvas");
      canvas.width = 37; canvas.height = 23;
      const context = canvas.getContext("2d")!;
      const image = context.createImageData(37, 23);
      for (let i = 0; i < 37 * 23; i += 1) {
        image.data.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, type === "image/png" ? (i * 11) % 256 : 255], i * 4);
      }
      context.putImageData(image, 0, 0);
      return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type, 0.9));
    };
    const gl = document.createElement("canvas").getContext("webgl2")!;
    const upload = (source: TexImageSource, internal: number, width: number, height: number): Uint8Array => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // The engine's unpack state (packages/rendering/src/webgl2/TextureUpload.ts) at a source upload.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      const out = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      return out;
    };
    const rows: unknown[] = [];
    const inputs: [string, () => Promise<Blob>][] = [
      ["generated-alpha.png", () => generated("image/png")],
      ["generated.jpg", () => generated("image/jpeg")],
      ...list.map((url) => [url, async () => (await fetch(url)).blob()] as [string, () => Promise<Blob>])
    ];
    for (const [label, read] of inputs) {
      try {
        const blob = await read();
        const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.decoding = "async";
        img.src = objectUrl;
        await img.decode();
        const size = { bitmap: [bitmap.width, bitmap.height], img: [img.width, img.height] };
        const formats: Record<string, unknown> = {};
        for (const [fmt, internal] of [["rgba8", gl.RGBA8], ["srgb8a8", gl.SRGB8_ALPHA8]] as const) {
          const a = upload(bitmap, internal, bitmap.width, bitmap.height);
          const b = upload(img, internal, bitmap.width, bitmap.height);
          let diff = 0, maxDiff = 0;
          for (let i = 0; i < a.length; i += 1) { const d = Math.abs(a[i]! - b[i]!); if (d) { diff += 1; maxDiff = Math.max(maxDiff, d); } }
          formats[fmt] = { equal: diff === 0, diffBytes: diff, maxDiff, glError: gl.getError() };
        }
        URL.revokeObjectURL(objectUrl);
        bitmap.close();
        rows.push({ label, type: blob.type, bytes: blob.size, size, formats });
      } catch (error) {
        rows.push({ label, error: String(error) });
      }
    }
    return rows;
  }, urls);
  for (const row of results) log(`E6P7_PIX ${JSON.stringify(row)}`);
  const compared = results.filter((r: any) => r.formats);
  const allEqual = compared.every((r: any) => r.formats.rgba8.equal && r.formats.srgb8a8.equal);
  log(`E6P7_PIX_SUMMARY ${JSON.stringify({ compared: compared.length, allEqual, errors: results.length - compared.length })}`);
});
