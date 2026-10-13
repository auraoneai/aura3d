/**
 * prd02-root-collected-lights.test.ts — 4.0 Live Fix E3 stage 1.
 *
 * `createProductionRuntimeCollectedLights(snapshot, flags)` is the root
 * renderer's light source. Physical PRD-02 descriptors (candela/lux,
 * decay, rect-area) reach it only when BOTH A3D_QR_COMPILER (dev) and
 * A3D_QR_LIGHTING are on; every other flag state keeps the legacy
 * descriptors byte-identical.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { AuraLightNode, AuraSceneSnapshot } from "@aura3d/engine";
import { createProductionRuntimeCollectedLights } from "../../../packages/engine/src/agent-api/compiler/observations";

const PHYSICAL = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true } });
const LIGHTING_ONLY = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const ALL_OFF = resolveQrFlags({ options: { A3D_QR_COMPILER: false, A3D_QR_LIGHTING: false } });

const snapshot = (nodes: readonly AuraLightNode[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
  nodes: nodes as never,
  diagnostics: { enabled: false }
});

const sun = { kind: "light", light: "directional", intensity: 2, color: "#ff0000", position: [3, 4, 3] } as unknown as AuraLightNode;
const lamp = { kind: "light", light: "point", intensity: 5, power: 40 * Math.PI, position: [0, 2, 0] } as unknown as AuraLightNode;
const softbox = { kind: "light", light: "rect", intensity: 5, width: 2, height: 3, position: [0, 2, 0] } as unknown as AuraLightNode;

describe("root collected lights — legacy path unchanged without both lanes", () => {
  it("no flags: legacy descriptors (raw intensity, scaled range, no decay)", () => {
    const lights = createProductionRuntimeCollectedLights(snapshot([lamp]));
    expect(lights).toHaveLength(1);
    expect(lights[0]).toMatchObject({ kind: "point", intensity: 5, range: 10 });
    expect(lights[0].decay).toBeUndefined();
  });

  it("LIGHTING alone (COMPILER dev-off) is still legacy", () => {
    const lights = createProductionRuntimeCollectedLights(snapshot([lamp]), LIGHTING_ONLY);
    expect(lights[0]).toMatchObject({ kind: "point", intensity: 5, range: 10 });
    expect(lights[0].decay).toBeUndefined();
  });

  it("empty scene with both lanes off keeps the fallback rig", () => {
    const lights = createProductionRuntimeCollectedLights(snapshot([]), ALL_OFF);
    expect(lights.length).toBeGreaterThan(0);
    expect(lights.every((light) => light.kind === "directional")).toBe(true);
  });
});

describe("root collected lights — physical path (COMPILER + LIGHTING)", () => {
  it("point power converts to candela, decay 2 recorded, unset distance is infinite range", () => {
    const lights = createProductionRuntimeCollectedLights(snapshot([lamp]), PHYSICAL);
    expect(lights).toHaveLength(1);
    expect(lights[0].kind).toBe("point");
    expect(lights[0].intensity).toBeCloseTo(10); // 40π lm / 4π = 10 cd
    expect(lights[0].decay).toBe(2);
    expect(lights[0].range).toBe(0); // shader: range <= 0 → no window
  });

  it("authored hex color converts to linear RGB (was shipped as a raw string)", () => {
    const lights = createProductionRuntimeCollectedLights(snapshot([sun]), PHYSICAL);
    expect(lights[0].color).toEqual([1, 0, 0]);
    expect(lights[0].intensity).toBe(2);
  });

  it("rect-area collects as rect-area with basis and size, not a spot proxy", () => {
    const lights = createProductionRuntimeCollectedLights(snapshot([softbox]), PHYSICAL);
    expect(lights).toHaveLength(1);
    expect(lights[0]).toMatchObject({ kind: "rect-area", width: 2, height: 3 });
    expect(lights[0].right).toBeDefined();
    expect(lights[0].up).toBeDefined();
  });

  it("empty scene under physical lighting has no fallback rig (IBL fills)", () => {
    expect(createProductionRuntimeCollectedLights(snapshot([]), PHYSICAL)).toEqual([]);
  });
});
