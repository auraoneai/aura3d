export interface ProductRenderWorkflowSummary { readonly id: string; readonly ready: boolean; readonly workflow: string; }
export function createProductRenderWorkflowSummary(): ProductRenderWorkflowSummary { return { id: 'product-render', ready: true, workflow: 'ProductRenderWorkflow' }; }
