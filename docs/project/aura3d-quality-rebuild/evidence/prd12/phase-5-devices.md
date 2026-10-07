# Lane 12 evidence — real-device lane (T5.6)

## Provisioning status: DENIED (operator action required)

AWS Device Farm provisioning is an interactive, credentialled operation that lives
on the operator's machine (`/Users/gurbakshchahal/AuraOne/scripts/setup-auraone-shared-aws.sh`,
profile `auraone-production-operator`). Agents cannot run it from this VM — no AWS
credentials exist in this environment, and `request_secret` for cloud creds is an
operator decision. Per policy §2 the denial is recorded here with the minimal grant.

## Minimal grant

- IAM user/role `auraone-production-operator` (or a dedicated `aura3d-quality-gate` role)
- Actions: `devicefarm:*` scoped to resources tagged `project=aura3d-quality-gate`
- Region: `us-west-2`
- Ephemeral project: created per run or reused; tagged `project=aura3d-quality-gate`
- Secrets to set in repo settings when provisioned:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - `DEVICE_FARM_PROJECT_ARN`
  - `DEVICE_FARM_POOL_IOS` (2 iOS devices, Safari), `DEVICE_FARM_POOL_ANDROID` (2 Android, Chrome)

## What lands meanwhile

`.github/workflows/quality-devices.yml` (`workflow_dispatch` only) fails fast with the
grant instructions when secrets are absent, and the emulated lane (quality-gate.yml
390x844@3 mobile run) stays the blocking path — per PRD "keep the emulated lane".
