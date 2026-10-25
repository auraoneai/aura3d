import { test } from "@playwright/test";
import { startDistServer } from "./shotsa-lib";

test.setTimeout(900_000);
test("probe links black canvas", async ({ page }) => {
  const server = await startDistServer("tests/browser/shotsa-dist-links");
  const msgs: string[] = [];
  page.on("console", (m) => msgs.push(`${m.type()} ${m.text()}`.slice(0, 260)));
  page.on("pageerror", (e) => msgs.push(`pageerror ${e.message}`.slice(0, 260)));
  page.on("requestfailed", (r) => msgs.push(`requestfailed ${r.url().replace(server.origin, "")}`));
  page.on("response", (r) => { if (r.status() >= 400) msgs.push(`http${r.status()} ${r.url().replace(server.origin, "")}`); });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto(`${server.origin}/?course=links&diag=1`, { waitUntil: "load", timeout: 240_000 });
  await page.waitForTimeout(25_000);
  const info = await page.evaluate(() => {
    const c = document.querySelector("#app canvas") as HTMLCanvasElement | null;
    const r = c?.getBoundingClientRect();
    const app = document.querySelector("#app")?.getBoundingClientRect();
    const b = (window as unknown as Record<string, any>).__AURA3D_GAME__ ?? {};
    return { canvas: c ? { w: c.width, h: c.height, cssW: r?.width, cssH: r?.height } : null, app: app ? { w: app.width, h: app.height } : null, canvases: document.querySelectorAll("canvas").length, beacon: JSON.stringify(b).slice(0, 500), body: { w: document.body.clientWidth, h: document.body.clientHeight } };
  });
  process.stdout.write(`@@PROBE ${JSON.stringify(info)}\n`);
  for (const m of msgs.slice(0, 40)) process.stdout.write(`@@PROBE_MSG ${m}\n`);
  await server.close();
});
