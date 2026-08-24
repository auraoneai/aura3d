/**
 * Cyberpunk Metropolis Environment for Neon Swarm.
 * Skyscrapers, illuminated road curbs, holographic billboards, and volumetric lighting.
 */
import { primitives, material, lights, type AuraSceneNode } from "@aura3d/engine";

export function createNeonSwarmEnvironment(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  // ---------------- Lighting ----------------
  nodes.push(
    // Ambient Metropolis Hall Wash
    lights.ambient({
      name: "cyber-ambient",
      color: "#475569",
      intensity: 1.1
    }).toJSON(),
    // Cool Cyan Key Overhead
    lights.directional({
      name: "cyber-key-light",
      color: "#e0f2fe",
      intensity: 1.9
    }).position(8, 20, 8).toJSON(),
    // Warm Magenta Rim from North
    lights.directional({
      name: "cyber-rim-light",
      color: "#f43f5e",
      intensity: 1.5
    }).position(-8, 16, -12).toJSON(),
    // Center Arena Cyber Core Glow
    lights.point({
      name: "cyber-core-glow",
      color: "#38bdf8",
      intensity: 1.8
    }).position(0, 4.0, 0).toJSON()
  );

  // ---------------- Ground Cyber Asphalt Tiles ----------------
  const tileColors = ["#0c121e", "#131b2e"];
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
          emissive: "#38bdf8",
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
          emissive: "#38bdf8",
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
          color: "#701a75",
          emissive: "#d946ef",
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
          color: "#701a75",
          emissive: "#d946ef",
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
        .position(t.x, t.sy / 2 - 2, t.z)
        .scale([t.sx, t.sy, t.sz])
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
        .position(t.x, t.sy - 1.5, t.z)
        .scale([t.sx * 0.85, 0.8, t.sz * 0.85])
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

  return nodes;
}
