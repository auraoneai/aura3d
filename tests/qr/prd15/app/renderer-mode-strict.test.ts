/* T4.5 (PRD-15 Phase 4) — under A3D_QR_STRICT (or options.strict) a caller
 * passing the removed `renderer.mode`/`renderer.fallback` surface gets
 * `AuraMigrationError({ removedApi, replacement: "renderer.quality", prd: 15 })`
 * synchronously from createAuraApp; flag-off callers keep today's behaviour.
 */
import "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { createAuraApp } from "../../../../packages/engine/src/agent-api/app/createAuraApp";
import { AuraMigrationError } from "../../../../packages/engine/src/agent-api/compiler/errors";
import type { AuraCreateAppOptions } from "../../../../packages/engine/src/agent-api/nodes/types";

const options = (renderer: Record<string, unknown>, strict = true): AuraCreateAppOptions =>
  ({ scene: { nodes: [], camera: { mode: "orbit" } }, strict, renderer } as unknown as AuraCreateAppOptions);

describe("T4.5 renderer.mode/renderer.fallback removal", () => {
  it("strict: renderer.mode throws AuraMigrationError with the replacement surface", () => {
    let thrown: unknown;
    try {
      createAuraApp(undefined as never, options({ mode: "safe-basic" }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AuraMigrationError);
    const err = thrown as AuraMigrationError;
    expect(err.removedApi).toBe("renderer.mode");
    expect(err.replacement).toBe("renderer.quality");
    expect(err.prd).toBe(15);
  });

  it("strict: renderer.fallback is reported alongside mode", () => {
    let thrown: unknown;
    try {
      createAuraApp(undefined as never, options({ mode: "production", fallback: "safe-basic" }));
    } catch (error) {
      thrown = error;
    }
    expect((thrown as AuraMigrationError).removedApi).toBe("renderer.mode + renderer.fallback");
  });

  it("strict: options without the removed fields do not throw", () => {
    // Scene with no canvas target resolves no mount path; the migration guard
    // is the only strict check exercised here.
    expect(() => createAuraApp(undefined as never, options({ qualityProfile: "safe-basic" }))).not.toThrow();
  });

  it("flag off: renderer.mode is accepted (deprecated, still works until 4.0.0)", () => {
    expect(() => createAuraApp(undefined as never, options({ mode: "safe-basic" }, false))).not.toThrow();
  });
});
