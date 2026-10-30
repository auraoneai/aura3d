# IRON CROWN — 2.5D Arena Fighter

A complete, playable browser fighting game built on the public Aura3D 4.0.2
game runtime — the melee entry the 4.0.2 showcase lineup was missing.

- **Route:** `/apps/showcase-iron-crown/`
- **Evidence global:** `window.__AURA3D_SHOWCASE_IRON_CROWN__`
- **Typecheck:** `pnpm exec tsc -p apps/showcase-iron-crown/tsconfig.json --noEmit`

## The game

Enter the Iron Crown tournament: read your opponent, build meter through
hits taken and dealt, spend a full bar on your special, win two rounds, and
climb an 8-rung ladder to SOVEREIGN — the Iron Crown itself.

- Best-of-three rounds, 60-second timer, timeout judged on health %.
- One-stock super meter; specials cost 100 and deal chip on block.
- Light → throw/heavy → special **cancel chain** (only off connected hits).
- Unblockable throws; throw-tech when both fighters grab inside 9 frames.
- Hit-stun / block-stun / recovery frames, knockback, pushbox separation
  and corner clamping (engine `pushboxSeparation` + stage bounds).
- Facing flips on cross-up and locks during attacks.
- Dash (Shift or double-tap), jump arc with air control, crouch state that
  shrinks your hurtbox, block by holding **away** (S+away = low-guard pose).
- KO slow-mo beat, camera punch-in on specials, impact shake on hits.

### Modes

| Mode | What it does |
| --- | --- |
| **Quick Bout** | Single bout vs a random non-boss CPU on the current venue. |
| **Combo Lab** | Training dummy (stand / crouch-block / guard / CPU), input display, frame-data overlay, live cancel-chain readout. Timer is ∞; the dummy refills below 35% health. |
| **Crown Ladder** | Pick a fighter, then an 8-rung seeded bracket: rungs 1–2 novice, 3–5 scrapper, 6–7 champion, rung 8 = SOVEREIGN on boss rules at Crown Arena. Lose and you retry the rung. |
| **Versus** | Fighter, opponent, venue and difficulty select. |
| **Player Studio** | Fighter bios + stats and a 6-swatch palette forge (tints the mounted rig); "Fight with this look" launches a Quick Bout. |

The top bar offers one-click **stage quick-switch** across all six venues and
mode shortcuts. When menus are open the app pauses; the main menu runs a
CPU-vs-CPU attract bout behind the title card.

### Controls

| Input | Action |
| --- | --- |
| A / D or ← / → | Walk |
| S or ↓ | Crouch (shrinks hurtbox); with away = low block |
| W / ↑ / Space | Jump |
| Shift or double-tap | Dash |
| J | Light attack |
| K | Heavy attack |
| L | Special (needs 100 meter) |
| U | Throw (unblockable; tech with your own throw) |
| Q *or* hold away | Block |
| Esc | Pause (Esc or Resume to unpause) |
| Touch | `dpad-4btn` preset (auto on touch devices) |

### Roster

All six fighters mount their own **bespoke Meshy-generated rig** — imported
into the app-local catalog (`aura.assets.json` → `public/aura-assets/`,
rights evidence under `aura-evidence/meshy/`, quality `candidate`). Every
GLB ships the identical 14-clip fight set (`Idle`, `Walk_Fight_Forward`,
`Walk_Fight_Back`, `Left_Jab_from_Guard`, `Right_Uppercut_from_Guard`,
`Triple_Combo_Attack`, `Block1`, `Hit_Reaction`, `Dead`, `Regular_Jump`, and
the IC-12 clips `Combat_Stance`, `CrouchLookAroundBow`, `Over_Shoulder_Throw`,
`Victory_Fist_Pump`), so a single shared clip map resolves every logical state:

| Fighter | Asset | Archetype | Special |
| --- | --- | --- | --- |
| KENJI ARASHI | `assets.ironcrownKenji` | Balanced all-rounder | Raijin Straight |
| MARA VOLT | `assets.ironcrownVolt` | Rushdown boxer | Volt Combination |
| BOULDER KANE | `assets.ironcrownBoulder` | Heavy grappler | Colossus Drop |
| SERAPH LIN | `assets.ironcrownSeraph` | Zoning staff | Avalanche Lance |
| JINX OKO | `assets.ironcrownJinx` | Slippery trickster | Phantom Parade |
| SOVEREIGN | `assets.ironcrownSovereign` | Final boss | Crown Decree |

