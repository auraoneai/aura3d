/**
 * 5.7.0 behaviour change (lessons-learned M18, future-engine-work F1): the transform setters and getters of a runtime
 * node handle nested inside a group are parent-local, for models (static and skinned) exactly as for primitives,
 * groups, runtime-added children and three.js `Object3D.position`.
 *
 * Before 5.7.0 a model or primitive with a runtime id that was authored inside a group got a "world-facing" handle:
 * `setPosition(1, 0, 0)` placed it at world (1, 0, 0) instead of one metre along the parent's +X, and `position`
 * read back the world position. Games fed those handles a local offset (Bellkeeper's keeper, Splat Turf and
 * Saltwind's drivers), so the rig landed near the world origin.
 *
 * Every case goes through the public API and the real compiler, render-input and Renderer on a capturing mock
 * device: `scene().add(group(...).add(model(...)))`, `app.nodes.require(id).setPosition(...)`, then the drawn model
 * matrix is compared with an independently composed `parentWorld x local`.
 */
import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraApp } from "../../../packages/engine/src/agent-api/app/createAuraApp";
import { camera, defineModelAssets, group, instances, material, model, primitives, scene } from "../../../packages/engine/src/public/index";
import type { AuraApp } from "../../../packages/engine/src/agent-api/nodes/types";
import type { AuraSceneBuilder } from "../../../packages/engine/src/agent-api/nodes/scene";
import { MockRenderBuffer, MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry, runtimeNodeParentedWorldPose, setRuntimeNodeParentedWorldPose } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { flattenAuraSceneSnapshot } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createGameSceneBridge } from "../../../packages/engine/src/agent-api/GameSceneBridge";
import { findRuntimeTarget, subjectFromHandle } from "../../../packages/engine/src/agent-api/camera/subject";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

type V3 = readonly [number, number, number];
type Mat = number[];

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

interface CapturedDraw { readonly label: string; readonly model: Mat | null; readonly skinned: boolean; readonly instances: readonly Mat[] }

/** Snapshot the model matrix and instance matrices at submission, before the storage is reused. */
class CapturingDevice extends MockRenderDevice {
  readonly submitted: CapturedDraw[] = [];
  override draw(command: DrawCommand): void {
    const uniform = command.uniforms?.get("u_modelMatrix");
    const modelMatrix = uniform instanceof Float32Array || Array.isArray(uniform) ? Array.from(uniform as ArrayLike<number>) : null;
    const skinned = [...(command.uniforms?.keys() ?? [])].some((name) => /joint|bone|skin/i.test(name));
    const columns = [0, 1, 2, 3].map((index) => command.instanceAttributes?.find((attribute) => attribute.shaderName === `a_instanceMatrix${index}`));
    const matrices: Mat[] = [];
    if (columns.every((column) => column?.buffer instanceof MockRenderBuffer)) {
      for (let instance = 0; instance < (command.instanceCount ?? 1); instance += 1) {
        const matrix: number[] = [];
        for (const column of columns) {
          const bytes = (column!.buffer as MockRenderBuffer).bytes;
          const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          for (let row = 0; row < 4; row += 1) matrix.push(data.getFloat32(column!.offset + instance * column!.stride + row * 4, true));
        }
        matrices.push(matrix);
      }
    }
    this.submitted.push({ label: command.label ?? "", model: modelMatrix, skinned, instances: matrices });
    super.draw(command);
  }
}

/** A one-triangle glTF; `skinned` adds one joint (identity inverse bind) that every vertex follows with weight 1. */
function triangleDocument(skinned: boolean): Uint8Array {
  const parts: Buffer[] = [];
  const views: { buffer: 0; byteOffset: number; byteLength: number }[] = [];
  const add = (data: Float32Array | Uint16Array): number => {
    const offset = parts.reduce((sum, part) => sum + part.length, 0);
    const padding = (4 - offset % 4) % 4;
    if (padding) parts.push(Buffer.alloc(padding));
    views.push({ buffer: 0, byteOffset: offset + padding, byteLength: data.byteLength });
    parts.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    return views.length - 1;
  };
  const positions = add(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]));
  const normals = add(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]));
  const accessors: Record<string, unknown>[] = [
    { bufferView: positions, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, 0, 0], max: [0.5, 1, 0] },
    { bufferView: normals, componentType: 5126, count: 3, type: "VEC3" }
  ];
  if (skinned) {
    accessors.push(
      { bufferView: add(new Uint16Array(12)), componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])), componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: add(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])), componentType: 5126, count: 1, type: "MAT4" }
    );
  }
  const binary = Buffer.concat(parts);
  const document = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.length, uri: `data:application/octet-stream;base64,${binary.toString("base64")}` }],
    bufferViews: views,
    accessors,
    meshes: [{ primitives: [{ attributes: skinned ? { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 } : { POSITION: 0, NORMAL: 1 } }] }],
    nodes: skinned ? [{ name: "Mesh", mesh: 0, skin: 0 }, { name: "Hips" }] : [{ mesh: 0 }],
    ...(skinned ? { skins: [{ joints: [1], inverseBindMatrices: 4 }] } : {}),
    scenes: [{ nodes: skinned ? [0, 1] : [0] }],
    scene: 0
  };
  return new TextEncoder().encode(JSON.stringify(document));
}

