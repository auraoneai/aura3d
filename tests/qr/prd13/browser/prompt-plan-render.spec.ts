import { expect, test, type Page } from "@playwright/test";
import { startPrd13DevServer, type ExampleDevServer } from "../dev-server";

// PRD-13 §17.2 / S3 — prompt-plan render grid, 4 recipes × 3 plans (13-SPECS).
//
// Automated half of S3 (a merge gate): each plan compiles through the v2
// pipeline, mounts, settles, renders a non-empty frame, and every
// `report.visualSystems` entry is backed by the compiled snapshot — checked
// against an independent node census taken in-page, not the compiler's own
// census code (`visualSystems ⊆ census`). Rejected plan values must not appear
// in either the census or `visualSystems`.
//
// The judged half of S3 ("does the frame show every listed system and none of
// the rejected ones?") is a vision + named-human judgement, not an assertion:
// each cell attaches its frame PNG and report JSON to the Playwright report
// for that panel (row 13-S3/S4/S5).

const RECIPES = ["product-viewer", "cinematic-scene", "mini-game", "material-studio"] as const;
const PLAN_COUNT = 3;

interface CensusNode { kind: string; detail?: string; shadow: boolean }
interface Report {
  schema: string;
  look: { id: string; from: string; expansion?: string };
  camera: { preset: string; rig: string };
  rejected: { field: string; value: string; code: string }[];
  visualSystems: string[];
}
interface Payload {
  report: Report;
  census: CensusNode[];
  groupNames: string[];
  hdriStatus: string;
  frame: { brightFraction: number; uniqueBuckets: number; dataUrl: string };
  diagnostics: { errors: string[]; drawCalls: number | null; look: { id: string | null } | null };
}

async function loadPlan(page: Page, origin: string, recipe: string, plan: number): Promise<Payload> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/tests/qr/prd13/harness/prompt-plan-render.html?recipe=${recipe}&plan=${plan}&a3d-qr=looks`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForFunction(
    () => {
      const w = window as { __PRD13_READY__?: unknown; __PRD13_ERROR__?: unknown };
      return w.__PRD13_READY__ !== undefined || w.__PRD13_ERROR__ !== undefined;
    },
    undefined,
    { timeout: 150_000 }
  );
  const error = await page.evaluate(() => (window as { __PRD13_ERROR__?: string }).__PRD13_ERROR__ ?? null);
  expect(error, `compile/mount failed for ${recipe} plan ${plan}`).toBeNull();
  expect(pageErrors, "page errors").toEqual([]);
  return (await page.evaluate(() => (window as { __PRD13_READY__?: unknown }).__PRD13_READY__)) as Payload;
}

/** Why a visualSystems entry is (not) backed by the census; null = backed. */
function unbacked(entry: string, recipe: string, payload: Payload): string | null {
  const { census, report, groupNames } = payload;
  const effects = census.filter((node) => node.kind === "effect").map((node) => node.detail);
  let match: RegExpExecArray | null;
  if (entry === `${recipe} recipe`) return null;
  if ((match = /^look:(.+)$/.exec(entry))) {
    return groupNames.includes(`aura-look:${match[1]}`) && report.look.id === match[1] ? null : "no aura-look group for it";
  }
  if ((match = /^(.+) camera$/.exec(entry))) return report.camera.preset === match[1] ? null : "camera preset differs";
  if ((match = /^(.+) rig$/.exec(entry))) return report.camera.rig === match[1] ? null : "camera rig differs";
  if ((match = /^environment:(.+)$/.exec(entry))) {
    return census.some((node) => node.kind === "environment" && node.detail === match![1]) ? null : "no environment node";
  }
  if ((match = /^shadows:(\d+) casters?$/.exec(entry))) {
    const casters = census.filter((node) => node.kind === "light" && node.shadow).length;
    return casters === Number(match[1]) ? null : `census has ${casters} casters`;
  }
  if ((match = /^(?:post|effect):(.+)$/.exec(entry))) return effects.includes(match[1]) ? null : "no effect node";
  if (entry === "atmosphere:fog") return effects.includes("fog") ? null : "no fog node";
  return "unknown census entry";
}

test.describe("§17.2 prompt-plan render — S3 automated half", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startPrd13DevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  for (const recipe of RECIPES) {
    for (let plan = 0; plan < PLAN_COUNT; plan += 1) {
      test(`${recipe} plan ${plan}: compiles, mounts, renders, visualSystems ⊆ census`, async ({ page }) => {
        const payload = await loadPlan(page, server.origin, recipe, plan);
        const { report } = payload;
        await test.info().attach(`${recipe}-${plan}.png`, {
          body: Buffer.from(payload.frame.dataUrl.split(",")[1] ?? "", "base64"),
          contentType: "image/png"
        });
        await test.info().attach(`${recipe}-${plan}.report.json`, { body: JSON.stringify(report, null, 2), contentType: "application/json" });

        expect(report.schema).toBe("aura3d-prompt-plan-report/2.0");
        expect(report.look.id, "v2 report records the resolved look id").toBeTruthy();
        expect(report.visualSystems).toContain(`${recipe} recipe`);
        expect(report.visualSystems).toContain(`look:${report.look.id}`);

        const unbackedEntries = report.visualSystems
          .map((entry) => ({ entry, why: unbacked(entry, recipe, payload) }))
          .filter((row) => row.why !== null);
        expect(unbackedEntries, "every visualSystems entry is backed by the compiled snapshot").toEqual([]);

        for (const rejection of report.rejected) {
          expect(rejection.field, "rejections carry a field").toBeTruthy();
          expect(rejection.code, "rejections carry a code").toBeTruthy();
          if (rejection.field === "effects") {
            const censusEffects = payload.census.filter((node) => node.kind === "effect").map((node) => node.detail);
            expect(censusEffects, `rejected effect "${rejection.value}" is not in the snapshot`).not.toContain(rejection.value);
            expect(report.visualSystems, `rejected effect "${rejection.value}" is not claimed`).not.toContain(`effect:${rejection.value}`);
            expect(report.visualSystems).not.toContain(`post:${rejection.value}`);
          }
        }

        expect(payload.diagnostics.errors).toEqual([]);
        expect(payload.diagnostics.drawCalls ?? 0, "mounted frame drew").toBeGreaterThan(0);
        expect(payload.diagnostics.look?.id, "diagnostics().look agrees with the report").toBe(report.look.id);
        expect(payload.frame.brightFraction, "frame is not blank (> 2 % lit samples)").toBeGreaterThan(0.02);
        expect(payload.frame.uniqueBuckets, "frame has colour variety (> 8 buckets)").toBeGreaterThan(8);
      });
    }
  }
});
