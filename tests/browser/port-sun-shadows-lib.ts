import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Before/after sun-shadow frames for a port: the same scene with `?shadow=0` and with the sun's cascaded shadow on. Remote only
 * (tools/remote-acr/run.sh); frames are logged as `SLAMV_FILE <path> <i> <n> <base64>` (rebuild with tools/aura-slam/extract-frames.mjs).
 * The sun shadow may darken only where something casts: mean frame luma must stay within MAX_LUMA_DROP of the no-shadow frame.
 */
export const MAX_LUMA_DROP = 4;
const FILE_CHUNK = 15000;

export interface ShadowGame {
  readonly id: string;
  readonly url: string;
  readonly hook: string;
  readonly begin: string;
  readonly step: string;
}

function emit(path: string, bytes: Buffer): void {
  const b64 = bytes.toString("base64");
  const n = Math.ceil(b64.length / FILE_CHUNK);
  for (let i = 0; i < n; i++) console.log(`SLAMV_FILE ${path} ${i} ${n} ${b64.slice(i * FILE_CHUNK, (i + 1) * FILE_CHUNK)}`);
}

export function defineSunShadowSpec(game: ShadowGame): void {
  test.describe(`sun shadows: ${game.id}`, () => {
    test.setTimeout(3_000_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server?.close(); });

    test(`${game.id}: shadow on keeps the frame lit and adds shadows`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
        if (message.type() === "warning" || message.type() === "error") console.log(`PAGECONSOLE ${game.id} ${message.type()} ${message.text().slice(0, 300)}`);
      });
      await page.setViewportSize({ width: 640, height: 360 });
      const results: Record<string, { luma: number; drawCalls: number | null; shadows: unknown }> = {};
      for (const variant of ["off", "on"] as const) {
        await page.goto(`${server.origin}${game.url}${game.url.includes("?") ? "&" : "?"}shadow=${variant === "off" ? "0" : "1"}`, { waitUntil: "domcontentloaded" });
        try {
          await page.waitForFunction((hook) => {
            const w = window as unknown as Record<string, { ready?: (() => boolean) | boolean } | undefined>;
            const ready = w[hook]?.ready;
            return (typeof ready === "function" ? ready() : ready === true) || Boolean((w as Record<string, unknown>)[hook.replace(/__$/, "_ERROR__")]);
          }, game.hook, { timeout: 900_000 });
        } catch (error) {
          const info = await page.evaluate((hook) => ({
            error: (window as unknown as Record<string, unknown>)[hook.replace(/__$/, "_ERROR__")] ?? null,
            status: document.getElementById("loading-status")?.textContent ?? null,
            hook: typeof (window as unknown as Record<string, unknown>)[hook]
          }), game.hook).catch(() => null);
          console.log(`SUNSHADOW_BOOT_TIMEOUT ${game.id} ${variant} ${JSON.stringify(info)} errors=${JSON.stringify(errors.slice(0, 5))}`);
          throw error;
        }
        const bootError = await page.evaluate((hook) => (window as unknown as Record<string, unknown>)[hook.replace(/__$/, "_ERROR__")] ?? null, game.hook);
        expect(bootError, `${game.id} boot error`).toBeNull();
        await page.evaluate(`(() => { const h = window.${game.hook}; h.${game.begin}(); ${game.step}; })()`);
        // Textures upgrade one material at a time after mount (an early frame shows white models): wait until none is pending.
        await page.evaluate(async (hook) => {
          const h = (window as unknown as Record<string, { textures?: () => { pending: number } | null; renderNow?: () => void }>)[hook];
          if (typeof h?.textures !== "function") return;
          const t0 = performance.now();
          while (performance.now() - t0 < 240_000) {
            h.renderNow?.();
            if ((h.textures()?.pending ?? 0) === 0) break;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }, game.hook);
        await page.waitForTimeout(1500);
        // The game's own `frame()` hook returns the bare canvas (no DOM HUD on top); fall back to an element screenshot.
        const viaHook = await page.evaluate(async (hook) => {
          const h = (window as unknown as Record<string, { frame?: (w: number, h: number, q: number) => Promise<string> }>)[hook];
          if (typeof h?.frame !== "function") return null;
          try { return await h.frame(640, 360, 0.92); } catch { return null; }
        }, game.hook);
        const png = viaHook ? Buffer.from(viaHook.split(",")[1]!, "base64") : await page.locator("canvas").first().screenshot({ type: "png" });
        const mime = viaHook ? "image/jpeg" : "image/png";
        const stats = await page.evaluate(async ([b64, hook, type]) => {
          const bmp = await createImageBitmap(await (await fetch(`data:${type};base64,${b64}`)).blob());
          const cv = new OffscreenCanvas(bmp.width, bmp.height);
          const cx = cv.getContext("2d")!;
          cx.drawImage(bmp, 0, 0);
          const px = cx.getImageData(0, 0, bmp.width, bmp.height).data;
          let sum = 0;
          for (let i = 0; i < px.length; i += 4) sum += px[i]! * 0.2126 + px[i + 1]! * 0.7152 + px[i + 2]! * 0.0722;
          const h = (window as unknown as Record<string, { diagnostics?: () => { drawCalls?: number; shadows?: unknown } | null }>)[hook!];
          const d = h?.diagnostics?.() ?? null;
          return { luma: Number((sum / (px.length / 4)).toFixed(2)), drawCalls: d?.drawCalls ?? null, shadows: d?.shadows ?? null };
        }, [png.toString("base64"), game.hook, mime] as const);
        results[variant] = stats;
        console.log(`SUNSHADOW ${game.id} ${variant} ${JSON.stringify(stats).slice(0, 1500)}`);
        emit(`sun-shadows/${game.id}-${variant}.${viaHook ? "jpg" : "png"}`, png);
      }
      console.log(`SUNSHADOW_ERRORS ${game.id} ${JSON.stringify(errors.slice(0, 6))}`);
      expect(errors.filter((e) => !/favicon|Failed to load resource/i.test(e)), "console errors").toEqual([]);
      expect(results.on!.luma, `${game.id} mean luma with the sun shadow vs without`).toBeGreaterThanOrEqual(results.off!.luma - MAX_LUMA_DROP);
    });
  });
}
