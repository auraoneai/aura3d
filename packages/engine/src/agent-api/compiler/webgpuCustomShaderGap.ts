/**
 * WebGPU pre-check for `material.custom` specs that carry GLSL but no WGSL twin.
 *
 * The WebGPU device has no program for such a material: every draw that uses it fails with `WGSL_PROGRAM_MISSING` and is
 * skipped (`CUSTOM_SHADER_WGSL_MISSING`), so the scene silently loses its sky, ground or effects. This scan runs on the
 * mount snapshot before any WebGPU context exists, so a requested WebGPU backend can still fall back to WebGL2 instead.
 *
 * The walk is bounded and data-only: plain objects and arrays, no typed arrays, no class instances (textures, handles), no
 * getters. Materials attached later at runtime (`handle.setMaterial`) are outside its reach and keep the draw-time report.
 */

export interface WebgpuCustomShaderGap {
  readonly code: "CUSTOM_SHADER_WGSL_MISSING";
  /** `wgsl:<node name>` for the first few offending nodes (sanitized identifiers), then `+N more`. */
  readonly missing: readonly string[];
}

const MAX_VISITS = 200_000;
const MAX_DEPTH = 24;
const MAX_NAMES = 4;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** A `{ kind: "custom", custom: { glsl } }` material spec whose `custom.wgsl` is absent. */
function isGlslOnlyCustomMaterial(value: Record<string, unknown>): boolean {
  if (value.kind !== "custom") return false;
  const custom = value.custom;
  if (!isPlainRecord(custom) || custom.glsl === null || typeof custom.glsl !== "object") return false;
  return custom.wgsl === undefined || custom.wgsl === null;
}

function safeName(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 64);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * The first gap found in `scene` (a scene snapshot or any plain data tree), or `undefined` when every custom material has
 * a WGSL program. Never throws: an unreadable branch is skipped.
 */
export function webgpuCustomShaderGap(scene: unknown): WebgpuCustomShaderGap | undefined {
  const names: string[] = [];
  let count = 0;
  let visits = 0;
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number, owner: string | undefined): void => {
    if (visits >= MAX_VISITS || depth > MAX_DEPTH || value === null || typeof value !== "object" || seen.has(value)) return;
    if (ArrayBuffer.isView(value)) return;
    seen.add(value);
    visits += 1;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1, owner);
      return;
    }
    if (!isPlainRecord(value)) return;
    let keys: string[];
    try { keys = Object.keys(value); } catch { return; }
    if (isGlslOnlyCustomMaterial(value)) {
      count += 1;
      if (names.length < MAX_NAMES) names.push(`wgsl:${owner ?? "material"}`);
      return;
    }
    let name = owner;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, "name");
      name = descriptor && "value" in descriptor ? safeName(descriptor.value) ?? owner : owner;
    } catch { /* keep the owner's name */ }
    for (const key of keys) {
      let child: unknown;
      try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) continue;
        child = descriptor.value;
      } catch { continue; }
      visit(child, depth + 1, name);
    }
  };
  try { visit(scene, 0, undefined); } catch { /* bounded best effort */ }
  if (count === 0) return undefined;
  return { code: "CUSTOM_SHADER_WGSL_MISSING", missing: count > names.length ? [...names, `+${count - names.length} more`] : names };
}
