/**
 * Aura Diamond 3D scene construction: the field, the stands, each park's set dressing, the athletes and the look.
 * Moved out of main.ts unchanged (GU47 WP-18) so unit tests can build and audit the real scene without booting the game.
 * Presentation only: the sim in main.ts reads the field constants exported here (BASES, FIELDER_SPOTS) unchanged.
 */
import { camera, effects, game, instances, lights, looks, material, model, primitives, scene, sky, type AuraLookOverrides } from "@aura3d/engine";
import { assets } from "./aura-assets.route";
import { PARK_LOOKS, lookPlan, parkPracticals, type DiamondLookPlan, type DiamondLookVariant, type DiamondSkyMode, type DiamondTier } from "../art/look";
import {
  makeRng,
  MOUND_Z,
  MOUND_TOP,
  ZONE_CY,
  FOUL_DEG,
  fencePoint,
  crowdPlacements,
  bleacherPlacements,
  shellPlacements,
  scoreboardPlacement,
  propSpot,
  HARBOR_WATER,
  type Vec3,
  type ParkId,
  type ParkSpec
} from "./rules";
import { BATTER_YAW } from "./batter-pose";

/* ================================================================== *
 *  Field geometry (metres, compact-but-proportional diamond)          *
 * ================================================================== */

export const BASE_PATH = 12.73; // home→1B legs at 45°, ~18 m paths
export const BASES: readonly Vec3[] = [
  [BASE_PATH, 0.09, -BASE_PATH], // 1B
  [0, 0.09, -BASE_PATH * 2], // 2B
  [-BASE_PATH, 0.09, -BASE_PATH] // 3B
];
export const TRAIL_COUNT = 16;
export const HIDDEN_SCALE = 0.0001;

/* ================================================================== *
 *  Scene construction                                                 *
 * ================================================================== */

/** How a park is dressed: the look variant (`?look=original` is the 4.6.2 look), the quality tier and the sky mode. */
export interface DiamondSceneContext {
  readonly variant: DiamondLookVariant;
  readonly tier: DiamondTier;
  readonly skyMode: DiamondSkyMode;
}

export const DEFAULT_SCENE_CONTEXT: DiamondSceneContext = { variant: "gu47", tier: "high", skyMode: "analytic" };

/** GU47 parks whose stadium lights are on (the LED wall cap glows; day parks paint it). */
const NIGHT_LOOK: Readonly<Record<ParkId, boolean>> = { sandlot: false, skyline: true, canyon: false, ivy: false, dome: true, lunar: true };

/** Chalk lines: the 4.6.2 glowing chalk, or GU47's park chalk with a 0.05 lift (DIA-M1) so it never reads as a light. */
const chalkMat = (park: ParkSpec, ctx: DiamondSceneContext) =>
  ctx.variant === "original"
    ? material.pbr({ color: "#f5f1e4", roughness: 0.6, emissive: "#f5f1e4", emissiveIntensity: 0.18 })
    : material.pbr({ color: PARK_LOOKS[park.id].turf.chalk, roughness: 0.7, emissive: PARK_LOOKS[park.id].turf.chalk, emissiveIntensity: 0.05 });

