export interface ProductionEffectComposerOptions { readonly enabled?: boolean; readonly intensity?: number; }
export class ProductionEffectComposer { constructor(readonly options: ProductionEffectComposerOptions = {}) {} }
