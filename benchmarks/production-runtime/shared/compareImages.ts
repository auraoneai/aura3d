export interface ImageComparisonSummary { readonly maxDelta: number; readonly meanDelta: number; readonly pass: boolean; }
export function compareImages(meanDelta: number, maxDelta: number): ImageComparisonSummary { return { meanDelta, maxDelta, pass: meanDelta <= 18 && maxDelta <= 255 }; }
