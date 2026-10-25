# Teleoperator: generic vehicles (replacing the real-vehicle models)

Date: 2026-10-24. Branch: `game-rework`. Captured on the remote ACR runner with software WebGL2 (SwiftShader): this is not real-GPU evidence.

## What was wrong

The Teleoperator fleet was built from photo-style models of real vehicles (see `docs/audit/likeness-brand-audit.md`): a Jaguar-style robotaxi with "JAGUAR" and "WAYMO" lettering (painted out earlier, leaving red smears), a Cybercab replica, a Corvette with its badge, a Cybertruck-style truck, a roadster, and six traffic models (sedan, SUV, taxi, van, pickup, bus) built from real-vehicle atlases. These were replaced.

## What shipped

Eight original vehicles generated through Meshy via Kiro Prism from text prompts only (no brand or model names, no image input, no frames from other games). Prompts are in `tools/teleoperator-vehicles/prompts.json`.

| Vehicle | File | Triangles | MB | Materials |
|---|---|---|---|---|
| robotaxi | `teleopVehRobotaxi.7874ad34.glb` | 25,838 | 1.77 | 8 |
| hatch | `teleopVehHatch.67925e22.glb` | 22,658 | 1.48 | 3 |
| pickup | `teleopVehPickup.75a710f9.glb` | 37,996 | 1.95 | 1 |
| coupe | `teleopVehCoupe.7f3a1b6a.glb` | 21,966 | 1.55 | 1 |
| roadster | `teleopVehRoadster.35a1e8b7.glb` | 14,470 | 2.03 | 1 |
| sedan | `teleopVehSedan.7bc528fc.glb` | 13,906 | 2.08 | 3 |
| van | `teleopVehVan.44a544bc.glb` | 22,172 | 1.57 | 5 |
| boxtruck | `teleopVehBoxTruck.8cf91d05.glb` | 13,873 | 2.08 | 1 |

Total about 14.5 MB, against about 59.1 MB for the files they replace. Every model is within the 40,000-triangle vehicle target (the pickup is the largest at 37,996; the robotaxi count includes its cover discs). The sedan, box truck and roadster were remeshed through Meshy because the first simplification could not reduce them (after the standard optimiser they still had 117k triangles for the box truck, 67k for the roadster and 41k for the sedan). The roughly 10 MB target for new assets was missed by about 4.5 MB: textures are 1024 px JPEG and the generated geometry makes up the rest.

Slot mapping (asset key -> vehicle): `teleopWaymoHero`, `teleopWaymoTraffic` -> robotaxi; `teleopCybercab`, `teleopSuv` -> hatch; `teleopCybertruck`, `teleopPickup` -> pickup; `teleopCorvette` -> coupe; `teleopMissions` -> roadster; `teleopSedan`, `teleopTaxi` -> sedan; `teleopVan` -> van; `teleopBus` -> box truck. Keys are unchanged so the apps, route-health references and the typed manifest keep working. Display names in the UI were already generic.

## Provenance

Meshy tasks (text-to-3D preview, then refine; three models were also remeshed to a 20k polycount because the generated UV islands were too fragmented to simplify):

| Vehicle | Preview task | Refine task | Remesh task |
|---|---|---|---|
| robotaxi | 01a170bb-6d36-7226-899a-8429d4359b79 | 01a170bc-6559-767f-9ee5-6128136f7089 | none |
| hatch | 01a170ba-f630-70cc-a03a-82511ac1364a | 01a170bb-9ff1-709d-9fb8-1094fc075716 | none |
| sedan | 01a170bb-a5ae-77af-bcdd-a9c6c19cdbce | 01a170bc-9d52-7205-8468-d6d7dfea921d | 01a170c5-2e2a-7554-bced-20d7cace07f6 |
| coupe | 01a170bc-558b-731e-8fda-2a49347f5822 | 01a170bc-fc66-703b-8e87-45d756523ac0 | none |
| van | 01a170bd-0548-74e4-92b4-4f09d4889f87 | 01a170bd-ac7d-7665-920d-23d5cd20da8f | none |
| pickup | 01a170bd-b520-7226-84db-19c68e5ccdf1 | 01a170be-5e1a-7548-b2a9-fb615555348f | none |
| box truck | 01a170be-6503-708b-809d-4c7abcd37d50 | 01a170bf-5b1b-72f5-be34-628c5ab43f1b | 01a170c4-4489-7384-992e-b9b67f45ac7e |
| roadster | 01a170bf-14f5-779f-b983-2b4ec291cfd6 | 01a170c0-0d8f-7259-abdd-acc586f1d41d | 01a170c4-b93b-7399-a58e-22afc200640f |

Credits: 255 spent against the 420 per-game cap (8 x 30 for preview plus refine, 3 x 5 for remesh), from the ledger (`node /tmp/meshy/meshy.mjs ledger`, game `teleoperator`). Rights basis: the Meshy plan terms of the AuraOne account at generation time (not CC0, no exclusivity claimed); the manifest `license` field says so. Generation date 2026-10-24 local (`rights.json` records 2026-10-25 UTC).

