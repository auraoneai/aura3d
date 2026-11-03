# Native capability evidence

Status: **roadmap**. Browser and device acceptance for this work has not been
run. A source test, an opaque frame, a mock adapter or an injected session does
not establish rendered output or physical-device support. See the
[code-complete boundary](../prds/aura3d-native-code-complete.md) and the
[acceptance plan](../prds/aura3d-native-acceptance.md).

After the global gate authorizes acceptance, record each execution separately
with the following fields. Unavailable, unsupported, skipped and failed are
distinct outcomes, not passes.

| Field | Required identification |
| --- | --- |
| Candidate | Frozen commit, gate and archive hashes, test revision and unique run ID |
| Workload | Requirement IDs, exact test inventory, fixture ID and SHA-256 |
| Environment | Browser distribution and executable version, OS, backend, adapter and driver where available, device class and feature flags |
| Evidence level | Automation software renderer, automation physical GPU, retail browser, actual device, injected session or other precise class |
| Outcome | Passed, failed, unsupported, skipped or unavailable, with reason and limitations |
| Artifacts | Structured results, logs, subject-region expectations and screenshots/traces at their retained authorized location |

The independent fixture manifest and the lifecycle test's in-memory GLB are
described in [the fixture README](../../tests/fixtures/native-capabilities/README.md).
Software WebGL results cannot establish hardware GPU performance; injected XR
cannot establish an actual headset session. Existing historical evidence stays
associated with its own candidate and is not silently inherited by a new one.
