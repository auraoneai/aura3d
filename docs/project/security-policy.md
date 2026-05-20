# Security Policy

Version: 1.0.0

## Supported Security Scope

Galileo3D is currently an production TypeScript-first browser 3D engine package. Security handling applies to the source tree, verification tooling, examples, package metadata, and generated release artifacts for version `1.0.0`.

## Reporting A Vulnerability

Do not open public issues for suspected vulnerabilities. Send a private report to the repository maintainer with:

- affected package, example, tool, or workflow path;
- exact version or commit SHA;
- reproduction steps from a clean checkout;
- observed impact;
- any exploitability notes and suggested remediation.

The maintainer should acknowledge receipt within 5 business days, triage severity, and publish a fix or documented mitigation before making details public.

## Security Release Rules

- A security fix must include a regression test or documented reason why a test is not feasible.
- Release notes in `CHANGELOG.md` must mention security-impacting changes without disclosing active exploit details before mitigation.
- Public security claims must remain within `docs/project/claim-guidelines.md`, `docs/project/v9-roadmap-claim-boundary.md`, and the historical `docs/project/v2-claim-registry.md`.
- Production-readiness, full WebGPU, Unity/Unreal, full Three.js parity, or Three.js superiority wording is not allowed unless the current V9 claim boundary and release gates permit the exact wording.

## Dependency And Supply Chain Policy

- New runtime dependencies require a maintainer review for license, maintenance status, and browser compatibility.
- Release verification must be run from a clean checkout before a release candidate is tagged.
- Generated reports under `tests/reports` must be current for the release-run ID being evaluated.
- Runtime code must not import Three.js into G3D product packages as an implementation shortcut; Three.js remains allowed only in comparison, benchmark, migration, and reference harnesses described by the V9 boundary docs.
