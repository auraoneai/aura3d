/**
 * Red Zone 3D — field markings, stadium shell, weather, and broadcast props.
 *
 * All yard-line geometry lives on a 100×53.3 field (z 0..100, x ±26.65) with
 * 10-yard end zones (z -10..0 and z 100..110). Stadium dressing uses typed
 * catalog assets (floodlight towers, scoreboard rig, dugouts, stadium bowl,
 * referee, trophy, footballs) plus instanced crowd capsules, per the route's
 * sports/table look recipe.
 */
import { decals, effects, instances, lights, material, model, primitives, game } from "@aura3d/engine";
import { assets } from "../aura-assets-v2";
import { FIELD, type Stadium } from "./types";

const W = FIELD.HALF_WIDTH;          // 26.65
const L = FIELD.GOAL_FAR;            // 100
const EZ = FIELD.ENDZONE_DEPTH;      // 10
const HIDDEN = 0.0001;

const turf = (color: string) => material.pbr({ color, roughness: 0.88, metalness: 0.02 });
const white = () => material.pbr({ color: "#f8fafc", roughness: 0.82, metalness: 0.02 });
const lineMat = (color: string, opacity = 1) => material.pbr({ color, roughness: 0.82, metalness: 0.02, opacity });

/* ------------------------------------------------------------------ */
/* Playing surface + markings                                           */
/* ------------------------------------------------------------------ */

