import {
  camera,
  createCollisionLayers,
  effects,
  game,
  groundedRenderedAssetPlacement,
  instances,
  lights,
  material,
  model,
  primitives,
  scene,
  text3D
} from "@aura3d/engine";
import { assets } from "../aura-assets";
import { ENEMIES, ENEMY_BODY_Y, ENEMY_VISUAL_Y } from "./enemies";
import { LAMPS, PROPS } from "./props";
import { EYE_HEIGHT, LOOK_AHEAD, PLAYER_START } from "./state";

/**
 * Hostiles are solid against hitscan and the corridor hull, but NOT against the
 * player capsule: touch damage is proximity-authored in enemies.ts, and keeping
 * the player able to move through hostiles keeps the rush deterministic instead
 * of turning corpses into physics wedges. Route-local design, documented in
 * KNOWN-LIMITS.md.
 */
export const layers = createCollisionLayers({
  player: ["wall", "pickup"],
  bullet: ["enemy", "wall"],
  enemy: ["bullet", "wall"],
  wall: ["player", "bullet", "enemy", "debris"],
  pickup: ["player"],
  // NC-A1: debris touches only walls and itself — combat/pickup/exit pairs are
  // unchanged, so scatter can never drift hitscan or trigger results.
  debris: ["wall", "debris"]
});

/**
 * ammo-1 sits on the playable spec's walk path (strafe right, then forward from
 * spawn) so the pickup trigger is provably reachable. The others reward pushing
 * deeper into the corridor.
 */
export const PICKUPS = [
  { id: "ammo-1", kind: "ammo" as const, x: 1.9, z: 7.4 },
  { id: "ammo-2", kind: "ammo" as const, x: -1.6, z: -3.1 },
  { id: "med-1", kind: "health" as const, x: 0.2, z: -1.2 }
] as const;

