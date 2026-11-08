// 5.4 N7 (guessed names): three.js-style runtime setters agents reach for on a node handle.
//
// Benchmark 505 sources cast handles to `{ setIntensity?(v): void }` and called `setIntensity?.(v)`, which did nothing
// because the handle had no such member; searches for `setIntensity|setColor|setOpacity|setEmissive` came back empty.
// Each method below either has exactly the semantics of an existing native call (and is written through it), or throws
// a RangeError that names the native call for that node kind. None of them is ever a silent no-op.

import type { AuraColor, AuraMaterialSpec, AuraRuntimeNodeHandle, AuraSceneNode } from "../nodes/types.js";
import type { AuraLightPatch } from "../nodes/types/runtime.js";
import { assertAuraColorOption } from "../color.js";

type AliasMethod = "setColor" | "setIntensity" | "setOpacity" | "setEmissive";

export type AuraHandleGuessedNameMethods = Pick<AuraRuntimeNodeHandle, AliasMethod>;

function label(node: AuraSceneNode, id: string): string {
  const name = "name" in node && typeof node.name === "string" ? node.name : id;
  return `"${name}" (${node.kind})`;
}

function unsupported(method: AliasMethod, node: AuraSceneNode, id: string, instead: string): RangeError {
  return new RangeError(`HANDLE_METHOD_UNSUPPORTED: ${method}() has no effect on node ${label(node, id)}. ${instead}`);
}

/** The material a `setMaterial` merge can extend, or the reason it cannot. */
function editableMaterial(method: AliasMethod, node: AuraSceneNode, id: string): AuraMaterialSpec {
  if (node.kind === "model") {
    throw unsupported(method, node, id, "A model keeps its GLB materials: pass model(asset, { material }) or use handle.materials (model material overrides).");
  }
  // Primitives (and their instanced form) may omit `material` (the renderer default); other kinds must already carry one.
  if (node.kind === "light" || node.kind === "group" || (node.kind !== "primitive" && !("material" in node))) {
    throw unsupported(method, node, id, "Only primitive and instance nodes carry a material; call it on the mesh node, or handle.setLight({ color, intensity }) on a light node.");
  }
  const current = ((node as { readonly material?: AuraMaterialSpec }).material ?? {}) as AuraMaterialSpec;
  if (current.kind === "custom" || current.kind === "depth-preview") {
    throw unsupported(method, node, id, "Its material is a shader material (material.custom / toon / special): drive it with handle.setUniform(name, value).");
  }
  return current;
}

function lightSetter(handle: AuraRuntimeNodeHandle, method: AliasMethod, node: AuraSceneNode, patch: AuraLightPatch): void {
  if (typeof handle.setLight !== "function") {
    throw unsupported(method, node, handle.id, "Runtime light control is off for this app (A3D_QR_LIGHTING disabled); rebuild the light node instead.");
  }
  handle.setLight(patch);
}

function finiteNumber(method: AliasMethod, value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${method}() expects a finite number${max === Infinity ? ` >= ${min}` : ` in [${min}, ${max}]`}; got ${String(value)}.`);
  }
  return value;
}

/**
 * The guessed-name setters for one runtime handle. `getNode` returns the live scene node the handle edits.
 * - `setColor(c)`: light → `setLight({ color })`; mesh → `setMaterial({ ...material, color })`.
 * - `setIntensity(v)`: light → `setLight({ intensity })`; anything else throws, naming `setEmissive` / `setMaterial`.
 * - `setOpacity(a)`: mesh → `setMaterial({ ...material, opacity })` (Aura3D blends whenever opacity < 1).
 * - `setEmissive(c, i?)`: mesh → `setMaterial({ ...material, emissive, emissiveIntensity })`.
 */
export function createHandleGuessedNameMethods(getNode: () => AuraSceneNode): AuraHandleGuessedNameMethods {
  return {
    setColor(this: AuraRuntimeNodeHandle, color: AuraColor) {
      const node = getNode();
      assertAuraColorOption(color, `${this.id}.setColor(color)`);
      if (typeof color !== "string") throw new RangeError(`setColor() expects a CSS colour string such as "#ff8800"; got ${String(color)}.`);
      if (node.kind === "light") { lightSetter(this, "setColor", node, { color }); return this; }
      return this.setMaterial({ ...editableMaterial("setColor", node, this.id), color });
    },
    setIntensity(this: AuraRuntimeNodeHandle, intensity: number) {
      const node = getNode();
      if (node.kind !== "light") {
        throw unsupported("setIntensity", node, this.id, "setIntensity() is the light intensity: for a glowing mesh call handle.setEmissive(color, intensity), or handle.setMaterial({ ...material, emissiveIntensity }).");
      }
      lightSetter(this, "setIntensity", node, { intensity: finiteNumber("setIntensity", intensity, 0, Infinity) });
      return this;
    },
    setOpacity(this: AuraRuntimeNodeHandle, opacity: number) {
      const node = getNode();
      if (node.kind === "light") throw unsupported("setOpacity", node, this.id, "Lights have no opacity: use handle.setLight({ intensity }) or handle.setVisible(false).");
      const value = finiteNumber("setOpacity", opacity, 0, 1);
      return this.setMaterial({ ...editableMaterial("setOpacity", node, this.id), opacity: value });
    },
    setEmissive(this: AuraRuntimeNodeHandle, color: AuraColor, intensity?: number) {
      const node = getNode();
      if (node.kind === "light") throw unsupported("setEmissive", node, this.id, "A light node is already a light: use handle.setLight({ color, intensity }).");
      assertAuraColorOption(color, `${this.id}.setEmissive(color)`);
      const base = editableMaterial("setEmissive", node, this.id);
      return this.setMaterial({
        ...base,
        emissive: color,
        ...(intensity === undefined ? {} : { emissiveIntensity: finiteNumber("setEmissive", intensity, 0, Infinity) })
      });
    }
  };
}
