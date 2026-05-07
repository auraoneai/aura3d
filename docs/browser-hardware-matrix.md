# Browser And Hardware Matrix

Version: 0.1.0-alpha.0

This matrix records the browser and hardware evidence currently present in this repository. It is a release-gate evidence index, not a production compatibility guarantee.

## Current Browser Evidence

| Artifact | Scope | Current status | Claim boundary |
|---|---|---|---|
| `tests/reports/browser.json` | Browser smoke test report from the release gate | Exists as release-gate evidence | Proves the recorded browser run only. |
| `tests/reports/final-browser.json` | Final browser report associated with the latest full release verification | Exists as release-gate evidence | Proves freshness for the recorded release run only. |
| `tests/reports/webgpu-hardware-matrix.json` | Real `navigator.gpu` probe from `tests/browser/webgpu-real-device.spec.ts` | Exists and records Chromium on macOS with `navigator.gpu` present but `requestAdapter` returning null | Proves fallback/unsupported hardware classification for that runtime; it does not prove WebGPU device support. |
| `docs/rendering/webgpu-hardware-matrix.md` | Human-readable WebGPU matrix policy | Exists | Defines how to interpret real-device and unsupported WebGPU probe results. |

## Current Hardware Evidence

The current real-device WebGPU report records:

- platform: `darwin`;
- browser user agent: Headless Chrome;
- `navigator.gpu`: present;
- adapter status: `missing`;
- device status: `not-requested`;
- unsupported case: `navigator.gpu.requestAdapter returned null`.

This is useful compatibility evidence because unsupported hardware/browser outcomes are explicitly captured instead of being omitted. It is not evidence for broad GPU adapter support.

## Required Before Public Compatibility Claims

- Add named browser projects for Chromium, Firefox, and WebKit where supported by the test environment.
- Record operating system, GPU adapter/device status, browser version, and user agent for every claimed browser/hardware combination.
- Keep unsupported rows in the matrix instead of treating them as missing data.
- Reference this page, `docs/compatibility.md`, and `docs/v2/claim-registry.md` before publishing compatibility wording.
