/**
 * threejs-parity AD-15 (P2): `lights.lensFlare` — three's `Lensflare`.
 * Placement math is pinned to three's own source
 * (examples/jsm/objects/Lensflare.js `onBeforeRender`), and the per-frame
 * runtime is exercised for real render items.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { camera, lights, scene } from "../../../packages/engine/src";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors";
import { createLensFlareGlowPixels, createProductionLensFlares } from "../../../packages/engine/src/agent-api/compiler/lensFlare";
import {
  DEFAULT_LENS_FLARE_ELEMENTS,
  isAuraLensFlareNode,
  lensFlareSpriteTransform,
  lensFlareVisibility,
  placeLensFlareElements,
  projectLensFlareSource,
  type AuraLensFlareNode
} from "../../../packages/engine/src/agent-api/nodes/lensFlare";
import { nodeHandlers, isKnownNodeKind } from "../../../packages/engine/src/agent-api/compiler/handlers";
import type { AuraVec3 } from "../../../packages/engine/src/agent-api/nodes/types";

const FRONT_CAMERA = { eye: [0, 0, 10] as AuraVec3, target: [0, 0, 0] as AuraVec3 };

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("placement math is pinned to three's Lensflare.js", () => {
  const source = readFileSync(join(process.cwd(), "node_modules/three/examples/jsm/objects/Lensflare.js"), "utf8");

  it("three still places elements with the formula this port implements", () => {
    expect(source).toContain("const vecX = - positionScreen.x * 2;");
    expect(source).toContain("const vecY = - positionScreen.y * 2;");
    expect(source).toContain("screenPosition' ].value.x = positionScreen.x + vecX * element.distance;");
    expect(source).toContain("screenPosition' ].value.y = positionScreen.y + vecY * element.distance;");
    expect(source).toContain("size = element.size / viewport.w;");
  });

  it("matches three's formula on 500 seeded lights x element layouts", () => {
    const random = seeded(0xf1a2e);
    for (let i = 0; i < 500; i += 1) {
      const lightNdc: [number, number] = [random() * 2 - 1, random() * 2 - 1];
      const height = 200 + Math.floor(random() * 1800);
      const elements = Array.from({ length: 1 + Math.floor(random() * 6) }, () => ({ size: 8 + random() * 800, distance: random() * 2 - 0.5 }));
      const placed = placeLensFlareElements(lightNdc, elements, height);
      // three (Lensflare.js:286-303), transcribed:
      const vecX = -lightNdc[0] * 2;
      const vecY = -lightNdc[1] * 2;
      elements.forEach((element, index) => {
        expect(placed[index]!.ndc[0]).toBeCloseTo(lightNdc[0] + vecX * element.distance, 12);
        expect(placed[index]!.ndc[1]).toBeCloseTo(lightNdc[1] + vecY * element.distance, 12);
        expect(placed[index]!.sizeNdc).toBeCloseTo(element.size / height, 12);
        expect(placed[index]!.sizePx).toBe(element.size);
      });
    }
  });

  it("distance 0 sits on the light, 0.5 on the centre, 1 mirrors through the centre", () => {
    const [on, mid, mirror] = placeLensFlareElements([0.4, -0.2], [{ size: 1, distance: 0 }, { size: 1, distance: 0.5 }, { size: 1, distance: 1 }], 100);
    expect(on!.ndc).toEqual([0.4, -0.2]);
    expect(mid!.ndc[0]).toBeCloseTo(0, 12);
    expect(mid!.ndc[1]).toBeCloseTo(0, 12);
    expect(mirror!.ndc[0]).toBeCloseTo(-0.4, 12);
    expect(mirror!.ndc[1]).toBeCloseTo(0.2, 12);
  });
});

describe("projectLensFlareSource", () => {
  it("projects straight ahead to the screen centre and reports depth", () => {
    const projected = projectLensFlareSource([0, 0, 0], FRONT_CAMERA, { mode: "perspective", fov: 90 }, 1);
    expect(projected!.ndc[0]).toBeCloseTo(0, 12);
    expect(projected!.ndc[1]).toBeCloseTo(0, 12);
    expect(projected!.depth).toBeCloseTo(10, 12);
  });

  it("matches the pinhole model: x = +right, y = +up, scaled by 1/(depth·tan(fov/2)·aspect)", () => {
    const edge = projectLensFlareSource([10, 0, 0], FRONT_CAMERA, { mode: "perspective", fov: 90 }, 1)!;
    expect(edge.ndc[0]).toBeCloseTo(1, 12);
    const wide = projectLensFlareSource([10, 5, 0], FRONT_CAMERA, { mode: "perspective", fov: 90 }, 2)!;
    expect(wide.ndc[0]).toBeCloseTo(0.5, 12);
    expect(wide.ndc[1]).toBeCloseTo(0.5, 12);
    const narrow = projectLensFlareSource([1, 1, 0], FRONT_CAMERA, { mode: "perspective", fov: 60 }, 1)!;
    expect(narrow.ndc[0]).toBeCloseTo(1 / (10 * Math.tan(Math.PI / 6)), 12);
  });

  it("returns null for points behind or level with the camera", () => {
    expect(projectLensFlareSource([0, 0, 20], FRONT_CAMERA, { mode: "perspective", fov: 60 }, 1)).toBeNull();
    expect(projectLensFlareSource([3, 0, 10], FRONT_CAMERA, { mode: "perspective", fov: 60 }, 1)).toBeNull();
  });

  it("handles orthographic cameras and straight-down views", () => {
    const ortho = projectLensFlareSource([4, 2, 0], FRONT_CAMERA, { mode: "orthographic", orthographicSize: 2 }, 2)!;
    expect(ortho.ndc[0]).toBeCloseTo(1, 12);
    expect(ortho.ndc[1]).toBeCloseTo(1, 12);
    const down = projectLensFlareSource([0, 0, 0], { eye: [0, 10, 0], target: [0, 0, 0] }, { mode: "perspective", fov: 60 }, 1)!;
    expect(down.ndc[0]).toBeCloseTo(0, 12);
    expect(down.ndc[1]).toBeCloseTo(0, 12);
  });
});

describe("lensFlareSpriteTransform", () => {
  it("lands the sprite on the requested NDC and gives the requested on-screen size (perspective)", () => {
    const cam = { mode: "perspective", fov: 50 };
    const aspect = 16 / 9;
    const height = 720;
    for (const ndc of [[0, 0], [0.6, -0.3], [-0.9, 0.8]] as const) {
      const { position, scale } = lensFlareSpriteTransform(ndc, 120, FRONT_CAMERA, cam, aspect, height, 2);
      const back = projectLensFlareSource(position, FRONT_CAMERA, cam, aspect)!;
      expect(back.ndc[0]).toBeCloseTo(ndc[0], 9);
      expect(back.ndc[1]).toBeCloseTo(ndc[1], 9);
      // Sprite shader (sizeAttenuation:false): view height = scale·depth; screen px = that / (2·depth·tan(fov/2)) · H.
      const pixels = (scale / (2 * Math.tan((50 * Math.PI) / 360))) * height;
      expect(pixels).toBeCloseTo(120, 9);
    }
  });

  it("is independent of the plane distance in screen space", () => {
    const cam = { mode: "perspective", fov: 40 };
    const near = lensFlareSpriteTransform([0.3, 0.2], 80, FRONT_CAMERA, cam, 1.5, 600, 1);
    const far = lensFlareSpriteTransform([0.3, 0.2], 80, FRONT_CAMERA, cam, 1.5, 600, 5);
    expect(near.scale).toBeCloseTo(far.scale, 12);
    expect(projectLensFlareSource(far.position, FRONT_CAMERA, cam, 1.5)!.ndc[0]).toBeCloseTo(0.3, 9);
  });

  it("uses world-unit scale for orthographic cameras", () => {
    const cam = { mode: "orthographic", orthographicSize: 3 };
    const { position, scale } = lensFlareSpriteTransform([0.5, -0.5], 100, FRONT_CAMERA, cam, 2, 500, 1);
    expect(scale).toBeCloseTo(2 * 3 * (100 / 500), 12);
    const back = projectLensFlareSource(position, FRONT_CAMERA, cam, 2)!;
    expect(back.ndc[0]).toBeCloseTo(0.5, 9);
    expect(back.ndc[1]).toBeCloseTo(-0.5, 9);
  });
});

describe("lensFlareVisibility", () => {
  it("is 0 off-screen, 1 inside the fade margin, ramping linearly toward the edge", () => {
    expect(lensFlareVisibility([1.2, 0], "frustum", 0.2)).toBe(0);
    expect(lensFlareVisibility([0, -1], "frustum", 0.2)).toBe(0);
    expect(lensFlareVisibility([0, 0], "frustum", 0.2)).toBe(1);
    expect(lensFlareVisibility([0.9, 0], "frustum", 0.2)).toBeCloseTo(0.5, 12);
    expect(lensFlareVisibility([0.95, 0.1], "frustum", 0)).toBe(1);
  });

  it("occlusion 'none' never fades", () => {
    expect(lensFlareVisibility([5, 5], "none", 0.5)).toBe(1);
  });
});

describe("lights.lensFlare builder", () => {
  it("emits a lensflare node with three's example element layout by default", () => {
    const node = lights.lensFlare({ position: [1, 2, 3] }).toJSON();
    expect(isAuraLensFlareNode(node)).toBe(true);
    const flare = node as AuraLensFlareNode;
    expect(flare.position).toEqual([1, 2, 3]);
    expect(flare.elements).toBe(DEFAULT_LENS_FLARE_ELEMENTS);
    expect(flare.elements).toHaveLength(5);
    expect(flare.elements[0]).toMatchObject({ size: 700, distance: 0 });
    expect(flare.occlusion).toBe("frustum");
    expect(flare.edgeFade).toBeCloseTo(0.15, 12);
    expect(flare.intensity).toBe(1);
  });

  it("is a known node kind so the scene compiler does not report it as unknown", () => {
    expect(isKnownNodeKind("lensflare")).toBe(true);
    expect(nodeHandlers.lensflare.kind).toBe("lensflare");
  });

  it("validates options with invalid-lens-flare", () => {
    const bad = (options: Parameters<typeof lights.lensFlare>[0]) => {
      try {
        lights.lensFlare(options);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuraRuntimeError);
        expect((error as AuraRuntimeError).code).toBe("invalid-lens-flare");
        return (error as AuraRuntimeError).message;
      }
      return "";
    };
    expect(bad({ elements: [] })).toMatch(/non-empty/);
    expect(bad({ elements: [{ size: 0, distance: 0 }] })).toMatch(/size/);
    expect(bad({ elements: [{ size: 10, distance: Number.NaN }] })).toMatch(/distance/);
    expect(bad({ elements: [{ size: 10, distance: 0, texture: { kind: "x" } as never }] })).toMatch(/texture/);
    expect(bad({ occlusion: "depth" as never })).toMatch(/occlusion/);
    expect(bad({ edgeFade: 2 })).toMatch(/edgeFade/);
    expect(bad({ intensity: -1 })).toMatch(/intensity/);
    expect(bad({ light: "" })).toMatch(/light/);
  });
});

describe("glow texture", () => {
  it("is a soft radial falloff: opaque white centre, transparent corners", () => {
    const pixels = createLensFlareGlowPixels(32);
    const at = (x: number, y: number) => pixels.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
    expect(Array.from(at(15, 15)).slice(0, 3)).toEqual([255, 255, 255]);
    expect(at(15, 15)[3]).toBeGreaterThan(240);
    expect(at(0, 0)[3]).toBe(0);
    expect(at(31, 31)[3]).toBe(0);
    expect(at(15, 8)[3]).toBeLessThan(at(15, 12)[3]!);
  });
});

describe("production lens flare runtime", () => {
  const baseItem = { label: "base" };
  const makeSource = () => ({ collectRenderItems: () => [baseItem] }) as never;
  const flareScene = (options: Parameters<typeof lights.lensFlare>[0], position: AuraVec3 = [0, 0, 10], fov = 60) =>
    scene()
      .camera(camera.perspective({ position, target: [0, 0, 0], fov }))
      .add(lights.lensFlare(options))
      .toJSON();
  const itemsOf = (source: { collectRenderItems?: () => readonly unknown[] }) => (source.collectRenderItems?.() ?? []) as readonly {
    label: string;
    material: { renderState: Record<string, unknown>; getParameter(name: string): unknown };
    modelMatrix: Float32Array;
    includeInAutoFrame?: boolean;
  }[];

  it("returns the source untouched when the scene has no lens flares", () => {
    const flares = createProductionLensFlares(() => undefined);
    const snapshot = scene().camera(camera.orbit()).toJSON();
    const source = makeSource();
    expect(flares.prepare(source, snapshot, undefined, 0, 16 / 9, 720)).toBe(source);
    flares.dispose();
  });

  it("appends one additive, depth-less sprite per element, placed by three's rule", () => {
    const flares = createProductionLensFlares(() => undefined);
    const snapshot = flareScene({ position: [2, 1, 0] });
    const aspect = 16 / 9;
    const out = flares.prepare(makeSource(), snapshot, undefined, 0, aspect, 720);
    const items = itemsOf(out as never);
    expect(items).toHaveLength(1 + DEFAULT_LENS_FLARE_ELEMENTS.length);
    expect(items[0]).toBe(baseItem);

    const frame = { eye: [0, 0, 10] as AuraVec3, target: [0, 0, 0] as AuraVec3 };
    const light = projectLensFlareSource([2, 1, 0], frame, { mode: "perspective", fov: 60 }, aspect)!;
    const expected = placeLensFlareElements(light.ndc, DEFAULT_LENS_FLARE_ELEMENTS, 720);
    items.slice(1).forEach((item, index) => {
      expect(item.material.renderState).toMatchObject({ blend: true, blendMode: "additive", depthTest: false, depthWrite: false });
      expect(item.material.getParameter("u_spriteMode")).toBe(1);
      expect(item.includeInAutoFrame).toBe(false);
      const m = item.modelMatrix;
      const centre = projectLensFlareSource([m[12]!, m[13]!, m[14]!], frame, { mode: "perspective", fov: 60 }, aspect)!;
      expect(centre.ndc[0]).toBeCloseTo(expected[index]!.ndc[0], 5);
      expect(centre.ndc[1]).toBeCloseTo(expected[index]!.ndc[1], 5);
      const pixels = (m[0]! / (2 * Math.tan(Math.PI / 6))) * 720;
      expect(pixels).toBeCloseTo(DEFAULT_LENS_FLARE_ELEMENTS[index]!.size, 4);
    });
    flares.dispose();
  });

  it("skips flares whose light is behind the camera or off-screen", () => {
    const flares = createProductionLensFlares(() => undefined);
    const source = makeSource();
    expect(flares.prepare(source, flareScene({ position: [0, 0, 20] }), undefined, 0, 16 / 9, 720)).toBe(source);
    expect(flares.prepare(source, flareScene({ position: [60, 0, 0] }), undefined, 0, 16 / 9, 720)).toBe(source);
    flares.dispose();
  });

  it("occlusion 'none' still draws an off-screen light that is in front of the camera", () => {
    const flares = createProductionLensFlares(() => undefined);
    const out = flares.prepare(makeSource(), flareScene({ position: [60, 0, 0], occlusion: "none" }), undefined, 0, 16 / 9, 720);
    expect(itemsOf(out as never)).toHaveLength(1 + DEFAULT_LENS_FLARE_ELEMENTS.length);
    flares.dispose();
  });

  it("scales element colour by intensity and by the edge fade", () => {
    const flares = createProductionLensFlares(() => undefined);
    const colorOf = (options: Parameters<typeof lights.lensFlare>[0], position: AuraVec3): number => {
      const items = itemsOf(flares.prepare(makeSource(), flareScene({ elements: [{ size: 100, distance: 0 }], ...options, position }), undefined, 0, 1, 600) as never);
      return (items[1]!.material.getParameter("u_baseColor") as number[])[0]!;
    };
    const centre = colorOf({}, [0, 0, 0]);
    expect(colorOf({ intensity: 0.5 }, [0, 0, 0])).toBeCloseTo(centre * 0.5, 9);
    // fov 60 at distance 10: tan(30°)·10 ≈ 5.77 → x = 5.2 is ndc ≈ 0.9, inside a 0.2 fade margin ⇒ ~0.5.
    expect(colorOf({ edgeFade: 0.2 }, [5.2, 0, 0])).toBeCloseTo(centre * 0.5, 1);
    expect(colorOf({ edgeFade: 0.2, occlusion: "none" }, [5.2, 0, 0])).toBeCloseTo(centre, 9);
    flares.dispose();
  });

  it("tints each element and honours per-element colour", () => {
    const flares = createProductionLensFlares(() => undefined);
    const items = itemsOf(
      flares.prepare(makeSource(), flareScene({ position: [0, 0, 0], elements: [{ size: 40, distance: 0, color: "#ff0000" }, { size: 40, distance: 1, color: "#0000ff" }] }), undefined, 0, 1, 600) as never
    );
    const red = items[1]!.material.getParameter("u_baseColor") as number[];
    const blue = items[2]!.material.getParameter("u_baseColor") as number[];
    expect(red[0]).toBeGreaterThan(0.9);
    expect(red[2]).toBe(0);
    expect(blue[2]).toBeGreaterThan(0.9);
    expect(blue[0]).toBe(0);
    flares.dispose();
  });

  it("resolves `light` by name and warns when no such light exists", () => {
    const warnings: string[] = [];
    const flares = createProductionLensFlares((message) => warnings.push(message));
    const withLight = scene()
      .camera(camera.perspective({ position: [0, 0, 10], target: [0, 0, 0], fov: 60 }))
      .add(lights.hemisphere({ name: "sun", position: [2, 1, 0] }))
      .add(lights.lensFlare({ light: "sun" }))
      .toJSON();
    const frame = { eye: [0, 0, 10] as AuraVec3, target: [0, 0, 0] as AuraVec3 };
    const light = projectLensFlareSource([2, 1, 0], frame, { mode: "perspective", fov: 60 }, 1)!;
    const items = itemsOf(flares.prepare(makeSource(), withLight, undefined, 0, 1, 600) as never);
    const m = items[1]!.modelMatrix;
    expect(projectLensFlareSource([m[12]!, m[13]!, m[14]!], frame, { mode: "perspective", fov: 60 }, 1)!.ndc[0]).toBeCloseTo(light.ndc[0], 5);

    const source = makeSource();
    expect(flares.prepare(source, flareScene({ light: "missing" }), undefined, 0, 1, 600)).toBe(source);
    expect(warnings.some((message) => message.includes('no light node named "missing"'))).toBe(true);
    flares.dispose();
  });

  it("follows the live runtime handle position and hides with handle.visible=false", () => {
    const flares = createProductionLensFlares(() => undefined);
    const snapshot = flareScene({ position: [0, 0, 0], runtime: { id: "flare-1" } });
    const registry = (handle: { position?: AuraVec3; visible?: boolean }) => ({ get: (id: string) => (id === "flare-1" ? handle : undefined) }) as never;
    const moved = itemsOf(flares.prepare(makeSource(), snapshot, registry({ position: [3, 0, 0] }), 0, 1, 600) as never);
    const m = moved[1]!.modelMatrix;
    const frame = { eye: [0, 0, 10] as AuraVec3, target: [0, 0, 0] as AuraVec3 };
    expect(projectLensFlareSource([m[12]!, m[13]!, m[14]!], frame, { mode: "perspective", fov: 60 }, 1)!.ndc[0]).toBeGreaterThan(0.4);
    const source = makeSource();
    expect(flares.prepare(source, snapshot, registry({ visible: false }), 0, 1, 600)).toBe(source);
    flares.dispose();
  });

  it("dispose is idempotent and a disposed runtime passes the source through", () => {
    const flares = createProductionLensFlares(() => undefined);
    flares.prepare(makeSource(), flareScene({}), undefined, 0, 1, 600);
    flares.dispose();
    flares.dispose();
    const source = makeSource();
    expect(flares.prepare(source, flareScene({}), undefined, 0, 1, 600)).toBe(source);
  });
});
