export interface MorphTargetPlan { readonly targetCount: number; readonly attributeSlots: number; readonly textureBacked: boolean; }
export function createMorphTargetPlan(targetCount: number, maxAttributeSlots = 8): MorphTargetPlan { return { targetCount, attributeSlots: Math.min(targetCount, maxAttributeSlots), textureBacked: targetCount > maxAttributeSlots }; }
