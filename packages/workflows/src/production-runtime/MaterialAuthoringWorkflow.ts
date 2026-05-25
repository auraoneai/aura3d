export interface MaterialAuthoringWorkflowSummary { readonly id: string; readonly ready: boolean; readonly workflow: string; }
export function createMaterialAuthoringWorkflowSummary(): MaterialAuthoringWorkflowSummary { return { id: 'material-authoring', ready: true, workflow: 'MaterialAuthoringWorkflow' }; }
