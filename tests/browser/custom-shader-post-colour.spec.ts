import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type Rgba = readonly [number, number, number, number];
interface Capture { readonly id: string; readonly centre: Rgba; readonly corner: Rgba; readonly postprocessEnabled: boolean; readonly actualPasses: readonly string[]; readonly drawCalls: number; readonly errors: readonly string[]; readonly warnings: readonly string[] }
interface Harness { readonly ids: readonly string[]; render(id: string): Promise<Capture> }

const byte = (value: number) => Math.round(value * 255);
const encode = (linear: number) => Math.round(255 * (linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055));
const near = (a: Rgba, b: Rgba, tolerance: number) => [0, 1, 2].every((i) => Math.abs(a[i]! - b[i]!) <= tolerance);

test.describe("material.custom colour is identical with and without post effects", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("custom shader output survives bloom / grade / vignette / fxaa; built-in PBR is unchanged by a no-op bloom", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto(`${server.origin}/tests/browser/custom-shader-post-colour-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __POST_COLOUR__?: unknown }).__POST_COLOUR__ !== undefined, undefined, { timeout: 120_000 });
    const captures: Record<string, Capture> = {};
    const ids = ["baseline", "decoded", "decoded-bloom-grade", "safe-basic", "bloom", "grade", "vignette0", "fxaa", "bloom-grade", "pbr-baseline", "pbr-bloom"];
    for (const id of [...ids, ...ids.map((v) => `${v}@none`)]) {
      captures[id] = await page.evaluate(async (variant) => (window as unknown as { __POST_COLOUR__: Harness }).__POST_COLOUR__.render(variant), id);
    }
    console.log(`POSTCOLOUR_JSON ${JSON.stringify(captures)}`);
    const authored: Rgba = [byte(0.2), byte(0.5), byte(0.9), 255];
    const encoded: Rgba = [encode(0.2), encode(0.5), encode(0.9), 255];

    for (const id of Object.keys(captures)) expect(captures[id]!.errors, `${id} errors`).toEqual([]);
    expect(captures["baseline@none"]!.centre[0], "custom quad must be visible").toBeGreaterThan(20);
    // A custom shader writes linear light and the output stage sRGB-encodes it: the raw colour reads re-encoded,
    // with or without effects.
    for (const id of ids.filter((v) => !v.startsWith("pbr") && !v.startsWith("decoded"))) {
      expect(near(captures[`${id}@none`]!.centre, encoded, 6), `${id}@none centre ${captures[`${id}@none`]!.centre} vs encoded ${encoded}`).toBe(true);
    }
    // `#include <colorspace_decode>` makes the display-referred colour read as authored (toneMapping none), with or without effects.
    for (const id of ["decoded", "decoded-bloom-grade"]) {
      expect(near(captures[`${id}@none`]!.centre, authored, 4), `${id}@none centre ${captures[`${id}@none`]!.centre} vs authored ${authored}`).toBe(true);
    }
    // Default output (tone-mapped chain): adding effects must not move a custom colour.
    for (const id of ["bloom", "grade", "vignette0", "fxaa", "bloom-grade"]) {
      expect(near(captures[id]!.centre, captures.baseline!.centre, 6), `${id} centre ${captures[id]!.centre} vs baseline ${captures.baseline!.centre}`).toBe(true);
    }
    // Built-in lit materials already match with a no-op bloom; the fix must not move them.
    expect(near(captures["pbr-bloom"]!.centre, captures["pbr-baseline"]!.centre, 6), `pbr bloom ${captures["pbr-bloom"]!.centre} vs ${captures["pbr-baseline"]!.centre}`).toBe(true);
  });
});
