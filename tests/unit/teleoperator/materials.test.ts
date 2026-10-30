import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assets } from "../../../apps/showcase-teleoperator/src/aura-assets";
import { MUTED_CLEARCOAT, POD_MATERIALS, RIVAL_CHAMPAGNE, TRUCK_STEEL, carMaterialOverrides } from "../../../apps/showcase-teleoperator/src/scene";

/** Material names straight from the GLB JSON chunk (what `assets inspect` lists). */
function glbMaterials(url: string): string[] {
  const b = readFileSync(resolve(__dirname, "../../../public", url.replace(/^\//, "")));
  if (b.readUInt32LE(0) !== 0x46546c67) return [];
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8")) as { materials?: { name?: string }[] };
  return (json.materials ?? []).map((m) => m.name ?? "");
}

describe("grid dispatch GD-11 vehicle materials", () => {
  it("every pod override targets a material the robotaxi GLB really has", () => {
    const names = glbMaterials(assets.gridCruiser.url);
    if (names.length === 0) return; // LFS pointer checkout: nothing to compare
    for (const o of POD_MATERIALS) for (const t of [o.target].flat()) expect(names, String(t)).toContain(t);
  });

  it("pearl clearcoat pod and dark glass; nothing replaces a whole model", () => {
    expect(POD_MATERIALS.find((o) => o.target === "veh-body")).toMatchObject({ clearcoat: 1 });
    expect(POD_MATERIALS.find((o) => o.target === "veh-glass")!.color).toBe("#0d1218");
    for (const o of POD_MATERIALS) expect(o.target).toBeDefined();
  });

  it("routing: pod for both robotaxis, steel truck, champagne Kaya, muted clearcoat traffic, cable car untouched", () => {
    expect(carMaterialOverrides("gridCruiser", "player")).toBe(POD_MATERIALS);
    expect(carMaterialOverrides("gridRivalCruiser", "rival", 0)).toBe(POD_MATERIALS);
    expect(carMaterialOverrides("gridTruck", "player")).toBe(TRUCK_STEEL);
    expect(carMaterialOverrides("gridCoupe", "rival", 1)).toBe(RIVAL_CHAMPAGNE);
    expect(carMaterialOverrides("gridSedan", "traffic")).toBe(MUTED_CLEARCOAT);
    expect(carMaterialOverrides("gridCablecar", "rival", 3)).toBeUndefined();
  });
});
