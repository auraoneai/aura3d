import { describe, expect, it } from "vitest";

import { attachRootRenderSource as productionRuntimeAttach } from "@aura3d/engine/production-runtime";
import { attachRootRenderSource, type RootRenderSourceBridge, type TypedGLBActor } from "@aura3d/engine";
import {
  xr,
  type AuraXREventMap,
  type AuraXREventName,
  type AuraXRFrameEvent,
  type AuraXRRuntime,
  type AuraXRSceneHelperOptions,
  type AuraXRSceneHelpers,
  type AuraXRSessionProvenance,
  type AuraXRVisual
} from "@aura3d/engine";

describe("public attachRootRenderSource export", () => {
  it("is the same function the deprecated production-runtime subpath exposes", () => {
    expect(typeof attachRootRenderSource).toBe("function");
    expect(attachRootRenderSource).toBe(productionRuntimeAttach);
  });

  it("types the actor and bridge from the root", () => {
    const check = (_actor?: TypedGLBActor, _bridge?: RootRenderSourceBridge) => true;
    expect(check()).toBe(true);
  });
});

describe("public XR helper contracts", () => {
  it("exposes scene helpers and their frame provenance types from the root", () => {
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
    const provenanceContract: Equal<AuraXRSessionProvenance, "injected" | "navigator"> = true;
    const frameContract: Equal<AuraXREventMap["frame"], AuraXRFrameEvent> = true;
    const visual: AuraXRVisual = { setPosition() {}, setVisible() {} };
    const options: AuraXRSceneHelperOptions = { createController: () => visual };
    const create: (options?: AuraXRSceneHelperOptions) => AuraXRSceneHelpers = xr.createSceneHelpers;
    const attach: (runtime: AuraXRRuntime, options?: AuraXRSceneHelperOptions) => AuraXRSceneHelpers = xr.attachSceneHelpers;
    const eventName: AuraXREventName = "frame";
    const provenanceFromFrame: (frame: AuraXREventMap["frame"]) => AuraXRSessionProvenance =
      (frame: AuraXRFrameEvent) => frame.provenance;
    const subscribe = (runtime: AuraXRRuntime) => runtime.on(eventName, provenanceFromFrame);

    const helpers: AuraXRSceneHelpers = create(options);
    expect(provenanceContract && frameContract).toBe(true);
    expect(typeof attach).toBe("function");
    expect(typeof subscribe).toBe("function");
    expect(helpers).toMatchObject({ update: expect.any(Function), clear: expect.any(Function), dispose: expect.any(Function) });
    helpers.dispose();
  });
});
