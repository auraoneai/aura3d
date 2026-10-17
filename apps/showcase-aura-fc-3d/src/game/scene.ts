// Aura FC 3D — world scene: pitch, goals, stadium bowl, venue dressing.
//
// One `scene()` graph is built once; venue switches only re-tint materials
// and toggle dressing visibility (cage walls, mow stripes, dome, aurora
// ribbons) — the same trick Top Tennis v2 uses, applied to a football pitch.
// Look preset is the sports/table recipe: `interior-industrial` (indoor
// haze, arena-fight post, turf green, white lines, dark crowd, accent ball).

import {
  camera, decals, effects, game, instances, lights, looks, material, model, primitives, scene
} from "@aura3d/engine";
import { assets } from "../../../../src/aura-assets";
import { VENUES, type VenueSpec } from "./content";
import type { VenueId } from "./types";
import {
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, GOAL_DEPTH, BOX_DEPTH, BOX_HALF_W,
  PEN_X, CIRCLE_R, BALL_R
} from "./dims";
import { athleteNodes } from "./rig";

export const LOOK_ID = "interior-industrial" as const;
const HIDDEN = 0.0001;

const rng = (() => {
  let s = 0xa1f3c9;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
})();

/* ------------------------------------------------------------------ */
/*  Node builders                                                      */
/* ------------------------------------------------------------------ */

