import { describe, expect, it } from "vitest";
import { buildScene } from "../../../apps/showcase-dot-dash-3d/src/game/world";
import { ARCADE, LOOK_HDRI } from "../../../apps/showcase-dot-dash-3d/src/game/look";

type SceneNode = {
  kind: string;
  name?: string;
  light?: string;
  effect?: string;
  intensity?: number;
  position?: readonly number[];
  shadow?: unknown;
  environment?: string;
  background?: unknown;
  texture?: { url?: string };
  children?: SceneNode[];
};

function sceneNodes(): SceneNode[] {
  const { nodes } = buildScene() as { nodes: SceneNode[] };
  const out: SceneNode[] = [];
  const walk = (list: readonly SceneNode[]): void => {
    for (const n of list) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

const isShadowed = (n: SceneNode): boolean => n.shadow === true || (typeof n.shadow === "object" && n.shadow !== null);

/** Arcade-readability pass: one overhead key, a low undrawn IBL, no off-maze clutter. */
describe("dot-dash-3d arcade lighting and clutter", () => {
  it("one shadowed overhead directional key, no ambient / hemisphere / point / spot lights", () => {
    const lights = sceneNodes().filter((n) => n.kind === "light");
    expect(lights).toHaveLength(1);
    expect(lights[0]!.light).toBe("directional");
    expect(isShadowed(lights[0]!)).toBe(true);
    expect(lights[0]!.position?.[1]).toBeGreaterThan(20);
    expect(lights[0]!.intensity).toBe(ARCADE.key.intensity);
  });

  it("fills with the workshop HDRI at a low intensity without drawing it", () => {
    const env = sceneNodes().filter((n) => n.kind === "environment");
    expect(env).toHaveLength(1);
    expect(env[0]!.texture?.url).toBe(LOOK_HDRI.url);
    expect(env[0]!.intensity).toBe(ARCADE.ibl);
    expect(env[0]!.background).toBe(false);
  });

  it("draws nothing off the maze: no bench, lamp, pylons, gem caches, models, silkscreen or lens clutter", () => {
    const nodes = sceneNodes();
    const names = nodes.map((n) => n.name ?? "");
    for (const gone of ["walnut bench", "anti-static mat", "workshop wall", "pegboard", "desk lamp", "silk title", "mounting holes"]) {
      expect(names.some((n) => n.includes(gone)), gone).toBe(false);
    }
    expect(nodes.filter((n) => n.kind === "model")).toHaveLength(0);
    expect(names.some((n) => n.startsWith("gem-cache"))).toBe(false);
    const json = JSON.stringify(buildScene());
    for (const fx of ["vignette", "chromaticAberration", "filmGrain", "fog", "screenSpaceReflections", "particles"]) {
      expect(json.includes(`"${fx}"`), fx).toBe(false);
    }
  });
});
