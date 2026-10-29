/**
 * Audit lane E3 (live-games 4.5.0 audit, 2026-10-29): shadows and instancing.
 *
 * SI-1  instanced nodes chose one sun cascade from the node centre, so a pool spread along the view axis sampled cascade 0 and every
 *       instance outside cascade 0 rendered unshadowed. Now an instanced item samples the cascade holding most of its instance centres.
 * SI-2  the per-instance frustum cull allocated fresh output arrays on every call; it now reuses scratch buffers.
 * SI-5  skipped cascades are now in the `shadows` diagnostics row of the sun.
 * SI-6  dense (attribute-mode) depth draws created and disposed a vertex buffer per caster per cascade per frame; the buffer is now
 *       persistent per caster, and VAO eviction unlinks only the buffers a VAO references.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { DirectionalLight, PerspectiveCamera, identityMat4, lookAtMat4, multiplyMat4 } from "@aura3d/scene";
import { MockRenderDevice, type DrawCommand, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { CollectedLight } from "../../../packages/rendering/src/LightCollector";
import type { ForwardShadowMapOptions } from "../../../packages/rendering/src/ForwardPass";
import {
  forwardCascadePosition,
  forwardCenterCascadePosition,
  forwardInstanceCascadeCoverage,
  selectForwardShadowMap
} from "../../../packages/rendering/src/forward/Lighting";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { unusedCascadeIndices } from "../../../packages/rendering/src/shadows/CascadeUse";
import { prd02ShadowDiagnostics } from "../../../packages/rendering/src/shadows/Prd02ShadowsContributor";
import { cullInstancesToFrustum } from "../../../packages/rendering/src/renderer/InstanceFrustumCull";
import { DepthPass, depthInstanceBufferCount, DEPTH_INSTANCE_BUFFER_CACHE_LIMIT } from "../../../packages/rendering/src/DepthPass";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";
import { WebGL2Buffer } from "../../../packages/rendering/src/WebGL2Device";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { RenderShaderProgram } from "../../../packages/rendering/src/RenderDevice";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { prd02DepthFeatures, ensurePrd02DepthFeatures, registerPrd02DepthShader } from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import type { ShadowCasterVariantKey } from "../../../packages/rendering/src/contracts/shadows";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({ options: ["none"] });
afterEach(() => setRendererQrFlags(BASE));

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function translation(x: number, y: number, z: number): Float32Array<ArrayBuffer> {
  const m = Float32Array.from(identityMat4());
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

/** Instance matrices at the given world positions (unit scale). */
function instancesAt(points: readonly (readonly [number, number, number])[]): Float32Array {
  const out = new Float32Array(points.length * 16);
  points.forEach((p, i) => out.set(translation(p[0], p[1], p[2]), i * 16));
  return out;
}

/** Column-major ortho box mapping world [x0,x1]×[y0,y1]×[z0,z1] to clip -1..1 on every axis (a stand-in for a cascade's light VP). */
function boxMatrix(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 2 / (x1 - x0); m[5] = 2 / (y1 - y0); m[10] = 2 / (z1 - z0); m[15] = 1;
  m[12] = -(x1 + x0) / (x1 - x0); m[13] = -(y1 + y0) / (y1 - y0); m[14] = -(z1 + z0) / (z1 - z0);
  return m;
}

// Camera at the origin looking down -z (identity view): view depth = -z. Three cascades split at 13.4 / 34.8 / 150 like live Aura Links,
// each light box holding its own depth slice (plus a little margin) across x ∈ [-60, 60].
const SPLITS = [13.4, 34.8, 150] as const;
const BOXES = [boxMatrix(-60, 60, -20, 40, -15, 1), boxMatrix(-60, 60, -20, 40, -37, 1), boxMatrix(-60, 60, -20, 40, -152, 1)];
const VIEW = Float32Array.from(identityMat4());
const tagged = (i: number) => ({ tag: i, lightMatrix: BOXES[i]! }) as unknown as Omit<ForwardShadowMapOptions, "cascades">;
const CASCADES = SPLITS.map((far, i) => ({ index: i, near: i === 0 ? 0 : SPLITS[i - 1]!, far, shadowMap: tagged(i) }));
const MAP = { cascades: CASCADES } as unknown as ForwardShadowMapOptions;
const pickedTag = (item: RenderItem) => (selectForwardShadowMap(MAP, item, VIEW, [0, 0, 0]) as unknown as { tag: number }).tag;

