# Q-13-5 — `aura3d-threejs-migration` skill update (lane 13)

**GitHub issue:** #695

**Filed by:** Lane 15 (PRD-15 T6.2)
**Status:** request
**PRD refs:** §6.8 (line 914: "Request Q-13-5: 13 updates the `aura3d-threejs-migration`
skill to the CLI codemod and removes references to `ThreeCompatibilityMatrix` and
`ApproximationLedger`, from facts F-15-* (C-40)")

## Ask

Two identical copies (both owner 13):

- `packages/create-aura3d/skills/aura3d-threejs-migration/SKILL.md`
- `packages/aura3d-cli/skills/aura3d-threejs-migration/SKILL.md`

Update to describe the CLI codemod `aura3d migrate three` (in
`packages/aura3d-cli/src/migrate-three/`, landed by T6.1) and remove references to
`ThreeCompatibilityMatrix`, `ApproximationLedger`, and the deleted
`@aura3d/three-compat` runtime package. Specific stale spots (line numbers at
time of filing):

- line 3 description: "`three-compat-*` template … `@aura3d/three-compat` ledger"
- lines 32-39: template table lists the old `three-compat-*` names (see Q-13-4 rename)
- lines 71-79: `getApproximationLedgerRow` guidance
- lines 108-113: GitHub links to `packages/three-compat/src/…`, deleted tests,
  and the `three-compat-custom-threejs-migration` template

Keep the copies in sync — they are byte-identical today.
