/**
 * 01-S1 (PRD-16; PRD-01 §6.1, §8.4, C-01): RendererFrameHooks impl conformance.
 *   - the forward target is published on the blackboard and `ctx.sceneDepth`
 *     exposes its depth texture (R-01-1);
 *   - the scene-depth copy is published for after-opaque consumers;
 *   - flags off: registered contributors are never called (0 calls);
 *   - a display-space pass in `post-hdr` throws FRAME_PHASE_SPACE_MISMATCH;
 *   - transparent queue items come back with their context, so the Renderer
 *     can interleave them by `sortDepth`;
 *   - reserved phases (`opaque`, `output`) belong to prd01.
 * Browser `frame-graph.spec.ts` (real device) is the remote half of 01-S1.
 */

import { afterEach, describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { registerFrameContributor, type FrameContributor, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { MockRenderDevice, type RenderTarget } from "../../../../packages/rendering/src/RenderDevice";
import { BaseRenderPass, type RenderPassContext } from "../../../../packages/rendering/src/RenderPass";
import { RenderGraph } from "../../../../packages/rendering/src/RenderGraph";
import {
  AURA_SCENE_DEPTH_COPY,
  PRD01_FORWARD_TARGET,
  createRendererFrameHooks,
  setRendererQrFlags
} from "../../../../packages/rendering/src/renderer/FrameGraph";

const ON = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const OFF = resolveQrFlags({ env: { A3D_QR_CORE: "0" } });

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length > 0) disposers.pop()!();
});

function register(c: Omit<FrameContributor, "owner" | "flag"> & Partial<Pick<FrameContributor, "owner" | "flag">>): void {
  disposers.push(registerFrameContributor({ owner: "prd01", flag: "A3D_QR_CORE", ...c } as FrameContributor));
}

class TestPass extends BaseRenderPass {
  executed = 0;
  constructor(name: string, readonly space?: "linear-hdr" | "display") {
    super(name, [], ["aura.scene.color"]);
  }
  execute(_context: RenderPassContext): void {
    this.executed += 1;
  }
}

function hooks(flags = ON) {
  const device = new MockRenderDevice();
  setRendererQrFlags(flags, device);
  return { device, frame: createRendererFrameHooks({ device, width: 64, height: 32, source: { renderItems: [] }, camera: null }) };
}

const fakeTarget = (depth: unknown) => ({ id: "fwd", depthTexture: depth }) as unknown as RenderTarget;

describe("01-S1 RendererFrameHooks: blackboard + sceneDepth", () => {
  it("publishes the forward target and exposes its depth texture", () => {
    const { frame } = hooks();
    let seen: FrameContributorContext | undefined;
    register({ id: "prd01.s1Probe", phases: ["after-opaque"], passes: (_p, ctx) => { seen = ctx; return []; } });
    const depth = { id: "depth-tex" };
    frame.setForwardTarget(fakeTarget(depth));
    frame.addPasses(new RenderGraph(), "after-opaque", []);
    expect(seen?.blackboard.get(PRD01_FORWARD_TARGET)).toMatchObject({ id: "fwd" });
    expect(seen?.sceneDepth.texture).toBe(depth);
    expect(seen?.sceneDepth.available).toBe(true);
    expect(seen?.sceneDepth.linearize).toEqual({ near: 0.1, far: 1000, orthographic: false });
  });

  it("without a forward target sceneDepth is unavailable and nothing is published", () => {
    const { frame } = hooks();
    let seen: FrameContributorContext | undefined;
    register({ id: "prd01.s1Probe", phases: ["after-opaque"], passes: (_p, ctx) => { seen = ctx; return []; } });
    frame.addPasses(new RenderGraph(), "after-opaque", []);
    expect(seen?.sceneDepth.available).toBe(false);
    expect(seen?.sceneDepth.texture).toBeNull();
    expect(seen?.blackboard.has(PRD01_FORWARD_TARGET)).toBe(false);
  });

  it("publishes the scene-depth copy for after-opaque consumers", () => {
    const { frame } = hooks();
    const copy = fakeTarget(null);
    frame.setSceneDepthCopy(copy);
    expect(frame.blackboardValue(AURA_SCENE_DEPTH_COPY)).toBe(copy);
  });
});

