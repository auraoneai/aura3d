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
  material,
  type AuraCustomGeometrySpec,
  type AuraGroupNode,
  type AuraMaterialSpec,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bezierCurve2,
  bevelBoxMesh,
  catmullRomSpline3,
  extrudePolygonMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import { NET_POST_H, NET_POST_X } from "../view/constants";

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
  const slots: MultiMatSlot[] = [];
  // 0: powderSteel, 1: brass, 2: canopyCanvas, 3: treadRubber
  const postProfile: V2[] = [
    [0.115, 0],
    [0.115, 0.028],
    [0.086, 0.048],
    [0.072, 0.09],
    [0.071, NET_POST_H - 0.075],
    [0.078, NET_POST_H - 0.045],
    [0.068, NET_POST_H - 0.015],
    [0.046, NET_POST_H],
    [0, NET_POST_H + 0.012]
  ];
  slots.push({ mesh: latheMesh(postProfile, 20, false), materialIndex: 0 });
  slots.push({ mesh: latheMesh([[0.122, 0], [0.122, 0.012], [0.114, 0.016]], 20, false), materialIndex: 3 });

  // Top brass cable-sheave pulley wheel & woven canvas net-cord collar
  const pulley = latheMesh([[0.012, -0.018], [0.034, -0.018], [0.026, 0], [0.034, 0.018], [0.012, 0.018]], 16, false);
  slots.push({
    mesh: transformMesh(pulley, { pos: [-side * 0.045, NET_POST_H - 0.028, 0], rot: [Math.PI * 0.5, 0, 0] }),
    materialIndex: 1
  });
  const canvasCollar = latheMesh([[0.073, NET_POST_H - 0.14], [0.077, NET_POST_H - 0.1], [0.077, NET_POST_H - 0.05], [0.073, NET_POST_H - 0.045]], 18, false);
  slots.push({ mesh: canvasCollar, materialIndex: 2 });

  // External brass worm-gear tension reel & swept hand-crank on the +X post (ratchet collar on -X post)
  const drum = latheMesh([[0, -0.045], [0.052, -0.045], [0.044, -0.03], [0.044, 0.03], [0.052, 0.045], [0, 0.045]], 18, false);
  slots.push({
    mesh: transformMesh(drum, { pos: [side * 0.088, 0.68, 0], rot: [0, 0, Math.PI * 0.5] }),
    materialIndex: 1
  });
  if (side > 0) {
    const crankSpine: V4[] = [
      [0.132, 0.68, 0, 0.013],
      [0.155, 0.68, 0.02, 0.012],
      [0.158, 0.56, 0.095, 0.011],
      [0.215, 0.56, 0.095, 0.014]
    ];
    slots.push({ mesh: tubeSweepMesh(crankSpine, 10, false), materialIndex: 1 });
    slots.push({
      mesh: transformMesh(latheMesh([[0, -0.032], [0.018, -0.028], [0.02, 0], [0.018, 0.028], [0, 0.032]], 12, false), {
        pos: [0.215, 0.56, 0.095],
        rot: [0, 0, Math.PI * 0.5]
      }),
      materialIndex: 3
    });
  }

  const mats: AuraMaterialSpec[] = [TOUR_MATS.powderSteel, TOUR_MATS.brass, TOUR_MATS.canopyCanvas, TOUR_MATS.treadRubber];
  return assembleMultiMaterialNode(side < 0 ? "net-post-left" : "net-post-right", slots, mats, {
    position: [side * NET_POST_X, 0, 0],
    castShadow: true,
    receiveShadow: true
  });
}

export function buildCenterStrapAnchorNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh([[0.058, 0], [0.058, 0.012], [0.032, 0.024], [0, 0.026]], 16, false), materialIndex: 0 },
    { mesh: tubeSweepMesh([[-0.024, 0.018, 0, 0.007], [0, 0.048, 0, 0.007], [0.024, 0.018, 0, 0.007]], 8, false), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.054, 0.905, 0.018, 0.004), { pos: [0, 0.468, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(0.068, 0.048, 0.028, 0.006), { pos: [0, 0.24, 0] }), materialIndex: 0 }
  ];
  return assembleMultiMaterialNode("wt-center-strap-anchor", slots, [TOUR_MATS.brass, TOUR_MATS.canopyCanvas], {
    position: [0, 0, 0],
    castShadow: false,
    receiveShadow: true
  });
}

// ---------------------------------------------------------------------------
// 2. Sculpted Umpire High-Chair, Sun Canopy, Tablet Console & Official
// ---------------------------------------------------------------------------