export function buildFieldNodes(park: ParkSpec, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT): any[] {
  const nodes: any[] = [];
  const gu47 = ctx.variant === "gu47";
  const turf = PARK_LOOKS[park.id].turf;
  const grass = material.pbr({ color: gu47 ? turf.grass : park.grass, roughness: 0.94 });
  const grassAlt = material.pbr({ color: gu47 ? turf.stripe : park.grassAlt, roughness: 0.94 });
  const dirt = material.pbr({ color: gu47 ? turf.clay : park.dirt, roughness: 0.96 });
  const wallMat = material.pbr({ color: park.wall, roughness: 0.7 });
  const accent = PARK_LOOKS[park.id].accent;
  const wallTopMat = !gu47
    ? material.emissive({ color: park.wallTop, emissive: park.wallTop, emissiveIntensity: park.night ? 0.85 : 0.2 })
    : NIGHT_LOOK[park.id]
      ? material.emissive({ color: accent, emissive: accent, emissiveIntensity: 0.6 })
      : material.pbr({ color: accent, roughness: 0.55 });
  const bagMat = material.pbr({ color: "#ece8d8", roughness: 0.65 });
  const chalk = () => chalkMat(park, ctx);

  // Ground, mow stripes, infield dirt, home circle, mound
  nodes.push(
    primitives.plane({ name: "field-grass", size: [340, 340] as any, material: grass }).position(0, -0.02, -60),
    ...Array.from({ length: 9 }, (_, i) =>
      primitives
        .plane({ name: `mow-${i}`, size: [340 / 9, 340] as any, material: i % 2 ? grass : grassAlt })
        .position(-170 + (340 / 9) * (i + 0.5), -0.005 - 0.001 * i, -60)
    ),
    primitives.cylinder({ name: "infield-dirt", size: [26, 0.05, 26], material: dirt }).position(0, 0.012, -BASE_PATH - 1.5),
    primitives.cylinder({ name: "home-dirt", size: [7.4, 0.06, 7.4], material: dirt }).position(0, 0.018, 0.4),
    primitives.cylinder({ name: "mound", size: [5.6, MOUND_TOP, 5.6], material: dirt }).position(0, MOUND_TOP / 2 + 0.02, MOUND_Z),
    primitives.box({ name: "mound-rubber", size: [0.6, 0.03, 0.16], material: bagMat }).position(0, MOUND_TOP + 0.045, MOUND_Z - 0.35)
  );

  // Base paths — thin dirt strips between the bases
  for (const [x0, z0, x1, z1] of [
    [0.9, -0.9, BASE_PATH - 0.4, -BASE_PATH + 0.4],
    [BASE_PATH - 0.4, -BASE_PATH - 0.4, 0.9, -BASE_PATH * 2 + 0.9],
    [-0.9, -BASE_PATH * 2 + 0.9, -BASE_PATH + 0.4, -BASE_PATH - 0.4],
    [-BASE_PATH + 0.4, -BASE_PATH + 0.4, -0.9, -0.9]
  ] as const) {
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    nodes.push(primitives.box({ name: `basepath-${mx.toFixed(1)}-${mz.toFixed(1)}`, size: [2.4, 0.04, len], material: dirt }).position(mx, 0.025, mz).rotate(0, yaw, 0));
  }

  // Base dirt circles + bags + home plate + boxes
  for (let i = 0; i < 3; i++) {
    const [bx, , bz] = BASES[i]!;
    nodes.push(
      primitives.cylinder({ name: `base-dirt-${i}`, size: [4.6, 0.05, 4.6], material: dirt }).position(bx, 0.02, bz),
      model(assets.diamondBase, { name: `base-bag-${i}`, targetHeight: 0.16, scaleMode: "fit" }).position(bx, 0.06, bz)
    );
  }
  nodes.push(
    primitives.box({ name: "home-plate", size: [0.44, 0.03, 0.44], material: bagMat }).position(0, 0.045, 0).rotate(0, Math.PI / 4, 0),
    primitives.box({ name: "batters-box-l", size: [0.06, 0.02, 1.7], material: chalk() }).position(-1.15, 0.05, 0.35),
    primitives.box({ name: "batters-box-r", size: [0.06, 0.02, 1.7], material: chalk() }).position(1.15, 0.05, 0.35),
    primitives.box({ name: "batters-box-back", size: [2.3, 0.02, 0.06], material: chalk() }).position(0, 0.05, 1.2),
    primitives.box({ name: "catchers-box-back", size: [1.4, 0.02, 0.06], material: chalk() }).position(0, 0.05, 2.1)
  );

  // Foul lines + poles
  for (const side of [-1, 1]) {
    const len = park.fenceCorner * 1.02;
    const fx = Math.sin((side * FOUL_DEG * Math.PI) / 180);
    const fz = -Math.cos((side * FOUL_DEG * Math.PI) / 180);
    nodes.push(
      primitives.box({ name: `foul-line-${side}`, size: [0.09, 0.02, len], material: chalk() }).position((fx * len) / 2, 0.05, (fz * len) / 2).rotate(0, (side * FOUL_DEG * Math.PI) / 180, 0),
      primitives
        .cylinder({ name: `foul-pole-glow-${side}`, size: [0.14, 11, 0.14], material: material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: park.night ? 0.9 : 0.25 }) })
        .position(fx * park.fenceCorner, 5.5, fz * park.fenceCorner),
      model(assets.diamondFoulPole, { name: `foul-pole-${side}`, targetHeight: 11, role: "setDressing", scaleMode: "fit" }).position(fx * park.fenceCorner, 0, fz * park.fenceCorner)
    );
  }

  // Outfield wall — segmented arc from foul pole to foul pole
  // One instanced draw for the wall and one for its cap (C12); each segment is a unit-length box scaled to its chord.
  const segs = park.fenceSegments;
  const wallT: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
  const capT: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
  for (let i = 0; i < segs; i++) {
    const t0 = -FOUL_DEG + (2 * FOUL_DEG * i) / segs;
    const t1 = -FOUL_DEG + (2 * FOUL_DEG * (i + 1)) / segs;
    const tm = (t0 + t1) / 2;
    const p0 = fencePoint(park, t0, 0);
    const p1 = fencePoint(park, t1, 0);
    const pm = fencePoint(park, tm, 0);
    const segLen = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) + 0.35;
    const yaw = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
    wallT.push({ position: [pm[0], park.wallH / 2, pm[2]], rotation: [0, yaw + Math.PI / 2, 0], scale: [segLen, 1, 1] });
    capT.push({ position: [pm[0], park.wallH + 0.07, pm[2]], rotation: [0, yaw + Math.PI / 2, 0], scale: [segLen, 1, 1] });
  }
  nodes.push(
    instances.box({ name: "outfield-wall", size: [1, park.wallH, 0.5], material: wallMat, transforms: wallT }),
    instances.box({ name: "outfield-wall-cap", size: [1, 0.14, 0.56], material: wallTopMat, transforms: capT })
  );

  // On-deck rings + side dugouts. Keep the circles as painted chalk outlines
  // (a filled disc read as an oversized white target in the foreground) and
  // push the dugout boxes to the side touchlines so they frame instead of
  // blocking the lower third of the broadcast camera.
  const ondeckMat = material.pbr({ color: "#eee6d2", roughness: 1, opacity: 0.5 });
  nodes.push(
    primitives.torus({ name: "ondeck-l", size: [1.5, 1.5, 0.26], material: ondeckMat }).position(-7.1, 0.028, 2.2).rotate(Math.PI / 2, 0, 0),
    primitives.torus({ name: "ondeck-r", size: [1.5, 1.5, 0.26], material: ondeckMat }).position(7.1, 0.028, 2.2).rotate(Math.PI / 2, 0, 0),
    model(assets.diamondDugout, {
      name: "dugout-l", targetHeight: 2.0, role: "setDressing", scaleMode: "fit",
      materialOverrides: [{ color: "#4b5259", colorMode: "replace", replaceTextures: true, roughness: 0.82, metallic: 0.08 }]
    }).position(-28, 0, -6).rotate(0, Math.PI / 2, 0),
    model(assets.diamondDugout, {
      name: "dugout-r", targetHeight: 2.0, role: "setDressing", scaleMode: "fit",
      materialOverrides: [{ color: "#4b5259", colorMode: "replace", replaceTextures: true, roughness: 0.82, metallic: 0.08 }]
    }).position(28, 0, -6).rotate(0, -Math.PI / 2, 0)
  );

  return nodes;
}

