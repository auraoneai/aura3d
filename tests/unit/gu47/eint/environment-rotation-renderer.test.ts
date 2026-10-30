import { afterEach, describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd02";
import { applyPrd02EnvironmentUniforms } from "../../../../packages/rendering/src/ForwardPass";
import { resolvePrd02EnvironmentBackground, resolvePrd02EnvironmentLighting } from "../../../../packages/rendering/src/renderer/Background";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { buildNeutralRoomLegacyProbe } from "../../../../packages/rendering/src/environment/probeBuild";

/**
 * GU47 eint EB-1 (E-B handoff): the frame's environment yaw (`environmentProbeRotation`, radians, set by the engine
 * from `setEnvironmentRotation` / `setEnvironment({ rotationDeg })` / the authored hdri rotation) rotates the PRD-02
 * probe lighting (`environmentMapRotation`, turns -> `u_envRotation` radians) and the probe background (turns), unless
 * an explicit background carries its own rotation. Sources without the field are unchanged.
 */

const LIGHTING = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({ options: ["none"] });
afterEach(() => setRendererQrFlags(BASE));

describe("GU47 eint EB-1: environment rotation reaches the renderer", () => {
  const probe = buildNeutralRoomLegacyProbe();

  it("the lighting object carries the yaw in turns, and the memo keys on it", () => {
    setRendererQrFlags(LIGHTING);
    const base = { environmentProbe: probe, environmentProbeAmbient: null };
    const plain = resolvePrd02EnvironmentLighting(base as never)!;
    expect(plain).not.toHaveProperty("environmentMapRotation");
    const quarter = resolvePrd02EnvironmentLighting({ ...base, environmentProbeRotation: Math.PI / 2 } as never)!;
    expect(quarter.environmentMapRotation).toBeCloseTo(0.25, 12);
    const half = resolvePrd02EnvironmentLighting({ ...base, environmentProbeRotation: Math.PI } as never)!;
    expect(half.environmentMapRotation).toBeCloseTo(0.5, 12);
    const again = resolvePrd02EnvironmentLighting(base as never)!;
    expect(again).not.toHaveProperty("environmentMapRotation");
  });

  it("the PRD-02 IBL pack binds u_envRotation in radians from the lighting object", () => {
    setRendererQrFlags(LIGHTING);
    const lighting = resolvePrd02EnvironmentLighting({ environmentProbe: probe, environmentProbeAmbient: null, environmentProbeRotation: 1.2 } as never)!;
    const uniforms = new Map<string, unknown>();
    applyPrd02EnvironmentUniforms(lighting as never, { label: "t" } as never, { getParameter: () => 1 } as never, uniforms as never);
    expect(uniforms.get("u_envRotation") as number).toBeCloseTo(1.2, 9);
  });

  it("the probe background turns with the yaw; an explicit background rotation wins", () => {
    setRendererQrFlags(LIGHTING);
    const base = { environmentProbe: probe };
    expect(resolvePrd02EnvironmentBackground(base as never)!.rotation).toBe(0);
    expect(resolvePrd02EnvironmentBackground({ ...base, environmentProbeRotation: Math.PI / 2 } as never)!.rotation).toBeCloseTo(0.25, 12);
    const explicit = { projection: "equirect", intensity: 0.8, rotation: 0.1 };
    expect(resolvePrd02EnvironmentBackground({ ...base, environmentBackground: explicit, environmentProbeRotation: Math.PI } as never)!.rotation).toBe(0.1);
    // An explicit background without its own rotation follows the yaw; without the yaw it keeps the unset rotation.
    const unrotated = { projection: "equirect", intensity: 0.8 };
    expect(resolvePrd02EnvironmentBackground({ ...base, environmentBackground: unrotated, environmentProbeRotation: Math.PI } as never)!.rotation).toBeCloseTo(0.5, 12);
    expect(resolvePrd02EnvironmentBackground({ ...base, environmentBackground: unrotated } as never)!.rotation).toBeUndefined();
  });
});
