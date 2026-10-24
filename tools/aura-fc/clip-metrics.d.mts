export function stanceSamples(glb: any, clipName: string): { dur: number; n: number; stance: Array<{ side: string; v: number; y: number }> };
export function cycleMetrics(glb: any, clipName: string): { clip: string; duration: number; plantedFraction: number; stanceSpeed: number; stanceSpeedSd: number };
export function locomotionTable(glbPath: string, clips?: string[]): Array<ReturnType<typeof cycleMetrics>>;