export function buildUmpireHighChairNodes(): AuraSceneNode[] {
  const slots: MultiMatSlot[] = [];
  // 0: powderSteel, 1: teak, 2: cushionNavy, 3: canopyCanvas, 4: treadRubber, 5: chrome, 6: gantryHousing
  for (const sz of [-1, 1] as const) {
    const zBase = sz * 0.44;
    const zTop = sz * 0.38;
    // Swept tubular rear & front A-frame legs + upper canopy stanchion
    slots.push({
      mesh: tubeSweepMesh([[-0.38, 0, zBase, 0.03], [-0.35, 1.05, zTop, 0.028], [-0.34, 1.94, zTop, 0.027], [-0.34, 2.96, zTop * 1.12, 0.022]], 10, false),
      materialIndex: 0
    });
    slots.push({
      mesh: tubeSweepMesh([[0.42, 0, zBase, 0.03], [0.34, 0.96, zTop, 0.028], [0.28, 1.88, zTop, 0.026]], 10, false),
      materialIndex: 0
    });
    // Swept ergonomic climbing handrail + armrest loop
    const railPts = catmullRomSpline3([
      [0.48, 0.52, zBase * 0.96],
      [0.39, 1.38, zTop * 0.98],
      [0.3, 2.22, zTop * 0.98],
      [-0.32, 2.24, zTop * 0.98]
    ], 5);
    slots.push({ mesh: tubeSweepMesh(railPts.map((p) => [p[0], p[1], p[2], 0.02]), 8, false), materialIndex: 0 });
    for (const ry of [0.46, 1.08, 1.78]) {
      slots.push({ mesh: tubeSweepMesh([[-0.35, ry, zTop, 0.018], [0.33, ry, zTop, 0.018]], 8, false), materialIndex: 0 });
    }
  }
  for (const ry of [0.46, 1.12, 1.82, 2.38]) {
    slots.push({ mesh: tubeSweepMesh([[-0.34, ry, -0.38, 0.018], [-0.34, ry, 0.38, 0.018]], 8, false), materialIndex: 0 });
  }
  // 6 bevelled ladder treads with non-slip rubber inserts + wide footrest platform
  for (let i = 0; i < 6; i += 1) {
    const ty = 0.28 + i * 0.27;
    const tx = 0.4 - i * 0.022;
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.14, 0.034, 0.76, 0.008), { pos: [tx, ty, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.11, 0.012, 0.7, 0.004), { pos: [tx, ty + 0.02, 0] }), materialIndex: 4 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.32, 0.042, 0.78, 0.01), { pos: [0.27, 1.54, 0] }), materialIndex: 4 });

  // Contoured lofted teak seat shell & lumbar backrest + plush navy cushions
  const seatCurve = bezierCurve2([-0.32, 1.94], [-0.14, 1.89], [0.08, 1.9], [0.24, 1.93], 6);
  const seatSecs: V3[][] = [-0.35, -0.18, 0, 0.18, 0.35].map((z) => {
    const ring: V3[] = [];
    for (const [x, y] of seatCurve) ring.push([x, y + 0.022, z]);
    for (let k = seatCurve.length - 1; k >= 0; k -= 1) ring.push([seatCurve[k]![0], seatCurve[k]![1] - 0.024, z]);
    return ring;
  });
  slots.push({ mesh: loftSectionsMesh(seatSecs, true, false), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.46, 0.065, 0.64, 0.022), { pos: [-0.04, 1.96, 0] }), materialIndex: 2 });

  const backCurve = bezierCurve2([-0.31, 1.98], [-0.35, 2.22], [-0.34, 2.44], [-0.29, 2.64], 6);
  const backSecs: V3[][] = [-0.34, 0, 0.34].map((z) => {
    const ring: V3[] = [];
    for (const [x, y] of backCurve) ring.push([x + 0.022, y, z]);
    for (let k = backCurve.length - 1; k >= 0; k -= 1) ring.push([backCurve[k]![0] - 0.022, backCurve[k]![1], z]);
    return ring;
  });
  slots.push({ mesh: loftSectionsMesh(backSecs, true, false), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.065, 0.56, 0.62, 0.02), { pos: [-0.29, 2.31, 0], rot: [0, 0, 0.06] }), materialIndex: 2 });

  // Cambered lofted sun-canopy awning + tubular steel roof bow
  const canopyArc = bezierCurve2([-0.62, 2.94], [-0.15, 3.09], [0.24, 3.07], [0.64, 2.91], 8);
  const canopySecs: V3[][] = [-0.64, -0.22, 0.22, 0.64].map((z) => {
    const droop = Math.abs(z) > 0.5 ? -0.025 : 0;
    const ring: V3[] = [];
    for (const [x, y] of canopyArc) ring.push([x, y + 0.02 + droop, z]);
    for (let k = canopyArc.length - 1; k >= 0; k -= 1) ring.push([canopyArc[k]![0], canopyArc[k]![1] - 0.018 + droop, z]);
    return ring;
  });
  slots.push({ mesh: loftSectionsMesh(canopySecs, true, false), materialIndex: 3 });

  // Articulated scoring tablet console + gooseneck broadcast microphone
  slots.push({ mesh: tubeSweepMesh([[0.22, 2.22, 0.37, 0.015], [0.34, 2.32, 0.32, 0.014], [0.36, 2.36, 0.22, 0.013]], 8, false), materialIndex: 5 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.22, 0.024, 0.28, 0.006), { pos: [0.36, 2.38, 0.18], rot: [0, -0.28, -0.42] }), materialIndex: 6 });
  slots.push({ mesh: tubeSweepMesh([[0.24, 2.24, -0.36, 0.008], [0.34, 2.48, -0.28, 0.007], [0.28, 2.58, -0.14, 0.009]], 8, false), materialIndex: 5 });

  const mats: AuraMaterialSpec[] = [
    TOUR_MATS.powderSteel, TOUR_MATS.teak, TOUR_MATS.cushionNavy,
    TOUR_MATS.canopyCanvas, TOUR_MATS.treadRubber, TOUR_MATS.chrome, TOUR_MATS.gantryHousing
  ];
  const chairNode = assembleMultiMaterialNode("wt-umpire-stand", slots, mats, {
    position: [-6.76, 0, 0],
    castShadow: true,
    receiveShadow: true
  }).toJSON();

  const tabletGlass = geometry.custom(
    mergeRawMeshes([transformMesh(bevelBoxMesh(0.19, 0.008, 0.24, 0.002), { pos: [0.366, 2.392, 0.18], rot: [0, -0.28, -0.42] })]),
    { name: "wt-umpire-tablet-glass", position: [-6.76, 0, 0], material: TOUR_MATS.opticalGlass, castShadow: false, receiveShadow: false }
  ).toJSON();

  return [chairNode, tabletGlass];
}

