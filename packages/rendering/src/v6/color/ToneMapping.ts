export type ToneMappingOperatorV6 = 'linear' | 'neutral' | 'aces';
export function toneMap(value: number, operator: ToneMappingOperatorV6 = 'aces', exposure = 1): number {
  const x = Math.max(0, value * exposure);
  if (operator === 'linear') return Math.min(1, x);
  if (operator === 'neutral') return x / (1 + x);
  return Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
}
