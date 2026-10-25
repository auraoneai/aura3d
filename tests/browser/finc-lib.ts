import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Final screenshot recapture, group C, after the UI and render fixes (names, mobile layouts, texture order,
 * device-scale sizing, Duneglide HUD and camera). Remote only (tools/remote-acr/run.sh, software WebGL2).
 * Frames: `@@SC <slug> <name> <i> <n> <b64 jpeg>` (decoded by tools/shots/decode-shots.mjs with SHOTS_DATE=final).
 * Numbers: `@@SCSTAT` (luma, dark and white fractions), `@@SCTEXT` (visible text), `@@SCCANVAS` (canvas vs viewport),
 * `@@SCSETTLE` (texture upgrade wait), `@@SCSTATE` (QA state), `@@SCERRORS` (console and response errors).
 */

export interface Cfg {
  id: string;
  slug: string;
  base: string;
  hook: string;
  desktop: [number, number];
  mobile: [number, number];
  titleQuery: string;
  playQuery: string;
  /** driven after the manual load, in order; each entry is a named state */
  steps: Array<{ name: string; drive: string; mobile?: boolean }>;
  /** page.evaluate expression body (has `api`) that renders once, used while waiting for textures */
  pump?: string;
  /** wait for every textured material to settle (diagnostics via the hook) before the first capture */
  settle?: boolean;
  /** states captured as the card image (720x450 at 2x, 1x derived by downscaling in the page) */
  cardUpTo: string;
}

export const OLD_NAMES = /(paozu|goku|saiyan|kamehameha|cloud runner|beyond the cloud|where the wind|silt\s*(&|and)\s*signal|last train|roadster hours|\bport\b|crayon|aura3d port)/i;

export const emit = (slug: string, name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SC ${slug} ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};

export const say = (tag: string, slug: string, data: unknown): void => { process.stdout.write(`@@${tag} ${slug} ${JSON.stringify(data)}\n`); };

export const raf = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

export async function waitReady(page: Page, hook: string, ms: number): Promise<boolean> {
  try {
    await page.waitForFunction((h) => {
      const a = (window as unknown as Record<string, any>)[h];
      if (!a) return false;
      return typeof a.ready === "function" ? a.ready() === true : a.ready === true;
    }, hook, { timeout: ms, polling: 1000 });
    return true;
  } catch { return false; }
}

interface Stats { readonly meanLuma: number; readonly darkFraction: number; readonly whiteFraction: number }
/** Decodes a PNG screenshot inside the page and measures a region (fractions of the frame). */
export const regionStats = (page: Page, png: Buffer, box: [number, number, number, number]): Promise<Stats> =>
  page.evaluate(async ({ b64, r }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const x0 = Math.floor(r[0] * img.width), y0 = Math.floor(r[1] * img.height), x1 = Math.ceil(r[2] * img.width), y1 = Math.ceil(r[3] * img.height);
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let sum = 0, dark = 0, white = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i]!, G = d[i + 1]!, B = d[i + 2]!;
      const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      sum += l;
      if (l < 10) dark += 1;
      if (Math.min(R, G, B) > 205 && Math.max(R, G, B) - Math.min(R, G, B) < 18) white += 1;
    }
    return { meanLuma: Math.round((sum / n) * 10) / 10, darkFraction: Math.round((dark / n) * 1e4) / 1e4, whiteFraction: Math.round((white / n) * 1e4) / 1e4 };
  }, { b64: png.toString("base64"), r: box });

/** Emits the JPEG, its stats, the visible text and the canvas sizes for one named state. */
export async function shoot(page: Page, slug: string, tag: string, name: string): Promise<void> {
  const png = await page.screenshot({ type: "png" });
  const full = await regionStats(page, png, [0, 0, 1, 1]);
  const center = await regionStats(page, png, [0.25, 0.4, 0.75, 0.9]);
  emit(slug, `${name}.${tag}`, await page.screenshot({ type: "jpeg", quality: 90 }));
  say("SCSTAT", slug, { tag, name, full, center });
  const text = await page.evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 700));
  say("SCTEXT", slug, { tag, name, oldNames: OLD_NAMES.exec(text)?.[0] ?? null, text });
  const canv = await page.evaluate(() => ({
    inner: [innerWidth, innerHeight], dpr: devicePixelRatio,
    canvases: Array.from(document.querySelectorAll("canvas")).slice(0, 4).map((c) => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }))
  }));
  say("SCCANVAS", slug, { tag, name, ...canv });
}

