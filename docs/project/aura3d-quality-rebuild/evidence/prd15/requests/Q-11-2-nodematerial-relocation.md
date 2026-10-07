# Q-11-2 — NodeMaterial disposition (relocated, not deleted)

Status: RESOLVED BY LANE 15 — ownership premise in PRD was wrong

PRD-15 T6.6 lists `packages/materials/src/NodeMaterial.ts` as owner 11.
`QR_OWNERSHIP.json` assigns all of `packages/materials/src/**` to lane 15,
so the disposition was lane 15's call and was applied directly:

- `NodeMaterial` is a real implementation (20-line node-graph builder with
  id/type validation and `toShaderKey`), not a barrel — so it was NOT
  deleted as dead code.
- It moved with the rest of the materials tree to
  `packages/engine/src/devtools/materials/NodeMaterial.ts` (verbatim
  `git mv`), exported via the deprecated `./materials` alias until
  `removeIn: "4.0.0"`.
- No file outside the package consumed `NodeMaterial`
  (repo-wide rg: only the browser-index re-export referenced it), so no
  consumer repoint was required beyond the alias `of` update.

If lane 11 wants ownership of the class, it lives at
`packages/engine/src/devtools/materials/NodeMaterial.ts` as a pure-value
relocation — take it whole.
