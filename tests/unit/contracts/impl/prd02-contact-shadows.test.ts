// PRD-02 §6.5 Phase 5 — contact-shadow pass + contributor gating.

import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "@aura3d/scene";
import { DirectionalLight } from "@aura3d/scene";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { ContactShadowPass, CONTACT_MASK_BLACKBOARD_KEY } from "../../../../packages/rendering/src/passes/ContactShadowPass";
import {
  contactShadowRequest, prd02ContactShadowDiagnostics,
  createPrd02ContactShadowsContributor, CONTACT_SHADOWS_SUB_FLAG
} from "../../../../packages/rendering/src/passes/Prd02ContactShadowsContributor";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../../packages/rendering/src/UnlitMaterial";
import { Texture } from "../../../../packages/rendering/src/Texture";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";
import type { Mat4 } from "@aura3d/scene";
import { multiplyMat4 } from "@aura3d/scene";

const flagsOn = (names: readonly string[]) => ({
  values: Object.fromEntries(names.map((n) => [n, true])),
  on: (n: string) => names.includes(n)
}) as never;

const item: RenderItem = {
  label: "caster",
  geometry: Geometry.litCube(1),
  material: new UnlitMaterial({ name: "m", color: [1, 1, 1, 1] }),
  modelMatrix: new Float32Array(16)
};

const ctxFor = (overrides: Partial<FrameContributorContext> = {}): FrameContributorContext => {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
  cam.transform.setPosition(0, 3, 8);
  cam.updateCameraMatrices();
  return {
    device: new MockRenderDevice(),
    width: 512,
    height: 512,
    frameIndex: 0,
    timeSeconds: 0,
    camera: cam as never,
    source: { renderItems: [item] } as never,
    items: [item],
    tier: QUALITY_TIERS.high,
    flags: flagsOn(["A3D_QR_LIGHTING"]),
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 50, orthographic: false } },
    blackboard: new Map(),
    ...overrides
  } as FrameContributorContext;
};

describe("prd02 contact shadow request gating (PRD-02 §6.5)", () => {
  it("is off by default on tiers with shadow.contact === false", () => {
    expect(contactShadowRequest(ctxFor())).toBeNull();
  });

  it("runs on Ultra (C-27 shadow.contact)", () => {
    const ctx = ctxFor({ tier: QUALITY_TIERS.ultra });
    expect(contactShadowRequest(ctx)).not.toBeNull();
  });

  it("runs when the scene opts in via source.shadow.prd02Contact (any tier except Low)", () => {
    const shadow = { prd02Contact: { length: 0.3, steps: 16 } };
    expect(contactShadowRequest(ctxFor({ source: { shadow } as never }))).toMatchObject({ length: 0.3, steps: 16 });
    const low = ctxFor({ source: { shadow } as never, tier: QUALITY_TIERS.low });
    expect(contactShadowRequest(low)).toBeNull();
  });

  it("runs when the A3D_QR_LIGHTING_CONTACT sub-flag is set", () => {
    const ctx = ctxFor({ flags: flagsOn(["A3D_QR_LIGHTING", CONTACT_SHADOWS_SUB_FLAG]) });
    expect(contactShadowRequest(ctx)).not.toBeNull();
  });
});

describe("ContactShadowPass", () => {
  it("renders its own half-res depth when the C-01 stub has none (depthSource self)", () => {
    const device = new MockRenderDevice();
    device.beginFrame(512, 512);
    const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    cam.transform.setPosition(0, 3, 8);
    cam.updateCameraMatrices();
    const pass = new ContactShadowPass({
      sunDirection: [0.3, -0.8, -0.5],
      camera: {
        viewMatrix: cam.viewMatrix as unknown as Float32Array,
        projectionMatrix: cam.projectionMatrix as unknown as Float32Array,
        near: 0.1, far: 50
      },
      sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 50, orthographic: false } },
      casters: [item]
    });
    pass.execute({ device, width: 512, height: 512 });
    expect(pass.passExecuted()).toBe(true);
    expect(pass.depthSource()).toBe("self");
    expect(pass.maskTexture()).not.toBeNull();
    device.endFrame();
  });

  it("uses the C-01 sceneDepthCopy when available", () => {
    const device = new MockRenderDevice();
    device.beginFrame(512, 512);
    const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    cam.updateCameraMatrices();
    const depthTex = new Texture({ width: 256, height: 256, format: "rgba8", label: "sceneDepth" });
    const pass = new ContactShadowPass({
      sunDirection: [0, -1, 0],
      camera: {
        viewMatrix: cam.viewMatrix as unknown as Float32Array,
        projectionMatrix: cam.projectionMatrix as unknown as Float32Array,
        near: 0.1, far: 50
      },
      sceneDepth: { texture: depthTex, available: true, linearize: { near: 0.1, far: 50, orthographic: false } }
    });
    pass.execute({ device, width: 512, height: 512 });
    expect(pass.passExecuted()).toBe(true);
    expect(pass.depthSource()).toBe("scene");
    device.endFrame();
  });
});

describe("prd02.contactShadows contributor", () => {
  it("publishes the mask on the blackboard and records C-31 diagnostics", () => {
    const contributor = createPrd02ContactShadowsContributor();
    expect(contributor.id).toBe("prd02.contactShadows");
    expect(contributor.phases).toContain("after-opaque");
    const light = new DirectionalLight("sun");
    light.castsShadow = true;
    light.transform.updateWorld(undefined, true);
    const ctx = ctxFor({
      tier: QUALITY_TIERS.ultra,
      source: { renderItems: [item], collectedLights: [light] } as never
    });
    const passes = contributor.passes!("after-opaque", ctx);
    expect(passes.length).toBe(1);
    const device = ctx.device as MockRenderDevice;
    device.beginFrame(512, 512);
    passes[0].execute({ device, width: 512, height: 512 });
    device.endFrame();
    expect(ctx.blackboard.get(CONTACT_MASK_BLACKBOARD_KEY)).toBeTruthy();
    expect(prd02ContactShadowDiagnostics().contactShadows.passExecuted).toBe(true);
  });

  it("produces no pass when no request resolves", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor();
    expect(contributor.passes!("after-opaque", ctx)).toHaveLength(0);
  });
});
