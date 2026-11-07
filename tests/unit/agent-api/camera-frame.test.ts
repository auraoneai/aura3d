import { describe, expect, test } from "vitest";
import { camera, group, instances, lights, material, primitives, scene } from "../../../packages/engine/src/index.js";
import { frameCameraPose, measureFrameFill, type AuraFrameBounds } from "../../../packages/engine/src/agent-api/camera/frameSubject.js";
import { worldBoundsOfNodes } from "../../../packages/engine/src/agent-api/camera/frameNodes.js";

const box = (sx: number, sy: number, sz: number, c: [number, number, number] = [0, 0, 0]): AuraFrameBounds => ({
  min: [c[0] - sx / 2, c[1] - sy / 2, c[2] - sz / 2],
  max: [c[0] + sx / 2, c[1] + sy / 2, c[2] + sz / 2]
});

const SUBJECTS: Record<string, AuraFrameBounds> = {
  cube: box(1, 1, 1),
  "offset sphere bounds": box(2, 2, 2, [3, 1, -2]),
  "tall box": box(0.6, 3, 0.6, [0, 1.5, 0]),
  "long thin": box(12, 0.3, 0.4, [1, 0.2, 0]),
  "long thin deep": box(0.3, 0.3, 14)
};

describe("frameCameraPose fill accuracy", () => {
  for (const [name, bounds] of Object.entries(SUBJECTS)) {
    for (const aspect of [1, 4 / 3, 16 / 9, 21 / 9, 9 / 16, 3 / 4]) {
      for (const angle of ["three-quarter", "front", "side", "top"] as const) {
        test(`${name} aspect ${aspect.toFixed(2)} ${angle} fill within 2%`, () => {
          for (const fill of [0.35, 0.6, 0.85]) {
            const pose = frameCameraPose(bounds, { fill, aspect, angle, fov: 40 });
            const measured = measureFrameFill(bounds, pose, aspect);
            expect(Math.abs(measured - fill) / fill).toBeLessThan(0.02);
          }
        });
      }
    }
  }

  test("padding shrinks the effective fill", () => {
    const bounds = box(1, 1, 1);
    const pose = frameCameraPose(bounds, { fill: 0.6, padding: 0.2 });
    expect(measureFrameFill(bounds, pose)).toBeCloseTo(0.5, 2);
  });

  test("is deterministic, honours explicit azimuth/elevation and rejects non-finite bounds", () => {
    const bounds = box(2, 1, 3);
    expect(frameCameraPose(bounds, { azimuth: 1, elevation: 0.5 })).toEqual(frameCameraPose(bounds, { azimuth: 1, elevation: 0.5 }));
    const front = frameCameraPose(bounds, { angle: "front" });
    expect(front.position[0]).toBeCloseTo(front.target[0], 6);
    expect(front.position[2]).toBeGreaterThan(front.target[2]);
    expect(() => frameCameraPose({ min: [NaN, 0, 0], max: [1, 1, 1] })).toThrow(RangeError);
  });

  test("a point subject still yields a finite pose", () => {
    const pose = frameCameraPose({ min: [1, 1, 1], max: [1, 1, 1] });
    expect(pose.distance).toBeGreaterThan(0);
    expect(Number.isFinite(pose.position[0])).toBe(true);
  });

  test("a portrait frame needs a farther camera than a landscape one for a width-limited subject", () => {
    const bounds = box(4, 1, 1);
    const wide = frameCameraPose(bounds, { aspect: 16 / 9, angle: "front" });
    const narrow = frameCameraPose(bounds, { aspect: 9 / 16, angle: "front" });
    expect(narrow.distance).toBeGreaterThan(wide.distance);
  });
});

