/** Types for upload-artifacts.mjs (bounded Blob artifact egress). */
export interface UploadArtifactCopy {
  src: string;
  dest: string;
}

export interface UploadArtifactArgs {
  copies: UploadArtifactCopy[];
  dirs: string[];
  check: boolean;
  sourceHandoff?: boolean;
  prefix?: string;
  preserveRoot?: string;
}

export interface UploadArtifactEntry {
  src: string;
  name: string;
  size: number;
  dev: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
}

export type UploadArtifactRequest = (input: URL | string, init?: RequestInit) => Promise<Response>;

export function safeBlobName(name: string): string;
export function parseArgs(argv: readonly string[]): UploadArtifactArgs;
export function planArtifactBatches<T extends { readonly size: number }>(
  entries: readonly T[],
  limits?: { maxBytes?: number; maxFiles?: number }
): T[][];
export function parseBlobUrl(value: string, options?: { allowSas?: boolean }): URL;
export function managedIdentityToken(env?: NodeJS.ProcessEnv | Record<string, string | undefined>, request?: UploadArtifactRequest): Promise<string>;
export function collectArtifacts(args: UploadArtifactArgs): UploadArtifactEntry[];
export function redactText(text: string): string;
export function run(
  args: UploadArtifactArgs,
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
  request?: UploadArtifactRequest
): Promise<{ uploaded: number }>;