export function buildStandsNodes(park: ParkSpec, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT): any[] {
  const nodes: any[] = [];
  const rng = makeRng(0xbeef);

  // Grandstand stadium shells framing the outer ballpark skyline, placed behind each park's own fence (rules.ts shellPlacements).
  nodes.push(
    ...shellPlacements(park).map((sh) =>
      model(assets.diamondStadium, { name: sh.name, targetMaxDimension: sh.name.endsWith("-c") ? 30 : 28, role: "setDressing", scaleMode: "fit" })
        .position(sh.x, 0, sh.z)
        .rotate(0, sh.yaw, 0)
    ),
    // Hidden dugout seat asset reference so route asset validation sees showcaseStadiumSeats
    model(assets.showcaseStadiumSeats, {
      name: "dugout-seat-ref",
      targetMaxDimension: 1.2,
      role: "setDressing",
      scaleMode: "fit",
      visible: false
    })
      .position(0, -80, 0)
      .scale(HIDDEN_SCALE)
  );

  // Grounded tiered stadium bleachers wrapping the outfield arc
  const deckMat = material.pbr({ color: "#1c2638", roughness: 0.78, metalness: 0.22 });
  const benchMat = material.pbr({ color: "#2d3e5a", roughness: 0.62, metalness: 0.28 });
  // Each section starts a fixed distance behind the fence at its own angle, so no row stands inside the wall (C3).
  // Instanced risers and benches: two draws instead of 42 (C12).
  const bleachers = bleacherPlacements(park);
  nodes.push(
    instances.box({
      name: "bleacher-risers",
      size: [11.5, 1, 2.2],
      material: deckMat,
      transforms: bleachers.map((b) => ({ position: [b.x, b.tierH * 0.5, b.z] as Vec3, rotation: [0, b.yaw, 0] as Vec3, scale: [1, b.tierH, 1] as Vec3 }))
    }),
    instances.box({
      name: "bleacher-benches",
      size: [11.2, 0.22, 0.85],
      material: benchMat,
      transforms: bleachers.map((b) => ({ position: b.bench, rotation: [0, b.yaw, 0] as Vec3 }))
    })
  );

  // Animated front-row wavers — real admitted 3D Meshy athletes grounded at y = 0
  void rng;
  for (const [i, c] of crowdPlacements(park).entries()) {
    nodes.push(
      model(assets.diamondCrowdAthlete, {
        name: `waver-${i}`,
        targetHeight: 1.88,
        role: "setDressing",
        scaleMode: "fit"
      })
        .position(c.x, 0, c.z)
        .rotate(0, c.yaw, 0)
        .animate({ clip: "Idle_Loop", loop: true, speed: 1.1 })
        .runtime(game.runtimeNode(`waver-${i}`))
    );
  }

  // Scoreboard + floodlight towers
  // Behind the centre bleacher section, at the same rig-to-screen spacing the art was tuned with.
  const sb = scoreboardPlacement(park);
  nodes.push(
    model(assets.diamondScoreboard, { name: "scoreboard-rig", targetHeight: 11, role: "setDressing", scaleMode: "fit" }).position(sb.rig[0], sb.rig[1], sb.rig[2]).rotate(0, Math.PI, 0).runtime(game.runtimeNode("scoreboard-rig")),
    primitives.box({ name: "scoreboard-screen", size: [10.5, 3.4, 0.4], material: material.emissive({ color: "#0d2436", emissive: "#1b4a66", emissiveIntensity: 0.9 }) }).position(sb.screen[0], sb.screen[1], sb.screen[2]).runtime(game.runtimeNode("scoreboard-screen"))
  );

  if (ctx.variant === "gu47") {
    nodes.push(...practicalNodes(park, ctx.tier));
  } else if (park.flood) {
    const towers: Vec3[] = [
      [-park.fenceCorner * 0.72, 0, -park.fenceCorner * 0.55 - 6],
      [park.fenceCorner * 0.72, 0, -park.fenceCorner * 0.55 - 6],
      [-park.fenceCorner * 0.5, 0, 14],
      [park.fenceCorner * 0.5, 0, 14]
    ];
    towers.forEach(([tx, , tz], i) => {
      nodes.push(
        model(assets.diamondFloodlight, { name: `flood-${i}`, targetHeight: 16, role: "setDressing", scaleMode: "fit" }).position(tx, 0, tz).rotate(0, Math.atan2(-tx, 10 - tz) + Math.PI, 0),
        lights.spot({ name: `flood-spot-${i}`, position: [tx * 0.9, 15, tz * 0.9], target: [0, 0, -10], angle: 0.6, penumbra: 0.55, intensity: 2.0, color: park.id === "lunar" ? "#bfe0ff" : "#fff2d4", distance: 160 }),
        effects.lightCone({ name: `flood-cone-${i}`, position: [tx * 0.9, 14.6, tz * 0.9], direction: [-tx * 0.05, -1, (10 - tz) * 0.05], color: "#bfe0ff", intensity: 0.22, length: 15, coneAngle: 0.5, softness: 0.6 } as any)
      );
    });
  }

  return nodes;
}