/** Evaluates the textured-material summary through whichever accessor the hook offers. */
const TEX_PROBE = `(() => {
  const api = window[__HOOK__];
  if (!api) return null;
  let rows = null;
  try {
    if (typeof api.textures === "function") { const s = api.textures(); return { total: s.total, textured: s.textured, pending: s.pending, fallback: s.fallback, hero: s.byNode }; }
    let d = null;
    const app = typeof api.app === "function" ? api.app() : api.app;
    if (app && typeof app.diagnostics === "function") d = app.diagnostics();
    else if (api.diagnostics && typeof api.diagnostics !== "function") d = api.diagnostics;
    else if (typeof api.info === "function") d = api.info()?.diagnostics;
    rows = d?.renderer?.runtime?.texturedMaterials ?? null;
  } catch (e) { return { error: String(e) }; }
  if (!rows) return { none: true };
  const c = { total: rows.length, textured: 0, pending: 0, fallback: 0 };
  for (const r of rows) { if (r.status === "textured") c.textured++; else if (r.status === "pending") c.pending++; else if (r.status === "fallback") c.fallback++; }
  return c;
})()`;

/** Polls until no textured material is pending (or the budget runs out); renders between polls so the upgrade pass advances. */
export async function settleTextures(page: Page, cfg: Cfg, tag: string, budgetMs: number): Promise<void> {
  const t0 = Date.now();
  let last: Record<string, unknown> | null = null;
  let stable = 0;
  let prevKey = "";
  while (Date.now() - t0 < budgetMs) {
    try {
      last = await page.evaluate(({ hk, probe, pump }) => {
        const api = (window as unknown as Record<string, any>)[hk];
        // eslint-disable-next-line no-new-func
        if (pump) new Function("api", pump)(api);
        // eslint-disable-next-line no-eval
        return (0, eval)(probe.replace("__HOOK__", JSON.stringify(hk)));
      }, { hk: cfg.hook, probe: TEX_PROBE, pump: cfg.pump ?? "" });
    } catch (e) { last = { error: String(e).slice(0, 160) }; }
    const l = last as { total?: number; pending?: number; textured?: number; none?: boolean; error?: string } | null;
    if (!l || l.none || l.error) { stable += 1; if (stable >= 3) break; }
    else {
      const key = `${l.total}/${l.textured}/${l.pending}`;
      stable = key === prevKey ? stable + 1 : 0;
      prevKey = key;
      if ((l.total ?? 0) > 0 && l.pending === 0 && stable >= 2) break;
    }
    await page.waitForTimeout(5000);
  }
  say("SCSETTLE", cfg.slug, { tag, seconds: Math.round((Date.now() - t0) / 1000), last });
}

const driveStep = (page: Page, hook: string, drive: string) =>
  page.evaluate(({ hk, drive: body }) => {
    const api = (window as unknown as Record<string, any>)[hk];
    // eslint-disable-next-line no-new-func
    return new Function("api", body)(api);
  }, { hk: hook, drive });

const stateOf = (page: Page, hook: string) =>
  page.evaluate((hk) => {
    const a = (window as unknown as Record<string, any>)[hk];
    try { const s = typeof a.snapshot === "function" ? a.snapshot() : typeof a.state === "function" ? a.state() : a.state; return JSON.stringify(s)?.slice(0, 500) ?? null; } catch (e) { return `ERR ${String(e)}`; }
  }, hook);

export type Mode = "desktop" | "mobile" | "card" | "dsf2" | "title-desktop" | "title-mobile";

