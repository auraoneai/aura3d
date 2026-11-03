export const EXAMPLE_COST_BASE: number;
export const EXAMPLE_COST_BYTES_PER_UNIT: number;
export const MAX_EXAMPLE_SHARDS: number;
export const EXAMPLE_SHARD_SCHEMA: 'aura3d.example-shard/1';

export interface ExampleCostItem { id: string; cost: number }
export interface ExamplePartition {
  catalog: ExampleCostItem[]; count: number; catalogSha256: string; partitionSha256: string;
  shards: Array<{ index: number; ids: string[]; cost: number }>;
}
export interface ExampleShardRecord {
  schema: typeof EXAMPLE_SHARD_SCHEMA; index: number; count: number; ids: string[]; cost: number;
  catalog: ExampleCostItem[]; catalogSha256: string; partitionSha256: string;
}

export function exampleCostUnits(input: { files: number; bytes: number }): number;
export function parseExampleShard(spec: string | undefined): { index: number; count: number };
export function exampleShardReportName(index: number, count: number): string;
export function normalizeExampleCatalog(items: readonly ExampleCostItem[]): ExampleCostItem[];
export function partitionExampleCatalog(items: readonly ExampleCostItem[], count: number): ExamplePartition;
export function exampleShardRecord(items: readonly ExampleCostItem[], index: number, count: number): ExampleShardRecord;
export function exampleShardRecordProblems(shard: unknown, label: string): string[];
export function mergeExampleShardReports(reports: readonly unknown[], expectedCount?: number): { problems: string[]; merged: Record<string, any> | null };
