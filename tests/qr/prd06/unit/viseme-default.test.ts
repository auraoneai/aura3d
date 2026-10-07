/**
 * T4.5 — under `A3D_QR_ANIMATION` the default viseme example is morph
 * visemes on a morph-capable hero; flag-off keeps the primitive mouth card.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  defaultVisemeExample,
  glbVisemeBlendshapeExample,
  primitiveMouthVisemeExample
} from "../../../../packages/engine/src/agent-api/VisemeController.js";

describe("T4.5 defaultVisemeExample", () => {
  afterEach(() => {
    delete process.env.A3D_QR_ANIMATION;
    delete process.env.A3D_QR;
  });

  it("returns the morph/blendshape example under A3D_QR_ANIMATION", () => {
    process.env.A3D_QR_ANIMATION = "1";
    const example = defaultVisemeExample();
    expect(example).toBe(glbVisemeBlendshapeExample);
    expect(example.mouthFallback).toBe("blendshape");
    // The default example references morph targets: every viseme maps to a
    // named blendshape (mouthOpen, mouthSmile, ...) with non-empty names.
    const map = (example as typeof glbVisemeBlendshapeExample).blendshapeMap;
    expect(Object.keys(map).length).toBeGreaterThan(10);
    for (const target of Object.values(map)) {
      expect(typeof target).toBe("string");
      expect(target.length).toBeGreaterThan(0);
    }
  });

  it("returns the primitive mouth-card fallback when the flag is off", () => {
    expect(defaultVisemeExample()).toBe(primitiveMouthVisemeExample);
    expect(defaultVisemeExample().mouthFallback).toBe("primitive-mouth-card");
  });
});
