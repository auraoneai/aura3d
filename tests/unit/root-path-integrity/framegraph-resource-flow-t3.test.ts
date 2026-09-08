import { describe, expect, test } from "vitest";
import {
  assertFrameGraphResourceFlow,
  findFrameGraphResourceBreaks,
  type FlowPassRecord,
} from "../../../tools/root-path-integrity/framegraph-resource-policy";
import { DepthPrepass } from "../../../packages/rendering/src/production-runtime/passes/DepthPrepass.js";
import { OpaquePass } from "../../../packages/rendering/src/production-runtime/passes/OpaquePass.js";
import { ShadowPass } from "../../../packages/rendering/src/production-runtime/passes/ShadowPass.js";
import { SkyboxPass } from "../../../packages/rendering/src/production-runtime/passes/SkyboxPass.js";
import { ToneMappingPass } from "../../../packages/rendering/src/production-runtime/passes/ToneMappingPass.js";
import { TransparentPass } from "../../../packages/rendering/src/production-runtime/passes/TransparentPass.js";
import { PRODUCTION_PASS_ORDER } from "../../../packages/rendering/src/production-runtime/passes/FramegraphTopology.js";

const CANONICAL_ORDER = [...PRODUCTION_PASS_ORDER];

function record(id: string, reads: readonly string[], writes: readonly string[]): FlowPassRecord {
  return { id, reads, writes };
}

function canonicalRecords(): FlowPassRecord[] {
  return [
    new DepthPrepass(),
    new ShadowPass(),
    new SkyboxPass(),
    new OpaquePass(),
    new TransparentPass(),
    new ToneMappingPass(),
  ].map((pass) => ({ id: pass.id, reads: [...pass.reads], writes: [...pass.writes] }));
}

describe("T3b assertFrameGraphResourceFlow", () => {
  test("canonical production topology is clean", () => {
    expect(findFrameGraphResourceBreaks(canonicalRecords(), { order: CANONICAL_ORDER })).toEqual(
      []
    );
    expect(() =>
      assertFrameGraphResourceFlow(canonicalRecords(), { order: CANONICAL_ORDER })
    ).not.toThrow();
  });

  test("reads of unwritten resources fail", () => {
    const breaks = findFrameGraphResourceBreaks(
      [record("DepthPrepass", ["scene.geometry"], ["linear-depth"]), record("OpaquePass", ["linear-depth", "phantom.mask"], ["hdr.color"])],
      { order: ["DepthPrepass", "OpaquePass"], terminals: ["hdr.color"] }
    );
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatch(/OpaquePass reads unwritten resource: phantom\.mask/);
  });

  test("missing, misordered, undocumented, and duplicated passes fail", () => {
    expect(
      findFrameGraphResourceBreaks(canonicalRecords().slice(1), { order: CANONICAL_ORDER })
    ).toContain("Missing production pass: DepthPrepass.");
    expect(
      findFrameGraphResourceBreaks([...canonicalRecords()].reverse(), { order: CANONICAL_ORDER }).some(
        (item) => item.includes("Misordered")
      )
    ).toBe(true);
    expect(
      findFrameGraphResourceBreaks(
        [...canonicalRecords(), record("MysteryPass", [], ["ldr.output"])],
        { order: CANONICAL_ORDER }
      ).some((item) => item.includes("Undocumented production pass: MysteryPass"))
    ).toBe(true);
    expect(
      findFrameGraphResourceBreaks(
        [...canonicalRecords(), record("ShadowPass", ["scene.casters"], ["shadow.mask"])],
        { order: CANONICAL_ORDER }
      ).some((item) => item.includes("Duplicated production pass: ShadowPass"))
    ).toBe(true);
  });

  test("unconsumed non-terminal writes fail; the ldr.output terminal is allowed", () => {
    const withDeadWrite = [...canonicalRecords()];
    withDeadWrite[1] = record("ShadowPass", ["scene.casters", "shadow.maps"], ["shadow.mask", "dead.debug"]);
    const breaks = findFrameGraphResourceBreaks(withDeadWrite, { order: CANONICAL_ORDER });
    expect(breaks.some((item) => item.includes("dead.debug") && item.includes("no downstream"))).toBe(
      true
    );
    expect(
      findFrameGraphResourceBreaks(canonicalRecords(), { order: CANONICAL_ORDER }).some((item) =>
        item.includes("ldr.output")
      )
    ).toBe(false);
  });

  test("external scene/environment/shadow inputs need no in-graph writer", () => {
    const breaks = findFrameGraphResourceBreaks(
      [record("Only", ["scene.geometry", "environment.sky", "shadow.maps"], ["ldr.output"])],
      { terminals: ["ldr.output"] }
    );
    expect(breaks).toEqual([]);
  });

  test("live pass instances expose the enforced contract (emptiness fails this file)", () => {
    const live = [
      new DepthPrepass(),
      new ShadowPass(),
      new SkyboxPass(),
      new OpaquePass(),
      new TransparentPass(),
      new ToneMappingPass(),
    ];
    expect(live.map((pass) => pass.id)).toEqual([...PRODUCTION_PASS_ORDER]);
    for (const pass of live) {
      expect(pass.reads.length).toBeGreaterThan(0);
      expect(pass.writes.length).toBeGreaterThan(0);
      expect(typeof pass.validateResources).toBe("function");
      expect(typeof pass.execute).toBe("function");
    }
    expect(() =>
      assertFrameGraphResourceFlow(
        live.map((pass) => ({ id: pass.id, reads: [...pass.reads], writes: [...pass.writes] })),
        { order: CANONICAL_ORDER }
      )
    ).not.toThrow();
  });
});


