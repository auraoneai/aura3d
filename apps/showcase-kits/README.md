# apps/showcase-kits

PRD-14 §6.4 shared-kit staging (row 14-KITS, tasks T3.1-T3.4). Owned by lane 14 through the `apps/showcase-*/` prefix. Internal only: this app has no
deploy target, no `route-health.json`, and is not in `tools/quality-rebuild-capture/games.json`.

| Path | Purpose |
|---|---|
| `kit.schema.json` | Schema for every `kit.json`: per file `source`, `licence` (allow-list), `sha256`, `bytes`, `triangles`, `textures[]`, `lookdev: { runId, reviewer, verdict }` |
| `K1`-`K7`, `K9/kit.json` | One manifest per kit. Contents and budgets come from the PRD-14 §6.4 table |
| `K8/cues.json` | Every `art/direction.ts` `audio[]` cue for the 18 games, mapped to licensed samples (`provenance: "sample"`). Target −16 LUFS integrated |
| `lookdev/` | Look-dev page: `/apps/showcase-kits/lookdev/?kit=K2&hdri=studio-small-08-1k` on the root Vite dev server |
| `package.json` | `three@0.185.1` exact, private. `apps/*` is not a pnpm workspace glob, so this file does not change `pnpm-lock.yaml` |

## Verdict model

- Every kit and every file starts at `verdict: "pending"` with `reviewer: null` and `runId: null`.
- Only a human reviewer moves a verdict to `accept` or `reject`, and only on the three r185 pane of `lookdev/`. The verdict records the reviewer
  and the look-dev run id. `tests/qr/prd14/unit/kits.test.ts` fails if an `accept` is missing either one, or if a kit-level `accept` has a file
  that is not accepted. Agents never write `accept`.
- No route may reference a kit file until that file is `accept` (T3.4, admission through `aura3d assets add` from the consuming route's PR).

## Current state (scaffold)

- K1 lists the three 1k benchmark HDRIs from `fixtures/environment-corpus/hdri/` by path, with verified SHA-256. K2-K7 and K9 have no staged
  candidates yet.
- K8 references the 11 Kenney CC0 samples that Aura Clash already ships, in place. Only Aura Clash `hit` is mapped (partial). The other 90 cues
  are `unsourced`. `integratedLufs` stays `null` until the remote `ffmpeg -af ebur128` run records values and its run id.
- The `lookdev/` Aura pane renders a material ladder under the selected K1 HDRI. The three r185 pane is pending because
  `tests/unit/agent-api/public-example-boundary.test.ts` (lane 15) forbids `three` imports under `apps/showcase-*/`. Until that pane renders, no
  verdict can move off `pending`. The 8-frame turntable and the PNG strip export are also pending.
- When PRD 05 hosts kits in `assets/library/kits/` (R-14-07, issue #68), staged files move there and `<Kn>/kit.json` keeps only pointers.