const documents = { prop: triangleDocument(false), rig: triangleDocument(true) } as const;

function modelAssets() {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("location", { origin: "https://scene.example.test", href: "https://scene.example.test/", search: "" });
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("data:")) return originalFetch(input, init);
    const name = new URL(url, "https://scene.example.test/").pathname.replace(/^\/|\.gltf$/g, "") as keyof typeof documents;
    const document = documents[name];
    if (!document) throw new Error(`Unexpected model fixture request: ${url}`);
    return new Response(document.slice().buffer as ArrayBuffer, { headers: { "content-type": "model/gltf+json" } });
  }));
  return defineModelAssets({
    prop: { url: "/prop.gltf", sha256: createHash("sha256").update(documents.prop).digest("hex") },
    rig: { url: "/rig.gltf", sha256: createHash("sha256").update(documents.rig).digest("hex") }
  }, { queryParam: null }).refs;
}

async function harness(build: (assets: ReturnType<typeof modelAssets>) => AuraSceneBuilder, kind: "webgl2" | "webgpu" = "webgl2") {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "https://scene.example.test/", search: "" }, addEventListener() {}, removeEventListener() {} });
  const assets = modelAssets();
  const devices: CapturingDevice[] = [];
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const device = new CapturingDevice();
    Object.defineProperty(device, "kind", { value: kind });
    Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets", ...(kind === "webgpu" ? ["native-render-pipeline", "canvas-surface"] : [])] } });
    devices.push(device);
    return new Renderer(device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
  });
  const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    scene: build(assets), autoStart: false, resize: false, renderer: { backend: kind },
    qualityRebuild: { flags: { A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false, A3D_QR_VFX: false }, allowUrlFlags: false }
  });
  await app.readyStrict({ stage: "first-frame" });
  return { app, device: devices[devices.length - 1]! };
}

/** Step one frame and return the last submitted draw whose label names `name`, once its model has loaded. */
/** Models draw as `actor-<i>:mesh-<j>:<mesh>` items, primitives as `primitive-<i>:<resource>:<node name>`. */
const isDraw = (name: string) => (label: string): boolean => name === "actor" ? label.startsWith("actor-") : label.endsWith(`:${name}`);

/** Step one frame and return the last submitted draw for `name` ("actor" for the scene's one model), once loaded. */
async function drawn(app: AuraApp, device: CapturingDevice, name: string): Promise<CapturedDraw> {
  let draw: CapturedDraw | undefined;
  await vi.waitFor(() => {
    device.submitted.length = 0;
    app.step(0);
    draw = device.submitted.filter((entry) => isDraw(name)(entry.label) && entry.model !== null).at(-1);
    expect(draw?.model, `expected a submitted draw for ${name}`).toHaveLength(16);
  }, { timeout: 3000 });
  return draw!;
}

function drawFor(device: CapturingDevice, predicate: (label: string) => boolean): CapturedDraw {
  const draw = device.submitted.filter((entry) => predicate(entry.label) && entry.model !== null).at(-1);
  expect(draw?.model, "expected a submitted draw").toHaveLength(16);
  return draw!;
}

