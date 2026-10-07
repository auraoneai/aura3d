/**
 * Types for `post-v2.mjs` (kept alongside because the codemod registry is TS).
 * Mirrors `AuraCodemod` from `@aura3d/cli/contracts` without importing it —
 * the tool must stay loadable from plain node.
 */

export interface PostV2CodemodRow {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly mapping: "exact" | "approximate" | "none";
  target?: string;
  note?: string;
}

export interface PostV2EmissiveRow {
  readonly file: string;
  readonly line: number;
  readonly emissive: string;
  readonly emissiveIntensity: number;
  readonly lumaXstrength: number;
}

export interface PostV2CodemodReport {
  readonly emissive: readonly PostV2EmissiveRow[];
  readonly preset?: string;
  readonly notMigrated: boolean;
}

export interface PostV2CodemodResult {
  readonly code: string;
  readonly rows: readonly PostV2CodemodRow[];
  readonly report: PostV2CodemodReport;
}

export const POST_V2_GAME_IDS: readonly string[];
export const POST_V2_DEFAULT_FILES: readonly string[];
export const POST_V2_NOT_MIGRATED: readonly string[];
export const POST_V2_PRESET_BY_GAME: Readonly<Record<string, string>>;
export function postV2GameIdFor(fileName: string): string | null;

export function transformPostV2(source: string, fileName: string): PostV2CodemodResult;

export const postV2Codemod: {
  readonly name: "post-v2";
  readonly owner: "prd03";
  readonly description: string;
  transform(source: string, fileName: string): PostV2CodemodResult;
};
