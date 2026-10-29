import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { CREDIT_NOTE, CREDIT_STYLE } from "../../tools/showcase-port-pages/lib.mjs";

/**
 * "Built with Aura3D" credit over game controls (audit 2026-10-29: Chroma Roll C3 mute button, The Bellkeeper's Walk WW-2
 * joystick, Duneglide C13 flight HUD). Remote only (tools/remote-acr/run.sh). The app pages are owned by the game lanes, so the spec swaps the page's
 * current credit for the canonical one from tools/showcase-port-pages/lib.mjs in the live DOM, then hit-tests the control:
 * BEFORE is the shipped credit, AFTER the canonical one. Output: CREDIT_META <json> lines.
 */
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

interface Case { readonly name: string; readonly url: string; readonly control: string; readonly viewport: { width: number; height: number }; readonly touch: boolean }
const CASES: readonly Case[] = [
  { name: "splat-rush-port-1440", url: "/apps/showcase-splat-rush-port/", control: "#btn-mute", viewport: { width: 1440, height: 900 }, touch: false },
  { name: "splat-rush-port-390", url: "/apps/showcase-splat-rush-port/", control: "#btn-mute", viewport: { width: 390, height: 844 }, touch: true },
  { name: "where-the-wind-wanders-port-390", url: "/apps/showcase-where-the-wind-wanders-port/", control: "#wwui-pad", viewport: { width: 390, height: 844 }, touch: true },
  { name: "where-the-wind-wanders-port-1440", url: "/apps/showcase-where-the-wind-wanders-port/", control: "#wwui-pad", viewport: { width: 1440, height: 900 }, touch: false },
  { name: "silt-and-signal-port-1280", url: "/apps/showcase-silt-and-signal-port/", control: "#flight", viewport: { width: 1280, height: 720 }, touch: false }
];

/** Points on the control (centre and four corners inset 3 px) whose topmost element is inside the credit. */
async function creditHits(page: Page, control: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    const credit = document.querySelector(".aura-credit") as HTMLElement | null;
    if (!el) return { control: null, credit: credit ? credit.getBoundingClientRect().toJSON() : null, hits: -1, points: 0 };
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return { control: r.toJSON(), credit: credit?.getBoundingClientRect().toJSON() ?? null, hits: -1, points: 0 };
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
    let hits = 0;
    for (const [x, y] of pts) { const top = document.elementFromPoint(x!, y!); if (credit && top && credit.contains(top)) hits++; }
    return { control: r.toJSON(), credit: credit?.getBoundingClientRect().toJSON() ?? null, spot: credit?.dataset.spot ?? null, hits, points: pts.length };
  }, control);
}

async function installCanonicalCredit(page: Page): Promise<void> {
  const noteHtml = (CREDIT_NOTE as string).replace(/<script>[\s\S]*<\/script>/, "");
  const script = /<script>([\s\S]*)<\/script>/.exec(CREDIT_NOTE as string)![1]!;
  const css = /<style>([\s\S]*)<\/style>/.exec(CREDIT_STYLE as string)![1]!;
  await page.evaluate(({ noteHtml, script, css }) => {
    document.querySelectorAll(".aura-credit").forEach((n) => n.remove());
    for (const s of Array.from(document.querySelectorAll("style"))) if (/^\.aura-credit\{/.test(s.textContent ?? "")) s.remove();
    const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
    const holder = document.createElement("div"); holder.innerHTML = noteHtml;
    const aside = holder.firstElementChild as HTMLElement; document.body.appendChild(aside);
    const s = document.createElement("script"); s.textContent = script; aside.appendChild(s);
  }, { noteHtml, script, css });
}

test.describe("credit placement", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const c of CASES) {
    test(c.name, async ({ browser }) => {
      const context = await browser.newContext({ viewport: c.viewport, hasTouch: c.touch, isMobile: c.touch });
      const page = await context.newPage();
      try {
        await page.goto(`${server.origin}${c.url}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
        await page.waitForTimeout(1500);
        const before = await creditHits(page, c.control);
        await installCanonicalCredit(page);
        await page.waitForTimeout(5600); // placement re-runs at 0, 0.6, 2 and 5 s
        const after = await creditHits(page, c.control);
        const nav: string[] = [];
        page.on("framenavigated", (f) => { if (f === page.mainFrame()) nav.push(f.url()); });
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(600);
        const hidden = await page.evaluate(() => { const el = document.querySelector(".aura-credit") as HTMLElement | null; return el ? getComputedStyle(el).visibility === "hidden" && el.classList.contains("is-hidden") : null; });
        const afterHide = await creditHits(page, c.control);
        log(`CREDIT_META ${JSON.stringify({ case: c.name, before, after, hiddenAfterKey: hidden, afterHide, navigations: nav })}`);
        expect(after.hits, "canonical credit must not cover the control").toBeLessThanOrEqual(0);
        expect(hidden).toBe(true);
        expect(afterHide.hits).toBeLessThanOrEqual(0);
        expect(nav).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
