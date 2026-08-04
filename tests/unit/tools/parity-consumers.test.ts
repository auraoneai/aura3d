import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every consumer named by the Three.js parity report must resolve to something that
 * still exists.
 *
 * Why this test exists: `platformer motion tuning` claimed **exceed** while citing
 * `showcase-platformer-game-layer-proof`, a route deleted in 1.5.2. The claim
 * survived the deletion because nothing checked that a cited consumer was still
 * alive, so a capability kept its strongest possible status on the strength of a
 * route that no longer existed.
 *
 * The report is regenerated from a live inventory, so a stale consumer normally
 * disappears on regeneration. That is exactly why this needs asserting: it makes the
 * *committed* report falsifiable, and it fails loudly if a future refactor
 * reintroduces a hardcoded or cached consumer list.
 */
interface ParityRow {
  readonly capability: string;
  readonly parityStatus: string;
  readonly productionConsumers?: readonly string[];
  readonly downgradeReasons?: readonly string[];
  /** The generator emits authored `notes` into this field. */
  readonly limitations?: string;
}

const report = JSON.parse(
  readFileSync(resolve("tests/reports/aura3d-threejs-ecosystem-parity.json"), "utf8")
) as { readonly rows?: readonly ParityRow[] };

function consumerExists(id: string): boolean {
  // Consumers are route ids (apps/<id>), example paths, or package names.
  if (existsSync(resolve("apps", id))) return true;
  if (existsSync(resolve(id))) return true;
  if (id.startsWith("@aura3d/")) return existsSync(resolve("packages", id.slice("@aura3d/".length)));
  return false;
}

describe("threejs parity report consumers", () => {
  it("names only consumers that still exist", () => {
    const rows = report.rows ?? [];
    expect(rows.length, "parity rows present").toBeGreaterThan(0);

    const dead: string[] = [];
    for (const row of rows) {
      for (const consumer of row.productionConsumers ?? []) {
        if (!consumerExists(consumer)) dead.push(`${row.capability} -> ${consumer}`);
      }
    }
    // Name the offenders so a failure is actionable rather than a bare count.
    expect(dead).toEqual([]);
  });

  it("requires a live consumer for any parity-or-better status", () => {
    const rows = report.rows ?? [];
    const unbacked: string[] = [];
    for (const row of rows) {
      if (row.parityStatus === "gap" || row.parityStatus === "parity-unproven") continue;
      if ((row.productionConsumers ?? []).length === 0) unbacked.push(`${row.capability}:${row.parityStatus}`);
    }
    // An unused API is a claim, not a capability.
    expect(unbacked).toEqual([]);
  });

  it("keeps the vehicle and platformer claims honest until the runtime is fixed", () => {
    /*
     * These three claimed `exceed` while the reported defects were live: the car's
     * tyres pass through the road because the chassis samples an analytic plane, and
     * the Skyline jump collapses because apex is derived from `geometry.maxRise`.
     *
     * They are pinned to `parity-unproven` with a recorded reason. GameEngine-PRD
     * WS-3 restores a stronger claim, and it may only do so once the WS-7 penetration
     * and motion-feel gates pass. Deleting this test to re-raise the claim is the
     * failure mode it exists to prevent.
     */
    const byCapability = new Map((report.rows ?? []).map((row) => [row.capability, row]));
    for (const capability of ["vehicle dynamics", "vehicle AI driving", "platformer motion tuning"]) {
      const row = byCapability.get(capability);
      expect(row, `${capability} row present`).toBeTruthy();
      expect(row?.parityStatus, `${capability} must not claim exceed while its runtime is unfixed`).not.toBe("exceed");
      expect(
        (row?.limitations ?? "").length > 0 || (row?.downgradeReasons ?? []).length > 0,
        `${capability} downgrade must carry a recorded reason`
      ).toBe(true);
    }
  });
});
