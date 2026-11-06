import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
const CHUNK = 30_000;
const out = (s: string) => process.stdout.write(s + "\n");
const CASES: Array<[string, string]> = [["pips", "/apps/showcase-pips-big-leap/"], ["tennis-wt", "/apps/showcase-top-tennis/?look=world-tour"], ["tennis", "/apps/showcase-top-tennis/"], ["duneglide", "/apps/duneglide/"]];
test.describe("w10 verify", () => {
  test.setTimeout(1_500_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });
  for (const [name, path] of CASES) {
    test(name, async ({ page }) => {
      const errs: string[] = [];
      page.on("pageerror", (e) => errs.push("PAGEERR " + e.message.slice(0, 160)));
      page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errs.push(m.text().slice(0, 200)); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${path}`, { waitUntil: "domcontentloaded" });
      const ready = await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 420_000, polling: 500 }).then(() => true).catch(() => false);
      await page.waitForTimeout(10000);
      out(`@@CASE ${name} ready=${ready} errors=${errs.length} first=${errs[0] ?? ""}`);
      const buf = await page.screenshot({ type: "jpeg", quality: 75 }); const b64 = buf.toString("base64"); const total = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < total; i += 1) out(`@@PFRAME ${name} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    });
  }
});
