import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** Apex Overdrive layout geometry (canvas size, quick-switcher placement) at several viewports, plus load errors. Remote only. */
const emit = (name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SC apex-geom ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};

test.describe("fixc apex geometry", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [w, h] of [[390, 844], [720, 450], [1280, 720]] as const) {
    test(`apex geometry ${w}x${h}`, async ({ browser }) => {
      const errors: string[] = [];
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 160)}`));
      page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
      await page.goto(`${server.origin}/apps/showcase-roadster-rush/?seed=42`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(45_000);
      const geom = await page.evaluate(() => {
        const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
        return { canvas: r(document.getElementById("game")), bar: r(document.querySelector(".aura3d-top-bar")), ready: document.body.dataset.aura3dReady ?? null, scrollW: document.documentElement.scrollWidth };
      });
      process.stdout.write(`@@SCSTATE apex-geom ${w}x${h} ${JSON.stringify(geom)}\n`);
      process.stdout.write(`@@SCERRORS apex-geom ${w}x${h} ${JSON.stringify(errors.slice(0, 10))}\n`);
      emit(`geom.${w}x${h}`, await page.screenshot({ type: "jpeg", quality: 85 }));
      await page.close();
    });
  }
});
