export interface SkinningPalette { readonly jointCount: number; readonly matrixTexture?: boolean; readonly uniformLimit?: number; }
export function chooseSkinningPalette(jointCount: number, uniformLimit = 64): SkinningPalette { return { jointCount, uniformLimit, matrixTexture: jointCount > uniformLimit }; }
