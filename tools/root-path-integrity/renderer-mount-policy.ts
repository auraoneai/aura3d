/**
 * muse3jsparity-PRD PART T box T1a — assertNoUndocumentedRendererMount.
 *
 * Source-verified basis (2026-09-04, do not trust lane summaries):
 * - Root `createAuraApp`/`createGameApp` mount the production bridge (pixel
 *   owner for all root routes).
 * - `A3DRenderer` (`packages/engine/src/advanced-runtime/A3DRenderer.ts:41`)
 *   holds the core `Renderer` as `readonly renderer` (:47) and every
 *   `render`/`renderAsync` overload delegates to it (:76-106) — a
 *   lifecycle/evidence wrapper, not a second renderer.
 * - `AdvancedRenderer` (`packages/rendering/src/advanced-runtime/`) wraps the
 *   same core `Renderer`; zero routes mount it (enforced below).
 * - 11 evidence/perf routes mount the bare core `Renderer.create` from
 *   `@aura3d/rendering` directly (e.g. `apps/shadow-cascade-evidence`,
 *   `apps/instancing-performance`); these are rendering-internals evidence
 *   routes, never user-facing scaffolds. They are a documented bucket here,
 *   apps-scoped, not a free pass for new mounts.
 * - Live tree (624 route sources, 2026-09-04): zero `three` imports, zero
 *   `WebGLRenderer`, zero `new Renderer(`, zero `unsafeModelUrl`, zero
 *   string-ID `model("...")` mounts. The repo's own `@aura3d/assets`
 *   GLTFLoader (loader test routes, editor panel) is legitimate package
 *   surface — only three's loader/imports are forbidden here.
 *
 * This module is pure (no fs): tests feed it file contents. Anything that
 * mounts pixels without landing in a documented bucket throws.
 */

export type DocumentedRendererBucket =
  | "root-production-bridge"
  | "advanced-subordinate"
  | "bare-core-evidence"
  | "no-mount";

export interface RouteMountClassification {
  readonly path: string;
  readonly bucket: DocumentedRendererBucket;
  readonly detail: string;
}

export interface UndocumentedRendererMount {
  readonly path: string;
  readonly reason: string;
}

const COMMENT_PATTERN = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

function stripComments(source: string): string {
  return source.replace(COMMENT_PATTERN, "");
}

function stripTypeImports(source: string): string {
  return source.replace(/^\s*import\s+type\s+[^;]+;/gm, "");
}

function clean(source: string): string {
  return stripTypeImports(stripComments(source));
}