The Crown Arena throne mounts the bespoke `assets.ironcrownCrown` prop
(crown on a velvet cushion, Meshy-generated).

### Venues

Neo-Tokyo rooftop (`night-city`), Lantern dock market (`golden-hour`),
Roman colosseum ruins (`outdoor-day`), salt-flat airstrip (`overcast`),
Cloudstep monastery (`alpine-snow`), Crown Arena (`arena-fight`). Each venue
is a re-paletted `games.fighting.stagePreset` fight lane plus bespoke
dressing parked behind the fight plane so silhouettes stay readable, all
validated through `games.fighting.validateStage`.

## Architecture

Everything runs on the **installed public engine surface** — no raw
three.js, GLTFLoader, or hand-rolled GL.

- `createGame({...})` from `@aura3d/engine/game` owns mount, frame loop,
  input/touch (`dpad-4btn`), audio cues via `sfxUrl`, juice event map,
  session/slow-mo, game beacon and evidence channel.
- `game.kinematicBody` per fighter: gravity/ground, accel/decel walk,
  coyote+buffered jumps, dash impulses, knockback, stage-bound clamps.
- `game.combatWorld` per bout: actors (health/meter/hurtboxes/guardboxes/
  pushboxes/guarding), `beginAttack` with facing-mirrored unsigned hitboxes,
  automatic hit/block/whiff/KO resolution, meter gain, stun/recovery ticks,
  pushbox separation and `roundLocked` on knockout.
- App-layer mechanics on top: 60s round timer + timeout judging, cancel
  chains, throw-tech window, special chip, per-fighter HP/defense scaling,
  facing flips, crouch hurtbox shrink, combo tracking, CPU AI, ladder flow.
- `AnimationController<FighterClip>` per fighter bound to its runtime node
  (`bindRuntimeNode`), 13 logical states cross-faded across a base layer and
  an upper-body attack layer, each state resolved against the GLB's embedded
  clip table at boot.
- `camera.rigs.fighting` presents the frame (side-on fighter framing);
  `game.cameraDirector` supplies `impact`/`special` impulses; `game.effects`
  supplies hit/block sparks, dash trails, aura bursts, shockwaves and impact
  flashes; `gameFeel.create` + `app.feel.preset("fighting")` wire hit-stop.
- DOM fight HUD (health/meter/pips/timer/combo/announcements/input display/
  lab panel) lives in `index.html` + `src/game/hud.ts`; menus ride the same
  layer. The engine `.a3g-hud` theme is mounted empty (`widgets: []`).

## API gaps and workarounds (honest notes)

- **PRD names ≠ installed API.** The PRD's `FightingCharacterController` and
  `HitboxWorld` are not exported by 4.0.2; the public surface is
  `game.kinematicBody` + `game.combatWorld`, which this app uses.
- **Unsigned hitboxes.** `resolveAttack` mirrors hitbox X offsets by
  `attacker.facing` and multiplies knockback by facing, so all hitbox
  offsets and knockback X are authored unsigned (the template's
  `facing * offset` idiom would double-mirror when facing −1).
- **Stun/recovery are frame counts**, decremented once per `combat.update`.
- **Per-fighter health** is passed to `addActor({health})`; `combat.reset()`
  restores `rules.maxHealth`, so actors are re-added with their own max on
  every round reset. Defense scaling refunds/charges the delta on hit events.
- **Cancel chains, throw-tech, chip, timer, round flow** are not engine
  mechanics — implemented in `main.ts` (`tryAttack`, `resolveThrowTech`,
  blocked-event chip, phase machine).
- **Palette overrides** ride `model(asset, { material: material.pbr(...) })`
  (the `materialOverrides` field is declared on `AuraModelOptions` but not
  lowered by `model()`); tinting therefore re-mounts the model via
  `setScene` when a palette is applied.
