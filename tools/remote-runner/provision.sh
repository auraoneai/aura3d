#!/usr/bin/env bash
# tools/remote-runner/provision.sh — provision the AuraOne remote capture runner
# through the gated EC2 pattern (skill: auraone-remote-run). Launch template
# ONLY; tags on instance + volumes; SSM-only access; terminate-after-use.
#
# Usage:
#   tools/remote-runner/provision.sh --dry-run   # validate the gate
#   tools/remote-runner/provision.sh             # launch + bootstrap + start server
#
# Leaves the instance id in tools/remote-runner/INSTANCE_ID and the SSM
# port-forward to the caller (see tools/remote-capture.sh).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS_BIN="${AWS_BIN:-$HOME/.local/bin/aws}"
REGION="us-west-2"
TEMPLATE_ARN="arn:aws:ec2:us-west-2:605199373751:launch-template/lt-001ac3e8c702c66d7"
TEMPLATE="lt-001ac3e8c702c66d7"
RUN_ID="filmstrip-$(date +%Y%m%d-%H%M%S)-$RANDOM"
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
INSTANCE_FILE="$REPO_ROOT/tools/remote-runner/INSTANCE_ID"

DRY="${1:-}"
if [[ "$DRY" != "--dry-run" && "$DRY" != "" ]]; then
  echo "usage: $0 [--dry-run]" >&2
  exit 2
fi

TAGS="[{Key=auraone:environment,Value=human-ei-test},\
{Key=auraone:managed-by,Value=human-ei-test-remote-runner-v1},\
{Key=auraone:production-access,Value=denied},\
{Key=auraone:attempt-id,Value=$RUN_ID},\
{Key=auraone:source-sha,Value=$SOURCE_SHA},\
{Key=Name,Value=aura3d-filmstrip-runner-$RUN_ID}]"

if [[ "$DRY" == "--dry-run" ]]; then
  echo "provision: dry-run validating launch-template gate"
  "$AWS_BIN" ec2 run-instances --region "$REGION" \
    --launch-template LaunchTemplateId="$TEMPLATE" \
    --tag-specifications \
      "ResourceType=instance,Tags=$TAGS" \
      "ResourceType=volume,Tags=$TAGS" \
    --dry-run 2>&1 | head -5
  echo "provision: dry-run complete (DryRunOperation above = gate passes)"
  exit 0
fi

echo "provision: launching runner (attempt $RUN_ID, sha $SOURCE_SHA)"
IID=$("$AWS_BIN" ec2 run-instances --region "$REGION" \
  --launch-template LaunchTemplateId="$TEMPLATE" \
  --tag-specifications \
    "ResourceType=instance,Tags=$TAGS" \
    "ResourceType=volume,Tags=$TAGS" \
  --query 'Instances[0].InstanceId' --output text)
echo "$IID" > "$INSTANCE_FILE"
echo "provision: instance $IID — waiting for SSM agent"
for _ in $(seq 1 60); do
  sleep 5
  OK=$("$AWS_BIN" ssm describe-instance-information --region "$REGION" \
    --filters "Key=InstanceIds,Values=$IID" \
    --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || echo "")
  [[ "$OK" == "Online" ]] && { echo "provision: SSM online"; break; }
done
[[ "$OK" == "Online" ]] || { echo "provision: SSM never came online" >&2; exit 3; }

echo "provision: bootstrap (node, chromium, playwright-core, capture server)"
"$AWS_BIN" ssm send-command --region "$REGION" --instance-ids "$IID" \
  --document-name "AWS-RunShellScript" --comment "aura3d capture runner bootstrap" \
  --parameters commands="\
set -eux; \
DIST=\$(. /etc/os-release && echo \$ID); \
if command -v dnf >/dev/null; then dnf install -y nodejs npm chromium; CHROME=/usr/bin/chromium-browser; \
elif command -v apt-get >/dev/null; then export DEBIAN_FRONTEND=noninteractive; apt-get update -y; apt-get install -y nodejs npm chromium-browser; CHROME=/usr/bin/chromium-browser; fi; \
command -v chromium >/dev/null && CHROME=\$(command -v chromium); \
command -v chromium-browser >/dev/null && CHROME=\$(command -v chromium-browser); \
mkdir -p /opt/aura3d-captures; cd /opt/aura3d-captures; \
npm init -y >/dev/null 2>&1 || true; npm install playwright-core@1.49.1 >/dev/null 2>&1 || npm install playwright-core; \
echo BOOTSTRAP_DONE CHROME=\$CHROME NODE=\$(node -v);" \
  --output json > /dev/null
echo "provision: bootstrap command dispatched (async). Poll 'BOOTSTRAP_DONE' via:"
echo "  $AWS_BIN ssm list-commands --region $REGION --query 'Commands[0].Status'"
echo "provision: instance $IID ready for capture-server upload"
