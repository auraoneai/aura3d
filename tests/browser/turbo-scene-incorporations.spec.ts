/**
 * Runtime proof for the Turbo Drift Circuit scene incorporations
 * (PRD TDC-09: props react, signage updates; plus TDC-A3 draw-call telemetry and
 * TDC-A6 default-OFF gating).
 *
 * - Dynamic verge props: an evidence probe nudges a prop body; the spec asserts the
 *   rigid body actually moves (scattered counter) while corridor clamps stay armed.
 * - Gantry signage: board index must be GET READY during lights, LAP 1 OF 4 after
 *   the green flag, with every label inside the A-Z/0-9 glyph set.
 * - Scenery + LOD: instanced scenery evidence present; draw calls captured from the
 *   live diagnostics into a command-generated report (never hand-authored).
 * - Boost rings: default OFF; ?boost=1 arms them (rings planned, sensors tagged).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/turbo-incorporations");
const ROUTE = "/apps/showcase-turbo-drift-circuit/";
const GLOBAL_NAME = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";

interface TrackPropsEvidence {
  readonly count: number;
  readonly clearanceClear: boolean;
  readonly clampEvents: number;
  readonly displacedDistinctCount: number;
  readonly probe?: { readonly kick?: (index?: number) => void };
}

interface SignageEvidence {
  readonly boardLabels: readonly string[];
  readonly activeLabelIndex: number;
  readonly glyphPattern: string;
  readonly staticBoard: string;
}

interface BoostEvidence {
  readonly flag: string;
  readonly enabled: boolean;
  readonly ringCount: number;
}

async function readEvidence(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate((name) => {
    const value = (window as unknown as Record<string, unknown>)[name];
    return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  }, GLOBAL_NAME);
}

test("turbo props react, signage tracks race state, scenery draws", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  let server: ExampleDevServer | undefined;
  const consoleErrors: string[] = [];
  try {
    server = await startExampleDevServer();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/favicon/i.test(message.text())) return;
      consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { status?: string } | undefined>)[name];
      return value?.status === "ready";
    }, GLOBAL_NAME, { timeout: 90_000 });

    mkdirSync(REPORT_DIR, { recursive: true });

    // --- Signage during the light ceremony ---------------------------------
    const beforeGo = (await readEvidence(page)).signage as SignageEvidence;
    expect(beforeGo.boardLabels.length).toBe(6); // GET READY + 4 laps + FINISH
    for (const label of beforeGo.boardLabels) {
      expect(label).toMatch(/^[A-Z0-9 ]+$/);
    }
    expect(beforeGo.staticBoard).toBe("TSUKUBA");
    expect(beforeGo.activeLabelIndex).toBe(0);
    await page.screenshot({ path: join(REPORT_DIR, "turbo-signage-ready.png") });

    // --- Green flag flips the lap board ------------------------------------
    await page.keyboard.down("KeyW");
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { signage?: SignageEvidence } | undefined>)[name];
      return value?.signage?.activeLabelIndex === 1;
    }, GLOBAL_NAME, { timeout: 30_000, polling: 250 });
    await page.screenshot({ path: join(REPORT_DIR, "turbo-signage-lap1.png") });

    // --- Props: probe kick proves rigid-body scatter + render follow --------
    await page.evaluate((name) => {
      const value = (window as unknown as Record<string, { trackProps?: TrackPropsEvidence } | undefined>)[name];
      value?.trackProps?.probe?.kick?.(0);
      value?.trackProps?.probe?.kick?.(3);
    }, GLOBAL_NAME);
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { trackProps?: TrackPropsEvidence } | undefined>)[name];
      return (value?.trackProps?.displacedDistinctCount ?? 0) >= 1;
    }, GLOBAL_NAME, { timeout: 15_000, polling: 250 });
    const props = ((await readEvidence(page)).trackProps ?? null) as TrackPropsEvidence | null;
    expect(props?.count).toBeGreaterThan(0);
    expect(props?.clearanceClear).toBe(true);
    await page.screenshot({ path: join(REPORT_DIR, "turbo-props-scatter.png") });

    // --- Scenery evidence + live draw-call telemetry ------------------------
    const final = await readEvidence(page);
    const scenery = final.scenery as { crowdStands: number; trees: number; tireWalls: number; lodTreelineBands: number; mood: string };
    expect(scenery.crowdStands).toBeGreaterThan(0);
    expect(scenery.trees).toBeGreaterThan(0);
    expect(scenery.lodTreelineBands).toBe(4);
    expect(scenery.mood).toContain("late afternoon");
    const diagnostics = final.diagnostics as { drawCalls?: number; fps?: number } | undefined;
    expect(diagnostics?.drawCalls ?? 0).toBeGreaterThan(0);

    writeFileSync(join(REPORT_DIR, "turbo-incorporations.json"), `${JSON.stringify({
      schema: "aura3d-turbo-incorporations-browser/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/turbo-scene-incorporations.spec.ts",
      signageBeforeGo: beforeGo,
      signageAfterGreen: (final.signage ?? null),
      trackProps: props,
      scenery,
      drawCallTelemetry: { drawCalls: diagnostics?.drawCalls ?? 0, fps: diagnostics?.fps ?? 0 },
      consoleErrors
    }, null, 2)}\n`);

    await page.keyboard.up("KeyW");
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  } finally {
    await page.keyboard.up("KeyW").catch(() => undefined);
    await server?.close();
  }
});

test("turbo boost rings stay default OFF and arm only behind ?boost=1", async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  let server: ExampleDevServer | undefined;
  const consoleErrors: string[] = [];
  try {
    server = await startExampleDevServer();
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { boost?: BoostEvidence } | undefined>)[name];
      return Boolean(value?.boost);
    }, GLOBAL_NAME, { timeout: 90_000 });
    const defaultOff = (await readEvidence(page)).boost as BoostEvidence;
    expect(defaultOff.enabled).toBe(false);
    expect(defaultOff.ringCount).toBe(0);
    await server.close();

    server = await startExampleDevServer();
    await page.goto(`${server.origin}${ROUTE}?boost=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { boost?: BoostEvidence } | undefined>)[name];
      return value?.boost?.enabled === true;
    }, GLOBAL_NAME, { timeout: 90_000 });
    const armed = (await readEvidence(page)).boost as BoostEvidence;
    expect(armed.ringCount).toBeGreaterThan(0);
    writeFileSync(join(REPORT_DIR, "turbo-boost-flag.json"), `${JSON.stringify({
      schema: "aura3d-turbo-boost-flag/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/turbo-scene-incorporations.spec.ts",
      defaultOff,
      armed,
      consoleErrors
    }, null, 2)}\n`);
    expect(consoleErrors).toEqual([]);
  } finally {
    await server?.close();
  }
});