/**
 * IRON CROWN far backdrops (GU47 WP-15 IC47-W1 / WP-05 procedural overhaul): a 10-60 m silhouette layer behind each
 * open-air venue so the top rows of the frame read as a place (skyline, river trawlers & harbour cranes, colosseum
 * arcade ring, Quonset hangars & stratified mesas, Himalayan rock ridge) instead of bare sky.
 *
 * Sculpted via `showcase-port-shared/proceduralKernel` + `@aura3d/engine` (`instances.custom` + `geometry.multiMaterial`
 * with `castShadow: false`, zero static GLB dependencies). Lit windows, boat lamps and hangar aprons carry
 * `practical: true` (art-direction `emissive-fill` rule). The Crown Arena is enclosed and has no far layer.
 * Layouts are fixed tables (no randomness): the venue looks the same on every load.
 */
import {
  instances,
  material,
  primitives,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  IC_MATERIALS,
  alpineRidgeSpec,
  buildFarAirbaseHangarNode,
  buildFarDockBoatNode,
  buildFarDockWarehouseNode,
  buildFarHarbourCraneNode,
  buildSkylineMegablockNode,
  colosseumArcadePierSpec,
  desertMesaSpec,
  skylineTowerSpec
} from "../art/proceduralModels";
import type { StageId } from "./stages";

type V3 = [number, number, number];
interface Part {
  position: V3;
  rotation: V3;
  scale: V3;
}
const part = (position: V3, scale: V3, rotY = 0): Part => ({ position, rotation: [0, rotY, 0], scale });

/** Deterministic 0..1 value for index i (no Math.random: the layout is fixed). */
const hash01 = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function layer(
  name: string,
  kind: "box" | "cone" | "cylinder",
  color: AuraColor,
  parts: readonly Part[],
  emissive?: { color: AuraColor; intensity: number }
) {
  const factory = kind === "box" ? primitives.box : kind === "cone" ? primitives.cone : primitives.cylinder;
  return factory({
    name,
    material: emissive
      ? material.pbr({
          color,
          emissive: emissive.color,
          emissiveIntensity: emissive.intensity,
          roughness: 0.6,
          metallic: 0,
          clearcoat: 0,
          sheen: 0,
          practical: true
        })
      : material.pbr({ color, roughness: 0.9, metallic: 0, clearcoat: 0, sheen: 0 }),
    instances: [...parts],
    castShadow: false,
    receiveShadow: false
  }).toJSON();
}

function customLayer(
  name: string,
  spec: AuraCustomGeometrySpec,
  mat: ReturnType<typeof material.pbr>,
  parts: readonly Part[]
): AuraSceneNode {
  return instances
    .custom(spec, {
      name,
      material: mat,
      transforms: parts,
      castShadow: false,
      receiveShadow: false
    })
    .toJSON();
}

