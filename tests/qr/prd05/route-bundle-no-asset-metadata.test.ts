import { mkdtempSync, readFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeRouteTypedAssets } from "../../../packages/aura3d-cli/src/asset-route-typegen.js";
import { assetsRouteModulesCodemod } from "../../../packages/aura3d-cli/src/commands/prd05/codemods/assetsRouteModules.js";

/**
 * PRD-05 §6.8/R11 — a route built against its `aura-assets.route` module must
 * ship zero `suitabilityReason`/`licenseRaw` strings: the route module carries
 * transport fields only and licence data lives in `dist/credits.json`.
 */

const FIXTURE = "tests/qr/prd05/fixtures/route-bundle";
const CODEMOD_FIXTURES = "tests/qr/prd05/fixtures/routes";

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "prd05-route-bundle-"));
  cpSync(FIXTURE, join(workDir, "route-bundle"), { recursive: true });
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("PRD-05 §6.8 per-route typegen", () => {
  it("route module ships only referenced ids and no licence/suitability strings", () => {
    const projectDir = join(workDir, "route-bundle");
    const result = writeRouteTypedAssets({ projectDir, route: "." });
    expect(result.ok).toBe(true);
    expect(result.referencedIds).toEqual(["courierParcel", "courierVan"]);
    expect(result.missingIds).toEqual([]);

    const moduleText = readFileSync(result.path, "utf8");
    expect(moduleText).not.toContain("suitabilityReason");
    expect(moduleText).not.toContain("licenseRaw");
    expect(moduleText).not.toContain("unreferencedProp");
    expect(moduleText).toContain('"courierParcel"');
    expect(moduleText).toContain('"courierVan"');

    // Licence data lands in dist/credits.json, not in the bundle module.
    const credits = JSON.parse(readFileSync(result.creditsPath, "utf8")) as {
      readonly assets: Record<
        string,
        { readonly license?: string; readonly licenseName?: string }
      >;
    };
    expect(credits.assets.courierParcel?.license).toBe("cc0");
    expect(credits.assets.courierVan?.licenseName).toBe("CC0-1.0");
  });
});

describe("PRD-05 §6.8 assets-route-modules codemod", () => {
  it("rewrites monolithic imports to the app's route module", () => {
    const file = `${CODEMOD_FIXTURES}/apps/showcase-fixture-alpha/src/main.ts`;
    const source = readFileSync(file, "utf8");
    const { code, rows } = assetsRouteModulesCodemod.transform(source, file);
    expect(code).toContain(`from "./aura-assets.route"`);
    expect(code).not.toContain("src/aura-assets");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mapping: "exact", file });
  });

  it("leaves already-route imports alone and still rewrites monolithic ones", () => {
    const file = `${CODEMOD_FIXTURES}/apps/showcase-fixture-beta/src/legacy/main.ts`;
    const source = readFileSync(file, "utf8");
    const { code, rows } = assetsRouteModulesCodemod.transform(source, file);
    // src/legacy/main.ts: the monolith specifier and the pre-existing route
    // specifier both resolve to ../aura-assets.route after the rewrite.
    expect(code.match(/aura-assets\.route/g)?.length).toBe(2);
    expect(code).not.toContain("src/aura-assets");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mapping).toBe("exact");
  });
});
