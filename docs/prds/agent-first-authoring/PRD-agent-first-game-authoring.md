# PRD: Agent-First Game Authoring ("next-level" Aura3D)

Status: ready for parallel execution. Owner: Gurbaksh. Written 2026-10-27 against `main` at `d64329a0a` (Aura3D 4.3.6) plus the uncommitted `check-deploy --browser` work.
Execution mode: zero-hostage. Every decision below is resolved from the repo and the measurements; the executing agent does not ask questions.

Evidence base (all in-repo):
- `evidence/agent-eval/fullgame-436/{REPORT.md,metrics.json}` and the appended "Full game task (fullgame-436)" section of `evidence/agent-eval/baseline1/NOTES.md`: cold-start trial, task 6, 3 Aura3D runs vs 3 three.js runs.
- `evidence/vs-threejs/full-game/README.md`: the same game written twice by one author (271 vs 373 authored lines) with the list of kit gaps found.
- Transcript diagnosis of the six trial runs (turn-by-turn classification, ranked root causes RC1..RC13). Condensed in section 2.

---

## 1. Executive Summary & Architectural Decisions

### Objective
Make a fresh AI agent, with no repo context and no shell, build a complete small browser game on Aura3D in fewer turns, fewer tokens and less time than it needs on plain three.js. Today it does not: on task 6 ("Dodge", a mobile arcade game) three.js agents finished in 7 turns / ~0.11M input tokens, Aura3D agents in 21 to 33 turns / 0.94M to 2.01M. The code the agents wrote was the same size; the gap is almost entirely reading (RC1..RC3 below), plus kit pieces that are stubs, mis-wired or undiscoverable. The PRD fixes the product (one game-shaped entry point, kit pieces that work, silent-no-op removal, smaller first load), fixes the measurement (a gate that decides when a claim may be made) and ships a receipt path for real-GPU numbers.

### What the measurements say (baselines)

| Measure (task 6, median of 3) | Aura3D 4.3.6 | three.js 0.185.1 |
| --- | ---: | ---: |
| Turns | 32 (21 to 33) | 7 (7 to 7) |
| Input tokens | 1.83M (0.94M to 2.01M) | 106k (106k to 133k) |
| Turns spent reading docs | 5 | 0 |
| Turns spent reading package types/dist | 19 | 0 |
| Chars written | 28.9k | 24.2k |
| First-try typecheck pass | 2 of 3 runs wrote first, 0 type-trap failures | 3 of 3 |
| JS bundle raw / gzip | 3,428 KB / 1,074 KB | 510 KB / 130 KB |
| Time to ready, software GL | 1,483 ms | 218 ms |
| Complete game, authored lines (author-written, not agents) | 271 | 373 |

### Targets (acceptance, measured by the gate in Track B)

| # | Target | Baseline | Target |
| - | --- | --- | --- |
| T1 | Task 6 median turns | 32 | <= 6 and <= three.js arm median |
| T2 | Task 6 worst-run turns | 33 | <= 12 |
| T3 | Task 6 median input tokens | 1.83M | <= 0.4M |
| T4 | First-try typecheck pass (task 6) | 2 of 3 | 3 of 3 |
| T5 | Game-specific authored lines (agent final, task 6) | 185 to 230 glue + scene | <= 200 total src lines |
| T6 | Doc reading before first write | 3 to 5 turns, 43k to 59k chars | <= 1 file, <= 6 KB |
| T7 | Tasks 1 to 5 (existing set) median turns | per `baseline1/NOTES.md` | <= 5 |
| T8 | Hello-world JS critical path, gzip | not measured per entry | re-baselined by WP-C1; target <= 750 KB (estimate, replace with measured halving goal) |
| T9 | Silent no-ops flagged by judge on task 6 | 2 of 3 runs flagged (noise-rated) | 0 flagged, and the engine diagnostics catch every documented one |
| T10 | Cold start of the "Dodge" kit game on software GL to first step | 6.5 s (kit) vs 0.76 s (three.js) | <= 2 s |

Claim policy (hard): no public surface may say Aura3D is faster, cheaper or smaller for agents until the gate (WP-B4) passes on a fresh batch. Even then, sales surfaces state only the measured Aura3D number with method, per `sales-only-marketing-copy` rules; the three.js column stays in `evidence/`.

### Autonomous decisions made
1. **One new public entry point, `createArcadeGame`, in `@aura3d/engine/game`.** It wraps what every trial agent hand-rolled and what the 271-line comparison showed the kit does not do: scene pools, fixed-step loop, counted RNG, cue bank, DOM HUD, touch pads, pause/results/restart, QA hooks, first-frame flag. Rationale: 3 of 3 agents bypassed `createGame` (RC11) because it cannot adopt pieces one at a time and its shell screens are stubs. A game-shaped function with defaults removes the discovery cost; `createGame` is kept and fixed, not replaced.
2. **`createArcadeGame` takes a pure sim, not callbacks into the renderer.** The agent writes `sim.ts` (library-agnostic, as the three.js agents do) and declares how sim state maps to node pools. Replay determinism stays testable in Node.
3. **One agent-facing document, `GAME.md` (<= 6 KB), generated into every scaffold and staged into every eval sandbox.** `llms.txt` first screen points to it. Anything the agent must know sits in the first 6 KB (the harness read cap is 14,000 chars; two current docs exceed it and lost their trap tables to truncation in 3 of 3 runs).
4. **Fix silent no-ops in the engine, not in the docs.** `resize: false` writing inline pixel styles (RC4) is an engine defect.
5. **A new template, `arcade-dodge`,** is the copyable working example (replaces the platformer `mini-game` as the thing agents find in `node_modules/@aura3d/engine/templates/`).
6. **Docs links that point at pages not in the package are bugs.** Either ship the page inside `dist/` or inline it. `docs/api/*` references in agent docs are audited by a new gate.
7. **Owner-only content never ships to agents:** the owner-policy pointer block in `AGENTS.md` and monorepo-only lines in `llms.txt` are stripped from the published/scaffolded copies (read by 3 of 3 runs at turn 1, ~4% of input, one run noted it "could not read the file").
8. **Bundle work is measure-first.** No size target is final until WP-C1 produces the composition report; the 4.1 MB figure bundles every lane, post-process stack and loader for a game that uses a fraction.
9. **Release plan:** `check-deploy --browser` (already implemented and tested remotely, uncommitted) ships first as 4.3.7. This PRD ships as 4.4.0 (new public API). Every publish deprecates all earlier npm versions and re-banners GitHub releases (standing rule).
10. **Real-GPU receipts are owner-run** (needs the Mac GPU or quota). The PRD delivers the script, schema and publishing path; capture is a human gate.

