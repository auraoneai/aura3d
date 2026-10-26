import { readFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Per-game luma probe for the post-chain migration. Serves each live game from the staged tree through the example dev
 * server (software WebGL2, small canvas) and prints one POSTLUMAGAME_JSON line per game: whole-frame mean luma, the
 * POSTPROCESS_V2_UNMIGRATED console warning (must be absent after the migration) and console errors. Games animate, so a
 * single frame is a coarse figure: compare the shift, not the absolute value.
 */
interface Game { readonly slug: string; readonly appFolder: string }
const GAMES = JSON.parse(readFileSync(new URL("./post-luma-games.json", import.meta.url), "utf8")) as Game[];
const BOOT_MS = 14_000;
const ASSET_ORIGIN = process.env.LUMA_ASSET_ORIGIN ?? "https://aura3d.auraone.ai";
const ASSET_PATH = /\.(glb|gltf|bin|ktx2|png|jpe?g|webp|wav|mp3|ogg|hdr|exr|json)(\?.*)?$/i;

async function lumaStats(lab: Page, png: Buffer): Promise<{ nonBlack: number; mean: number; chroma: number }> {
  return lab.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nb = 0, s = 0, ch = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (l > 8) nb++;
      s += l;
      ch += Math.max(d[i]!, d[i + 1]!, d[i + 2]!) - Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
    }
    return { nonBlack: nb / n, mean: s / n, chroma: ch / n };
  }, png.toString("base64"));
}

export function defineShard(index: number, count: number): void {
  const slice = GAMES.filter((_, i) => i % count === index);
  test.describe(`post luma games shard ${index}`, () => {
    test.setTimeout(1_500_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });
    for (const game of slice) {
      test(`luma ${game.slug}`, async ({ browser }) => {
        const lab = await (await browser.newContext()).newPage();
        await lab.goto("about:blank");
        const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
        // Hash-named model files are produced by the production build and are not in the checkout:
        // fetch whatever the local server 404s from the deployed site so every game can mount.
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
        let warned = false;
        page.on("console", (m) => {
          const t = m.text();
          if (/POSTPROCESS_V2_UNMIGRATED/.test(t)) warned = true;
          if (m.type() === "error") logs.push(t.slice(0, 160));
        });
        page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 160)}`));
        const rec: Record<string, unknown> = { slug: game.slug };
        try {
          await page.goto(`${server.origin}/apps/${game.appFolder}/?heal=0`, { waitUntil: "domcontentloaded", timeout: 120_000 });
          await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__), undefined, { timeout: 90_000 }).catch(() => undefined);
          await page.waitForTimeout(BOOT_MS);
          const png = await page.screenshot({ type: "png", timeout: 120_000 });
          rec.stats = await lumaStats(lab, png);
        } catch (e) {
          rec.error = String((e as Error).message).slice(0, 200);
        }
        rec.unmigratedWarning = warned;
        rec.errors = [...new Set(logs)].slice(0, 5);
        console.log(`POSTLUMAGAME_JSON ${JSON.stringify(rec)}`);
        await ctx.close();
      });
    }
  });
}