/** Neo-Tokyo: three rows of stepped towers 18-50 m out, magenta/cyan window bands, and three multi-material megablocks. */
function neoTokyoSkyline(): AuraSceneNode[] {
  const towers: Part[] = [];
  const bandsMagenta: Part[] = [];
  const bandsCyan: Part[] = [];
  const rows = [
    { z: -18, count: 9, spread: 46, h: [10, 22] },
    { z: -32, count: 11, spread: 70, h: [16, 34] },
    { z: -50, count: 12, spread: 100, h: [24, 46] }
  ];
  let i = 0;
  for (const row of rows) {
    for (let k = 0; k < row.count; k += 1, i += 1) {
      const x = -row.spread / 2 + (row.spread * (k + 0.5)) / row.count + (hash01(i, 1) - 0.5) * 2.4;
      const h = row.h[0] + (row.h[1] - row.h[0]) * hash01(i, 2);
      const w = 3.2 + 2.6 * hash01(i, 3);
      towers.push(part([x, h / 2 - 0.2, row.z], [w, h, w]));
      const band = hash01(i, 4) > 0.5 ? bandsMagenta : bandsCyan;
      band.push(part([x, h * (0.55 + 0.3 * hash01(i, 5)), row.z + w / 2 + 0.05], [w * 0.82, 0.35, 0.05]));
    }
  }
  return [
    customLayer(
      "bd-neo-tokyo-rooftop-towers",
      skylineTowerSpec(),
      material.pbr({ color: "#0c1222", roughness: 0.72, metallic: 0.16, clearcoat: 0, sheen: 0 }),
      towers
    ),
    layer("bd-neo-tokyo-rooftop-bands-magenta", "box", "#2a0a1c", bandsMagenta, { color: "#ff3fa4", intensity: 0.9 }),
    layer("bd-neo-tokyo-rooftop-bands-cyan", "box", "#0a1e2a", bandsCyan, { color: "#3fe0ff", intensity: 0.8 }),
    buildSkylineMegablockNode("bd-neo-tokyo-rooftop-block-1", [-23, -0.2, -27], 26, 0.15, "#ff3fa4"),
    buildSkylineMegablockNode("bd-neo-tokyo-rooftop-block-2", [22, -0.2, -29], 22, -0.25, "#3fe0ff"),
    buildSkylineMegablockNode("bd-neo-tokyo-rooftop-block-3", [1, -0.2, -45], 34, 0.05, "#ff3fa4")
  ];
}

/** Lantern Dock: caustic river surface, four moored trawlers with mast lamps, two lattice harbour cranes, and warehouses. */
function dockRiver(): AuraSceneNode[] {
  const lamps: Part[] = [];
  const bank: Part[] = [];
  const boats: AuraSceneNode[] = [];
  const BOAT_LENGTH = 7;
  for (let i = 0; i < 4; i += 1) {
    const x = -21 + i * 14 + (hash01(i, 6) - 0.5) * 3;
    const z = -20 - 8 * hash01(i, 7);
    const yaw = (hash01(i, 8) - 0.5) * 0.5;
    const length = BOAT_LENGTH * (0.85 + 0.3 * hash01(i, 21));
    boats.push(buildFarDockBoatNode(`bd-bangkok-dock-boat-${i + 1}`, [x, -1.1, z], length, yaw));
    const mast = length * 0.3;
    lamps.push(part([x + mast * Math.cos(yaw), -1.1 + length * (1.14 / 1.9) * 0.7, z - mast * Math.sin(yaw)], [0.2, 0.28, 0.2]));
  }
  for (let i = 0; i < 14; i += 1) {
    const h = 3 + 4 * hash01(i, 9);
    bank.push(part([-52 + i * 8, h / 2 - 0.4, -46 - 4 * hash01(i, 10)], [7, h, 5]));
  }
  return [
    primitives
      .box({
        name: "bd-bangkok-dock-river",
        material: IC_MATERIALS.harborWaterCaustics,
        instances: [part([0, -0.42, -34], [140, 0.05, 44])],
        castShadow: false,
        receiveShadow: false
      })
      .toJSON(),
    ...boats,
    layer("bd-bangkok-dock-lamps", "box", "#5a3a10", lamps, { color: "#ffb04a", intensity: 1.4 }),
    layer("bd-bangkok-dock-far-bank", "box", "#3a2a20", bank),
    buildFarHarbourCraneNode("bd-bangkok-dock-crane-1", [-27, -0.4, -47], 26, 0.1),
    buildFarHarbourCraneNode("bd-bangkok-dock-crane-2", [31, -0.4, -52], 20, -0.35),
    buildFarDockWarehouseNode("bd-bangkok-dock-warehouse-1", [-6, -0.4, -53], 22, 0.08),
    buildFarDockWarehouseNode("bd-bangkok-dock-warehouse-2", [13, -0.4, -55], 18, -0.1)
  ];
}

