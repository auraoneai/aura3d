// threejs-parity lane L6 (§5.6, SG-08): `sprites.sprite({...})` — a camera-
// facing billboard quad (three's `THREE.Sprite` + `SpriteMaterial`) drawn by
// the generated-path `prd15.paritySprite` ShaderFeature over the shared sprite
// quad geometry (`R/SpriteGeometry.ts`).

import { AuraNodeBuilder } from "./builder.js";
import type { AuraColor, AuraMaterialSpec, AuraMaterialTextureInput, AuraRuntimeNodeSpec, AuraSpriteNode, AuraVec3 } from "./types.js";

export interface AuraSpriteOptions {
  /** Sprite texture (three's `SpriteMaterial.map`). */
  readonly map?: AuraMaterialTextureInput;
  /** Anchor point in [0,1]² — [0,0] bottom-left … [1,1] top-right (three's `Sprite.center`, default [0.5, 0.5]). */
  readonly center?: readonly [number, number];
  /** Screen-plane rotation in radians (three's `SpriteMaterial.rotation`). Alias `rotation` accepted. */
  readonly spriteRotation?: number;
  readonly rotation?: number | AuraVec3;
  /** Scale sprite size with view depth (three's `sizeAttenuation`, default true). */
  readonly sizeAttenuation?: boolean;
  /** Sprite tint (three's `SpriteMaterial.color`; default white). */
  readonly color?: AuraColor;
  readonly material?: AuraMaterialSpec;
  readonly name?: string;
  readonly visible?: boolean;
  readonly runtime?: AuraRuntimeNodeSpec;
  readonly position?: AuraVec3;
  /** Sprite size: `scale` sizes the billboard (three's `sprite.scale`), x/y in world units. */
  readonly scale?: number | AuraVec3;
}

/** `sprites.sprite({ map, center, rotation, sizeAttenuation, color })` (SG-08). */
export function sprite(options: AuraSpriteOptions = {}): AuraNodeBuilder<AuraSpriteNode> {
  const center: readonly [number, number] = options.center ?? [0.5, 0.5];
  if (center.length !== 2 || !center.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new Error("sprites.sprite center must be two numbers in [0, 1]");
  }
  // `rotation` means three's SpriteMaterial.rotation (radians) when a number;
  // a vec3 stays a world-space euler on the node transform.
  const spriteRotation = options.spriteRotation ?? (typeof options.rotation === "number" ? options.rotation : undefined);
  if (spriteRotation !== undefined && !Number.isFinite(spriteRotation)) {
    throw new Error("sprites.sprite rotation must be a finite number of radians");
  }
  // `scale` accepts a scalar convenience (x=y, z=1 — three's Sprite scale is 2D
  // in effect); the node transform itself stores the vec3.
  const scale: AuraVec3 | undefined =
    options.scale === undefined
      ? undefined
      : typeof options.scale === "number"
        ? [options.scale, options.scale, 1]
        : options.scale;
  return new AuraNodeBuilder<AuraSpriteNode>({
    kind: "sprite",
    name: options.name,
    map: options.map,
    center,
    spriteRotation,
    sizeAttenuation: options.sizeAttenuation,
    color: options.color,
    material: options.material,
    visible: options.visible,
    runtime: options.runtime,
    position: options.position,
    rotation: Array.isArray(options.rotation) ? options.rotation as AuraVec3 : undefined,
    scale
  });
}

/** `sprites.*` namespace (SG-08). */
export const sprites = { sprite } as const;
