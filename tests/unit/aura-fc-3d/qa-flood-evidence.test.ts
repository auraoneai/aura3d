import { describe, expect, it } from "vitest";
import { createCameraController } from "../../../packages/engine/src/agent-api/camera/CameraController";
import { createModelMatrix } from "../../../packages/engine/src/agent-api/sceneMath";
import { accessor, readGlb } from "../../../tools/aura-fc/glb.mjs";
import { fullTimeOrbitPose } from "../../../apps/showcase-aura-fc-3d/src/game/camera";
import { CLUB_ORDER } from "../../../apps/showcase-aura-fc-3d/src/game/content";
import { matrixBox, matrixProject, headTriangleMask, compareHeadControl } from "../../../apps/showcase-aura-fc-3d/src/game/qaFloodEvidence";
import { fcQaCrops, projectBox } from "../../../apps/showcase-aura-fc-3d/src/game/qaCrops";
import { buildFcScene, mainFloodPosition, FLOOD_TOWERS } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { createSim, makeRng } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import type { UserInputFrame } from "../../../apps/showcase-aura-fc-3d/src/game/types";
import { glMetaInPage } from "../../browser/game-luma-stats";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("FC separate flood-head evidence helpers", () => {
  it("independently projects actual head boxes through the engine presented matrix", () => {
    const pose = fullTimeOrbitPose(0, true);
    const cam = { eye: pose.eye, target: pose.target, fovDeg: pose.fov, aspect: 16 / 9 };
    const controller = createCameraController({ aspect: () => cam.aspect });
    controller.setPose({ position: pose.eye, target: pose.target, fov: pose.fov });
    controller.update(1 / 60, 1000);
    const vp = controller.evidence().viewProjection;
    expect(vp).toHaveLength(16);
    for (const [x, z] of FLOOD_TOWERS) {
      const [fx, fy, fz] = [x * 0.94, mainFloodPosition()[1], z * 0.94];
      const min = [fx - 1.2, fy - 0.8, fz - 1.2] as const;
      const max = [fx + 1.2, fy + 0.8, fz + 1.2] as const;
      expect(matrixBox(vp, min, max, "flood-bank")).toEqual(projectBox(cam, min, max, "flood-bank"));
    }
    expect(() => matrixProject([], [0, 0, 0])).toThrow();
  });

  it("rasterizes only the real head triangles inside the sampled rectangle", () => {
    const mask = headTriangleMask({
      positions: [-0.8, 0.1, 0, 0.8, 0.1, 0, 0, 0.9, 0, -0.8, -0.5, 0],
      indices: [0, 1, 2, 0, 1, 3],
      modelMatrix: IDENTITY, viewProjection: IDENTITY, minY: 0,
      canvas: { x: 0, y: 0, w: 20, h: 20 }, crop: { x: 5, y: 0, w: 10, h: 10 }
    });
    expect(mask.length).toBeGreaterThan(9);
    expect(mask.every((p) => p >= 0 && p < 100)).toBe(true);
    // The below-head triangle is excluded, not treated as a head pixel.
    expect(headTriangleMask({
      positions: [-0.8, -0.2, 0, 0.8, -0.2, 0, 0, -0.8, 0], indices: [0, 1, 2],
      modelMatrix: IDENTITY, viewProjection: IDENTITY, minY: 0,
      canvas: { x: 0, y: 0, w: 20, h: 20 }, crop: { x: 0, y: 0, w: 20, h: 20 }
    })).toEqual([]);
  });

  it.each(["munich", "kyoto", "favela", "glacier"] as const)(
    "%s: the full-time crop contains a rasterized mask from the real pylon head", (venue) => {
      const glb = readGlb("public/aura-assets/fcFloodlightPylonMeshy.636dc3fc.glb");
      const primitive = glb.json.meshes[0].primitives[0];
      const position = glb.json.accessors[primitive.attributes.POSITION];
      const index = glb.json.accessors[primitive.indices];
      expect(index.componentType).toBe(5123);
      const offset = (glb.json.bufferViews[index.bufferView].byteOffset ?? 0) + (index.byteOffset ?? 0);
      const indices = Array.from({ length: index.count }, (_, i) => glb.bin.readUInt16LE(offset + 2 * i));
      const positions = accessor(glb, primitive.attributes.POSITION).data;
      const node = buildFcScene(venue).toJSON().nodes.find((n) => n.kind === "model" && n.name === "flood-0");
      if (!node || node.kind !== "model") throw new Error("physical flood-0 is missing");
      const modelMatrix = createModelMatrix(node, { min: position.min, max: position.max }, true);
      const pose = fullTimeOrbitPose(0, true);
      const controller = createCameraController({ aspect: () => 16 / 9 });
      controller.setPose({ position: pose.eye, target: pose.target, fov: pose.fov });
      controller.update(1 / 60, 1000);
      const crop = fcQaCrops({ eye: pose.eye, target: pose.target, fovDeg: pose.fov, aspect: 16 / 9 }, null, [0, 0.21, 0])
        .find((c) => c.name === "flood-bank");
      if (!crop) throw new Error("flood crop is missing");
      const x = Math.round(crop.x * 1280), y = Math.round(crop.y * 720);
      const rect = { x, y, w: Math.round((crop.x + crop.w) * 1280) - x, h: Math.round((crop.y + crop.h) * 720) - y };
      const mask = headTriangleMask({ positions, indices, modelMatrix, viewProjection: controller.evidence().viewProjection,
        minY: mainFloodPosition()[1] - 0.8, canvas: { x: 0, y: 0, w: 1280, h: 720 }, crop: rect });
      expect(mask.length).toBeGreaterThanOrEqual(9);
    }
  );

  it.each(["munich", "kyoto", "favela", "glacier"] as const)(
    "%s: the seeded CPU demo reaches full time within the diagnostic step bound", (venue) => {
      const random = makeRng(0x5eed0fc3);
      const home = CLUB_ORDER[(random() * 8) | 0]!;
      const drawnAway = CLUB_ORDER[(random() * 8) | 0]!;
      const sim = createSim();
      sim.setAutopilot(true);
      sim.startMatch({ mode: "quick", venue, homeClub: home, awayClub: drawnAway === home ? "iron" : drawnAway,
        userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: false });
      const idle: UserInputFrame = {
        move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
        skillStepover: false, skillChop: false, switchPlayer: false, pause: false
      };
      let steps = 0;
      while (sim.state.phase !== "ended" && steps < 24_000) { sim.step(1 / 60, idle); steps++; }
      expect(sim.state.phase).toBe("ended");
    }
  );

  it("requires an on/off/on pixel difference inside the mask and rejects unstable baselines", () => {
    const mask = Array.from({ length: 20 }, (_, i) => i);
    const on = new Uint8Array(80).fill(80);
    const off = on.slice();
    const restored = on.slice();
    for (const p of [1, 3, 5]) off[p * 4] = 40;
    expect(compareHeadControl(on, off, restored, mask)).toMatchObject({
      maskPixels: 20, stableChangedPixels: 3, unstablePixels: 0, supported: true
    });
    expect(compareHeadControl(on, on, restored, mask).supported).toBe(false);
    const noisy = restored.slice();
    for (const p of [1, 3]) noisy[p * 4] = 160;
    expect(compareHeadControl(on, off, noisy, mask).supported).toBe(false);
    expect(compareHeadControl(on, off, restored, [0, 2, 4, 6, 8, 10, 12, 14, 16]).supported).toBe(false);
    expect(() => compareHeadControl(on, off, restored, [20])).toThrow();
  });

  it("samples the published full-time rectangle and p95 from exactly its screenshot pixels", async () => {
    const pose = fullTimeOrbitPose(0, true);
    const crop = fcQaCrops({ eye: pose.eye, target: pose.target, fovDeg: pose.fov, aspect: 16 / 9 }, null, [0, 0.21, 0])
      .find((c) => c.name === "flood-bank");
    if (!crop) throw new Error("flood crop is missing");
    const width = 320, height = 180;
    const x = Math.round(crop.x * width), y = Math.round(crop.y * height);
    const x1 = Math.round((crop.x + crop.w) * width), y1 = Math.round((crop.y + crop.h) * height);
    const data = new Uint8ClampedArray(width * height * 4);
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const value = px >= x && px < x1 && py >= y && py < y1 ? 240 : 10;
      const i = (py * width + px) * 4;
      data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
    }
    const globals = globalThis as unknown as Record<string, unknown>;
    const previous = globals.__AURA_QA__;
    globals.__AURA_QA__ = { crops: () => [crop] };
    try {
      const meta = await glMetaInPage({ png: "synthetic" }, async () => ({ width, height, data }));
      expect(meta.v2.crops["flood-bank"]).toMatchObject({
        x, y, w: x1 - x, h: y1 - y, from: "__AURA_QA__", p95: 240
      });
    } finally {
      if (previous === undefined) delete globals.__AURA_QA__;
      else globals.__AURA_QA__ = previous;
    }
  });
});
