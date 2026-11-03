import type { ShaderFeature } from "../contracts/program";

/** Capture original providers and all executable callback descriptors once. */
export function makeShaderFeatureReplayGuard(features: readonly ShaderFeature[]): (feature: ShaderFeature) => boolean {
  const snapshot = (value: object) => ({ parent: Object.getPrototypeOf(value) as object | null, descriptors: Object.getOwnPropertyDescriptors(value) });
  const unchanged = (value: object, saved: ReturnType<typeof snapshot>) => {
    if (Object.getPrototypeOf(value) !== saved.parent) return false;
    const keys = Reflect.ownKeys(saved.descriptors);
    if (Reflect.ownKeys(value).length !== keys.length) return false;
    return keys.every((key) => {
      const before = Reflect.get(saved.descriptors, key) as PropertyDescriptor;
      const after = Object.getOwnPropertyDescriptor(value, key);
      return after !== undefined && !after.get && !after.set && after.value === before.value
        && after.writable === before.writable && after.enumerable === before.enumerable && after.configurable === before.configurable;
    });
  };
  const snapshots = new Map(features.map((feature) => [feature, {
    feature: snapshot(feature), chunks: feature.chunks, chunkSnapshot: snapshot(feature.chunks),
    hooks: feature.hooks, hookSnapshot: snapshot(feature.hooks)
  }]));
  return (feature) => {
    const saved = snapshots.get(feature);
    return Boolean(saved && unchanged(feature, saved.feature)
      && unchanged(saved.chunks, saved.chunkSnapshot) && unchanged(saved.hooks, saved.hookSnapshot));
  };
}
