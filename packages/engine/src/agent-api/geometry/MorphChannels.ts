/** Validation shared by operations which copy or remap authored morph data. */
export type AuraMorphChannelErrorCode = "AURA_GEOMETRY_INVALID" | "AURA_GEOMETRY_INCOMPATIBLE";
export type AuraMorphChannelErrorHandler = (code: AuraMorphChannelErrorCode, field: string, message: string) => never;

const defaultFailure: AuraMorphChannelErrorHandler = (code, field, message) => {
  throw Object.assign(new Error(message), { code, field });
};

/**
 * Require one packed, finite float32-representable vec3 per source vertex in
 * every present channel. The helper has no runtime dependency on geometry or
 * rendering so it can also be used by the lazy atlas path.
 */
export function assertGeometryMorphChannels(
  targets: unknown,
  vertexCount: number,
  fail: AuraMorphChannelErrorHandler = defaultFailure
): void {
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 0) {
    fail("AURA_GEOMETRY_INVALID", "positions", "Aura3D geometry requires a valid non-negative vertex count.");
  }
  if (targets === undefined) return;
  if (!Array.isArray(targets)) fail("AURA_GEOMETRY_INVALID", "morphTargets", "Aura3D geometry morph targets must be an array.");
  for (const [index, morph] of targets.entries()) {
    if (!morph || typeof morph !== "object" || Array.isArray(morph)) {
      fail("AURA_GEOMETRY_INVALID", `morphTargets[${index}]`, "Aura3D geometry morph target must be an object.");
    }
    for (const key of Object.keys(morph)) {
      if (key !== "name" && key !== "positions" && key !== "normals" && key !== "tangents") {
        fail("AURA_GEOMETRY_INCOMPATIBLE", `morphTargets[${index}].${key}`, "Aura3D geometry cannot preserve an unsupported morph target field.");
      }
    }
    if ((morph as Record<string, unknown>).name !== undefined && typeof (morph as Record<string, unknown>).name !== "string") {
      fail("AURA_GEOMETRY_INVALID", `morphTargets[${index}].name`, "Aura3D geometry morph target names must be strings.");
    }
    for (const key of ["positions", "normals", "tangents"] as const) {
      const channel = (morph as Record<string, unknown>)[key];
      if (channel === undefined && key !== "positions") continue;
      const invalid = (): never => fail("AURA_GEOMETRY_INVALID", `morphTargets[${index}].${key}`, `Aura3D geometry morph ${key} deltas must contain one finite float32 vec3 per vertex.`);
      if (!(channel instanceof Float32Array) && !Array.isArray(channel)) invalid();
      const values = channel as ArrayLike<unknown>;
      if (values.length !== vertexCount * 3) invalid();
      for (let component = 0; component < values.length; component += 1) {
        const value = values[component];
        if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) invalid();
      }
    }
  }
}
