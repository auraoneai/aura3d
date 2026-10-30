/**
 * IRON CROWN far backdrops (GU47 WP-15 IC47-W1): a 10-60 m silhouette layer behind each open-air venue so the top rows
 * of the frame read as a place (skyline, river boats, colosseum wall ring, hangars, ridge) instead of bare sky.
 *
 * Interim until the WP-36 backdrop assets (ridge, wall ring, 3 tower blocks) land: instanced primitives, at most four
 * draws per venue (budget <= 60), no shadows cast, inside each venue's fog. Lit windows and boat lamps are practicals
 * (art-direction `emissive-fill` rule). The Crown Arena is enclosed (back wall at 12 m) and has no far layer.
 * Layouts are fixed tables (no randomness): the venue looks the same on every load.
 */
import { material, primitives, type AuraColor, type AuraSceneNode } from "@aura3d/engine";
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

function layer(name: string, kind: "box" | "cone" | "cylinder", color: AuraColor, parts: readonly Part[], emissive?: { color: AuraColor; intensity: number }) {
  const factory = kind === "box" ? primitives.box : kind === "cone" ? primitives.cone : primitives.cylinder;
  return factory({
    name,
    material: emissive
      ? material.pbr({ color, emissive: emissive.color, emissiveIntensity: emissive.intensity, roughness: 0.6, metallic: 0, practical: true })
      : material.pbr({ color, roughness: 0.92, metallic: 0 }),
    instances: [...parts],
    castShadow: false,
    receiveShadow: false
  }).toJSON();
}

/** Neo-Tokyo: three rows of towers 18-52 m out, with magenta and cyan window bands. */
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
    layer("bd-neo-tokyo-rooftop-towers", "box", "#0c1222", towers),
    layer("bd-neo-tokyo-rooftop-bands-magenta", "box", "#2a0a1c", bandsMagenta, { color: "#ff3fa4", intensity: 0.9 }),
    layer("bd-neo-tokyo-rooftop-bands-cyan", "box", "#0a1e2a", bandsCyan, { color: "#3fe0ff", intensity: 0.8 })
  ];
}

/** Lantern Dock: the river 12-60 m out, moored long-tail boats with lamps, and the far bank's low shophouses. */
function dockRiver(): AuraSceneNode[] {
  const hulls: Part[] = [];
  const lamps: Part[] = [];
  const bank: Part[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = -21 + i * 7 + (hash01(i, 6) - 0.5) * 2;
    const z = -19 - 9 * hash01(i, 7); // beyond the deck edge (z -16)
    const yaw = (hash01(i, 8) - 0.5) * 0.6;
    hulls.push(part([x, -0.15, z], [4.4, 0.5, 1.1], yaw));
    lamps.push(part([x + 1.4, 0.75, z], [0.16, 0.22, 0.16]));
  }
  for (let i = 0; i < 14; i += 1) {
    const h = 3 + 4 * hash01(i, 9);
    bank.push(part([-52 + i * 8, h / 2 - 0.4, -46 - 4 * hash01(i, 10)], [7, h, 5]));
  }
  return [
    layer("bd-bangkok-dock-river", "box", "#1c3a3a", [part([0, -0.42, -34], [140, 0.05, 44])]),
    layer("bd-bangkok-dock-boats", "box", "#3b2414", hulls),
    layer("bd-bangkok-dock-lamps", "box", "#5a3a10", lamps, { color: "#ffb04a", intensity: 1.4 }),
    layer("bd-bangkok-dock-far-bank", "box", "#3a2a20", bank)
  ];
}

/** Colosseum: the broken outer wall ring 22-30 m out, two arcade tiers with gaps. */
function colosseumWallRing(): AuraSceneNode[] {
  const piers: Part[] = [];
  const tiers: Part[] = [];
  const radius = 26;
  for (let i = 0; i < 26; i += 1) {
    const a = -Math.PI * 0.5 + (Math.PI * i) / 25; // a half ring behind the fight
    const x = Math.sin(a) * radius;
    const z = -Math.cos(a) * radius - 4;
    const broken = hash01(i, 11) < 0.22;
    const h = broken ? 4 + 4 * hash01(i, 12) : 13 + 2 * hash01(i, 13);
    piers.push(part([x, h / 2, z], [1.6, h, 2.2], -a));
    if (!broken) tiers.push(part([x, 6.4, z], [3.4, 0.9, 2.4], -a), part([x, 12.2, z], [3.4, 0.8, 2.4], -a));
  }
  return [layer("bd-colosseum-ruins-piers", "box", "#b89868", piers), layer("bd-colosseum-ruins-tiers", "box", "#a88858", tiers)];
}

/** Dustline Airstrip: three hangars with vaulted roofs 24-40 m out and the mesa line at 55 m. */
function airstripHangars(): AuraSceneNode[] {
  const walls: Part[] = [];
  const roofs: Part[] = [];
  const mesas: Part[] = [];
  [-18, 0, 18].forEach((x, i) => {
    const z = -26 - 6 * i * 0.5;
    walls.push(part([x, 3, z], [14, 6, 12]));
    // A vault: a cylinder on its side (rotated about z), its axis running front to back.
    roofs.push({ position: [x, 6, z], rotation: [Math.PI / 2, 0, 0], scale: [14, 12, 5] });
  });
  for (let i = 0; i < 6; i += 1) {
    const h = 6 + 6 * hash01(i, 14);
    mesas.push(part([-60 + i * 24, h / 2 - 0.5, -52 - 6 * hash01(i, 15)], [20 + 8 * hash01(i, 16), h, 10]));
  }
  return [
    layer("bd-desert-airbase-hangar-walls", "box", "#6a5a48", walls),
    layer("bd-desert-airbase-hangar-roofs", "cylinder", "#7a6a56", roofs),
    layer("bd-desert-airbase-mesas", "box", "#8a5a3a", mesas)
  ];
}

/** Cloudstep Monastery: the snow ridge 30-60 m out, rock flanks and white caps. */
function monasteryRidge(): AuraSceneNode[] {
  const peaks: Part[] = [];
  const caps: Part[] = [];
  for (let i = 0; i < 9; i += 1) {
    const x = -64 + i * 16 + (hash01(i, 17) - 0.5) * 6;
    const z = -34 - 22 * hash01(i, 18);
    const h = 18 + 18 * hash01(i, 19);
    const r = 14 + 8 * hash01(i, 20);
    peaks.push(part([x, h / 2 - 0.5, z], [r, h, r]));
    caps.push(part([x, h - 0.5 - h * 0.18, z], [r * 0.36, h * 0.36, r * 0.36]));
  }
  return [layer("bd-himalayan-monastery-ridge", "cone", "#4a5360", peaks), layer("bd-himalayan-monastery-caps", "cone", "#e8eef6", caps)];
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
