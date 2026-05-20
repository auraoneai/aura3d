export interface DOFPassOptions { readonly enabled?: boolean; readonly intensity?: number; }
export class DOFPass { constructor(readonly options: DOFPassOptions = {}) {} }
