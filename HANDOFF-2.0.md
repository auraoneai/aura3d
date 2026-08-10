# Aura3D 2.0 release handoff

Version: 2.0.0

Status: blocked pending final PRD and release gates

## Release identity

| Field | Required value |
| --- | --- |
| Package version | `2.0.0` |
| Git tag | `v2.0.0` |
| Governing completion ledger | `1.6-FINAL-PRD-Finishes.md` |
| Release notes | `docs/project/aura3d-200-release-notes.md` |
| Migration guide | `MIGRATION-2.0.md` |
| Current Three.js comparison target | repository-locked `three@0.185.1` |

## No-go conditions

Do not publish while any of the following is true:

- a required final-PRD row is unchecked;
- an accepted example lacks current source, canvas, and full-page inspection;
- the unfiltered 13-route audit is not green from the release candidate;
- same-workload current-Three.js comparison requirements are incomplete;
- docs, site, tarballs, package manifests, and the lockfile disagree on 2.0.0;
- npm authentication, package ownership, provenance, GitHub permissions, or
  rollback inventory is unverified;
- a public claim is broader than its root/package/runtime evidence label.

## Ordered release procedure

1. Freeze the exact release commit and confirm the worktree contains no
   unrelated or generated-source edits.
2. Run the complete named release suites from that commit, including package
   install smoke tests and the final browser/visual audit.
3. Pack every public package; inspect names, versions, exports, files, sizes,
   dependency ranges, provenance, and install behavior.
4. Build and verify the public website against the same commit and accepted
   examples. Do not deploy stale 1.6 badges or retired routes.
5. Record the current npm version/deprecation state and GitHub tags/releases so
   every remote mutation has a rollback reference.
6. Verify `npm whoami` using the already authenticated local npm session. Never
   place a registry token in source, logs, prompts, shell history, or chat.
7. Publish 2.0.0, verify registry metadata and a clean external install, then
   create and push the exact `v2.0.0` tag and GitHub release.
8. Deploy the website and verify its public URLs, assets, examples, version
   badges, claim pages, and cache behavior.
9. Only after 2.0.0 and the website are verified, deprecate every older npm
   version with a message directing users to 2.0.0. Mark older GitHub releases
   superseded/deprecated without deleting tags or release history.
10. Re-query npm and GitHub and store the post-release inventory and rollback
    instructions in the release artifacts.

## Current state

This handoff is intentionally not approval to publish. The source manifests
have been moved to the 2.0.0 candidate line, but visual, comparison, full-suite,
website, and remote release gates remain authoritative.
