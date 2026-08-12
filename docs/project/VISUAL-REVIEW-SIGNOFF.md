# Aura3D 2.0 exact-artifact visual sign-off

Date: 2026-08-11

Status: independent human review pending

This is the operational sign-off contract for Aura3D 2.0. Automated screenshot,
route-health, interaction, subject-mask, gameplay, and deploy checks can prepare
a review packet, but they cannot grant aesthetic approval. Internal inspection
by the implementation agent also does not satisfy the independent-human gate.

## Routes requiring a verdict

The four non-game release candidates require independent review:

- Product Configurator
- Smart City Control
- Cinematic Architecture
- Digital Twin Operations

Each rebuilt game requires its own verdict; approval of the four routes above
cannot be inherited:

- Blockfall Reactor
- Skyline Runner
- Turbo Drift Circuit

Aura Clash remains a separately tracked development showcase. It requires the
same exact-artifact review before any site or release copy can call it approved
or flagship quality.

## Artifact binding

`docs/project/showcase-visual-review.json` is the machine-readable approval
record for the seven route-library candidates. Before review, run:

```bash
node tools/showcase-library/refresh-visual-review-baseline.mjs
```

The refresh binds each route to its current source, route-health record,
screenshot hashes, and perceptual signatures. It deliberately resets the
reviewer to `pending` and the verdicts to `needs-work`; a tool cannot manufacture
human approval.

Any change to route source, typed assets, generated asset metadata, camera,
material, lighting, environment, interaction, responsive layout, or screenshot
invalidates the affected verdict. Regenerate and review the complete affected
packet after such a change.

## Per-file review requirement

The reviewer must open every original-resolution artifact individually. Contact
sheets are navigation aids, not acceptance evidence. For each route, review all
applicable files in these classes:

- desktop, tablet, and phone full-page captures;
- canvas-only captures;
- meaningful interaction-final and reset captures;
- temporal frames for animated routes;
- subject-suppressed and subject-mask comparison images;
- before/after and masked-difference images;
- named gameplay states for game routes;
- current same-workload Three.js pairs where the route makes a comparative
  claim.

Reject any blank/fallback frame, unintended clipping or stretch, illegible UI,
misleading overlay, temporary/debug geometry, broken contact or grounding,
missing primary subject, visually inert interaction, incoherent composition,
unexplained Aura/Three material difference, or screenshot that disagrees with
its evidence record.

## Game-specific review

Blockfall must visibly prove a readable 10×20 board, active-piece entry,
hold/next queues, line-clear feedback, game-over, reset, and progression without
the former pink header block or white sweep artifact.

Skyline must be reviewed as a complete five-act Level 1, not as a single poster.
The packet must show traversal, jump and landing, sentries, collection chain,
checkpoint, fall/respawn, district progression, and finish. Automated duration
proof must retain the 120–180-second completion window without satisfying the
window by waiting at the finish.

Turbo must show forward chase play, a distinct rival, ordered gates, lap/race
progression, drift feedback, off-track recovery, and four wheels visibly
grounded on the circuit in normal and drift states. The route remains an arcade
handling claim; approval must not be worded as physical tyre or motorsport
simulation proof.

Aura Clash must preserve the improved typed fighters and verify readable
silhouettes, animation states, hit/guard/special feedback, arena composition,
HUD hierarchy, and meaningful combat progression. It cannot be approved from a
poster-only or idle-only frame.

## Approval record

For every approved route, record:

- reviewer identifier and name;
- `kind: "human"`;
- review date;
- exact source commit and lock hash;
- per-route verdict;
- approval scope;
- blocking issues, which must be empty for a pass;
- a substantive observation that refers to the inspected pixels and
  interactions;
- the artifact hashes written by the refresh tool, unchanged.

Use `verdict: "pass"` only when the exact artifacts satisfy the route's stated
scope. Keep `needs-work` and list concrete blockers otherwise. A pass is not a
universal renderer, game-engine, performance, ecosystem, or Three.js-parity
claim.

## Verification after review

```bash
node tools/showcase-library/build-and-check.mjs
pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot
```

The final release must then rerun the complete serial suites from the same
commit. If that rerun changes any approved artifact, the approval is stale and
must be repeated.
