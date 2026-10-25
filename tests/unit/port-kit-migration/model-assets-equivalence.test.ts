import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The ports' model tables moved from hand-written `defineAuraAssets` entries to `defineModelAssets`. The golden file was
 * captured from the hand-written tables before the move; every ref (URL, sha256, format, bounds, size, metadata) must
 * stay identical. The only normalisation: a redundant `sha256` field next to an equal `hash` is dropped (the bridge reads `hash`).
 */
const ROOT = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
const GOLDEN = new URL("./model-assets.golden.json", import.meta.url).pathname;

const TABLES: ReadonlyArray<readonly [string, () => Promise<Record<string, unknown>>]> = [
  ["splat-rush MODELS", async () => (await import("../../../examples/splat-rush-port/models")).MODELS],
  ["drift-and-deliver MODEL_ASSETS", async () => (await import("../../../examples/drift-and-deliver-port/models")).MODEL_ASSETS],
  ["heatsink MODELS", async () => (await import("../../../examples/heatsink-port/models")).MODELS],
  ["kid-goku MESHY", async () => (await import("../../../examples/kid-goku-beyond-the-clouds-port/models")).MESHY],
  ["last-train MESHY_ASSETS", async () => (await import("../../../examples/last-train-port/models")).MESHY_ASSETS],
  ["ninja-runner PROP_ASSETS", async () => (await import("../../../examples/ninja-runner-port/models")).PROP_ASSETS],
  ["saiyan-snake-way MESHY", async () => (await import("../../../examples/saiyan-snake-way-port/models")).MESHY],
  ["strange-orbit MESHY", async () => (await import("../../../examples/strange-orbit-port/models")).MESHY],
  ["where-the-wind-wanders MODEL_ASSETS", async () => (await import("../../../examples/where-the-wind-wanders-port/model-assets")).MODEL_ASSETS],
  ["silt-and-signal assets", async () => (await import("../../../examples/silt-and-signal-port/assets")).assets]
];

function normalise(refs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of Object.keys(refs).sort()) {
    const ref = { ...(refs[id] as Record<string, unknown>) };
    if (typeof ref.sha256 === "string" && ref.hash === `sha256-${ref.sha256}`) delete ref.sha256;
    out[id] = JSON.parse(JSON.stringify(ref).replaceAll(ROOT, "<root>"));
  }
  return out;
}

describe("port model tables stay identical after the defineModelAssets move", () => {
  if (process.env.UPDATE_MODEL_GOLDEN === "1") {
    it("writes the golden file", async () => {
      const golden: Record<string, unknown> = {};
      for (const [name, load] of TABLES) golden[name] = normalise(await load());
      writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    }, 120_000);
    return;
  }
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Record<string, unknown>>;
  for (const [name, load] of TABLES) {
    it(name, async () => {
      expect(normalise(await load())).toEqual(golden[name]);
    }, 120_000);
  }
});