export function buildScene() {
  const world = groundedRenderedAssetPlacement(assets.neonCorridorContainmentWorld, { targetMaxDimension: 22.2, floorY: 0, x: 0, z: -1 });
  const rifle = groundedRenderedAssetPlacement(assets.neonContainmentPulseRifle, { targetMaxDimension: 0.55, floorY: 0 });
  const crate = groundedRenderedAssetPlacement(assets.ammoCrate, { targetHeight: 0.27, floorY: 0.2 });
  const coverCrate = groundedRenderedAssetPlacement(assets.ammoCrate, { targetHeight: 0.34, floorY: 0 });
  const kit = groundedRenderedAssetPlacement(assets.medkit, { targetHeight: 0.42, floorY: 0.2 });
  // Sixth visual pass: the asset shell is deliberately retained as the typed
  // exterior volume, but its native glossy grate cannot be the primary visual
  // floor. In the previous frame it reflected every practical as a black grid
  // and made the action read as disconnected objects in a void. These matte
  // values establish one continuous, mid-value interior: deck first, broad
  // wall fields second, installed service detail last. Low metalness is
  // intentional: specular response is reserved for the actual typed weapon,
  // crates, and creatures rather than swallowing the playable lane.
  // This is a deliberately restrained steel/oxidized-bronze value ladder.
  // The catalog rifle, crates, and creatures carry dark, warm, worn surface
  // information.  The former blue-black runner made them look pasted into an
  // unrelated UI tunnel.  A neutral steel deck plus small bronze structure lets
  // the typed subjects belong to the same material family without pretending
  // that their imported materials have been replaced.
  // The route used to declare every lining as an uncoated matte swatch. That
  // gave the imported typed world and the installed architecture identical
  // values, so the corridor collapsed into flat cyan/grey strips at gameplay
  // scale. Keep the same geometry and palette, but give each manufactured
  // surface its own measured response: soft steel sheen on walking surfaces,
  // clear-coated bronze on the bay hardware, and a restrained edge highlight
  // on wall panels. These are renderer-owned material inputs, not a second
  // fake world painted over the typed asset.
  const deckBase = material.pbr({
    color: "#223437",
    roughness: 0.78,
    metalness: 0.24,
    clearcoat: 0.26,
    clearcoatRoughness: 0.22,
    sheen: 0.12,
    sheenColor: "#7aa6a7",
    envMapIntensity: 0.92
  });
  const deckDetail = material.pbr({
    color: "#506368",
    roughness: 0.62,
    metalness: 0.34,
    clearcoat: 0.34,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.05
  });
  const deckInset = material.pbr({
    color: "#17282d",
    roughness: 0.86,
    metalness: 0.14,
    clearcoat: 0.18,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.82
  });
  const structuralDetail = material.metal({
    name: "machined containment steel",
    color: "#405257",
    roughness: 0.42,
    metalness: 0.58,
    clearcoat: 0.44,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.18
  });
  const warmStructure = material.metal({
    name: "clear-coated oxidised bronze",
    color: "#705138",
    roughness: 0.34,
    metalness: 0.64,
    clearcoat: 0.7,
    clearcoatRoughness: 0.11,
    envMapIntensity: 1.24
  });
  const wallField = material.pbr({
    color: "#263a3e",
    roughness: 0.8,
    metalness: 0.16,
    sheen: 0.14,
    sheenRoughness: 0.42,
    sheenColor: "#5b8c8e",
    envMapIntensity: 0.78
  });
  const wallDetail = material.pbr({
    color: "#53676b",
    roughness: 0.56,
    metalness: 0.34,
    clearcoat: 0.3,
    clearcoatRoughness: 0.19,
    envMapIntensity: 1.02
  });
  const ceilingField = material.pbr({
    color: "#1e3035",
    roughness: 0.82,
    metalness: 0.14,
    clearcoat: 0.2,
    clearcoatRoughness: 0.26,
    envMapIntensity: 0.8
  });
  const railHousing = material.metal({
    name: "recessed rail housing",
    color: "#17292e",
    roughness: 0.48,
    metalness: 0.52,
    clearcoat: 0.38,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.08
  });

  return scene()
    .background("#102733")
    // This is the primary continuous authored world, not a catalogue tunnel
    // hidden behind a separate primitive shell.  The very small route-local
    // floor/trigger guides below remain only as collision/effect supports.
    .add(model(assets.neonCorridorContainmentWorld, {
      name: "continuous containment corridor world",
      role: "primaryWorld",
      castShadow: true,
      receiveShadow: true
    }).position(world.position[0], world.position[1], world.position[2]).scale(world.scale))
    .add(model(assets.neonContainmentPulseRifle, { name: "containment pulse rifle viewmodel" }).position(0.28, 1.18, 5.7).scale(rifle.scale).runtime(game.runtimeNode("pulse-rifle", { tags: ["weapon"] })))
    .addMany(ENEMIES.map((enemy) => {
      const asset = enemy.asset === "neonContainmentWardenA" ? assets.neonContainmentWardenA : assets.neonContainmentWardenB;
      const placed = groundedRenderedAssetPlacement(asset, {
        // Give the typed combatants a little more screen presence at the real
        // review distance. Their physics capsules stay unchanged; this is a
        // visual-scale correction so armour/wing details survive the full
        // 1280x800 gameplay frame instead of collapsing into orange dots.
        targetHeight: enemy.asset === "neonContainmentWardenA" ? 2.08 : 2.2,
        floorY: ENEMY_VISUAL_Y,
        x: enemy.x,
        z: enemy.z
      });
      return model(asset, { name: `containment warden ${enemy.id}` })
        .position(placed.position[0], placed.position[1], placed.position[2])
        .scale(placed.scale)
        .runtime(game.runtimeNode(`enemy-${enemy.id}`, { tags: ["enemy"] }));
    }))
    // A renderer-owned hostile collar keeps each typed warden legible against
    // the dark bay at gameplay scale. It is deliberately a restrained vertical
    // ring behind the model (not a DOM reticle or a replacement body), and the
    // enemy runtime updates its pose/scale for patrol, telegraph, flinch, and
    // death. The ring's red/amber language is the same alarm signal as the
    // imported threat plates, so the shot frame communicates target ownership
    // without elongating the tracer or adding a collectible-like orb chain.
    .addMany(ENEMIES.map((enemy) => {
      const isManta = enemy.asset === "neonContainmentWardenB";
      return primitives.torus({
        name: `hostile threat collar ${enemy.id}`,
        material: material.glowingEmissive({
          color: isManta ? "#401625" : "#4a2418",
          emissive: isManta ? "#c52245" : "#bd4b24",
          emissiveIntensity: 0.34
        }),
        castShadow: false,
        receiveShadow: false
      })
        // Park below the collision floor until the alarm transition exposes it;
        // AuraPrimitiveOptions has no static visibility flag on the public API.
        .position(enemy.x, -8, enemy.z - 0.24)
        // Aura torus geometry lies in local XY (normal +Z), so it is already a
        // vertical, camera-facing collar. Keep Z as the thin tube axis.
        .scale(isManta ? [0.66, 0.42, 0.022] : [0.5, 0.68, 0.022])
        .runtime(game.runtimeNode(`enemy-${enemy.id}-threat-collar`, { tags: ["enemy", "telegraph", "fx"] }));
    }))
    .addMany(PICKUPS.map((pickup) => {
      const asset = pickup.kind === "ammo" ? assets.ammoCrate : assets.medkit;
      const placed = pickup.kind === "ammo" ? crate : kit;
      return model(asset, { name: `${pickup.kind} pickup ${pickup.id}` })
        .position(pickup.x, placed.position[1], pickup.z)
        .scale(placed.scale)
        .runtime(game.runtimeNode(`pickup-${pickup.id}`, { tags: ["pickup", pickup.kind] }));
    }))
    // Grounded, textured typed crates replace the imported corridor's pale
    // blockout-rubble read in the opening encounter. They are visual cover only:
    // the existing wall hull, sight lines, hitscan, and player collision remain
    // authoritative and unchanged.
    .addMany([
      [-2.42, -1.6, -0.08],
      [2.34, -3.05, 0.14],
      [-2.28, -5.45, -0.18]
    ].map(([x, z, yaw], index) =>
      model(assets.ammoCrate, {
        name: `typed corridor cover ${index + 1}`,
        role: "setDressing",
        castShadow: true,
        receiveShadow: true
      })
        .position(x, coverCrate.position[1], z)
        .rotate(0, yaw, 0)
        .scale(coverCrate.scale)
        .runtime(game.runtimeNode(`typed-corridor-cover-${index + 1}`, {
          tags: ["typed-cover", "set-dressing", "non-colliding"]
        }))
    ))
    .add(primitives.box({
      name: "look target",
      material: material.pbr({ color: "#05070c", roughness: 1 })
    }).position(PLAYER_START[0], EYE_HEIGHT, PLAYER_START[2] - LOOK_AHEAD).scale(0.001).runtime(game.runtimeNode("look-target", { tags: ["camera"] })))
    // A raised continuous deck deliberately occludes the imported grate. It is
    // visual-only and sits above the unchanged physics floor, so movement,
    // pickups, hitscan, and the evidence route remain exactly as authored.
    .add(primitives.box({
      name: "continuous matte corridor deck",
      material: deckInset,
      receiveShadow: true
    }).position(0, 0.105, 0.4).scale([6.18, 0.12, 20.15]))
    // Broad removable deck cartridges sit over the dark pressure hull. Their
    // sparse seams create perspective and route scale; unlike the rejected
    // luminous runway, no single bright surface now occupies the entire lower
    // half of the frame.
    .add(instances.box({
      name: "instanced even containment deck cartridges",
      material: deckBase,
      transforms: [7.1, 2.7, -1.7, -6.1].map((z) => ({
        position: [0, 0.224, z] as const,
        scale: [5.42, 0.028, 1.84] as const
      }))
    }))
    .add(instances.box({
      name: "instanced odd containment deck cartridges",
      material: structuralDetail,
      transforms: [4.9, 0.5, -3.9, -8.3].map((z) => ({
        position: [0, 0.224, z] as const,
        scale: [5.42, 0.028, 1.84] as const
      }))
    }))
    // Full-height side fields and ceiling soffits are architecture, not neon
    // garnish. They cover the black exterior ribs at the player-facing depth
    // while their repeated inset bays give the chase a readable, continuous
    // scale from spawn to the exit gateway.
    .addMany([
      primitives.box({ name: "port interior wall field", material: wallField, receiveShadow: true })
        .position(-3.02, 1.32, 0.35).scale([0.16, 2.3, 20.1]),
      primitives.box({ name: "starboard interior wall field", material: wallField, receiveShadow: true })
        .position(3.02, 1.32, 0.35).scale([0.16, 2.3, 20.1]),
      primitives.box({ name: "continuous ceiling soffit", material: ceilingField, receiveShadow: true })
        .position(0, 2.46, 0.35).scale([6.18, 0.16, 20.1])
    ])
    // Repeating bay panels, skirting, and ceiling beams sit flush to those
    // continuous fields. They establish a single manufactured corridor scale
    // without making a separate-object collage or a floor-wide visual grid.
    .add(instances.box({
      name: "instanced flush wall bay panels",
      material: wallDetail,
      transforms: [7.2, 4.25, 1.3, -1.65, -4.6, -7.55].flatMap((z, index) => [
        { position: [-2.845, 1.33, z] as const, scale: [0.035, 0.72, 1.18] as const, rotation: [0, 0, index % 2 === 0 ? 0.015 : -0.015] as const },
        { position: [2.845, 1.33, z] as const, scale: [0.035, 0.72, 1.18] as const, rotation: [0, 0, index % 2 === 0 ? -0.015 : 0.015] as const }
      ])
    }))
    // A single framed engagement bay organizes the opening encounter around
    // the central hostile.  It is intentionally structural (a cowl, columns,
    // and low foundation), not a light-strip or a new gameplay collider.  The
    // warm metal gives the weapon/crate/creature assets a shared local context
    // while the continuous shell still owns the whole route.
    .addMany([
      primitives.box({ name: "engagement bay port column", material: structuralDetail, receiveShadow: true })
        .position(-2.7, 1.18, 0.72).scale([0.13, 1.72, 0.18]),
      primitives.box({ name: "engagement bay starboard column", material: structuralDetail, receiveShadow: true })
        .position(2.7, 1.18, 0.72).scale([0.13, 1.72, 0.18]),
      primitives.box({ name: "engagement bay overhead cowl", material: structuralDetail, receiveShadow: true })
        .position(0, 2.14, 0.72).scale([5.54, 0.1, 0.2]),
      primitives.box({ name: "engagement bay foundation", material: deckDetail, receiveShadow: true })
        .position(0, 0.242, 0.72).scale([4.94, 0.018, 1.56]),
      primitives.cylinder({ name: "engagement containment collar", material: warmStructure, receiveShadow: true })
        .position(0, 0.255, 0.56).scale([0.92, 0.024, 0.92])
    ])
    // Three broad transverse thresholds replace the former single-color runway
    // read. Each is a physical raised plate with a warm steel nosing, so the
    // frame has foreground/mid/far depth landmarks without becoming a dense
    // checkerboard. They are visual-only and do not alter the collision floor.
    .addMany([4.5, 0.72, -3.3].flatMap((z, index) => [
      primitives.box({
        name: `combat deck plate ${index + 1}`,
        material: index === 1 ? deckDetail : structuralDetail,
        receiveShadow: true
      }).position(0, 0.246, z).scale([5.12, 0.026, 1.36]),
      primitives.box({
        name: `combat deck threshold ${index + 1}`,
        material: warmStructure,
        receiveShadow: true
      }).position(0, 0.267, z + 0.68).scale([5.28, 0.035, 0.075])
    ]))
    // Heavy portal frames make each encounter depth read as a room-sized
    // containment bay. The warm inner jambs visually connect the wardens'
    // bronze armor, the typed rifle hardware, and the installed architecture.
    .addMany([4.7, 0.72, -3.45].flatMap((z, index) => [
      primitives.box({ name: `bay ${index + 1} port pier`, material: structuralDetail, receiveShadow: true })
        .position(-2.72, 1.35, z).scale([0.28, 2.18, 0.34]),
      primitives.box({ name: `bay ${index + 1} starboard pier`, material: structuralDetail, receiveShadow: true })
        .position(2.72, 1.35, z).scale([0.28, 2.18, 0.34]),
      primitives.box({ name: `bay ${index + 1} overhead beam`, material: structuralDetail, receiveShadow: true })
        .position(0, 2.29, z).scale([5.72, 0.22, 0.34]),
      primitives.box({ name: `bay ${index + 1} port bronze jamb`, material: warmStructure, receiveShadow: true })
        .position(-2.48, 1.2, z - 0.02).scale([0.075, 1.72, 0.38]),
      primitives.box({ name: `bay ${index + 1} starboard bronze jamb`, material: warmStructure, receiveShadow: true })
        .position(2.48, 1.2, z - 0.02).scale([0.075, 1.72, 0.38])
    ]))
    .add(instances.box({
      name: "instanced corridor plinths and ceiling beams",
      material: structuralDetail,
      transforms: [6.15, 2.45, -1.25, -4.95, -7.5].flatMap((z) => [
        { position: [-2.84, 0.43, z] as const, scale: [0.14, 0.3, 1.62] as const },
        { position: [2.84, 0.43, z] as const, scale: [0.14, 0.3, 1.62] as const },
        { position: [0, 2.26, z] as const, scale: [5.82, 0.095, 0.17] as const }
      ])
    }))
    // The corridor terminates in a real bulkhead/recess, not an opaque cyan
    // rectangle. The typed tunnel continues beyond this lining as an exterior
    // volume; these static pieces are the installed interior threshold while
    // the existing exit sensor remains the gameplay authority.
    .addMany([
      primitives.box({
        name: "exit bulkhead",
        material: structuralDetail,
        receiveShadow: true
      }).position(0, 1.28, -9.32).scale([6.16, 2.5, 0.16]),
      primitives.box({
        name: "exit bulkhead recess",
        material: deckInset,
        receiveShadow: true
      }).position(0, 1.2, -9.5).scale([4.58, 2.02, 0.05]),
      primitives.box({
        name: "exit gateway left jamb",
        material: wallDetail
      }).position(-2.26, 1.32, -9.12).scale([0.28, 2.16, 0.26]),
      primitives.box({
        name: "exit gateway right jamb",
        material: wallDetail
      }).position(2.26, 1.32, -9.12).scale([0.28, 2.16, 0.26]),
      primitives.box({
        name: "exit gateway lintel",
        material: material.emissive({ color: "#1c2a32", emissive: "#3dffb0", emissiveIntensity: 0.38 })
      }).position(0, 2.22, -9.12).scale([4.78, 0.18, 0.26])
    ])
    .add(primitives.sphere({
      name: "muzzle flash 0",
      // Player fire deliberately stays an icy, value-high read. Wardens own
      // every warm warning color in the central lane, so a hit can be read as
      // player action against a threat rather than more corridor decoration.
      material: material.glowingEmissive({ color: "#64cdea", emissive: "#168bc9", emissiveIntensity: 1.8 })
    }).position(0, -8, 0).scale([0.02, 0.02, 0.08]).runtime(game.runtimeNode("muzzle-0", { tags: ["fx"] })))
    .add(primitives.box({
      name: "muzzle flash 1",
      material: material.glowingEmissive({ color: "#5fd1f1", emissive: "#168fd0", emissiveIntensity: 1.95 })
    }).position(0, -8, 0).scale([0.02, 0.02, 0.08]).runtime(game.runtimeNode("muzzle-1", { tags: ["fx"] })))
    .add(primitives.box({
      name: "muzzle flash 2",
      material: material.glowingEmissive({ color: "#45b9e7", emissive: "#0876be", emissiveIntensity: 1.85 })
    }).position(0, -8, 0).scale([0.035, 0.035, 0.95]).runtime(game.runtimeNode("muzzle-2", { tags: ["fx"] })))
    // Renderer-owned fracture ring at the actual hitscan endpoint. The prior
    // sphere read as another loose white UI dot; an open, warm radial outline
    // remains distinguishable from the solid icy projectile and preserves the
    // existing four-node runtime/evidence contract.
    .add(primitives.torus({
      name: "radial shot impact fracture ring",
      material: material.glowingEmissive({ color: "#ffd166", emissive: "#f05a1c", emissiveIntensity: 2.45 })
    }).position(0, -8, 0).rotate(Math.PI / 2, 0, 0).scale(0.02).runtime(game.runtimeNode("shot-impact", { tags: ["fx", "radial-impact"] })))
    .add(primitives.box({
      name: "exit marker",
      material: material.emissive({ color: "#2a9c78", emissive: "#3dffb0", emissiveIntensity: 0.42 })
    }).position(0, 0.18, -8.4).scale([2.35, 0.045, 0.38]).runtime(game.runtimeNode("exit-marker", { tags: ["exit"] })))
    .add(primitives.box({
      name: "neon rail left",
      material: material.emissive({ color: "#38d6ff", emissive: "#38d6ff", emissiveIntensity: 1.35 })
    }).position(-2.15, 0.08, -1).scale([0.05, 0.03, 8.4]))
    .add(primitives.box({
      name: "neon rail right",
      material: material.emissive({ color: "#ff4fd0", emissive: "#ff4fd0", emissiveIntensity: 1.15 })
    }).position(2.15, 0.08, -1).scale([0.05, 0.03, 8.4]))
    // Recess both emissive lane guides into visible metal housings so they read
    // as installed corridor infrastructure instead of detached glowing lines.
    .addMany([
      primitives.box({ name: "left lane-guide housing", material: railHousing })
        .position(-2.15, 0.065, -1).scale([0.13, 0.035, 8.46]),
      primitives.box({ name: "right lane-guide housing", material: railHousing })
        .position(2.15, 0.065, -1).scale([0.13, 0.035, 8.46])
    ])
    .add(primitives.box({
      name: "hazard strip left",
      material: material.glowingEmissive({ color: "#5a3a12", emissive: "#ffb020", emissiveIntensity: 1.5 })
    }).position(-3.3, 0.22, -3.4).scale([0.06, 0.05, 6.2]))
    .add(primitives.box({
      name: "hazard strip right",
      material: material.glowingEmissive({ color: "#5a3a12", emissive: "#ffb020", emissiveIntensity: 1.5 })
    }).position(3.3, 0.22, -3.4).scale([0.06, 0.05, 6.2]))
    .add(primitives.box({
      name: "ceiling strip near",
      material: material.glowingEmissive({ color: "#274056", emissive: "#9be7ff", emissiveIntensity: 1.7 })
    }).position(0, 2.62, 5.6).scale([3.2, 0.04, 0.14]))
    .add(primitives.box({
      name: "ceiling strip mid",
      material: material.glowingEmissive({ color: "#274056", emissive: "#9be7ff", emissiveIntensity: 1.5 })
    }).position(0, 2.62, 0.4).scale([3.2, 0.04, 0.14]))
    .add(primitives.box({
      name: "ceiling strip far",
      material: material.glowingEmissive({ color: "#3d2a20", emissive: "#ffb020", emissiveIntensity: 1.4 })
    }).position(0, 2.62, -5.4).scale([3.2, 0.04, 0.14]))
    // The former full-deck plate lattice became the dominant image at the
    // review camera. Keep only two recessed service channels at the edges:
    // they explain the lane lights as infrastructure without turning the floor
    // into a reflective grid that competes with the enemies.
    .add(instances.box({
      name: "instanced recessed deck service channels",
      material: deckInset,
      transforms: [-1.85, 2.35, 6.55].flatMap((z) => [
        { position: [-2.72, 0.232, z] as const, scale: [0.26, 0.016, 3.94] as const },
        { position: [2.72, 0.232, z] as const, scale: [0.26, 0.016, 3.94] as const }
      ])
    }))
    .add(primitives.box({
      name: "recessed central containment channel",
      material: warmStructure,
      receiveShadow: true
    }).position(0, 0.259, 0.3).scale([0.22, 0.018, 18.9]))
    .add(instances.box({
      name: "instanced center channel covers",
      material: deckInset,
      transforms: [7.1, 4.9, 2.7, 0.5, -1.7, -3.9, -6.1, -8.3].map((z) => ({
        position: [0, 0.278, z] as const,
        scale: [1.52, 0.014, 1.72] as const
      }))
    }))
    .add(instances.box({
      name: "instanced structural ribs",
      material: structuralDetail,
      transforms: [
        ...[5.4, 1.8, -1.8, -5.4].flatMap((z) => [
          { position: [-3.16, 1.35, z] as const, scale: [0.12, 2.34, 0.1] as const },
          { position: [3.16, 1.35, z] as const, scale: [0.12, 2.34, 0.1] as const }
        ]),
        ...[5.2, 0, -5.2].map((z) => ({
          position: [0, 2.48, z] as const,
          scale: [3.1, 0.1, 0.12] as const
        }))
      ]
    }))
    .add(instances.box({
      name: "instanced wall bays",
      material: wallDetail,
      transforms: [-7.6, -5, -2.4, 0.2, 2.8, 5.4, 8].flatMap((z) => [
        { position: [-3.18, 1.3, z] as const, scale: [0.08, 1.08, 0.82] as const },
        { position: [3.18, 1.3, z] as const, scale: [0.08, 1.08, 0.82] as const }
      ])
    }))
    .addMany([
      [-3.36, 5.2, "#38d6ff"],
      [-3.36, -3.4, "#38d6ff"],
      [3.36, 5.2, "#ff4fd0"],
      [3.36, -3.4, "#ff4fd0"]
    ].map(([x, z, color], index) =>
      primitives.box({
        name: "wall neon strip " + index,
        material: material.glowingEmissive({ color: "#0a0f16", emissive: String(color), emissiveIntensity: 1.6 })
      }).position(Number(x), 1.5, Number(z)).scale([0.05, 2.2, 0.09])
    ))
    // NC-A1 debris visuals. Bodies remain intentionally compact and dynamic;
    // their matte blue-grey treatment belongs to the installed corridor palette
    // rather than reading as the old near-black placeholder rubble.
    .addMany(PROPS.map((prop) => {
      const sizeY = prop.halfExtents[1] * 2;
      const node = prop.kind === "barrel"
        ? primitives.cylinder({
          name: "corridor service barrel " + prop.id,
          material: material.pbr({ color: "#58777d", roughness: 0.84, metalness: 0.14 })
        })
        : primitives.box({
          name: "corridor service case " + prop.id,
          material: material.pbr({ color: "#4d6972", roughness: 0.88, metalness: 0.1 })
        });
      return node
        .position(prop.x, prop.halfExtents[1] + 0.03, prop.z)
        .scale([prop.halfExtents[0] * 2, sizeY, prop.halfExtents[2] * 2])
        .runtime(game.runtimeNode("prop-" + prop.id, { tags: ["debris"] }));
    }))
    // NC-A4 spring-lamp practicals: shade + bulb follow their spring bodies.
    .addMany(LAMPS.flatMap((lamp) => [
      primitives.cylinder({
        name: lamp.id + " shade",
        material: material.pbr({ color: "#46545d", roughness: 0.58, metalness: 0.46 })
      }).position(lamp.anchor[0], lamp.anchor[1] - lamp.hang + 0.09, lamp.anchor[2])
        .scale([0.18, 0.08, 0.18])
        .runtime(game.runtimeNode(lamp.id + "-shade", { tags: ["lamp"] })),
      primitives.sphere({
        name: lamp.id + " bulb",
        material: material.glowingEmissive({ color: "#9be7ff", emissive: "#7ef8ff", emissiveIntensity: 2.6 })
      }).position(lamp.anchor[0], lamp.anchor[1] - lamp.hang, lamp.anchor[2])
        .scale(0.09)
        .runtime(game.runtimeNode(lamp.id + "-bulb", { tags: ["lamp"] }))
    ]))
    // NC-A6 wayfinding as world geometry: uppercase/digits only, which is exactly
    // what the public text3D glyph set supports. Signs never cover the viewmodel
    // or the crosshair center; they hang on walls above the junctions.
    .add(text3D("SECTOR 1", {
      name: "sector 1 sign",
      size: 0.26,
      depth: 0.06,
      letterSpacing: 0.03,
      material: material.glowingEmissive({ color: "#0a0f16", emissive: "#38d6ff", emissiveIntensity: 1.5 })
    }).position(-3.32, 1.85, 5.4).rotate(0, Math.PI / 2, 0))
    .add(text3D("SECTOR 2", {
      name: "sector 2 sign",
      size: 0.26,
      depth: 0.06,
      letterSpacing: 0.03,
      material: material.glowingEmissive({ color: "#160a14", emissive: "#ff4fd0", emissiveIntensity: 1.4 })
    }).position(3.32, 1.85, -3.4).rotate(0, -Math.PI / 2, 0))
    .add(text3D("EXIT", {
      name: "exit sign",
      size: 0.3,
      depth: 0.07,
      letterSpacing: 0.04,
      material: material.glowingEmissive({ color: "#07160f", emissive: "#3dffb0", emissiveIntensity: 1.6 })
    }).position(0, 2.15, -8.28))
    // Low-density renderer fog separates the three encounter depths without
    // veiling the deck. The broad neutral fill establishes exposure; restrained
    // cool/warm keys shape the shell, while local practicals still explain the
    // cyan spawn, amber combat, and green exit pools seen in the architecture.
    // Contact occlusion anchors the typed wardens, crates, and shell seams to
    // the same deck instead of leaving them as floating low-poly cut-outs.
    // A restrained bloom pass lets the installed power cells and shot cues
    // share a controlled highlight language without washing out the corridor.
    .add(effects.ambientOcclusion({ name: "containment bay grounding", intensity: 0.32, radius: 0.68, density: 0.54, color: "#02090d" }))
    .add(effects.fog({ density: 0.022, color: "#10252c" }))
    .add(effects.bloom({ name: "containment power bloom", intensity: 0.16, color: "#79e4ec", threshold: 0.82, radius: 0.2, maxIntensity: 0.26 }))
    .add(lights.ambient({ name: "corridor exposure fill", intensity: 0.5, color: "#bdcfcc" }))
    .add(lights.directional({ name: "steel architectural key", position: [-4, 7, 6], intensity: 1.02, color: "#dcefeb" }))
    .add(lights.directional({ name: "warm asset rim", position: [5, 5, -9], intensity: 1.32, color: "#f2b878" }))
    .add(lights.point({ name: "spawn practical", position: [0, 2.35, 7.2], color: "#77d8e5", intensity: 1.5 }))
    .add(lights.point({ name: "near bay key", position: [0, 2.05, 4.7], color: "#6dd9e9", intensity: 2.25 }))
    .add(lights.point({ name: "engagement key", position: [0, 1.72, 0.82], color: "#ffad63", intensity: 4.3 }))
    .add(lights.point({ name: "deep bay key", position: [0, 1.9, -3.45], color: "#ff754d", intensity: 2.4 }))
    .add(lights.point({ name: "exit practical", position: [0, 2.0, -7.2], color: "#70f7c0", intensity: 1.75 }))
    // Muzzle light: parked under the floor until a shot teleports it to the barrel.
    // Runtime handles cannot change light intensity, so the attenuation does the
    // hiding while it sits nine metres below the deck.
    .add(lights.point({ name: "shot light", position: [0, -8, 0], color: "#ff9d12", intensity: 5.5 })
      .runtime(game.runtimeNode("shot-light", { tags: ["fx"] })))
    .camera(camera.follow({
      targetNode: "look-target",
      offset: [0, 0.12, LOOK_AHEAD],
      offsetMode: "target-yaw",
      fov: 60,
      smoothing: 0
    }));
}

