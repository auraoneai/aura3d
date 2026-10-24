# Game Example Standards

Use this when building or reviewing Aura3D game examples.

Read `llms.txt`, `docs/agents/claims-and-boundaries.md`, and
`docs/agents/build-a-game.md` first (the one-page path), then
`docs/api/game-cheatsheet.md` and `docs/api/game-runtime.md` for names. A route
with a scene, keyboard listener, or proof replay is not automatically a game.

## Build It From the Kits

A public game starts from the library shell, not from hand-written glue:

- `createGame` from `@aura3d/engine/game` for lifecycle, pause, HUD, touch
  controls, sound and juice (the `@aura3d/engine` export is a headless stub);
- `createFixedStepLoop`, `installQaHooks`, `readQaParams` and
  `createCountedRng` for a deterministic, scriptable simulation;
- `createCueBank` or `sfxUrl` for sound, bound to simulation events;
- `defineModelAssets` for production GLBs (same-origin URL, sha256, provenance);
- `installSafetyNet` on any route real players reach.

Hand-rolling any of those in a new route is a review finding. If a rule is
missing from the kit, write it route-local, say so in the route notes, and add a
library task.

## Minimum Public Game Standard

A public game example must prove:

- player input visibly changes game state;
- reset works after normal play and after win/fail where applicable;
- there is a clear objective;
- there is scoring, timing, progress, or a fail condition;
- there is at least one real progression loop;
- primary character, vehicle, playfield, world, or track assets are typed
  GLB/glTF assets unless the game is explicitly abstract;
- route-health names renderer mode, fallback state, exact primary assets,
  primitive count, known limits, and claims;
- automated browser tests cover movement, restart, and at least one win, fail,
  score, lap, checkpoint, line-clear, collection, or completion mechanic;
- screenshots show first load, after input, mid-route, fail/reset when relevant,
  and finish/progression;
- the visual bar: the genre's look preset is applied (see
  `docs/agents/art-direction.md`), the frame shows environment light, a full
  key shadow, genre palette and fog/grade from the look — a mechanic-correct
  game on flat lighting and a void background is still `prototype`.
- the route works on a phone: touch preset bound to the same input actions as
  the keyboard, no horizontal scroll at 390x844, HUD does not cover the play area;
- QA hooks are installed (`window.__AURA_<NAME>__` with `ready`, `state`,
  `stepFrames`, `reset`) and a seeded replay produces the same state hash twice;
- browser specs ran remotely (`tools/remote-acr/run.sh`); software WebGL2 results
  are labelled as software GL and never presented as GPU performance;
- draw calls stay inside the route's written budget (read from
  `app.diagnostics()` or `?diag=1`);
- UI text uses only the licensed font library and the dense UI preset named in
  the repository policy (`AGENTS.md`), never Inter, Roboto, Geist or system stacks;
- all current release, visual-QA, and deploy gates for that exact route pass
  (`aura3d assets validate-game`, `aura3d check-deploy --dist dist`);
  historical retained evidence cannot override a failing current gate.

## Session Length

Showcase games must not be five-to-ten-second micro demos. For prompt recovery
work, a game route must support at least 60 seconds of meaningful play evidence
before it can be called a public game candidate. A short deterministic proof may
supplement the evidence, but it does not replace player-driven playability.

If the current public game kit cannot support that standard, mark the route
`prototype` and add a library task instead of hiding the gap in route code.

## Genre Standards

### Racing

Required:

- manual throttle/brake/steer;
- car starts on a readable track;
- camera keeps car and route readable;
- ordered checkpoints;
- lap or finish progression;
- penalty, fail, timeout, or bounded no-fail claim;
- reset after finish/fail;
- start, mid-race, and finish screenshots.

Not enough:

- one tiny loop;
- an autoplay ghost proof;
- checkpoint text without a complete race path;
- a GLB track that is visually present but not aligned with game logic.

### Platformer

Required:

- readable character scale;
- movement, jump, fall, and reset;
- collision ledges that match visible platforms;
- collectibles or objectives;
- hazards, fail/retry, or a clearly bounded no-fail claim;
- coherent route sections;
- camera tracking that does not hide the player;
- start, middle, and finish screenshots.

Not enough:

- floating primitive ledges around a mismatched GLB;
- proof replay completing while manual input cannot;
- ten seconds of route with no fail state.

### Falling Blocks

Required:

- move, rotate, soft drop, hard drop, hold where claimed;
- collision, lock, line clear, scoring, level/progression, and game over;
- reset after game over or objective completion;
- a route objective beyond one prepared line clear when presented as a game.

Not enough:

- a board one move away from success;
- visual blocks that do not match rules;
- static proof checks without playable controls.

## Public Kit Boundary

Use public `game.*` APIs where available, but do not overclaim them. If a route
adds route-local logic for missing fail states, collision semantics, path
alignment, animation, or objective pacing, document that as route-local and add
a library task for reusable kit support.
