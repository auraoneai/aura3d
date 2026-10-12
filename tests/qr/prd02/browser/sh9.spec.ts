/**
 * 02-T1936 — SH binding sky tint on prd02-13's HDRI (PRD-02 Phase 3 "SH
 * binding for chunk programs" row). Drives `scenes/prd02/sh9.html` from the
 * lane bundle on macos-14.
 *
 * kloppenheim06Puresky → C-09 real factory → `probe.sh9` (lane cube→SH9
 * projection), shaded on a white Lambert sphere through both SH entry points
 * (`a3d_prd02_sh9`/`a3d_sh9Irradiance` with the 9×1 SH texture, and
 * `a3d_prd02_lighting_ibl`/`a3dSH9Irradiance` with `packEnvSH` u_envSH[7]):
 *  - top region (n.y > 0.7) mean B/R ≥ 1.05 (sky tint);
 *  - bottom region (n.y < -0.7) mean luma ≤ top region mean luma.
 * Controls that must fail, same programs: the grey neutral-floor SH
 * (`NEUTRAL_FLOOR_SH9`, B/R = 1) and the HDRI SH rotated upside down.
 */
import { expect, test } from "@playwright/test";
import { startLaneServer, type LaneServer } from "./lane-page";

interface SphereRegions {
  readonly top: readonly [number, number, number];
  readonly bottom: readonly [number, number, number];
  readonly topLuma: number;
  readonly bottomLuma: number;
  readonly topBlueOverRed: number;
}
type Path = "sh9Texture" | "envSH";
interface HarnessResult {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly probeSource?: string;
  readonly shaded?: Readonly<Record<"hdri" | "neutral" | "upsideDown", Readonly<Record<Path, SphereRegions>>>>;
}

const BLUE_OVER_RED = 1.05;
const PATHS: readonly Path[] = ["sh9Texture", "envSH"];

function skyTint(regions: SphereRegions): { tinted: boolean; bottomNotBrighter: boolean } {
  return { tinted: regions.topBlueOverRed >= BLUE_OVER_RED, bottomNotBrighter: regions.bottomLuma <= regions.topLuma };
}

test.describe("02-T1936 SH9 sky tint on the prd02-13 white sphere", () => {
  let server: LaneServer;
  let result: HarnessResult;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    server = await startLaneServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/scenes/prd02/sh9.html`, { waitUntil: "load", timeout: 60_000 });
    // Expression predicates (a "() => …" string is truthy at once; see chunks.spec.ts).
    await page.waitForFunction("Boolean(window.__A3D_PRD02_SH9__)", undefined, { timeout: 240_000, polling: 500 });
    result = (await page.evaluate("window.__A3D_PRD02_SH9__")) as HarnessResult;
    await page.close();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness ran on the real C-09 factory", () => {
    expect(result.status, result.error).toBe("ready");
    expect(result.probeSource).toBe("hdri");
  });

  for (const path of PATHS) {
    test(`${path}: top B/R ≥ 1.05 and bottom luma ≤ top`, () => {
      const regions = result.shaded!.hdri[path];
      const detail = JSON.stringify(regions);
      expect(Number.isFinite(regions.topLuma) && regions.topLuma > 0, detail).toBe(true);
      expect(regions.topBlueOverRed, detail).toBeGreaterThanOrEqual(BLUE_OVER_RED);
      expect(regions.bottomLuma, detail).toBeLessThanOrEqual(regions.topLuma);
    });

    test(`${path} control: the grey neutral-floor SH has no sky tint`, () => {
      const regions = result.shaded!.neutral[path];
      expect(skyTint(regions).tinted, JSON.stringify(regions)).toBe(false);
    });

    test(`${path} control: the upside-down HDRI SH fails the criterion`, () => {
      const regions = result.shaded!.upsideDown[path];
      const verdict = skyTint(regions);
      expect(verdict.tinted && verdict.bottomNotBrighter, JSON.stringify(regions)).toBe(false);
    });
  }
});
