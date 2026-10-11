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
