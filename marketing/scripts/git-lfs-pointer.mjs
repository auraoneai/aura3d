import { closeSync, existsSync, openSync, readSync, readdirSync } from "node:fs";
import path from "node:path";

export const GIT_LFS_POINTER_HEADER = "version https://git-lfs.github.com/spec/v1";
export const GIT_LFS_PULL_COMMAND = 'git lfs pull --include="public/aura-assets/**,apps/*/public/**,examples/*/public/**"';

function pointerErrorSubject(label) {
  return `Run ${GIT_LFS_PULL_COMMAND} before building the marketing site; ${label} contains unresolved Git LFS pointer file(s), which browsers cannot load as models, audio, or textures.`;
}

export function isGitLfsPointerFile(file) {
  if (!existsSync(file)) return false;
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(GIT_LFS_POINTER_HEADER.length);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8") === GIT_LFS_POINTER_HEADER;
  } finally {
    closeSync(fd);
  }
}

export function findGitLfsPointerFiles(root) {
  if (!existsSync(root)) return [];
  const pointers = [];
  const visit = (entryPath) => {
    for (const entry of readdirSync(entryPath, { withFileTypes: true })) {
      const child = path.join(entryPath, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && isGitLfsPointerFile(child)) pointers.push(child);
    }
  };
  visit(root);
  return pointers.sort();
}

export function assertNotGitLfsPointer(file, label = file) {
  if (!isGitLfsPointerFile(file)) return;
  throw new Error(`${pointerErrorSubject(label)} First pointer: ${file}`);
}

export function assertNoGitLfsPointers(root, label = root) {
  const pointers = findGitLfsPointerFiles(root);
  if (pointers.length === 0) return;
  const shown = pointers.slice(0, 10).join(", ");
  const suffix = pointers.length > 10 ? ` (+${pointers.length - 10} more)` : "";
  throw new Error(`${pointerErrorSubject(label)} Pointer files: ${shown}${suffix}`);
}
