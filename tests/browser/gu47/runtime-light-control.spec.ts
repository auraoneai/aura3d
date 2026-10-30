import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 E-B (WP-2) phase-2 receipt: runtime light, environment and shadow control (software WebGL2, remote only via
 * tools/remote-acr/run.sh; never run locally). Prints `GU47_EB_RECEIPT <json>` and writes the receipt JSON and frames to
 * `artifacts/gu47-eb/` for `evidence/receipts/runtime-light-control/`.
 *
 * Engine-guaranteed checks are hard expects. The checks that also need renderer work outside lane E-B (local shadow
 * tiles on the default forward path; `environmentProbeRotation` applied in renderer/Background.ts) are soft expects,
 * recorded in the receipt either way.
 */
type Stat = { r: number; g: number; b: number; luma: number };
type Lighting = { shadows?: { light: string; sampled: boolean }[] | null; punctualLights?: number | null; localShadowLights?: number | null };

test("GU47 E-B runtime light control receipt", async ({ page }) => {
  test.setTimeout(600_000);
  const server: ExampleDevServer = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/gu47/runtime-light-control.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as { __GU47_EB__?: unknown }).__GU47_EB__), undefined, { timeout: 60_000 });
    const run = (name: string) => page.evaluate((n) => (window as unknown as { __GU47_EB__: { run(n: string): Promise<Record<string, unknown>> } }).__GU47_EB__.run(n), name);
    const out = join(process.cwd(), "artifacts", "gu47-eb");
    mkdirSync(out, { recursive: true });
    const receipt: Record<string, unknown> = {};
    for (const name of ["colourRamp", "pointFollow", "spotVisibility", "stadium", "envRotation", "envCrossfade"]) {
      const result = await run(name);
      const frames = (result.frames ?? {}) as Record<string, string>;
      for (const [frame, data] of Object.entries(frames)) writeFileSync(join(out, `${frame}.jpg`), Buffer.from(data, "base64"));
      receipt[name] = { ...result, frames: Object.keys(frames) };
    }
    writeFileSync(join(out, "runtime-light-control.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`GU47_EB_RECEIPT ${JSON.stringify(receipt)}`);

    // 1. Directional colour ramp over 2 s: green/red falls monotonically from white to red, half-way near the middle.
    const ramp = (receipt.colourRamp as { samples: { t: number; stat: Stat }[] }).samples;
    const gr = ramp.map((sample) => sample.stat.g / Math.max(1, sample.stat.r));
    expect(gr[0]!).toBeGreaterThan(0.85);
    for (let i = 1; i < gr.length; i += 1) expect(gr[i]!).toBeLessThanOrEqual(gr[i - 1]! + 0.02);
    expect(gr[2]!).toBeGreaterThan(0.3);
    expect(gr[2]!).toBeLessThan(0.95);
    expect(gr[4]!).toBeLessThan(0.15);

    // 2. A point light follows setPosition every frame.
    const follow = (receipt.pointFollow as { samples: { x: number; centroid: number }[] }).samples;
    for (let i = 1; i < follow.length; i += 1) expect(follow[i]!.centroid).toBeGreaterThan(follow[i - 1]!.centroid);

    // 3. setVisible(false) on a shadowed spot: light and caster gone.
    const visibility = receipt.spotVisibility as { before: { lighting: Lighting; pool: Stat }; after: { lighting: Lighting; pool: Stat } };
    expect(visibility.before.lighting.localShadowLights).toBe(1);
    expect(visibility.after.lighting.localShadowLights).toBe(0);
    expect(visibility.after.lighting.punctualLights).toBe((visibility.before.lighting.punctualLights ?? 0) - 1);
    expect(visibility.after.pool.luma).toBeLessThan(visibility.before.pool.luma - 2);
    const rows = (lighting: Lighting) => (lighting.shadows ?? []).filter((row) => row.light.startsWith("local-")).length;
    expect.soft(rows(visibility.after.lighting)).toBe(rows(visibility.before.lighting) - 1);

    // 4. 4-spot stadium at High: 2 local casters; 2 sampled spot shadow rows (PRD WP-2 acceptance).
    const stadium = receipt.stadium as { lighting: Lighting; sampledLocalRows: number };
    expect(stadium.lighting.localShadowLights).toBe(2);
    expect.soft(stadium.sampledLocalRows).toBe(2);

    // 5. setEnvironmentRotation rotates the sky and the reflections.
    const rotation = receipt.envRotation as { skyDiff: number; sphereDiff: number };
    expect.soft(rotation.skyDiff).toBeGreaterThan(4);
    expect.soft(rotation.sphereDiff).toBeGreaterThan(2);

    // 6. setEnvironment crossfade: the environment term dips, then settles on the new sky.
    const series = (receipt.envCrossfade as { series: { t: number; sphere: Stat }[] }).series;
    const start = series[0]!.sphere.luma;
    expect(Math.min(...series.map((sample) => sample.sphere.luma))).toBeLessThan(start * 0.9);
    expect(series.at(-1)!.sphere.luma).toBeGreaterThan(Math.min(...series.map((sample) => sample.sphere.luma)));
  } finally {
    await server.close();
  }
});
