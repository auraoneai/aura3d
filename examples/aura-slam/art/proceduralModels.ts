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
  type AuraMaterialSpec,
  type AuraSceneNode
} from "@aura3d/engine";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }>;
import {
  archwayVoussoirSlots,
  articulatedFolkSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bezierCurve2,
  bevelBoxMesh,
  catmullRomSpline3,
  extrudePolygonMesh,
  icosphereSmoothMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  mergeRawMeshesToRaw,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptHumanoidLimbMesh,
  sculptOrganicSdfMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  smaxPoly,
  sminPoly,
  subdivideSmoothMesh,
  taubinSmoothMesh,
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

const sdfCapsule = (p: V3, a: V3, b: V3, r: number): number => sdfTaperedCapsule(p, a, b, r, r);
const sdfSmoothUnion = sminPoly;
const sdfSmoothSubtract = (a: number, b: number, k: number): number => smaxPoly(a, -b, k);

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
  teakParts.push(
    subdivideSmoothMesh(loftSectionsMesh(seatSecs, true, false), 1, 0.45),
    subdivideSmoothMesh(loftSectionsMesh(backSecs, true, false), 1, 0.45)
  );

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
    { mesh: subdivideSmoothMesh(loftSectionsMesh(canopySecs, true, false), 1, 0.42), materialIndex: 2 }
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
      sculptHumanoidLimbMesh([
        [side * 0.095, 0.04, 0.02, 0.068],
        [side * 0.1, 0.02, 0.31, 0.058],
        [side * 0.1, -0.38, 0.34, 0.048]
      ], 10, 0.1),
      transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.09, 0.065, 0.19, 0.02), 1, 0.45), { pos: [side * 0.1, -0.41, 0.39] })
    );
  }
  const torsoSpec = memoizeGeometry("slam:umpire-torso", () =>
    mergeRawMeshes([bakeMeshCavityAO(mergeRawMeshesToRaw(folkUpperMeshes.map((m) => transformMesh(m, { rot: [0, Math.PI * 0.5, 0] }))), 0.32)])
  );

  const visorBrim: V2[] = [[-0.095, 0.01], [0.095, 0.01], [0.078, -0.095], [0, -0.112], [-0.078, -0.095]];
  const headSpec = memoizeGeometry("slam:umpire-head:v3", () => {
    const sdfHead = transformMesh(
      sculptOrganicSdfMesh({
        boundsMin: [-0.15, -0.17, -0.16],
        boundsMax: [0.15, 0.16, 0.16],
        resolution: [20, 22, 22],
        taubinIterations: 7,
        projectToIso: 0.94,
        evaluate: (x, y, z) => {
          const p: V3 = [x, y, z];
          const cranium = sdfEllipsoid(p, [0, 0.022, -0.004], [0.106, 0.114, 0.112]);
          const jaw = sdfEllipsoid(p, [0, -0.044, 0.024], [0.084, 0.072, 0.084]);
          const chin = sdfEllipsoid(p, [0, -0.074, 0.066], [0.040, 0.028, 0.036]);
          const nose = sdfCapsule(p, [0, 0.024, 0.096], [0, -0.012, 0.122], 0.014);
          const neck = sdfCapsule(p, [0, -0.145, -0.006], [0, -0.020, 0], 0.052);
          const earL = sdfEllipsoid(p, [-0.106, 0.006, -0.006], [0.015, 0.028, 0.019]);
          const earR = sdfEllipsoid(p, [0.106, 0.006, -0.006], [0.015, 0.028, 0.019]);
          let d = sdfSmoothUnion(cranium, jaw, 0.034);
          d = sdfSmoothUnion(d, chin, 0.024);
          d = sdfSmoothUnion(d, nose, 0.016);
          d = sdfSmoothUnion(d, neck, 0.028);
          d = sdfSmoothUnion(d, earL, 0.014);
          d = sdfSmoothUnion(d, earR, 0.014);
          return d;
        }
      }),
      { rot: [0, Math.PI * 0.5, 0] }
    );
    const visor = transformMesh(taubinSmoothMesh(subdivideSmoothMesh(extrudePolygonMesh(visorBrim, 0.016, 0.004, false), 1, 0.38), 2), {
      pos: [0.078, 0.052, 0],
      rot: [Math.PI * 0.5, 0, -Math.PI * 0.5 - 0.12]
    });
    return mergeRawMeshes([bakeMeshCavityAO(sdfHead, 0.22), bakeMeshCavityAO(visor, 0.24)]);
  });
  const blazerMat = original
    ? material.pbr({ color: "#214b3e", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10 })
    : material.fabric({ color: "#1d463a", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.10, sheen: 0.38, sheenColor: "#356c5a" });
  return [
    geometry.custom(torsoSpec, { name: "umpire-torso", material: blazerMat, castShadow: false })
      .position(-6.76, 1.96, 0).toJSON(),
    geometry.custom(headSpec, { name: "umpire-head", material: material.pbr({ color: "#c58e69", roughness: 0.58, clearcoat: 0, envMapIntensity: 0.09 }), castShadow: false })
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
  const pillarSpec = memoizeGeometry("slam:bowl-pillar", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        latheMesh([
          [0.44, 0], [0.44, 0.24], [0.36, 0.34], [0.34, 1.95], [0.31, 3.58], [0.39, 3.74], [0.46, 3.9], [0, 3.92]
        ], 16, false),
        0.28
      )
    ])
  );
  const pillarTransforms = [-11.3, -6.9, -2.3, 2.3, 6.9, 11.3].map((pierX) => ({
    position: [pierX, 0, -18.9] as [number, number, number]
  }));

  // Instanced ergonomic stadium bucket seats under all 240 spectators (240 seats -> 1 GPU draw)
  const bucketCurve = bezierCurve2([0, 0.34], [0.02, 0.05], [0.16, 0.02], [0.3, 0.045], 5);
  const bucketSecs: V3[][] = [-0.21, 0, 0.21].map((x) => {
    const lip = Math.abs(x) > 0.15 ? 0.012 : 0;
    return [
      ...bucketCurve.map(([z, y]): V3 => [x, y + 0.018 + lip, z - 0.14]),
      ...[...bucketCurve].reverse().map(([z, y]): V3 => [x, y - 0.014 + lip, z - 0.14])
    ];
  });
  const seatSpec = memoizeGeometry("slam:bowl-seat", () =>
    mergeRawMeshes([bakeMeshCavityAO(subdivideSmoothMesh(loftSectionsMesh(bucketSecs, true, false), 1, 0.42), 0.3)])
  );
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
    .map((s) => taubinSmoothMesh(transformMesh(s.mesh, { pos: [0, -0.88 * folkScale, 0] }), 2));
  for (const side of [-1, 1] as const) {
    folkParts.push(
      taubinSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [side * 0.088, -0.24, 0.02], rx: 0.062, rz: 0.064 },
            { pos: [side * 0.092, -0.25, 0.28], rx: 0.054, rz: 0.056 },
            { pos: [side * 0.092, -0.58, 0.32], rx: 0.044, rz: 0.046 }
          ],
          { ringPoints: 10, capEnds: true }
        ),
        2
      )
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
  const rx = 0.158;
  const rz = 0.204;
  const ovalCtrl: V3[] = [];
  const loopPts = 20;
  for (let i = 0; i < loopPts; i += 1) {
    const a = (i / loopPts) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // Isometric tour head taper: slightly wider upper sweet-spot (`z < 0`) and clean throat shoulders (`z > 0`)
    const sweet = sa < 0 ? 1 + 0.045 * (-sa) : 1 - 0.03 * sa;
    ovalCtrl.push([ca * rx * sweet, 0, sa * rz]);
  }
  const spline = catmullRomSpline3(ovalCtrl, 3, true);
  const spine: V4[] = [...spline, spline[0]!].map((p) => {
    // Sculpted aero bumper guard at the tip (`z < -0.11`) and box-beam frame rails
    const rad = p[2] < -0.11 ? 0.0172 : 0.0146;
    return [p[0], p[1], p[2], rad];
  });
  // Sculpted V-yoke throat bridge + grommet collar at `+Z` (toward twin throat shafts)
  const bridge = tubeSweepMesh(
    [[-0.096, 0, 0.174, 0.0115], [-0.045, 0, 0.168, 0.012], [0, 0, 0.166, 0.0125], [0.045, 0, 0.168, 0.012], [0.096, 0, 0.174, 0.0115]],
    10,
    false
  );
  const bumper = tubeSweepMesh(
    catmullRomSpline3([[-0.11, 0, -0.155], [-0.06, 0, -0.195], [0, 0, -0.208], [0.06, 0, -0.195], [0.11, 0, -0.155]], 3)
      .map((p): V4 => [p[0], p[1], p[2], 0.0182]),
    10,
    false
  );
  return bakeMeshCavityAO(mergeRawMeshesToRaw([tubeSweepMesh(spine, 12, false), bridge, bumper]), 0.25);
}