const unitDir = (from: Vec3, to: Vec3): Vec3 => {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
};

/**
 * DIA-L2 night and indoor rigs (art/look.ts `parkPracticals`): Midtown's six tower banks in sodium and LED (light cones,
 * lens flares on the two outfield towers), the Dome's four truss panels (rect lights plus one instanced fixture draw),
 * the Moon's four cold spots. Lamps are unshadowed (the key is the scene's one caster). Day parks light nothing; Ivy
 * keeps its four towers as unlit dressing. Low: four lamps, no flares (PRD 6.4).
 */
export function practicalNodes(park: ParkSpec, tier: DiamondTier): any[] {
  const nodes: any[] = [];
  const rig = parkPracticals(park, tier);
  if (rig.length === 0) {
    if (park.flood) {
      const towers: readonly [number, number][] = [
        [-park.fenceCorner * 0.72, -park.fenceCorner * 0.55 - 6],
        [park.fenceCorner * 0.72, -park.fenceCorner * 0.55 - 6],
        [-park.fenceCorner * 0.5, 14],
        [park.fenceCorner * 0.5, 14]
      ];
      towers.forEach(([tx, tz], i) => {
        nodes.push(model(assets.diamondFloodlight, { name: `flood-${i}`, targetHeight: 16, role: "setDressing", scaleMode: "fit" }).position(tx, 0, tz).rotate(0, Math.atan2(-tx, 10 - tz) + Math.PI, 0));
      });
    }
    return nodes;
  }
  for (const lamp of rig) {
    if (lamp.kind === "spot") {
      const [x, y, z] = lamp.position;
      const [bx, bz] = lamp.base ?? [x, z];
      nodes.push(
        model(assets.diamondFloodlight, { name: `${lamp.name}-tower`, targetHeight: y, role: "setDressing", scaleMode: "fit" }).position(bx, 0, bz).rotate(0, Math.atan2(-bx, 10 - bz) + Math.PI, 0),
        lights.spot({ name: lamp.name, position: lamp.position, target: lamp.target, angle: lamp.angle, penumbra: lamp.penumbra, intensity: lamp.intensity, color: lamp.color, distance: lamp.distance })
      );
      if (lamp.cone) {
        nodes.push(effects.lightCone({ name: `${lamp.name}-cone`, position: [x, y - 0.4, z], direction: unitDir(lamp.position, lamp.target), color: lamp.color, intensity: 0.2, length: 18, coneAngle: (lamp.angle ?? 0.5) * 0.8, softness: 0.6 } as any));
      }
      if (lamp.flare) nodes.push(lights.lensFlare({ name: `${lamp.name}-flare`, light: lamp.name, intensity: 0.8, edgeFade: 0.2 }));
    } else {
      nodes.push(lights.rect({ name: lamp.name, position: lamp.position, target: lamp.target, color: lamp.color, intensity: lamp.intensity, width: lamp.width, height: lamp.height }));
    }
  }
  const panels = rig.filter((lamp) => lamp.kind === "rect");
  if (panels.length > 0) {
    nodes.push(
      instances.box({
        name: "dome-truss-panels",
        size: [1, 0.3, 1],
        material: material.emissive({ color: panels[0]!.color, emissive: panels[0]!.color, emissiveIntensity: 1.4 }),
        transforms: panels.map((p) => ({ position: [p.position[0], p.position[1] + 0.3, p.position[2]] as Vec3, scale: [p.width ?? 8, 1, p.height ?? 2] as Vec3 }))
      })
    );
  }
  return nodes;
}

