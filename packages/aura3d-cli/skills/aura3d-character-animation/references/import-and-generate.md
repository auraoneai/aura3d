# Import and generate motion onto a rig

Capability label: CLI asset pipeline. Both commands write real glTF animation
clips into a new GLB; the runtime then plays them like any other clip. Flags
come from `npx @aura3d/cli@latest help animation import` and
`help animation generate`; the full list is
[the CLI reference](https://github.com/auraoneai/aura3d/blob/main/docs/api/cli-reference.md).

## Retarget existing motion: `animation import`

Sources: `.bvh`, `.fbx`, `.glb`/`.gltf` clips, and HY-Motion `motion.json`
(the `motion_json` output of `fal-ai/hunyuan-motion`). The target is a rigged
humanoid GLB (`--onto`); the result goes to a new file (`--out`).

```bash
npx @aura3d/cli@latest animation import mocap/jab.bvh --onto hero.glb --out hero.anim.glb --name Jab --dry-run
npx @aura3d/cli@latest animation import --onto hero.glb --out hero.anim.glb \
  Walk=mocap/walk.fbx Run=packs/locomotion.glb#Run_Fwd Wave=motion/wave/motion.json --loop
npx @aura3d/cli@latest animation import packs/locomotion.glb --onto hero.glb --out hero.anim.glb \
  --clips Idle,Walk --root-motion in-place --fps 30 --keep-base-animations --json
```

- Roles map automatically, for named rigs and for Idol's unnamed `bone_N`
  rigs. Override with `--map map.json`:
  `{"target":{"hips":"bone_0",...},"source":{...}}`.
- `name=src#clip` picks one clip from a multi-clip source; `--clips a,b` picks
  several. `--window a,b` trims to seconds a..b; `--loop` makes the clip loop.
- Root motion defaults to `in-place` (vertical bob kept); `keep` keeps travel,
  `strip` removes it. `--face-forward` (the default) keeps the character
  facing forward, `--keep-turn` keeps a clip's own spins and pivots; `--source-facing` and
  `--target-facing` (`auto|+z|-z|+x|-x`) fix a wrong facing guess.
- `--keep-base-animations` keeps the rig's own clips beside the new ones.
- `--dry-run` runs every check and reports what it would write, writing nothing.

Every clip is checked before anything is written: limb flips, retarget error
against the source and a frozen T-pose fail the import (exit 1); it never
writes a silent T-pose. The output then gets `assets validate --skin --clips`
for the new clips:

- a skin defect the base rig already shows in its own clips, or one that
  `aura.skin-allow.json` allows for the output or for the admitted `--onto`
  asset, is a warning unless the new clips make it materially worse (a new
  code, or more than 1.5x the stretched or flap triangles);
- `--strict` restores the plain skin rule: any skin error not allow-listed for
  the output fails the import.

On a failure the message names the fix: repair the rig with
`assets repair-skin`, record a known defect in `aura.skin-allow.json` (with a
reason), or use a gentler clip.

## Text to motion: `animation generate` (paid, fal.ai HY-Motion)

`fal-ai/hunyuan-motion` turns a prompt into motion ($0.08 per clip, another
$0.08 with `--fbx`), then the `animation import` engine retargets it onto the
rig. Duration 0.5 to 12 s, guidance 1 to 10.

```bash
npx @aura3d/cli@latest animation generate "a boxer throws a fast left jab and returns to guard" \
  --onto hero.glb --out hero.anim.glb --name Jab --duration 2 --dry-run
npx @aura3d/cli@latest animation generate "relaxed jog cycle" --onto hero.glb --out hero.anim.glb \
  --name Jog --duration 2 --loop --seed 7
npx @aura3d/cli@latest animation generate --spec motion-spec.json --onto hero.glb --out hero.anim.glb \
  --only Run,Jump --concurrency 8
```

Spec file: `{ "game": "<slug>", "onto": "rigged.glb", "outGlb": "hero.glb",
"clips": [ { "key": "Run", "prompt": "...", "duration": 2, "loop": true } ] }`.

- `--dry-run` prints the cost estimate and makes no paid call; run it first.
- Key lookup order: `FAL_KEY`, then `--key-file <file>`, then
  `~/.config/aura3d/fal.env`, then `~/.config/auraone/fal.env`; never printed.
- Ledger and outputs stay in your project: submits go to
  `.aura3d/fal/ledger.jsonl` before they are paid, each clip's `motion.json`
  and `provenance.json` to `.aura3d/fal/motion/<game>/<clip>/` (`--work`
  moves the root, `--game` names the folder).
- Never double-pay: a rerun resumes pending requests and reuses finished
  `motion.json` files; only `--force` regenerates and pays again.
- `--keep-turn` keeps a clip's own turn; looping clips cross-fade their end.

## After import or generation

```bash
npx @aura3d/cli@latest animation inspect-clips hero.anim.glb
npx @aura3d/cli@latest assets inspect hero.anim.glb --animation --skeleton
npx @aura3d/cli@latest animation validate-hero hero.anim.glb
```

`animation inspect-clips` prints duration, channels and root motion per clip as
JSON; `animation validate-hero` checks a character GLB against the hero bar.
Admit the file with `assets add`, then prove the motion in character-region
pixels as the skill describes: a clip list is not visible-animation evidence.

## The library underneath (5.6.0)

`animation import` runs the humanoid motion module in `@aura3d/animation`
(`packages/animation/src/smpl/`, not in the published 5.5.6 packages). Use it
directly only for build-time tooling; ship baked GLB clips, not runtime retargeting.

- `readIdolSkeleton(parseGlbJson(bytes))` reads a rig; `mapHumanoid(skeleton)`
  maps its bones to the 19 `HUMANOID_ROLES` (named rigs and unnamed `bone_N`
  rigs) and lists `missing` roles.
- `smplMotionToClip(name, dict, opts)` converts a HY-Motion `motion.json` dict;
  `skeletalMotionToFrames({ skeleton, fps, frames }, opts)` converts any sampled
  clip (BVH, FBX, glTF). Both take `window`, `loop`, `faceForward` and
  `rootMotion: "in-place" | "keep" | "strip"`, the same knobs as the CLI flags.
- `detectHumanoidFacing(skeleton)` returns `{ facing, method }` (the CLI's
  `--source-facing` / `--target-facing auto`).
- `createHumanoidDriver(skeleton)` poses a rig from canonical frames;
  `bakeHumanoidFramesToGltf(name, target, frames, fps)` writes the glTF channels.

Signatures and the full export list:
[humanoid motion](https://github.com/auraoneai/aura3d/blob/main/docs/api/humanoid-motion.md).