export function buildUmpireOfficialNodes(original: boolean): AuraSceneNode[] {
  const torsoSpec = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.32, 0, 0.155, 0.115, 14),
      ellipseRingXZ(0, -0.12, 0, 0.148, 0.108, 14),
      ellipseRingXZ(0, 0.14, 0, 0.182, 0.126, 14),
      ellipseRingXZ(0, 0.29, 0, 0.165, 0.112, 14),
      ellipseRingXZ(0, 0.34, 0, 0.078, 0.072, 14)
    ], true, false)
  ]);
  const headSpec = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.13, 0, 0.078, 0.082, 14),
      ellipseRingXZ(0, -0.04, 0.006, 0.118, 0.126, 14, 0.08),
      ellipseRingXZ(0, 0.05, 0, 0.128, 0.134, 14),
      ellipseRingXZ(0, 0.125, -0.005, 0.092, 0.098, 14)
    ], true, false),
    transformMesh(bevelBoxMesh(0.19, 0.022, 0.14, 0.006), { pos: [0.08, 0.055, 0], rot: [0, 0, -0.12] })
  ]);
  const blazerMat = original
    ? material.pbr({ color: "#214b3e", roughness: 0.78 })
    : material.fabric({ color: "#1d463a", roughness: 0.8, sheen: 0.42, sheenColor: "#356c5a" });
  return [
    geometry.custom(torsoSpec, { name: "umpire-torso", material: blazerMat, castShadow: true })
      .position(-6.72, 2.26, 0).toJSON(),
    geometry.custom(headSpec, { name: "umpire-head", material: material.pbr({ color: "#c58e69", roughness: 0.72 }), castShadow: true })
      .position(-6.68, 2.62, 0).runtime(game.runtimeNode("umpire-head")).toJSON()
  ];
}

// ---------------------------------------------------------------------------
// 3. Player Sideline Benches, Beverage Coolers & Towel / Racket Caddies
// ---------------------------------------------------------------------------