---

## 2. Current Codebase State & System Architecture

### 2.1 Why agents burn turns (ranked root causes, from the transcript diagnosis)
Counts are runs out of 3.
- **RC1, docs volume and truncation (3/3, 3 to 5 turns, 39% to 45% of input).** Turn 1 reads `TASK.md` + `llms.txt` (10.5 KB) + `AGENTS.md` (4.7 KB) = 18k chars, then `recipes.md` (15.8 KB; read cap 14,000 cut the type-traps table), `build-a-game.md` (18.5 KB; cut at line 249 of 332), `agent-quickstart.md` (8.6 KB). The task needed ~3 KB of it. `recipes.md` line 3 tells agents not to read `dist/`; all three then spent 10 to 20 turns in `dist/`.
- **RC2, no doc for the `createAuraApp` / `AuraApp` / node-handle surface (3/3, 4 to 8 turns).** Agents read `dist/engine/agent-api/nodes/types/runtime.d.ts` in 3 to 14 KB slices. `api-surface.md` (names only) was opened 0 of 3.
- **RC3, synthesized audio only discoverable through `.d.ts` (2/3 used it at ~6 turns each; 1/3 bypassed with raw `AudioContext`, which `llms.txt` forbids).** `build-a-game.md:237` links `docs/api/audio-synth.md`, which is not in the package or sandbox.
- **RC4, `resize: false` still writes inline `style.width/height` (3/3 worked around it).** `packages/engine/src/agent-api/app/canvas.ts:98-99` (`configureCanvas`). `recipes.md` line 5 recommends `resize: false`, hiding the behaviour.
- **RC5, ambiguous option shapes (3/3, 4 to 6 turns).** `AuraPrimitiveOptions.size?: number | AuraVec3` has no per-kind meaning; meaning exists only in the runtime string table `SIZE_HINT` in `packages/engine/src/agent-api/nodes/primitives.ts:28`. `cone` is in no doc. `AuraColor` is `` `#${string}` | string `` (collapses to `string`, typos compile).
- **RC6, fixed-step loop and RNG signatures incomplete in recipes (2/3).** Needed `isActive`, `manual`, `advance(n)`, `resetAccumulator()`. RNG type is `QaCountedRng` (`packages/engine/src/qa/countedRng.ts`), not named in any doc.
- **RC7, look presets (2/3, 2 to 3 turns).** Stale `ENV_FETCH_FAILED ... Serve the repo public/aura-environments/ files` row in `agent-quickstart.md` caused a 404 worry; the neutral environment is now embedded.
- **RC8, builder mutability undocumented (2/3).** `SceneBuilder.add` mutates and returns `this` (`packages/engine/src/agent-api/nodes/scene.ts`).
- **RC9, links to pages not shipped (2/3).** `llms.txt:110`, `build-a-game.md` lines 26, 104, 237, 248, 251, 255.
- **RC10, "never a hero from primitives" in an offline task (3/3 acknowledged, 1/3 paid turns).**
- **RC11, 3/3 bypassed `createGame`.** It cannot adopt pieces singly and its HUD/hook shapes do not match a dictated DOM contract.
- **RC12, plane orientation contradiction (1/3).** `docs/agents/build-a-game.md:145` and `docs/agents/samples/coin-dash/main.ts:20` use an upright-rotated X/Z plane (`size: [20, 8, 1]`, `.rotate(-Math.PI/2, 0, 0)`), contradicting `sceneMath.ts` and `SIZE_HINT` (`plane: [w, 1, d]`). Render before fixing.
- **RC13, agent-own errors (TS2367 narrowing; no-op edit; top-level `await` worry).** Docs show top-level `await app.ready()` (`recipes.md:36,99,176`, `agent-quickstart.md:61`, `llms.txt:56`) while agents rewrote to `.then()` on a belief that Vite's default target forbids it. Verify against a stock Vite 7 build, then state which is correct.

### 2.2 Kit state (`packages/game`, `packages/input`)
Found while writing the 271-line game (`evidence/vs-threejs/full-game/README.md`) and verified to exist at these paths:
- `packages/game/src/createGame.ts`: does not forward touch `show`; `Game.input` typed possibly undefined.
- `packages/game/src/touch/TouchControls.ts`: binds `touchstart`/`touchend` only (mouse/pen press on a touch button moves the player 0 units; three.js pointer-event buttons move 9). `twin-stick` stick only reaches input through `touch.update()`, which is not on the public `TouchControls` type and not called by `createGame`. Controls start hidden.
- `packages/game/src/styles.css`: no rule for `.a3g-touch` / `.a3g-tc`; consumers write ~31 lines of CSS.
- `packages/game/src/shell/GameShell.ts`, `shell/screens/{Pause,Results}.ts`: `shell.showResults` only changes session state; pause menu and results are not DOM. Consumers hand-write ~31 lines plus CSS.
- `packages/game/src/session/lifecycle.ts`: toggles pause on P, Escape and tab hide; undocumented, so a consumer-bound `pause` action double-toggles and cancels.
- `packages/game/src/hud/widgets/index.ts`, `components.ts`: timer widget `mode` is not on public `HudWidgetSpec`.
- `packages/game/src/sfx.ts`, `packages/audio/src/synth/*`: cue bank works (`createCueBank`) but is documented in one sentence.
- Teardown: `game.dispose()` removes HUD/touch but leaves the canvas the app appended (5 canvases after 4 remounts). Three WebGL contexts per mount vs one.
- `packages/input/src/TouchLayouts.ts`: layouts are platformer-shaped (left/right on the left, up/down on the right).

### 2.3 Engine surfaces involved
- `packages/engine/src/agent-api/{GameRuntime.ts,app/createAuraApp.ts,app/runtimeNodes.ts,app/canvas.ts,app/frameLoop.ts,nodes/{primitives,builder,scene}.ts,compiler/{diagnosticOnly.prd09.ts,optionCoverage.ts}}`.
- `packages/engine/src/qa/{fixedStepLoop,hooks,countedRng}.ts`: `createFixedStepLoop`, `installQaHooks`, `createCountedRng`.
- `packages/engine/src/contracts/stubs/game.ts`: contract stubs for the game export.
- `package.json` (root, `@aura3d/engine`): exports `./audio` (line 61), `./game` (line 77); `sideEffects` list at line 309 (bundle track).

