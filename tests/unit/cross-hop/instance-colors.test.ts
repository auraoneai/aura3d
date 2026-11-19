import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Instanced movers take their colour from the per-instance colour list, which multiplies the base colour. Since the Idol
// pass the log, lily-pad and lava-stone pools draw textured Idol GLBs, so their instances must be submitted white (a
// tint would darken the baked bark, leaf and basalt textures).
const core = readFileSync(path.resolve("apps/showcase-cross-hop/src/game/core.ts"), "utf8");

describe("cross hop instanced mover materials", () => {
  for (const [name, pool] of [["m-logs", "log"], ["m-pads", "pad"], ["m-stones", "stone"]] as const) {
    it(`${name} is an Idol model pool and its instances are submitted white`, () => {
      const line = core.split("\n").find((l) => l.includes(`"${name}"`));
      expect(line, `${name} node`).toBeDefined();
      expect(line).toContain(`idolPool("${pool}"`);
      expect(line).toContain(`CAP.${pool}`);
      // Idol movers are placed only through instIdol(), which submits a white instance colour.
      expect(core).toContain(`instIdol("${pool}"`);
      expect(core).not.toContain(`inst("${pool}"`);
      expect(core).toMatch(/function instIdol[\s\S]{0,240}inst\(k, x, y, z, sx, sy, sz, "#ffffff", ry\)/);
    });
  }
});
