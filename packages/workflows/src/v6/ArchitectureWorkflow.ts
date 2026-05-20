export interface ArchitectureWorkflowSummary { readonly id: string; readonly ready: boolean; readonly workflow: string; }
export function createArchitectureWorkflowSummary(): ArchitectureWorkflowSummary { return { id: 'architecture', ready: true, workflow: 'ArchitectureWorkflow' }; }