export function buildPlayerSidelineNodes(): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  const mats: AuraMaterialSpec[] = [
    TOUR_MATS.powderSteel, TOUR_MATS.teak, TOUR_MATS.coolerGloss,
    TOUR_MATS.canopyCanvas, TOUR_MATS.chrome, TOUR_MATS.towelCream,
    TOUR_MATS.towelEmerald, TOUR_MATS.racketCarbon
  ];

  for (const sideZ of [-1, 1] as const) {
    const tag = sideZ < 0 ? "north" : "south";
    const bz = sideZ * 3.4;
    const cz = sideZ * 1.85;
    const rz = sideZ * 4.78;
    const slots: MultiMatSlot[] = [];

    // Swept sled bench frames & armrests at z = bz ± 0.84, bz
    for (const zOff of [-0.84, 0, 0.84]) {
      const legSpine: V4[] = [
        [-7.62, 0, bz + zOff, 0.022],
        [-7.08, 0, bz + zOff, 0.022],
        [-7.1, 0.43, bz + zOff, 0.022],
        [-7.58, 0.42, bz + zOff, 0.022],
        [-7.62, 0.88, bz + zOff, 0.021]
      ];
      slots.push({ mesh: tubeSweepMesh(legSpine, 8, false), materialIndex: 0 });
    }
    for (const zArm of [-0.84, 0.84]) {
      slots.push({
        mesh: tubeSweepMesh([[-7.6, 0.64, bz + zArm, 0.018], [-7.14, 0.63, bz + zArm, 0.018], [-7.12, 0.43, bz + zArm, 0.018]], 8, false),
        materialIndex: 0
      });
    }

    // Ergonomic curved-profile lofted teak seat & lumbar slats
    const benchArc = bezierCurve2([-7.56, 0.45], [-7.38, 0.42], [-7.22, 0.43], [-7.08, 0.455], 6);
    const benchSecs: V3[][] = [-0.96, -0.32, 0.32, 0.96].map((dz) => {
      const ring: V3[] = [];
      for (const [x, y] of benchArc) ring.push([x, y + 0.018, bz + dz]);
      for (let k = benchArc.length - 1; k >= 0; k -= 1) ring.push([benchArc[k]![0], benchArc[k]![1] - 0.018, bz + dz]);
      return ring;
    });
    slots.push({ mesh: loftSectionsMesh(benchSecs, true, false), materialIndex: 1 });
    for (const sy of [0.63, 0.8]) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.042, 0.12, 1.94, 0.01), { pos: [-7.59, sy, bz], rot: [0, 0, 0.07] }), materialIndex: 1 });
    }

    // Championship insulated beverage cooler + hinged lid + chrome dispense spigot & cup sleeve
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.46, 0.48, 0.62, 0.026), { pos: [-7.35, 0.28, cz] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.49, 0.07, 0.65, 0.018), { pos: [-7.35, 0.545, cz] }), materialIndex: 3 });
    slots.push({ mesh: tubeSweepMesh([[-7.35, 0.04, cz - 0.24, 0.022], [-7.35, 0.04, cz + 0.24, 0.022]], 8, false), materialIndex: 0 });
    slots.push({
      mesh: transformMesh(latheMesh([[0, -0.028], [0.022, -0.026], [0.016, 0.024], [0, 0.028]], 12, false), {
        pos: [-7.09, 0.16, cz], rot: [0, 0, Math.PI * 0.5]
      }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(latheMesh([[0.036, 0], [0.038, 0.34], [0.042, 0.36], [0, 0.365]], 14, false), { pos: [-7.14, 0.22, cz + sideZ * 0.22] }),
      materialIndex: 4
    });

    // Courtside A-frame towel & spare-racket caddy with draped woven cotton towels
    for (const dz of [-0.28, 0.28]) {
      slots.push({
        mesh: tubeSweepMesh([[-7.56, 0, rz + dz, 0.016], [-7.35, 0.86, rz + dz, 0.015], [-7.14, 0, rz + dz, 0.016]], 8, false),
        materialIndex: 0
      });
    }
    slots.push({ mesh: tubeSweepMesh([[-7.35, 0.85, rz - 0.3, 0.016], [-7.35, 0.85, rz + 0.3, 0.016]], 8, false), materialIndex: 4 });
    for (const [idx, zTowel] of [rz - 0.11, rz + 0.11].entries()) {
      const towelCurve = bezierCurve2([-7.43, 0.52], [-7.41, 0.87], [-7.29, 0.87], [-7.27, 0.49], 7);
      const tSecs: V3[][] = [-0.085, 0.085].map((w) => {
        const ring: V3[] = [];
        for (const [x, y] of towelCurve) ring.push([x + 0.009, y, zTowel + w]);
        for (let k = towelCurve.length - 1; k >= 0; k -= 1) ring.push([towelCurve[k]![0] - 0.009, towelCurve[k]![1], zTowel + w]);
        return ring;
      });
      slots.push({ mesh: loftSectionsMesh(tSecs, true, false), materialIndex: idx === 0 ? 5 : 6 });
    }
    // Upright spare tour racket resting in caddy
    const spareLoop = catmullRomSpline3([
      [0, -0.14, 0], [0.11, -0.06, 0], [0.12, 0.11, 0], [0, 0.2, 0], [-0.12, 0.11, 0], [-0.11, -0.06, 0]
    ], 4, true).map((p): V4 => [p[0], p[1], p[2], 0.014]);
    slots.push({ mesh: transformMesh(tubeSweepMesh(spareLoop, 8, false), { pos: [-7.44, 0.58, rz - sideZ * 0.24], rot: [0, Math.PI * 0.5, 0.2] }), materialIndex: 7 });

    out.push(assembleMultiMaterialNode(`wt-sideline-kit-${tag}`, slots, mats, { castShadow: true, receiveShadow: true }).toJSON());
    out.push(
      geometry.custom(
        mergeRawMeshes([transformMesh(bevelBoxMesh(0.012, 0.24, 0.11, 0.003), { pos: [-7.115, 0.31, cz - sideZ * 0.12] })]),
        { name: `wt-cooler-glass-${tag}`, material: TOUR_MATS.opticalGlass, castShadow: false, receiveShadow: false }
      ).toJSON()
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Grand Slam Lattice Floodlight Towers (`targetHeight: 9.5`) & Scoreboard
// ---------------------------------------------------------------------------

export function buildFloodlightTowerNode(side: -1 | 1): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // 0: stoneWarm plinth, 1: trussSteel, 2: gantryHousing, 3: chrome reflector, 4: floodLed (practical: true)
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.18, 0.56, 1.18, 0.05), { pos: [0, 0.28, 0] }), materialIndex: 0 });
  slots.push({ mesh: latheMesh([[0.52, 0.56], [0.46, 0.72], [0.38, 0.76]], 16, false), materialIndex: 1 });
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [0.68, 7.65, 0.68], bays: 9, chordRadius: 0.032, braceRadius: 0.018 }), { pos: [0, 4.58, 0] }),
    materialIndex: 1
  });
  // Maintenance catwalk deck + perimeter tubular safety rail at y = 8.2..8.72
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.92, 0.08, 1.16, 0.015), { pos: [0, 8.22, 0.08] }), materialIndex: 1 });
  slots.push({
    mesh: tubeSweepMesh([[-0.92, 8.26, -0.46, 0.018], [-0.92, 8.72, -0.46, 0.018], [0.92, 8.72, -0.46, 0.018], [0.92, 8.26, -0.46, 0.018]], 8, false),
    materialIndex: 1
  });
  // Angled 2x4 luminaire head frame reaching exact y = 9.50 m
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [2.48, 0.88, 0.42], bays: 4, chordRadius: 0.026, braceRadius: 0.015 }), { pos: [0, 9.02, 0.06], rot: [0.26, 0, 0] }),
    materialIndex: 2
  });
  const cowl = latheMesh([[0.05, 0], [0.19, 0.08], [0.22, 0.19], [0.21, 0.21]], 14, false);
  const lens = latheMesh([[0, 0.17], [0.185, 0.17], [0.19, 0.195], [0, 0.195]], 14, false);
  for (const rowY of [8.78, 9.26]) {
    for (const colX of [-0.88, -0.29, 0.29, 0.88]) {
      const zOff = rowY > 9 ? 0.14 : 0.24;
      slots.push({ mesh: transformMesh(cowl, { pos: [colX, rowY, zOff], rot: [Math.PI * 0.5 + 0.28, 0, 0] }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(lens, { pos: [colX, rowY, zOff], rot: [Math.PI * 0.5 + 0.28, 0, 0] }), materialIndex: 4 });
    }
  }

  const mats: AuraMaterialSpec[] = [TOUR_MATS.stoneWarm, TOUR_MATS.trussSteel, TOUR_MATS.gantryHousing, TOUR_MATS.chrome, TOUR_MATS.floodLed];
  const builder = assembleMultiMaterialNode(`stadium-floodlight-${side < 0 ? "left" : "right"}`, slots, mats, {
    position: [side * 12.5, 0, -13.2],
    rotation: [0, side * -0.2, 0],
    castShadow: false,
    receiveShadow: false
  });
  const Ctor = builder.constructor as typeof AuraNodeBuilder<AuraGroupNode>;
  return new Ctor({ ...builder.toJSON(), targetHeight: 9.5 } as AuraGroupNode);
}

