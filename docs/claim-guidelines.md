# Public Claim Guidelines

Version: 0.1.0-alpha.0

## Rule

All public claim language for Galileo3D version `0.1.0-alpha.0` must be allowed by `docs/v2/claim-registry.md`.

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

> Galileo3D is an experimental TypeScript web 3D engine prototype with verified internal subsystem slices.

Keep the scope narrow and evidence-backed. Prefer "validation slice", "prototype", "internal evidence", and "known limits" over broad market claims.

The only current competitive wording allowed by the v2 registry is the exact bundle-size niche:

> Galileo3D generated smaller esbuild browser benchmark bundles than Three.js for all three checked-in equivalent scaffold scenes on this run.

This wording must keep the exclusions from `docs/v2/claim-registry.md` and must not be shortened into a general "better than Three.js" claim.

## Blocked Wording

Do not use unqualified language such as:

- production-ready;
- unqualified better than Three.js;
- Unity/Unreal replacement;
- full WebGPU support;
- production PBR parity;
- complete glTF ecosystem coverage.

These claims require the gates and evidence listed in `docs/v2/claim-registry.md`.

## Review Checklist

- Does the claim appear in `docs/v2/claim-registry.md`?
- Does the claim cite current evidence with the same release-run ID?
- Does the claim list known exclusions or unsupported areas?
- Would a new developer interpret the wording as broader than the evidence?
