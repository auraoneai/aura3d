/**
 * PRD-06 T0.10a — `Texture.update` + `WebGL2TextureRegistry` sub-image re-upload.
 * A dynamic texture allocates immutable storage once (`texStorage2D`) and every
 * `update()` re-uploads via `texSubImage2D` on the same WebGL handle — the
 * palette/morph path must never create a second WebGLTexture per key.
 */

import { describe, expect, it } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

function mockGl() {
  const calls = new Map<string, number>();
  const args = new Map<string, unknown[][]>();
  const record = (name: string) => (...params: unknown[]) => {
    calls.set(name, (calls.get(name) ?? 0) + 1);
    const list = args.get(name) ?? [];
    list.push(params);
    args.set(name, list);
  };
  const gl = {
    TEXTURE_2D: 0x0de1,
    TEXTURE_2D_ARRAY: 0x8c1a,
    TEXTURE_CUBE_MAP: 0x8513,
    RGBA32F: 0x8814,
    RGBA16F: 0x881a,
    RGBA8: 0x8058,
    RGBA: 0x1908,
    FLOAT: 0x1406,
    HALF_FLOAT: 0x140b,
    UNSIGNED_BYTE: 0x1401,
    NONE: 0,
    TEXTURE_BASE_LEVEL: 0x813c,
    TEXTURE_MAX_LEVEL: 0x813d,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    SRGB: 0x8c42,
    SRGB8_ALPHA8: 0x8c43,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    BROWSER_DEFAULT_WEBGL: 0x9244,
    createTexture: () => {
      record("createTexture")();
      return {};
    },
    deleteTexture: record("deleteTexture"),
    bindTexture: record("bindTexture"),
    pixelStorei: record("pixelStorei"),
    texParameteri: record("texParameteri"),
    texImage2D: record("texImage2D"),
    texSubImage2D: record("texSubImage2D"),
    texImage3D: record("texImage3D"),
    texSubImage3D: record("texSubImage3D"),
    texStorage2D: record("texStorage2D"),
    texStorage3D: record("texStorage3D"),
    generateMipmap: record("generateMipmap"),
    compressedTexImage2D: record("compressedTexImage2D"),
    getExtension: () => null,
    getParameter: () => 4096
  };
  return { gl: gl as unknown as WebGL2RenderingContext, calls, args };
}

function registryFor(gl: WebGL2RenderingContext) {
  const host = {
    gl,
    stateCache: { invalidate: () => undefined },
    counters: { releasedTextureHandles: 0 },
    textureBudgetPolicy: undefined,
    lifecycle: { readError: () => null }
  } as unknown as WebGL2DeviceHost;
  return new WebGL2TextureRegistry(host);
}

function callCount(calls: Map<string, number>, name: string): number {
  return calls.get(name) ?? 0;
}

