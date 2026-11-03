import { describe, expect, it, vi } from "vitest";
import { DynamicSceneHelper } from "../../../packages/debug/src/SceneHelpers";
import {
  buildAnimationPathHelper,
  buildAreaLightHelper,
  buildAudioOrientationHelper,
  buildColliderHelper,
  buildOctreeHelper,
  buildProbeGridHelper,
  buildProbeHelper,
  buildTangentHelper,
  buildTextureHelper,
  buildVertexNormalHelper
} from "../../../packages/debug/src/AdvancedHelpers";
import { helpers } from "../../../packages/engine/src/agent-api/nodes/helpers";
import type { AuraApp } from "../../../packages/engine/src/agent-api/nodes/types";
import { VectorRenderer } from "../../../packages/addons/src/renderers/VectorRenderer";
import { SpatialDOMRenderer } from "../../../packages/addons/src/renderers/SpatialDOMRenderer";
import { AsciiOutput } from "../../../packages/addons/src/effects/AsciiOutput";
import { StereoOutput } from "../../../packages/addons/src/effects/StereoOutputs";
import { OutlineOutput } from "../../../packages/addons/src/effects/OutlineOutput";
import { Geometry, Material, MaterialInstance, MockRenderDevice, Renderer, UnlitMaterial, computePerspectiveCameraFrame } from "../../../packages/rendering/src";
import type { RenderTarget, RendererInput } from "../../../packages/rendering/src";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const translatedScale = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1] as const;

