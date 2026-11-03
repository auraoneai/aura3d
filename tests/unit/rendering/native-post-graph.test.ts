import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { PostPassDescriptor, PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import { PostViewHistory, planPostGraph } from "../../../packages/rendering/src/post/PostGraph";
import { PostResources } from "../../../packages/rendering/src/post/PostResources";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import {
  generateSmaaAreaData,
  generateSmaaSearchData,
  SMAA_AREATEX_PNG,
  SMAA_SEARCHTEX_PNG
} from "../../../packages/rendering/src/post/smaa/textures";

const base: PostPipelineOptions = {
  antiAliasing: "off", depthRange: { near: 0.1, far: 100, projection: "perspective" },
  exposure: 1, toneMapping: "aces", dither: false
};
const pass = (id: string, order?: number, inputs: PostPassDescriptor["inputs"] = ["color"]): PostPassDescriptor => ({
  id, owner: "prd03", flag: "A3D_QR_POST", insertAt: "after-tonemap", space: "display",
  inputs, fragment: { glsl: "void main() {}" }, gpuOnly: true, ...(order === undefined ? {} : { order })
});

describe("post graph plan", () => {
  it("matches runtime order, deduplicates ids and schedules authored effects before AA", () => {
    const texture = new Texture({ width: 1, height: 1 });
    const options: PostPipelineOptions = {
      ...base, antiAliasing: "fxaa", customPasses: [pass("late", 10), pass("first", -2), pass("late", -3), pass("last")],
      nativeEffects: [
        { kind: "mask", texture, opacity: 1, invert: false },
        { kind: "pixelation", size: 4 },
        { kind: "clear-mask" },
        { kind: "afterimage", decay: 0.5 }
      ]
    };
    const names = planPostGraph(options, { width: 100, height: 50 }).stages.map((stage) => stage.name);
    expect(names.filter((name) => ["first", "late", "last"].includes(name))).toEqual(["first", "late", "last"]);
    expect(names.indexOf("last")).toBeLessThan(names.indexOf("native-0-mask"));
    expect(names.filter((name) => name.startsWith("native-"))).toEqual([
      "native-0-mask", "native-1-pixelation", "native-2-clear-mask", "native-3-afterimage"
    ]);
    expect(names.indexOf("native-3-afterimage")).toBeLessThan(names.indexOf("S11-post-aa"));
  });

  it("validates backend source, required inputs, frame dimensions and borrowed textures", () => {
    const custom = pass("needs-depth", 0, ["color", "depth"]);
    expect(() => planPostGraph({ ...base, customPasses: [custom] }, { width: 64, height: 64, availableInputs: ["color"] }))
      .toThrow("POSTPROCESS_INPUT_UNAVAILABLE:needs-depth:depth");
    expect(() => planPostGraph({ ...base, customPasses: [custom] }, { width: 64, height: 64, backend: "webgpu" }))
      .toThrow("POSTPROCESS_SHADER_UNAVAILABLE:needs-depth:webgpu");
    expect(() => planPostGraph(base, { width: 0, height: 1 })).toThrow("POSTPROCESS_FRAME_SIZE_INVALID");
    const texture = new Texture({ width: 1, height: 1 });
    const withMask: PostPipelineOptions = { ...base, nativeEffects: [{ kind: "mask", texture, invert: false, opacity: 1 }] };
    expect(planPostGraph(withMask, { width: 4, height: 4 }).stages.some((stage) => stage.name === "native-0-mask")).toBe(true);
    expect(texture.disposed).toBe(false);
    texture.dispose();
    expect(() => planPostGraph(withMask, { width: 4, height: 4 })).toThrow("POSTPROCESS_INPUT_UNAVAILABLE:mask:texture");
  });
});

describe("post view history lifetime", () => {
  it("keeps previous frames isolated across apps, views and effects; commits once per frame", () => {
    const history = new PostViewHistory<{ id: number }>();
    let next = 0;
    const released: number[] = [];
    const allocate = () => ({ id: next++ });
    const release = (target: { id: number }) => released.push(target.id);
    const app = {}, otherApp = {};
    const input = { scopeId: app, viewId: "left", effectIndex: 0, frameId: 1, width: 20, height: 10 };
    const first = history.begin(input, allocate, release);
    expect(first.read).toBeNull();
    first.commit();
    first.commit();
    const duplicate = history.begin(input, allocate, release);
    expect(duplicate.read).toBeNull();
    expect(duplicate.write).toBe(first.write);
    const right = history.begin({ ...input, viewId: "right" }, allocate, release);
    const other = history.begin({ ...input, scopeId: otherApp }, allocate, release);
    const secondEffect = history.begin({ ...input, effectIndex: 1 }, allocate, release);
    expect(new Set([first.write, right.write, other.write, secondEffect.write]).size).toBe(4);
    const nextFrame = history.begin({ ...input, frameId: 2 }, allocate, release);
    expect(nextFrame.read).toBe(first.write);
    expect(nextFrame.read).not.toBe(nextFrame.write);
    expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => history.begin(input, allocate, release)).toThrow("POST_HISTORY_FRAME_OUT_OF_ORDER");
    history.resetView(app, "left");
    expect(() => nextFrame.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(released).toHaveLength(4);
    expect(history.begin({ ...input, viewId: "right", frameId: 2 }, allocate, release).read).toBeNull();
    history.dispose();
    history.dispose();
    expect(released).toHaveLength(8);
    expect(new Set(released).size).toBe(8);
    expect(() => history.begin(input, allocate, release)).toThrow("POST_HISTORY_DISPOSED");
  });

  it("invalidates on cuts, resize and device generation and cleans up failed allocation", () => {
    const history = new PostViewHistory<{ id: number }>();
    let next = 0;
    const released: number[] = [];
    const allocate = () => ({ id: next++ });
    const release = (target: { id: number }) => released.push(target.id);
    const frame = { scopeId: {}, viewId: 1, effectIndex: 0, frameId: 1, width: 8, height: 8, deviceGeneration: 1 };
    history.begin(frame, allocate, release).commit();
    expect(history.begin({ ...frame, frameId: 2 }, allocate, release).read).not.toBeNull();
    const cut = { ...frame, frameId: 3, cameraCut: true };
    const cutLease = history.begin(cut, allocate, release);
    expect(cutLease.read).toBeNull();
    expect(history.begin(cut, allocate, release).write).toBe(cutLease.write);
    expect(released).toHaveLength(2);
    history.begin({ ...frame, frameId: 4, width: 16 }, allocate, release);
    history.begin({ ...frame, frameId: 5, width: 16, deviceGeneration: 2 }, allocate, release);
    expect(released).toHaveLength(6);
    let attempts = 0;
    expect(() => history.begin({ ...frame, effectIndex: 1 }, () => {
      if (++attempts === 2) throw new Error("allocation failure");
      return { id: next++ };
    }, release)).toThrow("allocation failure");
    expect(released).toHaveLength(7);
    history.dispose();
    expect(released).toHaveLength(9);
  });

  it("drops failed writes and retires one complete scope without touching others", () => {
    const history = new PostViewHistory<{ value: number }>();
    const released: { value: number }[] = [];
    const allocate = () => ({ value: 0 });
    const release = (target: { value: number }) => released.push(target);
    const scopeId = {}, otherScope = {};
    const frame = { scopeId, viewId: "v", effectIndex: 0, frameId: 1, width: 2, height: 2 };
    const first = history.begin(frame, allocate, release);
    first.write.value = 7; first.commit();
    const second = history.begin({ ...frame, frameId: 2 }, allocate, release);
    expect(second.read?.value).toBe(7);
    second.write.value = 12; second.commit();
    // A second write may partially overwrite a previously committed target.
    const repeated = history.begin({ ...frame, frameId: 2 }, allocate, release);
    repeated.write.value = -1; repeated.abort();
    const third = history.begin({ ...frame, frameId: 3 }, allocate, release);
    expect(third.read).toBeNull();
    third.write.value = 19; third.commit();
    expect(history.begin({ ...frame, frameId: 4 }, allocate, release).read?.value).toBe(19);
    const other = history.begin({ ...frame, scopeId: otherScope }, allocate, release);
    expect(() => history.begin({ ...frame, frameId: 4, width: 4 }, allocate, release)).toThrow("POST_HISTORY_FRAME_CONFLICT");
    history.resetScope(scopeId);
    expect(released).toHaveLength(2);
    expect(() => third.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    other.commit();
    expect(history.begin({ ...frame, scopeId: otherScope, frameId: 2 }, allocate, release).read).toBe(other.write);
    history.dispose();
    expect(released).toHaveLength(4);
  });

  it("invalidates leases and attempts every release when disposal fails", () => {
    const history = new PostViewHistory<{ id: number }>();
    const attempts: number[] = [];
    let sequence = 0;
    let fail = true;
    const frame = { scopeId: {}, viewId: "v", effectIndex: 0, frameId: 1, width: 2, height: 2 };
    const first = history.begin(frame, () => ({ id: sequence++ }), target => {
      attempts.push(target.id);
      if (target.id === 0 && fail) throw new Error("release failed");
    });
    history.begin({ ...frame, effectIndex: 1 }, () => ({ id: sequence++ }), target => { attempts.push(target.id); });
    expect(() => history.resetScope(frame.scopeId)).toThrow(/Post history target disposal failed/);
    expect(attempts).toEqual([0, 1, 2, 3]);
    expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => history.dispose()).toThrow(/Post history target disposal failed/);
    fail = false;
    history.dispose();
    expect(attempts).toEqual([0, 1, 2, 3, 0, 0]);
  });
});

it("retires post targets on device loss and forbids reuse after disposal", () => {
  const device = new MockRenderDevice();
  const resources = new PostResources(device, { values: {}, on: () => false });
  const key = { width: 4, height: 4, format: "rgba8", samples: 1 as const, depth: false };
  const beforeLoss = resources.acquire(key);
  resources.release(beforeLoss);
  device.contextLost = true;
  expect(() => resources.acquire(key)).toThrow(/device is lost/);
  expect(beforeLoss.disposed).toBe(true);
  device.contextLost = false;
  const afterLoss = resources.acquire(key);
  expect(afterLoss).not.toBe(beforeLoss);
  resources.dispose();
  expect(afterLoss.disposed).toBe(true);
  expect(() => resources.acquire(key)).toThrow(/disposed/);
  device.dispose();
});

function decodeGrayscalePng(url: string): { width: number; height: number; pixels: Uint8Array } {
  const png = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let width = 0, height = 0;
  const data: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    const kind = png.toString("ascii", offset + 4, offset + 8);
    const bytes = png.subarray(offset + 8, offset + 8 + size);
    if (kind === "IHDR") { width = bytes.readUInt32BE(0); height = bytes.readUInt32BE(4); expect(bytes[8]).toBe(8); expect(bytes[9]).toBe(0); }
    if (kind === "IDAT") data.push(bytes);
    offset += 12 + size;
  }
  const decoded = inflateSync(Buffer.concat(data));
  expect(decoded[0]).toBe(0);
  return { width, height, pixels: decoded.subarray(1) };
}

it("generates and encodes the independent morphological lookup tables exactly", () => {
  const area = generateSmaaAreaData(), search = generateSmaaSearchData();
  for (let b = 0; b <= 8; b += 1) for (let a = 0; a <= 8; a += 1) {
    expect(area[a + 9 * b]).toBe(Math.round(510 * (Math.min(a, b) + 0.5) / (a + b + 1)));
    expect(area[a + 9 * b]).toBe(area[b + 9 * a]);
  }
  expect([...search]).toEqual(Array.from({ length: 256 }, (_, i) => i));
  const areaPng = decodeGrayscalePng(SMAA_AREATEX_PNG), searchPng = decodeGrayscalePng(SMAA_SEARCHTEX_PNG);
  expect([areaPng.width, areaPng.height]).toEqual([81, 1]);
  expect([searchPng.width, searchPng.height]).toEqual([256, 1]);
  expect([...areaPng.pixels]).toEqual([...area]);
  expect([...searchPng.pixels]).toEqual([...search]);
});
