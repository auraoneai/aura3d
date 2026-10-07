/**
 * PRD-05 §6.4 G5 — in-repo builder patterns. Assets whose provenance or glTF
 * `asset.generator` matches the repo's scripted-geometry builders are
 * programmer art: capped at `prototype` (role `proxy` allowed) unless they
 * pass G2, G3, G6 and a G9 record with a named human reviewer.
 *
 * Sources:
 *  - script paths under `apps/<app>/scripts/` named
 *    `build-*.mjs|ts`, `build-*.py`, `blender-build-*.py`,
 *    `build-review-*.mjs`, `register-*.mjs` (60+ such scripts exist today).
 *  - generator strings emitted by those builders: "Deep Recovery procedural
 *    GLB synth", "modular family synth", "deterministic * builder".
 *
 * `tests/unit/aura3d-cli/admission-gates.test.ts` enumerates
 * `git ls-files` over the builder-script glob and asserts every
 * builder-script name still matches, so new builder scripts cannot slip
 * past the pattern list.
 */

export const BUILDER_SOURCE_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)apps\/[^/]+\/scripts\/(?:build|blender-build|build-review|register)-[^/]*\.(?:mjs|ts|py)$/i,
];

export const BUILDER_GENERATOR_PATTERNS: readonly RegExp[] = [
  /deep recovery procedural glb synth/i,
  /modular family synth/i,
  /deterministic[^,;\n]*builder/i,
];

/** True when the file name (basename or repo-relative path) is a builder script. */
export function isBuilderScriptPath(path: string | undefined): boolean {
  if (!path) return false;
  const normalized = path.replace(/\\/g, "/");
  return BUILDER_SOURCE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** True when a glTF `asset.generator` or provenance generation string is an in-repo builder. */
export function isBuilderGenerator(generator: string | undefined): boolean {
  if (!generator) return false;
  return BUILDER_GENERATOR_PATTERNS.some((pattern) => pattern.test(generator));
}
