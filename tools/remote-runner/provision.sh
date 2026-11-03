#!/usr/bin/env bash
# tools/remote-runner/provision.sh — provision the AuraOne remote capture runner
# through the gated EC2 pattern (skill: auraone-remote-run). Launch template
# ONLY; tags on instance + volumes; SSM-only access; terminate-after-use.
#
# Usage:
#   tools/remote-runner/provision.sh --dry-run              # validate preflight + EC2 dry-run gate
#   tools/remote-runner/provision.sh --teardown [iid]       # terminate instance + reconcile child EBS volumes
#   tools/remote-runner/provision.sh                        # launch + bootstrap + start server (requires SSM-capable LT)
#
# Safety invariants (AURAONE_POLICY_VERSION=2026-11-02.5):
#   1. Mandatory auraone-cost-guard cloud-preflight before any EC2 API call.
#   2. Explicit rightsized instance type (c7i.large default; r7i.8xlarge blocked).
#   3. Root EBS /dev/sda1 overridden to 50 GiB gp3 (40..100 GiB allowed for 40 GiB snapshot)
#      with DeleteOnTermination=true.
#   4. Independent OS/EC2 auto-termination via --instance-initiated-shutdown-behavior terminate
#      + bounded --user-data timer (shutdown -P +TTL_MINUTES).
#   5. Automatic trap teardown on bootstrap/SSM failure + verified --teardown mode with
#      child EBS volume reconciliation.
#   6. Live launch against lt-001ac3e8c702c66d7 (auraone-human-ei-test-runner-v1 v6) fails
#      closed unless an SSM-capable general-purpose launch template is supplied via
#      AURAONE_GENERAL_RUNNER_LAUNCH_TEMPLATE, because lt-001ac3e8c702c66d7 uses isolated
#      private subnet-056ccb403a7b5c45c, sg-044823711494772bd (proxy/S3 egress only), and
#      IAM role auraone-human-ei-test-runner-v1 (explicitly denies ssm:SendCommand).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS_BIN="${AWS_BIN:-$HOME/.local/bin/aws}"
COST_GUARD_BIN="${COST_GUARD_BIN:-$HOME/.local/bin/auraone-cost-guard}"
REGION="${AURAONE_RUNNER_REGION:-us-west-2}"
HUMAN_EI_ISOLATED_TEMPLATE="lt-001ac3e8c702c66d7"
TEMPLATE="${AURAONE_GENERAL_RUNNER_LAUNCH_TEMPLATE:-$HUMAN_EI_ISOLATED_TEMPLATE}"
INSTANCE_TYPE="${AURAONE_RUNNER_INSTANCE_TYPE:-c7i.large}"
ROOT_VOLUME_GIB="${AURAONE_RUNNER_ROOT_VOLUME_GIB:-50}"
TTL_MINUTES="${AURAONE_RUNNER_TTL_MINUTES:-60}"
MAX_COST_USD="2.00"
KMS_KEY_ARN="arn:aws:kms:us-west-2:605199373751:key/e6f9378a-143c-410b-9b8f-9ebdd1d31ebc"
RUN_ID="${AURAONE_RUNNER_TASK_ID:-filmstrip-$(date +%Y%m%d-%H%M%S)-$RANDOM}"
PARENT_TASK_ID="${AURAONE_PARENT_TASK_ID:-$RUN_ID}"
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
INSTANCE_FILE="$REPO_ROOT/tools/remote-runner/INSTANCE_ID"

MODE="${1:-}"
TEARDOWN_TARGET="${2:-}"
if [[ "$MODE" != "--dry-run" && "$MODE" != "--teardown" && "$MODE" != "" ]]; then
  echo "usage: $0 [--dry-run | --teardown [instance-id]]" >&2
  exit 2
fi

