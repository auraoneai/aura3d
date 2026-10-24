import { describe, expect, it } from "vitest";

import { attachRootRenderSource as productionRuntimeAttach } from "@aura3d/engine/production-runtime";
import { attachRootRenderSource, type RootRenderSourceBridge, type TypedGLBActor } from "@aura3d/engine";

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
