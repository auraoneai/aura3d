import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

// PRD-13 T3.8: the v2 census vocabulary — every visualSystems entry must be
// one of these emitted system shapes (recipe, look, camera, rig, environment,
// shadows, post, effect, atmosphere), never an echo of plan text.
const CENSUS = /^(cinematic-scene recipe|look:.+|.+ camera|.+ rig|environment:.+|shadows:\d+ casters?|post:.+|effect:.+|atmosphere:.+)$/;

test("Aura3D cinematic scene reaches ready state", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");
  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const diagnostics = await page.evaluate(() => (window as unknown as { __AURA3D_ROUTE_READY__?: { diagnostics?: { backend?: string } } }).__AURA3D_ROUTE_READY__?.diagnostics);
  expect(diagnostics?.backend).toBe("webgl2");
  expect(drawCalls).toBeGreaterThan(0);

  const proof = await page.evaluate(() => (window as unknown as {
    __AURA3D_CINEMATIC_SCENE__?: {
      schema: string;
      look: { id: string; from: string };
      camera: { preset: string; rig: string };
      appliedEffects: string[];
      rejected: { field: string; value: string; code: string }[];
      visualSystems: string[];
    };
  }).__AURA3D_CINEMATIC_SCENE__);
  expect(proof).toBeTruthy();
  expect(proof!.schema).toBe("aura3d-prompt-plan-report/2.0");
  expect(proof!.look.id).toBe("night-city");
  expect(proof!.look.from).toBe("plan.environment");
  expect(proof!.camera.preset).toBe("cinematic-dolly");
  expect(proof!.rejected).toEqual([]);
  expect(proof!.appliedEffects.sort()).toEqual(["bloom", "fog"]);
  expect(proof!.visualSystems.length).toBeGreaterThanOrEqual(4);
  for (const system of proof!.visualSystems) {
    expect(system, `visualSystems entry "${system}" is outside the v2 census`).toMatch(CENSUS);
  }

  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, backend: diagnostics?.backend, drawCalls, proof }, null, 2)}\n`);
});
