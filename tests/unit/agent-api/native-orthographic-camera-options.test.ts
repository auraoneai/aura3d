import { describe, expect, it } from "vitest";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createCameraProjection } from "../../../packages/engine/src/agent-api/CameraProjection";

const builders = [
  ["orthographic", camera.orthographic],
  ["isometric", camera.isometric]
] as const;

describe("orthographic camera option preservation", () => {
  for (const [mode, build] of builders) {
    it(`${mode} carries authored view, depth, up and layers into the scene camera`, () => {
      const options = {
        position: [0, 2, 8] as const,
        target: [0, 1, 0] as const,
        up: [1, 0, 0] as const,
        orthographicSize: 4,
        near: 0.3,
        far: 240,
        viewOffset: { fullWidth: 800, fullHeight: 400, x: 200, y: 50, width: 400, height: 200 },
        depth: { mode: "standard" as const, allowFallback: false },
        layers: 0
      };
      const spec = build(options);
      const snapshot = scene().camera(spec).toJSON().camera;

      expect(spec).toMatchObject({ mode, ...options });
      expect(snapshot).toMatchObject({ mode, ...options });
      expect(snapshot.layers).toBe(0);
      expect(snapshot.depth?.allowFallback).toBe(false);
    });

    it(`${mode} applies the preserved view offset to its projection`, () => {
      const spec = build({
        orthographicSize: 4,
        near: 0.3,
        far: 240,
        viewOffset: { fullWidth: 800, fullHeight: 400, x: 200, y: 50, width: 400, height: 200 }
      });
      // The full frustum is [-8,8] x [-4,4]; this tile is [-4,4] x [-1,3].
      const projection = createCameraProjection(spec, 1);
      expect(projection[0]).toBeCloseTo(0.25);
      expect(projection[5]).toBeCloseTo(0.5);
      expect(projection[12]).toBeCloseTo(0);
      expect(projection[13]).toBeCloseTo(-0.5);
    });

    it(`${mode} retains an explicit depth request for later capability checks`, () => {
      const reversed = build({ depth: { mode: "reversed", allowFallback: false } });
      const logarithmic = build({ depth: { mode: "logarithmic", allowFallback: true } });
      expect(reversed.depth).toEqual({ mode: "reversed", allowFallback: false });
      expect(logarithmic.depth).toEqual({ mode: "logarithmic", allowFallback: true });
    });

    it(`${mode} preserves defaults and rejects invalid clipping`, () => {
      const spec = build();
      expect(spec.near).toBe(0.05);
      expect(spec.far).toBe(100);
      expect(spec).not.toHaveProperty("up");
      expect(spec).not.toHaveProperty("viewOffset");
      expect(spec).not.toHaveProperty("depth");
      expect(spec).not.toHaveProperty("layers");
      expect(build({ near: 0 }).near).toBe(0);
      expect(() => build({ near: 2, far: 2 })).toThrow(RangeError);
    });

    it(`${mode} preserves an invalid tile for the existing projection validator to reject`, () => {
      const spec = build({ viewOffset: { fullWidth: 100, fullHeight: 100, x: 90, y: 0, width: 20, height: 40 } });
      expect(() => createCameraProjection(spec, 1)).toThrow(/view offset/i);
    });
  }
});
