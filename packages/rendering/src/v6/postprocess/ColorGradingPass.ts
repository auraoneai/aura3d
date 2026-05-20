export interface ColorGradingPassOptions { readonly enabled?: boolean; readonly intensity?: number; }
export class ColorGradingPass { constructor(readonly options: ColorGradingPassOptions = {}) {} }