export function finc(cfgs: Cfg[], modes: Mode[], opts: { settleBudgetMs?: number; dsf2Size?: [number, number] } = {}): void {
  const budget = opts.settleBudgetMs ?? 30 * 60_000;
  test.describe("finc", () => {
    test.setTimeout(3_300_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });

    for (const cfg of cfgs) {
      for (const tm of modes.filter((m) => m === "title-desktop" || m === "title-mobile")) {
        test(`final ${cfg.id} ${tm}`, async ({ browser }) => {
          const [w, h] = cfg[tm === "title-desktop" ? "desktop" : "mobile"];
          const tag = `${w}x${h}`;
          const page = await browser.newPage({ viewport: { width: w, height: h } });
          await page.goto(`${server.origin}${cfg.base}${cfg.titleQuery}`, { waitUntil: "domcontentloaded" });
          const ok = await waitReady(page, cfg.hook, 1_500_000);
          say("SCSTATE", cfg.slug, { tag, state: "title-settled", ready: ok });
          if (ok) { await settleTextures(page, cfg, tag, budget); await raf(page, 8); await shoot(page, cfg.slug, tag, "title"); }
          await page.close();
          expect(true).toBe(true);
        });
      }
      for (const mode of modes.filter((m) => m === "desktop" || m === "mobile")) {
        test(`final ${cfg.id} ${mode}`, async ({ browser }) => {
          const [w, h] = cfg[mode as "desktop" | "mobile"];
          const tag = `${w}x${h}`;
          const errors: string[] = [];
          const watch = (page: Page) => {
            page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
            page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
            page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
          };
          // Title: default page, no manual stepping.
          {
            const page = await browser.newPage({ viewport: { width: w, height: h } });
            watch(page);
            await page.goto(`${server.origin}${cfg.base}${cfg.titleQuery}`, { waitUntil: "domcontentloaded" });
            const ok = await waitReady(page, cfg.hook, 1_500_000);
            say("SCSTATE", cfg.slug, { tag, state: "title", ready: ok });
            if (ok) { await raf(page, 8); await shoot(page, cfg.slug, tag, "title"); }
            await page.close();
          }
          const page = await browser.newPage({ viewport: { width: w, height: h } });
          watch(page);
          await page.goto(`${server.origin}${cfg.base}${cfg.playQuery}`, { waitUntil: "domcontentloaded" });
          const ready = await waitReady(page, cfg.hook, 1_500_000);
          say("SCSTATE", cfg.slug, { tag, state: "play-ready", ready });
          if (ready) {
            let settled = false;
            for (const step of cfg.steps) {
              if (mode === "mobile" && !step.mobile) continue;
              try {
                await driveStep(page, cfg.hook, step.drive);
                if (cfg.settle && !settled) { await settleTextures(page, cfg, tag, budget); settled = true; await driveStep(page, cfg.hook, step.drive); }
                await raf(page, 4);
                await shoot(page, cfg.slug, tag, step.name);
                say("SCSTATE", cfg.slug, { tag, state: step.name, snapshot: await stateOf(page, cfg.hook) });
              } catch (e) { say("SCSTATE", cfg.slug, { tag, state: step.name, failed: String(e).slice(0, 300) }); }
            }
          }
          await page.close();
          say("SCERRORS", cfg.slug, { tag, errors: errors.slice(0, 10) });
          expect(true).toBe(true);
        });
      }

      if (modes.includes("card")) {
        test(`final ${cfg.id} card`, async ({ browser }) => {
          const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
          const page = await ctx.newPage();
          await page.goto(`${server.origin}${cfg.base}${cfg.playQuery}`, { waitUntil: "domcontentloaded" });
          const ready = await waitReady(page, cfg.hook, 1_500_000);
          if (ready) {
            const upTo = Math.max(0, cfg.steps.findIndex((s) => s.name === cfg.cardUpTo));
            for (const step of cfg.steps.slice(0, upTo + 1)) await driveStep(page, cfg.hook, step.drive);
            if (cfg.settle) { await settleTextures(page, cfg, "card", budget); await driveStep(page, cfg.hook, cfg.steps[upTo]!.drive); }
            await raf(page, 4);
            await shoot(page, cfg.slug, "1440x900", "card.2x");
            // The 1x card is the same frame downscaled to 720x450 in the page (one capture, one state).
            const png = await page.screenshot({ type: "png" });
            const jpegB64 = await page.evaluate(async (b64) => {
              const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
              const c = document.createElement("canvas"); c.width = 720; c.height = 450;
              const g = c.getContext("2d")!; g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, 720, 450);
              return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
            }, png.toString("base64"));
            emit(cfg.slug, "card.1x", Buffer.from(jpegB64, "base64"));
          } else say("SCSTATE", cfg.slug, { tag: "card", state: "NOT-READY" });
          await ctx.close();
        });
      }

      if (modes.includes("dsf2")) {
        test(`final ${cfg.id} dsf2`, async ({ browser }) => {
          const [w, h] = opts.dsf2Size ?? cfg.desktop;
          const tag = `${w}x${h}@2x`;
          const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
          const page = await ctx.newPage();
          await page.goto(`${server.origin}${cfg.base}${cfg.playQuery}`, { waitUntil: "domcontentloaded" });
          const ready = await waitReady(page, cfg.hook, 1_500_000);
          say("SCSTATE", cfg.slug, { tag, state: "play-ready", ready });
          if (ready) {
            const run = cfg.steps.find((s) => s.name.startsWith("key")) ?? cfg.steps[0]!;
            for (const step of cfg.steps.slice(0, cfg.steps.indexOf(run) + 1)) await driveStep(page, cfg.hook, step.drive);
            if (cfg.settle) { await settleTextures(page, cfg, tag, budget); await driveStep(page, cfg.hook, run.drive); }
            await raf(page, 4);
            await shoot(page, cfg.slug, tag, "dsf2-key");
            // Crop check: the 3D view must fill the whole frame (top-right dark region was 99.6% before the fix).
            const png = await page.screenshot({ type: "png" });
            say("SCCROP", cfg.slug, { tag, topRight: await regionStats(page, png, [0.55, 0, 1, 0.45]), bottomRight: await regionStats(page, png, [0.55, 0.55, 1, 1]) });
          }
          await ctx.close();
        });
      }
    }
  });
}
