import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HERO_COURIER_WHEEL_POSES,
  HERO_COURIER_WHEEL_RADIUS,
  TRAFFIC_FLEET_KINDS,
  buildHeroCourierBodySlots,
  buildHeroCourierGlazingSpec,
  buildHeroCourierRigNode,
  buildHeroCourierWheelNode,
  buildHeroCourierWheelSlots,
  buildProceduralTrafficFleet,
  trafficFleetMaterials
} from "../../../examples/drift-and-deliver-port/vehicles";
import {
  buildDropoffParcelKioskNode,
  courierGlazingMaterial,
  dropoffKioskPose,
  heroCourierMaterials
} from "../../../examples/drift-and-deliver-port/art/proceduralModels";

const portDir = resolve(__dirname, "../../../examples/drift-and-deliver-port");
const showcaseDir = resolve(__dirname, "../../../apps/showcase-drift-and-deliver-port");

describe("harbor drift procedural multi-material hero car & 7-class harbor fleet", () => {
  it("builds a smooth-normal multi-material widebody kei-van / hot-hatch aligned to +Z forward and grounded on 4 wheels", () => {
    const slots = buildHeroCourierBodySlots();
    const materials = heroCourierMaterials();
    const usedSlots = new Set(slots.map((s) => s.materialIndex));
    expect(usedSlots.size).toBeGreaterThanOrEqual(8);
    for (const idx of usedSlots) {
      expect(materials[idx]).toBeDefined();
    }

    // Slot 0 is the lofted smooth-normal widebody coachwork fuselage: vertex normals vary smoothly across shared vertices
    const fuselage = slots[0]!.mesh;
    let nonCollinearTris = 0;
    for (let t = 0; t < fuselage.indices.length; t += 3) {
      const i0 = fuselage.indices[t]! * 3;
      const i1 = fuselage.indices[t + 1]! * 3;
      const dot =
        fuselage.normals[i0]! * fuselage.normals[i1]! +
        fuselage.normals[i0 + 1]! * fuselage.normals[i1 + 1]! +
        fuselage.normals[i0 + 2]! * fuselage.normals[i1 + 2]!;
      if (dot < 0.995) nonCollinearTris += 1;
    }
    expect(nonCollinearTris).toBeGreaterThan(20);

    // Combined body + 4 wheels bounds match FOOTPRINT (+Z forward, length > width, grounded at y = 0)
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let tris = 0;
    for (const s of slots) {
      tris += s.mesh.indices.length / 3;
      for (let i = 0; i < s.mesh.positions.length; i += 3) {
        for (let k = 0; k < 3; k += 1) {
          min[k] = Math.min(min[k]!, s.mesh.positions[i + k]!);
          max[k] = Math.max(max[k]!, s.mesh.positions[i + k]!);
        }
      }
    }
    expect(min[1]!).toBeGreaterThanOrEqual(0);
    for (const w of HERO_COURIER_WHEEL_POSES) {
      for (const s of buildHeroCourierWheelSlots(w.side)) {
        tris += s.mesh.indices.length / 3;
        for (let i = 0; i < s.mesh.positions.length; i += 3) {
          const wx = s.mesh.positions[i]! + w.ox;
          const wy = s.mesh.positions[i + 1]! + w.oy;
          const wz = s.mesh.positions[i + 2]! + w.oz;
          min[0] = Math.min(min[0]!, wx);
          min[1] = Math.min(min[1]!, wy);
          min[2] = Math.min(min[2]!, wz);
          max[0] = Math.max(max[0]!, wx);
          max[1] = Math.max(max[1]!, wy);
          max[2] = Math.max(max[2]!, wz);
        }
      }
    }
    const width = max[0]! - min[0]!;
    const length = max[2]! - min[2]!;
    expect(length).toBeGreaterThan(width);
    expect(width).toBeGreaterThan(1.8);
    expect(width).toBeLessThan(2.15);
    expect(length).toBeGreaterThan(4.1);
    expect(length).toBeLessThan(4.55);
    expect(min[1]!).toBeCloseTo(0, 2);
    expect(HERO_COURIER_WHEEL_RADIUS).toBeCloseTo(0.34, 2);
    expect(tris).toBeLessThanOrEqual(40_000);
  });

  it("mounts WebGPU-safe physical glazing with castShadow: false and ZYX default / YXZ shift rotation order", () => {
    const glazingMat = courierGlazingMaterial();
    expect(glazingMat.opacity).toBeCloseTo(0.42, 2);
    expect(glazingMat.roughness).toBeCloseTo(0.04, 2);
    expect(glazingMat.clearcoat).toBe(1);
    expect(glazingMat.ior).toBeCloseTo(1.5, 2);
    expect(buildHeroCourierGlazingSpec().positions.length).toBeGreaterThan(60);

    const origRigJson = buildHeroCourierRigNode("car-rig-orig", false).toJSON();
    expect(origRigJson.rotationOrder).toBe("ZYX");

    const rigJson = buildHeroCourierRigNode("car-rig", true, "YXZ").toJSON();
    expect(rigJson.rotationOrder).toBe("YXZ");
    const glazingChild = rigJson.children.find((c) => "name" in c && c.name === "car-rig-glazing");
    expect(glazingChild).toBeDefined();
    expect(glazingChild && "castShadow" in glazingChild ? glazingChild.castShadow : undefined).toBe(false);

    const wheelJson = buildHeroCourierWheelNode("courier-wheel-fl", -1, true).toJSON();
    expect(wheelJson.rotationOrder).toBe("YXZ");
    expect(wheelJson.children.length).toBe(4);
  });

  it("builds 7 multi-material harbor fleet classes (including truck) with clearcoat paint, dark cabin glass, rubber tires, alloy rims, headlamps & tail-lamps", () => {
    expect(TRAFFIC_FLEET_KINDS).toEqual(["sedan", "hatch", "van", "truck", "taxi", "bus", "cruiser"]);
    const fleetMats = trafficFleetMaterials();
    expect(fleetMats.body.clearcoat ?? 0).toBeGreaterThan(0.8);
    expect(fleetMats.glass.clearcoat).toBe(1);
    expect(fleetMats.glass.opacity ?? 1).toBeLessThan(0.9);
    expect(fleetMats.trim.metallic ?? 0).toBeGreaterThan(0.8);
    expect(fleetMats.rubber.roughness ?? 0).toBeGreaterThan(0.7);
    expect(fleetMats.head.emissiveIntensity ?? 0).toBeGreaterThan(1.5);
    expect(fleetMats.tail.emissiveIntensity ?? 0).toBeGreaterThan(1.5);

    const sampleTraffic = Array.from({ length: 28 }, (_, i) => ({ x: i * 10, z: 0, yaw: 0 }));
    const fleet = buildProceduralTrafficFleet(sampleTraffic, true);
    expect(fleet.groups.length).toBe(7);
    expect(fleet.nodes.length).toBe(42);
    for (const g of fleet.groups) {
      expect(g.layerIds).toEqual([
        `traffic-${g.kind}-body`,
        `traffic-${g.kind}-glass`,
        `traffic-${g.kind}-rubber`,
        `traffic-${g.kind}-trim`,
        `traffic-${g.kind}-head`,
        `traffic-${g.kind}-tail`
      ]);
    }

    const kiosk = buildDropoffParcelKioskNode("dropoff-kiosk").toJSON();
    expect(kiosk.children.length).toBe(2);
    expect(dropoffKioskPose(null).y).toBe(-60);
    expect(dropoffKioskPose({ x: 30, z: 120 }).x).toBeCloseTo(38.6, 2);
  });

  it("mounts zero Meshy GLBs across look.ts, props.ts, main.ts, models.ts, and aura-assets.ts", () => {
    for (const file of ["look.ts", "props.ts", "main.ts", "models.ts"]) {
      const src = readFileSync(resolve(portDir, file), "utf8");
      expect(src).not.toMatch(/\binstances\.model\s*\(/);
      expect(src).not.toMatch(/\bstudioGlass\s*\(/);
      expect(src).not.toMatch(/\.glb\b/i);
    }
    const auraAssets = readFileSync(resolve(showcaseDir, "src/aura-assets.ts"), "utf8");
    expect(auraAssets).not.toMatch(/\.glb\b/i);
    expect(existsSync(resolve(portDir, "assets/models/courier.glb"))).toBe(false);
    expect(existsSync(resolve(portDir, "assets/models/hypercar.glb"))).toBe(false);
  });
});
