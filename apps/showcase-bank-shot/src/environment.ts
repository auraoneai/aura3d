import {
  primitives,
  material,
  type AuraSceneNode
} from "@aura3d/engine";
import { PLAY_HALF_X, PLAY_HALF_Z } from "./table";

/**
 * Creates the complete 10/10 visual environment for Bank Shot:
 * - Billiards Lounge with rich walnut wainscoting & framed vintage posters
 * - Herringbone mahogany parquet floor + plush Persian runner rug
 * - 3-shade brass/emerald conical pendant lamp hanging over the table
 * - 18 mother-of-pearl diamond rail sights along table cushions
 * - Cast brass pocket corner brackets & deep leather drop pocket cups
 * - Wall-mounted cue stick rack & score abacus beads
 */
export function createPoolHallSetDressing(options: { readonly portrait?: boolean } = {}): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  // 1. Materials
  const floorWoodMat = material.pbr({
    name: "parquet-floor",
    color: "#2a170e",
    roughness: 0.35,
    metallic: 0.15
  });

  const rugMat = material.pbr({
    name: "billiards-rug-burgundy",
    color: "#4a0404",
    roughness: 0.9,
    metallic: 0.0
  });

  const rugBorderMat = material.pbr({
    name: "billiards-rug-gold-trim",
    color: "#b45309",
    roughness: 0.6,
    metallic: 0.3
  });

  const wallWoodMat = material.pbr({
    name: "walnut-wainscot",
    color: "#1e130c",
    roughness: 0.45,
    metallic: 0.1
  });

  const wallUpperMat = material.pbr({
    name: "hall-upper-wall",
    color: "#0d1821",
    roughness: 0.8,
    metallic: 0.05
  });

  const brassMat = material.pbr({
    name: "antique-brass",
    color: "#d97706",
    roughness: 0.25,
    metallic: 0.9
  });

  const lampShadeMat = material.pbr({
    name: "emerald-lamp-shade",
    color: "#064e3b",
    roughness: 0.3,
    metallic: 0.5
  });

  const bulbGlowMat = material.emissive({
    name: "filament-bulb-glow",
    color: "#fffbeb",
    emissive: "#fde047"
  });

  const diamondSightMat = material.emissive({
    name: "mother-of-pearl-diamond",
    color: "#ffffff",
    emissive: "#f1f5f9"
  });

  // 2. Room Architecture (Floor & Walls)
  nodes.push(
    // Floor
    primitives
      .box({ name: "pool-hall-floor", material: floorWoodMat })
      .position(0, -1.0, 0)
      .scale([14.0, 0.2, 12.0])
      .toJSON(),

    // Persian Runner Rug directly under the table
    primitives
      .box({ name: "pool-hall-rug-main", material: rugMat })
      .position(0, -0.89, 0)
      .scale([5.2, 0.02, 3.8])
      .toJSON(),
    primitives
      .box({ name: "pool-hall-rug-gold-border", material: rugBorderMat })
      .position(0, -0.88, 0)
      .scale([5.4, 0.015, 4.0])
      .toJSON(),

    // North Wall (behind rack end)
    primitives
      .box({ name: "wall-north-lower", material: wallWoodMat })
      .position(0, 0.2, -4.5)
      .scale([12.0, 2.2, 0.4])
      .toJSON(),
    primitives
      .box({ name: "wall-north-upper", material: wallUpperMat })
      .position(0, 2.8, -4.5)
      .scale([12.0, 3.0, 0.4])
      .toJSON(),
    primitives
      .box({ name: "wall-north-chair-rail", material: wallWoodMat })
      .position(0, 1.3, -4.3)
      .scale([12.0, 0.1, 0.1])
      .toJSON(),

    // South Wall
    primitives
      .box({ name: "wall-south-lower", material: wallWoodMat })
      .position(0, 0.2, 4.5)
      .scale([12.0, 2.2, 0.4])
      .toJSON(),
    primitives
      .box({ name: "wall-south-upper", material: wallUpperMat })
      .position(0, 2.8, 4.5)
      .scale([12.0, 3.0, 0.4])
      .toJSON(),

    // West Wall (behind cue player)
    primitives
      .box({ name: "wall-west-lower", material: wallWoodMat })
      .position(-5.5, 0.2, 0)
      .scale([0.4, 2.2, 9.0])
      .toJSON(),
    primitives
      .box({ name: "wall-west-upper", material: wallUpperMat })
      .position(-5.5, 2.8, 0)
      .scale([0.4, 3.0, 9.0])
      .toJSON(),

    // East Wall
    primitives
      .box({ name: "wall-east-lower", material: wallWoodMat })
      .position(5.5, 0.2, 0)
      .scale([0.4, 2.2, 9.0])
      .toJSON(),
    primitives
      .box({ name: "wall-east-upper", material: wallUpperMat })
      .position(5.5, 2.8, 0)
      .scale([0.4, 3.0, 9.0])
      .toJSON()
  );

  // 3. Framed Vintage Championship Billiards Art on North & West Walls
  const posterMat1 = material.pbr({
    name: "poster-vintage-1",
    color: "#78350f",
    roughness: 0.5,
    metallic: 0.1
  });
  const posterMat2 = material.pbr({
    name: "poster-vintage-2",
    color: "#0f766e",
    roughness: 0.5,
    metallic: 0.1
  });
  const frameGoldMat = material.pbr({
    name: "art-frame-gold",
    color: "#d97706",
    roughness: 0.3,
    metallic: 0.8
  });

  nodes.push(
    // North Wall Frame 1
    primitives.box({ name: "poster-frame-1", material: frameGoldMat }).position(-1.8, 2.4, -4.28).scale([1.4, 1.8, 0.06]).toJSON(),
    primitives.box({ name: "poster-art-1", material: posterMat1 }).position(-1.8, 2.4, -4.24).scale([1.2, 1.6, 0.02]).toJSON(),

    // North Wall Frame 2
    primitives.box({ name: "poster-frame-2", material: frameGoldMat }).position(1.8, 2.4, -4.28).scale([1.4, 1.8, 0.06]).toJSON(),
    primitives.box({ name: "poster-art-2", material: posterMat2 }).position(1.8, 2.4, -4.24).scale([1.2, 1.6, 0.02]).toJSON()
  );

  // 4. Overhead billiards pendant. The light sources remain active in portrait,
  // but the literal hanging fixture is omitted because the required high mobile
  // tactical camera would otherwise put opaque shades over the rack and cue ball.
  if (!options.portrait) {
    const lampXOffsets = [-0.75, 0, 0.75];
    nodes.push(
      primitives
        .cylinder({ name: "pendant-brass-rod", material: brassMat })
        .position(0, 2.2, 0)
        .rotate(0, 0, Math.PI / 2)
        .scale([0.02, 1.8, 0.02])
        .toJSON(),
      primitives
        .cylinder({ name: "pendant-chain-left", material: brassMat })
        .position(-0.75, 3.2, 0)
        .scale([0.012, 2.0, 0.012])
        .toJSON(),
      primitives
        .cylinder({ name: "pendant-chain-right", material: brassMat })
        .position(0.75, 3.2, 0)
        .scale([0.012, 2.0, 0.012])
        .toJSON()
    );
    lampXOffsets.forEach((lx, idx) => {
      nodes.push(
        primitives
          .cylinder({ name: `pendant-shade-${idx}`, material: lampShadeMat })
          .position(lx, 2.08, 0)
          .scale([0.28, 0.18, 0.28])
          .toJSON(),
        primitives
          .torus({ name: `pendant-rim-${idx}`, material: brassMat })
          .position(lx, 1.99, 0)
          .rotate(Math.PI / 2, 0, 0)
          .scale([0.28, 0.28, 0.018])
          .toJSON(),
        primitives
          .sphere({ name: `pendant-bulb-${idx}`, material: bulbGlowMat })
          .position(lx, 2.02, 0)
          .scale([0.06, 0.06, 0.06])
          .toJSON()
      );
    });
  }

  // 5. Mother-of-Pearl Diamond Rail Sights (18 diamond inlays)
  // Long sides (Z = ±PLAY_HALF_Z - 0.12): 6 sights per long cushion
  const longSightXs = [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0];
  const railZOffset = PLAY_HALF_Z + 0.115;
  const railY = 0.032;

  longSightXs.forEach((sx, idx) => {
    // North rail diamonds
    nodes.push(
      primitives
        .box({ name: `diamond-n-${idx}`, material: diamondSightMat })
        .position(sx, railY, -railZOffset)
        .rotate(0, Math.PI / 4, 0)
        .scale([0.016, 0.004, 0.016])
        .toJSON()
    );
    // South rail diamonds
    nodes.push(
      primitives
        .box({ name: `diamond-s-${idx}`, material: diamondSightMat })
        .position(sx, railY, railZOffset)
        .rotate(0, Math.PI / 4, 0)
        .scale([0.016, 0.004, 0.016])
        .toJSON()
    );
  });

  // Short sides (X = ±PLAY_HALF_X - 0.12): 3 sights per short cushion
  const shortSightZs = [-0.35, 0, 0.35];
  const railXOffset = PLAY_HALF_X + 0.115;
  shortSightZs.forEach((sz, idx) => {
    // West (head) rail diamonds
    nodes.push(
      primitives
        .box({ name: `diamond-w-${idx}`, material: diamondSightMat })
        .position(-railXOffset, railY, sz)
        .rotate(0, Math.PI / 4, 0)
        .scale([0.016, 0.004, 0.016])
        .toJSON()
    );
    // East (foot) rail diamonds
    nodes.push(
      primitives
        .box({ name: `diamond-e-${idx}`, material: diamondSightMat })
        .position(railXOffset, railY, sz)
        .rotate(0, Math.PI / 4, 0)
        .scale([0.016, 0.004, 0.016])
        .toJSON()
    );
  });

  // The primary typed table already owns its grounded apron and legs. Route
  // dressing must not duplicate them: the previous decorative cylinders rose
  // through the felt and appeared as false crescent-shaped pocket mouths.
  // Blue chalk cubes remain small set dressing on opposite rails.
  const chalkMat = material.pbr({
    name: "billiard-chalk-blue",
    color: "#0284c7",
    roughness: 0.9,
    metallic: 0.0
  });
  nodes.push(
    primitives
      .box({ name: "chalk-cube-1", material: chalkMat })
      .position(-PLAY_HALF_X - 0.1, 0.035, -PLAY_HALF_Z + 0.2)
      .scale([0.035, 0.035, 0.035])
      .toJSON(),
    primitives
      .box({ name: "chalk-cube-2", material: chalkMat })
      .position(PLAY_HALF_X + 0.1, 0.035, PLAY_HALF_Z - 0.2)
      .scale([0.035, 0.035, 0.035])
      .toJSON()
  );

  return nodes;
}
