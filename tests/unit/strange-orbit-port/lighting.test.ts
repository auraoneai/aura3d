import { describe, expect, it } from "vitest";
import { createProductionRuntimeEnvironment } from "../../../packages/engine/src/agent-api/compiler/environment";
import { ENVIRONMENT_INTENSITY, buildWorld } from "../../../examples/strange-orbit-port/world";

/**
 * LIGHT-01 / SO-4 (lane G15): since 4.5.0 a lights-only scene gets no implicit environment, so the lit GLB riders and
 * props of Craterline GP lost their image-based fill. The world now authors `environments.neutral` next to its
 * hemisphere, key and fill. The hemisphere stays: next to an environment it keeps contributing (LIGHT-05), so the
 * intensity was calibrated with it on (docs/audits/lanes/g15.md).
 */
describe("strange-orbit-port lighting", () => {
  const snapshot = buildWorld({ vehicle: "bike", rider: 0, quality: "low" }).scene.toJSON();
  const nodes = snapshot.nodes as readonly { kind: string; light?: string; environment?: string; intensity?: number; background?: unknown; name?: string }[];

  it("authors a neutral environment without a background, next to the hemisphere, key and fill", () => {
    const envs = nodes.filter((n) => n.kind === "environment");
    expect(envs).toHaveLength(1);
    expect(envs[0]).toMatchObject({ environment: "neutral", intensity: ENVIRONMENT_INTENSITY, background: false });
    expect(nodes.filter((n) => n.kind === "light").map((n) => n.light).sort()).toEqual(["directional", "directional", "hemisphere"]);
  });

  it("restores image-based fill instead of the lights-only path", () => {
    const env = createProductionRuntimeEnvironment(snapshot, { on: (flag) => flag === "A3D_QR_COMPILER" || flag === "A3D_QR_LIGHTING" }, { implicitFill: false });
    expect(env.preset).toBe("neutral");
    expect(env.lighting.environmentMapIntensity).toBe(ENVIRONMENT_INTENSITY);
    expect(env.lighting.environmentMapSpecularIntensity).toBe(ENVIRONMENT_INTENSITY);
  });

  it("keeps the intensity in a calibrated range", () => {
    expect(ENVIRONMENT_INTENSITY).toBeGreaterThan(0);
    expect(ENVIRONMENT_INTENSITY).toBeLessThanOrEqual(1.5);
  });
});
