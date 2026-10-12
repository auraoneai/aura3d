#!/bin/bash
# Teardown for aura3d self-hosted Azure runners. Do not run unless decommissioning.
set -uo pipefail
REPO=auraoneai/aura3d
RG=rg-aura3d-gh-runners

# 1. Remove runners (label self-hosted-azure: azr-* eastus and azs-* southcentralus)
for id in $(gh api --paginate "repos/$REPO/actions/runners" \
    -q '.runners[] | select(any(.labels[]; .name=="self-hosted-azure" or .name=="azure-gpu")) | .id'); do
  echo "removing runner id $id"
  gh api -X DELETE "repos/$REPO/actions/runners/$id" || echo "failed to remove $id (may be busy)"
done

# 2. Verify Azure identity, then delete the resource group
SUB=$(az-auraone-gurbaksh account show --query id -o tsv)
TEN=$(az-auraone-gurbaksh account show --query tenantId -o tsv)
if [ "$SUB" != "9b7da706-63ce-4740-8c03-3b77cbe1b7d0" ] || [ "$TEN" != "8aa8a205-1f60-42a0-a546-03e2bda76637" ]; then
  echo "unexpected Azure context ($TEN/$SUB); aborting" >&2; exit 1
fi
# The resource group holds both scale sets and their networking:
#   eastus:         vmss-aura3d-runners       (azr-*), vnet/nsg/nat-runners
#   southcentralus: vmss-aura3d-runners-scus  (azs-*), vnet/nsg/nat-runners-scus
# Deleting the group removes both. Delete the scale sets explicitly first so
# the VMs stop billing even if the group deletion is slowed by dependencies.
for VMSS in vmss-aura3d-runners vmss-aura3d-runners-scus; do
  az-auraone-gurbaksh vmss delete -g "$RG" -n "$VMSS" --no-wait || echo "vmss $VMSS delete request failed"
done
# GPU runners (label azure-gpu, VMs tagged role=aura3d-gpu-runner, in this RG; none exist yet)
for VM in $(az-auraone-gurbaksh vm list -g "$RG" --query "[?tags.role=='aura3d-gpu-runner'].name" -o tsv); do
  az-auraone-gurbaksh vm delete -g "$RG" -n "$VM" --yes --no-wait || echo "gpu vm $VM delete request failed"
done
az-auraone-gurbaksh vmss delete -g "$RG" -n vmss-aura3d-gpu --no-wait 2>/dev/null || true
az-auraone-gurbaksh group delete -n "$RG" --yes --no-wait
echo "deletion of $RG requested"

# Optional: restore the previous fork-PR approval policy
# echo '{"approval_policy":"first_time_contributors"}' | gh api -X PUT repos/$REPO/actions/permissions/fork-pr-contributor-approval --input -

# 3. AWS/GCP GPU runners (label azure-gpu). None were provisioned as of 2026-10-10;
#    these blocks are no-ops until instances with these tags/labels exist.
ACCT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ "$ACCT" = "605199373751" ]; then
  for R in us-west-2 us-east-1; do
    IDS=$(aws ec2 describe-instances --region "$R" \
      --filters Name=tag:project,Values=aura3d Name=tag:purpose,Values=gh-gpu-runner \
                Name=instance-state-name,Values=pending,running,stopping,stopped \
      --query 'Reservations[].Instances[].InstanceId' --output text)
    [ -n "$IDS" ] && aws ec2 terminate-instances --region "$R" --instance-ids $IDS
  done
fi
# 4. GCP GPU runners gcp-gpu-1..6 (gcloud-credits, project auraone-493412, label purpose=gh-gpu-runner).
#    Step 1 already deletes their GitHub registrations (label azure-gpu); repeat by name in case
#    step 1 was skipped or a runner was busy.
GP=auraone-493412
for id in $(gh api --paginate "repos/$REPO/actions/runners" -q '.runners[] | select(.name | startswith("gcp-gpu-")) | .id'); do
  gh api -X DELETE "repos/$REPO/actions/runners/$id" || echo "failed to remove gcp runner $id (may be busy)"
done
for Z in $(gcloud-credits compute instances list --project "$GP" \
    --filter='labels.purpose=gh-gpu-runner AND labels.project=aura3d' --format='value(name,zone.basename())' 2>/dev/null | tr '\t' '@'); do
  gcloud-credits compute instances delete "${Z%@*}" --zone "${Z#*@}" --project "$GP" --quiet --delete-disks=all \
    || echo "gcp instance ${Z%@*} delete failed"
done
# The shared deny-ingress firewall rule is deleted at the end of step 5, after the CPU VMs are gone.

# 5. GCP CPU runners gcp-cpu-1..40 (labels ubuntu-latest,self-hosted-gcp; gcloud-credits, project
#    auraone-493412, instance label purpose=gh-cpu-runner; 15 us-west4, 15 us-east1, 10 us-central1).
for id in $(gh api --paginate "repos/$REPO/actions/runners" \
    -q '.runners[] | select((.name | startswith("gcp-cpu-")) or any(.labels[]; .name=="self-hosted-gcp")) | .id'); do
  gh api -X DELETE "repos/$REPO/actions/runners/$id" || echo "failed to remove gcp cpu runner $id (may be busy)"
done
for Z in $(gcloud-credits compute instances list --project "$GP" \
    --filter='labels.purpose=gh-cpu-runner AND labels.project=aura3d' --format='value(name,zone.basename())' 2>/dev/null | tr '\t' '@'); do
  gcloud-credits compute instances delete "${Z%@*}" --zone "${Z#*@}" --project "$GP" --quiet --delete-disks=all \
    || echo "gcp cpu instance ${Z%@*} delete failed" &
done
wait
# Shared deny-ingress rule (GPU + CPU runners): delete only after all runner VMs are gone.
gcloud-credits compute firewall-rules delete aura3d-gh-runner-deny-ingress --project "$GP" --quiet 2>/dev/null || true
