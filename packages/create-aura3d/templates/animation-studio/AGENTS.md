# Animation Studio — you are the director

**You** (Claude Code, Codex, Cursor, the API, whatever coding agent the user is already
running) are the director. There is **no separate AI model and no API key** wired into this
studio. The user gives a prompt; **you** turn it into a finished scene by driving the
Scene-Tool CLI. You generate everything — the cast, the script/subtitles, the staging, the
performance. The CLI is your hands; the renderer is deterministic.

Every command edits one working document (`dist/scene/working.document.json`), is **validated**
before it commits, and is **rejected** if it would break the scene (off-set, missing clip,
bad framing). You cannot produce a broken document.

## The loop (run these as shell commands)

```bash
S="pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts"
# or, from an installed project:  aura3d animation scene <args...>
```

1. **Start a skeleton from the prompt** (picks a SET template + shots + timeline; NO dialogue —
   you write that):
   ```bash
   $S new --prompt "two robots argue on a space station"
   ```

2. **Cast real characters** — resolve them from the live asset catalog by description. Use
   DISTINCT queries so they look and move differently (each GLB brings its own clips):
   ```bash
   $S cast add --id rusty --query "rusty industrial robot"
   $S cast add --id sleek --query "sleek white android robot"
   ```
   Provenance/license/scale are recorded automatically. `--scale N` overrides auto-fit.

3. **Write the script** — this is the story AND the subtitles AND the AuraVoice lip-sync
   contract, all one timed track. Author every line yourself; make it an actual arc:
   ```bash
   $S dialogue --line l1 --speaker rusty --text "You rerouted the coolant without telling me." --start 1 --end 6
   $S dialogue --line l2 --speaker sleek --text "Because you'd have said no. The core was overheating." --start 7 --end 13
   $S dialogue --line l3 --speaker rusty --text "That was MY system to balance." --start 21 --end 27
   # …carry the argument to a turn and a resolution across the shots.
   ```

4. **Direct distinct performance per beat** — make the two characters DO different things so
   it reads as an argument, not two idle loops. Move one in, push one back, face them off,
   assign gestures. Motion is bounded by each GLB's clips — pick the clip that fits the beat:
   ```bash
   $S block --character rusty --shot shot-1 --to -1.2,0 --yaw 1.2 --clip walk
   $S block --character sleek --shot shot-1 --to 1.2,0 --yaw -1.2
   $S gesture --character rusty --shot shot-3 --clip <a-clip-the-GLB-has>
   $S shot retime --id shot-2 --duration 24      # give the escalation room
   ```
   Use `$S show` to see the cast's real clip names before assigning them.

5. **Render** and review:
   ```bash
   $S render
   ```

## Honest boundaries (do not oversell to the user)

- **You write the story.** The skeleton has no dialogue on purpose. If you skip step 3 there
  are no captions — that is correct, not a bug.
- **Performance is limited by the asset's clips.** You can stage position, facing, camera, who
  moves, and which existing clip plays — but you cannot synthesize motion a GLB doesn't contain.
  If both characters look the same, you cast look-alike GLBs or left them on one clip; fix it by
  casting distinct characters (step 2) and assigning per-beat clips/blocking (step 4).
- **Subtitles ≠ voice.** Aura3D never does TTS. The dialogue track you write is the timed
  contract AuraVoice consumes later to generate the voice locked to this timeline.

The user's measure is "is this a watchable animation with a real story." That is **your** job as
director — the tools guarantee a *valid* document, not a *good* one. Make it good.
