# Worked example: meshy-cli

Goal: plan a Meshy fallback for a prop after the catalog rejected every
candidate, without spending credits.

Environment: `meshy` at `/opt/homebrew/bin/meshy`, plus the built Aura3D CLI
from this repo. No paid or authenticated call ran: `meshy make --dry-run`,
`auth status`, and `balance` were not executed during authoring.

## Commands run

```bash
meshy --version
```

```text
0.2.0
```

This matches the repository pin.

```bash
meshy resources
```

Trimmed output: `text-to-3d`, `image-to-3d`, `multi-image-to-3d`,
`remesh` ("retopologize / change polycount"), `convert`, `resize`,
`rigging` ("rig a humanoid mesh (+ bundled walk/run animations)"),
`animate` ("apply an animation clip to a rigged mesh"), `retexture`
("regenerate textures"), and `text-to-image`, among others.

```bash
meshy retexture create --help
meshy remesh create --help
meshy rigging create --help
meshy animate create --help
```

Facts used in the skill, from this help text:
- `retexture`: `--input-task-id` takes priority over `--model-url`; the text
  and image style flags exclude each other; `--multiview-image-urls` excludes
  both; `--enable-original-uv` and `--enable-pbr` default to true;
  `--texture-resolution` accepts 2k, 4k, or 8k and defaults to 4k.
- `remesh`: `--target-polycount` accepts 100 to 300000 and defaults to 30000,
  with the note "~10000 rigs well"; `--decimation-mode` overrides it.
- `rigging`: `--height-meters` defaults to 1.7.
- `animate`: requires `--rig-task-id` of a SUCCEEDED rigging task, plus
  `--action-id`.

```bash
aura3d assets import-meshy
```

```text
Usage: aura3d assets import-meshy <output-dir> --name <typedKey> --rights-evidence <rights.json> [--file model.glb] [--thumbnail thumbnail.png] [--profile prop|environment|vehicle|humanoid] [--allowed-root artifacts/meshy] [--quality candidate] [--role prop]
```

The profile budget table in the skill comes from `PROFILE_LIMITS` in
`packages/aura3d-cli/src/meshy/admission.ts`: prop 100k triangles, 8 textures,
4096px; environment 500k, 16, 8192px; vehicle 250k with a 1k floor, 12,
4096px; humanoid 150k with a 3k floor, 12, 4096px.

```bash
aura3d assets validate-animation --clips Idle_Loop,Walk_Loop \
  --map idle=Idle_Loop,walk=Walk_Loop,run=Sprint_Loop --require idle,walk,run
```

```json
{
  "ok": false,
  "failures": ["action \"run\" maps to clip \"Sprint_Loop\", which is not present in the asset's clips."],
  "missingClips": ["Sprint_Loop"]
}
```

This is the rig-handoff failure the skill says to report before naming clips
in code.

## Evidence that would be captured remotely

A paid run needs user approval of the dry-run maximum. After import, the
admission report (`aura3d.meshy-admission/1.0` with `blockers` and `unproven`),
the retained thumbnail, and CI route screenshots would go to
`aura3d-evidence-review`.
