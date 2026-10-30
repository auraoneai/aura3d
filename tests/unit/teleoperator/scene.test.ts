import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { buildGridDispatchScene, ROAD_STRIPS } from "../../../apps/showcase-teleoperator/src/scene";
import { PLAYABLE_IDS } from "../../../apps/showcase-teleoperator/src/rules";
import { RIVALS, TRAFFIC_COUNT } from "../../../apps/showcase-teleoperator/src/sim";

const INSTANCED = ["sf-dashes", "sf-cross-roads", "sf-crosswalks", "sf-signal-poles", "sf-signal-arms", "sf-signal-lights", "sf-lamp-poles", "sf-lamp-globes", "sf-tree-trunks", "sf-tree-crowns", "route-ribbons", "sf-road-patches", "sf-road-joints", "sf-manholes"];
const NODES = [
  ...PLAYABLE_IDS.map((id) => `player-car-${id}`),
  ...ROAD_STRIPS.map((s) => s.id),
  ...INSTANCED,
  "taxi-beacon-ring", "taxi-beacon-disc", "taxi-beacon-beam", "taxi-beacon-core", "taxi-passenger-body", "taxi-passenger-head", "taxi-passenger-arm",
  ...Array.from({ length: 8 }, (_, i) => [`sf-bldg-l-${i}`, `sf-bldg-r-${i}`]).flat(),
  ...Array.from({ length: TRAFFIC_COUNT }, (_, i) => `traffic-${i}`),
  ...RIVALS.map((_, k) => `rival-car-${k}`)
];

describe("grid dispatch scene", () => {
  for (const weather of ["noon", "golden", "fog", "night"] as const) {
    it(`${weather}: every runtime node the game drives exists`, () => {
      const app = createAuraApp(undefined, { scene: buildGridDispatchScene(weather), autoStart: false });
      for (const id of NODES) expect(app.nodes.has(id), id).toBe(true);
      const dashes = app.nodes.require("sf-dashes");
      dashes.setInstances([{ position: [1, 2, 3] }]);
      expect((dashes.snapshot() as { instances?: readonly unknown[] }).instances?.length).toBe(1);
      app.dispose?.();
    });
  }
  it("no builder option is ignored (OPTION_IGNORED, upgrade guide check)", () => {
    for (const weather of ["noon", "golden", "fog", "night"] as const) {
      const app = createAuraApp(undefined, { scene: buildGridDispatchScene(weather), autoStart: false });
      const notes: string[] = [];
      let seen = 0;
      const walk = (nodes: readonly unknown[]): void => {
        for (const n of nodes as Array<{ ignoredOptions?: string[]; children?: unknown[] }>) {
          seen++;
          if (n.ignoredOptions) notes.push(...n.ignoredOptions);
          if (n.children) walk(n.children);
        }
      };
      walk((app.scene as unknown as { nodes: unknown[] }).nodes);
      expect(seen).toBeGreaterThan(60);
      expect(notes, weather).toEqual([]);
      app.dispose?.();
    }
  });
  it("the hidden helper primitives are gone (C12)", () => {
    const app = createAuraApp(undefined, { scene: buildGridDispatchScene("noon"), autoStart: false });
    for (const id of ["player-lidar-dome", "player-tailbar", "player-contact-shadow", "peer-waymo-lidar-ring"]) expect(app.nodes.has(id)).toBe(false);
    app.dispose?.();
  });
  it("only the sky preset changes the lights: four distinct look and light sets", () => {
    const sigs = (["noon", "golden", "fog", "night"] as const).map((w) => {
      const snap = buildGridDispatchScene(w).toJSON?.() ?? buildGridDispatchScene(w);
      return JSON.stringify(snap).match(/"kind":"light"[^}]*\}/g)?.join("|") ?? JSON.stringify(snap).length.toString();
    });
    expect(new Set(sigs).size).toBe(4);
  });
});

describe("grid dispatch renderer options (wave 2, E1 handoff)", () => {
  it("asks for the high tier in object form: same mount tier and parse as the old string, no string-tier warning", async () => {
    const { GRID_DISPATCH_RENDERER } = await import("../../../apps/showcase-teleoperator/src/scene");
    const { resolveMountQuality } = await import("../../../packages/engine/src/agent-api/compiler/renderer");
    const { parseQualityRendererOptions } = await import("../../../packages/engine/src/agent-api/app/rendererOptions");
    expect(typeof GRID_DISPATCH_RENDERER.quality).toBe("object");
    expect(resolveMountQuality(GRID_DISPATCH_RENDERER as never)).toEqual(resolveMountQuality({ quality: { tier: "high" } } as never));
    expect(resolveMountQuality(GRID_DISPATCH_RENDERER as never).tier).toBe("high");
    expect(parseQualityRendererOptions(GRID_DISPATCH_RENDERER as never, null).requested).toBe(parseQualityRendererOptions({ quality: "high" } as never, null).requested);
  });
});
