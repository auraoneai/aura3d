/**
 * 3D Museum Gallery Environment for Gallery Shift.
 * Polished checkered marble, gilded art paintings, exhibition spotlights, and atmosphere.
 */
import { primitives, material, lights, type AuraSceneNode } from "@aura3d/engine";

export function createGalleryEnvironment(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  // ---------------- Lighting ----------------
  nodes.push(
    // Ambient Hall Tone
    lights.ambient({
      name: "museum-ambient",
      color: "#475569",
      intensity: 1.2
    }).toJSON(),
    // Cool Moonlight Key Light (South-to-North)
    lights.directional({
      name: "museum-moonlight-south",
      color: "#e2e8f0",
      intensity: 1.6
    }).position(-5, 16, 9).toJSON(),
    // Museum Key Light (North-to-South)
    lights.directional({
      name: "museum-moonlight-north",
      color: "#cbd5e1",
      intensity: 1.4
    }).position(5, 16, -9).toJSON(),
    // Warm Rotunda Chandelier
    lights.point({
      name: "rotunda-chandelier",
      color: "#fef08a",
      intensity: 1.8
    }).position(0, 4.2, 0).toJSON(),
    // Exit Area Neon Beacon
    lights.point({
      name: "exit-beacon-glow",
      color: "#34d399",
      intensity: 1.4
    }).position(0, 2.4, -6.4).toJSON()
  );

  // The metre-scale typed museum GLB owns the visible floor slab and shell.
  // Route primitives below are decorative inlays, frames, and light fixtures;
  // they do not replace the typed world subject.

  // ---------------- Rotunda Centerpiece Inlay ----------------
  nodes.push(
    // Outer Gold Inlay Ring
    primitives
      .torus({
        name: "rotunda-gold-ring",
        material: material.metal({
          name: "gold-ring-mat",
          color: "#f59e0b",
          roughness: 0.2,
          metallic: 0.95
        })
      })
      .position(0, 0.02, 0)
      .scale([3.2, 3.2, 0.06])
      .rotate(1.5708, 0, 0)
      .toJSON(),
    // Inner Emerald Medallion
    primitives
      .cylinder({
        name: "rotunda-center-medallion",
        material: material.pbr({
          name: "medallion-mat",
          color: "#064e3b",
          roughness: 0.3,
          metallic: 0.4
        })
      })
      .position(0, 0.01, 0)
      .scale([1.8, 0.02, 1.8])
      .toJSON()
  );

  // ---------------- Gilded Art Picture Frames on Walls ----------------
  interface PaintingDef {
    name: string;
    pos: [number, number, number];
    rotY: number;
    artColor: string;
    artEmissive: string;
  }

  const paintings: PaintingDef[] = [
    // North Wall
    { name: "painting-n1", pos: [-5.2, 2.0, -7.0], rotY: 0, artColor: "#1e1b4b", artEmissive: "#6366f1" },
    { name: "painting-n2", pos: [5.2, 2.0, -7.0], rotY: 0, artColor: "#064e3b", artEmissive: "#10b981" },
    // South Wall
    { name: "painting-s1", pos: [-5.2, 2.0, 7.0], rotY: Math.PI, artColor: "#701a75", artEmissive: "#d946ef" },
    { name: "painting-s2", pos: [5.2, 2.0, 7.0], rotY: Math.PI, artColor: "#78350f", artEmissive: "#f59e0b" },
    // West Wall
    { name: "painting-w1", pos: [-10.0, 2.0, -3.2], rotY: Math.PI / 2, artColor: "#0c4a6e", artEmissive: "#0284c7" },
    { name: "painting-w2", pos: [-10.0, 2.0, 3.2], rotY: Math.PI / 2, artColor: "#831843", artEmissive: "#f43f5e" },
    // East Wall
    { name: "painting-e1", pos: [10.0, 2.0, -3.2], rotY: -Math.PI / 2, artColor: "#14532d", artEmissive: "#22c55e" },
    { name: "painting-e2", pos: [10.0, 2.0, 3.2], rotY: -Math.PI / 2, artColor: "#4c1d95", artEmissive: "#8b5cf6" }
  ];

  paintings.forEach((p) => {
    // Gold Frame
    nodes.push(
      primitives
        .box({
          name: `${p.name}-frame`,
          material: material.metal({
            name: "gold-frame-mat",
            color: "#d97706",
            roughness: 0.25,
            metallic: 0.92
          })
        })
        .position(...p.pos)
        .scale([1.8, 1.4, 0.08])
        .rotate(0, p.rotY, 0)
        .toJSON(),
      // Luminous Art Canvas
      primitives
        .box({
          name: `${p.name}-canvas`,
          material: material.emissive({
            name: `${p.name}-canvas-mat`,
            color: p.artColor,
            emissive: p.artEmissive,
            roughness: 0.4
          })
        })
        .position(
          p.pos[0] + (p.rotY === Math.PI / 2 ? 0.05 : p.rotY === -Math.PI / 2 ? -0.05 : 0),
          p.pos[1],
          p.pos[2] + (p.rotY === 0 ? 0.05 : p.rotY === Math.PI ? -0.05 : 0)
        )
        .scale([1.5, 1.1, 0.04])
        .rotate(0, p.rotY, 0)
        .toJSON()
    );
  });

  // ---------------- Pedestal Overhead Spotlights ----------------
  const pedestalSpots = [
    { x: -6.5, z: -4.2 },
    { x: 6.5, z: -4.2 },
    { x: -6.5, z: 4.2 },
    { x: 6.5, z: 4.2 }
  ];

  pedestalSpots.forEach((spot, idx) => {
    // Spotlight glow node
    nodes.push(
      lights
        .point({
          name: `pedestal-spot-${idx}`,
          color: "#fef08a",
          intensity: 1.4
        })
        .position(spot.x, 2.8, spot.z)
        .toJSON(),
      // Vitrine Glass Base Ring
      primitives
        .torus({
          name: `pedestal-glow-ring-${idx}`,
          material: material.emissive({
            name: "pedestal-ring-mat",
            color: "#451a03",
            emissive: "#f59e0b",
            roughness: 0.1
          })
        })
        .position(spot.x, 0.015, spot.z)
        .scale([1.1, 1.1, 0.04])
        .rotate(1.5708, 0, 0)
        .toJSON()
    );
  });

  return nodes;
}
