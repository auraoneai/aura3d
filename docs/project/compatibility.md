# Compatibility Matrix

Version: 1.0.0

## Current Compatibility Status

This matrix records the governance baseline for version `1.0.0`. It is a V10 support evidence index.

| Surface | Current documented state |
|---|---|
| Node.js | Verified locally through the active toolchain and report metadata. |
| Package manager | `pnpm` is the required package manager for repository commands. |
| Browser tests | Browser evidence must come from current Playwright reports under `tests/reports`. |
| WebGL2 | Internal browser validation exists where tests are green. |
| WebGPU | Strong public WebGPU claims remain blocked until hardware matrix evidence exists. |
| Operating systems | Release reports must record OS metadata before compatibility claims are made. |

## Compatibility Rules

- Do not claim broad browser or device compatibility without a current hardware/browser matrix report.
- Support claims must follow the V10 claim-defense evidence.
- Public compatibility wording must follow `docs/project/v2-claim-registry.md`.
