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
    const envs = nodes("").filter((n) => n.kind === "environment") as (JsonNode & { texture?: { url?: string }; rotation?: number })[];
    expect(envs).toHaveLength(1);
    expect(envs[0]).toMatchObject({ environment: "hdri", name: "model-fill", background: false, intensity: LOOKS.twilight.environment.intensity });
    expect(envs[0]!.texture?.url).toBe(TWILIGHT_HDRI.url);
    expect(envs[0]!.rotation).toBeCloseTo((SUN_AZIMUTH_DEG * Math.PI) / 180, 6);
  });

  it("puts the engine key along the shader sun with 3 cascades over 220 m (IC-03)", () => {
    const key = nodes("").find((n) => n.name === "key") as JsonNode & { position?: number[]; shadow?: { cascades?: number; maxDistance?: number }; color?: string };
    expect(key.position).toEqual([220, 92, -248]);
    expect(key.intensity).toBe(2.9);
    expect(key.shadow).toMatchObject({ cascades: 3, maxDistance: 220 });
    const drone = nodes("").find((n) => n.name === "drone-hull") as JsonNode & { castShadow?: boolean };
    expect(drone.castShadow).toBe(true);
    const original = nodes().find((n) => n.name === "drone-hull") as JsonNode & { castShadow?: boolean };
    expect(original.castShadow).toBe(false);
  });
});
