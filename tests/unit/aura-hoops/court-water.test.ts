import { describe, expect, it } from "vitest";
import { COURT_IDS, COURT_RIGS, courtWaterNodes } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";

type WaterJson = { kind?: string; id?: string; options?: { kind?: string; waves?: unknown; normalSpeed?: number } };
const json = (id: (typeof COURT_IDS)[number], reduced = false) => courtWaterNodes(COURT_RIGS[id], reduced).map((n) => n.toJSON() as WaterJson);

describe("Aura Hoops 3D GU47 water (H47-E3)", () => {
  it("mounts ocean surf at Venice, a river at Shanghai and no water elsewhere", () => {
    expect(json("venice").map((n) => [n.kind, n.options?.kind])).toEqual([["water", "ocean"]]);
    expect(json("shanghai").map((n) => [n.kind, n.options?.kind])).toEqual([["water", "river"]]);
    for (const id of COURT_IDS) if (id !== "venice" && id !== "shanghai") expect(json(id)).toEqual([]);
  });

  it("stills the water under reduced motion", () => {
    expect(json("venice", false)[0]!.options?.waves).toBe("moderate");
    expect(json("venice", true)[0]!.options?.waves).toBe("calm");
    expect(json("shanghai", true)[0]!.options?.normalSpeed).toBe(0);
  });
});