describe("live scene helpers", () => {
  it("exposes helper and spatial-label capability through the public engine entry", async () => {
    const publicEngine = await import("../../../packages/engine/src/public/index");
    expect(publicEngine.helpers.animationPath).toBeTypeOf("function");
    expect(publicEngine.helpers.dynamic).toBeTypeOf("function");
    expect(publicEngine.SPATIAL_DOM_LABEL_CAPABILITY).toMatchObject({ optIn: true, modes: ["screen", "perspective"] });
  }, 20_000);

  it("samples updates, applies affine transforms, hides and disposes without retaining state", () => {
    let points: readonly (readonly [number, number, number])[] = [[0, 0, 0], [1, 0, 0]];
    const helper = new DynamicSceneHelper(() => points, (source) => buildAnimationPathHelper({ points: source }));
    helper.setTransform(translatedScale);
    expect(helper.lines()[0]).toMatchObject({ from: [3, 4, 5], to: [5, 4, 5] });
    points = [[1, 1, 0], [2, 1, 0], [2, 2, 0]];
    expect(helper.update().map((line) => line.to)).toEqual([[7, 5, 5], [7, 6, 5]]);
    points = [[Number.NaN, 0, 0], [1, 0, 0]];
    expect(() => helper.update()).toThrow(/finite/);
    expect(helper.lines().map((line) => line.to)).toEqual([[7, 5, 5], [7, 6, 5]]);
    helper.setVisible(false);
    expect(helper.lines()).toEqual([]);
    points = [];
    helper.update();
    helper.setVisible(true);
    expect(helper.lines()).toEqual([]);
    expect(() => helper.setTransform([1, 2])).toThrow(/affine/);
    helper.dispose();
    helper.dispose();
    expect(helper.disposed).toBe(true);
    expect(helper.lines()).toEqual([]);
    expect(() => helper.update()).toThrow(/disposed/);
  });

  it("generates bounded geometry for paths, audio, probes, colliders, lights and textures", () => {
    expect(buildAnimationPathHelper({ points: [[0, 0, 0], [1, 0, 0], [1, 1, 0]], closed: true })).toHaveLength(3);
    expect(buildAudioOrientationHelper({ origin: [1, 2, 3], direction: [0, 0, -2], length: 2 })[0]?.to).toEqual([1, 2, 1]);
    expect(() => buildAudioOrientationHelper({ direction: [0, 1, 0], up: [0, 1, 0] })).toThrow();
    expect(buildProbeHelper({ segments: 8 })).toHaveLength(24);
    const grid = buildProbeGridHelper({ min: [0, 0, 0], max: [2, 4, 6], divisions: [1, 1, 1] });
    expect(grid[0]?.from).toEqual([0.9, 2, 3]);
    expect(grid[0]?.to).toEqual([1.1, 2, 3]);
    expect(() => buildProbeGridHelper({ min: [0, 0, 0], max: [1, 1, 1], divisions: [10, 10, 10], maxProbes: 20 })).toThrow(/exceeds/);
    expect(buildOctreeHelper({ root: { min: [0, 0, 0], max: [2, 2, 2], children: [{ min: [0, 0, 0], max: [1, 1, 1] }] } })).toHaveLength(24);
    expect(buildColliderHelper({ shape: { kind: "box", halfExtents: [1, 2, 3] } })).toHaveLength(12);
    const plane = buildColliderHelper({ shape: { kind: "plane", normal: [0, 2, 0], constant: -4 }, planeSize: 2 });
    expect(plane.every((line) => line.from[1] === 2 && line.to[1] === 2)).toBe(true);
    expect(buildAreaLightHelper({ width: 2, height: 1, length: 3 })).toHaveLength(9);
    const texture = buildTextureHelper({ width: 2, height: 1, pixels: new Uint8Array([255, 0, 0, 128, 0, 255, 0, 255]) });
    expect(texture.map((line) => line.color)).toEqual([[1, 0, 0, 128 / 255], [0, 1, 0, 1]]);
    expect(helpers.texture({ width: 2, height: 1, pixels: new Uint8Array([255, 0, 0, 128, 0, 255, 0, 255]) }).toJSON().colors).toEqual(["#ff000080", "#ff000080", "#00ff00", "#00ff00"]);
    expect(() => buildTextureHelper({ width: 2, height: 1, pixels: new Uint8Array(4) })).toThrow(/pixels/);
  });

  it("transforms normals by inverse transpose and tangents by the linear matrix", () => {
    const normal = buildVertexNormalHelper({ positions: [[1, 0, 0]], normals: [[1, 1, 0]], transform: translatedScale, length: 1 })[0]!;
    const tangent = buildTangentHelper({ positions: [[1, 0, 0]], tangents: [[1, 1, 0, 1]], transform: translatedScale, length: 1 })[0]!;
    expect(normal.from).toEqual([5, 4, 5]);
    expect(normal.to[0] - normal.from[0]).toBeCloseTo(1 / Math.sqrt(5));
    expect(normal.to[1] - normal.from[1]).toBeCloseTo(2 / Math.sqrt(5));
    expect(tangent.to[0] - tangent.from[0]).toBeCloseTo(2 / Math.sqrt(5));
    expect(tangent.to[1] - tangent.from[1]).toBeCloseTo(1 / Math.sqrt(5));
    expect(buildVertexNormalHelper({ positions: [], normals: [] })).toEqual([]);
    expect(() => buildVertexNormalHelper({ positions: [[0, 0, 0]], normals: [] })).toThrow(/equal/);
  });

  it("mounts and removes live helpers through the real runtime node registry", async () => {
    const { createAuraRuntimeNodeRegistry } = await import("../../../packages/engine/src/agent-api/app/runtimeNodes");
    const { scene } = await import("../../../packages/engine/src/agent-api/nodes/scene");
    const registry = createAuraRuntimeNodeRegistry(scene().toJSON());
    let frame: (() => void) | undefined;
    let points: readonly (readonly [number, number, number])[] = [];
    const app = {
      nodes: registry,
      onFrame: (callback: () => void) => { frame = callback; return () => { frame = undefined; }; }
    } as unknown as Pick<AuraApp, "nodes" | "onFrame">;
    const helper = helpers.dynamic(app, () => helpers.animationPath({ points }), { id: "real-path" });
    expect(registry.has("real-path")).toBe(true);
    points = [[0, 0, 0], [2, 0, 0]];
    frame?.();
    expect(registry.require("real-path").id).toBe("real-path");
    expect(registry.require("real-path").tags.some((tag) => tag.startsWith("aura-helper-owner-"))).toBe(true);
    helper.dispose();
    expect(registry.has("real-path")).toBe(false);
    expect(frame).toBeUndefined();
  }, 20_000);

  it("updates a mounted helper on frames, avoids needless replacement and cleans up", () => {
    let points: readonly (readonly [number, number, number])[] = [];
    let frame: (() => void) | undefined;
    const records = new Map<string, { id: string; tags: readonly string[]; node: { positions: unknown; visible?: boolean } }>();
    const add = vi.fn((node: { runtime: { id: string; tags: readonly string[] }; positions: unknown; visible?: boolean }) => {
      const handle = { id: node.runtime.id, tags: node.runtime.tags, node };
      records.set(handle.id, handle);
      return handle;
    });
    const remove = vi.fn((id: string) => records.delete(id));
    const unsubscribe = vi.fn(() => { frame = undefined; });
    const app = {
      nodes: { has: (id: string) => records.has(id), get: (id: string) => records.get(id), add, remove },
      onFrame: (callback: () => void) => { frame = callback; return unsubscribe; }
    } as unknown as Pick<AuraApp, "nodes" | "onFrame">;
    const live = helpers.dynamic(app, () => helpers.animationPath({ points }), { id: "path" });
    expect(records.get("path")?.node.positions).toEqual([]);
    frame?.();
    expect(add).toHaveBeenCalledTimes(1);
    points = [[0, 0, 0], [1, 0, 0]];
    frame?.();
    expect(records.get("path")?.node.positions).toEqual(points);
    expect(add).toHaveBeenCalledTimes(2);
    live.setVisible(false);
    expect(records.get("path")?.node.visible).toBe(false);
    live.dispose();
    live.dispose();
    expect(records.size).toBe(0);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(() => live.update()).toThrow(/disposed/);
  });
});

