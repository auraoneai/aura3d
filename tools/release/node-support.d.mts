export const NODE_ENGINE_RANGE: string;
export const MINIMUM_NODE_VERSION: readonly [number, number, number];
export const SUPPORTED_NODE_MAJORS: readonly number[];
export type NodeMatrixCell =
  | { major: number; status: 'available'; executable: string; version: string }
  | { major: number; status: 'unavailable'; reason: string };
export function parseNodeVersion(version: string): [number, number, number];
export function satisfiesNodeEngine(version: string): boolean;
export function assertDeclaredNodeEngines(root?: string): string;
export function resolveNodeMatrix(options?: { env?: Record<string, string | undefined>; execPath?: string; run?: (file: string) => string }): NodeMatrixCell[];
