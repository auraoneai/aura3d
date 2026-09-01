# Mech Hangar → Arena

**Label:** `prototype` · **Route:** `/apps/showcase-mech-hangar/` · **PRD:** `NextGames-PRD/07-Mech-Hangar.md`

Aura3D's typed, provenance-tracked assets are the mechanic. Assemble a mech from the
original in-repository MH-2M modular family (chassis / arms / legs / weapon, 4 options each), watch
the stat holograms move, validate the build, lock in, and fight a rival mech driven by the
engine's `createCombatAi`. The hangar and arena use the release-probed CC0 expressive-robot
asset as the connected visual shell; the selected MH-2M parts remain the socketed build
contract and the selected weapon is mounted as a visible hardpoint. Rematches cycle rival
aggression: **0.35 keep-away → 0.55 balanced → 0.8 rushdown**.

## Claim boundary (read before quoting this route)

- **Root safe API only.** Everything runs through `createAuraApp` + public game helpers
  (`game.input`, `game.runtimeNode`, `characterAssembly`, `createCombatAi`,
  `createGameAudio`). No renderer internals, no production-runtime imports.
- **Route-local glue only.** The combat rules (strike windows, i-frames, guard break,
  power economy, KO), the hangar UI, the feel pass and the audio controller are written
  in this app for this app. **This is not a reusable fighting/character/combat kit**, and
  no such claim is made anywhere in this route.
- **Primitives are set dressing** (hangar floor/wall, turntable, pit rims) or
  renderer-owned feedback particles (hit sparks, landing dust). The connected mech silhouette
  is a typed, release-probed GLB shell, while the build contract remains the typed MH-2M
  assembly plan and its visible weapon hardpoint; a build is never a CSS recolor or a skin swap.
- **Prototype.** Independent human visual review is pending; this route is not a public
  release candidate.

## The asset passport

Every part option is an original CLI-registered CC0 typed asset generated deterministically
by `scripts/build-models.mjs`. The GLBs declare one-metre units, centered part origins,
`+Z` forward / `+Y` up, the `MH-2M` family, and the exact `root`, `chest`, `hips`, or
`right-hand` socket they satisfy. `scripts/curate-parts.mjs` rejects hash duplicates,
out-of-envelope bounds, missing silhouette/material layers, stale manifest metadata, and
missing root-rendered probes. The current gate is **16/16 compatible, 16/16 release-proven,
16/16 unique geometry hashes: GO**. The report is `parts-curation-report.json`; the hangar
passport reads its source, author, and CC0 license records.

## Assembly pipeline (player-visible)

1. Cycle slots (`1`-`4`, arrow keys): the preview mech updates the typed MH-2M assembly
   selection and its shell/hardpoint state — pixels really change (spec-proven).
2. Stat holograms update from an authored part-to-stats table
   (chassis to armor, legs to speed, arms to guard, weapon to power/special cost).
3. `Enter` builds a `characterAssembly` plan and validates it with
   `validateCharacterAssemblyPlan`; only a ready plan can lock in. Invalid plans are
   rejected before lock-in (unit-tested + in-page probe).

## Arena

Fixed-step (60 Hz) route-local bout sim: light/heavy/special strikes with authored
startup/active/recovery windows, i-frames, knockback, guard drain with break stagger,
power-gated specials, pit walls, KO. The rival is a fixed loadout driven by
`createCombatAi` with seeded decisions; rematches cycle ONLY the aggression preset so
preset differences are measurable (unit + browser specs assert different outcome hashes
and different spacing behaviour). `R` rematch · `Backspace` back to the hangar (build persists).

## Controls

| Mode | Input |
|---|---|
| Hangar | `1`-`4` select slot · arrows cycle part · `Enter` lock build · mouse-drag orbit |
| Arena | `A`/`D` move · `Space` jump-thrust · `J`/`K` light/heavy · `L` special · `Shift` guard · `P` pause · `R` rematch |
| Touch | dual-zone buttons mirroring arena keys |

## Audio

Ten cues synthesized in-repo by `scripts/build-sfx.mjs` (author "Aura3D synthesis",
CC0-1.0), registered through the asset CLI, mixed through four buses (ui/combat/world/
ambient). The servo cue plays on every slot cycle; hits, blocks, guard breaks, specials,
KO and walk cadence are wired to sim events.

## Evidence

- `window.__MECH_HANGAR_EVIDENCE__` (alias of `window.__AURA3D_SHOWCASE_MECH_HANGAR__`):
  mounted, mode, slots, selectedParts, stats, assemblyValidated, boutState,
  rivalAggression, koEvents, audioCues, and route metadata (status/controls/systems/claimBoundary).
- Browser specs: `tests/browser/mech-hangar-build.spec.ts` (curation gate, default-vs-swap
  hangar artifacts with source/asset bindings, all sixteen
  selections with distinct assembly-pixel hashes and owning stat results, validation rejection,
  lock-in, and mobile) and `tests/browser/mech-hangar-arena.spec.ts`
  (movement/strike/pause/KO/rematch, aggression presets measurably differ, reduced-motion gates).
- Unit specs: `tests/unit/apps/mech-hangar-assembly.test.ts`,
  `tests/unit/apps/mech-hangar-combat.test.ts` (seeded determinism via outcome hashes).
- `performance-report.json`: 20,000 fixed simulation steps; current p95 is 0.0014 ms,
  with 42 browser-observed hangar draw calls against a 300-call budget.
- `deploy-report.json`: strict 16-model release deploy and strict dist/source deploy both
  pass with zero warnings. WAV geometry is intentionally outside the model-bounds gate;
  all ten candidate-quality typed CC0 cues are validated by generated route health.
- `route-health.json`: machine pass, classification `prototype-blocked`; independent exact-
  artifact review remains pending.
- Source- and producer-bound screenshots/receipts are retained under
  `tests/reports/mech-hangar/`. `hangar-default.png` and `hangar-swap.png` are the mandatory
  default-state visual pair; `build-core-evidence.json` binds both to the current route source
  and `assets.showcaseExpressiveRobot` hash. The route-primary proof is retained under
  `tests/reports/showcase-route-primary-probes/`.

## Commands

```bash
pnpm dev                 # vite dev server
pnpm typecheck           # strict tsc over src/
pnpm build               # production bundle
pnpm models              # regenerate the original 16-part MH-2M GLB family
pnpm register:models     # register models; consumes current root-rendered probes
pnpm sfx                 # regenerate the ten WAV cues
pnpm register:sfx        # idempotent CLI registration into the root manifest
pnpm curate:parts        # deterministic local 16-part compatibility/release gate
pnpm evidence:performance
pnpm evidence:deploy
pnpm evidence:route-health
```
