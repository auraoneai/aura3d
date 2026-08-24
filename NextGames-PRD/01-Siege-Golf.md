# Siege Golf — Wrecking Green Redesign PRD

**Route:** `apps/showcase-siege-golf/`  
**Claim:** root-safe prototype; route-local nine-hole destruction golf; Rapier is physical owner

## Experience

Turn a medieval practice range into a chain-reaction puzzle. Aim a heavy ball, choose power, strike timber and barrels, topple the right structure, then sink into the sensor cup. The fun is not watching random blocks fall; it is predicting a legible structure and feeling the collapse answer the shot.

## Visual thesis

Golden-hour siege yard: warm timber and dust against blue distant hills, red target cloth, white ball, dark iron. Camera starts elevated enough to read ball, target structure, and cup in one composition. Aim mode flattens perspective slightly; flight follows the ball; settle mode widens to show consequence. Every hole has one landmark silhouette and one dominant destruction idea.

## Run structure

- Nine short holes grouped into teach, combine, and mastery thirds.
- Hole card shows par and one visual objective, then clears the play surface.
- Shot cycle: inspect → aim/power → strike → flight → impact/collapse → settle → score/reset.
- Progression introduces barrels, hinged gates, plank bridges, bank shots, and cup approaches only after their behavior is proven.

## Aura3D plan

- Typed ball, crates, barrels, planks, targets, and environment pieces; primitives only for abstract collision guides/set dressing.
- Public physics bodies/joints/sensors and deterministic fixed stepping; no hand-rolled replacement solver.
- Camera director states keyed to actual shot phases; scene effects for impact/dust only.
- Input replay records a best solution per hole as a visual ghost trajectory, not a physics participant.
- Typed audio buses: strike, wood, metal, target, cup, ambience, UI.

## Proof and quality gates

- Unit fixtures pin impulse, target/cup once-per-entry sensors, scoring, reset, and deterministic settle hashes.
- Browser proof completes representative direct, collapse, bank, and final holes.
- Acceptance captures: opening tableau, aim prediction, first impact, full collapse, cup sink, course complete, mobile aim.
- Ball and cup remain visible through every camera transition; dust never hides outcome.
- Route-health discloses body/joint counts, authored versus simulated behavior, assets, fallback, and blockers.

## Definition of done

- [x] All nine holes are completable, resettable, and distinct in silhouette/mechanic.
- [x] Shot input visibly changes physics state; score/par/progression are deterministic.
- [x] Destruction settles without persistent explosive jitter in pinned scenarios.
- [x] Keyboard/touch aim and reduced-motion camera both preserve playability.
- [ ] Exact desktop/mobile artifacts and deployed route pass independent review before promotion.

## Execution ledger

**Status:** Machine-complete; independent exact-artifact review pending  
**Last verified:** 2026-08-23 10:13 PDT  
**Implementation scope:** `apps/showcase-siege-golf/`, Siege unit/browser/evidence surfaces, generated artifacts, and this PRD  
**Authoritative evidence:** physics/scoring/replay units; playable/shot/capture browser specs; typed manifests; route-health/deploy; exact reviewed frames  
**Remaining blockers:** independent human approval of the exact final desktop/mobile/mechanic/course-complete artifacts remains open; the route must stay `prototype-blocked` and `publicShowcase: false` until that verdict is recorded

### Requirement checklist

