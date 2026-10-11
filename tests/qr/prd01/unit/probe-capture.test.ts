/**
 * PRD-02 S12 (lane-01 half): probe capture.
 *   (a) `Renderer.renderProbeFace(source, face, target, viewProjection)` renders
 *       into an off-size face target (128/256 px), opens/closes its own frame,
 *       refuses to nest inside one, and leaves the main frame graph alone;
 *   (b) a RenderItem's `environmentCube` overrides the scene cube for that
 *       draw only; items without one bind exactly what they did before.
 */

import { describe, expect, it } from "vitest";
import { PBRMaterial, Renderer, Texture, TextureBinding } from "@aura3d/rendering";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import type { ReflectionFaceRenderer } from "../../../../packages/rendering/src/probes/ReflectionProbeSystem";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function item(extra: Partial<RenderItem> = {}): RenderItem {
  const vertices = new VertexBuffer(VertexFormat.P3N3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  for (let i = 0; i < 3; i++) vertices.setAttribute(i, "normal", [0, 0, 1]);
  const geometry = new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
  return { geometry, material: new PBRMaterial({}), modelMatrix: IDENTITY, ...extra } as RenderItem;
}

function cube(label: string): TextureBinding {
  const cubeFaces = (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face) => ({
    face,
    mipLevels: [{ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }]
  }));
  const texture = new Texture({ width: 1, height: 1, format: "rgba8", dimension: "cube", colorSpace: "linear", cubeFaces, label });
  return new TextureBinding({ name: "u_environmentCubeMapTexture", texture, expectedDimension: "cube" });
}

type DrawSpy = { targets: unknown[]; frames: [number, number][]; cubes: unknown[] };

function spy(renderer: Renderer): DrawSpy {
  const device = (renderer as unknown as { device: Record<string, (...args: unknown[]) => unknown> }).device;
  const out: DrawSpy = { targets: [], frames: [], cubes: [] };
  const beginFrame = device.beginFrame!.bind(device);
  device.beginFrame = (w: unknown, h: unknown) => { out.frames.push([w as number, h as number]); return beginFrame(w, h); };
  const draw = device.draw!.bind(device);
  device.draw = (command: unknown) => {
    const c = command as { uniforms?: Map<string, unknown> };
    out.targets.push((device.getRenderTarget as () => unknown)());
    out.cubes.push(c.uniforms?.get("u_environmentCubeMapTexture"));
    return draw(command);
  };
  return out;
}

describe("S12 (a) Renderer.renderProbeFace", () => {
  for (const size of [128, 256] as const) {
    it(`renders into a ${size}px face target without RENDER_TARGET_VIEWPORT_MISMATCH`, async () => {
      const renderer = await Renderer.create({ backend: "mock", width: 64, height: 32 });
      const device = (renderer as unknown as { device: { createRenderTarget(d: { width: number; height: number }): { width: number; height: number } } }).device;
      const target = device.createRenderTarget({ width: size, height: size });
      const s = spy(renderer);
      try {
        const diagnostics = renderer.renderProbeFace([item()], 0, target as never, new Float32Array(IDENTITY));
        expect(diagnostics.drawCalls).toBeGreaterThan(0);
        expect(s.frames).toEqual([[size, size]]);
        expect(s.targets.every((t) => t === target)).toBe(true);
        // The main frame still renders at the viewport size afterwards.
        renderer.render([item()]);
        expect(s.frames.at(-1)).toEqual([64, 32]);
      } finally {
        renderer.dispose();
      }
    });
  }

  it("matches ReflectionFaceRenderer (assignable as the probe system's callback)", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    try {
      const scene = [item()];
      const callback: ReflectionFaceRenderer = (face, target, vp) => { renderer.renderProbeFace(scene, face, target, vp); };
      expect(typeof callback).toBe("function");
    } finally {
      renderer.dispose();
    }
  });

  it("refuses to nest inside an open frame (FRAME_ALREADY_ACTIVE)", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const device = (renderer as unknown as { device: { beginFrame(w: number, h: number): void; endFrame(): void; createRenderTarget(d: { width: number; height: number }): unknown } }).device;
    const target = device.createRenderTarget({ width: 128, height: 128 });
    device.beginFrame(16, 16);
    try {
      expect(() => renderer.renderProbeFace([item()], 2, target as never, IDENTITY)).toThrow(/Frame is already active/);
    } finally {
      device.endFrame();
      renderer.dispose();
    }
  });

  it("does not capture items that themselves sample a probe (no self-reflection)", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const device = (renderer as unknown as { device: { createRenderTarget(d: { width: number; height: number }): unknown } }).device;
    const target = device.createRenderTarget({ width: 128, height: 128 });
    try {
      const diagnostics = renderer.renderProbeFace([item({ environmentCube: cube("probe") })], 1, target as never, IDENTITY);
      expect(diagnostics.drawCalls).toBe(0);
    } finally {
      renderer.dispose();
    }
  });
});

describe("S12 (b) per-item environment cube override", () => {
  async function drawWith(items: RenderItem[], environmentCube?: TextureBinding) {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const s = spy(renderer);
    try {
      renderer.render({
        renderItems: items,
        environmentLighting: { color: [1, 1, 1], intensity: 1, ...(environmentCube ? { environmentCubeMapTexture: environmentCube, environmentMapMipCount: 1 } : {}) }
      } as never);
      return s.cubes;
    } finally {
      renderer.dispose();
    }
  }

  it("an item's environmentCube replaces the scene cube for that draw only", async () => {
    const sceneCube = cube("scene");
    const probe = cube("probe");
    const cubes = await drawWith([item({ label: "plain" }), item({ label: "probed", environmentCube: probe })], sceneCube);
    expect(cubes).toContain(sceneCube);
    expect(cubes).toContain(probe);
    expect(cubes.filter((c) => c === probe)).toHaveLength(1);
  });

  it("works when the scene has no environment cube at all", async () => {
    const probe = cube("probe");
    const cubes = await drawWith([item({ environmentCube: probe })]);
    expect(cubes).toEqual([probe]);
  });

  it("no override: binding is unchanged (bit-identical uniforms)", async () => {
    const sceneCube = cube("scene");
    const cubes = await drawWith([item()], sceneCube);
    expect(cubes).toEqual([sceneCube]);
  });
});