describe("Texture.update sub-image upload (T0.10a)", () => {
  it("100 updates on a dynamic texture: one texStorage2D, 100 texSubImage2D, 0 texImage2D, 0 new handles", () => {
    const { gl, calls } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({
      width: 8,
      height: 8,
      format: "rgba32f",
      colorSpace: "linear",
      label: "palette-test",
      dynamic: true
    });
    const handle = registry.getTextureHandle(texture);
    expect(callCount(calls, "createTexture")).toBe(1);
    expect(callCount(calls, "texStorage2D")).toBe(1);
    expect(callCount(calls, "texImage2D")).toBe(0);
    const data = new Float32Array(8 * 8 * 4);
    for (let frame = 0; frame < 100; frame += 1) {
      data.fill(frame);
      texture.update(data);
      expect(registry.getTextureHandle(texture)).toBe(handle);
    }
    expect(callCount(calls, "createTexture")).toBe(1);
    expect(callCount(calls, "texStorage2D")).toBe(1);
    expect(callCount(calls, "texSubImage2D")).toBe(100);
    expect(callCount(calls, "texImage2D")).toBe(0);
  });

  it("region updates forward the pending rectangle to texSubImage2D", () => {
    const { gl, args, calls } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({ width: 8, height: 8, format: "rgba32f", colorSpace: "linear", dynamic: true });
    registry.getTextureHandle(texture);
    texture.update(new Float32Array(2 * 3 * 4), { x: 1, y: 2, width: 2, height: 3 });
    registry.getTextureHandle(texture);
    const call = args.get("texSubImage2D")!.at(-1)!;
    // (target, level, x, y, width, height, format, type, data)
    expect(call.slice(2, 6)).toEqual([1, 2, 2, 3]);
    expect(callCount(calls, "texStorage2D")).toBe(1);
    expect(callCount(calls, "texImage2D")).toBe(0);
  });

  it("2d-array textures allocate texStorage3D once and re-upload per layer via texSubImage3D", () => {
    const { gl, calls } = mockGl();
    const registry = registryFor(gl);
    const layers = 3;
    const texture = new Texture({
      width: 4,
      height: 4,
      layers,
      dimension: "2d-array",
      format: "rgba32f",
      colorSpace: "linear",
      data: new Float32Array(4 * 4 * 4 * layers)
    });
    registry.getTextureHandle(texture);
    expect(callCount(calls, "texStorage3D")).toBe(1);
    expect(callCount(calls, "texSubImage3D")).toBe(layers);
    texture.update(new Float32Array(4 * 4 * 4 * layers));
    registry.getTextureHandle(texture);
    expect(callCount(calls, "texStorage3D")).toBe(1);
    expect(callCount(calls, "texSubImage3D")).toBe(layers * 2);
    expect(callCount(calls, "texImage2D")).toBe(0);
    expect(callCount(calls, "texImage3D")).toBe(0);
  });

  it("2d-array uploads bind TEXTURE_2D_ARRAY first and use a sized internalformat", () => {
    const { gl, args, calls } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({
      width: 4,
      height: 4,
      layers: 2,
      dimension: "2d-array",
      format: "rgba8",
      colorSpace: "linear",
      data: new Uint8Array(4 * 4 * 4 * 2)
    });
    registry.getTextureHandle(texture);
    // A texture object is locked to the first target it binds — texStorage3D
    // on a handle first bound to TEXTURE_2D throws GL_INVALID_OPERATION.
    const firstBind = args.get("bindTexture")![0]!;
    expect(firstBind[0]).toBe(0x8c1a); // TEXTURE_2D_ARRAY
    // texStorage* requires a sized internalformat: RGBA8, not unsized RGBA.
    const storageArgs = args.get("texStorage3D")![0]!;
    expect(storageArgs.slice(0, 4)).toEqual([0x8c1a, 1, 0x8058, 4]); // (target, levels, RGBA8, width)
  });

  it("2d-array update with region.layer offsets texSubImage3D zoffset", () => {
    const { gl, args } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({
      width: 4,
      height: 4,
      layers: 3,
      dimension: "2d-array",
      format: "rgba8",
      colorSpace: "linear",
      data: new Uint8Array(4 * 4 * 4 * 3)
    });
    registry.getTextureHandle(texture);
    texture.update(new Uint8Array(4 * 4 * 4), { x: 0, y: 0, width: 4, height: 4, layer: 2 });
    registry.getTextureHandle(texture);
    const call = args.get("texSubImage3D")!.at(-1)!;
    // (target, level, x, y, zoffset, w, h, depth, format, type, data)
    expect(call[4]).toBe(2);
    expect(call[7]).toBe(1);
  });

  it("non-dynamic textures keep the whole-level texImage2D re-upload stub semantic", () => {
    const { gl, calls } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({
      width: 4,
      height: 4,
      format: "rgba32f",
      colorSpace: "linear",
      data: new Float32Array(4 * 4 * 4)
    });
    registry.getTextureHandle(texture);
    expect(callCount(calls, "texImage2D")).toBe(1);
    texture.update(new Float32Array(4 * 4 * 4));
    registry.getTextureHandle(texture);
    expect(callCount(calls, "texImage2D")).toBe(2);
    expect(callCount(calls, "texSubImage2D")).toBe(0);
  });

  it("update() keeps the data reference (no clone) and validates shape", () => {
    const data = new Float32Array(16);
    const texture = new Texture({ width: 2, height: 2, format: "rgba32f", colorSpace: "linear" });
    const rev = texture.revision;
    texture.update(data);
    expect(texture.data).toBe(data);
    expect(texture.revision).toBe(rev + 1);
    expect(() => texture.update(new Float32Array(8))).toThrow(/exactly 64 bytes/);
    expect(() => texture.update(data, { x: 0, y: 0, width: 4, height: 4 })).toThrow(/region/);
  });
});
