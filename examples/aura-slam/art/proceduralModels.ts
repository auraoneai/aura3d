/**
 * WP-01 — Aura Slam 3D (`top-tennis`) Procedural Multi-Material Championship Architecture & Gear.
 *
 * Pure `@aura3d/engine` 5.5.1 + `proceduralKernel` sculpted court furniture, stadium bowl,
 * broadcast gantries, floodlight towers, seated spectators, and 28-node athlete rig meshes.
 * Zero `three` imports; smooth welded normals on curved forms; WebGPU-safe physical glass.
 */
import {
  AuraNodeBuilder,
  game,
  geometry,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraGroupNode,
  type AuraMaterialSpec,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  articulatedFolkSlots,
  assembleMultiMaterialNode,
  bezierCurve2,
  bevelBoxMesh,
  catmullRomSpline3,
  extrudePolygonMesh,
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import { NET_POST_H, NET_POST_X } from "../view/constants";
import { crowdSeats } from "../view/crowd";

// ---------------------------------------------------------------------------
// Championship Multi-Material Palette (`>= 8` physical `@aura3d/engine` presets)
// ---------------------------------------------------------------------------

export const TOUR_MATS = {
  powderSteel: material.brushedMetal({ color: "#28463e", roughness: 0.24, anisotropy: 0.64 }),
  trussSteel: material.brushedMetal({ color: "#526068", roughness: 0.26, anisotropy: 0.56 }),
  brass: material.studioMetal({ color: "#d4a84e", roughness: 0.18 }),
  chrome: material.studioMetal({ color: "#dce4ea", roughness: 0.14 }),
  teak: material.lacquer({ color: "#8f6138", roughness: 0.32, clearcoat: 0.76, clearcoatRoughness: 0.14 }),
  canopyCanvas: material.fabric({ color: "#f2ebd9", roughness: 0.74, sheen: 0.34, sheenColor: "#ffffff" }),
  cushionNavy: material.fabric({ color: "#19364a", roughness: 0.78, sheen: 0.44, sheenColor: "#356584" }),
  towelCream: material.fabric({ color: "#f6f2e4", roughness: 0.82, sheen: 0.42, sheenColor: "#ffffff" }),
  towelEmerald: material.fabric({ color: "#1e5643", roughness: 0.8, sheen: 0.42, sheenColor: "#428f73" }),
  coolerGloss: material.clearcoatPaint({ color: "#15384c", roughness: 0.22, clearcoat: 0.92, clearcoatRoughness: 0.08 }),
  gantryHousing: material.clearcoatPaint({ color: "#162630", roughness: 0.26, metalness: 0.24, clearcoat: 0.86 }),
  racketCarbon: material.clearcoatPaint({ color: "#1d2927", roughness: 0.22, metalness: 0.32, clearcoat: 0.94 }),
  treadRubber: material.blackRubber({ color: "#1d2326", roughness: 0.88 }),
  gripRubber: material.rubber({ color: "#f3efdf", roughness: 0.72 }),
  stoneLight: material.pbr({ color: "#d8d1c3", roughness: 0.78 }),
  stoneWarm: material.pbr({ color: "#c2b8a6", roughness: 0.82 }),
  terracotta: material.ceramic({ color: "#a85d3c", roughness: 0.56 }),
  foliage: material.pbr({ color: "#2d6140", roughness: 0.84 }),
  floodLed: material.emissive({ color: "#fff6dc", emissive: "#fff3cc", emissiveIntensity: 1.35, practical: true }),
  scoreAccentLed: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 0.85, practical: true }),
  tallyLed: material.emissive({ color: "#ff3b30", emissive: "#ff3b30", emissiveIntensity: 1.1, practical: true }),
  opticalGlass: material.physical({ color: "#cfeaf6", roughness: 0.05, opacity: 0.42, clearcoat: 1, ior: 1.5 })
} as const;

