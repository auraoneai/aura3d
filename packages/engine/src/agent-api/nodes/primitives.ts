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
  torus: (options?: AuraPrimitiveOptions) => primitive("torus", options)
} as const;
