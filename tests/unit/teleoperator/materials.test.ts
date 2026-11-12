import { describe, expect, it } from "vitest";
import { COMMUTER_MATERIALS, computeUrbanCommuterPose } from "../../../apps/showcase-teleoperator/src/art/proceduralModels";
import { MUTED_CLEARCOAT, POD_LIVERY, POD_MATERIALS, RIVAL_CHAMPAGNE, TRUCK_STEEL, carMaterialOverrides } from "../../../apps/showcase-teleoperator/src/scene";

describe("grid dispatch GD-11 vehicle & commuter materials", () => {
  it("every pod override targets one of the canonical robotaxi material slots", () => {
    const canonicalSlots = new Set(["veh-body", "veh-glass", "veh-trim", "veh-cabin"]);
    for (const o of POD_MATERIALS) for (const t of [o.target].flat()) expect(canonicalSlots.has(String(t)), String(t)).toBe(true);
  });

  it("pearl clearcoat pod and dark glass; nothing replaces a whole model", () => {
    expect(POD_MATERIALS.find((o) => o.target === "veh-body")).toMatchObject({ clearcoat: 1 });
    expect(POD_MATERIALS.find((o) => o.target === "veh-glass")!.color).toBe("#0d1218");
    for (const o of POD_MATERIALS) expect(o.target).toBeDefined();
  });

  it("player pod livery keeps clearcoat without replacing target colours", () => {
    for (const o of POD_LIVERY) {
      expect(o.target).toBeUndefined();
      expect(o.color).toBeUndefined();
      expect(o.clearcoat).toBeGreaterThan(0);
    }
  });

  it("routing: clearcoat livery on the player pod, pearl on the rival pod, steel truck, champagne Kaya, muted clearcoat traffic, cable car untouched", () => {
    expect(carMaterialOverrides("gridCruiser", "player")).toBe(POD_LIVERY);
    expect(carMaterialOverrides("gridRivalCruiser", "rival", 0)).toBe(POD_MATERIALS);
    expect(carMaterialOverrides("gridTruck", "player")).toBe(TRUCK_STEEL);
    expect(carMaterialOverrides("gridCoupe", "rival", 1)).toBe(RIVAL_CHAMPAGNE);
    expect(carMaterialOverrides("gridSedan", "traffic")).toBe(MUTED_CLEARCOAT);
    expect(carMaterialOverrides("gridCablecar", "rival", 3)).toBeUndefined();
  });

  it("procedural Urban Commuter Rig uses 10 multi-material physical/fabric/emissive slots and animates deterministically", () => {
    expect(COMMUTER_MATERIALS.length).toBeGreaterThanOrEqual(8);
    const hailA = computeUrbanCommuterPose({ time: 0.2, mode: "hail", walkProgress: 0, motionOk: true });
    const hailB = computeUrbanCommuterPose({ time: 0.7, mode: "hail", walkProgress: 0, motionOk: true });
    expect(hailA.armRRot[2]).not.toBeCloseTo(hailB.armRRot[2], 3);
    const staticHailA = computeUrbanCommuterPose({ time: 0.2, mode: "hail", walkProgress: 0, motionOk: false });
    const staticHailB = computeUrbanCommuterPose({ time: 1.4, mode: "hail", walkProgress: 0, motionOk: false });
    expect(staticHailA).toEqual(staticHailB);
    const stride = computeUrbanCommuterPose({ time: 0.4, mode: "board", walkProgress: 0.35, motionOk: true });
    expect(stride.shinLRot[0]).toBeGreaterThanOrEqual(0);
    expect(stride.shinRRot[0]).toBeGreaterThanOrEqual(0);
  });
});
