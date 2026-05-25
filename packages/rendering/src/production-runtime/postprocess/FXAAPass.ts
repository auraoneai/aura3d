export interface FXAAPassOptions { readonly enabled?: boolean; readonly intensity?: number; }
export class FXAAPass { constructor(readonly options: FXAAPassOptions = {}) {} }