Post-processing: optimise to about 12k to 30k vertices with 1024 px JPEG textures (normals as JPEG, quality 88), then `orient.mjs` (face -Z, centre, rest on y = 0). Each file is admitted by same-origin URL plus sha256 in `aura.assets.json`, `src/aura-assets.ts` and the app tables, written by `tools/teleoperator-vehicles/apply.mjs`.

## Marks the generator invented, and what was done

Meshy added a few emblem-like marks despite the no-badge prompt. They were found by rendering the shipped GLBs orthographically from four sides (`views/`) and covered with thin plain-colour discs (`tools/teleoperator-vehicles/cover.mjs`): the robotaxi nose emblem and six dark door marks (one read like a "T"); the hatch grille badge and tailgate badge; the sedan hood and tailgate badges; the van nose badge and three small rear-door scribbles. Texture-space painting was tried first and rejected: the marks sit on large triangles that also hold other detail, so patching left smudges. The coupe, pickup, roadster and box truck showed no emblems or lettering in any view. Licence plates are blank.

Honest limits:
- Covers read as small plain discs close up (visible on the hatch grille and the sedan, which has a faint lighter dot); a better fix is regenerating the models with cleaner texture, which needs new art.
- Silhouettes are generic categories, but a few still read as familiar real-model shapes (the compact hatch, the wagon-style sedan, the van). That is a shape question that texture edits cannot settle; this is an engineering review and not legal advice.
- The Cable Car (`teleopCablecar`, a San Francisco transit icon from an atlas of unreviewed content) was not part of this swap.
- The sedan's rear has dark texture patches; it is not a mark.

## Sizing and collision

The previous traffic sizes were tuned for the old bodies. With the new models, the old box-truck slot (the 11.8 m bus) would have been 4.2 m wide and the SUV slot 2.5 m, so the slots were resized and the collision footprints (`TRAFFIC_FOOTPRINTS` in `apps/showcase-teleoperator/src/collision.ts`) follow the same dimensions:

| Slot | Vehicle | Length m | Width m |
|---|---|---|---|
| traffic-0, traffic-2 | sedan | 4.75 | 2.17 |
| traffic-1, traffic-5 | taxi (sedan model) | 4.6 | 2.10 |
| traffic-3, traffic-4 | compact hatch | 3.9 | 2.09 |
| traffic-6 | delivery van | 4.7 | 2.25 |
| traffic-7, traffic-8 | pickup | 5.25 | 2.25 |
| traffic-9 | box truck | 7.6 | 2.71 |

The hatch hero and peer car went from 4.42 m to 4.0 m. The player collision body is unchanged (sphere radius 0.95, half length 2.35). Collision, replay (the game has none) and impact behaviour were not otherwise touched; `tests/unit/teleoperator/collision.test.ts` still passes because it derives its cases from the footprint table.

Traffic orientation: the old models faced +Z and the new ones face -Z, so the traffic yaw was flipped (`direction === 1 ? 0 : Math.PI`) in both Teleoperator apps. `qaSetYaw(yaw)` is a new QA hook that turns the player car and every traffic car so each side can be framed.

## Frames (software WebGL2, 0 console errors in every run)

Before: `before/` (the retaken screenshots from the group D pass, with the Jaguar-style car and red smears).

After, `after/` (18 frames from four remote runs of `tests/browser/teleart.spec.ts`):
- `overview-1280x720.jpg`, `overview-390x844.jpg`: the game with the new robotaxi.
- `player-<id>-<side>-1280x720.jpg`: robotaxi (`waymo`) rear, side, front; hatch (`cybercab`), pickup (`cybertruck`) and coupe (`corvette`) rear; coupe and roadster side; roadster rear.
- `traffic-<model>-<side>-1280x720.jpg`: sedan rear, van side, box truck side, pickup rear, hatch front; `traffic-van-rear-390x844.jpg`; `player-waymo-side-390x844.jpg`.
- `views/sides.jpg`, `views/fronts.jpg`, `views/rears.jpg`: unlit orthographic renders of the eight shipped GLB files (the check used to find the marks above).

Not captured: every side of every vehicle in the game (the runner takes about two minutes per frame under software GL, so each vehicle has the views that matter; the orthographic sheets cover all sides of all eight). Not run: any real-GPU capture, and a replay or autopilot regression (Teleoperator has no replay reference).

## Checks

- `tests/unit/likeness-audit/teleop-vehicles.test.ts` (new, 4 tests): manifest hashes match the files, the typed file and app tables agree, the 12 old files are gone and unreferenced, every model is within 42,000 triangles, and the route notes carry no brand words.
- `tests/unit/teleoperator/collision.test.ts` (14 tests), `tests/unit/likeness-audit/clean-athletes.test.ts` (18), `tests/unit/agent-api/public-example-boundary.test.ts` (1): pass. Both Teleoperator apps typecheck.
- Manifest-reading suites run on this tree: 12 failures, none touching these vehicles (missing `dist` builds in a worktree, a mocked Poly Haven network call, and app folders that no longer exist).
