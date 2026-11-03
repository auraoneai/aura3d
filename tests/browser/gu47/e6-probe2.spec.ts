import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 e6 probe 2 (remote runner only): the texture rows stuck `pending` wait in the bitmap load of one map
 * (`fcTurfRough` / `fcConcreteRough` / `net-alpha.png`). Logs the network lifecycle of those requests and times each
 * step of the engine's load (fetch, blob, createImageBitmap with the engine's options, createImageBitmap default)
 * on the stuck URL, each step capped at 20 s (`E6_NET`, `E6_STEP` lines).
 */
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const WATCH = /Rough|net-alpha/;

let server: ExampleDevServer;
test.setTimeout(1_200_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

const TARGETS = [
  ["fc-munich", "/apps/showcase-aura-fc-3d/index.html?venue=munich"],
  ["top-tennis", "/apps/showcase-top-tennis/"]
] as const;

for (const [name, path] of TARGETS) {
  test(`e6-load-${name}`, async ({ page }) => {
    const t0 = Date.now();
    const net: string[] = [];
    page.on("request", (r) => { if (WATCH.test(r.url())) net.push(`req ${Date.now() - t0} ${r.url().split("/").pop()}`); });
    page.on("requestfinished", (r) => { if (WATCH.test(r.url())) net.push(`fin ${Date.now() - t0} ${r.url().split("/").pop()}`); });
    page.on("requestfailed", (r) => { if (WATCH.test(r.url())) net.push(`fail ${Date.now() - t0} ${r.url().split("/").pop()} ${r.failure()?.errorText}`); });
    page.on("response", (r) => { if (WATCH.test(r.url())) net.push(`res ${Date.now() - t0} ${r.status()} ${r.headers()["content-type"]} ${r.headers()["content-length"]} ${r.url().split("/").pop()}`); });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 1000 });
    await page.waitForTimeout(20_000);
    log(`GL_META ${JSON.stringify({ target: `e6-load-${name}` })}`);
    const pending = await page.evaluate(() => {
      const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all?.()[0];
      const rows: any[] = app?.diagnostics?.()?.renderer?.runtime?.texturedMaterials ?? [];
      return rows.filter((r) => r.status === "pending").map((r) => ({ node: r.nodeName, stage: r.stage, pendingMs: r.pendingMs }));
    });
    log(`E6_NET ${JSON.stringify({ name, pending, net: net.slice(0, 40) })}`);
    const url = typeof pending[0]?.stage === "string" && pending[0].stage.startsWith("fetch ") ? pending[0].stage.slice(6) : null;
    if (!url) return;
    const steps = await page.evaluate(async (u) => {
      const out: Record<string, unknown> = { url: u };
      const cap = <T,>(p: Promise<T>): Promise<T | "TIMEOUT"> => Promise.race([p, new Promise<"TIMEOUT">((r) => setTimeout(() => r("TIMEOUT"), 20_000))]);
      const time = async <T,>(key: string, f: () => Promise<T>): Promise<T | "TIMEOUT" | undefined> => {
        const s = performance.now();
        try { const v = await cap(f()); out[key] = { ms: Math.round(performance.now() - s), timeout: v === "TIMEOUT" }; return v; }
        catch (e) { out[key] = { ms: Math.round(performance.now() - s), error: String(e).slice(0, 160) }; return undefined; }
      };
      const res = await time("fetch", () => fetch(u, { cache: "no-store" }));
      if (!res || res === "TIMEOUT") return out;
      out.status = res.status; out.type = res.headers.get("content-type");
      const blob = await time("blob", () => res.blob());
      if (!blob || blob === "TIMEOUT") return out;
      out.size = blob.size;
      const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
      out.head = Array.from(head).map((b) => b.toString(16).padStart(2, "0")).join("");
      const engine = await time("bitmapEngineOpts", () => createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" }));
      if (engine && engine !== "TIMEOUT") out.engineDims = [engine.width, engine.height];
      await time("bitmapPremulNone", () => createImageBitmap(blob, { premultiplyAlpha: "none" }));
      await time("bitmapCscNone", () => createImageBitmap(blob, { colorSpaceConversion: "none" }));
      await time("bitmapDefault", () => createImageBitmap(blob));
      await time("imgDecode", async () => { const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); return img; });
      return out;
    }, url);
    log(`E6_STEP ${JSON.stringify({ name, steps })}`);
  });
}