describe("alternative output source contracts", () => {
  it("projects and clips actual geometry to SVG with ordered, escaped styles", () => {
    const vector = new VectorRenderer({ width: 200, height: 100 });
    const crossing = Geometry.lineSegments([[-2, 0, 0], [2, 0, 0]]);
    const triangle = Geometry.triangle();
    const result = vector.render([
      { geometry: triangle, style: { fill: 'red" onload="bad' }, modelMatrix: [...identity.slice(0, 14), 0.5, 1] },
      { geometry: crossing, style: { stroke: "#ff0", strokeWidth: 2 } }
    ], { viewProjectionMatrix: identity, viewport: { x: 20, y: 10, width: 100, height: 80 } });
    expect(result).toContain('points="20,50 120,50"');
    expect(result).toContain('fill="red&quot; onload=&quot;bad"');
    expect(result.indexOf("<polygon")).toBeLessThan(result.indexOf("<polyline"));
    vector.setSize(80, 40);
    expect(vector.render([], { viewProjectionMatrix: identity })).toContain('viewBox="0 0 80 40"');
    expect(() => vector.render([{ geometry: triangle, skinning: {} }], { viewProjectionMatrix: identity })).toThrow(/static/);
    vector.dispose();
    expect(() => vector.render([], { viewProjectionMatrix: identity })).toThrow(/disposed/);
    crossing.dispose();
    triangle.dispose();
  });

  it("averages luminance and alpha, respects pixel origin, size and disposal", () => {
    const text = new AsciiOutput({ width: 2, height: 2, characters: " .#" });
    const pixels = new Uint8Array([
      255, 255, 255, 255, 0, 0, 0, 255,
      255, 255, 255, 0, 128, 128, 128, 255
    ]);
    expect(text.renderPixels({ width: 2, height: 2, pixels }).text).toBe("# \n .");
    expect(text.renderPixels({ width: 2, height: 2, pixels, origin: "bottom-left" }).text).toBe(" .\n# ");
    text.setSize(1, 1);
    expect(text.renderPixels({ width: 2, height: 2, pixels }).text).toBe(".");
    expect(() => text.renderPixels({ width: 2, height: 2, pixels: new Uint8Array(1) })).toThrow(/RGBA/);
    text.dispose();
    text.dispose();
    expect(() => text.setSize(2, 2)).toThrow(/disposed/);
  });

  it.each([
    ["side-by-side", [255, 10, 20, 255, 30, 40, 50, 255]],
    ["over-under", [255, 10, 20, 255, 255, 10, 20, 255]],
    ["anaglyph", [255, 40, 50, 255, 255, 40, 50, 255]],
    ["parallax-barrier", [255, 10, 20, 255, 30, 40, 50, 255]]
  ] as const)("renders and combines %s eyes in documented order", async (mode, expectedFirstTwo) => {
    const device = new MockRenderDevice();
    const prior = device.createRenderTarget({ width: 2, height: 2, format: "rgba8", label: "prior" });
    device.setRenderTarget(prior);
    const submitted: RenderTarget[] = [];
    const render = vi.fn((input: RendererInput) => {
      const target = input.target!;
      const rgba = submitted.length === 0 ? [255, 10, 20, 255] : [30, 40, 50, 255];
      submitted.push(target);
      const pixels = new Uint8Array(target.width * target.height * 4);
      for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
      device.writeRenderTargetPixels(target, pixels);
      return device.getDiagnostics();
    });
    const renderer = { device, render, renderAsync: async (input: RendererInput) => render(input) } as unknown as Pick<Renderer, "device" | "render" | "renderAsync">;
    const output = new StereoOutput(renderer, { width: 4, height: 2, mode });
    const result = await output.render([], { cameraPosition: [0, 0, 0], near: 0.1, viewMatrix: identity, projectionMatrix: identity });
    // Side-by-side uses two pixels per eye; compare the first and third pixel there.
    const firstTwo = mode === "side-by-side" ? [...result.pixels.slice(0, 4), ...result.pixels.slice(8, 12)] : [...result.pixels.slice(0, 8)];
    expect(firstTwo).toEqual(expectedFirstTwo);
    expect(result.views.map((view) => view.eye)).toEqual(["left", "right"]);
    expect(result.views[0].cameraPosition[0]).toBeLessThan(result.views[1].cameraPosition[0]);
    expect(device.getRenderTarget()).toBe(prior);
    output.setSize(6, 4);
    expect(submitted.every((target) => target.disposed)).toBe(true);
    output.dispose();
    output.dispose();
    prior.dispose();
    device.dispose();
  });

  it("routes pointers across uneven stereo viewports and barrier strips", () => {
    const device = new MockRenderDevice();
    const renderer = { device, render: vi.fn(), renderAsync: vi.fn() } as unknown as Pick<Renderer, "device" | "render" | "renderAsync">;
    const split = new StereoOutput(renderer, { width: 5, height: 3, mode: "side-by-side" });
    expect(split.mapPointer(1, 1.5)).toMatchObject({ eye: "left", ndc: [0, 0] });
    expect(split.mapPointer(3.5, 1.5)).toMatchObject({ eye: "right", ndc: [0, 0] });
    expect(split.mapClientPointer(80, 40, { left: 10, top: 10, width: 100, height: 60 })).toMatchObject({ eye: "right", ndc: [0, 0] });
    split.dispose();
    const stacked = new StereoOutput(renderer, { width: 5, height: 3, mode: "over-under" });
    expect(stacked.mapPointer(2.5, 0.5)).toMatchObject({ eye: "left", ndc: [0, 0] });
    expect(stacked.mapPointer(2.5, 2)).toMatchObject({ eye: "right", ndc: [0, 0] });
    stacked.dispose();
    const barrier = new StereoOutput(renderer, { width: 5, height: 3, mode: "parallax-barrier" });
    expect(barrier.mapPointer(0.1, 1)?.eye).toBe("left");
    expect(barrier.mapPointer(1.1, 1)?.eye).toBe("right");
    barrier.dispose();
    device.dispose();
  });

  it("captures a real mock renderer and restores its prior render target", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, clearColor: [0.2, 0.4, 0.6, 1] });
    const previous = renderer.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" });
    renderer.device.setRenderTarget(previous);
    const frame = computePerspectiveCameraFrame({ min: [-1, -1, -1], max: [1, 1, 1] }, { width: 4, height: 4 });
    const stereo = new StereoOutput(renderer, { width: 4, height: 4, mode: "anaglyph" });
    const ascii = new AsciiOutput({ width: 2, height: 2, characters: " .#" });
    try {
      const result = await stereo.render([], frame);
      expect([...result.pixels.slice(0, 4)]).toEqual([51, 102, 153, 255]);
      expect(renderer.device.getRenderTarget?.()).toBe(previous);
      expect((await ascii.render(renderer, [], frame)).text).toBe("..\n..");
      expect(renderer.device.getRenderTarget?.()).toBe(previous);
      expect(stereo.mapPointer(2, 1, "right")?.eye).toBe("right");
      expect(stereo.mapClientPointer(20, 30, { left: 10, top: 20, width: 20, height: 20 })?.ndc).toEqual([0, 0]);
      expect(stereo.mapPointer(-1, 0)).toBeNull();
    } finally {
      stereo.dispose();
      ascii.dispose();
      renderer.device.setRenderTarget(null);
      previous.dispose();
      renderer.dispose();
    }
  });

  it("restores the prior target if stereo rendering fails and rejects alpha cutout hulls", async () => {
    const device = new MockRenderDevice();
    const previous = device.createRenderTarget({ width: 2, height: 2, format: "rgba8" });
    device.setRenderTarget(previous);
    const render = () => { throw new Error("draw failed"); };
    const renderer = { device, render, renderAsync: async () => render() } as unknown as Pick<Renderer, "device" | "render" | "renderAsync">;
    const stereo = new StereoOutput(renderer, { width: 2, height: 2 });
    await expect(stereo.render([], { cameraPosition: [0, 0, 0], near: 0.1, viewMatrix: identity, projectionMatrix: identity })).rejects.toThrow("draw failed");
    expect(device.getRenderTarget()).toBe(previous);
    stereo.dispose();
    previous.dispose();
    device.dispose();
    const geometry = Geometry.litTriangle();
    const material = new UnlitMaterial({ alphaTest: 0.5 });
    const strict = new OutlineOutput();
    const approximate = new OutlineOutput({ alphaMode: "geometry" });
    expect(() => strict.items([{ geometry, material }])).toThrow(/alpha cutouts/);
    expect(approximate.items([{ geometry, material }])).toHaveLength(1);
    strict.dispose();
    approximate.dispose();
    geometry.dispose();
    material.dispose();
  });

  it("builds object-space shells with alpha rules and owns only generated geometry", () => {
    const geometry = Geometry.litTriangle();
    const material = new UnlitMaterial({ color: [1, 1, 1, 0.5], renderState: { blend: true, depthWrite: false } });
    const output = new OutlineOutput({ width: 0.25, color: [1, 0, 0, 0.8], opacity: 0.5 });
    const shell = output.items([{ geometry, material }])[0]!;
    expect(shell.geometry.vertexBuffer.getAttribute(0, "position")).toEqual([-0.5, -0.5, 0.25]);
    expect(shell.material).toBeInstanceOf(UnlitMaterial);
    expect((shell.material as UnlitMaterial).renderState).toMatchObject({ cullMode: "front", blend: true, depthWrite: false });
    expect(shell.material?.getParameter("u_baseColor")).toEqual([1, 0, 0, 0.2]);
    expect(() => output.items([{ geometry: Geometry.triangle(), material }])).toThrow(/normals/);
    output.dispose();
    expect(() => shell.geometry.vertexBuffer.setAttribute(0, "position", [0, 0, 0])).toThrow();
    expect(geometry.vertexBuffer.getAttribute(0, "position")).toEqual([-0.5, -0.5, 0]);
    material.dispose();
    geometry.dispose();
  });
});

