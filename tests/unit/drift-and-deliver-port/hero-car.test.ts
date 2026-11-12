import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
  buildProceduralTrafficFleet
} from "../../../examples/drift-and-deliver-port/vehicles";
import {
  buildDropoffParcelKioskNode,
  courierGlazingMaterial,
  dropoffKioskPose,
  heroCourierMaterials
} from "../../../examples/drift-and-deliver-port/art/proceduralModels";

const portDir = resolve(__dirname, "../../../examples/drift-and-deliver-port");

describe("gridlock courier procedural multi-material hero car & fleet (WP-22)", () => {
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

  it("mounts WebGPU-safe physical glazing with castShadow: false and YXZ wheel & body rotation order", () => {
    const glazingMat = courierGlazingMaterial();
    expect(glazingMat.opacity).toBeCloseTo(0.42, 2);
    expect(glazingMat.roughness).toBeCloseTo(0.04, 2);
    expect(glazingMat.clearcoat).toBe(1);
    expect(glazingMat.ior).toBeCloseTo(1.5, 2);
    expect(buildHeroCourierGlazingSpec().positions.length).toBeGreaterThan(60);

    const rigJson = buildHeroCourierRigNode("car-rig", true, "YXZ").toJSON();
    expect(rigJson.rotationOrder).toBe("YXZ");
    const glazingChild = rigJson.children.find((c) => "name" in c && c.name === "car-rig-glazing");
    expect(glazingChild).toBeDefined();
    expect(glazingChild && "castShadow" in glazingChild ? glazingChild.castShadow : undefined).toBe(false);

    const wheelJson = buildHeroCourierWheelNode("courier-wheel-fl", -1, true).toJSON();
    expect(wheelJson.rotationOrder).toBe("YXZ");
    expect(wheelJson.children.length).toBe(4);
  });

  it("builds 6 multi-material traffic fleet classes with clearcoat: 0, sheen: 0 and a sidewalk parcel kiosk", () => {
    expect(TRAFFIC_FLEET_KINDS).toEqual(["sedan", "hatch", "van", "taxi", "bus", "cruiser"]);
    const sampleTraffic = Array.from({ length: 18 }, (_, i) => ({ x: i * 10, z: 0, yaw: 0 }));
    const fleet = buildProceduralTrafficFleet(sampleTraffic, true);
    expect(fleet.groups.length).toBe(6);
    for (const node of fleet.nodes) {
      const json = node.toJSON();
      expect(json.material?.clearcoat ?? 0).toBe(0);
      expect(json.material?.sheen ?? 0).toBe(0);
    }

    const kiosk = buildDropoffParcelKioskNode("dropoff-kiosk").toJSON();
    expect(kiosk.children.length).toBe(2);
    expect(dropoffKioskPose(null).y).toBe(-60);
    expect(dropoffKioskPose({ x: 30, z: 120 }).x).toBeCloseTo(38.6, 2);
  });

  it("mounts zero static Meshy GLBs in look.ts, props.ts, and main.ts while keeping legacy disk files intact", () => {
    for (const file of ["look.ts", "props.ts", "main.ts"]) {
      const src = readFileSync(resolve(portDir, file), "utf8");
      expect(src).not.toMatch(/\binstances\.model\s*\(/);
      expect(src).not.toMatch(/\bcarModel\s*\(/);
      expect(src).not.toMatch(/\btrafficInstances\s*\(/);
      expect(src).not.toMatch(/\bstudioGlass\s*\(/);
    }
    const glbFile = resolve(portDir, "assets/models/courier.glb");
    const hash = createHash("sha256").update(readFileSync(glbFile)).digest("hex");
    const models = readFileSync(resolve(portDir, "models.ts"), "utf8");
    expect(models).toContain(`glb("courier.glb", "${hash}")`);
    expect(existsSync(resolve(portDir, "assets/models/hypercar.glb"))).toBe(false);
  });
});
