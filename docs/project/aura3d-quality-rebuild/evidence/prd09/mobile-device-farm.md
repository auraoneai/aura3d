# §19 mobile — AWS Device Farm attempt record (lane 09)

## Re-run 2026-10-10 (governed wrapper, default chain, no `--profile`) — current

The 2026-10-09 record below used an explicit `--profile`, so it was not a
valid blocker (FINAL-REMAINING-WORK G4). Re-run through the governed
`/Users/gurbakshchahal/.local/bin/aws` wrapper with its default chain:

- **Identity:** `aws sts get-caller-identity` →
  `arn:aws:sts::605199373751:assumed-role/AuraOneProductionOperator/auraone-local-cli`
  (account 605199373751).
- **Action:** `aws devicefarm list-projects --region us-west-2`
- **Result:** `AccessDeniedException ... is not authorized to perform:
  devicefarm:ListProjects because no identity-based policy allows the
  devicefarm:ListProjects action`.
- **Resource:** `arn:aws:devicefarm:us-west-2:605199373751:project:*`.
- **Role:** `AuraOneProductionOperator` (session `auraone-local-cli`).
- **Minimal grant (owner action, not applied by agents):** an identity policy on
  `AuraOneProductionOperator` allowing `devicefarm:ListProjects`,
  `devicefarm:CreateProject`, `devicefarm:ListDevicePools`,
  `devicefarm:CreateDevicePool`, `devicefarm:CreateUpload`, `devicefarm:GetUpload`,
  `devicefarm:ScheduleRun`, `devicefarm:GetRun`, `devicefarm:ListJobs` and
  `devicefarm:ListArtifacts` on
  `arn:aws:devicefarm:us-west-2:605199373751:*` (Device Farm is us-west-2 only).
  Artifact mp4s are fetched from the presigned URLs `ListArtifacts` returns, so
  no S3 grant is needed.

Status: §19 hardware recordings (`evidence/prd09/<id>/device-{ios,android}.mp4`)
are BLOCKED on this grant (widening IAM is outside the agent perimeter).
Emulation (`webkit-mobile` iPhone 13, `chromium-mobile` Pixel 7) runs in the
`qr-prd09-game.yml` macos-14 browser job.

## Superseded record (2026-10-09, invalid: explicit `--profile`)

Emulation (in-repo): `playwright.prd09.config.ts` carries `webkit-mobile`
(`devices["iPhone 13"]`, webkit) and `chromium-mobile` (`devices["Pixel 7"]`,
chromium) — landed with #607.

## Device Farm attempt

- **Action tried:** `aws --profile auraone-production-operator devicefarm
  list-projects --region us-west-2`
- **Result:** `The config profile (auraone-production-operator) could not be
  found` — the profile is not configured on this machine (no credentials
  source for it in `~/.aws/config`/`credentials`, no instance role).
- **Resource that would be used:**
  `arn:aws:devicefarm:us-west-2::<acct>:project:*` (iOS iPhone 13 + Android
  Pixel 7 device pools), with recordings destined for
  `evidence/prd09/<id>/device-{ios,android}.mp4`.
- **Minimal grant needed:** an `auraone-production-operator` role/profile
  assumable by Devin sessions with `devicefarm:ListProjects`,
  `devicefarm:CreateUpload`, `devicefarm:ScheduleRun`, `devicefarm:GetRun`,
  `devicefarm:ListArtifacts` on the account's Device Farm project(s), plus
  `s3:GetObject` on the artifact bucket for the mp4 pulls.

Until the profile exists, §19 hardware evidence cannot be captured;
emulation coverage ships in #607.