// ---- independent column-major math (no engine imports) ----
function multiply(a: readonly number[], b: readonly number[]): Mat {
  return Array.from({ length: 16 }, (_, index) => {
    const row = index % 4, column = Math.floor(index / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row]! * b[column * 4 + k]!, 0);
  });
}
/** T · Rz · Ry · Rx · S (Aura3D's default "ZYX" Euler order, three.js's default). */
function trs(position: V3, rotation: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): Mat {
  const [x, y, z] = rotation;
  const rx = [1, 0, 0, 0, 0, Math.cos(x), Math.sin(x), 0, 0, -Math.sin(x), Math.cos(x), 0, 0, 0, 0, 1];
  const ry = [Math.cos(y), 0, -Math.sin(y), 0, 0, 1, 0, 0, Math.sin(y), 0, Math.cos(y), 0, 0, 0, 0, 1];
  const rz = [Math.cos(z), Math.sin(z), 0, 0, -Math.sin(z), Math.cos(z), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const s = [scale[0], 0, 0, 0, 0, scale[1], 0, 0, 0, 0, scale[2], 0, 0, 0, 0, 1];
  const t = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, position[0], position[1], position[2], 1];
  return multiply(t, multiply(rz, multiply(ry, multiply(rx, s))));
}
function closeMatrix(actual: readonly number[] | null, expected: readonly number[], tolerance = 1e-5): void {
  expect(actual).toHaveLength(16);
  const worst = Math.max(...expected.map((value, index) => Math.abs(value - actual![index]!)));
  expect(worst, `max |drawn - expected| for\n drawn    ${actual!.map((v) => v.toFixed(4)).join(",")}\n expected ${expected.map((v) => v.toFixed(4)).join(",")}`).toBeLessThanOrEqual(tolerance);
}
function closeVector(actual: ArrayLike<number>, expected: readonly number[], tolerance = 1e-5): void {
  expected.forEach((value, index) => expect(Math.abs(actual[index]! - value), `component ${index}: ${actual[index]} vs ${value}`).toBeLessThanOrEqual(tolerance));
}