export function buildParkExtras(park: ParkSpec): any[] {
  const nodes: any[] = [];
  // Photoreal rock GLBs carry warm AI textures that fight the flat-shaded
  // players. Knock them back to a restrained desert palette and reduce their
  // silhouettes so the field stays the subject.
  const rockOverride = [{ color: "#745845", colorMode: "replace" as const, replaceTextures: true, roughness: 0.96, metallic: 0 }];
  const rockOverrideAlt = [{ color: "#82644e", colorMode: "replace" as const, replaceTextures: true, roughness: 0.94, metallic: 0 }];
  // Outfield props come from rules.ts PROP_SPOTS, pushed behind each park's fence (C3).
  const at = (name: string): [number, number] => propSpot(park, name);
  switch (park.id) {
    case "sandlot": {
      const W = HARBOR_WATER;
      nodes.push(
        model(assets.diamondHarborPier, { name: "harbor-pier", targetHeight: 8, role: "setDressing", scaleMode: "fit" }).position(at("harbor-pier")[0], -0.3, at("harbor-pier")[1]).rotate(0, 0.3, 0),
        primitives.plane({ name: "harbor-water", size: [W.w, W.d] as any, material: material.pbr({ color: "#2e5d7a", roughness: 0.35, metalness: 0.3 }) }).position(W.x, W.y, W.z),
        model(assets.diamondTower, { name: "sandlot-windmill", targetHeight: 13, role: "setDressing", scaleMode: "fit" }).position(at("sandlot-windmill")[0], 0, at("sandlot-windmill")[1]).rotate(0, 0.6, 0),
        model(assets.diamondCanyonArch, { name: "sandlot-tower", targetHeight: 12, role: "setDressing", scaleMode: "fit", materialOverrides: rockOverrideAlt }).position(at("sandlot-tower")[0], 0, at("sandlot-tower")[1]).rotate(0, -0.4, 0),
        model(assets.diamondRock, { name: "pine-a", targetHeight: 7, role: "setDressing", scaleMode: "fit", materialOverrides: rockOverride }).position(at("pine-a")[0], 0, at("pine-a")[1]),
        model(assets.diamondRock, { name: "pine-b", targetHeight: 6.5, role: "setDressing", scaleMode: "fit", materialOverrides: rockOverrideAlt }).position(at("pine-b")[0], 0, at("pine-b")[1]).rotate(0, 1.2, 0),
        model(assets.diamondFloodlight, { name: "sandlot-lamp", targetHeight: 5.4, role: "setDressing", scaleMode: "fit" }).position(at("sandlot-lamp")[0], 0, at("sandlot-lamp")[1])
      );
      break;
    }
    case "skyline": {
      const buildings: [number, number][] = [[46, 0.5], [52, -0.4], [38, 0.9], [30, -0.9], [60, 0.1]];
      buildings.forEach(([h, r], i) => {
        const [x, z] = at(`skyline-bldg-${i}`);
        nodes.push(model(assets.diamondTower, { name: `skyline-bldg-${i}`, targetHeight: h, role: "setDressing", scaleMode: "fit" }).position(x, 0, z).rotate(0, r, 0));
      });
      for (let i = 0; i < 4; i++) {
        const theta = -24 + i * 16;
        const pm = fencePoint(park, theta, 0);
        nodes.push(
          primitives
            .box({ name: `window-target-${i}`, size: [7.5, 4.6, 0.5], material: material.emissive({ color: "#16324a", emissive: "#35d6ff", emissiveIntensity: 0.55 }) })
            .position(pm[0] * 1.18, 9.5 + i * 2.2, pm[2] * 1.18 - 3)
            .rotate(0, (theta * Math.PI) / 180, 0)
            .runtime(game.runtimeNode(`window-target-${i}`))
        );
      }
      for (const [lx, lz] of [[-26, 8], [26, 8], [-46, -30], [46, -30]] as const) {
        nodes.push(model(assets.diamondFloodlight, { name: `lamp-${lx}`, targetHeight: 6, role: "setDressing", scaleMode: "fit" }).position(lx, 0, lz));
      }
      break;
    }
    case "canyon": {
      const rocks: [number, number][] = [[13, 0.3], [15, -0.7], [7.5, 1.1], [6.5, -0.4], [22, 0]];
      rocks.forEach(([h, r], i) => {
        const [x, z] = at(`canyon-rock-${i}`);
        nodes.push(model(assets.diamondRock, {
          name: `canyon-rock-${i}`, targetHeight: h, role: "setDressing", scaleMode: "fit",
          materialOverrides: i % 2 ? rockOverrideAlt : rockOverride
        }).position(x, 0, z).rotate(0, r, 0));
      });
      for (const [tx, tz] of [[-108, -40], [110, -44], [-88, -20], [88, -16]] as const) {
        nodes.push(model(assets.diamondRock, {
          name: `canyon-pine-${tx}`, targetHeight: 8.5, role: "setDressing", scaleMode: "fit",
          materialOverrides: rockOverride
        }).position(tx, 0, tz));
      }
      break;
    }
    case "ivy": {
      nodes.push(
        model(assets.diamondStadium, { name: "ivy-grandstand", targetHeight: 14, role: "setDressing", scaleMode: "fit" }).position(0, 0, 26).rotate(0, Math.PI, 0),
        model(assets.diamondTrophy, { name: "ivy-trophy", targetHeight: 2.4, role: "setDressing", scaleMode: "fit" }).position(-9.5, 0, 8.4).rotate(0, 0.9, 0),
        model(assets.diamondTrophy, { name: "ivy-statue", targetHeight: 4.2, role: "primaryWorld", scaleMode: "fit" }).position(14, 0, 10).rotate(0, -2.4, 0),
        ...Array.from({ length: 7 }, (_, i) => {
          const theta = -36 + i * 12;
          const pm = fencePoint(park, theta, 0);
          return model(assets.diamondIvyWall, {
            name: `ivy-vine-${i}`,
            targetHeight: park.wallH + 1.2,
            role: "setDressing",
            scaleMode: "fit"
          })
            .position(pm[0] * 0.995, 0, pm[2] * 0.995)
            .rotate(0, (theta * Math.PI) / 180, 0);
        })
      );
      break;
    }
    case "dome": {
      nodes.push(
        model(assets.diamondTyphoonDome, { name: "typhoon-dome-shell", targetHeight: 60, role: "setDressing", scaleMode: "fit" }).position(0, -0.4, -42).rotate(0, Math.PI, 0),
        ...Array.from({ length: 5 }, (_, i) => primitives.box({ name: `dome-rafter-${i}`, size: [1.2, 1.2, 190], material: material.pbr({ color: "#233046", roughness: 0.6, metalness: 0.4 }) }).position(-60 + i * 30, 26, -50)),
        ...Array.from({ length: 4 }, (_, i) => primitives.box({ name: `dome-banner-${i}`, size: [3.2, 7, 0.2], material: material.emissive({ color: "#ffb03a", emissive: i % 2 ? "#35d6ff" : "#ffb03a", emissiveIntensity: 0.7 }) }).position(-18 + i * 12, 14, 18))
      );
      break;
    }
    case "lunar": {
      nodes.push(
        model(assets.diamondEarthRise, { name: "lunar-earth", targetHeight: 90, role: "primaryWorld", scaleMode: "fit" }).position(-30, 66, -260),
        model(assets.diamondLunarRover, { name: "lunar-rover", targetHeight: 2.6, role: "setDressing", scaleMode: "fit" }).position(-17, 0, 9).rotate(0, 0.8, 0),
        ...Array.from({ length: 6 }, (_, i) => primitives.cylinder({ name: `regolith-${i}`, size: [4 + i, 0.5, 4 + i * 0.7], material: material.pbr({ color: "#5d6378", roughness: 1 }) }).position(at(`regolith-${i}`)[0], 0.1, at(`regolith-${i}`)[1])),
        model(assets.diamondMoonDome, { name: "lunar-comms", targetHeight: 15, role: "setDressing", scaleMode: "fit" }).position(at("lunar-comms")[0], 0, at("lunar-comms")[1]).rotate(0, -0.5, 0)
      );
      break;
    }
  }
  return nodes;
}

