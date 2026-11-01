import { describe, expect, it } from "vitest";
import { Track } from "../../../examples/heatsink-port/track";
import { NEUTRAL_FILL, TWILIGHT_HDRI, buildWorld } from "../../../examples/heatsink-port/world";
import { LOOKS, SUN_AZIMUTH_DEG } from "../../../examples/heatsink-port/art/look";

interface JsonNode { readonly kind?: string; readonly environment?: string; readonly name?: string; readonly intensity?: number; readonly background?: unknown; readonly light?: string }

function nodes(look = "?look=original"): JsonNode[] {
  const json = buildWorld(new Track(), "high", look).scene.toJSON() as unknown as { nodes?: JsonNode[] };
  return json.nodes ?? [];
}

describe("heatsink-port environment (LIGHT-01; ?look=original)", () => {
  it("authors one neutral-room environment for the lit models, with the calibrated intensity and no background", () => {
    const envs = nodes().filter((n) => n.kind === "environment");
    expect(envs).toHaveLength(1);
    expect(envs[0]).toMatchObject({ environment: "neutral", name: "model-fill", intensity: NEUTRAL_FILL, background: false });
    expect(NEUTRAL_FILL).toBeGreaterThan(0);
  });

  it("keeps the authored hemisphere and key lights next to it", () => {
    const names = nodes().map((n) => n.name);
    expect(names).toContain("sky-fill");
    expect(names).toContain("key");
  });
});

describe("heatsink-port twilight environment (GU47 IC-04)", () => {
  it("replaces the neutral room with a dusk HDRI, IBL only, rotated to the shader sun", () => {
    const envs = nodes("?look=twilight").filter((n) => n.kind === "environment") as (JsonNode & { texture?: { url?: string }; rotation?: number })[];
    expect(envs).toHaveLength(1);
    expect(envs[0]).toMatchObject({ environment: "hdri", name: "model-fill", background: false, intensity: LOOKS.twilight.environment.intensity });
    expect(envs[0]!.texture?.url).toBe(TWILIGHT_HDRI.url);
    expect(envs[0]!.rotation).toBeCloseTo((SUN_AZIMUTH_DEG * Math.PI) / 180, 6);
  });

  it("puts the engine key at the shader sun's azimuth, ~35 degrees up, with 3 cascades over 220 m (IC-03, GU47 phase 4)", () => {
    const key = nodes("?look=twilight").find((n) => n.name === "key") as JsonNode & { position?: number[]; shadow?: { cascades?: number; maxDistance?: number }; color?: string };
    expect(key.position).toEqual([218, 229, -245]);
    const [x, y, z] = key.position as [number, number, number];
    expect(Math.abs(Math.atan2(z, x) - Math.atan2(-0.62, 0.55))).toBeLessThan(0.01);
    expect((Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI).toBeCloseTo(35, 0);
    expect(key.intensity).toBe(2.9);
    expect(key.shadow).toMatchObject({ cascades: 3, maxDistance: 220 });
    const drone = nodes("?look=twilight").find((n) => n.name === "drone-hull") as JsonNode & { castShadow?: boolean };
    expect(drone.castShadow).toBe(true);
    const original = nodes().find((n) => n.name === "drone-hull") as JsonNode & { castShadow?: boolean };
    expect(original.castShadow).toBe(false);
  });

  it("GU47 phase 4: the sky dome, abyss and additive strips never cast under twilight (the dome shadowed the whole course); original keeps its casters", () => {
    const casters = (look: string) => new Set((nodes(look) as (JsonNode & { castShadow?: boolean })[]).filter((n) => n.castShadow).map((n) => n.name));
    const tw = casters("?look=twilight");
    for (const name of ["sky", "abyss", "bolts", "streaks", "exhaust", "spores"]) expect(tw.has(name), name).toBe(false);
    for (const name of ["rocks", "arches", "drone-hull"]) expect(tw.has(name), name).toBe(true);
    expect(casters("?look=original").has("sky")).toBe(true);
  });
});
