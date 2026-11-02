import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createModelMatrix } from "../../../packages/engine/src/agent-api/sceneMath";
import { accessor, readGlb } from "../../../tools/aura-fc/glb.mjs";
import { checkRowBand, evaluateBands } from "../../../tools/look-metrics/region-luma.mjs";
import { fitCameraToAspect, fullTimeOrbitPose, hybridBroadcastPose } from "../../../apps/showcase-aura-fc-3d/src/game/camera";
import { MAIN_FLOOD_TOWER } from "../../../apps/showcase-aura-fc-3d/src/game/look";
import { fcQaCrops, projectBox, projectPoint, type QaCamera, type V3 } from "../../../apps/showcase-aura-fc-3d/src/game/qaCrops";
import { buildFcScene, FLOOD_TOWERS, mainFloodPosition } from "../../../apps/showcase-aura-fc-3d/src/game/scene";

/** GU47 E-I crop contract (lane g09): crops are named, normalised 0..1 and follow the camera. */
const NIGHT_VENUES = ["munich", "kyoto", "favela", "glacier"] as const;
const BROADCAST = { eye: [0, 11.5, 23.5] as const, target: [0, 0.9, -1] as const, fovDeg: 40, aspect: 16 / 9 };
const floodHead = (index: number): V3 => {
  const [x, z] = FLOOD_TOWERS[index]!;
  return [x * 0.94, mainFloodPosition()[1], z * 0.94];
};
const floodCrop = (cam: QaCamera, [x, y, z]: V3) =>
  projectBox(cam, [x - 1.2, y - 0.8, z - 1.2], [x + 1.2, y + 0.8, z + 1.2], "flood-bank");

