/**
 * GU47 phase 2: the `world.water` scene-copy and planar-reflection passes ended with `setRenderTarget(null)`. The render
 * graph (dev asserts) then threw "left a different render target bound" and the renderer never mounted
 * (aura-hoops-3d shanghai/venice, slingshot-siege); without dev asserts the rest of the frame drew to the default
 * framebuffer. Both passes must hand back the target that was bound on entry.
 */
import { describe, expect, it } from "vitest";
import { lookAtMat4, multiplyMat4, perspectiveMat4 } from "@aura3d/scene";
import { FRAME_RESOURCES } from "../../../../packages/rendering/src/contracts/frameGraph";
import { toFrameCamera } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { sceneCopyFallbackPass } from "../../../../packages/rendering/src/world/water/SceneCopyFallback";
import { reflectionViewPass } from "../../../../packages/rendering/src/world/water/ReflectionViewPass";

function trackingDevice(initial: object) {
  let bound: object | null = initial;
  const target = (label: string) => ({ label, width: 64, height: 32, colorTexture: { label }, dispose() {} });
  return {
    getRenderTarget: () => bound,
    setRenderTarget: (t: object | null) => { bound = t; },
    createShaderProgram: (sources: { label: string }) => ({ label: sources.label }),
    createBuffer: () => ({}),
    createRenderTarget: (desc: { label: string }) => target(desc.label),
    clear() {},
    draw() {}
  };
}

describe("GU47 phase 2 world.water passes restore the bound render target", () => {
  it("scene copy hands back the scene target it found bound", () => {
    const sceneTarget = { label: "scene-hdr" };
    const device = trackingDevice(sceneTarget);
    const blackboard = new Map<string, unknown>([[FRAME_RESOURCES.sceneColor, { label: "scene-color" }]]);
    const ctx = { blackboard, sceneDepth: { available: true, texture: { label: "scene-depth" }, linearize: { near: 0.1, far: 300 } } };
    sceneCopyFallbackPass(ctx as never).execute({ device, width: 64, height: 32 } as never);
    expect(device.getRenderTarget()).toBe(sceneTarget);
  });

  it("planar reflection hands back the scene target after drawing the mirror view", () => {
    const sceneTarget = { label: "scene-hdr" };
    const device = trackingDevice(sceneTarget);
    const view = lookAtMat4([0, 6, 14], [0, 0, 0], [0, 1, 0]);
    const camera = toFrameCamera({ viewProjectionMatrix: multiplyMat4(perspectiveMat4(Math.PI / 3, 16 / 9, 0.25, 400), view), viewMatrix: view }, undefined, [0, 6, 14]);
    const ctx = { camera, blackboard: new Map<string, unknown>() };
    let drew = 0;
    const request = { waterId: "court", planeY: 0, extent: 30 } as never;
    reflectionViewPass(ctx as never, request, () => { drew++; }).execute({ device, width: 64, height: 32 } as never);
    expect(drew).toBe(1);
    expect(device.getRenderTarget()).toBe(sceneTarget);
  });
});
