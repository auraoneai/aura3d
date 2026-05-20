export interface AssetInspectionWorkflowSummary { readonly id: string; readonly ready: boolean; readonly workflow: string; }
export function createAssetInspectionWorkflowSummary(): AssetInspectionWorkflowSummary { return { id: 'asset-inspection', ready: true, workflow: 'AssetInspectionWorkflow' }; }
