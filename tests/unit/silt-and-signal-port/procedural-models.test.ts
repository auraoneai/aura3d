import { describe, expect, it } from "vitest";
import { buildWorld } from "../../../examples/silt-and-signal-port/world";
import {
  DESERT_INST_MAT,
  DESERT_MAT,
  createBoardSailNode,
  createCourierMaterialOverrides,
  createDesertSurferRigNode,
  createSandSkiffNode,
  ringGateSpec,
  strataMesaMaterial
} from "../../../examples/silt-and-signal-port/art/proceduralModels";

type JsonNode = Record<string, any>;
const chapterNodes = (chapter: number, look: "inked" | "original" = "inked"): JsonNode[] =>
  (buildWorld(chapter, { look }).scene as unknown as { toJSON(): { nodes: JsonNode[] } }).toJSON().nodes;

describe("WP-28 Duneglide multi-material procedural art overhaul", () => {
  it("mounts ZERO external GLB model or instances.model nodes across all 7 chapters and uses procedural articulated surfer rig", { timeout: 60_000 }, () => {
    for (let chapter = 0; chapter <= 6; chapter++) {
      for (const look of ["inked", "original"] as const) {
        const list = chapterNodes(chapter, look);
        const modelNodes = list.filter((n) => n.kind === "model");
        expect(modelNodes, `ch${chapter} ${look} model nodes`).toEqual([]);
        const instancedModels = list.filter((n) => n.kind === "instances" && n.instanceSource === "model");
        expect(instancedModels, `ch${chapter} ${look} instanced models`).toEqual([]);
        const rider = list.find((n) => n.name === "rider");
        expect(rider?.runtime?.id, `ch${chapter} ${look} rider runtime id`).toBe("rider");
      }
    }
    const surferJson = JSON.stringify(createDesertSurferRigNode({ inked: true }).toJSON());
    for (const partId of [
      "rider-pelvis",
      "rider-torso",
      "rider-head",
      "rider-arm-lead",
      "rider-arm-trail",
      "rider-scarf",
      "rider-scarf-tip"
    ]) {
      expect(surferJson).toContain(`"id":"${partId}"`);
    }
  });

  it("applies desert cloak sheen and warm sun-rim materialOverrides on courier in inked mode without replacing textures", () => {
    const overrides = createCourierMaterialOverrides(true);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]?.sheen).toBeGreaterThan(0.5);
    expect(overrides[0]?.rim?.intensity).toBeGreaterThan(0.5);
    expect(overrides[0]?.replaceTextures).toBeUndefined();
    expect(createCourierMaterialOverrides(false)).toEqual([]);
  });

  it("enforces clearcoat: 0 and sheen: 0 on every instanced batch with > 16 instances", { timeout: 60_000 }, () => {
    for (const [key, spec] of Object.entries(DESERT_INST_MAT)) {
      expect(spec.clearcoat, `DESERT_INST_MAT.${key} clearcoat`).toBe(0);
      expect(spec.sheen, `DESERT_INST_MAT.${key} sheen`).toBe(0);
    }
    for (const chapter of [0, 1]) {
      const list = chapterNodes(chapter, "inked");
      for (const node of list) {
        if (Array.isArray(node.instances) && node.instances.length > 16) {
          expect(node.material?.clearcoat ?? 0, `${node.name} clearcoat`).toBe(0);
          expect(node.material?.sheen ?? 0, `${node.name} sheen`).toBe(0);
        }
      }
    }
  });

  it("uses material.physical for solar beacon glass (castShadow: false) and pairs strataMesaMaterial with WGSL", () => {
    expect(DESERT_MAT.beaconSolarGlass.opacity).toBeCloseTo(0.46, 3);
    expect(DESERT_MAT.beaconSolarGlass.clearcoat).toBe(1);
    expect(DESERT_MAT.beaconSolarGlass.ior).toBeCloseTo(1.52, 3);
    expect(DESERT_MAT.beaconSolarGlass.transmission).toBeUndefined();

    const mesaMat = strataMesaMaterial(false);
    expect(mesaMat.kind).toBe("custom");
    expect(mesaMat.custom?.wgsl?.vertex).toContain("@vertex");
    expect(mesaMat.custom?.wgsl?.fragment).toContain("@fragment");

    const skiff = createSandSkiffNode({ inked: true, scale: 1.15 }).toJSON() as JsonNode;
    expect(skiff.name).toBe("board");
    expect(skiff.runtime?.id).toBe("board");
    const slotCount = Array.isArray(skiff.children)
      ? skiff.children.length
      : Array.isArray(skiff.materials)
        ? skiff.materials.length
        : 0;
    expect(slotCount).toBeGreaterThanOrEqual(5);

    const ring = ringGateSpec();
    expect(ring.positions.length).toBeGreaterThan(300);
    expect(ring.indices?.length ?? 0).toBeGreaterThan(300);
  });

  it("mounts sculpted multi-material Chapter-0 landmarks and stratified red-rock mesas", () => {
    const ch0 = chapterNodes(0, "inked");
    for (const landmark of [
      "gatehouse-neri",
      "aqueduct-east",
      "aqueduct-west",
      "canyon-gate",
      "stall-0",
      "watchtower-0",
      "banner-0",
      "pillar-0",
      "mesa-spire-0"
    ]) {
      const found = ch0.find((n) => n.name === landmark);
      expect(found, `missing ${landmark}`).toBeDefined();
      if (Array.isArray(found?.children)) {
        expect(found.children.length, `${landmark} material children`).toBeGreaterThanOrEqual(3);
        for (const child of found.children) {
          expect(child.castShadow, `${landmark} child castShadow`).toBe(false);
        }
      } else {
        expect(found?.castShadow, `${landmark} castShadow`).toBe(false);
      }
    }
  });

  it("sculpts the upgraded streamlined hover-skiff and signal-courier hero rig with yoke-aligned arms, hood/goggles, satchel, and radio pack", () => {
    const skiff = createSandSkiffNode({ inked: true, scale: 1.15 }).toJSON() as JsonNode;
    expect(Array.isArray(skiff.children)).toBe(true);
    expect(skiff.children.length).toBeGreaterThanOrEqual(7);

    const sail = createBoardSailNode().toJSON() as JsonNode;
    expect(sail.runtime?.id).toBe("board-sail");
    expect(Array.isArray(sail.children) ? sail.children.length : 1).toBeGreaterThanOrEqual(3);

    expect(DESERT_MAT.goggleLens.clearcoat).toBeGreaterThan(0.8);
    expect(DESERT_MAT.skiffLacquer.clearcoat).toBeGreaterThan(0.25);
    expect(DESERT_MAT.skiffSandstoneHull.roughness).toBeCloseTo(0.56, 2);

    const rig = createDesertSurferRigNode({ inked: true }).toJSON() as JsonNode;
    const countMaterialMeshes = (node: JsonNode): number => {
      let count = node.geometry ? 1 : 0;
      if (Array.isArray(node.children)) {
        for (const c of node.children) count += countMaterialMeshes(c);
      }
      return count;
    };
    expect(countMaterialMeshes(rig)).toBeGreaterThanOrEqual(24);

    const findById = (node: JsonNode, id: string): JsonNode | undefined => {
      if (node.runtime?.id === id) return node;
      if (Array.isArray(node.children)) {
        for (const c of node.children) {
          const hit = findById(c, id);
          if (hit) return hit;
        }
      }
      return undefined;
    };
    const leadArm = findById(rig, "rider-arm-lead");
    const trailArm = findById(rig, "rider-arm-trail");
    expect(leadArm?.position?.[0]).toBeLessThan(-0.15);
    expect(trailArm?.position?.[0]).toBeGreaterThan(0.15);
    expect(leadArm?.position?.[0]).toBeCloseTo(-(trailArm?.position?.[0] ?? 0), 3);
  });
});
