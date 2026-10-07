/**
 * Cyberpunk Metropolis Environment for Neon Swarm.
 *
 * The route keeps its environment deliberately small: the typed arena model
 * and the instanced swarm own the frame, while this module contributes only
 * authored lighting and a few non-colliding street rails. The old full-city
 * graph was unreachable from the live route and added dozens of primitive
 * nodes to the static budget without improving the captured play view.
 */
import { primitives, material, lights, type AuraSceneNode } from "@aura3d/engine";

export function createNeonSwarmDistrictDressing(reviewCapture = false): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  nodes.push(
    lights.ambient({
      name: "cyber-ambient",
      color: "#475569",
      intensity: reviewCapture ? 0.82 : 1.05
    }).toJSON(),
    lights.directional({
      name: "cyber-key-light",
      color: "#e0f2fe",
      intensity: reviewCapture ? 1.72 : 2.0
    }).position(8, 20, 8).toJSON(),
    lights.directional({
      name: "cyber-rim-light",
      color: "#f43f5e",
      intensity: reviewCapture ? 1.08 : 0.72
    }).position(-8, 16, -12).toJSON(),
    lights.point({
      name: "cyber-core-glow",
      color: "#38bdf8",
      intensity: 2.4
    }).position(0, 4.0, 0).toJSON()
  );

  if (reviewCapture) {
    // The exact finale needs one cohesive survival arena, not a street-grid
    // graph. Low-profile arms establish a restrained center vortex without
    // impersonating combat or simulation state.
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

  // Normal play uses a compact authored street language around the typed
  // props and instanced swarm. Keeping these rails in one small branch leaves
  // negative space for individual threat silhouettes and keeps the route's
  // measured draw budget honest.
  nodes.push(
    primitives.box({
      name: "compact wet street slab",
      material: material.pbr({ name: "compact wet street material", color: "#10232d", roughness: 0.48, metallic: 0.26 })
    }).position(0, -0.03, 2).scale([25, 0.05, 17]).toJSON(),
    primitives.box({
      name: "compact north route rail",
      material: material.emissive({ name: "compact north rail material", color: "#143e49", emissive: "#35e6ff", emissiveIntensity: 0.34 })
    }).position(0, 0.08, -13.2).scale([25, 0.08, 0.16]).toJSON(),
    primitives.box({
      name: "compact south route rail",
      material: material.emissive({ name: "compact south rail material", color: "#4b183d", emissive: "#ff4fd8", emissiveIntensity: 0.3 })
    }).position(0, 0.08, 17.2).scale([25, 0.08, 0.16]).toJSON(),
    primitives.box({
      name: "compact west route rail",
      material: material.emissive({ name: "compact west rail material", color: "#143e49", emissive: "#35e6ff", emissiveIntensity: 0.24 })
    }).position(-25.2, 0.08, 2).scale([0.16, 0.08, 15.2]).toJSON(),
    primitives.box({
      name: "compact east route rail",
      material: material.emissive({ name: "compact east rail material", color: "#4b183d", emissive: "#ff4fd8", emissiveIntensity: 0.24 })
    }).position(25.2, 0.08, 2).scale([0.16, 0.08, 15.2]).toJSON()
  );
  return nodes;
}
