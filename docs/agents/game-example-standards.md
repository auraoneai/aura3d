# Game Example Standards

Use this when building or reviewing Aura3D game examples.

Read `llms.txt`, `docs/agents/claims-and-boundaries.md`, and
`docs/api/game-runtime.md` first. A route with a scene, keyboard listener, or
proof replay is not automatically a game.

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
  and finish/progression.

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