// Browser-shaped fixtures keep source validation independent of a browser run.
class TestStyle {
  readonly values = new Map<string, string>();
  readonly priorities = new Map<string, string>();
  getPropertyValue(key: string): string { return this.values.get(key) ?? ""; }
  getPropertyPriority(key: string): string { return this.priorities.get(key) ?? ""; }
  setProperty(key: string, value: string, priority = ""): void { this.values.set(key, value); this.priorities.set(key, priority); }
  removeProperty(key: string): void { this.values.delete(key); this.priorities.delete(key); }
}
function testStyle(): TestStyle {
  return new Proxy(new TestStyle(), {
    set(target, key, value) {
      if (typeof key === "string" && !(key in target)) target.setProperty(key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value);
      else Reflect.set(target, key, value);
      return true;
    },
    get(target, key) {
      if (typeof key === "string" && !(key in target)) return target.getPropertyValue(key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
      return Reflect.get(target, key);
    }
  });
}
class TestNode {
  parentNode: TestNode | null = null;
  readonly childNodes: TestNode[] = [];
  get nextSibling(): TestNode | null {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  insertBefore(node: TestNode, next: TestNode | null): TestNode {
    node.parentNode?.removeChild(node);
    node.parentNode = this;
    const index = next ? this.childNodes.indexOf(next) : -1;
    if (index < 0) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    return node;
  }
  appendChild(node: TestNode): TestNode { return this.insertBefore(node, null); }
  removeChild(node: TestNode): TestNode {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error("missing child");
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  remove(): void { this.parentNode?.removeChild(this); }
  contains(node: TestNode): boolean { return this === node || this.childNodes.some((child) => child.contains(node)); }
}
class TestElement extends TestNode {
  readonly style = testStyle();
  readonly attrs = new Map<string, string>();
  constructor(readonly ownerDocument: TestDocument) { super(); }
  setAttribute(key: string, value: string): void { this.attrs.set(key, value); }
  getAttribute(key: string): string | null { return this.attrs.get(key) ?? null; }
  removeAttribute(key: string): void { this.attrs.delete(key); }
}
class TestDocument {
  createElement(_tag: string): TestElement { return new TestElement(this); }
  createComment(_text: string): TestNode { return new TestNode(); }
}
class TestAsciiElement extends TestElement {
  private text = "";
  get textContent(): string { return this.text; }
  set textContent(value: string | null) {
    for (const child of [...this.childNodes]) this.removeChild(child);
    this.text = value ?? "";
  }
  replaceChildren(...nodes: TestNode[]): void {
    for (const child of [...this.childNodes]) this.removeChild(child);
    for (const node of nodes) this.appendChild(node);
    this.text = "";
  }
}

it("updates accessible DOM anchors and restores caller-owned elements on removal and disposal", () => {
  const doc = new TestDocument();
  const container = doc.createElement("div"), original = doc.createElement("div");
  const a = doc.createElement("button"), b = doc.createElement("span");
  original.appendChild(a);
  original.appendChild(b);
  a.style.setProperty("transform", "rotate(1deg)");
  a.setAttribute("aria-label", "original");
  let matrix: readonly number[] = [...identity];
  let occluded = true;
  const renderer = new SpatialDOMRenderer({ container: container as unknown as HTMLElement, width: 100, height: 80, isOccluded: (label) => occluded && label.id === "b" });
  const labels = [
    { id: "a", element: a as unknown as HTMLElement, worldMatrix: () => matrix, interactive: true, ariaLabel: "Open" },
    { id: "b", element: b as unknown as HTMLElement, worldMatrix: identity, mode: "perspective" as const }
  ];
  renderer.render(labels, { viewProjectionMatrix: identity });
  expect(a.style.getPropertyValue("pointer-events")).toBe("auto");
  expect(a.style.getPropertyValue("transform")).toContain("50px, 40px");
  expect(a.getAttribute("aria-label")).toBe("Open");
  expect(b.getAttribute("aria-hidden")).toBe("true");
  expect(b.style.getPropertyValue("transform")).toBe("none");
  occluded = false;
  matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0, 0, 1];
  renderer.render(labels, { viewProjectionMatrix: identity });
  expect(a.style.getPropertyValue("transform")).toContain("75px, 40px");
  expect(b.getAttribute("aria-hidden")).toBeNull();
  expect(b.style.getPropertyValue("transform")).toMatch(/^matrix3d/);
  renderer.render([labels[0]!], { viewProjectionMatrix: identity });
  expect(original.childNodes).toContain(b);
  renderer.dispose();
  renderer.dispose();
  expect(original.childNodes).toEqual([a, b]);
  expect(a.style.getPropertyValue("transform")).toBe("rotate(1deg)");
  expect(a.getAttribute("aria-label")).toBe("original");
  expect(container.childNodes).toHaveLength(0);
  expect(() => renderer.setSize(1, 1)).toThrow(/disposed/);
});

describe("alternative output edge cases", () => {
  it("intersects SVG draw ranges and combines item styles with resolver defaults", () => {
    const positions = [[-0.75, 0, 0], [-0.25, 0, 0], [0.25, 0, 0], [0.75, 0, 0]];
    const geometry = {
      topology: "points" as const,
      vertexBuffer: { vertexCount: positions.length, getAttribute: (index: number) => positions[index]! },
      drawRange: { start: 1, count: 3 }
    };
    const renderer = new VectorRenderer({
      width: 100, height: 100,
      resolveStyle: () => ({ fill: "#f00", stroke: "#00f", opacity: 0.5, pointSize: 6 })
    });
    const svg = renderer.render([{ geometry, drawRange: { start: 0, count: 3 }, style: { fill: "#0f0" } }], { viewProjectionMatrix: identity });
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg).toContain('cx="37.5" cy="50" r="3"');
    expect(svg).toContain('cx="62.5" cy="50" r="3"');
    expect(svg).toContain('fill="#0f0" stroke="#00f"');
    expect(svg).toContain('opacity="0.5"');
    renderer.dispose();
  });

  it("preserves small SVG dimensions and rejects characters forbidden by XML", () => {
    const geometry = { topology: "points" as const, vertexBuffer: { vertexCount: 1, getAttribute: () => [0, 0, 0] } };
    const renderer = new VectorRenderer({ width: 0.0000001, height: 1 });
    const svg = renderer.render([{ geometry, style: { strokeWidth: 0.0000002 } }], { viewProjectionMatrix: identity });
    expect(svg).toContain('width="1e-7"');
    expect(svg).toContain('stroke-width="2e-7"');
    expect(() => renderer.render([{ geometry, style: { fill: "red\u0000" } }], { viewProjectionMatrix: identity })).toThrow(/valid XML characters/);
    expect(() => renderer.render([{ geometry, style: { fill: "\ud800" } }], { viewProjectionMatrix: identity })).toThrow(/valid XML characters/);
    renderer.dispose();
  });

  it("clips polygons before perspective division and honors the view's depth convention", () => {
    const positions = [[-2, 0, -0.5], [0, 1, -0.5], [0, -1, -0.5]];
    const geometry = {
      topology: "triangles" as const,
      vertexBuffer: { vertexCount: positions.length, getAttribute: (index: number) => positions[index]! }
    };
    const renderer = new VectorRenderer({ width: 100, height: 100, maxPrimitives: 1 });
    const clipped = renderer.render([{ geometry }], { viewProjectionMatrix: identity });
    expect(clipped).toContain('points="0,75 0,25 50,0 50,100"');
    expect(renderer.render([{ geometry }], { viewProjectionMatrix: identity, depthRange: "zero-to-one" })).not.toContain("<polygon");
    expect(() => renderer.render([{ geometry }, { geometry }], { viewProjectionMatrix: identity })).toThrow(/budget/);
    const crossing = [[0, 0, 1], [0.5, 0, -1]];
    const line = { topology: "lines" as const, vertexBuffer: { vertexCount: 2, getAttribute: (index: number) => crossing[index]! } };
    const perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0];
    expect(renderer.render([{ geometry: line }], { viewProjectionMatrix: perspective })).toContain('points="100,50 75,50"');
    const overflow: number[] = [...identity];
    overflow[0] = Number.MAX_VALUE;
    expect(() => renderer.render([{ geometry }], { viewProjectionMatrix: overflow })).toThrow(/finite|overflow/i);
    renderer.dispose();
  });

  it("keeps DOM ownership exclusive and leaves an existing frame intact when validation fails", () => {
    const doc = new TestDocument();
    const container = doc.createElement("div"), original = doc.createElement("div"), a = doc.createElement("button"), b = doc.createElement("span");
    original.appendChild(a);
    original.appendChild(b);
    const first = new SpatialDOMRenderer({ container: container as unknown as HTMLElement, width: 100, height: 100 });
    const second = new SpatialDOMRenderer({ container: container as unknown as HTMLElement, width: 100, height: 100 });
    const labels = [
      { id: "near", element: a as unknown as HTMLElement, worldMatrix: [...identity.slice(0, 14), -0.5, 1] },
      { id: "far", element: b as unknown as HTMLElement, worldMatrix: [...identity.slice(0, 14), 0.5, 1] }
    ];
    const view = { viewProjectionMatrix: identity, viewport: { x: 20, y: 10, width: 60, height: 40 } };
    first.render(labels, view);
    expect(a.style.getPropertyValue("transform")).toContain("30px, 20px");
    expect(a.style.getPropertyValue("z-index")).toBe("2");
    expect(b.style.getPropertyValue("z-index")).toBe("1");
    first.render(labels, { ...view, depthOrder: "reversed" });
    expect(a.style.getPropertyValue("z-index")).toBe("1");
    expect(b.style.getPropertyValue("z-index")).toBe("2");
    expect(() => second.render([labels[0]!], view)).toThrow(/already managed by another SpatialDOMRenderer/);
    expect(() => first.render([labels[0]!, { ...labels[1]!, id: "near" }], view)).toThrow(/unique/);
    expect(a.parentNode).toBe(first.element);
    expect(b.parentNode).toBe(first.element);
    first.render(labels, { ...view, depthRange: "zero-to-one" });
    expect(a.getAttribute("aria-hidden")).toBe("true");
    expect(b.getAttribute("aria-hidden")).toBeNull();
    first.dispose();
    expect(original.childNodes).toEqual([a, b]);
    second.render([labels[0]!], view);
    second.dispose();
    expect(original.childNodes).toEqual([a, b]);
  });

  it("keeps a zero-depth world-space label plane drawable", () => {
    const doc = new TestDocument();
    const container = doc.createElement("div"), element = doc.createElement("span");
    const renderer = new SpatialDOMRenderer({ container: container as unknown as HTMLElement, width: 100, height: 80 });
    const flat = [...identity];
    flat[10] = 0;
    renderer.render([{ id: "flat", element: element as unknown as HTMLElement, worldMatrix: flat, mode: "perspective" }], { viewProjectionMatrix: identity });
    const transform = element.style.getPropertyValue("transform");
    const values = transform.match(/^matrix3d\(([^)]*)\)/)?.[1]?.split(",").map(Number);
    expect(values).toHaveLength(16);
    // For this axis-aligned input, the CSS matrix determinant is the product
    // of its diagonal; a singular matrix causes the plane to disappear.
    expect(Math.abs(values![0]! * values![5]! * values![10]! * values![15]!)).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("uses the same source snapshot for both eyes and converges at the specified plane", async () => {
    const device = new MockRenderDevice();
    const captured: RendererInput[] = [];
    const render = vi.fn((input: RendererInput) => { captured.push(input); return device.getDiagnostics(); });
    const renderer = { device, render, renderAsync: async (input: RendererInput) => render(input) } as unknown as Pick<Renderer, "device" | "render" | "renderAsync">;
    const geometry = Geometry.triangle();
    const item = { geometry };
    let iterations = 0;
    function* once() { iterations += 1; yield item; }
    const output = new StereoOutput(renderer, { width: 6, height: 4, eyeSeparation: 0.5, convergenceDistance: 10 });
    const projection = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2002, 0] as const;
    const result = await output.render(once(), { cameraPosition: [0, 0, 0], near: 0.1, viewMatrix: Float32Array.from(identity), projectionMatrix: projection });
    expect(iterations).toBe(1);
    expect(captured).toHaveLength(2);
    expect([...((captured[0]!.source as { renderItems: Iterable<typeof item> }).renderItems)]).toEqual([item]);
    expect([...((captured[1]!.source as { renderItems: Iterable<typeof item> }).renderItems)]).toEqual([item]);
    const ndcX = (eye: number, z: number) => {
      const m = result.views[eye]!.camera.viewProjectionMatrix!;
      return (m[8]! * z + m[12]!) / (m[11]! * z + m[15]!);
    };
    expect(result.views.map((view) => view.eye)).toEqual(["left", "right"]);
    expect(ndcX(0, -10)).toBeCloseTo(0, 8);
    expect(ndcX(1, -10)).toBeCloseTo(0, 8);
    expect(ndcX(0, -5)).toBeGreaterThan(ndcX(1, -5));
    expect(ndcX(0, -20)).toBeLessThan(ndcX(1, -20));
    output.dispose();
    geometry.dispose();
    device.dispose();
  });

  it("rejects shared temporal effects before submitting either stereo eye", async () => {
    const device = new MockRenderDevice();
    const render = vi.fn();
    const renderer = { device, render, renderAsync: vi.fn() } as unknown as Pick<Renderer, "device" | "render" | "renderAsync">;
    const output = new StereoOutput(renderer, { width: 4, height: 2 });
    const frame = { cameraPosition: [0, 0, 0] as const, near: 0.1, viewMatrix: identity, projectionMatrix: identity };
    await expect(output.render({ postprocess: { v2: true, pipeline: { nativeEffects: [{ kind: "afterimage", decay: 0.5 }] } } }, frame)).rejects.toThrow(/shared temporal/);
    await expect(output.render({ postprocess: { v2: true, pipeline: { antiAliasing: "taa" } } }, frame)).rejects.toThrow(/shared temporal/);
    expect(render).not.toHaveBeenCalled();
    output.dispose();
    device.dispose();
  });

  it("bounds ASCII sampling and releases an in-flight target after disposal", async () => {
    const wide = new AsciiOutput({ width: 20_000, height: 1, sampleScale: 1 });
    expect(() => wide.renderPixels({ width: 1, height: 4096, pixels: new Uint8Array(4096 * 4) })).toThrow(/sampling work/);
    wide.dispose();

    const device = new MockRenderDevice();
    const prior = device.createRenderTarget({ width: 2, height: 2, format: "rgba8" });
    device.setRenderTarget(prior);
    const create = vi.spyOn(device, "createRenderTarget");
    const asyncDevice = new Proxy(device, {
      get(target, property) {
        if (property === "kind") return "webgpu";
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const renderer = { device: asyncDevice, render: vi.fn(), renderAsync: () => pending } as unknown as Pick<Renderer, "device" | "render" | "renderAsync">;
    const ascii = new AsciiOutput({ width: 2, height: 2 });
    const frame = ascii.render(renderer, []);
    const target = create.mock.results[0]!.value!;
    ascii.dispose();
    expect(target.disposed).toBe(false);
    finish();
    await expect(frame).rejects.toThrow(/disposed/);
    expect(target.disposed).toBe(true);
    expect(device.getRenderTarget()).toBe(prior);
    prior.dispose();
    device.dispose();
  });

  it("area-averages non-integral ASCII sample footprints", () => {
    const ascii = new AsciiOutput({ width: 2, height: 1, characters: " .:-#" });
    const pixels = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    expect(ascii.renderPixels({ width: 3, height: 1, pixels }).text).toBe("..");
    ascii.dispose();
  });

  it("restores the caller's actual ASCII element children and accessibility attributes", () => {
    const doc = new TestDocument();
    const element = new TestAsciiElement(doc), first = doc.createElement("strong"), second = doc.createElement("button");
    element.appendChild(first);
    element.appendChild(second);
    element.setAttribute("role", "status");
    element.setAttribute("aria-label", "Original");
    element.style.setProperty("white-space", "pre-wrap", "important");
    const ascii = new AsciiOutput({ width: 1, height: 1, element: element as unknown as HTMLElement, accessibleLabel: "Scene" });
    ascii.renderPixels({ width: 1, height: 1, pixels: new Uint8Array([255, 255, 255, 255]) });
    expect(element.getAttribute("role")).toBe("img");
    expect(element.getAttribute("aria-label")).toBe("Scene");
    expect(first.parentNode).toBeNull();
    ascii.dispose();
    expect(element.childNodes).toEqual([first, second]);
    expect(first.parentNode).toBe(element);
    expect(element.getAttribute("role")).toBe("status");
    expect(element.getAttribute("aria-label")).toBe("Original");
    expect(element.style.getPropertyValue("white-space")).toBe("pre-wrap");
    expect(element.style.getPropertyPriority("white-space")).toBe("important");
  });

  it("respects effective blend mode and material overrides without losing an earlier shell on failure", () => {
    const geometry = Geometry.litTriangle();
    const noNormals = Geometry.triangle();
    const opaque = new UnlitMaterial({ color: [1, 1, 1, 0.25], renderState: { blend: true, blendMode: "opaque", depthWrite: false } });
    const blended = new UnlitMaterial({ color: [1, 1, 1, 0.8], renderState: { blend: false, blendMode: "alpha", depthWrite: false } });
    const override = new MaterialInstance(blended);
    override.setOverride("u_baseColor", [1, 1, 1, 0.3]);
    const output = new OutlineOutput();
    const opaqueShell = output.items([{ geometry, material: opaque }])[0]!;
    expect(opaqueShell.material?.getParameter("u_baseColor")).toEqual([0, 0, 0, 1]);
    const blendedShell = output.items([{ geometry, material: override }])[0]!;
    expect(blendedShell.material?.getParameter("u_baseColor")).toEqual([0, 0, 0, 0.3]);
    expect(() => output.items([{ geometry, material: opaque }, { geometry: noNormals, material: opaque }])).toThrow(/normals/);
    expect(blendedShell.geometry.vertexBuffer.getAttribute(0, "position")).toHaveLength(3);
    output.dispose();
    opaque.dispose();
    blended.dispose();
    geometry.dispose();
    noNormals.dispose();
  });

  it("requires an explicit geometry approximation for unknown and alpha-dependent silhouettes", () => {
    const geometry = Geometry.litTriangle();
    const custom = new Material({ shaderKey: "my-custom-shader" });
    const coverage = new UnlitMaterial({ renderState: { alphaToCoverage: true } });
    const blend = new UnlitMaterial({ renderState: { blend: true, depthWrite: false } });
    const scissored = new UnlitMaterial({ renderState: { scissor: { x: 0, y: 0, width: 1, height: 1 } } });
    const instanced = { geometry, material: blend, instanceTransforms: identity, instanceColors: [1, 1, 1, 0.5] };
    const customized = { geometry, instanceAttributes: [{ shaderName: "a_custom", components: 4 as const, divisor: 1, data: [0, 0, 0, 1] }] };
    const strict = new OutlineOutput();
    const approximate = new OutlineOutput({ alphaMode: "geometry" });
    expect(() => strict.items([{ geometry, material: custom }])).toThrow(/custom shader alpha or deformation/);
    expect(() => strict.items([{ geometry, material: coverage }])).toThrow(/alpha cutouts, coverage, or per-pixel\/instance alpha/);
    expect(() => strict.items([instanced])).toThrow(/alpha cutouts, coverage, or per-pixel\/instance alpha/);
    expect(() => strict.items([{ geometry, material: scissored }])).toThrow(/scissor, stencil, color-write masks or custom instance attributes/);
    expect(() => strict.items([customized])).toThrow(/scissor, stencil, color-write masks or custom instance attributes/);
    expect(approximate.items([{ geometry, material: custom }, { geometry, material: coverage }, instanced])).toHaveLength(3);
    strict.dispose();
    approximate.dispose();
    custom.dispose();
    coverage.dispose();
    blend.dispose();
    scissored.dispose();
    geometry.dispose();
  });
});