export function buildScoreboardGantryNode(position: V3): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // 0: trussSteel, 1: gantryHousing, 2: powderSteel, 3: brass, 4: scoreAccentLed (practical: true)
  for (const px of [-2.62, 2.62]) {
    slots.push({
      mesh: transformMesh(latticeTrussMesh({ span: [0.34, 2.52, 0.36], bays: 5, chordRadius: 0.02, braceRadius: 0.012 }), { pos: [px, -1.14, -0.18] }),
      materialIndex: 0
    });
  }
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [6.4, 0.36, 0.38], bays: 8, chordRadius: 0.02, braceRadius: 0.012 }), { pos: [0, 1.08, -0.16] }),
    materialIndex: 0
  });
  slots.push({ mesh: bevelBoxMesh(6.24, 1.86, 0.38, 0.045), materialIndex: 1 });
  const cheekPoly: V2[] = [[-0.22, -0.92], [0.22, -0.82], [0.26, 0.82], [-0.22, 0.92]];
  for (const sx of [-3.18, 3.18]) {
    slots.push({ mesh: transformMesh(extrudePolygonMesh(cheekPoly, 0.14, 0.02, false), { pos: [sx, 0, 0.02], rot: [0, Math.PI * 0.5, 0] }), materialIndex: 2 });
  }
  // Emissive header & footer LED strips + analog championship crown clock
  slots.push({ mesh: transformMesh(bevelBoxMesh(5.86, 0.065, 0.05, 0.01), { pos: [0, 0.82, 0.2] }), materialIndex: 4 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(5.86, 0.05, 0.05, 0.01), { pos: [0, -0.82, 0.2] }), materialIndex: 4 });
  slots.push({
    mesh: transformMesh(latheMesh([[0, -0.08], [0.44, -0.08], [0.46, 0.05], [0.4, 0.08], [0, 0.08]], 20, false), { pos: [0, 1.38, 0.04], rot: [Math.PI * 0.5, 0, 0] }),
    materialIndex: 3
  });

  const mats: AuraMaterialSpec[] = [TOUR_MATS.trussSteel, TOUR_MATS.gantryHousing, TOUR_MATS.powderSteel, TOUR_MATS.brass, TOUR_MATS.scoreAccentLed];
  return assembleMultiMaterialNode("stadium-scoreboard-gantry", slots, mats, {
    id: "stadium-scoreboard-gantry",
    position,
    castShadow: false,
    receiveShadow: true
  });
}