function pitchNodes(): any[] {
  const v = VENUES.munich;
  const lineMat = material.pbr({ color: v.line, roughness: 0.6, emissive: v.line, emissiveIntensity: 0.14 });
  const L = (name: string, w: number, l: number, x: number, z: number) =>
    primitives.box({ name, size: [w, 0.018, l], material: lineMat }).position(x, 0.014, z).runtime(gameRuntime(name));

  const nodes: any[] = [
    primitives.plane({ name: "fc-ground", size: [96, 76, 1], material: material.pbr({ color: v.ground, roughness: 0.96 }) })
      .position(0, -0.03, 0).runtime(gameRuntime("fc-ground")),
    primitives.plane({ name: "fc-apron", size: [PITCH_HX * 2 + 7, PITCH_HZ * 2 + 7, 1], material: material.pbr({ color: v.apron, roughness: 0.9 }) })
      .position(0, -0.012, 0).runtime(gameRuntime("fc-apron")),
    primitives.plane({ name: "fc-pitch", size: [PITCH_HX * 2, PITCH_HZ * 2, 1], material: material.pbr({ color: v.pitch, roughness: 0.85 }) })
      .position(0, 0.002, 0).runtime(gameRuntime("fc-pitch"))
  ];

  // mow stripes (venue.stripes)
  const stripeN = 10;
  for (let i = 0; i < stripeN; i++) {
    const w = (PITCH_HX * 2) / stripeN;
    nodes.push(
      primitives.plane({ name: `fc-stripe-${i}`, size: [w - 0.02, PITCH_HZ * 2 - 0.02, 1], material: material.pbr({ color: i % 2 ? v.pitchAlt : v.pitch, roughness: 0.85 }) })
        .position(-PITCH_HX + w / 2 + i * w, 0.004, 0)
        .runtime(gameRuntime(`fc-stripe-${i}`))
    );
  }

  // touchlines (along X at ±Z) + goal lines (along Z at ±X) + centre
  nodes.push(
    L("line-touch-n", PITCH_HX * 2, 0.12, 0, -PITCH_HZ),
    L("line-touch-f", PITCH_HX * 2, 0.12, 0, PITCH_HZ),
    L("line-goal-l", 0.12, PITCH_HZ * 2, -PITCH_HX, 0),
    L("line-goal-r", 0.12, PITCH_HZ * 2, PITCH_HX, 0),
    L("line-centre", 0.1, PITCH_HZ * 2, 0, 0)
  );
  // centre circle + spot
  nodes.push(
    primitives.torus({ name: "line-circle", size: [CIRCLE_R, 0.05, 0.05], material: lineMat })
      .position(0, 0.02, 0).rotate(Math.PI / 2, 0, 0),
    primitives.cylinder({ name: "line-spot-c", size: [0.22, 0.016, 0.22], material: lineMat }).position(0, 0.015, 0)
  );

  // boxes + penalty spots both ends
  for (const sx of [-1, 1] as const) {
    const gx = sx * PITCH_HX;
    const boxX = sx * (PITCH_HX - BOX_DEPTH);
    const sixX = sx * (PITCH_HX - 3.2);
    nodes.push(
      L(`line-box-edge-${sx}`, 0.1, BOX_HALF_W * 2, boxX, 0),
      L(`line-box-top-${sx}`, BOX_DEPTH, 0.1, gx - sx * BOX_DEPTH / 2, -BOX_HALF_W),
      L(`line-box-bot-${sx}`, BOX_DEPTH, 0.1, gx - sx * BOX_DEPTH / 2, BOX_HALF_W),
      L(`line-six-edge-${sx}`, 0.1, 4.6 * 2, sixX, 0),
      L(`line-six-top-${sx}`, 3.2, 0.1, gx - sx * 1.6, -4.6),
      L(`line-six-bot-${sx}`, 3.2, 0.1, gx - sx * 1.6, 4.6),
      primitives.cylinder({ name: `pen-spot-${sx}`, size: [0.2, 0.016, 0.2], material: lineMat }).position(sx * PEN_X, 0.015, 0)
    );
  }

  // corner flags + arc quarter-marks
  const flagMat = material.emissive({ color: v.accent, emissive: v.accent, emissiveIntensity: 0.9 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    nodes.push(
      primitives.cylinder({ name: `flag-${sx}-${sz}`, size: [0.03, 1.3, 0.03], material: material.pbr({ color: "#f2f0e2", roughness: 0.6 }) })
        .position(sx * (PITCH_HX - 0.15), 0.65, sz * (PITCH_HZ - 0.15)),
      primitives.box({ name: `flagtip-${sx}-${sz}`, size: [0.22, 0.16, 0.02], material: flagMat })
        .position(sx * (PITCH_HX - 0.15), 1.28, sz * (PITCH_HZ - 0.15))
    );
  }
  return nodes;
}

function goalNodes(sx: -1 | 1): any[] {
  const gx = sx * (PITCH_HX + 0.06);
  const postMat = material.pbr({ color: "#f5f4ea", roughness: 0.35, metalness: 0.15 });
  const netMat = material.pbr({ color: "#dfe6ee", roughness: 0.9, opacity: 0.38 });
  const backX = gx + sx * GOAL_DEPTH;
  return [
    primitives.cylinder({ name: `post-${sx}-n`, size: [0.075, GOAL_H + 0.05, 0.075], material: postMat })
      .position(gx, GOAL_H / 2, -GOAL_HALF_W),
    primitives.cylinder({ name: `post-${sx}-s`, size: [0.075, GOAL_H + 0.05, 0.075], material: postMat })
      .position(gx, GOAL_H / 2, GOAL_HALF_W),
    primitives.cylinder({ name: `bar-${sx}`, size: [0.07, GOAL_HALF_W * 2 + 0.14, 0.07], material: postMat })
      .position(gx, GOAL_H + 0.02, 0).rotate(Math.PI / 2, 0, 0),
    // back frame stays
    primitives.cylinder({ name: `stay-${sx}-n`, size: [0.045, GOAL_H + 0.4, 0.045], material: postMat })
      .position(backX, (GOAL_H + 0.4) / 2, -GOAL_HALF_W).rotate(0, 0, sx * 0.22),
    primitives.cylinder({ name: `stay-${sx}-s`, size: [0.045, GOAL_H + 0.4, 0.045], material: postMat })
      .position(backX, (GOAL_H + 0.4) / 2, GOAL_HALF_W).rotate(0, 0, sx * 0.22),
    // net: back panel + roof + side panels (runtime for goal ripple)
    primitives.plane({ name: `net-back-${sx}`, size: [GOAL_HALF_W * 2 + 0.2, GOAL_H, 1], material: netMat })
      .position(backX, GOAL_H / 2, 0).rotate(0, Math.PI / 2, 0)
      .runtime(gameRuntime(`net-back-${sx}`)),
    primitives.plane({ name: `net-roof-${sx}`, size: [GOAL_HALF_W * 2 + 0.2, GOAL_DEPTH, 1], material: netMat })
      .position(gx + sx * GOAL_DEPTH / 2, GOAL_H + 0.01, 0)
      .runtime(gameRuntime(`net-roof-${sx}`)),
    primitives.plane({ name: `net-n-${sx}`, size: [GOAL_DEPTH, GOAL_H, 1], material: netMat })
      .position(gx + sx * GOAL_DEPTH / 2, GOAL_H / 2, -GOAL_HALF_W)
      .runtime(gameRuntime(`net-n-${sx}`)),
    primitives.plane({ name: `net-s-${sx}`, size: [GOAL_DEPTH, GOAL_H, 1], material: netMat })
      .position(gx + sx * GOAL_DEPTH / 2, GOAL_H / 2, GOAL_HALF_W)
      .runtime(gameRuntime(`net-s-${sx}`))
  ];
}

function stadiumNodes(v: VenueSpec): any[] {
  const nodes: any[] = [];

  /* ---- Favela cage walls (ball bounces off these) ---- */
  const wallMat = material.pbr({ color: v.wallColor, roughness: 0.85 });
  const railMat = material.emissive({ color: v.accent, emissive: v.accent, emissiveIntensity: 0.5 });
  const wallDefs: [string, number, number, number, number][] = [
    ["w", -PITCH_HX - 0.35, 0, 0.3, PITCH_HZ * 2 + 0.6],
    ["e", PITCH_HX + 0.35, 0, 0.3, PITCH_HZ * 2 + 0.6],
    ["n", 0, -PITCH_HZ - 0.35, PITCH_HX * 2 + 1, 0.3],
    ["s", 0, PITCH_HZ + 0.35, PITCH_HX * 2 + 1, 0.3]
  ];
  for (const [tag, x, z, w, l] of wallDefs) {
    nodes.push(
      primitives.box({ name: `cage-${tag}`, size: [w, 1.5, l], material: wallMat })
        .position(x, 0.75, z).runtime(gameRuntime(`cage-${tag}`)),
      primitives.box({ name: `cage-rail-${tag}`, size: [w, 0.08, l], material: railMat })
        .position(x, 1.55, z).runtime(gameRuntime(`cage-rail-${tag}`))
    );
  }

  /* ---- Sponsor hoarding ring ---- */
  const hoardMat = material.emissive({ color: v.hoarding, emissive: v.accent, emissiveIntensity: 0.38 });
  const hz = PITCH_HZ + 2.4;
  const hx = PITCH_HX + 2.4;
  for (const [x, z, w, rot] of [
    [0, -hz, hx * 2, 0], [0, hz, hx * 2, 0],
    [-hx, 0, hz * 2, Math.PI / 2], [hx, 0, hz * 2, Math.PI / 2]
  ] as const) {
    nodes.push(
      primitives.box({ name: `hoard-${Math.round(x)}-${Math.round(z)}`, size: [w, 0.8, 0.16], material: hoardMat })
        .position(x, 0.4, z).rotate(0, rot, 0)
        .runtime(gameRuntime(`hoard-${Math.round(x)}-${Math.round(z)}`))
    );
  }

  /* ---- Bleacher bowl (runtime handles — hidden on cage/flat venues) ---- */
  const seatMat = material.pbr({ color: "#18202c", roughness: 0.9 });
  const MAX_TIERS = 4;
  for (let tier = 0; tier < MAX_TIERS; tier++) {
    const y = 0.9 + tier * 1.3;
    const wFar = PITCH_HX * 2 + 8 + tier * 3.4;
    nodes.push(
      primitives.box({ name: `stand-far-${tier}`, size: [wFar, 0.55, 2.0], material: seatMat })
        .position(0, y, -(PITCH_HZ + 4.6 + tier * 2.2))
        .runtime(gameRuntime(`stand-far-${tier}`)),
      primitives.box({ name: `stand-end-w-${tier}`, size: [2.0, 0.55, PITCH_HZ * 2 + 6 + tier * 2], material: seatMat })
        .position(-(PITCH_HX + 4.6 + tier * 2.2), y, 0)
        .runtime(gameRuntime(`stand-end-w-${tier}`)),
      primitives.box({ name: `stand-end-e-${tier}`, size: [2.0, 0.55, PITCH_HZ * 2 + 6 + tier * 2], material: seatMat })
        .position(PITCH_HX + 4.6 + tier * 2.2, y, 0)
        .runtime(gameRuntime(`stand-end-e-${tier}`))
    );
    if (tier < 2) {
      nodes.push(
        primitives.box({ name: `stand-near-${tier}`, size: [wFar, 0.55, 1.8], material: seatMat })
          .position(0, y * 0.85, PITCH_HZ + 5.2 + tier * 2.0)
          .runtime(gameRuntime(`stand-near-${tier}`))
      );
    }
  }

  /* ---- Crowd — instanced capsules over the bowl ---- */
  const crowdT: any[] = [];
  const crowdC: string[] = [];
  const warm = ["#c96f4a", "#d8a75c", "#e8d8b0", "#a8563c", "#ffb3ac"];
  const cool = ["#3d5a80", "#98c1d9", "#e0fbfc", "#293241", "#7fe8c9"];
  const cols = v.crowdWarm ? warm.concat(cool.slice(0, 2)) : cool.concat(warm.slice(0, 2));
  const tiers = MAX_TIERS;   // build for the biggest bowl; venue gates visibility
  for (let tier = 0; tier < tiers; tier++) {
    const y = 1.35 + tier * 1.3;
    const zFar = -(PITCH_HZ + 4.6 + tier * 2.2);
    const xSide = PITCH_HX + 4.6 + tier * 2.2;
    const n = 30 + tier * 3;
    for (let i = 0; i < n; i++) {
      if (rng() < 0.12) continue;
      const fx = -(PITCH_HX + 3) + ((PITCH_HX + 3) * 2 / n) * i + (rng() - 0.5) * 0.5;
      crowdT.push({ position: [fx, y, zFar + (rng() - 0.5) * 0.6], scale: [0.36, 0.66 + rng() * 0.22, 0.36] });
      crowdC.push(cols[(rng() * cols.length) | 0]);
      if (i % 2 === 0 && i * 0.62 < PITCH_HZ * 2) {
        for (const x of [-xSide, xSide]) {
          crowdT.push({ position: [x + (rng() - 0.5) * 0.5, y, -(PITCH_HZ) + i * 0.62], scale: [0.36, 0.66 + rng() * 0.2, 0.36] });
          crowdC.push(cols[(rng() * cols.length) | 0]);
        }
      }
      if (tier < 2) {
        crowdT.push({ position: [fx, y * 0.85 + 0.1, PITCH_HZ + 5.2 + tier * 2.0 + (rng() - 0.5) * 0.5], scale: [0.36, 0.64 + rng() * 0.2, 0.36] });
        crowdC.push(cols[(rng() * cols.length) | 0]);
      }
    }
  }
  nodes.push((instances as any).capsule({ name: "fc-crowd", transforms: crowdT, colors: crowdC, material: material.pbr({ color: "#ffffff", roughness: 0.92 }) }).runtime(gameRuntime("fc-crowd")));

  /* ---- Front-row wavers (animated) ---- */
  for (let i = 0; i < 26; i++) {
    const x = -PITCH_HX - 1 + i * ((PITCH_HX * 2 + 2) / 25);
    nodes.push(
      primitives.capsule({ name: `fc-waver-${i}`, size: [1, 1, 1], material: material.pbr({ color: cols[i % cols.length], roughness: 0.85 }) })
        .position(x, 1.5, -(PITCH_HZ + 3.9))
        .scale(0.36)
        .runtime(gameRuntime(`fc-waver-${i}`))
    );
  }

  /* ---- Floodlight towers + cones + real spots ---- */
  const towers: [number, number][] = [
    [-PITCH_HX - 6, -PITCH_HZ - 6], [PITCH_HX + 6, -PITCH_HZ - 6],
    [-PITCH_HX - 6, PITCH_HZ + 6.5], [PITCH_HX + 6, PITCH_HZ + 6.5]
  ];
  towers.forEach(([x, z], i) => {
    nodes.push(
      model(assets.rooftopFloodlightTowerMeshy, { name: `flood-${i}`, targetHeight: 12.5 })
        .position(x, 0, z)
        .rotate(0, Math.atan2(-x, -z), 0),
      lights.spot({ name: `flood-spot-${i}`, position: [x * 0.94, 12, z * 0.94], target: [0, 0, 0], angle: 0.52, penumbra: 0.5, intensity: 2.3, color: v.floodColor, distance: 90 }),
      effects.lightCone({ name: `flood-cone-${i}`, position: [x * 0.94, 11.6, z * 0.94], direction: [-x * 0.05, -1, -z * 0.05], color: v.floodColor, intensity: 0.3, length: 13, coneAngle: 0.4, softness: 0.6 } as any)
        .runtime(gameRuntime(`flood-cone-${i}`))
    );
  });

  /* ---- Scoreboard gantry + emissive screen ---- */
  nodes.push(
    model(assets.rooftopScoreboardRigMeshy, { name: "fc-gantry", targetHeight: 7.5 })
      .position(0, 5.4, -(PITCH_HZ + 9.5)),
    primitives.box({ name: "fc-scoreboard-screen", size: [9.5, 3.1, 0.3], material: material.emissive({ color: "#0d2436", emissive: v.accent, emissiveIntensity: 0.35 }) })
      .position(0, 7.2, -(PITCH_HZ + 9.2))
      .runtime(gameRuntime("fc-scoreboard-screen"))
  );

  /* ---- Glacier dome + aurora ribbons ---- */
  nodes.push(
    model(assets.auroraHabitatDomeMeshy, { name: "fc-dome", targetHeight: 26 })
      .position(0, 0, 0)
      .runtime(gameRuntime("fc-dome"))
  );
  for (let i = 0; i < 3; i++) {
    nodes.push(
      primitives.plane({ name: `fc-aurora-${i}`, size: [60, 7, 1], material: material.emissive({ color: "#7fe8c9", emissive: i === 1 ? "#7dfcff" : "#7fe8c9", emissiveIntensity: 0.55, opacity: 0.22 }) })
        .position(-10 + i * 10, 19 + i * 2.2, -6 + i * 5)
        .rotate(-0.5 - i * 0.12, 0.25 * i, 0)
        .runtime(gameRuntime(`fc-aurora-${i}`))
    );
  }

  /* ---- Dugouts + dressing ---- */
  nodes.push(
    primitives.box({ name: "dugout-home", size: [4.4, 1.4, 1.4], material: material.pbr({ color: "#1c2634", roughness: 0.8 }) })
      .position(-7, 0.7, PITCH_HZ + 4.0),
    primitives.box({ name: "dugout-away", size: [4.4, 1.4, 1.4], material: material.pbr({ color: "#1c2634", roughness: 0.8 }) })
      .position(7, 0.7, PITCH_HZ + 4.0),
    // trophy cabinet by the tunnel (catalog dressing)
    model(assets.billiardsTrophyCabinetMeshy, { name: "fc-trophy-case", targetHeight: 2.2 })
      .position(-PITCH_HX - 4.5, 0.9, -(PITCH_HZ + 3.5))
      .rotate(0, 0.8, 0),
    // spare match balls on a rack
    model(assets.rooftopBall, { name: "fc-spare-ball", targetHeight: 0.4 })
      .position(PITCH_HX + 3.4, 0.1, PITCH_HZ + 3.6)
  );

  /* ---- Pitch scuff decals ---- */
  for (const [x, z, s] of [[-19, -3, 1.8], [19.2, 2.4, 1.6], [-0.5, 0.4, 2.2], [8, -6, 1.3], [-9, 5.4, 1.4], [23, -5, 1.2]] as const) {
    nodes.push(decals.project({ name: `fc-scuff-${x}-${z}`, color: "#000000", size: [s, s * 0.7], opacity: 0.13, position: [x, 0.014, z], normal: [0, 1, 0] }));
  }

  /* ---- Confetti cannon (full-time / champion) ---- */
  nodes.push(
    effects.particles({ name: "fc-confetti", position: [0, 4.2, 0], color: "#ffd76a", intensity: 1, visible: false, rate: 70, speed: 4.6, size: 0.07, lifetime: 3.0, spread: 1.0, gravity: -1.6 } as any)
      .runtime(gameRuntime("fc-confetti"))
  );

  return nodes;
}

function ballNodes(): any[] {
  return [
    // match ball: typed catalog GLB + emissive equator ring so it reads at broadcast distance
    model(assets.rooftopBall, { name: "fc-ball", targetHeight: BALL_R * 2.2 })
      .runtime(gameRuntime("fc-ball")),
    primitives.sphere({ name: "fc-ball-glow", size: [BALL_R * 2.35, BALL_R * 2.35, BALL_R * 2.35], material: material.emissive({ color: "#f2f6ec", emissive: "#f2f6ec", emissiveIntensity: 0.35, opacity: 0.5 }) })
      .runtime(gameRuntime("fc-ball-glow")),
    primitives.cylinder({ name: "fc-ball-shadow", size: [0.36, 0.007, 0.36], material: material.pbr({ color: "#000000", opacity: 0.42, roughness: 1 }) })
      .runtime(gameRuntime("fc-ball-shadow")),
    // engine ribbon trail + penalty aim marker + touch-lab target ring
    effects.trail({ name: "fc-ball-trail", target: "fc-ball", color: "#d8ff3e", width: 0.1, maxPoints: 40, intensity: 0.85 } as any),
    primitives.torus({ name: "fc-aim-ring", size: [0.34, 0.035, 0.035], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.3 }) })
      .scale(HIDDEN).runtime(gameRuntime("fc-aim-ring")),
    primitives.torus({ name: "fc-lab-ring", size: [1.15, 0.09, 0.09], material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff", emissiveIntensity: 1.15 }) })
      .rotate(Math.PI / 2, 0, 0).scale(HIDDEN).runtime(gameRuntime("fc-lab-ring"))
  ];
}

function gameRuntime(name: string) {
  return game.runtimeNode(name);
}

/* ------------------------------------------------------------------ */
/*  Public                                                             */
/* ------------------------------------------------------------------ */

export const ATHLETE_IDS = [
  "h-gk", "h-df0", "h-df1", "h-mf", "h-fw",
  "a-gk", "a-df0", "a-df1", "a-mf", "a-fw"
] as const;

/** Full scene graph — look preset first (per look-recipes), then world. */
export function buildFcScene() {
  const s = scene()
    .add(looks.preset(LOOK_ID, { fogDensityScale: 0.5, exposureEv: 0.08 }))
    .addMany(pitchNodes())
    .addMany(goalNodes(-1))
    .addMany(goalNodes(1))
    .addMany(stadiumNodes(VENUES.munich))
    .addMany(ballNodes());
  for (const id of ATHLETE_IDS) s.addMany(athleteNodes(id));
  return s
    .add(effects.contactShadows({ intensity: 0.75, length: 0.3 }))
    .add(effects.motionBlur({ intensity: 0.12 }))
    .add(effects.bloom({ intensity: 0.3, threshold: 0.76 }))
    .camera(camera.perspective({ position: [0, 24, 38], target: [0, 0.4, 0], fov: 16 }));
  return s;
}

export interface WorldHandles {
  ground: any; apron: any; pitch: any;
  stripes: any[];
  cages: any[]; cageRails: any[];
  hoardings: any[];
  stands: any[];
  crowd: any;
  scoreboard: any;
  nets: any[];
  dome: any;
  auroras: any[];
  wavers: any[];
  confetti: any;
  ball: any; ballGlow: any; ballShadow: any;
  aimRing: any; labRing: any;
}

const tryReq = (app: any, id: string) => { try { return app.nodes.require(id); } catch { return null; } };

export function resolveWorld(app: any): WorldHandles {
  const req = (id: string) => app.nodes.require(id);
  return {
    ground: req("fc-ground"), apron: req("fc-apron"), pitch: req("fc-pitch"),
    stripes: Array.from({ length: 10 }, (_, i) => tryReq(app, `fc-stripe-${i}`)),
    cages: ["w", "e", "n", "s"].map((t) => tryReq(app, `cage-${t}`)),
    cageRails: ["w", "e", "n", "s"].map((t) => tryReq(app, `cage-rail-${t}`)),
    hoardings: [[0, -(PITCH_HZ + 2.4)], [0, PITCH_HZ + 2.4], [-(PITCH_HX + 2.4), 0], [PITCH_HX + 2.4, 0]]
      .map(([x, z]) => tryReq(app, `hoard-${Math.round(x as number)}-${Math.round(z as number)}`)),
    stands: [
      ...Array.from({ length: 4 }, (_, i) => `stand-far-${i}`),
      ...Array.from({ length: 4 }, (_, i) => `stand-end-w-${i}`),
      ...Array.from({ length: 4 }, (_, i) => `stand-end-e-${i}`),
      "stand-near-0", "stand-near-1"
    ].map((n) => tryReq(app, n)),
    crowd: tryReq(app, "fc-crowd"),
    scoreboard: tryReq(app, "fc-scoreboard-screen"),
    nets: ["net-back--1", "net-roof--1", "net-n--1", "net-s--1", "net-back-1", "net-roof-1", "net-n-1", "net-s-1"].map((n) => tryReq(app, n)),
    dome: tryReq(app, "fc-dome"),
    auroras: [0, 1, 2].map((i) => tryReq(app, `fc-aurora-${i}`)),
    wavers: Array.from({ length: 26 }, (_, i) => tryReq(app, `fc-waver-${i}`)),
    confetti: tryReq(app, "fc-confetti"),
    ball: tryReq(app, "fc-ball"), ballGlow: tryReq(app, "fc-ball-glow"), ballShadow: tryReq(app, "fc-ball-shadow"),
    aimRing: tryReq(app, "fc-aim-ring"), labRing: tryReq(app, "fc-lab-ring")
  };
}

/** Re-tint every venue-dependent surface. Called when state.venue changes. */
export function applyVenue(h: WorldHandles, v: VenueSpec): void {
  h.ground?.setMaterial(material.pbr({ color: v.ground, roughness: 0.96 }));
  h.apron?.setMaterial(material.pbr({ color: v.apron, roughness: 0.9 }));
  h.pitch?.setMaterial(material.pbr({ color: v.pitch, roughness: 0.85 }));
  h.scoreboard?.setMaterial(material.emissive({ color: v.hoarding, emissive: v.accent, emissiveIntensity: 0.4 }));
  for (const hd of h.hoardings) hd?.setMaterial(material.emissive({ color: v.hoarding, emissive: v.accent, emissiveIntensity: 0.38 }));
  for (let i = 0; i < h.stripes.length; i++) {
    const on = v.stripes;
    h.stripes[i]?.setMaterial(material.pbr({ color: i % 2 ? v.pitchAlt : v.pitch, roughness: 0.85 }));
    h.stripes[i]?.setScale(on ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(on);
  }
  for (const c of h.cages) c?.setMaterial(material.pbr({ color: v.wallColor, roughness: 0.85 })).setScale(v.walled ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(v.walled);
  for (const c of h.cageRails) c?.setMaterial(material.emissive({ color: v.accent, emissive: v.accent, emissiveIntensity: 0.5 })).setScale(v.walled ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(v.walled);
  // stands: tier i visible when standCount covers it; near-side bowl only on 3+ tier venues
  h.stands.forEach((s, i) => {
    const isNear = i >= 12;
    const tier = i % 4;
    const vis = isNear ? v.standCount >= 3 && tier < 2 : v.standCount > tier;
    s?.setScale(vis ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(vis);
  });
  h.crowd?.setVisible(v.standCount > 0);
  for (const w of h.wavers) w?.setVisible(v.standCount > 0);
  h.dome?.setVisible(v.dome);
  for (const a of h.auroras) a?.setVisible(v.aurora);
}

/** Per-frame ambient motion: wavers bounce on goals, aurora drifts, ball net ripple. */
export function tickWorld(h: WorldHandles, t: number, opts: { cheering: boolean; ripple: number }): void {
  const cheer = opts.cheering;
  for (let i = 0; i < h.wavers.length; i++) {
    const w = h.wavers[i];
    if (!w) continue;
    const bounce = cheer ? Math.abs(Math.sin(t * 9 + i * 1.31)) * 0.3 : Math.sin(t * 2.1 + i) * 0.03;
    w.setPosition(-PITCH_HX - 1 + i * ((PITCH_HX * 2 + 2) / 25), 1.5 + bounce, -(PITCH_HZ + 3.9));
  }
  for (let i = 0; i < h.auroras.length; i++) {
    h.auroras[i]?.setRotation(-0.5 - i * 0.12, 0.25 * i + Math.sin(t * 0.22 + i * 2) * 0.08, 0);
  }
  // net ripple: brief scale pulse on the back panels after a goal
  if (opts.ripple > 0) {
    const k = 1 + Math.sin(opts.ripple * 22) * 0.06 * Math.min(1, opts.ripple);
    for (const n of h.nets) n?.setScale([k, 1, 1]);
  }
}
