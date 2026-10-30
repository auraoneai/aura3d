/**
 * GU47 E-E (WP-5) item 1, engine half: the authored `effects.outline({ targets })` names become the renderer's
 * `postprocess.outline.targets` match keys; an outline without `targets` adds nothing to the compiled options.
 */
import { describe, expect, it, vi } from "vitest";
import { effects } from "@aura3d/engine";
import type { AuraEffectNode } from "../../../../packages/engine/src/agent-api/nodes/types";
import { outlineTargetKeys, outlineTargetsField, outlineTargetsOfNode } from "../../../../packages/engine/src/agent-api/nodes/outlineTargets";
import { outlineTargetLabelMatches, outlineTargetsOf } from "../../../../packages/rendering/src/renderer/OutlineTargets";
import { RendererPostprocessPipeline } from "../../../../packages/rendering/src/renderer/PostprocessExecution";
import { MockRenderDevice } from "../../../../packages/rendering/src";

const node = (options: Parameters<typeof effects.outline>[0] = {}) => effects.outline(options).toJSON() as unknown as AuraEffectNode;

const SCENE_NODES = [
  { kind: "primitive", primitive: "sphere", name: "rider" },
  { kind: "model", name: "hero", asset: { id: "heroKnight" } },
  { kind: "model", name: "boss", asset: { id: "ogre" }, runtime: { id: "boss-1" } },
  { kind: "primitive", primitive: "box", name: "deck", runtime: { id: "board" } },
  { kind: "model", name: "crowd", asset: { id: "fan" } }
];

describe("GU47 E-E outline targets: engine field", () => {
  it("reads the authored names; absent targets stay absent", () => {
    expect(outlineTargetsOfNode(node({ targets: ["rider", "hero"] }))).toEqual(["rider", "hero"]);
    expect(outlineTargetsOfNode(node())).toBeUndefined();
    expect(outlineTargetsOfNode(undefined)).toBeUndefined();
  });

  it("an outline without targets compiles exactly as before (no field)", () => {
    expect(outlineTargetsField(node({ width: 2 }), SCENE_NODES)).toEqual({});
    expect(outlineTargetsField(undefined, SCENE_NODES)).toEqual({});
  });

  it("adds each target's node name and model id as match keys", () => {
    expect(outlineTargetKeys(["rider", "hero", "boss-1", "board"], SCENE_NODES)).toEqual(["rider", "hero", "boss-1", "board", "heroKnight", "boss", "deck"]);
    expect(outlineTargetsField(node({ targets: [] }), SCENE_NODES)).toEqual({ targets: [] });
  });

  it("the keys match the engine's render-item labels for the targets and nothing else", () => {
    const field = outlineTargetsField(node({ targets: ["rider", "hero"] }), SCENE_NODES);
    const keys = new Set(outlineTargetsOf({ color: [0, 0, 0, 255], width: 2, ...field })!);
    expect(outlineTargetLabelMatches("primitive-0:sphere-1:rider", keys)).toBe(true);
    expect(outlineTargetLabelMatches("actor-0:mesh-3:heroKnight:Cape:geometry-2", keys)).toBe(true);
    expect(outlineTargetLabelMatches("actor-1:mesh-0:fan:Body:geometry-0", keys)).toBe(false);
    expect(outlineTargetLabelMatches("primitive-3:box-4:deck", keys)).toBe(false);
  });
});

describe("GU47 E-E outline targets: post chain wiring", () => {
  function pipelineWithSpies() {
    const device = new MockRenderDevice();
    const pipeline = new RendererPostprocessPipeline({ device, width: 16, height: 16 } as never);
    const chain = vi.spyOn(pipeline as never as { executePostprocessChain: (...args: unknown[]) => void }, "executePostprocessChain").mockImplementation(() => {});
    const ink = vi.spyOn(pipeline as never as { executeOutlineTargets: (...args: unknown[]) => void }, "executeOutlineTargets").mockImplementation(() => {});
    return { device, pipeline, chain, ink };
  }

  it("an outline without targets reaches the chain as the same options object and no target ink runs", () => {
    const { device, pipeline, chain, ink } = pipelineWithSpies();
    const postprocess = { outline: { color: [255, 152, 34, 255] as const, width: 3, threshold: 0.12, opacity: 0.9 } };
    const target = device.createRenderTarget({ width: 16, height: 16 });
    pipeline.executePostprocess(postprocess, [target]);
    expect(chain).toHaveBeenCalledTimes(1);
    expect(chain.mock.calls[0]![0]).toBe(postprocess);
    expect(ink).not.toHaveBeenCalled();
  });

  it("a targeted outline runs the chain without the luma outline, then the target ink", () => {
    const { device, pipeline, chain, ink } = pipelineWithSpies();
    const postprocess = { bloom: { intensity: 0.4 }, outline: { color: [27, 34, 54, 255] as const, width: 2, opacity: 1, targets: ["rider"] } } as never;
    const target = device.createRenderTarget({ width: 16, height: 16 });
    pipeline.executePostprocess(postprocess, [target]);
    const chained = chain.mock.calls[0]![0] as Record<string, unknown>;
    expect("outline" in chained).toBe(false);
    expect(chained.bloom).toEqual({ intensity: 0.4 });
    expect(ink).toHaveBeenCalledTimes(1);
    expect(ink.mock.calls[0]![1]).toEqual(["rider"]);
  });
});