export function buildFieldNodes(clubHome: string, clubAway: string): any[] {
  // Horizontal XZ planes use size: [widthX, 1, depthZ] and NO X-rotation
  const nodes: any[] = [
    // apron / surrounds — rich dark stadium grass surround
    primitives.plane({
      name: "field-apron",
      size: [124, 1, 176],
      material: material.pbr({ color: "#103819", roughness: 0.92, metalness: 0.02 }),
      receiveShadow: true
    }).position(0, -0.02, 50),
    // main turf — rich deep stadium grass (#1b5e28, roughness 0.88, metalness 0.02)
    primitives.plane({
      name: "field-turf",
      size: [W * 2 + 1.6, 1, L + EZ * 2 + 1.6],
      material: turf("#1b5e28"),
      receiveShadow: true
    })
      .position(0, 0, 50)
      .runtime(game.runtimeNode("field-turf")),
    // end zones (club-colored)
    primitives.plane({ name: "ez-home", size: [W * 2, 1, EZ], material: material.pbr({ color: clubHome, roughness: 0.88, metalness: 0.02, opacity: 0.88 }) })
      .position(0, 0.005, -EZ / 2).runtime(game.runtimeNode("ez-home")),
    primitives.plane({ name: "ez-away", size: [W * 2, 1, EZ], material: material.pbr({ color: clubAway, roughness: 0.88, metalness: 0.02, opacity: 0.88 }) })
      .position(0, 0.005, L + EZ / 2).runtime(game.runtimeNode("ez-away")),
    // boundary stripe
    primitives.box({ name: "sideline-l", size: [0.55, 0.02, L + EZ * 2], material: white() }).position(-W - 0.3, 0.012, 50),
    primitives.box({ name: "sideline-r", size: [0.55, 0.02, L + EZ * 2], material: white() }).position(W + 0.3, 0.012, 50),
    primitives.box({ name: "endline-n", size: [W * 2 + 1.6, 0.02, 0.55], material: white() }).position(0, 0.012, -EZ - 0.3),
    primitives.box({ name: "endline-f", size: [W * 2 + 1.6, 0.02, 0.55], material: white() }).position(0, 0.012, L + EZ + 0.3)
  ];

  // Alternating 5-yard horizontal mow stripes (#1e682d and #175223) across the 100-yard field
  for (let i = 0; i < 20; i++) {
    const zCenter = i * 5 + 2.5;
    const stripeCol = i % 2 === 0 ? "#1e682d" : "#175223";
    nodes.push(
      primitives.plane({
        name: `turf-stripe-${i}`,
        size: [W * 2 - 0.08, 1, 4.94],
        material: turf(stripeCol)
      }).position(0, 0.003, zCenter)
    );
  }

  // yard lines every 5 (goal lines thicker)
  for (let y = 0; y <= L; y += 5) {
    const goal = y === 0 || y === L;
    nodes.push(
      primitives.box({ name: `yardline-${y}`, size: [W * 2, 0.02, goal ? 0.58 : 0.26], material: white() })
        .position(0, 0.012, y)
    );
  }
  // midfield accent
  nodes.push(
    primitives.cylinder({ name: "midfield-logo", size: [5.4, 0.014, 5.4], material: material.emissive({ color: "#f2a71b", emissive: "#f2a71b", emissiveIntensity: 0.28, opacity: 0.72 }) }).position(0, 0.008, 50),
    primitives.cylinder({ name: "midfield-logo-inner", size: [3.6, 0.016, 3.6], material: lineMat("#12355c", 0.9) }).position(0, 0.01, 50)
  );

  // hash marks: instanced boxes at x=±10.4 every yard 1..99
  const hashT: any[] = [];
  for (let y = 1; y < L; y++) {
    hashT.push({ position: [-FIELD.HASH_X, 0.012, y], scale: [0.58, 0.02, 0.18] });
    hashT.push({ position: [FIELD.HASH_X, 0.012, y], scale: [0.58, 0.02, 0.18] });
  }
  // sidelines' yard ticks
  for (let y = 1; y < L; y++) {
    hashT.push({ position: [-W + 0.8, 0.012, y], scale: [0.82, 0.02, 0.14] });
    hashT.push({ position: [W - 0.8, 0.012, y], scale: [0.82, 0.02, 0.14] });
  }
  nodes.push(
    (instances as any).box({ name: "hash-marks", transforms: hashT, material: lineMat("#f8fafc", 0.92) })
  );

  // goal posts — both ends, bespoke 3D Meshy field goal post (`rzFieldGoalPostMeshy`) + glowing gold uprights
  for (const z of [-EZ - 0.5, L + EZ + 0.5]) {
    const g = material.emissive({ color: "#facc15", emissive: "#f59e0b", emissiveIntensity: 0.45 });
    const padMat = material.pbr({ color: "#dc2626", roughness: 0.55, metalness: 0.08 });
    const rotY = z < 0 ? 0 : Math.PI;
    nodes.push(
      model(assets.rzFieldGoalPostMeshy, { name: `goalpost-mesh-${z}` })
        .position(0, 0, z)
        .rotate(0, rotY, 0)
        .scale([11.5, 6.6, 8.5]),
      primitives.cylinder({ name: `post-pad-${z}`, size: [0.46, 2.2, 0.46], material: padMat }).position(0, 1.1, z),
      primitives.cylinder({ name: `post-base-${z}`, size: [0.24, 4.8, 0.24], material: g }).position(0, 2.4, z),
      primitives.cylinder({ name: `post-bar-${z}`, size: [0.2, 6.4, 0.2], material: g })
        .position(0, 4.8, z).rotate(0, 0, Math.PI / 2),
      primitives.cylinder({ name: `post-ul-${z}`, size: [0.18, 9.6, 0.18], material: g }).position(-3.15, 9.6, z),
      primitives.cylinder({ name: `post-ur-${z}`, size: [0.18, 9.6, 0.18], material: g }).position(3.15, 9.6, z)
    );
  }

  // end-zone pylon markers (orange capsules, 8)
  const pylonMat = material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.55 });
  const pylonT: any[] = [];
  for (const z of [0, L]) for (const x of [-W - 0.2, W + 0.2]) {
    pylonT.push({ position: [x, 0.5, z], scale: [0.38, 1.0, 0.38] });
  }
  nodes.push((instances as any).capsule({ name: "pylons", transforms: pylonT, material: pylonMat }));

  // field-wear scuffs
  for (const [x, z, s] of [[-6, 34, 2.2], [5, 62, 2.6], [-11, 78, 1.8], [8, 22, 2.0], [0, 51, 3.0]] as const) {
    nodes.push(
      decals.project({ name: `turf-scuff-${x}-${z}`, color: "#0b2412", size: [s, s * 0.7], opacity: 0.14, position: [x, 0.012, z], normal: [0, 1, 0] })
    );
  }
  return nodes;
}

/* ------------------------------------------------------------------ */
/* Stadium shell — stands, crowd, towers, scoreboard, hoardings         */
/* ------------------------------------------------------------------ */

const CROWD_PALETTES = ["#f2a71b", "#38bdf8", "#e2e8f0", "#dc2626", "#60a5fa", "#fbbf24", "#34d399", "#94a3b8"];