function pool(points: readonly (readonly [number, number, number])[], model = Float32Array.from(identityMat4())): RenderItem {
  return { geometry: Geometry.litCube(1), modelMatrix: model, instanceTransforms: instancesAt(points), label: "conifers" } as unknown as RenderItem;
}

/** Conifer-like pool: a node at the world origin with instances from 20.5 m to 140 m down the view axis. */
const SPREAD = Array.from({ length: 63 }, (_, i) => [((i * 37) % 80) - 40, 0, -(20.5 + i * 1.9)] as const);

describe("SI-1: instanced items select the cascade from their instances", () => {
  it("a pool centred on the origin but spread over 20-140 m samples the cascade that holds it, not cascade 0", () => {
    const item = pool(SPREAD);
    // The old rule: the node centre (origin) has view depth ~0, so cascade 0 (0-13.4 m) — none of the instances is inside it.
    expect(forwardCenterCascadePosition(CASCADES, item, VIEW, [0, 0, 0])).toBe(0);
    const coverage = forwardInstanceCascadeCoverage(item, BOXES, false)!;
    expect(coverage.counts[0]).toBe(0);
    expect(coverage.counts[2]).toBe(SPREAD.length);
    expect(pickedTag(item)).toBe(2);
  });

  it("a tight pool inside cascade 0 keeps cascade 0 (ties go to the sharper cascade)", () => {
    const tight = pool(Array.from({ length: 20 }, (_, i) => [i - 10, 0, -(2 + (i % 8))] as const));
    expect(pickedTag(tight)).toBe(0);
  });

  it("a pool straddling 0 and 1 picks cascade 1, which holds all of it", () => {
    const straddle = pool(Array.from({ length: 30 }, (_, i) => [0, 0, -(5 + i)] as const));
    const coverage = forwardInstanceCascadeCoverage(straddle, BOXES, false)!;
    expect(coverage.counts[0]).toBeLessThan(30);
    expect(coverage.counts[1]).toBe(30);
    expect(pickedTag(straddle)).toBe(1);
  });

  it("uses the model matrix: the same pool moved 200 m behind the camera falls back to the centre pick", () => {
    const moved = pool(SPREAD, translation(0, 0, 300));
    expect(forwardInstanceCascadeCoverage(moved, BOXES, false)!.counts).toEqual([0, 0, 0]);
    expect(forwardCascadePosition(CASCADES, moved, VIEW, [0, 0, 0])).toBe(forwardCenterCascadePosition(CASCADES, moved, VIEW, [0, 0, 0]));
  });

  it("non-instanced items, and cascades without a light matrix, keep the centre pick exactly", () => {
    const plain = { geometry: Geometry.litCube(1), modelMatrix: translation(0, 0, -20), label: "rock" } as unknown as RenderItem;
    expect(pickedTag(plain)).toBe(1);
    const noMatrix = { cascades: SPLITS.map((far, i) => ({ index: i, near: 0, far, shadowMap: { tag: i } })) } as unknown as ForwardShadowMapOptions;
    expect((selectForwardShadowMap(noMatrix, pool(SPREAD), VIEW, [0, 0, 0]) as unknown as { tag: number }).tag).toBe(0);
  });

  it("cascade skipping never reports a cascade an instanced receiver's forward draw can pick, for any culled subset", () => {
    const fits = SPLITS.map((splitFar, i) => ({ index: i, splitFar, drawViewProjection: BOXES[i]! }));
    const rand = lcg(5);
    for (let trial = 0; trial < 300; trial += 1) {
      const n = 2 + Math.floor(rand() * 40);
      const points = Array.from({ length: n }, () => [(rand() - 0.5) * 100, 0, -(rand() * 160)] as const);
      const item = pool(points);
      const unused = unusedCascadeIndices(fits, [item], { viewMatrix: VIEW });
      // The forward pass sees only the camera-culled instances: any subset may reach selectForwardShadowMap.
      for (let s = 0; s < 6; s += 1) {
        const subset = points.filter(() => rand() < 0.5);
        if (subset.length === 0) continue;
        const pick = pickedTag(pool(subset));
        expect(unused?.has(pick) ?? false, `trial ${trial}: forward picks ${pick}, skip set ${[...(unused ?? [])]}`).toBe(false);
      }
    }
  });

  it("cascade skipping renders every cascade when an instanced receiver meets fits without light matrices", () => {
    const bare = SPLITS.map((splitFar, i) => ({ index: i, splitFar }));
    expect(unusedCascadeIndices(bare, [pool(SPREAD)], { viewMatrix: VIEW })).toBeUndefined();
  });
});

