/**
 * muse3jsparity-PRD PART T box T2a — assertPrimitiveHeroDisclosure.
 *
 * Source-verified basis (2026-09-04 against
 * `packages/engine/src/agent-api/index.ts`): the root `character` object
 * (`:8685`) ships exactly four primitive-built hero builders —
 * `primitiveHumanoid` (`:8181`, hierarchical primitives),
 * `lowPolyHumanoid` (`:6282`, resolved to the authored shell at `:8248`),
 * `authoredHumanoid`, and `proceduralHumanMesh` — plus the typed rig exits
 * `builtInHumanoidAsset` and `importedRigRuntime`. (`skeleton`, `clips`,
 * `performance`, `visualQA` are debug/data helpers, not heroes, and are
 * deliberately out of scope: primitives remain legal as set dressing,
 * collision guides, and debug rigs.)
 *
 * Gate rule (PRD T2 task 1, exact): a source file that mounts a
 * primitive-built humanoid hero must carry the explicit abstract label;
 * removing the primitive hero (typed-rig migration) also clears the file. A
 * retained primitive fallback behind a typed-first branch is still a
 * violation — e.g. `apps/world-war-x-showcase/src/WorldWarXApp.ts:1074`
 * (`character.lowPolyHumanoid` fallback, no abstract label; OPEN, route-owner
 * lane, reported by the T2 test fixture).
 *
 * INTEGRITY NOTE (T2 task 2 blocker, source-verified 2026-09-04): the typed
 * exits this gate migrates toward do not currently survive the production
 * bridge. `character.builtInHumanoidAsset()` builds an absolute import.meta
 * URL with no `public/aura-assets/` manifest sourcePath, so
 * `createAssetProvenance` (`packages/engine/src/agent-api/index.ts:16890`)
 * classifies it `remote` without durable manifest provenance → source
 * `"unsafe-url"` — and `createProductionRuntimeSceneRenderer` (:12810)
 * mounts ONLY `"typed-aura-assets-manifest"` models, silently dropping the
 * hero (browser-proven: drawCalls 0, mounted:false, zero warnings, while the
 * identical harness with a manifest asset mounts 13 drawCalls). Migrating the
 * three templates onto `builtInHumanoidAsset` before the engine lane fixes
 * provenance would ship invisible heroes. Unblock (engine lane, NOT this
 * lane's file scope): give the bundled fixtures durable manifest provenance
 * or bless bundled-fixture URLs in `createAssetProvenance`, with a browser
 * mount proof per rig.
 *
 * This module is pure (no fs): tests feed it file contents.
 */

export interface PrimitiveHeroViolation {
  readonly path: string;
  readonly heroes: readonly string[];
}

/** Primitive-built humanoid hero mounts (method or prefab spelling). */
const PRIMITIVE_HERO_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["character.primitiveHumanoid", /\bcharacter\s*\.\s*primitiveHumanoid\s*\(/],
  ["character.lowPolyHumanoid", /\bcharacter\s*\.\s*lowPolyHumanoid\s*\(/],
  ["character.authoredHumanoid", /\bcharacter\s*\.\s*authoredHumanoid\s*\(/],
  ["character.authoredLowPolyHumanoid", /\bcharacter\s*\.\s*authoredLowPolyHumanoid\s*\(/],
  ["character.proceduralHumanMesh", /\bcharacter\s*\.\s*proceduralHumanMesh\s*\(/],
  ["prefabs.primitiveHumanoid", /\bprefabs\s*\.\s*primitiveHumanoid\s*\(/],
];

/**
 * The explicit abstract label. File-level by design: the label is a release
 * statement about the file's hero ("abstract android", "abstract marker"),
 * and the gate treats its absence as fail-closed.
 */
const ABSTRACT_LABEL_PATTERN = /abstract/i;

/** Typed-rig exits (informational: migration removes the hero, which clears the file). */
const TYPED_RIG_PATTERN = /\bbuiltInHumanoidAsset\s*\(|\bimportedRigRuntime\s*\(|\bmodel\s*\(\s*assets\s*\./;

export function usesTypedRig(source: string): boolean {
  return TYPED_RIG_PATTERN.test(source);
}

function findPrimitiveHeroes(source: string): readonly string[] {
  const heroes: string[] = [];
  for (const [name, pattern] of PRIMITIVE_HERO_PATTERNS) {
    if (pattern.test(source)) heroes.push(name);
  }
  return heroes;
}

/** Pure scan: files mounting an undisclosed primitive hero, in path order. */
export function findUndisclosedPrimitiveHeroes(
  files: ReadonlyArray<{ readonly path: string; readonly content: string }>
): readonly PrimitiveHeroViolation[] {
  const violations: PrimitiveHeroViolation[] = [];
  for (const file of files) {
    const heroes = findPrimitiveHeroes(file.content);
    if (heroes.length > 0 && !ABSTRACT_LABEL_PATTERN.test(file.content)) {
      violations.push({ path: file.path, heroes });
    }
  }
  return violations.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Fail-closed gate: throws listing every undisclosed primitive hero. */
export function assertPrimitiveHeroDisclosure(
  files: ReadonlyArray<{ readonly path: string; readonly content: string }>
): void {
  const violations = findUndisclosedPrimitiveHeroes(files);
  if (violations.length > 0) {
    throw new Error(
      `Primitive heroes without the abstract label (${violations.length}):\n${violations
        .map((violation) => `  ${violation.path}: ${violation.heroes.join(", ")}`)
        .join("\n")}\nAdd the explicit abstract label or migrate to character.builtInHumanoidAsset()/character.importedRigRuntime().`
    );
  }
}