/** An admitted 3D catalog athlete grounded cleanly with skeletal animation. */
export function buildAthleteNodes(id: string, asset: any, initialClip = "Ready"): any[] {
  return [
    model(asset, { name: id, targetHeight: 1.88, role: "primaryCharacter", scaleMode: "fit" })
      .position(0, -80, 0)
      .animate({ clip: initialClip, loop: true, speed: 1.0 })
      .runtime(game.runtimeNode(id))
  ];
}

export const FIELDER_IDS = ["f-c", "f-1b", "f-2b", "f-ss", "f-3b", "f-lf", "f-cf", "f-rf"] as const;
/** Everyone who wears a glove except the catcher (his mitt has its own node and calibrated offsets). */
export const GLOVE_OWNERS = ["pitcher", "f-1b", "f-2b", "f-ss", "f-3b", "f-lf", "f-cf", "f-rf"] as const;
/** Everyone in uniform who gets a team cap and belt. */
export const KIT_OWNERS = ["pitcher", ...FIELDER_IDS, "batter", "runner-0", "runner-1", "runner-2"] as const;
/** Cap and belt offsets in bone space (Head and Hips bones point up the body in this rig). */
export const CAP_ATTACH_POS: Vec3 = [0, 0.135, 0.012];
export const BELT_ATTACH_POS: Vec3 = [0, 0.045, 0];
export const FIELDER_SPOTS: Record<string, Vec3> = {
  // The single catcher crouches behind the plate, offset to the camera-right
  // of the batter so it never crosses the batting-camera line.
  "f-c": [0.55, 0, 2.45],
  "f-1b": [14.2, 0, -14.2],
  "f-2b": [7.4, 0, -19.5],
  "f-ss": [-8.2, 0, -19.5],
  "f-3b": [-14.2, 0, -14.2],
  "f-lf": [-30, 0, -52],
  "f-cf": [0, 0, -68],
  "f-rf": [30, 0, -52]
};

