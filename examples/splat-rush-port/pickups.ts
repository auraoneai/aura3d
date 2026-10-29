/**
 * Power-up pickups as Meshy toy models (presentation only). The simulation still owns type, lane and height; this module
 * maps each live pickup to a pooled model node of its type, wobbles it, and sets a soft coloured halo under it so the pale
 * models read against the white road. Types: rainbow, shield, x2 (score multiplier), switch (colour swap).
 */
import { geometry, material, model, scene, type AuraApp } from "@aura3d/engine";
import { cylinderMesh } from "./meshes";
import { MODELS } from "./models";
import type { Powerup } from "./sim";
import { FLAT_FRAGMENT, FLAT_VERTEX } from "./shaders";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type Scene = ReturnType<typeof scene>;

const PER_TYPE = 4;
const TYPES = ["rainbow", "shield", "x2", "switch"] as const;
const ASSET = { rainbow: "gemRainbow", shield: "gemShield", x2: "gemDouble", switch: "gemSwitch" } as const;
const HALO_HEX = { rainbow: "#b868e8", shield: "#5ecaf0", x2: "#f9c647", switch: "#5fd0c0" } as const;
/** Largest model dimension in world units (the original pickup is a 0.8 sphere on a 0.8 cone). */
const SIZE = 2.1;

export const pickupId = (type: Powerup["type"], k: number): string => `pickup-${type}-${k}`;
export const haloId = (type: Powerup["type"], k: number): string => `pickup-halo-${type}-${k}`;

const linear = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c: number): number => (c / 255 < 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
  return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)];
};

const haloGeometry = (() => {
  const m = cylinderMesh(1, 1, 0.02, 24);
  return () => geometry.dynamic({ positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals), uvs: Float32Array.from(m.uvs), indices: Uint32Array.from(m.indices) });
})();

export function addPickups(builder: Scene): void {
  for (const type of TYPES) {
    for (let k = 0; k < PER_TYPE; k++) {
      builder.add(model(MODELS[ASSET[type]], { name: pickupId(type, k), targetMaxDimension: SIZE, castShadow: false, receiveShadow: false }).runtime({ id: pickupId(type, k) }));
      builder.add(geometry.custom(haloGeometry(), {
        name: haloId(type, k),
        material: material.custom({
          glsl: { vertex: FLAT_VERTEX, fragment: FLAT_FRAGMENT },
          uniforms: { baseColor: { type: "color3", value: linear(HALO_HEX[type]) }, alpha: { type: "f32", value: 0.5 } },
          transparent: true,
          depthWrite: false,
          side: "double"
        })
      }).runtime({ id: haloId(type, k) }));
    }
  }
}

/** Every pickup and halo node id (for program warm-up). */
export function pickupNodeIds(): string[] {
  return TYPES.flatMap((type) => Array.from({ length: PER_TYPE }, (_, k) => [pickupId(type, k), haloId(type, k)]).flat());
}

export function hidePickups(node: (id: string) => NodeHandle): void {
  for (const type of TYPES) {
    for (let k = 0; k < PER_TYPE; k++) {
      node(pickupId(type, k)).setVisible(false);
      node(haloId(type, k)).setVisible(false);
    }
  }
}

/** `back` steps the pickups back with the interpolated road (see presentation.ts). */
export function updatePickups(node: (id: string) => NodeHandle, powerups: readonly Powerup[], elapsed: number, back = 0): void {
  const used: Record<Powerup["type"], number> = { rainbow: 0, shield: 0, x2: 0, switch: 0 };
  for (const pu of powerups) {
    const k = used[pu.type]++;
    if (k >= PER_TYPE) continue;
    const wobble = 0.55 * Math.sin(elapsed * 2.1 + pu.laneX);
    node(pickupId(pu.type, k)).setVisible(true).setPosition(pu.x, pu.y + 0.85, pu.z - back).setRotation(0, wobble, 0.06 * Math.sin(elapsed * 3.3 + pu.z));
    node(haloId(pu.type, k)).setVisible(true).setPosition(pu.x, 0.06, pu.z - back).setScale(1.05 + 0.08 * Math.sin(elapsed * 4 + pu.z));
  }
  for (const type of TYPES) {
    for (let k = used[type]; k < PER_TYPE; k++) {
      node(pickupId(type, k)).setVisible(false);
      node(haloId(type, k)).setVisible(false);
    }
  }
}