reconcile_and_terminate_instance() {
  local target_iid="${1:-}"
  local target_run_id="${2:-$RUN_ID}"
  if [[ -z "$target_iid" && -f "$INSTANCE_FILE" ]]; then
    target_iid="$(tr -d '[:space:]' < "$INSTANCE_FILE" || true)"
  fi
  if [[ -z "$target_iid" ]]; then
    echo "provision: no instance ID to tear down" >&2
    return 0
  fi

  echo "provision: terminating instance $target_iid and reconciling child EBS volumes..." >&2
  local attached_vols=""
  attached_vols="$("$AWS_BIN" ec2 describe-instances --region "$REGION" --instance-ids "$target_iid" \
    --query 'Reservations[].Instances[].BlockDeviceMappings[].Ebs.VolumeId' --output text 2>/dev/null || true)"

  "$AWS_BIN" ec2 terminate-instances --region "$REGION" --instance-ids "$target_iid" >/dev/null 2>&1 || true
  "$AWS_BIN" ec2 wait instance-terminated --region "$REGION" --instance-ids "$target_iid" >/dev/null 2>&1 || true

  local tagged_vols=""
  if [[ -n "$target_run_id" ]]; then
    tagged_vols="$("$AWS_BIN" ec2 describe-volumes --region "$REGION" \
      --filters "Name=tag:auraone:attempt-id,Values=$target_run_id" \
      --query 'Volumes[].VolumeId' --output text 2>/dev/null || true)"
  fi

  local vol_id
  for vol_id in $attached_vols $tagged_vols; do
    [[ -z "$vol_id" || "$vol_id" == "None" ]] && continue
    local vstate
    vstate="$("$AWS_BIN" ec2 describe-volumes --region "$REGION" --volume-ids "$vol_id" \
      --query 'Volumes[0].State' --output text 2>/dev/null || echo "deleted")"
    if [[ "$vstate" != "deleted" && "$vstate" != "deleting" && "$vstate" != "None" ]]; then
      "$AWS_BIN" ec2 delete-volume --region "$REGION" --volume-id "$vol_id" >/dev/null 2>&1 || true
    fi
  done

  if [[ -f "$INSTANCE_FILE" ]] && [[ "$(tr -d '[:space:]' < "$INSTANCE_FILE" || true)" == "$target_iid" ]]; then
    rm -f "$INSTANCE_FILE"
  fi

  if [[ -x "$COST_GUARD_BIN" ]]; then
    "$COST_GUARD_BIN" ledger-update \
      --resource-id "ec2-$target_run_id" \
      --status deleted \
      --cleanup-verified \
      --notes "Terminated instance $target_iid and reconciled child EBS volumes" >/dev/null 2>&1 || true
  fi
}

if [[ "$MODE" == "--teardown" ]]; then
  reconcile_and_terminate_instance "$TEARDOWN_TARGET" "$RUN_ID"
  exit 0
fi

case "$INSTANCE_TYPE" in
  t3.small)   VCPUS=2; MEM_GIB=2; HOURLY_USD="0.0208" ;;
  t3.medium)  VCPUS=2; MEM_GIB=4; HOURLY_USD="0.0416" ;;
  c7i.large)  VCPUS=2; MEM_GIB=4; HOURLY_USD="0.0893" ;;
  c7i.xlarge) VCPUS=4; MEM_GIB=8; HOURLY_USD="0.1785" ;;
  *)
    echo "provision: blocked oversized or unapproved instance type '$INSTANCE_TYPE' on $TEMPLATE (allowed: t3.small, t3.medium, c7i.large, c7i.xlarge)" >&2
    exit 2
    ;;
esac

if ! [[ "$ROOT_VOLUME_GIB" =~ ^[0-9]+$ ]] || (( ROOT_VOLUME_GIB < 40 || ROOT_VOLUME_GIB > 100 )); then
  echo "provision: root volume (${ROOT_VOLUME_GIB} GiB) must be between 40 and 100 GiB (AMI root snapshot snap-08729dcdeac0a21d5 is 40 GiB)" >&2
  exit 2
fi

if ! [[ "$TTL_MINUTES" =~ ^[0-9]+$ ]] || (( TTL_MINUTES < 1 || TTL_MINUTES > 60 )); then
  echo "provision: TTL_MINUTES (${TTL_MINUTES}) must be an integer between 1 and 60 minutes" >&2
  exit 2
fi

if [[ ! -x "$COST_GUARD_BIN" ]]; then
  echo "provision: required cost guard missing at $COST_GUARD_BIN" >&2
  exit 2
fi

