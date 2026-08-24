/**
 * 3D Oceanic Abyss Environment for Deep Recovery.
 * Provides rich multi-depth underwater scenery:
 * - Surface buoy station with mooring chains & beacon
 * - Shallow coral atolls & sea spires
 * - Mid-trench shipwreck ruins & cargo debris
 * - Abyssal hydrothermal vents & glowing crystal clusters
 */
import { primitives, material, lights, type AuraNodeInput } from "@aura3d/engine";
import { WORLD_BOUNDS, BUOY_STATION } from "./reef";

export function createDeepOceanEnvironment(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];

  // Underwater Atmospheric Lighting
  nodes.push(
    lights.ambient({
      name: "ocean-ambient",
      color: "#0a192f",
      intensity: 0.42
    }),
    lights.directional({
      name: "surface-sunbeams",
      color: "#38bdf8",
      intensity: 0.9
    }).position(20, 35, 10),
    lights.directional({
      name: "depth-fill-light",
      color: "#0284c7",
      intensity: 0.5
    }).position(-15, -20, -15),
    lights.point({
      name: "sub-headlight-halo",
      color: "#e0f2fe",
      intensity: 1.6
    }).position(0, -6, 5)
  );

  // Seabed Floor (Basalt, Sediment & Ocean Trench)
  nodes.push(
    // Renderer-owned abyss curtain behind the dive corridor. This subordinate
    // atmospheric plane prevents a bright clear color from defeating the
    // black-water thesis while typed wreck/sub/crate assets remain primary.
    primitives
      .plane({
        name: "abyss-water-curtain",
        material: material.pbr({
          name: "near-black water",
          color: "#010817",
          roughness: 1,
          metallic: 0
        })
      })
      .position(0, -18, 42)
      .scale([120, 90, 1]),
    primitives
      .plane({
        name: "abyss-water-curtain-reverse",
        material: material.pbr({
          name: "near-black water reverse",
          color: "#010817",
          roughness: 1,
          metallic: 0
        })
      })
      .position(0, -18, -42)
      .scale([120, 90, 1])
      .rotate(0, Math.PI, 0),
    primitives
      .plane({
        name: "seabed-ground",
        material: material.pbr({
          name: "seabed basalt",
          color: "#05111e",
          roughness: 0.88,
          metallic: 0.12
        })
      })
      .position(0, WORLD_BOUNDS.seabedY, 0)
      .scale([220, 1, 220])
      .rotate(-1.5708, 0, 0)
  );

  // Mooring Anchor Chain from Buoy Station to Seabed (Located at Buoy Station x=-10, z=15)
  for (let y = -2; y > -58; y -= 4) {
    nodes.push(
      primitives
        .cylinder({
          name: `mooring-chain-link-${Math.round(y)}`,
          material: material.pbr({
            name: "rusted iron chain",
            color: "#3d2817",
            roughness: 0.85,
            metallic: 0.6
          })
        })
        .position(-10, y, 15)
        .scale([0.22, 3.8, 0.22])
    );
  }

  // Buoy Warning Flasher on Surface
  nodes.push(
    primitives
      .sphere({
        name: "buoy-amber-beacon",
        material: material.emissive({
          name: "buoy strobe",
          color: "#78350f",
          emissive: "#f59e0b",
          roughness: 0.2
        })
      })
      .position(-10, 3.8, 15)
      .scale(0.55)
  );

  // Shallow reef landmarks sit ahead of the launch heading (+Z) so the first
  // frame teaches depth and direction without a debug overlay.
  const shallowReefs = [
    { x: -6.5, y: -8, z: -7, rx: 1.3, ry: 5.5, rz: 1.3, color: "#06b6d4" },
    { x: 6.5, y: -9, z: -9, rx: 1.5, ry: 6.2, rz: 1.5, color: "#14b8a6" },
    { x: -11, y: -15, z: 22, rx: 2.0, ry: 7.0, rz: 2.0, color: "#0ea5e9" },
    { x: 10.5, y: -17, z: 27, rx: 1.8, ry: 7.5, rz: 1.8, color: "#10b981" },
    { x: -5.0, y: -20, z: 34, rx: 2.2, ry: 8.0, rz: 2.2, color: "#0284c7" }
  ];

  shallowReefs.forEach((reef, idx) => {
    nodes.push(
      primitives
        .cylinder({
          name: `coral-spire-${idx}`,
          material: material.pbr({
            name: `coral-mat-${idx}`,
            color: reef.color,
            roughness: 0.7,
            metallic: 0.2
          })
        })
        .position(reef.x, reef.y, reef.z)
        .scale([reef.rx, reef.ry, reef.rz]),
      primitives
        .sphere({
          name: `coral-cap-${idx}`,
          material: material.emissive({
            name: `coral-glow-${idx}`,
            color: "#083344",
            emissive: reef.color,
            roughness: 0.3
          })
        })
        .position(reef.x, reef.y + reef.ry / 2 + 0.4, reef.z)
        .scale([reef.rx * 0.9, 0.9, reef.rz * 0.9])
    );
  });

  // Sea Archway Gateway ahead of the sub
  nodes.push(
    primitives
      .cylinder({
        name: "sea-arch-left-pillar",
        material: material.pbr({ name: "arch basalt", color: "#1e293b", roughness: 0.85, metallic: 0.1 })
      })
      .position(-5.0, -13, 22)
      .scale([1.4, 9.0, 1.4]),
    primitives
      .cylinder({
        name: "sea-arch-right-pillar",
        material: material.pbr({ name: "arch basalt", color: "#1e293b", roughness: 0.85, metallic: 0.1 })
      })
      .position(5.0, -13, 22)
      .scale([1.4, 9.0, 1.4]),
    primitives
      .box({
        name: "sea-arch-lintel",
        material: material.pbr({ name: "arch lintel", color: "#1e293b", roughness: 0.85, metallic: 0.1 })
      })
      .position(0, -8.5, 22)
      .scale([11.4, 1.2, 1.6]),
    primitives
      .sphere({
        name: "arch-glow-jewel",
        material: material.emissive({ name: "arch emerald", color: "#064e3b", emissive: "#34d399", roughness: 0.2 })
      })
      .position(0, -7.6, 22)
      .scale(0.8)
  );

  // Mid-Trench Shipwreck Beams & Hull Ribs (Depth -20m to -38m)
  const wreckRibs = [
    { x: -16, y: -26, z: -10, rotZ: 0.4, w: 1.4, h: 14 },
    { x: -13, y: -28, z: -8, rotZ: 0.35, w: 1.4, h: 12 },
    { x: -10, y: -30, z: -6, rotZ: 0.3, w: 1.4, h: 10 },
    { x: 16, y: -32, z: 14, rotZ: -0.4, w: 1.6, h: 13 },
    { x: 19, y: -34, z: 16, rotZ: -0.35, w: 1.6, h: 11 }
  ];

  wreckRibs.forEach((rib, idx) => {
    nodes.push(
      primitives
        .box({
          name: `wreck-rib-${idx}`,
          material: material.pbr({
            name: "corroded iron hull",
            color: "#451a03",
            roughness: 0.9,
            metallic: 0.4
          })
        })
        .position(rib.x, rib.y, rib.z)
        .scale([rib.w, rib.h, 0.7])
        .rotate(0, 0, rib.rotZ)
    );
  });

  // Hydrothermal Volcanic Black Smokers on Seabed (Depth -62m)
  const vents = [
    { x: -28, z: -15, h: 9, color: "#f97316" },
    { x: 22, z: -32, h: 11, color: "#ef4444" },
    { x: -12, z: 35, h: 8, color: "#f59e0b" },
    { x: 30, z: 20, h: 10, color: "#fb923c" }
  ];

  vents.forEach((vent, idx) => {
    nodes.push(
      primitives
        .cylinder({
          name: `vent-chimney-${idx}`,
          material: material.pbr({
            name: "volcanic chimney basalt",
            color: "#18181b",
            roughness: 0.9,
            metallic: 0.1
          })
        })
        .position(vent.x, WORLD_BOUNDS.seabedY + vent.h / 2, vent.z)
        .scale([2.2, vent.h, 2.2]),
      primitives
        .sphere({
          name: `vent-magma-glow-${idx}`,
          material: material.emissive({
            name: `magma vent glow ${idx}`,
            color: "#7c2d12",
            emissive: vent.color,
            roughness: 0.2
          })
        })
        .position(vent.x, WORLD_BOUNDS.seabedY + vent.h + 0.4, vent.z)
        .scale(1.5)
    );
  });

  // Bioluminescent Sea Spires & Crystal Clusters (Depth -35m to -55m)
  const bioCrystals = [
    { x: -32, y: -48, z: 8, color: "#06b6d4", scaleY: 6.0 },
    { x: 18, y: -42, z: -22, color: "#10b981", scaleY: 6.5 },
    { x: -16, y: -52, z: -26, color: "#a855f7", scaleY: 5.2 },
    { x: 26, y: -46, z: 28, color: "#06b6d4", scaleY: 5.6 },
    { x: 0, y: -54, z: -35, color: "#38bdf8", scaleY: 7.0 }
  ];

  bioCrystals.forEach((crystal, idx) => {
    nodes.push(
      primitives
        .cylinder({
          name: `biocrystal-spire-${idx}`,
          material: material.emissive({
            name: `biocrystal glow ${idx}`,
            color: "#083344",
            emissive: crystal.color,
            roughness: 0.3
          })
        })
        .position(crystal.x, crystal.y, crystal.z)
        .scale([0.7, crystal.scaleY, 0.7])
    );
  });

  return nodes;
}