const CAMERA = camera.perspective({ position: [0, 6, 40], target: [0, 0, 0], fov: 60 });
const PARENT = { position: [6, 1, -2] as V3, rotation: [0, Math.PI / 2, 0] as V3, scale: [2, 2, 2] as V3 };
const parentWorld = (pose = PARENT) => trs(pose.position, pose.rotation, pose.scale);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("nested runtime node handles are parent-local (5.7.0)", () => {
  const kinds = [
    { label: "static model", nodeName: "actor", build: (a: ReturnType<typeof modelAssets>) => model(a.prop, { name: "prop-node", scaleMode: "world" }) },
    { label: "skinned (rigged) model", nodeName: "actor", build: (a: ReturnType<typeof modelAssets>) => model(a.rig, { name: "rig-node", scaleMode: "world" }) },
    { label: "primitive (contrast)", nodeName: "box-node", build: () => primitives.box({ name: "box-node", size: [1, 1, 1], material: material.pbr({ color: "#a05030" }) }) }
  ] as const;

  for (const kind of kinds) {
    it(`${kind.label}: setPosition/setRotation/setScale on the nested handle are parent-local and the draw is parentWorld x local`, async () => {
      const h = await harness((assets) => scene({ camera: CAMERA })
        .add(group("vehicle", [kind.build(assets).position(1, 0.5, 0).runtime({ id: "child" })], PARENT).runtime({ id: "vehicle" })));
      try {
        const child = h.app.nodes.require("child");
        // authored local transform reads back as authored, the world query composes the parent
        closeVector(child.position, [1, 0.5, 0]);
        const authoredWorld = multiply(parentWorld(), trs([1, 0.5, 0]));
        closeVector(child.getWorldPosition(), authoredWorld.slice(12, 15));
        closeMatrix((await drawn(h.app, h.device, kind.nodeName)).model, authoredWorld);

        child.setPosition(0, 1.25, 0.5).setRotation(0, 0.3, 0).setScale(0.8);
        closeVector(child.position, [0, 1.25, 0.5]);
        closeVector(child.rotation, [0, 0.3, 0]);
        const expected = multiply(parentWorld(), trs([0, 1.25, 0.5], [0, 0.3, 0], [0.8, 0.8, 0.8]));
        closeVector(child.getWorldPosition(), expected.slice(12, 15));
        const draw = await drawn(h.app, h.device, kind.nodeName);
        closeMatrix(draw.model, expected);
        if (kind.label.startsWith("skinned")) expect(draw.skinned, "the rigged model draws through the skinning path").toBe(true);

        // translate and setTransform are parent-local too
        child.translate(0.5, 0, 0);
        closeVector(child.position, [0.5, 1.25, 0.5]);
        child.setTransform({ position: [-1, 0, 0], rotation: [0, 0, 0], scale: 1 });
        closeMatrix((await drawn(h.app, h.device, kind.nodeName)).model, multiply(parentWorld(), trs([-1, 0, 0])));
      } finally { await h.app.disposeAsync(); }
    });
  }

  it("a moving parent carries a nested rig whose handle is fed a local seat offset every frame (the M18 pattern)", async () => {
    const h = await harness((assets) => scene({ camera: CAMERA })
      .add(group("kart", [
        model(assets.rig, { name: "driver-rig", scaleMode: "world" }).runtime({ id: "driver" }),
        primitives.box({ name: "seat-box", size: [0.4, 0.4, 0.4] }).runtime({ id: "seat" })
      ]).runtime({ id: "kart" })));
    try {
      const kart = h.app.nodes.require("kart"), driver = h.app.nodes.require("driver"), seat = h.app.nodes.require("seat");
      await drawn(h.app, h.device, "actor");
      for (let frame = 0; frame < 6; frame += 1) {
        const pose = { position: [frame * 3, 0.2 * frame, -frame] as V3, rotation: [0, frame * 0.4, 0] as V3, scale: [1, 1, 1] as V3 };
        const bob = 0.05 * Math.sin(frame);
        kart.setPosition(...pose.position).setRotation(...pose.rotation);
        driver.setPosition(0, 0.6 + bob, -0.2).setRotation(0, 0.1 * frame, 0);
        seat.setPosition(0, 0.3, -0.2);
        h.device.submitted.length = 0;
        h.app.step(1 / 60);
        const kartWorld = parentWorld(pose);
        closeMatrix(drawFor(h.device, isDraw("actor")).model, multiply(kartWorld, trs([0, 0.6 + bob, -0.2], [0, 0.1 * frame, 0])));
        closeMatrix(drawFor(h.device, isDraw("seat-box")).model, multiply(kartWorld, trs([0, 0.3, -0.2], [0, 0, 0], [0.4, 0.4, 0.4])));
        closeVector(driver.position, [0, 0.6 + bob, -0.2]);
      }
    } finally { await h.app.disposeAsync(); }
  });

  it("a nested model and a runtime-added child under the same parent share one convention", async () => {
    const h = await harness((assets) => scene({ camera: CAMERA })
      .add(group("parent", [model(assets.prop, { name: "authored-prop", scaleMode: "world" }).runtime({ id: "authored" })], PARENT).runtime({ id: "parent" })));
    try {
      await drawn(h.app, h.device, "actor");
      const added = h.app.nodes.add!(primitives.box({ name: "added-box", size: [1, 1, 1] }).runtime({ id: "added" }), { parent: "parent" });
      const authored = h.app.nodes.require("authored");
      for (const handle of [authored, added]) handle.setPosition(2, 0, 0);
      closeVector(authored.getWorldPosition(), added.getWorldPosition());
      closeVector(authored.position, added.position);
      closeMatrix((await drawn(h.app, h.device, "actor")).model, multiply(parentWorld(), trs([2, 0, 0])));
    } finally { await h.app.disposeAsync(); }
  });

  it("a top-level rig (the pre-5.7 workaround) still takes world coordinates", async () => {
    const h = await harness((assets) => scene({ camera: CAMERA })
      .add(model(assets.rig, { name: "solo-rig", scaleMode: "world" }).runtime({ id: "solo" })));
    try {
      h.app.nodes.require("solo").setPosition(4, 1, 2).setRotation(0, 0.5, 0);
      closeMatrix((await drawn(h.app, h.device, "actor")).model, trs([4, 1, 2], [0, 0.5, 0]));
    } finally { await h.app.disposeAsync(); }
  });

  it("F3: setInstanceMatrices on a primitive or model batch under a static (id-less) translated group keeps the parent", async () => {
    const dense = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 5, 1]);
    const h = await harness((assets) => scene({ camera: CAMERA }).add(group("yard", [
      instances.box({ name: "crates", size: [1, 1, 1], transforms: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] }).runtime({ id: "crates" }),
      instances.model(assets.prop, { name: "props", scaleMode: "world", transforms: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] }).runtime({ id: "props" })
    ], { position: [10, 0, 0] })));
    try {
      await drawn(h.app, h.device, "actor");
      for (const id of ["crates", "props"]) h.app.nodes.require(id).setInstanceMatrices(dense, 2);
      h.device.submitted.length = 0;
      h.app.step(0);
      for (const name of ["crates", "actor"]) {
        const draw = h.device.submitted.filter((entry) => isDraw(name)(entry.label) && entry.instances.length === 2).at(-1);
        expect(draw, `instanced draw for ${name}`).toBeDefined();
        const origins = draw!.instances.map((instance) => multiply(draw!.model!, instance).slice(12, 15));
        closeVector(origins[0]!, [13, 0, 0]);
        closeVector(origins[1]!, [10, 0, 5]);
      }
    } finally { await h.app.disposeAsync(); }
  });

  it("the WebGPU device path draws the nested rig at the same parentWorld x local matrix", async () => {
    const h = await harness((assets) => scene({ camera: CAMERA })
      .add(group("vehicle", [model(assets.rig, { name: "gpu-rig", scaleMode: "world" }).runtime({ id: "child" })], PARENT).runtime({ id: "vehicle" })), "webgpu");
    try {
      h.app.nodes.require("child").setPosition(0, 1, 0);
      closeMatrix((await drawn(h.app, h.device, "actor")).model, multiply(parentWorld(), trs([0, 1, 0])));
    } finally { await h.app.disposeAsync(); }
  });
});

