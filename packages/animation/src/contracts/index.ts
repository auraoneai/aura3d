// C-19 — contracts subpath barrel (CONTRACTS.md §3.8).
// PR 0a added the `./contracts` export to packages/animation/package.json
// targeting dist/contracts/index.js but never created this barrel — restored
// here so the published subpath resolves (public-surface-diff unresolved fix).
// Provider: PRD 06. Flag: A3D_QR_ANIMATION.
export * from "./pose.js";