PREFLIGHT_ARGS=(
  cloud-preflight
  --task-id "$RUN_ID"
  --parent-task-id "$PARENT_TASK_ID"
  --project "aura3d"
  --repo "$REPO_ROOT"
  --purpose "aura3d-remote-capture-runner"
  --commit-sha "$SOURCE_SHA"
  --provider "aws"
  --region "$REGION"
  --resource-type "ec2"
  --resource-id "ec2-$RUN_ID"
  --launch-template "$TEMPLATE"
  --explicit-instance-type
  --sku "$INSTANCE_TYPE"
  --vcpus "$VCPUS"
  --memory-gib "$MEM_GIB"
  --ttl-minutes "$TTL_MINUTES"
  --estimated-hourly-usd "$HOURLY_USD"
  --native-timeout
  --why-serverless-impossible "Requires persistent SSM port-forwarding and headless Chromium dev server capture"
  --cleanup-command "$REPO_ROOT/tools/remote-runner/provision.sh --teardown <IID>"
  --verification-command "$AWS_BIN ec2 describe-instances --region $REGION --instance-ids <IID>"
)
if [[ "$MODE" == "--dry-run" ]]; then
  PREFLIGHT_ARGS+=(--dry-run)
fi
"$COST_GUARD_BIN" "${PREFLIGHT_ARGS[@]}" >/dev/null

EXPIRES_AT="$(python3 -c 'import datetime,sys; print((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=int(sys.argv[1]))).strftime("%Y-%m-%dT%H:%M:%SZ"))' "$TTL_MINUTES")"
BLOCK_MAPPING="[{\"DeviceName\":\"/dev/sda1\",\"Ebs\":{\"VolumeSize\":${ROOT_VOLUME_GIB},\"VolumeType\":\"gp3\",\"Iops\":3000,\"Throughput\":125,\"DeleteOnTermination\":true,\"Encrypted\":true,\"KmsKeyId\":\"${KMS_KEY_ARN}\"}}]"

USER_DATA_SCRIPT="$(cat <<EOF
#!/usr/bin/env bash
set -euxo pipefail
shutdown -P +${TTL_MINUTES} "AuraOne aura3d disposable runner hard TTL (${TTL_MINUTES}m) expired" || shutdown -h +${TTL_MINUTES} || true
EOF
)"
USER_DATA_B64="$(printf '%s' "$USER_DATA_SCRIPT" | base64 | tr -d '\n')"

TAGS="[{Key=auraone:environment,Value=human-ei-test},\
{Key=owner,Value=gurbaksh},\
{Key=agent,Value=antigravity},\
{Key=task_id,Value=$RUN_ID},\
{Key=parent_task_id,Value=$PARENT_TASK_ID},\
{Key=project,Value=aura3d},\
{Key=environment,Value=ephemeral},\
{Key=ttl_minutes,Value=$TTL_MINUTES},\
{Key=expires_at,Value=$EXPIRES_AT},\
{Key=auto_cleanup,Value=true},\
{Key=cost_limit,Value=$MAX_COST_USD},\
{Key=auraone:managed-by,Value=human-ei-test-remote-runner-v1},\
{Key=auraone:production-access,Value=denied},\
{Key=auraone:attempt-id,Value=$RUN_ID},\
{Key=auraone:source-sha,Value=$SOURCE_SHA},\
{Key=Name,Value=aura3d-filmstrip-runner-$RUN_ID}]"

if [[ "$MODE" == "--dry-run" ]]; then
  echo "provision: dry-run validating launch-template gate (instance_type=$INSTANCE_TYPE, root_volume_gib=$ROOT_VOLUME_GIB, ttl_minutes=$TTL_MINUTES, max_cost_usd=$MAX_COST_USD)"
  "$AWS_BIN" ec2 run-instances --region "$REGION" \
    --launch-template LaunchTemplateId="$TEMPLATE" \
    --instance-type "$INSTANCE_TYPE" \
    --block-device-mappings "$BLOCK_MAPPING" \
    --instance-initiated-shutdown-behavior terminate \
    --user-data "$USER_DATA_B64" \
    --tag-specifications \
      "ResourceType=instance,Tags=$TAGS" \
      "ResourceType=volume,Tags=$TAGS" \
    --dry-run 2>&1 | head -5
  echo "provision: dry-run complete (DryRunOperation above = gate passes)"
  exit 0
fi

