export interface CinematicWorkflowSummary { readonly id: string; readonly ready: boolean; readonly workflow: string; }
export function createCinematicWorkflowSummary(): CinematicWorkflowSummary { return { id: 'cinematic', ready: true, workflow: 'CinematicWorkflow' }; }
