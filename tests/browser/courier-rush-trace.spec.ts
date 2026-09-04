import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/showcase-courier-rush");

test("trace autopilot", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(server.origin + "/apps/showcase-courier-rush/?autopilot=1", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 120_000 }).toBe("true");
  for (let i = 0; i < 150; i += 1) {
    await page.waitForTimeout(1000);
    const ev: any = await page.evaluate(() => {
      const e: any = (window as any).__COURIER_RUSH_EVIDENCE__;
      return e ? { st: e.state, s: e.strikes, fc: e.frameCount, ap: e.autopilot, paused: e.paused,
        van: e.van, aim: e.autopilotAim, api: e.apInput, tg: e.activeTargetId,
        evs: e.zoneEvents.map((z: any) => z.type[0]), sl: e.strikeLog } : null;
    });
    if (!ev) continue;
    appendFileSync(resolve(REPORT_DIR, "trace.jsonl"), JSON.stringify(ev) + "\n");
    if (ev.st === "shiftOver" || ev.st === "shiftClear") break;
  }
  writeFileSync(resolve(REPORT_DIR, "trace-final.png"), await page.screenshot());
  await server.close();
});