### 2.4 Harness state (`tools/agent-eval`)
- `lib/{loop,tools,sandbox,score,metrics,report,judge,base}.mjs`, `tasks/{01..07}-*.md`, `tasks/checklists.json`, `remote/score-all.mjs`, `run.mjs`, `report.mjs`, `caveats.json`.
- Aura system prompt (`lib/loop.mjs`) tells the agent to start from `llms.txt`, `AGENTS.md`, `docs/agents/`, `.agents/skills/`; the three.js prompt gives no reading list. This steers the Aura arm toward reading.
- `lib/sandbox.mjs` `DOC_SOURCES` copies only `docs/agents`, `llms.txt`, `AGENTS.md`, `.agents/skills`. `lib/tools.mjs`: read cap 14,000 chars, search cap 8,000, tools list/read/search/write/edit/typecheck/finish, no shell. `lib/loop.mjs` truncates saved tool results to 1,500 chars (limits future diagnosis).
- Known probe defect: the `pauseButton` probe (`lib/score.mjs`, `remote/score-all.mjs`) reads `el.textContent ?? el.getAttribute('aria-label')`; `textContent` is never null, so an icon-only `<button aria-label="Pause">⏸</button>` fails. All 3 three.js runs have exactly that button; their 0.86 probe fraction should be 1.00 (read from source in the report; harness unchanged).
- `lib/base.mjs` env overrides `AGENT_EVAL_AURA_VERSION`, `AGENT_EVAL_BASE_ROOT` were added post-4.3.6 (uncommitted).

### 2.5 Constraints
- Remote-only execution: builds, Playwright, scoring run through `tools/remote-acr/run.sh` (serverless Azure ACR; image copies only fixed dirs; stage extra dirs under `apps/<x>-stage-tmp` with `EXTRA_DIRS`). No local Docker, no local Playwright.
- LLM calls through Kiro Prism (`https://prism.auraone.ai`).
- Aura3D has no `three` dependency; public copy never says "built on three.js".
- Sales surfaces sell Aura3D only; comparison data stays in `evidence/`.

---

## 3. Data Model, API & Interface Contracts

All new TypeScript signatures are **proposed contracts**; WP owners may refine names, but the shapes and behaviours below are binding unless a test shows they cannot hold.

### 3.1 `createArcadeGame` (new, `@aura3d/engine/game`)

```ts
export interface ArcadeInput {
  readonly left: boolean; readonly right: boolean; readonly up: boolean; readonly down: boolean;
  readonly action: boolean;            // primary button (Space / tap)
  readonly pointerX: number | null;    // -1..1 across the canvas, null when no pointer
}

export interface ArcadeSim<State, EventName extends string> {
  /** Advance exactly one fixed step (stepSeconds). Must be deterministic given the seed and the input sequence. */
  step(input: ArcadeInput): readonly EventName[];
  /** Read-only snapshot used for presenting, HUD and the QA hash. */
  state(): State;
  /** Reset to a fresh run from the same seed. */
  reset(): void;
  /** "playing" | "won" | "lost" drives the results screen; anything else keeps playing. */
  status(): "playing" | "won" | "lost";
}

export interface ArcadePool<State> {
  readonly id: string;                                  // node ids become `${id}${index}`
  readonly count: number;
  readonly kind: "box" | "sphere" | "capsule" | "cone" | "plane";
  readonly size: number | readonly [number, number, number];   // per-kind meaning is documented on ArcadeSizeFor<kind>
  readonly color: `#${string}`;
  readonly emissive?: `#${string}`;
  /** Called every rendered frame; returns the pose of item `i`, or null to hide it. */
  readonly pose: (state: State, index: number, alpha: number) => { x: number; y: number; z?: number; rotY?: number } | null;
}

export interface ArcadeGameOptions<State, EventName extends string> {
  readonly target: string | HTMLElement;                // CSS selector or element; canvas is created if the element is not a canvas
  readonly seed: number;
  readonly sim: (ctx: { readonly rng: QaCountedRng }) => ArcadeSim<State, EventName>;
  readonly stepSeconds?: number;                        // default 1/60
  readonly look?: LookPresetId;                         // default "neon-arcade"
  readonly camera?: { readonly position: Vec3; readonly target: Vec3; readonly fov?: number };
  readonly pools: readonly ArcadePool<State>[];
  readonly player?: ArcadePool<State>;                  // pool of count 1, id "player"
  readonly floor?: { readonly size: readonly [number, number]; readonly color: `#${string}` };   // always lies in XZ
  readonly hud: {
    readonly score: (s: State) => string;
    readonly timer?: (s: State) => string;
    readonly lives?: (s: State) => number;
  };
  readonly keys?: Partial<Record<"left" | "right" | "up" | "down" | "action", readonly string[]>>;   // default arrows + WASD + Space
  readonly touch?: "dpad" | "left-right" | "drag-x" | "none";                                         // default "left-right" on coarse pointers
  readonly cues?: Readonly<Record<EventName, CueSpec>>;                                               // played only from live sim events, never in replay
  readonly shell?: { readonly pause?: boolean; readonly results?: boolean; readonly restart?: boolean };   // all true by default
  readonly qa?: { readonly global?: string };           // default "__EVAL__"; see 3.4
}

export interface ArcadeGame {
  readonly ready: Promise<void>;
  readonly state: () => unknown;
  pause(): void; resume(): void; restart(): void;
  dispose(): void;                                      // removes canvas, HUD, touch, listeners; leaves 0 residual DOM nodes
}

