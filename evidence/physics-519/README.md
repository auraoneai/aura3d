# Lane 519: physics only when you need it

Question: with `@dimforge/rapier3d-compat` installed, can an app that never uses physics skip the Rapier download (2.85 MB, 1.08 MB
gzip, fetched at startup by every app today), and can an app that uses physics later fetch it only then, without changing any app
that uses physics today?

Answer: yes, through the Aura3D Vite plugin, additively.

- `aura3d()` from `@aura3d/assets/vite` (`physics: "auto"`, the default): on `vite build` it walks the app's own module graph and,
  when nothing mentions physics, replaces the solver initialisation module (`#aura3d/rapier-init`) and the adapter's Rapier import with
  stubs. No Rapier chunk is emitted. If the app uses physics after all, it gets the typed `PHYSICS_BACKEND_MISSING` error with
  `physics was stripped at build time because no physics usage was found; set aura3d({ physics: true }) in vite.config`.
- `aura3d({ physics: "lazy" })` (and `createAuraApp(..., { physics: { load: "on-demand" } })` at runtime): Rapier is fetched when a
  scene declares bodies or `app.physics` is first touched. Declared bodies and collision/trigger handlers queue; `step()` and
  `contacts()` return `[]`; other calls throw the typed `PHYSICS_NOT_READY` error until `await app.physics.ready()`.
- Without the plugin, and for apps that use physics, nothing changes (default stays eager; 6.0 should flip it).

## Clean consumer (`bundle-sizes.json`, `consumer-captures.json`, `consumer-frames/`)

Clean Vite 8 consumer (lane 514's npm tree of `@aura3d/engine@5.0.2`, Rapier installed), engine = published 5.0.2 or this branch's
packed tarball; gzip -9; scripts fetched by headless Chrome (real GPU) over loopback CDP.

| App | Build | JS emitted | gzip | Rapier chunk | Rapier fetched |
| --- | --- | --- | --- | --- | --- |
| no physics (one lit box) | 5.0.2, no plugin | 9,401,203 B | 3,008,909 B | 2,853,747 B | yes, at startup |
| no physics | branch, no plugin | 9,405,568 B | 3,010,601 B | 2,853,747 B | yes, at startup |
| no physics | branch, `aura3d()` auto | **6,551,866 B** | **1,927,837 B** | **none** | **no** |
| no physics | branch, `physics: "lazy"` | 9,405,820 B | 3,010,707 B | 2,853,747 B | no (never used) |
| no physics, Rapier not installed | branch, no plugin | 6,551,959 B | 1,928,103 B | none | no |
| recipe 16 (physics at startup) | 5.0.2, no plugin | 9,403,645 B | 3,009,934 B | 2,853,747 B | yes, at startup |
| recipe 16 | branch, no plugin | 9,408,010 B | 3,011,646 B | 2,853,747 B | yes, at startup |
| recipe 16 | branch, `aura3d()` auto (kept) | 9,408,010 B | 3,011,646 B | 2,853,747 B | yes, at startup |
| intro scene, physics scene after 2.5 s | branch, `physics: "lazy"` | 9,409,004 B | 3,011,962 B | 2,853,747 B | **at 2,776 ms, after first use (page 2,750 ms), ready at 2,887 ms** |
| same app | branch, `aura3d()` auto (eager) | 9,408,752 B | 3,011,862 B | 2,853,747 B | yes, at 83 ms |
| recipe 16 + `await app.physics.ready()` | branch, `physics: "lazy"` | 9,408,287 B | 3,011,757 B | 2,853,747 B | yes, at startup (declares bodies) |
| recipe 16 | branch, `physics: false` (forced strip) | 6,554,308 B | 1,928,884 B | none | no: typed error on canvas |

- (a) No-physics app with the plugin: no Rapier chunk emitted, no Rapier script fetched; saves 2,853,702 B JS and 1,082,764 B gzip.
- (b) No-physics app without the plugin: same chunk list as 5.0.2, +4,365 B JS / +1,692 B gzip of engine code (lanes 514 + 519).
- (c) Physics app: the `aura3d()` build is byte-identical to the build without the plugin (`diff -r` of the two dist folders), and
  5.0.2, branch, branch + plugin, lazy and lazy-switched builds all report the same state after 140 fixed steps
  (`steps 140, solidHits 109, hardestHit 1.4098556041780554, firstCrateHitStep 78`, ball `[-0.2396, 1.2931, -0.0119]`,
  crate-0-0 `[0.2043, 0.2523, -0.7624]`, crate-4-2 `[1.005, 0.8551, 0.2572]`) with byte-identical frames (sha256 `e901e69d...`).
- (d) Lazy app: the network timeline (`networkTimelineMs`) and the page's own timeline (`appTimelineMs`) are in `bundle-sizes.json`.
- The no-physics frames are byte-identical across 5.0.2, branch, auto and lazy (sha256 `e8df34fc...`).
- `consumer-frames/branch-phys-plugin-false-present.png`: what a wrongly stripped physics app shows (the typed error overlay).

Tarball note: the engine tarball was packed before the last edit to the on-demand replay check for runtime node adds
(`createAuraAppCore.ts`, covered by `tests/unit/physics/on-demand-physics.test.ts`); none of the consumer apps adds runtime nodes.

## Declarations (`dts-vs-5.0.3-*.txt`)

Emitted `.d.ts` against the published 5.0.3 tarballs (`npm pack @aura3d/{engine,assets,physics,physics-rapier}@5.0.3`), normalised
with `../physics-514/tools/dtsdiff.mjs`. Only additions; the `-` lines are export lists that gained `physicsLoadMode`, the widened
`PhysicsWorldModule` type, and an empty `export {};` that tsc no longer emits in `auraDecoders.d.ts`. Lane 514's own additions
(`PHYSICS_BACKEND_MISSING`, `backendMissing.d.ts`, `physics-backend-check.d.ts`) appear too because 514 is not released yet.

## WASM loading (`wasm-loading-evaluation.json`)

The non-compat `@dimforge/rapier3d@0.20.0` ships a separate 2,021,200 B `.wasm` (761,373 B gzip) + 239,763 B JS glue, against the
compat chunk's 2,853,747 B (1,082,643 B gzip): about 296 kB gzip less, streaming compilation and a separately cacheable file. Not
implemented: it imports the `.wasm` as an ES module (needs a WASM bundler plugin in every consumer) under a different package name
than the existing peer dependency, so it is not additive.

## Neutrality (`neutrality/`)

See `neutrality/README.md`.

## Tests

- `tests/unit/assets/vite-physics-plugin.test.ts`: scanner (positive, negative, comments, strings, computed access), module
  classification, module-graph walk (static + dynamic imports, add-on dependencies), resolveId/load hooks (auto, dev, SSR, true,
  false, lazy, unknown mode), the stub's runtime contract through the physics adapter.
- `tests/unit/physics/on-demand-physics.test.ts`: no backend request without physics, deferral and replay of declared bodies,
  identical state after N steps vs eager, queued handlers and early unsubscribe, `app.ready()` waiting, scene replaced while
  loading, a failed (stripped) load in `ready()` / diagnostics / later calls, default eager app unchanged.

## Tools

`tools/`: every script used here (`consumer519.sh`, `measure519.mjs`, `ccap519.mjs`, `capture519.sh`, `stripped-misuse.sh`,
`compose519.mjs`, `games-*.sh`, `pixdiff.mjs`, `neutral519.mjs`); `consumer-apps/`: the two lazy consumer apps.
