# Mech Hangar → Arena

**Label:** `prototype` · **Route:** `/apps/showcase-mech-hangar/` · **PRD:** `NextGames-PRD/07-Mech-Hangar.md`

Aura3D's typed, provenance-tracked assets are the mechanic. Assemble a mech from the
MH-2M slot contract (chassis / arms / legs / weapon, 4 options each), watch the stat
holograms move, validate the build, lock in, and fight a rival mech driven by the engine's
`createCombatAi`. The current in-repository options are a deterministic procedural curation
family authored by the in-repository CC0 compiler: four chassis, arm, leg, and weapon
variants share the same metre-scale sockets and can be validated and mounted as one MH-2M
build. This is still a route-local prototype, not a reusable production kit. Rematches cycle
rival aggression: **0.35 keep-away → 0.55 balanced → 0.8 rushdown**.

## Claim boundary (read before quoting this route)

- **Root safe API only.** Everything runs through `createAuraApp` + public game helpers
  (`game.input`, `game.runtimeNode`, `characterAssembly`, `createCombatAi`,
  `createGameAudio`). No renderer internals, no production-runtime imports.
- **Route-local glue only.** The combat rules (strike windows, i-frames, guard break,
  power economy, KO), the hangar UI, the feel pass and the audio controller are written
  in this app for this app. **This is not a reusable fighting/character/combat kit**, and
  no such claim is made anywhere in this route.
- **Primitives are set dressing** (hangar floor/wall, turntable, pit rims) or
  renderer-owned feedback particles (hit sparks, landing dust). The visible review silhouette
  is the four typed, release-probed MH-2M modules mounted through the validated socket plan;
  no whole-body fallback or CSS recolor is used. Every selected slot changes the rendered
  assembly and its owning gameplay stat. The route does not claim a reusable animation,
  fighting, or character kit.
- **Prototype.** Independent human visual review is pending; this route is not a public
  release candidate.

## The asset passport

Every part option is a typed CLI-registered asset. The legacy curation report proves
one-metre units, centered part origins, `+Z` forward / `+Y` up, the `MH-2M` family, and the
exact `root`, `chest`, `hips`, or `right-hand` socket metadata. `scripts/check-modular-family.mjs`
is the stricter family gate: it checks the license-clean original declaration, authored
armor/frame/joint/emissive material layers, exact GLB bounds, and feet/torso/limb/weapon
contact. The current report is **GO** with **16/16 compatible, release-proven, and unique**
parts. The report is machine-readable stdout and never rewrites assets.

The shared route-primary gate names `assets.mechChassisA` as the hero and retains
`assets.mechArmsA`, `assets.mechLegsA`, and `assets.mechWeaponA` as typed secondary slots.
The default/swap verifier checks that all four bindings are present, current, and visibly
different after a valid slot change. The legacy `register:shell` script remains only as a
historical migration utility and is not used by the live route.

## Assembly pipeline (player-visible)

1. Cycle slots (`1`-`4`, arrow keys): the preview mech updates the typed MH-2M assembly
   selection and its socketed hardpoint state — pixels really change (spec-proven).
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
- `performance-report.json`: 20,000 fixed simulation steps plus browser-observed hangar
  draw calls against a 300-call budget; the generated receipt records the current p95 and
  draw count.
- `deploy-report.json`: strict 16-model release deploy and strict dist/source deploy both
  pass with zero warnings. WAV geometry is intentionally outside the model-bounds gate;
  all ten candidate-quality typed CC0 cues are validated by generated route health.
- `route-health.json`: machine pass, classification `prototype-blocked`; independent exact-
  artifact review remains pending.
- Source- and producer-bound screenshots/receipts are retained under
  `tests/reports/mech-hangar/`. `hangar-default.png` and `hangar-swap.png` are the mandatory
  default-state visual pair; `build-core-evidence.json` binds both to the current route source
  and the four typed MH-2M asset hashes. The route-primary proof is retained under
  `tests/reports/showcase-route-primary-probes/`.

## Commands

```bash
pnpm dev                 # vite dev server
pnpm typecheck           # strict tsc over src/
pnpm build               # production bundle
pnpm models              # regenerate the original 16-part MH-2M GLB family
pnpm register:models     # register models; consumes current root-rendered probes
pnpm register:shell      # legacy migration utility; not used by the live typed assembly route
pnpm sfx                 # regenerate the ten WAV cues
pnpm register:sfx        # idempotent CLI registration into the root manifest
pnpm curate:parts        # deterministic local 16-part compatibility/release gate
pnpm verify:modular-family # strict visual-family/provenance/socket/grounding gate (16/16 GO)
pnpm verify:default-swap # verify source-bound four-module default/swap browser receipt
pnpm evidence:performance
pnpm evidence:deploy
pnpm evidence:route-health
```