function ellipseRingXZ(cx: number, y: number, cz: number, rx: number, rz: number, segs = 16, frontPinch = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pinch = sa < 0 ? 1 + frontPinch * sa : 1;
    out.push([cx + ca * rx * pinch, y, cz + sa * rz]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Tournament Net Posts (`NET_POST_X = 5.94`, `NET_POST_H = 1.07`) & Strap
// ---------------------------------------------------------------------------

export function buildTournamentNetPostNode(side: -1 | 1): AuraNodeBuilder<AuraGroupNode> {
  // Compact 2-material batch (`powderSteel` + `brass`) halves net-post draw calls while preserving lathed/swept detail
  const steelParts: RawMesh[] = [
    latheMesh([
      [0.12, 0], [0.116, 0.024], [0.086, 0.048], [0.072, 0.09],
      [0.071, NET_POST_H - 0.075], [0.078, NET_POST_H - 0.045], [0.068, NET_POST_H - 0.015], [0.046, NET_POST_H], [0, NET_POST_H + 0.012]
    ], 18, false)
  ];
  const brassParts: RawMesh[] = [
    transformMesh(latheMesh([[0.012, -0.018], [0.034, -0.018], [0.026, 0], [0.034, 0.018], [0.012, 0.018]], 14, false), {
      pos: [-side * 0.045, NET_POST_H - 0.028, 0], rot: [Math.PI * 0.5, 0, 0]
    }),
    transformMesh(latheMesh([[0, -0.045], [0.052, -0.045], [0.044, -0.03], [0.044, 0.03], [0.052, 0.045], [0, 0.045]], 16, false), {
      pos: [side * 0.088, 0.68, 0], rot: [0, 0, Math.PI * 0.5]
    })
  ];
  if (side > 0) {
    brassParts.push(tubeSweepMesh([[0.132, 0.68, 0, 0.013], [0.155, 0.68, 0.02, 0.012], [0.158, 0.56, 0.095, 0.011], [0.215, 0.56, 0.095, 0.014]], 8, false));
    steelParts.push(transformMesh(latheMesh([[0, -0.032], [0.018, -0.028], [0.02, 0], [0.018, 0.028], [0, 0.032]], 10, false), {
      pos: [0.215, 0.56, 0.095], rot: [0, 0, Math.PI * 0.5]
    }));
  }
  const slots: MultiMatSlot[] = [
    { mesh: mergeRawMeshesToRaw(steelParts), materialIndex: 0 },
    { mesh: mergeRawMeshesToRaw(brassParts), materialIndex: 1 }
  ];
  return assembleMultiMaterialNode(side < 0 ? "net-post-left" : "net-post-right", slots, [TOUR_MATS.powderSteel, TOUR_MATS.brass], {
    position: [side * NET_POST_X, 0, 0],
    castShadow: true,
    receiveShadow: true
  });
}

export function buildCenterStrapAnchorNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [
    {
      mesh: mergeRawMeshesToRaw([
        latheMesh([[0.058, 0], [0.058, 0.012], [0.032, 0.024], [0, 0.026]], 14, false),
        tubeSweepMesh([[-0.024, 0.018, 0, 0.007], [0, 0.048, 0, 0.007], [0.024, 0.018, 0, 0.007]], 8, false),
        transformMesh(bevelBoxMesh(0.068, 0.048, 0.028, 0.006), { pos: [0, 0.24, 0] })
      ]),
      materialIndex: 0
    },
    { mesh: transformMesh(bevelBoxMesh(0.054, 0.905, 0.018, 0.004), { pos: [0, 0.468, 0] }), materialIndex: 1 }
  ];
  return assembleMultiMaterialNode("wt-center-strap-anchor", slots, [TOUR_MATS.brass, TOUR_MATS.canopyCanvas], {
    position: [0, 0, 0],
    castShadow: false,
    receiveShadow: true
  });
}

// ---------------------------------------------------------------------------
// 2. Sculpted Umpire High-Chair, Sun Canopy, Tablet Console & Articulated Official
// ---------------------------------------------------------------------------

export function buildUmpireHighChairNodes(): AuraSceneNode[] {
  // Compact 3-material batch (`powderSteel` frame/hardware, `teak` sculpted seat/back, `canopyCanvas` awning)
  const steelParts: RawMesh[] = [];
  const teakParts: RawMesh[] = [];
  for (const sz of [-1, 1] as const) {
    const zBase = sz * 0.44;
    const zTop = sz * 0.38;
    steelParts.push(
      tubeSweepMesh([[-0.38, 0, zBase, 0.03], [-0.35, 1.05, zTop, 0.028], [-0.34, 1.94, zTop, 0.027], [-0.34, 2.96, zTop * 1.12, 0.022]], 8, false),
      tubeSweepMesh([[0.42, 0, zBase, 0.03], [0.34, 0.96, zTop, 0.028], [0.28, 1.88, zTop, 0.026]], 8, false)
    );
    const railPts = catmullRomSpline3([[0.48, 0.52, zBase * 0.96], [0.39, 1.38, zTop * 0.98], [0.3, 2.22, zTop * 0.98], [-0.32, 2.24, zTop * 0.98]], 4);
    steelParts.push(tubeSweepMesh(railPts.map((p) => [p[0], p[1], p[2], 0.02]), 8, false));
    for (const ry of [0.46, 1.08, 1.78]) {
      steelParts.push(tubeSweepMesh([[-0.35, ry, zTop, 0.018], [0.33, ry, zTop, 0.018]], 6, false));
    }
  }
  for (const ry of [0.46, 1.12, 1.82, 2.38]) {
    steelParts.push(tubeSweepMesh([[-0.34, ry, -0.38, 0.018], [-0.34, ry, 0.38, 0.018]], 6, false));
  }
  for (let i = 0; i < 6; i += 1) {
    const ty = 0.28 + i * 0.27;
    const tx = 0.4 - i * 0.022;
    steelParts.push(transformMesh(bevelBoxMesh(0.14, 0.036, 0.76, 0.008), { pos: [tx, ty, 0] }));
  }
  steelParts.push(
    transformMesh(bevelBoxMesh(0.32, 0.042, 0.78, 0.01), { pos: [0.27, 1.54, 0] }),
    tubeSweepMesh([[0.22, 2.22, 0.37, 0.015], [0.34, 2.32, 0.32, 0.014], [0.36, 2.36, 0.22, 0.013]], 8, false),
    transformMesh(bevelBoxMesh(0.22, 0.024, 0.28, 0.006), { pos: [0.36, 2.38, 0.18], rot: [0, -0.28, -0.42] }),
    tubeSweepMesh([[0.24, 2.24, -0.36, 0.008], [0.34, 2.48, -0.28, 0.007], [0.28, 2.58, -0.14, 0.009]], 8, false)
  );

  const seatCurve = bezierCurve2([-0.32, 1.94], [-0.14, 1.89], [0.08, 1.9], [0.24, 1.93], 6);
  const seatSecs: V3[][] = [-0.35, 0, 0.35].map((z) => [
    ...seatCurve.map(([x, y]): V3 => [x, y + 0.032, z]),
    ...[...seatCurve].reverse().map(([x, y]): V3 => [x, y - 0.024, z])
  ]);
  const backCurve = bezierCurve2([-0.31, 1.98], [-0.35, 2.22], [-0.34, 2.44], [-0.29, 2.64], 6);
  const backSecs: V3[][] = [-0.34, 0, 0.34].map((z) => [
    ...backCurve.map(([x, y]): V3 => [x + 0.028, y, z]),
    ...[...backCurve].reverse().map(([x, y]): V3 => [x - 0.022, y, z])
  ]);
  teakParts.push(loftSectionsMesh(seatSecs, true, false), loftSectionsMesh(backSecs, true, false));

  const canopyArc = bezierCurve2([-0.62, 2.94], [-0.15, 3.09], [0.24, 3.07], [0.64, 2.91], 7);
  const canopySecs: V3[][] = [-0.64, -0.2, 0.2, 0.64].map((z) => {
    const droop = Math.abs(z) > 0.5 ? -0.025 : 0;
    return [
      ...canopyArc.map(([x, y]): V3 => [x, y + 0.02 + droop, z]),
      ...[...canopyArc].reverse().map(([x, y]): V3 => [x, y - 0.018 + droop, z])
    ];
  });

  const slots: MultiMatSlot[] = [
    { mesh: mergeRawMeshesToRaw(steelParts), materialIndex: 0 },
    { mesh: mergeRawMeshesToRaw(teakParts), materialIndex: 1 },
    { mesh: loftSectionsMesh(canopySecs, true, false), materialIndex: 2 }
  ];
  return [
    assembleMultiMaterialNode("wt-umpire-stand", slots, [TOUR_MATS.powderSteel, TOUR_MATS.teak, TOUR_MATS.canopyCanvas], {
      position: [-6.76, 0, 0],
      castShadow: true,
      receiveShadow: true
    }).toJSON()
  ];
}

function maxMeshY(mesh: RawMesh): number {
  let maxY = -Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) {
    if (mesh.positions[i]! > maxY) maxY = mesh.positions[i]!;
  }
  return maxY;
}

