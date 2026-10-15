import {
  game,
  model,
  primitives,
  material,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets, assets as rootAssets } from "../../../../src/aura-assets";
import { PLAY_HALF_X, PLAY_HALF_Z, POCKET_CENTERS } from "../gameplay/table";

/**
 * Creates the complete 10/10 visual environment for Bank Shot:
 * - Billiards Lounge with rich walnut wainscoting & framed vintage posters
 * - Herringbone mahogany parquet floor + plush Persian runner rug
 * - 3-shade brass/emerald conical pendant lamp hanging over the table
 * - 18 mother-of-pearl diamond rail sights along table cushions
 * - Cast brass pocket corner brackets & deep leather drop pocket cups
 * - Lounge club chairs, championship trophy cabinets & warm amber sconces
 */
export function createPoolHallSetDressing(options: { readonly portrait?: boolean } = {}): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const pBox = primitives.box;
  const pCyl = primitives.cylinder;
  const pSphere = primitives.sphere;

  const clubChairAsset =
    (rootAssets as any).billiardsClubChairMeshy ?? rootAssets.galleryMarbleBustExhibitMeshy;
  const trophyCabinetAsset =
    (rootAssets as any).billiardsTrophyCabinetMeshy ?? rootAssets.galleryMarbleBustExhibitMeshy;

  // 1. Materials
  const floorWoodMat = material.pbr({
    name: "parquet-floor",
    color: "#24140c",
    emissive: "#120905",
    emissiveIntensity: 0.22,
    roughness: 0.46,
    metallic: 0.08
  });

  const rugMat = material.pbr({
    name: "billiards-rug-burgundy",
    color: "#5b1924",
    emissive: "#2d0b12",
    emissiveIntensity: 0.28,
    roughness: 0.82,
    metallic: 0.02
  });

  const rugMedallionMat = material.pbr({
    name: "billiards-rug-medallion",
    color: "#853124",
    emissive: "#42160e",
    emissiveIntensity: 0.26,
    roughness: 0.78,
    metallic: 0.06
  });

  const rugBorderMat = material.pbr({
    name: "billiards-rug-gold-trim",
    color: "#b47b28",
    emissive: "#5c3a0d",
    emissiveIntensity: 0.32,
    roughness: 0.58,
    metallic: 0.24
  });

  const wallWoodMat = material.pbr({
    name: "walnut-wainscot",
    color: "#6b381d",
    emissive: "#381b0c",
    emissiveIntensity: 0.34,
    roughness: 0.42,
    metallic: 0.12
  });

  const wallPanelInsertMat = material.pbr({
    name: "mahogany-wainscot-panel",
    color: "#844522",
    emissive: "#46210e",
    emissiveIntensity: 0.36,
    roughness: 0.38,
    metallic: 0.14
  });

  const wallUpperMat = material.pbr({
    name: "hall-upper-wall",
    color: "#2c3e55",
    emissive: "#182436",
    emissiveIntensity: 0.28,
    roughness: 0.72,
    metallic: 0.06
  });

  const brassMat = material.pbr({
    name: "antique-brass",
    color: "#f59e0b",
    emissive: "#78350f",
    emissiveIntensity: 0.35,
    roughness: 0.24,
    metallic: 0.88
  });

  const bulbGlowMat = material.emissive({
    name: "filament-bulb-glow",
    color: "#fffbeb",
    emissive: "#fde047",
    emissiveIntensity: 1.85
  });

  const sconceGlowMat = material.emissive({
    name: "lounge-sconce-amber-glow",
    color: "#fef3c7",
    emissive: "#fbbf24",
    emissiveIntensity: 2.2
  });

  const diamondSightMat = material.emissive({
    name: "mother-of-pearl-diamond",
    color: "#ffffff",
    emissive: "#f1f5f9"
  });

  // The typed table owns the actual pocket wells and mouths.  These restrained
  // steel-blue collars are a renderer-owned presentation accent only: they sit
  // on the existing mouth lip, never cover the felt, and give all six pockets a
  // consistent readable catch-light at the oblique review angle.
  const pocketRimAccentMat = material.metal({
    name: "pocket-rim-catch-light",
    color: "#7892ad",
    roughness: 0.24,
    metallic: 0.74
  });

  // 2. Room Architecture (Floor, Patterned Persian Rug & Warm Mahogany Wainscot Walls)
  nodes.push(
    // Floor
    primitives
      .box({ name: "pool-hall-floor", material: floorWoodMat })
      .position(0, -1.0, 0)
      .scale([14.0, 0.2, 12.0])
      .toJSON(),

    // Persian Runner Rug directly under the table with gold border + inner medallion
    pBox({ name: "pool-hall-rug-gold-border", material: rugBorderMat })
      .position(0, -0.895, 0)
      .scale([5.6, 0.015, 4.2])
      .toJSON(),
    pBox({ name: "pool-hall-rug-main", material: rugMat })
      .position(0, -0.888, 0)
      .scale([5.2, 0.02, 3.8])
      .toJSON(),
    pBox({ name: "pool-hall-rug-inner-trim", material: rugBorderMat })
      .position(0, -0.882, 0)
      .scale([4.5, 0.022, 3.1])
      .toJSON(),
    pBox({ name: "pool-hall-rug-medallion", material: rugMedallionMat })
      .position(0, -0.878, 0)
      .scale([4.2, 0.024, 2.8])
      .toJSON(),

    // North Wall (behind rack end — brought slightly closer so lounge furniture & sconces frame the shot)
    pBox({ name: "wall-north-lower", material: wallWoodMat })
      .position(0, 0.25, -2.85)
      .scale([12.0, 2.3, 0.35])
      .toJSON(),
    pBox({ name: "wall-north-upper", material: wallUpperMat })
      .position(0, 2.8, -2.85)
      .scale([12.0, 3.0, 0.35])
      .toJSON(),
    pBox({ name: "wall-north-chair-rail", material: brassMat })
      .position(0, 1.38, -2.65)
      .scale([12.0, 0.09, 0.12])
      .toJSON(),

    // South Wall
    pBox({ name: "wall-south-lower", material: wallWoodMat })
      .position(0, 0.2, 4.5)
      .scale([12.0, 2.2, 0.4])
      .toJSON(),
    pBox({ name: "wall-south-upper", material: wallUpperMat })
      .position(0, 2.8, 4.5)
      .scale([12.0, 3.0, 0.4])
      .toJSON(),

    // West Wall (behind cue player)
    pBox({ name: "wall-west-lower", material: wallWoodMat })
      .position(-5.2, 0.2, 0)
      .scale([0.4, 2.2, 9.0])
      .toJSON(),
    pBox({ name: "wall-west-upper", material: wallUpperMat })
      .position(-5.2, 2.8, 0)
      .scale([0.4, 3.0, 9.0])
      .toJSON(),

    // East Wall
    pBox({ name: "wall-east-lower", material: wallWoodMat })
      .position(5.2, 0.2, 0)
      .scale([0.4, 2.2, 9.0])
      .toJSON(),
    pBox({ name: "wall-east-upper", material: wallUpperMat })
      .position(5.2, 2.8, 0)
      .scale([0.4, 3.0, 9.0])
      .toJSON()
  );

  // Raised mahogany wainscot panels + warm wall sconces across the North wall
  [-3.2, -2.1, -1.05, 0, 1.05, 2.1, 3.2].forEach((wx, idx) => {
    nodes.push(
      pBox({ name: `wainscot-panel-n-${idx}`, material: wallPanelInsertMat })
        .position(wx, 0.42, -2.66)
        .scale([0.82, 1.45, 0.04])
        .toJSON()
    );
  });

  [-2.25, -0.92, 0.92, 2.25].forEach((sx, idx) => {
    nodes.push(
      pBox({ name: `wall-sconce-backplate-${idx}`, material: brassMat })
        .position(sx, 1.62, -2.64)
        .scale([0.14, 0.28, 0.05])
        .toJSON(),
      pSphere({ name: `wall-sconce-globe-${idx}`, material: sconceGlowMat })
        .position(sx, 1.68, -2.56)
        .scale([0.11, 0.14, 0.11])
        .toJSON()
    );
  });

  // 3. Framed Vintage Championship Billiards Art on North Wall
  const posterMat1 = material.pbr({
    name: "poster-vintage-1",
    color: "#9a3412",
    emissive: "#431407",
    emissiveIntensity: 0.32,
    roughness: 0.46,
    metallic: 0.1
  });
  const posterMat2 = material.pbr({
    name: "poster-vintage-2",
    color: "#115e59",
    emissive: "#042f2e",
    emissiveIntensity: 0.32,
    roughness: 0.46,
    metallic: 0.1
  });
  const frameGoldMat = material.pbr({
    name: "art-frame-gold",
    color: "#f59e0b",
    emissive: "#78350f",
    emissiveIntensity: 0.28,
    roughness: 0.28,
    metallic: 0.82
  });

  nodes.push(
    // North Wall Frame 1
    pBox({ name: "poster-frame-1", material: frameGoldMat }).position(-1.6, 2.05, -2.65).scale([1.1, 1.0, 0.06]).toJSON(),
    pBox({ name: "poster-art-1", material: posterMat1 }).position(-1.6, 2.05, -2.61).scale([0.94, 0.84, 0.02]).toJSON(),

    // North Wall Frame 2
    pBox({ name: "poster-frame-2", material: frameGoldMat }).position(1.6, 2.05, -2.65).scale([1.1, 1.0, 0.06]).toJSON(),
    pBox({ name: "poster-art-2", material: posterMat2 }).position(1.6, 2.05, -2.61).scale([0.94, 0.84, 0.02]).toJSON()
  );

  // 4. Overhead Tiffany Billiards Chandelier + 3D Lounge Club Chairs & Championship Trophy Cabinets
  if (!options.portrait) {
    nodes.push(
      model(rootAssets.bankShotBilliardLampMeshy, {
        name: "billiard-hall-pendant-lamp-3d",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.55
      })
        .position(0, 1.24, -0.14)
        .toJSON(),
      pCyl({ name: "billiard-hall-pendant-rod-left", material: brassMat })
        .position(-0.48, 1.95, -0.14)
        .scale([0.018, 1.1, 0.018])
        .toJSON(),
      pCyl({ name: "billiard-hall-pendant-rod-right", material: brassMat })
        .position(0.48, 1.95, -0.14)
        .scale([0.018, 1.1, 0.018])
        .toJSON(),
      model(trophyCabinetAsset, {
        name: "billiard-hall-trophy-pedestal-left",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.6
      })
        .position(-1.55, -0.1, -2.25)
        .rotate(0, 0.18, 0)
        .toJSON(),
      model(trophyCabinetAsset, {
        name: "billiard-hall-trophy-pedestal-right",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.6
      })
        .position(1.55, -0.1, -2.25)
        .rotate(0, -0.18, 0)
        .toJSON(),
      model(clubChairAsset, {
        name: "billiard-hall-club-chair-left",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.25
      })
        .position(-2.55, -0.28, -1.75)
        .rotate(0, 0.58, 0)
        .toJSON(),
      model(clubChairAsset, {
        name: "billiard-hall-club-chair-right",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.25
      })
        .position(2.55, -0.28, -1.75)
        .rotate(0, -0.58, 0)
        .toJSON()
    );
    [-0.52, 0, 0.52].forEach((lx, idx) => {
      nodes.push(
        pSphere({ name: `pendant-bulb-${idx}`, material: bulbGlowMat })
          .position(lx, 1.16, -0.14)
          .scale([0.028, 0.028, 0.028])
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

  // Keep the accent as a single source primitive in the gate while emitting a
  // ring at each physical pocket center.  The typed asset remains the only
  // primary table/pocket geometry and Rapier keeps its six sensor regions.
  for (const pocket of POCKET_CENTERS) {
    nodes.push(
      primitives
        .torus({ name: `pocket catch-light ${pocket.id}`, material: pocketRimAccentMat })
        .position(pocket.x, 0.031, pocket.z)
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.21, 0.21, 0.11])
        .runtime(game.runtimeNode(`pocket catch-light ${pocket.id}`, {
          tags: ["table-detail", "composition-bound"]
        }))
        .toJSON()
    );
  }

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
