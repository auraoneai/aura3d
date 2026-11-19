import { describe, expect, it } from "vitest";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";
import { IDOL_STAGE_MOTION, idolStageMotionYaw, stepIdolStageMotion } from "../../../apps/showcase-iron-crown/src/game/idolStage";

type Node = { name?: string; runtime?: { id?: string }; position?: number[]; transform?: { position?: number[] }; children?: Node[]; wind?: unknown; instanceWind?: unknown };
function walk(n: Node, out: Node[] = []): Node[] {
  out.push(n);
  for (const c of n.children ?? []) walk(c, out);
  return out;
}
const all = STAGES.flatMap((s) => (s.dressing as unknown as Node[]).flatMap((n) => walk(n)));
const byId = (id: string) => all.find((n) => n.runtime?.id === id);
const pos = (n: Node) => n.position ?? n.transform?.position ?? [0, 0, 0];

describe("iron crown Idol moving parts (MOVING-PARTS pass)", () => {
  it("mounts the radar antenna, both HVAC fans and both dock cranes as their own moving nodes", () => {
    const ids = IDOL_STAGE_MOTION.map((m) => m.id).sort();
    expect(ids).toEqual(["ab-tower-l-antenna", "bk-crane-l-slew", "bk-crane-r-slew", "nt-vent-1-fan", "nt-vent-2-fan"].sort());
    for (const id of ids) expect(byId(id), id).toBeDefined();
  });

  it("the antenna sits on the tower top and the fans in the HVAC top grille", () => {
    expect(pos(byId("ab-tower-l-antenna")!)[1]).toBeGreaterThan(3);
    for (const id of ["nt-vent-1-fan", "nt-vent-2-fan"]) {
      const y = pos(byId(id)!)[1]!;
      expect(y).toBeGreaterThan(1.1);
      expect(y).toBeLessThan(1.45);
    }
  });

  it("advancing frames turns every moving part", () => {
    const rot = new Map<string, number>();
    const get = (id: string) => ({ setRotation: (_x: number, y: number) => void rot.set(id, y) });
    expect(stepIdolStageMotion(1, get)).toBe(IDOL_STAGE_MOTION.length);
    const a = new Map(rot);
    stepIdolStageMotion(1.5, get);
    for (const m of IDOL_STAGE_MOTION) expect(Math.abs(rot.get(m.id)! - a.get(m.id)!), m.id).toBeGreaterThan(0.01);
    const antenna = IDOL_STAGE_MOTION.find((m) => m.id === "ab-tower-l-antenna")!;
    expect(idolStageMotionYaw(antenna, 10) - idolStageMotionYaw(antenna, 0)).toBeCloseTo(6.2, 1);
  });

  it("pines and battle standards bend in the instance wind", () => {
    for (const name of ["mo-pine-l", "mo-pine-r", "co-standard-l", "co-standard-r"]) {
      const piece = all.find((n) => n.name === name)!;
      expect(JSON.stringify(piece), name).toMatch(/"(instanceWind|wind)"/);
    }
  });
});
