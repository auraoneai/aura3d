/**
 * Shared Playwright helpers for the PRD-08 harness page
 * (`tests/qr/prd08/harness/camera-feel-harness.html`), served by the lane
 * dev-server wrapper (`../dev-server.ts`). Remote-only (qr-prd08-camera.yml).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import type { FrameRecord } from "../harness/pipeline";
import type { Expect } from "../checks";

export type { FrameRecord };

export const HARNESS = "/tests/qr/prd08/harness/camera-feel-harness.html";
export const REPORT_DIR = resolve("tests/reports/prd08");

/** Playwright's `expect` through the runner-neutral checks.ts signature. */
export const pwExpect = ((actual: unknown, message?: string) => expect(actual, message)) as unknown as Expect;

export async function openHarness(page: Page, origin: string, query = "?scripted=1"): Promise<void> {
  // Relay page errors so a module-load failure is diagnosable from the CI log.
  page.on("pageerror", (error) => console.log(`[prd08 harness pageerror] ${error.stack ?? error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[prd08 harness console.error] ${msg.text()}`);
  });
  await page.goto(`${origin}${HARNESS}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: { status: string } }).__AURA3D_PRD08_HARNESS__;
      return h?.status === "ready" || h?.status === "error";
    },
    undefined,
    { timeout: 60_000 }
  );
  const probe = await page.evaluate(() => {
    const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: { status: string; error?: string } }).__AURA3D_PRD08_HARNESS__;
    return { status: h?.status, error: h?.error };
  });
  if (probe.status !== "ready") throw new Error(`harness not ready: ${probe.error}`);
}

/** Pump `count` scripted frames at `dtMs`. */
export async function pump(page: Page, dtMs: number, count: number): Promise<void> {
  await page.evaluate(
    ([dt, n]) => {
      const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: { tick?: (d: number) => void } }).__AURA3D_PRD08_HARNESS__;
      if (!h?.tick) throw new Error("harness has no scripted tick (?scripted=1)");
      for (let i = 0; i < n!; i += 1) h.tick(dt!);
    },
    [dtMs, count]
  );
}

/** Take (and clear) the records presented so far. */
export async function drain(page: Page): Promise<FrameRecord[]> {
  return page.evaluate(() => {
    const h = (window as unknown as { __AURA3D_PRD08_HARNESS__: { records: FrameRecord[] } }).__AURA3D_PRD08_HARNESS__;
    return h.records.splice(0, h.records.length);
  });
}

/** Run a named harness scenario (harness/scenarios.ts) in the page. */
export async function scenario<T>(page: Page, name: string, opts?: unknown): Promise<T> {
  return (await page.evaluate(
    ([n, o]) => {
      const h = (window as unknown as { __AURA3D_PRD08_HARNESS__: { run?: (n: string, o?: unknown) => unknown } }).__AURA3D_PRD08_HARNESS__;
      if (!h.run) throw new Error("harness has no scenario runner");
      return h.run(n as string, o);
    },
    [name, opts] as const
  )) as T;
}

/** §20 frame-pacing CSV for a set of drained records. */
export function writeFrameCsv(name: string, records: readonly FrameRecord[]): void {
  const lines = ["t,simTime,alpha,realDt,renderSubmissionsLastTick,positions"];
  for (const r of records) {
    lines.push(
      `${r.t.toFixed(3)},${r.simTime.toFixed(4)},${r.alpha.toFixed(4)},${r.realDt.toFixed(4)},${r.renderSubmissionsLastTick},"${r.positions
        .map((p) => `${p[0].toFixed(3)} ${p[1].toFixed(3)} ${p[2].toFixed(3)}`)
        .join("|")}"`
    );
  }
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(resolve(REPORT_DIR, `frame-pacing-${name}.csv`), `${lines.join("\n")}\n`);
}

/** Write a JSON evidence file under tests/reports/prd08/<sub>/. */
export function writeEvidence(sub: string, name: string, data: unknown): void {
  const dir = resolve(REPORT_DIR, sub);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, name), `${JSON.stringify(data, null, 2)}\n`);
}

/** Screenshot the harness canvas into tests/reports/prd08/<sub>/<name>.png. */
export async function captureCanvas(page: Page, sub: string, name: string): Promise<void> {
  const dir = resolve(REPORT_DIR, sub);
  mkdirSync(dir, { recursive: true });
  await page.locator("#mount canvas").screenshot({ path: resolve(dir, `${name}.png`) });
}