export function createArcadeGame<State, EventName extends string>(options: ArcadeGameOptions<State, EventName>): ArcadeGame;
```

Behavioural guarantees (each becomes a test):
1. Canvas CSS is never pinned in pixels; it scales with its container by default (RC4).
2. P / Escape / tab-hide pause, R restarts, M mutes; a visible Pause button and Restart button exist (aria-label and text). Results overlay shows on `won`/`lost` with score and a Restart button.
3. Touch buttons respond to `pointerdown`/`pointerup` (mouse, pen, touch), appear on coarse-pointer devices, and are styled by shipped CSS (no consumer CSS needed).
4. `app.ready()` is awaited internally; no top-level await in the agent's code.
5. Sim runs on `createFixedStepLoop`; `qa` hooks expose `step(n)`, `hash()`, `reset(seed)` and are deterministic; audio never plays in replay.
6. `dispose()` followed by 4 remounts leaves element count and canvas count unchanged and at most one live WebGL context.
7. Type errors, not runtime errors, for wrong shapes: `ArcadeSizeFor<kind>` makes `size` per-kind (box `[w,h,d]`, sphere diameter, capsule `[dia, total height, dia]`, cone `[dia, height, dia]`, plane `[w, d]`).

### 3.2 Type changes (no behaviour change, each independently testable)
- `AuraColor` in `packages/engine/src/agent-api/nodes/types.ts:50` becomes a template-literal type `` `#${string}` `` plus named CSS colors union; plain `string` no longer accepted. Migration note in CHANGELOG. (Breaking for typos only; run `aura3d migrate` codemod table to confirm no repo template uses non-hex strings.)
- `AuraPrimitiveOptions.size` gets per-kind JSDoc and a discriminated overload per primitive factory in `nodes/primitives.ts`; `primitives.cone` appears in the generated API docs.
- `SceneBuilder.add` / `addMany` JSDoc: "Mutates the builder and returns it."
- `TouchControls` public type gains `update(dt: number)` or `createGame` calls it internally so `twin-stick` works (decide in WP-A2 by test).
- `HudWidgetSpec` exposes `mode` on the timer widget.
- `Game.input` becomes non-optional when `touch`/keys are configured.

### 3.3 Diagnostics (replace silent no-ops)
Add to `packages/engine/src/agent-api/compiler/diagnosticOnly.prd09.ts` / `optionCoverage.ts`:
- `CANVAS_STYLE_PINNED` (warn) if the app pins pixel CSS on a canvas inside a container narrower than it.
- `NODE_NOT_RUNTIME` (error) when `app.nodes.require(id)` is called for a node without `.runtime({ id, mutable: true })`, listing the ids that do exist (verify current message first; keep if already equivalent).
- `SIZE_SHAPE` (error with per-kind hint) when `size` has the wrong arity for the primitive kind (today shown only for bad `params`).
Each includes the fix in the message (what to pass), matching existing diagnostic style.

### 3.4 QA hook contract (agent-facing, stable)
`window.__EVAL__` (name configurable) exposes: `{ ready: boolean; state(): unknown; step(n: number): void; hash(): string; reset(seed?: number): void; paused: boolean }`. Mapping onto existing `installQaHooks` (`packages/engine/src/qa/hooks.ts`) keeps `window.__AURA_<ID>__` as an alias. `window.__EVAL_READY__` flips true after the first drawn frame (`app.onFrame` + one `requestAnimationFrame`), implemented inside `createArcadeGame`.

### 3.5 Agent-eval harness contracts (`tools/agent-eval`)
- `gate.mjs` (new): `node tools/agent-eval/gate.mjs --metrics <metrics.json> --targets tools/agent-eval/gate-targets.json` prints PASS/FAIL per target T1..T7 and exits non-zero on any FAIL.
- `gate-targets.json` (new): `{ "task6": { "medianTurnsMax": 6, "medianTurnsVsThree": "<=", "maxTurnsMax": 12, "medianInputTokensMax": 400000, "firstTryTypecheck": "3/3", "srcLinesMax": 200 }, "tasks1to5": { "medianTurnsMax": 5 } }`.
- `tasks/06-arcade-game.md` variants: `06a` (as today), `06b` (different game: "Catch", falling items), `06c` (different DOM contract, so a hard-coded recipe cannot pass). Each ships a `checklist` entry in `tasks/checklists.json`.
- Third arm `aura-gamemd`: Aura sandbox where `GAME.md` replaces the whole `docs/agents` bundle (ablation: does the single page alone do it).
- Probe fix: `pauseButton` accepts `/pause/i` in `textContent`, `aria-label`, `title`, or `data-*` name.
- Transcript fix: `lib/loop.mjs` stores the full tool result (compressed) alongside the 1,500-char preview.

### 3.6 `aura3d verify` (new CLI command, `packages/aura3d-cli`)
`aura3d verify [--dist dist] [--seed 1] [--steps 600] [--routes /]` = `check-deploy --browser` + load `window.__EVAL__`, assert `ready`, run `step(n)` twice from the same seed, assert equal `hash()`, assert non-black canvas, assert 0 console errors. Exit 0/1 with a one-line reason per failure. Playwright is resolved from the project, as in `deploy-browser-check.ts`.

---

## 4. File-by-File Breakdown

Lanes (disjoint file ownership; each lane is one subagent unit):
- **L-A1 engine fixes** | **L-A2 game kit** | **L-A3 arcade API** | **L-A4 template** | **L-A5 docs/context** | **L-B harness** | **L-C bundle** | **L-D receipts** | **L-E CLI verify + release** | **L-F site/evidence copy (last)**

### CREATE

