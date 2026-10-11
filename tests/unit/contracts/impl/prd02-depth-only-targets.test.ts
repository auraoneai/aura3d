/**
 * 02-T1946 — shadow maps use depth-only render targets (Q-01-5) under
 * A3D_QR_LIGHTING when the device supports depth textures: no rgba8 colour
 * attachment (4·size² bytes saved per target). Flag-off ShadowPass keeps the
 * legacy rgba8 + depth descriptor byte-for-byte.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { DirectionalLight, PerspectiveCamera, identityMat4 } from "@aura3d/scene";
import { MockRenderDevice, type RenderTargetDescriptor } from "../../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { ShadowMap } from "../../../../packages/rendering/src/ShadowMap";
import { ShadowPass } from "../../../../packages/rendering/src/ShadowPass";
import { createLeanCoreShaderLibrary } from "../../../../packages/rendering/src/ShaderLibraryCore";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { Prd02ShadowSystem, type ShadowSystemConfigInput } from "../../../../packages/rendering/src/shadows/ShadowSystem";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({});
const CONFIG: ShadowSystemConfigInput = {
  enabled: true, mapSize: 512, cascades: 2, maxDistance: 60, splitLambda: 0.6,
  filter: "pcf", strength: 1, bias: 0, normalBias: 1.5
};
const CASTER: RenderItem = { geometry: Geometry.triangle(), modelMatrix: identityMat4(), label: "tri" };

afterEach(() => setRendererQrFlags(BASE));

function recordingDevice(capabilities?: readonly string[]): { device: MockRenderDevice; descriptors: RenderTargetDescriptor[] } {
  const device = new MockRenderDevice();
  if (capabilities) {
    Object.defineProperty(device, "info", { value: { ...device.info, capabilities }, configurable: true });
  }
  const descriptors: RenderTargetDescriptor[] = [];
  const create = device.createRenderTarget.bind(device);
  vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
    descriptors.push(descriptor);
    return create(descriptor);
  });
  return { device, descriptors };
}

function camera() {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.5, far: 60 });
  cam.transform.setPosition(0, 4, 10);
  cam.updateCameraMatrices();
  return { viewProjectionMatrix: cam.viewProjectionMatrix, near: cam.near, far: cam.far };
}

describe("02-T1946 depth-only shadow targets", () => {
  it("Prd02ShadowSystem cascades and atlas are depth-only with depth textures", () => {
    const { device, descriptors } = recordingDevice();
    device.beginFrame(256, 256);
    const system = new Prd02ShadowSystem(device, CONFIG);
    const uniforms = system.update({
      camera: camera(), sun: { direction: [0, -1, -0.2] }, casters: [CASTER],
      localLights: [{ shadowIndex: 0, kind: "spot", position: [0, 4, 0], direction: [0, -1, 0], range: 10, outerAngleRadians: 0.6 }],
      flags: FLAGS_ON, tier: QUALITY_TIERS.high
    });
    device.endFrame();
    const shadowTargets = descriptors.filter((d) => d.label?.startsWith("prd02-"));
    expect(shadowTargets.length).toBeGreaterThanOrEqual(3);
    for (const descriptor of shadowTargets) {
      expect(descriptor.depthOnly).toBe(true);
      expect(descriptor.format).toBeUndefined();
    }
    expect(uniforms.cascadeTextures[0]).toBeTruthy();
    expect(uniforms.atlasTexture).toBeTruthy();
    system.dispose();
  });

  it("Prd02ShadowSystem keeps rgba8 + depth texture without depth-texture support", () => {
    const { device, descriptors } = recordingDevice(["render-targets"]);
    device.beginFrame(256, 256);
    const system = new Prd02ShadowSystem(device, CONFIG);
    system.update({ camera: camera(), sun: { direction: [0, -1, 0] }, casters: [CASTER], localLights: [], flags: FLAGS_ON, tier: QUALITY_TIERS.high });
    device.endFrame();
    const cascade = descriptors.find((d) => d.label === "prd02-cascade-0");
    expect(cascade).toMatchObject({ format: "rgba8", depth: "texture" });
    expect(cascade?.depthOnly).toBeUndefined();
    system.dispose();
  });

  function runShadowPass(): RenderTargetDescriptor | undefined {
    const { device, descriptors } = recordingDevice();
    const light = new DirectionalLight("sun");
    light.castsShadow = true;
    const pass = new ShadowPass({
      light, casters: [CASTER], shadowMap: new ShadowMap({ size: 256, label: "t1946-shadow" }),
      viewProjectionMatrix: identityMat4(), shaderLibrary: createLeanCoreShaderLibrary()
    });
    device.beginFrame(256, 256);
    pass.execute({ device, width: 256, height: 256 });
    device.endFrame();
    const forward = pass.getForwardShadowMap({ lightMatrix: identityMat4() });
    expect(forward?.texture.texture).toBe(pass.getRenderTarget()?.depthTexture);
    pass.dispose();
    return descriptors[0];
  }

  it("ShadowPass flag-off descriptor is the legacy rgba8 + depth texture", () => {
    setRendererQrFlags(BASE);
    expect(runShadowPass()).toEqual({
      width: 256, height: 256, label: "t1946-shadow-depth-color", format: "rgba8", depth: "texture"
    });
  });

  it("ShadowPass flag-on descriptor is depth-only", () => {
    setRendererQrFlags(FLAGS_ON);
    expect(runShadowPass()).toEqual({ width: 256, height: 256, label: "t1946-shadow-depth", depthOnly: true });
  });
});
