import { expect, test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Screenshot retake (docs/workflows/game-rework-prompt.md section 5). Remote-only (tools/remote-acr/run.sh); never
 * under local Playwright. Frames go to the log as `@@SB <slug> <name> <i> <n> <base64 jpeg>` and are decoded locally.
 */
export interface State { name: string; drive: string; mobile?: boolean; settle?: number }
export interface GameCfg {
  slug: string;
  folder: string;
  hook: string;
  titleQuery: string;
  manualQuery: string;
  states: State[];
  card: string;
  desktop?: { width: number; height: number };
  lowQuality?: boolean;
  /**
   * Optional: split the desktop and mobile state passes into named chunks (each its own test, so one remote run stays
   * under the 1 h ACR cap on a heavy scene). Each chunk runs its states in order on a fresh page; a chunk must start
   * with a state that resets the game. Without `chunks` the single desktop and mobile tests run as before.
   */
  chunks?: { name: string; states: string[] }[];
}

const emit = (slug: string, name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000, n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SB ${slug} ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};

const raf = (page: Page, n: number) => page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const readyProbe = (h: string): boolean => {
  const a = (window as unknown as Record<string, any>)[h];
  if (!a) return !!(window as unknown as Record<string, unknown>)[`${h.replace(/__$/, "")}_ERROR__`];
  return typeof a.ready === "function" ? a.ready() === true : a.ready === true;
};

async function openGame(browser: Browser, server: ExampleDevServer, cfg: GameCfg, query: string, viewport: { width: number; height: number }, mobile: boolean, log: string[]): Promise<Page> {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log.push(`pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") log.push(`console ${m.text().slice(0, 200)}`); });
  const tryLoad = async (q: string, timeout: number): Promise<boolean> => {
    await page.goto(`${server.origin}/examples/${cfg.folder}/${q}`, { waitUntil: "domcontentloaded" });
    try { await page.waitForFunction(readyProbe, cfg.hook, { timeout }); return true; } catch { return false; }
  };
  let ok = await tryLoad(query, cfg.lowQuality ? 900_000 : 540_000);
  if (!ok && !cfg.lowQuality) {
    const sep = query.includes("?") ? "&" : "?";
    log.push("LOWQ fallback after the default-quality boot timed out");
    ok = await tryLoad(`${query}${sep}quality=low`, 900_000);
  }
  expect(ok, `${cfg.slug} never became ready: ${log.slice(0, 4).join(" | ")}`).toBe(true);
  return page;
}

const overlays = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll<HTMLElement>("body *").forEach((e) => {
    if (!e.id || e.classList.contains("hidden")) return;
    const s = getComputedStyle(e);
    if ((s.position === "fixed" || s.position === "absolute") && e.offsetWidth > 240 && e.offsetHeight > 120 && s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0") out.push(e.id);
  });
  return out.slice(0, 14).join(",");
});

export function shotsb(cfg: GameCfg): void {
  const desktop = cfg.desktop ?? { width: 1280, height: 720 };
  const tag = (w: number) => `${w}`;
  test.describe(`shotsb ${cfg.slug}`, () => {
    test.setTimeout(3_300_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });

    const run = async (page: Page, states: State[], suffix: string, log: string[], stopAfter?: string): Promise<void> => {
      for (const st of states) {
        let err = "";
        try {
          await page.evaluate(({ hook, drive }) => {
            const api = (window as unknown as Record<string, any>)[hook];
            // eslint-disable-next-line no-new-func
            return new Function("api", drive)(api);
          }, { hook: cfg.hook, drive: st.drive });
        } catch (e) { err = String(e).slice(0, 240); }
        await raf(page, st.settle ?? 3);
        if (!stopAfter || st.name === stopAfter) emit(cfg.slug, `${st.name}-${suffix}`, await page.screenshot({ type: "jpeg", quality: 90 }));
        const info = await page.evaluate((hook) => {
          const a = (window as unknown as Record<string, any>)[hook];
          let s: unknown = null;
          try { s = typeof a.state === "function" ? a.state() : a.state; } catch (e) { s = `ERR ${String(e)}`; }
          return JSON.stringify(s)?.slice(0, 500) ?? "null";
        }, cfg.hook);
        process.stdout.write(`@@SBSTATE ${cfg.slug} ${st.name}-${suffix} overlays=[${await overlays(page)}] drive_err=${err || "none"} state=${info}\n`);
        if (stopAfter && st.name === stopAfter) return;
      }
    };

    test(`title ${cfg.slug}`, async ({ browser }) => {
      const log: string[] = [];
      for (const [w, h, mobile] of [[desktop.width, desktop.height, false], [390, 844, true]] as const) {
        const page = await openGame(browser, server, cfg, cfg.titleQuery, { width: w, height: h }, mobile, log);
        await raf(page, 6);
        emit(cfg.slug, `title-${tag(w)}`, await page.screenshot({ type: "jpeg", quality: 90 }));
        const text = await page.evaluate(() => `${document.title} || ${(document.body.innerText || "").replace(/\s+/g, " ").slice(0, 260)}`);
        process.stdout.write(`@@SBTITLE ${cfg.slug} ${w} overlays=[${await overlays(page)}] ${text}\n`);
        await page.context().close();
      }
      process.stdout.write(`@@SBERRORS ${cfg.slug} title ${JSON.stringify(log.slice(0, 8))}\n`);
    });

    if (cfg.chunks) {
      for (const chunk of cfg.chunks) {
        const states = cfg.states.filter((s) => chunk.states.includes(s.name));
        test(`states desktop ${chunk.name} ${cfg.slug}`, async ({ browser }) => {
          const log: string[] = [];
          const page = await openGame(browser, server, cfg, cfg.manualQuery, desktop, false, log);
          await run(page, states, tag(desktop.width), log);
          process.stdout.write(`@@SBERRORS ${cfg.slug} desktop-${chunk.name} ${JSON.stringify(log.slice(0, 8))}\n`);
          await page.context().close();
        });
        test(`states mobile ${chunk.name} ${cfg.slug}`, async ({ browser }) => {
          const log: string[] = [];
          const page = await openGame(browser, server, cfg, cfg.manualQuery, { width: 390, height: 844 }, true, log);
          await run(page, states.filter((s) => s.mobile !== false), "390", log);
          process.stdout.write(`@@SBERRORS ${cfg.slug} mobile-${chunk.name} ${JSON.stringify(log.slice(0, 8))}\n`);
          await page.context().close();
        });
      }
    } else {
    test(`states desktop ${cfg.slug}`, async ({ browser }) => {
      const log: string[] = [];
      const page = await openGame(browser, server, cfg, cfg.manualQuery, desktop, false, log);
      await run(page, cfg.states, tag(desktop.width), log);
      process.stdout.write(`@@SBERRORS ${cfg.slug} desktop ${JSON.stringify(log.slice(0, 8))}\n`);
      await page.context().close();
    });

    test(`states mobile ${cfg.slug}`, async ({ browser }) => {
      const log: string[] = [];
      const page = await openGame(browser, server, cfg, cfg.manualQuery, { width: 390, height: 844 }, true, log);
      await run(page, cfg.states.filter((s) => s.mobile !== false), "390", log);
      process.stdout.write(`@@SBERRORS ${cfg.slug} mobile ${JSON.stringify(log.slice(0, 8))}\n`);
      await page.context().close();
    });
    }

    test(`card ${cfg.slug}`, async ({ browser }) => {
      const log: string[] = [];
      const page = await openGame(browser, server, cfg, cfg.manualQuery, { width: 1440, height: 900 }, false, log);
      await run(page, cfg.states, "card2x", log, cfg.card);
      process.stdout.write(`@@SBERRORS ${cfg.slug} card ${JSON.stringify(log.slice(0, 8))}\n`);
      await page.context().close();
    });
  });
}
