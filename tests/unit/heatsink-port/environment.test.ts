import { describe, expect, it } from "vitest";
import { Track } from "../../../examples/heatsink-port/track";
import { NEUTRAL_FILL, buildWorld } from "../../../examples/heatsink-port/world";

interface JsonNode { readonly kind?: string; readonly environment?: string; readonly name?: string; readonly intensity?: number; readonly background?: unknown; readonly light?: string }

function nodes(): JsonNode[] {
  const json = buildWorld(new Track()).scene.toJSON() as unknown as { nodes?: JsonNode[] };
  return json.nodes ?? [];
}

describe("heatsink-port environment (LIGHT-01)", () => {
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
