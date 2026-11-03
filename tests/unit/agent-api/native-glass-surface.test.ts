import { describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TexturedUnlitMaterial } from "../../../packages/rendering/src/TexturedUnlitMaterial";
import type { RenderItem } from "../../../packages/rendering/src/ForwardPass";
import { createProductionParitySurfaces, glassPaneViewProjection } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { isAuraGlassSurfaceNode } from "../../../packages/engine/src/agent-api/nodes/surfaces";
import { camera, primitives, scene, surfaces } from "../../../packages/engine/src";

/** Project a world point with a column-major view-projection into NDC x/y. */
function ndc(matrix: ArrayLike<number>, p: readonly [number, number, number]): [number, number] {
  const x = matrix[0]! * p[0] + matrix[4]! * p[1] + matrix[8]! * p[2] + matrix[12]!;
  const y = matrix[1]! * p[0] + matrix[5]! * p[1] + matrix[9]! * p[2] + matrix[13]!;
  const w = matrix[3]! * p[0] + matrix[7]! * p[1] + matrix[11]! * p[2] + matrix[15]!;
  return [x / w, y / w];
}

describe("surfaces.glass (refractor) self-captures its background", () => {
  it("emits a typed glass surface node with validated optics", () => {
    const node = surfaces.glass({ name: "window", size: [2, 1], position: [0, 1, 0], thickness: 0.2, roughness: 0.4, tint: "#c0e0ff" }).toJSON();
    expect(isAuraGlassSurfaceNode(node)).toBe(true);
    expect(node).toMatchObject({ kind: "surface", surface: "glass", name: "window", size: [2, 1], resolution: 128, thickness: 0.2, roughness: 0.4, absorption: 0.35 });
    expect(() => surfaces.glass({ roughness: 2 })).toThrow(/roughness/);
    expect(() => surfaces.glass({ size: [0, 1] })).toThrow(/width/);
  });

  it("fits the capture frustum to the pane from either side", () => {
    const centre = [1, 1, 0] as const, size = [2, 1] as const;
    for (const eye of [[0, 0, 6], [3, 2, -4]] as const) {
      const pane = glassPaneViewProjection(eye, centre, size)!;
      expect(pane.facing).toBe(eye[2] > 0 ? 1 : -1);
      // Viewer-left/bottom pane corner -> NDC (-1,-1); viewer-right/top -> (1,1).
      const leftX = centre[0] - pane.facing * size[0] / 2, rightX = centre[0] + pane.facing * size[0] / 2;
      ndc(pane.viewProjection, [leftX, 0.5, 0]).forEach((value) => expect(value).toBeCloseTo(-1, 5));
      ndc(pane.viewProjection, [rightX, 1.5, 0]).forEach((value) => expect(value).toBeCloseTo(1, 5));
    }
    expect(glassPaneViewProjection([0, 0, 0], [0, 0, 0], size)).toBeUndefined();
  });

  it("renders the scene behind the pane into its own capture and draws the refracted pane", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64 });
    try {
      const warnings: string[] = [];
      const parity = createProductionParitySurfaces(renderer, (message) => warnings.push(message));
      const snapshot = scene()
        .camera(camera.perspective({ position: [0, 1, 6], target: [0, 1, 0], fov: 40 }))
        .add(surfaces.glass({ name: "window", size: [2, 1], position: [0, 1, 0], thickness: 0.5, roughness: 0.3, resolution: 16 }))
        .add(primitives.box({ name: "behind" }).position(0, 1, -3))
        .toJSON();
      const behind: RenderItem = {
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "behind" }),
        label: "behind",
        modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, -3, 1]),
        includeInAutoFrame: false
      };
      const render = vi.spyOn(renderer, "render");
      const source = parity.prepare({ collectRenderItems: () => [behind], cameraPolicy: "require" }, snapshot as never, undefined, 0, 1);
      expect(warnings).toEqual([]);

      // The capture is a real render of the frame's items into a renderer-owned target.
      expect(render).toHaveBeenCalledTimes(1);
      const [captureArg, captureOptions] = render.mock.calls[0]!;
      const captureSource = captureArg as { readonly renderTarget?: unknown; readonly renderItems?: readonly RenderItem[] };
      expect(captureSource.renderTarget).toBeDefined();
      expect(captureSource.renderItems).toEqual([behind]);
      const viewProjection = (captureOptions as { viewProjectionMatrix: Float32Array }).viewProjectionMatrix;
      ndc(viewProjection, [-1, 0.5, 0]).forEach((value) => expect(value).toBeCloseTo(-1, 5));
      ndc(viewProjection, [1, 1.5, 0]).forEach((value) => expect(value).toBeCloseTo(1, 5));

      // The frame now carries the pane, sampling the self-captured, thickness-tinted texture.
      const items = [...source.collectRenderItems!()] as RenderItem[];
      expect(items[0]).toBe(behind);
      const pane = items.find((item) => item.label?.includes("window glass sampling its self-captured"))!;
      expect(pane).toBeDefined();
      expect(pane.material).toBeInstanceOf(TexturedUnlitMaterial);
      expect(Array.from(pane.modelMatrix!)).toEqual([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.02, 0, 0, 1, 0, 1].map(Math.fround));
      const texture = ((pane.material as TexturedUnlitMaterial).getParameter("u_baseColorTexture") as unknown as { texture: { label?: string } }).texture;
      expect(texture.label).toMatch(/window-glass-refraction-r1/);
      parity.dispose();
    } finally {
      renderer.dispose();
    }
  });
});