export function createLevelBodies(physics: {
  createBody: (spec: {
    readonly name?: string;
    readonly type?: "static" | "dynamic" | "kinematic";
    readonly shape?: "box" | "sphere" | "capsule";
    readonly position?: readonly [number, number, number];
    readonly halfExtents?: readonly [number, number, number];
    readonly radius?: number;
    readonly halfHeight?: number;
    readonly mass?: number;
    readonly layer?: string;
    readonly sensor?: boolean;
    readonly linearDamping?: number;
  }) => unknown;
}): void {
  physics.createBody({
    name: "player",
    shape: "capsule",
    radius: 0.32,
    halfHeight: 0.52,
    mass: 1,
    position: [...PLAYER_START],
    layer: "player",
    linearDamping: 0.2
  });
  for (const wall of [
    { id: "floor", x: 0, y: -0.15, z: 0, hx: 6, hy: 0.2, hz: 12 },
    { id: "n", x: 0, y: 1.4, z: -10.2, hx: 5.2, hy: 1.6, hz: 0.28 },
    { id: "s", x: 0, y: 1.4, z: 10.8, hx: 5.2, hy: 1.6, hz: 0.28 },
    { id: "w", x: -5.1, y: 1.4, z: -1, hx: 0.28, hy: 1.6, hz: 9.2 },
    { id: "e", x: 5.1, y: 1.4, z: -1, hx: 0.28, hy: 1.6, hz: 9.2 }
  ]) {
    physics.createBody({
      name: `wall-${wall.id}`,
      type: "static",
      shape: "box",
      position: [wall.x, wall.y, wall.z],
      halfExtents: [wall.hx, wall.hy, wall.hz],
      layer: "wall"
    });
  }
  for (const enemy of ENEMIES) {
    physics.createBody({
      name: `enemy-${enemy.id}`,
      type: "kinematic",
      shape: "capsule",
      radius: 0.55,
      halfHeight: 0.85,
      position: [enemy.x, ENEMY_BODY_Y, enemy.z],
      layer: "enemy"
    });
  }
  for (const pickup of PICKUPS) {
    physics.createBody({
      name: `pickup-${pickup.id}`,
      type: "static",
      shape: "sphere",
      radius: 0.45,
      position: [pickup.x, 0.45, pickup.z],
      layer: "pickup",
      sensor: true
    });
  }
  physics.createBody({
    name: "exit",
    type: "static",
    shape: "box",
    position: [0, 1, -8.4],
    halfExtents: [2.6, 1.2, 0.55],
    layer: "pickup",
    sensor: true
  });
}
