// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraPrimitiveOptions, AuraPrimitiveNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { AuraRuntimeError } from "../compiler/errors.js";
import { ignoredOptionsNote } from "./optionDiagnostics.js";
import { geometry } from "./geometry.js";
import { instances } from "./instances.js";
import { material } from "./material.js";
import { physics } from "./physics.js";
import { text3D } from "./text3d.js";

/**
 * The six original kinds are unit-sized shapes scaled by `size` / the node
 * transform, so their `params` carry tessellation (and, for cylinder / torus,
 * the profile ratios) only. A shape-defining key such as `radius` or `height`
 * would never take effect, so it is rejected instead of being silently
 * ignored. The SG-03 kinds (cone, circle, ring, ...) read their own params.
 */
const UNIT_PRIMITIVE_PARAM_KEYS: Readonly<Record<string, readonly string[]>> = {
  box: ["widthSegments", "heightSegments", "depthSegments"],
  sphere: ["widthSegments", "heightSegments"],
  plane: ["widthSegments", "heightSegments"],
  cylinder: ["radialSegments", "heightSegments", "radiusTop", "radiusBottom", "openEnded"],
  capsule: ["radialSegments", "capSegments"],
  torus: ["radialSegments", "tubularSegments", "tube"]
};

const SIZE_HINT: Readonly<Record<string, string>> = {
  box: "size: [width, height, depth]",
  sphere: "size: diameter (radius * 2)",
  plane: "size: [width, 1, depth]",
  cylinder: "size: [diameter, height, diameter]",
  capsule: "size: [diameter, total height, diameter]",
  torus: "size: overall scale"
};

export function assertUnitPrimitiveParams(primitiveName: string, params: unknown): void {
  const allowed = UNIT_PRIMITIVE_PARAM_KEYS[primitiveName];
  if (allowed === undefined || params === undefined || params === null) return;
  if (typeof params !== "object" || Array.isArray(params)) {
    throw new AuraRuntimeError("invalid-primitive-params", `primitives.${primitiveName}: params must be an object`);
  }
  const unused = Object.keys(params).filter((key) => !allowed.includes(key));
  if (unused.length === 0) return;
  throw new AuraRuntimeError(
    "invalid-primitive-params",
    `primitives.${primitiveName}: params ${unused.map((key) => `"${key}"`).join(", ")} ${unused.length === 1 ? "has" : "have"} no effect on this kind ` +
      `(its shape comes from \`${SIZE_HINT[primitiveName]}\`). Supported params: ${allowed.join(", ")}`
  );
}

/**
 * Every top-level option `primitive()` reads: `AuraPrimitiveOptions` plus the
 * `transforms` / `colors` pair `instancedPrimitive` spreads in. Anything else
 * (for example `segments`, `radius`, `color`) used to be dropped silently.
 */
const PRIMITIVE_OPTION_KEYS: readonly string[] = [
  "name", "position", "rotation", "scale", "lookAt", "rotationOrder", "quaternion",
  "renderOrder", "frustumCulled", "layers", "userData",
  "material", "size", "castShadow", "receiveShadow", "physics",
  "instances", "instanceColors", "geometry", "text3D", "lod", "params",
  "transforms", "colors"
];

export function primitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraPrimitiveOptions = {}): AuraNodeBuilder<AuraPrimitiveNode> {
  const ignored = ignoredOptionsNote(`primitives.${primitiveName}`, options, PRIMITIVE_OPTION_KEYS);
  assertUnitPrimitiveParams(primitiveName, options.params);
  return new AuraNodeBuilder({
    kind: "primitive",
    primitive: primitiveName,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    // Transform extras: the compiler reads these off the node (renderInput.ts, sceneGraph.ts)
    // but the builder used to drop them. Spread only when set so node JSON is unchanged otherwise.
    ...(options.rotationOrder !== undefined ? { rotationOrder: options.rotationOrder } : {}),
    ...(options.quaternion !== undefined ? { quaternion: options.quaternion } : {}),
    ...(options.renderOrder !== undefined ? { renderOrder: options.renderOrder } : {}),
    ...(options.frustumCulled !== undefined ? { frustumCulled: options.frustumCulled } : {}),
    ...(options.layers !== undefined ? { layers: options.layers } : {}),
    ...(options.userData !== undefined ? { userData: options.userData } : {}),
    ...ignored,
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
