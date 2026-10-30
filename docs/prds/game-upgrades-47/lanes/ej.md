# Lane ej: WP-10 (E-J) HUD themes and art-direction genre

- Branch `gu47/ej`, base `f797808be`, wave 1 (phase 1, code only).
- Scope: PRD contract lines 291-296, WP lines 448-451, D9; owned files per PRD §4.1 E-J row plus the HUD font files and the CSS the theme system ships (`packages/game/src/fonts/**`, `packages/game/src/styles/themes/*.css`, `packages/game/src/styles.css`).
- Resume: the predecessor left 30 uncommitted files (font swap, NOTICE, theme CSS). Reviewed against the licence rules (every copy is an unmodified WOFF2 web cut, sha256 equal to its library source, no trial or subset cut, no OFL leftovers referenced anywhere) and committed unchanged as the first action (`120be4427`).

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EJ-1 licensed faces in the seven existing themes | M | done | 120be4427, dc74c8794 | Orbitron, Barlow Condensed, IBM Plex Mono, Russo One, Tektur and the plain theme's platform stack replaced by licensed WOFF2 web cuts (table below). `rg -n "Roboto\|Barlow\|system-ui\|-apple-system" packages/game/src/hud/themes.ts` prints nothing (the predecessor's comments still named the old faces; reworded in dc74c8794). |
| EJ-2 themes `storybook`, `ink-scroll`, `sky-expedition` | M | done | dc74c8794 | `HudThemePreset` + `HUD_THEMES` + CSS mirrors; six new licensed WOFF2 files with NOTICE rows. Every theme also gains `--a3g-font-display` (D-2). `tests/unit/gu47/ej/hud-themes.test.ts`. |
| EJ-3 `GameGenre` `"maze-arcade"` + look-recipes row | M | done | cf2fb1626 | `packages/engine/src/contracts/art.ts:9`, `GAME_GENRES` in `packages/game/src/art/define.ts:48`, maze-arcade row in `look-recipes.md` (+4 synced mirrors); `pnpm check:skills` failures `[]`. `tests/unit/gu47/ej/maze-arcade-genre.test.ts` (4 tests). |
| EJ-4 `audioReactive` juice binding (optional) | C | done | 631c168d2 | `packages/game/src/juice/audioReactive.ts`, exported from `@aura3d/game`; `tests/unit/gu47/ej/audio-reactive.test.ts` (7 tests, one on a real `AudioAnalyser` over a fake Web Audio graph). |
| EJ-5 shell default face | S | done (default change) | ab5f4b42a | `packages/game/src/styles.css` root `--a3g-font` (the `.a3g-shell` face) was a platform stack; now the plain theme's Graphik stack. Own commit, revertable alone; no app imports `@aura3d/game/styles.css` today. |
| EJ-6 no synthetic bold from `registerGameFonts` | S | done | c6a63b1cd | heaviest face per family registers over `<weight> 900` (D-5). Own commit. |
| EJ-7 phase-2 HUD theme capture | M | phase 2 | - | PRD names no E-J receipt, so no `tests/browser/gu47/` spec was added (it would be unrun browser code outside the typecheck); capture plan below. |

## Fonts per theme (for G06, G11, G13, G20, G25 and every HudKit game)

All files live in `packages/game/src/fonts/` (provenance, bytes and sha256 in `NOTICE.txt`). A game copies the files of its theme into its own app folder (for example `apps/<app>/public/fonts/`) and calls `registerGameFonts("/fonts/", document, hudThemeFontFaces("<theme>"))`; `hudThemeFontFaces(theme)` returns exactly the rows below for that theme. Weights are the font-library README weights. HudKit's base CSS sets all HUD text in `--a3g-font`; `--a3g-font-display` is for the game's own titles, banners and cards.

