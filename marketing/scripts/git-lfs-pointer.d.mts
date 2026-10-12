export const GIT_LFS_POINTER_HEADER: string;
export const GIT_LFS_PULL_COMMAND: string;

export function isGitLfsPointerFile(file: string): boolean;
export function findGitLfsPointerFiles(root: string): string[];
export function assertNotGitLfsPointer(file: string, label?: string): void;
export function assertNoGitLfsPointers(root: string, label?: string): void;