// ---------------------------------------------------------------------------
// 5. Grand Slam Concourse Arcade, Cantilever Roof Truss & Camera Gantries
// ---------------------------------------------------------------------------

export function buildStadiumBowlNodes(): AuraSceneNode[] {
  const slots: MultiMatSlot[] = [];
  // 0: stoneLight, 1: stoneWarm, 2: brass, 3: trussSteel, 4: powderSteel, 5: gantryHousing, 6: terracotta, 7: foliage, 8: tallyLed
  // 5-bay Grand Slam travertine concourse colonnade + cantilevered roof truss fascia behind the rear stand
  for (const archX of [-9.2, -4.6, 0, 4.6, 9.2]) {
    for (const s of archwayVoussoirSlots({ radius: 1.48, thickness: 0.36, depth: 0.68, voussoirs: 9, stoneMatA: 0, stoneMatB: 1, keystoneMat: 2 })) {
      slots.push({ mesh: transformMesh(s.mesh, { pos: [archX, 2.15, -18.9] }), materialIndex: s.materialIndex });
    }
  }
  for (const pierX of [-11.3, -6.9, -2.3, 2.3, 6.9, 11.3]) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.76, 3.9, 0.82, 0.04), { pos: [pierX, 1.95, -18.9] }), materialIndex: 0 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(24.4, 0.44, 1.15, 0.05), { pos: [0, 4.18, -18.9] }), materialIndex: 1 });
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [24.6, 0.58, 2.8], bays: 12, chordRadius: 0.036, braceRadius: 0.02 }), { pos: [0, 4.78, -18.1], rot: [0.08, 0, 0] }),
    materialIndex: 3
  });
  slots.push({ mesh: transformMesh(bevelBoxMesh(25.0, 0.14, 3.2, 0.03), { pos: [0, 5.14, -18.0], rot: [0.08, 0, 0] }), materialIndex: 4 });

  // Left & right broadcast long-lens camera gantries on swept tripods + manicured courtside boxwood planters
  const lensGlasses: RawMesh[] = [];
  for (const sx of [-1, 1] as const) {
    const cx = sx * 10.55;
    const cz = 4.4;
    const yaw = sx * 0.42;
    for (const [lx, lz] of [[-0.36, -0.32], [0.36, -0.32], [0, 0.4]] as const) {
      slots.push({ mesh: tubeSweepMesh([[cx + lx, 0, cz + lz, 0.024], [cx, 1.42, cz, 0.02]], 8, false), materialIndex: 3 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.36, 0.28, 0.64, 0.02), { pos: [cx, 1.62, cz], rot: [-0.08, yaw, 0] }), materialIndex: 5 });
    slots.push({
      mesh: transformMesh(latheMesh([[0.09, -0.22], [0.115, 0.18], [0.135, 0.34], [0.125, 0.36]], 16, false), {
        pos: [cx - Math.sin(yaw) * 0.42, 1.64, cz - Math.cos(yaw) * 0.42], rot: [-Math.PI * 0.5 - 0.08, yaw, 0]
      }),
      materialIndex: 4
    });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.06, 0.035, 0.04, 0.006), { pos: [cx, 1.8, cz - 0.14], rot: [0, yaw, 0] }), materialIndex: 8 });
    lensGlasses.push(
      transformMesh(latheMesh([[0, 0], [0.118, 0], [0.118, 0.018], [0, 0.018]], 16, false), {
        pos: [cx - Math.sin(yaw) * 0.74, 1.66, cz - Math.cos(yaw) * 0.74], rot: [-Math.PI * 0.5 - 0.08, yaw, 0]
      })
    );
  }
  for (const [idx, px] of [-8.2, -1.9, 1.9, 8.2].entries()) {
    const pz = Math.abs(px) > 5 ? -11.35 : -11.95;
    if (Math.abs(px) < 5) continue;
    slots.push({ mesh: transformMesh(latheMesh([[0.28, 0], [0.38, 0.52], [0.42, 0.58], [0.36, 0.62], [0, 0.62]], 16, false), { pos: [px, 0, pz] }), materialIndex: 6 });
    slots.push({ mesh: transformMesh(layeredCanopyMesh({ radius: 0.48, height: 0.72, puffs: 8, seed: 31 + idx * 13 }), { pos: [px, 0.54, pz] }), materialIndex: 7 });
  }

  const mats: AuraMaterialSpec[] = [
    TOUR_MATS.stoneLight, TOUR_MATS.stoneWarm, TOUR_MATS.brass, TOUR_MATS.trussSteel,
    TOUR_MATS.powderSteel, TOUR_MATS.gantryHousing, TOUR_MATS.terracotta, TOUR_MATS.foliage, TOUR_MATS.tallyLed
  ];
  return [
    assembleMultiMaterialNode("wt-stadium-bowl", slots, mats, { castShadow: false, receiveShadow: true }).toJSON(),
    geometry.custom(mergeRawMeshes(lensGlasses), {
      name: "wt-camera-lens-glass", material: TOUR_MATS.opticalGlass, castShadow: false, receiveShadow: false
    }).toJSON()
  ];
}

