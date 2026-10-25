import { describe, expect, it } from "vitest";
import { summarizeTextureUpgrade, texturedNodesReady } from "../../../packages/game/src/evidence/textureStatus";

const diag = (rows: Array<[string, string]>) => ({ renderer: { runtime: { texturedMaterials: rows.map(([nodeName, status]) => ({ nodeName, status })) } } });

describe("texture upgrade status", () => {
  it("counts each status", () => {
    const s = summarizeTextureUpgrade(diag([["car-body", "textured"], ["vehicles-sedan", "pending"], ["pine", "none"], ["road", "fallback"]]));
    expect(s).toMatchObject({ total: 4, textured: 1, pending: 1, none: 1, fallback: 1 });
  });

  it("is empty-safe for missing diagnostics", () => {
    expect(summarizeTextureUpgrade(undefined).total).toBe(0);
    expect(summarizeTextureUpgrade({}).total).toBe(0);
    expect(texturedNodesReady(summarizeTextureUpgrade(null), () => true).ready).toBe(false);
  });

  it("waits until every matching node is textured or settled on its fallback", () => {
    const early = summarizeTextureUpgrade(diag([["car-body", "none"], ["vehicles-sedan", "none"], ["road", "none"]]));
    expect(texturedNodesReady(early, (n) => n === "car-body" || n.startsWith("vehicles-")).ready).toBe(false);
    const part = summarizeTextureUpgrade(diag([["car-body", "textured"], ["vehicles-sedan", "pending"]]));
    const r = texturedNodesReady(part, (n) => n === "car-body" || n.startsWith("vehicles-"));
    expect(r.ready).toBe(false);
    expect(r.waiting).toEqual(["vehicles-sedan"]);
    const done = summarizeTextureUpgrade(diag([["car-body", "textured"], ["vehicles-sedan", "fallback"]]));
    expect(texturedNodesReady(done, (n) => n === "car-body" || n.startsWith("vehicles-")).ready).toBe(true);
  });

  it("a node with several resources is only ready when all of them are", () => {
    const s = summarizeTextureUpgrade(diag([["body", "textured"], ["body", "pending"]]));
    expect(s.byNode.body).toBe("pending");
  });
});
