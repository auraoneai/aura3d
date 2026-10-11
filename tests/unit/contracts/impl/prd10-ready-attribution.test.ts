/**
 * PRD-10 Track 0 (a) — the ready-probe attribution must charge CPU self time
 * to the right lane, including native GL stalls under a lane-10 caller.
 */
import { describe, expect, it } from "vitest";
import { attributeProfile, bucketFor, frameStats, isLane10Url } from "../../../../benchmarks/quality-rebuild/scenes/prd10/ready/attribution.mjs";

const node = (id: number, functionName: string, url: string, children: number[] = []) => ({
  id,
  callFrame: { functionName, url, lineNumber: 0, columnNumber: 0, scriptId: String(id) },
  children
});

const BASE = "http://127.0.0.1:5199";

describe("prd10 ready-probe attribution", () => {
  it("classifies lane-10 paths by CONTRACTS §4.1 row 10 and nothing else", () => {
    expect(isLane10Url(`${BASE}/packages/engine/src/production-runtime/world/TerrainRuntime.ts`)).toBe(true);
    expect(isLane10Url(`${BASE}/packages/rendering/src/world/terrain/shaders/terrainCdlod.ts?t=1`)).toBe(true);
    expect(isLane10Url(`${BASE}/packages/engine/src/lanes/prd10.ts`)).toBe(true);
    expect(isLane10Url(`${BASE}/packages/engine/src/agent-api/nodes/water.ts`)).toBe(true);
    expect(isLane10Url(`${BASE}/packages/engine/src/lanes/prd11.ts`)).toBe(false);
    expect(isLane10Url(`${BASE}/packages/rendering/src/post/v2Stages.ts`)).toBe(false);
    expect(isLane10Url(`${BASE}/packages/engine/src/agent-api/nodes/environments.ts`)).toBe(false);
  });

  it("buckets other sources by package/first dir, three, bench and synthetic nodes", () => {
    expect(bucketFor(node(1, "f", `${BASE}/packages/rendering/src/post/v2Stages.ts`))).toBe("rendering/post");
    expect(bucketFor(node(1, "f", `${BASE}/packages/rendering/src/RenderDevice.ts`))).toBe("rendering/(root)");
    expect(bucketFor(node(1, "f", `${BASE}/node_modules/.vite/deps/three.js`))).toBe("three");
    expect(bucketFor(node(1, "f", `${BASE}/aura3d/common.ts`))).toBe("bench");
    expect(bucketFor(node(1, "(idle)", ""))).toBe("(idle)");
    expect(bucketFor(node(1, "(garbage collector)", ""))).toBe("(garbage collector)");
    expect(bucketFor(node(1, "getProgramParameter", ""))).toBe("(native)");
  });

  it("charges sample deltas as self time and native GL time to the nearest JS caller", () => {
    const profile = {
      nodes: [
        node(1, "(root)", "", [2, 5, 6]),
        node(2, "terrainProgram", `${BASE}/packages/engine/src/production-runtime/world/TerrainRuntime.ts`, [3]),
        node(3, "getProgramParameter", "", []),
        node(4, "unused", `${BASE}/x.ts`),
        node(5, "draw", `${BASE}/packages/rendering/src/forward/ForwardPass.ts`),
        node(6, "(idle)", "")
      ],
      samples: [2, 3, 3, 5, 6, 6],
      timeDeltas: [1000, 4000, 4000, 2000, 10000, 10000]
    };
    const r = attributeProfile(profile);
    expect(r.totalMs).toBe(31);
    expect(r.busyMs).toBe(11);
    expect(r.buckets).toMatchObject({ lane10: 1, "native<-lane10": 8, "rendering/forward": 2, "(idle)": 20 });
    expect(r.lane10Ms).toBe(9);
    expect(r.lane10ShareOfBusy).toBeCloseTo(9 / 11, 3);
    expect(r.topFunctions[0]).toEqual({ fn: "getProgramParameter :1", ms: 8 });
    expect(r.topLane10Functions.map((f) => f.fn)).toEqual(["terrainProgram /packages/engine/src/production-runtime/world/TerrainRuntime.ts:1"]);
  });

  it("frame stats report count, interval and callback cost", () => {
    expect(frameStats([])).toEqual({ count: 0, meanIntervalMs: null, meanCallbackMs: null, maxCallbackMs: null });
    expect(frameStats([{ t: 0, cbMs: 10 }, { t: 1000, cbMs: 30 }, { t: 2000, cbMs: 20 }])).toEqual({
      count: 3, meanIntervalMs: 1000, meanCallbackMs: 20, maxCallbackMs: 30
    });
  });
});