| Theme | Role | Face (registered family) | File | CSS weight | Bytes | Foundry |
|---|---|---|---|---|---|---|
| arcade-neon | text + display | Aeonik Fono ("A3G Aeonik Fono") | aeonik-fono-400.woff2, aeonik-fono-700.woff2 | 400, 700 | 24364, 24912 | CoType |
| motorsport | text + display | National 2 Narrow ("A3G National 2 Narrow") | national-2-narrow-400.woff2, national-2-narrow-700.woff2 | 400, 700 | 37963, 39488 | Klim |
| sports-broadcast | text + display | Calibre ("A3G Calibre") | calibre-400.woff2, calibre-600.woff2 | 400, 600 | 31791, 31664 | Klim |
| sci-fi-telemetry | text + display | Neue Haas Grotesk Text ("A3G Neue Haas Grotesk Text") | neue-haas-grotesk-text-400.woff2, neue-haas-grotesk-text-500.woff2 | 400, 500 | 26288, 28620 | Linotype |
| fighting | text + display | Untitled Sans ("A3G Untitled Sans") | untitled-sans-400.woff2, untitled-sans-700.woff2 | 400, 700 | 34774, 35394 | Klim |
| tabletop | text + display | Suisse Works ("A3G Suisse Works") | suisse-works-400.woff2 | 400 | 31228 | Swiss Typefaces |
| plain (default) | text + display | Graphik ("A3G Graphik") | graphik-400.woff2, graphik-500.woff2 | 400, 500 | 30241, 35624 | Commercial Type |
| storybook | text | GT Walsheim ("A3G GT Walsheim") | gt-walsheim-400.woff2 | 400 | 40000 | Grilli Type |
| storybook | display | Canela ("A3G Canela") | canela-400.woff2 | 400 | 31756 | Commercial Type |
| ink-scroll | text | Suisse Works Italic ("A3G Suisse Works Italic") | suisse-works-italic-400.woff2 | 400 | 32912 | Swiss Typefaces |
| ink-scroll | display | Domaine Display ("A3G Domaine Display") | domaine-display-700.woff2 | 700 | 40621 | Klim |
| sky-expedition | text + display | Roobert ("A3G Roobert") | roobert-400.woff2, roobert-700.woff2 | 400, 700 | 28784, 28640 | Displaay |

Per waiting game:

- **G06 pips-big-leap** (PBL-H1): `theme: "storybook"`; copy `gt-walsheim-400.woff2` and `canela-400.woff2`. Canela is the licensed display face the row asks for (`font-family: var(--a3g-font-display)` on parchment chips and banners).
- **G11 bunker-zero** (BZ-17): no E-J theme carries DIN Pro: the library has DIN Pro only as TTF and WOFF (`sans/DIN-Pro/DINPro-*.woff`, about 46 KB each), so it cannot join the WOFF2, 40 KiB theme set. G11 self-hosts the DIN Pro WOFF web cut app-locally (README step 1: WOFF2, falling back to WOFF) or mounts HudKit with a theme from the table; the licence rules are the same either way.
- **G13 dot-dash-3d**: `genre: "maze-arcade"` in `art/direction.ts` (EJ-3). Its HUD row (DD47-H1) names Graphik: that is the `plain` theme face (`graphik-400/500.woff2`).
- **G20 ninja-runner-port** (NR-19): `theme: "ink-scroll"`; copy `suisse-works-italic-400.woff2` and `domaine-display-700.woff2`; use `--a3g-font-display` for the brush district card.
- **G25 cloud-runner-port** (CD-19): `theme: "sky-expedition"`; copy `roobert-400.woff2` and `roobert-700.woff2`.

## Decisions

- **D-1 Faces.** Each text face carries tabular figures (`tnum`), because HudKit sets `.a3g-w-value` in `tabular-nums` and runner/platformer counters tick every frame; every face is an unmodified WOFF2 web cut at or under 40 KiB (§17 budget, 40 × 1024 bytes, enforced by the test). Inside that budget only sans faces, Suisse Works and the capitals-only Trajan carry `tnum`, so the display serifs (Canela, Domaine Display) are display-only. Choices: storybook text GT Walsheim (README first choice for education and kids, Regular only: its Bold is 41492 bytes and README avoids it as a heading weight), storybook display Canela (soft flared picture-book titles); ink-scroll text Suisse Works Italic (calligraphic movement, distinct from tabletop's roman), ink-scroll display Domaine Display Bold (sharp wedge serifs, ink-stroke contrast); sky-expedition Roobert Regular and Bold (open, soft geometric with a real Bold). No real game or brand is imitated. The predecessor's seven picks were kept: all are web cuts with `tnum`.
- **D-2 `--a3g-font-display`.** Added to every theme so all themes keep one key set (tested); it equals `--a3g-font` except storybook (Canela) and ink-scroll (Domaine Display). HudKit does not read it; nothing renders differently for scenes that do not use it.
- **D-3 Italic as its own family.** `suisse-works-italic-400.woff2` registers as "A3G Suisse Works Italic" with `style: "normal"`, so the theme can select it without HudKit setting `font-style: italic` (no double slant, no synthesis).
- **D-4 Light paper panels.** The three new themes use light translucent panels with dark ink (the three waiting games ask for parchment or paper HUDs). Contrast is tested over black, white, cobalt and moss backdrops: text, dim text, warn and danger at least 4.5:1, accent at least 3:1. Caveat: HudKit's damage numbers use `--a3g-fg` over the scene; on these themes they are dark ink, so a game that shows damage numbers over a dark scene should override `--a3g-fg` on `.a3g-damage` in its own CSS.
- **D-5 `registerGameFonts(baseUrl, registry, faces?)`.** Optional third parameter (default every face, unchanged) so a game loads only the files it copied; `hudThemeFontFaces(theme)` builds the list. The heaviest face of each family in `faces` registers over the weight range `<weight> 900`, so HudKit's 700/800 requests render that real cut instead of browser-synthesised bold (README: never rely on synthetic bold; Blink, Gecko and WebKit synthesise only when the matched face's declared range stays below 600). A game that declares its own `@font-face` for these files should do the same (`font-weight: 500 900` on the heaviest cut) or set `font-synthesis: none`. `registerGameFonts` has no callers today; `register.ts` sits in the HUD font folder and no other lane owns it.
- **D-6 Package index.** `packages/game/src/index.ts` (no GU47 owner) gains the new public names (`hudThemeFontFaces`, `HudFontFace`, `audioReactive` and its types) so game lanes import them from `@aura3d/game`.
- **D-7 Not changed.** `HudKit.ts:151` and its mirror `styles/hud-base.css:4` keep `var(--a3g-font, system-ui, sans-serif)`: the fallback is unreachable for preset themes (HudKit always sets `--a3g-font`), HudKit.ts is not an E-J file, and changing only the mirror would make it drift. `shell/screens/ContextLost.ts:23` (shell code, not theme CSS) still names a platform stack; see Follow-ups.

