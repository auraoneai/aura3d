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

export function createNeonSwarmDistrictDressing(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  nodes.push(
    lights.ambient({
      name: "cyber-ambient",
      color: "#475569",
      intensity:  1.05
    }).toJSON(),
    lights.directional({
      name: "cyber-key-light",
      color: "#e0f2fe",
      intensity:  2.0
    }).position(8, 20, 8).toJSON(),
    lights.directional({
      name: "cyber-rim-light",
      color: "#f43f5e",
      intensity:  0.72
    }).position(-8, 16, -12).toJSON(),
    lights.point({
      name: "cyber-core-glow",
      color: "#38bdf8",
      intensity: 2.4
    }).position(0, 4.0, 0).toJSON()
  );

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
