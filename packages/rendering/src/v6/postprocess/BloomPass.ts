export interface BloomPassOptions { readonly enabled?: boolean; readonly intensity?: number; }
export class BloomPass { constructor(readonly options: BloomPassOptions = {}) {} }
