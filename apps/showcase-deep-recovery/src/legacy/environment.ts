/**
 * 3D Oceanic Abyss Environment for Deep Recovery.
 * Provides rich multi-depth underwater scenery:
 * - Surface buoy station with mooring chains & beacon
 * - Shallow coral atolls & sea spires
 * - Mid-trench shipwreck ruins & cargo debris
 * - Abyssal hydrothermal vents & glowing crystal clusters
 */
import { model, primitives, material, lights, text3D, type AuraNodeInput } from "@aura3d/engine";
import { assets } from "../../../../src/aura-assets";
import { WORLD_BOUNDS, BUOY_STATION } from "../gameplay/reef";

export function createDeepOceanEnvironment(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  const { sphere: authoredSphere, box: authoredBox, torus: authoredTorus } = primitives;

  // The route entry point owns the single typed wreck landmark. Keeping the
  // environment dressing separate avoids two coincident GLBs fighting for the
  // same depth buffer in the sonar-reveal frame while retaining the inspected
  // asset as the route's primary-world subject.
  nodes.push(
    model(assets.deepRecoveryWreckHull, {
      name: "typed deep recovery distant wreck dressing",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 6.0,
      material: material.pbr({
        name: "distant oxidized wreck dressing",
        color: "#5c3b31",
        roughness: 0.68,
        metallic: 0.2
      })
    }).position(14, -27, -8).runtime({ id: "deep-recovery-distant-wreck", tags: ["typed-asset", "environment-dressing"] })
  );

  // Underwater Atmospheric Lighting
  nodes.push(
    lights.ambient({
      name: "deep recovery game ocean ambient",
      color: "#0b2d35",
      intensity: 1.18}),
    lights.directional({
      name: "surface-sunbeams",
      color: "#78afb1",
      intensity: 1.92}).position(20, 35, 10),
    lights.directional({
      name: "depth-fill-light",
      color: "#0f5362",
      intensity: 1.65}).position(-15, -20, -15),
    lights.point({
      name: "sub-headlight-halo",
      color: "#b9efff",
      intensity: 7.2}).position(0, -6, 5),
    lights.spot({
      name: "sub searchlight",
      position: [0, -5.4, 5.5],
      target: [0, -8, -6],
      angle: 0.42,
      penumbra: 0.5,
      distance: 40,
      decay: 2,
      intensity: 8.0,
      color: "#c8f4ff",
      shadow: true
    })
  );

  // Distant translucent surface shells provide blue-green backdrop dressing
  // behind the typed wreck. They are authored color geometry, not volumetric
  // water or participating-media scattering; physical underwater rendering
  // cannot be established from these shells.
  {
    nodes.push(
      primitives.sphere({
        name: "deep water distance volume",
        material: material.pbr({
          name: "deep water distance gradient",
          color: "#155668",
          emissive: "#0c3d50",
          emissiveIntensity: 0.32,
          roughness: 1,
          metallic: 0,
          opacity: 0.2
        })
      }).position(0, -7.8, 28).scale([28, 17, 4.5]),
      primitives.sphere({
        name: "deep water lower blue volume",
        material: material.emissive({
          name: "deep water lower blue haze",
          color: "#0b4a62",
          emissive: "#1c8296",
          emissiveIntensity: 0.18,
          opacity: 0.11
        })
      }).position(-2, -13.5, 16).scale([21, 6.5, 5])
    );
  }

  // Seabed Floor (Basalt, Sediment & Ocean Trench)
  nodes.push(
    // A real low-poly trench shelf gives the follow camera a readable lower
    // plane and contact horizon instead of an unbounded black void. It is
    // non-colliding environment dressing; reef.ts remains the authority for
    // gameplay obstacles and navigation.
    primitives.sphere({
      name: "deep recovery broad trench floor",
      material: material.pbr({
        name: "deep trench slate floor",
        color: "#2b6973",
        emissive: "#124b59",
        emissiveIntensity: 0.26,
        roughness: 0.94,
        metallic: 0.03
      })
    }).position(-2, -16.65, -10).scale([20, 0.88, 15]).rotate(0.03, -0.08, 0.015),
    primitives.box({
      name: "deep recovery trench floor cyan seam",
      material: material.emissive({ name: "deep trench cyan seam", color: "#0b5967", emissive: "#19b7c9", emissiveIntensity: 0.32, opacity: 0.78 })
    }).position(1.2, -15.72, -10.2).scale([15.5, 0.035, 0.11]).rotate(0.01, -0.16, 0.01),
    primitives.box({
      name: "deep recovery trench floor amber seam",
      material: material.emissive({ name: "deep trench amber seam", color: "#7c4214", emissive: "#f59e0b", emissiveIntensity: 0.28, opacity: 0.64 })
    }).position(-4.5, -15.7, -7.5).scale([0.11, 0.035, 8.2]).rotate(0.01, 0.2, 0.01),
    lights.point({
      name: "abyss amber beacon fill",
      color: "#f59e0b",
      intensity: 1.55
    }).position(-8, -16, 14),
    lights.point({
      name: "trench floor cyan fill",
      color: "#4dd7e5",
      intensity: 7.8}).position(0, -14, -8),
    lights.point({
      name: "wreck sonar cyan fill",
      color: "#45e0ff",
      intensity: 12.5}).position(-7, -12, -13),
    lights.point({
      name: "wreck oxidized amber fill",
      color: "#f59e0b",
      intensity: 11.5}).position(-9.5, -10.5, -14.5),
    lights.point({
      name: "wreck chapel warm overhead",
      color: "#ffd58a",
      intensity: 15.5}).position(-7, -5.8, -12.5),
    lights.point({
      name: "wreck cool rim practical",
      color: "#5de8ff",
      intensity: 6.4}).position(-2.8, -10.8, -10.2),
    lights.point({
      name: "wreck sediment amber practical",
      color: "#ffb45e",
      intensity: 5.2}).position(-10.2, -14.3, -13.8),
    primitives.torus({
      name: "wreck salvage beacon ring",
      material: material.emissive({
        name: "wreck salvage beacon",
        color: "#7c2d12",
        emissive: "#fb923c",
        emissiveIntensity: 1.7,
        opacity: 0.92
      })
    }).position(-7, -9.6, -13).scale([2.2, 2.2, 0.12]).rotate(Math.PI / 2, 0, 0),
    primitives.sphere({
      name: "wreck salvage lantern",
      material: material.emissive({
        name: "wreck lantern glow",
        color: "#92400e",
        emissive: "#fbbf24",
        emissiveIntensity: 1.8
      })
    }).position(-5.2, -10.7, -13.2).scale(0.48),
    // Default gameplay and route-primary views need a continuous water-floor
    // read as well as the close review basin. These broad renderer-owned
    // silt plates sit under the existing chapel dressing and make its edges,
    // contact shadows, and cyan/amber navigation seams readable from the
    // launch camera without becoming a screen-space backdrop.
    ...([]),
    // A short chain of physical sonar waypoints ties the approach vehicle to
    // the wreck basin. Each marker is a tiny world-space beacon with a halo,
    // so the route remains legible even when the transient pulse has faded.
    ...([
      { x: -0.8, y: -8.2, z: -2.8, color: "#55e6ee" },
      { x: -2.2, y: -9.1, z: -5.4, color: "#55e6ee" },
      { x: -3.9, y: -10.1, z: -8.0, color: "#f8c56c" },
      { x: -5.2, y: -10.9, z: -10.0, color: "#f8c56c" }
    ].flatMap((waypoint, index) => {
      const markerMaterial = material.emissive({
        name: `default salvage route beacon material ${index + 1}`,
        color: waypoint.color === "#f8c56c" ? "#8a561d" : "#147887",
        emissive: waypoint.color,
        emissiveIntensity: 1.45,
        opacity: 0.92
      });
      return [
        primitives.sphere({ name: `default salvage route beacon ${index + 1}`, material: markerMaterial })
          .position(waypoint.x, waypoint.y, waypoint.z).scale(0.16 + index * 0.018),
        primitives.torus({ name: `default salvage route halo ${index + 1}`, material: markerMaterial })
          .position(waypoint.x, waypoint.y - 0.04, waypoint.z).scale([0.32 + index * 0.03, 0.32 + index * 0.03, 0.035]).rotate(Math.PI / 2, 0, 0)
      ];
    })),
    // Mid-water landmarks sit on the 16m-depth capture path so the follow camera
    // sees a populated sea rather than only the distant seabed dressing.
    primitives.cylinder({
      name: "midwater reef pillar west",
      material: material.pbr({ name: "midwater reef stone west", color: "#3d96aa", emissive: "#164f60", emissiveIntensity: 0.28, roughness: 0.68, metallic: 0.12 })
    }).position(-10.5, -16, 7).scale([1.05, 3.1, 1.05]),
    primitives.cylinder({
      name: "midwater reef pillar east",
      material: material.pbr({ name: "midwater reef stone east", color: "#36a687", emissive: "#135348", emissiveIntensity: 0.26, roughness: 0.68, metallic: 0.12 })
    }).position(10.5, -16, 11).scale([0.9, 2.8, 0.9]),
    primitives.torus({
      name: "midwater amber salvage arch",
      material: material.emissive({ name: "midwater amber arch glow", color: "#78350f", emissive: "#f59e0b", emissiveIntensity: 0.65, opacity: 0.9 })
    }).position(2.8, -16, 9).scale([2.35, 2.35, 0.42]).rotate(1.5708, 0, 0),
    primitives.sphere({
      name: "midwater warm beacon west",
      material: material.emissive({ name: "midwater warm beacon west glow", color: "#92400e", emissive: "#fbbf24", emissiveIntensity: 1.0 })
    }).position(-4, -13.9, 4).scale(0.5),
    primitives.sphere({
      name: "midwater warm beacon east",
      material: material.emissive({ name: "midwater warm beacon east glow", color: "#92400e", emissive: "#fb923c", emissiveIntensity: 1.0 })
    }).position(4, -14.2, 7).scale(0.44),
    // Layered shelf rocks establish a readable seabed horizon without a
    // diagnostic full-screen plane. Their staggered heights create contact
    // shadows and depth cues around the sonar-reveal route.
    primitives.box({
      name: "near trench shelf west",
      material: material.pbr({ name: "near trench shelf west stone", color: "#2c6479", roughness: 0.82, metallic: 0.08 })
    }).position(-9.5, -20.5, 24).scale([5.5, 1.2, 3.2]).rotate(0, 0.08, -0.12),
    primitives.box({
      name: "near trench shelf east",
      material: material.pbr({ name: "near trench shelf east stone", color: "#386f82", roughness: 0.82, metallic: 0.08 })
    }).position(9.8, -22, 28).scale([4.8, 1.4, 3.8]).rotate(0, -0.12, 0.1),
    primitives.cylinder({
      name: "near trench shelf coral west",
      material: material.pbr({ name: "near trench shelf coral west material", color: "#267c7c", roughness: 0.76, metallic: 0.04 })
    }).position(-8.2, -18.2, 25.6).scale([1.3, 2.8, 1.3]),
    primitives.cylinder({
      name: "near trench shelf coral east",
      material: material.pbr({ name: "near trench shelf coral east material", color: "#3b6a66", roughness: 0.76, metallic: 0.04 })
    }).position(8.5, -19.4, 30.2).scale([1.1, 2.2, 1.1]),
    primitives.torus({
      name: "near trench navigation ring",
      material: material.emissive({ name: "near trench navigation ring glow", color: "#075985", emissive: "#22d3ee", emissiveIntensity: 1.15, opacity: 0.72 })
    }).position(0, -17.8, 22).scale([3.8, 3.8, 0.12]).rotate(Math.PI / 2, 0, 0),
    // A string of small warm windows gives the wreck a designed focal rhythm
    // rather than a single unlit brown silhouette.
    ...[-2.1, -0.7, 0.7, 2.1].map((x, index) => primitives.box({
      name: `midwater wreck window-${index}`,
      material: material.emissive({ name: `midwater wreck window glow-${index}`, color: "#92400e", emissive: index % 2 === 0 ? "#fde68a" : "#fb923c", emissiveIntensity: 1.35, opacity: 0.9 })
    }).position(x, -15.2, 15.2).scale([0.32, 0.48, 0.08]))

  );

  // A local cyan practical around the authored submarine keeps the hero hull
  // grounded and readable when the salvage-map camera swings into the wreck;
  // it is a real scene light, not a screen-space highlight.
  nodes.push(
    lights.point({ name: "submarine review practical", color: "#79ecff", intensity: 6.2})
      .position(-1.5, -11.6, -7.4)
  );

  {
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

    // The buoy is part of the normal mission world. It is deliberately absent
    // from the dedicated wreck-review lens, where its long chain previously
    // projected as unrelated bars at the frame edge.
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
  }

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
          material: material.pbr({ name: "arch basalt", color: "#4b7183", roughness: 0.78, metallic: 0.1 })
      })
      .position(-5.0, -13, 22)
      .scale([1.4, 9.0, 1.4]),
    primitives
      .cylinder({
        name: "sea-arch-right-pillar",
          material: material.pbr({ name: "arch basalt", color: "#4b7183", roughness: 0.78, metallic: 0.1 })
      })
      .position(5.0, -13, 22)
      .scale([1.4, 9.0, 1.4]),
    primitives
      .box({
        name: "sea-arch-lintel",
        material: material.pbr({ name: "arch lintel", color: "#3b5668", roughness: 0.82, metallic: 0.1 })
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

  // Mid-water coral fans and light ribbons give the follow frame distinct
  // near/mid/far layers. They are renderer-owned dressing only; the mission
  // collision map continues to come from reef.ts and the route's typed hull.
  const fanMaterials = [
    material.pbr({ name: "teal coral fan", color: "#26879a", roughness: 0.7, metallic: 0.08 }),
    material.pbr({ name: "violet coral fan", color: "#5b5aa6", roughness: 0.68, metallic: 0.08 }),
    material.pbr({ name: "green coral fan", color: "#2d8f79", roughness: 0.68, metallic: 0.08 })
  ] as const;
  const fanSpawns = [
    { x: -8.6, y: -13.8, z: 11.5, scale: [1.0, 3.8, 0.7] as const, rot: -0.22 },
    { x: 8.4, y: -14.4, z: 13.2, scale: [0.9, 3.4, 0.72] as const, rot: 0.18 },
    { x: -10.8, y: -16.6, z: 18.6, scale: [1.15, 4.6, 0.9] as const, rot: -0.35 },
    { x: 10.8, y: -17.2, z: 20.2, scale: [1.2, 4.2, 0.86] as const, rot: 0.3 }
  ] as const;
  fanSpawns.forEach((spawn, index) => {
    nodes.push(
      primitives.cylinder({
        name: `midwater coral fan ${index + 1}`,
        material: fanMaterials[index % fanMaterials.length]!
      }).position(spawn.x, spawn.y, spawn.z).scale(spawn.scale).rotate(0, spawn.rot, 0),
      primitives.sphere({
        name: `midwater coral fan beacon ${index + 1}`,
        material: material.emissive({
          name: `midwater coral fan beacon material ${index + 1}`,
          color: "#0e7490",
          emissive: index % 2 === 0 ? "#67e8f9" : "#c084fc",
          emissiveIntensity: 0.95,
          opacity: 0.78
        })
      }).position(spawn.x, spawn.y + spawn.scale[1] * 0.46, spawn.z).scale(0.42)
    );
  });
  const waterRibbon = material.emissive({ name: "underwater light ribbon", color: "#2b8499", emissive: "#67e8f9", emissiveIntensity: 0.16, opacity: 0.1});
  nodes.push(
    primitives.box({ name: "underwater light ribbon west", material: waterRibbon }).position(-7.6, -6.8, 16.5).scale([0.06, 3.5, 0.62]).rotate(0, -0.14, -0.12),
    primitives.box({ name: "underwater light ribbon east", material: waterRibbon }).position(7.2, -7.6, 18.8).scale([0.06, 3.2, 0.56]).rotate(0, 0.2, 0.14)
  );

  // The normal launch lens benefits from a visible water-column rhythm too.
  // These slashes are shallow, low-opacity scene geometry (not a backdrop or
  // DOM overlay) that catches the directional key light and breaks up the
  // otherwise monochrome teal field around the route's real subjects.
  {
    const defaultCaustic = material.emissive({
      name: "default water caustic slashes",
      color: "#217b8a",
      emissive: "#72e7ed",
      emissiveIntensity: 0.48,
      opacity: 0.1
    });
    const defaultCausticWarm = material.emissive({
      name: "default water amber caustic slashes",
      color: "#815228",
      emissive: "#ffc56b",
      emissiveIntensity: 0.32,
      opacity: 0.08
    });
    nodes.push(
      ...[
        { x: -15.2, y: -8.4, z: -4.2, sx: 0.055, sy: 3.1, sz: 0.34, rot: -0.22 },
        { x: -11.0, y: -7.5, z: -10.8, sx: 0.045, sy: 2.8, sz: 0.38, rot: 0.26 },
        { x: 10.6, y: -8.3, z: -5.2, sx: 0.05, sy: 3.0, sz: 0.36, rot: 0.3 },
        { x: 13.8, y: -8.7, z: -13.5, sx: 0.045, sy: 2.8, sz: 0.32, rot: -0.18 },
        { x: 3.2, y: -7.2, z: -18.0, sx: 0.04, sy: 2.4, sz: 0.28, rot: 0.1 }
      ].map((slash, index) => primitives.box({
        name: `default suspended caustic slash ${index + 1}`,
        material: index === 3 ? defaultCausticWarm : defaultCaustic
      }).position(slash.x, slash.y, slash.z).scale([slash.sx, slash.sy, slash.sz]).rotate(0, slash.rot, 0)),
      ...Array.from({ length: 22 }, (_, index) => {
        const angle = index * 2.399963229728653;
        const radius = 5.8 + (index % 5) * 1.2;
        const x = -4.0 + Math.cos(angle) * radius;
        const y = -11.4 + Math.sin(angle * 1.7) * 4.8 + (index % 3) * 0.55;
        const z = -9.8 + Math.sin(angle) * radius * 0.78;
        return primitives.sphere({
          name: `default suspended salvage particulate ${index + 1}`,
          material: index % 5 === 0 ? defaultCausticWarm : defaultCaustic
        }).position(x, y, z).scale(0.055 + (index % 4) * 0.022);
      })
    );
  }

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
            color: "#6b3b26",
            roughness: 0.9,
            metallic: 0.4
          })
        })
        // The overhead review composition has its own compact chapel/wreck
        // landmark. Push the distant trench ribs out of that lens so their
        // edge-on silhouettes do not become long black bars across the map.
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

  if (true) vents.forEach((vent, idx) => {
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

  if (true) bioCrystals.forEach((crystal, idx) => {
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

  // A compact, dark salvage-island silhouette around the named wreck gives
  // the approach frame a readable landmark mass. These are renderer-owned
  // environment plates and chapel-like ruins; collision/sonar truth remains
  // owned by reef.ts, while the typed wreck asset remains the primary world
  // subject. Warm windows and a cyan portal provide authored depth cues in the
  // dark water grade without using DOM/CSS as a world effect.
  const ruinStone = material.pbr({
    name: "sunless salvage-island stone",
    color: "#2d6267",
    emissive: "#123c45",
    emissiveIntensity: 0.46,
    roughness: 0.9,
    metallic: 0.08
  });
  const ruinEdge = material.pbr({
    name: "sunless salvage-island edge",
    color: "#508e89",
    emissive: "#1f5d5c",
    emissiveIntensity: 0.38,
    roughness: 0.8,
    metallic: 0.12
  });
  const ruinWindow = material.emissive({ name: "sunless salvage-island warm windows", color: "#a55a19", emissive: "#ffe08a", emissiveIntensity: 1.24, opacity: 0.98 });
  const ruinMapLine = material.emissive({ name: "sunless salvage-island map line", color: "#0e7490", emissive: "#67e8f9", emissiveIntensity: 0.98, opacity: 0.74});
  const ruinMapAmber = material.emissive({ name: "sunless salvage-island amber map line", color: "#92400e", emissive: "#fbbf24", emissiveIntensity: 1.22, opacity: 0.88});
  const ruinDeck = material.metal({ name: "sunless wreck settlement deck", color: "#80633e", roughness: 0.58, metallic: 0.46 });
  const ruinDeckDark = material.pbr({ name: "sunless wreck settlement dark deck", color: "#243433", emissive: "#101817", emissiveIntensity: 0.1, roughness: 0.72, metallic: 0.16 });
  const ruinRoof = material.pbr({
    name: "drowned chapel oxidized roof",
    color: "#587678",
    emissive: "#1c4d55",
    emissiveIntensity: 0.38,
    roughness: 0.54,
    metallic: 0.28
  });
  const sedimentMottles = [
    material.pbr({ name: "drowned sediment dark", color: "#1f403d", emissive: "#163331", emissiveIntensity: 0.3, roughness: 0.98, opacity: 0.34 }),
    material.pbr({ name: "drowned sediment moss", color: "#49685a", emissive: "#29483f", emissiveIntensity: 0.34, roughness: 0.96, opacity: 0.3 }),
    material.pbr({ name: "drowned sediment silt", color: "#666b4e", emissive: "#4c492f", emissiveIntensity: 0.26, roughness: 1, opacity: 0.24 })
  ] as const;
  const islandFragments = [
    { x: -12.2, y: -16.3, z: -14.8, sx: 1.7, sz: 1.1 },
    { x: -11.4, y: -16.1, z: -9.7, sx: 1.25, sz: 1.55 },
    { x: -8.6, y: -16.5, z: -7.7, sx: 1.55, sz: 1.05 },
    { x: -4.6, y: -16.2, z: -8.3, sx: 1.45, sz: 1.2 },
    { x: -1.9, y: -16.35, z: -11.3, sx: 1.15, sz: 1.6 },
    { x: -2.3, y: -16.15, z: -15.8, sx: 1.6, sz: 1.0 },
    { x: -5.2, y: -16.45, z: -18.0, sx: 1.35, sz: 1.1 },
    { x: -9.7, y: -16.25, z: -17.7, sx: 1.75, sz: 1.0 }
  ] as const;
  // The review camera looks steeply down through the water column. A previous
  // treatment scattered flattened spheres around the frame; from this angle
  // they read as unrelated black ovals rather than seabed. Keep the whole
  // review composition on one continuous renderer-owned abyssal basin, then
  // layer broad, overlapping sediment bands into that same surface. The low
  // contrast bands cross the basin instead of becoming detached "rock" props,
  // so the sub, typed wreck, and chapel share one materially coherent ground.
  const reviewBasin = material.pbr({
    name: "continuous drowned basin basalt",
    color: "#1a4748",
    emissive: "#12383a",
    emissiveIntensity: 0.42,
    roughness: 0.98,
    metallic: 0.02
  });
  const reviewSediment = [
    material.pbr({ name: "continuous basin blue silt", color: "#24545a", emissive: "#173e43", emissiveIntensity: 0.34, roughness: 1, opacity: 0.34 }),
    material.pbr({ name: "continuous basin green silt", color: "#315a4f", emissive: "#1d4039", emissiveIntensity: 0.3, roughness: 1, opacity: 0.3 }),
    material.pbr({ name: "continuous basin amber silt", color: "#625b3f", emissive: "#3d3c2b", emissiveIntensity: 0.25, roughness: 1, opacity: 0.22 })
  ] as const;
  const reviewSedimentBands = [
    { name: "north", x: -2.0, y: -15.78, z: -7.2, sx: 23, sz: 7.4 },
    { name: "center", x: -1.0, y: -15.75, z: -13.2, sx: 22, sz: 7.8 },
    { name: "south", x: -2.5, y: -15.79, z: -19.0, sx: 23, sz: 7.0 }
  ] as const;
  const reviewBasinRim = [
    { name: "northwest escarpment", x: -9.6, z: -8.6, sx: 6.6, sz: 3.5, rot: -0.24 },
    { name: "north shelf", x: -4.9, z: -7.0, sx: 6.9, sz: 3.1, rot: 0.08 },
    { name: "northeast shelf", x: 0.6, z: -7.7, sx: 6.5, sz: 3.4, rot: 0.22 },
    { name: "east headland", x: 4.0, z: -10.8, sx: 5.8, sz: 4.1, rot: 0.38 },
    { name: "east trench wall", x: 4.8, z: -15.4, sx: 5.1, sz: 4.9, rot: -0.08 },
    { name: "southeast shelf", x: 2.7, z: -19.5, sx: 6.5, sz: 3.8, rot: -0.28 },
    { name: "south shelf", x: -2.8, z: -20.7, sx: 7.0, sz: 3.2, rot: 0.08 },
    { name: "southwest shelf", x: -7.8, z: -19.5, sx: 6.2, sz: 3.5, rot: 0.3 }
  ] as const;
  const reviewChannel = [
    { x: -12.0, z: -8.0, sx: 2.4, sz: 1.15, rot: -0.34 },
    { x: -10.2, z: -9.5, sx: 2.7, sz: 1.1, rot: -0.4 },
    { x: -8.5, z: -11.0, sx: 2.8, sz: 1.06, rot: -0.38 },
    { x: -6.6, z: -12.1, sx: 2.8, sz: 1.0, rot: -0.2 },
    { x: -4.5, z: -12.7, sx: 2.7, sz: 0.95, rot: -0.08 }
  ] as const;
  const reviewDebrisField = [
    { x: -11.1, z: -15.9, sx: 0.95, sz: 0.32, rot: 0.32 },
    { x: -9.4, z: -17.0, sx: 0.72, sz: 0.28, rot: -0.44 },
    { x: -7.3, z: -18.0, sx: 1.18, sz: 0.3, rot: 0.18 },
    { x: -4.9, z: -18.4, sx: 0.78, sz: 0.28, rot: -0.24 },
    { x: -2.6, z: -17.8, sx: 1.02, sz: 0.3, rot: 0.42 },
    { x: 1.3, z: -15.9, sx: 0.86, sz: 0.28, rot: -0.3 },
    { x: 3.7, z: -13.9, sx: 1.15, sz: 0.32, rot: 0.22 }
  ] as const;
  const reviewPlumes = [
    { x: -12.8, y: -13.9, z: -17.9, sx: 3.2, sy: 0.55, sz: 2.0 },
    { x: 2.8, y: -13.6, z: -9.0, sx: 3.6, sy: 0.7, sz: 2.4 },
    { x: 4.4, y: -13.9, z: -19.1, sx: 4.0, sy: 0.58, sz: 2.1 }
  ] as const;
  nodes.push(
    ...([]),
    primitives.sphere({
      name: "salvage island submerged cyan light pool",
      material: material.emissive({
        name: "submerged cyan light pool material",
        color: "#0d5860",
        emissive: "#36c7c9",
        emissiveIntensity: 0.34,
        opacity: 0.22
      })
    }).position(-7, -17.05, -13).scale([6.5, 0.12, 4.8]),
    primitives.sphere({
      name: "salvage island submerged amber light pool",
      material: material.emissive({
        name: "submerged amber light pool material",
        color: "#7a4218",
        emissive: "#f2a84a",
        emissiveIntensity: 0.3,
        opacity: 0.16
      })
    }).position(-7.8, -16.9, -13.2).scale([4.6, 0.1, 3.3]),
    primitives.sphere({ name: "salvage island foundation", material: ruinStone })
      .position(-7, -16.15, -13).scale([4.85, 0.58, 3.7]),
    ...(![]).map((fragment, index) => primitives.sphere({
      name: `salvage island submerged fragment ${index + 1}`,
      material: index % 2 === 0 ? ruinStone : ruinEdge
    }).position(fragment.x, fragment.y, fragment.z).scale([fragment.sx, 0.3 + (index % 3) * 0.08, fragment.sz])),
    ...([]),
    primitives.sphere({ name: "drowned chapel broad contact bed", material: sedimentMottles[0] })
      .position(-2.35, -14.66, -13.0).scale([5.2, 0.025, 3.65]),
    primitives.sphere({ name: "drowned chapel amber falloff", material: material.emissive({
      name: "drowned chapel amber falloff material", color: "#75501d", emissive: "#e8a64d", emissiveIntensity: 0.34, opacity: 0.16
    }) }).position(-4.6, -14.61, -13.0).scale([2.7, 0.018, 2.15]),
    primitives.sphere({ name: "drowned chapel cyan falloff", material: material.emissive({
      name: "drowned chapel cyan falloff material", color: "#145f60", emissive: "#55d8d2", emissiveIntensity: 0.3, opacity: 0.14
    }) }).position(-0.7, -14.6, -13.0).scale([3.4, 0.018, 2.5]),
    ...([]),
    primitives.box({ name: "salvage island west shelf", material: ruinEdge })
      .position(-10.1, -14.7, -13.4).scale([1.15, 2.9, 2.2]).rotate(0, 0.12, -0.16),
    primitives.box({ name: "salvage island east shelf", material: ruinEdge })
      .position(-3.9, -14.5, -12.4).scale([1.0, 2.6, 2.4]).rotate(0, -0.14, 0.12),
    primitives.box({ name: "salvage chapel lintel", material: ruinEdge })
      .position(-7, -9.8, -13.5).scale([3.7, 0.42, 0.5]),
    primitives.box({ name: "salvage chapel left pier", material: ruinStone })
      .position(-9.9, -11.9, -13.5).scale([0.46, 2.6, 0.58]),
    primitives.box({ name: "salvage chapel right pier", material: ruinStone })
      .position(-4.1, -11.9, -13.5).scale([0.46, 2.6, 0.58]),
    // Raised ruin decks cluster around the typed wreck to create a legible
    // settlement silhouette and warm focal rhythm from the review camera.
    // They are non-colliding environment dressing; the typed wreck remains
    // the primary-world landmark and reef.ts remains gameplay authority.
    ...[
      { x: -4.8, z: -13.0, sx: 1.25, sz: 1.05 },
      { x: -2.4, z: -13.0, sx: 1.05, sz: 1.05 },
      { x: -0.25, z: -13.0, sx: 0.9, sz: 1.05 },
      { x: 1.65, z: -13.0, sx: 0.78, sz: 1.05 },
      { x: -3.7, z: -10.9, sx: 0.95, sz: 0.82 },
      { x: -1.65, z: -10.9, sx: 0.82, sz: 0.82 },
      { x: 0.15, z: -10.9, sx: 0.7, sz: 0.82 },
      { x: -3.4, z: -15.1, sx: 0.9, sz: 0.76 },
      { x: -1.45, z: -15.1, sx: 0.82, sz: 0.76 },
      { x: 0.35, z: -15.1, sx: 0.72, sz: 0.76 }
    ].flatMap((deck, index) => [
      primitives.box({ name: `salvage settlement deck ${index + 1}`, material: index % 3 === 0 ? ruinDeckDark : ruinDeck })
        .position(deck.x, -14.9 + (index % 2) * 0.12, deck.z)
        .scale([deck.sx, 0.24, deck.sz]),
      primitives.sphere({ name: `salvage settlement lamp ${index + 1}`, material: ruinWindow })
        .position(deck.x + deck.sx * 0.55, -14.48, deck.z - deck.sz * 0.45)
        .scale(0.09 + (index % 2) * 0.025)
    ]),
    // A raised cross-plan ruin makes the location read as architecture from
    // the live overhead sonar lens: long nave, lateral transept, round tower,
    // and repeated roof ribs. These remain non-colliding 3D set dressing
    // around the typed wreck landmark.
    primitives.box({ name: "drowned chapel nave", material: ruinRoof })
      .position(-1.9, -14.28, -13.0).scale([4.15, 0.32, 1.18]),
    primitives.box({ name: "drowned chapel transept", material: ruinRoof })
      .position(-2.9, -14.14, -13.0).scale([1.08, 0.4, 3.05]),
    primitives.cylinder({ name: "drowned chapel tower", material: ruinEdge })
      .position(-5.25, -13.72, -13.0).scale([1.22, 0.9, 1.22]),
    primitives.torus({ name: "drowned chapel tower crown", material: ruinMapAmber })
      .position(-5.25, -12.78, -13.0).scale([1.28, 1.28, 0.16]).rotate(Math.PI / 2, 0, 0),
    ...[-4.4, -3.05, -1.7, -0.35, 1.0].map((x, index) => primitives.box({
      name: `drowned chapel roof rib ${index + 1}`,
      material: index % 2 === 0 ? ruinEdge : ruinDeck
    }).position(x, -13.9, -13.0).scale([0.1, 0.48, 1.34])),
    ...[-2.5, -1.05, 0.4].map((x, index) => primitives.sphere({
      name: `drowned chapel clerestory lamp ${index + 1}`,
      material: ruinWindow
    }).position(x, -13.62, -12.05).scale(0.18 + index * 0.015)),
    lights.point({ name: "drowned chapel nave cyan practical", color: "#72e4dd", intensity: 2.4})
      .position(-1.8, -11.8, -13.0),
    lights.point({ name: "drowned chapel tower amber practical", color: "#ffd27a", intensity: 2.8})
      .position(-5.25, -11.8, -13.0),
    lights.point({ name: "salvage settlement warm practical west", color: "#ffd27a", intensity: 2.2})
      .position(-3.8, -12.8, -12.2),
    lights.point({ name: "salvage settlement warm practical east", color: "#f6a84d", intensity: 1.8})
      .position(0.2, -13.0, -12.8),
    primitives.torus({
      name: "salvage chapel portal",
      material: material.emissive({ name: "salvage chapel portal glow", color: "#117d89", emissive: "#8ff7ee", emissiveIntensity: 0.75, opacity: 0.9 })
    }).position(-7, -11.7, -13.0).scale([1.55, 1.55, 0.1]).rotate(Math.PI / 2, 0, 0),
    ...[-9.35, -8.05, -6.75, -5.45, -4.15].map((x, index) => primitives.box({
      name: `salvage-island-window-${index}`,
      material: ruinWindow
    }).position(x, -13.2 + (index % 2) * 0.7, -11.15).scale([0.22, 0.36 + (index % 2) * 0.08, 0.07])),
    ...Array.from({ length: 24}, (_, index) => {
      const angle = (index / (24)) * Math.PI * 2 + (index % 3) * 0.12;
      const radius = 3.3 + (index % 4) * 0.42;
      return primitives.sphere({
        name: `salvage island false-star ${index + 1}`,
        material: index % 3 === 0 ? ruinMapAmber : ruinMapLine
      })
        .position(-2.5 + Math.cos(angle) * radius, -14.55 + (index % 4) * 0.12, -12.5 + Math.sin(angle) * radius)
        .scale(0.07 + (index % 3) * 0.035);
    })
  );

  // A compact, top-down salvage chart around the chapel landmark creates the
  // layered location read needed by the review frame. These are authored
  // renderer-owned wayfinding marks, not DOM overlays and not collision truth.
  if (true) nodes.push(
    primitives.torus({ name: "salvage island outer chart ring", material: ruinMapLine })
      .position(-7, -15.05, -13)
      .scale([4.35, 4.35, 0.08])
      .rotate(Math.PI / 2, 0, 0),
    primitives.torus({ name: "salvage island inner chart ring", material: ruinMapAmber })
      .position(-7, -14.98, -13)
      .scale([2.55, 2.55, 0.09])
      .rotate(Math.PI / 2, 0, 0),
    primitives.box({ name: "salvage island chart spine", material: ruinMapLine })
      .position(-7, -14.96, -13)
      .scale([0.07, 0.035, 4.25]),
    primitives.box({ name: "salvage island chart crossbar", material: ruinMapLine })
      .position(-7, -14.95, -13)
      .scale([4.25, 0.035, 0.07]),
    text3D("CHAPEL LIGHTS", {
      name: "salvage island chapel title",
      size: 0.42,
      depth: 0.028,
      letterSpacing: 0.022,
      material: ruinMapAmber,
      backend: "sdf"
    }).position(-10.35, -9.3, -13.65),
    ...[-9.95, -8.5, -7.05, -5.6, -4.15].map((x, index) => primitives.sphere({
      name: `salvage-island-chart-light-${index}`,
      material: ruinMapAmber
      }).position(x, -14.7 + (index % 2) * 0.12, -8.95).scale(0.12 + (index % 2) * 0.04))
  );

  // The review lens needs a designed water-column frame, not only a dark
  // basin viewed from above. These low-opacity caustic slashes, beacon pylons,
  // and suspended marker rings establish near/mid/far depth around the typed
  // sub and wreck while remaining ordinary renderer-owned scene geometry.
  

  return nodes;
}