describe("worldBoundsOfNodes", () => {
  test("primitive size, scale and position are honoured", () => {
    const b = worldBoundsOfNodes(primitives.box({ size: [2, 4, 6] }).position(10, 0, 0))!;
    expect(b.min).toEqual([9, -2, -3]);
    expect(b.max).toEqual([11, 2, 3]);
  });

  test("groups compose and non-spatial nodes are skipped", () => {
    const g = group("g", [primitives.sphere({ size: 2 }), lights.point({ position: [100, 100, 100] })], { position: [0, 5, 0] });
    const b = worldBoundsOfNodes(g)!;
    expect(b.min).toEqual([-1, 4, -1]);
    expect(b.max).toEqual([1, 6, 1]);
    expect(worldBoundsOfNodes(lights.point({}))).toBeUndefined();
  });

  test("model nodes use asset bounds with the renderer's fit: targetHeight 2, grounded and centred in X/Z", () => {
    const asset = { id: "robot", kind: "model", metadata: { boundsMetadata: { min: [-10, 5, -10], max: [10, 15, 10] } } };
    const node = { kind: "model", asset, targetHeight: 2, position: [3, 0, 0], castShadow: true, receiveShadow: true, visible: true } as never;
    const b = worldBoundsOfNodes(node)!;
    expect(b.max[1] - b.min[1]).toBeCloseTo(2, 5);
    expect(b.min[1]).toBeCloseTo(0, 5);
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(3, 5);
    expect(b.max[0] - b.min[0]).toBeCloseTo(4, 5);
  });

  test("instances use their own transforms", () => {
    const node = instances.box({ transforms: [{ position: [0, 0, 0] }, { position: [10, 0, 0] }], material: material.pbr({ color: "#ffffff" }) });
    const b = worldBoundsOfNodes(node)!;
    expect(b.min[0]).toBeCloseTo(-0.5, 6);
    expect(b.max[0]).toBeCloseTo(10.5, 6);
  });
});

describe("camera.frame integration", () => {
  const body = primitives.box({ name: "body", size: [1, 2, 1], material: material.pbr({ color: "#aaaaaa" }) }).position(0, 1, 0);
  const wing = primitives.box({ name: "wing", size: [4, 0.2, 1], material: material.pbr({ color: "#aaaaaa" }) }).position(0, 1.5, 0);
  const ground = primitives.plane({ name: "ground", size: [200, 200] });

  test("returns an orbit perspective spec with target, distance and position", () => {
    const spec = camera.frame([body, wing], { fill: 0.6 });
    expect(spec.mode).toBe("orbit");
    expect(spec.fov).toBe(40);
    expect(spec.distance).toBeGreaterThan(0);
    const [px, py, pz] = spec.position!;
    const [tx, ty, tz] = spec.target!;
    expect(Math.hypot(px - tx, py - ty, pz - tz)).toBeCloseTo(spec.distance!, 4);
    expect(spec.far!).toBeGreaterThan(spec.distance!);
  });

  test("a scene carrying the framed camera shows the subject at ~60% of frame height at 16:9", () => {
    const stage = scene({ background: "#000000" }).add(ground).add(body).add(wing);
    const spec = camera.frame([body, wing], { fill: 0.6, angle: "front", aspect: 16 / 9 });
    stage.camera(spec);
    const snapshot = stage.toJSON();
    expect(snapshot.camera.position).toEqual(spec.position);
    const bounds = worldBoundsOfNodes([body, wing])!;
    const measured = measureFrameFill(bounds, { position: snapshot.camera.position!, target: snapshot.camera.target!, fov: snapshot.camera.fov! }, 16 / 9);
    expect(Math.abs(measured - 0.6)).toBeLessThan(0.012);
  });

  test("frameScene ignores the ground plane; frame of the same scene includes it", () => {
    const stage = scene({ background: "#000000" }).add(ground).add(body).add(wing);
    const near = camera.frameScene(stage, { fill: 0.6 });
    const far = camera.frame(stage, { fill: 0.6 });
    expect(near.distance!).toBeLessThan(far.distance!);
    expect(near.distance!).toBeLessThan(20);
  });

  test("framePose matches frame and accepts a raw bounds box", () => {
    const pose = camera.framePose([body, wing], { fill: 0.5 });
    const spec = camera.frame([body, wing], { fill: 0.5 });
    expect(pose.position).toEqual(spec.position);
    expect(camera.framePose({ min: [0, 0, 0], max: [1, 1, 1] }).distance).toBeGreaterThan(0);
  });

  test("a subject with nothing to frame throws", () => {
    expect(() => camera.frame(lights.point({}))).toThrow(RangeError);
  });
});
