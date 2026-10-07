/**
 * sampler-prd04.test.ts — PRD-04 P2-6 (C-12 sampling plumbing).
 *
 * `Sampler.trilinear`/`Sampler.fromGLTF` bridge spec samplers (`repeat`/`clamp`/`mirror`
 * wraps, anisotropy overrides) onto `Sampler` address modes, and
 * `resolveSamplerAnisotropy` applies the C-12 tier table (low 4 / medium 8 / high 16 /
 * ultra 16) clamped to the device cap when no explicit `desired` is given.
 */
import { describe, expect, it } from "vitest";
import { Sampler, resolveSamplerAnisotropy } from "../../../../packages/rendering/src/Sampler";

describe("Sampler.trilinear", () => {
  it("defaults to trilinear repeat", () => {
    const s = Sampler.trilinear();
    expect(s.minFilter).toBe("linear-mipmap-linear");
    expect(s.magFilter).toBe("linear");
    expect(s.addressU).toBe("repeat");
    expect(s.addressV).toBe("repeat");
    expect(s.maxAnisotropy).toBe(1);
  });

  it("maps the spec wrap aliases onto TextureAddressMode", () => {
    const clamp = Sampler.trilinear({ wrap: "clamp" });
    expect(clamp.addressU).toBe("clamp-to-edge");
    expect(clamp.addressV).toBe("clamp-to-edge");

    const mirror = Sampler.trilinear({ wrap: "mirror" });
    expect(mirror.addressU).toBe("mirror-repeat");

    const mixed = Sampler.trilinear({ wrap: ["clamp", "mirror"] });
    expect(mixed.addressU).toBe("clamp-to-edge");
    expect(mixed.addressV).toBe("mirror-repeat");

    const native = Sampler.trilinear({ wrap: "clamp-to-edge" });
    expect(native.addressU).toBe("clamp-to-edge");
  });

  it("honours an explicit anisotropy value", () => {
    expect(Sampler.trilinear({ anisotropy: 8 }).maxAnisotropy).toBe(8);
  });
});

describe("Sampler.fromGLTF", () => {
  it("maps the glTF sampler enum table exactly", () => {
    const s = Sampler.fromGLTF({ minFilter: 9729, magFilter: 9728, wrapS: 33071, wrapT: 33648 }, 4);
    expect(s.minFilter).toBe("linear");
    expect(s.magFilter).toBe("nearest");
    expect(s.addressU).toBe("clamp-to-edge");
    expect(s.addressV).toBe("mirror-repeat");
    expect(s.maxAnisotropy).toBe(4);
  });

  it("defaults to trilinear repeat when the descriptor is absent", () => {
    const s = Sampler.fromGLTF(undefined);
    expect(s.minFilter).toBe("linear-mipmap-linear");
    expect(s.magFilter).toBe("linear");
    expect(s.addressU).toBe("repeat");
    expect(s.addressV).toBe("repeat");
    expect(s.maxAnisotropy).toBe(1);
  });
});

describe("resolveSamplerAnisotropy", () => {
  it("applies the C-12 tier defaults when no explicit desire is given", () => {
    expect(resolveSamplerAnisotropy({ tier: "low", deviceMax: 16 }).applied).toBe(4);
    expect(resolveSamplerAnisotropy({ tier: "medium", deviceMax: 16 }).applied).toBe(8);
    expect(resolveSamplerAnisotropy({ tier: "high", deviceMax: 16 }).applied).toBe(16);
    expect(resolveSamplerAnisotropy({ tier: "ultra", deviceMax: 16 }).applied).toBe(16);
  });

  it("clamps tier defaults to the device max", () => {
    const out = resolveSamplerAnisotropy({ tier: "high", deviceMax: 4 });
    // The tier resolver clamps to the device cap first, so 4 becomes the applied
    // resolution and `capped` (applied < desired) stays false.
    expect(out.applied).toBe(4);
    expect(out.capped).toBe(false);
  });

  it("an explicit desire outranks the tier", () => {
    expect(resolveSamplerAnisotropy({ desired: 16, tier: "low", deviceMax: 16 }).applied).toBe(16);
    expect(resolveSamplerAnisotropy({ desired: 2, deviceMax: 16 }).applied).toBe(2);
  });

  it("desired below 1 falls through to the tier/default", () => {
    const out = resolveSamplerAnisotropy({ desired: 0, tier: "low", deviceMax: 8 });
    expect(out.applied).toBe(4);
  });

  it("keeps the pre-P2-6 behaviour when only maxSupported is supplied", () => {
    expect(resolveSamplerAnisotropy({}).applied).toBe(8); // DEFAULT_SAMPLER_ANISOTROPY
    expect(resolveSamplerAnisotropy({ maxSupported: 4 }).applied).toBe(4);
    expect(resolveSamplerAnisotropy({ desired: 32, maxSupported: 8 }).applied).toBe(8);
  });
});
