import { describe, expect, it } from "vitest";
import { inspectParticleCompletions, particleDiagnosticJSON } from "../../browser/particle-completion-diagnostics";

describe("particle completion diagnostic retention",()=>{
  it("counts distinct coalesced callbacks without changing timestamps",()=>{
    const frames=[0,1000,1000,2000].map((completedAt,frameId)=>({completedAt,frameId}));
    const result=inspectParticleCompletions(frames);
    expect(result.pacingError).toBeNull();
    expect(result.rollingFps).toEqual([{at:1000,fps:1},{at:1000,fps:2},{at:2000,fps:1}]);
    expect(frames.map(f=>f.completedAt)).toEqual([0,1000,1000,2000]);
  });
  it("rejects duplicate IDs and zero-duration windows",()=>{
    expect(inspectParticleCompletions([{frameId:1,completedAt:0},{frameId:1,completedAt:1}]).pacingError).toContain("unique and contiguous");
    expect(inspectParticleCompletions([{frameId:1,completedAt:0},{frameId:2,completedAt:0}]).pacingError).toContain("positive duration");
  });
  it("preserves equal and backward batches with their original IDs and adjacent receipts",()=>{
    const frames=[10,20,20,19,30].map((completedAt,index)=>({frameId:index+80,completedAt,cpuPhases:{mapWaitMs:index}}));
    const result=inspectParticleCompletions(frames);
    expect(result.timestampFailures.map(f=>[f.frameId,f.reason])).toEqual([[83,"backward"]]);
    expect(result.coalescedCompletions.map(f=>[f.frameId,f.reason])).toEqual([[82,"equal"]]);
    expect(result.coalescedCompletions[0]!.neighbors).toEqual(frames);
    expect(result.longestBelow55Ms).toBeNull();
    expect(result.rollingFps).toBeNull();
    expect(result.pacingError).toContain("nondecreasing");
    expect(frames.map(f=>f.completedAt)).toEqual([10,20,20,19,30]);
  });
  it("retains non-finite values explicitly rather than serializing them as null",()=>{
    const frames=[NaN,Infinity,-Infinity].map((completedAt,frameId)=>({completedAt,frameId}));
    expect(inspectParticleCompletions(frames).timestampFailures.every(f=>f.reason==="non-finite")).toBe(true);
    expect(JSON.parse(particleDiagnosticJSON(frames)).map((f:{completedAt:unknown})=>f.completedAt))
      .toEqual([{nonFiniteNumber:"NaN"},{nonFiniteNumber:"Infinity"},{nonFiniteNumber:"-Infinity"}]);
  });
  it("keeps valid measured slow windows unchanged",()=>{
    const frames=Array.from({length:160},(_,frameId)=>({frameId,completedAt:frameId*25}));
    const result=inspectParticleCompletions(frames);
    expect(result.pacingError).toBeNull();expect(result.timestampFailures).toEqual([]);
    expect(result.longestBelow55Ms).toBe(2975);
    expect(result.rollingFps?.every(sample=>sample.fps===40)).toBe(true);
  });
});
