# PRD-08 device spot checks (iOS / Android)

PRD-08 §17 asks for checkpoint measurements on PRD 11's mobile reference device class, plus iOS and Android spot checks of touch controls (S14), haptics (`navigator.vibrate`) and Low/Medium tier budgets.

| Check | Device | Status |
|---|---|---|
| Touch end-to-end play, ≥ 48 CSS px targets | iOS Safari (real device) | NOT RUN: no real-device runner in CI. Emulated 390×844 DPR 3 coverage is in `camera-feel.spec.ts` S14 (browser-gpu, macos-14). |
| Touch end-to-end play, haptics | Android Chrome (real device) | NOT RUN: same reason. `navigator.vibrate` dispatch is unit-covered (`feel-bus.test.ts`). |
| Low / Medium tier budgets | PRD 11 mobile reference device class | NOT RUN: the device class belongs to PRD 11 (checkpoint runs, §17). The standalone tier numbers come from `tier-budgets.spec.ts` on macos-14 (`s19-bundle.md`). |

Real-device checks run at PRD 11 checkpoints (IC-k), not in the lane workflow. They need a device farm or an owner-run session, so a lane agent cannot produce them. This file records that gap; it does not claim the checks passed.
