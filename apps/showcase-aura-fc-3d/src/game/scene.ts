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
import { assets } from "../aura-assets-v2";
import { VENUES, type VenueSpec } from "./content";
import type { VenueId } from "./types";
import {
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, GOAL_DEPTH, BOX_DEPTH, BOX_HALF_W,
  PEN_X, CIRCLE_R, BALL_R, BALL_VIS_R, CAGE_GOAL_GAP
} from "./dims";
import { athleteNodes } from "./rig";

export const LOOK_ID = "interior-industrial" as const;

/**
 * Per-venue look (FC-21): the night venues keep the floodlit `interior-industrial` recipe; the sunset beach and the
 * daytime salt flat get the matching outdoor looks, their own sky colour and a softer flood. The look is part of the
 * scene graph, so main.ts rebuilds the scene (app.setScene) when the venue changes between matches.
 */
export const VENUE_LOOKS: Readonly<Record<VenueId, { readonly look: "interior-industrial" | "golden-hour" | "outdoor-day"; readonly background: string; readonly exposureEv: number; readonly flood: number }>> = {
  favela: { look: "interior-industrial", background: "#140f0b", exposureEv: 0.08, flood: 2.3 },
  munich: { look: "interior-industrial", background: "#0d1a24", exposureEv: 0.08, flood: 2.3 },
  lagos: { look: "golden-hour", background: "#c98a5a", exposureEv: 0, flood: 0.9 },
  kyoto: { look: "interior-industrial", background: "#0b0d1c", exposureEv: 0.08, flood: 2.3 },
  uyuni: { look: "outdoor-day", background: "#9db8cf", exposureEv: -0.1, flood: 0.5 },
  glacier: { look: "interior-industrial", background: "#08121c", exposureEv: 0.08, flood: 2.3 }
};
const HIDDEN = 0.0001;

const rng = (() => {
  let s = 0xa1f3c9;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
})();

