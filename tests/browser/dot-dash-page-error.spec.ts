import { expect, test, type Browser } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Regression for the `Unexpected reserved word` page error on dot-dash-3d: the example dev server bundled the game with
 * esbuild, which emitted `await` inside a non-async wrapper (physics-rapier has top-level await in an import cycle), so
 * the route never mounted. The game must boot without page errors both on the deployed site and on the dev server.
 */
const PROD = "https://aura3d.auraone.ai";
const APP = "showcase-dot-dash-3d";
test.setTimeout(600_000);

async function probe(origin: string, label: string, browser: Browser): Promise<{ errors: string[]; ready: boolean }> {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${e.message}\n${(e.stack ?? "").split("\n").slice(0, 4).join("\n")}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
  await page.goto(`${origin}/apps/${APP}/?heal=0`, { waitUntil: "load", timeout: 120_000 });
  const ready = await page
    .waitForFunction(() => Boolean((window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__), undefined, { timeout: 90_000 })
    .then(() => true, () => false);
  await page.waitForTimeout(8_000);
  const jpg = await page.screenshot({ type: "jpeg", quality: 55 });
  console.log(`DOTDASH_JPG ${label} ${jpg.toString("base64")}`);
  console.log(`DOTDASH_RESULT ${label} ready=${ready} errors=${JSON.stringify(errors)}`);
  await ctx.close();
  return { errors, ready };
}

test("dot-dash boots without page errors on the deployed site", async ({ browser }) => {
  const r = await probe(PROD, "prod", browser);
  expect(r.errors.filter((e) => !e.startsWith("console:"))).toEqual([]);
});

test("dot-dash boots without page errors on the example dev server", async ({ browser }) => {
  const server = await startExampleDevServer();
  try {
    const r = await probe(server.origin, "dev", browser);
    expect(r.errors.filter((e) => !e.startsWith("console:"))).toEqual([]);
    expect(r.ready).toBe(true);
  } finally { await server.close(); }
});
