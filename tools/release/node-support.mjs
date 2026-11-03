// Supported Node.js runtimes for packed Aura3D consumers. The root manifest's
// `engines.node` must equal NODE_ENGINE_RANGE; any workspace package that
// declares `engines.node` must declare the same range. 22.12 is the floor
// because the CommonJS math bridge (tools/finalize-dist) relies on unflagged
// synchronous require(esm).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const NODE_ENGINE_RANGE = '>=22.12.0';
export const MINIMUM_NODE_VERSION = Object.freeze([22, 12, 0]);
/** Majors the packed ESM/CJS consumer matrix must report on (executed or explicitly unavailable). */
export const SUPPORTED_NODE_MAJORS = Object.freeze([22, 24, 26]);

export function parseNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error(`Invalid Node.js version: ${version}`);
  return match.slice(1).map(Number);
}

export function satisfiesNodeEngine(version) {
  const parts = parseNodeVersion(version);
  for (let i = 0; i < 3; i += 1) {
    if (parts[i] !== MINIMUM_NODE_VERSION[i]) return parts[i] > MINIMUM_NODE_VERSION[i];
  }
  return true;
}

/** Fail if the root manifest or any workspace package disagrees with the supported range. */
export function assertDeclaredNodeEngines(root = process.cwd()) {
  const manifests = ['package.json', ...readdirSync(resolve(root, 'packages')).map(name => `packages/${name}/package.json`)
    .filter(path => existsSync(resolve(root, path)))];
  const mismatches = [];
  for (const path of manifests) {
    const declared = JSON.parse(readFileSync(resolve(root, path), 'utf8')).engines?.node;
    if (path === 'package.json' ? declared !== NODE_ENGINE_RANGE : declared !== undefined && declared !== NODE_ENGINE_RANGE) {
      mismatches.push(`${path}: ${declared ?? 'missing'}`);
    }
  }
  if (mismatches.length) throw new Error(`engines.node must be ${NODE_ENGINE_RANGE}: ${mismatches.join('; ')}`);
  return NODE_ENGINE_RANGE;
}

/**
 * Resolve the execution matrix. The current executable is always a cell;
 * `A3D_NODE_MATRIX` may name further Node executables (path-delimited by
 * commas). Every supported major without an executable is recorded as
 * unavailable with a reason, never silently dropped. An executable outside the
 * supported range, or two executables for one major, is an error.
 */
export function resolveNodeMatrix({ env = process.env, execPath = process.execPath, run = file => execFileSync(file, ['--version'], { encoding: 'utf8', timeout: 30_000 }) } = {}) {
  const executables = [execPath, ...String(env.A3D_NODE_MATRIX ?? '').split(',').map(item => item.trim()).filter(Boolean)];
  const byMajor = new Map();
  for (const executable of new Set(executables)) {
    const version = run(executable).trim();
    if (!satisfiesNodeEngine(version)) throw new Error(`Node ${version} at ${executable} is outside ${NODE_ENGINE_RANGE}`);
    const major = parseNodeVersion(version)[0];
    if (!SUPPORTED_NODE_MAJORS.includes(major)) throw new Error(`Node ${version} at ${executable} is not a supported matrix major (${SUPPORTED_NODE_MAJORS.join(', ')})`);
    if (byMajor.has(major)) throw new Error(`Node matrix names two executables for major ${major}`);
    byMajor.set(major, { major, status: 'available', executable, version });
  }
  return SUPPORTED_NODE_MAJORS.map(major => byMajor.get(major) ??
    { major, status: 'unavailable', reason: `no Node ${major} executable in this job (set A3D_NODE_MATRIX to execute it)` });
}
