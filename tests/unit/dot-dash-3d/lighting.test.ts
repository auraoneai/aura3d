import { describe, expect, it } from "vitest";
import { buildScene } from "../../../apps/showcase-dot-dash-3d/src/game/world";
import { BOARD_LOOKS, LAMP, LOOK_HDRI } from "../../../apps/showcase-dot-dash-3d/src/game/look";

type SceneNode = {
  kind: string;
  name?: string;
  light?: string;
  intensity?: number;
  color?: string;
  position?: readonly number[];
  shadow?: unknown;
  environment?: string;
  background?: unknown;
  texture?: { url?: string };
  look?: string;
  probe?: string;
  children?: SceneNode[];
};

function sceneNodes(): SceneNode[] {
  const { nodes } = buildScene() as { nodes: SceneNode[] };
  const out: SceneNode[] = [];
  const walk = (list: readonly SceneNode[]): void => {
    for (const n of list) {
      out.push(n);
      if (n.kind === "group" && n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

const isShadowed = (n: SceneNode): boolean => n.shadow === true || (typeof n.shadow === "object" && n.shadow !== null);

describe("dot-dash-3d lighting: desk-lamp key (DD47-L1) and workshop IBL (DD47-E1)", () => {
  it("mounts no ambient or hemisphere light and no look preset (not neon-arcade)", () => {
    const nodes = sceneNodes();
    const lights = nodes.filter((n) => n.kind === "light");
    expect(lights.map((l) => l.light)).not.toContain("ambient");
    expect(lights.map((l) => l.light)).not.toContain("hemisphere");
    expect(nodes.some((n) => n.kind === "look" || (n.kind === "group" && n.name?.startsWith("aura-look:")))).toBe(false);
  });

  it("has exactly one shadow caster: a PCSS spot from the upper left of the bench", () => {
    const shadowed = sceneNodes().filter((n) => n.kind === "light" && isShadowed(n));
    expect(shadowed).toHaveLength(1);
    const lamp = shadowed[0]!;
    expect(lamp.light).toBe("spot");
    expect(lamp.position).toEqual([-13, 19, 9]);
    expect(LAMP.position).toEqual([-13, 19, 9]);
    expect((lamp.shadow as { filter?: string }).filter).toBe("pcss");
    expect(lamp.color).toBe(BOARD_LOOKS.classic.lamp.color);
  });

  it("turns the old directional into a cool 0.25 unshadowed bounce", () => {
    const directional = sceneNodes().filter((n) => n.kind === "light" && n.light === "directional");
    expect(directional).toHaveLength(1);
    expect(directional[0]!.intensity).toBe(0.25);
    expect(isShadowed(directional[0]!)).toBe(false);
    const [r, , b] = [1, 3, 5].map((i) => parseInt(directional[0]!.color!.slice(i, i + 2), 16));
    expect(b!).toBeGreaterThan(r!);
  });

  it("fills with the indoor-workshop catalogue HDRI at 0.35 without drawing it, plus one box probe", () => {
    const nodes = sceneNodes();
    const env = nodes.filter((n) => n.kind === "environment");
    expect(env).toHaveLength(1);
    expect(env[0]!.environment).toBe("hdri");
    expect(env[0]!.texture?.url).toBe(LOOK_HDRI.url);
    expect(env[0]!.intensity).toBe(0.35);
    expect(env[0]!.background).toBe(false);
    expect(nodes.filter((n) => n.kind === "probe" && n.probe === "reflection")).toHaveLength(1);
  });
});
