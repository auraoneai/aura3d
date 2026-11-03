/**
 * Module specifiers in emitted JS, for tools/finalize-dist. A specifier never contains whitespace, parentheses or
 * semicolons; without that limit the bare-import arm also matched string text such as `"scalar-atlas import")`,
 * swallowed everything up to the next quote, and skipped the real `import("@aura3d/rendering/...")` after it (4.7.4
 * shipped that import unrewritten, so `vite build` of the hello-world template failed).
 */
export function specifierPattern(): RegExp {
  return /\b(from\s*["']|import\s*\(\s*["']|import\s*["'])([^"'\s();]+)(["'])/g;
}

/**
 * Bare `@aura3d/<workspace>` imports in a root-dist JS file. The root tarball ships every workspace package under
 * dist/<package>/, so it may reach another one only through a relative path (or the public `@aura3d/engine`
 * self-reference); a consumer installs only `@aura3d/engine` and cannot resolve the rest.
 */
export function findBareWorkspaceImports(source: string, workspacePackages: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']@aura3d\/([a-z0-9-]+)(?:\/[^"']*)?["']/g)) {
    const name = match[1]!;
    if (name !== "engine" && workspacePackages.has(name)) found.push(match[0]);
  }
  return found;
}