export function buildUmpireOfficialNodes(original: boolean): AuraSceneNode[] {
  // Articulated official upper body/collar/arms/hands (`articulatedFolkSlots`) + seated legs on high-chair footrest + smooth animated head
  const folkScale = 1.66 / 1.72;
  const folkUpperMeshes = articulatedFolkSlots({
    height: 1.66, coatMat: 0, trimMat: 1, skinMat: 2, hairHatMat: 3, trouserMat: 4, wearingHat: false, seed: 9
  })
    .filter((s) => s.materialIndex !== 4 && s.materialIndex !== 3 && maxMeshY(s.mesh) < 1.34 * folkScale)
    .map((s) => transformMesh(s.mesh, { pos: [0, -0.62 * folkScale, 0] }));
  for (const side of [-1, 1] as const) {
    folkUpperMeshes.push(
      tubeSweepMesh([
        [side * 0.095, 0.04, 0.02, 0.068],
        [side * 0.1, 0.02, 0.31, 0.058],
        [side * 0.1, -0.38, 0.34, 0.048]
      ], 8, true),
      transformMesh(bevelBoxMesh(0.09, 0.065, 0.19, 0.02), { pos: [side * 0.1, -0.41, 0.39] })
    );
  }
  const torsoSpec = mergeRawMeshes(folkUpperMeshes.map((m) => transformMesh(m, { rot: [0, Math.PI * 0.5, 0] })));

  const visorBrim: V2[] = [[-0.095, 0.01], [0.095, 0.01], [0.078, -0.095], [0, -0.112], [-0.078, -0.095]];
  const headSpec = mergeRawMeshes([
    transformMesh(icosphereSmoothMesh(0.118, 2, 0.015, 19), { scale: [1.02, 1.12, 0.96] }),
    latheMesh([[0.054, -0.145], [0.05, -0.08], [0, -0.075]], 10, false),
    transformMesh(extrudePolygonMesh(visorBrim, 0.016, 0.004, false), {
      pos: [0.078, 0.052, 0],
      rot: [Math.PI * 0.5, 0, -Math.PI * 0.5 - 0.12]
    })
  ]);
  const blazerMat = original
    ? material.pbr({ color: "#214b3e", roughness: 0.78 })
    : material.fabric({ color: "#1d463a", roughness: 0.8, sheen: 0.42, sheenColor: "#356c5a" });
  return [
    geometry.custom(torsoSpec, { name: "umpire-torso", material: blazerMat, castShadow: true })
      .position(-6.76, 1.96, 0).toJSON(),
    geometry.custom(headSpec, { name: "umpire-head", material: material.pbr({ color: "#c58e69", roughness: 0.72 }), castShadow: true })
      .position(-6.68, 2.62, 0).runtime(game.runtimeNode("umpire-head")).toJSON()
  ];
}

// ---------------------------------------------------------------------------
// 3. Batched Player Sideline Benches, Beverage Coolers & Towel / Racket Caddies
// ---------------------------------------------------------------------------