const ROOT_MOUNT = /\bcreateAuraApp\s*\(|\bcreateGameApp\s*\(/;
// A root mount with a null canvas target is headless game logic (no pixels;
// e.g. `createGameApp(null, {...})` in apps/aura-clash-showcase): it never
// claims pixel ownership, so it does not create a second renderer bucket.
const HEADLESS_ROOT_MOUNT = /\bcreate(?:AuraApp|GameApp)\s*\(\s*null\b/;
const HEADLESS_ROOT_MOUNT_GLOBAL = /\bcreate(?:AuraApp|GameApp)\s*\(\s*null\b/g;
const ADVANCED_MOUNT = /\bA3DRenderer\s*\.\s*create\s*\(|\bnew\s+A3DRenderer\s*\(/;
const BARE_CORE_MOUNT = /(?<!A3D)(?<!\w)Renderer\s*\.\s*create\s*\(/;
const ADVANCED_ALIAS_MOUNT = /\bAdvancedRenderer\s*\.\s*create\s*\(|\bnew\s+AdvancedRenderer\s*\(/;

const FORBIDDEN_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["three.js WebGLRenderer mount", /\bWebGLRenderer\b/],
  ["raw three.js import", /from\s+["']three["']/],
  ["three.js examples/addons import", /from\s+["']three\/(examples|addons)\//],
  ["three.js GLTFLoader import", /\bGLTFLoader\b[^\n;]*from\s+["']three/],
  ["bare `new Renderer(` construction", /\bnew\s+Renderer\s*\(/],
  ["unsafeModelUrl mount", /\bunsafeModelUrl\s*\(/],
  ["string-ID model mount", /\bmodel\s*\(\s*["'`]/],
  ["raw .glb/.gltf URL mount", /\bmodel\s*\([^)]*\.glb["'`\s)]/],
];

const ADVANCED_RUNTIME_IMPORT = /advanced-runtime/;

function scopeOf(path: string): "apps" | "examples" | "templates" | "other" {
  if (path.startsWith("apps/")) return "apps";
  if (path.startsWith("examples/")) return "examples";
  if (path.startsWith("packages/create-aura3d/templates/")) return "templates";
  return "other";
}

/**
 * Classify one route source. Returns a violation when the source mounts
 * pixels outside the documented buckets, mounts the zero-route alias, uses a
 * forbidden primitive, or mounts advanced/bare renderers outside apps/.
 */
export function classifyRouteMount(path: string, source: string): {
  readonly classification: RouteMountClassification | null;
  readonly violation: UndocumentedRendererMount | null;
} {
  const code = clean(source);
  for (const [reason, pattern] of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return {
        classification: null,
        violation: { path, reason: `forbidden renderer primitive: ${reason}` },
      };
    }
  }
  if (ADVANCED_ALIAS_MOUNT.test(code)) {
    return {
      classification: null,
      violation: {
        path,
        reason: "AdvancedRenderer is a documented zero-route alias; a route mounts it",
      },
    };
  }
  const scope = scopeOf(path);
  const mounts: Array<{ bucket: DocumentedRendererBucket; detail: string }> = [];
  const headlessRootOnly =
    ROOT_MOUNT.test(code) &&
    code.replace(HEADLESS_ROOT_MOUNT_GLOBAL, "").search(ROOT_MOUNT) === -1;
  if (ROOT_MOUNT.test(code) && !headlessRootOnly) {
    mounts.push({ bucket: "root-production-bridge", detail: "createAuraApp/createGameApp production bridge" });
  }
  const headlessNote = headlessRootOnly ? " + headless root logic mount (null target, no pixel claim)" : "";
  if (ADVANCED_MOUNT.test(code)) {
    if (!ADVANCED_RUNTIME_IMPORT.test(code)) {
      return {
        classification: null,
        violation: { path, reason: "A3DRenderer mount without an advanced-runtime import (unattributed renderer)" },
      };
    }
    if (scope !== "apps") {
      return {
        classification: null,
        violation: { path, reason: `A3DRenderer subordinate mount outside apps/ (scope: ${scope})` },
      };
    }
    mounts.push({ bucket: "advanced-subordinate", detail: "A3DRenderer via @aura3d/engine/advanced-runtime" });
  }
  if (BARE_CORE_MOUNT.test(code)) {
    if (scope !== "apps") {
      return {
        classification: null,
        violation: { path, reason: `bare core Renderer.create mount outside apps/ evidence routes (scope: ${scope})` },
      };
    }
    mounts.push({ bucket: "bare-core-evidence", detail: "bare core Renderer.create evidence route" });
  }
  if (mounts.length === 0) {
    return {
      classification: { path, bucket: "no-mount", detail: "no renderer mount in this source" },
      violation: null,
    };
  }
  const buckets = new Set(mounts.map((mount) => mount.bucket));
  if (buckets.size > 1) {
    return {
      classification: null,
      violation: {
        path,
        reason: `route mounts more than one renderer bucket: ${[...buckets].join(", ")}`,
      },
    };
  }
  const single = mounts[0] as { bucket: DocumentedRendererBucket; detail: string };
  return {
    classification: { path, bucket: single.bucket, detail: `${single.detail}${headlessNote}` },
    violation: null,
  };
}

/** Pure scan: every violation in the set, in path order. Empty means clean. */
export function findUndocumentedRendererMounts(
  files: ReadonlyArray<{ readonly path: string; readonly content: string }>
): readonly UndocumentedRendererMount[] {
  const violations: UndocumentedRendererMount[] = [];
  for (const file of files) {
    const { violation } = classifyRouteMount(file.path, file.content);
    if (violation) violations.push(violation);
  }
  return violations.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Fail-closed gate: throws listing every undocumented mount. */
export function assertNoUndocumentedRendererMount(
  files: ReadonlyArray<{ readonly path: string; readonly content: string }>
): void {
  const violations = findUndocumentedRendererMounts(files);
  if (violations.length > 0) {
    throw new Error(
      `Undocumented renderer mounts (${violations.length}):\n${violations
        .map((violation) => `  ${violation.path}: ${violation.reason}`)
        .join("\n")}`
    );
  }
}
