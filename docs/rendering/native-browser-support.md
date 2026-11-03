# Native browser and device support

**Matrix revision:** `native-browser-support/1`

**Aura3D version:** 4.7.1

**Claim:** roadmap for the native-capability candidate; browser and device
acceptance has not run for this candidate.

The [compatibility matrix](../project/compatibility.md#target-browser-cells)
lists the exact first automation targets. The target versions come from the
browser manifest supplied with the repository's pinned Playwright `1.59.1`;
they are not observations of an installed executable. The executable version,
distribution and OS in a run must be measured and retained. An override such
as `A3D_WEBGPU_BROWSER_EXECUTABLE` creates a different target and must never be
reported as the pinned distribution without verifying its identity.

## Status and evidence tiers

| Status | Meaning |
|---|---|
| Supported | Candidate-bound checks passed for the stated backend, workload, browser distribution/version range, OS range, renderer class and applicable device limits. A passing cell cannot be extended to neighboring versions without additional evidence. |
| Experimental | An explicit opt-in path or diagnostic exists but its support or default-use conditions are not established. Its actual cell result is still recorded independently. |
| Unsupported | A defined combination is rejected or cannot meet the documented requirements; record the precise reason and the applicable input, backend and version. |
| Unverified | A required run, version, adapter, fixture identity, result or other qualifying evidence is missing. This includes unavailable devices and untested versions. |

No automation, retail browser or physical-device combination is presently
promoted to supported for this candidate. No minimum or maximum supported
browser/OS version range can be inferred from the target list. WebGPU's
explicit opt-in remains experimental pending matching native backend,
dispatch and rendered-output evidence.

Evidence categories must remain separate:

- **Automation distribution:** Playwright's Chromium, Firefox or WebKit build,
  its executable version, OS and launch arguments. A Playwright WebKit pass is
  not a retail Safari pass; a Chromium automation pass is not a retail Chrome
  or Edge pass.
- **Software:** a software renderer, including SwiftShader or another software
  adapter. A software result cannot establish physical GPU availability or
  performance. A requested software launch that reports an unidentified or
  different renderer needs explicit qualification.
- **Experimental flags:** a browser started with GPU blocklist overrides or
  unsafe features. Record every flag; do not use its result as default-flags
  evidence.
- **Injected or emulated:** injected GPU/XR sessions, browser device emulation
  and simulators establish only their exercised contracts. They are not
  physical-device evidence.
- **Retail / physical:** identify the actual retail browser and OS version,
  physical device model, adapter and driver where exposed. Record unavailable
  fields as unavailable rather than inventing them. A headless project name
  or a nonempty adapter string alone does not establish physical hardware.

The project `chromium-gpu-headless` selects full Chromium headless for native
GPU probes. It does not force hardware. If a physical adapter is unavailable,
record the actual software adapter or an explicit no-data reason; do not
substitute a headed session and call it headless. The acceptance plan requires
headless remote execution and follows the global code-complete gate.

## Project launch profiles

The three `*-automation` projects use Playwright's browser launch defaults
with no Aura3D-supplied executable or GPU flags, even when legacy environment
variables are set. Playwright itself can supply its normal automation flags;
capture the effective launch environment rather than calling those flags
absent. The remaining named projects are diagnostics and their results are
separately labeled.

| Project | Profile | Aura3D-supplied launch flags |
|---|---|---|
| `chromium-automation` | Chromium headless shell | none |
| `firefox-automation` | Firefox headless | none |
| `webkit-automation` | WebKit headless | none |
| `chromium-gpu-headless` | Full Chromium headless; optional explicit executable | none |
| `chromium-software` | Chromium software diagnostic | `--use-gl=angle`, `--use-angle=swiftshader`, `--enable-unsafe-swiftshader` |
| `chromium-experimental` | Chromium GPU diagnostic; optional explicit executable | `--enable-unsafe-webgpu`, `--ignore-gpu-blocklist` |
| `legacy-chromium` | Existing tests and derived configurations | Legacy GPU overrides and optional SwiftShader/environment overrides; experimental, not default-flags matrix evidence. |

The default configuration runs existing specs in `legacy-chromium` and limits
each new project to the matrix scenario. A named selection through `--project`
or `AURA3D_BROWSER_PROJECT` allows the selected project to discover other
requested specs. The remote runner forwards the project and artifacts; use it
only after `CODE_COMPLETE_GO` as described in the
[acceptance plan](../prds/aura3d-native-acceptance.md). Unknown environment
project names fail configuration. No browser, physical device or acceptance
run is authorized before that gate.

## Backend selection and fallback

- Root renderable scenes use WebGL2 by default. Production mount failure is
  reported without switching to a fallback renderer. If WebGL2 is unavailable
  for a renderable scene, initialization fails rather than using schematic
  Canvas2D as rendered 3D evidence. The source contracts are
  [`mountRenderer.ts`](../../packages/engine/src/agent-api/app/mountRenderer.ts)
  and [`createAuraApp.ts`](../../packages/engine/src/agent-api/app/createAuraApp.ts).
- In the lower-level production renderer, explicit `backend: "webgpu"`
  requires WebGPU capabilities and fails if they are unavailable. An `auto`
  selection uses WebGL2 when no WebGPU runtime is available. Adapter/device
  failures after selection must be reported by the active implementation;
  do not assume a successful or silent WebGL2 fallback. The reported selected
  backend, not the requested backend, determines the evidence cell.
- Unsupported combinations need a structured reason. A skipped or unavailable
  case is never silently counted as a pass, and a failed required workload is
  not recategorized as unavailable without evidence.

## Required record for each result

Each candidate-bound record must retain the source revision and candidate
identity, run ID, test inventory and result, tested public path and backend,
distribution and exact executable version, OS and version, browser/device
class, adapter/renderer and driver where available, effective feature flags,
fixture SHA-256, and artifact/log locations. Record passed, failed, unsupported,
skipped and no-data distinctly, with a concrete reason for every skipped,
unsupported or unavailable case. An omitted version or a software adapter
claimed as hardware invalidates the cell. Retain source-only, injected,
automation, retail and physical records separately and never overwrite one
with another.

This policy describes how to qualify later evidence; its existence is not a
browser, hardware or release receipt.
