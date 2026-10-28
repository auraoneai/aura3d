import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const SCENES = ["daylight", "dusk-arena", "pastel"] as const;
const EFFECTS = ["none", "bloom", "vignette", "both"] as const;
// "-post" turns the post lane off: the frame then takes the plain OutputPass route, the reference for "post on vs off".
const FLAG_SETS = (process.env.POST_LUMA_FLAGS ?? ",-post,linearvig").split(",");
const reportDir = "tests/reports/post-luma";

test.describe("post chain luma (tone map and encode once)", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("mean luma with effects on stays within a few percent of effects off", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/post-luma-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as { __POST_LUMA__?: unknown }).__POST_LUMA__), undefined, { timeout: 60_000 });
    const rows: unknown[] = [];
    for (const sceneId of SCENES) {
      for (const flags of FLAG_SETS) {
        for (const fx of EFFECTS) {
          const capture = await page.evaluate(([s, f, fl]) => (window as unknown as { __POST_LUMA__: { render(a: string, b: string, c: string): Promise<unknown> } }).__POST_LUMA__.render(s!, f!, fl!), [sceneId, fx, flags]);
          rows.push(capture);
          console.log(`POSTLUMA_JSON ${JSON.stringify(capture)}`);
        }
      }
    }
    mkdirSync(resolve(reportDir), { recursive: true });
    writeFileSync(resolve(reportDir, "post-luma.json"), JSON.stringify({ rows, errors }, null, 2));
    console.log(`POSTLUMA_ERRORS ${JSON.stringify(errors)}`);

    interface Row { scene: string; effects: string; flags: string; meanLuma: number; warnings: string[]; postSkipped: unknown }
    const table = rows as Row[];
    const at = (scene: string, fx: string): Row => table.find((r) => r.scene === scene && r.effects === fx && r.flags === "")!;
    for (const sceneId of SCENES) {
      const none = at(sceneId, "none").meanLuma;
      // Bloom is a small additive glow: the frame stays within 3% of tone-map-only.
      expect(Math.abs(at(sceneId, "bloom").meanLuma - none) / none, `${sceneId} bloom`).toBeLessThanOrEqual(0.03);
      expect(Math.abs(at(sceneId, "both").meanLuma - at(sceneId, "vignette").meanLuma) / at(sceneId, "vignette").meanLuma, `${sceneId} both vs vignette`).toBeLessThanOrEqual(0.03);
      // Default route: the vignette is the 4.2.0 display-space falloff in the LDR tail (the linear-light one became opt-in in
      // 3405d2082 because it moved Aura Slam's frame and was proven on software GL only). It darkens 26 to 28% here; a floor
      // of 0.70 pins that known behaviour so a further regression still fails. Measured on the 4.3.7 sources: 0.722, 0.737, 0.721.
      expect(at(sceneId, "vignette").meanLuma / none, `${sceneId} vignette (default display-space route)`).toBeGreaterThanOrEqual(0.7);
      // Opt-in route (`__A3D_LINEAR_VIGNETTE__`): the vignette composes in linear light before the single tone map. Measured on the
      // 4.5 sources with quality "production": daylight 0.845, pastel 0.870, dusk-arena 0.730 (a dark frame sits in the tone curve's toe,
      // so the same falloff costs more), against 0.78 recorded for the 4.3.0 exposure.
      const linear = (fx: string): Row => table.find((r) => r.scene === sceneId && r.effects === fx && r.flags === "linearvig")!;
      if (FLAG_SETS.includes("linearvig")) {
        expect(linear("vignette").meanLuma / linear("none").meanLuma, `${sceneId} vignette (opt-in linear-light route)`).toBeGreaterThanOrEqual(0.72);
      }
    }
    for (const row of table.filter((r) => r.flags === "")) {
      expect(row.warnings.filter((w) => w.includes("POSTPROCESS_V2_UNMIGRATED")), `${row.scene}/${row.effects} console`).toEqual([]);
      expect(row.postSkipped, `${row.scene}/${row.effects} postSkipped`).toBeNull();
    }
  });
});
