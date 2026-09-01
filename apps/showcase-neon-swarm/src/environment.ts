/**
 * Cyberpunk Metropolis Environment for Neon Swarm.
 * Skyscrapers, illuminated road curbs, holographic billboards, and volumetric lighting.
 */
import { primitives, material, lights, type AuraSceneNode } from "@aura3d/engine";

export function createNeonSwarmDistrictDressing(reviewCapture = false): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  // ---------------- Lighting ----------------
  nodes.push(
    // Ambient Metropolis Hall Wash
    lights.ambient({
      name: "cyber-ambient",
      color: "#475569",
      // Keep the finale readable after the 320-drone fixture fills the upper
      // half of the frame; the world should retain material separation rather
      // than collapse into a black silhouette behind the pink pool.
      intensity: reviewCapture ? 0.82 : 1.05
    }).toJSON(),
    // Cool Cyan Key Overhead
    lights.directional({
      name: "cyber-key-light",
      color: "#e0f2fe",
      intensity: reviewCapture ? 1.72 : 2.0
    }).position(8, 20, 8).toJSON(),
    // Warm Magenta Rim from North
    lights.directional({
      name: "cyber-rim-light",
      color: "#f43f5e",
      intensity: reviewCapture ? 1.08 : 0.72
    }).position(-8, 16, -12).toJSON(),
    // Center Arena Cyber Core Glow
    lights.point({
      name: "cyber-core-glow",
      color: "#38bdf8",
      intensity: 2.4
    }).position(0, 4.0, 0).toJSON()
  );

  if (reviewCapture) {
    // The exact finale needs one cohesive survival arena, not the runtime
    // street's alternating tile grid viewed from a high camera. Three authored
    // low-profile arms curl around the courier's center pocket and establish a
    // restrained vortex without impersonating combat or simulation state.
    nodes.push(
      primitives.box({
        name: "finale arena ground",
        material: material.pbr({
          name: "finale arena ground material",
          color: "#07131d",
          roughness: 0.68,
          metallic: 0.18
        })
      }).position(0, -0.035, 3).scale([52, 0.06, 34]).toJSON()
    );

    const armColors = ["#244a43", "#31584d", "#3d5148", "#29413f", "#3b4942"] as const;
    for (let arm = 0; arm < 5; arm += 1) {
      for (let segment = 0; segment < 7; segment += 1) {
        const angle = arm * (Math.PI * 2 / 5) + segment * 0.31;
        const radius = 1.7 + segment * 1.7;
        nodes.push(
          primitives.box({
            name: `finale vortex arm ${arm}-${segment}`,
            material: material.pbr({
              name: `finale vortex material ${arm}-${segment}`,
              color: armColors[arm]!,
              roughness: 0.52,
              metallic: 0.28
            })
          })
            .position(Math.cos(angle) * radius, 0.012, 3 + Math.sin(angle) * radius * 0.82)
            .rotate(0, -angle + Math.PI / 2, 0)
            .scale([1.12 + segment * 0.17, 0.025, 0.34 + segment * 0.035])
            .toJSON()
        );
      }
    }

    nodes.push(
      primitives.box({
        name: "finale north pressure rail",
        material: material.emissive({ name: "finale north rail material", color: "#143e49", emissive: "#35e6ff", emissiveIntensity: 0.32 })
      }).position(0, 0.08, -13.6).scale([44, 0.08, 0.18]).toJSON(),
      primitives.box({
        name: "finale south pressure rail",
        material: material.emissive({ name: "finale south rail material", color: "#4b183d", emissive: "#ff4fd8", emissiveIntensity: 0.3 })
      }).position(0, 0.08, 19.6).scale([44, 0.08, 0.18]).toJSON()
    );
    return nodes;
  }

  // ---------------- Ground Cyber Asphalt Tiles ----------------
  const tileColors = ["#101c26", "#142a31"];
  for (let gx = -5; gx <= 5; gx += 1) {
    for (let gz = -3; gz <= 3; gz += 1) {
      if ((gx + gz) % 2 === 0) {
        nodes.push(
          primitives
            .box({
              name: `asphalt-tile-${gx}-${gz}`,
              material: material.pbr({
                name: `asphalt-mat-${gx}-${gz}`,
                color: tileColors[Math.abs(gx + gz) % 2]!,
                roughness: 0.35,
                metallic: 0.3
              })
            })
            .position(gx * 4.8, -0.01, gz * 4.8)
            .scale([4.7, 0.02, 4.7])
            .toJSON()
        );
      }
    }
  }

  // ---------------- Perimeter Neon Curbs ----------------
  // North Curb
  nodes.push(
    primitives
      .box({
        name: "curb-north",
        material: material.emissive({
          name: "curb-cyan-mat",
          color: "#0c4a6e",
          emissive: "#123e4a",
          roughness: 0.2
        })
      })
      .position(0, 0.1, -17.2)
      .scale([53.0, 0.25, 0.4])
      .toJSON()
  );
  // South Curb
  nodes.push(
    primitives
      .box({
        name: "curb-south",
        material: material.emissive({
          name: "curb-cyan-mat",
          color: "#0c4a6e",
          emissive: "#123e4a",
          roughness: 0.2
        })
      })
      .position(0, 0.1, 17.2)
      .scale([53.0, 0.25, 0.4])
      .toJSON()
  );
  // West Curb
  nodes.push(
    primitives
      .box({
        name: "curb-west",
        material: material.emissive({
          name: "curb-magenta-mat",
          color: "#19253a",
          emissive: "#332e5d",
          roughness: 0.2
        })
      })
      .position(-26.2, 0.1, 0)
      .scale([0.4, 0.25, 34.8])
      .toJSON()
  );
  // East Curb
  nodes.push(
    primitives
      .box({
        name: "curb-east",
        material: material.emissive({
          name: "curb-magenta-mat",
          color: "#19253a",
          emissive: "#332e5d",
          roughness: 0.2
        })
      })
      .position(26.2, 0.1, 0)
      .scale([0.4, 0.25, 34.8])
      .toJSON()
  );

  // ---------------- Cyberpunk Background Skyscrapers ----------------
  const towers = [
    // North Skyline
    { x: -28, z: -24, sx: 10, sy: 28, sz: 10, color: "#090d16", neon: "#38bdf8" },
    { x: -16, z: -26, sx: 12, sy: 36, sz: 10, color: "#060911", neon: "#818cf8" },
    { x: 0, z: -28, sx: 16, sy: 44, sz: 12, color: "#0b0f19", neon: "#e879f9" },
    { x: 16, z: -26, sx: 12, sy: 34, sz: 10, color: "#080c15", neon: "#34d399" },
    { x: 28, z: -24, sx: 10, sy: 30, sz: 10, color: "#060911", neon: "#38bdf8" },
    // South Skyline
    { x: -24, z: 26, sx: 12, sy: 26, sz: 10, color: "#060911", neon: "#fbbf24" },
    { x: -8, z: 28, sx: 14, sy: 38, sz: 10, color: "#0a0e17", neon: "#38bdf8" },
    { x: 8, z: 28, sx: 14, sy: 36, sz: 10, color: "#080c15", neon: "#f43f5e" },
    { x: 24, z: 26, sx: 12, sy: 28, sz: 10, color: "#060911", neon: "#a855f7" }
  ];

  const skylineFootprint = reviewCapture ? 0.52 : 0.68;
  const skylineHeight = reviewCapture ? 0.72 : 0.82;
  towers.forEach((t, i) => {
    // Tower Mass
    nodes.push(
      primitives
        .box({
          name: `skyline-tower-${i}`,
          material: material.pbr({
            name: `tower-mat-${i}`,
            color: t.color,
            roughness: 0.7,
            metallic: 0.3
          })
        })
        .position(t.x, (t.sy * skylineHeight) / 2 - 2, t.z)
        .scale([t.sx * skylineFootprint, t.sy * skylineHeight, t.sz * skylineFootprint])
        .toJSON(),
      // Neon Spire Crown
      primitives
        .box({
          name: `tower-spire-${i}`,
          material: material.emissive({
            name: `spire-mat-${i}`,
            color: "#0f172a",
            emissive: t.neon,
            roughness: 0.1
          })
        })
        .position(t.x, t.sy * skylineHeight - 1.5, t.z)
        .scale([t.sx * skylineFootprint * 0.85, 0.8, t.sz * skylineFootprint * 0.85])
        .toJSON()
    );
  });

  // ---------------- Holographic Billboards ----------------
  const billboards = [
    { name: "billboard-north-1", pos: [-12, 12, -20], size: [8, 4.5, 0.4], emissive: "#38bdf8", color: "#082f49" },
    { name: "billboard-north-2", pos: [12, 14, -20], size: [8, 4.5, 0.4], emissive: "#f43f5e", color: "#4c0519" },
    { name: "billboard-south-1", pos: [0, 13, 22], size: [10, 5.0, 0.4], emissive: "#fbbf24", color: "#451a03" }
  ];

  billboards.forEach((b) => {
    nodes.push(
      primitives
        .box({
          name: b.name,
          material: material.emissive({
            name: `${b.name}-mat`,
            color: b.color,
            emissive: b.emissive,
            roughness: 0.3
          })
        })
        .position(...(b.pos as [number, number, number]))
        .scale(b.size as [number, number, number])
        .toJSON()
    );
  });

  // Near-field street canyon: side masses and repeated window bands turn the
  // playable grid into a readable district while preserving a clear center lane.
  const canyonSides = [
    { x: -9, tint: "#35e6ff", body: "#080d18" },
    { x: 9, tint: "#ff4fd8", body: "#100a18" }
  ] as const;
  canyonSides.forEach((side, sideIndex) => {
    nodes.push(
      primitives.box({
        name: `near-canyon-mass-${sideIndex}`,
        material: material.pbr({
          name: `near-canyon-body-${sideIndex}`,
          color: side.body,
          roughness: 0.62,
          metallic: 0.25
        })
      }).position(side.x, 5.5, -2).scale([3.2, 11, 28]).toJSON()
    );
    for (let band = 0; band < 5; band += 1) {
      nodes.push(
        primitives.box({
          name: `near-canyon-window-${sideIndex}-${band}`,
          material: material.emissive({
            name: `near-canyon-window-mat-${sideIndex}-${band}`,
            color: side.tint,
            emissive: side.tint,
            roughness: 0.2
          })
        }).position(side.x + (side.x < 0 ? 1.66 : -1.66), 2.0 + band * 1.85, -1.5).scale([0.16, 0.3, 10.5]).toJSON()
      );
    }
  });

  // Low foreground lintel anchors the camera with a near parapet while leaving
  // the courier lane open through the center of the frame.
  nodes.push(
    primitives.box({
      name: "near street parapet",
      material: material.pbr({ name: "near street parapet mat", color: "#11182a", roughness: 0.45, metallic: 0.35 })
    }).position(0, 0.55, 13.8).scale([15, 0.7, 0.55]).toJSON(),
    primitives.box({
      name: "near parapet light rail",
      material: material.emissive({ name: "near parapet light mat", color: "#35e6ff", emissive: "#35e6ff", roughness: 0.2 })
    }).position(0, 0.96, 13.25).scale([14.5, 0.08, 0.08]).toJSON()
  );

  // Right-side foreground sign tower balances the corridor and gives the lane
  // a readable near-to-far silhouette without entering the simulation space.
  nodes.push(
    primitives.box({
      name: "right foreground sign tower",
      material: material.pbr({ name: "right sign tower mat", color: "#1b2942", roughness: 0.52, metallic: 0.28 })
    }).position(15.2, 3.2, 8.5).scale([0.7, 6.4, 0.45]).toJSON(),
    primitives.box({
      name: "right foreground sign face",
      material: material.emissive({ name: "right sign face mat", color: "#ff4fd8", emissive: "#ff4fd8", roughness: 0.18 })
    }).position(14.58, 4.5, 8.5).scale([0.08, 1.8, 0.34]).toJSON(),
    primitives.box({
      name: "right sign cyan accent",
      material: material.emissive({ name: "right sign cyan mat", color: "#35e6ff", emissive: "#35e6ff", roughness: 0.18 })
    }).position(14.54, 1.15, 8.5).scale([0.1, 0.12, 0.4]).toJSON()
  );

  // Illuminated right-side facade fills the background plane without crossing the
  // playable lane, giving the burst a readable architectural backdrop.
  nodes.push(
    primitives.box({
      name: "right neon market facade",
      material: material.pbr({ name: "right facade body mat", color: "#304b70", roughness: 0.48, metallic: 0.28 })
    }).position(16.2, 4.8, -4.0).scale([2.1, 9.6, 1.0]).toJSON(),
    primitives.box({
      name: "right facade cyan header",
      material: material.emissive({ name: "right facade cyan header mat", color: "#35e6ff", emissive: "#35e6ff", roughness: 0.16 })
    }).position(16.2, 9.0, -2.92).scale([1.55, 0.28, 0.12]).toJSON(),
    primitives.box({
      name: "right facade magenta header",
      material: material.emissive({ name: "right facade magenta header mat", color: "#ff4fd8", emissive: "#ff4fd8", roughness: 0.16 })
    }).position(16.2, 7.45, -2.92).scale([1.4, 0.22, 0.12]).toJSON()
  );

  for (let band = 0; band < 4; band += 1) {
    nodes.push(
      primitives.box({
        name: `right facade window band ${band}`,
        material: material.emissive({
          name: `right facade window mat ${band}`,
          color: band % 2 === 0 ? "#35e6ff" : "#ff4fd8",
          emissive: band % 2 === 0 ? "#35e6ff" : "#ff4fd8",
          roughness: 0.18
        })
      }).position(16.2, 2.0 + band * 1.55, -2.9).scale([1.5, 0.34, 0.14]).toJSON()
    );
  }

  // Far skyline slab fills the right background without crossing the courier's
  // playable silhouette or the burst's action plane.
  nodes.push(
    primitives.box({
      name: "far right skyline slab",
      material: material.pbr({ name: "far right skyline mat", color: "#304b70", roughness: 0.58, metallic: 0.22 })
    }).position(8.8, 5.8, -8.5).scale([8.6, 11.5, 0.7]).toJSON(),
    primitives.box({
      name: "far skyline cyan crown",
      material: material.emissive({ name: "far skyline crown mat", color: "#35e6ff", emissive: "#35e6ff", roughness: 0.2 })
    }).position(8.8, 10.9, -7.72).scale([6.8, 0.24, 0.1]).toJSON(),
    primitives.box({
      name: "far skyline magenta crown",
      material: material.emissive({ name: "far skyline magenta mat", color: "#ff4fd8", emissive: "#ff4fd8", roughness: 0.2 })
    }).position(12.2, 8.9, -7.7).scale([2.6, 0.18, 0.1]).toJSON()
  );

  nodes.push(
    primitives.box({
      name: "near skyline lower plinth",
      material: material.pbr({ name: "near skyline plinth mat", color: "#263d60", roughness: 0.5, metallic: 0.24 })
    }).position(8.8, 0.8, -7.55).scale([8.6, 1.6, 0.32]).toJSON()
  );

  for (let column = 0; column < 4; column += 1) {
    nodes.push(
      primitives.box({
        name: `near skyline window column ${column}`,
        material: material.emissive({
          name: `near skyline window mat ${column}`,
          color: column % 2 === 0 ? "#35e6ff" : "#ff4fd8",
          emissive: column % 2 === 0 ? "#35e6ff" : "#ff4fd8",
          roughness: 0.2
        })
      }).position(5.8 + column * 2.0, 5.2, -7.7).scale([0.22, 4.1, 0.1]).toJSON()
    );
  }

  return nodes;
}
