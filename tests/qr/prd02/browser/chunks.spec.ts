/**
 * 02-S14 — prd02 lighting chunks in a real WebGL2 context (macos-14, ANGLE
 * Metal). Drives `scenes/prd02/chunks.html` from the lane bundle:
 *  - every a3d_prd02_* chunk compiles in ChunkHarness; the composed forward
 *    set (sh9 + ibl + shadow lookup + punctual, shadows on) links within 224
 *    default-block uniform vectors and 16 texture units;
 *  - a white Lambert plane under one directional light (E = 1) is albedo/π
 *    within 1e-4;
 *  - a 32-light program evaluates all 32 lights (32/π, not the 16/π a
 *    16-light cap would give);
 *  - C-12 drop order at 16 units (CPU, LIGHTING_SAMPLER_DROP_ORDER).
 */
import { expect, test } from "@playwright/test";
import { LIGHTING_SAMPLER_DROP_ORDER } from "../../../../packages/rendering/src/contracts/sampling";
import { resolveLightingSamplerBudgetReal } from "../../../../packages/rendering/src/environment/LightingSamplerBudget";
import { startLaneServer, type LaneServer } from "./lane-page";

interface CompileRow {
  readonly name: string;
  readonly fragmentOk: boolean;
  readonly vertexOk: boolean;
  readonly linkOk: boolean | null;
  readonly uniformVectors: number | null;
  readonly samplers: number | null;
  readonly log: string;
}

interface HarnessResult {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly limits?: { readonly maxFragmentUniformVectors: number; readonly maxTextureImageUnits: number };
  readonly compile?: readonly CompileRow[];
  readonly lambert?: { readonly value: number; readonly ok: boolean; readonly log: string };
  readonly lights32?: { readonly value: number; readonly ok: boolean; readonly log: string };
}

const UNIFORM_VECTOR_BUDGET = 224;
const TEXTURE_UNIT_BUDGET = 16;

test.describe("02-S14 prd02 chunks in ChunkHarness", () => {
  let server: LaneServer;
  let result: HarnessResult;

  test.beforeAll(async ({ browser }) => {
    server = await startLaneServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/scenes/prd02/chunks.html`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction("() => Boolean(window.__A3D_PRD02_CHUNKS__)", undefined, { timeout: 60_000, polling: 250 });
    result = (await page.evaluate("() => window.__A3D_PRD02_CHUNKS__")) as HarnessResult;
    await page.close();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness ran", () => {
    expect(result.status, result.error).toBe("ready");
  });

  test("every a3d_prd02_* chunk compiles; the forward set links within 224 vectors / 16 units", () => {
    const rows = result.compile ?? [];
    expect(rows.length).toBe(7);
    for (const row of rows) {
      expect(row.fragmentOk, `${row.name} fragment: ${row.log}`).toBe(true);
      expect(row.vertexOk, `${row.name} vertex: ${row.log}`).toBe(true);
    }
    const forward = rows.find((row) => row.name === "forward-set");
    expect(forward?.linkOk, `forward set link: ${forward?.log}`).toBe(true);
    expect(forward?.uniformVectors ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(UNIFORM_VECTOR_BUDGET);
    expect(forward?.samplers ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(TEXTURE_UNIT_BUDGET);
    // The 32-light block alone is 192 vectors: a census far below that means the
    // linker stripped the lighting path and the budget check proves nothing.
    expect(forward?.uniformVectors ?? 0).toBeGreaterThanOrEqual(192);
  });

  test("white Lambert plane under E = 1 is albedo/π within 1e-4", () => {
    expect(result.lambert?.ok, result.lambert?.log).toBe(true);
    expect(Math.abs((result.lambert?.value ?? Number.NaN) - 1 / Math.PI)).toBeLessThanOrEqual(1e-4);
  });

  test("a 32-light program evaluates all 32 lights", () => {
    expect(result.lights32?.ok, result.lights32?.log).toBe(true);
    expect(Math.abs((result.lights32?.value ?? Number.NaN) - 32 / Math.PI)).toBeLessThanOrEqual(32e-4);
  });

  test("C-12 drop order at 16 texture units", () => {
    const allOn = {
      A3D_CASCADE_COUNT: 4, A3D_SHADOW_PCSS: 1, A3D_LOCAL_SHADOW_ATLAS: 1, A3D_CONTACT_SHADOW: 1,
      A3D_REFLECTION_PROBE_2: 1, A3D_IRRADIANCE_VOLUME: 1, A3D_LTC: 1, A3D_SH_TEXTURE: 1,
      A3D_IRIDESCENCE: 1, A3D_SHEEN: 1, A3D_ANISOTROPY: 1, A3D_CLEARCOAT: 1
    };
    const plan = resolveLightingSamplerBudgetReal(allOn, 5, { maxTextureImageUnits: TEXTURE_UNIT_BUDGET });
    expect(plan.lightingUnits + plan.materialSamplers).toBeLessThanOrEqual(TEXTURE_UNIT_BUDGET);
    // Downgrades first (PCSS raw, LTC), then the frozen drop order as a prefix.
    expect(plan.droppedFeatures.slice(0, 2)).toEqual(["pcss-raw", "ltc"]);
    const ordered = plan.droppedFeatures.slice(2);
    expect(ordered).toEqual(LIGHTING_SAMPLER_DROP_ORDER.slice(0, ordered.length));
  });
});
