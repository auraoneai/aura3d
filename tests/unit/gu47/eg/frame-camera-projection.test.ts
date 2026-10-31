/**
 * GU47 phase 2: the frame camera of app cameras (CameraLike objects that are not `Camera` instances) carried an
 * identity projection, so the `world.water` planar reflection threw "Oblique clip projection is degenerate" every
 * frame (aura-hoops-3d drew nothing) and GTAO, the SSR trace, contact shadows and volumetric fog read the identity.
 */
import { describe, expect, it } from "vitest";
import { identityMat4, lookAtMat4, multiplyMat4, perspectiveMat4, type Mat4 } from "@aura3d/scene";
import { toFrameCamera } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { planReflection } from "../../../../packages/rendering/src/world/water/ReflectionViewPass";

const projection = perspectiveMat4(Math.PI / 3, 16 / 9, 0.25, 400);
const view = lookAtMat4([0, 6, 14], [0, 0, 0], [0, 1, 0]);
const viewProjection = multiplyMat4(projection, view);

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(actual.length).toBe(16);
  for (let i = 0; i < 16; i++) expect(actual[i]!).toBeCloseTo(expected[i]!, 3);
}

describe("GU47 phase 2 frame camera projection", () => {
  it("uses the resolved camera's own projection when the camera object is not a Camera instance", () => {
    const frame = toFrameCamera({ viewProjectionMatrix: viewProjection, viewMatrix: view, projectionMatrix: projection }, undefined, [0, 6, 14]);
    expectClose(frame!.projectionMatrix, projection);
  });

  it("derives P = VP · V⁻¹ (and the clip planes) when no projection is carried", () => {
    const frame = toFrameCamera({ viewProjectionMatrix: viewProjection, viewMatrix: view }, undefined, [0, 6, 14]);
    expectClose(frame!.projectionMatrix, projection);
    expect(frame!.near).toBeCloseTo(0.25, 3);
    expect(frame!.far).toBeCloseTo(400, 0);
  });

  it("keeps the identity only when there is no view matrix to derive from", () => {
    const frame = toFrameCamera({ viewProjectionMatrix: viewProjection }, undefined, undefined);
    expectClose(frame!.projectionMatrix, identityMat4() as Mat4);
    expect(frame!.near).toBe(0.1);
  });

  it("a world.water reflection plans on the derived projection and skips (no throw) on a degenerate one", () => {
    const request = { waterId: "court", planeY: 0, extent: 12 } as Parameters<typeof planReflection>[1];
    const good = toFrameCamera({ viewProjectionMatrix: viewProjection, viewMatrix: view }, undefined, [0, 6, 14]);
    expect(planReflection({ camera: good } as Parameters<typeof planReflection>[0], request)).not.toBeNull();
    const identity = { ...good!, projectionMatrix: Float32Array.from(identityMat4()) };
    expect(() => planReflection({ camera: identity } as Parameters<typeof planReflection>[0], request)).not.toThrow();
    expect(planReflection({ camera: identity } as Parameters<typeof planReflection>[0], request)).toBeNull();
  });
});
