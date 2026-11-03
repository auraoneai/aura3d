import { describe, expect, it } from "vitest";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraCameraSpec } from "../../../packages/engine/src/agent-api/nodes/types";

type Depth = NonNullable<AuraCameraSpec["depth"]>;
type CameraOptions = Omit<AuraCameraSpec, "mode">;

const builders: readonly [string, (options: CameraOptions) => AuraCameraSpec][] = [
  ["orbit", (options) => camera.orbit(options)],
  ["dolly", (options) => camera.dolly({ ...options, from: [0, 1, 4], to: [0, 1, 2] })],
  ["follow", (options) => camera.follow({ ...options, targetNode: "subject" })],
  ["path", (options) => camera.path({ ...options, from: [0, 1, 4], to: [0, 1, 2] })],
  ["flythrough", (options) => camera.flythrough(options)]
];

describe("camera depth request preservation", () => {
  for (const [mode, build] of builders) {
    it(`${mode} retains explicit depth modes and fallback choices in the scene snapshot`, () => {
      for (const depth of [
        { mode: "standard", allowFallback: false },
        { mode: "reversed", allowFallback: true },
        { mode: "logarithmic", allowFallback: false }
      ] as const) {
        const spec = build({ near: 0.3, far: 240, depth });
        expect(spec).toMatchObject({ mode, near: 0.3, far: 240, depth });
        expect(scene().camera(spec).toJSON().camera.depth).toEqual(depth);
      }
    });

    it(`${mode} retains a fallback choice even when depth mode is omitted`, () => {
      const spec = build({ depth: { allowFallback: false } });
      expect(spec.depth).toEqual({ allowFallback: false });
      expect(scene().camera(spec).toJSON().camera.depth).toEqual({ allowFallback: false });
    });

    it(`${mode} leaves depth absent when it was not supplied`, () => {
      const spec = build({});
      expect(spec).not.toHaveProperty("depth");
      expect(spec.near).toBe(0.05);
      expect(spec.far).toBe(100);
    });

    it(`${mode} keeps the existing invalid depth and clipping validation`, () => {
      const invalidDepth = { mode: "invalid" } as unknown as Depth;
      expect(() => build({ depth: invalidDepth })).toThrow(/depth mode/i);
      expect(() => build({ near: 0, depth: { mode: "standard" } })).toThrow(RangeError);
      expect(() => build({ near: 2, far: 2, depth: { mode: "reversed" } })).toThrow(RangeError);
    });
  }
});
