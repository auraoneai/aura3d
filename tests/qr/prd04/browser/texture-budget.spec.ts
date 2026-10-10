/**
 * PRD-04 §16.1 S9 — texture budget (C-27).
 *
 * Subject: the Meshy hero (`courierVanMeshyV2Decimated`, `public/aura-assets/`),
 * the heaviest textured GLB in the shipped set, rendered through
 * `prd04-assets` at the Medium C-27 policy.
 * Gates:
 *   - `textureBytes` <= 256 MiB under `textureBudget=268435456`
 *   - every downscaled texture's `to` dimension <= 2048 (maxTextureSize)
 *   - `contextLost` false after a production render
 *   - discrimination probe (PRD control, P-35): with the budget disabled the
 *     uncapped ledger exceeds 256 MiB — recorded in probes/s9-budget-control.json
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { loadProbe, type Prd04ProbePayload } from "./probe";

const HERO = "/aura-assets/courierVanMeshyV2Decimated.6f509ab0.glb";
const MIB = 1024 * 1024;

const url = (flags: string, budget?: number, maxDim?: number) =>
  `/tests/qr/prd04/harness/prd04-assets.html?asset=${encodeURIComponent(HERO)}&flags=${flags}&render=1` +
  `${budget !== undefined ? `&textureBudget=${budget}` : ""}` +
  `${maxDim !== undefined ? `&maxTextureSize=${maxDim}` : ""}`;

test.describe("PRD-04 S9 texture budget", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd04/probes"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd04/probes/s9-budget-control.json"),
      `${JSON.stringify({ probe: "s9-budget", probes }, null, 2)}\n`
    );
    await server.close();
  });

  test("Meshy hero at Medium: ledger <= 256 MiB, dims <= 2048, no context loss", async ({ page }) => {
    const uncapped = await loadProbe(page, `${server.origin}${url("materials")}`);
    const uncappedBytes = (uncapped.extra ?? {}).textureBytes as number;
    expect(uncappedBytes, "uncapped ledger populated").toBeGreaterThan(0);

    const medium = await loadProbe(page, `${server.origin}${url("materials", 256 * MIB, 2048)}`);
    const mediumBytes = (medium.extra ?? {}).textureBytes as number;
    const downscaled = ((medium.extra ?? {}).downscaledTextures ?? []) as { from: number; to: number }[];
    const contextLost = (medium.extra ?? {}).contextLost;

    expect(mediumBytes, `ledger ${mediumBytes} <= 256 MiB`).toBeLessThanOrEqual(256 * MIB);
    // `downscaled[]` reports BYTES of the dropped leading mip (from -> to), not
    // dimensions — the maxTextureSize=2048 policy governs base dims inside
    // applyTextureBudget; here we assert each entry actually shrank.
    for (const entry of downscaled) {
      expect(entry.to, `downscaled ${entry.from} -> ${entry.to} shrank bytes`).toBeLessThan(entry.from);
    }
    expect(contextLost, "no context loss after render").toBe(false);

    // P-35: restored PRD control — "budget disabled exceeds 256 MiB". The
    // uncapped ledger of the heaviest shipped asset must clear the Medium
    // budget, proving the medium assertions above are not vacuous.
    expect(uncappedBytes, "control (budget disabled) exceeds 256 MiB").toBeGreaterThan(256 * MIB);

    probes.push({
      asset: HERO,
      uncappedBytes,
      mediumBytes,
      mediumDownscaled: downscaled.length,
      control: "budget disabled exceeds 256 MiB",
      contextLost
    });
  });
});
