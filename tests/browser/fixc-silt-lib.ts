import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Screenshot retake, group C (Lamplight Line, Saltwind Highway, The Bellkeeper's Walk, Duneglide, Cumulus Dash,
 * Apex Overdrive). Remote only (tools/remote-acr/run.sh, software WebGL2). Frames are printed as
 * `@@SC <slug> <name> <i> <n> <base64 jpeg>` and decoded by tools/shots/decode-shots.mjs.
 * shotsc(slugs) registers the shot and card tests for the listed games.
 */

interface Cfg {
  id?: string;
  skipTitle?: boolean;
  slug: string;
  base: string;
  hook: string;
  desktop: [number, number];
  mobile: [number, number];
  titleQuery: string;
  playQuery: string;
  /** driven after the manual load; each entry is a named state */
  steps: Array<{ name: string; drive: string; mobile?: boolean }>;
  readiness?: "hook" | "body";
}

const D = (w: number, h: number): [number, number] => [w, h];
const FLY = "{ throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false }";
const FLYB = "{ throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false }";

const GAMES: Cfg[] = [
  {
    slug: "silt-and-signal", base: "/examples/silt-and-signal-port/", hook: "__AURA_SILT__", desktop: D(1280, 720), mobile: D(390, 844),
    titleQuery: "?quality=low", playQuery: "?manual=1&start=1&chapter=0&objective=1",
    steps: [
      { name: "gameplay-early", mobile: true, drive: `api.render(); api.render();` },
      { name: "results", mobile: true, drive: `api.setMode("done"); api.render(); api.render();` }
    ]
  },
  {
    id: "silt-fly", skipTitle: true, slug: "silt-and-signal", base: "/examples/silt-and-signal-port/", hook: "__AURA_SILT__", desktop: D(1280, 720), mobile: D(390, 844),
    titleQuery: "?quality=low", playQuery: "?manual=1&start=1&chapter=0&objective=2",
    steps: [
      { name: "key-start", mobile: true, drive: `api.render(); api.render();` },
      { name: "flight-boost", mobile: true, drive: `api.stepFrames(200, ${FLYB}); api.render(); api.render();` },
      { name: "mid-flight", drive: `api.stepFrames(500, ${FLY}); api.render(); api.render();` }
    ]
  },
  {
    id: "last-train-results", skipTitle: true, slug: "last-train", base: "/examples/last-train-port/", hook: "__AURA_LAST_TRAIN__", desktop: D(1280, 720), mobile: D(390, 844),
    titleQuery: "?quality=low", playQuery: "?manual=1&quality=low",
    steps: [
      { name: "results-a", drive: `api.setAutopilot(true); api.advance(30000); api.stepFrames(1);` },
      { name: "results-b", drive: `api.setAutopilot(true); api.advance(30000); api.stepFrames(1);` }
    ]
  },
  {
    id: "rh-card", skipTitle: true, slug: "roadster-hours", base: "/examples/roadster-hours-port/", hook: "__AURA_ROADSTER_HOURS__", desktop: D(1280, 720), mobile: D(390, 844),
    titleQuery: "?quality=low", playQuery: "?manual=1",
    steps: [
      { name: "key-drive", drive: `api.begin(); api.setAutopilot(true); api.stepSteps(700); api.renderNow();` }
    ]
  },
  {
    slug: "where-the-wind-wanders", base: "/examples/where-the-wind-wanders-port/", hook: "__AURA_WIND__", desktop: D(1280, 720), mobile: D(390, 844),
    titleQuery: "?quality=low", playQuery: "?manual=1&quality=low",
    steps: [
      { name: "gameplay-early", mobile: true, drive: `api.stepFrames(60);` },
      { name: "key-walk", mobile: true, drive: `api.stepFrames(120, "D");` },
      { name: "mid-walk", drive: `api.stepFrames(300, "D");` },
      { name: "results", drive: `api.epilogue(6);` }
    ]
  },
  {
    slug: "roadster-hours", base: "/examples/roadster-hours-port/", hook: "__AURA_ROADSTER_HOURS__", desktop: D(1280, 720), mobile: D(390, 844),
    titleQuery: "?quality=low", playQuery: "?manual=1",
    steps: [
      { name: "gameplay-early", mobile: true, drive: `api.begin(); api.renderNow();` },
      { name: "key-drive", mobile: true, drive: `api.setAutopilot(true); api.stepSteps(240); api.renderNow();` },
      { name: "mid-drive", drive: `api.stepSteps(1440); api.renderNow();` },
      { name: "results", drive: `api.stepSteps(200000); api.renderNow();` }
    ]
  },
  {
    slug: "kid-goku-beyond-the-clouds", base: "/examples/kid-goku-beyond-the-clouds-port/", hook: "__AURA_CUMULUS_DASH__", desktop: D(640, 360), mobile: D(390, 844),
    titleQuery: "?quality=low", playQuery: "?manual=1&quality=low",
    steps: [
      { name: "gameplay-early", mobile: true, drive: `api.begin(); api.settle(20, true);` },
      { name: "key-run", mobile: true, drive: `api.play(120, { steer: 0, jump: false, pole: false, nimbus: false, brake: false }); api.settle(2, false);` },
      { name: "key-jump", drive: `api.play(2, { steer: 0, jump: true, pole: false, nimbus: false, brake: false }); api.play(14, { steer: 0, jump: false, pole: false, nimbus: false, brake: false }); api.settle(2, false);` },
      { name: "mid-track", drive: `api.place(600, {}); api.settle(30, true);` },
      { name: "results", drive: `api.place(1000000, {}); api.settle(240, true);` }
    ]
  },
  {
    slug: "last-train", base: "/examples/last-train-port/", hook: "__AURA_LAST_TRAIN__", desktop: D(1280, 720), mobile: D(390, 844),
    titleQuery: "?quality=low", playQuery: "?manual=1&quality=low",
    steps: [
      { name: "gameplay-early", mobile: true, drive: `api.stepFrames(2);` },
      { name: "key-depart", mobile: true, drive: `api.doors(); api.advance(300); api.depart(); api.stepFrames(240, { accelerate: true });` },
      { name: "mid-leg", drive: `api.setAutopilot(true); api.advance(900); api.stepFrames(1);` },
      { name: "results", drive: `api.runCircuit(0); api.stepFrames(1);` }
    ]
  }
];