- [x] SG-01 Nine distinct holes deliver teach/combine/mastery progression, landmarks, destruction ideas, par, completion, and reset.
- [x] SG-02 Opening/aim/flight/settle cameras keep typed ball, target structure, and cup readable without clipping.
- [x] SG-03 Golden-hour palette, depth, typed props, and restrained dust make structural cause/effect readable.
- [x] SG-04 Public Rapier bodies/joints/sensors solely own physical truth; route-local scoring/presentation remains labeled.
- [x] SG-05 Shot cycle and keyboard/touch aim visibly change physics state and complete direct, collapse, bank, and final-hole scenarios.
- [x] SG-06 Target/cup sensors fire once per entry; score/par/progression/reset and settle hashes are deterministic.
- [x] SG-07 Best solution replay is visual-only and cannot affect physics or scoring.
- [x] SG-08 Typed registered audio/effects map to strike, material impact, target, cup, ambience, and UI events.
- [x] SG-09 Opening, aim, impact, collapse, cup, course-complete, mobile, and reduced-mode artifacts pass.
- [ ] SG-10 Body/joint/performance, assets, route-health, deploy, claims, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | SG baseline | Current app/route-health and Siege physics/scoring/replay/browser suites located | In progress |
| 2026-08-23 | SG-02 | Root-safe camera director publishes and renders distinct `opening`, `aim`, `flight`, and `settle` phases; the regenerated desktop/mobile artifacts and mounted assertions prove opening-to-aim state/pixel deltas, while original-resolution inspection confirms ball, structure, and cup framing without clipping. Current opening hashes: desktop `fe36edca...03b5`, mobile `7c4f9c92...55e5`; charged-aim hashes: desktop `2cfe0533...352f`, mobile `90e99c82...0f35` | Passed |
| 2026-08-23 | SG-04 | All nine authored holes build and remain finite/contained on the public `physics.world` Rapier backend; route source owns only presentation/scoring around public dynamic/static bodies, fixed/hinge/spring constraints, and once sensors, and route-health retains the bounded `prototype`/route-local claim | Passed |
| 2026-08-23 | SG-06 | Fresh focused units pass 33/33: repeat inputs reproduce hashes, differing inputs diverge, idle settle stays byte-stable, reset hash matches, each stroke receives a fresh fixed-step budget, the fixed gate remains stable, the pre-shot hash is captured, stroke limit is exact, cup overlap fires once, and scoring/round/replay contracts remain deterministic; mounted completion/advance/reset/fail paths are green | Passed |
| 2026-08-23 | SG-08 | Nine typed, CLI-registered audio assets remain gesture-unlocked and event-mapped across drive, wood, metal, target, cup, par/bogey, ambient, and UI buses; physical impacts/topple plus renderer-owned aim/power-trail effects are state-driven, and 10/10 mounted browser cases verify cue and visual state changes | Passed |
| 2026-08-23 | SG asset/deploy gate | Four current-hash root production-runtime probes pass and were visually inspected: ball `aaa6ffe5...dff70`, crate `f446573e...c9db1`, barrel `8010029c...2b369`, plank `3447395c...762e6`. CLI re-registration records release quality, prop roles, durable CC-BY provenance/license URLs, hash-bound readable-view evidence, and explicit barrel camera-fit normalization; release-mode `check-deploy` passes with zero failures/warnings | Passed |
| 2026-08-23 | SG mounted/capture gate | Route typecheck, shared production build/deploy checks, 33/33 focused units, 10/10 mounted browser cases (6.5m), and four isolated production-runtime asset probes pass. Sunk/result artifacts are deliberately distinct after a runtime reveal beat: desktop `5621a2f2...ffb1` vs `10a3c16e...a36b`; mobile `4e031182...19f2` vs `d98870e5...e601`. Exact artifacts were agent-inspected but not independently approved | Passed machine evidence; independent review pending |
| 2026-08-23 | Reduced motion / touch DoD | A real-pointer 390x844 browser case proves direct left aim, held charge ≥25%, release-to-stroke, and flight-camera entry. A separate emulated-reduced-motion case proves aim/charge/strike remains playable, captures charged aim and flight, and reports zero renderer-only dust puffs while Rapier truth continues | Passed |
| 2026-08-23 | SG-03 | Golden-hour palette/depth and all four release-grade typed props are visible in the exact frame set. A dedicated real-strike browser case freezes the physical collapse with one state-driven burst/four active renderer dust puffs, flight camera, stroke `1`, and four unchanged Rapier bodies; the current restrained active-impact artifact is `aee2165c...ae6b` and was inspected at original resolution for readable ball/crate/cup cause and effect | Passed |
| 2026-08-23 | SG-07 | A completed hole retains accepted inputs plus sampled live-ball positions only when it improves the stroke count, persists the bounded record, then renders up to 36 dotted `renderer-owned`/`visual-only` nodes on return. Current stable reports toggle the ghost on (`b62d6435...1dd7`) versus off (`fe36edca...03b5`), plus compact reload (`29dce4ae...0fec`), while body count, live Rapier pose hash, strokes, and phase remain identical; evidence reports zero ghost physics bodies | Passed |
| 2026-08-23 | SG-01 / SG-05 | All nine authored definitions expose distinct teach/combine/mastery mechanics and exact reset hashes. The canonical solution matrix passes through both `HoleFlow` and the same player-facing `ShotController` precision path; the mounted browser then completes all nine via real controls in 10 strokes / 27 stars, with direct, collapse, bank, final-two-cup, and course-complete milestones. Final evidence hash `fce8a47d...115e`; final image `f1c76eaa...c078` | Passed |
| 2026-08-23 | SG-09 | The final 10-case browser producer regenerated opening, charged aim, mid-topple, active impact, cup sink, result, fail, mobile, reduced-motion, direct, collapse, bank, finale, and course-complete artifacts. Original-resolution agent inspection found each named mechanic and HUD state readable; direct `989e0e7f...f68f`, collapse `ea593ae9...dd90`, bank `7e9f783a...d3ab`, and finale `f1c76eaa...c078`. This is not the independent approval required for promotion | Passed machine/agent artifact QA; independent review pending |
| 2026-08-23 | SG-10 machine gates | Generated performance passes all nine canonical solutions at 26 bodies, 3 constraints, and 0.5823 ms physics-step p95 (`658b8fab...1620`). Four production-runtime typed-asset probes pass; full route-primary summary passes 11/11 with Siege hero bounds 270×272/readability 100; Siege static gate, build, deploy, and prototype classification all pass in generated launch evidence. Route remains honestly blocked by `visual-review:siege-golf-independent-review-pending`; the shared route-gate unit suite is 19/20 with only unrelated Blockfall classification state failing | Machine subset passed; SG-10 remains open for independent review |
