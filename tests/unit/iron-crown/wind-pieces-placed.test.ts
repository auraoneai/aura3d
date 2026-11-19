import { describe, expect, it } from "vitest";
import { idolWindPiece } from "../../../apps/showcase-iron-crown/src/game/idolStage";

/**
 * Owner (full autoplay run, 2026-11-18): the Monastery bonsai pine and the Colosseum battle standard stood in the middle of the
 * fight. Wind pieces are packed scatters that ignore their parent group's transform, so the placement must be on the instance.
 */
const find = (n: any, pred: (x: any) => boolean): any => {
  if (!n || typeof n !== "object") return null;
  if (pred(n)) return n;
  for (const v of Object.values(n)) { const f = find(v, pred); if (f) return f; }
  return null;
};

describe("Iron Crown wind set pieces stand where they are placed, not at the arena centre", () => {
  for (const [key, pos, yaw] of [["icMoPine", [3.95, 0, -2.45], -0.2], ["icCoStandard", [-3.7, 0, -2.15], 0.22]] as const) {
    it(`${key} at ${pos.join(",")}`, () => {
      const node: any = idolWindPiece(`t-${key}`, key, pos, yaw, 0.5);
      expect(node, "Idol wind piece built").not.toBeUndefined();
      const inst = find(node, (x) => Array.isArray(x.transforms) || Array.isArray(x.instances));
      const list = inst.transforms ?? inst.instances;
      expect(list[0].position).toEqual(pos);
      expect(list[0].rotation?.[1]).toBeCloseTo(yaw, 6);
      const p = node.position ?? node.transform?.position ?? [0, 0, 0];
      expect(Math.hypot(p[0], p[1], p[2])).toBe(0);
    });
  }
});