import { FrameGraph } from "../../../packages/rendering/src/production-runtime/framegraph/FrameGraph";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { FrameGraphResource } from "../../../packages/rendering/src/production-runtime/framegraph/RenderPass";

describe("R06 executed resource lifetime", () => {
  test("failed native execution invalidates outputs and retains borrowed inputs", () => {
    const device = new MockRenderDevice();
    const input = { value: {}, frameIndex: 3 };
    const resources = new Map<string, FrameGraphResource>([['environment.sky', input], ['hdr.color', { value: 'stale', frameIndex: 2 }]]);
    const graph = new FrameGraph().addPass(new SkyboxPass());
    expect(() => graph.execute({ frameIndex: 3, width: 4, height: 4, device, resources,
      commands: new Map([['SkyboxPass', bindings => {
        bindings.read('environment.sky'); bindings.write('hdr.color', { value: {}, frameIndex: 3 });
        return { name: 'failing-native', reads: [], writes: [], execute() { throw new Error('device failure'); } };
      }]]) })).toThrow('device failure');
    expect(resources.has('hdr.color')).toBe(false);
    expect(resources.get('environment.sky')).toBe(input);
    expect(device.disposed).toBe(false);
    device.dispose();
  });

  test("resized and disposed handles are rejected before native work", () => {
    const device = new MockRenderDevice();
    const pass = new SkyboxPass();
    const resources = new Map<string, FrameGraphResource>([['environment.sky', { value: {}, frameIndex: 0, width: 8, height: 8 }]]);
    const context = { frameIndex: 0, width: 4, height: 4, device, resources,
      commands: new Map([['SkyboxPass', () => { throw new Error('must not dispatch'); }]]) };
    expect(() => pass.execute(context)).toThrow('size mismatch');
    resources.set('environment.sky', { value: { disposed: true }, frameIndex: 0 });
    expect(() => pass.execute(context)).toThrow('disposed resource');
    resources.set('environment.sky', { value: {}, frameIndex: 1 });
    expect(() => pass.execute(context)).toThrow('stale resource');
    device.dispose();
  });
});


test('T3 static policy cannot disguise a missing shadow producer as external', () => {
  expect(findFrameGraphResourceBreaks([{ id: 'opaque', reads: ['shadow.mask'], writes: ['ldr.output'] }])).toContain('opaque reads unwritten resource: shadow.mask.');
  expect(findFrameGraphResourceBreaks([{ id: 'orphan', reads: ['scene.geometry'], writes: ['scene.geometry'] }])).toContain('orphan writes scene.geometry that no downstream pass reads.');
});
