import { test, type Page } from "@playwright/test";

/**
 * rwaud: motion-audit frame strips of the LIVE index games (software WebGL2, remote only, RUN_ID prefix rwaud).
 * Six frames 500 ms apart per game in autoplay mode, printed as chunked console lines (`RWAUD <slug> <i>/<n> ...`).
 */
const BASE = "https://aura3d.auraone.ai/apps";
const GAMES = [
  { slug: "iron-crown", q: "?autoplay=1" },
  { slug: "pips-big-leap", q: "?autoplay=1" },
  { slug: "cross-hop", q: "?autoplay=1&autostart=1" },
  { slug: "teleoperator", q: "" },
  { slug: "roadster-rush", q: "?autostart=1" },
  { slug: "slingshot-siege", q: "" },
  { slug: "bunker-zero", q: "" },
  { slug: "dot-dash-3d", q: "?autostart=1" }
];

function emit(name: string, payload: unknown, chunk = 60000): void {
  const s = typeof payload === "string" ? payload : JSON.stringify(payload);
  const n = Math.max(1, Math.ceil(s.length / chunk));
  for (let i = 0; i < n; i++) console.log(`RWAUD ${name} ${i + 1}/${n} ${s.slice(i * chunk, (i + 1) * chunk)}`);
}
const shot = async (page: Page) => (await page.screenshot({ type: "jpeg", quality: 60 })).toString("base64");

test.setTimeout(1_500_000);

for (const g of GAMES) {
  test(`${g.slug}: motion strip`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|fonts\//.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await page.setViewportSize({ width: 640, height: 360 });
    try {
      await page.goto(`${BASE}/showcase-${g.slug}/${g.q}`, { waitUntil: "load", timeout: 120_000 });
      await page.waitForTimeout(25_000);
      await page.keyboard.press("Enter").catch(() => undefined);
      await page.keyboard.down("KeyW").catch(() => undefined);
      await page.waitForTimeout(3_000);
      const frames: string[] = [];
      for (let i = 0; i < 6; i++) { frames.push(await shot(page)); await page.waitForTimeout(500); }
      await page.keyboard.up("KeyW").catch(() => undefined);
      frames.forEach((f, i) => emit(`${g.slug}_F${i + 1}`, f));
      const beacon = await page.evaluate(() => {
        const b = (window as unknown as { __AURA3D_GAME__?: Record<string, unknown> }).__AURA3D_GAME__;
        return b ? { route: b.route, state: b.state, keys: Object.keys(b).slice(0, 24) } : null;
      }).catch(() => null);
      emit(`${g.slug}_META`, { errors: errors.slice(0, 5), beacon });
    } catch (e) {
      emit(`${g.slug}_META`, { failed: String(e).slice(0, 200), errors: errors.slice(0, 5) });
    }
  });
}
