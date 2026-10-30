import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createProductionRuntimeEnvironment } from "../../../packages/engine/src/agent-api/compiler/environment";
import { ENVIRONMENT_INTENSITY, buildWorld } from "../../../examples/strange-orbit-port/world";
import { LOOKS } from "../../../examples/strange-orbit-port/art/look";

type Node = { kind: string; light?: string; environment?: string; intensity?: number; background?: unknown; name?: string; shadow?: unknown; color?: string; capture?: unknown };

/**
 * LIGHT-01 / SO-4 (lane G15): since 4.5.0 a lights-only scene gets no implicit environment, so the lit GLB riders and
 * props of Craterline GP lost their image-based fill. `?look=original` keeps the 4.6.1 rig: neutral environment next
 * to the hemisphere, key and fill, the intensity calibrated with the hemisphere on (docs/audits/lanes/g15.md).
 * GU47 WP-25 (SO47-L1/L2/E1): the gouache look rakes an 18-degree key with 3 PCSS cascades, adds the planetshine
 * directional and captures the painted sky into the probe.
 */
describe("strange-orbit-port lighting (look=original)", () => {
  const snapshot = buildWorld({ vehicle: "bike", rider: 0, quality: "low", look: "original" }).scene.toJSON();
  const nodes = snapshot.nodes as readonly Node[];

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

describe("strange-orbit-port lighting (gouache, GU47 WP-25)", () => {
  const high = buildWorld({ vehicle: "bike", rider: 0, quality: "high" }).scene.toJSON().nodes as readonly Node[];
  const low = buildWorld({ vehicle: "bike", rider: 0, quality: "low" }).scene.toJSON().nodes as readonly Node[];

  it("rakes one shadowed 18-degree key with 3 PCSS cascades (1 PCF cascade on Low)", () => {
    const key = high.find((n) => n.name === "key")!;
    expect(key.shadow).toMatchObject({ cascades: 3, filter: "pcss" });
    expect(low.find((n) => n.name === "key")!.shadow).toMatchObject({ cascades: 1, filter: "pcf" });
    const [x, y, z] = LOOKS.gouache.key.position;
    expect((Math.asin(y / Math.hypot(x, y, z)) * 180) / Math.PI).toBeCloseTo(18, 5);
    expect(high.filter((n) => n.kind === "light" && n.shadow && n.shadow !== false)).toHaveLength(1);
  });

  it("adds the unshadowed warm planetshine and drops the 4.6.1 cool fill", () => {
    const shine = high.find((n) => n.name === "planetshine")!;
    expect(shine).toMatchObject({ light: "directional", intensity: 0.8 });
    expect(shine.shadow ?? false).toBe(false);
    expect(high.find((n) => n.name === "fill")).toBeUndefined();
  });

  it("captures the painted sky once at 128 px without a background", () => {
    const env = high.find((n) => n.kind === "environment")!;
    expect(env).toMatchObject({ environment: "capture", background: false, capture: { resolution: 128, update: "once" } });
  });

  it("has no light literal left in the custom shaders (SO47-L1)", () => {
    const source = readFileSync(new URL("../../../examples/strange-orbit-port/shaders.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/150\.0,\s*280\.0/);
    expect(source).toMatch(/#include <a3d_lights>/);
  });
});