const sun = {
  kind: "directional", color: [1, 1, 1], intensity: 2, position: [3, 10, 3], direction: [-0.3, -1, -0.2], range: 0, spotAngle: 0, penumbra: 0,
  castsShadow: true, layerMask: 1, source: new DirectionalLight("sun")
} as unknown as CollectedLight;

describe("SI-1 and SI-5 in a real Renderer frame (mock device, bridged prd02 cascades)", () => {
  const SOURCE_BASE = {
    collectedLights: [{ ...sun, source: { id: "sun", name: "sun" } }],
    shadow: { enabled: true, size: 512, cascadeCount: 3, prd02Shadows: { enabled: true, mapSize: 512, cascades: 3, maxDistance: 100, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 } }
  };
  const eye: [number, number, number] = [0, 6, 10];
  const proj = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 120 });
  proj.updateCameraMatrices();
  const viewMatrix = Float32Array.from(lookAtMat4(eye, [0, 0, -40], [0, 1, 0]));
  const camera = { viewProjectionMatrix: Float32Array.from(multiplyMat4(Array.from(proj.projectionMatrix) as never, Array.from(viewMatrix) as never)), viewMatrix };

  function items(): RenderItem[] {
    const material = new PBRMaterial({ name: "lit" });
    // Instances 25-85 m down the view axis around a node at the origin: the origin is ~12 m from the eye (cascade 0).
    const trees = Array.from({ length: 40 }, (_, i) => [((i * 13) % 30) - 15, 1, -(15 + i * 1.5)] as const);
    return [
      { geometry: Geometry.litPlane(), material, modelMatrix: Float32Array.from([200, 0, 0, 0, 0, 1, 0, 0, 0, 0, 200, 0, 0, 0, 0, 1]), label: "ground", castShadow: false, receiveShadow: true },
      { geometry: Geometry.litCube(1), material, modelMatrix: Float32Array.from(identityMat4()), instanceTransforms: instancesAt(trees), label: "trees", castShadow: true, receiveShadow: true }
    ] as unknown as RenderItem[];
  }

  async function frame(skip: boolean) {
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: FLAGS_ON });
    try {
      const device = renderer.device as unknown as MockRenderDevice & { skipUnusedShadowCascades?: boolean };
      if (skip) device.skipUnusedShadowCascades = true;
      const labels = new Map<RenderTarget, string>();
      const create = device.createRenderTarget.bind(device);
      vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
        const target = create(descriptor);
        labels.set(target, descriptor.label ?? "");
        return target;
      });
      let current: RenderTarget | null = null;
      const set = device.setRenderTarget.bind(device);
      vi.spyOn(device, "setRenderTarget").mockImplementation((target) => { current = target; set(target); });
      const cleared = new Set<string>();
      const clear = device.clearRenderTarget.bind(device);
      vi.spyOn(device, "clearRenderTarget").mockImplementation((color, attachment) => {
        const label = current ? labels.get(current) : undefined;
        if (label?.startsWith("prd02-cascade-")) cleared.add(label);
        clear(color, attachment);
      });
      renderer.render({ ...SOURCE_BASE, renderItems: items() } as never, camera as never);
      const bound = new Map<string, string>();
      for (const draw of (device as unknown as { drawCommands: DrawCommand[] }).drawCommands) {
        const uniforms = draw.uniforms as ReadonlyMap<string, unknown> | undefined;
        if (!uniforms || uniforms.get("u_shadowMapEnabled") !== 1) continue;
        const texture = uniforms.get("u_shadowMapTexture") as { texture?: { label?: string } } | undefined;
        bound.set(draw.label ?? "", texture?.texture?.label ?? "");
      }
      return { bound, cleared, diagnostics: prd02ShadowDiagnostics() };
    } finally {
      renderer.dispose();
    }
  }

  it("legacy (default) fit: casters widen every cascade, so cascade 0 already holds the pool and the pick is unchanged", async () => {
    const full = await frame(false);
    expect(full.bound.get("trees")).toMatch(/prd02-cascade-0/);
  });

  it("4.3.0 fit (__A3D_SHADOW_FIT__ = current): the spread instanced draw binds a cascade other than 0, drawn when skipping is on", async () => {
    (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";
    try {
      await currentFitCase();
    } finally {
      delete (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__;
    }
  });

  async function currentFitCase(): Promise<void> {
    const full = await frame(false);
    const trees = full.bound.get("trees");
    expect(trees, [...full.bound.keys()].join(",")).toBeDefined();
    expect(trees).not.toMatch(/prd02-cascade-0/);
    const fast = await frame(true);
    expect(fast.bound.get("trees")).toBe(trees);
    for (const texture of fast.bound.values()) expect(fast.cleared.has(texture.replace(/-depth$/, ""))).toBe(true);
  }

  it("SI-5: the sun row of the shadows diagnostics reports cascadeCount and skippedCascades", async () => {
    const full = await frame(false);
    const fullSun = full.diagnostics?.shadows.find((row) => row.light === "sun");
    expect(fullSun?.cascadeCount).toBe(3);
    expect(fullSun?.skippedCascades).toEqual([]);
    const fast = await frame(true);
    const fastSun = fast.diagnostics?.shadows.find((row) => row.light === "sun");
    const notCleared = [0, 1, 2].filter((i) => !fast.cleared.has(`prd02-cascade-${i}`));
    expect(fastSun?.skippedCascades).toEqual(notCleared);
  });
});

