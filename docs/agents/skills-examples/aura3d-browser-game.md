# Worked example: aura3d-browser-game

Date: 2026-09-25. Run inside the Aura3D monorepo with the local CLI build
(`packages/aura3d-cli/dist/cli.js`, 3.0.1) and the built engine dist. Commands
ran in the `racing-starter` and `mini-game` template directories; none wrote
files (`"wroteManifest": false`, `git status` unchanged). No Playwright or dev
server was run locally.

## Goal

Check whether the shipped racing starter's track is game-ready geometry,
exercise the asset game gate, and smoke-test the platformer and falling-block
kits deterministically.

## Commands run

1. `assets certify-game-geometry --asset trackModel --category racing` in
   `packages/create-aura3d/templates/racing-starter`. Real output:

   ```json
   {
     "ok": false,
     "mode": "certify",
     "wroteManifest": false,
     "rows": [{
       "assetId": "trackModel",
       "category": "racing",
       "pass": false,
       "reasons": ["No mesh primitive in trackModel has a road/track/asphalt/kerb material or node name."],
       "blockers": ["asset-extraction:racing-road-mesh-not-found:trackModel"]
     }]
   }
   ```

   Per the skill, a route on this track is `prototype` for public racing
   claims until a certifiable track is admitted.

2. `assets validate-game --no-placeholders --require-license` in
   `racing-starter`, and `assets validate-game --output /tmp/a3d-mg.json` in
   `mini-game`. Both printed only:

   ```text
   asset.warnings is not iterable
   ```

   This is a CLI crash, not a validation verdict. The skill's stop rule applies:
   report the exact message and treat public game claims as `blocked` until the
   gate runs. Recorded here as a CLI defect to fix.

3. Deterministic kit smoke via a throwaway Node script importing `game` from
   the engine dist. `game.platformer(...)` with the guide's level, 120 steps at
   1/60 s with `moveX: 1` and one jump at frame 10:

   ```text
   platformer keys: kind,levelId,status,frame,time,player,score,lives,deaths,checkpointId,collected,defeatedHazards,activatedCheckpoints,events
   platformer after 2s: {"x":"6.00","y":"0.35","score":0,"status":"playing"}
   ```

   The single early jump did not pick up the coin at x=3 (score 0), which is
   the kind of result a real input test must cover rather than assume.

   `game.fallingBlocks({ seed: 7 })` then `hardDrop()`:

   ```text
   checksum: 3c7267f6 events: hard-drop,lock,spawn
   ```

## Not run locally (remote evidence)

- Template `npm run test` (`playwright test tests/playable.spec.ts` for
  racing and falling blocks; route-health, playable, screenshot, and
  certified-rig specs for mini-game).
- `assets bind-game-route-evidence`, which needs a real screenshot, geometry
  report, composition report, and visual review JSON from a browser run.

Evidence to capture remotely: input-driven movement, restart, and one score,
lap, checkpoint, or line-clear test; start, mid, and finish screenshots on
desktop and mobile; `game.evidence` JSON after a stepped frame; the bound
route evidence file.