| Path | Lane | Contents |
| --- | --- | --- |
| `packages/game/src/arcade/createArcadeGame.ts` | L-A3 | Implementation of 3.1. Composes `createAuraApp`, `createFixedStepLoop`, `createCountedRng`, `createCueBank`, shell, touch, HUD. |
| `packages/game/src/arcade/types.ts` | L-A3 | `ArcadeInput`, `ArcadeSim`, `ArcadePool`, `ArcadeGameOptions`, `ArcadeGame`, `ArcadeSizeFor<K>`. |
| `packages/game/src/arcade/presenter.ts` | L-A3 | Pool creation (`.runtime({ id, mutable: true })`) and per-frame pose application; offscreen parking for hidden items. |
| `packages/game/src/arcade/index.ts` | L-A3 | Re-export; wire into the `./game` export (root `package.json` line 77 and `packages/engine/src/contracts/stubs/game.ts`). |
| `tests/unit/game/arcade-game.test.ts` | L-A3 | Sim determinism, event→cue mapping, replay silence, dispose cleanliness (jsdom), pause/restart state machine. |
| `tests/browser/arcade-game.spec.ts` | L-A3 | Remote: touch via CDP `Input.dispatchTouchEvent` and mouse on every button; P/Esc/R/M; results overlay; 4-remount teardown; resize to 390x844; replay hash identical twice. |
| `packages/create-aura3d/templates/arcade-dodge/**` | L-A4 | `index.html`, `src/{sim,main}.ts` (main <= 40 lines using `createArcadeGame`), `GAME.md`, `README.md`, `package.json`, `tsconfig.json`, `aura.assets.json`, `src/aura-assets.ts`. Registered like the other 20 templates. |
| `docs/agents/GAME.md` (source of truth, copied into scaffolds, eval sandboxes and the `create-aura3d` bundle) | L-A5 | <= 6 KB. Sections: (1) ten-line recipe with `createArcadeGame`; (2) the `ArcadeSim` contract; (3) size-per-kind table including `cone`; (4) six rules: runtime ids, builder mutates, `await app.ready()` vs `.then()` (verified), planes lie in XZ, no `new AudioContext`, offline primitives are fine and labelled `prototype`; (5) when to leave the kit (use `createAuraApp` and the loop recipe, with the `AuraApp` cheat sheet); (6) QA contract. |
| `docs/agents/aura-app-cheatsheet.md` | L-A5 | <= 4 KB `AuraApp` / node-handle / `createFixedStepLoop` full-signature sheet (RC2, RC6). |
| `docs/api/audio-synth.md`, `docs/api/qa-kit.md` | L-A5 | Inlined content for the pages currently linked but not shipped (RC3, RC9). Shipped inside the package (`dist/docs/` or `templates/**/docs/`, decide with `package.json` `files`). |
| `tools/agent-docs-links/check.mjs` | L-A5 | Gate: every relative doc link and every `docs/api/*` mention in `llms.txt`, `AGENTS.md`, `docs/agents/**`, `GAME.md` resolves to a file inside the shipped bundle. Wire into `pnpm check:skills`-style root script. |
| `tools/agent-eval/gate.mjs`, `tools/agent-eval/gate-targets.json` | L-B | Section 3.5. |
| `tools/agent-eval/tasks/06b-catch-game.md`, `06c-dom-contract-game.md` | L-B | Task variants with `checklists.json` entries. |
| `tools/agent-eval/lib/arms.mjs` | L-B | Defines arms `aura`, `three`, `aura-gamemd` (third arm stages only `GAME.md` + cheatsheet + template). |
| `tests/unit/agent-eval/pause-probe.test.ts` | L-B | Icon-only button with `aria-label="Pause"` passes. |
| `tools/bundle-report/{build.mjs,report.mjs}` | L-C | Builds hello-world, product viewer, arcade-dodge with a stock Vite config; emits a table of raw/gzip/brotli per chunk and per package (rollup `visualizer` JSON). |
| `evidence/bundle/BASELINE.md` and `AFTER.md` | L-C | Generated by the above; committed so the targets are real. |
| `tools/real-gpu/receipt.schema.json`, `tools/real-gpu/publish.mjs` | L-D | Schema for a receipt (device, GPU string, driver, browser, scene id, frames, ms/frame, git sha, timestamp) and a publisher that writes `evidence/real-gpu/<date>/` and refuses software renderers (`SwiftShader`, `llvmpipe`). |
| `packages/aura3d-cli/src/verify.ts`, `tests/unit/aura3d-cli/verify.test.ts`, `tests/browser/verify.spec.ts` | L-E | `aura3d verify` (3.6). |

### MODIFY

| Path | Lane | Change |
| --- | --- | --- |
| `packages/engine/src/agent-api/app/canvas.ts` (lines ~98-99, `configureCanvas`) | L-A1 | Do not write `style.width/height` when `resize === false` or when the canvas has a CSS-driven size. Add unit test; keep existing behaviour for `resize: true`. |
| `packages/engine/src/agent-api/nodes/types.ts` | L-A1 | `AuraColor`, per-kind `size` JSDoc, `SceneBuilder` mutation JSDoc. |
| `packages/engine/src/agent-api/nodes/primitives.ts` | L-A1 | Per-kind overloads; SIZE_HINT surfaced in the type; `SIZE_SHAPE` diagnostic. |
| `packages/engine/src/agent-api/compiler/{diagnosticOnly.prd09.ts,optionCoverage.ts}` | L-A1 | New diagnostics from 3.3. |
| `packages/engine/src/qa/{hooks,fixedStepLoop}.ts` | L-A1 | `isActive`, `manual`, `advance`, `resetAccumulator` documented in JSDoc; `__EVAL__` alias helper. No behaviour change except the alias. |
| `packages/game/src/createGame.ts` | L-A2 | Forward touch `show`; make `input` non-optional when configured; call `touch.update(dt)`; remove canvas on `dispose()`; dispose WebGL context. |
| `packages/game/src/touch/TouchControls.ts` | L-A2 | Pointer events (pointerdown/up/cancel) for all buttons; keep touch events as fallback; public `update`; coarse-pointer auto-show. |
| `packages/game/src/styles.css` | L-A2 | Complete styles for `.a3g-touch`, `.a3g-tc`, HUD, pause and results overlays at 390x844 and 1280x720. |
| `packages/game/src/shell/GameShell.ts`, `shell/screens/{Pause,Results}.ts` | L-A2 | Render real DOM: Pause (Resume, Restart), Results (score, time, Restart). `showResults` mounts the overlay. |
| `packages/game/src/session/lifecycle.ts` | L-A2 | Document and export the bound keys; reject a consumer action named `pause` with a clear diagnostic instead of double-toggling. |
| `packages/game/src/hud/widgets/index.ts`, `components.ts` | L-A2 | Public `mode` on timer widget. |
| `packages/input/src/TouchLayouts.ts` | L-A2 | Add `left-right`, `drag-x`, `dpad` arcade layouts (not platformer-shaped). |
| `llms.txt`, `marketing/content/llms-core.txt`, `marketing/public/llms*.txt` (via `marketing/scripts/gen-seo.mjs`) | L-A5 | First screen (<= 30 lines) leads with "Building a game? Read `docs/agents/GAME.md` only". Remove "(in progress)" and monorepo-only line (`tools/remote-acr/run.sh`) from the published copy. |
| `AGENTS.md` (published/scaffold variants only) | L-A5 | Strip the owner-policy pointer block from copies written by `create-aura3d` and the eval stage; the repo file stays. Implement in `packages/create-aura3d` writer and `tools/agent-eval/lib/sandbox.mjs`. |
| `docs/agents/{recipes,build-a-game,agent-quickstart}.md` | L-A5 | Split each to <= 12k chars with traps and sizes first; fix recipe 4 loop options, plane orientation (RC12, after a render), stale `ENV_FETCH_FAILED` row (RC7), `.then()` vs top-level await (RC13, verified), "kit pieces you can adopt one at a time" section replacing "do not hand-roll" (RC11), offline primitives allowed (RC10). |
| `docs/agents/samples/coin-dash/main.ts` | L-A5 | Fix the plane line; replace with the `createArcadeGame` version in `arcade-dodge`. |
| `docs/agents/README.md`, `docs/agents/api-surface.md` | L-A5 | Point to `GAME.md` and the cheatsheet; add signatures to `api-surface.md` for the top 40 names. |
| `tools/agent-eval/lib/{loop,sandbox,score,tools,base}.mjs` | L-B | Prompt parity (both arms get a neutral "docs are in the project" line, no reading list); stage `GAME.md`; pause probe fix; full tool results stored; env overrides committed. |
| `tools/agent-eval/remote/score-all.mjs` | L-B | Pause probe fix, first-step time, WebGL context count, canvas style pinned check. |
| `tools/agent-eval/report.mjs`, `lib/report.mjs` | L-B | Per-arm table incl. third arm; call `gate.mjs`; print PASS/FAIL. |
| `packages/rendering/**`, `package.json` (`sideEffects`, exports), engine entry files | L-C | Per WP-C2..C4 after the report: lane registration, lazy post stack and loaders, game kit behind `./game`. |
| `packages/aura3d-cli/src/{cli.ts,cli-help.ts,index.ts}` | L-E | Add `verify`; publish `check-deploy --browser` (already present, uncommitted). |
| `README.md`, `marketing/index.html`, `docs/comparisons/threejs-positioning.md`, `docs/design/marketing-site-update.md` §9, `CHANGELOG.md`, `tools/site/stale-rules.mjs`, `tools/marketing-truth/index.ts` | L-F | Only after the gate passes (WP-F1). Add `createArcadeGame` and `verify` copy. Update section 9 backdrop row (by design). |

