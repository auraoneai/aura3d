/**
 * esbuild `external` list for browser bundles of the packed candidate engine made inside the
 * restored consumer. The consumer installs only the packages the candidate declares, so the
 * optional peers of the engine (physics-rapier, navigation-recast) are absent, and
 * @gltf-transform/core reaches `import("node:fs"|"node:path")` in a node-only branch. Both are
 * reached only through dynamic imports that a browser never runs; real consumer builds (Vite) stub
 * or defer them. Same allow-list as tools/installed-tree-shaking. Nothing from @aura3d/* is external.
 */
export const NATIVE_BUNDLE_EXTERNALS: string[] = [
  "@dimforge/rapier3d-compat", "recast-navigation", "recast-navigation/*", "node:fs", "node:path"
];