describe("aura-fc-3d QA crops", () => {
  it("projects the camera target to the screen centre", () => {
    const c = projectPoint(BROADCAST, BROADCAST.target)!;
    expect(c[0]).toBeCloseTo(0.5, 5);
    expect(c[1]).toBeCloseTo(0.5, 5);
    expect(projectPoint(BROADCAST, [0, 11.5, 40])).toBeNull();
  });

  it("publishes valid named crops from the broadcast view; the crowd sits above the pitch", () => {
    const crops = fcQaCrops(BROADCAST, { x: 2, z: 1 }, [0, 0.21, 0]);
    const names = crops.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["player", "ball", "pitch", "crowd"]));
    for (const c of crops) {
      expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
      for (const v of [c.x, c.y, c.w, c.h]) expect(v).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1);
      expect(c.y + c.h).toBeLessThanOrEqual(1);
    }
    const by = Object.fromEntries(crops.map((c) => [c.name, c]));
    expect(by.crowd.y).toBeLessThan(by.pitch.y);
    expect(crops.length).toBeLessThanOrEqual(16);
  });

  it("the player crop moves with the player", () => {
    const a = fcQaCrops(BROADCAST, { x: -8, z: 0 }, [0, 0.2, 0]).find((c) => c.name === "player")!;
    const b = fcQaCrops(BROADCAST, { x: 8, z: 0 }, [0, 0.2, 0]).find((c) => c.name === "player")!;
    expect(b.x).toBeGreaterThan(a.x);
  });

  it("publishes the visible far-side partner when the main flood is out of frame", () => {
    const pose = fullTimeOrbitPose(0, false);
    const cam = { eye: pose.eye, target: pose.target, fovDeg: pose.fov, aspect: 16 / 9 };
    const main = mainFloodPosition();
    const other = floodHead(0);

    expect(floodHead(MAIN_FLOOD_TOWER)).toEqual(main);
    expect(floodCrop(cam, main)).toBeNull();
    const center = projectPoint(cam, other)!;
    expect(center[0]).toBeGreaterThan(0);
    expect(center[0]).toBeLessThan(1);
    expect(center[1]).toBeGreaterThan(0);
    expect(center[1]).toBeLessThan(1);
    const visible = floodCrop(cam, other);
    expect(visible).not.toBeNull();
    expect(fcQaCrops(cam, null, [0, 0.21, 0]).filter((c) => c.name === "flood-bank")).toEqual([visible]);
  });

  it.each(NIGHT_VENUES)("%s: the natural full-time crop geometrically overlaps the authored pylon head", (venue) => {
    const glb = readGlb("public/aura-assets/fcFloodlightPylonMeshy.636dc3fc.glb");
    const index = glb.json.meshes[0].primitives[0].attributes.POSITION;
    const { min, max } = glb.json.accessors[index];
    const { data } = accessor(glb, index);
    const node = buildFcScene(venue).toJSON().nodes.find((n) => n.kind === "model" && n.name === "flood-0");
    expect(node?.kind).toBe("model");
    if (!node || node.kind !== "model") throw new Error("flood-0 is missing");
    const matrix = createModelMatrix(node, { min, max }, true);
    const pose = fullTimeOrbitPose(0, false);
    const cam = { eye: pose.eye, target: pose.target, fovDeg: pose.fov, aspect: 16 / 9 };
    const crop = fcQaCrops(cam, null, [0, 0.21, 0]).find((c) => c.name === "flood-bank");
    expect(crop).toBeDefined();
    if (!crop) throw new Error("full-time flood crop is missing");
    let headVertices = 0, verticesInCrop = 0;
    for (let i = 0; i < data.length; i += 3) {
      const x = data[i]!, y = data[i + 1]!, z = data[i + 2]!;
      const world: V3 = [
        matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
        matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
        matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!
      ];
      if (world[1] < 11.2) continue;
      const point = projectPoint(cam, world);
      if (!point) continue;
      headVertices++;
      if (point[0] >= crop.x && point[0] <= crop.x + crop.w && point[1] >= crop.y && point[1] <= crop.y + crop.h) verticesInCrop++;
    }
    expect(headVertices).toBeGreaterThan(0);
    // Geometric feasibility only: this does not prove that the model is loaded,
    // unoccluded, or visible in a genuinely presented browser frame.
    expect(verticesInCrop / headVertices).toBeGreaterThan(0.75);
  });

  it.each([0, 2, 3])("projects alternate tower %i from its actual scene position", (index) => {
    const head = floodHead(index);
    const cam: QaCamera = { eye: [0, 14, 0], target: head, fovDeg: 34, aspect: 16 / 9 };
    const expected = floodCrop(cam, head);
    expect(floodCrop(cam, mainFloodPosition())).toBeNull();
    expect(expected).not.toBeNull();
    expect(fcQaCrops(cam, null, [0, 0.21, 0]).filter((c) => c.name === "flood-bank")).toEqual([expected]);
  });

  it("keeps the main flood crop when a larger alternate is also in frame", () => {
    const cam: QaCamera = { eye: [-20, 12, 40], target: [0, 12, -24], fovDeg: 70, aspect: 16 / 9 };
    const main = floodCrop(cam, mainFloodPosition())!;
    const other = floodCrop(cam, floodHead(0))!;
    expect(main).not.toBeNull();
    expect(other).not.toBeNull();
    expect(other.w * other.h).toBeGreaterThan(main.w * main.h);
    expect(fcQaCrops(cam, null, [0, 0.21, 0]).filter((c) => c.name === "flood-bank")).toEqual([main]);
  });

  it("selects the largest visible alternate rather than a clipped sliver", () => {
    const pose = fullTimeOrbitPose(4.1, false);
    const cam = { eye: pose.eye, target: pose.target, fovDeg: pose.fov, aspect: 16 / 9 };
    const far = floodCrop(cam, floodHead(0))!;
    const near = floodCrop(cam, floodHead(2))!;
    expect(floodCrop(cam, mainFloodPosition())).toBeNull();
    expect(far).not.toBeNull();
    expect(near).not.toBeNull();
    expect(near.x).toBe(0);
    expect(far.w * far.h).toBeGreaterThan(near.w * near.h);
    expect(fcQaCrops(cam, null, [0, 0.21, 0]).filter((c) => c.name === "flood-bank")).toEqual([far]);
  });

  it("keeps a partially visible alternate clamped to the viewport", () => {
    const head = floodHead(0);
    const cam: QaCamera = { eye: [0, 12, 0], target: [-12, 12, head[2]], fovDeg: 34, aspect: 16 / 9 };
    const visible = floodCrop(cam, head)!;
    expect(floodCrop(cam, mainFloodPosition())).toBeNull();
    expect(visible).not.toBeNull();
    expect(visible.x).toBe(0);
    expect(visible.w).toBeGreaterThan(0);
    expect(fcQaCrops(cam, null, [0, 0.21, 0]).filter((c) => c.name === "flood-bank")).toEqual([visible]);
  });

  it("uses the fitted portrait camera to project an alternate head", () => {
    const pose = fullTimeOrbitPose(0, false);
    const aspect = 390 / 844;
    const fit = fitCameraToAspect(pose.eye, pose.target, pose.fov, aspect);
    const cam = { eye: fit.eye, target: pose.target, fovDeg: fit.fov, aspect };
    const visible = floodCrop(cam, floodHead(0));
    expect(floodCrop(cam, mainFloodPosition())).toBeNull();
    expect(visible).not.toBeNull();
    expect(fcQaCrops(cam, null, [0, 0.21, 0]).filter((c) => c.name === "flood-bank")).toEqual([visible]);
  });

  it("omits the flood crop when all heads are outside the kickoff view", () => {
    const pose = hybridBroadcastPose(0, 0, 0);
    const cam = { eye: pose.eye, target: pose.target, fovDeg: pose.fov, aspect: 16 / 9 };
    expect(FLOOD_TOWERS.map((_, index) => floodCrop(cam, floodHead(index)))).toEqual([null, null, null, null]);
    const crops = fcQaCrops(cam, null, [0, 0.21, 0]);
    expect(crops.find((c) => c.name === "pitch")).toEqual({ name: "pitch", x: 0.1743, y: 0.4838, w: 0.6514, h: 0.4346 });
    expect(crops.some((c) => c.name === "flood-bank")).toBe(false);
  });

  it("keeps a per-shot missing-crop miss for all four affected venues and both steady shots", () => {
    const bands = JSON.parse(readFileSync("evidence/game-upgrades-47/aura-fc-3d/luma-bands.json", "utf8"));
    const pose = hybridBroadcastPose(0, 0, 0);
    const cam = { eye: pose.eye, target: pose.target, fovDeg: pose.fov, aspect: 16 / 9 };
    const names = fcQaCrops(cam, null, [0, 0.21, 0]).map((c) => c.name);
    expect(names).not.toContain("flood-bank");
    // Synthetic rows exercise the gate contract only; they are not captured
    // luminance evidence, and a full-time shot cannot fill a kickoff miss.
    const rows = NIGHT_VENUES.flatMap((venue) => [25, 60].map((sec) => ({
      slug: "aura-fc-3d", target: `aura-fc-3d--${venue}`, variant: venue,
      id: `settle-${sec}s`, crops: Object.fromEntries(names.map((name) => [name, {}]))
    })));
    const results = evaluateBands(rows, bands);
    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(result.misses).toContainEqual(expect.objectContaining({
        region: "crop:flood-bank", metric: "*", reason: "crop not published at this shot"
      }));
    }
  });

  it.each(NIGHT_VENUES)("%s: the unchanged flood p95 threshold is inclusive at 230", (venue) => {
    const bands = JSON.parse(readFileSync("evidence/game-upgrades-47/aura-fc-3d/luma-bands.json", "utf8"));
    const flood = bands.variants[venue].crops["flood-bank"];
    expect(flood.p95).toEqual([230, null]);
    const onlyFlood = { crops: { "flood-bank": flood } };
    expect(checkRowBand({ crops: { "flood-bank": { p95: 229 } } }, onlyFlood))
      .toContainEqual(expect.objectContaining({ region: "crop:flood-bank", metric: "p95", value: 229, min: 230 }));
    expect(checkRowBand({ crops: { "flood-bank": { p95: 230 } } }, onlyFlood)).toEqual([]);
  });

  it("omits the flood crop when every tower is behind the camera", () => {
    const cam: QaCamera = { eye: [0, 12, -100], target: [0, 12, -110], fovDeg: 34, aspect: 16 / 9 };
    expect(FLOOD_TOWERS.map((_, index) => projectPoint(cam, floodHead(index)))).toEqual([null, null, null, null]);
    expect(fcQaCrops(cam, null, [0, 0.21, 0]).some((c) => c.name === "flood-bank")).toBe(false);
  });
});