const WAVERS = 26;
function waverTransforms(t: number, cheer: boolean): any[] {
  const out: any[] = [];
  for (let i = 0; i < WAVERS; i++) {
    const bounce = cheer ? Math.abs(Math.sin(t * 9 + i * 1.31)) * 0.3 : Math.sin(t * 2.1 + i) * 0.03;
    out.push({ position: [-PITCH_HX - 1 + i * ((PITCH_HX * 2 + 2) / (WAVERS - 1)), 1.5 + bounce, -(PITCH_HZ + 3.9)], scale: 0.36 });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Node builders                                                      */
/* ------------------------------------------------------------------ */

/** Pitch markings as one instanced box batch: [widthX, lengthZ, x, z] per line (was 25 separate boxes, FC-E1). */
function pitchLines(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [
    [PITCH_HX * 2, 0.12, 0, -PITCH_HZ], [PITCH_HX * 2, 0.12, 0, PITCH_HZ],
    [0.12, PITCH_HZ * 2, -PITCH_HX, 0], [0.12, PITCH_HZ * 2, PITCH_HX, 0], [0.1, PITCH_HZ * 2, 0, 0]
  ];
  for (const sx of [-1, 1] as const) {
    const gx = sx * PITCH_HX;
    out.push(
      [0.1, BOX_HALF_W * 2, sx * (PITCH_HX - BOX_DEPTH), 0],
      [BOX_DEPTH, 0.1, gx - sx * BOX_DEPTH / 2, -BOX_HALF_W],
      [BOX_DEPTH, 0.1, gx - sx * BOX_DEPTH / 2, BOX_HALF_W],
      [0.1, 4.6 * 2, sx * (PITCH_HX - 3.2), 0],
      [3.2, 0.1, gx - sx * 1.6, -4.6],
      [3.2, 0.1, gx - sx * 1.6, 4.6]
    );
  }
  return out;
}

const STRIPES = 10;
/** Mow stripes as one instanced plane batch (was 10 planes, FC-E1). Colours alternate pitch / pitchAlt. */
export function stripeInstances(v: VenueSpec): { transforms: any[]; colors: string[] } {
  const w = (PITCH_HX * 2) / STRIPES;
  const transforms: any[] = [];
  const colors: string[] = [];
  for (let i = 0; i < STRIPES; i++) {
    transforms.push({ position: [-PITCH_HX + w / 2 + i * w, 0.005, 0], scale: [w - 0.02, 1, PITCH_HZ * 2 - 0.02] });
    colors.push(i % 2 ? v.pitchAlt : v.pitch);
  }
  return { transforms, colors };
}

function pitchNodes(v: VenueSpec): any[] {
  const lineMat = material.pbr({ color: v.line, roughness: 0.6, emissive: v.line, emissiveIntensity: 0.14 });

  // Horizontal XZ planes use size: [widthX, 1, depthZ]
  const nodes: any[] = [
    primitives.plane({ name: "fc-ground", size: [110, 1, 90], material: material.pbr({ color: v.ground, roughness: 0.96 }) })
      .position(0, -0.03, 0).runtime(gameRuntime("fc-ground")),
    primitives.plane({ name: "fc-apron", size: [PITCH_HX * 2 + 7, 1, PITCH_HZ * 2 + 7], material: material.pbr({ color: v.apron, roughness: 0.9 }) })
      .position(0, -0.012, 0).runtime(gameRuntime("fc-apron")),
    primitives.plane({ name: "fc-pitch", size: [PITCH_HX * 2, 1, PITCH_HZ * 2], material: material.pbr({ color: v.pitch, roughness: 0.85 }) })
      .position(0, 0.002, 0).runtime(gameRuntime("fc-pitch"))
  ];

  // 10 mow stripes across the length of the pitch (one instanced batch; hidden on venues without stripes)
  if (v.stripes) {
    const st = stripeInstances(v);
    nodes.push((instances as any).plane({ name: "fc-stripes", size: [1, 1, 1], transforms: st.transforms, colors: st.colors, material: material.pbr({ color: "#ffffff", roughness: 0.85 }) })
      .runtime(gameRuntime("fc-stripes")));
  }

  // touchlines, goal lines, centre line, boxes and six-yard boxes: one instanced batch
  nodes.push((instances as any).box({
    name: "fc-lines", size: [1, 1, 1], material: lineMat,
    transforms: pitchLines().map(([w, l, x, z]) => ({ position: [x, 0.014, z], scale: [w, 0.018, l] }))
  }));
  // centre circle + spot
  nodes.push(
    primitives.torus({ name: "line-circle", size: [CIRCLE_R, 0.05, 0.05], material: lineMat })
      .position(0, 0.02, 0).rotate(Math.PI / 2, 0, 0),
    primitives.cylinder({ name: "line-spot-c", size: [0.22, 0.016, 0.22], material: lineMat }).position(0, 0.015, 0)
  );

  // penalty spots both ends
  for (const sx of [-1, 1] as const) {
    nodes.push(
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
  const gx = sx * PITCH_HX;
  const postMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.1 });
  const netMat = material.pbr({ color: "#ffffff", emissive: "#e2e8f0", emissiveIntensity: 0.22, roughness: 0.85, opacity: 0.42 });
  const backX = gx + sx * GOAL_DEPTH;
  const goalScaleX = (GOAL_HALF_W * 2) / 1.897;
  const goalScaleY = GOAL_H / 1.282;
  const goalScaleZ = GOAL_DEPTH / 0.8;
  return [
    // FC-05: one scale only. The fit target equals the GLB's own largest side (1.897 m), so the fit is 1x and the
    // model stays centred and base-at-origin; the per-axis scale then stretches it to the 7.6 x 2.85 x 2.6 m frame.
    // The old targetMaxDimension 8.8 multiplied in a second 4.64x and drew a 35 m net.
    model(assets.fcSoccerGoalNetMeshy, { name: `fc-goal-mesh-${sx}`, targetMaxDimension: GOAL_NET_GLB_MAX } as any)
      .position(gx + sx * (GOAL_DEPTH * 0.48), 0, 0)
      .rotate(0, -sx * (Math.PI / 2), 0)
      .scale([goalScaleX, goalScaleY, goalScaleZ])
      .runtime(gameRuntime(`fc-goal-mesh-${sx}`)),
    primitives.cylinder({ name: `post-${sx}-n`, size: [0.24, GOAL_H + 0.18, 0.24], material: postMat })
      .position(gx, GOAL_H / 2, -GOAL_HALF_W),
    primitives.cylinder({ name: `post-${sx}-s`, size: [0.24, GOAL_H + 0.18, 0.24], material: postMat })
      .position(gx, GOAL_H / 2, GOAL_HALF_W),
    primitives.cylinder({ name: `bar-${sx}`, size: [0.24, GOAL_HALF_W * 2 + 0.36, 0.24], material: postMat })
      .position(gx, GOAL_H + 0.04, 0).rotate(Math.PI / 2, 0, 0),
    // back frame stays
    primitives.cylinder({ name: `stay-${sx}-n`, size: [0.14, GOAL_H + 0.4, 0.14], material: postMat })
      .position(backX, (GOAL_H + 0.4) / 2, -GOAL_HALF_W).rotate(0, 0, sx * 0.22),
    primitives.cylinder({ name: `stay-${sx}-s`, size: [0.14, GOAL_H + 0.4, 0.14], material: postMat })
      .position(backX, (GOAL_H + 0.4) / 2, GOAL_HALF_W).rotate(0, 0, sx * 0.22),
    primitives.box({ name: `base-back-${sx}`, size: [0.18, 0.14, GOAL_HALF_W * 2 + 0.24], material: postMat })
      .position(backX, 0.07, 0),
    // net: back panel + roof + side panels (thin boxes for 3D net enclosure)
    primitives.box({ name: `net-back-${sx}`, size: [0.05, GOAL_H, GOAL_HALF_W * 2 + 0.2], material: netMat })
      .position(backX, GOAL_H / 2, 0)
      .runtime(gameRuntime(`net-back-${sx}`)),
    primitives.box({ name: `net-roof-${sx}`, size: [GOAL_DEPTH, 0.05, GOAL_HALF_W * 2 + 0.2], material: netMat })
      .position(gx + sx * GOAL_DEPTH / 2, GOAL_H + 0.01, 0)
      .runtime(gameRuntime(`net-roof-${sx}`)),
    primitives.box({ name: `net-n-${sx}`, size: [GOAL_DEPTH, GOAL_H, 0.05], material: netMat })
      .position(gx + sx * GOAL_DEPTH / 2, GOAL_H / 2, -GOAL_HALF_W)
      .runtime(gameRuntime(`net-n-${sx}`)),
    primitives.box({ name: `net-s-${sx}`, size: [GOAL_DEPTH, GOAL_H, 0.05], material: netMat })
      .position(gx + sx * GOAL_DEPTH / 2, GOAL_H / 2, GOAL_HALF_W)
      .runtime(gameRuntime(`net-s-${sx}`))
  ];
}

/** Half-width of the opening left in each Favela end wall for the goal mouth (m). Shared with sim.ts via dims. */
const CAGE_GAP_HALF = CAGE_GOAL_GAP;
/** Largest side of the goal-net GLB (manifest bounds [1.897, 1.282, 0.8]). */
export const GOAL_NET_GLB_MAX = 1.897;
const CAGE_TAGS = ["w-n", "w-s", "e-n", "e-s", "n", "s"] as const;

function stadiumNodes(v: VenueSpec): any[] {
  const nodes: any[] = [];

  /* ---- Favela cage walls (ball bounces off these) ---- */
  const wallMat = material.pbr({ color: v.wallColor, roughness: 0.85 });
  const railMat = material.emissive({ color: v.accent, emissive: v.accent, emissiveIntensity: 0.5 });
  // End walls stop at the posts (FC-10): each goal line has two wall pieces, from the corner to GOAL_HALF_W + 0.2,
  // so the goal mouth stays open; sim.ts exempts the same gap from the cage bounce.
  const endLen = PITCH_HZ + 0.3 - CAGE_GAP_HALF;
  const endZ = CAGE_GAP_HALF + endLen / 2;
  const wallDefs: [string, number, number, number, number][] = [
    ["w-n", -PITCH_HX - 0.35, -endZ, 0.3, endLen],
    ["w-s", -PITCH_HX - 0.35, endZ, 0.3, endLen],
    ["e-n", PITCH_HX + 0.35, -endZ, 0.3, endLen],
    ["e-s", PITCH_HX + 0.35, endZ, 0.3, endLen],
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
  const tiers = MAX_TIERS;
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

  /* ---- Front-row wavers (animated): one instanced capsule batch, moved with setInstances (was 26 nodes, FC-E1) ---- */
  if (v.standCount > 0) {
    nodes.push((instances as any).capsule({
      name: "fc-wavers", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.85 }),
      transforms: waverTransforms(0, false), colors: Array.from({ length: WAVERS }, (_, i) => cols[i % cols.length])
    }).runtime(gameRuntime("fc-wavers")));
  }

  /* ---- Floodlight towers + cones + real spots ---- */
  const towers: [number, number][] = [
    [-PITCH_HX - 6, -PITCH_HZ - 6], [PITCH_HX + 6, -PITCH_HZ - 6],
    [-PITCH_HX - 6, PITCH_HZ + 6.5], [PITCH_HX + 6, PITCH_HZ + 6.5]
  ];
  towers.forEach(([x, z], i) => {
    nodes.push(
      model(assets.fcFloodlightPylonMeshy, { name: `flood-${i}`, targetHeight: 12.5 })
        .position(x, 0, z)
        .rotate(0, Math.atan2(-x, -z), 0),
      lights.spot({ name: `flood-spot-${i}`, position: [x * 0.94, 12, z * 0.94], target: [0, 0, 0], angle: 0.52, penumbra: 0.5, intensity: VENUE_LOOKS[v.id].flood, color: v.floodColor, distance: 90 }),
      effects.lightCone({ name: `flood-cone-${i}`, position: [x * 0.94, 11.6, z * 0.94], direction: [-x * 0.05, -1, -z * 0.05], color: v.floodColor, intensity: 0.3, length: 13, coneAngle: 0.4, softness: 0.6 } as any)
        .runtime(gameRuntime(`flood-cone-${i}`))
    );
  });

  /* ---- Scoreboard gantry + emissive screen ---- */
  nodes.push(
    model(assets.fcScoreboardGantryMeshy, { name: "fc-gantry", targetHeight: 7.5 })
      .position(0, 5.4, -(PITCH_HZ + 9.5)),
    primitives.box({ name: "fc-scoreboard-screen", size: [9.5, 3.1, 0.3], material: material.emissive({ color: "#0d2436", emissive: v.accent, emissiveIntensity: 0.35 }) })
      .position(0, 7.2, -(PITCH_HZ + 9.2))
      .runtime(gameRuntime("fc-scoreboard-screen"))
  );

  /* ---- Glacier dome + aurora ribbons (dome lowered to y=-6.5 when active so floor stays below turf) ---- */
  nodes.push(
    model(assets.fcGlacierDomeMeshy, { name: "fc-dome", targetHeight: 26 })
      .position(0, -90, 0)
      .scale([HIDDEN, HIDDEN, HIDDEN])
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

  /* ---- 3D Meshy dugouts, stadium bowl, ball cart & touchline referee ---- */
  // Dugouts used to sit between the camera and the near touchline, filling
  // the bottom HUD with brown boxes. Park them outside the goal lines so the
  // broadcast view keeps a clean run-up to the pitch.
  nodes.push(
    model(assets.diamondDugout, { name: "dugout-home", targetHeight: 2.1 })
      .position(-35.5, 0, -8)
      .rotate(0, Math.PI / 2, 0),
    model(assets.diamondDugout, { name: "dugout-away", targetHeight: 2.1 })
      .position(35.5, 0, -8)
      .rotate(0, -Math.PI / 2, 0),
    model(assets.hoopsBallCart, { name: "fc-ball-cart", targetHeight: 1.0 })
      .position(34.5, 0, -14.5),
    // No soccer-specific stand exists in the Aura FC registry; the shared
    // diamond stadium now sits low and far behind the authored bleacher bowl
    // so its roof is a distant band instead of a lid on the frame.
    model(assets.diamondStadium, { name: "fc-stadium-bowl", targetHeight: 8.5 })
      .position(0, -2.6, -(PITCH_HZ + 40))
      .scale([1.3, 1, 1.1]),
    model(assets.fcSoccerStrikerMeshy, {
      name: "fc-referee",
      targetHeight: 1.84,
      animation: { clip: "Walk", loop: true, speed: 1.0 },
      materialOverrides: [
        { target: /-kit$/, color: "#e6d02e", colorMode: "replace", replaceTextures: true, roughness: 0.65, metallic: 0 },
        { target: /-shorts$/, color: "#15171c", colorMode: "replace", replaceTextures: true, roughness: 0.7, metallic: 0 },
        { target: /-socks$/, color: "#15171c", colorMode: "replace", replaceTextures: true, roughness: 0.75, metallic: 0 },
        { target: /-skin$/, color: "#b98462", colorMode: "replace", replaceTextures: true, roughness: 0.62, metallic: 0 }
      ]
    } as any)
      .position(0, 0, -(PITCH_HZ + 1.1))
      .runtime(gameRuntime("fc-referee")),
    // trophy cabinet by the tunnel (catalog dressing)
    // FC-19: fitted models sit base-at-origin, so the trophy stands on a 0.9 m plinth and the spare ball on the grass
    primitives.box({ name: "fc-trophy-plinth", size: [1.3, 0.9, 1.3], material: material.pbr({ color: "#1c232b", roughness: 0.55, metalness: 0.2 }) })
      .position(-PITCH_HX - 4.5, 0.45, -(PITCH_HZ + 3.5))
      .rotate(0, 0.8, 0),
    model(assets.fcHeroTrophyMeshy, { name: "fc-trophy-case", targetHeight: 2.2 })
      .position(-PITCH_HX - 4.5, 0.9, -(PITCH_HZ + 3.5))
      .rotate(0, 0.8, 0),
    // spare match ball, tucked behind the away dugout, resting on the grass
    model(assets.fcMatchBallMeshy, { name: "fc-spare-ball", targetHeight: BALL_VIS_R * 2 })
      .position(34.0, 0, -15.5)
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
  // One admitted GLB at regulation size. The old build layered a white sphere,
  // six patch spheres and the GLB together, which read as two merged balls and
  // made the ball ~2.4x regulation diameter.
  return [
    model(assets.fcMatchBallMeshy, { name: "fc-ball-mesh", targetHeight: BALL_VIS_R * 2 })
      .position(0, BALL_VIS_R, 0)
      .runtime(gameRuntime("fc-ball-mesh")),
    primitives.cylinder({ name: "fc-ball-shadow", size: [BALL_VIS_R * 2.3, 0.01, BALL_VIS_R * 2.3], material: material.pbr({ color: "#000000", opacity: 0.32, roughness: 1 }) })
      .runtime(gameRuntime("fc-ball-shadow")),
    effects.trail({ name: "fc-ball-trail", target: "fc-ball-mesh", color: "#d8ff3e", width: 0.08, maxPoints: 40, intensity: 0.85 } as any),
    primitives.torus({ name: "fc-aim-ring", size: [0.34, 0.035, 0.035], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.3 }) })
      .scale(HIDDEN).runtime(gameRuntime("fc-aim-ring")),
    // authored goal feedback (FC-E2): a ring that sweeps out of the goal mouth after a goal
    primitives.torus({ name: "fc-goal-ring", size: [1, 0.06, 0.06], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.6, opacity: 0.85 }) })
      .scale(HIDDEN).runtime(gameRuntime("fc-goal-ring")),
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
export function buildFcScene(venue: VenueId = "munich") {
  const v = VENUES[venue];
  const vl = VENUE_LOOKS[venue];
  const s = scene()
    // The night looks open the roof onto a dark sky tone; Lagos gets a sunset sky and Uyuni daylight.
    .background(vl.background)
    .add(looks.preset(vl.look, { fogDensityScale: 0.5, exposureEv: vl.exposureEv }))
    .addMany(pitchNodes(v))
    .addMany(goalNodes(-1))
    .addMany(goalNodes(1))
    .addMany(stadiumNodes(v))
    .addMany(ballNodes());
  for (const id of ATHLETE_IDS) s.addMany(athleteNodes(id));
  return s
    .add(effects.contactShadows({ intensity: 0.85, length: 0.32 }))
    .add(effects.motionBlur({ intensity: 0.1 }))
    .add(effects.bloom({ intensity: 0.22, threshold: 0.82 }))
    .camera(camera.perspective({ position: [0, 11.5, 23.5], target: [0, 0.9, -1], fov: 40 }));
}

/**
 * QA A/B only (`?ao=0`, LIGHT-06 capture pair): the scene snapshot without the look's ambient-occlusion node, so a
 * capture can measure what the 4.5.0 real-depth AO changes. Normal loads never call this.
 */
export function withoutLookAo(scene: { toJSON(): any }): any {
  const snap = scene.toJSON();
  const strip = (nodes: any[]): any[] => nodes
    .filter((n) => n?.name !== "look ambient occlusion")
    .map((n) => (Array.isArray(n?.children) ? { ...n, children: strip(n.children) } : n));
  return { ...snap, nodes: strip(snap.nodes ?? []) };
}

export interface WorldHandles {
  ground: any; apron: any; pitch: any;
  stripes: any;
  cages: any[]; cageRails: any[];
  hoardings: any[];
  stands: any[];
  crowd: any;
  scoreboard: any;
  nets: any[];
  dome: any;
  referee: any;
  auroras: any[];
  wavers: any;
  confetti: any;
  goalMeshes: any[];
  netBacks: any[];
  goalRing: any;
  ballMesh: any; ballShadow: any;
  aimRing: any; labRing: any;
}

const tryReq = (app: any, id: string) => { try { return app.nodes.require(id); } catch { return null; } };

export function resolveWorld(app: any): WorldHandles {
  const req = (id: string) => app.nodes.require(id);
  return {
    ground: req("fc-ground"), apron: req("fc-apron"), pitch: req("fc-pitch"),
    stripes: tryReq(app, "fc-stripes"),
    cages: CAGE_TAGS.map((t) => tryReq(app, `cage-${t}`)),
    cageRails: CAGE_TAGS.map((t) => tryReq(app, `cage-rail-${t}`)),
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
    referee: tryReq(app, "fc-referee"),
    auroras: [0, 1, 2].map((i) => tryReq(app, `fc-aurora-${i}`)),
    wavers: tryReq(app, "fc-wavers"),
    confetti: tryReq(app, "fc-confetti"),
    goalMeshes: [tryReq(app, "fc-goal-mesh--1"), tryReq(app, "fc-goal-mesh-1")],
    netBacks: [tryReq(app, "net-back--1"), tryReq(app, "net-back-1")],
    goalRing: tryReq(app, "fc-goal-ring"),
    ballMesh: tryReq(app, "fc-ball-mesh"),
    ballShadow: tryReq(app, "fc-ball-shadow"),
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
  if (h.stripes) {
    const st = stripeInstances(v);
    h.stripes.setInstances?.(st.transforms, st.colors);
    h.stripes.setVisible(v.stripes);
  }
  for (const c of h.cages) c?.setMaterial(material.pbr({ color: v.wallColor, roughness: 0.85 })).setScale(v.walled ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(v.walled);
  for (const c of h.cageRails) c?.setMaterial(material.emissive({ color: v.accent, emissive: v.accent, emissiveIntensity: 0.5 })).setScale(v.walled ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(v.walled);
  h.stands.forEach((s, i) => {
    const isNear = i >= 12;
    const tier = i % 4;
    const vis = isNear ? v.standCount >= 3 && tier < 2 : v.standCount > tier;
    s?.setScale(vis ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]).setVisible(vis);
  });
  h.crowd?.setVisible(v.standCount > 0);
  h.wavers?.setVisible(v.standCount > 0);
  // Lower dome floor to y=-6.5 when active so its bottom never occludes the turf
  if (v.dome) {
    h.dome?.setPosition(0, -6.5, 0).setScale([1.22, 1, 1.22]).setVisible(true);
  } else {
    h.dome?.setPosition(0, -90, 0).setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
  }
  for (const a of h.auroras) a?.setVisible(v.aurora);
}

/** Per-frame ambient motion: wavers bounce on goals, referee patrols touchline, aurora drifts, net ripple. */
export function tickWorld(h: WorldHandles, t: number, opts: { cheering: boolean; ripple: number; goalSide?: -1 | 0 | 1; accent?: string; hoarding?: string }): void {
  const cheer = opts.cheering;
  // Touchline referee patrols along the north touchline
  const refX = Math.sin(t * 0.42) * 10.5;
  const refDir = Math.cos(t * 0.42) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  h.referee?.setPosition(refX, 0, -(PITCH_HZ + 1.1)).setRotation(0, refDir, 0).setScale([1, 1, 1]);

  h.wavers?.setInstances?.(waverTransforms(t, cheer));
  for (let i = 0; i < h.auroras.length; i++) {
    h.auroras[i]?.setRotation(-0.5 - i * 0.12, 0.25 * i + Math.sin(t * 0.22 + i * 2) * 0.08, 0);
  }
  if (opts.ripple > 0) {
    const k = 1 + Math.sin(opts.ripple * 22) * 0.06 * Math.min(1, opts.ripple);
    for (const n of h.nets) n?.setScale([k, 1, 1]);
  }
  // FC-E2 goal feedback: the back net of the goal that was scored bulges out, a ring sweeps out of the mouth and the
  // scoreboard flashes; all three settle within 2.8 s (goalFlashT).
  const g = opts.goalSide ?? 0;
  const k = Math.max(0, Math.min(1, opts.ripple / 2.8));
  for (const sx of [-1, 1] as const) {
    const idx = sx < 0 ? 0 : 1;
    const bulge = g === sx ? Math.sin(Math.min(1, (1 - k) * 4) * Math.PI) * 0.45 * k : 0;
    h.netBacks[idx]?.setPosition(sx * (PITCH_HX + GOAL_DEPTH + bulge), GOAL_H / 2, 0);
  }
  if (g !== 0 && k > 0) {
    const r = 1 + (1 - k) * 7;
    h.goalRing?.setPosition(g * (PITCH_HX - 0.2), 1.2, 0).setRotation(0, Math.PI / 2, 0).setScale([r, r, r]).setVisible(true);
  } else {
    h.goalRing?.setScale([HIDDEN, HIDDEN, HIDDEN]).setVisible(false);
  }
  if (h.scoreboard && opts.accent) {
    const flash = g !== 0 && k > 0 ? 0.4 + Math.abs(Math.sin((1 - k) * 18)) * 1.4 * k : 0.4;
    if (Math.abs(flash - (h as any)._flash) > 0.04 || (flash === 0.4 && (h as any)._flash !== 0.4)) {
      (h as any)._flash = flash;
      h.scoreboard.setMaterial(material.emissive({ color: opts.hoarding ?? "#0d2436", emissive: opts.accent, emissiveIntensity: flash }));
    }
  }
}
