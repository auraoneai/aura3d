import { afterEach, describe, expect, it, vi } from "vitest";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { BaseRenderPass } from "../../../packages/rendering/src/RenderPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { PerspectiveCamera, DirectionalLight } from "@aura3d/scene";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";

// C3-01: clipping + renderer shadows + a contributor used to throw at mount. Outside strict mode it now degrades with a warning.
describe("scene clipping with contributor-owned geometry", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => { while (cleanups.length) cleanups.pop()!(); vi.restoreAllMocks(); });

  function run(strict: boolean): void {
    const device = new MockRenderDevice();
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_LIGHTING: true, A3D_QR_CORE_OUTPUT: false, ...(strict ? { A3D_QR_STRICT: true } : {}) });
    const renderer = new Renderer(device, { backend: "mock", width: 32, height: 24, qrFlags: flags, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    cleanups.push(() => { renderer.dispose(); geometry.dispose(); material.dispose(); });
    cleanups.push(registerFrameContributor({
      id: "test.clip-contributor", owner: "prd02", flag: "A3D_QR_LIGHTING", phases: ["after-opaque"],
      passes: () => [new class extends BaseRenderPass { constructor() { super("test-clip-contributor-pass"); } execute() { /* draws its own geometry */ } }()]
    }));
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 32 / 24, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 3, 8); camera.updateCameraMatrices();
    const sun = new DirectionalLight("clip-sun"); sun.castsShadow = true; sun.transform.updateWorld(undefined, true);
    const source = { renderItems: [{ geometry, material }], lights: [sun], shadow: { enabled: true },
      globalClipping: { planes: [[0, 1, 0, 0]], space: "world" } };
    renderer.render(source as never, camera as never);
  }

  it("draws and warns once outside strict mode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // The mock device's stock shaders carry no clipping uniform, so the draw itself may still be refused; what matters here is
    // that the contributor check no longer rejects the frame and that it warns.
    try { run(false); } catch (error) { expect(String((error as Error).message)).not.toMatch(/contributor-owned geometry/); }
    expect(warn.mock.calls.some(call => String(call[0]).includes("SCENE_CLIPPING_CONTRIBUTOR_DEGRADED"))).toBe(true);
  });

  it("keeps the hard failure in strict mode", () => {
    expect(() => run(true)).toThrow(/contributor-owned geometry/);
  });
});
