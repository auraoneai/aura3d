/**
 * PRD-04 §16.1 S16 + §17 integrated ratios — perf on `18-game-scene` and the
 * Gallery Shift museum interior (the heaviest material game in the shipped set;
 * the app's museum GLB as a bare hero-model scene, no route code).
 *
 * Standalone (always runs): median `app.step(1/60)` wall time over 300 frames
 * with `A3D_QR_MATERIALS` on <= 1.10x the same build with it off.
 *
 * Integrated (only when PRD04_FLAGS contains `all`, per §17): `all` <= 1.10x
 * `all,-materials`, and `all,transmission` <= 1.15x `all`.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { loadProbe, type Prd04ProbePayload } from "./probe";

const FLAGS = (process.env.PRD04_FLAGS ?? "none").split(",").filter(Boolean);
const INTEGRATED = FLAGS.includes("all");

const SUBJECTS = [
  { label: "18-game-scene", query: "scene=18-game-scene" },
  {
    label: "gallery-shift-interior",
    query: `asset=${encodeURIComponent("/apps/showcase-gallery-shift/assets/models/galleryShiftMuseumInterior.glb")}`
  }
] as const;

const url = (subject: (typeof SUBJECTS)[number], flags: string) =>
  `/tests/qr/prd04/harness/prd04-perf.html?${subject.query}&flags=${encodeURIComponent(flags)}&frames=300&settle=60`;

function medianMs(payload: Prd04ProbePayload): number {
  const value = (payload.extra ?? {}).medianMs as number;
  expect(value, "extra.medianMs present").toBeGreaterThan(0);
  return value;
}

test.describe("PRD-04 S16 perf ratios", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd04/probes"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd04/probes/s16-perf.json"),
      `${JSON.stringify({ probe: "s16-perf", probes }, null, 2)}\n`
    );
    await server.close();
  });

  for (const subject of SUBJECTS) {
    test(`${subject.label}: materials on <= 1.10x flag-off median frame time`, async ({ page }) => {
      const on = await loadProbe(page, `${server.origin}${url(subject, "materials")}`, 240_000);
      const off = await loadProbe(page, `${server.origin}${url(subject, "none")}`, 240_000);
      const onMs = medianMs(on);
      const offMs = medianMs(off);
      probes.push({ subject: subject.label, onMs, offMs, ratio: onMs / offMs });
      expect(onMs, `${subject.label} median ${onMs}ms <= 1.10x flag-off ${offMs}ms`).toBeLessThanOrEqual(1.1 * offMs);
    });
  }

  test.describe("integrated (qr_flags=all)", () => {
    test.skip(!INTEGRATED, "PRD04_FLAGS does not contain 'all' — integrated ratio deferred to the all-flags CI lane");

    for (const subject of SUBJECTS) {
      test(`${subject.label}: all <= 1.10x all,-materials`, async ({ page }) => {
        const all = await loadProbe(page, `${server.origin}${url(subject, "all")}`, 240_000);
        const noMaterials = await loadProbe(page, `${server.origin}${url(subject, "all,-materials")}`, 240_000);
        const allMs = medianMs(all);
        const offMs = medianMs(noMaterials);
        probes.push({ subject: subject.label, integrated: true, allMs, noMaterialsMs: offMs, ratio: allMs / offMs });
        expect(allMs, `${subject.label} all ${allMs}ms <= 1.10x all,-materials ${offMs}ms`).toBeLessThanOrEqual(
          1.1 * offMs
        );
      });

      test(`${subject.label}: transmission on <= 1.15x all`, async ({ page }) => {
        const withTransmission = await loadProbe(
          page,
          `${server.origin}${url(subject, "all,materials_transmission")}`,
          240_000
        );
        const all = await loadProbe(page, `${server.origin}${url(subject, "all")}`, 240_000);
        const txMs = medianMs(withTransmission);
        const allMs = medianMs(all);
        probes.push({ subject: subject.label, integrated: true, txMs, allMs, ratio: txMs / allMs });
        expect(txMs, `${subject.label} transmission ${txMs}ms <= 1.15x all ${allMs}ms`).toBeLessThanOrEqual(1.15 * allMs);
      });
    }
  });
});