/** Colosseum: broken outer travertine arcade wall ring 22-30 m out, sculpted piers + entablature tiers. */
function colosseumWallRing(): AuraSceneNode[] {
  const piers: Part[] = [];
  const tiers: Part[] = [];
  const radius = 26;
  for (let i = 0; i < 26; i += 1) {
    const a = -Math.PI * 0.5 + (Math.PI * i) / 25;
    const x = Math.sin(a) * radius;
    const z = -Math.cos(a) * radius - 4;
    const broken = hash01(i, 11) < 0.22;
    const h = broken ? 4 + 4 * hash01(i, 12) : 13 + 2 * hash01(i, 13);
    piers.push(part([x, h / 2, z], [1.6, h, 2.2], -a));
    if (!broken) tiers.push(part([x, 6.4, z], [3.4, 0.9, 2.4], -a), part([x, 12.2, z], [3.4, 0.8, 2.4], -a));
  }
  return [
    customLayer(
      "bd-colosseum-ruins-piers",
      colosseumArcadePierSpec(),
      material.pbr({ color: "#b89868", roughness: 0.84, metallic: 0.02, clearcoat: 0, sheen: 0 }),
      piers
    ),
    layer("bd-colosseum-ruins-tiers", "box", "#a88858", tiers)
  ];
}

/** Dustline Airstrip: three barrel-vaulted Quonset hangar clusters 30-36 m out and stratified red-rock mesas at 52-58 m. */
function airstripHangars(): AuraSceneNode[] {
  const mesas: Part[] = [];
  for (let i = 0; i < 6; i += 1) {
    const h = 6 + 6 * hash01(i, 14);
    mesas.push(part([-60 + i * 24, -0.5, -52 - 6 * hash01(i, 15)], [20 + 8 * hash01(i, 16), h, 10]));
  }
  return [
    buildFarAirbaseHangarNode("bd-desert-airbase-hangars-1", [-22, -0.2, -30], 24, 0.2),
    buildFarAirbaseHangarNode("bd-desert-airbase-hangars-2", [6, -0.2, -36], 28, -0.15),
    buildFarAirbaseHangarNode("bd-desert-airbase-hangars-3", [34, -0.2, -31], 22, 0.35),
    customLayer("bd-desert-airbase-mesas", desertMesaSpec(), IC_MATERIALS.desertMesaStrata, mesas)
  ];
}

/** Cloudstep Monastery: stratified Himalayan rock massifs and snow-capped peaks 34-59 m out. */
function monasteryRidge(): AuraSceneNode[] {
  const peaks: Part[] = [];
  const caps: Part[] = [];
  const farMassifs: Part[] = [
    part([-38, -1, -58], [42, 34, 28], 0.3),
    part([6, -1, -59], [48, 38, 30], -0.4),
    part([42, -1, -58], [40, 32, 26], 1.2)
  ];
  for (let i = 0; i < 9; i += 1) {
    const x = -64 + i * 16 + (hash01(i, 17) - 0.5) * 6;
    const z = -34 - 22 * hash01(i, 18);
    const h = 18 + 18 * hash01(i, 19);
    const r = 14 + 8 * hash01(i, 20);
    peaks.push(part([x, -0.5, z], [r, h, r]));
    caps.push(part([x, h - 0.5 - h * 0.18, z], [r * 0.36, h * 0.36, r * 0.36]));
  }
  return [
    customLayer("bd-himalayan-monastery-massifs", alpineRidgeSpec(113), IC_MATERIALS.alpinePeakStrata, farMassifs),
    customLayer(
      "bd-himalayan-monastery-ridge",
      alpineRidgeSpec(97),
      material.pbr({ color: "#4a5360", roughness: 0.86, metallic: 0.04, clearcoat: 0, sheen: 0 }),
      peaks
    ),
    layer("bd-himalayan-monastery-caps", "cone", "#e8eef6", caps)
  ];
}

/** The far backdrop nodes of a venue (empty for the enclosed Crown). */
export function venueBackdrop(id: StageId): AuraSceneNode[] {
  switch (id) {
    case "neo-tokyo-rooftop":
      return neoTokyoSkyline();
    case "bangkok-dock":
      return dockRiver();
    case "colosseum-ruins":
      return colosseumWallRing();
    case "desert-airbase":
      return airstripHangars();
    case "himalayan-monastery":
      return monasteryRidge();
    case "crown-arena":
      return [];
  }
}
