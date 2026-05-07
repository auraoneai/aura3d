# Security Policy

Version: 0.1.0-alpha.0

## Supported Security Scope

Galileo3D is currently an internal experimental rebuild package. Security handling applies to the source tree, verification tooling, examples, package metadata, and generated release artifacts for version `0.1.0-alpha.0`.

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
- Public security claims must remain within `docs/v2/claim-registry.md`.
- Production-readiness, full WebGPU, Unity/Unreal, or Three.js superiority wording is not allowed unless the v2 decision gates permit it.

## Dependency And Supply Chain Policy

- New runtime dependencies require a maintainer review for license, maintenance status, and browser compatibility.
- Release verification must be run from a clean checkout before a release candidate is tagged.
- Generated reports under `tests/reports` must be current for the release-run ID being evaluated.
