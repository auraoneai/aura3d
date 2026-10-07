/**
 * Lane-08 C-23/C-38 impl conformance (CONTRACTS.md §1.1): the registered
 * `time` extension resolves to the real TimeController under A3D_QR_CAMERA
 * and to the PR 0a stub when the flag is off.
 */
import { describe, expect, it } from "vitest";
import { appExtensionsAll, resolveQrFlags, StubTimeController } from "@aura3d/engine/contracts";
import "@aura3d/engine/lanes";
import { TimeController } from "@aura3d/engine/lanes";

describe("prd08 app extensions", () => {
  const flagsOn = resolveQrFlags({ options: ["camera"] });
  const flagsOff = resolveQrFlags({});

  it("time extension is registered with member 'time' and flag A3D_QR_CAMERA", () => {
    const ext = appExtensionsAll().find((e) => e.id === "prd08.time");
    expect(ext).toBeDefined();
    expect(ext?.member).toBe("time");
    expect(ext?.flag).toBe("A3D_QR_CAMERA");
  });

  it("creates the real TimeController when the flag is on", () => {
    const ext = appExtensionsAll().find((e) => e.id === "prd08.time");
    const app = { nodes: { get: () => undefined } };
    const value = ext?.create(app as never, { flags: flagsOn, options: {} as never });
    expect(value).toBeInstanceOf(TimeController);
  });

  it("creates the stub when the flag is off", () => {
    const ext = appExtensionsAll().find((e) => e.id === "prd08.time");
    const app = { nodes: { get: () => undefined } };
    const value = ext?.create(app as never, { flags: flagsOff, options: {} as never });
    expect(value).toBeInstanceOf(StubTimeController);
    expect(value).not.toBeInstanceOf(TimeController);
  });

  it("feel extension keeps app.feel defined (stub until the real bus lands)", () => {
    const ext = appExtensionsAll().find((e) => e.id === "prd08.feel");
    expect(ext).toBeDefined();
    const value = ext?.create({} as never, { flags: flagsOff, options: {} as never });
    expect(value).toBeDefined();
  });
});
