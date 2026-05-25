export interface SSAOPassOptions { readonly enabled?: boolean; readonly intensity?: number; }
export class SSAOPass { constructor(readonly options: SSAOPassOptions = {}) {} }
