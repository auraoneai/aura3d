// Blind-panel fix pass: the 4.6.2 (default) look draws its look HDRI as the sky. Since GU47 E-A a
// colour `background` override on looks.preset hides the HDRI, which left a flat navy backdrop.
import { describe, expect, it } from "vitest";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import type { WorldId } from "../../../apps/showcase-pips-big-leap/src/game/types";

function hdriNodes(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!node || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  if (o.kind === "environment" && o.environment === "hdri") out.push(o);
  for (const c of (o.children as unknown[] | undefined) ?? (o.nodes as unknown[] | undefined) ?? []) hdriNodes(c, out);
  return out;
}

describe("pips-big-leap original look keeps the 4.6.2 HDRI sky", () => {
  const ids: WorldId[] = ["academy", "w1", "w2", "w3", "w5"];
  for (const id of ids) {
    it(`${id}: the look HDRI is drawn as the background`, () => {
      const built = buildWorld(worldSpec(id), { look: "original" });
      const scene = built.scene.toJSON() as unknown;
      const hdri = hdriNodes(scene);
      expect(hdri.length).toBeGreaterThan(0);
      for (const h of hdri) expect(h.background).not.toBe(false);
    });
  }
});