describe("01-S1 RendererFrameHooks: flags off", () => {
  it("never calls a contributor whose flag is off (0 calls)", () => {
    const { frame } = hooks(OFF);
    let calls = 0;
    register({
      id: "prd01.s1Off", phases: ["collect", "after-opaque", "transparent", "post-hdr"],
      collect: (items) => { calls++; return items; },
      passes: () => { calls++; return []; },
      transparentItems: () => { calls++; return []; }
    });
    const items: never[] = [];
    expect(frame.collect(items)).toBe(items);
    const graph = new RenderGraph();
    frame.addPasses(graph, "after-opaque", items);
    frame.addTransparentContributorPasses(graph, items);
    frame.runPhase("post-hdr", items);
    expect(frame.transparentQueues(items).queues).toEqual([]);
    expect(graph.compile()).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("01-S1 RendererFrameHooks: phase space", () => {
  it("a display-space pass in post-hdr throws FRAME_PHASE_SPACE_MISMATCH", () => {
    const { frame } = hooks();
    register({ id: "prd01.s1Display", phases: ["post-hdr"], passes: () => [new TestPass("bad-display", "display")] });
    expect(() => frame.runPhase("post-hdr", [])).toThrow(/^FRAME_PHASE_SPACE_MISMATCH:post-hdr:prd01\.s1Display:bad-display$/);
    expect(() => frame.addPasses(new RenderGraph(), "post-hdr", [])).toThrow(/FRAME_PHASE_SPACE_MISMATCH/);
  });

  it("linear-hdr passes run in post-hdr; a disabled phase skips without running", () => {
    const { frame } = hooks();
    const pass = new TestPass("ok-linear", "linear-hdr");
    register({ id: "prd01.s1Linear", phases: ["post-hdr"], passes: () => [pass] });
    frame.runPhase("post-hdr", []);
    expect(pass.executed).toBe(1);
    frame.runPhase("post-hdr", [], false);
    expect(pass.executed).toBe(1);
  });
});

describe("01-S1 RendererFrameHooks: transparent interleave + reserved phases", () => {
  it("returns every contributor's queue items with the shared context", () => {
    const { frame } = hooks();
    const drawn: number[] = [];
    register({ id: "prd01.s1TA", phases: ["transparent"], transparentItems: () => [{ sortDepth: 5, draw: () => drawn.push(5) }, { sortDepth: 1, draw: () => drawn.push(1) }] });
    register({ id: "prd01.s1TB", phases: ["transparent"], transparentItems: () => [{ sortDepth: 3, draw: () => drawn.push(3) }] });
    const { ctx, queues } = frame.transparentQueues([]);
    expect(queues.map((q) => q.sortDepth).sort()).toEqual([1, 3, 5]);
    // The Renderer sorts back-to-front by sortDepth (larger = farther first).
    for (const q of [...queues].sort((a, b) => b.sortDepth - a.sortDepth)) q.draw(ctx);
    expect(drawn).toEqual([5, 3, 1]);
  });

  it("only prd01 may register the reserved opaque/output phases", () => {
    expect(() => registerFrameContributor({ id: "prd07.s1Opaque", owner: "prd07", flag: "A3D_QR_VFX", phases: ["opaque"] })).toThrow(/^FRAME_PHASE_RESERVED:opaque:prd07\.s1Opaque$/);
    expect(() => registerFrameContributor({ id: "prd03.s1Output", owner: "prd03", flag: "A3D_QR_POST", phases: ["output"] })).toThrow(/FRAME_PHASE_RESERVED:output/);
    register({ id: "prd01.s1Opaque", phases: ["opaque"] });
  });
});
