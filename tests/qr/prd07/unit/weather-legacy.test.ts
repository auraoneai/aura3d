// PRD-07 P5-T4 — carved weather.ts: legacy primitives are tagged
// `prd07.legacyWeather.<n>`; flag-off they're inert metadata (pixel identity);
// flag-on the effect system hides every tagged node via its runtime handle.

import { describe, expect, it } from "vitest";
import { weather } from "../../../../packages/engine/src/agent-api/nodes/weather";
import { ProductionEffectSystem } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

const legacyIds = (nodes: readonly { runtime?: { id?: string } }[]) =>
  nodes.filter((n) => n.runtime?.id?.startsWith("prd07.legacyWeather.")).map((n) => n.runtime!.id!);

describe("P5-T4 weather legacy carve", () => {
  it("precipitation tags every streak/flake and emits the real effect node", () => {
    const { nodes, dropCount } = weather.precipitation({ type: "rain", streakLimit: 10 });
    expect(dropCount).toBe(10);
    const tagged = legacyIds(nodes);
    expect(tagged.length).toBe(10);
    expect(nodes.some((n) => (n as { kind?: string }).kind === "effect")).toBe(true);
    const snow = weather.precipitation({ type: "snow", streakLimit: 6 });
    expect(legacyIds(snow.nodes).length).toBe(6);
  });

  it("wetGround emits slab + puddles tagged plus the §6.8 wetness node", () => {
    const { nodes, puddleCount } = weather.wetGround({ seed: 7 });
    const tagged = legacyIds(nodes);
    expect(tagged.length).toBe(1 + puddleCount); // slab + each puddle
    expect(nodes.some((n) => (n as { effect?: string }).effect === "wetness")).toBe(true);
  });

  it("flag-on hides every prd07.legacyWeather.* runtime handle", () => {
    const { nodes } = weather.precipitation({ type: "rain", streakLimit: 8 });
    const hidden: string[] = [];
    const app = {
      scene: { nodes },
      nodes: { get: (id: string) => ({ setVisible: (v: boolean) => { if (!v) hidden.push(id); } }) },
      onFrame: () => () => {}
    };
    const system = new ProductionEffectSystem(app as never);
    system.setWeatherFlagOn(true);
    expect(hidden.length).toBe(8);
    for (const id of hidden) expect(id.startsWith("prd07.legacyWeather.")).toBe(true);
  });

  it("flag-off leaves handles alone (pixel identity)", () => {
    const { nodes } = weather.precipitation({ type: "rain", streakLimit: 8 });
    const hidden: string[] = [];
    const app = {
      scene: { nodes },
      nodes: { get: (id: string) => ({ setVisible: (v: boolean) => { if (!v) hidden.push(id); } }) },
      onFrame: () => () => {}
    };
    const system = new ProductionEffectSystem(app as never);
    system.setWeatherFlagOn(false);
    expect(hidden).toEqual([]);
  });
});