export function buildStadiumNodes(venue: Stadium, lite = false): any[] {
  const nodes: any[] = [];
  const dome = venue.dome;
  const fanPalette = venue.crowd?.length ? [...venue.crowd, ...CROWD_PALETTES] : CROWD_PALETTES;

  // --- Crisp Friday Night Lights key + rim + fill lighting for 3D athletes & stadium ---
  nodes.push(
    lights.directional({
      name: "stadium-key-light",
      position: [26, 38, -16],
      target: [0, 1, 38],
      intensity: 1.45,
      color: "#fff7e6",
      castShadow: true
    } as any),
    lights.directional({
      name: "stadium-rim-light",
      position: [-24, 28, 96],
      target: [0, 1, 35],
      intensity: 0.95,
      color: "#93c5fd",
      castShadow: false
    } as any),
    lights.hemisphere({
      name: "stadium-hemi-light",
      skyColor: "#1e3a5f",
      groundColor: "#14381d",
      intensity: 0.48
    } as any)
  );

  // --- Two-tier open bleachers + instanced crowd capsules sitting cleanly ON TOP ---
  const crowdT: any[] = [];
  const crowdC: string[] = [];
  let ci = 0;
  const rng = (seed: number) => { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (const side of [-1, 1]) {
    for (let row = 0; row < 8; row++) {
      const y = 1.9 + row * 1.05;
      const x = side * (W + 8.6 + row * 1.45);
      for (let i = 0; i < 60; i++) {
        const z = -EZ - 2 + i * ((L + EZ * 2 + 4) / 59);
        crowdT.push({ position: [x + rng(ci) * 0.7, y + rng(ci + 1) * 0.2, z + rng(ci + 2) * 0.7], scale: [0.56, 0.92 + rng(ci + 3) * 0.28, 0.48] });
        crowdC.push(fanPalette[Math.floor(rng(ci + 4) * fanPalette.length)]!);
        ci += 7;
      }
    }
  }
  // end stands crowd
  for (const end of [-1, 1]) {
    for (let row = 0; row < 7; row++) {
      const y = 1.9 + row * 1.05;
      const zz = end === 1 ? L + EZ + 8.6 + row * 1.45 : -EZ - 8.6 - row * 1.45;
      for (let i = 0; i < 42; i++) {
        const x = -W - 2 + i * ((W * 2 + 4) / 41);
        crowdT.push({ position: [x + rng(ci) * 0.7, y + rng(ci + 1) * 0.2, zz + rng(ci + 2) * 0.7], scale: [0.56, 0.92 + rng(ci + 3) * 0.28, 0.48] });
        crowdC.push(fanPalette[Math.floor(rng(ci + 4) * fanPalette.length)]!);
        ci += 7;
      }
    }
  }
  nodes.push(
    (instances as any).capsule({ name: "crowd-bowl", transforms: crowdT, colors: crowdC, material: material.pbr({ color: "#ffffff", roughness: 0.75, metalness: 0.05 }) })
  );

  // Stepped stadium grandstand tiers positioned UNDER the crowd rows (never blocking the camera or burying the crowd)
  const lowerTierMat = material.pbr({ color: "#1e293b", roughness: 0.85, metalness: 0.12 });
  const upperTierMat = material.pbr({ color: "#273549", roughness: 0.82, metalness: 0.15 });
  const fasciaMat = material.emissive({ color: "#0f2942", emissive: venue.accent, emissiveIntensity: 0.55 });
  for (const side of [-1, 1]) {
    nodes.push(
      primitives.box({ name: `stand-lower-${side}`, size: [5.6, 2.2, L + EZ * 2 + 10], material: lowerTierMat })
        .position(side * (W + 10.6), 1.1, 50),
      primitives.box({ name: `stand-upper-${side}`, size: [6.4, 5.2, L + EZ * 2 + 10], material: upperTierMat })
        .position(side * (W + 16.4), 2.6, 50),
      primitives.box({ name: `stand-fascia-${side}`, size: [0.35, 0.75, L + EZ * 2 + 8], material: fasciaMat })
        .position(side * (W + 13.3), 4.1, 50)
    );
  }
  for (const end of [-1, 1]) {
    const zLower = end === 1 ? L + EZ + 10.6 : -EZ - 10.6;
    const zUpper = end === 1 ? L + EZ + 16.4 : -EZ - 16.4;
    nodes.push(
      primitives.box({ name: `endstand-lower-${end}`, size: [W * 2 + 14, 2.2, 5.6], material: lowerTierMat })
        .position(0, 1.1, zLower),
      primitives.box({ name: `endstand-upper-${end}`, size: [W * 2 + 18, 5.2, 6.4], material: upperTierMat })
        .position(0, 2.6, zUpper)
    );
  }

  // --- 6 floodlight towers (`rzFloodlightPylonMeshy`) + glowing sodium/LED light-bank fixtures ---
  const towers: [number, number][] = [
    [-W - 15, -4], [W + 15, -4],
    [-W - 15, 50], [W + 15, 50],
    [-W - 15, L + 6], [W + 15, L + 6]
  ];
  const lampHeadMat = material.emissive({ color: "#fffbeb", emissive: "#fde68a", emissiveIntensity: 2.2 });
  towers.forEach(([x, z], i) => {
    const yawToCenter = Math.atan2(-x, 50 - z);
    if (!lite) {
      nodes.push(
        model(assets.rzFloodlightPylonMeshy, { name: `flood-tower-${i}`, targetHeight: 17.5 })
          .position(x, 0, z)
          .rotate(0, yawToCenter, 0)
      );
    }
    nodes.push(
      primitives.box({ name: `flood-head-${i}`, size: [3.2, 1.2, 0.6], material: lampHeadMat })
        .position(x, 16.8, z)
        .rotate(0.28, yawToCenter, 0),
      lights.spot({
        name: `flood-spot-${i}`,
        position: [x * 0.92, 16.5, z],
        target: [0, 0.5, clampZ(z)],
        angle: 0.58,
        penumbra: 0.65,
        intensity: 1.15,
        color: "#fff4d6",
        distance: 110
      })
    );
  });

  // --- Broadcast scoreboard gantries (far endzone facing camera + near endzone) & stadium arch ---
  if (!lite) {
    nodes.push(
      // Primary far-endzone scoreboard gantry facing the broadcast camera
      model(assets.rzScoreboardGantryMeshy, { name: "scoreboard-gantry-far", targetHeight: 10.5 })
        .position(0, 5.2, L + EZ + 15)
        .rotate(0, Math.PI, 0),
      // Secondary near-endzone scoreboard gantry
      model(assets.rzScoreboardGantryMeshy, { name: "scoreboard-gantry", targetHeight: 7.5 })
        .position(0, 5.4, -EZ - 17),
      model(assets.diamondStadium, { name: "stadium-arch", targetHeight: 16.5 })
        .position(0, -1.0, L + EZ + 21)
        .rotate(0, Math.PI, 0)
        .scale([1.45, 1.05, 1.1])
    );
  }
  nodes.push(
    // Far endzone jumbo LED scoreboard screen + illuminated gold header accent
    primitives.box({
      name: "scoreboard-screen",
      size: [15.5, 4.6, 0.45],
      material: material.emissive({ color: "#0d2436", emissive: venue.accent, emissiveIntensity: 0.72 })
    })
      .position(0, 9.8, L + EZ + 14.4)
      .runtime(game.runtimeNode("scoreboard-screen")),
    primitives.box({
      name: "scoreboard-header-far",
      size: [16.2, 0.65, 0.55],
      material: material.emissive({ color: "#facc15", emissive: "#f59e0b", emissiveIntensity: 1.15 })
    }).position(0, 12.35, L + EZ + 14.4),
    // Near endzone scoreboard screen
    primitives.box({
      name: "scoreboard-screen-near",
      size: [10.5, 3.4, 0.35],
      material: material.emissive({ color: "#0d2436", emissive: venue.accent, emissiveIntensity: 0.55 })
    }).position(0, 7.4, -EZ - 16.6),
    // Twin endzone ribbon boards
    primitives.box({ name: "ribbon-l", size: [W * 2 + 6, 0.95, 0.24], material: material.emissive({ color: "#0e2b46", emissive: venue.accent, emissiveIntensity: 0.6 }) })
      .position(0, 1.25, -EZ - 6.5).runtime(game.runtimeNode("ribbon-l")),
    primitives.box({ name: "ribbon-r", size: [W * 2 + 6, 0.95, 0.24], material: material.emissive({ color: "#0e2b46", emissive: venue.accent, emissiveIntensity: 0.65 }) })
      .position(0, 1.25, L + EZ + 6.5).runtime(game.runtimeNode("ribbon-r"))
  );

  // --- sideline benches + 3D Meshy dugouts, ball cart, trophy pedestal & Referee ---
  for (const side of [-1, 1]) {
    nodes.push(
      primitives.box({ name: `bench-${side}-a`, size: [8, 0.5, 1.1], material: material.pbr({ color: "#334155", roughness: 0.72 }) }).position(side * (W + 2.6), 0.25, 35),
      primitives.box({ name: `bench-${side}-b`, size: [8, 0.5, 1.1], material: material.pbr({ color: "#334155", roughness: 0.72 }) }).position(side * (W + 2.6), 0.25, 65),
      primitives.box({ name: `bench-${side}-back-a`, size: [8, 0.9, 0.24], material: material.pbr({ color: "#1e293b", roughness: 0.78 }) }).position(side * (W + 3.2), 0.85, 35),
      primitives.box({ name: `bench-${side}-back-b`, size: [8, 0.9, 0.24], material: material.pbr({ color: "#1e293b", roughness: 0.78 }) }).position(side * (W + 3.2), 0.85, 65)
    );
  }
  if (!lite) {
    nodes.push(
      model(assets.diamondDugout, { name: "sideline-dugout-l", targetHeight: 2.4 })
        .position(-W - 4.2, 0, 50)
        .rotate(0, Math.PI / 2, 0),
      model(assets.diamondDugout, { name: "sideline-dugout-r", targetHeight: 2.4 })
        .position(W + 4.2, 0, 50)
        .rotate(0, -Math.PI / 2, 0),
      model(assets.hoopsBallCart, { name: "sideline-ball-cart", targetHeight: 1.15 })
        .position(W + 3.0, 0, 42),
      model(assets.rzLombardiCupMeshy, { name: "cup-pedestal", targetHeight: 2.1 })
        .position(-W - 3.2, 0, 30).rotate(0, Math.PI / 2.6, 0)
        .runtime(game.runtimeNode("cup-pedestal")),
      model(assets.rzFootballMeshy, { name: "ball-rack", targetHeight: 0.52 })
        .position(W + 3.2, 0.28, 70).rotate(0, -Math.PI / 2.6, 0)
        .runtime(game.runtimeNode("ball-rack")),
      // Rigged 3D Meshy Referee on the field/sideline
      model(assets.gallerySecurityGuardMeshy, {
        name: "rz-referee",
        targetHeight: 2.22,
        animation: { clip: "Idle_Loop", loop: true, speed: 1.0 }
      } as any)
        .position(-9.5, 0, 20)
        .runtime(game.runtimeNode("rz-referee"))
    );
  }

  // --- sponsor hoardings on the sideline fences ---
  const hoardMat = material.emissive({ color: "#0e2b46", emissive: venue.accent, emissiveIntensity: 0.5 });
  for (const [name, x, z, w, rot] of [
    ["hoard-near-l", -W - 5.2, 25, 44, Math.PI / 2],
    ["hoard-near-r", W + 5.2, 25, 44, Math.PI / 2],
    ["hoard-far-l", -W - 5.2, 75, 44, Math.PI / 2],
    ["hoard-far-r", W + 5.2, 75, 44, Math.PI / 2]
  ] as const) {
    nodes.push(
      primitives.box({ name, size: [w, 0.85, 0.22], material: hoardMat }).position(x, 0.45, z).rotate(0, rot, 0).runtime(game.runtimeNode(name))
    );
  }

  // --- venue roof shell for domes (always created when !lite so venue switch can toggle it; lowered to y=-6.5 when active so floor stays below turf) ---
  if (!lite) {
    nodes.push(
      model(assets.rzAltitudeDomeMeshy, { name: "dome-shell", targetHeight: 34 })
        .position(0, dome ? -6.5 : -90, 50)
        .scale(dome ? [1.3, 1, 1.3] : [HIDDEN, HIDDEN, HIDDEN])
        .runtime(game.runtimeNode("dome-shell"))
    );
  }

  // --- weather systems (visibility toggled by venue; breath-fog disabled so field never looks white-washed) ---
  nodes.push(
    effects.snow({ name: "weather-snow", intensity: 0.55, speed: 0.9, wind: [-0.7, -1.05, -0.2] } as any).runtime(game.runtimeNode("weather-snow")),
    effects.rain({ name: "weather-rain", intensity: 0.5, speed: 1.15, wind: [-0.5, -6.2, -0.3] } as any).runtime(game.runtimeNode("weather-rain")),
    effects.particles({ name: "breath-fog", position: [0, -50, 50], color: "#cfd8e8", intensity: 0, visible: false, emitter: "fountain", radius: 1, height: 0.1, particleCount: 4, speed: 0.05 } as any)
      .runtime(game.runtimeNode("breath-fog"))
  );

  // --- scoring pyro + confetti (hidden until a TD) ---
  nodes.push(
    effects.particles({ name: "confetti-cannon", position: [0, 4.2, 50], color: "#ffd76a", intensity: 1, visible: false, rate: 70, speed: 5.2, size: 0.06, lifetime: 3.2, spread: 1.0, gravity: -1.1 } as any)
      .runtime(game.runtimeNode("confetti-cannon")),
    effects.flipbook({ name: "pyro-l", position: [-W - 1, 0.6, -EZ + 1], size: [2.4, 3.2], frameRate: 22, visible: false, loop: false } as any).runtime(game.runtimeNode("pyro-l")),
    effects.flipbook({ name: "pyro-r", position: [W + 1, 0.6, -EZ + 1], size: [2.4, 3.2], frameRate: 22, visible: false, loop: false } as any).runtime(game.runtimeNode("pyro-r"))
  );

  // --- front-row wavers (animated crowd) ---
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? -1 : 1;
    const z = 12 + i * 5.6;
    nodes.push(
      primitives.capsule({ name: `waver-${i}`, size: [1, 1, 1], material: material.pbr({ color: fanPalette[i % fanPalette.length], roughness: 0.78 }) })
        .position(side * (W + 5.8), 1.15, z).scale([0.54, 0.88, 0.46])
        .runtime(game.runtimeNode(`waver-${i}`))
    );
  }

  return nodes;
}

