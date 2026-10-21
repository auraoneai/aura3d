// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraPrimitiveOptions, AuraPrimitiveNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { geometry } from "./geometry.js";
import { instances } from "./instances.js";
import { material } from "./material.js";
import { physics } from "./physics.js";
import { text3D } from "./text3d.js";

export function primitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraPrimitiveOptions = {}): AuraNodeBuilder<AuraPrimitiveNode> {
  return new AuraNodeBuilder({
    kind: "primitive",
    primitive: primitiveName,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    material: options.material,
    size: options.size,
    castShadow: options.castShadow ?? (primitiveName !== "plane" && options.material?.emissive === undefined),
    receiveShadow: options.receiveShadow ?? true,
    physics: options.physics,
    instances: options.instances,
    instanceColors: options.instanceColors,
    geometry: options.geometry,
    // threejs-parity SG-03 (L2): per-kind generator params (radius, segments,
    // theta/phi ranges, path/points/shape, bevel, p/q, detail, variant...).
    params: options.params,
    text3D: options.text3D,
    lod: options.lod
  });
}

export const primitives = {
  box: (options?: AuraPrimitiveOptions) => primitive("box", options),
  sphere: (options?: AuraPrimitiveOptions) => primitive("sphere", options),
  plane: (options?: AuraPrimitiveOptions) => primitive("plane", options),
  cylinder: (options?: AuraPrimitiveOptions) => primitive("cylinder", options),
  capsule: (options?: AuraPrimitiveOptions) => primitive("capsule", options),
  torus: (options?: AuraPrimitiveOptions) => primitive("torus", options),
  // ── threejs-parity L2-01/02 (SG-03): the ten widened kinds. Params map onto
  // three's constructor args — `primitives.cone({ params: { radius, height,
  // radialSegments, heightSegments, openEnded, thetaStart, thetaLength } })`.
  cone: (options?: AuraPrimitiveOptions) => primitive("cone", options),
  circle: (options?: AuraPrimitiveOptions) => primitive("circle", options),
  ring: (options?: AuraPrimitiveOptions) => primitive("ring", options),
  tube: (options?: AuraPrimitiveOptions) => primitive("tube", options),
  lathe: (options?: AuraPrimitiveOptions) => primitive("lathe", options),
  extrude: (options?: AuraPrimitiveOptions) => primitive("extrude", options),
  shape: (options?: AuraPrimitiveOptions) => primitive("shape", options),
  torusKnot: (options?: AuraPrimitiveOptions) => primitive("torusKnot", options),
  polyhedron: (options?: AuraPrimitiveOptions) => primitive("polyhedron", options),
  roundedBox: (options?: AuraPrimitiveOptions) => primitive("roundedBox", options)
} as const;
