# Q-13-4 — three-compat template cleanup (lane 13)

**Filed by:** Lane 15 (PRD-15 T6.3)
**Status:** request — lane 15 does not edit `templates/**` or `packages/create-aura3d/**`
**PRD refs:** §6.8 "three-compat honesty", T6.3 (line 1722), request-table row Q-13-4 (line 1453), R20.

## Ask

1. **Delete** the 8 root stub templates `templates/three-compat-*` (two-line stubs):
   `three-compat-architecture-interior`, `three-compat-asset-inspector`,
   `three-compat-character-viewer`, `three-compat-custom-threejs-migration`,
   `three-compat-large-scene`, `three-compat-material-authoring`,
   `three-compat-postprocess-scene`, `three-compat-premium-product-viewer`.

2. **Rename** `packages/create-aura3d/templates/three-compat-*` to the §6.8 names:

   | old | new |
   |---|---|
   | `three-compat-architecture-interior` | `architecture-interior` |
   | `three-compat-asset-inspector` | `asset-inspector` |
   | `three-compat-character-viewer` | `character-viewer` |
   | `three-compat-custom-threejs-migration` | `custom-scene` |
   | `three-compat-large-scene` | `large-scene` |
   | `three-compat-material-authoring` | `material-authoring` |
   | `three-compat-postprocess-scene` | `postprocess-scene` |
   | `three-compat-premium-product-viewer` | `premium-product-viewer` |

3. **Add a `templateAliases` warning map** in `packages/create-aura3d/src/index.ts`:
   `--template three-compat-<x>` maps to the new name and prints a deprecation
   warning ("renamed; `three-compat-<x>` alias removed in the next minor") for
   one minor. `src/index.ts:18-25` currently enumerates the 8 old names.

4. **Unit test** — attach this file as the acceptance test:
   "`--template three-compat-large-scene` scaffolds `large-scene` and prints the
   warning". Suggested location `packages/create-aura3d/tests/template-aliases.test.ts`
   (lane 13 picks the real spot):

   ```ts
   import { describe, expect, it } from "vitest";
   // scaffold via create-aura3d --template three-compat-large-scene into a tmp dir;
   // expect(files written under the `large-scene` template) and
   // expect(stderr).toMatch(/three-compat-large-scene.*renamed.*large-scene/);
   ```

## Companion updates already owned by lane 15

- `tests/browser/three-compat-templates.spec.ts` (owner 15) enumerates the 8 old
  template names — lane 15 will update its list + name once the rename lands.
- `tests/integration/three-compat-create-aura3d.test.ts` (owner 15) exercises
  `create-aura3d` against the templates — same.

## Context

`@aura3d/three-compat` is deleted in this phase (T6.2). The 8 `create-aura3d`
templates are plain engine scenes that never imported the package — only the
`three-compat-` label is misleading, hence rename-not-delete.