function clampZ(z: number): number {
  return Math.max(10, Math.min(90, z));
}

/* ------------------------------------------------------------------ */
/* Play-layer runtime nodes — ball, markers, reticle, lab props         */
/* ------------------------------------------------------------------ */

export function buildPlayNodes(): any[] {
  const nodes: any[] = [
    // football: typed catalog GLB (real textured ball) + shadow
    model(assets.rzFootballMeshy, { name: "football", targetHeight: 0.38 })
      .runtime(game.runtimeNode("football")),
    primitives.cylinder({ name: "football-shadow", size: [0.5, 0.008, 0.5], material: material.pbr({ color: "#000000", opacity: 0.4, roughness: 1 }) })
      .runtime(game.runtimeNode("football-shadow")),
    // ball spiral trail
    effects.trail({ name: "ball-trail", target: "football", color: "#ffd76a", width: 0.12, maxPoints: 34, intensity: 0.8 } as any),
    // line of scrimmage (blue) + first-down (yellow) + goal-line glow markers
    primitives.box({ name: "los-marker", size: [W * 2 + 0.6, 0.03, 0.42], material: material.emissive({ color: "#2f7dd1", emissive: "#2f7dd1", emissiveIntensity: 0.85, opacity: 0.75 }) })
      .runtime(game.runtimeNode("los-marker")),
    primitives.box({ name: "fd-marker", size: [W * 2 + 0.6, 0.03, 0.42], material: material.emissive({ color: "#f6c945", emissive: "#f6c945", emissiveIntensity: 0.8, opacity: 0.7 }) })
      .runtime(game.runtimeNode("fd-marker")),
    // QB aim reticle + catch-landing indicator
    primitives.torus({ name: "aim-ring", size: [0.62, 0.05, 0.05], material: material.emissive({ color: "#f6c945", emissive: "#f6c945", emissiveIntensity: 1.1 }) })
      .runtime(game.runtimeNode("aim-ring")),
    primitives.torus({ name: "land-ring", size: [0.5, 0.045, 0.045], material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff", emissiveIntensity: 1.2 }) })
      .runtime(game.runtimeNode("land-ring")),
    // tackle-lab cone gates
    primitives.cylinder({ name: "lab-cone-a", size: [0.5, 0.8, 0.5], material: material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.3 }) })
      .runtime(game.runtimeNode("lab-cone-a")),
    primitives.cylinder({ name: "lab-cone-b", size: [0.5, 0.8, 0.5], material: material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.3 }) })
      .runtime(game.runtimeNode("lab-cone-b"))
  ];
  return nodes;
}
