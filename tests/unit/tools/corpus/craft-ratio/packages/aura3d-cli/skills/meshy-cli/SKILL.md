---
name: meshy-cli
description: Guides safe Meshy 3D generation, retexture, remesh, rigging, and animate work through the pinned official CLI and admits results with `aura3d assets import-meshy`. Use when the catalog has no clean candidate, or when planning, generating, resuming, downloading, post-processing, or admitting Meshy assets for Aura3D.
---

# Meshy CLI

The installed official Meshy CLI is the command authority. Do not reproduce
its API or trust remembered flags. Paid-generation controls are shared in
[boundaries](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `meshy --version` and require the repository pin `0.2.0`.
2. Read `meshy --help`, `meshy resources`, and `meshy <resource> create --help`
   for every resource you will call.
3. Run `npx @aura3d/cli@latest --help` and confirm `assets import-meshy` and
   its `--profile prop|environment|vehicle|humanoid` values.
4. Confirm the catalog was tried first (`aura3d-assets`) and its rejection
   reasons were reported. For the full upstream agent skill, review and pin a
   revision of [meshy-3d-agent](https://github.com/meshy-dev/meshy-3d-agent)
   before installing; do not copy its text here.

## Decision tree

Start from the closest existing mesh and pick the smallest operation:

| Situation | Operation |
| --- | --- |
| Geometry and topology are right, look is wrong | `meshy retexture create` (hand the look to `aura3d-retexture` first) |
| Look is right, triangle count or topology fails the profile | `meshy remesh create --target-polycount N` |
| Textured humanoid, static, needs a skeleton | `meshy rigging create --height-meters M` |
| Rig succeeded, a named action is missing | `meshy animate create --rig-task-id <id> --action-id N` |
| Nothing usable exists | `meshy make "<prompt>"` or `meshy make ./ref.png` |
| Only format or real-world size is wrong | `meshy convert` or `meshy resize` |

Reject instead of generating when the subject is a named real product,
brand, or person whose rights you cannot evidence; when rights evidence for
the output cannot be recorded; when the user has not approved a maximum; or
when a catalog candidate already passes the rubric.

## Procedure

1. Plan: `meshy make "<prompt>" --dry-run` and show the steps and estimate.
   For single resources, read the create help and state the planned inputs.
2. Get explicit approval for the maximum, then pass `--max-credits <approved>`.
3. Run, preferring `--async` when other work can proceed. Persist task IDs
   and provider resume hints in ignored local state. Resume a completed
   preview; never recreate paid work that succeeded.
4. Download immediately: `-o artifacts/meshy/<asset>/`. Never overwrite an
   existing output directory without direct instruction.
5. Texture precedence on `retexture create`: `--input-task-id` wins over
   `--model-url`; `--multiview-image-urls` excludes both `--text-style-prompt`
   and `--image-style-url`, which exclude each other. Keep
   `--enable-original-uv true` to preserve an admitted mesh's UVs, and keep
   `--enable-pbr true` so normal, metallic, roughness, and emission maps exist.
6. Profile traps, from the Aura3D admission budgets:

   | `--profile` | Max triangles | Min triangles | Max textures | Max texture px |
   | --- | --- | --- | --- | --- |
   | `prop` | 100,000 | none | 8 | 4096 |
   | `vehicle` | 250,000 | 1,000 | 12 | 4096 |
   | `humanoid` | 150,000 | 3,000 | 12 | 4096 |
   | `environment` | 500,000 | none | 16 | 8192 |

   Meshy `--texture-resolution` defaults to `4k`; `8k` fails every profile
   except `environment`. With `--enable-pbr` each map counts toward the
   texture limit. Non-indexed geometry leaves the triangle check `unproven`.
   Omitting `--profile` infers it from `--role` (`character` to humanoid,
   `vehicle` to vehicle, `world`/`environment`/`track` to environment, else
   prop). Remesh defaults to 30,000; about 10,000 rigs well.
7. Admit the local output with rights evidence.

   ```bash
   npx @aura3d/cli@latest assets import-meshy artifacts/meshy/arena-relic/ \
     --name arenaRelic --rights-evidence artifacts/meshy/arena-relic/rights.json \
     --profile prop --role prop --thumbnail artifacts/meshy/arena-relic/thumbnail.png
   ```

   Use `--file` when the run has several GLBs. Import defaults to
   `--quality candidate` and refuses release certification. Read the
   admission `blockers` and `unproven` lists; `routeReady: false` is a result
   to report.
8. Rig handoff: after importing a rigged humanoid, inspect it and map clips
   before any code names them, then load `aura3d-character-animation`.

   ```bash
   npx @aura3d/cli@latest assets inspect public/aura-assets/<file>.glb --animation --humanoid --skeleton
   npx @aura3d/cli@latest assets validate-animation --clips <from inspect> \
     --map idle=<clip>,walk=<clip>,run=<clip> --require idle,walk,run --require-rig
   ```

9. Use only the generated `assets.<key>` in code. Provider URLs, task IDs,
   and `artifacts/meshy` paths never appear in route source. Send review to
   `aura3d-evidence-review`.

## Safety

- Keep credentials out of arguments, prompts, logs, commits, and output. Use
  OAuth locally (`meshy auth login`) or runtime `MESHY_API_KEY` injection in
  authorized CI. Never use `auth login --with-key` with a pasted key.
- Send Meshy only intentional prompts and selected media, never repository
  source or unrelated user data.
- Propagate Meshy exit codes (3 auth, 4 validation, 6 rate limit, 8 timeout,
  9 credits exhausted). Prism or agent-capacity failures are separate issues.

## Stop and report

- No approved maximum: stop after the dry run and present the plan.
- Exit code 9 or a plan above the approved maximum: stop; do not split the
  job to stay under the cap.
- Admission reports blockers for the chosen profile: keep the file as a
  rejected local candidate, report the failing checks, and label the route
  `prototype` or `blocked`.
- `validate-animation` reports missing clips: do not name them in code;
  report the gap and consider `meshy animate` with fresh approval.
- Rights evidence cannot be produced: do not import.

## References

- [Boundaries](../aura3d-core/references/boundaries.md)
- [Aura3D Meshy pipeline](https://github.com/auraoneai/aura3d/blob/main/docs/meshy-cli.md)
- [Admission budgets source](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/src/meshy/admission.ts)
- [Meshy CLI](https://github.com/meshy-dev/meshy-cli)
- [Meshy API docs](https://docs.meshy.ai/en/api)
