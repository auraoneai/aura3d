import { describe, expect, it } from "vitest";
import { buildParkScene, DEFAULT_SCENE_CONTEXT, WALL_NAME_THETA, wallNameNode } from "../../../apps/showcase-aura-diamond-3d/src/scene";
import { fencePoint, fenceRadius, FOUL_DEG, PARKS, PARK_ORDER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const nodesOf = (park: keyof typeof PARKS, variant: "gu47" | "original"): any[] =>
  (buildParkScene(PARKS[park], { ...DEFAULT_SCENE_CONTEXT, variant }).toJSON() as any).nodes;

describe("aura-diamond park name on the wall (DIA-V2)", () => {
  it("paints each park's own name in SDF letters, GU47 only", () => {
    for (const p of PARK_ORDER) {
      const gu = nodesOf(p, "gu47").filter((n) => n.name === "wall-park-name");
      expect(gu).toHaveLength(1);
      expect(gu[0].text3D.backend).toBe("sdf");
      expect(gu[0].text3D.text).toBe(PARKS[p].name);
      expect(gu[0].text3D.unsupportedCharacters).toEqual([]);
      expect(nodesOf(p, "original").some((n) => n.name === "wall-park-name")).toBe(false);
    }
  });

  it("fits on one wall segment, inside the wall height, in front of the wall face and facing home", () => {
    for (const p of PARK_ORDER) {
      const park = PARKS[p];
      const n: any = wallNameNode(park).toJSON();
      const pts: number[][] = n.geometry.positions;
      const xs = pts.map((q) => q[0]!);
      const ys = pts.map((q) => q[1]!);
      const width = Math.max(...xs) - Math.min(...xs);
      const segDeg = (2 * FOUL_DEG) / park.fenceSegments;
      const segLen = 2 * fenceRadius(park, WALL_NAME_THETA) * Math.tan((segDeg * Math.PI) / 360);
      expect(width).toBeLessThan(segLen - 0.3);
      expect(n.position[1]).toBeGreaterThanOrEqual(0);
      expect(n.position[1] + Math.max(...ys)).toBeLessThanOrEqual(park.wallH);
      // Glyph centre (local width/2) lies on the wall centre line pulled 0.32 m toward home.
      const yaw = n.rotation[1];
      const cx = n.position[0] + (width / 2) * Math.cos(yaw);
      const cz = n.position[2] - (width / 2) * Math.sin(yaw);
      const face = fencePoint(park, WALL_NAME_THETA, 0, -0.32);
      expect(Math.hypot(cx - face[0], cz - face[2])).toBeLessThan(0.05);
      const normal = [Math.sin(yaw), Math.cos(yaw)];
      const toHome = [-face[0], -face[2]];
      expect(normal[0]! * toHome[0]! + normal[1]! * toHome[1]!).toBeGreaterThan(0.99 * Math.hypot(toHome[0]!, toHome[1]!));
    }
  });
});

describe("aura-diamond Dome infield reflections (DIA-M2)", () => {
  it("mounts one box probe in the GU47 Dome only, over a sealed 0.42-roughness infield", () => {
    for (const p of PARK_ORDER) {
      const probesIn = nodesOf(p, "gu47").filter((n) => n.kind === "probe");
      expect(probesIn).toHaveLength(p === "dome" ? 1 : 0);
    }
    const probe = nodesOf("dome", "gu47").find((n) => n.kind === "probe");
    expect(probe.probe).toBe("reflection");
    expect(probe.options.box.min[1]).toBeLessThan(0);
    expect(probe.options.update).toBe("once");
    expect(nodesOf("dome", "original").some((n) => n.kind === "probe")).toBe(false);
    const json = JSON.stringify(nodesOf("dome", "gu47"));
    expect(json).toContain('"roughness":0.42');
  });
});
