export interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber?: number };
  children?: number[];
}
export interface CpuProfile {
  nodes: ProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
}
export interface FunctionTime { fn: string; ms: number }
export const LANE10_PATTERNS: RegExp[];
export function isLane10Url(url: unknown): boolean;
export function bucketFor(node: ProfileNode): string;
export function attributeProfile(profile: CpuProfile, options?: { top?: number }): {
  totalMs: number;
  busyMs: number;
  lane10Ms: number;
  lane10ShareOfBusy: number;
  buckets: Record<string, number>;
  topFunctions: FunctionTime[];
  topLane10Functions: FunctionTime[];
};
export function frameStats(frames: { t: number; cbMs: number }[]): {
  count: number;
  meanIntervalMs: number | null;
  meanCallbackMs: number | null;
  maxCallbackMs: number | null;
};