describe("SI-2: the per-instance cull reuses its output buffers", () => {
  const vp = (() => {
    const p = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 400 });
    p.updateCameraMatrices();
    const v = lookAtMat4([0, 9, 34], [0, 3, 0], [0, 1, 0]);
    return Float32Array.from(multiplyMat4(Array.from(p.projectionMatrix) as never, Array.from(v) as never));
  })();
  const BOUNDS = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };

  /** A 900-slot pool like Glint Courier's rails: `live` visible slots, the rest parked at y = -999. */
  function railsPool(live: number): { transforms: Float32Array; colors: Float32Array } {
    const transforms = new Float32Array(900 * 16);
    const colors = new Float32Array(900 * 4);
    for (let i = 0; i < 900; i += 1) {
      transforms.set(i < live ? translation((i % 30) - 15, 0, -Math.floor(i / 30)) : translation(0, -999, 0), i * 16);
      colors.set([i / 900, 0.5, 0.25, 1], i * 4);
    }
    return { transforms, colors };
  }

  it("second call reuses the same backing store, and the results stay correct", () => {
    const a = railsPool(300);
    const first = cullInstancesToFrustum({ viewProjection: vp, bounds: BOUNDS, ...a })!;
    expect(first.count).toBeGreaterThan(0);
    expect(first.count).toBeLessThan(900);
    const firstBuffer = first.transforms.buffer;
    const firstColorBuffer = first.colors!.buffer;
    const b = railsPool(200);
    const second = cullInstancesToFrustum({ viewProjection: vp, bounds: BOUNDS, ...b })!;
    expect(second.transforms.buffer).toBe(firstBuffer);
    expect(second.colors!.buffer).toBe(firstColorBuffer);
    expect(second.transforms.length).toBe(second.count * 16);
    // Every kept matrix is a live (non-parked) slot of the second pool, in order, with its colour.
    let cursor = 0;
    for (let k = 0; k < second.count; k += 1) {
      expect(second.transforms[k * 16 + 13]).not.toBe(-999);
      while (!b.transforms.subarray(cursor * 16, cursor * 16 + 16).every((v, j) => v === second.transforms[k * 16 + j])) cursor += 1;
      expect(Array.from(second.colors!.subarray(k * 4, k * 4 + 4))).toEqual(Array.from(b.colors.subarray(cursor * 4, cursor * 4 + 4)));
      cursor += 1;
    }
  });

  it("allocates no new Float32Array in steady state", () => {
    const a = railsPool(300);
    cullInstancesToFrustum({ viewProjection: vp, bounds: BOUNDS, ...a });
    const Original = Float32Array;
    let constructed = 0;
    const Spy = new Proxy(Original, { construct(target, args) { constructed += 1; return Reflect.construct(target, args); } });
    (globalThis as { Float32Array: Float32ArrayConstructor }).Float32Array = Spy;
    try {
      for (let frame = 0; frame < 10; frame += 1) cullInstancesToFrustum({ viewProjection: vp, bounds: BOUNDS, ...a });
    } finally {
      (globalThis as { Float32Array: Float32ArrayConstructor }).Float32Array = Original;
    }
    expect(constructed).toBe(0);
  });
});

