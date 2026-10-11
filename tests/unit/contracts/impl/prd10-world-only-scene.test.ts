/**
 * PRD-10 #1175: a scene whose only drawable content is world nodes declares
 * WebGL content, so createAuraApp mounts the production renderer (whose prd10
 * frame contributor draws it) instead of the diagnostic canvas2d backend.
 */
import { describe, expect, it } from "vitest";
import { declaresWebGLContent } from "../../../../packages/engine/src/agent-api/compiler/observations";
import type { AuraSceneNode } from "../../../../packages/engine/src/agent-api/index";

const node = (kind: string) => ({ kind, id: kind }) as unknown as AuraSceneNode;

describe("declaresWebGLContent", () => {
  it("counts terrain, water and grass world nodes", () => {
    for (const kind of ["terrain", "water", "grass"]) expect(declaresWebGLContent([node(kind)]), kind).toBe(true);
  });
  it("still counts primitives and ignores non-drawable nodes", () => {
    expect(declaresWebGLContent([node("primitive")])).toBe(true);
    expect(declaresWebGLContent([node("light"), node("camera")])).toBe(false);
    expect(declaresWebGLContent([])).toBe(false);
  });
});

describe("production content rule counts world content (#1175)", () => {
  const input = (primitives: number, materials: number) =>
    ({ metadata: { primitiveCount: primitives, meshCount: primitives, materialCount: materials } }) as never;
  it("accepts a world-only frame and still rejects an empty one", async () => {
    const { validateProductionRendererInput } = await import("../../../../packages/rendering/src/production-runtime/renderProofs");
    expect(() => validateProductionRendererInput(input(0, 0), { contributorDrawnNodes: 2 })).not.toThrow();
    expect(() => validateProductionRendererInput(input(0, 0), { contributorDrawnNodes: 0 })).toThrow(/real mesh primitive/);
    expect(() => validateProductionRendererInput(input(0, 0))).toThrow(/real mesh primitive/);
    expect(() => validateProductionRendererInput(input(3, 0))).toThrow(/real material/);
    expect(() => validateProductionRendererInput(input(3, 1))).not.toThrow();
  });
  it("counts terrain/water/grass nodes only", async () => {
    const { countWorldContentNodes } = await import("../../../../packages/engine/src/agent-api/compiler/observations");
    expect(countWorldContentNodes([node("terrain"), node("water"), node("primitive"), node("light")])).toBe(2);
  });
});
