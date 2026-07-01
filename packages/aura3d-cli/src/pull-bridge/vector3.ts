export function isPositiveVector3(
  value: readonly [number, number, number] | undefined,
): boolean {
  return Boolean(value && value.every((entry) => Number.isFinite(entry) && entry > 0));
}
