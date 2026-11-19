// Sky capture honours `captureEnvironment: false` and never throws out of a
// frame (Pip World 6: an opted-out sky still ran a float-target capture that
// threw, and the renderer stayed dark for the session). Own file: the C-09
// slot can be provided once per module graph.

import { describe, expect, it, vi } from "vitest";
import { sky } from "../../../../packages/engine/src/agent-api/nodes/sky.js";
import { LiveAtmosphere } from "../../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import { ProductionEffectSystem } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import { captureSkyEnvironment, SKY_CAPTURE_PENDING, SkyCaptureAdapter } from "../../../../packages/rendering/src/atmosphere/SkyCaptureAdapter";
import { frameContributors } from "../../../../packages/rendering/src/contracts/frameGraph";
import { environmentProbeFactorySlot, type EnvironmentProbe } from "../../../../packages/rendering/src/contracts/environment";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { registerPrd07Contributors } from "../../../../packages/rendering/src/vfx/contributors";

const allOn: QrFlags = { values: {}, on: () => true };
let captures = 0;
let failCapture = false;
const factory = () => ({
  fromScene: () => {
    captures += 1;
    if (failCapture) throw new Error("float render target unsupported");
    return { kind: "environment-probe", faceSize: 128 } as unknown as EnvironmentProbe;
  },
  fromEquirect: () => { throw new Error("unused"); },
  fromCube: () => { throw new Error("unused"); },
  neutral: () => { throw new Error("unused"); }
});
// The engine imports may already have provided the real C-09 factory; route
// every capture through this counting factory either way.
if (!environmentProbeFactorySlot.provided) environmentProbeFactorySlot.provide(factory as never);
vi.spyOn(environmentProbeFactorySlot, "get").mockReturnValue(factory as never);

function liveAtmosphere(captureEnvironment?: boolean) {
  const listeners = new Set<() => void>();
  let state: { sky: unknown; captureEnvironment?: boolean } = {
    sky: { model: "gradient" },
    ...(captureEnvironment === undefined ? {} : { captureEnvironment })
  };
  return {
    state: () => state,
    onSkyChanged: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(next: typeof state) { state = next; for (const listener of listeners) listener(); }
  };
}

describe("sky capture opt-out", () => {
  it("captureEnvironment:false performs no capture and does not throw", () => {
    captures = 0;
    failCapture = true; // even a capture that would throw is never reached
    const device = new MockRenderDevice();
    const atmosphere = liveAtmosphere(false);
    expect(captureSkyEnvironment({ atmosphere, environment: null }, device, allOn).status).toBe(SKY_CAPTURE_PENDING);
    const adapter = new SkyCaptureAdapter({ atmosphere, environment: null }, device, allOn);
    atmosphere.set({ sky: { model: "preetham", sun: { elevationDeg: 40, azimuthDeg: 10 } }, captureEnvironment: false });
    expect(adapter.current()).toBeNull();
    expect(captures).toBe(0);
    // Opting back in captures; opting out again drops the probe.
    failCapture = false;
    atmosphere.set({ sky: { model: "preetham", sun: { elevationDeg: 40, azimuthDeg: 10 } } });
    expect(adapter.current()).not.toBeNull();
    atmosphere.set({ sky: { model: "preetham", sun: { elevationDeg: 40, azimuthDeg: 10 } }, captureEnvironment: false });
    expect(adapter.current()).toBeNull();
    adapter.dispose();
  });

  it("a failing capture is contained: no throw, no probe, error recorded", () => {
    failCapture = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const atmosphere = liveAtmosphere();
    let adapter: SkyCaptureAdapter | undefined;
    expect(() => { adapter = new SkyCaptureAdapter({ atmosphere, environment: null }, new MockRenderDevice(), allOn); }).not.toThrow();
    expect(() => atmosphere.set({ sky: { model: "gradient" } })).not.toThrow();
    expect(adapter!.current()).toBeNull();
    expect((adapter!.lastError as Error).message).toContain("float render target");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    adapter!.dispose();
    failCapture = false;
  });

  it("the prd07.environmentProbe contributor honours the opt-out and survives a failing capture", () => {
    registerPrd07Contributors();
    const contributor = frameContributors(allOn).find((entry) => entry.id === "prd07.environmentProbe")!;
    const collect = (source: object) => {
      const blackboard = new Map<string, unknown>();
      const ctx = { device: new MockRenderDevice(), source, flags: allOn, blackboard, width: 64, height: 64 };
      expect(() => contributor.collect!([], ctx as never)).not.toThrow();
      return blackboard.get("prd07.environmentProbe");
    };
    captures = 0;
    failCapture = true;
    expect(collect({ atmosphere: liveAtmosphere(false) })).toBeNull();
    expect(captures).toBe(0);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(collect({ atmosphere: liveAtmosphere() })).toBeNull();
    warn.mockRestore();
    failCapture = false;
  });

  it("a sky node's captureEnvironment:false reaches the live atmosphere state", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.setSky({ model: "gradient" } as never, { captureEnvironment: false });
    expect(atmosphere.state().captureEnvironment).toBe(false);
    atmosphere.setSky({ model: "gradient" } as never);
    expect(atmosphere.state().captureEnvironment).toBeUndefined();

    const node = sky.gradient({ zenith: "#112244", horizon: "#335577", captureEnvironment: false }).toJSON();
    const app = { scene: { nodes: [node] }, nodes: { get: () => undefined }, onFrame: () => () => {} };
    const system = new ProductionEffectSystem(app as never);
    expect(system.atmosphere.state().sky).not.toBeNull();
    expect(system.atmosphere.state().captureEnvironment).toBe(false);
  });
});
