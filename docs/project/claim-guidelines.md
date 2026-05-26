# Public Claim Guidelines

Version: 1.0.0

## Rule

All public claim language for Aura3D version `1.0.0` must be backed by the current V10 claim-defense evidence:

- current V10 status: `docs/project/v10-superiority-status.md`
- claim-defense report: `tests/reports/v10/claim-defense.json`
- superiority audit: `tests/reports/v10/superiority-audit.json`
- current state: `docs/project/current-state.md`

If those documents disagree, use the narrower claim until the report and docs are regenerated together.

This applies to:

- root README text;
- package descriptions;
- release notes;
- example README files;
- tutorials and API docs;
- marketing copy;
- issue or support responses that may be copied into public docs.

## Allowed Baseline Wording

Use wording such as:

> A3D is a production TypeScript-first browser 3D engine and workflow SDK that matches or exceeds Three.js across the measured graphics, animation, asset, physics, performance, and developer-workflow categories documented by the A3D superiority audit.

Keep the scope evidence-backed. Prefer "measured category", "published V10 report", "claim-defense evidence", and "route-backed proof" over unsupported market claims.

The current V10 audit may be described with its explicit status:

> The V10 superiority audit passes with parity or exceeds decisions across feature coverage, graphics and visual quality, animation fidelity, physics and interaction, performance, asset pipeline, WebGPU/WebGL2, developer workflow, stability and memory, and documentation/GTM.

The historical bundle-size niche remains allowed only with the exact evidence boundary:

> Aura3D generated smaller esbuild browser benchmark bundles than Three.js for all three checked-in equivalent scaffold scenes on this run.

This wording must keep the evidence links from `tests/reports/v10/claim-defense.json` and must not be shortened into an unmeasured "better at everything" claim.

## Blocked Wording

Do not use unqualified language such as:

- unqualified better than Three.js;
- exceeds Three.js in every sense;
- Unity/Unreal replacement;
- every possible WebGPU browser/device combination;
- every glTF extension and asset in the ecosystem;
- every official Three.js example exceeded.

These claims require new gates and evidence in the V10 report suite before they can appear in public copy.

## Review Checklist

- Does the claim appear in `docs/project/v9-roadmap-claim-boundary.md` or `docs/project/v2-claim-registry.md`?
- Does the claim cite current evidence with the same release-run ID or current V9 report path?
- Does the claim list known exclusions or unsupported areas?
- Does the claim distinguish matched, partial, unsupported, and exceeded coverage?
- Would a new developer interpret the wording as broader than the evidence?
