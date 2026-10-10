# §19 mobile — AWS Device Farm attempt record (2026-10-09, lane 09)

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