### DELETE
None. `createGame` stays. The four `apps/showcase-*-v2` folders stay (tests and tools read them).

---

## 5. Detailed Implementation Tasklist (Phased & Parallelizable)

Phases: **P0** (4.3.7 release, independent), **P1** (all lanes in parallel), **P2** (integration and gate), **P3** (release 4.4.0 and copy).

### P0: ship what is done (lane L-E, sequential, can start now)
**WP-0.1** Commit the uncommitted tree in logical commits: `check-deploy --browser` (`deploy-browser-check.ts`, `cli.ts`, `cli-help.ts`, the two tests), docs edits, `tools/site/stale-rules.mjs`, agent-eval evidence (`evidence/agent-eval/fullgame-436/`, `baseline1/NOTES.md`, `base.mjs`), full-game benchmark (`tools/bench-vs-threejs/full-game/`, `tests/browser/fullgame-compare.spec.ts`, `evidence/vs-threejs/full-game/`). Use `git add <paths>` (never `-A`); review `git status` after.
**WP-0.2** Add `CHANGELOG.md` 4.3.7 entry; run `node tools/release/prepare-version.mjs 4.3.7`; `node /tmp/rel437/bump-version.cjs 4.3.6 4.3.7` (recreate under `tools/release/` if `/tmp` is gone); `node marketing/scripts/gen-seo.mjs`; `tools/agent-skills/sync.ts` and `check.ts`; `tsc -p tsconfig.build.json`; `tools/finalize-dist`.
**WP-0.3** `publish-all.mjs --dry-run`, then `--from-plan` with no edits between; poll registry via fetch; tag `v4.3.7`; `gh release create`; deprecate all earlier npm versions; re-banner older GitHub releases (adapt `/tmp/rel436/{deprecate,banner-releases}.mjs`, edit NEW); clean-worktree Vercel preview then `--prod`; run `tools/verify-asset-urls` and `tools/site/scan-live-site.mjs`.
Human gate: none beyond the standing token (npm granular token expires about 2027-01-23).

### P1: parallel lanes (disjoint files, start together)

**Lane L-A1 (engine fixes)**
- WP-A1.1 `canvas.ts`: stop pinning inline pixels when `resize === false`; unit test with a 390 px container (jsdom) asserting no `style.width` remains. Add the remote browser assertion to `tests/browser` (canvas shrinks at 390x844).
- WP-A1.2 `types.ts` + `primitives.ts`: `AuraColor`, per-kind `size`, JSDoc, `SIZE_SHAPE`. Type tests (`tsd`-style under `tests/unit/engine/types/`) assert a mistyped colour and a 2-element box size fail to compile.
- WP-A1.3 Diagnostics from 3.3 with tests mirroring existing diagnostic tests.
- WP-A1.4 JSDoc for loop/RNG/builder; verify `isActive/manual/advance/resetAccumulator` appear in the emitted `.d.ts`.
- WP-A1.5 Render the plane in `sceneMath` terms (remote screenshot) to settle RC12; report which doc line was wrong.

**Lane L-A2 (game kit)**
- WP-A2.1 `TouchControls.ts` + `TouchLayouts.ts`: pointer events, arcade layouts, `update`, auto-show on coarse pointers. Browser test: CDP touch and mouse both move the player.
- WP-A2.2 `styles.css`: complete styling; visual check at 390x844 and 1280x720.
- WP-A2.3 `GameShell.ts`, `Pause.ts`, `Results.ts`: real DOM overlays; unit tests for state transitions.
- WP-A2.4 `createGame.ts`: forward `show`, input typing, dispose cleanup (canvas, context); 4-remount test.
- WP-A2.5 `lifecycle.ts`: bound keys exported; `pause` action conflict diagnostic.
- WP-A2.6 `HudWidgetSpec.mode`.

**Lane L-A3 (arcade API)** depends on A2 interfaces only through documented types; develop against the current stubs and rebase.
- WP-A3.1 Types and `createArcadeGame` per 3.1, built on the L-A2 kit pieces.
- WP-A3.2 Presenter and pools; verify with `arcade-dodge` skeleton (the 66-line `src/arcade.ts` that typechecked against 4.3.6 is the behavioural reference).
- WP-A3.3 QA hooks (`__EVAL__`, `__EVAL_READY__`) and replay determinism test against a Node-computed hash.
- WP-A3.4 Unit and remote browser tests (section 7 items).

**Lane L-A4 (template)** after WP-A3.1 types exist (can scaffold from the types).
- WP-A4.1 `arcade-dodge` template files; `main.ts` <= 40 lines. Register in the template list and `create-aura3d` tests; `pnpm check:templates`-equivalent.
- WP-A4.2 Template builds with a stock Vite config remotely and passes `aura3d verify` (after WP-E.1).

