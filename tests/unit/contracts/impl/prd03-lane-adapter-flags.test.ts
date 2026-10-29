/**
 * PRD-03 "pixels, not evidence": the GPU promote/bisect harness toggles a lane
 * flag through `?a3d-qr=<list>` → `main.ts` → `module.default(host, { qrFlags })`.
 * The prd03 lane adapters dropped that second argument, so `runAuraScene` fell
 * back to the spec's lane default `qrFlags: ["post"]` and the flags-off control
 * rendered post-on — every none-vs-post comparison was byte-identical.
 *
 * Also pins the engine half: flag-on, the compiler submits the v2 bag
 * (`v2: true` + `pipeline`) the renderer's PostGraph v2 seam consumes.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

const runAuraScene = vi.fn(async () => ({}) as never);
vi.mock("../../../../benchmarks/quality-rebuild/aura3d/common", () => ({ runAuraScene }));

const here = dirname(fileURLToPath(import.meta.url));
const adapterDir = join(here, "../../../../benchmarks/quality-rebuild/aura3d/scenes/prd03");
const adapters = readdirSync(adapterDir).filter((file) => /^prd03-.*\.ts$/.test(file));

afterEach(() => runAuraScene.mockClear());

describe("prd03 lane adapters forward harness RunOptions", () => {
  test("every adapter is covered", () => {
    expect(adapters.length).toBeGreaterThanOrEqual(11);
  });

  for (const file of adapters) {
    test(`${file}: flags-off capture (qrFlags: []) reaches runAuraScene`, async () => {
      const mod = (await import(join(adapterDir, file))) as { default: (host: HTMLElement, opts?: unknown) => Promise<unknown> };
      const opts = { variant: "default", dpr: 1, qrFlags: [] as string[] };
      await mod.default({} as HTMLElement, opts);
      expect(runAuraScene).toHaveBeenCalledTimes(1);
      const call = runAuraScene.mock.calls[0] as unknown as [unknown, unknown, unknown];
      // Without the forwarded opts the spec default `["post"]` wins.
      expect(call[2]).toBe(opts);
    });
  }
});

describe("flag-on compiler submits the v2 post bag", () => {
  test("plain scene: flag-off legacy bag, flag-on v2 + pipeline", async () => {
    const { createProductionRuntimePostprocess } = await import("../../../../packages/engine/src/agent-api/compiler/postprocess");
    const { recordAuthoredPostContext, resetAuthoredPostContext } = await import("../../../../packages/engine/src/agent-api/postBridge");
    const { resolveQrFlags } = await import("@aura3d/engine/contracts");
    const snapshot = { nodes: [{ kind: "effect", effect: "bloom", intensity: 0.5, threshold: 0.8 }] } as never;
    resetAuthoredPostContext();
    const off = createProductionRuntimePostprocess(snapshot);
    expect(off.v2).toBeUndefined();
    expect(off.pipeline).toBeUndefined();
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    const on = createProductionRuntimePostprocess(snapshot);
    expect(on.v2).toBe(true);
    expect(on.pipeline).toBeTruthy();
    expect(on.bloom).toBeTruthy();
    resetAuthoredPostContext();
  }, 120_000);
});