## Handoffs

Received (re-read before finishing): none of the other nine lane reports (ea, eb, ec, ed, ee, ef, eg, eh, ei) address E-J.

| to lane | file:symbol | change | why |
|---|---|---|---|
| WP-38 | `packages/aura3d-cli/skills/aura3d-art-direction/SKILL.md:8,83` | list maze-arcade with the genre rows and say "14 genre rows" | look-recipes.md now has 14 rows; SKILL.md is outside E-J's files |
| WP-38 | `docs/api/game-cheatsheet.md` (HUD theme list, if it enumerates presets) | add storybook, ink-scroll, sky-expedition, `hudThemeFontFaces`, `audioReactive` | docs outside E-J's files |

## Follow-ups (no owner in GU47)

- `packages/game/src/shell/screens/ContextLost.ts:23` sets `font: "600 16px/1.4 system-ui, sans-serif"`; `HudKit.ts:151` / `hud-base.css:4` keep a `system-ui` fallback inside `var(--a3g-font, ...)`. Point both at the plain theme's Graphik stack in a later change.
- `packages/aura3d-cli/src/look/rubric.ts:35` holds a condensed genre-to-recipe table; it has no maze-arcade entry (not an E-J file; it falls back like any unlisted genre).

## CHANGELOG text for WP-38

- `@aura3d/game` HUD themes use licensed web fonts only: every `HUD_THEMES` font stack leads with a self-hosted WOFF2 web cut (Aeonik Fono, National 2 Narrow, Calibre, Neue Haas Grotesk Text, Untitled Sans, Suisse Works, Graphik); the open-source display faces and the platform UI stack are gone, including the shell default `--a3g-font` in `@aura3d/game/styles.css`. Provenance (foundry, library source, bytes, sha256) is in `packages/game/src/fonts/NOTICE.txt`.
- New HUD themes `storybook` (GT Walsheim with Canela titles on cream paper chips), `ink-scroll` (Suisse Works Italic with Domaine Display titles on rice paper) and `sky-expedition` (Roobert on airy cloud-white panels).
- Every theme exposes `--a3g-font-display` for game titles and cards; `hudThemeFontFaces(theme)` lists the font files a theme needs, and `registerGameFonts(baseUrl, registry, faces?)` loads just those without synthetic bold.
- New `audioReactive(analyser, options)` juice binding: an allocation-free band envelope on `AudioAnalyser` for emissive pulses, light flicker or HUD glow, resting under reduced motion.
- `GameGenre` adds `"maze-arcade"`; the art-direction skill's look recipes gain a maze-arcade row.

## API as shipped

