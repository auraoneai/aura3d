import { readFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Exposure-parity scene probe (beat-three.js PRD, WP-Q.1 / section 6). Mounts every scene that authors lights and no
 * `environments.*` node (plus the 26 showcase games), then prints one EXPOSURE_SCENE_JSON line per scene (mean luma,
 * non-black ratio, the environment preset the engine reported, console errors) and one EXPOSURE_SCENE_FRAME line with
 * a small JPEG so before/after frames can be recovered from the ACR log (no artifact egress on ad-hoc runs).
 * Software WebGL2; games animate, so compare the shift, not the absolute value.
 */
interface Unit { readonly slug: string; readonly url: string }
const UNITS = JSON.parse(readFileSync(new URL("./exposure-scenes.json", import.meta.url), "utf8")) as Unit[];
const BOOT_MS = Number(process.env.EXPOSURE_SCENE_BOOT_MS ?? "9000");
const ASSET_ORIGIN = process.env.LUMA_ASSET_ORIGIN ?? "https://aura3d.auraone.ai";
const ASSET_PATH = /\.(glb|gltf|bin|ktx2|png|jpe?g|webp|wav|mp3|ogg|hdr|exr|json)(\?.*)?$/i;

async function lumaStats(lab: Page, png: Buffer): Promise<{ nonBlack: number; mean: number }> {
  return lab.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nb = 0, s = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (l > 8) nb++;
      s += l;
    }
    return { nonBlack: nb / n, mean: s / n };
  }, png.toString("base64"));
}

export function defineShard(index: number, count: number): void {
  const slice = UNITS.filter((_, i) => i % count === index);
  test.describe(`exposure scenes shard ${index}`, () => {
    test.setTimeout(2_400_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });
    for (const unit of slice) {
      test(`exposure scene ${unit.slug}`, async ({ browser }) => {
        const lab = await (await browser.newContext()).newPage();
        await lab.goto("about:blank");
        const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } });
        await ctx.route((url) => ASSET_PATH.test(url.pathname + url.search) && url.hostname !== new URL(ASSET_ORIGIN).hostname, async (route) => {
          const local = await route.fetch().catch(() => null);
          if (local && local.status() < 400 && !(local.headers()["content-type"] ?? "").includes("text/html")) { await route.fulfill({ response: local }); return; }
          const url = new URL(route.request().url());
          const remote = await fetch(`${ASSET_ORIGIN}${url.pathname}${url.search}`).catch(() => null);
          if (remote && remote.ok) {
            await route.fulfill({ status: 200, headers: { "content-type": remote.headers.get("content-type") ?? "application/octet-stream", "access-control-allow-origin": "*" }, body: Buffer.from(await remote.arrayBuffer()) });
          } else {
            await route.fulfill(local ? { response: local } : { status: 404, body: "" });
          }
        });
        const page = await ctx.newPage();
        const logs: string[] = [];
        const warnings: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error") logs.push(m.text().slice(0, 160));
          if (m.type() === "warning") warnings.push(m.text().slice(0, 160));
        });
        page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 160)}`));
        const rec: Record<string, unknown> = { slug: unit.slug, url: unit.url };
        try {
          await page.goto(`${server.origin}${unit.url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
          await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__), undefined, { timeout: 60_000 }).catch(() => undefined);
          await page.waitForTimeout(BOOT_MS);
          rec.presets = await page.evaluate(() => {
            const reg = (globalThis as { __AURA3D_LIVE_APPS__?: { all(): Array<{ diagnostics(): unknown }> } }).__AURA3D_LIVE_APPS__;
            const found = new Set<string>();
            for (const app of reg?.all() ?? []) {
              const json = JSON.stringify(app.diagnostics(), (_k, v) => (ArrayBuffer.isView(v) ? undefined : v));
              for (const m of json.matchAll(/"preset":"([^"]+)"/g)) found.add(m[1]!);
            }
            return [...found];
          });
          const png = await page.screenshot({ type: "png", timeout: 120_000 });
          rec.stats = await lumaStats(lab, png);
          const jpg = await page.screenshot({ type: "jpeg", quality: 55, timeout: 120_000 });
          console.log(`EXPOSURE_SCENE_FRAME ${unit.slug} ${jpg.toString("base64")}`);
        } catch (e) {
          rec.error = String((e as Error).message).slice(0, 200);
        }
        rec.errors = logs.slice(0, 4);
        rec.warnings = warnings.slice(0, 4);
        console.log(`EXPOSURE_SCENE_JSON ${JSON.stringify(rec)}`);
        await ctx.close();
        await lab.context().close();
      });
    }
  });
}
