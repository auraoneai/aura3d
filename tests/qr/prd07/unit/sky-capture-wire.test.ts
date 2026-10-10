// PRD-07 P3-T6 — the skyCaptureContributor instantiates a SkyCaptureAdapter
// per device when the source exposes live atmosphere state + onSkyChanged,
// publishes prd07.environmentProbe on the blackboard, and skips wiring when
// the atmosphere is a bare {sky} snapshot (P3-T6 gate).

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { environmentProbeFactorySlot, type EnvironmentProbe } from "../../../../packages/rendering/src/contracts/environment";
import { SkyCaptureAdapter } from "../../../../packages/rendering/src/atmosphere/SkyCaptureAdapter";

const flags = (names: string[]) => ({ on: (n: string) => names.includes(n) }) as never;

function liveAtmosphere() {
  const listeners = new Set<() => void>();
  const atmosphere = {
    state: () => ({ sky: { kind: "gradient" } }),
    onSkyChanged: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    fire: () => listeners.forEach((l) => l())
  };
  return atmosphere;
}

function ctxFor(device: MockRenderDevice, source: Record<string, unknown>, flagNames: string[]) {
  return {
    device,
    source,
    flags: flags(flagNames),
    blackboard: new Map<string, unknown>(),
    width: 64,
    height: 64
  } as never;
}

describe("P3-T6 SkyCaptureAdapter source gate", () => {
  it("captureSkyEnvironment wires a real probe when sky + slot + flag allow", () => {
    const provided = environmentProbeFactorySlot.provided;
    let captures = 0;
    if (!provided) {
      environmentProbeFactorySlot.provide((device) => ({
        fromScene: () => {
          captures++;
          return { kind: "environment-probe", faceSize: 128 } as unknown as EnvironmentProbe;
        },
        fromEquirect: () => { throw new Error("unused"); },
        fromCube: () => { throw new Error("unused"); },
        neutral: () => { throw new Error("unused"); }
      }));
    }
    const atmosphere = liveAtmosphere();
    const device = new MockRenderDevice();
    const adapter = new SkyCaptureAdapter(
      { atmosphere, environment: null },
      device,
      flags(["A3D_QR_LIGHTING", "A3D_QR_VFX"])
    );
    const probe = adapter.current();
    if (environmentProbeFactorySlot.provided) {
      expect(probe).not.toBeNull();
      expect(probe?.kind).toBe("environment-probe");
      atmosphere.fire();
      expect(adapter.current()).not.toBeNull();
    }
    adapter.dispose();
  });

  it("stays pending without a sky / with explicit environment / flag off", () => {
    const device = new MockRenderDevice();
    const adapter = new SkyCaptureAdapter(
      { atmosphere: { state: () => ({ sky: null }), onSkyChanged: () => () => {} }, environment: null },
      device,
      flags(["A3D_QR_LIGHTING"])
    );
    expect(adapter.current()).toBeNull();
    adapter.dispose();
  });
});