// ---------------------------------------------------------------------------
// 6. Sculpted Seated Spectator (`<= 260` tris/instance) for `spectators.ts`
// ---------------------------------------------------------------------------

let cachedSpectatorSpec: AuraCustomGeometrySpec | null = null;

export function buildSeatedSpectatorSpec(): AuraCustomGeometrySpec {
  if (cachedSpectatorSpec) return cachedSpectatorSpec;
  const torso = loftSectionsMesh([
    ellipseRingXZ(0, -0.26, 0.02, 0.145, 0.115, 10),
    ellipseRingXZ(0, -0.06, 0, 0.135, 0.1, 10),
    ellipseRingXZ(0, 0.12, -0.01, 0.168, 0.112, 10),
    ellipseRingXZ(0, 0.21, -0.01, 0.068, 0.064, 10)
  ], true, false);
  const thighs = loftSectionsMesh([
    ellipseRingXZ(0, -0.28, 0.04, 0.14, 0.08, 8),
    ellipseRingXZ(0, -0.26, 0.16, 0.132, 0.074, 8),
    ellipseRingXZ(0, -0.34, 0.23, 0.115, 0.065, 8)
  ], true, false);
  const head = latheMesh([
    [0, 0.2], [0.048, 0.22], [0.098, 0.27], [0.104, 0.34], [0.082, 0.41], [0, 0.435]
  ], 10, false);
  cachedSpectatorSpec = mergeRawMeshes([torso, thighs, head]);
  return cachedSpectatorSpec;
}

// ---------------------------------------------------------------------------
// 7. Sculpted 28-Node Athlete Rig & Carbon-Graphite Racket Geometry Specs
// ---------------------------------------------------------------------------

function buildRacketHoopMesh(): RawMesh {
  const ovalCtrl: V3[] = [];
  const loopPts = 12;
  for (let i = 0; i < loopPts; i += 1) {
    const a = (i / loopPts) * Math.PI * 2;
    ovalCtrl.push([Math.cos(a) * 0.166, Math.sin(a) * 0.168, 0]);
  }
  const spline = catmullRomSpline3(ovalCtrl, 3, true);
  // Close the swept loop cleanly by repeating the start point
  const spine: V4[] = [...spline, spline[0]!].map((p) => [p[0], p[1], p[2], 0.0165]);
  const bridge = transformMesh(bevelBoxMesh(0.18, 0.022, 0.024, 0.005), { pos: [0, -0.152, 0] });
  return transformMesh(mergeRawMeshesInline([tubeSweepMesh(spine, 8, false), bridge]), {});
}

