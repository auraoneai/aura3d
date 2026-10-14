import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SIEGE_GOLF_HOLES } from "../../apps/showcase-siege-golf/src/course";
import { SIEGE_GOLF_CANONICAL_SOLUTIONS } from "../../apps/showcase-siege-golf/src/solutions";
import { startExampleDevServer } from "./example-dev-server";

interface CourseEvidence {
  readonly holeIndex?: number;
  readonly state?: string;
  readonly strokes?: number;
  readonly targetsSunk?: number;
  readonly totalTargets?: number;
  readonly completedHoles?: number;
  readonly courseComplete?: boolean;
  readonly courseStrokes?: number;
  readonly backend?: string;
  readonly lastShotHash?: string;
  readonly frameCount?: number;
}

async function evidence(page: Page): Promise<CourseEvidence> {
  return page.evaluate(() => (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: CourseEvidence }).__SIEGE_GOLF_EVIDENCE__ ?? {});
}

async function playCurrentHole(page: Page, holeIndex: number): Promise<void> {
  const hole = SIEGE_GOLF_HOLES[holeIndex]!;
  const solution = SIEGE_GOLF_CANONICAL_SOLUTIONS[holeIndex]!;
  const baseAngle = Math.atan2(hole.aim[0], -hole.aim[1]);

  for (let strokeIndex = 0; strokeIndex < solution.strokes.length; strokeIndex += 1) {
    const stroke = solution.strokes[strokeIndex]!;
    await page.locator("#sg-aim-dial").evaluate((node, value) => {
      const input = node as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, (stroke.angle - baseAngle).toFixed(6));
    await page.locator("#sg-power-dial").evaluate((node, value) => {
      const input = node as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, stroke.power.toFixed(6));
    await page.click("#sg-precision-strike-button");
    try {
      await page.waitForFunction(({ expectedStroke, finalStroke }) => {
        const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: CourseEvidence }).__SIEGE_GOLF_EVIDENCE__;
        if (Number(ev?.strokes ?? 0) !== expectedStroke || ev?.state === "simulating") return false;
        return finalStroke ? ev?.state === "hole-complete" : ev?.state === "aiming";
      }, { expectedStroke: strokeIndex + 1, finalStroke: strokeIndex === solution.strokes.length - 1 }, { timeout: 45_000 });
    } catch (error) {
      throw new Error(`${hole.name} stroke ${strokeIndex + 1} did not resolve: ${JSON.stringify(await evidence(page))}`, { cause: error });
    }
  }

  const done = await evidence(page);
  expect(done.state, `${hole.name} state`).toBe("hole-complete");
  expect(done.targetsSunk, `${hole.name} targets`).toBe(done.totalTargets);
  expect(done.strokes, `${hole.name} par`).toBeLessThanOrEqual(hole.par);
  expect(done.lastShotHash, `${hole.name} pre-shot hash`).toMatch(/^[0-9a-f]{8}$/);
}

test("real mounted controls complete all nine holes and capture direct, collapse, bank, final, and course evidence", async ({ page }) => {
  test.setTimeout(900_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const reportDir = join("tests", "reports", "siege-golf", "course-completion");
  mkdirSync(reportDir, { recursive: true });
  const server = await startExampleDevServer();

  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-siege-golf/", { waitUntil: "commit", timeout: 120_000 });
    await page.waitForFunction(() => Boolean((window as unknown as { __SIEGE_GOLF_EVIDENCE__?: unknown }).__SIEGE_GOLF_EVIDENCE__), undefined, { timeout: 180_000 });
    expect((await evidence(page)).backend).toBe("rapier");

    const captures = new Map<number, string>([
      [0, "direct-hole-complete"],
      [2, "collapse-hole-complete"],
      [3, "bank-hole-complete"],
      [8, "final-course-complete"]
    ]);

    for (let holeIndex = 0; holeIndex < SIEGE_GOLF_HOLES.length; holeIndex += 1) {
      expect((await evidence(page)).holeIndex).toBe(holeIndex);
      await playCurrentHole(page, holeIndex);
      await page.waitForSelector("#sg-result:not(.is-hidden)", { timeout: 30_000 });
      const captureName = captures.get(holeIndex);
      if (captureName) {
        const snapshot = await evidence(page);
        writeFileSync(join(reportDir, `${captureName}.json`), JSON.stringify(snapshot, null, 2));
        await page.screenshot({ path: join(reportDir, `${captureName}.png`), timeout: 120_000 });
      }
      if (holeIndex < SIEGE_GOLF_HOLES.length - 1) {
        await page.click("#sg-next-button");
        await page.waitForFunction((nextHole: number) => {
          const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: CourseEvidence }).__SIEGE_GOLF_EVIDENCE__;
          return ev?.holeIndex === nextHole && ev?.state === "aiming" && ev?.strokes === 0;
        }, holeIndex + 1, { timeout: 30_000 });
      }
    }

    const course = await evidence(page);
    expect(course.courseComplete).toBe(true);
    expect(course.completedHoles).toBe(9);
    expect(Number(course.courseStrokes ?? 0)).toBeGreaterThanOrEqual(9);
    expect(await page.textContent("#sg-result-title")).toContain("Course complete");
    expect(pageErrors, "mounted course emitted runtime errors").toEqual([]);
    writeFileSync(join(reportDir, "course-complete.json"), JSON.stringify(course, null, 2));
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});
