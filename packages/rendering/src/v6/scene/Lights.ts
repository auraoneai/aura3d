export type LightType = 'directional' | 'point' | 'spot' | 'environment';
export interface Light { readonly id: string; readonly type: LightType; readonly intensity: number; readonly color: readonly [number, number, number]; readonly castsShadow?: boolean; }
