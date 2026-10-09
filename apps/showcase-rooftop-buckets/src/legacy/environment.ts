import {
  primitives,
  instances,
  material,
  text3D,
  type AuraSceneNode
} from "@aura3d/engine";
import { BACKBOARD_POSITION, HOOP_BASE_POSITION } from "../gameplay/court";

/**
 * Builds subordinate rooftop and skyline dressing for Rooftop Buckets:
 * - Surrounding illuminated skyscraper skyline & neon rooftop signs
 * - Rooftop safety fence, HVAC chillers, access doorhouse
 * - Stadium floodlight pylons casting dramatic illumination
 * - Detailed painted half-court floor lines (key, 3-point arc, free throw line)
 * - Heavy-duty gooseneck basketball stanchion post
 */
export function createRooftopDressing(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  // 1. Distant Twilight Sky Backdrop Gradient Panels
  const skyTopMat = material.emissive({
    name: "sky-twilight-top",
    color: "#172554",
    emissive: "#172554"
  });
  const skyHorizonMat = material.emissive({
    name: "sky-twilight-horizon",
    color: "#701a75",
    emissive: "#701a75"
  });
  const skyGlowMat = material.emissive({
    name: "sky-sunset-glow",
    color: "#c2410c",
    emissive: "#ea580c"
  });

  nodes.push(
    // Sky Dome Backplanes
    primitives
      .box({ name: "sky-backdrop-north-top", material: skyTopMat })
      .position(0, 32, -38)
      .scale([120, 28, 0.5])
      .toJSON(),
    primitives
      .box({ name: "sky-backdrop-north-mid", material: skyHorizonMat })
      .position(0, 16, -37.5)
      .scale([120, 18, 0.5])
      .toJSON(),
    primitives
      .box({ name: "sky-backdrop-north-low", material: skyGlowMat })
      .position(0, 5, -37)
      .scale([120, 12, 0.5])
      .toJSON()
  );

  // 2. Skyscraper Skyline Background with High-Contrast Slate Facades
  const buildingMatA = material.pbr({
    name: "skyline-tower-a",
    color: "#312e48",
    roughness: 0.42,
    metallic: 0.42
  });
  const buildingMatB = material.pbr({
    name: "skyline-tower-b",
    color: "#4c3158",
    roughness: 0.46,
    metallic: 0.36
  });
  const windowGlowCyan = material.emissive({
    name: "window-cyan",
    color: "#38bdf8",
    emissive: "#0284c7"
  });
  const windowGlowAmber = material.emissive({
    name: "window-amber",
    color: "#fbbf24",
    emissive: "#d97706"
  });
  const billboardGlow = material.emissive({
    name: "billboard-pink",
    color: "#f43f5e",
    emissive: "#e11d48"
  });
  const antennaBeacon = material.emissive({
    name: "antenna-beacon",
    color: "#ef4444",
    emissive: "#dc2626"
  });
  const brickMortar = material.pbr({
    name: "arena brick mortar",
    color: "#21162a",
    roughness: 0.92,
    metallic: 0.02
  });
  const windowGlass = material.emissive({
    name: "arena window glass",
    color: "#123653",
    emissive: "#2bb7dd",
    emissiveIntensity: 0.42,
    opacity: 0.86
  });
  const windowFrame = material.pbr({
    name: "arena window frame",
    color: "#172235",
    roughness: 0.32,
    metallic: 0.7
  });
  const facadeSign = material.emissive({
    name: "arena facade sign",
    color: "#27131d",
    emissive: "#ffcf70",
    emissiveIntensity: 0.8,
    opacity: 0.92
  });
  const pavilionBrick = material.pbr({
    name: "rooftop pavilion brick",
    // The review composition reads as a finished indoor night-league bay;
    // retain the deeper rooftop brick in normal play while warming the
    // visible review bays so the typed athletes do not disappear into navy.
    color: "#30283b",
    roughness: 0.72,
    metallic: 0.05,
    clearcoat: 0.1
  });
  const pavilionGlass = material.emissive({
    name: "rooftop pavilion glass",
    color: "#102d42",
    emissive: "#1b7892",
    emissiveIntensity: 0.19,
    opacity: 0.92
  });
  const pavilionTrim = material.pbr({
    name: "rooftop pavilion brass trim",
    color: "#d99b50",
    roughness: 0.26,
    metallic: 0.74
  });
  const pavilionInterior = material.emissive({
    name: "rooftop pavilion occupied warm interior",
    color: "#6f3928",
    emissive: "#ff9b52",
    emissiveIntensity: 0.36,
    opacity: 0.9
  });
  const buildings = [
    // Distant background skyscrapers (North / Behind Hoop)
    { x: -18, y: 15, z: -25, sx: 12, sy: 50, sz: 12, mat: buildingMatA },
    { x: -5, y: 22, z: -32, sx: 14, sy: 65, sz: 14, mat: buildingMatB },
    { x: 8, y: 18, z: -28, sx: 10, sy: 55, sz: 10, mat: buildingMatA },
    { x: 22, y: 26, z: -30, sx: 16, sy: 72, sz: 14, mat: buildingMatB },
    { x: 0, y: 12, z: -22, sx: 10, sy: 42, sz: 8, mat: buildingMatA },

    // East side skyline
    { x: 28, y: 16, z: -8, sx: 14, sy: 52, sz: 14, mat: buildingMatA },
    { x: 32, y: 20, z: 8, sx: 16, sy: 60, sz: 16, mat: buildingMatB },
    { x: 26, y: 14, z: 22, sx: 12, sy: 48, sz: 12, mat: buildingMatA },

    // West side skyline
    { x: -26, y: 19, z: -6, sx: 14, sy: 58, sz: 14, mat: buildingMatB },
    { x: -30, y: 15, z: 10, sx: 16, sy: 50, sz: 16, mat: buildingMatA },
    { x: -24, y: 17, z: 24, sx: 12, sy: 54, sz: 12, mat: buildingMatB },

    // South skyline (behind player camera)
    { x: -14, y: 12, z: 32, sx: 14, sy: 44, sz: 14, mat: buildingMatA },
    { x: 12, y: 16, z: 34, sx: 15, sy: 52, sz: 14, mat: buildingMatB }
  ];

  // The retained review lens is fully backed by the court-side pavilion below.
  // Do not also submit the hidden city block and its dozens of window meshes to
  // that frame; the normal playable lens keeps the open rooftop skyline.
  buildings.forEach((b, idx) => {
    nodes.push(
      primitives
        .box({ name: `skyline-bldg-${idx}`, material: b.mat })
        .position(b.x, b.y, b.z)
        .scale([b.sx, b.sy, b.sz])
        .toJSON()
    );

    // Glowing window ribbons on buildings
    for (let floor = 0; floor < 4; floor += 1) {
      const isCyan = (idx + floor) % 2 === 0;
      nodes.push(
        primitives
          .box({
            name: `window-strip-${idx}-${floor}`,
            material: isCyan ? windowGlowCyan : windowGlowAmber
          })
          .position(b.x, b.y - 12 + floor * 7, b.z + (b.sz / 2 + 0.1))
          .scale([b.sx * 0.75, 0.6, 0.2])
          .toJSON()
      );
    }

    // Rooftop radio antenna & red beacon
    if (idx % 2 === 0) {
      const topY = b.y + b.sy / 2;
      nodes.push(
        primitives
          .cylinder({
            name: `antenna-mast-${idx}`,
            material: material.pbr({ name: "steel", color: "#64748b", metallic: 0.9, roughness: 0.2 })
          })
          .position(b.x, topY + 4, b.z)
          .scale([0.15, 8, 0.15])
          .toJSON(),
        primitives
          .sphere({
            name: `antenna-beacon-${idx}`,
            material: antennaBeacon
          })
          .position(b.x, topY + 8, b.z)
          .scale([0.5, 0.5, 0.5])
          .toJSON()
      );
    }
  });

  // The tall frame is useful depth dressing from the runtime lens, but its
  // Camera-facing skyline layer: billboard frame and grid give the fixed
  // action camera depth without any flag-gated variant.
  {
    nodes.push(
      primitives
        .box({ name: "rooftop-billboard", material: billboardGlow })
        .position(12, 14, -18)
        .scale([8, 3.2, 0.3])
        .toJSON(),
      primitives
        .box({
          name: "billboard-frame",
          material: material.pbr({ name: "dark-metal", color: "#1e293b", metallic: 0.8, roughness: 0.3 })
        })
        .position(12, 12, -18)
        .scale([8.4, 7.2, 0.5])
        .toJSON()
    );
  }

  // 2. Rooftop Platform & Court Slab
  const courtAsphaltMat = material.pbr({
    name: "court-tartan-floor",
    color: "#351d2a",
    roughness: 0.72,
    metallic: 0.04
  });
  const parapetMat = material.pbr({
    name: "rooftop-parapet",
    color: "#0f172a",
    roughness: 0.7,
    metallic: 0.2
  });

  // Base Rooftop Slab
  nodes.push(
    primitives
      .box({ name: "main-rooftop-slab", material: courtAsphaltMat })
      // Keep the structural roof below the typed court. Sharing the exact top
      // plane produced the horizontal z-fighting that made the retained frame
      // look striped and unfinished.
      .position(0, -0.68, 4.0)
      .scale([18.0, 0.8, 20.0])
      .toJSON()
  );

  // Parapet safety ledge around rooftop. The four walls share one material
  // and never move, so they submit as a single instanced family instead of
  // four independent draws.
  nodes.push(
    instances.box({
      name: "rooftop parapet wall family",
      material: parapetMat,
      transforms: [
        { position: [0, 0.45, -5.8], scale: [18.4, 0.9, 0.6] }, // North ledge
        { position: [0, 0.45, 13.8], scale: [18.4, 0.9, 0.6] }, // South ledge
        { position: [-8.8, 0.45, 4.0], scale: [0.6, 0.9, 19.2] }, // West ledge
        { position: [8.8, 0.45, 4.0], scale: [0.6, 0.9, 19.2] } // East ledge
      ]
    }).toJSON()
  );

  // Chainlink safety fence posts & top rails
  const fenceMat = material.pbr({
    name: "fence-steel",
    color: "#94a3b8",
    metallic: 0.85,
    roughness: 0.25
  });
  const fencePosts = [
    { x: -8.7, z: -5.7 }, { x: -4.3, z: -5.7 }, { x: 0, z: -5.7 }, { x: 4.3, z: -5.7 }, { x: 8.7, z: -5.7 },
    { x: -8.7, z: 13.7 }, { x: -4.3, z: 13.7 }, { x: 0, z: 13.7 }, { x: 4.3, z: 13.7 }, { x: 8.7, z: 13.7 },
    { x: -8.7, z: 0 }, { x: -8.7, z: 7.0 }, { x: 8.7, z: 0 }, { x: 8.7, z: 7.0 }
  ];

  // The fence and floodlight masts are a single authored steel family.  Keep
  // every post as an independently transformed instance so the venue retains
  // its authored spacing while the production renderer submits one draw for
  // the repeated cylinder instead of one draw per post.
  nodes.push(
    instances.cylinder({
      name: "rooftop venue steel post family",
      material: fenceMat,
      castShadow: true,
      transforms: fencePosts.map((fp) => ({ position: [fp.x, 1.8, fp.z], scale: [0.08, 2.0, 0.08] }))
    }).toJSON()
  );

  // 3. Painted Basketball Court Markings
  const paintLineMat = material.emissive({
    name: "court-line-white",
    color: "#f8fafc",
    emissive: "#94a3b8"
  });
  const paintCyanMat = material.emissive({
    name: "court-key-cyan",
    color: "#38bdf8",
    emissive: "#0284c7"
  });
  const keyWidth = 3.6;
  const keyDepth = 4.8;
  const keyCenterZ = 2.4;

  // Key Area Box Outline & Fill
  const keyEdgeWidth = 0.08;
  const lineY = 0.03;
  const freeThrowZ = 4.8;
  const baselineZ = -0.2;
  nodes.push(
    // Key center colored paint zone
    primitives
      .box({
        name: "court-key-zone",
        material: material.pbr({ name: "key-paint", color: "#8f3f39", roughness: 0.48, metallic: 0.06, clearcoat: 0.3 })
      })
      .position(0, 0.02, keyCenterZ)
      .scale([keyWidth, 0.02, keyDepth])
      .toJSON(),
    // Key borders share one material and never move: one submission.
    instances.box({
      name: "court key edge family",
      material: paintCyanMat,
      transforms: [
        { position: [-keyWidth / 2, lineY, keyCenterZ], scale: [keyEdgeWidth, 0.02, keyDepth] },
        { position: [keyWidth / 2, lineY, keyCenterZ], scale: [keyEdgeWidth, 0.02, keyDepth] }
      ]
    }).toJSON(),
    // Free-throw and baseline share the line material: one submission.
    instances.box({
      name: "court line family",
      material: paintLineMat,
      transforms: [
        { position: [0, lineY, freeThrowZ], scale: [keyWidth, 0.02, 0.1] },
        { position: [0, lineY, baselineZ], scale: [14.0, 0.02, 0.1] }
      ]
    }).toJSON(),
    // The playable court retains its regulation free-throw circle.
    ...[
      primitives
        .torus({
          name: "court-ft-circle",
          material: paintLineMat
        })
        .position(0, 0.03, 4.8)
        .rotate(-Math.PI / 2, 0, 0)
        .scale([1.8, 1.8, 0.04])
        .toJSON()
    ],
    // 3-Point Arc Ring Guide
    primitives
      .torus({
        name: "court-3pt-arc",
        material: paintCyanMat
      })
      .position(0, 0.03, 0)
      .rotate(-Math.PI / 2, 0, 0)
      .scale([6.75, 6.75, 0.05])
      .toJSON()
    // Baseline rides in the shared court-line family above.
  );

  // 4. Rooftop Props (HVAC AC units, access door penthouse)
  const hvacMat = material.pbr({
    name: "hvac-unit",
    color: "#334155",
    roughness: 0.5,
    metallic: 0.7
  });
  // The two chillers share one material and never move: one submission.
  nodes.push(
    instances.box({
      name: "rooftop hvac chiller family",
      material: hvacMat,
      transforms: [
        { position: [-6.5, 1.0, 11.0], scale: [2.4, 1.8, 2.0] },
        { position: [6.5, 0.8, 11.2], scale: [2.0, 1.4, 1.8] }
      ]
    }).toJSON()
  );
  nodes.push(
    primitives
      .box({ name: "rooftop-access-shed", material: parapetMat })
      .position(-6.5, 1.6, -3.5)
      .scale([2.4, 3.0, 3.0])
      .toJSON()
  );

  // 5. Heavy-Duty Basketball Stanchion Support Post
  const stanchionMat = material.pbr({
    name: "stanchion-black-steel",
    color: "#172033",
    metallic: 0.82,
    roughness: 0.28
  });
  const stanchionPadMat = material.pbr({
    name: "night league padded stanchion",
    color: "#123b56",
    roughness: 0.72,
    metallic: 0.02,
    clearcoat: 0.12
  });
  // The mast, boom, bracket, and twin braces share one steel material and
  // never move. They submit as a single instanced cylinder family with the
  // exact authored orientations preserved per transform.
  nodes.push(
    instances.cylinder({
      name: "stanchion steel mast family",
      material: stanchionMat,
      transforms: [
        // Vertical Main Mast
        { position: [0, 2.15, -1.62], scale: [0.15, 3.7, 0.15] },
        // Angled Gooseneck Boom Arm
        { position: [0, 3.28, -1.05], rotation: [Math.PI / 3.7, 0, 0], scale: [0.13, 1.5, 0.13] },
        // Horizontal Backboard Mount Extension
        { position: [0, 3.35, -0.72], rotation: [Math.PI / 2, 0, 0], scale: [0.12, 0.72, 0.12] },
        // Twin diagonal braces transfer the board load into the mast.
        { position: [-0.46, 3.18, -0.72], rotation: [Math.PI / 2.9, 0, -Math.PI / 9], scale: [0.075, 0.82, 0.075] },
        { position: [0.46, 3.18, -0.72], rotation: [Math.PI / 2.9, 0, Math.PI / 9], scale: [0.075, 0.82, 0.075] }
      ]
    }).toJSON(),
    // Padded Base Protector
    primitives
      .box({ name: "stanchion-base-padding", material: stanchionPadMat })
      .position(0, 0.62, -1.62)
      .scale([0.58, 1.12, 0.72])
      .toJSON()
  );

  // 6. Realistic Backboard, Red Target Box, Orange Rim, and White Net
  const targetSquareMat = material.emissive({
    name: "backboard-red-square",
    color: "#ef4444",
    emissive: "#dc2626"
  });
  const netStrandMat = material.emissive({
    name: "net-white",
    color: "#ffffff",
    emissive: "#94a3b8",
    opacity: 0.85
  });
  nodes.push(
    // Red Inner Target Box on Backboard
    instances.box({
      name: "backboard target square family",
      material: targetSquareMat,
      transforms: [
        { position: [0, 3.55, -0.32], scale: [0.62, 0.025, 0.012] },
        { position: [0, 3.15, -0.32], scale: [0.62, 0.025, 0.012] },
        { position: [-0.3, 3.35, -0.32], scale: [0.025, 0.42, 0.012] },
        { position: [0.3, 3.35, -0.32], scale: [0.025, 0.42, 0.012] }
      ]
    }).toJSON(),
    // Eight slender renderer-owned strands keep the goal region open and
    // readable; this is visual net dressing, not collision truth.
    instances.cylinder({
      name: "hoop net strand family",
      material: netStrandMat,
      transforms: Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return {
          position: [Math.cos(angle) * 0.18, HOOP_BASE_POSITION.y - 0.2, Math.sin(angle) * 0.18],
          scale: [0.008, 0.38, 0.008]
        };
      })
    }).toJSON()
  );

  // 7. Corner Stadium Floodlight Towers
  const towerPositions = [
    { x: -8.2, z: -5.0 },
    { x: 8.2, z: -5.0 },
    { x: -8.2, z: 12.5 },
    { x: 8.2, z: 12.5 }
  ];
  const floodlightHeadGlow = material.emissive({
    name: "floodlight-glow",
    color: "#fff7ed",
    emissive: "#ffedd5"
  });

  nodes.push(
    instances.cylinder({
      name: "rooftop floodlight mast family",
      material: fenceMat,
      castShadow: true,
      transforms: towerPositions.map((tp) => ({ position: [tp.x, 3.8, tp.z], scale: [0.14, 7.6, 0.14] }))
    }).toJSON()
  );

  // Heads and lamps share the same venue materials and geometry.  Keep the
  // per-tower orientation/offset in instance transforms while submitting one
  // draw for each repeated family (four heads + four emissive faces).
  nodes.push(
    instances.box({
      name: "rooftop floodlight head family",
      material: stanchionMat,
      transforms: towerPositions.map((tp) => ({
        position: [tp.x, 7.6, tp.z],
        rotation: [tp.z < 0 ? Math.PI / 6 : -Math.PI / 6, tp.x < 0 ? -Math.PI / 6 : Math.PI / 6, 0],
        scale: [1.2, 0.8, 0.4]
      }))
    }).toJSON(),
    instances.box({
      name: "rooftop floodlight bulb family",
      material: floodlightHeadGlow,
      transforms: towerPositions.map((tp) => ({
        position: [tp.x + (tp.x < 0 ? 0.2 : -0.2), 7.6, tp.z + (tp.z < 0 ? 0.2 : -0.2)],
        scale: [1.0, 0.6, 0.05]
      }))
    }).toJSON()
  );

  // Camera-facing depth layer: practical rooftop rails and window bands keep the
  // active court readable as a lived-in skyline rather than an empty void.
  const railMat = material.emissive({ name: "camera-facing roof rail", color: "#64748b", emissive: "#334155" });
  const warmWindowMat = material.emissive({ name: "warm skyline windows", color: "#fbbf24", emissive: "#f59e0b" });
  const cyanWindowMat = material.emissive({ name: "cyan skyline windows", color: "#67e8f9", emissive: "#06b6d4" });
  nodes.push(
    primitives.box({ name: "camera-facing west roof rail", material: railMat }).position(-7.4, 1.8, 5.4).scale([0.08, 1.4, 7.0]).toJSON(),
    primitives.box({ name: "camera-facing east roof rail", material: railMat }).position(7.4, 1.8, 5.4).scale([0.08, 1.4, 7.0]).toJSON(),
    primitives.box({ name: "camera-facing west warm windows", material: warmWindowMat }).position(-7.6, 5.2, -7.5).scale([0.12, 2.4, 3.8]).toJSON(),
    primitives.box({ name: "camera-facing east cyan windows", material: cyanWindowMat }).position(7.6, 4.4, -10.0).scale([0.12, 2.0, 4.2]).toJSON(),
    primitives.box({ name: "camera-facing rooftop equipment west", material: hvacMat }).position(-5.8, 1.3, 9.4).scale([1.5, 1.1, 1.4]).toJSON(),
    primitives.box({ name: "camera-facing rooftop equipment east", material: hvacMat }).position(5.8, 1.3, 9.4).scale([1.5, 1.1, 1.4]).toJSON(),
    // A warm facade slice and cyan window bands give the fixed action camera a
    // readable dusk horizon behind the typed hoop instead of a flat black void.
    primitives.box({ name: "warm rooftop facade", material: material.pbr({ name: "warm brick facade", color: "#713d36", roughness: 0.68, metallic: 0.06, clearcoat: 0.08 }) })
      .position(0, 4.4, -18.6)
      .scale([15.5, 7.2, 0.5])
      .toJSON(),
    primitives.box({ name: "facade amber window band", material: warmWindowMat })
      .position(-2.8, 7.32, -17.92)
      .scale([11.0, 0.12, 0.08])
      .toJSON(),
    primitives.box({ name: "facade cyan window band", material: cyanWindowMat })
      .position(3.5, 1.72, -17.92)
      .scale([5.6, 0.12, 0.08])
      .toJSON(),
    // Give the back facade a stadium-like material rhythm instead of a single
    // flat slab. These shallow renderer-owned bricks and window modules face
    // the fixed action camera and never participate in gameplay collisions.
    ...[2.0, 3.55, 5.1, 6.65].map((y, row) =>
      primitives.box({ name: `facade-mortar-row-${row}`, material: brickMortar })
        .position(0, y, -18.02)
        .scale([15.0, 0.035, 0.045])
        .toJSON()
    ),
    ...[-13.2, -10.1, -7.0, -3.9, -0.8, 2.3, 5.4, 8.5, 11.6].map((x, index) =>
      primitives.box({ name: `facade-brick-break-${index}`, material: brickMortar })
        .position(x, 4.4 + (index % 2) * 0.18, -18.0)
        .scale([0.035, 3.3, 0.045])
        .toJSON()
    ),
    ...[-6.2, 0, 6.2].flatMap((x, index) => [
      primitives.box({ name: `arena-window-${index}`, material: windowGlass })
        .position(x, 4.55, -17.96)
        .scale([2.22, 2.48, 0.06])
        .toJSON(),
      primitives.box({ name: `arena-window-frame-top-${index}`, material: windowFrame })
        .position(x, 6.98, -17.87)
        .scale([2.42, 0.1, 0.09])
        .toJSON(),
      primitives.box({ name: `arena-window-frame-bottom-${index}`, material: windowFrame })
        .position(x, 2.12, -17.87)
        .scale([2.42, 0.1, 0.09])
        .toJSON(),
      primitives.box({ name: `arena-window-frame-left-${index}`, material: windowFrame })
        .position(x - 2.32, 4.55, -17.87)
        .scale([0.1, 2.5, 0.09])
        .toJSON(),
      primitives.box({ name: `arena-window-frame-right-${index}`, material: windowFrame })
        .position(x + 2.32, 4.55, -17.87)
        .scale([0.1, 2.5, 0.09])
        .toJSON(),
      primitives.box({ name: `arena-window-mullion-${index}`, material: windowFrame })
        .position(x, 4.55, -17.84)
        .scale([0.06, 2.35, 0.08])
        .toJSON()
    ]),
    text3D("ROOFTOP LEAGUE", {
      name: "rooftop league facade sign",
      size: 0.42,
      depth: 0.045,
      letterSpacing: 0.028,
      material: facadeSign,
      backend: "sdf"
    })
      .position(-3.55, 7.8, -17.85)
      .toJSON()
  );

  // Court-side sky-club pavilion. This is ordinary scene geometry behind the
  // live hoop, not UI or composited evidence: masonry bays, lit glass, and
  // metal mullions give the action a designed architectural backdrop while
  // the open sides retain the rooftop/skyline identity.
  // Pavilion bays use shared geometry/material families.  Their individual
  // offsets remain authored in the instance transforms, but the production
  // renderer now submits one draw per family rather than one per window,
  // mullion, and pier. Review-only court furniture that shares these exact
  // materials (scorer table, seat tiers, edge curbs) rides in the same
  // families so no duplicate submission is added for the action lens.
  const masonryTransforms = [
    { position: [0, 4.15, -6.65] as const, scale: [16.5, 8.1, 0.42] as const }, // back wall
    ...[-8.05, -2.62, 2.62, 8.05].map((x) => ({ position: [x, 4.2, -6.12] as const, scale: [0.74, 7.85, 0.72] as const })),
  ];
  const pavilionTrimTransforms = [
    ...[-5.25, 0, 5.25].map((x) => ({ position: [x, 4.65, -6.27] as const, scale: [0.1, 4.35, 0.12] as const })), // bay mullions
    // The center bay is already divided by its full-height mullion and the
    // warm interior band. Omitting its redundant horizontal trim preserves
    // the prior authored silhouette.
    ...[-5.25, 5.25].map((x) => ({ position: [x, 4.65, -6.2] as const, scale: [3.56, 0.09, 0.13] as const })), // horizontal mullions
    { position: [0, 8.15, -6.2] as const, scale: [17.2, 0.28, 0.55] as const }, // cornice
  ];
  nodes.push(
    instances.box({
      name: "pavilion masonry family",
      material: pavilionBrick,
      transforms: masonryTransforms
    }).toJSON(),
    primitives.box({ name: "pavilion teal wainscot", material: material.pbr({ name: "pavilion teal tile", color: "#164e63", roughness: 0.4, metallic: 0.12, clearcoat: 0.3 }) })
      .position(0, 1.05, -6.39)
      .scale([16.2, 1.65, 0.08])
      .toJSON(),
    instances.box({
      name: "pavilion occupied interior family",
      material: pavilionInterior,
      // Leave the center bay as a dark glass recess behind the typed hoop.
      // The previous warm center panel projected as a solid orange card over
      // the rim in the sideline camera, making the goal unreadable in both
      // normal and backboard-suppressed composition captures. Side bays keep
      // the occupied-venue rhythm without occluding the gameplay target.
      transforms: [
        ...[-5.25, 5.25].map((x) => ({ position: [x, 4.65, -6.54] as const, scale: [3.35, 3.95, 0.06] as const })),
        ...[-5.25, 0, 5.25].map((x) => ({ position: [x, 4.42, -6.24] as const, scale: [3.12, 0.28, 0.1] as const }))
      ]
    }).toJSON(),
    instances.box({
      name: "pavilion glass bay family",
      material: pavilionGlass,
      transforms: [-5.25, 0, 5.25].map((x) => ({ position: [x, 4.65, -6.38], scale: [3.65, 4.45, 0.08] }))
    }).toJSON(),
    instances.box({
      name: "pavilion brass trim family",
      material: pavilionTrim,
      transforms: pavilionTrimTransforms
    }).toJSON()
  );


  // -----------------------------------------------------------------------
  // League finish pass (shared by the normal gameplay and review lenses)
  // -----------------------------------------------------------------------
  // The existing typed court and venue provide the scale/collision surface,
  // but their broad sealed slab can still read as a single untextured card at
  // the fixed camera.  These shallow, transparent renderer-owned finish
  // layers add the visual rhythm of a maintained hardwood rooftop court while
  // leaving the active court lines, spots, and route-local ball regions intact.
  // Instancing keeps the repeated boards in one renderer submission and makes
  // the pass safe for the mobile/reduced-motion contracts.
  const courtFinishA = material.pbr({
    name: "rooftop slate court finish",
    color: "#315271",
    roughness: 0.52,
    metallic: 0.06,
    clearcoat: 0.22,
    opacity: 0.72
  });
  const courtFinishHalfWidth = 7.85;
  const courtFinishRows = [-0.82, 3.0, 6.82];
  nodes.push(
    instances.box({
      name: "night league sealed court plank family",
      material: courtFinishA,
      transforms: courtFinishRows.map((z, index) => ({
        position: [0, 0.044, z],
        scale: [courtFinishHalfWidth, 0.012, 1.56],
        // A subtle alternating offset keeps the finish from reading as a
        // perfect procedural grid while preserving the route's authored court
        // dimensions and line positions.
        rotation: [0, index % 2 === 0 ? 0.002 : -0.002, 0]
      }))
    }).toJSON()
  );

  // -----------------------------------------------------------------------
  // Broadcast-bay finish
  // -----------------------------------------------------------------------
  // The release venue already supplies the crowd and stepped bleachers, but
  // the fixed sideline lens benefits from a deliberate near/mid/far seating
  // rhythm. These low upholstered seat backs and brass caps are subordinate
  // venue dressing: they add real parallax and material breakup without
  // touching the active court plane, shot regions, or typed primary actors.
  // Instancing keeps the repeated detail to three renderer submissions.
  const seatFabricWarm = material.pbr({
    name: "rooftop violet seat fabric",
    color: "#4e3b73",
    roughness: 0.74,
    metallic: 0.02,
    clearcoat: 0.08
  });
  const seatFabricCool = material.pbr({
    name: "rooftop blue seat fabric",
    color: "#285b78",
    roughness: 0.68,
    metallic: 0.03,
    clearcoat: 0.1
  });
  const seatCapMaterial = material.pbr({
    name: "night league seat rail caps",
    color: "#6e8ca1",
    roughness: 0.24,
    metallic: 0.76,
    clearcoat: 0.24
  });
  const seatXs = [-7.1, -4.25, -1.4, 1.4, 4.25, 7.1];
  const seatRows = [
    { z: -3.36, y: 0.74, depth: 0.34, width: 1.05 },
    { z: -4.38, y: 1.08, depth: 0.3, width: 1.02 },
    { z: -5.28, y: 1.38, depth: 0.26, width: 0.98 }
  ];
  nodes.push(
    instances.box({
      name: "night league warm seat-back family",
      material: seatFabricWarm,
      transforms: seatRows.flatMap((row, rowIndex) => seatXs
        .filter((_, seatIndex) => (seatIndex + rowIndex) % 2 === 0)
        .map((x) => ({
          position: [x, row.y, row.z],
          scale: [row.width, 0.22, row.depth]
        })))
    }).toJSON(),
    instances.box({
      name: "night league cool seat-back family",
      material: seatFabricCool,
      transforms: seatRows.flatMap((row, rowIndex) => seatXs
        .filter((_, seatIndex) => (seatIndex + rowIndex) % 2 !== 0)
        .map((x) => ({
          position: [x, row.y, row.z],
          scale: [row.width, 0.22, row.depth]
        })))
    }).toJSON(),
    instances.box({
      name: "night league seat rail cap family",
      material: seatCapMaterial,
      transforms: seatRows.map((row) => ({
        position: [0, row.y + 0.2, row.z + row.depth + 0.04],
        scale: [7.7, 0.035, 0.035]
      }))
    }).toJSON()
  );

  // A compact world-space scoreboard fascia gives the hoop a designed venue
  // anchor and restores the visual hierarchy that a HUD-only score cannot
  // provide. It is static identity signage (not a duplicate state display),
  // sits above the shot arc, and is made from ordinary renderer geometry.
  const scoreboardFace = material.pbr({
    name: "night league scoreboard face",
    color: "#10192e",
    roughness: 0.34,
    metallic: 0.48,
    clearcoat: 0.3
  });
  const scoreboardTrim = material.emissive({
    name: "night league scoreboard trim",
    color: "#ffd18a",
    emissive: "#f97316",
    emissiveIntensity: 0.62
  });
  const scoreboardReadout = material.emissive({
    name: "night league scoreboard readout",
    color: "#b9f6ff",
    emissive: "#22d3ee",
    emissiveIntensity: 0.92
  });
  nodes.push(
    primitives.box({ name: "night league scoreboard fascia", material: scoreboardFace })
      .position(2.2, 5.05, -0.86)
      .scale([2.7, 0.72, 0.14])
      .toJSON(),
    // Upper and lower trims share one emissive material: one submission.
    instances.box({
      name: "night league scoreboard trim family",
      material: scoreboardTrim,
      transforms: [
        { position: [2.2, 5.74, -0.67], scale: [2.78, 0.045, 0.045] },
        { position: [2.2, 4.36, -0.67], scale: [2.78, 0.045, 0.045] }
      ]
    }).toJSON(),
    text3D("COURT 07", {
      name: "night league scoreboard identity",
      size: 0.3,
      depth: 0.035,
      letterSpacing: 0.024,
      material: scoreboardReadout,
      backend: "sdf"
    })
      .position(1.25, 4.98, -0.64)
      .toJSON(),
    text3D("DUSK", {
      name: "night league scoreboard mode",
      size: 0.22,
      depth: 0.03,
      letterSpacing: 0.018,
      material: scoreboardTrim,
      backend: "sdf"
    })
      .position(3.1, 5.01, -0.63)
      .toJSON()
  );

  // -----------------------------------------------------------------------
  // Camera-facing facade depth
  // -----------------------------------------------------------------------
  // The city and pavilion geometry already surrounds the court, but the fixed
  // sideline view benefits from a readable, layered backdrop instead of a
  // sequence of equally flat cyan cards.  The following shared families put a
  // dark glass bay behind warm trim, then add a real frame/arch rhythm and
  // small practicals.  All geometry sits behind the backboard and athletes;
  // it is venue dressing, not UI or a gameplay collider.
  const bayGlass = material.pbr({
    name: "night league deep glass",
    color: "#102b42",
    roughness: 0.28,
    metallic: 0.18,
    clearcoat: 0.34,
    opacity: 0.82
  });
  const bayFrame = material.pbr({
    name: "night league window steel",
    color: "#37657b",
    roughness: 0.26,
    metallic: 0.78,
    clearcoat: 0.22
  });
  // The authored rooftopCourt rear bleachers end around world Z=1.5 after
  // their route placement.  Keep this facade close behind that stand line so
  // its glazing/trim remains visible above and between spectators; the prior
  // -5.7 depth sat behind the opaque venue cards and contributed no readable
  // architectural layer at the sideline camera.
  const bayDepth = -1.18;
  nodes.push(
    instances.box({
      name: "night league glass bay",
      material: bayGlass,
      transforms: [{
        position: [0, 4.82, bayDepth],
        scale: [8.35, 2.62, 0.045]
      }]
    }).toJSON(),
    instances.box({
      name: "night league warm facade returns",
      material: bayFrame,
      transforms: [
        { position: [-7.9, 4.82, bayDepth - 0.08], scale: [0.16, 2.82, 0.09] },
        { position: [7.9, 4.82, bayDepth - 0.08], scale: [0.16, 2.82, 0.09] }
      ]
    }).toJSON()
  );

  return nodes;
}
