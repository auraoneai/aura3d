/**
 * GU47 phase 2 (receipt effects-ssr): the engine hands the renderer a CameraLike carrying only
 * `viewProjectionMatrix`, `shaderViewMatrix` and `shaderProjectionMatrix` (`compiler/renderInput.ts`). The frame
 * camera ignored the shader pair, so every createAuraApp frame camera had an identity view and projection and the
 * 0.1/1000 clip guess instead of the engine's 0.05/100: the S3 trace projected every ray off screen (floor delta
 * 0.0023), and S1 linearised depth about 2x too far for DOF, GTAO, S4 and TAA disocclusion.
 */
import { describe, expect, it } from "vitest";
import { lookAtMat4, multiplyMat4, orthographicMat4, perspectiveMat4 } from "@aura3d/scene";
import { toFrameCamera } from "../../../../packages/rendering/src/renderer/FrameGraph";

const view = lookAtMat4([0, 2.2, 5.2], [0, 0.8, 0], [0, 1, 0]);

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(actual.length).toBe(16);
  for (let i = 0; i < 16; i++) expect(actual[i]!).toBeCloseTo(expected[i]!, 4);
}

describe("GU47 phase 2 frame camera from the engine's shader matrices", () => {
  it("an engine perspective camera keeps its projection, view and 0.05/100 clip planes", () => {
    const projection = perspectiveMat4(Math.PI / 4, 16 / 9, 0.05, 100);
    const frame = toFrameCamera({ viewProjectionMatrix: multiplyMat4(projection, view), shaderViewMatrix: view, shaderProjectionMatrix: projection }, undefined, [0, 2.2, 5.2]);
    expectClose(frame!.projectionMatrix, projection);
    expectClose(frame!.viewMatrix, view);
    expect(frame!.near).toBeCloseTo(0.05, 5);
    expect(frame!.far).toBeCloseTo(100, 2);
    expect(frame!.projection).toBe("perspective");
  });

  it("an engine orthographic / isometric camera is reported orthographic with its clip planes", () => {
    const projection = orthographicMat4(-2.5, 2.5, -1.4, 1.4, 0.05, 100);
    const frame = toFrameCamera({ viewProjectionMatrix: multiplyMat4(projection, view), shaderViewMatrix: view, shaderProjectionMatrix: projection }, undefined, [0, 2.2, 5.2]);
    expectClose(frame!.projectionMatrix, projection);
    expect(frame!.projection).toBe("orthographic");
    expect(frame!.near).toBeCloseTo(0.05, 5);
    expect(frame!.far).toBeCloseTo(100, 2);
  });

  it("a camera's own projection and view still win over the shader pair", () => {
    const own = perspectiveMat4(Math.PI / 3, 1, 0.25, 400);
    const shader = perspectiveMat4(Math.PI / 4, 1, 0.05, 100);
    const frame = toFrameCamera({ viewProjectionMatrix: multiplyMat4(own, view), viewMatrix: view, projectionMatrix: own, shaderViewMatrix: view, shaderProjectionMatrix: shader }, undefined, undefined);
    expectClose(frame!.projectionMatrix, own);
    expect(frame!.near).toBeCloseTo(0.25, 4);
    expect(frame!.far).toBeCloseTo(400, 0);
  });
});