const emit = (slug: string, name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SC ${slug} ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};

const raf = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function waitReady(page: Page, hook: string, ms: number): Promise<boolean> {
  try {
    await page.waitForFunction((h) => {
      const a = (window as unknown as Record<string, any>)[h];
      if (!a) return false;
      return typeof a.ready === "function" ? a.ready() === true : a.ready === true;
    }, hook, { timeout: ms, polling: 1000 });
    return true;
  } catch { return false; }
}

export function fixcSilt(wanted: string[], opts: { cardsOnly?: boolean } = {}): void {
test.describe("fixc", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const cfg of GAMES.filter((g) => wanted.length === 0 || wanted.includes(g.id ?? g.slug))) {
    for (const mode of opts.cardsOnly ? [] : (["desktop", "mobile"] as const)) {
      test(`fixc ${cfg.id ?? cfg.slug} ${mode}`, async ({ browser }) => {
        const [w, h] = cfg[mode];
        const errors: string[] = [];
        const tag = mode === "desktop" ? `${w}x${h}` : `${w}x${h}`;
        const hook = cfg.hook;
        // Title: default page (title screen), no manual stepping.
        if (false) {
          const page = await browser.newPage({ viewport: { width: w, height: h } });
          page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
          page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
          await page.goto(`${server.origin}${cfg.base}${cfg.titleQuery}`, { waitUntil: "domcontentloaded" });
          const ok = await waitReady(page, hook, 1_500_000);
          process.stdout.write(`@@SCSTATE ${cfg.slug} ${tag} title ready=${ok}\n`);
          if (ok) {
            await raf(page, 8);
            emit(cfg.slug, `title.${tag}`, await page.screenshot({ type: "jpeg", quality: 90 }));
          }
          await page.close();
        }
        // Gameplay states: manual load, driven through the QA hooks.
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
        await page.goto(`${server.origin}${cfg.base}${cfg.playQuery}`, { waitUntil: "domcontentloaded" });
        const ready = await waitReady(page, hook, 1_500_000);
        process.stdout.write(`@@SCSTATE ${cfg.slug} ${tag} play-ready=${ready}\n`);
        if (ready) {
          for (const step of cfg.steps) {
            if (mode === "mobile" && !step.mobile) continue;
            try {
              await page.evaluate(({ hk, drive }) => {
                const api = (window as unknown as Record<string, any>)[hk];
                // eslint-disable-next-line no-new-func
                return new Function("api", drive)(api);
              }, { hk: hook, drive: step.drive });
              await raf(page, 4);
              emit(cfg.slug, `${step.name}.${tag}`, await page.screenshot({ type: "jpeg", quality: 90 }));
              const st = await page.evaluate((hk) => {
                const a = (window as unknown as Record<string, any>)[hk];
                try { const s = typeof a.snapshot === "function" ? a.snapshot() : typeof a.state === "function" ? a.state() : a.state; return JSON.stringify(s)?.slice(0, 600) ?? null; } catch (e) { return `ERR ${String(e)}`; }
              }, hook);
              process.stdout.write(`@@SCSTATE ${cfg.slug} ${tag} ${step.name} ${st}\n`);
            } catch (e) {
              process.stdout.write(`@@SCSTATE ${cfg.slug} ${tag} ${step.name} FAILED ${String(e).slice(0, 300)}\n`);
            }
          }
        }
        await page.close();
        process.stdout.write(`@@SCERRORS ${cfg.slug} ${tag} ${JSON.stringify(errors.slice(0, 8))}\n`);
        expect(true).toBe(true);
      });
    }
  }

});
}
