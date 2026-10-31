/**
 * GU47 TT-M1 / TT-M2: hero court surfaces, mow stripes, kits, racket and ball materials of the World Tour look.
 */
import { describe, expect, it } from "vitest";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { buildTennisScene } from "../../../examples/aura-slam/view/scene";
import {
  GRASS_STRIPES_ALT_ID, GRASS_STRIPES_ID, LINE_COLOR, STRIPE_COLORS, VENUE_SURFACE, feltBallMaterial, grassStripesGeometry, rigMaterialRole, surfaceMaterial, upgradeRigMaterial
} from "../../../examples/aura-slam/view/surfaces";
import { VENUE_PALETTES } from "../../../examples/aura-slam/view/venues";

type Node = { name?: string; material?: Record<string, unknown>; children?: Node[] };
const flat = (nodes: Node[] = []): Node[] => nodes.flatMap((n) => [n, ...flat(n.children)]);
const nodesOf = (venue: string, look?: "original") => flat((buildTennisScene(createPoseRig(), { venue, look }).toJSON() as unknown as { nodes: Node[] }).nodes);

describe("GU47 TT-M1: hero court surfaces", () => {
  it("acrylic courts (hard, desert, beach) carry a 0.35 clearcoat and a grain normal", () => {
    for (const venue of ["hard", "desert", "beach"]) {
      expect(VENUE_SURFACE[venue]).toBe("acrylic");
      const court = surfaceMaterial(venue, "court");
      expect(court.clearcoat, venue).toBe(0.35);
      expect(court.normal).toBeDefined();
      expect(court.color).toBe(VENUE_PALETTES[venue]!.court);
    }
  });

  it("every court grain bound as a normal is a normal-map texture (roughness fields tilted the Moon court black)", () => {
    for (const venue of Object.keys(VENUE_PALETTES)) {
      for (const part of ["court", "alley", "apron"] as const) {
        const normal = surfaceMaterial(venue, part).normal as { texture?: string } | undefined;
        expect(normal?.texture, `${venue}/${part}`).toBe("fabric-normal");
      }
    }
  });

  it("turf has a 0.6 sheen, clay roughness 0.95, regolith on the Moon", () => {
    expect(surfaceMaterial("grass", "court").sheen).toBe(0.6);
    expect(surfaceMaterial("clay", "court").roughness).toBe(0.95);
    expect(surfaceMaterial("clay", "alley").roughness).toBe(0.95);
    expect(VENUE_SURFACE.moon).toBe("regolith");
    expect(surfaceMaterial("moon", "court").roughness).toBeGreaterThanOrEqual(0.95);
  });

  it("the boot venue's surface materials and the #fbfbf5 lines are authored; ?look=original keeps the flat 4.6.1 court", () => {
    const clay = nodesOf("clay");
    expect(clay.find((n) => n.name === "court-singles-surface")?.material).toMatchObject({ roughness: 0.95, color: VENUE_PALETTES.clay!.court });
    expect(clay.find((n) => n.name === "static-lines")?.material).toMatchObject({ color: LINE_COLOR });
    const original = nodesOf("clay", "original");
    expect(original.find((n) => n.name === "court-singles-surface")?.material).toMatchObject({ roughness: 0.78, color: VENUE_PALETTES.hard!.court });
    expect(original.find((n) => n.name === "static-lines")?.material).toMatchObject({ color: "#f5f4e6" });
  });

  it("the mow stripes are 8 alternating quads in two material-coloured meshes (the 8 stripe boxes are gone)", () => {
    const geo = grassStripesGeometry() as unknown as { positions: number[]; colors: number[]; indices: number[] };
    expect(geo.positions.length / 3).toBe(32);
    expect(geo.indices.length / 6).toBe(8);
    const firstColour = geo.colors.slice(0, 3);
    const secondColour = geo.colors.slice(16, 19);
    expect(firstColour).not.toEqual(secondColour);
    expect(STRIPE_COLORS).toHaveLength(2);
    const names = nodesOf("grass").map((n) => n.name);
    expect(names.filter((n) => n === GRASS_STRIPES_ID)).toHaveLength(1);
    expect(names.filter((n) => n === GRASS_STRIPES_ALT_ID)).toHaveLength(1);
    expect((grassStripesGeometry(0) as unknown as { indices: number[] }).indices.length / 6).toBe(4);
    expect((grassStripesGeometry(1) as unknown as { indices: number[] }).indices.length / 6).toBe(4);
    // The engine's mesh shading ignores vertex colours: each half is coloured by its material.
    const stripeColours = nodesOf("grass").filter((n) => n.name === GRASS_STRIPES_ID || n.name === GRASS_STRIPES_ALT_ID).map((n) => n.material?.color);
    expect(stripeColours).toEqual([...STRIPE_COLORS]);
    expect(names.some((n) => typeof n === "string" && /^grass-stripe-\d$/.test(n))).toBe(false);
  });
});

describe("GU47 TT-M2: kits, racket and ball", () => {
  it("kit parts take fabric with a 0.5 sheen in the same colour; racket frames take clearcoat paint; skin parts are untouched", () => {
    expect(rigMaterialRole("player-torso")).toBe("kit");
    expect(rigMaterialRole("rival-left-upper-leg")).toBe("kit");
    expect(rigMaterialRole("player-racket-hoop")).toBe("racket");
    expect(rigMaterialRole("player-head")).toBeNull();
    expect(rigMaterialRole("rival-left-lower-arm")).toBeNull();
    const kit = upgradeRigMaterial("kit", { color: "#f3f0dc", roughness: 0.75 });
    expect(kit).toMatchObject({ color: "#f3f0dc", sheen: 0.5 });
    const racket = upgradeRigMaterial("racket", { color: "#1d2927", metalness: 0.4, roughness: 0.38 });
    expect(racket.color).toBe("#1d2927");
    expect(racket.clearcoat).toBeGreaterThan(0.5);
    const skin = { color: "#c9926d", roughness: 0.74 };
    expect(upgradeRigMaterial(null, skin)).toBe(skin);
  });

  it("the ball is felt with a #f2ff7a sheen and a self-glow that does not count as fill (<= 0.1)", () => {
    const ball = feltBallMaterial();
    expect(ball.sheenColor).toBe("#f2ff7a");
    expect(ball.sheen).toBeGreaterThan(0.5);
    expect(ball.emissiveIntensity ?? 0).toBeLessThanOrEqual(0.1);
    expect(nodesOf("hard").find((n) => n.name === "tennis-ball")?.material).toMatchObject({ sheenColor: "#f2ff7a" });
  });
});
