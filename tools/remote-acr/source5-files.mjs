// Candidate file list for tools and tests that enumerate repository files.
//
// In a Git checkout this is `git ls-files` (same flags the 5.0 source-pass
// launcher stages with). The ACR source pass (tools/remote-acr/run-source5.sh)
// ships the staged files without `.git`, plus a `shasum -a 256` manifest of
// exactly those files at tools/remote-acr/.source5-manifest.txt; without Git
// history that manifest is the candidate's file list.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCE5_MANIFEST = 'tools/remote-acr/.source5-manifest.txt';

/** True when `repoRoot` is inside a Git work tree. */
export function hasGitWorkTree(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
  } catch {
    return false;
  }
}

/** Repo-relative paths from the staged source5 manifest, or null when absent. */
export function readSource5Manifest(repoRoot) {
  const path = join(repoRoot, SOURCE5_MANIFEST);
  if (!existsSync(path)) return null;
  const files = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const match = /^[0-9a-f]{64} {2}(.+)$/.exec(line);
    if (!match) throw new Error(`Invalid source5 manifest line: ${line.slice(0, 120)}`);
    files.push(match[1].startsWith('./') ? match[1].slice(2) : match[1]);
  }
  return files;
}

/**
 * Candidate files under `pathspecs` (repo-relative directory or file paths;
 * empty = all). Git: `git ls-files [--others --exclude-standard]`. No Git:
 * the source5 manifest (which itself is `--cached --others --exclude-standard`).
 * Throws when neither source is available.
 */
export function listCandidateFiles(repoRoot, pathspecs = [], { includeUntracked = false } = {}) {
  if (hasGitWorkTree(repoRoot)) {
    const args = ['ls-files', '-z', ...(includeUntracked ? ['--cached', '--others', '--exclude-standard'] : []), '--', ...pathspecs];
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  }
  const staged = readSource5Manifest(repoRoot);
  if (!staged) throw new Error(`No Git work tree and no ${SOURCE5_MANIFEST} at ${repoRoot}`);
  if (pathspecs.length === 0) return staged;
  const specs = pathspecs.map((spec) => spec.replace(/\/+$/, ''));
  return staged.filter((file) => specs.some((spec) => file === spec || file.startsWith(`${spec}/`)));
}
