export interface WorkflowDiagnosticsSummary { readonly id: string; readonly ready: boolean; readonly workflow: string; }
export function createWorkflowDiagnosticsSummary(): WorkflowDiagnosticsSummary { return { id: 'diagnostics', ready: true, workflow: 'WorkflowDiagnostics' }; }
