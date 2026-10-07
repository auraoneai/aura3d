// PRD-15 T3.11 — C-36 handler table + resolution tests.
import { describe, expect, it } from "vitest";
import type { NodeKindHandlers } from "../../../../packages/engine/src/agent-api/compiler/handlers";
import { isKnownNodeKind, nodeHandlers, resolveNodeHandler } from "../../../../packages/engine/src/agent-api/compiler/handlers";
import { registerNodeHandler, nodeHandlerFor } from "../../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";

describe("C-36 nodeHandlers table", () => {
  it("is exhaustive over the C-36 catalog (18 kinds)", () => {
    expect(Object.keys(nodeHandlers).sort()).toEqual([
      "biome", "effect", "environment", "grass", "group", "interaction", "label",
      "light", "look", "model", "primitive", "probe", "scatter", "sky",
      "terrain", "time-of-day", "water", "wind"
    ].sort());
    for (const kind of Object.keys(nodeHandlers)) {
      expect(isKnownNodeKind(kind)).toBe(true);
    }
  });

  it("flags unknown kinds", () => {
    expect(isKnownNodeKind("hologram")).toBe(false);
    expect(isKnownNodeKind("")).toBe(false);
  });

  // T3.11 type test: a table literal missing a catalog key must not compile.
  it("compiles a NodeKindHandlers missing-key literal only with @ts-expect-error", () => {
    // @ts-expect-error — missing "grass": the mapped type requires every key.
    const incomplete: NodeKindHandlers = {
      model: nodeHandlers.model, primitive: nodeHandlers.primitive, group: nodeHandlers.group,
      light: nodeHandlers.light, effect: nodeHandlers.effect, interaction: nodeHandlers.interaction,
      label: nodeHandlers.label, environment: nodeHandlers.environment, sky: nodeHandlers.sky,
      look: nodeHandlers.look, probe: nodeHandlers.probe, biome: nodeHandlers.biome,
      "time-of-day": nodeHandlers["time-of-day"], wind: nodeHandlers.wind,
      terrain: nodeHandlers.terrain, water: nodeHandlers.water, scatter: nodeHandlers.scatter
    };
    expect(incomplete).toBeTruthy();
  });
});

describe("C-36 handler resolution", () => {
  const flagsOff = resolveQrFlags({});
  const flagsCompiler = resolveQrFlags({ options: ["compiler"] });

  it("returns the legacy default when no lane handler is registered", () => {
    const h = resolveNodeHandler("primitive", flagsOff);
    expect(h?.owner).toBe("prd15");
    expect(resolveNodeHandler("primitive", flagsCompiler)?.owner).toBe("prd15");
  });

  it("a registered lane handler wins only when its flag is on", () => {
    const unregister = registerNodeHandler({
      kind: "water",
      owner: "prd10",
      flag: "A3D_QR_WORLD",
      compile() {}
    });
    try {
      // flag off: the lane handler exists but is not active → default wins
      expect(resolveNodeHandler("water", flagsOff)?.owner).toBe("prd15");
      expect(nodeHandlerFor("water")?.owner).toBe("prd10");
      // wrong flag (compiler ≠ world): still default
      expect(resolveNodeHandler("water", flagsCompiler)?.owner).toBe("prd15");
      // its own flag on: lane handler wins
      const flagsWorld = resolveQrFlags({ options: ["world"] });
      expect(resolveNodeHandler("water", flagsWorld)?.owner).toBe("prd10");
    } finally {
      unregister();
    }
  });
});