# Fail closed before live EC2 launch if targeting the isolated Human-EI launch template
if [[ "$TEMPLATE" == "$HUMAN_EI_ISOLATED_TEMPLATE" ]]; then
  "$COST_GUARD_BIN" ledger-update \
    --resource-id "ec2-$RUN_ID" \
    --status deleted \
    --cleanup-verified \
    --notes "Blocked live launch on isolated Human-EI launch template $HUMAN_EI_ISOLATED_TEMPLATE (no SSM/internet egress)" >/dev/null 2>&1 || true
  echo "provision: FAIL-CLOSED — Launch Template $HUMAN_EI_ISOLATED_TEMPLATE (auraone-human-ei-test-runner-v1 v6) uses isolated subnet-056ccb403a7b5c45c, sg-044823711494772bd (proxy/S3 egress only), and IAM role auraone-human-ei-test-runner-v1 (denies ssm:SendCommand). Launching an SSM capture runner on $HUMAN_EI_ISOLATED_TEMPLATE cannot come online in SSM. Use the sanctioned remote workflow (.github/workflows/showcase-filmstrip.yml) or set AURAONE_GENERAL_RUNNER_LAUNCH_TEMPLATE to an authorized SSM-capable launch template." >&2
  exit 2
fi

PROVISION_COMPLETE=0
IID=""
cleanup_on_failure() {
  local exit_code=$?
  if [[ "$PROVISION_COMPLETE" != "1" && -n "$IID" ]]; then
    echo "provision: bootstrap did not complete (exit=$exit_code); tearing down $IID immediately" >&2
    reconcile_and_terminate_instance "$IID" "$RUN_ID"
  fi
}
trap cleanup_on_failure EXIT INT TERM

echo "provision: launching runner (attempt $RUN_ID, sha $SOURCE_SHA, instance_type $INSTANCE_TYPE, ttl ${TTL_MINUTES}m)"
IID=$("$AWS_BIN" ec2 run-instances --region "$REGION" \
  --launch-template LaunchTemplateId="$TEMPLATE" \
  --instance-type "$INSTANCE_TYPE" \
  --block-device-mappings "$BLOCK_MAPPING" \
  --instance-initiated-shutdown-behavior terminate \
  --user-data "$USER_DATA_B64" \
  --tag-specifications \
    "ResourceType=instance,Tags=$TAGS" \
    "ResourceType=volume,Tags=$TAGS" \
  --query 'Instances[0].InstanceId' --output text)
"$COST_GUARD_BIN" ledger-update --resource-id "ec2-$RUN_ID" --status active --notes "instance_id=$IID" >/dev/null 2>&1 || true
echo "$IID" > "$INSTANCE_FILE"
echo "provision: instance $IID — waiting for SSM agent"
OK=""
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
shutdown -P +${TTL_MINUTES} 'AuraOne aura3d disposable runner hard TTL (${TTL_MINUTES}m) expired' || true; \
DIST=\$(. /etc/os-release && echo \$ID); \
if command -v dnf >/dev/null; then dnf install -y nodejs npm chromium; CHROME=/usr/bin/chromium-browser; \
elif command -v apt-get >/dev/null; then export DEBIAN_FRONTEND=noninteractive; apt-get update -y; apt-get install -y nodejs npm chromium-browser; CHROME=/usr/bin/chromium-browser; fi; \
command -v chromium >/dev/null && CHROME=\$(command -v chromium); \
command -v chromium-browser >/dev/null && CHROME=\$(command -v chromium-browser); \
mkdir -p /opt/aura3d-captures; cd /opt/aura3d-captures; \
npm init -y >/dev/null 2>&1 || true; npm install playwright-core@1.49.1 >/dev/null 2>&1 || npm install playwright-core; \
echo BOOTSTRAP_DONE CHROME=\$CHROME NODE=\$(node -v);" \
  --output json > /dev/null
PROVISION_COMPLETE=1
echo "provision: bootstrap command dispatched (async). Poll 'BOOTSTRAP_DONE' via:"
echo "  $AWS_BIN ssm list-commands --region $REGION --query 'Commands[0].Status'"
echo "provision: instance $IID ready for capture-server upload (hard TTL=${TTL_MINUTES}m; teardown via: $0 --teardown $IID)"
