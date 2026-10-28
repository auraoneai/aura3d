/**
 * RGBA32F render targets are only linear-filterable once OES_texture_float_linear is enabled. Without it a
 * LINEAR RGBA32F texture is texture-incomplete and `texelFetch` returns zeros, which is how the v2 post chain's
 * half-res depth read zero and GTAO occluded every pixel on SwiftShader (4.5.0 AO receipt: 31% darker, no
 * crease structure, identical for radius 0.15 / 0.6 / 2).
 */
import { describe, expect, it } from "vitest";
import { WebGL2Device } from "../../../packages/rendering/src";
import { renderTargetSampleFilter } from "../../../packages/rendering/src/webgl2/TextureFormats";

const NEAREST = 0x2600;
const LINEAR = 0x2601;
const TEXTURE_MIN_FILTER = 0x2801;
const TEXTURE_MAG_FILTER = 0x2800;

describe("renderTargetSampleFilter", () => {
  const gl = (floatLinear: boolean) => ({
    LINEAR,
    NEAREST,
    getExtension: (name: string) => (name === "OES_texture_float_linear" && floatLinear ? {} : null)
  }) as unknown as Parameters<typeof renderTargetSampleFilter>[0];

  it("point-samples RGBA32F when float linear filtering is unavailable", () => {
    expect(renderTargetSampleFilter(gl(false), "rgba32f")).toBe(NEAREST);
  });

  it("keeps LINEAR for RGBA32F when OES_texture_float_linear is available, and for every other format", () => {
    expect(renderTargetSampleFilter(gl(true), "rgba32f")).toBe(LINEAR);
    expect(renderTargetSampleFilter(gl(false), "rgba16f")).toBe(LINEAR);
    expect(renderTargetSampleFilter(gl(false), "rgba8")).toBe(LINEAR);
  });
});

describe("WebGL2Device.createRenderTarget colour filtering", () => {
  function deviceWith(floatLinear: boolean) {
    // The filters are written before the storage call that fixes the format, so writes are tagged by the next texImage2D.
    const filterWrites: { format: string; readonly pname: number; readonly value: number }[] = [];
    let untagged: { format: string }[] = [];
    let nextId = 1;
    const constants = new Map<string, number>();
    const constant = (name: string): number => {
      let value = constants.get(name);
      if (value === undefined) {
        value = 0x10000 + constants.size;
        constants.set(name, value);
      }
      return value;
    };
    const overrides: Record<string, unknown> = {
      NEAREST,
      LINEAR,
      TEXTURE_MIN_FILTER,
      TEXTURE_MAG_FILTER,
      NO_ERROR: 0,
      NONE: 0,
      getError: () => 0,
      getExtension: (name: string) => (name === "EXT_color_buffer_float" || (name === "OES_texture_float_linear" && floatLinear) ? {} : null),
      checkFramebufferStatus: () => constant("FRAMEBUFFER_COMPLETE"),
      getParameter: (pname: number) => (pname === constant("MAX_SAMPLES") ? 4 : pname === constant("ACTIVE_TEXTURE") ? constant("TEXTURE0") : null),
      texImage2D: (_target: number, _level: number, internalFormat: number) => {
        const format = internalFormat === constant("RGBA32F") ? "rgba32f" : internalFormat === constant("RGBA16F") ? "rgba16f" : "other";
        for (const write of untagged) write.format = format;
        untagged = [];
      },
      texParameteri: (_target: number, pname: number, value: number) => {
        if (pname !== TEXTURE_MIN_FILTER && pname !== TEXTURE_MAG_FILTER) return;
        const write = { format: "", pname, value };
        filterWrites.push(write);
        untagged.push(write);
      }
    };
    const glDouble = new Proxy({}, {
      get(_target, property) {
        const name = String(property);
        if (name in overrides) return overrides[name];
        if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
        if (name.startsWith("create")) return () => ({ id: nextId++ });
        return () => undefined;
      }
    }) as unknown as WebGL2RenderingContext;
    const canvas = {
      getContext: (type: string) => (type === "webgl2" ? glDouble : null),
      addEventListener() {},
      removeEventListener() {}
    } as unknown as HTMLCanvasElement;
    return { device: WebGL2Device.create({ canvas }), filterWrites };
  }

  it("creates an RGBA32F target with NEAREST filtering when float linear filtering is unavailable", () => {
    const { device, filterWrites } = deviceWith(false);
    device.createRenderTarget({ width: 4, height: 4, format: "rgba32f", depth: false, label: "linear-z" });
    const colour = filterWrites.filter((write) => write.format === "rgba32f");
    expect(colour.length).toBeGreaterThan(0);
    expect(colour.every((write) => write.value === NEAREST)).toBe(true);
  });

  it("creates an RGBA32F target with LINEAR filtering once float linear filtering is available", () => {
    const { device, filterWrites } = deviceWith(true);
    device.createRenderTarget({ width: 4, height: 4, format: "rgba32f", depth: false, label: "linear-z" });
    const colour = filterWrites.filter((write) => write.format === "rgba32f");
    expect(colour.length).toBeGreaterThan(0);
    expect(colour.every((write) => write.value === LINEAR)).toBe(true);
  });

  it("leaves RGBA16F targets on LINEAR filtering", () => {
    const { device, filterWrites } = deviceWith(false);
    device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: false, label: "hdr" });
    const colour = filterWrites.filter((write) => write.format === "rgba16f");
    expect(colour.length).toBeGreaterThan(0);
    expect(colour.every((write) => write.value === LINEAR)).toBe(true);
  });
});