- **One shared clip map.** All six Meshy rigs embed the identical 14-clip
  set, so `FIGHTER_CLIP_MAP` maps each logical state to a real embedded clip
  once and marks the one stand-in (dash → `Walk_Fight_Forward` at 2×). Idle
  (`Combat_Stance`), crouch (`CrouchLookAroundBow`), throw
  (`Over_Shoulder_Throw`, its 2.5 s grab-lift-toss window at 4×) and win
  (`Victory_Fist_Pump`) are Meshy animate clips added for audit IC-12;
  `Block1` is guard only. The original rig tasks had expired, so the clips were
  made on a fresh rig of the same mesh and retargeted onto the admitted
  skeleton through the bind pose (`tools/iron-crown-clips/retarget-clips.mjs`,
  records in `aura-evidence/meshy/ironcrown*.ic12-clips.json`). An asset whose animation metadata
  lacks a mapped clip throws `FIGHTER_CLIP_MISSING` at boot. Controllers
  cross-fade the embedded GLB clip names directly so the runtime's
  `animation.clip` spec resolves exactly under `A3D_QR_ANIMATION` clip-drive.
- **Meshy rigs embed a ~0.01 armature scale**, so manifest bounds are
  centimetre-tiny; `createFighterNode` normalizes each rig with
  `model()`'s `targetHeight` (1.8 m canonical) and the per-fighter `scale`
  field re-introduces the roster's size spread.
- **The crown prop is candidate-only.** `ironcrownCrown` imported with a
  `triangle-budget` admission warning (526k tris vs the 100k prop candidate
  budget) and stays unreviewed — acceptable as a single static backdrop
  node, not certified for release.
- **`<canvas id="game">`.** `createGame` targets the `#app` container (HUD
  and touch layers must mount into a real element, not a canvas); at boot
  the static placeholder canvas is removed and the mounted renderer canvas
  receives `id="game"`.
- **`guard`/`crouch-block`.** Holding away sets `guarding`; guardboxes are
  re-authored per frame with facing applied (engine doesn't mirror target
  boxes). There is no high/low attack property in the engine, so crouch-
  block is a stance + hurtbox shrink rather than a hit-level distinction.
- **`@aura3d/engine/game` vite resolution.** tsconfig paths map the
  specifier to `packages/game/src`, but the root generated vite aliases map
  only bare `@aura3d/engine` — the prefix match would rewrite the subpath
  to `public/index.ts/game` (ENOTDIR). The app-local `vite.config.ts`
  mirrors the tsconfig mapping (subpath-before-bare ordering), the same
  seam sibling game routes use for `@aura3d/game`.
- **`setActor` cannot revive.** The engine latches `knockedOut` true and
  preserves `stun`/`recovery` across `setActor` patches — clearing KO state
  requires `combat.reset()` (used by the attract-mode revive and the round
  reset path, which re-adds actors with per-fighter `maxHealth`).

## Files

```
index.html          shell: top bar, canvas host, fight HUD DOM, menu sheets
src/main.ts         createGame mount, bout state machine, events, evidence
aura.assets.json    app-local asset catalog (CLI-maintained)
src/aura-assets.ts  typed GLB manifest (generated by `assets typegen`)
src/game/fighters.ts roster, stats, palettes, clip maps, anim factory
src/game/moves.ts   move tables (unsigned hitboxes, frame data)
src/game/stages.ts  six venues: look + re-paletted preset + dressing
src/game/ai.ts      CPU brain (novice/scrapper/champion/boss), lab dummy
src/game/ladder.ts  8-rung Crown Ladder
src/game/hud.ts     DOM HUD + menu wiring
src/styles.css      fight HUD + menu styles
route-health.json   showcase metadata (candidate; qualityGate unreviewed)
vite.config.ts      app-local dev/build config (@aura3d/engine/game alias)
```

## Verification

```bash
# typecheck (clean)
pnpm exec tsc -p apps/showcase-iron-crown/tsconfig.json --noEmit

# route-health gate
node scripts/check-route-health.mjs --routes showcase-iron-crown

# bundle the whole module graph
cd apps/showcase-iron-crown && pnpm exec vite build

# dev server
cd apps/showcase-iron-crown && pnpm exec vite --host 127.0.0.1
```

## Promotion status

`route-health.json` deliberately declares `publicShowcase: false` +
`qualityGate.status: "unreviewed"`: the §7.4 gate requires human
`acceptedBy` reviewer logins before a route may go public. Remaining
promotion work: run the `aura3d look capture` → judge → iterate loop on the
six venues, attach the captures, then a human flips `publicShowcase: true`.
