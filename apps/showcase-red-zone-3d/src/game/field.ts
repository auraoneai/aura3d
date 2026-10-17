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

const turf = (color: string) => material.pbr({ color, roughness: 0.92 });
const white = () => material.pbr({ color: "#f4f7f2", roughness: 0.7 });
const lineMat = (color: string, opacity = 1) => material.pbr({ color, roughness: 0.75, opacity });

/* ------------------------------------------------------------------ */
/* Playing surface + markings                                           */
/* ------------------------------------------------------------------ */

export function buildFieldNodes(clubHome: string, clubAway: string): any[] {
  // Horizontal XZ planes use size: [widthX, 1, depthZ] and NO X-rotation
  const nodes: any[] = [
    // apron / surrounds
    primitives.plane({ name: "field-apron", size: [110, 1, 160], material: turf("#1c3a26"), receiveShadow: true })
      .position(0, -0.02, 50),
    // main turf
    primitives.plane({ name: "field-turf", size: [W * 2 + 1.6, 1, L + EZ * 2 + 1.6], material: turf("#2e7d3f"), receiveShadow: true })
      .position(0, 0, 50)
      .runtime(game.runtimeNode("field-turf")),
    // end zones (club-colored)
    primitives.plane({ name: "ez-home", size: [W * 2, 1, EZ], material: material.pbr({ color: clubHome, roughness: 0.88, opacity: 0.85 }) })
      .position(0, 0.005, -EZ / 2).runtime(game.runtimeNode("ez-home")),
    primitives.plane({ name: "ez-away", size: [W * 2, 1, EZ], material: material.pbr({ color: clubAway, roughness: 0.88, opacity: 0.85 }) })
      .position(0, 0.005, L + EZ / 2).runtime(game.runtimeNode("ez-away")),
    // boundary stripe
    primitives.box({ name: "sideline-l", size: [0.5, 0.02, L + EZ * 2], material: white() }).position(-W - 0.3, 0.012, 50),
    primitives.box({ name: "sideline-r", size: [0.5, 0.02, L + EZ * 2], material: white() }).position(W + 0.3, 0.012, 50),
    primitives.box({ name: "endline-n", size: [W * 2 + 1.6, 0.02, 0.5], material: white() }).position(0, 0.012, -EZ - 0.3),
    primitives.box({ name: "endline-f", size: [W * 2 + 1.6, 0.02, 0.5], material: white() }).position(0, 0.012, L + EZ + 0.3)
  ];

  // Alternating 5-yard horizontal mow stripes across the 100-yard field
  for (let i = 0; i < 20; i++) {
    const zCenter = i * 5 + 2.5;
    const stripeCol = i % 2 === 0 ? "#2b753b" : "#338544";
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
      primitives.box({ name: `yardline-${y}`, size: [W * 2, 0.02, goal ? 0.55 : 0.24], material: white() })
        .position(0, 0.012, y)
    );
  }
  // midfield accent
  nodes.push(
    primitives.cylinder({ name: "midfield-logo", size: [5.2, 0.012, 5.2], material: lineMat("#f4f7f2", 0.28) }).position(0, 0.008, 50)
  );

  // hash marks: instanced boxes at x=±10.4 every yard 1..99
  const hashT: any[] = [];
  for (let y = 1; y < L; y++) {
    hashT.push({ position: [-FIELD.HASH_X, 0.012, y], scale: [0.55, 0.02, 0.16] });
    hashT.push({ position: [FIELD.HASH_X, 0.012, y], scale: [0.55, 0.02, 0.16] });
  }
  // sidelines' yard ticks
  for (let y = 1; y < L; y++) {
    hashT.push({ position: [-W + 0.8, 0.012, y], scale: [0.8, 0.02, 0.12] });
    hashT.push({ position: [W - 0.8, 0.012, y], scale: [0.8, 0.02, 0.12] });
  }
  nodes.push(
    (instances as any).box({ name: "hash-marks", transforms: hashT, material: lineMat("#f4f7f2", 0.85) })
  );

  // goal posts — both ends, bespoke 3D Meshy field goal post (`rzFieldGoalPostMeshy`) + yellow uprights
  for (const z of [-EZ - 0.5, L + EZ + 0.5]) {
    const g = material.pbr({ color: "#f6c945", roughness: 0.4, metalness: 0.5 });
    const rotY = z < 0 ? 0 : Math.PI;
    nodes.push(
      model(assets.rzFieldGoalPostMeshy, { name: `goalpost-mesh-${z}` })
        .position(0, 0, z)
        .rotate(0, rotY, 0)
        .scale([11.0, 6.2, 8.0]),
      primitives.cylinder({ name: `post-base-${z}`, size: [0.16, 4.6, 0.16], material: g }).position(0, 2.3, z),
      primitives.cylinder({ name: `post-bar-${z}`, size: [0.12, 6.15, 0.12], material: g })
        .position(0, 4.6, z).rotate(0, 0, Math.PI / 2),
      primitives.cylinder({ name: `post-ul-${z}`, size: [0.1, 9.1, 0.1], material: g }).position(-3.05, 9.15, z),
      primitives.cylinder({ name: `post-ur-${z}`, size: [0.1, 9.1, 0.1], material: g }).position(3.05, 9.15, z)
    );
  }

  // end-zone pylon markers (orange capsules, 8)
  const pylonMat = material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.35 });
  const pylonT: any[] = [];
  for (const z of [0, L]) for (const x of [-W - 0.2, W + 0.2]) {
    pylonT.push({ position: [x, 0.45, z], scale: [0.34, 0.9, 0.34] });
  }
  nodes.push((instances as any).capsule({ name: "pylons", transforms: pylonT, material: pylonMat }));

  // field-wear scuffs
  for (const [x, z, s] of [[-6, 34, 2.2], [5, 62, 2.6], [-11, 78, 1.8], [8, 22, 2.0], [0, 51, 3.0]] as const) {
    nodes.push(
      decals.project({ name: `turf-scuff-${x}-${z}`, color: "#0d2318", size: [s, s * 0.7], opacity: 0.14, position: [x, 0.012, z], normal: [0, 1, 0] })
    );
  }
  return nodes;
}

