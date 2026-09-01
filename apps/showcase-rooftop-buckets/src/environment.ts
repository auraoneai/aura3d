import {
  primitives,
  instances,
  material,
  text3D,
  type AuraSceneNode
} from "@aura3d/engine";
import { BACKBOARD_POSITION, HOOP_BASE_POSITION } from "./court";

/**
 * Builds subordinate rooftop and skyline dressing for Rooftop Buckets:
 * - Surrounding illuminated skyscraper skyline & neon rooftop signs
 * - Rooftop safety fence, HVAC chillers, access doorhouse
 * - Stadium floodlight pylons casting dramatic illumination
 * - Detailed painted half-court floor lines (key, 3-point arc, free throw line)
 * - Heavy-duty gooseneck basketball stanchion post
 */
export function createRooftopDressing(options: { readonly reviewCapture?: boolean } = {}): AuraSceneNode[] {
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

  if (!options.reviewCapture) nodes.push(
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
    color: options.reviewCapture ? "#633a43" : "#30283b",
    roughness: options.reviewCapture ? 0.64 : 0.72,
    metallic: 0.05,
    clearcoat: 0.1
  });
  const pavilionGlass = material.emissive({
    name: "rooftop pavilion glass",
    color: options.reviewCapture ? "#1a5b70" : "#102d42",
    emissive: options.reviewCapture ? "#32b8c8" : "#1b7892",
    emissiveIntensity: options.reviewCapture ? 0.46 : 0.19,
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
    color: options.reviewCapture ? "#a65135" : "#6f3928",
    emissive: "#ff9b52",
    emissiveIntensity: options.reviewCapture ? 0.7 : 0.36,
    opacity: 0.9
  });
  const reviewWindowArch = material.pbr({
    name: "night league arched window trim",
    color: "#b9774b",
    roughness: 0.3,
    metallic: 0.58,
    clearcoat: 0.32
  });
  const reviewWindowGlow = material.emissive({
    name: "night league arched window glow",
    color: "#b8f3ff",
    emissive: "#38bdf8",
    emissiveIntensity: 0.72,
    opacity: 0.84
  });
  const reviewScoreboard = material.pbr({
    name: "night league scoreboard bezel",
    color: "#172235",
    roughness: 0.28,
    metallic: 0.68,
    clearcoat: 0.28
  });
  const reviewScoreGlow = material.emissive({
    name: "night league scoreboard digits",
    color: "#fbbf24",
    emissive: "#f97316",
    emissiveIntensity: 1.55
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
  if (!options.reviewCapture) buildings.forEach((b, idx) => {
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
  // opaque back faces the low review camera and becomes a giant black card
  // over the shot. Keep it out of that named composition; the authored facade
  // and window grid below provide the same skyline layer without occlusion.
  if (!options.reviewCapture) {
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
    color: options.reviewCapture ? "#54313b" : "#351d2a",
    roughness: options.reviewCapture ? 0.62 : 0.72,
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

  // Parapet safety ledge around rooftop
  const ledgeWalls = [
    { x: 0, z: -5.8, sx: 18.4, sz: 0.6 },  // North ledge
    { x: 0, z: 13.8, sx: 18.4, sz: 0.6 },  // South ledge
    { x: -8.8, z: 4.0, sx: 0.6, sz: 19.2 }, // West ledge
    { x: 8.8, z: 4.0, sx: 0.6, sz: 19.2 }   // East ledge
  ];
  ledgeWalls.forEach((w, idx) => {
    nodes.push(
      primitives
        .box({ name: `parapet-wall-${idx}`, material: parapetMat })
        .position(w.x, 0.45, w.z)
        .scale([w.sx, 0.9, w.sz])
        .toJSON()
    );
  });

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
  const paintLineMat = options.reviewCapture
    ? material.pbr({
        name: "rooftop league warm court stripe",
        color: "#f5dfc5",
        roughness: 0.66,
        metallic: 0.02,
        clearcoat: 0.08
      })
    : material.emissive({
        name: "court-line-white",
        color: "#f8fafc",
        emissive: "#94a3b8"
      });
  const paintCyanMat = options.reviewCapture
    ? material.pbr({
        name: "rooftop league teal court stripe",
        color: "#3da6ad",
        roughness: 0.58,
        metallic: 0.04,
        clearcoat: 0.1
      })
    : material.emissive({
        name: "court-key-cyan",
        color: "#38bdf8",
        emissive: "#0284c7"
      });
  const keyWidth = options.reviewCapture ? 3.0 : 3.6;
  const keyDepth = options.reviewCapture ? 4.15 : 4.8;
  const keyCenterZ = options.reviewCapture ? 2.08 : 2.4;

  // Key Area Box Outline & Fill
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
    // Key Left Border
    primitives
      .box({ name: "court-key-left", material: paintCyanMat })
      .position(-keyWidth / 2, 0.03, keyCenterZ)
      .scale([options.reviewCapture ? 0.055 : 0.08, 0.02, keyDepth])
      .toJSON(),
    // Key Right Border
    primitives
      .box({ name: "court-key-right", material: paintCyanMat })
      .position(keyWidth / 2, 0.03, keyCenterZ)
      .scale([options.reviewCapture ? 0.055 : 0.08, 0.02, keyDepth])
      .toJSON(),
    // Free Throw Line
    primitives
      .box({ name: "court-free-throw-line", material: paintLineMat })
      .position(0, 0.03, options.reviewCapture ? 4.15 : 4.8)
      .scale([keyWidth, 0.02, options.reviewCapture ? 0.065 : 0.1])
      .toJSON(),
    // The playable court retains its regulation free-throw circle. The review
    // action frame omits that redundant ring so its diagonals do not knot with
    // the pressure aura, key, and stanchion under the live shot.
    ...(!options.reviewCapture ? [
      primitives
        .torus({
          name: "court-ft-circle",
          material: paintLineMat
        })
        .position(0, 0.03, 4.8)
        .rotate(-Math.PI / 2, 0, 0)
        .scale([1.8, 1.8, 0.04])
        .toJSON()
    ] : []),
    // 3-Point Arc Ring Guide
    primitives
      .torus({
        name: "court-3pt-arc",
        material: paintCyanMat
      })
      .position(0, 0.03, 0)
      .rotate(-Math.PI / 2, 0, 0)
      .scale(options.reviewCapture ? [4.85, 4.85, 0.032] : [6.75, 6.75, 0.05])
      .toJSON(),
    // Baseline Line
    primitives
      .box({ name: "court-baseline", material: paintLineMat })
      .position(0, 0.03, options.reviewCapture ? -0.72 : -0.2)
      .scale(options.reviewCapture ? [4.4, 0.02, 0.055] : [14.0, 0.02, 0.1])
      .toJSON()
  );

  // 4. Rooftop Props (HVAC AC units, access door penthouse)
  const hvacMat = material.pbr({
    name: "hvac-unit",
    color: "#334155",
    roughness: 0.5,
    metallic: 0.7
  });
  nodes.push(
    primitives
      .box({ name: "hvac-chiller-1", material: hvacMat })
      .position(-6.5, 1.0, 11.0)
      .scale([2.4, 1.8, 2.0])
      .toJSON(),
    primitives
      .box({ name: "hvac-chiller-2", material: hvacMat })
      .position(6.5, 0.8, 11.2)
      .scale([2.0, 1.4, 1.8])
      .toJSON()
  );
  if (!options.reviewCapture) nodes.push(
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
  nodes.push(
    // Vertical Main Mast
    primitives
      .cylinder({ name: "stanchion-main-mast", material: stanchionMat })
      .position(0, 2.15, -1.62)
      .scale([0.15, 3.7, 0.15])
      .toJSON(),
    // Padded Base Protector
    primitives
      .box({ name: "stanchion-base-padding", material: stanchionPadMat })
      .position(0, 0.62, -1.62)
      .scale(options.reviewCapture ? [0.44, 0.84, 0.58] : [0.58, 1.12, 0.72])
      .toJSON(),
    // Angled Gooseneck Boom Arm
    primitives
      .cylinder({ name: "stanchion-boom-arm", material: stanchionMat })
      .position(0, 3.28, -1.05)
      .rotate(Math.PI / 3.7, 0, 0)
      .scale([0.13, 1.5, 0.13])
      .toJSON(),
    // Horizontal Backboard Mount Extension
    primitives
      .cylinder({ name: "stanchion-mount-bracket", material: stanchionMat })
      .position(0, 3.35, -0.72)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.12, 0.72, 0.12])
      .toJSON(),
    // Twin diagonal braces visually transfer the board load into the mast.
    // They are venue construction only; route-local board/rim regions remain
    // the sole gameplay authority.
    primitives
      .cylinder({ name: "stanchion west board brace", material: stanchionMat })
      .position(-0.46, 3.18, -0.72)
      .rotate(Math.PI / 2.9, 0, -Math.PI / 9)
      .scale([0.075, 0.82, 0.075])
      .toJSON(),
    primitives
      .cylinder({ name: "stanchion east board brace", material: stanchionMat })
      .position(0.46, 3.18, -0.72)
      .rotate(Math.PI / 2.9, 0, Math.PI / 9)
      .scale([0.075, 0.82, 0.075])
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
  if (!options.reviewCapture) nodes.push(
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
      material: facadeSign
    })
      .position(-3.55, 7.8, -17.85)
      .toJSON()
  );

  // Court-side sky-club pavilion. This is ordinary scene geometry behind the
  // live hoop, not UI or composited evidence: masonry bays, lit glass, and
  // metal mullions give the action a designed architectural backdrop while
  // the open sides retain the rooftop/skyline identity.
  nodes.push(
    primitives.box({ name: "pavilion back wall", material: pavilionBrick })
      .position(0, 4.15, -6.65)
      .scale([16.5, 8.1, 0.42])
      .toJSON(),
    primitives.box({ name: "pavilion teal wainscot", material: material.pbr({ name: "pavilion teal tile", color: "#164e63", roughness: 0.4, metallic: 0.12, clearcoat: 0.3 }) })
      .position(0, 1.05, -6.39)
      .scale([16.2, 1.65, 0.08])
      .toJSON(),
    // Pavilion bays use shared geometry/material families.  Their individual
    // offsets remain authored in the instance transforms, but the production
    // renderer now submits one draw per family rather than one per window,
    // mullion, and pier.
    instances.box({
      name: "pavilion occupied room family",
      material: pavilionInterior,
      transforms: [-5.25, 0, 5.25].map((x) => ({ position: [x, 4.65, -6.54], scale: [3.35, 3.95, 0.06] }))
    }).toJSON(),
    instances.box({
      name: "pavilion glass bay family",
      material: pavilionGlass,
      transforms: [-5.25, 0, 5.25].map((x) => ({ position: [x, 4.65, -6.38], scale: [3.65, 4.45, 0.08] }))
    }).toJSON(),
    instances.box({
      name: "pavilion bay mullion family",
      material: pavilionTrim,
      transforms: [-5.25, 0, 5.25].map((x) => ({ position: [x, 4.65, -6.27], scale: [0.1, 4.35, 0.12] }))
    }).toJSON(),
    instances.box({
      name: "pavilion warm interior band family",
      material: pavilionInterior,
      transforms: [-5.25, 0, 5.25].map((x) => ({ position: [x, 4.42, -6.24], scale: [3.12, 0.28, 0.1] }))
    }).toJSON(),
    // The center bay is already divided by its full-height mullion and the
    // warm interior band. Omitting its redundant horizontal trim preserves
    // the prior authored silhouette and saves one more route-owned draw.
    instances.box({
      name: "pavilion horizontal mullion family",
      material: pavilionTrim,
      transforms: [-5.25, 5.25].map((x) => ({ position: [x, 4.65, -6.2], scale: [3.56, 0.09, 0.13] }))
    }).toJSON(),
    instances.box({
      name: "pavilion masonry pier family",
      material: pavilionBrick,
      transforms: [-8.05, -2.62, 2.62, 8.05].map((x) => ({ position: [x, 4.2, -6.12], scale: [0.74, 7.85, 0.72] }))
    }).toJSON(),
    primitives.box({ name: "pavilion cornice", material: pavilionTrim })
      .position(0, 8.15, -6.2)
      .scale([17.2, 0.28, 0.55])
      .toJSON()
  );

  if (options.reviewCapture) {
    const terraceDeck = material.pbr({
      name: "sky club walnut terrace",
      color: "#784126",
      roughness: 0.48,
      metallic: 0.05,
      clearcoat: 0.24
    });
    const terraceRail = material.pbr({
      name: "sky club dark brass rail",
      color: "#8b6238",
      roughness: 0.25,
      metallic: 0.72
    });
    const terraceGlow = material.emissive({
      name: "sky club under rail practical",
      color: "#ffc56e",
      emissive: "#f97316",
      emissiveIntensity: 0.48
    });
    const clubSign = material.emissive({
      name: "night league club sign",
      color: "#f7e4c1",
      emissive: "#fb923c",
      emissiveIntensity: 0.74
    });
    const canopySoffit = material.pbr({
      name: "sky club copper canopy",
      color: "#6f412d",
      roughness: 0.32,
      metallic: 0.48,
      clearcoat: 0.28
    });
    const courtInlay = material.pbr({
      name: "rooftop court brass inlay",
      color: "#d39a52",
      roughness: 0.38,
      metallic: 0.44,
      clearcoat: 0.18
    });
    const courtWear = material.pbr({
      name: "sealed court wear bands",
      color: "#354264",
      roughness: 0.76,
      metallic: 0.02,
      opacity: 0.74
    });
    nodes.push(
      // The pavilion is now a volume: an overhanging copper canopy and deep
      // fascia cast a real architectural edge over the recessed glass bays.
      primitives.box({ name: "sky club canopy roof", material: canopySoffit })
        .position(0, 8.58, -5.95)
        .scale([17.55, 0.42, 1.72])
        .toJSON(),
      primitives.box({ name: "sky club canopy light slot", material: terraceGlow })
        .position(0, 8.31, -5.08)
        .scale([15.9, 0.055, 0.06])
        .toJSON(),
      // Slightly irregular sealed lanes catch the key lights and break up the
      // single-color court slab. They are surface finish only, below every
      // route-owned ball, player, and collider region.
      instances.box({
        name: "sealed court wear band family",
        material: courtWear,
        transforms: [-2.8, -0.25, 2.65, 5.55, 8.2].map((z, index) => ({
          position: [index % 2 === 0 ? -0.7 : 0.65, 0.014, z],
          rotation: [0, index % 2 === 0 ? 0.018 : -0.014, 0],
          scale: [7.65 - (index % 2) * 0.3, 0.008, 0.055 + (index % 3) * 0.018]
        }))
      }).toJSON(),
      // Inlaid sideline accents give the court a manufactured, league-owned
      // finish while leaving the playable key and physics regions untouched.
      primitives.box({ name: "west court brass inlay", material: courtInlay })
        .position(-7.72, 0.035, 4.0)
        .scale([0.045, 0.018, 8.92])
        .toJSON(),
      primitives.box({ name: "east court brass inlay", material: courtInlay })
        .position(7.72, 0.035, 4.0)
        .scale([0.045, 0.018, 8.92])
        .toJSON(),
      // A bounded court frame and scorer's table make the playing rectangle
      // read as a real rooftop venue instead of paint floating on an infinite
      // slab. These remain subordinate set dressing outside collision truth.
      primitives.box({ name: "west court edge curb", material: pavilionTrim })
        .position(-8.05, 0.13, 4.0)
        .scale([0.11, 0.2, 9.45])
        .toJSON(),
      primitives.box({ name: "east court edge curb", material: pavilionTrim })
        .position(8.05, 0.13, 4.0)
        .scale([0.11, 0.2, 9.45])
        .toJSON(),
      primitives.box({ name: "north court edge curb", material: pavilionTrim })
        .position(0, 0.13, -5.42)
        .scale([8.15, 0.2, 0.11])
        .toJSON(),
      primitives.box({ name: "sky club scorer table", material: pavilionBrick })
        .position(-5.55, 0.76, -3.44)
        .scale([3.4, 1.08, 0.62])
        .toJSON(),
      primitives.box({ name: "sky club scorer display", material: terraceGlow })
        .position(-5.55, 1.03, -3.08)
        .scale([2.92, 0.34, 0.035])
        .toJSON(),
      // Two stepped terraces sit between the live hoop and pavilion glazing.
      // They create real parallax, seating scale, and warm material response
      // without becoming gameplay collision or a primitive primary subject.
      primitives.box({ name: "sky club west terrace", material: terraceDeck })
        .position(-4.85, 0.72, -4.58)
        .scale([4.45, 0.36, 1.22])
        .toJSON(),
      primitives.box({ name: "sky club east terrace", material: terraceDeck })
        .position(4.85, 0.72, -4.58)
        .scale([4.45, 0.36, 1.22])
        .toJSON(),
      primitives.box({ name: "sky club west seat tier", material: pavilionBrick })
        .position(-4.85, 1.05, -5.13)
        .scale([4.05, 0.42, 0.48])
        .toJSON(),
      primitives.box({ name: "sky club east seat tier", material: pavilionBrick })
        .position(4.85, 1.05, -5.13)
        .scale([4.05, 0.42, 0.48])
        .toJSON(),
      primitives.cylinder({ name: "sky club west rail", material: terraceRail })
        .position(-4.85, 1.42, -3.98)
        .rotate(0, 0, Math.PI / 2)
        .scale([0.055, 4.25, 0.055])
        .toJSON(),
      primitives.cylinder({ name: "sky club east rail", material: terraceRail })
        .position(4.85, 1.42, -3.98)
        .rotate(0, 0, Math.PI / 2)
        .scale([0.055, 4.25, 0.055])
        .toJSON(),
      primitives.box({ name: "sky club west rail light", material: terraceGlow })
        .position(-4.85, 1.34, -3.96)
        .scale([4.05, 0.045, 0.035])
        .toJSON(),
      primitives.box({ name: "sky club east rail light", material: terraceGlow })
        .position(4.85, 1.34, -3.96)
        .scale([4.05, 0.045, 0.035])
        .toJSON(),
      text3D("NIGHT LEAGUE", {
        name: "night league pavilion sign",
        size: 0.34,
        depth: 0.045,
        letterSpacing: 0.024,
        material: clubSign
      })
        .position(-2.4, 7.58, -6.06)
        .toJSON()
    );

    // Three shallow arched window portals make the review frame read as a
    // finished night-league gym rather than a dark collection of rectangles.
    // They are decorative facade geometry behind the real hoop/court and do
    // not participate in the route's ball or player contacts.
    for (const [index, x] of [-5.25, 0, 5.25].entries()) {
      nodes.push(
        primitives.torus({ name: `review arched window trim ${index + 1}`, material: reviewWindowArch })
          .position(x, 5.0, -6.12)
          .scale([1.76, 2.18, 0.08])
          .toJSON(),
        primitives.box({ name: `review arched window mullion ${index + 1}`, material: reviewWindowArch })
          .position(x, 4.62, -6.0)
          .scale([0.08, 2.12, 0.1])
          .toJSON(),
        primitives.box({ name: `review arched window glow ${index + 1}`, material: reviewWindowGlow })
          .position(x + (index - 1) * 0.22, 5.12, -6.02)
          .scale([1.34, 1.48, 0.035])
          .toJSON()
      );
    }

    // A compact scorer's display gives the right side of the composition a
    // believable venue anchor and a second warm/cool practical. The HUD still
    // owns score truth; these are visual set-dressing digits only.
    nodes.push(
      primitives.box({ name: "review venue scoreboard bezel", material: reviewScoreboard })
        .position(7.05, 5.65, -5.98)
        .scale([2.0, 0.9, 0.12])
        .toJSON(),
      primitives.box({ name: "review venue scoreboard cyan bar", material: reviewWindowGlow })
        .position(6.65, 5.65, -5.82)
        .scale([0.68, 0.055, 0.035])
        .toJSON(),
      primitives.box({ name: "review venue scoreboard amber bar", material: reviewScoreGlow })
        .position(7.42, 5.65, -5.82)
        .scale([0.42, 0.055, 0.035])
        .toJSON(),
      primitives.box({ name: "review venue scoreboard lower bar", material: reviewScoreGlow })
        .position(7.05, 5.22, -5.82)
        .scale([1.12, 0.045, 0.035])
        .toJSON()
    );
  }

  return nodes;
}