function buildWovenRacketStringsMesh(): RawMesh {
  // Open cross-hatched tour string bed in local XZ (`scale = [0.9, 0.6, 1.14]` -> matches inner carbon hoop!)
  const rx = 0.148;
  const rz = 0.156;
  const filaments: RawMesh[] = [];
  const strRad = 0.0022;
  // 13 vertical main strings (along Z)
  for (let i = -6; i <= 6; i += 1) {
    const x = (i / 6.6) * rx;
    const zSpan = rz * Math.sqrt(Math.max(0.02, 1 - (x / rx) ** 2)) * 0.985;
    filaments.push(tubeSweepMesh([[x, 0.001, -zSpan, strRad], [x, -0.001, 0, strRad], [x, 0.001, zSpan, strRad]], 4, false));
  }
  // 15 horizontal cross strings (along X)
  for (let j = -7; j <= 7; j += 1) {
    const z = (j / 7.6) * rz;
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

let cachedPlayerRigSpecs: AthleteRigGeometrySpecs | null = null;
let cachedRivalRigSpecs: AthleteRigGeometrySpecs | null = null;

function shadeSlamForm(mesh: RawMesh, yLow: number, yHigh: number, topBoost = 0.04, bottomShade = 0.07): RawMesh {
  const span = Math.max(0.001, yHigh - yLow);
  return paintMeshColors(mesh, ([_x, y, z], [_nx, ny, nz]) => {
    const t = Math.max(0, Math.min(1, (y - yLow) / span));
    const directional = 1 - bottomShade * (1 - t) + topBoost * t + Math.max(0, ny) * 0.025 + Math.max(0, -nz) * 0.02 + (z < 0 ? 0.01 : 0);
    const v = Math.max(0.84, Math.min(1.06, directional));
    return [v, v, v, 1];
  });
}

export function getAthleteRigSpecs(isPlayer = true): AthleteRigGeometrySpecs {
  if (isPlayer && cachedPlayerRigSpecs) return cachedPlayerRigSpecs;
  if (!isPlayer && cachedRivalRigSpecs) return cachedRivalRigSpecs;
  const roleKey = isPlayer ? "player" : "rival";

  // 1. Tailored championship tennis top / V-taper polo (`-Z` forward chest, integrated shoulder yokes enveloping `[±0.225, shoulderY, 0]`)
  const torso = memoizeGeometry(`slam:rig-torso:v2:${roleKey}`, () => {
    const baseTorso = sculptOrganicSdfMesh({
      boundsMin: [-0.29, -0.37, -0.18],
      boundsMax: [0.29, 0.41, 0.18],
      resolution: [24, 28, 22],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const pelvisHem = sdfEllipsoid(p, [0, -0.255, -0.002], isPlayer ? [0.158, 0.115, 0.112] : [0.168, 0.120, 0.118]);
        const waist = sdfEllipsoid(p, [0, -0.115, -0.004], isPlayer ? [0.140, 0.145, 0.102] : [0.156, 0.150, 0.110]);
        const ribcage = sdfEllipsoid(p, [0, 0.085, -0.008], isPlayer ? [0.186, 0.185, 0.132] : [0.202, 0.192, 0.138]);
        const pecL = sdfEllipsoid(p, [-0.068, 0.135, -0.048], isPlayer ? [0.082, 0.072, 0.078] : [0.088, 0.068, 0.072]);
        const pecR = sdfEllipsoid(p, [0.068, 0.135, -0.048], isPlayer ? [0.082, 0.072, 0.078] : [0.088, 0.068, 0.072]);
        const shoulderYoke = sdfCapsule(
          p,
          [isPlayer ? -0.192 : -0.206, 0.258, 0],
          [isPlayer ? 0.192 : 0.206, 0.258, 0],
          isPlayer ? 0.068 : 0.074
        );
        const trapBase = sdfCapsule(p, [0, 0.220, 0], [0, 0.348, 0], isPlayer ? 0.086 : 0.092);
        const spineGroove = sdfCapsule(p, [0, -0.08, 0.128], [0, 0.22, 0.126], 0.022);
        let d = sdfSmoothUnion(pelvisHem, waist, 0.055);
        d = sdfSmoothUnion(d, ribcage, 0.065);
        d = sdfSmoothUnion(d, pecL, 0.045);
        d = sdfSmoothUnion(d, pecR, 0.045);
        d = sdfSmoothUnion(d, shoulderYoke, 0.055);
        d = sdfSmoothUnion(d, trapBase, 0.048);
        d = sdfSmoothSubtract(d, spineGroove, 0.024);
        return d;
      }
    });
    const shaded = paintMeshColors(baseTorso, ([x, y, z], [_nx, ny, nz]) => {
      const t = Math.max(0, Math.min(1, (y + 0.34) / 0.72));
      const hemStripe = y < -0.295 && y > -0.322 ? 0.88 : 1.0;
      const vNeckTrim = z < -0.07 && y > 0.255 && Math.abs(x) < 0.085 && Math.abs(Math.abs(x) - (y - 0.255) * 0.68) < 0.018 ? 0.88 : 1.0;
      const sidePiping = Math.abs(z) < 0.022 && Math.abs(x) > 0.13 && y < 0.22 ? 0.90 : 1.0;
      const v = Math.max(
        0.82,
        Math.min(1.06, (0.94 + 0.08 * t + Math.max(0, ny) * 0.02 + Math.max(0, -nz) * 0.02) * hemStripe * vNeckTrim * sidePiping)
      );
      return [v, v, v, 1];
    });
    return mergeRawMeshes([bakeMeshCavityAO(shaded, 0.22)]);
  });

  // 2. Folded championship spread polo collar + V-placket + smooth round placket buttons (`-Z` forward)
  const collar = memoizeGeometry(`slam:rig-collar:v2:${roleKey}`, () => {
    const collarStand = taubinSmoothMesh(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            ellipseRingXZ(0, -0.042, 0, 0.132, 0.114, 22, 0.14),
            ellipseRingXZ(0, 0.010, 0.004, 0.156, 0.132, 22, 0.18),
            ellipseRingXZ(0, 0.046, 0.008, 0.138, 0.118, 22, 0.24)
          ],
          true,
          false
        ),
        1,
        0.48
      ),
      4
    );
    const wingL = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [-0.022, 0.002, -0.108],
        mid: [-0.052, -0.012, -0.112],
        tip: [-0.076, -0.032, -0.102],
        width: 0.034,
        thickness: 0.014,
        segments: 7,
        radialSegments: 10
      }),
      2
    );
    const wingR = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0.022, 0.002, -0.108],
        mid: [0.052, -0.012, -0.112],
        tip: [0.076, -0.032, -0.102],
        width: 0.034,
        thickness: 0.014,
        segments: 7,
        radialSegments: 10
      }),
      2
    );
    const placket = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0, -0.022, -0.118],
        mid: [0, -0.082, -0.128],
        tip: [0, -0.142, -0.136],
        width: 0.042,
        thickness: 0.014,
        segments: 7,
        radialSegments: 10
      }),
      2
    );
    const btn1 = transformMesh(icosphereSmoothMesh(0.0068, 1, 0, 3), { pos: [0, -0.056, -0.136], scale: [1, 1, 0.55] });
    const btn2 = transformMesh(icosphereSmoothMesh(0.0068, 1, 0, 5), { pos: [0, -0.098, -0.142], scale: [1, 1, 0.55] });
    const raw = shadeSlamForm(mergeRawMeshesToRaw([collarStand, wingL, wingR, placket, btn1, btn2]), -0.15, 0.05, 0.05, 0.07);
    return mergeRawMeshes([bakeMeshCavityAO(raw, 0.22)]);
  });

  // 3. Hips (`pose.hipY`): Flared knife-pleated A-line championship tennis skirt (Player) vs smooth sculpted court shorts (Rival)
  const hips = memoizeGeometry(`slam:rig-hips:v2:${roleKey}`, () => {
    const raw = isPlayer
      ? taubinSmoothMesh(
          subdivideSmoothMesh(
            sculptDrapedGarmentMesh(
              [
                { y: -0.195, rx: 0.246, rz: 0.182, z: 0.002, folds: 16, foldAmp: 0.040, superellipseN: 2.04 },
                { y: -0.115, rx: 0.218, rz: 0.160, z: 0.001, folds: 16, foldAmp: 0.030, superellipseN: 2.08 },
                { y: -0.030, rx: 0.188, rz: 0.138, folds: 16, foldAmp: 0.016, superellipseN: 2.12 },
                { y: 0.065, rx: 0.162, rz: 0.118, superellipseN: 2.15 },
                { y: 0.132, rx: 0.158, rz: 0.115, superellipseN: 2.15 }
              ],
              { ringPoints: 36, capEnds: true, smoothPasses: 3 }
            ),
            1,
            0.40
          ),
          3
        )
      : sculptOrganicSdfMesh({
          boundsMin: [-0.22, -0.20, -0.17],
          boundsMax: [0.22, 0.16, 0.17],
          resolution: [22, 22, 20],
          taubinIterations: 7,
          projectToIso: 0.94,
          evaluate: (x, y, z) => {
            const p: V3 = [x, y, z];
            const waist = sdfEllipsoid(p, [0, 0.065, 0], [0.164, 0.088, 0.120]);
            const saddle = sdfEllipsoid(p, [0, -0.025, 0.004], [0.176, 0.095, 0.132]);
            const legL = sdfCapsule(p, [-0.086, 0.010, 0], [-0.092, -0.145, 0], 0.094);
            const legR = sdfCapsule(p, [0.086, 0.010, 0], [0.092, -0.145, 0], 0.094);
            const inseamSplit = sdfCapsule(p, [0, -0.195, -0.14], [0, -0.195, 0.14], 0.026);
            let d = sdfSmoothUnion(waist, saddle, 0.042);
            d = sdfSmoothUnion(d, legL, 0.036);
            d = sdfSmoothUnion(d, legR, 0.036);
            d = sdfSmoothSubtract(d, inseamSplit, 0.022);
            return d;
          }
        });
    const painted = paintMeshColors(raw, ([_x, y, _z], [_nx, ny, _nz]) => {
      const waistBand = y > 0.075 ? 0.92 : 1.0;
      const hemHighlight = y < -0.15 ? 1.04 : 1.0;
      const v = Math.max(0.82, Math.min(1.06, (0.96 + Math.max(0, ny) * 0.03) * waistBand * hemHighlight));
      return [v, v, v, 1];
    });
    return mergeRawMeshes([bakeMeshCavityAO(painted, isPlayer ? 0.24 : 0.22)]);
  });

  // 4. Unified Porcelain-Smooth SDF Head (`-Z` forward face!) + 4-layer smooth icosphere eyes & sculpted brows
  const head = memoizeGeometry(`slam:rig-head:v2:${roleKey}`, () => {
    const sdfSkin = sculptOrganicSdfMesh({
      boundsMin: [-0.155, -0.195, -0.165],
      boundsMax: [0.155, 0.165, 0.155],
      resolution: [24, 28, 26],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const cranium = sdfEllipsoid(p, [0, 0.026, 0.008], [0.110, 0.118, 0.118]);
        const jaw = sdfEllipsoid(
          p,
          [0, -0.040, -0.024],
          isPlayer ? [0.082, 0.074, 0.086] : [0.090, 0.078, 0.090]
        );
        const chin = sdfEllipsoid(
          p,
          [0, -0.076, -0.068],
          isPlayer ? [0.036, 0.026, 0.036] : [0.042, 0.028, 0.038]
        );
        const cheekL = sdfEllipsoid(p, [-0.066, -0.006, -0.056], [0.040, 0.036, 0.042]);
        const cheekR = sdfEllipsoid(p, [0.066, -0.006, -0.056], [0.040, 0.036, 0.042]);
        const brow = sdfCapsule(p, [-0.054, 0.036, -0.094], [0.054, 0.036, -0.094], isPlayer ? 0.014 : 0.017);
        const socketL = sdfEllipsoid(p, [-0.039, 0.018, -0.112], [0.024, 0.016, 0.016]);
        const socketR = sdfEllipsoid(p, [0.039, 0.018, -0.112], [0.024, 0.016, 0.016]);
        const noseBridge = sdfCapsule(p, [0, 0.028, -0.098], [0, -0.010, -0.124], 0.013);
        const noseTip = sdfEllipsoid(p, [0, -0.014, -0.126], [0.016, 0.014, 0.017]);
        const lips = sdfCapsule(p, [-0.018, -0.044, -0.102], [0.018, -0.044, -0.102], 0.010);
        const earL = sdfEllipsoid(p, [-0.110, 0.008, 0.010], [0.016, 0.029, 0.020]);
        const earR = sdfEllipsoid(p, [0.110, 0.008, 0.010], [0.016, 0.029, 0.020]);
        const neck = sdfCapsule(p, [0, -0.162, 0.008], [0, -0.014, 0.002], isPlayer ? 0.056 : 0.061);

        let d = sdfSmoothUnion(cranium, jaw, 0.038);
        d = sdfSmoothUnion(d, chin, 0.026);
        d = sdfSmoothUnion(d, cheekL, 0.028);
        d = sdfSmoothUnion(d, cheekR, 0.028);
        d = sdfSmoothUnion(d, brow, 0.020);
        d = sdfSmoothSubtract(d, socketL, 0.014);
        d = sdfSmoothSubtract(d, socketR, 0.014);
        d = sdfSmoothUnion(d, noseBridge, 0.016);
        d = sdfSmoothUnion(d, noseTip, 0.014);
        d = sdfSmoothUnion(d, lips, 0.012);
        d = sdfSmoothUnion(d, earL, 0.015);
        d = sdfSmoothUnion(d, earR, 0.015);
        d = sdfSmoothUnion(d, neck, 0.032);
        return d;
      }
    });
    const skinRaw = bakeMeshCavityAO(
      paintMeshColors(sdfSkin, ([x, y, z]) => {
        const isLip = Math.abs(x) < 0.022 && y > -0.054 && y < -0.035 && z < -0.100;
        return isLip ? [0.92, 0.76, 0.74, 1] : [1, 1, 1, 1];
      }),
      0.20
    );

    // Smooth curved icosphere eyeballs (`noiseAmp = 0` — zero boxy bevels!) + dark irises + white catchlights + brows (`-Z` forward!)
    const ivoryTint: [number, number, number, number] = isPlayer ? [1.55, 2.80, 4.65, 1] : [2.35, 5.10, 8.90, 1];
    const sclera = paintMeshColors(
      mergeRawMeshesToRaw([
        transformMesh(icosphereSmoothMesh(0.016, 2, 0, 2), { pos: [-0.039, 0.018, -0.104], rot: [0, 0.14, 0], scale: [1.16, 0.78, 0.56] }),
        transformMesh(icosphereSmoothMesh(0.016, 2, 0, 3), { pos: [0.039, 0.018, -0.104], rot: [0, -0.14, 0], scale: [1.16, 0.78, 0.56] })
      ]),
      ivoryTint
    );
    const irises = paintMeshColors(
      mergeRawMeshesToRaw([
        transformMesh(icosphereSmoothMesh(0.0096, 2, 0, 5), { pos: [-0.038, 0.018, -0.111], rot: [0, 0.12, 0], scale: [0.95, 0.95, 0.42] }),
        transformMesh(icosphereSmoothMesh(0.0096, 2, 0, 7), { pos: [0.038, 0.018, -0.111], rot: [0, -0.12, 0], scale: [0.95, 0.95, 0.42] })
      ]),
      [0.14, 0.12, 0.12, 1]
    );
    const catchlights = paintMeshColors(
      mergeRawMeshesToRaw([
        transformMesh(icosphereSmoothMesh(0.0028, 1, 0, 11), { pos: [-0.035, 0.021, -0.115] }),
        transformMesh(icosphereSmoothMesh(0.0028, 1, 0, 13), { pos: [0.041, 0.021, -0.115] })
      ]),
      ivoryTint
    );
    const brows = paintMeshColors(
      mergeRawMeshesToRaw([
        taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [-0.018, 0.036, -0.112],
            mid: [-0.039, 0.041, -0.111],
            tip: [-0.058, 0.035, -0.104],
            width: 0.011,
            thickness: 0.007,
            segments: 7,
            radialSegments: 10
          }),
          2
        ),
        taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [0.018, 0.036, -0.112],
            mid: [0.039, 0.041, -0.111],
            tip: [0.058, 0.035, -0.104],
            width: 0.011,
            thickness: 0.007,
            segments: 7,
            radialSegments: 10
          }),
          2
        )
      ]),
      [0.24, 0.19, 0.16, 1]
    );

    return mergeRawMeshes([mergeRawMeshesToRaw([skinRaw, sclera, irises, catchlights, brows])]);
  });

  // 5. Dynamic athletic hair (`headPos + [0, 0.055, 0]`, `scaleY * 0.72`): smooth SDF cranial cap + flowing S-curve ponytail (Player) vs swept quiff (Rival)
  const hair = memoizeGeometry(`slam:rig-hair:v2:${roleKey}`, () => {
    const crown = sculptOrganicSdfMesh({
      boundsMin: [-0.155, -0.095, -0.145],
      boundsMax: [0.155, 0.165, 0.165],
      resolution: [20, 20, 22],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const outer = sdfEllipsoid(p, [0, 0.022, 0.014], [0.126, 0.122, 0.128]);
        const faceCut = sdfEllipsoid(p, [0, -0.042, -0.058], [0.116, 0.115, 0.108]);
        return sdfSmoothSubtract(outer, faceCut, 0.028);
      }
    });
    const extra = isPlayer
      ? mergeRawMeshesToRaw([
          // Smooth hair tie cuff + cascading S-curve multi-lock athletic ponytail sweeping gracefully behind (`+Z`)
          taubinSmoothMesh(
            sculptAnatomicalLimbMesh(
              [
                { pos: [0, 0.016, 0.118], rx: 0.032, rz: 0.022 },
                { pos: [0, 0.022, 0.142], rx: 0.034, rz: 0.024 }
              ],
              { ringPoints: 16, capEnds: true }
            ),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [0, 0.024, 0.136],
              mid: [0, 0.008, 0.208],
              tip: [0, -0.195, 0.264],
              width: 0.068,
              thickness: 0.052,
              segments: 12,
              radialSegments: 10
            }),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [-0.020, 0.020, 0.134],
              mid: [-0.036, -0.018, 0.204],
              tip: [-0.024, -0.178, 0.252],
              width: 0.048,
              thickness: 0.038,
              segments: 10,
              radialSegments: 10
            }),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [0.020, 0.020, 0.134],
              mid: [0.036, -0.018, 0.204],
              tip: [0.024, -0.178, 0.252],
              width: 0.048,
              thickness: 0.038,
              segments: 10,
              radialSegments: 10
            }),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [-0.012, 0.008, 0.132],
              mid: [-0.018, -0.065, 0.196],
              tip: [-0.010, -0.212, 0.244],
              width: 0.042,
              thickness: 0.034,
              segments: 10,
              radialSegments: 10
            }),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [0.012, 0.008, 0.132],
              mid: [0.018, -0.065, 0.196],
              tip: [0.010, -0.212, 0.244],
              width: 0.042,
              thickness: 0.034,
              segments: 10,
              radialSegments: 10
            }),
            2
          )
        ])
      : mergeRawMeshesToRaw([
          // Swept tour quiff & textured crown waves (`-Z` front sweep)
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [0, 0.095, -0.025],
              mid: [0.008, 0.146, -0.092],
              tip: [0.018, 0.126, -0.148],
              width: 0.078,
              thickness: 0.046,
              segments: 10,
              radialSegments: 10
            }),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [-0.046, 0.088, -0.020],
              mid: [-0.042, 0.136, -0.086],
              tip: [-0.024, 0.118, -0.138],
              width: 0.058,
              thickness: 0.038,
              segments: 10,
              radialSegments: 10
            }),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [0.046, 0.088, -0.020],
              mid: [0.052, 0.134, -0.084],
              tip: [0.042, 0.114, -0.134],
              width: 0.058,
              thickness: 0.038,
              segments: 10,
              radialSegments: 10
            }),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [-0.082, 0.052, 0.010],
              mid: [-0.098, 0.072, -0.048],
              tip: [-0.084, 0.058, -0.104],
              width: 0.046,
              thickness: 0.030,
              segments: 9,
              radialSegments: 10
            }),
            2
          ),
          taubinSmoothMesh(
            sculptCurvedHairLockMesh({
              root: [0.082, 0.052, 0.010],
              mid: [0.098, 0.072, -0.048],
              tip: [0.084, 0.058, -0.104],
              width: 0.046,
              thickness: 0.030,
              segments: 9,
              radialSegments: 10
            }),
            2
          )
        ]);
    const shadedCrown = bakeMeshCavityAO(shadeSlamForm(crown, -0.18, 0.15, 0.05, 0.08), 0.22);
    const shadedExtra = bakeMeshCavityAO(shadeSlamForm(extra, -0.22, 0.15, 0.05, 0.08), 0.24);
    return mergeRawMeshes([mergeRawMeshesToRaw([shadedCrown, shadedExtra])]);
  });

  // 6. Curved aerodynamic championship tennis sun visor (`-Z` cambered bill + contoured wraparound sweatband)
  const brimArc = bezierCurve2([-0.128, 0.018], [-0.076, -0.114], [0.076, -0.114], [0.128, 0.018], 16);
  const brimSecs: V3[][] = [-0.012, 0, 0.012].map((t) => {
    const scale = 1 - Math.abs(t) * 1.4;
    const upper = brimArc.map(([x, z]): V3 => [x * scale, 0.008 - (0.128 - Math.abs(x)) * 0.12 + z * 0.08 + t * 0.25, z * scale]);
    const lower = [...brimArc].reverse().map(([x, z]): V3 => [x * scale, -0.008 - (0.128 - Math.abs(x)) * 0.12 + z * 0.08 + t * 0.25, z * scale]);
    return [...upper, ...lower];
  });
  const visor = memoizeGeometry(`slam:rig-visor:v2:${roleKey}`, () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        mergeRawMeshesToRaw([
          taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(brimSecs, true, false), 1, 0.46), 3),
          taubinSmoothMesh(
            tubeSweepMesh(
              [
                [-0.120, 0.010, 0.014, 0.018],
                [-0.135, 0.015, 0.110, 0.017],
                [0, 0.018, 0.218, 0.016],
                [0.135, 0.015, 0.110, 0.017],
                [0.120, 0.010, 0.014, 0.018]
              ],
              14,
              true
            ),
            3
          )
        ]),
        0.24
      )
    ])
  );

  const apolloHelmet = memoizeGeometry("slam:rig-helmet:v2", () =>
    mergeRawMeshes([
      subdivideSmoothMesh(transformMesh(icosphereSmoothMesh(0.186, 2, 0, 15), { pos: [0, 0.01, 0], scale: [0.98, 1.04, 1.0] }), 1, 0.56),
      taubinSmoothMesh(latheMesh([[0.155, -0.18], [0.178, -0.14], [0.168, -0.1], [0, -0.1]], 20, false), 2)
    ])
  );
  const apolloPack = memoizeGeometry("slam:rig-pack", () =>
    mergeRawMeshes([
      taubinSmoothMesh(bevelBoxMesh(0.28, 0.38, 0.14, 0.024), 2),
      taubinSmoothMesh(transformMesh(latheMesh([[0, -0.17], [0.052, -0.16], [0.052, 0.16], [0, 0.17]], 12, false), { pos: [-0.075, 0, 0.055] }), 2),
      taubinSmoothMesh(transformMesh(latheMesh([[0, -0.17], [0.052, -0.16], [0.052, 0.16], [0, 0.17]], 12, false), { pos: [0.075, 0, 0.055] }), 2)
    ])
  );

  // 7. `upperLeg` (`orientCylinderBetween(lHipW, lKneeW, 0.135)`: `y = -0.5` is hip, `y = +0.5` is knee, `-Z` is anterior quad!)
  const upperLeg = memoizeGeometry(`slam:rig-upper-leg:v2:${roleKey}`, () => {
    const limb = taubinSmoothMesh(
      subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          isPlayer
            ? [
                { pos: [0, -0.214, 0], rx: 0.078, rz: 0.082 },
                { pos: [0, -0.182, 0], rx: 0.084, rz: 0.088 },
                { pos: [0, -0.095, -0.002], rx: 0.080, rz: 0.084, zOffset: -0.004 },
                { pos: [0, 0.015, -0.004], rx: 0.074, rz: 0.080, zOffset: -0.006 },
                { pos: [0, 0.115, -0.003], rx: 0.063, rz: 0.068, zOffset: -0.004 },
                { pos: [0, 0.185, -0.001], rx: 0.052, rz: 0.055, zOffset: -0.002 },
                { pos: [0, 0.216, 0], rx: 0.044, rz: 0.047 }
              ]
            : [
                { pos: [0, -0.214, 0], rx: 0.086, rz: 0.090 },
                { pos: [0, -0.182, 0], rx: 0.092, rz: 0.096 },
                { pos: [0, -0.075, -0.001], rx: 0.094, rz: 0.098, zOffset: -0.003 },
                { pos: [0, 0.005, -0.002], rx: 0.095, rz: 0.099, zOffset: -0.004 },
                { pos: [0, 0.048, -0.004], rx: 0.074, rz: 0.080, zOffset: -0.006 },
                { pos: [0, 0.130, -0.003], rx: 0.064, rz: 0.069, zOffset: -0.004 },
                { pos: [0, 0.185, -0.001], rx: 0.053, rz: 0.056, zOffset: -0.002 },
                { pos: [0, 0.216, 0], rx: 0.045, rz: 0.048 }
              ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: -0.004, peakT: 0.45 }
        ),
        1,
        0.44
      ),
      4
    );
    const colored = paintMeshColors(limb, ([_x, y], [_nx, ny]) => {
      const hemBand = y > 0.168 && y < 0.188 ? 1.45 : (!isPlayer && y > -0.010 && y < 0.010 ? 1.24 : 1.0);
      const shade = 0.96 + Math.max(0, ny) * 0.04;
      return [hemBand * shade, hemBand * shade, hemBand * shade, 1];
    });
    return mergeRawMeshes([
      bakeMeshCavityAO(transformMesh(colored, { scale: [1 / 0.135, 1 / 0.40, 1 / 0.135] }), 0.22)
    ]);
  });

  // 8. `lowerLeg` (`orientCylinderBetween(lKneeW, lFootW, 0.11)`: `y = -0.5` is knee, `y = +0.5` is ankle, `+Z` is posterior calf!)
  const ivoryOverSkin: [number, number, number, number] = isPlayer ? [1.55, 2.80, 4.65, 1] : [2.35, 5.10, 8.90, 1];
  const lowerLeg = memoizeGeometry(`slam:rig-lower-leg:v2:${roleKey}`, () => {
    const limb = taubinSmoothMesh(
      subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, -0.222, 0], rx: 0.045, rz: 0.048 },
            { pos: [0, -0.192, -0.001], rx: 0.051, rz: 0.054, zOffset: -0.002 },
            { pos: [0, -0.140, 0.002], rx: 0.055, rz: 0.059, zOffset: 0.004 },
            { pos: [0, -0.072, 0.006], rx: 0.059, rz: 0.064, zOffset: 0.008 },
            { pos: [0, 0.025, 0.002], rx: 0.047, rz: 0.051, zOffset: 0.002 },
            { pos: [0, 0.082, 0], rx: 0.045, rz: 0.048 },
            { pos: [0, 0.105, 0], rx: 0.049, rz: 0.052 },
            { pos: [0, 0.155, 0], rx: 0.045, rz: 0.048 },
            { pos: [0, 0.218, 0], rx: 0.042, rz: 0.045 }
          ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: 0.005, peakT: 0.32 }
        ),
        1,
        0.44
      ),
      4
    );
    // Ribbed crew court sock (`y >= 0.082`) painted crisp ivory athletic sock tone + twin championship cuff stripes
    const colored = paintMeshColors(limb, ([_x, y]) => {
      if (y >= 0.082) {
        const stripe = (y > 0.096 && y < 0.106) || (y > 0.114 && y < 0.122);
        return stripe ? [0.24, 0.56, 0.50, 1] : ivoryOverSkin;
      }
      return [1, 1, 1, 1];
    });
    return mergeRawMeshes([
      bakeMeshCavityAO(transformMesh(colored, { scale: [1 / 0.11, 1 / 0.42, 1 / 0.11] }), 0.22)
    ]);
  });

  // 9. `knee`: Smooth rounded patella joint bridge narrower (`widthX < 0.095`) than overlapping thigh/calf condyles
  const knee = memoizeGeometry("slam:rig-knee:v2", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        transformMesh(subdivideSmoothMesh(icosphereSmoothMesh(0.042, 2, 0, 5), 1, 0.52), {
          pos: [0, 0, -0.002],
          scale: [0.98, 1.08, 1.04]
        }),
        0.20
      )
    ])
  );

  // 10. Sculpted Porcelain-Smooth SDF Court Sneaker (`-Z` toe box, `+Z` heel counter, flared outsole, swept laces — ZERO flatShaded splits!)
  const shoe = memoizeGeometry("slam:rig-shoe:v2", () => {
    const sdfBody = sculptOrganicSdfMesh({
      boundsMin: [-0.095, -0.062, -0.195],
      boundsMax: [0.095, 0.072, 0.145],
      resolution: [20, 18, 28],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const outsole = sdfCapsule(p, [0, -0.036, -0.105], [0, -0.034, 0.065], 0.072);
        const toeBox = sdfEllipsoid(p, [0, -0.016, -0.108], [0.068, 0.032, 0.068]);
        const vamp = sdfEllipsoid(p, [0, 0.004, -0.025], [0.064, 0.040, 0.088]);
        const heelCup = sdfEllipsoid(p, [0, 0.014, 0.056], [0.056, 0.048, 0.064]);
        const collarPad = sdfEllipsoid(p, [0, 0.044, 0.048], [0.048, 0.024, 0.054]);
        const tongue = sdfEllipsoid(p, [0, 0.034, -0.026], [0.034, 0.018, 0.046]);
        const ankleOpening = sdfEllipsoid(p, [0, 0.066, 0.046], [0.036, 0.026, 0.042]);
        const flatFloor = -0.048 - p[1];
        let d = sdfSmoothUnion(outsole, toeBox, 0.024);
        d = sdfSmoothUnion(d, vamp, 0.028);
        d = sdfSmoothUnion(d, heelCup, 0.026);
        d = sdfSmoothUnion(d, collarPad, 0.020);
        d = sdfSmoothUnion(d, tongue, 0.016);
        d = sdfSmoothSubtract(d, ankleOpening, 0.012);
        return smaxPoly(d, flatFloor, 0.006);
      }
    });
    const laces = mergeRawMeshesToRaw(
      ([-0.064, -0.042, -0.020] as const).map((lz, li) =>
        taubinSmoothMesh(
          tubeSweepMesh(
            [
              [-0.028, 0.022 + li * 0.006, lz, 0.0042],
              [0, 0.029 + li * 0.006, lz - 0.003, 0.0045],
              [0.028, 0.022 + li * 0.006, lz, 0.0042]
            ],
            10,
            true
          ),
          2
        )
      )
    );
    const paintedBody = bakeMeshCavityAO(
      paintMeshColors(sdfBody, ([x, y, z]) => {
        if (y < -0.030) return [0.26, 0.30, 0.32, 1]; // rubber herringbone outsole
        if (Math.abs(x) > 0.054 && z > -0.06 && z < 0.05 && y < 0.018) return [0.34, 0.52, 0.45, 1]; // lateral tour accent
        return [1, 1, 1, 1];
      }),
      0.22
    );
    const paintedLaces = paintMeshColors(laces, [1, 1, 1, 1]);
    return mergeRawMeshes([mergeRawMeshesToRaw([paintedBody, paintedLaces])]);
  });

  // 11. `upperArm` (`orientCylinderBetween(lShoulderW, lElbowW, 0.105)`: `y = -0.5` is shoulder, `y = +0.5` is elbow)
  const upperArm = memoizeGeometry(`slam:rig-upper-arm:v2:${roleKey}`, () => {
    const limb = taubinSmoothMesh(
      subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          isPlayer
            ? [
                { pos: [0, -0.156, 0], rx: 0.056, rz: 0.058 },
                { pos: [0, -0.128, 0], rx: 0.062, rz: 0.064 },
                { pos: [0, -0.080, -0.002], rx: 0.058, rz: 0.060, zOffset: -0.003 },
                { pos: [0, -0.015, -0.003], rx: 0.050, rz: 0.052, zOffset: -0.004 },
                { pos: [0, 0.075, -0.002], rx: 0.045, rz: 0.047, zOffset: -0.002 },
                { pos: [0, 0.132, 0], rx: 0.042, rz: 0.044 },
                { pos: [0, 0.154, 0], rx: 0.038, rz: 0.040 }
              ]
            : [
                { pos: [0, -0.156, 0], rx: 0.058, rz: 0.060 },
                { pos: [0, -0.128, 0], rx: 0.064, rz: 0.066 },
                { pos: [0, -0.065, -0.002], rx: 0.061, rz: 0.063, zOffset: -0.003 },
                { pos: [0, 0.005, -0.002], rx: 0.058, rz: 0.060 },
                { pos: [0, 0.038, -0.003], rx: 0.050, rz: 0.052, zOffset: -0.004 },
                { pos: [0, 0.132, 0], rx: 0.043, rz: 0.045 },
                { pos: [0, 0.154, 0], rx: 0.039, rz: 0.041 }
              ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: -0.003, peakT: 0.42 }
        ),
        1,
        0.44
      ),
      4
    );
    const coloredArm = paintMeshColors(limb, ([_x, y], [_nx, ny, nz]) => {
      const t = Math.max(0, Math.min(1, (y + 0.15) / 0.30));
      const shade = 0.94 + t * 0.08 + Math.max(0, ny) * 0.025 + Math.max(0, -nz) * 0.02;
      const cuff = y > 0.116 && y < 0.136 ? 1.24 : 1.0;
      return [shade * cuff, shade * cuff, shade * cuff, 1];
    });
    return mergeRawMeshes([
      bakeMeshCavityAO(transformMesh(coloredArm, { scale: [1 / 0.105, 1 / 0.28, 1 / 0.105] }), 0.22)
    ]);
  });

  // 12. `lowerArm` (`orientCylinderBetween(lElbowW, lHandW, 0.09)`: `y = -0.5` is elbow, `y = +0.5` is wrist + ribbed terry sweatband!)
  const lowerArm = memoizeGeometry(`slam:rig-lower-arm:v2:${roleKey}`, () => {
    const limb = taubinSmoothMesh(
      subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [0, -0.150, 0], rx: 0.038, rz: 0.040 },
            { pos: [0, -0.126, 0], rx: 0.043, rz: 0.045 },
            { pos: [0, -0.062, -0.002], rx: 0.047, rz: 0.049, zOffset: -0.003 },
            { pos: [0, 0.038, -0.001], rx: 0.036, rz: 0.038 },
            { pos: [0, 0.062, 0], rx: 0.042, rz: 0.044 },
            { pos: [0, 0.112, 0], rx: 0.041, rz: 0.043 },
            { pos: [0, 0.146, 0], rx: 0.032, rz: 0.034 }
          ],
          { ringPoints: 20, capEnds: true, muscleBiasZ: -0.003, peakT: 0.30 }
        ),
        1,
        0.44
      ),
      4
    );
    const colored = paintMeshColors(limb, ([_x, y]) => {
      // Crisp plush ivory terry-cloth tennis wrist sweatband near wrist (`y in [0.056, 0.118]`)
      if (y >= 0.056 && y <= 0.118) {
        const centerStripe = y > 0.082 && y < 0.092;
        return centerStripe ? [0.24, 0.56, 0.50, 1] : ivoryOverSkin;
      }
      return [1, 1, 1, 1];
    });
    return mergeRawMeshes([
      bakeMeshCavityAO(transformMesh(colored, { scale: [1 / 0.09, 1 / 0.275, 1 / 0.09] }), 0.22)
    ]);
  });

  // 13. Unified Porcelain-Smooth SDF Gripping Tennis Hand (metacarpal palm + 4 curled fingers + thumb — `analyticNormals: true`!)
  const hand = memoizeGeometry("slam:rig-hand:v2", () => {
    const sdfHand = sculptOrganicSdfMesh({
      boundsMin: [-0.042, -0.046, -0.046],
      boundsMax: [0.052, 0.038, 0.026],
      resolution: [20, 20, 20],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const wristDome = sdfEllipsoid(p, [0, 0.020, 0.002], [0.024, 0.016, 0.018]);
        const palm = sdfEllipsoid(p, [0, 0.002, -0.004], [0.027, 0.024, 0.016]);
        let d = sdfSmoothUnion(wristDome, palm, 0.012);
        const fingerXs = [-0.016, -0.0055, 0.0055, 0.016] as const;
        const fingerLens = [0.92, 1.0, 0.96, 0.84] as const;
        for (let idx = 0; idx < 4; idx += 1) {
          const fx = fingerXs[idx]!;
          const fl = fingerLens[idx]!;
          const fProx = sdfCapsule(p, [fx, -0.012, -0.008], [fx, -0.025 * fl, -0.020], 0.0062);
          const fDist = sdfCapsule(p, [fx, -0.025 * fl, -0.020], [fx * 0.94, -0.020 * fl, -0.030], 0.0052);
          d = sdfSmoothUnion(d, sdfSmoothUnion(fProx, fDist, 0.005), 0.008);
        }
        const thumbProx = sdfCapsule(p, [0.018, 0.004, -0.006], [0.030, -0.006, -0.016], 0.0080);
        const thumbDist = sdfCapsule(p, [0.030, -0.006, -0.016], [0.035, -0.014, -0.024], 0.0064);
        d = sdfSmoothUnion(d, sdfSmoothUnion(thumbProx, thumbDist, 0.005), 0.010);
        return d;
      }
    });
    const rawHand = paintMeshColors(sdfHand, [1, 1, 1, 1]);
    return mergeRawMeshes([bakeMeshCavityAO(rawHand, 0.20)]);
  });

  // Octagonal beveled tour grip with flared butt cap & smooth aero twin-shaft throat
  const racketHandle = memoizeGeometry("slam:rig-racket-handle", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        latheMesh([[0, -0.5], [0.7, -0.48], [0.68, -0.43], [0.53, -0.38], [0.5, 0.36], [0.44, 0.48], [0, 0.5]], 8, false),
        0.28
      )
    ])
  );
  const racketThroat = memoizeGeometry("slam:rig-racket-throat:v2", () =>
    mergeRawMeshes([
      bakeMeshCavityAO(
        taubinSmoothMesh(
          subdivideSmoothMesh(
            loftSectionsMesh(
              [
                ellipseRingXZ(0, -0.5, 0, 0.46, 0.68, 14),
                ellipseRingXZ(0, 0, 0, 0.42, 0.72, 14),
                ellipseRingXZ(0, 0.5, 0, 0.39, 0.64, 14)
              ],
              true,
              false
            ),
            1,
            0.44
          ),
          2
        ),
        0.24
      )
    ])
  );
  const racketHoop = memoizeGeometry("slam:rig-racket-hoop", () => mergeRawMeshes([buildRacketHoopMesh()]));
  const racketStrings = memoizeGeometry("slam:rig-racket-strings", () => mergeRawMeshes([buildWovenRacketStringsMesh()]));

  const built: AthleteRigGeometrySpecs = {
    torso,
    collar,
    hips,
    head,
    hair,
    visor,
    apolloHelmet,
    apolloPack,
    upperLeg,
    lowerLeg,
    knee,
    shoe,
    upperArm,
    lowerArm,
    hand,
    racketHandle,
    racketThroat,
    racketHoop,
    racketStrings
  };
  if (isPlayer) cachedPlayerRigSpecs = built;
  else cachedRivalRigSpecs = built;
  return built;
}
