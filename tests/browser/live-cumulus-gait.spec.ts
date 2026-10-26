import { expect, test } from "@playwright/test";

/**
 * Cumulus Dash leg motion against the PRODUCTION site (the game never finishes loading from a staged checkout on the runner, production boots in
 * seconds). Remote-only (tools/remote-acr/run.sh). `?manual=1` makes the sim advance only through the QA hook. Logs `KG_LIVE_FRAME <name> <base64 jpeg>`
 * frames: a ramp from standing to a jog, a sprint strip across two stride cycles, and `KG_LIVE_GAIT` rows from the hook.
 */
const URL = process.env.LIVE_CUMULUS_URL ?? "https://aura3d.auraone.ai/apps/cumulus-dash/?manual=1";
interface Gait { clip: string; phase: number; rate: number; weight?: number; cadence?: number; stance?: number; lean?: number; groundSpeed: number }
interface Api {
  ready: boolean;
  begin(): void;
  snapshot(): { phase: string; speed: number; jump: number };
  play(n: number, input?: Record<string, unknown>): string[];
  frame(w?: number, h?: number, q?: number): Promise<string>;
  gait?(): Gait | null;
  errors(): string[];
}
declare global { interface Window { __AURA_KID_GOKU__?: Api; __AURA_CUMULUS_DASH__?: Api } }
// installQaHooks("kid-goku") publishes `__AURA_KID_GOKU__`; the pre-rename global was `__AURA_CUMULUS_DASH__`, so both are read

test("live Cumulus Dash: walk-to-sprint ramp and a sprint strip across two stride cycles", async ({ browser }) => {
  test.setTimeout(1_800_000);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 270 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const response = await page.goto(URL, { waitUntil: "load", timeout: 120_000 });
  console.log(`KG_LIVE_BOOT ${JSON.stringify({ url: page.url(), status: response?.status() })}`);
  await page.waitForFunction(() => (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)?.ready === true, undefined, { timeout: 300_000 });
  const IDLE = { steer: 0, jump: false, pole: false, glider: false, brake: false };
  const rows: Gait[] = [];
  const grab = async (name: string, steps: number, keep = false): Promise<void> => {
    const out = await page.evaluate(async ([n, i]) => {
      const a = (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)!;
      a.play(n as number, i as Record<string, unknown>);
      const jpeg = await a.frame(540, 405, 0.9);
      return { jpeg, gait: a.gait?.() ?? null, snap: a.snapshot() };
    }, [steps, IDLE] as const);
    console.log(`KG_LIVE_FRAME ${name} ${out.jpeg}`);
    console.log(`KG_LIVE_GAIT ${JSON.stringify({ name, ...out.gait, speed: out.snap.speed })}`);
    if (keep && out.gait) rows.push(out.gait);
  };
  await page.evaluate(() => { (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)!.begin(); });
  for (let k = 0; k < 14; k++) await grab(`ramp-${String(k).padStart(2, "0")}`, 3);
  await page.evaluate((i) => { (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)!.play(150, i); }, IDLE);
  for (let k = 0; k < 16; k++) await grab(`sprint-${String(k).padStart(2, "0")}`, 4, true);
  expect(errors).toEqual([]);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[rows.length - 1]!.phase).toBeGreaterThan(rows[0]!.phase + 1.5);
});
