/**
 * Builder defaults `effects.particles` writes onto every node. They are old data on the node, not authoring intent, so
 * lowering must not turn them into per-particle curves: a curve equal to its default is treated as "not authored"
 * (the emitter keeps its built-in fade envelope and constant size, exactly as before 5.1).
 */
export const PARTICLE_DEFAULT_SIZE_OVER_LIFE: readonly number[] = Object.freeze([0.35, 1, 0.58]);
export const PARTICLE_DEFAULT_ALPHA_OVER_LIFE: readonly number[] = Object.freeze([0, 0.92, 0]);

export function isAuthoredCurve(curve: readonly number[] | undefined, builderDefault: readonly number[]): curve is readonly number[] {
  if (curve === undefined || curve.length === 0) return false;
  if (curve.length !== builderDefault.length) return true;
  return curve.some((value, index) => value !== builderDefault[index]);
}