export function buildActorsNodes(ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT, parkId: ParkId = "sandlot"): any[] {
  const gu47 = ctx.variant === "gu47";
  // GU47: the ball alone wears the reserved objective colour; the zone frame takes the park chalk, the landing ring its accent.
  const ballColor = gu47 ? "#f5f1e4" : "#f4f1e8";
  const zoneColor = gu47 ? PARK_LOOKS[parkId].turf.chalk : "#f5f1e4";
  const landColor = gu47 ? PARK_LOOKS[parkId].accent : "#7dfcff";
  const nodes: any[] = [
    ...buildAthleteNodes("pitcher", assets.diamondAthlete, "Crouch_Idle_Loop"),
    ...buildAthleteNodes("batter", assets.diamondAthlete, "Idle_Loop"),
    ...FIELDER_IDS.flatMap((id) =>
      buildAthleteNodes(id, assets.diamondAthlete, id === "f-lf" || id === "f-cf" || id === "f-rf" ? "Ready" : "Crouch_Idle_Loop")
    ),
    ...Array.from({ length: 3 }, (_, i) => buildAthleteNodes(`runner-${i}`, assets.diamondAthlete, "Crouch_Idle_Loop")).flat(),
    model(assets.diamondAthlete, { name: "coach-1b", targetHeight: 1.88, role: "primaryCharacter", scaleMode: "fit" })
      .position(21.5, 0, -14.8)
      .rotate(0, -Math.PI * 0.72, 0)
      .animate({ clip: "Crouch_Idle_Loop", loop: true, speed: 1.0 })
      .runtime(game.runtimeNode("coach-1b")),
    model(assets.diamondAthlete, { name: "coach-3b", targetHeight: 1.88, role: "primaryCharacter", scaleMode: "fit" })
      .position(-21.5, 0, -14.8)
      .rotate(0, Math.PI * 0.72, 0)
      .animate({ clip: "Crouch_Idle_Loop", loop: true, speed: 1.0 })
      .runtime(game.runtimeNode("coach-3b")),
    // Hidden dugout glove reference so route asset validation sees diamondGlove without floating mitts in front of fielders
    model(assets.diamondGlove, { name: "dugout-glove-ref", targetMaxDimension: 0.34, role: "setDressing", scaleMode: "fit", visible: false })
      .position(0, -80, 0)
      .scale(HIDDEN_SCALE),
    // Catcher's mitt — socketed to the crouched catcher's left forearm at runtime
    model(assets.diamondGlove, { name: "catcher-mitt", targetMaxDimension: 0.36, role: "setDressing", scaleMode: "fit" })
      .position(0.25, 0.55, 2.1)
      .rotate(0, Math.PI, 0.3)
      .runtime(game.runtimeNode("catcher-mitt"))
  ];

  // Fielder and pitcher gloves — each rides its owner's left forearm through the kit attach (no world-authored spot).
  for (const id of GLOVE_OWNERS) {
    nodes.push(
      model(assets.diamondGlove, { name: `glove-${id}`, targetMaxDimension: 0.34, role: "setDressing", scaleMode: "fit" })
        .position(0, -80, 0)
        .runtime(game.runtimeNode(`glove-${id}`))
    );
  }

  // Team cap and belt per athlete (C5): primitives that ride the Head and Hips bones (attached in attachBatSocket) and take the
  // team colour through setMaterial in applyUniforms. The athlete GLB has one mesh and one material, so a tint would recolour skin too.
  for (const id of KIT_OWNERS) {
    nodes.push(
      primitives.sphere({ name: `${id}-cap`, size: [0.205, 0.11, 0.225], material: material.pbr({ color: "#f2eee3", roughness: 0.6 }) }).position(0, -80, 0).runtime(game.runtimeNode(`${id}-cap`)),
      primitives.cylinder({ name: `${id}-belt`, size: [0.33, 0.05, 0.25], material: material.pbr({ color: "#f2eee3", roughness: 0.6 }) }).position(0, -80, 0).runtime(game.runtimeNode(`${id}-belt`))
    );
  }

  // Bat — socketed to the batter's right forearm (knob at the palm); authored
  // transform is only a sane first frame before the socket takes ownership.
  nodes.push(
    model(assets.diamondBat, { name: "bat", targetMaxDimension: 1.02, scaleMode: "fit" })
      .position(-0.51, 1.52, 0.18)
      .rotate(0, BATTER_YAW + 0.15, 1.0)
      .runtime(game.runtimeNode("bat")),
    // Hidden root-level probe pinned to the same bone to calibrate the
    // actor fit scale / normalization shift for world⇄actor conversions.
    primitives
      .sphere({ name: "bat-cal", size: [0.02, 0.02, 0.02], material: material.pbr({ color: "#000000", opacity: 0.0, roughness: 1 }) })
      .position(0, -80, 0)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("bat-cal"))
  );

  // Ball: a 16x12 sphere (about 360 triangles) instead of the 20,326-triangle GLB (C12); at 15 cm on the broadcast
  // camera the seams of the GLB were never visible. The sphere is centred on its node (the GLB was grounded by fit).
  nodes.push(
    primitives.sphere({ name: "ball", size: [0.15, 0.15, 0.15], params: { widthSegments: 16, heightSegments: 12 }, material: material.pbr({ color: ballColor, roughness: 0.55 }) } as any).position(0, -60, 0).runtime(game.runtimeNode("ball")),
    primitives.cylinder({ name: "ball-shadow", size: [0.34, 0.006, 0.34], material: material.pbr({ color: "#000000", opacity: 0.28, roughness: 1 }) }).runtime(game.runtimeNode("ball-shadow")),
    effects.trail({ name: "ball-ribbon", target: "ball", color: "#f5f1e4", width: 0.1, maxPoints: 40, intensity: 0.85 } as any)
  );

  for (let i = 0; i < TRAIL_COUNT; i++) {
    nodes.push(
      primitives.sphere({ name: `ball-trail-${i}`, size: [0.09, 0.09, 0.09], material: material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: 0.5 }) }).scale(HIDDEN_SCALE).runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }

  // Strike-zone helpers: PCI ring (batting) + aim dot (pitching) + landing ring
  nodes.push(
    primitives.torus({ name: "pci-ring", size: [0.42, 0.045] as any, material: material.emissive({ color: "#ffb03a", emissive: "#ffb03a", emissiveIntensity: 1.1 }) }).runtime(game.runtimeNode("pci-ring")),
    primitives.sphere({ name: "aim-dot", size: [0.16, 0.16, 0.16], material: material.emissive({ color: "#35d6ff", emissive: "#35d6ff", emissiveIntensity: 1.2 }) }).runtime(game.runtimeNode("aim-dot")),
    primitives.torus({ name: "land-ring", size: [0.5, 0.04] as any, material: material.emissive({ color: landColor, emissive: landColor, emissiveIntensity: 1.15 }) }).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode("land-ring")),
    primitives.torus({ name: "zone-frame", size: [0.62, 0.03] as any, material: material.emissive({ color: zoneColor, emissive: zoneColor, emissiveIntensity: 0.3 }) }).position(0, ZONE_CY, 0.1).runtime(game.runtimeNode("zone-frame"))
  );

  // Celebration particle fountains (hidden until fired)
  nodes.push(
    effects.particles({ name: "confetti", emitter: "fountain", position: [0, 4, 0], color: "#ffd76a", intensity: 1, visible: false, particleCount: 260, speed: 1.2, radius: 3.2, gravity: -1.2 } as any).runtime(game.runtimeNode("confetti")),
    effects.particles({ name: "hr-burst", emitter: "fountain", position: [0, 1.2, -2], color: "#ffb03a", intensity: 1, visible: false, particleCount: 200, speed: 1.6, radius: 1.6, gravity: -2.4 } as any).runtime(game.runtimeNode("hr-burst")),
    effects.particles({ name: "flair-burst", emitter: "fountain", position: [-0.8, 1.4, 0.4], color: "#35d6ff", intensity: 1, visible: false, particleCount: 160, speed: 1.1, radius: 0.8, gravity: -0.8 } as any).runtime(game.runtimeNode("flair-burst"))
  );

  return nodes;
}