export function buildPlayerSidelineNodes(): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  // Compact 3-material batch per sideline (`powderSteel` frames/rackets, `teak` contoured bench, `towelCream` towels & cooler lid)
  const mats: AuraMaterialSpec[] = [TOUR_MATS.powderSteel, TOUR_MATS.teak, TOUR_MATS.towelCream];

  for (const sideZ of [-1, 1] as const) {
    const tag = sideZ < 0 ? "north" : "south";
    const bz = sideZ * 3.4;
    const cz = sideZ * 1.85;
    const rz = sideZ * 4.78;
    const steelParts: RawMesh[] = [];
    const teakParts: RawMesh[] = [];
    const fabricParts: RawMesh[] = [];

    for (const zOff of [-0.84, 0, 0.84]) {
      steelParts.push(tubeSweepMesh([
        [-7.62, 0, bz + zOff, 0.022], [-7.08, 0, bz + zOff, 0.022],
        [-7.1, 0.43, bz + zOff, 0.022], [-7.58, 0.42, bz + zOff, 0.022], [-7.62, 0.88, bz + zOff, 0.021]
      ], 6, false));
    }
    for (const zArm of [-0.84, 0.84]) {
      steelParts.push(tubeSweepMesh([[-7.6, 0.64, bz + zArm, 0.018], [-7.14, 0.63, bz + zArm, 0.018], [-7.12, 0.43, bz + zArm, 0.018]], 6, false));
    }

    const benchArc = bezierCurve2([-7.56, 0.45], [-7.38, 0.42], [-7.22, 0.43], [-7.08, 0.455], 5);
    const benchSecs: V3[][] = [-0.96, 0, 0.96].map((dz) => [
      ...benchArc.map(([x, y]): V3 => [x, y + 0.018, bz + dz]),
      ...[...benchArc].reverse().map(([x, y]): V3 => [x, y - 0.018, bz + dz])
    ]);
    teakParts.push(loftSectionsMesh(benchSecs, true, false));
    for (const sy of [0.63, 0.8]) {
      teakParts.push(transformMesh(bevelBoxMesh(0.042, 0.12, 1.94, 0.01), { pos: [-7.59, sy, bz], rot: [0, 0, 0.07] }));
    }

    // Insulated beverage cooler + cup sleeve + A-frame towel/racket caddy
    steelParts.push(
      transformMesh(bevelBoxMesh(0.46, 0.48, 0.62, 0.026), { pos: [-7.35, 0.28, cz] }),
      transformMesh(latheMesh([[0.036, 0], [0.038, 0.34], [0.042, 0.36], [0, 0.365]], 10, false), { pos: [-7.14, 0.22, cz + sideZ * 0.22] }),
      tubeSweepMesh([[-7.56, 0, rz - 0.28, 0.016], [-7.35, 0.86, rz - 0.28, 0.015], [-7.14, 0, rz - 0.28, 0.016]], 6, false),
      tubeSweepMesh([[-7.56, 0, rz + 0.28, 0.016], [-7.35, 0.86, rz + 0.28, 0.015], [-7.14, 0, rz + 0.28, 0.016]], 6, false),
      tubeSweepMesh([[-7.35, 0.85, rz - 0.3, 0.016], [-7.35, 0.85, rz + 0.3, 0.016]], 6, false)
    );
    fabricParts.push(transformMesh(bevelBoxMesh(0.49, 0.07, 0.65, 0.018), { pos: [-7.35, 0.545, cz] }));
    for (const zTowel of [rz - 0.11, rz + 0.11]) {
      const towelCurve = bezierCurve2([-7.43, 0.52], [-7.41, 0.87], [-7.29, 0.87], [-7.27, 0.49], 6);
      const tSecs: V3[][] = [-0.085, 0.085].map((w) => [
        ...towelCurve.map(([x, y]): V3 => [x + 0.009, y, zTowel + w]),
        ...[...towelCurve].reverse().map(([x, y]): V3 => [x - 0.009, y, zTowel + w])
      ]);
      fabricParts.push(loftSectionsMesh(tSecs, true, false));
    }
    const spareLoop = catmullRomSpline3([[0, -0.15, 0], [0.11, -0.05, 0], [0.12, 0.12, 0], [0, 0.21, 0], [-0.12, 0.12, 0], [-0.11, -0.05, 0]], 3, true)
      .map((p): V4 => [p[0], p[1], p[2], 0.014]);
    steelParts.push(transformMesh(tubeSweepMesh([...spareLoop, spareLoop[0]!], 6, false), { pos: [-7.44, 0.58, rz - sideZ * 0.24], rot: [0, Math.PI * 0.5, 0.2] }));

    const slots: MultiMatSlot[] = [
      { mesh: mergeRawMeshesToRaw(steelParts), materialIndex: 0 },
      { mesh: mergeRawMeshesToRaw(teakParts), materialIndex: 1 },
      { mesh: mergeRawMeshesToRaw(fabricParts), materialIndex: 2 }
    ];
    out.push(assembleMultiMaterialNode(`wt-sideline-kit-${tag}`, slots, mats, { castShadow: false, receiveShadow: true }).toJSON());
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Grand Slam Lattice Floodlight Towers (`targetHeight: 9.5`) & Scoreboard
// ---------------------------------------------------------------------------

export function buildFloodlightTowerNode(side: -1 | 1): AuraNodeBuilder<AuraGroupNode> {
  // Compact 2-material batch (`trussSteel` tower/catwalk/cowls + `floodLed` lenses) with exact `targetHeight: 9.5`
  const trussParts: RawMesh[] = [
    transformMesh(bevelBoxMesh(1.18, 0.56, 1.18, 0.05), { pos: [0, 0.28, 0] }),
    latheMesh([[0.52, 0.56], [0.46, 0.72], [0.38, 0.76]], 14, false),
    transformMesh(latticeTrussMesh({ span: [0.68, 7.65, 0.68], bays: 9, chordRadius: 0.032, braceRadius: 0.018 }), { pos: [0, 4.58, 0] }),
    transformMesh(bevelBoxMesh(1.92, 0.08, 1.16, 0.015), { pos: [0, 8.22, 0.08] }),
    tubeSweepMesh([[-0.92, 8.26, -0.46, 0.018], [-0.92, 8.72, -0.46, 0.018], [0.92, 8.72, -0.46, 0.018], [0.92, 8.26, -0.46, 0.018]], 6, false),
    transformMesh(latticeTrussMesh({ span: [2.48, 0.88, 0.42], bays: 4, chordRadius: 0.026, braceRadius: 0.015 }), { pos: [0, 9.02, 0.06], rot: [0.26, 0, 0] })
  ];
  const ledParts: RawMesh[] = [];
  const cowl = latheMesh([[0.05, 0], [0.19, 0.08], [0.22, 0.19], [0.21, 0.21]], 12, false);
  const lens = latheMesh([[0, 0.17], [0.185, 0.17], [0.19, 0.195], [0, 0.195]], 12, false);
  for (const rowY of [8.78, 9.26]) {
    for (const colX of [-0.88, -0.29, 0.29, 0.88]) {
      const zOff = rowY > 9 ? 0.14 : 0.24;
      trussParts.push(transformMesh(cowl, { pos: [colX, rowY, zOff], rot: [Math.PI * 0.5 + 0.28, 0, 0] }));
      ledParts.push(transformMesh(lens, { pos: [colX, rowY, zOff], rot: [Math.PI * 0.5 + 0.28, 0, 0] }));
    }
  }

  const slots: MultiMatSlot[] = [
    { mesh: mergeRawMeshesToRaw(trussParts), materialIndex: 0 },
    { mesh: mergeRawMeshesToRaw(ledParts), materialIndex: 1 }
  ];
  const builder = assembleMultiMaterialNode(`stadium-floodlight-${side < 0 ? "left" : "right"}`, slots, [TOUR_MATS.trussSteel, TOUR_MATS.floodLed], {
    position: [side * 12.5, 0, -13.2],
    rotation: [0, side * -0.2, 0],
    castShadow: false,
    receiveShadow: false
  });
  const Ctor = builder.constructor as typeof AuraNodeBuilder<AuraGroupNode>;
  return new Ctor({ ...builder.toJSON(), targetHeight: 9.5 } as AuraGroupNode);
}

export function buildScoreboardGantryNode(position: V3): AuraNodeBuilder<AuraGroupNode> {
  // Compact 3-material batch (`trussSteel`, `gantryHousing`, `scoreAccentLed`)
  const trussParts: RawMesh[] = [
    transformMesh(latticeTrussMesh({ span: [0.34, 2.52, 0.36], bays: 5, chordRadius: 0.02, braceRadius: 0.012 }), { pos: [-2.62, -1.14, -0.18] }),
    transformMesh(latticeTrussMesh({ span: [0.34, 2.52, 0.36], bays: 5, chordRadius: 0.02, braceRadius: 0.012 }), { pos: [2.62, -1.14, -0.18] }),
    transformMesh(latticeTrussMesh({ span: [6.4, 0.36, 0.38], bays: 8, chordRadius: 0.02, braceRadius: 0.012 }), { pos: [0, 1.08, -0.16] })
  ];
  const cheekPoly: V2[] = [[-0.22, -0.92], [0.22, -0.82], [0.26, 0.82], [-0.22, 0.92]];
  const housingParts: RawMesh[] = [
    bevelBoxMesh(6.24, 1.86, 0.38, 0.045),
    transformMesh(extrudePolygonMesh(cheekPoly, 0.14, 0.02, false), { pos: [-3.18, 0, 0.02], rot: [0, Math.PI * 0.5, 0] }),
    transformMesh(extrudePolygonMesh(cheekPoly, 0.14, 0.02, false), { pos: [3.18, 0, 0.02], rot: [0, Math.PI * 0.5, 0] }),
    transformMesh(latheMesh([[0, -0.08], [0.44, -0.08], [0.46, 0.05], [0.4, 0.08], [0, 0.08]], 18, false), { pos: [0, 1.38, 0.04], rot: [Math.PI * 0.5, 0, 0] })
  ];
  const ledParts: RawMesh[] = [
    transformMesh(bevelBoxMesh(5.86, 0.065, 0.05, 0.01), { pos: [0, 0.82, 0.2] }),
    transformMesh(bevelBoxMesh(5.86, 0.05, 0.05, 0.01), { pos: [0, -0.82, 0.2] })
  ];
  const slots: MultiMatSlot[] = [
    { mesh: mergeRawMeshesToRaw(trussParts), materialIndex: 0 },
    { mesh: mergeRawMeshesToRaw(housingParts), materialIndex: 1 },
    { mesh: mergeRawMeshesToRaw(ledParts), materialIndex: 2 }
  ];
  return assembleMultiMaterialNode("stadium-scoreboard-gantry", slots, [TOUR_MATS.trussSteel, TOUR_MATS.gantryHousing, TOUR_MATS.scoreAccentLed], {
    id: "stadium-scoreboard-gantry",
    position,
    castShadow: false,
    receiveShadow: true
  });
}

// ---------------------------------------------------------------------------
// 5. Batched Grand Slam Bowl, Instanced Seats & Colonnade Pillars (`>= 60 FPS`)
// ---------------------------------------------------------------------------

export function buildStadiumBowlNodes(): AuraSceneNode[] {
  // Compact 3-material static bowl (`stoneLight` arcade, `trussSteel` cantilever roof/tripods, `foliage` courtside boxwoods)
  const stoneParts: RawMesh[] = [transformMesh(bevelBoxMesh(24.4, 0.44, 1.15, 0.05), { pos: [0, 4.18, -18.9] })];
  for (const archX of [-9.2, -4.6, 0, 4.6, 9.2]) {
    for (const s of archwayVoussoirSlots({ radius: 1.48, thickness: 0.36, depth: 0.68, voussoirs: 9, stoneMatA: 0, stoneMatB: 0, keystoneMat: 0 })) {
      stoneParts.push(transformMesh(s.mesh, { pos: [archX, 2.15, -18.9] }));
    }
  }
  const steelParts: RawMesh[] = [
    transformMesh(latticeTrussMesh({ span: [24.6, 0.58, 2.8], bays: 12, chordRadius: 0.036, braceRadius: 0.02 }), { pos: [0, 4.78, -18.1], rot: [0.08, 0, 0] }),
    transformMesh(bevelBoxMesh(25.0, 0.14, 3.2, 0.03), { pos: [0, 5.14, -18.0], rot: [0.08, 0, 0] })
  ];
  const foliageParts: RawMesh[] = [];
  const opticalGlasses: RawMesh[] = [
    transformMesh(bevelBoxMesh(0.19, 0.008, 0.24, 0.002), { pos: [-6.394, 2.392, 0.18], rot: [0, -0.28, -0.42] })
  ];

  for (const sx of [-1, 1] as const) {
    const cx = sx * 10.55;
    const cz = 4.4;
    const yaw = sx * 0.42;
    for (const [lx, lz] of [[-0.36, -0.32], [0.36, -0.32], [0, 0.4]] as const) {
      steelParts.push(tubeSweepMesh([[cx + lx, 0, cz + lz, 0.024], [cx, 1.42, cz, 0.02]], 6, false));
    }
    steelParts.push(
      transformMesh(bevelBoxMesh(0.36, 0.28, 0.64, 0.02), { pos: [cx, 1.62, cz], rot: [-0.08, yaw, 0] }),
      transformMesh(latheMesh([[0.09, -0.22], [0.115, 0.18], [0.135, 0.34], [0.125, 0.36]], 14, false), {
        pos: [cx - Math.sin(yaw) * 0.42, 1.64, cz - Math.cos(yaw) * 0.42], rot: [-Math.PI * 0.5 - 0.08, yaw, 0]
      })
    );
    opticalGlasses.push(
      transformMesh(latheMesh([[0, 0], [0.118, 0], [0.118, 0.018], [0, 0.018]], 14, false), {
        pos: [cx - Math.sin(yaw) * 0.74, 1.66, cz - Math.cos(yaw) * 0.74], rot: [-Math.PI * 0.5 - 0.08, yaw, 0]
      })
    );
  }
  for (const [idx, px] of [-8.2, 8.2].entries()) {
    stoneParts.push(transformMesh(latheMesh([[0.28, 0], [0.38, 0.52], [0.42, 0.58], [0.36, 0.62], [0, 0.62]], 14, false), { pos: [px, 0, -11.35] }));
    foliageParts.push(transformMesh(layeredCanopyMesh({ radius: 0.48, height: 0.72, puffs: 8, seed: 31 + idx * 17 }), { pos: [px, 0.54, -11.35] }));
  }

  // Instanced colonnade columns (6 fluted classical travertine piers -> 1 GPU draw)
  const pillarSpec = mergeRawMeshes([
    latheMesh([
      [0.44, 0], [0.44, 0.24], [0.36, 0.34], [0.34, 1.95], [0.31, 3.58], [0.39, 3.74], [0.46, 3.9], [0, 3.92]
    ], 14, false)
  ]);
  const pillarTransforms = [-11.3, -6.9, -2.3, 2.3, 6.9, 11.3].map((pierX) => ({
    position: [pierX, 0, -18.9] as [number, number, number]
  }));

  // Instanced ergonomic stadium bucket seats under all 240 spectators (240 seats -> 1 GPU draw)
  const bucketCurve = bezierCurve2([0, 0.34], [0.02, 0.05], [0.16, 0.02], [0.3, 0.045], 4);
  const bucketSecs: V3[][] = [-0.21, 0.21].map((x) => [
    ...bucketCurve.map(([z, y]): V3 => [x, y + 0.018, z - 0.14]),
    ...[...bucketCurve].reverse().map(([z, y]): V3 => [x, y - 0.014, z - 0.14])
  ]);
  const seatSpec = mergeRawMeshes([loftSectionsMesh(bucketSecs, true, false)]);
  const seatTransforms = crowdSeats().map((seat) => ({
    position: [seat.position[0], seat.position[1], seat.position[2]] as [number, number, number],
    rotation: [0, seat.yaw, 0] as [number, number, number]
  }));

  const bowlSlots: MultiMatSlot[] = [
    { mesh: mergeRawMeshesToRaw(stoneParts), materialIndex: 0 },
    { mesh: mergeRawMeshesToRaw(steelParts), materialIndex: 1 },
    { mesh: mergeRawMeshesToRaw(foliageParts), materialIndex: 2 }
  ];
  return [
    assembleMultiMaterialNode("wt-stadium-bowl", bowlSlots, [TOUR_MATS.stoneLight, TOUR_MATS.trussSteel, TOUR_MATS.foliage], {
      castShadow: false,
      receiveShadow: true
    }).toJSON(),
    instances.custom(pillarSpec, {
      name: "wt-stadium-pillars",
      material: TOUR_MATS.stoneWarm,
      transforms: pillarTransforms,
      castShadow: false
    }).toJSON(),
    instances.custom(seatSpec, {
      name: "wt-stadium-seats",
      material: TOUR_MATS.cushionNavy,
      transforms: seatTransforms,
      castShadow: false
    }).toJSON(),
    geometry.custom(mergeRawMeshes(opticalGlasses), {
      name: "wt-camera-lens-glass",
      material: TOUR_MATS.opticalGlass,
      castShadow: false,
      receiveShadow: false
    }).toJSON()
  ];
}

// ---------------------------------------------------------------------------
// 6. Articulated Seated Spectator (`?look=original` 24-seat instanced figure)
// ---------------------------------------------------------------------------

let cachedSpectatorSpec: AuraCustomGeometrySpec | null = null;

export function buildSeatedSpectatorSpec(): AuraCustomGeometrySpec {
  if (cachedSpectatorSpec) return cachedSpectatorSpec;
  const folkScale = 1.54 / 1.72;
  const folkParts = articulatedFolkSlots({
    height: 1.54, coatMat: 0, trimMat: 1, skinMat: 2, hairHatMat: 3, trouserMat: 4, wearingHat: true, seed: 13
  })
    .filter((s) => s.materialIndex !== 4)
    .map((s) => transformMesh(s.mesh, { pos: [0, -0.88 * folkScale, 0] }));
  for (const side of [-1, 1] as const) {
    folkParts.push(
      tubeSweepMesh([
        [side * 0.088, -0.24, 0.02, 0.062],
        [side * 0.092, -0.25, 0.28, 0.054],
        [side * 0.092, -0.58, 0.32, 0.044]
      ], 6, true)
    );
  }
  cachedSpectatorSpec = mergeRawMeshes(folkParts);
  return cachedSpectatorSpec;
}

// ---------------------------------------------------------------------------
// 7. Sculpted 28-Node Athlete Rig & Carbon-Graphite Racket Geometry Specs
// ---------------------------------------------------------------------------

function buildRacketHoopMesh(): RawMesh {
  // Elliptical tour hoop in local XZ (`applyAthleteLimbs` applies `Rx(+PI/2)`, mapping local XZ into the racket face plane!)
  const rx = 0.156;
  const rz = 0.202;
  const ovalCtrl: V3[] = [];
  const loopPts = 16;
  for (let i = 0; i < loopPts; i += 1) {
    const a = (i / loopPts) * Math.PI * 2;
    ovalCtrl.push([Math.cos(a) * rx, 0, Math.sin(a) * rz]);
  }
  const spline = catmullRomSpline3(ovalCtrl, 3, true);
  const spine: V4[] = [...spline, spline[0]!].map((p) => {
    // Slightly thicker aero bumper guard at the tip (`z < -0.1`)
    const rad = p[2] < -0.1 ? 0.0165 : 0.0145;
    return [p[0], p[1], p[2], rad];
  });
  // Sculpted V-yoke throat bridge at `+Z` (toward handle) + top grommet strip
  const bridge = tubeSweepMesh([[-0.092, 0, 0.176, 0.011], [0, 0, 0.168, 0.012], [0.092, 0, 0.176, 0.011]], 8, false);
  return mergeRawMeshesToRaw([tubeSweepMesh(spine, 10, false), bridge]);
}

function buildWovenRacketStringsMesh(): RawMesh {
  // Open cross-hatched tour string bed in local XZ (`scale = [0.9, 0.6, 1.14]` -> matches inner carbon hoop!)
  const rx = 0.148;
  const rz = 0.156;
  const filaments: RawMesh[] = [];
  const strRad = 0.0022;
  // 11 vertical main strings (along Z)
  for (let i = -5; i <= 5; i += 1) {
    const x = (i / 5.6) * rx;
    const zSpan = rz * Math.sqrt(Math.max(0.02, 1 - (x / rx) ** 2)) * 0.985;
    filaments.push(tubeSweepMesh([[x, 0.001, -zSpan, strRad], [x, -0.001, 0, strRad], [x, 0.001, zSpan, strRad]], 4, false));
  }
  // 13 horizontal cross strings (along X)
  for (let j = -6; j <= 6; j += 1) {
    const z = (j / 6.6) * rz;
    const xSpan = rx * Math.sqrt(Math.max(0.02, 1 - (z / rz) ** 2)) * 0.985;
    filaments.push(tubeSweepMesh([[-xSpan, -0.001, z, strRad], [0, 0.001, z, strRad], [xSpan, -0.001, z, strRad]], 4, false));
  }
  return mergeRawMeshesToRaw(filaments);
}

export interface AthleteRigGeometrySpecs {
  readonly torso: AuraCustomGeometrySpec;
  readonly collar: AuraCustomGeometrySpec;
  readonly hips: AuraCustomGeometrySpec;
  readonly head: AuraCustomGeometrySpec;
  readonly hair: AuraCustomGeometrySpec;
  readonly visor: AuraCustomGeometrySpec;
  readonly apolloHelmet: AuraCustomGeometrySpec;
  readonly apolloPack: AuraCustomGeometrySpec;
  readonly upperLeg: AuraCustomGeometrySpec;
  readonly lowerLeg: AuraCustomGeometrySpec;
  readonly knee: AuraCustomGeometrySpec;
  readonly shoe: AuraCustomGeometrySpec;
  readonly upperArm: AuraCustomGeometrySpec;
  readonly lowerArm: AuraCustomGeometrySpec;
  readonly hand: AuraCustomGeometrySpec;
  readonly racketHandle: AuraCustomGeometrySpec;
  readonly racketThroat: AuraCustomGeometrySpec;
  readonly racketHoop: AuraCustomGeometrySpec;
  readonly racketStrings: AuraCustomGeometrySpec;
}

let cachedRigSpecs: AthleteRigGeometrySpecs | null = null;

export function getAthleteRigSpecs(): AthleteRigGeometrySpecs {
  if (cachedRigSpecs) return cachedRigSpecs;

  // Athletic V-taper polo/tank torso (`-Z` forward chest, `+Z` shoulder blades)
  const torso = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.34, 0, 0.158, 0.112, 16),
      ellipseRingXZ(0, -0.15, 0, 0.144, 0.102, 16),
      ellipseRingXZ(0, 0.09, -0.01, 0.188, 0.132, 16, -0.06),
      ellipseRingXZ(0, 0.25, -0.004, 0.206, 0.126, 16),
      ellipseRingXZ(0, 0.345, 0, 0.088, 0.08, 16)
    ], true, true)
  ]);

  // Folded championship polo collar + V-placket front trim
  const collar = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.038, 0, 0.132, 0.114, 14, 0.16),
      ellipseRingXZ(0, 0.012, 0.004, 0.152, 0.128, 14, 0.2),
      ellipseRingXZ(0, 0.042, 0.008, 0.136, 0.114, 14, 0.26)
    ], true, false),
    transformMesh(bevelBoxMesh(0.052, 0.12, 0.018, 0.004), { pos: [0, -0.075, -0.122], rot: [0.16, 0, 0] })
  ]);

  // Tailored tennis shorts / pleated athletic hem with waistband
  const hips = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.13, 0, 0.182, 0.13, 16),
      ellipseRingXZ(0, -0.02, 0, 0.172, 0.122, 16),
      ellipseRingXZ(0, 0.08, 0, 0.16, 0.112, 16),
      ellipseRingXZ(0, 0.12, 0, 0.164, 0.115, 16)
    ], true, true)
  ]);

  // Smooth icosphere cranium + sculpted jawline, neck & subtle nose/ears (`-Z` forward)
  const head = mergeRawMeshes([
    transformMesh(icosphereSmoothMesh(0.126, 2, 0.015, 3), { pos: [0, 0.012, 0.004], scale: [0.96, 1.09, 1.03] }),
    latheMesh([[0.068, -0.155], [0.064, -0.095], [0.082, -0.05], [0, -0.04]], 14, false),
    transformMesh(icosphereSmoothMesh(0.022, 1, 0.01, 5), { pos: [0, -0.005, -0.126], scale: [0.78, 1.12, 1.15] }),
    transformMesh(icosphereSmoothMesh(0.024, 1, 0.01, 7), { pos: [-0.12, 0.002, 0.008], scale: [0.48, 1.05, 0.78] }),
    transformMesh(icosphereSmoothMesh(0.024, 1, 0.01, 9), { pos: [0.12, 0.002, 0.008], scale: [0.48, 1.05, 0.78] })
  ]);

  // Coiffed athletic hair crown & tapered nape (`icosphereSmoothMesh` + swept crown volume)
  const hair = mergeRawMeshes([
    transformMesh(icosphereSmoothMesh(0.132, 2, 0.025, 11), { pos: [0, 0.032, 0.016], scale: [0.99, 0.94, 1.04] }),
    loftSectionsMesh([
      ellipseRingXZ(0, -0.065, 0.032, 0.124, 0.112, 14, 0.34),
      ellipseRingXZ(0, 0.035, 0.016, 0.142, 0.14, 14, 0.14),
      ellipseRingXZ(0, 0.135, 0.008, 0.086, 0.094, 14)
    ], true, true)
  ]);

  // Curved aerodynamic sun visor (`-Z` cambered bill + wraparound elastic sweatband)
  const brimArc = bezierCurve2([-0.124, 0.018], [-0.072, -0.105], [0.072, -0.105], [0.124, 0.018], 8);
  const brimSecs: V3[][] = [-0.012, 0, 0.012].map((t) => {
    const scale = 1 - Math.abs(t) * 1.4;
    const upper = brimArc.map(([x, z]): V3 => [x * scale, 0.008 - (0.124 - Math.abs(x)) * 0.12 + z * 0.08 + t * 0.25, z * scale]);
    const lower = [...brimArc].reverse().map(([x, z]): V3 => [x * scale, -0.008 - (0.124 - Math.abs(x)) * 0.12 + z * 0.08 + t * 0.25, z * scale]);
    return [...upper, ...lower];
  });
  const visor = mergeRawMeshes([
    loftSectionsMesh(brimSecs, true, false),
    tubeSweepMesh([
      [-0.118, 0.01, 0.015, 0.016], [-0.134, 0.014, 0.11, 0.015],
      [0, 0.016, 0.215, 0.015], [0.134, 0.014, 0.11, 0.015], [0.118, 0.01, 0.015, 0.016]
    ], 10, false)
  ]);

  const apolloHelmet = mergeRawMeshes([
    transformMesh(icosphereSmoothMesh(0.186, 2, 0.008, 15), { pos: [0, 0.01, 0], scale: [0.98, 1.04, 1.0] }),
    latheMesh([[0.155, -0.18], [0.178, -0.14], [0.168, -0.1], [0, -0.1]], 18, false)
  ]);
  const apolloPack = mergeRawMeshes([
    bevelBoxMesh(0.28, 0.38, 0.14, 0.024),
    transformMesh(latheMesh([[0, -0.17], [0.052, -0.16], [0.052, 0.16], [0, 0.17]], 12, false), { pos: [-0.075, 0, 0.055] }),
    transformMesh(latheMesh([[0, -0.17], [0.052, -0.16], [0.052, 0.16], [0, 0.17]], 12, false), { pos: [0.075, 0, 0.055] })
  ]);

  // Unit-length anatomical limb meshes (`y in [-0.5, +0.5]`, unit diameter ~1.0 for `orientCylinderBetween`)
  const upperLeg = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.56, -0.47], [0.59, -0.18], [0.52, -0.11], [0.5, 0.14], [0.42, 0.47], [0, 0.5]], 16, false)
  ]);
  const lowerLeg = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.45, -0.47], [0.55, -0.16], [0.45, 0.14], [0.36, 0.25], [0.41, 0.28], [0.4, 0.47], [0, 0.5]], 16, false)
  ]);
  const knee = mergeRawMeshes([
    transformMesh(icosphereSmoothMesh(0.064, 2, 0.012, 21), { scale: [0.96, 1.06, 1.02] })
  ]);

  // Tour court sneaker (`-Z` toe box, `+Z` heel counter, flared lateral midsole & ankle collar)
  const shoe = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.046, -0.024, 0.072, 0.148, 16, -0.08),
      ellipseRingXZ(0, -0.018, -0.022, 0.074, 0.15, 16, -0.08),
      ellipseRingXZ(0, 0.016, -0.004, 0.062, 0.128, 16, -0.12),
      ellipseRingXZ(0, 0.046, 0.044, 0.05, 0.068, 16)
    ], true, true),
    transformMesh(bevelBoxMesh(0.068, 0.028, 0.075, 0.01), { pos: [0, 0.032, -0.035], rot: [0.34, 0, 0] })
  ]);

  const upperArm = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.56, -0.44], [0.58, -0.1], [0.47, -0.04], [0.46, 0.22], [0.4, 0.47], [0, 0.5]], 14, false)
  ]);
  const lowerArm = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.48, -0.46], [0.53, -0.18], [0.4, 0.24], [0.46, 0.28], [0.46, 0.44], [0.37, 0.48], [0, 0.5]], 14, false)
  ]);
  const hand = mergeRawMeshes([
    transformMesh(icosphereSmoothMesh(0.048, 2, 0.012, 23), { scale: [0.96, 1.12, 0.86] }),
    tubeSweepMesh([[0.028, -0.01, -0.01, 0.015], [0.052, 0.015, -0.022, 0.012]], 6, true)
  ]);

  const racketHandle = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.66, -0.48], [0.53, -0.4], [0.5, 0.36], [0.44, 0.48], [0, 0.5]], 8, false)
  ]);
  const racketThroat = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.5, 0, 0.46, 0.66, 10),
      ellipseRingXZ(0, 0, 0, 0.43, 0.68, 10),
      ellipseRingXZ(0, 0.5, 0, 0.4, 0.62, 10)
    ], true, true)
  ]);
  const racketHoop = mergeRawMeshes([buildRacketHoopMesh()]);
  const racketStrings = mergeRawMeshes([buildWovenRacketStringsMesh()]);

  cachedRigSpecs = {
    torso, collar, hips, head, hair, visor, apolloHelmet, apolloPack,
    upperLeg, lowerLeg, knee, shoe, upperArm, lowerArm, hand,
    racketHandle, racketThroat, racketHoop, racketStrings
  };
  return cachedRigSpecs;
}