/**
 * Engine helpers that publish or read WORLD poses keep doing so for nested model/primitive handles (they relied on the
 * world-facing setters before 5.7.0): game body sync, camera subjects, bone-attachment targets.
 */
describe("world-space engine helpers on a nested handle", () => {
  const flags = resolveQrFlags({ options: ["core"], env: {} });
  function mounted() {
    const authored = scene({ camera: CAMERA }).add(group("rig", [
      primitives.box({ name: "nested-box" }).position(1, 0, 0).runtime({ id: "nested" })
    ], PARENT).runtime({ id: "rig" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(flattenAuraSceneSnapshot(authored, flags), { flags }, authored);
    return { registry, handle: registry.require("nested") };
  }

  it("createGameSceneBridge().syncBody writes the world body pose through the parent", () => {
    const { registry, handle } = mounted();
    try {
      const bridge = createGameSceneBridge({ nodes: registry as never });
      expect(bridge.syncBody("nested", { position: [3, 4, 5], facing: -1 } as never)).toBe(true);
      closeVector(handle.getWorldPosition(), [3, 4, 5]);
      // world yaw PI under the parent's +90 deg yaw is a local yaw of +90 deg
      const q = handle.getWorldQuaternion();
      expect(Math.abs(q[1])).toBeCloseTo(1, 5);
      registry.require("rig").setPosition(0, 0, 0);
      expect(handle.getWorldPosition()[1]).not.toBeCloseTo(4, 3); // it is a child: it follows the parent afterwards
    } finally { registry.dispose(); }
  });

  it("camera subjects and runtime targets frame the nested node's world pose", () => {
    const { registry, handle } = mounted();
    try {
      handle.setPosition(0, 1, 0);
      const world = handle.getWorldPosition();
      closeVector(subjectFromHandle(handle as never).position, world);
      closeVector(findRuntimeTarget(registry as never, "nested")!.position, world);
      closeVector(findRuntimeTarget(registry as never, "rig")!.position, PARENT.position); // a group reads as before
    } finally { registry.dispose(); }
  });

  it("setRuntimeNodeParentedWorldPose solves the local pose; top-level and group handles are left to their own setters", () => {
    const { registry, handle } = mounted();
    try {
      expect(setRuntimeNodeParentedWorldPose(handle, { position: [7, 1, 2], quaternion: [0, 0, 0, 1], scale: 1 })).toBe(true);
      closeVector(handle.getWorldPosition(), [7, 1, 2]);
      closeVector(handle.getWorldQuaternion(), [0, 0, 0, 1]);
      closeVector(handle.getWorldScale(), [1, 1, 1]);
      closeVector(handle.scale as V3, [0.5, 0.5, 0.5]);
      expect(setRuntimeNodeParentedWorldPose(registry.require("rig"), { position: [0, 0, 0] })).toBe(false);
      expect(runtimeNodeParentedWorldPose(registry.require("rig"))).toBeUndefined();
    } finally { registry.dispose(); }
  });
});