- `type HudThemePreset = "arcade-neon" | "motorsport" | "sports-broadcast" | "sci-fi-telemetry" | "fighting" | "tabletop" | "plain" | "storybook" | "ink-scroll" | "sky-expedition"` (`packages/game/src/hud/themes.ts`, exported from `@aura3d/game`).
- `HUD_THEMES: Readonly<Record<HudThemePreset, HudThemeVars>>`; every entry has the keys `--a3g-font`, `--a3g-font-display`, `--a3g-fg`, `--a3g-fg-dim`, `--a3g-accent`, `--a3g-accent2`, `--a3g-warn`, `--a3g-danger`, `--a3g-bg`, `--a3g-edge`, `--a3g-glow`, `--a3g-radius`.
- `interface HudFontFace { readonly family: string; readonly file: string; readonly weight: number }` (new type export).
- `HUD_FONT_FACES: readonly HudFontFace[]` (19 faces, table above).
- `function hudThemeFontFaces(theme: HudThemePreset): readonly HudFontFace[]` (new export).
- `function registerGameFonts(baseUrl: string, registry: FontRegistry, faces?: readonly HudFontFace[]): Promise<{ loaded: readonly string[]; failed: readonly string[] }>` (new optional `faces`; heaviest face per family registers as `"<weight> 900"`).
- CSS: `packages/game/src/styles/themes/{storybook,ink-scroll,sky-expedition}.css` (`.a3g-hud.a3g-theme-<preset>`), mirrors of `HUD_THEMES`; `packages/game/src/styles.css` `:root --a3g-font` = plain theme stack.
- `function audioReactive(source: AudioReactiveSource, options?: AudioReactiveOptions): AudioReactive` (`packages/game/src/juice/audioReactive.ts`, exported from `@aura3d/game`), with
  - `type AudioReactiveSource = Pick<AudioAnalyser, "getFrequencyData">`
  - `interface AudioReactiveOptions { readonly band?: readonly [number, number]; readonly attack?: number; readonly release?: number; readonly floor?: number; readonly gain?: number; readonly range?: readonly [number, number]; readonly reducedMotion?: () => boolean; readonly apply?: (value: number) => void }` (defaults: band `[0, 1]`, attack 0.03 s, release 0.25 s, floor 0.05, gain 1, range `[0, 1]`)
  - `interface AudioReactive { update(dtSeconds: number): number; readonly value: number; readonly level: number; reset(): void }`
- `type GameGenre = ... | "arena-shooter" | "maze-arcade"` (`packages/engine/src/contracts/art.ts:9`); `GAME_GENRES` (`@aura3d/game/art`) ends with `"maze-arcade"`.

## Phase-2 plan

- Capture (remote runner, software WebGL2): mount HudKit on a fixture page once per theme (10 themes) with score, meter, lives, objective, banner and toast widgets; capture 1280x720 and 390x844. Assert from the page: `document.fonts.check('16px "A3G <family>"')` true for the theme's faces after `registerGameFonts(..., hudThemeFontFaces(theme))`; computed `font-family` of `.a3g-w-value` leads with the theme's "A3G" family; no `system-ui` in any computed HUD font stack; no synthetic bold (glyph advance of a bold `.a3g-w-value` equals the registered heaviest cut); HUD text at least 11 px; panel contrast as in the unit test.
- Game lanes G06, G20, G25 capture their HUD with the new theme (their WP acceptance lines: ui_hud and typography at least 7).

## Verification

- Base run before the first edit (HEAD `120be4427`): `tests/unit/game/hud.test.ts`, `tests/unit/contracts/impl/prd14-art.test.ts`, `tests/unit/contracts/C-35-art.test.ts`, `tests/unit/tools/agent-skills-check.test.ts`, `tests/unit/game/juice.test.ts`: 5 files, 57 tests pass.
- Branch (c6a63b1cd): those five plus `tests/unit/gu47/ej/hud-themes.test.ts` (15), `tests/unit/gu47/ej/maze-arcade-genre.test.ts` (4), `tests/unit/gu47/ej/audio-reactive.test.ts` (7): 8 files, 83 tests pass. `tests/unit/game/flag-default.test.ts` (4), `tests/unit/contracts/C-24-game.test.ts` (3) and `tests/unit/contracts/impl/prd09-game.test.ts` (10), which import the package index, pass (the first and last hit a vitest worker RPC timeout once under machine load and passed on rerun). No test that passes on the base fails on the branch.
- Typecheck delta (`bin/typecheck-delta.mjs`, at c6a63b1cd): 58 errors, baseline 58, `NEW_ERRORS 0`.
- `pnpm check:skills` (run as `node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/agent-skills/check.ts`): failures `[]`.
- eslint on every TypeScript file changed since the base: clean.
- WP-10 acceptance: `rg -n "Roboto|Barlow|system-ui|-apple-system" packages/game/src/hud/themes.ts` prints nothing.
