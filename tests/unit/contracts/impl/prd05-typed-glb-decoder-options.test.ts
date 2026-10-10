/**
 * 05-WIRE (C-16 §7.3) — `typedGLBActorDecoderOptions`, the lane-05 half of
 * putting the decoder registry on the default `model()` path. The compiler
 * (Q-15-1) spreads it into `createTypedGLBActor`; these tests pin the flag-off
 * no-op and the flag-on fail-closed shape.
 */
import { describe, expect, it } from "vitest";
import { typedGLBActorDecoderOptions } from "../../../../packages/engine/src/agent-api/AssetDecoders";

const flagsOn = { on: (name: string) => name === "A3D_QR_ASSETS" };
const flagsOff = { on: () => false };
const CAPS = { astc: true, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;

describe("typedGLBActorDecoderOptions (05-WIRE)", () => {
  it("is a no-op with A3D_QR_ASSETS off, even when the app configures decoders", () => {
    expect(typedGLBActorDecoderOptions(flagsOff, { decoders: { draco: false }, maxTextureSize: 1024 }, CAPS)).toEqual({});
  });

  it("always forwards a decoders object with A3D_QR_ASSETS on, so the pipeline requires decoders", () => {
    expect(typedGLBActorDecoderOptions(flagsOn, undefined)).toEqual({ decoders: {} });
  });

  it("forwards app decoder disables, maxTextureSize and capabilities unchanged", () => {
    const decoders = { basePath: "/cdn/aura-decoders/", draco: false, workerCount: 2 };
    expect(typedGLBActorDecoderOptions(flagsOn, { decoders, maxTextureSize: 2048 }, CAPS)).toEqual({
      decoders,
      maxTextureSize: 2048,
      compressedTextureCapabilities: CAPS
    });
  });
});
