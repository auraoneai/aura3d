import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateStep } from "../../../../tools/real-gpu/evaluate-step.mjs";

/**
 * GU47 eint EI-2 (E-I handoff): `tools/real-gpu/capture.mjs` executes the scenario step `{ "evaluate": "<expr>" }`
 * (E-F's `__AURA_VFX_DEBUG__()` reads) and records `{ expression, shot, value | error }` in report.json. The harness
 * itself launches a browser at import, so the step lives in `evaluate-step.mjs`; agents never run the harness.
 */
const root = resolve(__dirname, "../../../..");

describe("GU47 eint EI-2: real-GPU evaluate step", () => {
  it("records the value (awaited, undefined as null) or the error text", async () => {
    const page = (result: () => unknown) => ({ evaluate: async (expression: string) => { expect(expression).toBe("__AURA_VFX_DEBUG__()"); return result(); } });
    expect(await evaluateStep(page(() => ({ emitters: 3, particles: 120 })), "__AURA_VFX_DEBUG__()", "settled"))
      .toEqual({ expression: "__AURA_VFX_DEBUG__()", shot: "settled", value: { emitters: 3, particles: 120 } });
    expect(await evaluateStep(page(() => undefined), "__AURA_VFX_DEBUG__()")).toEqual({ expression: "__AURA_VFX_DEBUG__()", value: null });
    expect(await evaluateStep(page(() => { throw new Error("__AURA_VFX_DEBUG__ is not defined"); }), "__AURA_VFX_DEBUG__()", "settled"))
      .toEqual({ expression: "__AURA_VFX_DEBUG__()", shot: "settled", error: "__AURA_VFX_DEBUG__ is not defined" });
  });

  it("the harness runs the step after the step's shot and reports the evaluations", () => {
    const source = readFileSync(resolve(root, "tools/real-gpu/capture.mjs"), "utf8");
    expect(source).toContain('import { evaluateStep } from "./evaluate-step.mjs";');
    expect(source).toContain("evaluations: []");
    const shotAt = source.indexOf("if (step.shot) await shot(step.shot);");
    const evaluateAt = source.indexOf("if (step.evaluate) log.evaluations.push(await evaluateStep(page, step.evaluate, step.shot));");
    expect(shotAt).toBeGreaterThan(0);
    expect(evaluateAt).toBeGreaterThan(shotAt);
  });
});