describe("SI-6: dense depth draws keep one instance buffer per caster", () => {
  beforeAll(() => { (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current"; ensurePrd02DepthFeatures(); });
  afterAll(() => { delete (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__; });

  const variant = (): ShadowCasterVariantKey => ({ instanced: true, skinning: 0, alphaTest: false, alphaHash: false, doubleSided: false, features: { "prd02.depthInstanceAttr": 1 } }) as unknown as ShadowCasterVariantKey;
  const library = createLeanCoreShaderLibrary();
  registerPrd02DepthShader(library);

  function drawCascades(device: MockRenderDevice, casters: readonly RenderItem[], cascades: number): void {
    device.beginFrame(64, 64);
    for (let c = 0; c < cascades; c += 1) {
      new DepthPass({
        casters,
        shaderLibrary: library,
        viewProjectionMatrix: Float32Array.from(identityMat4()),
        variantResolver: variant,
        depthVariantFeatures: prd02DepthFeatures()
      }).execute({ device, width: 64, height: 64 } as never);
    }
    device.endFrame();
  }

  const forest = (n: number, offset = 0): RenderItem => ({
    geometry: Geometry.litCube(1),
    modelMatrix: Float32Array.from(identityMat4()),
    instanceTransforms: instancesAt(Array.from({ length: n }, (_, i) => [i + offset, 0, -i] as const)),
    label: `forest-${offset}`,
    castShadow: true
  }) as unknown as RenderItem;

  it("three cascades over five frames create one buffer and upload once", () => {
    const device = new MockRenderDevice();
    const caster = forest(2000);
    const uploads: number[] = [];
    const update = device.updateBuffer.bind(device);
    (device as { updateBuffer: typeof update }).updateBuffer = (b, off, data) => { uploads.push(data.byteLength); return update(b, off, data); };
    const draws: DrawCommand[] = [];
    const draw = device.draw.bind(device);
    (device as { draw: typeof draw }).draw = (command) => { draws.push(command); return draw(command); };
    let created = 0;
    const createBuffer = device.createBuffer.bind(device);
    (device as { createBuffer: typeof createBuffer }).createBuffer = (...args) => { created += 1; return createBuffer(...args); };
    drawCascades(device, [caster], 3);
    // Frame 1: the cube's vertex and index buffers plus the InstanceBuffer (16 slots, grown once to the pool): 4 creates.
    expect(created).toBeLessThanOrEqual(4);
    const afterFirst = created;
    for (let frame = 1; frame < 5; frame += 1) drawCascades(device, [caster], 3);
    // Before SI-6 each later frame created (and disposed) 3 instance buffers, one per cascade.
    expect(created - afterFirst).toBe(0);
    expect(uploads).toEqual([2000 * 64]);
    expect(draws.filter((d) => d.label?.startsWith("forest-0"))).toHaveLength(15);
    const ids = new Set(draws.map((d) => d.instanceAttributes?.[0]?.buffer.id));
    expect(ids.size).toBe(1);
    expect(draws.every((d) => d.instanceAttributes?.[0]?.buffer.disposed === false)).toBe(true);
  });

  it("an in-place change re-uploads into the same buffer", () => {
    const device = new MockRenderDevice();
    const caster = forest(500);
    drawCascades(device, [caster], 2);
    const first = (device as unknown as { drawCommands: DrawCommand[] }).drawCommands.at(-1)!.instanceAttributes![0]!.buffer;
    (caster.instanceTransforms as Float32Array)[12] = 42;
    drawCascades(device, [caster], 2);
    const second = (device as unknown as { drawCommands: DrawCommand[] }).drawCommands.at(-1)!.instanceAttributes![0]!.buffer;
    expect(second).toBe(first);
    const bytes = new Float32Array((second as unknown as { bytes: Uint8Array }).bytes.buffer);
    expect(bytes[12]).toBe(42);
  });

  it("the cache is bounded: the least recently drawn casters are disposed", () => {
    const device = new MockRenderDevice();
    const casters = Array.from({ length: DEPTH_INSTANCE_BUFFER_CACHE_LIMIT + 6 }, (_, i) => forest(100, i * 1000));
    drawCascades(device, casters, 1);
    expect(depthInstanceBufferCount(device)).toBe(DEPTH_INSTANCE_BUFFER_CACHE_LIMIT);
  });

  it("VAO eviction unlinks the key only from the buffers the VAO references", () => {
    const deleted: unknown[] = [];
    const gl = {
      createVertexArray: () => ({}),
      deleteVertexArray: (h: unknown) => { deleted.push(h); },
      bindVertexArray: () => undefined, bindBuffer: () => undefined, deleteBuffer: () => undefined, enableVertexAttribArray: () => undefined, disableVertexAttribArray: () => undefined,
      vertexAttribPointer: () => undefined, vertexAttribDivisor: () => undefined, vertexAttrib4f: () => undefined, getExtension: () => null,
      ARRAY_BUFFER: 1, ELEMENT_ARRAY_BUFFER: 2, FLOAT: 3
    };
    const host = { gl, stateCache: { bindVertexArray: (_h: unknown, apply: () => void) => apply(), bindBuffer: (_t: unknown, _h: unknown, apply: () => void) => apply() }, counters: { vertexArrayCreateCount: 0 }, buffers: new Set<WebGL2Buffer>() };
    const binder = new WebGL2DrawCallBinder(host as never);
    const make = (id: number) => {
      const buffer = new WebGL2Buffer(id, "vertex", 16, 0, {} as WebGLBuffer, gl as unknown as WebGL2RenderingContext);
      buffer.onDispose = () => { binder.evictVertexArraysForBuffer(buffer.id); host.buffers.delete(buffer); };
      host.buffers.add(buffer);
      return buffer;
    };
    const shader = { id: 1, label: "s", marker: "s", disposed: false, reflection: { attributes: new Map(), uniforms: new Set(), attributeDetails: new Map(), uniformDetails: new Map() }, dispose() {} } as unknown as RenderShaderProgram;
    const vertex = make(1);
    const unrelated = Array.from({ length: 200 }, (_, i) => make(500 + i));
    for (const other of unrelated) binder.bindVertexArrayForCommand({ vertexBuffer: other, vertexCount: 3, vertexFormat: VertexFormat.P3, topology: "triangles" }, shader as never, other);
    const index = (binder as unknown as { bufferVaoIndex: Map<number, Set<string>> }).bufferVaoIndex;
    const instance = make(2);
    binder.bindVertexArrayForCommand({ vertexBuffer: vertex, vertexCount: 3, vertexFormat: VertexFormat.P3, topology: "triangles", instanceAttributes: [{ buffer: instance, shaderName: "a_instanceMatrix0", components: 4, offset: 0, stride: 64, divisor: 1 }] }, shader as never, vertex);
    const sizes = new Map([...index].map(([id, set]) => [id, set.size]));
    // Spy on the unrelated sets: none of them may be touched by the eviction.
    const touched: number[] = [];
    for (const [id, set] of index) {
      if (id === 1 || id === 2) continue;
      const del = set.delete.bind(set);
      set.delete = (key: string) => { touched.push(id); return del(key); };
    }
    instance.dispose();
    expect(touched).toEqual([]);
    expect(index.has(2)).toBe(false);
    // The vertex buffer's only VAO went with the instance buffer, so its index entry is gone too; the unrelated ones are unchanged.
    expect(index.has(1)).toBe(false);
    for (const other of unrelated) expect(index.get(other.id)?.size).toBe(sizes.get(other.id));
    expect(binder.vertexArrayCache.size).toBe(200);
  });
});
