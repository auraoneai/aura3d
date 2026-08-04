# Visual review: why a signature alone will not fix this

**Do not simply re-sign `docs/project/showcase-visual-review.json`.** It will be invalidated by the
next screenshot run. The gate is unsatisfiable against its current producer, and that has to be fixed
first. Full analysis in `GameEngine-PRD.md` §3.1.

## The measurement

Re-running `tests/browser/showcase-library.spec.ts` with **no code change at all** produces different
bytes:

- **3 of the 4** approved routes' desktop screenshots differed between two consecutive runs.
- **14 of 29** screenshots overall differed.

Most showcase routes run a continuous frame loop with live telemetry in the HUD (frame counters,
animating districts, particles). The capture is `waitForTimeout(300)` followed by `page.screenshot`,
so it records whatever frame the loop happened to reach. Routes do not expose their app handle, so a
test cannot pause them.

The gate binds approval to `sha256` of those exact bytes **and** fails when
`screenshot mtime > reviewedAt`. So any regeneration invalidates a signature that is still visually
correct, and the only way to keep the gate green is to never re-run the spec. That is why it was
already red before 1.5.2 — which shipped anyway.

## What was verified as genuinely correct

The visual state itself is fine. Both flagship game routes were inspected directly:

- **Turbo Drift Circuit** — the car's wheels sit on the tarmac (WS-4.1 mesh surface), and the HUD reads
  `STATUS Ready` rather than the misleading `running` (WS-5.3).
- **Skyline Runner** — hero grounded on the course, collectibles and checkpoint gates rendering.

`tests/browser/showcase-library.spec.ts` passes 6/6, and `check:quality-gates` reports 21 pass /
0 fail / 0 unproven.

## The fix, before any signature

Pick one:

1. **Deterministic producer.** Pause the app and freeze HUD counters before capture. Needs routes to
   expose their handle, or `createAuraApp` to gain a documented settle-and-hold mode. This is the
   correct fix and it changes the public surface.
2. **Perceptual binding.** Approve against a quantised/downsampled signature or a bounded
   pixel-difference tolerance, so a visually equivalent frame retains approval.
   `readPngVisualCompositionMetrics` already computes suitable metrics.

Then re-sign, and the signature will hold.

## If you choose to ship 1.5.3 with this red

That is defensible — 1.5.2 did exactly that. The difference is that it would now be **red and
explained**, with the cause measured and written down, rather than red and unexamined. Say so in the
release notes rather than working around the gate.

## Note on `refresh-visual-review-baseline.mjs`

It rebinds every hash and brings `visualReview.fileOk` to `true` (46 failures → 1), but it
deliberately resets `reviewer` to `pending` and every verdict to `needs-work`, so it trades one
failure for another and **erases the owner's existing approval**. I ran it, saw that it destroyed a
real signature, and restored the committed document.

## The other release decision

`check:bundle-size` fails on a pre-existing overrun: `core-agent-api` is 578,017 B gzip against an
80,000 B budget. Measured at `v1.5.2` with the same instrument it was 567,890 B (7.10x), so this
branch adds 1.8%. 1.5.2 shipped with that gate *crashing* rather than measuring, so 1.5.3 is the first
release where the number is visible. The budget was deliberately not raised.
