# Aura3D Animation Studio — Quality Gates & Honest Limitations

## Overview

The Animation Studio is gated by a suite of automated quality checks that run on a
**real rendered episode**, not on hand-asserted claims. The point of this document is
to be straight about two things at once:

1. **What the gates actually verify** — each gate measures one user-visible failure
   mode against the live render artifact (`render-live-summary.json`) and fails closed
   when the evidence is missing.
2. **The real ceiling** — the studio's character fidelity, motion, and director quality
   have honest limits. This document does not oversell them. The gates prove a scene is
   **valid**, not that it is **good**; the fidelity tiering labels anything short of the
   full stack as **previz**.

Every gate verdict is a real measured signal. No gate hard-codes `passed: true`. That
"no fabricated evidence" principle is itself enforced as a gate (see
[The no-fake-proof principle](#the-no-fake-proof-principle)).

Source of truth for this document:
- `tools/animation-studio-gate-suite/index.ts` (the aggregator)
- the individual gates under `tools/animation-studio-*`
- `apps/animation-studio-web/src/state/fidelity.ts` and
  `packages/create-aura3d/templates/animation-studio/src/fidelity.ts` (fidelity tiering)
- `packages/create-aura3d/templates/animation-studio/src/animation-performance.ts`
  (motion-source policy)
- `packages/create-aura3d/templates/animation-studio/public/cast-library/cast-library.json`
  (the default cast)

---

## The quality gate suite

`tools/animation-studio-gate-suite/index.ts` is a single CI aggregator. It runs every
summary-driven, user-visible-quality gate on one rendered episode plus its
`render-live-summary.json`, and produces one combined pass/fail verdict so a single
green/red answers "is this episode shippable?".

The suite's verdict is the **AND** of the gates it runs. It **fails closed** when the
render artifact is missing (a render that did not run cannot pass). It never hard-codes a
pass.

### Gates aggregated by the suite

| Gate (`id`) | Measures (user-visible quality) | Fails when |
| --- | --- | --- |
| `no-fake-proof` | No self-reported / hard-coded pass flags; the summary carries measured signals, not a verdict | The render summary asserts `passed`/`verified`/`approved`/`ok` (etc.) with no measured signals behind it, or carries no measured signals at all (empty `seekProofs` / `stagedPerformance`) |
| `rig-validity` | The cast's rigs can actually act — locomotion clips mapped, state graph + blend tree + IK chains valid | A character's rig is unusable: clips unmapped, state graph / blend tree / IK chain invalid |
| `body-motion` | The body visibly moves (mouth, captions, and camera explicitly **excluded**); not just the idle/talk fallback | A speaking character moves only its mouth (lip-flap only); the whole scene is idle/talk/fallback only; or a character is **displaced/contorted** (hips translation > ~1.5 m — flung off-stage or collapsed to the floor counts as broken, not "moving") |
| `motion-quality` | Clip usefulness — characters take more than one staged pose and mouths move during dialogue | A character holds a single pose for the whole shot, or mouths never move while a caption is attributed to them |
| `lip-sync-timing` | Mouths cycle during dialogue; no frozen mouth-open holds | A character's mouth holds open (a long static mouth-open hold) instead of cycling through speech |
| `subtitle-timing` | The caption on-screen window ≈ estimated speech duration; no lingering | A short line lingers far past its speech duration (e.g. an 8-word line held on a fixed 30 s window) |
| `prompt-specificity` | The render matches the prompt; no Moon-Garden fixture fallback | The render leaks the Moon-Garden fixture content when the prompt did not ask for it (`--allow-moon-garden` is required to opt in legitimately) |
| `visual-quality` | Real frame PNGs, toon shading applied, readable captions (UI wiring) | A representative frame PNG is empty/missing, toon was not applied, or captions are unreadable |
| `performance-budget` | Draw calls, encoded bytes, and frame count match `duration × fps` | Frame count drifts from `duration × fps`, or draw-call / encoded-byte budgets are breached |
| `no-fake-proof-chain` | No gate report in this suite's own chain hard-codes a pass; the chain of gate inputs is honest | Any of the suite's own persisted gate-input reports carries a hard-coded pass flag |

That last gate is the meta-rule applied a **second time**: after the suite produces each
gate report, it persists those reports to disk and re-runs the no-fake-proof scan over
them, so even the suite cannot launder a fake pass through its own outputs.

### Gates that run as their own CI steps

Two gates take an `EpisodeDocument` (not the render summary) and spawn their own render,
so they are deliberately **not** folded into the summary-driven aggregator. The
`package.json` `animation-studio:gate-suite` script chains them so CI still runs
prompt → document → render → measured output end-to-end:

- **Scene-coherence / framing** (`tools/animation-studio-scene-coherence-gate`) — checks
  framing/staging on the document.
- **Determinism** (`tools/animation-studio-determinism-gate`) — pins
  `document-hash → render-hash` and fails if an **unchanged** document renders to a
  **different** frame. `--write` pins (or updates) the expected render-hash; the default
  mode verifies and exits 1 on mismatch.

### Clean-room packaging check

`tools/animation-studio-clean-room/index.ts` proves the template works the way a user
would consume it, **outside** the monorepo: it copies the template to a fresh `/tmp`
dir, runs `npm install` with an isolated registry/token env (no workspace symlinks),
then attempts typecheck → build → render, and reports **exactly** which step it reached
and where it stopped. In a no-network sandbox it stops at install and says so honestly —
it never fakes a pass. It also runs static packaging audits that need no network
(no monorepo-only aliases or deep `dist/*` imports leak into the package,
`AnimationToonMaterial` is exported from source + dist, dist is generated from source,
no stale `Cartoon` names in the public API).

### Each gate is proven to fail on its exact defect

The gates are backed by **failing-by-design** unit tests
(`tests/unit/tools/animation-studio-gates.test.ts`) that feed each gate a synthetic
render summary containing its exact defect and assert the gate goes red. For example:

- body-motion FAILS when a speaking character only moves its mouth (lip-flap only);
- body-motion FAILS when the whole scene is idle/talk fallback only;
- body-motion FAILS when a character is displaced/contorted (lies on the floor);
- motion-quality FAILS when a character is static (single pose, no mouth motion);
- lip-sync-timing FAILS on a long static mouth-open hold;
- subtitle-timing FAILS when a short caption lingers far past its speech duration;
- visual-quality FAILS when toon was not applied, captions are unreadable, or a
  representative frame PNG is empty/missing;
- performance-budget FAILS when frame count drifts from `duration × fps`;
- every gate FAILS when the render summary is missing (fails closed).

This is what makes the green verdict meaningful: each gate is demonstrably **capable of
failing** on the precise thing it claims to catch.

---

## Running the gates

```bash
# The aggregated suite on a real render (CI's single green/red answer):
pnpm animation-studio:gate-suite

# The CLI gates that spawn their own render:
pnpm animation-studio:determinism      # via tools/animation-studio-determinism-gate
pnpm animation-studio:scene-coherence  # framing on the document

# The clean-room external-install proof:
pnpm animation-studio:clean-room

# Individual gates (each writes a JSON report under tests/reports/animation-studio/):
pnpm animation-studio:body-motion
pnpm animation-studio:lip-sync-timing
pnpm animation-studio:subtitle-timing
pnpm animation-studio:prompt-specificity
pnpm animation-studio:motion-quality
pnpm animation-studio:visual-quality
pnpm animation-studio:performance-budget
pnpm animation-studio:no-fake-proof
pnpm animation-studio:fidelity
```

The suite requires a live render to exist at
`packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json`.
If it is absent, the suite fails with a blocker telling you to run the live render first.

---

## Fidelity tiering (A / B / C)

Fidelity is graded honestly per character and per scene from the **real signals the
pipeline already records** (rig grade, provenance, motion source, shading, shadows). The
same pure grading rules run render-side
(`packages/create-aura3d/templates/animation-studio/src/fidelity.ts`) and in the studio
UI (`apps/animation-studio-web/src/state/fidelity.ts`); a unit test pins the two copies
to identical verdicts so the badge the user sees always agrees with the resolver. The
grade is **downgrade-only** from the full-stack ingredients.

| Grade | Label | What earns it |
| --- | --- | --- |
| **A** | `Grade A` | A curated **or** user-uploaded grade-A rig, playing **real** motion (mocap / extracted / embedded), rendered with cel-or-PBR shading **and** shadows — the full stack |
| **B** | `Grade B` | A catalog (or curated) rig that graded OK (rig A/B) but is missing one A ingredient — procedural motion, shadows off, or unshaded. A watchable catalog take, not previz |
| **C** | `Previz` | A mascot / authored-placeholder rig, **or** a rig too sparse to act (rig grade C/D). **Previz — never presented as a finished shot** |

A scene's grade is the **floor** of its characters (worst grade wins); an empty scene is
C/previz. Grade C sets `previz: true`, and the UI labels it `Previz` in the
Outliner / scene header — never "finished".

**Where the default cast lands today:** the shipped default cast (`miko`, `luma`, …) are
graded-A **rigs** (21-joint humanoids with full limb chains). With the default
**procedural** motion and the shipped shading they grade **B** — watchable, not previz,
but explicitly not the full A stack. They reach A only when paired with a real
(mocap/extracted) clip that has been render-validated for that rig.

---

## HONEST LIMITATIONS (the ceiling)

This section is deliberately blunt. These are real limits, not roadmap spin.

### 1. Character fidelity is capped at stylized-cartoon previz

The default cast are **Aura3D-authored procedural humanoids** — capsule/ellipsoid bodies
generated from code (`scripts/build-characters.ts`), not photoreal, not sculpted, not
scanned. Per `cast-library.json` each is roughly **37k triangles** (`miko` 37,080;
`luma` 36,744), a **21-joint** rig, with **1024px procedural textures**. They have hands
built from a palm lobe plus short **finger nubs** but **no per-finger bones** (no
articulated fingers), and a **faked-socket face** with a mouth morph rather than real
facial topology.

This is a stylized-cartoon look by design. It is **not photoreal** and will not become
photoreal by tuning. Closing that gap needs **real sculpted/scanned, properly rigged
character assets**, acquired by the user via `cast add --file <path.glb>` (their own
rigged GLB) or `cast add --query` (catalog). The code does **not** fabricate higher
fidelity than the asset it was given — a sparse rig grades C/previz, honestly.

### 2. Extracted catalog mocap is disabled by default

Extracted catalog mocap is **off by default** because it **distorts the real character
rig** — it removes legs and sags arms on these humanoids
(`src/animation-performance.ts`: the motion-source policy, render-verified twice). The
stable default is the **procedural** motion baseline (clean, predictable). Mocap can be
opted into for validation (e.g. `AURA_EXTRACTED=upper-body`), but it produces
distorted output and is for validation only.

Re-enabling mocap as a real default requires **per-rig validation by actual render** —
not by an FK/overlay numeric proxy. That proxy **passed twice while the rendered output
was visibly broken**, so it is not trusted; only a real rendered frame counts as proof.

### 3. Director quality for arbitrary prompts is a taste problem, not a code gap

The director heuristics reliably **stage a 1–2-character dialogue genre** and produce a
**valid** scene for an arbitrary prompt — characters are placed, framed, animated, and
captioned within the gated thresholds. What the heuristics cannot do is guarantee the
result is **good** (well-paced, well-written, dramatically interesting) for any prompt.
That is a **taste / authoring** problem, not a missing function.

"Watchable for any prompt" needs **human (or AI-harness) authoring** of the actual
dialogue and beats, following the authored-scene pattern (the AI harness writes the
dialogue). **The gates prove a scene is VALID, not GOOD.** A scene can pass every gate
and still be a boring scene; the gates only guarantee it is not broken.

### 4. The studio Wireframe view is a CSS preview filter

In the studio shell, the "Wireframe" view mode is a **CSS `filter`** applied to the stage
canvas (`apps/animation-studio-web/src/components/Stage.tsx` — a
grayscale/contrast/invert/hue-rotate stack), **not** a true geometry wireframe render. It
is a stylized preview overlay; it does not draw mesh edges from geometry.

### 5. Clean-room external install is proven from local tarballs

The clean-room install proof builds and installs the template from **local tarballs**,
which proves the package is self-contained and installs cleanly outside the monorepo. It
does **not** prove a real end-to-end install from npm. A genuine external user still
needs the `@aura3d/*` packages **published to npm**; until then the external-install
guarantee is "installs from the packed tarballs", not "installs from the public
registry".

---

## The no-fake-proof principle

The foundational rule across all of the above: **every gate verdict is a real measured
signal. No gate hard-codes `passed: true`.**

The render summary the gates consume must describe **what happened** — positions,
`mouthOpenness`, bone rotation ranges, caption windows — never **whether it passed**. The
pass/fail verdict belongs to the gates, not to the artifact. The `no-fake-proof` gate
(`tools/animation-studio-no-fake-proof-gate/index.ts`) enforces this directly:

- it scans the render summary (and every gate-input report the suite produces) for
  hard-coded pass flags (`passed`, `verified`, `approved`, `accepted`, `isPass`,
  `qualityPass`, `gatePass`, and a bare `ok` with no measured signals behind it), and
  fails when one is present;
- it fails when the summary carries **no measured signals at all** (empty `seekProofs` /
  `stagedPerformance`) — there is nothing to compute a verdict from, so it cannot pass;
- it runs **first** in the suite, and again over the suite's own outputs, so a fake pass
  cannot be laundered through any layer.

Combined with the failing-by-design tests, this is what gives the green verdict its
value: the evidence is measured from a real render, the artifact never grades itself, and
each gate is proven able to fail on its exact defect. The honest ceiling above is the
other half of the same principle — we don't claim fidelity, motion, or director quality
the code cannot actually deliver.