**Lane L-A5 (docs and context)**
- WP-A5.1 Write `GAME.md` (<= 6 KB), the cheatsheet (<= 4 KB), inline `audio-synth.md` and `qa-kit.md`.
- WP-A5.2 Split/reorder `recipes.md`, `build-a-game.md`, `agent-quickstart.md` to <= 12k chars each; apply fixes RC6 to RC13.
- WP-A5.3 Rework `llms.txt` first screen and `marketing/content/llms-core.txt`; strip owner/monorepo lines from published/scaffolded copies; regenerate via `gen-seo.mjs`.
- WP-A5.4 `tools/agent-docs-links/check.mjs` gate plus wiring; run `tools/agent-docs` and record that its 6 baseline failures are unchanged.
- WP-A5.5 Size gate: a test failing if any agent-facing doc exceeds 12,000 chars or `GAME.md` exceeds 6,144 bytes.

**Lane L-B (measurement)**
- WP-B1 Fix the pause probe (+ unit test) and re-score the stored fullgame-436 snapshots to show three.js at 1.00; record in `evidence/agent-eval/fullgame-436/REPORT.md` as an addendum (do not rewrite the original).
- WP-B2 Prompt parity and full-result transcript storage in `loop.mjs`; stage `GAME.md` in `sandbox.mjs`.
- WP-B3 Task variants `06b`, `06c` with checklists; third arm `aura-gamemd`.
- WP-B4 `gate.mjs` + `gate-targets.json` + report integration; unit tests with canned metrics (pass and fail cases).
- WP-B5 Run plan and spend: 5 runs per arm per variant (aura, aura-gamemd, three) = 45 runs. Baseline cost was 4.79M input tokens for 3 Aura runs, so budget up to ~25M tokens for the pre-fix control and ~3M after fixes. Run the control arm once now on 4.3.6 (cheap with the fixed probe) to freeze a baseline, then the post-fix batch after 4.4.0 is published to npm (registry install, as in the trial). Schedule through Kiro Prism; no standing infrastructure; remote scoring via ACR.

**Lane L-C (bundle and first frame)**, measure first.
- WP-C1 `tools/bundle-report`: build hello-world, product viewer and `arcade-dodge` with stock Vite; commit `evidence/bundle/BASELINE.md` (per-package and per-chunk raw/gzip). Identify what the 3.4 MB contains (hypotheses to test: all render lanes registered eagerly; post-processing stack; loaders including Draco/Basis/KTX2 wasm; game kit and audio pulled by `sideEffects`; the `node:fs` warning in the stock build; the "vendor/basis latent bug" noted in the sweep, location to be found in the report).
- WP-C2 Lane registration: register render lanes on demand from the scene's needs instead of at import.
- WP-C3 Lazy-load the post stack, loaders and wasm behind first use (dynamic `import()`); keep a synchronous path only where the first frame needs it.
- WP-C4 Keep the game kit and audio behind `./game` and `./audio` entry points with accurate `sideEffects`; tree-shake test.
- WP-C5 First-frame work: time to first step on software GL (T10); count WebGL contexts per mount (3 to 1).
- WP-C6 Generate `evidence/bundle/AFTER.md`; re-derive T8 from the baseline (target: at least halve the hello-world gzip critical path, absolute goal <= 750 KB, whichever is the stricter once measured).
Constraint: no change may alter rendered output; the existing visual-regression and `check-game-count` suites must stay green.

**Lane L-D (real-GPU receipts)**
- WP-D1 Receipt schema and `publish.mjs` (refuses software renderers); unit tests.
- WP-D2 Update `tools/real-gpu/run.sh` docs; no runs in this PRD.
- Human gate (owner): run `REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all` on the Mac (or grant GPU quota); commit the receipts. Until then, all performance statements keep the "software WebGL2" qualifier.

**Lane L-E (CLI)**
- WP-E.1 `aura3d verify` per 3.6; unit and remote browser tests extending `tests/browser/check-deploy-browser.spec.ts` fixtures.
- WP-E.2 Docs: `docs/api/cli-asset-tools.md`, `docs/agents/{verification,deployment}.md`, CLI READMEs, `cli-help.ts`.

### P2: integration (sequential after P1)
- WP-I.1 Merge lanes in order A1, A2, A3, A4, A5, E, C, B; resolve `package.json` exports and the `contracts/stubs/game.ts` surface; `pnpm typecheck`, full unit suite, `tsc -p tsconfig.build.json`.
- WP-I.2 Regenerate skills (`tools/agent-skills/sync.ts`), `gen-seo.mjs`, docs gates (`tools/marketing-truth`, `tools/docs-codeblocks`, `tools/marketing-link-audit`, `tools/agent-skills/check.ts` craft-ratio, `tools/agent-docs-links`).
- WP-I.3 Run the 4.4.0 release recipe (WP-0.2/0.3 with `4.4.0`), including deprecating every earlier npm version and re-bannering GitHub releases, then the post-fix gate batch (WP-B5) against the published package.

### P3: copy (lane L-F, only after the gate)
- WP-F1 If the gate passes: add the measured Aura3D numbers to `evidence/` and, on sales surfaces, only Aura3D-side facts with method (for example "a complete mobile arcade game in N lines, built from one template" and the agent turns/tokens measured). Never include the three.js column on sales surfaces. If the gate fails: record the result in `evidence/`, make no claim, open the next PRD from the failing targets.
- WP-F2 Update `docs/design/marketing-site-update.md` section 9: backdrop row is by design (HDRI backdrop; three.js apps use solid `#2b2f36`), check-deploy browser pass done, full-game comparison and cold-start trial done with links, real-GPU still owner-gated.

---

## 6. UI/UX & Edge-Case Specifications

This PRD's UI is the in-game shell rendered by the kit (not the AuraOne dense dashboard stack; the licensed-font rule applies to AuraOne product UI, and game HUDs use the game's own theme). Requirements:

- **HUD:** score (top-left), timer (top-center, tabular figures), lives (top-right), Pause button (top-right, text and `aria-label` both "Pause"), Restart reachable from the pause and results screens. Min tap target 44x44 CSS px.
- **Touch (coarse pointer):** `left-right` layout default: two large buttons bottom-left/bottom-right, 64x64 or larger, semi-transparent, safe-area insets respected. `drag-x` maps horizontal pointer drag to `pointerX`. Visible without a prior touch. Works with mouse/pen (pointer events).
- **Pause overlay:** dims the canvas, shows "Paused", Resume and Restart. The sim clock is frozen (state frame and time constant for 1.5 s). Resume continues without an accumulator jump (`resetAccumulator()` on resume).
- **Results overlay:** "YOU WIN" / "GAME OVER", final score, time, Restart. Restart resets the seed's run and hides the overlay.
- **States:** loading (canvas with a neutral clear colour and no text until `ready`), running, paused, results, error (if mount fails, render the existing error overlay from `errorOverlay.ts`; set `data-aura3d-error` on `<body>` so `check-deploy --browser` catches it).
- **Responsive:** 390x844, 800x600, 1280x720, 1000x500. Canvas scales by CSS to the container; backing store tracks `devicePixelRatio` (DPR 2 gives a 2x store) unless `resize: false` is set explicitly.
- **Edge cases:** tab hidden pauses; rapid P toggling does not desync; `dispose()` mid-run leaves no listeners on window/document/body; two games on one page do not share the `__EVAL__` global (suffix by target id when the default name is taken); mute key `M` persists in memory only; audio context starts only after a user gesture; no audio in replay or `step(n)` mode.
- **Accessibility:** buttons are real `<button>` elements with accessible names; overlay has `role="dialog"` and focus moves to its first button.

