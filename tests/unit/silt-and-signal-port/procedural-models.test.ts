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

    // 10/10 character & skiff quality gate: smooth high-poly subdivided meshes, linear vertex gradients + cavity AO,
    // contrasting cloth/leather/brass PBR finishes, and crouched angled surf stance (non-collinear front-left / back-right boots)
    expect(DESERT_MAT.sheenTerracottaBanner.roughness).toBeCloseTo(0.84, 2);
    expect(DESERT_MAT.leatherSaddle.roughness).toBeCloseTo(0.62, 2);
    expect(DESERT_MAT.anisotropicBrass.roughness).toBeCloseTo(0.24, 2);
    expect(DESERT_MAT.anisotropicBrass.metalness).toBeGreaterThanOrEqual(0.85);
    expect(DESERT_MAT.goldEmbroideryTrim.metalness).toBeGreaterThanOrEqual(0.85);

    const sumVertsAndColors = (node: JsonNode): { verts: number; coloredVerts: number; minShade: number; maxShade: number } => {
      let verts = 0, coloredVerts = 0, minShade = Infinity, maxShade = -Infinity;
      const g = node.geometry?.custom ?? node.geometry;
      if (g?.positions) {
        const v = Math.floor(g.positions.length / 3);
        verts += v;
        if (g.colors && g.colors.length >= v * 4) {
          coloredVerts += v;
          for (let i = 0; i < v * 4; i += 4) {
            const lum = (g.colors[i] + g.colors[i + 1] + g.colors[i + 2]) / 3;
            if (lum < minShade) minShade = lum;
            if (lum > maxShade) maxShade = lum;
          }
        }
      }
      if (Array.isArray(node.children)) {
        for (const c of node.children) {
          const sub = sumVertsAndColors(c);
          verts += sub.verts;
          coloredVerts += sub.coloredVerts;
          if (sub.minShade < minShade) minShade = sub.minShade;
          if (sub.maxShade > maxShade) maxShade = sub.maxShade;
        }
      }
      return { verts, coloredVerts, minShade, maxShade };
    };

    const rigStats = sumVertsAndColors(rig);
    expect(rigStats.verts).toBeGreaterThan(8000);
    expect(rigStats.coloredVerts).toBe(rigStats.verts);
    expect(rigStats.maxShade - rigStats.minShade).toBeGreaterThan(0.25);

    const skiffStats = sumVertsAndColors(skiff);
    expect(skiffStats.verts).toBeGreaterThan(4500);
    expect(skiffStats.coloredVerts).toBe(skiffStats.verts);
    expect(skiffStats.maxShade - skiffStats.minShade).toBeGreaterThan(0.2);

    // Verify rider-stance spans fore-aft across the board in an athletic angled surf stance rather than standing at one Z line
    const stanceNode = (rig.children as JsonNode[]).find((c) => c.name === "rider-stance");
    expect(stanceNode).toBeDefined();
    let minZ = Infinity, maxZ = -Infinity;
    const collectZ = (n: JsonNode): void => {
      const g = n.geometry?.custom ?? n.geometry;
      if (g?.positions) {
        for (let i = 2; i < g.positions.length; i += 3) {
          const z = g.positions[i];
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
      }
      if (Array.isArray(n.children)) for (const c of n.children) collectZ(c);
    };
    collectZ(stanceNode!);
    expect(minZ).toBeLessThan(-0.32);
    expect(maxZ).toBeGreaterThan(0.28);

    // Rear-3/4 chase-camera silhouette readability check: project world-offset rig & skiff vertices onto the rear-3/4 chase frustum
    const projectRear3Q = (pt: readonly [number, number, number]): { x: number; y: number } => {
      const eye = [-2.6, 2.85, 7.9] as const;
      const target = [0, 0.98, -14] as const;
      let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      let rx = -fz, rz = fx;
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
      const dx = pt[0] - eye[0], dy = pt[1] - eye[1], dz = pt[2] - eye[2];
      const cz = Math.max(0.2, dx * fx + dy * fy + dz * fz);
      const tHalf = Math.tan((62 * Math.PI) / 360);
      return {
        x: 0.5 + 0.5 * ((dx * rx + dz * rz) / (cz * tHalf * (16 / 9))),
        y: 0.5 - 0.5 * ((dx * ux + dy * uy + dz * uz) / (cz * tHalf))
      };
    };

    const boundsInScreen = (n: JsonNode, ox = 0, oy = 0, oz = 0): { minX: number; maxX: number; minY: number; maxY: number; maxWorldZ: number } => {
      const px = ox + (n.position?.[0] ?? 0);
      const py = oy + (n.position?.[1] ?? 0);
      const pz = oz + (n.position?.[2] ?? 0);
      let minSX = Infinity, maxSX = -Infinity, minSY = Infinity, maxSY = -Infinity, maxWZ = -Infinity;
      const g = n.geometry?.custom ?? n.geometry;
      if (g?.positions) {
        for (let i = 0; i < g.positions.length; i += 3) {
          const wx = px + g.positions[i], wy = py + g.positions[i + 1], wz = pz + g.positions[i + 2];
          if (wz > maxWZ) maxWZ = wz;
          const p = projectRear3Q([wx, wy, wz]);
          if (p.x < minSX) minSX = p.x;
          if (p.x > maxSX) maxSX = p.x;
          if (p.y < minSY) minSY = p.y;
          if (p.y > maxSY) maxSY = p.y;
        }
      }
      if (Array.isArray(n.children)) {
        for (const c of n.children) {
          const sub = boundsInScreen(c, px, py, pz);
          if (sub.minX < minSX) minSX = sub.minX;
          if (sub.maxX > maxSX) maxSX = sub.maxX;
          if (sub.minY < minSY) minSY = sub.minY;
          if (sub.maxY > maxSY) maxSY = sub.maxY;
          if (sub.maxWorldZ > maxWZ) maxWZ = sub.maxWorldZ;
        }
      }
      return { minX: minSX, maxX: maxSX, minY: minSY, maxY: maxSY, maxWorldZ: maxWZ };
    };

    const rigScreen = boundsInScreen(rig, 0, 0.22, 0);
    // At 8.4 m chase distance (17.95 m wide x 10.1 m tall 16:9 frustum), the ~1.01 m wide x ~1.45 m crouched wind-surfer
    // occupies > 5% viewport width and > 12% viewport height with trailing scarf ribbons extending > 0.9 m aft
    expect(rigScreen.maxX - rigScreen.minX).toBeGreaterThan(0.05);
    expect(rigScreen.maxY - rigScreen.minY).toBeGreaterThan(0.12);
    expect(rigScreen.maxWorldZ).toBeGreaterThan(0.9);

    // Skiff twin curved crescent outrigger fins span > 1.35 m laterally (scaled 1.15x) for an unmistakable glider silhouette
    let minSkiffZ = Infinity, maxSkiffZ = -Infinity;
    const collectSkiffLateral = (n: JsonNode): void => {
      const g = n.geometry?.custom ?? n.geometry;
      if (g?.positions) {
        for (let i = 2; i < g.positions.length; i += 3) {
          const z = g.positions[i];
          if (z < minSkiffZ) minSkiffZ = z;
          if (z > maxSkiffZ) maxSkiffZ = z;
        }
      }
      if (Array.isArray(n.children)) for (const c of n.children) collectSkiffLateral(c);
    };
    collectSkiffLateral(skiff);
    expect((maxSkiffZ - minSkiffZ) * 1.15).toBeGreaterThan(1.35);
  });
});