function mergeRawMeshesInline(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of parts) {
    const off = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + off);
  }
  return { positions, normals, uvs, indices };
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

  const torso = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.34, 0, 0.162, 0.118, 16),
      ellipseRingXZ(0, -0.16, 0, 0.148, 0.106, 16),
      ellipseRingXZ(0, 0.08, -0.008, 0.184, 0.128, 16),
      ellipseRingXZ(0, 0.24, 0, 0.196, 0.124, 16),
      ellipseRingXZ(0, 0.34, 0, 0.086, 0.078, 16)
    ], true, false)
  ]);

  const collar = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.036, 0, 0.138, 0.118, 14, 0.14),
      ellipseRingXZ(0, 0.01, 0, 0.15, 0.126, 14, 0.18),
      ellipseRingXZ(0, 0.038, 0.006, 0.136, 0.114, 14, 0.22)
    ], true, false)
  ]);

  const hips = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.11, 0, 0.172, 0.122, 14),
      ellipseRingXZ(0, 0, 0, 0.168, 0.118, 14),
      ellipseRingXZ(0, 0.11, 0, 0.156, 0.11, 14)
    ], true, false)
  ]);

  const head = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.135, 0.006, 0.082, 0.088, 16, 0.08),
      ellipseRingXZ(0, -0.045, -0.004, 0.122, 0.132, 16, -0.06),
      ellipseRingXZ(0, 0.045, 0, 0.132, 0.138, 16),
      ellipseRingXZ(0, 0.12, 0.006, 0.098, 0.104, 16),
      ellipseRingXZ(0, 0.138, 0.008, 0.038, 0.04, 16)
    ], true, false)
  ]);

  const hair = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.06, 0.026, 0.128, 0.118, 14, 0.28),
      ellipseRingXZ(0, 0.03, 0.014, 0.142, 0.142, 14, 0.12),
      ellipseRingXZ(0, 0.115, 0.006, 0.118, 0.124, 14),
      ellipseRingXZ(0, 0.146, 0.004, 0.048, 0.052, 14)
    ], true, false)
  ]);

  const visorBill: V2[] = [[-0.112, 0.02], [0.112, 0.02], [0.094, -0.095], [0, -0.115], [-0.094, -0.095]];
  const visor = mergeRawMeshes([
    transformMesh(extrudePolygonMesh(visorBill, 0.018, 0.004, false), { rot: [Math.PI * 0.5 + 0.08, 0, 0] }),
    tubeSweepMesh([
      [-0.118, 0.008, 0.02, 0.014], [-0.132, 0.012, 0.11, 0.013],
      [0, 0.014, 0.21, 0.013], [0.132, 0.012, 0.11, 0.013], [0.118, 0.008, 0.02, 0.014]
    ], 8, false)
  ]);

  const apolloHelmet = mergeRawMeshes([
    latheMesh([[0.155, -0.18], [0.175, -0.14], [0.192, -0.02], [0.188, 0.08], [0.132, 0.165], [0, 0.19]], 18, false)
  ]);
  const apolloPack = mergeRawMeshes([
    bevelBoxMesh(0.28, 0.38, 0.14, 0.024),
    transformMesh(latheMesh([[0, -0.17], [0.052, -0.16], [0.052, 0.16], [0, 0.17]], 12, false), { pos: [-0.075, 0, 0.055] }),
    transformMesh(latheMesh([[0, -0.17], [0.052, -0.16], [0.052, 0.16], [0, 0.17]], 12, false), { pos: [0.075, 0, 0.055] })
  ]);

  // Unit-length limb cylinders (`y in [-0.5, +0.5]`, unit diameter ~1.0 for `orientCylinderBetween`)
  const upperLeg = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.55, -0.48], [0.57, -0.12], [0.49, -0.06], [0.47, 0.18], [0.41, 0.48], [0, 0.5]], 14, false)
  ]);
  const lowerLeg = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.44, -0.48], [0.54, -0.16], [0.46, 0.14], [0.37, 0.36], [0.39, 0.48], [0, 0.5]], 14, false)
  ]);
  const knee = mergeRawMeshes([latheMesh([[0, -0.068], [0.062, -0.032], [0.068, 0], [0.062, 0.032], [0, 0.068]], 12, false)]);

  const shoe = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.046, -0.008, 0.066, 0.126, 14),
      ellipseRingXZ(0, -0.02, -0.008, 0.068, 0.128, 14),
      ellipseRingXZ(0, 0.018, 0.008, 0.06, 0.114, 14),
      ellipseRingXZ(0, 0.046, 0.036, 0.046, 0.068, 14)
    ], true, false)
  ]);

  const upperArm = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.54, -0.46], [0.56, -0.04], [0.46, 0.02], [0.45, 0.24], [0.4, 0.48], [0, 0.5]], 12, false)
  ]);
  const lowerArm = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.48, -0.46], [0.52, -0.18], [0.41, 0.26], [0.44, 0.44], [0.37, 0.49], [0, 0.5]], 12, false)
  ]);
  const hand = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.05, 0, 0.042, 0.044, 10),
      ellipseRingXZ(0, 0, 0, 0.054, 0.052, 10),
      ellipseRingXZ(0, 0.05, 0, 0.044, 0.042, 10)
    ], true, false)
  ]);

  const racketHandle = mergeRawMeshes([
    latheMesh([[0, -0.5], [0.62, -0.49], [0.52, -0.41], [0.49, 0.36], [0.44, 0.48], [0, 0.5]], 8, false)
  ]);
  const racketThroat = mergeRawMeshes([
    loftSectionsMesh([
      ellipseRingXZ(0, -0.5, 0, 0.44, 0.62, 10),
      ellipseRingXZ(0, 0, 0, 0.42, 0.66, 10),
      ellipseRingXZ(0, 0.5, 0, 0.4, 0.6, 10)
    ], true, false)
  ]);
  const racketHoop = mergeRawMeshes([buildRacketHoopMesh()]);
  const racketStrings = mergeRawMeshes([
    latheMesh([[0, -0.003], [0.16, -0.003], [0.16, 0.003], [0, 0.003]], 20, false)
  ]);

  cachedRigSpecs = {
    torso, collar, hips, head, hair, visor, apolloHelmet, apolloPack,
    upperLeg, lowerLeg, knee, shoe, upperArm, lowerArm, hand,
    racketHandle, racketThroat, racketHoop, racketStrings
  };
  return cachedRigSpecs;
}
