# readAutoplayFlag and createAutoplayHarness: hands-free `?autoplay=1` play

`import { readAutoplayFlag, createAutoplayHarness, AUTOPLAY_FLAG_NAMES } from "@aura3d/engine/game"`

Every game supports `?autoplay=1`: the computer plays through the normal input path, a finished run holds its results for about 3 s, then the next run starts, forever. QA watches whole runs this way (lessons-learned V10). Before 5.7.0 each game carried its own flag reader and results timer, with slightly different rules for which names and values counted. Use the shared ones.

```ts
import { readAutoplayFlag, createAutoplayHarness } from "@aura3d/engine/game";

let autopilot = readAutoplayFlag(location.search); // ?autoplay=1, ?autopilot=1, ?demo
const autoplay = createAutoplayHarness<Input>({
  bot: { step: () => botInput(race) },     // the game's own player; it stays in the game
  isFinished: () => race.resultsOpen,      // results card showing
  restartDelay: 3,
  onRestart: () => begin()                 // the page's normal Play Again path
});

// fixed step: feed the bot through the same input path as the keys
race.frame(STEP, autopilot ? autoplay.step(STEP)! : keys());
// every frame: hold the results, then restart
if (autopilot) autoplay.tick(frameDt);
// QA hook: fold autoplay.diag() into the game's own hook object
```

- **Names.** `AUTOPLAY_FLAG_NAMES` is `autoplay` (canonical), `autopilot` and `demo`: the union of what the games accepted. Pass `{ names }` to narrow or widen it for one game (Beat Hopper adds `autostart`; Serpentine Sky Run keeps only `autoplay` while a `?script=` replay runs). `autostart` is not in the default set: most games use it for "skip the title, play by hand".
- **Values.** A listed name is on when present with any value except `"0"` or `"false"` (case-insensitive), so a bare `?demo` is on and `?autoplay=0` is off. Any listed name on is enough.
- **Source.** A query string (with or without `?`), `URLSearchParams` or any `{ get(name) }`; omitted, it reads `location.search` (false outside a browser).
- **Harness.** `step(dt)` returns the bot's input while `enabled` (the idle input otherwise) and never touches the hold. `tick(dt)` sums `dt` while `isFinished()` and, once the sum reaches `restartDelay`, calls `onRestart`, clears the hold and returns true; a run back in play clears the hold. Call `tick` with whichever clock the game timed its results card with (frame or step seconds). `bot` and `onRestart` are optional: a game whose pilot already feeds its input path can use the harness only for the restart loop and act on `tick`'s return value.
- **Toggle and QA.** `enabled` / `toggle()` back the in-game key (P or O); turning it off clears the hold. `diag()` returns `{ enabled, runs, restarts, holdSeconds, restartDelay }`; `exposeAs: "__NAME__"` also publishes it as a read-only global for pages without a QA hook (`dispose()` removes it).
- **Determinism.** The harness never touches the simulation, so replays and recorded runs are unchanged. Prove the loop in a unit test that drives the real sim for several minutes: progress, no 5 s stall, results held about 3 s, at least one restart.
- **Game check.** `node tools/game-checks/run.mjs <game> --only autoplay` fails a live game with no `?autoplay` reader at all, or one that reads `?autoplay` inline (`params.get("autoplay")`, a name list, a used `readQaParams` flag) instead of calling `readAutoplayFlag`. The 18 games that kept an inline reader in 5.7.0 because their flag rules differ (only `"1"` counts, or the flag also sets autostart, manual or intro switches) are listed with their reasons in `AUTOPLAY_INLINE_ALLOWLIST` in `tools/game-checks/lib/index.mjs`; a new game is never added there, and an entry is removed when its game moves to the reader (a stale entry warns).
