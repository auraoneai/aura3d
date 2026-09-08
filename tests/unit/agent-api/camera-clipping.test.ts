import { describe, expect, it } from "vitest";
import { camera, scene } from "../../../packages/engine/src/agent-api/index";
import { createCameraProjection } from "../../../packages/engine/src/agent-api/CameraProjection";

describe("root camera clipping", () => {
  const options = { near: 0.3, far: 240, from: [0, 0, 4] as const, to: [0, 0, 2] as const, targetNode: "subject" };
  for (const mode of ["perspective", "orbit", "dolly", "follow", "path", "flythrough", "orthographic", "isometric"] as const) {
    it(`${mode} retains clipping through the public scene snapshot and projection`, () => {
      const spec = scene().camera(camera[mode](options)).toJSON().camera;
      expect(spec).toMatchObject({ near: 0.3, far: 240 });
      const m = createCameraProjection(spec, 1.5);
      const projectDepth = (distance: number) => (-distance * m[10]! + m[14]!) / (-distance * m[11]! + m[15]!);
      expect(projectDepth(0.3)).toBeCloseTo(-1, 5);
      expect(projectDepth(240)).toBeCloseTo(1, 5);
      expect(projectDepth(0.15)).toBeLessThan(-1);
      expect(projectDepth(480)).toBeGreaterThan(1);
    });
  }
  it("preserves existing defaults", () => {
    expect(camera.perspective()).toMatchObject({ near: 0.05, far: 100 });
    expect(createCameraProjection({ mode: "perspective" }, 1)).toEqual(createCameraProjection({ mode: "perspective", near: 0.05, far: 100 }, 1));
  });
  for (const clipping of [{ near: 0 }, { near: -1 }, { near: NaN }, { far: Infinity }, { far: 0.01 }, { near: 2, far: 2 }]) {
    it(`rejects invalid clipping ${JSON.stringify(clipping)}`, () => {
      expect(() => camera.perspective(clipping)).toThrow(RangeError);
      expect(() => scene().camera({ mode: "perspective", ...clipping })).toThrow(RangeError);
      expect(() => createCameraProjection({ mode: "perspective", ...clipping }, 1)).toThrow(RangeError);
    });
  }
});
