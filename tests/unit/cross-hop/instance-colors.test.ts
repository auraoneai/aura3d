import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Instanced movers take their colour from the per-instance colour list. A base material colour on top of that squares the
// colour (a #8b5a2b log renders as #472c14, nearly black), so these pools must use a white base material.
const core = readFileSync(path.resolve("apps/showcase-cross-hop/src/game/core.ts"), "utf8");

describe("cross hop instanced mover materials", () => {
  for (const [name, pool] of [["m-logs", "log"], ["m-pads", "pad"], ["m-stones", "stone"]] as const) {
    it(`${name} uses a white base material so the instance colour is not applied twice`, () => {
      const line = core.split("\n").find((l) => l.includes(`name: "${name}"`));
      expect(line, `${name} node`).toBeDefined();
      expect(line).toMatch(/material\.pbr\(\{ color: "#ffffff"/);
      expect(line).toContain(`CAP.${pool}`);
    });
  }
});