/* ------------------------------------------------------------------ */
/* Stadium shell — stands, crowd, towers, scoreboard, hoardings         */
/* ------------------------------------------------------------------ */

const CROWD_PALETTES = ["#26303e", "#37445c", "#4d5c78", "#596a86", "#2e3a50", "#3d4a62", "#1f2a3e", "#6b7a99"];

export function buildStadiumNodes(venue: Stadium, lite = false): any[] {
  const nodes: any[] = [];
  const dome = venue.dome;

  // --- Two-tier stands (dark shell + instanced crowd capsules) ---
  const crowdT: any[] = [];
  const crowdC: string[] = [];
  let ci = 0;
  const rng = (seed: number) => { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (const side of [-1, 1]) {
    for (let row = 0; row < 9; row++) {
      const y = 2.4 + row * 1.15;
      const x = side * (W + 7.5 + row * 1.25);
      for (let i = 0; i < 64; i++) {
        const z = -EZ - 2 + i * ((L + EZ * 2 + 4) / 63);
        crowdT.push({ position: [x + rng(ci) * 0.9, y + rng(ci + 1) * 0.24, z + rng(ci + 2) * 0.8], scale: [0.5, 0.85 + rng(ci + 3) * 0.3, 0.42] });
        crowdC.push(CROWD_PALETTES[Math.floor(rng(ci + 4) * CROWD_PALETTES.length)]!);
        ci += 7;
      }
    }
  }
  // end stands
  for (const end of [-1, 1]) {
    for (let row = 0; row < 7; row++) {
      const y = 2.4 + row * 1.15;
      const zz = end === 1 ? L + EZ + 8.5 + row * 1.25 : -EZ - 8.5 - row * 1.25;
      for (let i = 0; i < 40; i++) {
        const x = -W - 2 + i * ((W * 2 + 4) / 39);
        crowdT.push({ position: [x + rng(ci) * 0.9, y + rng(ci + 1) * 0.24, zz + rng(ci + 2) * 0.8], scale: [0.5, 0.85 + rng(ci + 3) * 0.3, 0.42] });
        crowdC.push(CROWD_PALETTES[Math.floor(rng(ci + 4) * CROWD_PALETTES.length)]!);
        ci += 7;
      }
    }
  }
  nodes.push(
    (instances as any).capsule({ name: "crowd-bowl", transforms: crowdT, colors: crowdC, material: material.pbr({ color: "#ffffff", roughness: 0.92 }) })
  );

  // stand shells (dark concrete tiers the crowd sits on)
  const standMat = material.pbr({ color: "#141a24", roughness: 0.95 });
  for (const side of [-1, 1]) {
    nodes.push(
      primitives.box({ name: `stand-${side}`, size: [14.5, 13.5, L + EZ * 2 + 8], material: standMat })
        .position(side * (W + 12.5), 5.6, 50).rotate(0, 0, side * -0.42)
    );
  }
  for (const end of [-1, 1]) {
    nodes.push(
      primitives.box({ name: `endstand-${end}`, size: [W * 2 + 16, 10.5, 12], material: standMat })
        .position(0, 4.4, end === 1 ? L + EZ + 13 : -EZ - 13).rotate(end === 1 ? -0.4 : 0.4, 0, 0)
    );
  }

  // --- floodlight towers (typed catalog asset) + volumetric cones ---
  const towers: [number, number][] = [[-W - 16, -6], [W + 16, -6], [-W - 16, L + 6], [W + 16, L + 6]];
  towers.forEach(([x, z], i) => {
    if (!lite) {
      nodes.push(
        model(assets.rzFloodlightPylonMeshy, { name: `flood-tower-${i}`, targetHeight: 14 })
          .position(x, 0, z)
          .rotate(0, Math.atan2(-x, -(z - 50)), 0)
      );
    }
    nodes.push(
      lights.spot({ name: `flood-spot-${i}`, position: [x * 0.9, 13.4, z * 0.9 + 5], target: [0, 0, 50], angle: 0.62, penumbra: 0.5, intensity: 2.4, color: "#cfe8ff", distance: 130 }),
      effects.lightCone({ name: `flood-cone-${i}`, position: [x * 0.9, 13.2, z * 0.9 + 5], direction: [-x * 0.05, -1, (50 - z) * 0.05], color: venue.accent, intensity: dome ? 0.14 : 0.3, length: 16, coneAngle: 0.45, softness: 0.55 } as any)
    );
  });

  // --- broadcast scoreboard gantry (typed catalog asset) ---
  if (!lite) {
    nodes.push(
      model(assets.rzScoreboardGantryMeshy, { name: "scoreboard-gantry", targetHeight: 7.5 })
        .position(0, 5.4, -EZ - 17),
      model(assets.diamondStadium, { name: "stadium-arch", targetHeight: 16 })
        .position(0, -1.5, L + EZ + 22)
        .rotate(0, Math.PI, 0)
        .scale([1.4, 1, 1.1])
    );
  }
  nodes.push(
    primitives.box({ name: "scoreboard-screen", size: [10.5, 3.4, 0.35], material: material.emissive({ color: "#0d2436", emissive: venue.accent, emissiveIntensity: 0.5 }) })
      .position(0, 7.4, -EZ - 16.6).runtime(game.runtimeNode("scoreboard-screen")),
    // twin ribbon boards
    primitives.box({ name: "ribbon-l", size: [W * 2 + 4, 0.85, 0.2], material: material.emissive({ color: "#0e2b46", emissive: venue.accent, emissiveIntensity: 0.4 }) })
      .position(0, 1.1, -EZ - 6.5).runtime(game.runtimeNode("ribbon-l")),
    primitives.box({ name: "ribbon-r", size: [W * 2 + 4, 0.85, 0.2], material: material.emissive({ color: "#0e2b46", emissive: venue.accent, emissiveIntensity: 0.4 }) })
      .position(0, 1.1, L + EZ + 6.5).runtime(game.runtimeNode("ribbon-r"))
  );

  // --- sideline benches + 3D Meshy dugouts, ball cart, trophy pedestal & Referee ---
  for (const side of [-1, 1]) {
    nodes.push(
      primitives.box({ name: `bench-${side}-a`, size: [8, 0.5, 1.1], material: material.pbr({ color: "#26303e", roughness: 0.75 }) }).position(side * (W + 2.6), 0.25, 35),
      primitives.box({ name: `bench-${side}-b`, size: [8, 0.5, 1.1], material: material.pbr({ color: "#26303e", roughness: 0.75 }) }).position(side * (W + 2.6), 0.25, 65),
      primitives.box({ name: `bench-${side}-back-a`, size: [8, 0.9, 0.24], material: material.pbr({ color: "#1d2430", roughness: 0.8 }) }).position(side * (W + 3.2), 0.85, 35),
      primitives.box({ name: `bench-${side}-back-b`, size: [8, 0.9, 0.24], material: material.pbr({ color: "#1d2430", roughness: 0.8 }) }).position(side * (W + 3.2), 0.85, 65)
    );
  }
  if (!lite) {
    nodes.push(
      model(assets.diamondDugout, { name: "sideline-dugout-l", targetHeight: 2.4 })
        .position(-W - 3.6, 0, 50)
        .rotate(0, Math.PI / 2, 0),
      model(assets.diamondDugout, { name: "sideline-dugout-r", targetHeight: 2.4 })
        .position(W + 3.6, 0, 50)
        .rotate(0, -Math.PI / 2, 0),
      model(assets.hoopsBallCart, { name: "sideline-ball-cart", targetHeight: 1.05 })
        .position(W + 3.0, 0, 42),
      model(assets.rzLombardiCupMeshy, { name: "cup-pedestal", targetHeight: 1.9 })
        .position(-W - 3.2, 0, 30).rotate(0, Math.PI / 2.6, 0)
        .runtime(game.runtimeNode("cup-pedestal")),
      model(assets.rzFootballMeshy, { name: "ball-rack", targetHeight: 0.5 })
        .position(W + 3.2, 0.28, 70).rotate(0, -Math.PI / 2.6, 0)
        .runtime(game.runtimeNode("ball-rack")),
      // Rigged 3D Meshy Referee on the field/sideline
      model(assets.gallerySecurityGuardMeshy, {
        name: "rz-referee",
        targetHeight: 1.88,
        animation: { clip: "Idle_Loop", loop: true, speed: 1.0 }
      } as any)
        .position(-9.5, 0, 20)
        .runtime(game.runtimeNode("rz-referee"))
    );
  }

  // --- sponsor hoardings on the sideline fences ---
  const hoardMat = material.emissive({ color: "#0e2b46", emissive: venue.accent, emissiveIntensity: 0.42 });
  for (const [name, x, z, w, rot] of [
    ["hoard-near-l", -W - 4.6, 25, 44, Math.PI / 2],
    ["hoard-near-r", W + 4.6, 25, 44, Math.PI / 2],
    ["hoard-far-l", -W - 4.6, 75, 44, Math.PI / 2],
    ["hoard-far-r", W + 4.6, 75, 44, Math.PI / 2]
  ] as const) {
    nodes.push(
      primitives.box({ name, size: [w, 0.95, 0.22], material: hoardMat }).position(x, 0.5, z).rotate(0, rot, 0).runtime(game.runtimeNode(name))
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

  // --- weather systems (visibility toggled by venue) ---
  nodes.push(
    effects.snow({ name: "weather-snow", intensity: 0.55, speed: 0.9, wind: [-0.7, -1.05, -0.2] } as any).runtime(game.runtimeNode("weather-snow")),
    effects.rain({ name: "weather-rain", intensity: 0.5, speed: 1.15, wind: [-0.5, -6.2, -0.3] } as any).runtime(game.runtimeNode("weather-rain")),
    effects.particles({ name: "breath-fog", position: [0, 1.1, 50], color: "#cfd8e8", intensity: 0.4, emitter: "fountain", radius: 24, height: 2.2, particleCount: 260, speed: 0.25, gravity: -0.05, sizeOverLife: [0.5, 1.6, 0.4], alphaOverLife: [0, 0.16, 0] } as any)
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
      primitives.capsule({ name: `waver-${i}`, size: [1, 1, 1], material: material.pbr({ color: CROWD_PALETTES[i % CROWD_PALETTES.length], roughness: 0.85 }) })
        .position(side * (W + 4.9), 1.15, z).scale([0.5, 0.82, 0.42])
        .runtime(game.runtimeNode(`waver-${i}`))
    );
  }

  return nodes;
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
