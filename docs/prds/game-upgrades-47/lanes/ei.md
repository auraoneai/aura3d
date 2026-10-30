# Lane ei (E-I, WP-9): proof tooling and checks

Branch `gu47/ei`, base `f797808be` (gu47/integration), wave 1 (phase 1, code). Status: in progress; this report is updated after every row group.

## Art-direction check: compliance recipe (game lanes, read this first)

The `art-direction` check (warn until WP-38) never evaluates TypeScript. It reads a JSON audit record that the game's own art-direction unit test writes beside `art/direction.ts`. To comply:

1. Ship `art/direction.ts` in the game's own folder: `apps/<appFolder>/art/direction.ts` (app games; `apps/<appFolder>/src/art/direction.ts` is also accepted) or `examples/<example>/art/direction.ts` for ports (the app folder is accepted for ports too). It default-exports `defineArtDirection({ ... })`.
2. In the unit test that runs `auditArtDirection`, write the record with the helper in `tools/game-checks/lib/art-direction.mjs` (typed by `art-direction.d.mts`):

   ```ts
   import direction from "../../../apps/<appFolder>/art/direction";
   import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
   import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

   const snapshot: ArtDirectionSnapshot = /* snapshotForAudit(app, assetManifestLike(manifest)) on the authored scene,
     or a literal mirror of the scene's lights, environment and models */;
   const violations = auditArtDirection(direction, snapshot);
   writeArtDirectionAudit("apps/<appFolder>/art/direction.ts", { direction, snapshot, violations });
   expect(violations).toEqual([]);
   ```

   The path argument is repo-relative (or absolute, or a file URL). The helper writes `art/direction.audit.json` (schema `aura3d.art-direction-audit/1`: sha256 of `direction.ts`, the direction data, the snapshot, the violations). No timestamp; the file is rewritten only when its content changes.
3. Commit `art/direction.audit.json` together with `art/direction.ts`, and rerun the test after every edit of `direction.ts` (a sha mismatch is reported as stale).

The check warns when: there is no `art/direction.ts`; the audit JSON is missing or invalid; it is stale; `violations` is not empty; the direction has no `id`, `signatureEffect` or `palette.primary`.

`look-identity` reads `signatureEffect`, `palette` and `lighting.environment` from the audit records of all live games. Only `environment.background: "hdri"` counts as the game's primary visible environment; give `environment.hdri` as the catalogue id (`belfast_sunset_puresky`) or the served path (`/hdri/belfast_sunset_puresky_1k.hdr`) so the check can hash the file.

## Variant URL params and luma targets (chosen in wave 1; game lanes implement the NEW ones)

Rule: every existing target keeps its name and URL; a variant gets a new target only if no existing target covers it; a param that already works on 4.6.0 is preferred, so WP-38's "before" capture on 4.6.0 shows the right variant.

| Game | Param (status) | New variants (target `<slug>--<variant>`) |
|---|---|---|
| top-tennis | `?venue=` (exists, `examples/aura-slam/shell/boot.ts:599`) | grass, clay, desert, beach, moon (`default` is hard) |
| heatsink | `?circuit=grand\|dustfall\|vesper` (NEW, G03, CircuitId from `data.ts`) | dustfall, vesper (`default` is MEGACITY) |
| bunker-zero | `?floor=1..6\|kh` (NEW, G11, BZ-20) | floor1 ... floor6, killhouse |
| slingshot-siege | `?level=<5 x chapter>` (exists; chapter c = level 5c) | ch0 ... ch5 (SS47-E1 names ch0-ch5) |
| dot-dash-3d | `?maze=` (exists, MAZE_ORDER) | classic, spiral, twin, garden, foundry, zerocore |
| splat-rush-port | `?look=original\|carnival` (NEW, G16, CR-00) | original (`default` is carnival) |
| serpentine-sky-run-port | `?stage=1..8` (NEW, G17; 1-based, STAGES in `sim.ts`) | stage1 ... stage8 |
| drift-and-deliver-port | `?at=<elapsed shift seconds>` (NEW, G18; GC-L6 0:10/2:00/2:50) | golden (`?at=10`), sunset (`?at=120`), bluehour (`?at=170`) |
| ninja-runner-port | `?at=<metres>` (NEW, G20, NR-22) | village (100), rooftops (700), river (1300), forest (1900), gate (2500) |
| last-train-port | `?band=A..E` (NEW, G21, LT-01) | band-a ... band-e |
| where-the-wind-wanders-port | `?found=0..3\|epilogue` (NEW, G23; letters found, WW47-L1/PF2) | found0, found2, found3, epilogue |
| silt-and-signal-port | `?chapter=0..6&start=1` (exists, `examples/silt-and-signal-port/main.ts:5`) | ch0 ... ch6 |

Unchanged in wave 1: teleoperator keeps its four `data-tod` clicks (GD-21 renames golden to Marine dusk and makes it the boot sky; reconciled in wave 2), strange-orbit-port keeps the dev-server route `/apps/showcase-strange-orbit-port/` (`/apps/craterline-gp/` is the production rewrite, which the capture's dev server does not serve; SO47-X1), heatsink-port has no district param yet (IC-06 needs two district shots; add rows in wave 2 if G19 lists them), cloud-runner-port has one time of day.

## Crop contract (`window.__AURA_QA__.crops`)

A game publishes named crop rects for the steady-state capture in either place:

- `window.__AURA_QA__ = { crops }`, or
- a `crops` extra on its QA hook: `installQaHooks("<name>", { ..., extras: { crops } })`, read from `window.__AURA_<NAME>__.crops`.

`crops` is an array, or a function returning one, of `{ name, x, y, w, h }`: `name` matches `[a-z0-9][a-z0-9_-]{0,31}`, the rect is normalised 0..1 to the game's main (largest visible) canvas, origin top-left. It is read at every shot, so a function can project a moving subject's box. At most 16 crops. A target in `tests/browser/game-luma-targets.ts` can also declare static `crops`; the hook wins on a name clash.

(Rows table, handoffs, CHANGELOG text, phase-2 plan and verification follow below as the work lands.)
