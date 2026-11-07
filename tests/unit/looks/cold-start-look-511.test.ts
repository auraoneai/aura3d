// 5.1 cold-start default look: applied only to scenes with no authored look/light/environment/effect; every other
// scene must come back as the very same snapshot object.
import { describe, expect, it } from "vitest";
import { camera, effects, environments, group, lights, looks, material, primitives, scene } from "../../../packages/engine/src/agent-api/index.js";
import { coldStartLookEnabled, withColdStartLook } from "../../../packages/engine/src/agent-api/looks/coldStartLook.js";

const cube = () => primitives.box({ name: "cube", material: material.pbr({ color: "#c8ccd4", metallic: 0.9, roughness: 0.38 }) });
const names = (s: ReturnType<typeof withColdStartLook>): string[] => {
  const stage = s.nodes.find((n) => (n as { name?: string }).name === "hero stage") as unknown as { children: { name: string }[] } | undefined;
  return stage ? stage.children.map((c) => c.name) : [];
};

describe("withColdStartLook", () => {
  it("adds studio IBL, key/fill/rim, floor and fade to a geometry-only scene", () => {
    const base = scene({ background: "#2b2b2e" }).add(cube()).camera(camera.orbit({ position: [2.8, 1.9, 3.4], target: [0, 0, 0], fov: 40 })).toJSON();
    const out = withColdStartLook(base);
    expect(out).not.toBe(base);
    expect(names(out)).toEqual(expect.arrayContaining(["hero studio environment", "hero key", "hero fill", "hero rim", "hero floor", "hero floor fade"]));
    expect(out.nodes.slice(0, base.nodes.length)).toEqual(base.nodes);
    expect(out.background).toBe(base.background);
  });

  it("sizes the rig to the scene bounds and puts the floor under the lowest geometry", () => {
    const small = withColdStartLook(scene().add(cube()).toJSON());
    const big = withColdStartLook(scene().add(group("g", [cube().position(-30, 0, 0), cube().position(30, 4, 0)])).toJSON());
    const keyOf = (s: ReturnType<typeof withColdStartLook>) => {
      const stage = s.nodes.at(-1) as unknown as { children: { name: string; position?: number[] }[] };
      return stage.children.find((c) => c.name === "hero key")!.position!;
    };
    expect(Math.hypot(...keyOf(big))).toBeGreaterThan(Math.hypot(...keyOf(small)) * 10);
    const floor = (small.nodes.at(-1) as unknown as { children: { name: string; position?: number[] }[] }).children.find((c) => c.name === "hero floor")!;
    expect(floor.position![1]).toBeCloseTo(-0.5 - 0.001, 6);
  });

  it("skips the floor when the scene already has a ground plane", () => {
    const out = withColdStartLook(scene().add(cube()).add(primitives.plane({ name: "ground", size: [40, 1, 40] }).position(0, -0.5, 0)).toJSON());
    expect(names(out).some((n) => n.includes("floor"))).toBe(false);
    expect(names(out)).toContain("hero key");
  });

  const authored: Record<string, () => ReturnType<typeof scene>> = {
    "a light": () => scene().add(cube()).add(lights.directional({ name: "k", position: [1, 2, 3], target: [0, 0, 0], intensity: 2 })),
    "an environment": () => scene().add(cube()).add(environments.neutral({ intensity: 1, background: false })),
    "a fog effect": () => scene().add(cube()).add(effects.fog({ mode: "exp", color: "#999999", density: 0.01 })),
    "a look preset": () => scene().add(cube()).add(looks.preset(looks.list()[0]!)),
    "a nested light": () => scene().add(group("g", [cube(), lights.point({ name: "p", position: [0, 1, 0], intensity: 1 })])),
    "a hero stage": () => scene().add(cube()).add(looks.heroStage())
  };
  for (const [label, build] of Object.entries(authored)) {
    it(`returns the same snapshot object when the scene has ${label}`, () => {
      const snap = build().toJSON();
      expect(withColdStartLook(snap)).toBe(snap);
    });
  }

  it("leaves an empty scene alone", () => {
    const snap = scene().toJSON();
    expect(withColdStartLook(snap)).toBe(snap);
  });

  it("is switchable off", () => {
    expect(coldStartLookEnabled()).toBe(true);
    process.env.A3D_COLD_START_LOOK = "0";
    try {
      expect(coldStartLookEnabled()).toBe(false);
    } finally {
      delete process.env.A3D_COLD_START_LOOK;
    }
  });
});
