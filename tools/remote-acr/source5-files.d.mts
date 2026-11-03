export declare const SOURCE5_MANIFEST: string;
export declare function hasGitWorkTree(repoRoot: string): boolean;
export declare function readSource5Manifest(repoRoot: string): string[] | null;
export declare function listCandidateFiles(repoRoot: string, pathspecs?: readonly string[], options?: { readonly includeUntracked?: boolean }): string[];