---

## 7. Verification & Acceptance Checklist

Run heavy and browser steps on the remote runner (`tools/remote-acr/run.sh`); never local Docker or local Playwright.

### Completeness
- [ ] Every file in section 4 CREATE/MODIFY exists with no `TODO`, placeholder or stub bodies.
- [ ] `createArcadeGame` is exported from `@aura3d/engine/game` and appears in the generated API docs; `docs/api/public-api.md` updated.
- [ ] Every agent-facing doc is <= 12,000 chars; `GAME.md` <= 6,144 bytes (gate test in WP-A5.5).
- [ ] `tools/agent-docs-links/check.mjs` passes: no link to a page missing from the shipped bundle.
- [ ] Owner-policy pointer block and monorepo-only lines are absent from the published `llms.txt` and scaffolded `AGENTS.md`.

### Static
- [ ] `pnpm typecheck` and the repo lint command pass.
- [ ] `tsc -p tsconfig.build.json` passes; `tools/finalize-dist` runs clean.
- [ ] Type tests: a mistyped colour, a wrong-arity `size`, and a `pause` action conflict each produce the intended error.
- [ ] `tools/marketing-truth`, `tools/docs-codeblocks`, `tools/marketing-link-audit`, `tools/agent-skills/check.ts`, `marketing/scripts/check-site.mjs`, `check-game-count` pass. `tools/agent-docs` shows only its 6 known baseline failures; the 3 known failures in `tests/unit/tools/migration-matrix.test.ts` are unchanged.

### Unit and contract
- [ ] `tests/unit/game/arcade-game.test.ts`: determinism (same seed and inputs give the same `hash()`), events→cues only live, results on won/lost, dispose leaves 0 DOM nodes.
- [ ] Canvas style test (`resize: false` leaves no inline pixel size).
- [ ] Diagnostics tests for `SIZE_SHAPE`, `NODE_NOT_RUNTIME`, `CANVAS_STYLE_PINNED`.
- [ ] `tests/unit/agent-eval/pause-probe.test.ts` and `gate.mjs` tests (canned pass/fail metrics).
- [ ] `tests/unit/aura3d-cli/{deploy-browser-check,verify}.test.ts`.

### Browser (remote, software WebGL2)
- [ ] `tests/browser/arcade-game.spec.ts`: non-black frame; four touch buttons visible at 390x844; CDP touch and mouse presses move the player; P, Esc, R, M keys; Pause and Restart buttons; win and lose overlays; replay hash equal twice and equal to a Node-computed hash; 4 remounts leave element count, canvas count and listener count unchanged; at most one live WebGL context after dispose; resize to 1000x500, 390x844, 800x600; DPR 2 backing store.
- [ ] `arcade-dodge` template: stock `vite build`, `aura3d verify` exits 0, 0 console errors, 0 failed requests, first step <= 2 s (T10).
- [ ] `tests/browser/check-deploy-browser.spec.ts` still passes.

### Bundle
- [ ] `evidence/bundle/BASELINE.md` and `AFTER.md` committed; hello-world gzip critical path reduced and T8 met against the baseline-derived target; visual-regression suite shows no pixel change attributable to lazy loading.

### Agent-eval gate (the real acceptance)
- [ ] Control batch on 4.3.6 re-scored with the fixed probe (three.js arm shows 1.00).
- [ ] Post-fix batch against the published 4.4.0: `node tools/agent-eval/gate.mjs ...` prints PASS for T1 to T7 on task 6 variants `06a`, `06b`, `06c` (n=5 per arm), and tasks 1 to 5 median <= 5 turns. Any FAIL is recorded in `evidence/` and blocks all efficiency claims.
- [ ] Judge-flagged silent no-ops on task 6 = 0 (T9).

### Release
- [ ] 4.3.7 and 4.4.0: 24 packages published, tag and GitHub release created, every earlier npm version deprecated, older GitHub releases re-bannered, production deployed, `tools/verify-asset-urls` and `tools/site/scan-live-site.mjs` clean.
- [ ] Memory/index updated with the outcome (project memory for 4.3.7 and 4.4.0).

---

## 8. Out of Scope & Do-or-Die Guardrails

Out of scope:
- Replacing `createAuraApp`, `createGame` or the renderer; changing look presets' visual output; the `product-studio` backdrop (by design).
- New genres beyond what `createArcadeGame` covers (no racing, fighting or platformer rewrites); `packages/navigation-recast`; animation studio.
- Any claim, on any public surface, that Aura3D is faster, cheaper or smaller than three.js, or "faster for AI agents", before WP-B4 passes. Never say "built on three.js".
- Real-GPU captures (owner-run); any statement of GPU performance without a receipt.
- Changing `three.js` arm behaviour in the harness beyond prompt parity and the probe fix.

Guardrails:
- Remote-first: no local Docker, no local Playwright, no unbounded `find`/`grep` from the home directory. Use `rg` scoped to the repo.
- Ask-free execution; the only human gates are: real-GPU capture (owner), live auth prompts, spending beyond the Prism/ACR run budget stated in WP-B5, and rotating shared credentials.
- Do not edit `evidence/**` historical files except by appended addenda; do not blind find/replace versions (use the targeted bump script).
- Do not widen the published surface silently: every new export is listed in `docs/api/public-api.md` and the CHANGELOG.
- Protected env vars (`GH_*`, `NPM_*`, etc.) are never set or written; publishing goes through the existing `publish-all.mjs` flow.
- Breaking type change (`AuraColor`) must be called out in the 4.4.0 CHANGELOG; if the migration-codemod sweep finds repo templates or tests using non-hex colours, fix them in the same PR.
- If a target in section 1 cannot be met, record the measured result and the cause in `evidence/agent-eval/` and stop claiming; do not move the target.