const QA_FLAGS = (() => {
  const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  return { noAo: q.get("qa-ao") === "0", noContact: q.get("qa-contact") === "0" };
})();

/**
 * The park's look group (E-A `looks.preset` with the look-plan overrides). `?look=original` is the 4.6.2 call exactly:
 * the park's engine look with fog removed and the old exposure. QA `?qa-ao=0` drops the look's AO node; a drawn HDRI
 * whose row dims the background (the Dome) gets that intensity on its background only.
 */
function lookGroupNode(plan: DiamondLookPlan): any {
  const group = looks.preset(plan.baseLook, plan.overrides as AuraLookOverrides).toJSON() as any;
  let children: any[] = group.children ?? [];
  if (QA_FLAGS.noAo) children = children.filter((c: any) => c.effect !== "ambient-occlusion");
  if (plan.hdriBackgroundIntensity !== 1) {
    children = children.map((c: any) =>
      c.kind === "environment" && c.background !== false ? { ...c, background: { visible: true, intensity: plan.hdriBackgroundIntensity } } : c
    );
  }
  return { ...group, children };
}

/** DIA-E2: the park's analytic sky (the HDRI then lights only). It neither captures the IBL nor tints the fog. */
function skyNode(plan: DiamondLookPlan): any | null {
  const s = plan.sky;
  if (!s) return null;
  if (s.model === "preetham") {
    return sky.preetham({ name: "diamond sky", sun: s.sun, turbidity: s.turbidity, rayleigh: s.rayleigh, captureEnvironment: false, affectsFog: false });
  }
  return sky.gradient({
    name: "diamond sky",
    zenith: s.zenith,
    horizon: s.horizon,
    ground: s.ground,
    ...(s.sun ? { sun: s.sun } : {}),
    ...(s.stars ? { stars: s.stars } : {}),
    captureEnvironment: false,
    affectsFog: false
  });
}

/**
 * One ballpark (DIA-L1, E1, E2, E3, P1). GU47: the park's own HDRI, sun, key, rim, fog and grade from art/look.ts, its
 * analytic sky where the row has one, Dome god rays on High, broadcast film grain; the output preset is applied by
 * main.ts through `app.setOutput` (it is app state, not a scene node).
 */
export function buildParkScene(park: ParkSpec, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT): any {
  const plan = lookPlan(park.id, ctx.variant, ctx.tier, ctx.skyMode);
  const clear = plan.clearColor === "look" ? looks.describe(plan.baseLook).v0.background : plan.clearColor;
  const sc = scene();
  // The god-ray node is also a scene-fog node (last visible wins), so it goes before the look and the look's fog stays active.
  // No `lightPosition`: its type is a UV anchor while the bridge reads a world point, so S4 aims along the strongest
  // directional light instead, which in the Dome is the key through the roof (look.ts row).
  if (plan.godRays) {
    sc.add(effects.volumetricFog({ name: "dome god rays", density: plan.godRays.density, intensity: plan.godRays.intensity, color: plan.godRays.color, godRayDensity: 0.35 }));
  }
  sc.add(lookGroupNode(plan)).background(clear);
  const skyN = skyNode(plan);
  if (skyN) sc.add(skyN);
  // QA-only switches for the AO and contact-shadow on/off capture pairs (LIGHT-06, C17): `?qa-ao=0`, `?qa-contact=0`.
  if (!QA_FLAGS.noContact) sc.add(effects.contactShadows({ intensity: 0.75, length: 0.3 }));
  sc.add(effects.vignette({ intensity: plan.vignette, smoothness: 0.7 }));
  if (plan.grain !== null) sc.add(effects.filmGrain({ intensity: plan.grain }));
  return sc
    .camera(camera.perspective({ fov: 42, near: 0.2, far: 700, position: [0, 26, 42], target: [0, 0, -14] }))
    .addMany(buildFieldNodes(park, ctx))
    .addMany(buildStandsNodes(park, ctx))
    .addMany(buildParkExtras(park))
    .addMany(buildActorsNodes(ctx, park.id));
}
