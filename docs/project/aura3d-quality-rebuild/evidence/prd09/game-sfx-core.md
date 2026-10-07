# Evidence — game-sfx-core pack (PRD-09 1736–1737)

Committed on `qr/prd09-sound` at `914cc219` (commits `6e172d33`, `008d57e3`).

## 1736 — `aura3d sfx admit`

- `packages/aura3d-cli/src/commands/prd09/sfx-admit.ts`, registered through C-39
  (`packages/aura3d-cli/src/commands/prd09/index.ts`).
- Requires `<dir>/sources.json` mapping each source file to
  `license` / `sourceUrl` / `author` (plus optional `id`, `class`); any file
  missing a field is rejected before encoding.
- Loudness: `packages/audio/src/game-sound/loudness.ts` — BS.1770 K-weighted
  two-stage gated integrated LUFS + 4×-oversampled true peak.
  Sanity check: a full-scale 1 kHz mono sine measures −3.01 LUFS (EBU tech
  3341 reference) — `tests/unit/audio/loudness.test.ts` (5 tests, green).
- `gainForTarget` clamps so a loudness boost can never push the file over
  −1 dBTP (5 pack entries were clipped by the pre-clamp version during
  assembly and re-admitted — real bug caught by the acceptance check).
- `packages/audio/scripts/validate-sfx-pack.mjs`: 276 entries OK — checks
  required C-17 fields, both encodings on disk, and route/template cue maps
  for `provenance: "synth"` outside the (currently empty) allowlist.
- Q-05-1 filed as GitHub issue #165 (labels `qr-request`, `to:prd05`).

## 1737 — pack assembly

- `assets/packs/game-sfx-core/`: **276 entries × 2 encodings = 552 files**
  (Opus 96 kb/s `.webm` + AAC-LC 128 kb/s `.m4a`), `manifest.json`
  (`aura3d.assets/1.1`), `LICENSES.md`.
- Category counts vs the §6.9 table: UI 24/24, Impact 72/72, Whoosh 15/15,
  Explosion 21/21, Pickup 12/12, Sports 30/30, Vehicle 42/42, Footsteps 24/24,
  Ambience 10/10 (32 s beds), Creature/voice 14/14, Stingers 12 (spec minimum 5).
- Licenses: CC0 ×265, CC-BY-SA-4.0 ×10 (Gregor Quendel ambience, VoiceBosch
  DRAGON announcer — attribution in LICENSES.md), CC-BY-4.0 ×1
  (SpringySpringo dark ambience).
- Mapped categories (no verbatim CC0 source exists; nearest source admitted
  and recorded via `note`/`derivedFrom` in the manifest + LICENSES.md):
  `sports.*` (casino card/chip clacks), `impact.stone|plastic|rubber-ball|energy`,
  `footsteps.metal|water|gravel`, `whoosh.*`, vehicle off-load layers and
  `tyre-skid`/`van-real`/`car-sport-real` derivations.
- Mastering: one-shots peak-normalized to −1 dBTP; loops/beds to −20 LUFS;
  **0 entries** finish above −1 dBTP post-gain (verified across the manifest).
- `packages/game/src/sfx.ts`: generated typed id tree (`sfx.impact.metal.heavy`
  → variant-id tuple, `SFX_IDS`, `SfxId` type), exported from `@aura3d/game`.
- `packages/audio/assets/ir/`: five `ReverbSend` preset IRs
  (`small-room/hall/street/hangar/underwater`, mono 24 kHz, both encodings);
  generated algorithmically — provenance documented in `ir/README.md`.

## Acceptance

- `node packages/audio/scripts/validate-sfx-pack.mjs` → `276 entries OK`.
- `pnpm tsc -p tsconfig.build.json --noEmit` → clean on the branch.
- Loudness unit tests: 5/5 green.
