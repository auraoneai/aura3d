import {
  primitives,
  material,
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
export function createRooftopDressing(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  // 1. Distant Twilight Sky Backdrop Gradient Panels
  const skyTopMat = material.emissive({
    name: "sky-twilight-top",
    color: "#1e1b4b",
    emissive: "#1e1b4b"
  });
  const skyHorizonMat = material.emissive({
    name: "sky-twilight-horizon",
    color: "#3b0764",
    emissive: "#3b0764"
  });
  const skyGlowMat = material.emissive({
    name: "sky-sunset-glow",
    color: "#831843",
    emissive: "#9a3412"
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
    color: "#334155",
    roughness: 0.3,
    metallic: 0.5
  });
  const buildingMatB = material.pbr({
    name: "skyline-tower-b",
    color: "#475569",
    roughness: 0.35,
    metallic: 0.4
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

  // Neon rooftop billboard
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

  // 2. Rooftop Platform & Court Slab
  const courtAsphaltMat = material.pbr({
    name: "court-tartan-floor",
    color: "#1e2433",
    roughness: 0.65,
    metallic: 0.1
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
      .position(0, -0.4, 4.0)
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
  fencePosts.forEach((fp, idx) => {
    nodes.push(
      primitives
        .cylinder({ name: `fence-post-${idx}`, material: fenceMat })
        .position(fp.x, 1.8, fp.z)
        .scale([0.08, 2.0, 0.08])
        .toJSON()
    );
  });

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

  // Key Area Box Outline & Fill
  nodes.push(
    // Key center colored paint zone
    primitives
      .box({
        name: "court-key-zone",
        material: material.pbr({ name: "key-paint", color: "#132338", roughness: 0.5, metallic: 0.1 })
      })
      .position(0, 0.02, 2.4)
      .scale([3.6, 0.02, 4.8])
      .toJSON(),
    // Key Left Border
    primitives
      .box({ name: "court-key-left", material: paintCyanMat })
      .position(-1.8, 0.03, 2.4)
      .scale([0.08, 0.02, 4.8])
      .toJSON(),
    // Key Right Border
    primitives
      .box({ name: "court-key-right", material: paintCyanMat })
      .position(1.8, 0.03, 2.4)
      .scale([0.08, 0.02, 4.8])
      .toJSON(),
    // Free Throw Line
    primitives
      .box({ name: "court-free-throw-line", material: paintLineMat })
      .position(0, 0.03, 4.8)
      .scale([3.6, 0.02, 0.1])
      .toJSON(),
    // Free Throw Top Circle Ring
    primitives
      .torus({
        name: "court-ft-circle",
        material: paintLineMat
      })
      .position(0, 0.03, 4.8)
      .rotate(-Math.PI / 2, 0, 0)
      .scale([1.8, 1.8, 0.04])
      .toJSON(),
    // 3-Point Arc Ring Guide
    primitives
      .torus({
        name: "court-3pt-arc",
        material: paintCyanMat
      })
      .position(0, 0.03, 0)
      .rotate(-Math.PI / 2, 0, 0)
      .scale([6.75, 6.75, 0.05])
      .toJSON(),
    // Baseline Line
    primitives
      .box({ name: "court-baseline", material: paintLineMat })
      .position(0, 0.03, -0.2)
      .scale([14.0, 0.02, 0.1])
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
      .toJSON(),
    primitives
      .box({ name: "rooftop-access-shed", material: parapetMat })
      .position(-6.5, 1.6, -3.5)
      .scale([2.4, 3.0, 3.0])
      .toJSON()
  );

  // 5. Heavy-Duty Basketball Stanchion Support Post
  const stanchionMat = material.pbr({
    name: "stanchion-black-steel",
    color: "#0f172a",
    metallic: 0.9,
    roughness: 0.2
  });
  nodes.push(
    // Vertical Main Mast
    primitives
      .cylinder({ name: "stanchion-main-mast", material: stanchionMat })
      .position(0, 2.0, -1.8)
      .scale([0.22, 4.0, 0.22])
      .toJSON(),
    // Padded Base Protector
    primitives
      .box({
        name: "stanchion-base-padding",
        material: material.pbr({ name: "stanchion-pad", color: "#0284c7", roughness: 0.8, metallic: 0.0 })
      })
      .position(0, 0.8, -1.8)
      .scale([0.9, 1.6, 0.9])
      .toJSON(),
    // Angled Gooseneck Boom Arm
    primitives
      .cylinder({ name: "stanchion-boom-arm", material: stanchionMat })
      .position(0, 3.4, -1.1)
      .rotate(Math.PI / 5, 0, 0)
      .scale([0.16, 1.8, 0.16])
      .toJSON(),
    // Horizontal Backboard Mount Extension
    primitives
      .cylinder({ name: "stanchion-mount-bracket", material: stanchionMat })
      .position(0, 3.35, -0.6)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.14, 0.6, 0.14])
      .toJSON()
  );

  // 6. Realistic Backboard, Red Target Box, Orange Rim, and White Net
  const targetSquareMat = material.emissive({
    name: "backboard-red-square",
    color: "#ef4444",
    emissive: "#dc2626"
  });
  nodes.push(
    // Red Inner Target Box on Backboard
    primitives.box({ name: "backboard-target-top", material: targetSquareMat })
      .position(0, 3.55, -0.32).scale([0.62, 0.025, 0.012]).toJSON(),
    primitives.box({ name: "backboard-target-bottom", material: targetSquareMat })
      .position(0, 3.15, -0.32).scale([0.62, 0.025, 0.012]).toJSON(),
    primitives.box({ name: "backboard-target-left", material: targetSquareMat })
      .position(-0.3, 3.35, -0.32).scale([0.025, 0.42, 0.012]).toJSON(),
    primitives.box({ name: "backboard-target-right", material: targetSquareMat })
      .position(0.3, 3.35, -0.32).scale([0.025, 0.42, 0.012]).toJSON(),
    // Eight slender renderer-owned strands keep the goal region open and
    // readable; this is visual net dressing, not collision truth.
    ...Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return primitives.cylinder({
        name: `hoop-net-strand-${index}`,
        material: material.emissive({ name: `net-white-${index}`, color: "#ffffff", emissive: "#94a3b8", opacity: 0.85 })
      })
        .position(Math.cos(angle) * 0.18, HOOP_BASE_POSITION.y - 0.2, Math.sin(angle) * 0.18)
        .scale([0.008, 0.38, 0.008])
        .toJSON();
    })
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

  towerPositions.forEach((tp, idx) => {
    nodes.push(
      // Floodlight Steel Pole
      primitives
        .cylinder({ name: `floodlight-pole-${idx}`, material: fenceMat })
        .position(tp.x, 3.8, tp.z)
        .scale([0.14, 7.6, 0.14])
        .toJSON(),
      // Floodlight Fixture Head
      primitives
        .box({ name: `floodlight-head-${idx}`, material: stanchionMat })
        .position(tp.x, 7.6, tp.z)
        .rotate(tp.z < 0 ? Math.PI / 6 : -Math.PI / 6, tp.x < 0 ? -Math.PI / 6 : Math.PI / 6, 0)
        .scale([1.2, 0.8, 0.4])
        .toJSON(),
      // Glowing Lamp Emissive Face
      primitives
        .box({ name: `floodlight-bulb-${idx}`, material: floodlightHeadGlow })
        .position(tp.x + (tp.x < 0 ? 0.2 : -0.2), 7.6, tp.z + (tp.z < 0 ? 0.2 : -0.2))
        .scale([1.0, 0.6, 0.05])
        .toJSON()
    );
  });

  return nodes;
}
