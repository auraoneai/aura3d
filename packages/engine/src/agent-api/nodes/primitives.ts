// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraPrimitiveOptions, AuraPrimitiveNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { AuraRuntimeError } from "../../contracts/runtimeError.js";
import { ignoredOptionsNote, materialIgnoredOptions } from "./optionDiagnostics.js";
import { assertValidPivot } from "../pivotGuard.js";

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
 * Every top-level option `primitive()` reads (`AuraPrimitiveOptions`). Anything else
 * (for example `segments`, `radius`, `color`, or the `instances.*`-only `transforms`)
 * used to be dropped silently; it is now reported as OPTION_IGNORED.
 */
export const PRIMITIVE_OPTION_KEYS: readonly string[] = [
  "name", "position", "pivot", "rotation", "scale", "lookAt", "rotationOrder", "quaternion",
  "renderOrder", "frustumCulled", "layers", "userData",
  "material", "size", "castShadow", "receiveShadow", "physics",
  "instances", "instanceColors", "geometry", "text3D", "lod", "params"
];

/** `instances.<kind>` reads the primitive options plus its `transforms` / `colors` pair (anim-phys-07). */
export const INSTANCED_PRIMITIVE_OPTION_KEYS: readonly string[] = [...PRIMITIVE_OPTION_KEYS, "transforms", "colors"];

/** Builder label and readable keys for the OPTION_IGNORED note; `instances.*` passes its own. */
export interface PrimitiveOptionGuard {
  readonly builder: string;
  readonly validKeys: readonly string[];
  /** The options as the caller wrote them, before the builder mapped any key. */
  readonly options: unknown;
}

export function primitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraPrimitiveOptions = {}, guard?: PrimitiveOptionGuard): AuraNodeBuilder<AuraPrimitiveNode> {
  assertValidPivot(options.pivot);
  const pivot = options.pivot === undefined ? undefined : [...options.pivot] as [number, number, number];
  const builderIgnored = guard
    ? ignoredOptionsNote(guard.builder, guard.options, guard.validKeys)
    : ignoredOptionsNote(`primitives.${primitiveName}`, options, PRIMITIVE_OPTION_KEYS);
  // S5-WP19-04: material fields the material builder recorded as never rendered.
  const materialIgnored = materialIgnoredOptions(options.material);
  const ignored = materialIgnored.length === 0 ? builderIgnored
    : { ignoredOptions: [...(builderIgnored.ignoredOptions ?? []), ...materialIgnored] };
  assertUnitPrimitiveParams(primitiveName, options.params);
  return new AuraNodeBuilder({
    kind: "primitive",
    primitive: primitiveName,
    name: options.name,
    position: options.position,
    ...(pivot === undefined ? {} : { pivot }),
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

/**
 * E3-06: three.js `PlaneGeometry(width, height)` reads as a two-number size. `primitives.plane` accepts
 * `size: [width, depth]` and compiles it to the canonical `size: [width, 1, depth]` (the plane lies in XZ), so the
 * node output is identical to writing the three-number form.
 */
export type AuraPlaneOptions = Omit<AuraPrimitiveOptions, "size"> & { readonly size?: AuraPrimitiveOptions["size"] | readonly [number, number] };

function planeOptions(options: AuraPlaneOptions | undefined): AuraPrimitiveOptions | undefined {
  const size = options?.size;
  if (options === undefined || !Array.isArray(size) || size.length !== 2) return options as AuraPrimitiveOptions | undefined;
  return { ...options, size: [size[0] as number, 1, size[1] as number] };
}

export const primitives = {
  box: (options?: AuraPrimitiveOptions) => primitive("box", options),
  sphere: (options?: AuraPrimitiveOptions) => primitive("sphere", options),
  plane: (options?: AuraPlaneOptions) => primitive("plane", planeOptions(options)),
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
