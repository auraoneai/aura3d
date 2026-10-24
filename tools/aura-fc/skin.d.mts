export function loadSkinnedMesh(glb: any): { indices: number[]; pos: number[][]; jointNames: string[] } & Record<string, any>;
export function skinnedPositions(mesh: any, fk: any): number[][];
export function triangleStretch(glb: any, mesh?: any, clips?: string[], samples?: number): Float32Array;
export function dropStretched(glb: any, limit?: number): { glb: any; removed: number; total: number; stretch: Float32Array };
export function smoothBridgeWeights(glb: any, options?: { threshold?: number; rings?: number; iterations?: number; blend?: number }): { glb: any; regionVertices: number; vertices: number };
