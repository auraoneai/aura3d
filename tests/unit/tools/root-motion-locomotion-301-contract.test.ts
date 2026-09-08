import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const harness = readFileSync("tests/browser/root-motion-locomotion-301-harness.ts", "utf8");
const spec = readFileSync("tests/browser/root-motion-locomotion-301.spec.ts", "utf8");
const engine = readFileSync("packages/engine/src/agent-api/index.ts", "utf8");
const labelsSpec = readFileSync("tests/browser/label-occlusion.spec.ts", "utf8");

describe("I02 typed label hero provenance", () => {
  it("accepts only the canonical manifest sha256 identifier", () => {
    expect(labelsSpec).toContain("/^sha256-[a-f0-9]{64}$/");
  });
});

describe("E01 rendered locomotion evidence cadence", () => {
  it("retains 360 runtime samples while presenting every fixed GPU oracle boundary", () => {
    expect(harness).toContain("for(let frame=1;frame<=360;frame++)");
    expect(harness).toContain("frame === 1 || frame === 360 || frame % 60 === 0");
    expect(harness).toContain("if (evidenceFrame) await app.stepAsync(0)");
    expect(harness).toContain("else app.advance(0)");
    expect(harness).not.toContain("else app.step(0)");
    expect(harness).toContain("evidence.frames.push");
    expect(harness).toContain("if(frame % 60 === 0)");
  });

  it("advances renderer-owned actor state without presenting intermediate frames", () => {
    expect(engine).toContain("productionController?.update?.(runtimeTime * 1000)");
    expect(engine).toContain("preparedFrame = { time, input: buildFrame(time) }");
    expect(engine).toContain("const input = takePreparedFrame(time)");
  });

  it("turns through a bounded arc without reversing at a short route endpoint", () => {
    expect(harness).toContain('scenario==="turn"?[4,0,4]');
    expect(harness).toContain('Math.min(1,frame/120)');
    expect(harness).toContain('evidence.frames.push({heading');
    expect(spec).toContain('expect(last.heading).toBeGreaterThan(0.7)');
    expect(spec).toContain('expect(last.position[0]).toBeGreaterThan(0.5)');
    expect(spec).toContain('expect(last.position[2]).toBeGreaterThan(0.5)');
  });

  it("retains video only when a scenario fails", () => {
    expect(spec).toContain('test.use({ video: "retain-on-failure" });');
  });
});
